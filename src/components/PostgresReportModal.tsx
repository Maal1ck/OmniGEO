/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Database, 
  X, 
  Download, 
  Copy, 
  Check, 
  Printer, 
  Search, 
  TableProperties, 
  Share2, 
  CheckCircle2, 
  AlertCircle, 
  Code2, 
  ChevronDown, 
  ChevronUp, 
  Network,
  Key,
  FileSpreadsheet,
  FileText,
  LayoutList
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { 
  PostgresDatabaseSchema, 
  PostgresTableSchema,
  PostgresColumnSchema,
  PostgresRelationship,
  POSTGRES_EXTRACTOR_SQL, 
  SAMPLE_POSTGRES_DATABASES, 
  generateStandaloneHtmlReport, 
  generatePhysicalDataModelHtml,
  normalizeToPostgresType,
  categorizeDataType,
  parsePostgresDDL, 
  buildSchemaFromDatasets,
  generatePythonReportScript,
  computeTableProfile,
  generateProfileSheetExcel,
  generateProfileSheetCsv
} from '../core/postgresReportEngine';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';

interface PostgresReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
}

export const PostgresReportModal: React.FC<PostgresReportModalProps> = ({
  isOpen,
  onClose,
  datasets,
}) => {
  const { theme } = useTheme();
  const { lang: appLang } = useI18n();

  // Report language switcher: 'fr' or 'en'
  const [reportLang, setReportLang] = useState<'fr' | 'en'>(() => (appLang === 'en' ? 'en' : 'fr'));

  // Active view tab in modal: dictionary | mpd | sources | code
  const [activeTab, setActiveTab] = useState<'preview' | 'mpd' | 'sources' | 'code'>('preview');

  // Active database schema being reported
  const [schema, setSchema] = useState<PostgresDatabaseSchema>(() => {
    if (datasets && datasets.length > 0) {
      return buildSchemaFromDatasets(datasets, 'omnigeo_spatial_production_db');
    }
    return SAMPLE_POSTGRES_DATABASES.cadastre;
  });

  // Source tab states
  const [sourceMode, setSourceMode] = useState<'sql_query' | 'ddl_paste' | 'samples' | 'workspace' | 'python'>('sql_query');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [ddlInput, setDdlInput] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);

  // Search filter inside preview
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSchemaFilter, setSelectedSchemaFilter] = useState<string>('all');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  // MPD interactive selected entity & card width customizer
  const [selectedMpdTable, setSelectedMpdTable] = useState<string | null>(null);
  const [mpdCardWidth, setMpdCardWidth] = useState<number>(360);
  const [tableWidthOverrides, setTableWidthOverrides] = useState<Record<string, number>>({});

  // Copy status
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generate HTML Data Dictionary report string in chosen language
  const standaloneDataDictHtml = useMemo(() => {
    return generateStandaloneHtmlReport(schema, reportLang);
  }, [schema, reportLang]);

  // Generate HTML Physical Data Model (MPD) report string in chosen language
  const standaloneMpdHtml = useMemo(() => {
    return generatePhysicalDataModelHtml(schema, reportLang);
  }, [schema, reportLang]);

  // Download Data Dictionary HTML file handler
  const handleDownloadDataDictHtml = () => {
    const blob = new Blob([standaloneDataDictHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.databaseName}_dictionnaire_donnees_${reportLang}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Dictionary view mode: 'profile' (matching user screenshot: 1- Une fiche par table + 2- Dictionnaire physique) vs 'compact'
  const [dictionaryViewMode, setDictionaryViewMode] = useState<'profile' | 'compact'>('profile');

  // Download Profile Sheet Excel (.xlsx) file handler
  const handleDownloadProfileExcel = () => {
    try {
      const u8 = generateProfileSheetExcel(schema, reportLang);
      const blob = new Blob([u8.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schema.databaseName}_fiche_dictionnaire_${reportLang}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating Excel file:', err);
    }
  };

  // Download Profile Sheet CSV (.csv) file handler
  const handleDownloadProfileCsv = () => {
    try {
      const csvStr = generateProfileSheetCsv(schema, reportLang);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schema.databaseName}_fiche_dictionnaire_${reportLang}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating CSV file:', err);
    }
  };

  // Download Physical Data Model (MPD) HTML file handler
  const handleDownloadMpdHtml = () => {
    const blob = new Blob([standaloneMpdHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.databaseName}_modele_physique_donnees_mpd_${reportLang}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Print in clean window
  const handlePrint = (type: 'dict' | 'mpd' = 'dict') => {
    const htmlToPrint = type === 'dict' ? standaloneDataDictHtml : standaloneMpdHtml;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlToPrint);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 400);
    }
  };

  // Handle parsing JSON from pgAdmin extractor
  const handleParseJson = () => {
    setParseError(null);
    setParseSuccess(null);
    if (!jsonInput.trim()) {
      setParseError(reportLang === 'fr' ? 'Veuillez coller le JSON retourné par pgAdmin.' : 'Please paste the JSON returned by pgAdmin.');
      return;
    }
    try {
      let parsed = JSON.parse(jsonInput.trim());
      if (parsed.omnigeo_db_report) {
        parsed = parsed.omnigeo_db_report;
      } else if (Array.isArray(parsed) && parsed[0]?.omnigeo_db_report) {
        parsed = parsed[0].omnigeo_db_report;
      }

      if (!parsed.tables || !Array.isArray(parsed.tables)) {
        throw new Error(reportLang === 'fr' ? "Le JSON doit comporter un tableau de 'tables'." : "JSON must contain an array of 'tables'.");
      }

      // Compute relationships with unique IDs
      const rawRels = Array.isArray(parsed.relationships) ? parsed.relationships : [];
      const rels: PostgresRelationship[] = rawRels.map((r: any, idx: number) => ({
        id: r.id ? `${r.id}_${idx}` : `rel_${r.sourceTable || 'src'}_${r.sourceColumn || 'col'}_${idx}`,
        constraintName: r.constraintName || `fk_${r.sourceTable || 'src'}_${r.sourceColumn || 'col'}_${idx}`,
        sourceTable: r.sourceTable || '',
        sourceColumn: r.sourceColumn || '',
        targetTable: r.targetTable || '',
        targetColumn: r.targetColumn || '',
        cardinality: r.cardinality || '1:N',
        sourceCardinality: r.sourceCardinality || '0..n',
        targetCardinality: r.targetCardinality || '1..1',
        updateRule: r.updateRule,
        deleteRule: r.deleteRule,
      }));

      // Compute summary and normalize tables/columns
      let totalRec = 0;
      let totalCols = 0;
      let totalSpatial = 0;
      const typeDist: Record<string, number> = {};

      const tables: PostgresTableSchema[] = (parsed.tables || []).map((t: any, tIdx: number) => {
        totalRec += typeof t.estimatedRows === 'number' ? Math.max(t.estimatedRows, 0) : 0;
        let isSp = !!t.isSpatial;

        const rawCols = Array.isArray(t.columns) ? t.columns : [];
        const columns: PostgresColumnSchema[] = rawCols.map((c: any, cIdx: number) => {
          totalCols++;
          const canonicalType = normalizeToPostgresType(c.dataType || 'text');
          const isGeom = !!c.isGeometry || canonicalType.toLowerCase().includes('geom');
          if (isGeom) isSp = true;

          const cat = categorizeDataType(canonicalType);
          typeDist[cat] = (typeDist[cat] || 0) + 1;

          return {
            name: c.name || `col_${cIdx}`,
            dataType: canonicalType,
            isNullable: c.isNullable !== false,
            defaultValue: c.defaultValue ?? null,
            isPrimaryKey: !!c.isPrimaryKey,
            isForeignKey: !!c.isForeignKey || !!c.foreignKeyTarget,
            foreignKeyTarget: c.foreignKeyTarget,
            isGeometry: isGeom,
            geometryType: c.geometryType,
            srid: c.srid,
            comment: c.comment,
          };
        });

        if (isSp) totalSpatial++;

        const primaryKeys = (t.primaryKeys && Array.isArray(t.primaryKeys))
          ? t.primaryKeys
          : columns.filter(c => c.isPrimaryKey).map(c => c.name);

        const tableForeignKeys = (t.foreignKeys && Array.isArray(t.foreignKeys))
          ? t.foreignKeys
          : rels.filter(r => r.sourceTable === t.name);

        return {
          name: t.name || `table_${tIdx}`,
          schema: t.schema || 'public',
          estimatedRows: typeof t.estimatedRows === 'number' ? Math.max(t.estimatedRows, 0) : 0,
          sizeFormatted: t.sizeFormatted || `${((columns.length * 20) / 1024).toFixed(1)} kB`,
          columns,
          primaryKeys,
          foreignKeys: tableForeignKeys,
          isSpatial: isSp,
          comment: t.comment,
        };
      });

      const formattedSchema: PostgresDatabaseSchema = {
        databaseName: parsed.databaseName || 'postgres_db',
        serverVersion: parsed.serverVersion || 'PostgreSQL 16+',
        generatedAt: parsed.generatedAt || new Date().toISOString(),
        tables,
        relationships: rels,
        summary: {
          totalTables: tables.length,
          totalRecords: totalRec,
          totalColumns: totalCols,
          totalRelationships: rels.length,
          totalSpatialTables: totalSpatial,
          dataTypesDistribution: typeDist,
        },
      };

      setSchema(formattedSchema);
      setParseSuccess(reportLang === 'fr' 
        ? `Base "${formattedSchema.databaseName}" chargée avec succès (${formattedSchema.tables.length} tables, ${totalCols} colonnes).`
        : `Database "${formattedSchema.databaseName}" loaded successfully (${formattedSchema.tables.length} tables, ${totalCols} columns).`);
      setActiveTab('preview');
    } catch (e) {
      setParseError(reportLang === 'fr' 
        ? `Erreur d'analyse JSON : ${e instanceof Error ? e.message : String(e)}`
        : `JSON parsing error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Handle parsing DDL
  const handleParseDdl = () => {
    setParseError(null);
    setParseSuccess(null);
    if (!ddlInput.trim()) {
      setParseError(reportLang === 'fr' ? 'Veuillez coller le script DDL (CREATE TABLE).' : 'Please paste the DDL script (CREATE TABLE).');
      return;
    }
    try {
      const parsed = parsePostgresDDL(ddlInput.trim(), 'database_ddl_import');
      if (!parsed.tables || parsed.tables.length === 0) {
        throw new Error(reportLang === 'fr' ? "Aucune table 'CREATE TABLE' détectée dans le script collé." : "No 'CREATE TABLE' statements detected.");
      }
      setSchema(parsed);
      setParseSuccess(reportLang === 'fr' 
        ? `Schéma DDL analysé : ${parsed.tables.length} tables détectées avec succès.`
        : `DDL schema parsed: ${parsed.tables.length} tables detected successfully.`);
      setActiveTab('preview');
    } catch (e) {
      setParseError(reportLang === 'fr'
        ? `Erreur d'analyse DDL : ${e instanceof Error ? e.message : String(e)}`
        : `DDL parsing error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Toggle table card expand
  const toggleTableExpand = (name: string) => {
    setExpandedTables(prev => ({
      ...prev,
      [name]: prev[name] === undefined ? false : !prev[name],
    }));
  };

  // Schemas list for dropdown
  const uniqueSchemas = useMemo(() => {
    const s = new Set<string>();
    (schema.tables || []).forEach(t => {
      if (t.schema) s.add(t.schema);
    });
    return Array.from(s);
  }, [schema]);

  // Filtered tables for preview
  const filteredTables = useMemo(() => {
    if (!schema.tables) return [];
    return schema.tables.filter(t => {
      const matchesSchema = selectedSchemaFilter === 'all' || t.schema === selectedSchemaFilter;
      if (!matchesSchema) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTableName = (t.name || '').toLowerCase().includes(q);
      const matchCols = (t.columns || []).some(c => 
        (c.name || '').toLowerCase().includes(q) || (c.dataType || '').toLowerCase().includes(q)
      );
      return matchTableName || matchCols;
    });
  }, [schema, searchQuery, selectedSchemaFilter]);

  // Related tables for the selected table in MPD tab
  const mpdHighlightedRelations = useMemo(() => {
    if (!selectedMpdTable || !schema.relationships) return [];
    return schema.relationships.filter(
      r => r.sourceTable === selectedMpdTable || r.targetTable === selectedMpdTable
    );
  }, [schema, selectedMpdTable]);

  if (!isOpen) return null;

  const isFr = reportLang === 'fr';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div className={`relative flex flex-col w-full max-w-6xl max-h-[95vh] rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
        theme === 'light' 
          ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-900 shadow-stone-400/30' 
          : 'bg-[#14100D] border-stone-800 text-stone-100 shadow-stone-950/90'
      }`}>
        
        {/* Modal Top Bar */}
        <div className={`px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 ${
          theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#191410] border-stone-800'
        }`}>
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
              <TableProperties className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-display font-bold tracking-tight">
                  {isFr ? 'Rapport PostgreSQL & Modèle Physique (MPD)' : 'PostgreSQL Report & Physical Data Model (ERD)'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                  {schema.databaseName}
                </span>
              </div>
              <p className="text-xs text-stone-500 font-mono mt-0.5">
                {(schema.tables || []).length} {isFr ? 'tables' : 'tables'} &bull; {(schema.summary?.totalRecords || 0).toLocaleString()} {isFr ? 'enregistrements' : 'records'} &bull; {(schema.relationships || []).length} {isFr ? 'relations clés étrangères' : 'foreign key links'}
              </p>
            </div>
          </div>

          {/* Action CTAs & Language Switcher */}
          <div className="flex items-center space-x-2">
            
            {/* Language Switcher Button (FR / EN) */}
            <div className={`flex items-center p-0.5 rounded-xl border text-xs font-semibold ${
              theme === 'light' ? 'bg-[#F5EFE6] border-[#D6CEBE]' : 'bg-stone-900 border-stone-700'
            }`}>
              <button
                onClick={() => setReportLang('fr')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  reportLang === 'fr'
                    ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Rapport en Français"
              >
                FR
              </button>
              <button
                onClick={() => setReportLang('en')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  reportLang === 'en'
                    ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Report in English"
              >
                EN
              </button>
            </div>

            <button
              onClick={() => handlePrint(activeTab === 'mpd' ? 'mpd' : 'dict')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                theme === 'light'
                  ? 'bg-white hover:bg-stone-100 text-stone-800 border-[#D6CEBE]'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-700'
              }`}
              title="Print report or save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-stone-500" />
              <span>{isFr ? 'Imprimer / PDF' : 'Print / PDF'}</span>
            </button>

            {/* Download Profile Sheet Excel (.xlsx) */}
            <button
              onClick={handleDownloadProfileExcel}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20 transition-all active:scale-95 cursor-pointer"
              title={isFr ? "Exporter le dictionnaire sous forme de fiches au format Excel (.xlsx)" : "Export data dictionary profile sheets to Excel (.xlsx)"}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>Excel (.xlsx)</span>
            </button>

            {/* Download Profile Sheet CSV (.csv) */}
            <button
              onClick={handleDownloadProfileCsv}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
                theme === 'light'
                  ? 'bg-white hover:bg-stone-100 text-stone-800 border-[#D6CEBE]'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-700'
              }`}
              title={isFr ? "Exporter le dictionnaire sous forme de fiches au format CSV (.csv)" : "Export data dictionary profile sheets to CSV (.csv)"}
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>CSV</span>
            </button>

            {/* Download Data Dictionary HTML */}
            <button
              onClick={handleDownloadDataDictHtml}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600/90 hover:bg-amber-500 text-stone-950 shadow-md transition-all active:scale-95 cursor-pointer"
              title="Download standalone HTML data dictionary"
            >
              <Download className="w-3.5 h-3.5 text-stone-950" />
              <span>{isFr ? 'Dictionnaire (HTML)' : 'Dictionary (HTML)'}</span>
            </button>

            {/* Download MPD Schematic HTML */}
            <button
              onClick={handleDownloadMpdHtml}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/20 transition-all active:scale-95 cursor-pointer"
              title="Download standalone HTML Physical Data Model (ERD) with relationship arrows & cardinalities"
            >
              <Network className="w-3.5 h-3.5 text-white" />
              <span>{isFr ? 'Modèle MPD (HTML)' : 'MPD Model (HTML)'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className={`px-6 border-b flex items-center justify-between text-xs font-medium ${
          theme === 'light' ? 'bg-[#F5EFE6] border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
        }`}>
          <div className="flex items-center space-x-1 py-1.5">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'preview'
                  ? theme === 'light'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'bg-white/[0.1] text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5 text-amber-500" />
              <span>{isFr ? 'Dictionnaire de Données' : 'Data Dictionary'}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 font-bold">
                {(schema.tables || []).length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mpd')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'mpd'
                  ? theme === 'light'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'bg-white/[0.1] text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span>{isFr ? 'Modèle Physique (MPD / ERD)' : 'Physical Model (MPD / ERD)'}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                {(schema.relationships || []).length} rels
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sources')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'sources'
                  ? theme === 'light'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'bg-white/[0.1] text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-indigo-500" />
              <span>{isFr ? 'Connexion & Importation' : 'Import / Connect DB'}</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'code'
                  ? theme === 'light'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'bg-white/[0.1] text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{isFr ? 'Code HTML Standalone' : 'HTML Code'}</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-[11px] font-mono text-stone-500">
            <span>Lang: <strong className="text-amber-500">{reportLang.toUpperCase()}</strong></span>
            <span>&bull;</span>
            <span>Server: {schema.serverVersion?.split(' ')[0] || 'PostgreSQL'}</span>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: DATA DICTIONARY PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className={`p-4 rounded-xl border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">
                    {isFr ? 'Tables Métier' : 'Total Tables'}
                  </span>
                  <div className="text-2xl font-bold font-mono text-amber-500 mt-0.5">{(schema.tables || []).length}</div>
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    {isFr ? 'Tables relationnelles' : 'Relational tables'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">
                    {isFr ? 'Couches PostGIS' : 'PostGIS Layers'}
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-500 mt-0.5">{schema.summary?.totalSpatialTables || 0}</div>
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    {isFr ? 'Colonnes géométriques' : 'Spatial geometries'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">
                    {isFr ? 'Enregistrements' : 'Data Records'}
                  </span>
                  <div className="text-2xl font-bold font-mono text-stone-200 mt-0.5">{(schema.summary?.totalRecords || 0).toLocaleString()}</div>
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    {isFr ? 'Volume estimé' : 'Estimated row count'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">
                    {isFr ? 'Total Champs' : 'Total Fields'}
                  </span>
                  <div className="text-2xl font-bold font-mono text-stone-200 mt-0.5">{schema.summary?.totalColumns || 0}</div>
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    {isFr ? 'Attributs typés PostgreSQL' : 'Canonical attributes'}
                  </span>
                </div>

                <div className={`p-4 rounded-xl border ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <span className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">
                    {isFr ? 'Relations (FK)' : 'Foreign Keys'}
                  </span>
                  <div className="text-2xl font-bold font-mono text-purple-400 mt-0.5">{(schema.relationships || []).length}</div>
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    {isFr ? 'Liaisons d’intégrité' : 'Referential links'}
                  </span>
                </div>
              </div>

              {/* Data Types Distribution */}
              <div className={`p-3.5 rounded-xl border flex flex-wrap items-center gap-2 text-xs ${
                theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
              }`}>
                <span className="font-mono text-[11px] font-bold text-stone-500 uppercase mr-2">
                  {isFr ? 'Distribution des Types Canoniques :' : 'Canonical Types Distribution:'}
                </span>
                {Object.entries(schema.summary?.dataTypesDistribution || {}).map(([category, count], idx) => (
                  <span key={`dtype-pill-${category}-${idx}`} className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] flex items-center space-x-1.5 ${
                    category.includes('Spatial') 
                      ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-300 font-bold'
                      : category.includes('Numeric')
                      ? 'bg-sky-950/40 border-sky-600/40 text-sky-300'
                      : category.includes('Text')
                      ? 'bg-purple-950/40 border-purple-600/40 text-purple-300'
                      : 'bg-stone-900 border-stone-700 text-stone-300'
                  }`}>
                    <span>{category}:</span>
                    <span className="font-bold">{count}</span>
                  </span>
                ))}
              </div>

              {/* Foreign Keys & Relationships Matrix Card */}
              {(schema.relationships || []).length > 0 && (
                <div className={`rounded-xl border overflow-hidden ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                }`}>
                  <div className={`px-5 py-3 border-b flex items-center justify-between ${
                    theme === 'light' ? 'bg-[#FDFBF8] border-[#E2DBD0]' : 'bg-[#201A16] border-stone-800'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <Share2 className="w-4 h-4 text-purple-400" />
                      <h3 className="font-display font-bold text-xs uppercase tracking-wider">
                        {isFr ? 'Relations & Clés Étrangères (Foreign Keys)' : 'Relationships & Foreign Keys'}
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-stone-500">
                      {(schema.relationships || []).length} {isFr ? 'liaisons actives' : 'active links'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className={`text-[10px] uppercase font-bold border-b ${
                        theme === 'light' ? 'bg-[#FAF8F5] text-stone-600 border-[#E2DBD0]' : 'bg-stone-900/60 text-stone-400 border-stone-800'
                      }`}>
                        <tr>
                          <th className="py-2.5 px-4">{isFr ? 'Contrainte' : 'Constraint'}</th>
                          <th className="py-2.5 px-4">{isFr ? 'Table Source (FK)' : 'Source Table (FK)'}</th>
                          <th className="py-2.5 px-4 text-center">{isFr ? 'Cardinalité' : 'Cardinality'}</th>
                          <th className="py-2.5 px-4">{isFr ? 'Table Cible (PK)' : 'Target Table (PK)'}</th>
                          <th className="py-2.5 px-4">{isFr ? 'Règle' : 'Rule'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${theme === 'light' ? 'divide-[#F0ECE4]' : 'divide-stone-800/60'}`}>
                        {(schema.relationships || []).map((rel, idx) => (
                          <tr key={`rel-row-${rel.id || ''}-${rel.constraintName || ''}-${rel.sourceTable}-${rel.sourceColumn}-${rel.targetTable}-${idx}`} className="hover:bg-amber-500/5 transition-colors">
                            <td className="py-2 px-4 text-stone-500 text-[11px]">{rel.constraintName}</td>
                            <td className="py-2 px-4 font-bold text-amber-500">
                              {rel.sourceTable}.<span className="underline">{rel.sourceColumn}</span>
                            </td>
                            <td className="py-2 px-4 text-center">
                              <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] font-bold">
                                {rel.sourceCardinality || '0..n'} &rarr; {rel.cardinality || '1:N'} &rarr; {rel.targetCardinality || '1..1'}
                              </span>
                            </td>
                            <td className="py-2 px-4 font-bold text-emerald-400">
                              {rel.targetTable}.<span className="underline">{rel.targetColumn}</span>
                            </td>
                            <td className="py-2 px-4 text-stone-500 text-[11px]">
                              {rel.deleteRule ? `ON DELETE ${rel.deleteRule}` : 'CASCADE'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Filter and Search Bar for Tables */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 min-w-[260px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isFr ? 'Rechercher une table ou un champ...' : 'Search table or field name...'}
                    className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs border outline-none focus:ring-2 focus:ring-amber-500/30 transition-all ${
                      theme === 'light'
                        ? 'bg-white border-[#D6CEBE] text-stone-900 placeholder-stone-400'
                        : 'bg-[#181310] border-stone-800 text-stone-100 placeholder-stone-500'
                    }`}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  {/* View Mode Switcher: Fiche par table (Matching screenshot) vs Compact */}
                  <div className={`flex items-center p-0.5 rounded-xl border text-xs font-semibold ${
                    theme === 'light' ? 'bg-[#F5EFE6] border-[#D6CEBE]' : 'bg-stone-900 border-stone-800'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setDictionaryViewMode('profile')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        dictionaryViewMode === 'profile'
                          ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      title={isFr ? "Mode Fiche normalisée (1- Une fiche par table + 2- Dictionnaire physique)" : "Profile Sheet Mode (1- Table Profile + 2- Physical Dictionary)"}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Fiche par Table' : 'Profile Sheet'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDictionaryViewMode('compact')}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        dictionaryViewMode === 'compact'
                          ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      title={isFr ? "Mode Tableau condensé standard" : "Compact table view"}
                    >
                      <TableProperties className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Tableau Standard' : 'Standard View'}</span>
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-stone-500 uppercase">Schema:</span>
                  <select
                    value={selectedSchemaFilter}
                    onChange={(e) => setSelectedSchemaFilter(e.target.value)}
                    className={`rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none cursor-pointer ${
                      theme === 'light'
                        ? 'bg-white border-[#D6CEBE] text-stone-900'
                        : 'bg-[#181310] border-stone-800 text-stone-200'
                    }`}
                  >
                    <option value="all">ALL SCHEMAS ({uniqueSchemas.length})</option>
                    {uniqueSchemas.map((s, idx) => (
                      <option key={`schema-opt-${s}-${idx}`} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table Catalog List */}
              <div className="space-y-4">
                {filteredTables.map((table, tIdx) => {
                  const isCollapsed = expandedTables[table.name] === false;

                  return (
                    <div 
                      key={`tbl-card-${table.schema}.${table.name}-${tIdx}`}
                      className={`rounded-xl border overflow-hidden transition-all ${
                        theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#181310] border-stone-800'
                      }`}
                    >
                      {/* Table Header Row */}
                      <div 
                        onClick={() => toggleTableExpand(table.name)}
                        className={`px-5 py-3.5 border-b flex items-center justify-between cursor-pointer select-none transition-colors ${
                          theme === 'light' ? 'bg-[#FDFBF8] hover:bg-stone-50 border-[#E2DBD0]' : 'bg-[#1F1915] hover:bg-[#251E19] border-stone-800'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-500/20 text-stone-400 uppercase">
                            {table.schema || 'public'}
                          </span>
                          <span className="font-mono font-bold text-sm text-amber-500">
                            {table.name}
                          </span>
                          {table.isSpatial && (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                              {isFr ? 'COUCHE POSTGIS' : 'POSTGIS LAYER'}
                            </span>
                          )}
                          {table.comment && (
                            <span className="hidden md:inline text-xs text-stone-400 truncate max-w-sm italic">
                              &bull; {table.comment}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-xs font-mono text-stone-400">
                          <span>{(table.columns || []).length} {isFr ? 'champs' : 'cols'}</span>
                          <span>&bull;</span>
                          <span>{(table.estimatedRows || 0).toLocaleString()} {isFr ? 'lignes' : 'rows'}</span>
                          {table.sizeFormatted && (
                            <>
                              <span>&bull;</span>
                              <span>{table.sizeFormatted}</span>
                            </>
                          )}
                          <div className="p-1 text-stone-400">
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Columns Table & Profile Sheet */}
                      {!isCollapsed && (
                        <div>
                          {dictionaryViewMode === 'profile' && (() => {
                            const profile = computeTableProfile(table, schema, reportLang);
                            return (
                              <div className="p-5 border-b border-stone-800/80 space-y-3">
                                <div className={`text-xs font-display font-bold uppercase tracking-wider flex items-center space-x-2 ${
                                  theme === 'light' ? 'text-amber-800' : 'text-amber-400'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  <span>1- {isFr ? 'Une fiche par table' : 'Table Profile Sheet'}</span>
                                </div>
                                <div className={`rounded-xl border overflow-hidden ${
                                  theme === 'light' ? 'border-[#E2DBD0] bg-white' : 'border-stone-800 bg-[#120E0C]'
                                }`}>
                                  <table className="w-full text-xs font-mono border-collapse table-fixed">
                                    <tbody className={`divide-y ${theme === 'light' ? 'divide-[#EBE5DC]' : 'divide-stone-800/80'}`}>
                                      <tr>
                                        <td className={`w-52 sm:w-64 px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Service' : 'Service'}</td>
                                        <td className={`px-4 py-2.5 font-sans ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.service}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Table' : 'Table'}</td>
                                        <td className={`px-4 py-2.5 font-bold ${theme === 'light' ? 'text-stone-900' : 'text-amber-400'}`}>{profile.tableName}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Nature' : 'Nature'}</td>
                                        <td className={`px-4 py-2.5 font-sans ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.nature}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Identifiant métier' : 'Business Identifier'}</td>
                                        <td className={`px-4 py-2.5 font-bold ${theme === 'light' ? 'text-amber-800' : 'text-amber-300'}`}>{profile.identifiantMetier}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Rattachement' : 'Relationship'}</td>
                                        <td className={`px-4 py-2.5 ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.rattachement}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Champs temporels' : 'Temporal Fields'}</td>
                                        <td className={`px-4 py-2.5 ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.champsTemporels}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Champs quantitatifs' : 'Quantitative Fields'}</td>
                                        <td className={`px-4 py-2.5 ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.champsQuantitatifs}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? "Nombre d'enregistrements" : 'Record Count'}</td>
                                        <td className={`px-4 py-2.5 font-bold ${theme === 'light' ? 'text-stone-900' : 'text-stone-200'}`}>{profile.nombreEnregistrements}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'Contrôles' : 'Controls'}</td>
                                        <td className={`px-4 py-2.5 font-sans ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.controles}</td>
                                      </tr>
                                      <tr>
                                        <td className={`px-4 py-2.5 font-sans font-bold border-r ${theme === 'light' ? 'bg-[#FAF8F5] text-stone-900 border-[#EBE5DC]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800/80'}`}>{isFr ? 'État de validation' : 'Validation Status'}</td>
                                        <td className={`px-4 py-2.5 font-sans ${theme === 'light' ? 'text-stone-700' : 'text-stone-300'}`}>{profile.etatValidation}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}

                          {dictionaryViewMode === 'profile' && (
                            <div className={`px-5 py-2.5 font-display font-bold text-xs uppercase tracking-wider border-b ${
                              theme === 'light' ? 'bg-[#FDFBF8] text-stone-900 border-[#E2DBD0]' : 'bg-[#181310] text-[#FAF6F0] border-stone-800'
                            }`}>
                              2- {isFr ? 'Dictionnaire de données physique (champs, types, identifiants et contraintes)' : 'Physical Data Dictionary (fields, types, keys and constraints)'}
                            </div>
                          )}

                          <div className="overflow-x-auto w-full">
                          <table className="w-full text-left text-xs table-fixed border-collapse">
                            <thead className={`text-[10px] uppercase font-mono font-bold border-b ${
                              theme === 'light' ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-900/60 text-slate-400 border-slate-800'
                            }`}>
                              <tr>
                                <th className="py-2.5 px-4 w-[25%] truncate">{isFr ? 'Nom du Champ' : 'Column Name'}</th>
                                <th className="py-2.5 px-4 w-[26%] truncate">{isFr ? 'Type PostgreSQL Canonique' : 'PostgreSQL Canonical Type'}</th>
                                <th className="py-2.5 px-4 w-[12%] text-center truncate">{isFr ? 'Nullabilité' : 'Nullable'}</th>
                                <th className="py-2.5 px-4 w-[22%] truncate">{isFr ? 'Clés & Contraintes' : 'Keys & Constraints'}</th>
                                <th className="py-2.5 px-4 w-[15%] truncate">{isFr ? 'Valeur par Défaut' : 'Default Value'}</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${theme === 'light' ? 'divide-slate-100' : 'divide-slate-800/60'}`}>
                              {(table.columns || []).map((col, colIdx) => {
                                const canonicalType = normalizeToPostgresType(col.dataType || 'text');

                                return (
                                  <tr key={`col-row-${table.name}-${col.name}-${colIdx}`} className="hover:bg-blue-500/5 transition-colors">
                                    <td className="py-2 px-4 font-mono font-bold text-slate-200 truncate" title={col.name}>
                                      {col.name}
                                    </td>
                                    <td className="py-2 px-4 truncate">
                                      <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded font-mono text-[11px] font-semibold border ${
                                        col.isGeometry
                                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40 font-bold'
                                          : canonicalType.includes('int') || canonicalType.includes('numeric')
                                          ? 'bg-sky-950/40 text-sky-300 border-sky-700/40'
                                          : 'bg-slate-800 text-slate-300 border-slate-700'
                                      }`} title={canonicalType}>
                                        {canonicalType}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 text-center font-mono text-[11px]">
                                      {col.isNullable ? (
                                        <span className="text-slate-500">NULL</span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                                          NOT NULL
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-4">
                                      <div className="flex items-center space-x-1.5 flex-wrap overflow-hidden">
                                        {col.isPrimaryKey && (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono text-[10px] font-bold shrink-0">
                                            PK
                                          </span>
                                        )}
                                        {col.isForeignKey && col.foreignKeyTarget && (
                                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-[10px] font-bold truncate max-w-[170px]" title={`Liaison vers ${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}`}>
                                            FK &rarr; {col.foreignKeyTarget.table}
                                          </span>
                                        )}
                                        {col.isGeometry && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] font-bold shrink-0">
                                            SRID {col.srid || 4326}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-4 font-mono text-[11px] text-slate-400 truncate" title={col.defaultValue || ''}>
                                      {col.defaultValue || '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PHYSICAL DATA MODEL (MPD / ERD SCHEMATIC VIEW) */}
          {activeTab === 'mpd' && (
            <div className="space-y-4">
              {/* Header toolbar with width controls & export */}
              <div className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border ${
                theme === 'light' 
                  ? 'bg-slate-50 border-slate-200 text-slate-800' 
                  : 'bg-slate-900/80 border-slate-800 text-slate-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <Network className="w-5 h-5 text-blue-500 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold font-sans">
                      {isFr ? 'Modèle Physique de Données (MPD) Schématique' : 'Physical Data Model (ERD) Schematic'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isFr 
                        ? 'Vue graphique des entités relationnelles, largeurs éditables et types PostgreSQL canoniques.'
                        : 'Visual layout of relational entities with editable card widths and canonical PostgreSQL types.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Card Width Slider & Presets */}
                  <div className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg border text-xs ${
                    theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'
                  }`}>
                    <span className="text-[11px] font-medium text-slate-400">{isFr ? 'Largeur :' : 'Width :'}</span>
                    <input 
                      type="range"
                      min={280}
                      max={650}
                      value={mpdCardWidth >= 900 ? 650 : mpdCardWidth}
                      onChange={(e) => setMpdCardWidth(parseInt(e.target.value, 10))}
                      className="w-20 cursor-pointer accent-blue-600"
                    />
                    <span className="font-mono text-[11px] font-bold text-blue-400 min-w-[42px]">
                      {mpdCardWidth >= 900 ? '100%' : `${mpdCardWidth}px`}
                    </span>
                    <div className="flex items-center space-x-1 pl-1 border-l border-slate-700">
                      {[
                        { label: '280', val: 280 },
                        { label: '360', val: 360 },
                        { label: '480', val: 480 },
                        { label: '100%', val: 9999 },
                      ].map(p => (
                        <button
                          key={`preset-${p.label}`}
                          onClick={() => setMpdCardWidth(p.val)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                            mpdCardWidth === p.val 
                              ? 'bg-blue-600 text-white' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          const overrides: Record<string, number> = {};
                          (schema.tables || []).forEach(t => {
                            let maxChars = t.name.length + 8;
                            (t.columns || []).forEach(c => {
                              const chars = (c.name || '').length + (c.dataType || '').length + 8;
                              if (chars > maxChars) maxChars = chars;
                            });
                            overrides[t.name] = Math.min(Math.max(maxChars * 8.5 + 46, 280), 650);
                          });
                          setTableWidthOverrides(overrides);
                        }}
                        title={isFr ? 'Ajuster automatiquement chaque table à son contenu' : 'Auto-fit each table width to its content'}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-700/60"
                      >
                        Auto
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadMpdHtml}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Exporter MPD (HTML)' : 'Export MPD (HTML)'}</span>
                  </button>

                  <button
                    onClick={() => handlePrint('mpd')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Imprimer MPD' : 'Print MPD'}</span>
                  </button>
                </div>
              </div>

              {/* In-app flexible non-overlapping container of Entity Cards */}
              <div className="flex flex-wrap gap-4 items-start justify-start">
                {(schema.tables || []).map((table, tIdx) => {
                  const isSelected = selectedMpdTable === table.name;
                  const isLinkedToSelected = selectedMpdTable && mpdHighlightedRelations.some(
                    r => (r.sourceTable === table.name && r.targetTable === selectedMpdTable) ||
                         (r.targetTable === table.name && r.sourceTable === selectedMpdTable)
                  );

                  const safeForeignKeys = Array.isArray(table.foreignKeys) ? table.foreignKeys : [];
                  const currentWidth = mpdCardWidth >= 900 
                    ? '100%' 
                    : `${tableWidthOverrides[table.name] || mpdCardWidth}px`;

                  return (
                    <div
                      key={`mpd-table-${table.schema || 'public'}.${table.name}-${tIdx}`}
                      style={{ width: currentWidth, maxWidth: '100%', boxSizing: 'border-box' }}
                      className={`rounded-lg border transition-all overflow-hidden flex flex-col shrink-0 ${
                        isSelected 
                          ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-950/40 bg-slate-900'
                          : isLinkedToSelected
                          ? 'border-amber-500/70 ring-1 ring-amber-500/30 bg-slate-900/90'
                          : theme === 'light'
                          ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Entity Header with individual width adjusters */}
                      <div className={`p-2.5 border-b flex items-center justify-between gap-2 overflow-hidden ${
                        isSelected 
                          ? 'bg-blue-950/50 border-blue-800/40' 
                          : theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-800'
                      }`}>
                        <div 
                          onClick={() => setSelectedMpdTable(isSelected ? null : table.name)}
                          className="flex items-center space-x-2 min-w-0 overflow-hidden flex-1 cursor-pointer"
                        >
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 uppercase font-bold shrink-0">
                            {table.schema || 'public'}
                          </span>
                          <span className="font-mono font-bold text-xs text-blue-400 truncate" title={table.name}>
                            {table.name}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          {table.isSpatial && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              POSTGIS
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-400">
                            {(table.estimatedRows || 0).toLocaleString()} r.
                          </span>

                          {/* Individual table width steppers (- / +) */}
                          {mpdCardWidth < 900 && (
                            <div className="flex items-center pl-1 space-x-0.5 border-l border-slate-700/50">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const current = tableWidthOverrides[table.name] || mpdCardWidth;
                                  setTableWidthOverrides(prev => ({
                                    ...prev,
                                    [table.name]: Math.max(260, current - 40),
                                  }));
                                }}
                                title={isFr ? 'Réduire la largeur' : 'Decrease width'}
                                className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer"
                              >
                                &minus;
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const current = tableWidthOverrides[table.name] || mpdCardWidth;
                                  setTableWidthOverrides(prev => ({
                                    ...prev,
                                    [table.name]: Math.min(800, current + 40),
                                  }));
                                }}
                                title={isFr ? 'Augmenter la largeur' : 'Increase width'}
                                className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Columns List strictly contained */}
                      <div className="p-2 space-y-1 max-h-64 overflow-y-auto font-mono text-[11px] w-full box-sizing: border-box;">
                        {(table.columns || []).map((col, colIdx) => {
                          const canonicalType = normalizeToPostgresType(col.dataType || 'text');

                          return (
                            <div 
                              key={`mpd-col-${table.name}-${col.name}-${colIdx}`}
                              className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white/[0.04] overflow-hidden"
                            >
                              <div className="flex items-center space-x-1.5 min-w-0 flex-1 overflow-hidden">
                                {col.isPrimaryKey ? (
                                  <span className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                                    PK
                                  </span>
                                ) : col.isForeignKey ? (
                                  <span className="text-[9px] font-bold px-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                                    FK
                                  </span>
                                ) : (
                                  <span className="w-3 shrink-0" />
                                )}
                                <span 
                                  className={`truncate flex-1 min-w-0 ${col.isPrimaryKey ? 'font-bold text-amber-300' : 'text-slate-300'}`}
                                  title={col.name}
                                >
                                  {col.name}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5 shrink-0 text-[10px] max-w-[50%] overflow-hidden">
                                <span className="text-slate-400 truncate" title={canonicalType}>{canonicalType}</span>
                                {!col.isNullable && (
                                  <span className="text-[8px] font-bold text-rose-400 bg-rose-500/10 px-1 rounded shrink-0">NN</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Outgoing relationships summary strictly contained */}
                      {safeForeignKeys.length > 0 && (
                        <div className="px-3 py-2 border-t border-slate-800 bg-black/30 text-[10px] font-mono text-slate-400 space-y-0.5 overflow-hidden">
                          {safeForeignKeys.map((fk, fkIdx) => (
                            <div key={`mpd-fk-${fk.id || 'fk'}-${fk.sourceColumn}-${fk.targetTable}-${fkIdx}`} className="flex items-center space-x-1 text-purple-300 truncate">
                              <span>&bull;</span>
                              <span className="font-bold truncate max-w-[100px]" title={fk.sourceColumn}>{fk.sourceColumn}</span>
                              <span>&rarr;</span>
                              <span className="text-amber-400 underline truncate max-w-[120px]" title={`${fk.targetTable}.${fk.targetColumn}`}>{fk.targetTable}.{fk.targetColumn}</span>
                              <span className="text-slate-400 font-bold shrink-0">({fk.cardinality || '1:N'})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Relationship Details Drawer if table selected */}
              {selectedMpdTable && (
                <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-purple-300 flex items-center space-x-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span>
                        {isFr ? 'Liaisons actives pour la table :' : 'Active links for table:'}{' '}
                        <span className="font-mono text-amber-400 font-bold">{selectedMpdTable}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedMpdTable(null)}
                      className="text-stone-400 hover:text-stone-200 text-xs font-mono"
                    >
                      {isFr ? 'Fermer' : 'Close'}
                    </button>
                  </div>

                  {mpdHighlightedRelations.length > 0 ? (
                    <div className="space-y-1.5">
                      {mpdHighlightedRelations.map((rel, rIdx) => (
                        <div key={`drawer-rel-${rel.id || ''}-${rel.sourceTable}-${rel.sourceColumn}-${rIdx}`} className="text-xs font-mono p-2 rounded bg-black/30 border border-purple-500/20 flex items-center justify-between">
                          <div>
                            <span className="text-amber-400 font-bold">{rel.sourceTable}.{rel.sourceColumn}</span>
                            <span className="mx-2 text-stone-500">&mdash;[{rel.sourceCardinality || '0..n'} &rarr; {rel.cardinality || '1:N'} &rarr; {rel.targetCardinality || '1..1'}]&rarr;</span>
                            <span className="text-emerald-400 font-bold">{rel.targetTable}.{rel.targetColumn}</span>
                          </div>
                          <span className="text-[11px] text-stone-500">
                            {rel.deleteRule ? `ON DELETE ${rel.deleteRule}` : 'CASCADE'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400">
                      {isFr ? 'Aucune clé étrangère reliée à cette table.' : 'No foreign key constraints attached to this table.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATA SOURCES & INGESTION */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              {/* Source Navigation sub-tabs */}
              <div className="flex flex-wrap gap-2 border-b border-stone-800 pb-3">
                {[
                  { id: 'sql_query' as const, label: isFr ? '1. Requête SQL d\'extraction pgAdmin (1-Clic)' : '1. SQL Extractor Query for pgAdmin' },
                  { id: 'ddl_paste' as const, label: isFr ? '2. Coller un script DDL (CREATE TABLE)' : '2. Paste DDL Script (CREATE TABLE)' },
                  { id: 'samples' as const, label: isFr ? '3. Bases de Données d\'Exemple SIG' : '3. Sample GIS Databases' },
                  { id: 'workspace' as const, label: isFr ? `4. Couches Actives de l'Atelier (${(datasets || []).length})` : `4. Active Workspace Layers (${(datasets || []).length})` },
                  { id: 'python' as const, label: isFr ? '5. Script Python d\'Inspection' : '5. Python Inspector Script' },
                ].map(tab => (
                  <button
                    key={`tab-btn-${tab.id}`}
                    onClick={() => setSourceMode(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      sourceMode === tab.id
                        ? 'bg-amber-600 text-stone-950 border-amber-600 font-bold'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {parseSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/50 text-emerald-200 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{parseSuccess}</span>
                </div>
              )}

              {parseError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-600/50 text-rose-200 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Sub-view 1: SQL Extractor Query */}
              {sourceMode === 'sql_query' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                    <strong>{isFr ? 'Comment inspecter votre base PostgreSQL en 1 clic :' : 'How to inspect your PostgreSQL database in 1 click:'}</strong>
                    <ol className="list-decimal ml-5 mt-1.5 space-y-1">
                      <li>{isFr ? 'Copiez la requête SQL standard ci-dessous.' : 'Copy the standard SQL query below.'}</li>
                      <li>{isFr ? 'Collez-la dans pgAdmin 4 (Outil Requête / Query Tool) ou exécutez-la dans psql sur votre base.' : 'Paste it in pgAdmin 4 (Query Tool) or run it in psql.'}</li>
                      <li>{isFr ? 'Copiez le résultat JSON retourné et collez-le ci-dessous.' : 'Copy the resulting JSON output and paste it below.'}</li>
                      <li>{isFr ? 'OmniGeo génère instantanément le dictionnaire et le modèle physique (MPD) !' : 'OmniGeo immediately generates the dictionary and physical model (MPD)!'}</li>
                    </ol>
                  </div>

                  <div className="relative">
                    <div className="flex items-center justify-between px-3 py-2 bg-stone-900 rounded-t-xl border border-b-0 border-stone-800 text-xs text-stone-400 font-mono">
                      <span>{isFr ? 'Requête d\'inspection officielle PostgreSQL' : 'Official PostgreSQL inspection query'}</span>
                      <button
                        onClick={() => copyText(POSTGRES_EXTRACTOR_SQL, 'extractor_sql')}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200"
                      >
                        {copiedKey === 'extractor_sql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'extractor_sql' ? (isFr ? 'Copié !' : 'Copied!') : (isFr ? 'Copier le SQL' : 'Copy SQL')}</span>
                      </button>
                    </div>
                    <pre className="p-4 bg-[#0F0C0A] border border-stone-800 rounded-b-xl text-xs font-mono text-amber-300 max-h-48 overflow-y-auto">
                      {POSTGRES_EXTRACTOR_SQL}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-300 block">
                      {isFr ? 'Collez ici le résultat JSON de la requête exécutée dans pgAdmin :' : 'Paste the JSON query result from pgAdmin here:'}
                    </label>
                    <textarea
                      value={jsonInput}
                      onChange={(e) => setJsonInput(e.target.value)}
                      placeholder='{ "databaseName": "gisdb", "tables": [...] }'
                      className="w-full h-32 p-3 bg-stone-900 border border-stone-800 rounded-xl text-xs font-mono text-stone-200 outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleParseJson}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs transition-all shadow-md"
                    >
                      {isFr ? 'Analyser le JSON & Générer le Rapport' : 'Analyze JSON & Generate Report'}
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-view 2: DDL Paste */}
              {sourceMode === 'ddl_paste' && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {isFr 
                      ? 'Collez votre script SQL de création de tables (issu d’un pg_dump -s ou d’une migration). Les types canoniques et contraintes sont extraits automatiquement.'
                      : 'Paste your CREATE TABLE DDL script (from pg_dump -s or migration scripts). Canonical PostgreSQL types and foreign keys will be parsed automatically.'}
                  </p>
                  <textarea
                    value={ddlInput}
                    onChange={(e) => setDdlInput(e.target.value)}
                    placeholder={`CREATE TABLE public.parcelles (
  id_parcelle BIGSERIAL PRIMARY KEY,
  numero_titre CHARACTER VARYING(64) NOT NULL,
  surface_ha NUMERIC(10,4),
  geom geometry(MultiPolygon, 4261),
  id_proprietaire_fk BIGINT REFERENCES public.proprietaires(id_proprietaire)
);`}
                    className="w-full h-48 p-3 bg-stone-900 border border-stone-800 rounded-xl text-xs font-mono text-amber-200 outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleParseDdl}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs transition-all shadow-md"
                  >
                    {isFr ? 'Parser le Script DDL & Mettre à Jour le Rapport' : 'Parse DDL Script & Update Report'}
                  </button>
                </div>
              )}

              {/* Sub-view 3: Samples */}
              {sourceMode === 'samples' && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-400">
                    {isFr 
                      ? 'Chargez instantanément l’un des modèles de base de données PostgreSQL / PostGIS pré-configurés :'
                      : 'Instantly load one of the pre-configured PostgreSQL / PostGIS sample databases:'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-stone-800 bg-stone-900 space-y-3">
                      <div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                          Cadastre &amp; Urbanisme
                        </span>
                        <h4 className="font-bold text-sm text-stone-100 mt-1">Conservation Foncière (PostGIS EPSG:4261)</h4>
                        <p className="text-xs text-stone-400 mt-0.5">
                          6 tables (parcelles, propriétaires, droits réels N:M, bornes, zonage PLU, communes). 100 000+ enregistrements.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSchema(SAMPLE_POSTGRES_DATABASES.cadastre);
                          setParseSuccess(isFr ? 'Modèle Cadastre et Urbanisme chargé.' : 'Cadastre and Land Registry model loaded.');
                          setActiveTab('preview');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs"
                      >
                        {isFr ? 'Charger cet Exemple' : 'Load this Sample'}
                      </button>
                    </div>

                    <div className="p-4 rounded-xl border border-stone-800 bg-stone-900 space-y-3">
                      <div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold uppercase">
                          Eau &amp; Réseaux
                        </span>
                        <h4 className="font-bold text-sm text-stone-100 mt-1">Réseau d'Eau Potable AEP (PostGIS EPSG:2154)</h4>
                        <p className="text-xs text-stone-400 mt-0.5">
                          4 tables (canalisations, stations de pompage, vannes, journal des fuites). 34 000+ enregistrements.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSchema(SAMPLE_POSTGRES_DATABASES.water_network);
                          setParseSuccess(isFr ? 'Modèle Réseau d\'Eau Potable chargé.' : 'Water Network model loaded.');
                          setActiveTab('preview');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs"
                      >
                        {isFr ? 'Charger cet Exemple' : 'Load this Sample'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-view 4: Ingested Datasets */}
              {sourceMode === 'workspace' && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-400">
                    {isFr 
                      ? 'Générez une architecture PostgreSQL PostGIS avec types canoniques reflétant directement les couches géospatiales actives :'
                      : 'Generate a PostgreSQL PostGIS schema with canonical types directly reflecting active workspace layers:'}
                  </p>
                  {(datasets && datasets.length > 0) ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 space-y-1">
                        <div className="text-xs font-bold text-stone-200">
                          {datasets.length} {isFr ? 'couches spatiales disponibles :' : 'spatial layers available:'}
                        </div>
                        <ul className="text-xs font-mono text-stone-400 list-disc ml-5 space-y-0.5">
                          {datasets.map((d, dIdx) => (
                            <li key={`ws-layer-${d.id || d.name}-${dIdx}`}>
                              {d.name} ({d.featureCount} entités, {d.geometryType}, {d.detectedCRS?.code || 'EPSG:4326'})
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        onClick={() => {
                          const generated = buildSchemaFromDatasets(datasets);
                          setSchema(generated);
                          setParseSuccess(isFr 
                            ? `Modèle généré depuis ${datasets.length} couches de l'atelier.` 
                            : `Model generated from ${datasets.length} workspace layers.`);
                          setActiveTab('preview');
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs shadow-md"
                      >
                        {isFr ? 'Générer la Structure PostgreSQL & Visualiser' : 'Generate PostgreSQL Schema & View'}
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 text-stone-400 text-xs">
                      {isFr 
                        ? 'Aucune couche n’est actuellement importée dans l’atelier. Importez des fichiers ou chargez une base d’exemple.' 
                        : 'No layer currently loaded in workspace. Import files or load a sample database.'}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-view 5: Python Script */}
              {sourceMode === 'python' && (
                <div className="space-y-3">
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {isFr 
                      ? 'Script Python prêt à l’emploi pour automatiser l’extraction depuis un terminal Linux/macOS/Windows :'
                      : 'Ready-to-use Python script to automate metadata extraction from Linux/macOS/Windows terminal:'}
                  </p>
                  <div className="relative">
                    <button
                      onClick={() => copyText(generatePythonReportScript(), 'python_script')}
                      className="absolute top-2.5 right-2.5 flex items-center space-x-1 px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs z-10"
                    >
                      {copiedKey === 'python_script' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'python_script' ? (isFr ? 'Copié !' : 'Copied!') : (isFr ? 'Copier' : 'Copy')}</span>
                    </button>
                    <pre className="p-4 bg-[#0F0C0A] border border-stone-800 rounded-xl text-xs font-mono text-emerald-300 max-h-56 overflow-y-auto">
                      {generatePythonReportScript()}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STANDALONE HTML CODE & DOWNLOADS */}
          {activeTab === 'code' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Data Dictionary HTML */}
                <div className="p-5 rounded-xl border border-stone-800 bg-stone-900/90 space-y-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                      <TableProperties className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-100">
                        {isFr ? 'Dictionnaire de Données (HTML)' : 'Data Dictionary (HTML)'}
                      </h4>
                      <p className="text-[11px] text-stone-400">
                        {isFr ? 'Tables, colonnes typées, contraintes, KPIs & recherche' : 'Tables, typed columns, constraints, KPIs & live search'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      onClick={handleDownloadDataDictHtml}
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Télécharger .html' : 'Download .html'}</span>
                    </button>
                    <button
                      onClick={() => copyText(standaloneDataDictHtml, 'dict_html')}
                      className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold"
                    >
                      {copiedKey === 'dict_html' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Card 2: MPD Schematic HTML */}
                <div className="p-5 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                      <Network className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-100">
                        {isFr ? 'Modèle Physique de Données (MPD HTML)' : 'Physical Data Model (MPD HTML)'}
                      </h4>
                      <p className="text-[11px] text-stone-400">
                        {isFr ? 'Diagramme relationnel SVG, flèches, cardinalités & zoom' : 'SVG relational diagram, directional arrows, cardinalities & pan/zoom'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      onClick={handleDownloadMpdHtml}
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Télécharger MPD .html' : 'Download MPD .html'}</span>
                    </button>
                    <button
                      onClick={() => copyText(standaloneMpdHtml, 'mpd_html')}
                      className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold"
                    >
                      {copiedKey === 'mpd_html' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Code Preview snippet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span>{isFr ? 'Aperçu du code source HTML du Dictionnaire :' : 'HTML Source preview (Data Dictionary):'}</span>
                  <span className="font-mono text-[11px] text-stone-500">{((standaloneDataDictHtml || '').length / 1024).toFixed(1)} KB</span>
                </div>
                <textarea
                  readOnly
                  value={(standaloneDataDictHtml || '').slice(0, 4000) + '\n\n/* ... (contenu complet généré prêt au téléchargement) ... */'}
                  className="w-full h-56 p-4 bg-[#0D0A08] border border-stone-800 rounded-xl text-xs font-mono text-stone-400 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between text-xs font-mono ${
          theme === 'light' ? 'bg-[#FDFBF8] border-[#E2DBD0] text-stone-500' : 'bg-[#181310] border-stone-800 text-stone-400'
        }`}>
          <div className="flex items-center space-x-2">
            <span>Format: <strong>HTML5 Standalone</strong></span>
            <span>&bull;</span>
            <span>Langue: <strong className="text-amber-500">{reportLang.toUpperCase()}</strong></span>
            <span>&bull;</span>
            <span>Types: <strong>PostgreSQL Standard</strong></span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownloadDataDictHtml}
              className="text-amber-500 hover:underline flex items-center space-x-1 font-sans font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFr ? 'Exporter Dictionnaire' : 'Export Dictionary'}</span>
            </button>
            <span>&bull;</span>
            <button
              onClick={handleDownloadMpdHtml}
              className="text-purple-400 hover:underline flex items-center space-x-1 font-sans font-bold"
            >
              <Network className="w-3.5 h-3.5" />
              <span>{isFr ? 'Exporter MPD (ERD)' : 'Export MPD'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
