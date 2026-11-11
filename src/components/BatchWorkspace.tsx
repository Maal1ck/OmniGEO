import React, { useRef, useState, useEffect } from 'react';
import { 
  UploadCloud, 
  MapPin, 
  FolderPlus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Search, 
  Eye, 
  Database, 
  CheckSquare, 
  Square, 
  Package, 
  Stethoscope, 
  Hexagon, 
  Milestone, 
  Layers, 
  PieChart,
  FileCode,
  Sliders,
  FolderTree,
  Check,
  X,
  Info,
  Loader2,
  Play,
  Globe,
  Edit3,
  GitMerge,
  TableProperties
} from 'lucide-react';
import { SpatialDataset, CRSInfo } from '../types/gis';
import { parseCSV, parseGeoJSON, parseKML, parseShapefileZipOrBuffers, parseCadFile, parseGpxFile } from '../core/formatParsers';
import { parseGeoPackage, inspectGeoPackageLayers } from '../core/geoPackageParser';
import { inspectExcelWorkbook } from '../core/excelParser';
import { ExcelCoordinateModal, PendingExcelFile } from './ExcelCoordinateModal';
import { GpkgLayerModal, PendingGpkgFile } from './GpkgLayerModal';
import { CRSModal } from './CRSModal';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

export interface DataTypeFilter {
  shapefile: boolean;
  geopackage: boolean;
  geojson: boolean;
  kml: boolean;
  csv: boolean;
  cad: boolean;
  gpx: boolean;
  excel: boolean;
}

interface BatchWorkspaceProps {
  datasets: SpatialDataset[];
  setDatasets: React.Dispatch<React.SetStateAction<SpatialDataset[]>>;
  selectedDatasetId: string | null;
  setSelectedDatasetId: (id: string | null) => void;
  onPreviewOnMap: (dataset: SpatialDataset) => void;
  onOpenSpatialDoctor?: () => void;
  onCalculateSurfaces?: (unit: any) => void;
  onOpenAggregationModal?: () => void;
  onStartBatch?: (selectedDatasetIds?: string[]) => void;
  onOpenConcatenationModal?: (initialSelectedIds?: string[]) => void;
  onOpenPostgisModal?: (datasetId?: string) => void;
  onOpenJoinModal?: (datasetId?: string) => void;
  onOpenPostgresReport?: () => void;
}

export const BatchWorkspace: React.FC<BatchWorkspaceProps> = ({
  datasets,
  setDatasets,
  selectedDatasetId,
  setSelectedDatasetId,
  onPreviewOnMap,
  onOpenSpatialDoctor,
  onOpenAggregationModal,
  onStartBatch,
  onOpenConcatenationModal,
  onOpenPostgisModal,
  onOpenJoinModal,
  onOpenPostgresReport,
}) => {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);

  // Excel manual mapping modal state
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [pendingExcelFile, setPendingExcelFile] = useState<PendingExcelFile | null>(null);

  // GeoPackage layer isolation modal state
  const [isGpkgModalOpen, setIsGpkgModalOpen] = useState(false);
  const [pendingGpkgFile, setPendingGpkgFile] = useState<PendingGpkgFile | null>(null);

  // CRS calibration modal states
  const [crsModalTarget, setCrsModalTarget] = useState<SpatialDataset | null>(null);
  const [isSingleCrsModalOpen, setIsSingleCrsModalOpen] = useState(false);
  const [isBatchCrsModalOpen, setIsBatchCrsModalOpen] = useState(false);

  const handleOpenCRSModalForDataset = (dataset: SpatialDataset) => {
    setCrsModalTarget(dataset);
    setIsSingleCrsModalOpen(true);
  };

  const handleApplyCRSToDataset = (selectedCrs: CRSInfo) => {
    if (!crsModalTarget) return;
    const targetId = crsModalTarget.id;
    setDatasets(prev => prev.map(d => {
      if (d.id === targetId) {
        const cleanedIssues = d.validationIssues.filter(i =>
          !i.message.toLowerCase().includes('crs') &&
          !i.message.toLowerCase().includes('spatial reference') &&
          !i.message.toLowerCase().includes('projection')
        );
        return {
          ...d,
          detectedCRS: selectedCrs,
          crsStatus: 'verified' as const,
          validationIssues: cleanedIssues,
          status: cleanedIssues.length === 0 ? 'ready' : (cleanedIssues.some(x => x.severity === 'error') ? 'invalid' : 'warning'),
        };
      }
      return d;
    }));
    setIsSingleCrsModalOpen(false);
    setCrsModalTarget(null);
  };

  const handleBatchApplyCRS = (selectedCrs: CRSInfo) => {
    setDatasets(prev => prev.map(d => {
      if (selectedIds.has(d.id)) {
        const cleanedIssues = d.validationIssues.filter(i =>
          !i.message.toLowerCase().includes('crs') &&
          !i.message.toLowerCase().includes('spatial reference') &&
          !i.message.toLowerCase().includes('projection')
        );
        return {
          ...d,
          detectedCRS: selectedCrs,
          crsStatus: 'verified' as const,
          validationIssues: cleanedIssues,
          status: cleanedIssues.length === 0 ? 'ready' : (cleanedIssues.some(x => x.severity === 'error') ? 'invalid' : 'warning'),
        };
      }
      return d;
    }));
    setIsBatchCrsModalOpen(false);
  };

  // Subfolder confirmation modal state
  const [pendingFolderImport, setPendingFolderImport] = useState<{
    files: File[];
    folderName: string;
    rootFilesCount: number;
    subfolderFilesCount: number;
    subfolderCount: number;
  } | null>(null);
  const [alwaysPromptSubfolders, setAlwaysPromptSubfolders] = useState<boolean>(true);

  // Ingestion settings: choice of data types & subfolder recursion
  const [dataTypes, setDataTypes] = useState<DataTypeFilter>({
    shapefile: true,
    geopackage: true,
    geojson: true,
    kml: true,
    csv: true,
    cad: true,
    gpx: true,
    excel: true,
  });
  const [includeSubfolders, setIncludeSubfolders] = useState<boolean>(true);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter datasets for display table
  const filteredDatasets = datasets.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.detectedCRS?.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFormat = filterFormat === 'all' || d.format === filterFormat;
    const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchesSearch && matchesFormat && matchesStatus;
  });

  // Calculate summary metrics
  const totalFeatures = datasets.reduce((sum, d) => sum + d.featureCount, 0);
  const totalSizeBytes = datasets.reduce((sum, d) => sum + d.sizeBytes, 0);
  const warningCount = datasets.filter(d => d.status === 'warning').length;
  const errorCount = datasets.filter(d => d.status === 'invalid').length;
  const activeTypesCount = Object.values(dataTypes).filter(Boolean).length;

  // Toggle single data type filter
  const toggleDataType = (key: keyof DataTypeFilter) => {
    setDataTypes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllDataTypes = (enable: boolean) => {
    setDataTypes({
      shapefile: enable,
      geopackage: enable,
      geojson: enable,
      kml: enable,
      csv: enable,
      cad: enable,
      gpx: enable,
      excel: enable,
    });
  };

  /**
   * Recursive directory reader for drag-and-dropped folders
   */
  const extractFilesFromDataTransfer = async (dataTransfer: DataTransfer): Promise<File[]> => {
    const files: File[] = [];
    const items = Array.from(dataTransfer.items || []);

    const traverseEntry = async (entry: any, path = ''): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
        const relativePath = path ? `${path}/${file.name}` : file.name;
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relativePath,
            writable: true,
          });
        } catch {
          // ignore
        }
        files.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAllEntries = async (): Promise<any[]> => {
          const result: any[] = [];
          let batch: any[] = [];
          do {
            batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            result.push(...batch);
          } while (batch.length > 0);
          return result;
        };
        const entries = await readAllEntries();
        for (const child of entries) {
          await traverseEntry(child, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    };

    const entries = items
      .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (entries.length > 0) {
      for (const entry of entries) {
        await traverseEntry(entry);
      }
    } else if (dataTransfer.files) {
      files.push(...Array.from(dataTransfer.files));
    }

    return files;
  };

  /**
   * Main file processing pipeline with folder awareness & data type filters
   */
  const handleFiles = async (
    files: FileList | File[], 
    isFolderSource = false,
    forcedRecursive?: boolean
  ) => {
    const rawList = Array.from(files);
    if (rawList.length === 0) return;

    // If folder ingestion and forced choice is not predetermined, check for subfolders
    if (isFolderSource && forcedRecursive === undefined) {
      let rootCount = 0;
      let subfolderCount = 0;
      const subfolderDirs = new Set<string>();

      for (const file of rawList) {
        const relPath = (file as any).webkitRelativePath || file.name;
        const slashCount = (relPath.match(/\//g) || []).length;
        if (slashCount > 1) {
          subfolderCount++;
          const lastSlash = relPath.lastIndexOf('/');
          if (lastSlash >= 0) subfolderDirs.add(relPath.slice(0, lastSlash));
        } else {
          rootCount++;
        }
      }

      // If nested subfolders were found and prompting is enabled, open the choice modal!
      if (subfolderCount > 0 && alwaysPromptSubfolders) {
        const firstRel = (rawList[0] as any).webkitRelativePath || '';
        const folderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Selected Directory';

        setPendingFolderImport({
          files: rawList,
          folderName,
          rootFilesCount: rootCount,
          subfolderFilesCount: subfolderCount,
          subfolderCount: subfolderDirs.size,
        });
        return;
      }
    }

    const effectiveRecursive = forcedRecursive !== undefined ? forcedRecursive : includeSubfolders;

    setIsProcessingFiles(true);
    setFileProcessingError(null);
    setScanSuccessMessage(null);

    const newDatasets: SpatialDataset[] = [];
    const fileErrors: string[] = [];
    const subfolderSet = new Set<string>();

    // Filter files based on user-selected data types and subfolder depth
    const eligibleFiles: File[] = [];

    for (const file of rawList) {
      const relPath = (file as any).webkitRelativePath || file.name;

      // Handle subfolder filtering
      if (isFolderSource && !effectiveRecursive && relPath.includes('/')) {
        const slashCount = (relPath.match(/\//g) || []).length;
        if (slashCount > 1) {
          // Exclude files in nested subfolders
          continue;
        }
      }

      const lastSlash = relPath.lastIndexOf('/');
      if (lastSlash >= 0) {
        subfolderSet.add(relPath.slice(0, lastSlash));
      }

      const fileName = lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath;
      const lastDot = fileName.lastIndexOf('.');
      const ext = lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';

      // Check against selected data types
      const isShape = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx', '.zip'].includes(ext);
      const isGpkg = ext === '.gpkg';
      const isGeoJson = ['.geojson', '.json'].includes(ext);
      const isKml = ['.kml', '.kmz'].includes(ext);
      const isCsv = ['.csv'].includes(ext);
      const isCad = ['.dwg', '.dxf'].includes(ext);
      const isGpx = ext === '.gpx';
      const isExcel = ['.xlsx', '.xls'].includes(ext);

      if (isShape && !dataTypes.shapefile) continue;
      if (isGpkg && !dataTypes.geopackage) continue;
      if (isGeoJson && !dataTypes.geojson) continue;
      if (isKml && !dataTypes.kml) continue;
      if (isCsv && !dataTypes.csv) continue;
      if (isCad && !dataTypes.cad) continue;
      if (isGpx && !dataTypes.gpx) continue;
      if (isExcel && !dataTypes.excel) continue;

      // Ignore non-geospatial files silently (e.g. .txt, .pdf, .xml, .DS_Store, .png)
      if (!isShape && !isGpkg && !isGeoJson && !isKml && !isCsv && !isCad && !isGpx && !isExcel) {
        continue;
      }

      eligibleFiles.push(file);
    }

    if (eligibleFiles.length === 0) {
      setFileProcessingError(t.workspace.noMatchingFilesInFolder);
      setIsProcessingFiles(false);
      return;
    }

    // Group files by directory path + base name to match Shapefile sidecars (.shp, .shx, .dbf, .prj) across subfolders
    const sidecarGroups: Record<string, { [ext: string]: File }> = {};

    for (const file of eligibleFiles) {
      const relPath = (file as any).webkitRelativePath || file.name;
      const lastSlash = relPath.lastIndexOf('/');
      const dirPrefix = lastSlash >= 0 ? relPath.slice(0, lastSlash) : '';
      const fileName = lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath;
      const lastDot = fileName.lastIndexOf('.');
      const ext = lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
      const baseName = lastDot >= 0 ? fileName.slice(0, lastDot) : fileName;
      const groupKey = dirPrefix ? `${dirPrefix}/${baseName}` : baseName;

      if (['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx'].includes(ext)) {
        if (!sidecarGroups[groupKey]) sidecarGroups[groupKey] = {};
        sidecarGroups[groupKey][ext] = file;
      }
    }

    try {
      for (let i = 0; i < eligibleFiles.length; i++) {
        const file = eligibleFiles[i];
        const relPath = (file as any).webkitRelativePath || file.name;
        const lastSlash = relPath.lastIndexOf('/');
        const dirPrefix = lastSlash >= 0 ? relPath.slice(0, lastSlash) : '';
        const fileName = lastSlash >= 0 ? relPath.slice(lastSlash + 1) : relPath;
        const lastDot = fileName.lastIndexOf('.');
        const ext = lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
        const baseName = lastDot >= 0 ? fileName.slice(0, lastDot) : fileName;
        const groupKey = dirPrefix ? `${dirPrefix}/${baseName}` : baseName;
        const displayName = dirPrefix ? `${dirPrefix}/${fileName}` : file.name;

        // Skip non-.shp sidecars from creating individual rows (they are merged into the .shp dataset)
        if (['.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx'].includes(ext)) {
          if (!sidecarGroups[groupKey]?.['.shp']) {
            fileErrors.push(`${displayName}: please ensure the companion .shp file is also included.`);
          }
          continue;
        }

        try {
          if (ext === '.shp') {
            const group = sidecarGroups[groupKey] || {};
            const shpFile = file;
            const shxFile = group['.shx'];
            const dbfFile = group['.dbf'];
            const prjFile = group['.prj'];
            const cpgFile = group['.cpg'];

            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            zip.file(`${baseName}.shp`, await shpFile.arrayBuffer());
            if (shxFile) zip.file(`${baseName}.shx`, await shxFile.arrayBuffer());
            if (dbfFile) zip.file(`${baseName}.dbf`, await dbfFile.arrayBuffer());
            if (prjFile) zip.file(`${baseName}.prj`, await prjFile.text());
            if (cpgFile) zip.file(`${baseName}.cpg`, await cpgFile.text());

            const zipBuf = await zip.generateAsync({ type: 'arraybuffer' });
            const dataset = await parseShapefileZipOrBuffers(zipBuf, displayName, file.size);

            dataset.sidecars = [
              { name: `${baseName}.shp`, extension: '.shp', size: shpFile.size, present: true, required: true },
              { name: `${baseName}.shx`, extension: '.shx', size: shxFile?.size || 0, present: !!shxFile, required: true },
              { name: `${baseName}.dbf`, extension: '.dbf', size: dbfFile?.size || 0, present: !!dbfFile, required: true },
              { name: `${baseName}.prj`, extension: '.prj', size: prjFile?.size || 0, present: !!prjFile, required: false },
              { name: `${baseName}.cpg`, extension: '.cpg', size: cpgFile?.size || 0, present: !!cpgFile, required: false },
            ];

            if (!shxFile || !dbfFile) {
              dataset.validationIssues.push({
                severity: 'warning',
                code: 'MISSING_SIDECAR',
                message: `Incomplete Shapefile bundle: Missing ${!shxFile ? '.shx index ' : ''}${!dbfFile ? '.dbf attributes' : ''}.`,
              });
              dataset.status = 'warning';
            }

            newDatasets.push(dataset);
          } else if (ext === '.zip') {
            const buf = await file.arrayBuffer();
            const dataset = await parseShapefileZipOrBuffers(buf, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.geojson' || ext === '.json') {
            const text = await file.text();
            const dataset = parseGeoJSON(text, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.gpkg') {
            const buf = await file.arrayBuffer();
            const gpkgLayers = await inspectGeoPackageLayers(buf);
            if (gpkgLayers.length > 1) {
              setPendingGpkgFile({
                file,
                buffer: buf,
                displayName,
                fileSize: file.size,
                layers: gpkgLayers,
              });
              setIsGpkgModalOpen(true);
            } else {
              const gpkgDatasets = await parseGeoPackage(buf, displayName, file.size);
              newDatasets.push(...gpkgDatasets);
            }
          } else if (ext === '.csv') {
            const text = await file.text();
            const dataset = parseCSV(text, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.kml') {
            const text = await file.text();
            const dataset = parseKML(text, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.kmz') {
            const JSZip = (await import('jszip')).default;
            const archive = await JSZip.loadAsync(await file.arrayBuffer());
            const kmlFile = Object.values(archive.files).find(
              entry => !entry.dir && entry.name.toLowerCase().endsWith('.kml'),
            );
            if (!kmlFile) throw new Error('The KMZ archive does not contain a KML file.');
            newDatasets.push(parseKML(await kmlFile.async('text'), displayName, file.size));
          } else if (ext === '.dwg' || ext === '.dxf') {
            const buf = await file.arrayBuffer();
            const dataset = await parseCadFile(buf, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.gpx') {
            const text = await file.text();
            const dataset = parseGpxFile(text, displayName, file.size);
            newDatasets.push(dataset);
          } else if (ext === '.xlsx' || ext === '.xls') {
            const buf = await file.arrayBuffer();
            const result = inspectExcelWorkbook(buf, displayName);
            // If the workbook has multiple sheets, always allow isolating specific sheets
            if (result.sheetNames.length > 1) {
              setPendingExcelFile({
                file,
                buffer: buf,
                sheetNames: result.sheetNames,
                selectedSheet: result.selectedSheet,
                headers: result.headers,
                previewRows: result.previewRows,
                detectedXCol: result.detectedXCol,
                detectedYCol: result.detectedYCol,
                totalRowCount: result.totalRowCount,
              });
              setIsExcelModalOpen(true);
            } else if (result.dataset && !result.needsManualMapping) {
              newDatasets.push(result.dataset);
            } else {
              setPendingExcelFile({
                file,
                buffer: buf,
                sheetNames: result.sheetNames,
                selectedSheet: result.selectedSheet,
                headers: result.headers,
                previewRows: result.previewRows,
                detectedXCol: result.detectedXCol,
                detectedYCol: result.detectedYCol,
                totalRowCount: result.totalRowCount,
              });
              setIsExcelModalOpen(true);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          fileErrors.push(`${displayName}: ${message}`);
        }
      }

      if (newDatasets.length > 0) {
        setDatasets(prev => [...prev, ...newDatasets]);
        if (!selectedDatasetId && newDatasets[0]) {
          setSelectedDatasetId(newDatasets[0].id);
        }

        const folderCount = Math.max(1, subfolderSet.size);
        const summaryText = t.workspace.folderScanSummary
          .replace('{count}', String(newDatasets.length))
          .replace('{folders}', String(folderCount));
        setScanSuccessMessage(summaryText);
        setTimeout(() => setScanSuccessMessage(null), 5000);
      }

      if (fileErrors.length > 0) {
        setFileProcessingError(fileErrors.join('\n'));
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  // Drag and Drop handling (supports dropped files and dropped folders)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer) {
      const extractedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
      await handleFiles(extractedFiles, true);
    }
  };

  // Selection
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDatasets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDatasets.map(d => d.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const removeSelected = () => {
    setDatasets(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    if (selectedDatasetId && selectedIds.has(selectedDatasetId)) {
      setSelectedDatasetId(null);
    }
  };

  const clearAll = () => {
    setDatasets([]);
    setSelectedIds(new Set());
    setSelectedDatasetId(null);
  };

  const renderGeometryIcon = (type: string) => {
    switch (type) {
      case 'Polygon':
      case 'MultiPolygon':
        return <Hexagon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'Point':
      case 'MultiPoint':
        return <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'LineString':
      case 'MultiLineString':
        return <Milestone className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#13110E]">
      {/* Hidden inputs for file and directory selection */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".shp,.shx,.dbf,.prj,.cpg,.geojson,.json,.kml,.kmz,.csv,.gpkg,.zip,.dwg,.dxf,.gpx,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          void handleFiles(files, false);
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in HTML5 directory ingestion
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          void handleFiles(files, true);
        }}
      />

      {/* Workspace Header Toolbar */}
      <div className="relative z-40 px-6 py-3.5 border-b border-stone-800/80 bg-[#181411]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        {/* Left: Summary Metrics */}
        <div className="flex items-center space-x-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-display font-bold text-[#FAF6F0] tracking-tight flex items-center space-x-2">
                <Database className="w-4 h-4 text-amber-400" />
                <span>{t.workspace.queueTitle}</span>
              </h1>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 border border-amber-700/50">
                {datasets.length} {t.workspace.filesCount}
              </span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5 font-mono">
              <span>{totalFeatures.toLocaleString()} {t.workspace.totalFeatures}</span>
              <span className="mx-1.5 text-stone-600">·</span>
              <span>{(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB {t.workspace.totalSize}</span>
              {warningCount > 0 && (
                <>
                  <span className="mx-1.5 text-stone-600">·</span>
                  <span className="text-amber-400 font-semibold">{warningCount} {t.workspace.warningsCount}</span>
                </>
              )}
              {errorCount > 0 && (
                <>
                  <span className="mx-1.5 text-stone-600">·</span>
                  <span className="text-rose-400 font-semibold">{errorCount} {t.workspace.invalidCount}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Actions & Ingestion Triggers */}
        <div className="flex items-center space-x-2">
          {warningCount > 0 && onOpenSpatialDoctor && (
            <button
              onClick={onOpenSpatialDoctor}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border border-amber-600/60 transition-all shadow-sm"
            >
              <Stethoscope className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.workspace.fixWarnings} ({warningCount})</span>
            </button>
          )}

          {/* 1. Manual File Picker Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFiles}
            title="Select single or multiple GIS files manually"
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold border transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
              theme === 'light'
                ? 'bg-white hover:bg-[#F5EFE6] text-stone-900 border-[#D6CEBE]'
                : 'bg-[#241E19] hover:bg-[#2F2620] text-stone-200 hover:text-white border-stone-700/80'
            }`}
          >
            {isProcessingFiles ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
            ) : (
              <FileCode className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`} />
            )}
            <span>{t.workspace.selectFiles}</span>
          </button>

          {/* 2. Folder & Subfolder Directory Ingestion Button */}
          <button
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessingFiles}
            title="Select a whole folder to ingest geospatial files"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 shadow-md shadow-amber-950/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isProcessingFiles ? (
              <Loader2 className="w-3.5 h-3.5 text-stone-950 animate-spin" />
            ) : (
              <FolderTree className="w-3.5 h-3.5 text-stone-950" />
            )}
            <span>{isProcessingFiles ? t.common.loading : t.workspace.selectFolder}</span>
          </button>

          {/* Subfolder Mode Toggle Button in Toolbar */}
          <button
            type="button"
            onClick={() => setIncludeSubfolders(!includeSubfolders)}
            title={includeSubfolders ? "Subfolders: Scanning ALL nested subdirectories. Click to scan root only." : "Subfolders: Scanning ROOT folder only. Click to include subfolders."}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
              includeSubfolders
                ? theme === 'light'
                  ? 'bg-[#EBF7EE] text-emerald-800 border-emerald-300 font-bold shadow-xs'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'bg-stone-100 text-stone-700 border-stone-300'
                  : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
            }`}
          >
            <FolderTree className={`w-3.5 h-3.5 ${includeSubfolders ? (theme === 'light' ? 'text-emerald-700' : 'text-emerald-400') : 'text-stone-500'}`} />
            <span>Subfolders:</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
              includeSubfolders 
                ? 'bg-emerald-600 text-white' 
                : 'bg-stone-700 text-stone-200'
            }`}>
              {includeSubfolders ? 'RECURSIVE' : 'ROOT ONLY'}
            </span>
          </button>

          {/* 3. Ingestion Filters & Data Types Dropdown */}
          <div className="relative z-50" ref={filterMenuRef}>
            <button
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              title="Configure data types and subfolder scanning"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                isFilterMenuOpen || activeTypesCount < 8 || !includeSubfolders
                  ? theme === 'light'
                    ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E] font-bold shadow-xs'
                    : 'bg-amber-950/50 border-amber-600/60 text-amber-300 font-semibold'
                  : theme === 'light'
                    ? 'bg-white border-[#E2DBD0] text-stone-800 hover:bg-[#F5EFE6] hover:text-stone-950 shadow-xs'
                    : 'bg-[#1C1713] border-stone-800 text-stone-300 hover:bg-[#251E19]'
              }`}
            >
              <Sliders className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`} />
              <span>{t.workspace.filterDataTypes}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                theme === 'light' ? 'bg-[#EDE7DC] text-stone-800 font-bold' : 'bg-stone-800/90 text-stone-300'
              }`}>
                {activeTypesCount}/8
              </span>
            </button>

            {isFilterMenuOpen && (
              <div
                className={`absolute right-0 top-full mt-2 w-72 rounded-2xl border p-4 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-100 ${
                  theme === 'light'
                    ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-stone-400/25'
                    : 'bg-[#181411] border-stone-800 text-stone-200 shadow-stone-950/80'
                }`}
              >
                <div className={`flex items-center justify-between pb-2 border-b ${theme === 'light' ? 'border-[#EBE5DC]' : 'border-stone-800/80'}`}>
                  <span className={`font-display font-bold text-xs flex items-center space-x-1.5 ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{t.workspace.filterDataTypes}</span>
                  </span>
                  <div className="flex items-center space-x-2 text-[10px] font-mono">
                    <button
                      onClick={() => setAllDataTypes(true)}
                      className={`${theme === 'light' ? 'text-stone-600 hover:text-amber-800' : 'text-stone-400 hover:text-amber-300'} underline cursor-pointer`}
                    >
                      All
                    </button>
                    <span className={theme === 'light' ? 'text-stone-400' : 'text-stone-600'}>·</span>
                    <button
                      onClick={() => setAllDataTypes(false)}
                      className={`${theme === 'light' ? 'text-stone-600 hover:text-amber-800' : 'text-stone-400 hover:text-amber-300'} underline cursor-pointer`}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Data Types Checkboxes */}
                <div className="py-2.5 space-y-1.5 max-h-60 overflow-y-auto">
                  {[
                    { key: 'geopackage' as const, label: 'GeoPackage (.gpkg)', desc: 'OGC Vector SQLite Database' },
                    { key: 'shapefile' as const, label: 'ESRI Shapefile (.shp / .zip)', desc: 'Bundled .shp, .shx, .dbf, .prj' },
                    { key: 'cad' as const, label: 'AutoCAD CAD (.dwg / .dxf)', desc: 'Engineering & surveying drawings' },
                    { key: 'gpx' as const, label: 'GPS Exchange (.gpx)', desc: 'GPS waypoints, tracks, and routes' },
                    { key: 'excel' as const, label: 'Excel Spreadsheet (.xlsx / .xls)', desc: 'Auto-detects Lon/Lat or manual mapping' },
                    { key: 'geojson' as const, label: 'GeoJSON (.geojson, .json)', desc: 'RFC 7946 Standard' },
                    { key: 'kml' as const, label: 'Google Earth KML / KMZ', desc: 'Placemarks & boundaries' },
                    { key: 'csv' as const, label: 'Spatial CSV (.csv)', desc: 'Coordinate latitude/longitude tables' },
                  ].map(item => (
                    <label
                      key={item.key}
                      className={`flex items-start space-x-2.5 cursor-pointer p-1.5 rounded-lg transition-colors ${
                        theme === 'light' ? 'hover:bg-[#F5EFE6]' : 'hover:bg-stone-800/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={dataTypes[item.key]}
                        onChange={() => toggleDataType(item.key)}
                        className={`mt-0.5 rounded text-amber-600 focus:ring-amber-500/40 cursor-pointer ${
                          theme === 'light' ? 'border-[#A89F91] bg-white' : 'border-stone-700 bg-[#120F0D]'
                        }`}
                      />
                      <div className="text-left">
                        <div className={`text-xs font-semibold ${theme === 'light' ? 'text-stone-900' : 'text-stone-200'}`}>{item.label}</div>
                        <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{item.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Subfolder Toggle */}
                <div className={`pt-2 border-t ${theme === 'light' ? 'border-[#EBE5DC]' : 'border-stone-800/80'}`}>
                  <label className={`flex items-center justify-between cursor-pointer p-1.5 rounded-lg transition-colors ${
                    theme === 'light' ? 'hover:bg-[#F5EFE6]' : 'hover:bg-stone-800/40'
                  }`}>
                    <div className="text-left">
                      <div className={`text-xs font-semibold flex items-center space-x-1.5 ${theme === 'light' ? 'text-stone-900' : 'text-stone-200'}`}>
                        <FolderTree className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`} />
                        <span>{t.workspace.includeSubfolders}</span>
                      </div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {includeSubfolders ? 'Scans all nested directory levels' : 'Scans only the root folder level'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeSubfolders}
                      onChange={(e) => setIncludeSubfolders(e.target.checked)}
                      className={`rounded text-amber-600 focus:ring-amber-500/40 cursor-pointer ${
                        theme === 'light' ? 'border-[#A89F91] bg-white' : 'border-stone-700 bg-[#120F0D]'
                      }`}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {datasets.length > 0 && (
            <>
              {datasets.length >= 2 && onOpenConcatenationModal && (
                <button
                  type="button"
                  onClick={() => onOpenConcatenationModal(selectedIds.size >= 2 ? Array.from(selectedIds) : undefined)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    theme === 'light'
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-700/50'
                  }`}
                  title="Concatenate and merge multiple layers into a single dataset by mapping attributes"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>Concatenate{selectedIds.size >= 2 ? ` (${selectedIds.size})` : ''}</span>
                </button>
              )}

              {datasets.length >= 2 && onOpenJoinModal && (
                <button
                  type="button"
                  onClick={() => onOpenJoinModal(selectedIds.size >= 1 ? Array.from(selectedIds)[0] : undefined)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    theme === 'light'
                      ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300'
                      : 'bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-700/50'
                  }`}
                  title="Perform an attribute or spatial join between two layers"
                >
                  <GitMerge className="w-3.5 h-3.5 text-purple-500" />
                  <span>{lang === 'fr' ? 'Jointures' : lang === 'ar' ? 'الربط' : 'Join Layers'}</span>
                </button>
              )}

              {onOpenPostgisModal && (
                <button
                  type="button"
                  onClick={() => onOpenPostgisModal(selectedIds.size === 1 ? Array.from(selectedIds)[0] : undefined)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    theme === 'light'
                      ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300'
                      : 'bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border-indigo-700/50'
                  }`}
                  title="Export layer(s) to PostgreSQL / PostGIS database"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  <span>PostGIS Export</span>
                </button>
              )}

              {onOpenPostgresReport && (
                <button
                  type="button"
                  onClick={() => onOpenPostgresReport()}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    theme === 'light'
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-700/50'
                  }`}
                  title="Generate global PostgreSQL database architecture & schema report (HTML)"
                >
                  <TableProperties className="w-3.5 h-3.5 text-amber-500" />
                  <span>{lang === 'fr' ? 'Rapport Base de Données' : 'DB Report'}</span>
                </button>
              )}

              {selectedIds.size > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchCrsModalOpen(true)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      theme === 'light'
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 font-bold'
                        : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-700/60 font-semibold'
                    }`}
                    title="Assign or calibrate CRS for all checked datasets"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-500" />
                    <span>Assign CRS ({selectedIds.size})</span>
                  </button>

                  {onStartBatch && (
                    <button
                      onClick={() => onStartBatch(Array.from(selectedIds))}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/30 transition-all active:scale-95"
                      title="Run batch processing only on the checked datasets"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Process Selected ({selectedIds.size})</span>
                    </button>
                  )}
                  <button
                    onClick={removeSelected}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.workspace.removeSelected} ({selectedIds.size})</span>
                  </button>
                </div>
              )}
              <button
                onClick={clearAll}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 transition-colors"
              >
                <span>Clear All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active Ingestion Progress Bar Banner */}
      {isProcessingFiles && (
        <div role="status" className="mx-5 mt-3 rounded-xl border border-amber-600/50 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200 animate-in fade-in-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-medium">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <span>Scanning directories &amp; parsing geospatial vector datasets...</span>
            </div>
            <span className="font-mono text-[10px] text-amber-400 font-bold uppercase tracking-wider animate-pulse">
              Active Ingestion
            </span>
          </div>
          <div className="w-full h-1.5 bg-stone-900 rounded-full mt-2 overflow-hidden border border-amber-900/60 p-0.5">
            <div className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-orange-400 animate-pulse rounded-full w-2/3" />
          </div>
        </div>
      )}

      {/* Ingestion Success Feedback Banner */}
      {scanSuccessMessage && (
        <div role="status" className="mx-5 mt-3 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-200 animate-in fade-in-0 slide-in-from-top-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{scanSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setScanSuccessMessage(null)}
              className="text-emerald-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Processing Error Alert */}
      {fileProcessingError && (
        <div role="alert" className="mx-5 mt-3 rounded-xl border border-rose-700/60 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">{t.workspace.uploadErrorTitle}</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-rose-200/90">{fileProcessingError}</pre>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFileProcessingError(null)}
              className="shrink-0 rounded px-2 py-1 text-rose-200 hover:bg-rose-900/60"
            >
              {t.workspace.dismissUploadError}
            </button>
          </div>
        </div>
      )}

      {/* Main Drag-and-Drop Area & Table Layout */}
      <div className="relative z-10 flex-1 flex flex-col p-5 overflow-hidden gap-4">
        {/* Elevated Drag and Drop Dropzone with Ingestion Filters & Actions */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-5 transition-all text-center ${
            isDragging
              ? 'border-amber-400 bg-amber-950/40 glow-amber'
              : 'border-stone-800/90 hover:border-amber-600/50 bg-[#191512]/60 hover:bg-[#1E1915]/70'
          }`}
        >
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
            {/* Left: Dropzone illustration & description */}
            <div className="flex items-center space-x-3.5 text-left">
              <div className="p-3 bg-amber-950/70 rounded-xl text-amber-400 border border-amber-700/50 shadow-inner shrink-0">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-display font-semibold text-[#FAF6F0]">
                  {t.workspace.dropzoneTitle}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {t.workspace.dropzoneSubtitle}
                </p>
              </div>
            </div>

            {/* Center: Direct Manual File & Folder Ingestion Buttons */}
            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-display font-bold bg-[#2A221C] hover:bg-amber-600 text-stone-200 hover:text-stone-950 border border-stone-700/80 transition-all shadow-sm"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.workspace.selectFiles}</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 shadow-md shadow-amber-950/40 transition-all"
              >
                <FolderTree className="w-3.5 h-3.5 text-stone-950" />
                <span>{t.workspace.selectFolder}</span>
              </button>

              <button
                type="button"
                onClick={() => setIncludeSubfolders(!includeSubfolders)}
                title={includeSubfolders ? "Subfolders: Scanning ALL nested subdirectories. Click to scan root only." : "Subfolders: Scanning ROOT folder only. Click to include subfolders."}
                className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-xs font-mono font-medium border transition-all ${
                  includeSubfolders
                    ? theme === 'light'
                      ? 'bg-[#EBF7EE] text-emerald-800 border-emerald-300 font-bold'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50 font-semibold'
                    : theme === 'light'
                      ? 'bg-stone-100 text-stone-700 border-stone-300'
                      : 'bg-[#2A221C] text-stone-400 border-stone-700'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5 shrink-0" />
                <span>Subfolders:</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  includeSubfolders ? 'bg-emerald-600 text-white' : 'bg-stone-700 text-stone-200'
                }`}>
                  {includeSubfolders ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Right: Interactive Format Toggle Pills (Click to enable/disable data types) */}
            <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono">
              {[
                { key: 'shapefile' as const, label: 'SHP', color: 'border-amber-600/40 text-amber-300' },
                { key: 'geopackage' as const, label: 'GPKG', color: 'border-amber-700/40 text-amber-200' },
                { key: 'cad' as const, label: 'DWG/DXF', color: 'border-blue-600/40 text-blue-300' },
                { key: 'gpx' as const, label: 'GPX', color: 'border-teal-600/40 text-teal-300' },
                { key: 'excel' as const, label: 'XLSX', color: 'border-emerald-500/40 text-emerald-300' },
                { key: 'geojson' as const, label: 'GEOJSON', color: 'border-emerald-600/40 text-emerald-300' },
                { key: 'kml' as const, label: 'KML', color: 'border-orange-600/40 text-orange-300' },
                { key: 'csv' as const, label: 'CSV', color: 'border-stone-700 text-stone-300' },
              ].map(chip => {
                const isEnabled = dataTypes[chip.key];
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDataType(chip.key);
                    }}
                    title={`Click to ${isEnabled ? 'exclude' : 'include'} ${chip.label} files`}
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-md border transition-all ${
                      isEnabled
                        ? `bg-amber-950/50 ${chip.color} shadow-xs font-bold`
                        : 'bg-stone-900/60 border-stone-800 text-stone-600 opacity-60 line-through'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-amber-400' : 'bg-stone-600'}`} />
                    <span>{chip.label}</span>
                  </button>
                );
              })}

              {/* Subfolder indicator pill */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIncludeSubfolders(!includeSubfolders);
                }}
                title={includeSubfolders ? 'Subfolder scanning enabled' : 'Subfolder scanning disabled'}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[10px] transition-all ${
                  includeSubfolders
                    ? 'bg-emerald-950/50 border-emerald-600/40 text-emerald-300 font-semibold'
                    : 'bg-stone-900 border-stone-800 text-stone-500'
                }`}
              >
                <span>Subfolders: {includeSubfolders ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        {datasets.length > 0 && (
          <div className={`flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl border transition-all ${
            theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-stone-900/80 border-stone-800'
          }`}>
            {/* Search */}
            <div className="relative min-w-[260px]">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${
                theme === 'light' ? 'text-stone-400' : 'text-stone-400'
              }`} />
              <input
                type="text"
                placeholder={t.workspace.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full rounded-lg pl-9 pr-3 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40 border ${
                  theme === 'light'
                    ? 'bg-white border-[#D5CDBD] text-stone-900 placeholder-stone-500 focus:border-amber-600'
                    : 'bg-[#13110E] border-stone-800 text-stone-100 placeholder-stone-500 focus:border-amber-500'
                }`}
              />
            </div>

            {/* Filter buttons */}
            <div className={`flex items-center space-x-3 text-xs ${
              theme === 'light' ? 'text-stone-600' : 'text-stone-400'
            }`}>
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-mono text-stone-500 uppercase">Format:</span>
                {(['all', 'shapefile', 'geopackage', 'cad', 'gpx', 'excel', 'geojson', 'kml', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFilterFormat(fmt)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      filterFormat === fmt
                        ? 'bg-amber-600 text-white font-bold shadow-xs'
                        : theme === 'light'
                        ? 'text-stone-700 hover:text-stone-950 hover:bg-[#EFE8DD]'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {fmt === 'all' ? t.workspace.allFormats : fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className={`h-4 w-px ${theme === 'light' ? 'bg-[#DDD5C7]' : 'bg-stone-800'}`} />

              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-mono text-stone-500 uppercase">Status:</span>
                {(['all', 'ready', 'warning', 'invalid'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                      filterStatus === st
                        ? theme === 'light'
                          ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                          : 'bg-stone-750 text-amber-300 font-semibold border border-stone-700'
                        : theme === 'light'
                        ? 'text-stone-700 hover:text-stone-950 hover:bg-[#EFE8DD]'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {st === 'all' ? t.workspace.allStatuses : st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Datasets Table */}
        <div className={`flex-1 overflow-y-auto rounded-2xl border transition-all ${
          theme === 'light'
            ? 'border-[#E2DBD0] bg-white shadow-xs'
            : 'border-stone-800/90 bg-stone-900/30 backdrop-blur-sm'
        }`}>
          {filteredDatasets.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className={`sticky top-0 z-10 font-semibold uppercase tracking-wider text-[11px] border-b ${
                theme === 'light'
                  ? 'bg-[#F7F3EC] border-[#E2DBD0] text-stone-700'
                  : 'bg-[#181411] border-stone-800 text-stone-400'
              }`}>
                <tr>
                  <th className="py-3 px-3.5 w-8">
                    <button onClick={toggleSelectAll} className="text-stone-400 hover:text-stone-200">
                      {selectedIds.size === filteredDatasets.length && filteredDatasets.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3.5">{t.workspace.colName}</th>
                  <th className="py-3 px-3.5">{t.workspace.colFormat}</th>
                  <th className="py-3 px-3.5">Geometry</th>
                  <th className="py-3 px-3.5">{t.workspace.colFeatures}</th>
                  <th className="py-3 px-3.5">{t.workspace.colCrs}</th>
                  <th className="py-3 px-3.5">{t.workspace.colSize}</th>
                  <th className="py-3 px-3.5">{t.workspace.colStatus}</th>
                  <th className="py-3 px-3.5 text-right">{t.workspace.colActions}</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${theme === 'light' ? 'divide-[#EFE9DF]' : 'divide-stone-800/70'}`}>
                {filteredDatasets.map((d) => {
                  const isSelected = selectedIds.has(d.id);
                  const isTarget = selectedDatasetId === d.id;

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDatasetId(d.id)}
                      className={`cursor-pointer transition-colors ${
                        isTarget
                          ? theme === 'light'
                            ? 'bg-amber-100/70 text-stone-900 font-medium'
                            : 'bg-amber-950/30 text-amber-200'
                          : theme === 'light'
                          ? 'hover:bg-[#FAF6F0] text-stone-800'
                          : 'hover:bg-stone-800/40 text-stone-300'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelectOne(d.id)}>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Square className="w-4 h-4 text-stone-400" />
                          )}
                        </button>
                      </td>

                      {/* Name */}
                      <td className={`py-2.5 px-3.5 font-sans font-medium ${
                        theme === 'light' ? 'text-stone-900' : 'text-stone-200'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className={`truncate max-w-[280px] font-medium ${
                            theme === 'light' ? 'text-stone-900' : 'text-[#FAF6F0]'
                          }`} title={d.name}>
                            {d.name}
                          </span>
                        </div>
                      </td>

                      {/* Format & Sidecars */}
                      <td className="py-2.5 px-3.5 font-sans">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border ${
                            theme === 'light'
                              ? 'bg-[#EFE8DC] text-stone-800 border-[#DDD3C2]'
                              : 'bg-stone-800 text-stone-200 border-stone-700'
                          }`}>
                            {d.format}
                          </span>
                          {/* Sidecar indicators for shapefiles */}
                          {d.sidecars && d.sidecars.map((sc) => (
                            <span
                              key={sc.extension}
                              title={`${sc.name}: ${sc.present ? 'Present' : 'Missing'}`}
                              className={`text-[9px] font-mono px-1 py-0.2 rounded border flex items-center space-x-0.5 ${
                                sc.present
                                  ? theme === 'light'
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    : 'bg-emerald-950/50 border-emerald-600/40 text-emerald-300'
                                  : sc.required
                                  ? theme === 'light'
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 animate-pulse'
                                    : 'bg-rose-950/60 border-rose-600/60 text-rose-300 animate-pulse'
                                  : theme === 'light'
                                  ? 'bg-stone-100 border-stone-300 text-stone-500'
                                  : 'bg-stone-800 border-stone-700 text-stone-500'
                              }`}
                            >
                              <span className={`w-1 h-1 rounded-full ${sc.present ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              <span>{sc.extension}</span>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Geometry */}
                      <td className={`py-2.5 px-3.5 font-sans ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>
                        <div className="flex items-center space-x-1.5">
                          {renderGeometryIcon(d.geometryType)}
                          <span className={`text-[11px] ${theme === 'light' ? 'text-stone-800 font-medium' : 'text-stone-200'}`}>
                            {d.geometryType}
                          </span>
                        </div>
                      </td>

                      {/* Feature Count */}
                      <td className={`py-2.5 px-3.5 font-mono tabular-nums ${
                        theme === 'light' ? 'text-stone-900 font-medium' : 'text-stone-200'
                      }`}>
                        {d.featureCount.toLocaleString()}
                      </td>

                      {/* Interactive CRS */}
                      <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenCRSModalForDataset(d)}
                            title={`CRS: ${d.detectedCRS?.code || 'None'} - ${d.detectedCRS?.name || 'Missing'}\nStatus: ${d.crsStatus}\nClick to calibrate or reassign.`}
                            className={`group inline-flex items-center space-x-1.5 font-mono text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                              d.crsStatus === 'verified'
                                ? theme === 'light'
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-500 shadow-2xs'
                                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60 hover:border-emerald-500 shadow-2xs'
                                : d.crsStatus === 'assumed'
                                ? theme === 'light'
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-500 shadow-2xs'
                                  : 'bg-amber-950/60 text-amber-300 border-amber-700/60 hover:bg-amber-900/60 hover:border-amber-500 shadow-2xs'
                                : theme === 'light'
                                ? 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100 hover:border-rose-500 shadow-2xs animate-pulse font-bold'
                                : 'bg-rose-950/70 text-rose-300 border-rose-600/70 hover:bg-rose-900/70 hover:border-rose-500 shadow-2xs animate-pulse font-bold'
                            }`}
                          >
                            <Globe className={`w-3.5 h-3.5 shrink-0 ${
                              d.crsStatus === 'verified'
                                ? 'text-emerald-500'
                                : d.crsStatus === 'assumed'
                                ? 'text-amber-500'
                                : 'text-rose-500'
                            }`} />
                            <span className="font-semibold">
                              {d.detectedCRS?.code || 'Assign CRS'}
                            </span>
                            {d.detectedCRS?.name && (
                              <span className="hidden xl:inline text-[10px] opacity-75 max-w-[130px] truncate" title={d.detectedCRS.name}>
                                · {d.detectedCRS.name}
                              </span>
                            )}
                            <Edit3 className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity ml-0.5" />
                          </button>
                          <span
                            title={`CRS Status: ${d.crsStatus} (${d.crsStatus === 'verified' ? 'Verified Projection' : d.crsStatus === 'assumed' ? 'Assumed Fallback' : 'Missing CRS'})`}
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              d.crsStatus === 'verified'
                                ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                                : d.crsStatus === 'assumed'
                                ? 'bg-amber-500 ring-2 ring-amber-500/20'
                                : 'bg-rose-500 ring-2 ring-rose-500/20'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Size */}
                      <td className={`py-2.5 px-3.5 font-mono text-[11px] tabular-nums ${
                        theme === 'light' ? 'text-stone-600' : 'text-stone-400'
                      }`}>
                        {(d.sizeBytes / 1024).toFixed(1)} KB
                      </td>

                      {/* Validation Status */}
                      <td className="py-2.5 px-3.5 font-sans">
                        {d.status === 'ready' ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/50 text-emerald-300 border border-emerald-600/40">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Valid</span>
                          </span>
                        ) : d.status === 'warning' ? (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/50 text-amber-300 border border-amber-600/40 cursor-help"
                            title={d.validationIssues.map(i => i.message).join('\n')}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span>Warning</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/50 text-rose-300 border border-rose-600/40 cursor-help"
                            title={d.validationIssues.map(i => i.message).join('\n')}
                          >
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            <span>Invalid</span>
                          </span>
                        )}
                      </td>

                      {/* Quick Analytical & Map Actions */}
                      <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1.5">
                          {onOpenAggregationModal && (
                            <button
                              onClick={() => {
                                setSelectedDatasetId(d.id);
                                onOpenAggregationModal();
                              }}
                              title="Aggregate fields by category"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-orange-400 transition-colors"
                            >
                              <PieChart className="w-4 h-4" />
                            </button>
                          )}
                          {onOpenSpatialDoctor && (
                            <button
                              onClick={() => {
                                setSelectedDatasetId(d.id);
                                onOpenSpatialDoctor();
                              }}
                              title="Run Pre-Flight Doctor Diagnosis & Topology Repair"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-400 transition-colors"
                            >
                              <Stethoscope className="w-4 h-4" />
                            </button>
                          )}
                          {onOpenPostgisModal && (
                            <button
                              onClick={() => onOpenPostgisModal(d.id)}
                              title="Export to PostgreSQL / PostGIS database"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-indigo-400 transition-colors"
                            >
                              <Database className="w-4 h-4" />
                            </button>
                          )}
                          {datasets.length >= 2 && onOpenJoinModal && (
                            <button
                              onClick={() => onOpenJoinModal(d.id)}
                              title="Join with another layer (Attribute or Spatial)"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-purple-400 transition-colors"
                            >
                              <GitMerge className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onPreviewOnMap(d)}
                            title="Preview dataset on interactive map"
                            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDatasets(prev => prev.filter(item => item.id !== d.id));
                              if (selectedDatasetId === d.id) setSelectedDatasetId(null);
                            }}
                            title="Remove dataset"
                            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-stone-500">
              <Database className="w-10 h-10 mb-2 text-stone-600" />
              <p className="text-sm font-display font-semibold text-stone-300">No geospatial datasets in workspace</p>
              <p className="text-xs text-stone-400 mt-1 max-w-sm">
                Select individual files or an entire folder with subfolders to begin batch transformations.
              </p>
              <div className="mt-4 flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-display font-bold bg-[#2A221C] hover:bg-amber-600 text-stone-200 hover:text-stone-950 border border-stone-700/80 transition-all shadow-sm"
                >
                  <FileCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.workspace.selectFiles}</span>
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-display font-bold bg-amber-600 hover:bg-amber-500 text-stone-950 shadow-md shadow-amber-950/40 transition-all"
                >
                  <FolderTree className="w-3.5 h-3.5 text-stone-950" />
                  <span>{t.workspace.selectFolder}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Excel Coordinate Column Mapper & Worksheet Isolation Modal */}
      <ExcelCoordinateModal
        isOpen={isExcelModalOpen}
        onClose={() => {
          setIsExcelModalOpen(false);
          setPendingExcelFile(null);
        }}
        pendingFile={pendingExcelFile}
        onConfirmDataset={(newDatasetOrList) => {
          const list = Array.isArray(newDatasetOrList) ? newDatasetOrList : [newDatasetOrList];
          setDatasets(prev => [...prev, ...list]);
          if (!selectedDatasetId && list[0]) {
            setSelectedDatasetId(list[0].id);
          }
          setIsExcelModalOpen(false);
          setPendingExcelFile(null);
        }}
      />

      {/* GeoPackage Multi-Layer Isolation Modal */}
      <GpkgLayerModal
        isOpen={isGpkgModalOpen}
        onClose={() => {
          setIsGpkgModalOpen(false);
          setPendingGpkgFile(null);
        }}
        pendingGpkg={pendingGpkgFile}
        onConfirmLayers={async (selectedTableNames) => {
          if (!pendingGpkgFile) return;
          try {
            const isolatedDatasets = await parseGeoPackage(
              pendingGpkgFile.buffer,
              pendingGpkgFile.displayName,
              pendingGpkgFile.fileSize,
              selectedTableNames
            );
            setDatasets(prev => [...prev, ...isolatedDatasets]);
            if (!selectedDatasetId && isolatedDatasets[0]) {
              setSelectedDatasetId(isolatedDatasets[0].id);
            }
          } catch (err) {
            console.error('Failed to import isolated GPKG layers:', err);
          } finally {
            setIsGpkgModalOpen(false);
            setPendingGpkgFile(null);
          }
        }}
      />

      {/* Subfolder Ingestion Choice Modal */}
      {pendingFolderImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden p-6 space-y-5 ${
            theme === 'light' 
              ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-amber-950/20' 
              : 'bg-[#181411] border-stone-800 text-stone-100 shadow-stone-950/90'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  <FolderTree className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm">
                    Folder Ingestion: Subfolders Detected
                  </h3>
                  <p className="text-xs text-stone-400 font-mono mt-0.5">
                    &ldquo;{pendingFolderImport.folderName}&rdquo; contains nested directories
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingFolderImport(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              How would you like to process geospatial datasets inside this directory tree?
            </p>

            {/* Comparison cards */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className={`p-3 rounded-xl border ${
                theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
              }`}>
                <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Root Level</span>
                <span className="text-base font-bold text-amber-400 block mt-0.5">
                  {pendingFolderImport.rootFilesCount}
                </span>
                <span className="text-[10px] text-stone-500 block mt-0.5">files in top folder</span>
              </div>
              <div className={`p-3 rounded-xl border ${
                theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
              }`}>
                <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Subfolders</span>
                <span className="text-base font-bold text-emerald-400 block mt-0.5">
                  {pendingFolderImport.subfolderFilesCount}
                </span>
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  files across {pendingFolderImport.subfolderCount} subdirectories
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const files = pendingFolderImport.files;
                  setIncludeSubfolders(true);
                  setPendingFolderImport(null);
                  void handleFiles(files, true, true);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all group bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-semibold shadow-md shadow-amber-950/30"
              >
                <div className="flex items-center space-x-3">
                  <FolderTree className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold font-display">
                      Ingest Entire Directory Tree (Include Subfolders)
                    </div>
                    <div className="text-[10px] opacity-80 font-mono mt-0.5">
                      Process all {pendingFolderImport.rootFilesCount + pendingFolderImport.subfolderFilesCount} files across root and nested subfolders
                    </div>
                  </div>
                </div>
                <Check className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const files = pendingFolderImport.files;
                  setIncludeSubfolders(false);
                  setPendingFolderImport(null);
                  void handleFiles(files, true, false);
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                  theme === 'light'
                    ? 'bg-white border-[#D6CEBE] text-stone-800 hover:bg-stone-50'
                    : 'bg-[#1E1915] border-stone-700 text-stone-200 hover:bg-[#27201B]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Database className="w-5 h-5 text-stone-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold font-display">
                      Ingest Root Folder Only
                    </div>
                    <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                      Process only the {pendingFolderImport.rootFilesCount} files in the root folder, ignoring subdirectories
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs">
              <label className="flex items-center space-x-2 text-[11px] text-stone-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alwaysPromptSubfolders}
                  onChange={(e) => setAlwaysPromptSubfolders(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500/40"
                />
                <span>Always ask when subfolders are detected</span>
              </label>

              <button
                type="button"
                onClick={() => setPendingFolderImport(null)}
                className="text-stone-400 hover:text-stone-200 text-xs px-2.5 py-1 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Dataset CRS Calibration Modal */}
      <CRSModal
        isOpen={isSingleCrsModalOpen}
        onClose={() => {
          setIsSingleCrsModalOpen(false);
          setCrsModalTarget(null);
        }}
        selectedCRS={crsModalTarget?.detectedCRS?.code || 'EPSG:4326'}
        onSelectCRS={handleApplyCRSToDataset}
      />

      {/* Batch Selected Datasets CRS Calibration Modal */}
      <CRSModal
        isOpen={isBatchCrsModalOpen}
        onClose={() => setIsBatchCrsModalOpen(false)}
        selectedCRS="EPSG:26192"
        onSelectCRS={handleBatchApplyCRS}
      />
    </div>
  );
};
