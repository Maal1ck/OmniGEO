import React, { useState, useMemo } from 'react';
import { 
  Database, 
  X, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  Code2, 
  Layers, 
  CheckCircle2, 
  ExternalLink,
  Sliders,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  Play,
  Search,
  Globe,
  ChevronDown,
  TableProperties
} from 'lucide-react';
import { SpatialDataset, CRSInfo } from '../types/gis';
import { 
  generatePostgisSql, 
  generatePsqlCommand, 
  generateOgr2ogrCommand, 
  generatePythonScript, 
  extractSRID,
  PostgisExportOptions 
} from '../core/postgisExporter';
import { searchCRS, getCRSByCode } from '../core/crsDefinitions';
import { useTheme } from '../core/theme';

interface PostgisModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  defaultDatasetId?: string | null;
  onOpenPostgresReport?: () => void;
}

export const PostgisModal: React.FC<PostgisModalProps> = ({
  isOpen,
  onClose,
  datasets,
  defaultDatasetId,
  onOpenPostgresReport,
}) => {
  const { theme } = useTheme();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => {
    if (defaultDatasetId && datasets.some(d => d.id === defaultDatasetId)) {
      return defaultDatasetId;
    }
    return datasets[0]?.id || '';
  });

  const activeDataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];

  const [activeTab, setActiveTab] = useState<'pgadmin' | 'sql' | 'cli' | 'python'>('pgadmin');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Configuration options
  const [schemaName, setSchemaName] = useState<string>('public');
  const [tableName, setTableName] = useState<string>(() => activeDataset ? activeDataset.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'omni_features');
  const [geomColumnName, setGeomColumnName] = useState<string>('geom');
  const [srid, setSrid] = useState<number>(() => activeDataset ? extractSRID(activeDataset) : 4326);
  const [dropTable, setDropTable] = useState<boolean>(true);
  const [createSpatialIndex, setCreateSpatialIndex] = useState<boolean>(true);

  // Connection parameters
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<number>(5432);
  const [database, setDatabase] = useState<string>('gisdb');
  const [username, setUsername] = useState<string>('postgres');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Searchable CRS Catalog state (All 6,900+ EPSG CRS)
  const [isCrsSearchOpen, setIsCrsSearchOpen] = useState<boolean>(false);
  const [crsQuery, setCrsQuery] = useState<string>('');

  const currentCrsInfo = useMemo(() => {
    return getCRSByCode(`EPSG:${srid}`);
  }, [srid]);

  const matchingCrsList = useMemo(() => {
    return searchCRS(crsQuery).slice(0, 100);
  }, [crsQuery]);

  // Update table name and SRID if dataset changes
  React.useEffect(() => {
    if (activeDataset) {
      setTableName(activeDataset.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      setSrid(extractSRID(activeDataset));
    }
  }, [activeDataset?.id]);

  const options: PostgisExportOptions = useMemo(() => ({
    schemaName,
    tableName,
    geomColumnName,
    srid,
    dropTableIfExists: dropTable,
    createSpatialIndex,
    batchSize: 100,
    host,
    port,
    database,
    username,
    password: password.trim() ? password : undefined,
  }), [schemaName, tableName, geomColumnName, srid, dropTable, createSpatialIndex, host, port, database, username, password]);

  const generatedSql = useMemo(() => {
    if (!activeDataset) return '';
    return generatePostgisSql(activeDataset, options);
  }, [activeDataset, options]);

  const psqlSnippet = useMemo(() => {
    return generatePsqlCommand(options, `${tableName}.sql`);
  }, [options, tableName]);

  const ogr2ogrSnippet = useMemo(() => {
    const fileName = activeDataset ? activeDataset.originalFileName : 'features.geojson';
    return generateOgr2ogrCommand(tableName, options, fileName);
  }, [activeDataset, options, tableName]);

  const pythonSnippet = useMemo(() => {
    if (!activeDataset) return '';
    return generatePythonScript(activeDataset, options);
  }, [activeDataset, options]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleDownloadSql = () => {
    if (!generatedSql) return;
    const blob = new Blob([generatedSql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName || 'omni_features'}_postgis.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          theme === 'light'
            ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-900 shadow-stone-500/20'
            : 'bg-[#181411] border-stone-800 text-stone-100 shadow-stone-950/80'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          theme === 'light' ? 'border-[#EBE5DC] bg-white' : 'border-stone-800/80 bg-[#1F1915]'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl ${
              theme === 'light' ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-700/40'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-display font-bold flex items-center gap-2">
                <span>PostgreSQL / PostGIS Integration Assistant</span>
                <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  PostGIS 3.x Ready
                </span>
              </h2>
              <p className={`text-xs ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                Export geospatial layers directly into PostgreSQL with automated spatial schemas, GIST indexing, and command pipelines.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenPostgresReport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPostgresReport();
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                    : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-700/50 shadow-2xs'
                }`}
                title="Open Global PostgreSQL Database Architecture Report"
              >
                <TableProperties className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Rapport Global DB (HTML)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                theme === 'light' ? 'hover:bg-stone-200 text-stone-600' : 'hover:bg-stone-800 text-stone-400'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Layer Selector */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl border bg-stone-500/5 border-stone-500/20">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold">Source Layer:</span>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border font-mono ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.featureCount} feats · {d.detectedCRS?.code || 'CRS?'})
                  </option>
                ))}
              </select>
            </div>

            {activeDataset && (
              <div className="text-xs font-mono text-stone-500">
                <span>{activeDataset.featureCount} records</span>
                <span className="mx-2">·</span>
                <span>Type: <strong>{activeDataset.geometryType}</strong></span>
                <span className="mx-2">·</span>
                <span>SRID: <strong>{srid}</strong></span>
              </div>
            )}
          </div>

          {/* Configuration Form */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-mono uppercase font-bold text-stone-500 block mb-1">
                Schema Name
              </label>
              <input
                type="text"
                value={schemaName}
                onChange={(e) => setSchemaName(e.target.value)}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase font-bold text-stone-500 block mb-1">
                Target Table Name
              </label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase font-bold text-stone-500 block mb-1">
                Geometry Column
              </label>
              <input
                type="text"
                value={geomColumnName}
                onChange={(e) => setGeomColumnName(e.target.value)}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono uppercase font-bold text-stone-500">
                  EPSG / SRID
                </label>
                <button
                  type="button"
                  onClick={() => setIsCrsSearchOpen(true)}
                  className="text-[10px] font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center space-x-0.5"
                >
                  <Search className="w-3 h-3 inline mr-0.5" />
                  <span>Search 6,900+</span>
                </button>
              </div>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  value={srid}
                  onChange={(e) => setSrid(parseInt(e.target.value, 10) || 4326)}
                  className={`w-20 px-2 py-1.5 text-xs font-mono rounded-lg border font-bold text-center ${
                    theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                  }`}
                  title="Direct numeric EPSG code"
                />
                <button
                  type="button"
                  onClick={() => setIsCrsSearchOpen(true)}
                  className={`flex-1 flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                    theme === 'light'
                      ? 'bg-white border-[#D6CEBE] text-stone-800 hover:bg-stone-50 hover:border-amber-400'
                      : 'bg-[#120F0D] border-stone-700 text-stone-200 hover:bg-stone-800 hover:border-amber-500'
                  }`}
                  title="Search from all 6,900+ EPSG CRS database"
                >
                  <span className="truncate max-w-[130px] sm:max-w-[160px] font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    {currentCrsInfo ? currentCrsInfo.name : `EPSG:${srid}`}
                  </span>
                  <Search className="w-3.5 h-3.5 text-stone-400 shrink-0 ml-1" />
                </button>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dropTable}
                onChange={(e) => setDropTable(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span>Drop table if exists (<code className="font-mono text-[10px]">DROP TABLE CASCADE</code>)</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createSpatialIndex}
                onChange={(e) => setCreateSpatialIndex(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span>Generate GIST spatial index (<code className="font-mono text-[10px]">USING GIST (geom)</code>)</span>
            </label>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('pgadmin')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'pgadmin'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Database className="w-4 h-4 text-amber-500" />
              <span>pgAdmin 4 Workflow</span>
            </button>
            <button
              onClick={() => setActiveTab('sql')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'sql'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>PostGIS SQL Script (.sql)</span>
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'cli'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>CLI Pipelines (psql & ogr2ogr)</span>
            </button>
            <button
              onClick={() => setActiveTab('python')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'python'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Python (GeoPandas & SQLAlchemy)</span>
            </button>
          </div>

          {/* Tab 0: pgAdmin 4 Workflow & Security Explanation */}
          {activeTab === 'pgadmin' && (
            <div className="space-y-4">
              {/* Security architecture card explaining why passwords are not requested by the web app */}
              <div className={`p-4 rounded-xl border ${
                theme === 'light'
                  ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                  : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
              }`}>
                <div className="flex items-start space-x-3">
                  <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-sm flex items-center space-x-2">
                      <span>Why doesn&apos;t OmniGeo ask for your pgAdmin password?</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        Zero-Trust Security
                      </span>
                    </div>
                    <p className="leading-relaxed opacity-90">
                      OmniGeo operates <strong>100% client-side in your browser</strong>. Web browsers are strictly prevented from opening raw TCP socket connections to local or remote PostgreSQL servers on port 5432, and web applications should <strong>never</strong> intercept or store your pgAdmin master password or database credentials.
                    </p>
                    <div className="pt-1 text-[11px] font-mono opacity-85 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <strong>pgAdmin Master Password:</strong> Unlocks your local pgAdmin GUI app and saved connection vault on your machine.
                      </div>
                      <div>
                        <strong>PostgreSQL User Password:</strong> Authenticates the database user (e.g., <code className="font-bold">postgres</code>) directly inside pgAdmin or CLI.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step-by-step pgAdmin import guide */}
              <div className="space-y-3">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500 flex items-center justify-between">
                  <span>How to Import into pgAdmin in 3 Simple Clicks</span>
                  <span className="text-[11px] font-normal normal-case text-amber-600 dark:text-amber-400">
                    No command line required
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Step 1 */}
                  <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#14100E] border-stone-800'
                  }`}>
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs flex items-center justify-center">1</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">Open Query Tool</span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 text-[11px] leading-relaxed">
                        Launch <strong>pgAdmin 4</strong> and unlock your server with your master password. Right-click your target database (e.g. <code className="font-mono text-amber-600 dark:text-amber-400">{database}</code>) and choose <strong>Query Tool</strong>.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-stone-200 dark:border-stone-800 text-[10px] font-mono text-stone-400">
                      Menu: Tools &gt; Query Tool
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#14100E] border-stone-800'
                  }`}>
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs flex items-center justify-center">2</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">Load the SQL Script</span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 text-[11px] leading-relaxed">
                        In pgAdmin&apos;s Query Tool, click the <strong>Open File</strong> icon or paste the SQL from OmniGeo. The script contains the table schema, SRID {srid} validation, and geometries.
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-stone-200 dark:border-stone-800">
                      <button
                        onClick={handleDownloadSql}
                        className="w-full py-1 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] flex items-center justify-center space-x-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download {tableName}.sql</span>
                      </button>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#14100E] border-stone-800'
                  }`}>
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs flex items-center justify-center">3</span>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">Execute & Visualize</span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 text-[11px] leading-relaxed">
                        Press <strong>Execute (F5)</strong>. PostGIS creates <code className="font-mono text-amber-600 dark:text-amber-400">{schemaName}.{tableName}</code> with {createSpatialIndex ? 'a GIST spatial index' : 'features'}. Click the eye icon next to the <code className="font-mono">geom</code> column to view geometries on pgAdmin&apos;s map!
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-stone-200 dark:border-stone-800">
                      <button
                        onClick={() => copyToClipboard(generatedSql, 'sql')}
                        className={`w-full py-1 px-2 rounded-lg border font-semibold text-[11px] flex items-center justify-center space-x-1 ${
                          copiedSection === 'sql'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : theme === 'light' ? 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300' : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                        }`}
                      >
                        {copiedSection === 'sql' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSection === 'sql' ? 'Copied SQL!' : 'Copy SQL Directly'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SQL Preview collapse/peek */}
              <div className={`p-3.5 rounded-xl border ${
                theme === 'light' ? 'bg-stone-50/80 border-[#E2DBD0]' : 'bg-[#100D0B] border-stone-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold uppercase text-stone-500">
                    SQL Preview for pgAdmin ({activeDataset?.featureCount || 0} features)
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    Standard PostGIS DDL & INSERT
                  </span>
                </div>
                <div className={`p-3 rounded-lg font-mono text-xs max-h-40 overflow-y-auto border whitespace-pre select-all ${
                  theme === 'light' ? 'bg-white border-stone-200 text-stone-800' : 'bg-black border-stone-800 text-stone-300'
                }`}>
                  {generatedSql.split('\n').slice(0, 20).join('\n')}
                  {generatedSql.split('\n').length > 20 && `\n-- ... and ${generatedSql.split('\n').length - 20} more lines`}
                </div>
              </div>
            </div>
          )}

          {/* Tab 1: SQL Dump */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-stone-500">
                  Ready-to-execute PostGIS script with DDL, constraints, and batched inserts.
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(generatedSql, 'sql')}
                    className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      copiedSection === 'sql'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-800 hover:bg-stone-100' : 'bg-[#201A16] border-stone-700 text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {copiedSection === 'sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'sql' ? 'Copied SQL!' : 'Copy SQL Script'}</span>
                  </button>
                  <button
                    onClick={handleDownloadSql}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .sql File</span>
                  </button>
                </div>
              </div>

              <div className={`p-4 rounded-xl font-mono text-xs max-h-72 overflow-y-auto border whitespace-pre select-all ${
                theme === 'light'
                  ? 'bg-white border-[#E2DBD0] text-stone-800'
                  : 'bg-[#100D0B] border-stone-800 text-stone-300'
              }`}>
                {generatedSql}
              </div>
            </div>
          )}

          {/* Tab 2: CLI Pipelines */}
          {activeTab === 'cli' && (
            <div className="space-y-4">
              {/* Connection Host/Port Config with optional Password */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-xl border bg-stone-500/5 border-stone-500/20 text-xs">
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Host</span>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Port</span>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value, 10) || 5432)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Database</span>
                  <input
                    type="text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Username</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Password (Optional)</span>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 pr-6 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* psql snippet */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500">
                    Option A: Execute SQL Dump via psql CLI
                  </span>
                  <button
                    onClick={() => copyToClipboard(psqlSnippet, 'psql')}
                    className="text-xs font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center space-x-1"
                  >
                    {copiedSection === 'psql' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSection === 'psql' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className={`p-3 rounded-xl font-mono text-xs border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#100D0B] border-stone-800'
                }`}>
                  {psqlSnippet}
                </div>
              </div>

              {/* ogr2ogr snippet */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500">
                    Option B: Stream directly via GDAL ogr2ogr Pipeline
                  </span>
                  <button
                    onClick={() => copyToClipboard(ogr2ogrSnippet, 'ogr2ogr')}
                    className="text-xs font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center space-x-1"
                  >
                    {copiedSection === 'ogr2ogr' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSection === 'ogr2ogr' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className={`p-3 rounded-xl font-mono text-xs border overflow-x-auto whitespace-pre ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#100D0B] border-stone-800'
                }`}>
                  {ogr2ogrSnippet}
                </div>
              </div>

              {/* Docker quickstart */}
              <div className="p-3 rounded-xl border border-dashed border-stone-400/40 text-xs">
                <div className="font-bold flex items-center space-x-1.5 text-stone-600 dark:text-stone-300 mb-1">
                  <Terminal className="w-3.5 h-3.5 text-amber-500" />
                  <span>Need a local PostGIS instance? Run this Docker container:</span>
                </div>
                <code className="font-mono text-[11px] block text-amber-700 dark:text-amber-400 select-all">
                  docker run --name postgis -p 5432:5432 -e POSTGRES_PASSWORD=postgres -d postgis/postgis:16-3.4
                </code>
              </div>
            </div>
          )}

          {/* Tab 3: Python GeoPandas Script */}
          {activeTab === 'python' && (
            <div className="space-y-4">
              {/* Optional connection bar in python tab as well */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-xl border bg-stone-500/5 border-stone-500/20 text-xs">
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Host</span>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Port</span>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value, 10) || 5432)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Database</span>
                  <input
                    type="text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Username</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-stone-500 font-mono text-[10px] uppercase block">Password (Optional)</span>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent border-b border-stone-400 font-mono py-0.5 pr-6 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-stone-500">
                    Ready-to-run Python automated script using GeoPandas & SQLAlchemy:
                  </span>
                  <button
                    onClick={() => copyToClipboard(pythonSnippet, 'python')}
                    className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      copiedSection === 'python'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-800 hover:bg-stone-100' : 'bg-[#201A16] border-stone-700 text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    {copiedSection === 'python' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'python' ? 'Copied Python Script!' : 'Copy Python Code'}</span>
                  </button>
                </div>

                <div className={`p-4 rounded-xl font-mono text-xs max-h-72 overflow-y-auto border whitespace-pre select-all ${
                  theme === 'light'
                    ? 'bg-white border-[#E2DBD0] text-stone-800'
                    : 'bg-[#100D0B] border-stone-800 text-stone-300'
                }`}>
                  {pythonSnippet}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'border-[#EBE5DC] bg-[#FAF8F5]' : 'border-stone-800 bg-[#1A1512]'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            Exporting <strong>{tableName}</strong> to PostGIS ({activeDataset?.featureCount || 0} features)
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-700 hover:bg-stone-100' : 'bg-[#201A16] border-stone-700 text-stone-300 hover:bg-stone-800'
            }`}
          >
            Close
          </button>
        </div>
      </div>

      {/* Complete 6,942 EPSG CRS Search Modal Dialog */}
      {isCrsSearchOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-150">
          <div 
            className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-colors ${
              theme === 'light'
                ? 'bg-[#FAF8F5] border-[#D6CEBE] text-stone-900'
                : 'bg-[#181411] border-stone-700 text-[#FAF6F0]'
            }`}
          >
            {/* Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              theme === 'light' ? 'border-[#E2DBD0] bg-[#F2ECE3]' : 'border-stone-800 bg-[#14100D]'
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm">
                    Select PostGIS Target SRID / CRS
                  </h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    Search 6,942 EPSG coordinate reference systems in embedded registry
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCrsSearchOpen(false)}
                className={`p-1.5 rounded-lg transition-colors ${
                  theme === 'light' ? 'text-stone-500 hover:bg-stone-200 text-stone-800' : 'text-stone-400 hover:bg-stone-800 text-stone-200'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className={`p-4 border-b space-y-3 ${
              theme === 'light' ? 'border-[#E2DBD0] bg-white' : 'border-stone-800 bg-[#120F0D]'
            }`}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  autoFocus
                  value={crsQuery}
                  onChange={(e) => setCrsQuery(e.target.value)}
                  placeholder="Search by EPSG (4261, 26192, 4326, 2154), name (Merchich, Lambert, UTM), or area..."
                  className={`w-full pl-9 pr-8 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    theme === 'light'
                      ? 'bg-stone-50 border-[#D6CEBE] text-stone-900 placeholder:text-stone-400'
                      : 'bg-[#181411] border-stone-700 text-stone-100 placeholder:text-stone-500'
                  }`}
                />
                {crsQuery && (
                  <button
                    type="button"
                    onClick={() => setCrsQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Quick Preset Badges */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                <span className="text-stone-500 font-semibold mr-1">Presets:</span>
                {[
                  { label: 'Sud_Maroc degree (4261)', query: '4261' },
                  { label: 'Sud_Maroc metric (26192)', query: '26192' },
                  { label: 'WGS 84 (4326)', query: '4326' },
                  { label: 'Web Mercator (3857)', query: '3857' },
                  { label: 'Lambert-93 (2154)', query: '2154' },
                  { label: 'UTM 28N (32628)', query: '32628' },
                  { label: 'UTM 29N (32629)', query: '32629' },
                  { label: 'UTM 30N (32630)', query: '32630' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCrsQuery(preset.query)}
                    className={`px-2 py-0.5 rounded-md border transition-colors ${
                      crsQuery === preset.query
                        ? 'bg-amber-500 text-stone-950 font-bold border-amber-600'
                        : theme === 'light'
                          ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-700'
                          : 'bg-stone-850 hover:bg-stone-800 border-stone-700 text-stone-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-stone-500/10 max-h-[50vh]">
              {matchingCrsList.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-xs text-stone-400">No matching coordinate systems found for &quot;{crsQuery}&quot;.</p>
                  <p className="text-[11px] font-mono text-stone-500">Try searching &quot;4326&quot;, &quot;Merchich&quot;, &quot;Lambert&quot;, or &quot;UTM&quot;</p>
                </div>
              ) : (
                matchingCrsList.map((item) => {
                  const itemCodeNum = parseInt(item.code.replace(/[^\d]/g, ''), 10) || 4326;
                  const isCurrent = itemCodeNum === srid;

                  return (
                    <div
                      key={item.code}
                      onClick={() => {
                        setSrid(itemCodeNum);
                        setIsCrsSearchOpen(false);
                      }}
                      className={`p-3 rounded-xl cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isCurrent
                          ? (theme === 'light'
                              ? 'bg-amber-100/90 border border-amber-400 text-stone-950 shadow-xs'
                              : 'bg-amber-950/40 border border-amber-500/60 text-[#FAF6F0]')
                          : (theme === 'light'
                              ? 'hover:bg-stone-100 text-stone-800'
                              : 'hover:bg-stone-850 text-stone-300')
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                            isCurrent
                              ? 'bg-amber-600 text-white'
                              : theme === 'light' ? 'bg-stone-200 text-stone-800' : 'bg-stone-800 text-amber-400'
                          }`}>
                            {item.code}
                          </span>
                          <span className="font-semibold text-xs truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-stone-500/10 text-stone-500">
                            {item.isGeographic ? 'Geographic' : 'Projected'}
                          </span>
                        </div>

                        {item.area && (
                          <p className="text-[11px] text-stone-500 font-sans line-clamp-1">
                            Area: {item.area}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {isCurrent ? (
                          <span className="flex items-center space-x-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Check className="w-4 h-4" />
                            <span>Selected</span>
                          </span>
                        ) : (
                          <span className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                            theme === 'light'
                              ? 'bg-white border-stone-300 text-stone-700 hover:bg-amber-50 hover:border-amber-400'
                              : 'bg-[#201A16] border-stone-700 text-stone-300 hover:bg-stone-800 hover:border-amber-500'
                          }`}>
                            Choose
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Results Footer Counter */}
            <div className={`p-3 border-t flex items-center justify-between text-[11px] font-mono ${
              theme === 'light' ? 'border-[#E2DBD0] bg-[#F2ECE3] text-stone-600' : 'border-stone-800 bg-[#14100D] text-stone-400'
            }`}>
              <span>Showing {matchingCrsList.length} matches (from 6,942 EPSG database)</span>
              <button
                type="button"
                onClick={() => setIsCrsSearchOpen(false)}
                className="hover:underline font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
