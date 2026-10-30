/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Search, 
  Layers, 
  Calculator, 
  PieChart, 
  Globe, 
  FileBox, 
  Stethoscope, 
  TableProperties, 
  Award, 
  Terminal, 
  Map as MapIcon, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Copy, 
  Check, 
  Sliders,
  Play
} from 'lucide-react';
import { SpatialDataset, BatchSettings, ConsolidationSettings } from '../types/gis';
import { SurfaceUnit } from '../core/spatialAnalytics';
import { NavTab } from './Header';
import { useI18n } from '../core/i18n';

interface CraftStudioProps {
  datasets: SpatialDataset[];
  selectedDataset: SpatialDataset | null;
  onSelectDataset: (dataset: SpatialDataset) => void;
  setActiveTab: (tab: NavTab) => void;
  settings: BatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<BatchSettings>>;
  consolidationSettings: ConsolidationSettings;
  setConsolidationSettings: React.Dispatch<React.SetStateAction<ConsolidationSettings>>;
  onOpenSpatialDoctor: () => void;
  onOpenSchemaHarmonizer: () => void;
  onOpenAuditCertificate: () => void;
  onOpenPythonModal: () => void;
  onCalculateSurfaces: (unit: SurfaceUnit) => void;
  onOpenAggregationModal: () => void;
  onStartBatch: () => void;
  hasCertificate: boolean;
}

export const CraftStudio: React.FC<CraftStudioProps> = ({
  datasets,
  selectedDataset,
  onSelectDataset,
  setActiveTab,
  settings,
  setSettings,
  consolidationSettings,
  setConsolidationSettings,
  onOpenSpatialDoctor,
  onOpenSchemaHarmonizer,
  onOpenAuditCertificate,
  onOpenPythonModal,
  onCalculateSurfaces,
  onOpenAggregationModal,
  onStartBatch,
  hasCertificate,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleCopyCommand = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const currentDataset = selectedDataset || datasets[0] || null;

  interface CraftAction {
    id: string;
    title: string;
    category: 'analytics' | 'geodesy' | 'packaging' | 'quality' | 'map';
    description: string;
    icon: React.ElementType;
    badge: string;
    badgeColor: string;
    cliCommand?: string;
    actionLabel: string;
    onExecute: () => void;
  }

  const craftActions: CraftAction[] = [
    {
      id: 'surface-calc-ha',
      title: t.craft.calcHaTitle,
      category: 'analytics',
      description: t.craft.calcHaDesc,
      icon: Calculator,
      badge: 'Analytical Geometry',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      cliCommand: `python -c "import geopandas as gpd; gdf = gpd.read_file('input.geojson'); gdf['surface_ha'] = gdf.to_crs(6933).area / 10000; gdf.to_file('output.geojson', driver='GeoJSON')"`,
      actionLabel: t.craft.calcHaBtn,
      onExecute: () => {
        onCalculateSurfaces('ha');
        showToast(t.craft.calcHaToast);
      },
    },
    {
      id: 'surface-calc-m2',
      title: t.craft.calcM2Title,
      category: 'analytics',
      description: t.craft.calcM2Desc,
      icon: Calculator,
      badge: 'Metric Cadastre',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      cliCommand: `ogr2ogr -f "GeoJSON" output.geojson input.geojson -dialect sqlite -sql "SELECT *, ST_Area(ST_Transform(geometry, 3857)) as surface_m2 FROM input"`,
      actionLabel: t.craft.calcM2Btn,
      onExecute: () => {
        onCalculateSurfaces('m2');
        showToast(t.craft.calcM2Toast);
      },
    },
    {
      id: 'field-aggregation',
      title: t.craft.aggregateTitle,
      category: 'analytics',
      description: t.craft.aggregateDesc,
      icon: PieChart,
      badge: 'Field Intelligence',
      badgeColor: 'bg-orange-950 text-orange-300 border-orange-700/50',
      cliCommand: `python -c "import geopandas as gpd; gdf = gpd.read_file('input.geojson'); stats = gdf.groupby('zone')['surface_ha'].mean(); print(stats)"`,
      actionLabel: t.craft.aggregateBtn,
      onExecute: () => {
        onOpenAggregationModal();
      },
    },
    {
      id: 'reproject-wgs84',
      title: t.craft.reprojectWgs84Title,
      category: 'geodesy',
      description: t.craft.reprojectWgs84Desc,
      icon: Globe,
      badge: 'EPSG:4326',
      badgeColor: 'bg-stone-900 text-stone-200 border-stone-700',
      cliCommand: `ogr2ogr -f "GeoJSON" -t_srs "EPSG:4326" output_wgs84.geojson input.shp`,
      actionLabel: t.craft.reprojectWgs84Btn,
      onExecute: () => {
        setSettings(s => ({ ...s, targetCRS: 'EPSG:4326', crsMode: 'reproject' }));
        setActiveTab('lab');
        showToast(t.craft.reprojectWgs84Toast);
      },
    },
    {
      id: 'reproject-webmercator',
      title: t.craft.reprojectMercatorTitle,
      category: 'geodesy',
      description: t.craft.reprojectMercatorDesc,
      icon: Globe,
      badge: 'EPSG:3857',
      badgeColor: 'bg-stone-900 text-stone-200 border-stone-700',
      cliCommand: `ogr2ogr -f "GeoJSON" -t_srs "EPSG:3857" output_3857.geojson input.shp`,
      actionLabel: t.craft.reprojectMercatorBtn,
      onExecute: () => {
        setSettings(s => ({ ...s, targetCRS: 'EPSG:3857', crsMode: 'reproject' }));
        setActiveTab('lab');
        showToast(t.craft.reprojectMercatorToast);
      },
    },
    {
      id: 'consolidate-gpkg',
      title: t.craft.gpkgBundleTitle,
      category: 'packaging',
      description: t.craft.gpkgBundleDesc,
      icon: FileBox,
      badge: 'QGIS & ArcGIS Pro',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      cliCommand: `ogr2ogr -f "GPKG" -update -append consolidated.gpkg input1.geojson -nln layer_1`,
      actionLabel: t.craft.gpkgBundleBtn,
      onExecute: () => {
        setConsolidationSettings(s => ({ ...s, consolidateToSingleGeoPackage: true, generateQgisProject: true }));
        setSettings(s => ({ ...s, targetFormat: 'geopackage' }));
        setActiveTab('lab');
        showToast(t.craft.gpkgBundleToast);
      },
    },
    {
      id: 'shapefile-export',
      title: t.craft.shpTitle,
      category: 'packaging',
      description: t.craft.shpDesc,
      icon: FileBox,
      badge: 'Legacy Standard',
      badgeColor: 'bg-stone-900 text-stone-300 border-stone-700',
      cliCommand: `ogr2ogr -f "ESRI Shapefile" output_shp input.geojson`,
      actionLabel: t.craft.shpBtn,
      onExecute: () => {
        setSettings(s => ({ ...s, targetFormat: 'shapefile' }));
        setActiveTab('lab');
        showToast(t.craft.shpToast);
      },
    },
    {
      id: 'preflight-doctor',
      title: t.craft.doctorTitle,
      category: 'quality',
      description: t.craft.doctorDesc,
      icon: Stethoscope,
      badge: 'Integrity Audit',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      actionLabel: t.craft.doctorBtn,
      onExecute: () => {
        onOpenSpatialDoctor();
      },
    },
    {
      id: 'schema-harmonizer',
      title: t.craft.harmonizerTitle,
      category: 'quality',
      description: t.craft.harmonizerDesc,
      icon: TableProperties,
      badge: 'Schema Harmonizer',
      badgeColor: 'bg-orange-950 text-orange-300 border-orange-700/50',
      actionLabel: t.craft.harmonizerBtn,
      onExecute: () => {
        onOpenSchemaHarmonizer();
      },
    },
    {
      id: 'audit-certificate',
      title: t.craft.certTitle,
      category: 'quality',
      description: t.craft.certDesc,
      icon: Award,
      badge: 'ISO / OGC Certified',
      badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-700/50',
      actionLabel: hasCertificate ? t.craft.certBtnView : t.craft.certBtnRun,
      onExecute: () => {
        if (hasCertificate) {
          onOpenAuditCertificate();
        } else {
          setActiveTab('workspace');
          showToast(t.craft.certToast);
        }
      },
    },
    {
      id: 'map-studio-inspect',
      title: t.craft.mapStudioTitle,
      category: 'map',
      description: t.craft.mapStudioDesc,
      icon: MapIcon,
      badge: 'Cartography',
      badgeColor: 'bg-stone-900 text-stone-200 border-stone-700',
      actionLabel: t.craft.mapStudioBtn,
      onExecute: () => {
        setActiveTab('map');
      },
    },
    {
      id: 'desktop-app-export',
      title: t.craft.desktopTitle,
      category: 'quality',
      description: t.craft.desktopDesc,
      icon: Terminal,
      badge: 'Desktop x64',
      badgeColor: 'bg-stone-900 text-stone-300 border-stone-700',
      actionLabel: t.craft.desktopBtn,
      onExecute: () => {
        onOpenPythonModal();
      },
    },
  ];

  const categories = [
    { id: 'all', label: t.craft.allCrafts },
    { id: 'analytics', label: t.craft.catAnalytics },
    { id: 'geodesy', label: t.craft.catGeodesy },
    { id: 'packaging', label: t.craft.catPackaging },
    { id: 'quality', label: t.craft.catQuality },
    { id: 'map', label: t.craft.catMap },
  ];

  const filteredActions = craftActions.filter(action => {
    const matchesCategory = selectedCategory === 'all' || action.category === selectedCategory;
    const matchesSearch = 
      action.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.badge.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.75rem)] overflow-y-auto bg-[#13110E] p-6 text-[#F5EBE1]">
      <div className="max-w-6xl mx-auto w-full space-y-7">
        
        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#1D1714] border border-amber-500/70 text-amber-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 animate-in slide-in-from-bottom duration-200">
            <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs font-medium font-sans">{toastMsg}</span>
          </div>
        )}

        {/* Hero "What do you want to craft?" Section */}
        <div className="relative rounded-3xl p-8 bg-gradient-to-br from-[#1C1713] via-[#16120F] to-[#120E0C] border border-amber-600/30 shadow-2xl overflow-hidden">
          {/* Subtle Ambient Cartographic Grid Lines */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#F59E0B_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-600/40 text-amber-300 text-xs font-mono font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.craft.heroBadge}</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-display font-extrabold text-[#FAF6F0] tracking-tight">
              {t.craft.heroTitlePrefix}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-orange-400">
                {t.craft.heroTitleCraft}
              </span>{' '}
              {t.craft.heroTitleSuffix}
            </h1>

            <p className="text-stone-300 text-sm font-sans leading-relaxed">
              {t.craft.heroSubtitle}
            </p>

            {/* Active Dataset Selector Context */}
            {datasets.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-stone-400 font-sans">{t.craft.targetDataset}:</span>
                <select
                  value={currentDataset?.id || ''}
                  onChange={(e) => {
                    const ds = datasets.find(d => d.id === e.target.value);
                    if (ds) onSelectDataset(ds);
                  }}
                  className="bg-[#241D18] border border-stone-700/80 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {datasets.map(d => (
                    <option key={d.id} value={d.id} className="bg-stone-900 text-stone-100">
                      {d.name} ({d.geometryType} · {d.featureCount} {t.common.features})
                    </option>
                  ))}
                </select>
                <span className="text-stone-500 text-[11px] font-mono">
                  CRS: {currentDataset?.detectedCRS?.code || 'WGS84'}
                </span>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative mt-6 max-w-xl">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t.craft.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#13110E]/90 border border-stone-700/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/40 shadow-inner"
            />
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                selectedCategory === c.id
                  ? 'bg-amber-600 text-stone-950 font-bold shadow-md shadow-amber-950/30'
                  : 'bg-[#1C1714] text-stone-400 hover:text-stone-200 hover:bg-[#251E19] border border-stone-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActions.map(action => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                className="group relative rounded-2xl p-5 bg-[#181411] border border-stone-800/80 hover:border-amber-500/50 hover:bg-[#201A16] transition-all duration-200 flex flex-col justify-between shadow-lg hover:shadow-amber-950/20"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${action.badgeColor}`}>
                      {action.badge}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-sm text-[#FAF6F0] group-hover:text-amber-200 transition-colors mb-1.5">
                    {action.title}
                  </h3>

                  <p className="text-xs text-stone-400 font-sans leading-relaxed mb-4">
                    {action.description}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-stone-800/80">
                  {/* CLI Command snippet toggle/copy if available */}
                  {action.cliCommand && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#110E0C] border border-stone-800 font-mono text-[10px] text-stone-400">
                      <span className="truncate max-w-[200px]">{action.cliCommand}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCommand(action.cliCommand!, action.id);
                        }}
                        className="ml-1 text-stone-400 hover:text-amber-300 p-1 rounded"
                        title="Copy command to clipboard"
                      >
                        {copiedCmd === action.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={action.onExecute}
                    className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-[#241E19] hover:bg-amber-600 group-hover:bg-amber-600/90 text-stone-200 group-hover:text-stone-950 font-display font-bold text-xs transition-all shadow-sm"
                  >
                    <span>{action.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Section: Quick Command Cheatsheet & Terminal Reference */}
        <div className="rounded-2xl p-5 bg-[#15120F] border border-stone-800 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <span className="font-display font-bold text-stone-200 text-xs flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>{t.craft.shortcutsTitle}</span>
            </span>
            <span className="text-[11px] text-stone-500">{t.craft.shortcutsSub}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div className="p-2.5 rounded-xl bg-[#1A1613] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">⌘K / Ctrl+K</span>
              <span className="text-stone-400 font-sans">{t.craft.scPalette}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#1A1613] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Surface Columns</span>
              <span className="text-stone-400 font-sans">{t.craft.scSurface}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#1A1613] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Field Aggregations</span>
              <span className="text-stone-400 font-sans">{t.craft.scAgg}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#1A1613] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Interactive Legend</span>
              <span className="text-stone-400 font-sans">{t.craft.scLegend}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
