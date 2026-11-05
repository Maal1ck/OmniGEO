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
  Sparkles
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { 
  generatePostgisSql, 
  generatePsqlCommand, 
  generateOgr2ogrCommand, 
  generatePythonScript, 
  extractSRID,
  PostgisExportOptions 
} from '../core/postgisExporter';
import { useTheme } from '../core/theme';

interface PostgisModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  defaultDatasetId?: string | null;
}

export const PostgisModal: React.FC<PostgisModalProps> = ({
  isOpen,
  onClose,
  datasets,
  defaultDatasetId,
}) => {
  const { theme } = useTheme();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => {
    if (defaultDatasetId && datasets.some(d => d.id === defaultDatasetId)) {
      return defaultDatasetId;
    }
    return datasets[0]?.id || '';
  });

  const activeDataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0];

  const [activeTab, setActiveTab] = useState<'sql' | 'cli' | 'python'>('sql');
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
  }), [schemaName, tableName, geomColumnName, srid, dropTable, createSpatialIndex, host, port, database, username]);

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
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'light' ? 'hover:bg-stone-200 text-stone-600' : 'hover:bg-stone-800 text-stone-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
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
              <label className="text-[11px] font-mono uppercase font-bold text-stone-500 block mb-1">
                EPSG / SRID
              </label>
              <input
                type="number"
                value={srid}
                onChange={(e) => setSrid(parseInt(e.target.value, 10) || 4326)}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              />
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
          <div className="flex items-center space-x-1 border-b border-stone-200 dark:border-stone-800">
            <button
              onClick={() => setActiveTab('sql')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
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
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'cli'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>CLI Pipelines (psql & GDAL ogr2ogr)</span>
            </button>
            <button
              onClick={() => setActiveTab('python')}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'python'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Python (GeoPandas & SQLAlchemy)</span>
            </button>
          </div>

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
              {/* Connection Host/Port Config */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl border bg-stone-500/5 border-stone-500/20 text-xs">
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
    </div>
  );
};
