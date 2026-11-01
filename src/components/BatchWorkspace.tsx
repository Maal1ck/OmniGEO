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
  Info
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { parseCSV, parseGeoJSON, parseKML, parseShapefileZipOrBuffers } from '../core/formatParsers';
import { parseGeoPackage } from '../core/geoPackageParser';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

export interface DataTypeFilter {
  shapefile: boolean;
  geopackage: boolean;
  geojson: boolean;
  kml: boolean;
  csv: boolean;
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
}

export const BatchWorkspace: React.FC<BatchWorkspaceProps> = ({
  datasets,
  setDatasets,
  selectedDatasetId,
  setSelectedDatasetId,
  onPreviewOnMap,
  onOpenSpatialDoctor,
  onOpenAggregationModal,
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

  // Ingestion settings: choice of data types & subfolder recursion
  const [dataTypes, setDataTypes] = useState<DataTypeFilter>({
    shapefile: true,
    geopackage: true,
    geojson: true,
    kml: true,
    csv: true,
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
  const handleFiles = async (files: FileList | File[], isFolderSource = false) => {
    const rawList = Array.from(files);
    if (rawList.length === 0) return;

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
      if (isFolderSource && !includeSubfolders && relPath.includes('/')) {
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

      if (isShape && !dataTypes.shapefile) continue;
      if (isGpkg && !dataTypes.geopackage) continue;
      if (isGeoJson && !dataTypes.geojson) continue;
      if (isKml && !dataTypes.kml) continue;
      if (isCsv && !dataTypes.csv) continue;

      // Ignore non-geospatial files silently (e.g. .txt, .pdf, .xml, .DS_Store, .png)
      if (!isShape && !isGpkg && !isGeoJson && !isKml && !isCsv) {
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
            const gpkgDatasets = await parseGeoPackage(await file.arrayBuffer(), displayName, file.size);
            newDatasets.push(...gpkgDatasets);
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
        accept=".shp,.shx,.dbf,.prj,.cpg,.geojson,.json,.kml,.kmz,.csv,.gpkg,.zip"
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
      <div className="px-6 py-3.5 border-b border-stone-800/80 bg-[#181411]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
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
            <FileCode className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`} />
            <span>{t.workspace.selectFiles}</span>
          </button>

          {/* 2. Folder & Subfolder Directory Ingestion Button */}
          <button
            onClick={() => folderInputRef.current?.click()}
            disabled={isProcessingFiles}
            title="Select a whole folder and automatically ingest all geospatial files inside it and subfolders"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 shadow-md shadow-amber-950/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <FolderTree className="w-3.5 h-3.5 text-stone-950" />
            <span>{isProcessingFiles ? t.common.loading : t.workspace.selectFolder}</span>
          </button>

          {/* 3. Ingestion Filters & Data Types Dropdown */}
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              title="Configure data types and subfolder scanning"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                isFilterMenuOpen || activeTypesCount < 5 || !includeSubfolders
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
                {activeTypesCount}/5
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
                <div className="py-2.5 space-y-1.5">
                  {[
                    { key: 'geopackage' as const, label: 'GeoPackage (.gpkg)', desc: 'OGC Vector SQLite Database' },
                    { key: 'shapefile' as const, label: 'ESRI Shapefile (.shp / .zip)', desc: 'Bundled .shp, .shx, .dbf, .prj' },
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
              {selectedIds.size > 0 && (
                <button
                  onClick={removeSelected}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.workspace.removeSelected} ({selectedIds.size})</span>
                </button>
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
      <div className="flex-1 flex flex-col p-5 overflow-hidden gap-4">
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
            </div>

            {/* Right: Interactive Format Toggle Pills (Click to enable/disable data types) */}
            <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono">
              {[
                { key: 'shapefile' as const, label: 'SHP', color: 'border-amber-600/40 text-amber-300' },
                { key: 'geopackage' as const, label: 'GPKG', color: 'border-amber-700/40 text-amber-200' },
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
          <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/80 p-2.5 rounded-xl border border-stone-800">
            {/* Search */}
            <div className="relative min-w-[260px]">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t.workspace.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#13110E] border border-stone-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center space-x-3 text-xs text-stone-400">
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-mono text-stone-500 uppercase">Format:</span>
                {(['all', 'shapefile', 'geopackage', 'geojson', 'kml', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFilterFormat(fmt)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      filterFormat === fmt
                        ? 'bg-amber-600 text-stone-950 font-bold shadow-sm'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {fmt === 'all' ? t.workspace.allFormats : fmt.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-stone-800" />

              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-mono text-stone-500 uppercase">Status:</span>
                {(['all', 'ready', 'warning', 'invalid'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium capitalize transition-colors ${
                      filterStatus === st
                        ? 'bg-stone-750 text-amber-300 font-semibold border border-stone-700'
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
        <div className="flex-1 overflow-y-auto border border-stone-800/90 rounded-2xl bg-stone-900/30 backdrop-blur-sm">
          {filteredDatasets.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#181411] border-b border-stone-800 z-10 text-stone-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5 w-8">
                    <button onClick={toggleSelectAll} className="text-stone-400 hover:text-stone-200">
                      {selectedIds.size === filteredDatasets.length && filteredDatasets.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-amber-400" />
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
              <tbody className="divide-y divide-stone-800/70">
                {filteredDatasets.map((d) => {
                  const isSelected = selectedIds.has(d.id);
                  const isTarget = selectedDatasetId === d.id;

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDatasetId(d.id)}
                      className={`cursor-pointer transition-colors ${
                        isTarget
                          ? 'bg-amber-950/30 text-amber-200'
                          : 'hover:bg-stone-800/40 text-stone-300'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelectOne(d.id)}>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-stone-500" />
                          )}
                        </button>
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-3.5 font-sans font-medium text-stone-200">
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="truncate max-w-[280px] text-[#FAF6F0] font-medium" title={d.name}>
                            {d.name}
                          </span>
                        </div>
                      </td>

                      {/* Format & Sidecars */}
                      <td className="py-2.5 px-3.5 font-sans">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-stone-800 text-[10px] font-mono font-semibold text-stone-200 uppercase border border-stone-700">
                            {d.format}
                          </span>
                          {/* Sidecar indicators for shapefiles */}
                          {d.sidecars && d.sidecars.map((sc) => (
                            <span
                              key={sc.extension}
                              title={`${sc.name}: ${sc.present ? 'Present' : 'Missing'}`}
                              className={`text-[9px] font-mono px-1 py-0.2 rounded border flex items-center space-x-0.5 ${
                                sc.present
                                  ? 'bg-emerald-950/50 border-emerald-600/40 text-emerald-300'
                                  : sc.required
                                  ? 'bg-rose-950/60 border-rose-600/60 text-rose-300 animate-pulse'
                                  : 'bg-stone-800 border-stone-700 text-stone-500'
                              }`}
                            >
                              <span className={`w-1 h-1 rounded-full ${sc.present ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                              <span>{sc.extension}</span>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Geometry */}
                      <td className="py-2.5 px-3.5 text-stone-300 font-sans">
                        <div className="flex items-center space-x-1.5">
                          {renderGeometryIcon(d.geometryType)}
                          <span className="text-[11px] text-stone-200">{d.geometryType}</span>
                        </div>
                      </td>

                      {/* Feature Count */}
                      <td className="py-2.5 px-3.5 text-stone-200 font-mono tabular-nums">
                        {d.featureCount.toLocaleString()}
                      </td>

                      {/* CRS */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-xs text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-700/50">
                            {d.detectedCRS?.code || 'Undefined'}
                          </span>
                          <span
                            title={`CRS Status: ${d.crsStatus}`}
                            className={`w-1.5 h-1.5 rounded-full ${
                              d.crsStatus === 'verified'
                                ? 'bg-emerald-400'
                                : d.crsStatus === 'assumed'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-3.5 text-stone-400 font-mono text-[11px] tabular-nums">
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
    </div>
  );
};
