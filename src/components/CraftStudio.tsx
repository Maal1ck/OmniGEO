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
  Play,
  Database,
  GitMerge
} from 'lucide-react';
import { SpatialDataset, BatchSettings, ConsolidationSettings } from '../types/gis';
import { SurfaceUnit } from '../core/spatialAnalytics';
import { NavTab } from './Header';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';
import { ContourField } from './ContourField';

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
  onOpenConcatenationModal?: () => void;
  onOpenPostgisModal?: () => void;
  onOpenJoinModal?: () => void;
  onOpenPostgresReport?: () => void;
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
  onOpenConcatenationModal,
  onOpenPostgisModal,
  onOpenJoinModal,
  onOpenPostgresReport,
}) => {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
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
      id: 'concatenate-layers',
      title: 'Concatenate Layers with Column Mapping',
      category: 'packaging',
      description: 'Merge multiple vector layers into a single harmonized dataset with custom attribute mapping and CRS alignment.',
      icon: Layers,
      badge: 'Multi-Layer Fusion',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      actionLabel: 'Open Concatenation Studio',
      onExecute: () => {
        if (onOpenConcatenationModal) {
          onOpenConcatenationModal();
        } else {
          setActiveTab('workspace');
        }
      },
    },
    {
      id: 'postgis-integration',
      title: 'PostgreSQL / PostGIS Exporter & Pipeline',
      category: 'packaging',
      description: 'Generate automated SQL schema, typed geometries, GIST indexing, and copyable psql / ogr2ogr CLI ingestion pipelines.',
      icon: Database,
      badge: 'PostGIS 3.x Spatial',
      badgeColor: 'bg-indigo-950 text-indigo-300 border-indigo-700/50',
      cliCommand: 'ogr2ogr -f "PostgreSQL" PG:"dbname=gisdb user=postgres" input.geojson -nln target_table',
      actionLabel: 'Open PostGIS Assistant',
      onExecute: () => {
        if (onOpenPostgisModal) {
          onOpenPostgisModal();
        } else {
          setActiveTab('workspace');
        }
      },
    },
    {
      id: 'spatial-attribute-join',
      title: lang === 'fr' ? 'Jointures Spatiales et Attributaires' : lang === 'ar' ? 'الربط المكاني والجدولي' : 'Spatial & Attribute Join Studio',
      category: 'analytics',
      description: lang === 'fr'
        ? 'Associez des données tabulaires par identifiant commun ou enrichissez vos entités par intersection/inclusion spatiale.'
        : 'Join tabular data by common key ID, or enrich entities through geometric overlay predicates (intersects, within, contains).',
      icon: GitMerge,
      badge: 'Relational & Spatial Joins',
      badgeColor: 'bg-purple-950 text-purple-300 border-purple-700/50',
      cliCommand: 'python -c "import geopandas as gpd; parcels = gpd.read_file(\'parcels.geojson\'); owners = gpd.read_file(\'owners.csv\'); joined = parcels.merge(owners, on=\'parcel_id\'); joined.to_file(\'joined.geojson\', driver=\'GeoJSON\')"',
      actionLabel: lang === 'fr' ? 'Ouvrir le Studio de Jointure' : 'Open Join Studio',
      onExecute: () => {
        if (onOpenJoinModal) {
          onOpenJoinModal();
        } else {
          setActiveTab('workspace');
        }
      },
    },
    {
      id: 'postgres-global-report',
      title: lang === 'fr' ? 'Rapport Global Base de Données PostgreSQL' : 'Global PostgreSQL Database Architecture Report',
      category: 'packaging',
      description: lang === 'fr'
        ? 'Générez un dictionnaire de données complet en HTML interactif : tables, volumétries, relations de clés étrangères et types de champs.'
        : 'Generate a complete standalone HTML database report: tables catalog, foreign key relationships, row counts, and data types.',
      icon: TableProperties,
      badge: 'Database Architecture Report',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      actionLabel: lang === 'fr' ? 'Générer le Rapport HTML' : 'Generate HTML Report',
      onExecute: () => {
        if (onOpenPostgresReport) {
          onOpenPostgresReport();
        } else {
          setActiveTab('workspace');
        }
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
      id: 'website-showcase',
      title: lang === 'fr' ? 'Site Web Officiel & Présentation du Produit' : 'Official Product Website & Presentation',
      category: 'quality',
      description: lang === 'fr' ? 'Découvrez la présentation complète d\'OmniGeo par Maodo et explorez toutes ses fonctionnalités géospatiales.' : 'Explore the comprehensive OmniGeo by Maodo interactive product showcase, architecture, and geodetic features.',
      icon: Globe,
      badge: 'Product Tour',
      badgeColor: 'bg-amber-950 text-amber-300 border-amber-700/50',
      actionLabel: lang === 'fr' ? 'Voir le Site' : 'Explore Website',
      onExecute: () => {
        setActiveTab('showcase');
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
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto bg-[var(--og-bg)] p-6 lg:p-8 text-[var(--og-fg)]">
      <div className="max-w-[1180px] mx-auto w-full space-y-7">
        
        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#131E1C] border border-amber-500/70 text-amber-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2.5 animate-in slide-in-from-bottom duration-200">
            <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs font-medium font-sans">{toastMsg}</span>
          </div>
        )}

        {/* Hero: survey desk */}
        <section className="relative overflow-hidden rounded-[22px] border border-[var(--og-line)] bg-[var(--og-surface)] shadow-[var(--og-shadow)]">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] items-center gap-2">
            <div className="relative z-10 p-8 lg:p-10 space-y-5">
              <span className="og-eyebrow !text-[var(--og-accent)] flex items-center gap-2">
                <span className="h-px w-6 bg-[var(--og-accent)]" />{t.shell.heroKicker}
              </span>
              <h1 className="text-[36px] md:text-[44px] leading-[1.04] font-display font-extrabold tracking-[-0.035em] [text-wrap:balance] text-[var(--og-fg)]">
                {t.craft.heroTitlePrefix}
                <span className="font-serif-accent text-[var(--og-accent)]">{t.craft.heroTitleCraft}</span>
                {t.craft.heroTitleSuffix}
              </h1>
              <p className="max-w-md text-[15px] leading-relaxed text-[var(--og-fg-2)]">{t.shell.heroLead}</p>

              {datasets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--og-fg-3)]">{t.craft.targetDataset}</span>
                  <select
                    value={currentDataset?.id || ''}
                    onChange={(e) => { const ds = datasets.find(d => d.id === e.target.value); if (ds) onSelectDataset(ds); }}
                    className="rounded-lg border border-[var(--og-line-strong)] bg-[var(--og-surface-2)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[var(--og-fg)] focus:outline-none focus:border-[var(--og-accent)] cursor-pointer"
                  >
                    {datasets.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.geometryType} · {d.featureCount} {t.common.features})</option>
                    ))}
                  </select>
                  <span className="font-mono text-[11px] text-[var(--og-fg-3)]">CRS: {currentDataset?.detectedCRS?.code || 'WGS84'}</span>
                </div>
              )}

              <div className="relative max-w-md">
                <Search className="w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--og-fg-3)]" />
                <input
                  type="text"
                  placeholder={t.craft.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--og-line-strong)] bg-[var(--og-bg)] ps-10 pe-4 py-3 text-[13px] text-[var(--og-fg)] placeholder:text-[var(--og-fg-3)] focus:outline-none focus:border-[var(--og-accent)]"
                />
              </div>
            </div>
            <div className="relative hidden lg:block pe-6 py-6"><ContourField /></div>
          </div>

          {/* Pipeline quick-start */}
          <ol className="grid grid-cols-2 lg:grid-cols-4 border-t border-[var(--og-line)] divide-x divide-[var(--og-line)] rtl:divide-x-reverse">
            {([
              { tab: 'workspace', n: '01', title: t.shell.stepImport, desc: t.shell.stepImportDesc, done: datasets.length > 0 },
              { tab: 'lab', n: '02', title: t.shell.stepConfigure, desc: t.shell.stepConfigureDesc, done: false },
              { tab: 'map', n: '03', title: t.shell.stepInspect, desc: t.shell.stepInspectDesc, done: false },
              { tab: 'monitor', n: '04', title: t.shell.stepRun, desc: t.shell.stepRunDesc, done: false },
            ] as Array<{ tab: NavTab; n: string; title: string; desc: string; done: boolean }>).map((s, i, arr) => {
              const isNext = !s.done && arr.slice(0, i).every(x => x.done || x.tab !== 'workspace');
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(s.tab)}
                    className="group flex h-full w-full flex-col gap-1.5 p-4 text-start transition-colors hover:bg-[var(--og-surface-2)]"
                  >
                    <span className="flex items-center gap-2 font-mono text-[11px] tracking-widest">
                      <span className={s.done ? 'text-[var(--og-ok)]' : 'text-[var(--og-accent)]'}>{s.n}</span>
                      <span className="font-display text-[13px] font-semibold tracking-normal text-[var(--og-fg)]">{s.title}</span>
                      {s.done && <Check className="h-3.5 w-3.5 text-[var(--og-ok)]" />}
                      {!s.done && i === 0 && <span className="ms-auto og-kbd">{t.shell.stepNext}</span>}
                    </span>
                    <span className="text-xs leading-snug text-[var(--og-fg-3)]">{s.desc}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Category tabs */}
        <div role="tablist" className="flex items-center gap-6 overflow-x-auto border-b border-[var(--og-line)] text-[13px]">
          {categories.map(c => {
            const active = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(c.id)}
                className={`relative whitespace-nowrap pb-3 pt-1 font-medium transition-colors ${active ? 'text-[var(--og-fg)]' : 'text-[var(--og-fg-3)] hover:text-[var(--og-fg-2)]'}`}
              >
                {c.label}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[var(--og-accent)]" />}
              </button>
            );
          })}
          <span className="ms-auto pb-3 og-eyebrow shrink-0">{filteredActions.length} {t.shell.crafts}</span>
        </div>

        {/* Recipe plates */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <article key={action.id} className="og-plate">
                <header className="flex items-center justify-between gap-3">
                  <span className="og-eyebrow !text-[var(--og-accent)]">{String(idx + 1).padStart(2, '0')} · {action.badge}</span>
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--og-fg-3)]" />
                </header>

                <h3 className="mt-4 font-display text-[16px] font-bold leading-snug tracking-[-0.025em] text-[var(--og-fg)]">{action.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--og-fg-2)]">{action.description}</p>

                <footer className="mt-auto pt-5 space-y-3">
                  {action.cliCommand && (
                    <div className="flex items-center justify-between rounded-lg border border-[var(--og-line)] bg-[var(--og-bg)] ps-2.5 pe-1 py-1 font-mono text-[10.5px] text-[var(--og-fg-3)]">
                      <span className="truncate" dir="ltr">{action.cliCommand}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyCommand(action.cliCommand!, action.id); }}
                        className="ms-1 rounded p-1.5 text-[var(--og-fg-3)] hover:text-[var(--og-accent)]"
                        title="Copy command to clipboard"
                        aria-label="Copy command"
                      >
                        {copiedCmd === action.id ? <Check className="h-3 w-3 text-[var(--og-ok)]" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={action.onExecute}
                    className="og-plate-go flex w-full items-center gap-2 border-t border-[var(--og-line)] pt-3 text-start font-display text-[13px] font-semibold text-[var(--og-fg)]"
                  >
                    <span className="flex-1">{action.actionLabel}</span>
                    <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                </footer>
              </article>
            );
          })}
        </div>

        {/* Bottom Section: Quick Command Cheatsheet & Terminal Reference */}
        <div className="rounded-2xl p-5 bg-[#0E1614] border border-stone-800 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <span className="font-display font-bold text-stone-200 text-xs flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>{t.craft.shortcutsTitle}</span>
            </span>
            <span className="text-[11px] text-stone-500">{t.craft.shortcutsSub}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div className="p-2.5 rounded-xl bg-[#121B19] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">⌘K / Ctrl+K</span>
              <span className="text-stone-400 font-sans">{t.craft.scPalette}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#121B19] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Surface Columns</span>
              <span className="text-stone-400 font-sans">{t.craft.scSurface}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#121B19] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Field Aggregations</span>
              <span className="text-stone-400 font-sans">{t.craft.scAgg}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#121B19] border border-stone-800/80">
              <span className="text-amber-400 font-bold block mb-0.5">Interactive Legend</span>
              <span className="text-stone-400 font-sans">{t.craft.scLegend}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
