import React, { useRef, useState } from 'react';
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
  Sparkles, 
  CheckSquare, 
  Square, 
  Package, 
  Stethoscope, 
  Compass,
  FileCode,
  Hexagon,
  Milestone,
  Layers,
  Calculator,
  PieChart
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { parseCSV, parseGeoJSON, parseKML, parseShapefileZipOrBuffers } from '../core/formatParsers';

interface BatchWorkspaceProps {
  datasets: SpatialDataset[];
  setDatasets: React.Dispatch<React.SetStateAction<SpatialDataset[]>>;
  selectedDatasetId: string | null;
  setSelectedDatasetId: (id: string | null) => void;
  onPreviewOnMap: (dataset: SpatialDataset) => void;
  onLoadSampleData: () => void;
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
  onLoadSampleData,
  onOpenSpatialDoctor,
  onCalculateSurfaces,
  onOpenAggregationModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter datasets
  const filteredDatasets = datasets.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.detectedCRS?.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFormat = filterFormat === 'all' || d.format === filterFormat;
    const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchesSearch && matchesFormat && matchesStatus;
  });

  // Calculate high-level summary metrics
  const totalFeatures = datasets.reduce((sum, d) => sum + d.featureCount, 0);
  const totalSizeBytes = datasets.reduce((sum, d) => sum + d.sizeBytes, 0);
  const warningCount = datasets.filter(d => d.status === 'warning').length;
  const errorCount = datasets.filter(d => d.status === 'invalid').length;

  // Handle uploaded files
  const handleFiles = async (files: FileList | File[]) => {
    setIsProcessingFiles(true);
    const newDatasets: SpatialDataset[] = [];

    // Group files by base name to match Shapefile sidecars (.shp, .shx, .dbf, .prj)
    const sidecarGroups: Record<string, { [ext: string]: File }> = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      const baseName = file.name.slice(0, file.name.lastIndexOf('.'));

      if (['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx'].includes(ext)) {
        if (!sidecarGroups[baseName]) sidecarGroups[baseName] = {};
        sidecarGroups[baseName][ext] = file;
      }
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const baseName = file.name.slice(0, file.name.lastIndexOf('.'));

        if (['.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx'].includes(ext)) {
          continue; // Processed together with .shp
        }

        if (ext === '.shp') {
          const group = sidecarGroups[baseName] || {};
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
          const dataset = await parseShapefileZipOrBuffers(zipBuf, file.name, file.size);

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
          try {
            const dataset = await parseShapefileZipOrBuffers(buf, file.name, file.size);
            newDatasets.push(dataset);
          } catch {
            // Not a shapefile zip
          }
        } else if (ext === '.geojson' || ext === '.json') {
          const text = await file.text();
          try {
            const dataset = parseGeoJSON(text, file.name, file.size);
            newDatasets.push(dataset);
          } catch {
            // Unparseable
          }
        } else if (ext === '.csv') {
          const text = await file.text();
          const dataset = parseCSV(text, file.name, file.size);
          newDatasets.push(dataset);
        } else if (ext === '.kml') {
          const text = await file.text();
          const dataset = parseKML(text, file.name, file.size);
          newDatasets.push(dataset);
        }
      }

      if (newDatasets.length > 0) {
        setDatasets(prev => [...prev, ...newDatasets]);
        if (!selectedDatasetId && newDatasets[0]) {
          setSelectedDatasetId(newDatasets[0].id);
        }
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  // Drag and Drop
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
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
      {/* Workspace Header Toolbar */}
      <div className="px-6 py-3.5 border-b border-stone-800/80 bg-[#181411]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        {/* Left: Summary Metrics */}
        <div className="flex items-center space-x-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-display font-bold text-[#FAF6F0] tracking-tight flex items-center space-x-2">
                <Database className="w-4 h-4 text-amber-400" />
                <span>Geospatial Queue</span>
              </h1>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 border border-amber-700/50">
                {datasets.length} {datasets.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            {/* Unboxed Metadata Discipline */}
            <p className="text-xs text-stone-400 mt-0.5 font-mono">
              <span>{totalFeatures.toLocaleString()} features</span>
              <span className="mx-1.5 text-stone-600">·</span>
              <span>{(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB total</span>
              {warningCount > 0 && (
                <>
                  <span className="mx-1.5 text-stone-600">·</span>
                  <span className="text-amber-400 font-semibold">{warningCount} warnings</span>
                </>
              )}
              {errorCount > 0 && (
                <>
                  <span className="mx-1.5 text-stone-600">·</span>
                  <span className="text-rose-400 font-semibold">{errorCount} invalid</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {warningCount > 0 && onOpenSpatialDoctor && (
            <button
              onClick={onOpenSpatialDoctor}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border border-amber-600/60 transition-all shadow-sm"
            >
              <Stethoscope className="w-3.5 h-3.5 text-amber-400" />
              <span>Fix {warningCount} Warnings</span>
            </button>
          )}

          {datasets.length === 0 && (
            <button
              onClick={onLoadSampleData}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-stone-950 shadow-md shadow-amber-950/40 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Sample GIS Datasets</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".shp,.shx,.dbf,.prj,.cpg,.geojson,.json,.kml,.kmz,.csv,.gpkg,.zip"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold bg-amber-600 hover:bg-amber-500 text-stone-950 shadow-sm shadow-amber-950/40 transition-all"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Add Files</span>
          </button>

          {datasets.length > 0 && (
            <>
              {selectedIds.size > 0 && (
                <button
                  onClick={removeSelected}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove ({selectedIds.size})</span>
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

      {/* Main Drag-and-Drop Area & Table Layout */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden gap-4">
        {/* Elevated Drag and Drop Dropzone with Cartographic Feel */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-amber-400 bg-amber-950/40 glow-amber'
              : 'border-stone-800/90 hover:border-amber-600/50 bg-[#191512]/50 hover:bg-[#1E1915]/60'
          }`}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 max-w-4xl mx-auto">
            <div className="flex items-center space-x-3.5 text-left">
              <div className="p-3 bg-amber-950/70 rounded-xl text-amber-400 border border-amber-700/50 shadow-inner">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-display font-semibold text-[#FAF6F0]">
                  Drop GIS files here or click to browse
                </p>
                <p className="text-xs text-stone-400 mt-0.5">
                  Full sidecar pairing, coordinate detection, and topology validation on upload
                </p>
              </div>
            </div>

            {/* Moderately colorful format chips */}
            <div className="flex items-center flex-wrap gap-2 text-[11px] font-mono">
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-600/40 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>SHAPEFILE (.shp + .shx + .dbf)</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-stone-800/80 border border-amber-700/40 text-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>GEOPACKAGE (.gpkg)</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-600/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>GEOJSON</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-orange-950/50 border border-orange-600/40 text-orange-300">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span>KML</span>
              </span>
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-stone-850/80 border border-stone-700 text-stone-300">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                <span>CSV</span>
              </span>
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
                placeholder="Search datasets, CRS, attributes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#13110E] border border-stone-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center space-x-3 text-xs text-stone-400">
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] font-mono text-stone-500 uppercase">Format:</span>
                {(['all', 'shapefile', 'geojson', 'kml', 'csv'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFilterFormat(fmt)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      filterFormat === fmt
                        ? 'bg-amber-600 text-stone-950 font-bold shadow-sm'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {fmt.toUpperCase()}
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
                    {st}
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
                  <th className="py-3 px-3.5">Dataset Name</th>
                  <th className="py-3 px-3.5">Format & Sidecars</th>
                  <th className="py-3 px-3.5">Geometry</th>
                  <th className="py-3 px-3.5">Features</th>
                  <th className="py-3 px-3.5">Source CRS</th>
                  <th className="py-3 px-3.5">File Size</th>
                  <th className="py-3 px-3.5">Pre-Flight Audit</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-850/60 font-mono">
                {filteredDatasets.map((d) => {
                  const isChecked = selectedIds.has(d.id);
                  const isCurrent = selectedDatasetId === d.id;

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDatasetId(d.id)}
                      className={`cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-amber-950/30 border-l-2 border-amber-500'
                          : 'hover:bg-stone-850/50'
                      }`}
                    >
                      <td className="py-2.5 px-3.5" onClick={(e) => { e.stopPropagation(); toggleSelectOne(d.id); }}>
                        <button className="text-stone-400 hover:text-stone-200">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-3.5 font-sans font-medium text-stone-200">
                        <div className="flex items-center space-x-2">
                          <Package className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="truncate max-w-[210px] text-[#FAF6F0] font-medium" title={d.name}>
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

                      {/* Actions */}
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                          {onCalculateSurfaces && d.geometryType.includes('Polygon') && (
                            <button
                              onClick={() => {
                                setSelectedDatasetId(d.id);
                                onCalculateSurfaces('ha');
                              }}
                              title="Calculate surfaces in hectares (+surface_ha)"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-400 transition-colors"
                            >
                              <Calculator className="w-4 h-4" />
                            </button>
                          )}
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
                Drop your Shapefiles, GeoJSON, GeoPackage, KML, or CSV files above or load sample datasets to start batch transformations.
              </p>
              <button
                onClick={onLoadSampleData}
                className="mt-4 flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-display font-bold bg-amber-600 hover:bg-amber-500 text-stone-950 shadow-md shadow-amber-950/40 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample GIS Datasets</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
