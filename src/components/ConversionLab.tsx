import React from 'react';
import { 
  Settings2, 
  Globe, 
  Layers, 
  Check, 
  AlertTriangle, 
  FileText, 
  Search,
  Sparkles,
  Stethoscope,
  TableProperties,
  ShieldCheck,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { BatchSettings, ConsolidationSettings, SupportedFormat } from '../types/gis';
import { COMMON_CRS_LIST, getCRSByCode } from '../core/crsDefinitions';
import { CRSModal } from './CRSModal';

interface ConversionLabProps {
  settings: BatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<BatchSettings>>;
  consolidationSettings: ConsolidationSettings;
  setConsolidationSettings: React.Dispatch<React.SetStateAction<ConsolidationSettings>>;
  onOpenCRSModal: () => void;
  isCRSModalOpen: boolean;
  onCloseCRSModal: () => void;
  onOpenSchemaHarmonizer: () => void;
  onOpenSpatialDoctor: () => void;
  harmonizerRulesCount: number;
}

export const ConversionLab: React.FC<ConversionLabProps> = ({
  settings,
  setSettings,
  consolidationSettings,
  setConsolidationSettings,
  onOpenCRSModal,
  isCRSModalOpen,
  onCloseCRSModal,
  onOpenSchemaHarmonizer,
  onOpenSpatialDoctor,
  harmonizerRulesCount,
}) => {
  const currentCRS = getCRSByCode(settings.targetCRS) || COMMON_CRS_LIST[0];

  const formats: { 
    id: SupportedFormat; 
    name: string; 
    ext: string; 
    desc: string; 
    accentColor: string; 
    borderColor: string;
    tag?: string 
  }[] = [
    {
      id: 'geopackage',
      name: 'OGC GeoPackage',
      ext: '.gpkg',
      desc: 'Modern, portable single-file SQLite vector container. Recommended for all QGIS, GDAL & ArcGIS workflows.',
      accentColor: 'amber',
      borderColor: 'border-amber-500',
      tag: 'Recommended',
    },
    {
      id: 'shapefile',
      name: 'ESRI Shapefile Suite',
      ext: '.zip',
      desc: 'Legacy multi-file bundle (.shp, .shx, .dbf, .prj, .cpg) compressed into a production-ready ZIP archive.',
      accentColor: 'amber',
      borderColor: 'border-amber-500',
    },
    {
      id: 'geojson',
      name: 'RFC 7946 GeoJSON',
      ext: '.geojson',
      desc: 'Web GIS interchange standard with full coordinate precision, bounding boxes, and nested feature properties.',
      accentColor: 'emerald',
      borderColor: 'border-emerald-500',
    },
    {
      id: 'kml',
      name: 'Google Earth KML',
      ext: '.kml',
      desc: 'Keyhole Markup Language formatted for Google Earth Desktop, Web, and 3D terrain visualization.',
      accentColor: 'orange',
      borderColor: 'border-orange-500',
    },
    {
      id: 'csv',
      name: 'Spatial Coordinates CSV',
      ext: '.csv',
      desc: 'Tabular comma-separated values with explicit longitude/latitude and complete attribute columns.',
      accentColor: 'stone',
      borderColor: 'border-stone-500',
    },
  ];

  const quickCRSShortcuts = [
    { code: 'EPSG:4326', label: 'WGS 84 (GPS)', tag: 'Global' },
    { code: 'EPSG:3857', label: 'Web Mercator', tag: 'Web Maps' },
    { code: 'EPSG:27700', label: 'British Nat Grid', tag: 'UK' },
    { code: 'EPSG:2154', label: 'Lambert-93', tag: 'France' },
    { code: 'EPSG:25832', label: 'UTM Zone 32N', tag: 'Europe' },
    { code: 'EPSG:5070', label: 'NAD83 Conus', tag: 'USA' },
  ];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#13110E] p-6 text-[#F5EBE1]">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        {/* Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-stone-800/80">
          <div>
            <h1 className="text-base font-display font-bold text-[#FAF6F0] flex items-center space-x-2">
              <Settings2 className="w-4 h-4 text-amber-400" />
              <span>Conversion Lab & Geodetic Parameters</span>
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">
              Target format encoding, PROJ datum transformation parameters, layer schema policies, and delivery handoffs
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-stone-500">Active Pipeline:</span>
            <span className="px-2.5 py-0.5 rounded-md bg-amber-950/80 border border-amber-700/60 text-amber-300 font-semibold">
              {settings.targetFormat.toUpperCase()}
            </span>
            <span className="text-stone-600">/</span>
            <span className="px-2.5 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-200">
              {settings.targetCRS}
            </span>
          </div>
        </div>

        {/* Section 1: Target Format Selection */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center justify-center">
                1
              </span>
              <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider">
                Target Output Format
              </h2>
            </div>
            <span className="text-xs text-stone-400 font-mono">
              Selected: <span className="text-amber-400 font-bold">{settings.targetFormat.toUpperCase()}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {formats.map((fmt) => {
              const isSelected = settings.targetFormat === fmt.id;
              return (
                <div
                  key={fmt.id}
                  onClick={() => setSettings(s => ({ ...s, targetFormat: fmt.id }))}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-stone-900/90 border-amber-500 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/40'
                      : 'bg-stone-900/40 border-stone-800 hover:border-stone-700 hover:bg-stone-900/70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display font-bold text-sm text-[#FAF6F0]">{fmt.name}</span>
                      {fmt.tag && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-950 text-amber-300 border border-amber-700/50">
                          {fmt.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed mb-3">{fmt.desc}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-stone-800">
                    <span className="font-mono text-xs text-stone-500">{fmt.ext}</span>
                    {isSelected ? (
                      <span className="flex items-center space-x-1 text-xs text-amber-400 font-semibold">
                        <Check className="w-3.5 h-3.5" />
                        <span>Selected</span>
                      </span>
                    ) : (
                      <span className="text-xs text-stone-500 hover:text-stone-300">Select</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Format Warning Notice */}
          {settings.targetFormat === 'shapefile' && (
            <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-amber-950/30 border border-amber-600/50 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">ESRI Shapefile Specification Limits</p>
                <p className="text-amber-200/90 mt-0.5 leading-relaxed font-sans">
                  Column names are strictly truncated to a maximum of 10 characters (DBF III standard). Single shapefiles cannot store mixed geometry types in the same file. Multi-part geometries are normalized.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Coordinate Reference System (CRS) Transformation */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center justify-center">
                2
              </span>
              <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider">
                Geodetic Datum & Coordinate Reference System (CRS)
              </h2>
            </div>
            <button
              onClick={onOpenCRSModal}
              className="flex items-center space-x-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse 20+ EPSG Systems...</span>
            </button>
          </div>

          {/* Current Target CRS Card */}
          <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2.5">
                <Globe className="w-5 h-5 text-amber-400" />
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/80 px-2.5 py-0.5 rounded-md border border-amber-700/50">
                  {currentCRS.code}
                </span>
                <span className="font-display font-bold text-sm text-[#FAF6F0]">{currentCRS.name}</span>
              </div>
              <p className="text-xs text-stone-400">
                Area of Use: <span className="text-stone-200 font-medium">{currentCRS.area}</span> · Units: <span className="text-stone-200 font-medium">{currentCRS.unit}</span>
              </p>
              <p className="text-[11px] font-mono text-stone-500 truncate max-w-xl">
                {currentCRS.proj4}
              </p>
            </div>

            <button
              onClick={onOpenCRSModal}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-display font-bold text-stone-950 transition-all flex-shrink-0 shadow-md shadow-amber-950/30"
            >
              Change Target CRS
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div className="space-y-2">
            <span className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider block">Standard EPSG Presets:</span>
            <div className="flex flex-wrap gap-2">
              {quickCRSShortcuts.map((sc) => (
                <button
                  key={sc.code}
                  onClick={() => setSettings(s => ({ ...s, targetCRS: sc.code }))}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center space-x-2 ${
                    settings.targetCRS === sc.code
                      ? 'bg-amber-950/70 border-amber-500 text-amber-300 shadow-sm ring-1 ring-amber-500/40'
                      : 'bg-stone-900/80 border-stone-800 text-stone-400 hover:border-amber-600/40 hover:text-stone-200'
                  }`}
                >
                  <span className="font-mono font-semibold text-amber-400">{sc.code}</span>
                  <span>{sc.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reproject vs Assign CRS */}
          <div className="pt-3 border-t border-stone-800 space-y-3">
            <span className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider block">
              Coordinate Operation Mode
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                onClick={() => setSettings(s => ({ ...s, crsMode: 'reproject' }))}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.crsMode === 'reproject'
                    ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/40'
                    : 'bg-stone-900/40 border-stone-800 hover:border-stone-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-display font-bold text-[#FAF6F0]">Reproject Coordinates (Rigorous PROJ Math)</span>
                  </div>
                  {settings.crsMode === 'reproject' && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-xs text-stone-400 leading-relaxed pl-4">
                  Transforms geometry coordinates using mathematical PROJ equations (e.g. degrees to projected meters). Preserves exact geospatial location on Earth.
                </p>
              </div>

              <div
                onClick={() => setSettings(s => ({ ...s, crsMode: 'assign' }))}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.crsMode === 'assign'
                    ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/40'
                    : 'bg-stone-900/40 border-stone-800 hover:border-stone-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-orange-400" />
                    <span className="text-xs font-display font-bold text-[#FAF6F0]">Assign CRS Only (Header Override)</span>
                  </div>
                  {settings.crsMode === 'assign' && <Check className="w-4 h-4 text-orange-400" />}
                </div>
                <p className="text-xs text-stone-400 leading-relaxed pl-4">
                  Only tags metadata without modifying coordinate numbers. Use ONLY when the dataset already contains coordinates for the target CRS but was missing its .prj header.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: File Naming, Collision, and Concurrency */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File Naming & Collision */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider">
                Output Naming & Collision Policy
              </h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-stone-300 font-medium block">
                Filename Pattern:
              </label>
              <input
                type="text"
                value={settings.namingPattern}
                onChange={(e) => setSettings(s => ({ ...s, namingPattern: e.target.value }))}
                className="w-full bg-[#13110E] border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 font-mono focus:border-amber-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5 text-[10px] text-stone-500">
                <span>Available tokens:</span>
                <span className="font-mono bg-stone-800 px-1.5 py-0.5 rounded text-amber-400 cursor-pointer hover:bg-stone-700" onClick={() => setSettings(s => ({ ...s, namingPattern: '{name}_{crs}' }))}>{'{name}'}</span>
                <span className="font-mono bg-stone-800 px-1.5 py-0.5 rounded text-amber-400 cursor-pointer hover:bg-stone-700" onClick={() => setSettings(s => ({ ...s, namingPattern: '{name}_{crs}' }))}>{'{crs}'}</span>
                <span className="font-mono bg-stone-800 px-1.5 py-0.5 rounded text-amber-400 cursor-pointer hover:bg-stone-700" onClick={() => setSettings(s => ({ ...s, namingPattern: '{name}_{format}' }))}>{'{format}'}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-800">
              <label className="text-xs text-stone-300 font-medium block">
                Collision Policy:
              </label>
              <select
                value={settings.collisionPolicy}
                onChange={(e) => setSettings(s => ({ ...s, collisionPolicy: e.target.value as any }))}
                className="w-full bg-[#13110E] border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 focus:border-amber-500 focus:outline-none cursor-pointer"
              >
                <option value="rename" className="bg-stone-900">Auto-increment filename (e.g. parcels_1.gpkg)</option>
                <option value="overwrite" className="bg-stone-900">Overwrite existing target files</option>
                <option value="skip" className="bg-stone-900">Skip file if destination exists</option>
              </select>
            </div>
          </div>

          {/* Engine Concurrency & Reliability */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center justify-center">
                4
              </span>
              <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider">
                Processing Engine & Thread Pool
              </h2>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-stone-300 font-medium">
                  Concurrent Worker Limit:
                </label>
                <span className="font-mono text-xs text-amber-400 font-bold">{settings.maxConcurrentWorkers} Threads</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.maxConcurrentWorkers}
                onChange={(e) => setSettings(s => ({ ...s, maxConcurrentWorkers: parseInt(e.target.value, 10) }))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-stone-500">
                Non-blocking worker pool preventing browser UI thread locking during massive multi-layer conversion batches.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-800">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.validateGeometries}
                  onChange={(e) => setSettings(s => ({ ...s, validateGeometries: e.target.checked }))}
                  className="rounded border-stone-700 bg-[#13110E] text-amber-500 focus:ring-0"
                />
                <span className="text-xs text-stone-200 font-medium">Enforce Strict Geometry Audit before Export</span>
              </label>
              <p className="text-[11px] text-stone-500 pl-6">
                Checks for unclosed polygon rings, NaN coordinates, self-intersections, and boundary violations.
              </p>
            </div>
          </div>
        </div>

        {/* Section 5: Groundbreaking GIS Workflows */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold flex items-center justify-center">
                5
              </span>
              <h2 className="text-xs font-display font-bold text-stone-200 uppercase tracking-wider flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Multi-Layer GeoPackage Consolidator & GIS Handoff Bundler</span>
              </h2>
            </div>
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700/50">
              QGIS & ArcGIS Pro Ready
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-3">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consolidationSettings.consolidateToSingleGeoPackage}
                  onChange={(e) => setConsolidationSettings(s => ({ ...s, consolidateToSingleGeoPackage: e.target.checked }))}
                  className="rounded border-stone-700 bg-[#13110E] text-amber-500 focus:ring-0 mt-0.5"
                />
                <div>
                  <span className="text-xs font-display font-bold text-[#FAF6F0] block">
                    Consolidate Batch into Single Multi-Layer GeoPackage (.gpkg)
                  </span>
                  <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed">
                    Merges all input datasets into individual feature tables inside one single OGC GeoPackage container instead of exporting loose files.
                  </p>
                </div>
              </label>

              {consolidationSettings.consolidateToSingleGeoPackage && (
                <div className="pl-6 space-y-2 pt-2 border-t border-stone-800 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-stone-500 block mb-1">Unified Container Filename:</span>
                    <input
                      type="text"
                      value={consolidationSettings.packageFileName}
                      onChange={(e) => setConsolidationSettings(s => ({ ...s, packageFileName: e.target.value }))}
                      className="w-full bg-[#13110E] border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={consolidationSettings.generateQgisProject}
                      onChange={(e) => setConsolidationSettings(s => ({ ...s, generateQgisProject: e.target.checked }))}
                      className="rounded border-stone-700 bg-[#13110E] text-amber-500 focus:ring-0"
                    />
                    <span className="text-[11px] font-sans text-stone-200">
                      Generate QGIS 3.x Project File (.qgs) with automated symbology
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Quick Access to Schema Harmonizer & Spatial Doctor */}
            <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-xs font-display font-bold text-[#FAF6F0] block">
                  Groundbreaking Integrity Workflows
                </span>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Pre-flight check datasets for inverted Lat/Lon coordinates, or harmonize disparate field names across files before export.
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-3">
                <button
                  type="button"
                  onClick={onOpenSpatialDoctor}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border border-amber-600/50 text-xs font-semibold transition-all shadow-sm"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pre-Flight Doctor</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenSchemaHarmonizer}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-orange-950/50 hover:bg-orange-900/50 text-orange-300 border border-orange-600/50 text-xs font-semibold transition-all shadow-sm"
                >
                  <TableProperties className="w-3.5 h-3.5 text-orange-400" />
                  <span>Harmonizer {harmonizerRulesCount > 0 && `(${harmonizerRulesCount})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CRSModal
        isOpen={isCRSModalOpen}
        onClose={onCloseCRSModal}
        selectedCRS={settings.targetCRS}
        onSelectCRS={(crs) => setSettings(s => ({ ...s, targetCRS: crs.code }))}
      />
    </div>
  );
};
