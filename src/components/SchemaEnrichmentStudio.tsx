/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileCode2,
  FolderInput,
  KeyRound,
  RotateCcw,
  Search,
  Square,
  Terminal,
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import {
  ArcpyGenerationMode,
  EnrichmentColumnSpec,
  EnrichmentFieldType,
  EnrichmentScriptEngine,
  NamingConvention,
  OverwritePolicy,
  SqlDialect,
  SqlGenerationMode,
  formatColumnName,
  generateEnrichmentScript,
  mapTypeToArcpy,
  mapTypeToSql,
  parseExistingTargetColumns,
  profileSourceColumns,
  sanitizeArcpyFieldName,
  sanitizeSqlName,
} from '../core/enrichmentScriptGenerator';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';

interface SchemaEnrichmentStudioProps {
  datasets: SpatialDataset[];
  initialSourceDatasetId?: string | null;
  onGoToWorkspace: () => void;
}

const FIELD_TYPES: { value: EnrichmentFieldType; label: string }[] = [
  { value: 'string', label: 'Text / String' },
  { value: 'smallint', label: 'SmallInt (16-bit)' },
  { value: 'integer', label: 'Integer (32-bit)' },
  { value: 'bigint', label: 'BigInt (64-bit)' },
  { value: 'double', label: 'Double / Float' },
  { value: 'date', label: 'Date' },
  { value: 'timestamp', label: 'Timestamp' },
  { value: 'boolean', label: 'Boolean' },
];

function guessBestJoinKey(sourceFields: string[], targetFields?: string[]): { sourceKey: string; targetKey: string } {
  const priorityPatterns = [/^id$/i, /^code/i, /^gid$/i, /^id_/i, /_id$/i, /^matricule/i, /^num/i, /^ref/i, /^cle/i, /^key/i];

  if (targetFields && targetFields.length > 0) {
    const targetLowerMap = new Map(targetFields.map((f) => [f.toLowerCase(), f]));
    // First look for priority name exact matches
    for (const pat of priorityPatterns) {
      const match = sourceFields.find((sf) => pat.test(sf) && targetLowerMap.has(sf.toLowerCase()));
      if (match) {
        return { sourceKey: match, targetKey: targetLowerMap.get(match.toLowerCase())! };
      }
    }
    // Any exact case-insensitive match excluding system fields
    for (const sf of sourceFields) {
      if (/^(objectid|fid|ogc_fid|shape|geom|geometry)$/i.test(sf)) continue;
      if (targetLowerMap.has(sf.toLowerCase())) {
        return { sourceKey: sf, targetKey: targetLowerMap.get(sf.toLowerCase())! };
      }
    }
  }

  for (const pat of priorityPatterns) {
    const match = sourceFields.find((sf) => pat.test(sf));
    if (match) {
      return { sourceKey: match, targetKey: targetFields?.[0] || match };
    }
  }

  const fallback = sourceFields.find((sf) => !/^(objectid|fid|ogc_fid|shape|geom|geometry)$/i.test(sf)) || sourceFields[0] || 'id';
  return { sourceKey: fallback, targetKey: targetFields?.[0] || fallback };
}

export const SchemaEnrichmentStudio: React.FC<SchemaEnrichmentStudioProps> = ({
  datasets,
  initialSourceDatasetId,
  onGoToWorkspace,
}) => {
  const { theme } = useTheme();
  const { lang } = useI18n();
  const isFr = lang === 'fr';
  const isLight = theme === 'light';

  // Engine selection
  const [engine, setEngine] = useState<EnrichmentScriptEngine>('arcpy');

  // Source & target dataset selection
  const [sourceDatasetId, setSourceDatasetId] = useState<string>(() => {
    if (initialSourceDatasetId && datasets.some((d) => d.id === initialSourceDatasetId)) {
      return initialSourceDatasetId;
    }
    return datasets[0]?.id || '';
  });

  const [targetSourceMode, setTargetSourceMode] = useState<'external' | 'workspace'>('external');
  const [workspaceTargetId, setWorkspaceTargetId] = useState<string>('');
  const [pastedTargetColumns, setPastedTargetColumns] = useState<string>('');
  const [showExistingColsBox, setShowExistingColsBox] = useState<boolean>(false);

  // External target & source naming
  const [targetSchema, setTargetSchema] = useState<string>('public');
  const [targetTableName, setTargetTableName] = useState<string>('table_cible');
  const [sourceSchema, setSourceSchema] = useState<string>('public');
  const [sourceTableName, setSourceTableName] = useState<string>('');

  // ArcPy specific settings
  const [arcpyTargetPath, setArcpyTargetPath] = useState<string>('C:\\SIG\\BaseDonnees.gdb\\table_cible');
  const [arcpySourcePath, setArcpySourcePath] = useState<string>('');
  const [arcpyMode, setArcpyMode] = useState<ArcpyGenerationMode>('add_and_update_cursor');
  const [arcpyUseEditSession, setArcpyUseEditSession] = useState<boolean>(false);
  const [arcpyAddMessages, setArcpyAddMessages] = useState<boolean>(true);

  // SQL specific settings
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgresql');
  const [sqlMode, setSqlMode] = useState<SqlGenerationMode>('alter_and_update');
  const [sqlWrapTransaction, setSqlWrapTransaction] = useState<boolean>(true);
  const [sqlIncludeComments, setSqlIncludeComments] = useState<boolean>(true);

  // Join & populate settings
  const [sourceJoinKey, setSourceJoinKey] = useState<string>('');
  const [targetJoinKey, setTargetJoinKey] = useState<string>('');
  const [caseInsensitiveJoin, setCaseInsensitiveJoin] = useState<boolean>(true);
  const [overwritePolicy, setOverwritePolicy] = useState<OverwritePolicy>('overwrite');
  const [embeddedRowLimit, setEmbeddedRowLimit] = useState<number>(500);

  // Column customization
  const [namingConvention, setNamingConvention] = useState<NamingConvention>('keep');
  const [columnPrefix, setColumnPrefix] = useState<string>('');
  const [columnSearch, setColumnSearch] = useState<string>('');
  const [columns, setColumns] = useState<EnrichmentColumnSpec[]>([]);

  // Copy feedback
  const [copied, setCopied] = useState<boolean>(false);

  // Sync initialSourceDatasetId when navigated from workspace
  useEffect(() => {
    if (initialSourceDatasetId && datasets.some((d) => d.id === initialSourceDatasetId)) {
      setSourceDatasetId(initialSourceDatasetId);
    } else if (!datasets.some((d) => d.id === sourceDatasetId)) {
      setSourceDatasetId(datasets[0]?.id || '');
    }
  }, [initialSourceDatasetId, datasets, sourceDatasetId]);

  const sourceDataset = useMemo(
    () => datasets.find((d) => d.id === sourceDatasetId) || datasets[0] || null,
    [datasets, sourceDatasetId]
  );

  const otherDatasets = useMemo(
    () => datasets.filter((d) => d.id !== sourceDataset?.id),
    [datasets, sourceDataset]
  );

  // Keep workspace target valid
  useEffect(() => {
    if (targetSourceMode === 'workspace') {
      if (otherDatasets.length === 0) {
        setTargetSourceMode('external');
        setWorkspaceTargetId('');
      } else if (!otherDatasets.some((d) => d.id === workspaceTargetId)) {
        setWorkspaceTargetId(otherDatasets[0].id);
      }
    }
  }, [targetSourceMode, otherDatasets, workspaceTargetId]);

  const workspaceTargetDataset = useMemo(
    () => (targetSourceMode === 'workspace' ? otherDatasets.find((d) => d.id === workspaceTargetId) || null : null),
    [targetSourceMode, otherDatasets, workspaceTargetId]
  );

  // Existing target columns set (either from workspace target or pasted text)
  const existingTargetColumnSet = useMemo(() => {
    if (workspaceTargetDataset) {
      return new Set(workspaceTargetDataset.fields.map((f) => f.name.toLowerCase()));
    }
    return parseExistingTargetColumns(pastedTargetColumns);
  }, [workspaceTargetDataset, pastedTargetColumns]);

  // Update default source paths/names when sourceDataset changes
  useEffect(() => {
    if (!sourceDataset) {
      setColumns([]);
      return;
    }

    const cleanSourceTable = sanitizeSqlName(sourceDataset.name).toLowerCase();
    setSourceTableName(cleanSourceTable);

    const ext = sourceDataset.format === 'excel' ? '.xlsx'
      : sourceDataset.format === 'csv' ? '.csv'
      : sourceDataset.format === 'shapefile' ? '.shp'
      : sourceDataset.format === 'filegdb' ? ''
      : '';
    const origName = sourceDataset.originalFileName || `${sourceDataset.name}${ext}`;
    if (sourceDataset.format === 'filegdb') {
      setArcpySourcePath(`C:\\SIG\\Source.gdb\\${sanitizeArcpyFieldName(sourceDataset.name)}`);
    } else {
      setArcpySourcePath(`C:\\SIG\\Donnees\\${origName}`);
    }

    const profiled = profileSourceColumns(sourceDataset, existingTargetColumnSet, namingConvention, columnPrefix);
    setColumns(profiled);

    const srcFieldNames = profiled.map((c) => c.sourceName);
    const tgtFieldNames = workspaceTargetDataset?.fields.map((f) => f.name);
    const guessed = guessBestJoinKey(srcFieldNames, tgtFieldNames);
    setSourceJoinKey(guessed.sourceKey);
    setTargetJoinKey(guessed.targetKey);
  }, [sourceDataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When workspace target changes, sync target name, path, join keys, and schema diff
  useEffect(() => {
    if (!sourceDataset) return;

    if (workspaceTargetDataset) {
      const cleanTgt = sanitizeSqlName(workspaceTargetDataset.name).toLowerCase();
      setTargetTableName(cleanTgt);
      setArcpyTargetPath(`C:\\SIG\\BaseDonnees.gdb\\${sanitizeArcpyFieldName(workspaceTargetDataset.name)}`);

      const srcFieldNames = sourceDataset.fields.map((f) => f.name);
      const tgtFieldNames = workspaceTargetDataset.fields.map((f) => f.name);
      const guessed = guessBestJoinKey(srcFieldNames, tgtFieldNames);
      setSourceJoinKey(guessed.sourceKey);
      setTargetJoinKey(guessed.targetKey);
    }
  }, [workspaceTargetDataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-evaluate existsInTarget whenever existingTargetColumnSet changes without wiping manual type/length edits
  useEffect(() => {
    setColumns((prev) =>
      prev.map((col) => {
        const exists =
          existingTargetColumnSet.has(col.sourceName.toLowerCase()) ||
          existingTargetColumnSet.has(col.targetName.toLowerCase());
        const wasExisting = col.existsInTarget;
        const isSystemOid = /^(objectid|fid|ogc_fid|shape|shape_length|shape_area|geom|geometry)$/i.test(col.sourceName);
        return {
          ...col,
          existsInTarget: exists,
          // Auto-unselect if it just became detected as existing, or auto-select if it's newly missing (and not system OID)
          selected: exists !== wasExisting ? (!exists && !isSystemOid) : col.selected,
        };
      })
    );
  }, [existingTargetColumnSet]);

  // Apply naming convention or prefix changes across all columns
  const applyNamingRules = (nextConvention: NamingConvention, nextPrefix: string) => {
    setNamingConvention(nextConvention);
    setColumnPrefix(nextPrefix);
    setColumns((prev) =>
      prev.map((col) => {
        const nextTargetName = formatColumnName(col.sourceName, nextConvention, nextPrefix);
        const exists =
          existingTargetColumnSet.has(col.sourceName.toLowerCase()) ||
          existingTargetColumnSet.has(nextTargetName.toLowerCase());
        return {
          ...col,
          targetName: nextTargetName,
          existsInTarget: exists,
        };
      })
    );
  };

  // Switch SQL schema default neatly when dialect switches
  const handleSqlDialectChange = (nextDialect: SqlDialect) => {
    setSqlDialect(nextDialect);
    if (nextDialect === 'sqlserver' && targetSchema === 'public') {
      setTargetSchema('dbo');
      if (sourceSchema === 'public') setSourceSchema('dbo');
    } else if (nextDialect === 'postgresql' && targetSchema === 'dbo') {
      setTargetSchema('public');
      if (sourceSchema === 'dbo') setSourceSchema('public');
    } else if (nextDialect === 'oracle' && (targetSchema === 'public' || targetSchema === 'dbo')) {
      setTargetSchema('');
      if (sourceSchema === 'public' || sourceSchema === 'dbo') setSourceSchema('');
    }
  };

  // Update a single column property
  const updateColumn = (sourceName: string, patch: Partial<EnrichmentColumnSpec>) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.sourceName !== sourceName) return col;
        const updated = { ...col, ...patch };
        if (patch.targetName !== undefined) {
          updated.existsInTarget =
            existingTargetColumnSet.has(col.sourceName.toLowerCase()) ||
            existingTargetColumnSet.has(patch.targetName.trim().toLowerCase());
        }
        if (patch.targetType === 'string' && (!updated.length || updated.length <= 0)) {
          updated.length = Math.max(50, Math.min(255, updated.maxObservedLength || 100));
        }
        return updated;
      })
    );
  };

  const selectMissingOnly = () => {
    setColumns((prev) =>
      prev.map((c) => {
        const isSystemOid = /^(objectid|fid|ogc_fid|shape|shape_length|shape_area|geom|geometry)$/i.test(c.sourceName);
        return { ...c, selected: !c.existsInTarget && !isSystemOid };
      })
    );
  };

  const selectAllColumns = () => {
    setColumns((prev) => prev.map((c) => ({ ...c, selected: true })));
  };

  const selectNoColumns = () => {
    setColumns((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const resetColumnsFromProfile = () => {
    if (!sourceDataset) return;
    setNamingConvention('keep');
    setColumnPrefix('');
    setColumns(profileSourceColumns(sourceDataset, existingTargetColumnSet, 'keep', ''));
  };

  // Generate script reactively
  const generatedResult = useMemo(() => {
    if (!sourceDataset) return null;
    return generateEnrichmentScript({
      engine,
      sourceDataset,
      targetSchema,
      targetTableName,
      sourceSchema,
      sourceTableName,
      arcpyTargetPath,
      arcpySourcePath,
      arcpyMode,
      arcpyUseEditSession,
      arcpyAddMessages,
      sqlDialect,
      sqlMode,
      sqlWrapTransaction,
      sqlIncludeComments,
      targetJoinKey,
      sourceJoinKey,
      caseInsensitiveJoin,
      overwritePolicy,
      embeddedRowLimit,
      columns,
    });
  }, [
    engine,
    sourceDataset,
    targetSchema,
    targetTableName,
    sourceSchema,
    sourceTableName,
    arcpyTargetPath,
    arcpySourcePath,
    arcpyMode,
    arcpyUseEditSession,
    arcpyAddMessages,
    sqlDialect,
    sqlMode,
    sqlWrapTransaction,
    sqlIncludeComments,
    targetJoinKey,
    sourceJoinKey,
    caseInsensitiveJoin,
    overwritePolicy,
    embeddedRowLimit,
    columns,
  ]);

  const filteredColumns = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter(
      (c) =>
        c.sourceName.toLowerCase().includes(q) ||
        c.targetName.toLowerCase().includes(q) ||
        c.alias.toLowerCase().includes(q)
    );
  }, [columns, columnSearch]);

  const codeLines = useMemo(() => {
    if (!generatedResult) return [];
    return generatedResult.code.split('\n');
  }, [generatedResult]);

  const handleCopy = async () => {
    if (!generatedResult) return;
    try {
      await navigator.clipboard.writeText(generatedResult.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = generatedResult.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    if (!generatedResult) return;
    const mime = generatedResult.fileExtension === 'py' ? 'text/x-python;charset=utf-8' : 'application/sql;charset=utf-8';
    const blob = new Blob([generatedResult.code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedResult.suggestedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const needsJoinConfig =
    (engine === 'arcpy' && arcpyMode !== 'add_fields_only') ||
    (engine === 'sql' && sqlMode !== 'alter_only');

  const isEmbeddedMode =
    (engine === 'arcpy' && arcpyMode === 'standalone_embedded') ||
    (engine === 'sql' && sqlMode === 'standalone_embedded');

  const needsExternalSourceRef =
    (engine === 'arcpy' && (arcpyMode === 'add_and_update_cursor' || arcpyMode === 'join_field')) ||
    (engine === 'sql' && sqlMode === 'alter_and_update');

  // Shared surface styles (single-elevation, hairline borders, high contrast in both themes)
  const panelBg = isLight ? 'bg-white border-[#E2DBD0]' : 'bg-[#181411] border-white/[0.08]';
  const subSurface = isLight ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#13110E] border-white/[0.08]';
  const inputCls = isLight
    ? 'bg-white border-[#D6CEBE] text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none'
    : 'bg-[#120F0D] border-stone-700/80 text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:outline-none';
  const mutedText = isLight ? 'text-stone-500' : 'text-stone-400';
  const labelText = isLight ? 'text-stone-700' : 'text-stone-300';

  // Empty state when no dataset is imported
  if (!sourceDataset) {
    return (
      <div className={`flex-1 flex items-center justify-center p-8 overflow-y-auto ${isLight ? 'bg-[#F8F6F1]' : 'bg-[#13110E]'}`}>
        <div className={`max-w-xl w-full rounded-xl border p-8 ${panelBg}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
              isLight ? 'bg-[#FAF6EE] border-[#E2DBD0] text-amber-700' : 'bg-[#201A15] border-white/[0.08] text-amber-400'
            }`}>
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight">
                {isFr ? 'Générateur de Scripts d\'Enrichissement (ArcPy & SQL)' : 'Schema Enrichment Script Generator (ArcPy & SQL)'}
              </h1>
              <p className={`text-xs ${mutedText}`}>
                {isFr
                  ? 'Ajoutez automatiquement les colonnes manquantes à une table cible et alimentez-la depuis vos fichiers.'
                  : 'Automatically generate scripts to add missing columns to a target table and populate values.'}
              </p>
            </div>
          </div>

          <div className={`rounded-lg border p-4 mb-6 space-y-2.5 text-xs ${subSurface}`}>
            <div className="flex items-start gap-2.5">
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">01.</span>
              <p className={labelText}>
                {isFr
                  ? 'Importez le fichier source dans l\'espace de travail (Excel, CSV, Shapefile, GeoPackage, FileGDB ou GeoJSON).'
                  : 'Import your feeding source file into the Workspace (Excel, CSV, Shapefile, GeoPackage, FileGDB, or GeoJSON).'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">02.</span>
              <p className={labelText}>
                {isFr
                  ? 'Indiquez la table cible (externe ou déjà importée) pour détecter les colonnes manquantes et ajuster les types.'
                  : 'Point to your target table (external or imported in workspace) to diff missing columns and verify types/lengths.'}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">03.</span>
              <p className={labelText}>
                {isFr
                  ? 'Téléchargez un script ArcPy (.py) ou SQL (.sql — PostgreSQL, SQL Server, Oracle, SQLite) prêt à exécuter.'
                  : 'Download a ready-to-run ArcPy (.py) or SQL (.sql — PostgreSQL, SQL Server, Oracle, SQLite) script.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToWorkspace}
            className="inline-flex items-center gap-2 rounded-lg bg-[#A87945] px-4 py-2.5 text-xs font-semibold text-stone-950 hover:bg-[#B98953] transition-colors cursor-pointer"
          >
            <FolderInput className="w-4 h-4" />
            <span>{isFr ? 'Importer un fichier dans l\'Espace de Travail' : 'Import a Dataset in Workspace'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const selectedCount = columns.filter((c) => c.selected).length;
  const missingCount = columns.filter((c) => !c.existsInTarget).length;

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isLight ? 'bg-[#F8F6F1] text-stone-900' : 'bg-[#13110E] text-stone-100'}`}>
      {/* Top Action & Context Bar */}
      <div className={`shrink-0 border-b px-5 py-3 flex flex-wrap items-center justify-between gap-4 ${
        isLight ? 'bg-white border-[#E2DBD0]' : 'bg-[#181411] border-white/[0.08]'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
            isLight ? 'bg-[#FAF6EE] border-[#E2DBD0] text-amber-700' : 'bg-[#201A15] border-white/[0.08] text-amber-400'
          }`}>
            <FileCode2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-sm font-bold tracking-tight truncate">
              {isFr ? 'Générateur de Scripts d\'Enrichissement de Schéma' : 'Schema Enrichment Script Studio'}
            </h1>
            <div className={`flex items-center gap-2 text-[11px] font-mono tabular-nums ${mutedText}`}>
              <span>
                {selectedCount} {isFr ? 'sélectionnées' : 'selected'}
              </span>
              <span>·</span>
              <span>
                {missingCount} {isFr ? 'manquantes' : 'missing'}
              </span>
              <span>·</span>
              <span>
                {sourceDataset.featureCount.toLocaleString()} {isFr ? 'lignes sources' : 'source rows'}
              </span>
              {generatedResult && (
                <>
                  <span>·</span>
                  <span>
                    {generatedResult.lineCount} {isFr ? 'lignes de script' : 'script lines'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Engine Segmented Switcher */}
        <div className="flex items-center gap-3">
          <div className={`inline-flex rounded-lg border p-0.5 ${subSurface}`}>
            <button
              type="button"
              onClick={() => setEngine('arcpy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                engine === 'arcpy'
                  ? 'bg-[#A87945] text-stone-950 font-semibold'
                  : isLight
                    ? 'text-stone-600 hover:text-stone-950'
                    : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>ArcPy (.py)</span>
            </button>
            <button
              type="button"
              onClick={() => setEngine('sql')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                engine === 'sql'
                  ? 'bg-[#A87945] text-stone-950 font-semibold'
                  : isLight
                    ? 'text-stone-600 hover:text-stone-950'
                    : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>SQL (.sql)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] overflow-hidden">
        {/* LEFT PANE: Configuration & Column Mapping */}
        <div className={`overflow-y-auto p-5 space-y-5 border-r ${
          isLight ? 'border-[#E2DBD0]' : 'border-white/[0.08]'
        }`}>
          {/* 1. Source & Target Definition */}
          <section className={`rounded-xl border p-4 space-y-4 ${panelBg}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {isFr ? '1. Table Source & Table Cible' : '1. Source & Target Tables'}
              </h2>
              <div className={`inline-flex rounded-md border p-0.5 text-[11px] ${subSurface}`}>
                <button
                  type="button"
                  onClick={() => setTargetSourceMode('external')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    targetSourceMode === 'external'
                      ? isLight
                        ? 'bg-white text-stone-900 font-semibold shadow-xs'
                        : 'bg-white/[0.1] text-stone-100 font-semibold'
                      : mutedText
                  }`}
                >
                  {isFr ? 'Table cible externe' : 'External target'}
                </button>
                <button
                  type="button"
                  disabled={otherDatasets.length === 0}
                  onClick={() => setTargetSourceMode('workspace')}
                  title={
                    otherDatasets.length === 0
                      ? (isFr ? 'Importez au moins 2 tables dans l\'espace de travail pour activer la comparaison directe' : 'Import at least 2 datasets to compare directly')
                      : undefined
                  }
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    targetSourceMode === 'workspace'
                      ? isLight
                        ? 'bg-white text-stone-900 font-semibold shadow-xs'
                        : 'bg-white/[0.1] text-stone-100 font-semibold'
                      : mutedText
                  }`}
                >
                  {isFr ? 'Table du Workspace' : 'Workspace target'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Source Dataset */}
              <div className="space-y-1.5">
                <label className={`block text-[11px] font-medium ${labelText}`}>
                  {isFr ? 'Fichier source (qui alimente les nouvelles colonnes)' : 'Source dataset (feeding new columns)'}
                </label>
                <select
                  value={sourceDataset.id}
                  onChange={(e) => setSourceDatasetId(e.target.value)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-xs font-medium ${inputCls}`}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.format.toUpperCase()} · {d.fields.length} col · {d.featureCount} lig)
                    </option>
                  ))}
                </select>
                <p className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
                  {sourceDataset.originalFileName} · {sourceDataset.isNonSpatial ? (isFr ? 'Table non spatiale' : 'Non-spatial table') : sourceDataset.geometryType}
                </p>
              </div>

              {/* Workspace Target OR External Target Name */}
              {targetSourceMode === 'workspace' ? (
                <div className="space-y-1.5">
                  <label className={`block text-[11px] font-medium ${labelText}`}>
                    {isFr ? 'Table cible (comparaison automatique du schéma)' : 'Target dataset (automatic schema diff)'}
                  </label>
                  <select
                    value={workspaceTargetId}
                    onChange={(e) => setWorkspaceTargetId(e.target.value)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-xs font-medium ${inputCls}`}
                  >
                    {otherDatasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.fields.length} col · {d.featureCount} lig)
                      </option>
                    ))}
                  </select>
                  {workspaceTargetDataset && (
                    <p className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
                      {existingTargetColumnSet.size} {isFr ? 'colonnes déjà présentes dans la cible' : 'existing columns detected in target'}
                    </p>
                  )}
                </div>
              ) : engine === 'sql' ? (
                <div className="grid grid-cols-[96px_1fr] gap-2">
                  <div className="space-y-1.5">
                    <label className={`block text-[11px] font-medium ${labelText}`}>
                      {isFr ? 'Schéma' : 'Schema'}
                    </label>
                    <input
                      type="text"
                      value={targetSchema}
                      onChange={(e) => setTargetSchema(e.target.value)}
                      disabled={sqlDialect === 'sqlite'}
                      placeholder={sqlDialect === 'sqlserver' ? 'dbo' : 'public'}
                      className={`w-full rounded-lg border px-2.5 py-2 text-xs font-mono disabled:opacity-40 ${inputCls}`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={`block text-[11px] font-medium ${labelText}`}>
                      {isFr ? 'Nom de la table cible' : 'Target table name'}
                    </label>
                    <input
                      type="text"
                      value={targetTableName}
                      onChange={(e) => setTargetTableName(e.target.value)}
                      placeholder="ma_table_cible"
                      className={`w-full rounded-lg border px-2.5 py-2 text-xs font-mono ${inputCls}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className={`block text-[11px] font-medium ${labelText}`}>
                    {isFr ? 'Chemin de la classe d\'entités / table cible (GDB, SDE, SHP)' : 'Target Feature Class / Table path (GDB, SDE, SHP)'}
                  </label>
                  <input
                    type="text"
                    value={arcpyTargetPath}
                    onChange={(e) => {
                      setArcpyTargetPath(e.target.value);
                      const lastSeg = e.target.value.split(/[\\/]/).filter(Boolean).pop();
                      if (lastSeg) setTargetTableName(lastSeg.replace(/\.[^.]+$/, ''));
                    }}
                    placeholder="C:\SIG\BaseDonnees.gdb\parcelles"
                    className={`w-full rounded-lg border px-2.5 py-2 text-xs font-mono ${inputCls}`}
                  />
                </div>
              )}
            </div>

            {/* Secondary path / source table row when needed */}
            {needsExternalSourceRef && (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.06]'}`}>
                {engine === 'sql' ? (
                  <>
                    <div className="grid grid-cols-[96px_1fr] gap-2">
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-medium ${labelText}`}>
                          {isFr ? 'Schéma source' : 'Source schema'}
                        </label>
                        <input
                          type="text"
                          value={sourceSchema}
                          onChange={(e) => setSourceSchema(e.target.value)}
                          disabled={sqlDialect === 'sqlite'}
                          placeholder={sqlDialect === 'sqlserver' ? 'dbo' : 'public'}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono disabled:opacity-40 ${inputCls}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-medium ${labelText}`}>
                          {isFr ? 'Table source / staging en BDD' : 'Source / staging table in DB'}
                        </label>
                        <input
                          type="text"
                          value={sourceTableName}
                          onChange={(e) => setSourceTableName(e.target.value)}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                        />
                      </div>
                    </div>
                    {targetSourceMode === 'workspace' && (
                      <div className="grid grid-cols-[96px_1fr] gap-2">
                        <div className="space-y-1">
                          <label className={`block text-[11px] font-medium ${labelText}`}>
                            {isFr ? 'Schéma cible' : 'Target schema'}
                          </label>
                          <input
                            type="text"
                            value={targetSchema}
                            onChange={(e) => setTargetSchema(e.target.value)}
                            disabled={sqlDialect === 'sqlite'}
                            className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono disabled:opacity-40 ${inputCls}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={`block text-[11px] font-medium ${labelText}`}>
                            {isFr ? 'Nom SQL table cible' : 'Target SQL table name'}
                          </label>
                          <input
                            type="text"
                            value={targetTableName}
                            onChange={(e) => setTargetTableName(e.target.value)}
                            className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className={`block text-[11px] font-medium ${labelText}`}>
                        {isFr ? 'Chemin du fichier source sur disque (CSV, XLSX, GDB, SHP)' : 'Source table/file path on disk (CSV, XLSX, GDB, SHP)'}
                      </label>
                      <input
                        type="text"
                        value={arcpySourcePath}
                        onChange={(e) => setArcpySourcePath(e.target.value)}
                        placeholder="C:\SIG\Donnees\source.xlsx"
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                      />
                    </div>
                    {targetSourceMode === 'workspace' && (
                      <div className="space-y-1">
                        <label className={`block text-[11px] font-medium ${labelText}`}>
                          {isFr ? 'Chemin cible ArcGIS (GDB / SDE)' : 'ArcGIS Target Path (GDB / SDE)'}
                        </label>
                        <input
                          type="text"
                          value={arcpyTargetPath}
                          onChange={(e) => setArcpyTargetPath(e.target.value)}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Collapsible: Paste existing target columns for diffing when external */}
            {targetSourceMode === 'external' && (
              <div className={`pt-2 border-t ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.06]'}`}>
                <button
                  type="button"
                  onClick={() => setShowExistingColsBox((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    isLight ? 'text-stone-700 hover:text-amber-800' : 'text-stone-300 hover:text-amber-300'
                  }`}
                >
                  {showExistingColsBox ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>
                    {isFr
                      ? 'Comparer avec les colonnes déjà existantes dans la table cible (optionnel)'
                      : 'Diff against existing columns in target table (optional)'}
                  </span>
                  {existingTargetColumnSet.size > 0 && (
                    <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
                      · {existingTargetColumnSet.size} {isFr ? 'détectées' : 'matched'}
                    </span>
                  )}
                </button>

                {showExistingColsBox && (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      rows={2}
                      value={pastedTargetColumns}
                      onChange={(e) => setPastedTargetColumns(e.target.value)}
                      placeholder={
                        isFr
                          ? 'Collez les noms des colonnes déjà présentes dans votre table cible (séparés par virgule, point-virgule ou retour à la ligne), ex: id, code_commune, nom, geom'
                          : 'Paste existing target column names (comma, semicolon, or newline separated), e.g. id, code_commune, name, geom'
                      }
                      className={`w-full rounded-lg border px-2.5 py-2 text-xs font-mono ${inputCls}`}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Script Mode & Join Rules */}
          <section className={`rounded-xl border p-4 space-y-4 ${panelBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {isFr ? '2. Mode de Génération & Jointure' : '2. Generation Mode & Join Rules'}
              </h2>

              {engine === 'sql' && (
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${mutedText}`}>{isFr ? 'Dialecte SQL :' : 'SQL Dialect:'}</span>
                  <select
                    value={sqlDialect}
                    onChange={(e) => handleSqlDialectChange(e.target.value as SqlDialect)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${inputCls}`}
                  >
                    <option value="postgresql">PostgreSQL / PostGIS</option>
                    <option value="sqlserver">SQL Server (T-SQL)</option>
                    <option value="oracle">Oracle (PL/SQL)</option>
                    <option value="sqlite">SQLite / GeoPackage</option>
                  </select>
                </div>
              )}
            </div>

            {/* Mode selector buttons */}
            {engine === 'arcpy' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {([
                  {
                    id: 'add_fields_only',
                    title: isFr ? 'AddFields seul' : 'AddFields only',
                    desc: isFr ? 'Crée uniquement les colonnes manquantes' : 'Create missing fields only',
                  },
                  {
                    id: 'add_and_update_cursor',
                    title: isFr ? 'AddFields + UpdateCursor' : 'AddFields + UpdateCursor',
                    desc: isFr ? 'Crée les champs et remplit depuis le fichier' : 'Add fields & populate via da.UpdateCursor',
                  },
                  {
                    id: 'join_field',
                    title: isFr ? 'JoinField natif' : 'Native JoinField',
                    desc: isFr ? 'Transfert direct via arcpy.management.JoinField' : 'Direct transfer via arcpy.management.JoinField',
                  },
                  {
                    id: 'standalone_embedded',
                    title: isFr ? 'Autonome (embarqué)' : 'Standalone (embedded)',
                    desc: isFr ? 'Données incluses dans le .py (aucun fichier requis)' : 'Lookup data embedded in .py (zero external file)',
                  },
                ] as const).map((m) => {
                  const active = arcpyMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setArcpyMode(m.id)}
                      className={`text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        active
                          ? isLight
                            ? 'border-amber-600 bg-[#FAF6EE]'
                            : 'border-amber-500/80 bg-amber-500/[0.08]'
                          : isLight
                            ? 'border-[#E2DBD0] hover:bg-[#FAF8F5]'
                            : 'border-white/[0.08] hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.title}</div>
                      <div className={`text-[11px] mt-0.5 leading-snug ${mutedText}`}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  {
                    id: 'alter_only',
                    title: isFr ? 'ALTER TABLE seul' : 'ALTER TABLE only',
                    desc: isFr ? 'Ajoute les colonnes manquantes de manière idempotente' : 'Idempotently add missing columns only',
                  },
                  {
                    id: 'alter_and_update',
                    title: isFr ? 'ALTER + UPDATE FROM' : 'ALTER + UPDATE FROM',
                    desc: isFr ? 'Ajoute les colonnes puis met à jour depuis la table source' : 'Add columns and populate via keyed UPDATE/MERGE',
                  },
                  {
                    id: 'standalone_embedded',
                    title: isFr ? 'Autonome (VALUES embarqués)' : 'Standalone (embedded VALUES)',
                    desc: isFr ? 'Embarque les données directement dans le .sql' : 'Embeds rows directly inside the .sql script',
                  },
                ] as const).map((m) => {
                  const active = sqlMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSqlMode(m.id)}
                      className={`text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                        active
                          ? isLight
                            ? 'border-amber-600 bg-[#FAF6EE]'
                            : 'border-amber-500/80 bg-amber-500/[0.08]'
                          : isLight
                            ? 'border-[#E2DBD0] hover:bg-[#FAF8F5]'
                            : 'border-white/[0.08] hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.title}</div>
                      <div className={`text-[11px] mt-0.5 leading-snug ${mutedText}`}>{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Join Key & Overwrite Options */}
            {needsJoinConfig && (
              <div className={`pt-3 border-t space-y-3 ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.06]'}`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className={`flex items-center gap-1 text-[11px] font-medium ${labelText}`}>
                      <KeyRound className="w-3 h-3 text-amber-500" />
                      <span>{isFr ? 'Clé de jointure (source)' : 'Source join key'}</span>
                    </label>
                    <select
                      value={sourceJoinKey}
                      onChange={(e) => setSourceJoinKey(e.target.value)}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                    >
                      {columns.map((c) => (
                        <option key={c.sourceName} value={c.sourceName}>
                          {c.sourceName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={`flex items-center gap-1 text-[11px] font-medium ${labelText}`}>
                      <KeyRound className="w-3 h-3 text-amber-500" />
                      <span>{isFr ? 'Clé de jointure (cible)' : 'Target join key'}</span>
                    </label>
                    {workspaceTargetDataset ? (
                      <select
                        value={targetJoinKey}
                        onChange={(e) => setTargetJoinKey(e.target.value)}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                      >
                        {workspaceTargetDataset.fields.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={targetJoinKey}
                        onChange={(e) => setTargetJoinKey(e.target.value)}
                        placeholder={sourceJoinKey || 'id'}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className={`block text-[11px] font-medium ${labelText}`}>
                      {isFr ? 'Politique de mise à jour' : 'Update policy'}
                    </label>
                    <select
                      value={overwritePolicy}
                      onChange={(e) => setOverwritePolicy(e.target.value as OverwritePolicy)}
                      disabled={engine === 'arcpy' && arcpyMode === 'join_field'}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40 ${inputCls}`}
                    >
                      <option value="overwrite">
                        {isFr ? 'Écraser les valeurs existantes' : 'Overwrite existing values'}
                      </option>
                      <option value="fill_null_only">
                        {isFr ? 'Remplir uniquement si NULL' : 'Fill NULL values only'}
                      </option>
                    </select>
                  </div>
                </div>

                {/* Embedded Row Limit */}
                {isEmbeddedMode && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className={`text-[11px] font-medium ${labelText}`}>
                      {isFr ? 'Limite de lignes embarquées (0 = tout) :' : 'Embedded row limit (0 = all):'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50000}
                      value={embeddedRowLimit}
                      onChange={(e) => setEmbeddedRowLimit(Math.max(0, Number(e.target.value) || 0))}
                      className={`w-24 rounded-md border px-2 py-1 text-xs font-mono tabular-nums ${inputCls}`}
                    />
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      {[100, 500, 2000, 0].map((lim) => (
                        <button
                          key={lim}
                          type="button"
                          onClick={() => setEmbeddedRowLimit(lim)}
                          className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            embeddedRowLimit === lim
                              ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                              : isLight
                                ? 'border-[#D6CEBE] text-stone-600 hover:text-stone-950'
                                : 'border-stone-700 text-stone-400 hover:text-stone-100'
                          }`}
                        >
                          {lim === 0 ? (isFr ? 'Tout' : 'All') : lim}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Engine Options Checkboxes */}
            <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t text-xs ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.06]'}`}>
              {needsJoinConfig && !(engine === 'arcpy' && arcpyMode === 'join_field') && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={caseInsensitiveJoin}
                    onChange={(e) => setCaseInsensitiveJoin(e.target.checked)}
                    className="accent-amber-600 rounded"
                  />
                  <span className={labelText}>
                    {isFr ? 'Jointure tolérante (TRIM + casse)' : 'Case-insensitive TRIM join'}
                  </span>
                </label>
              )}

              {engine === 'sql' ? (
                <>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sqlWrapTransaction}
                      onChange={(e) => setSqlWrapTransaction(e.target.checked)}
                      className="accent-amber-600 rounded"
                    />
                    <span className={labelText}>
                      {isFr ? 'Transaction BEGIN / COMMIT' : 'Wrap in BEGIN / COMMIT'}
                    </span>
                  </label>
                  {(sqlDialect === 'postgresql' || sqlDialect === 'oracle') && (
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sqlIncludeComments}
                        onChange={(e) => setSqlIncludeComments(e.target.checked)}
                        className="accent-amber-600 rounded"
                      />
                      <span className={labelText}>COMMENT ON COLUMN</span>
                    </label>
                  )}
                </>
              ) : (
                <>
                  {arcpyMode !== 'add_fields_only' && arcpyMode !== 'join_field' && (
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={arcpyUseEditSession}
                        onChange={(e) => setArcpyUseEditSession(e.target.checked)}
                        className="accent-amber-600 rounded"
                      />
                      <span className={labelText}>
                        {isFr ? 'Session d\'édition SDE (arcpy.da.Editor)' : 'SDE Edit Session (arcpy.da.Editor)'}
                      </span>
                    </label>
                  )}
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={arcpyAddMessages}
                      onChange={(e) => setArcpyAddMessages(e.target.checked)}
                      className="accent-amber-600 rounded"
                    />
                    <span className={labelText}>arcpy.AddMessage</span>
                  </label>
                </>
              )}
            </div>
          </section>

          {/* 3. Column Selection & Mapping Table */}
          <section className={`rounded-xl border overflow-hidden ${panelBg}`}>
            <div className={`p-4 border-b space-y-3 ${isLight ? 'border-[#EBE5DC]' : 'border-white/[0.06]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {isFr ? '3. Colonnes à Créer & Types Cibles' : '3. Columns to Create & Target Types'}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <button
                    type="button"
                    onClick={selectMissingOnly}
                    className="font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    {isFr ? 'Manquantes uniquement' : 'Missing only'}
                  </button>
                  <span className={mutedText}>·</span>
                  <button
                    type="button"
                    onClick={selectAllColumns}
                    className={`hover:underline cursor-pointer ${labelText}`}
                  >
                    {isFr ? 'Tout' : 'All'}
                  </button>
                  <span className={mutedText}>·</span>
                  <button
                    type="button"
                    onClick={selectNoColumns}
                    className={`hover:underline cursor-pointer ${labelText}`}
                  >
                    {isFr ? 'Aucun' : 'None'}
                  </button>
                  <span className={mutedText}>·</span>
                  <button
                    type="button"
                    onClick={resetColumnsFromProfile}
                    className={`inline-flex items-center gap-1 hover:underline cursor-pointer ${mutedText}`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isFr ? 'Réinitialiser' : 'Reset'}</span>
                  </button>
                </div>
              </div>

              {/* Filter & Naming Rules Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2.5">
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${mutedText}`} />
                  <input
                    type="text"
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    placeholder={isFr ? 'Filtrer une colonne...' : 'Filter columns...'}
                    className={`w-full rounded-lg border pl-8 pr-2.5 py-1.5 text-xs ${inputCls}`}
                  />
                </div>
                <select
                  value={namingConvention}
                  onChange={(e) => applyNamingRules(e.target.value as NamingConvention, columnPrefix)}
                  title={isFr ? 'Convention de nommage des colonnes cibles' : 'Target column naming convention'}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${inputCls}`}
                >
                  <option value="keep">{isFr ? 'Nom : Original' : 'Case: Original'}</option>
                  <option value="snake_case">snake_case</option>
                  <option value="lowercase">{isFr ? 'minuscules' : 'lowercase'}</option>
                  <option value="UPPERCASE">{isFr ? 'MAJUSCULES' : 'UPPERCASE'}</option>
                </select>
                <input
                  type="text"
                  value={columnPrefix}
                  onChange={(e) => applyNamingRules(namingConvention, e.target.value)}
                  placeholder={isFr ? 'Préfixe (ex: ext_)' : 'Prefix (e.g. ext_)'}
                  className={`w-32 rounded-lg border px-2.5 py-1.5 text-xs font-mono ${inputCls}`}
                />
              </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b text-[11px] font-medium ${
                    isLight ? 'bg-[#F8F6F1] border-[#E2DBD0] text-stone-600' : 'bg-[#13110E] border-white/[0.08] text-stone-400'
                  }`}>
                    <th className="py-2 pl-3 pr-2 w-8"></th>
                    <th className="py-2 px-2">{isFr ? 'Colonne source' : 'Source field'}</th>
                    <th className="py-2 px-2">{isFr ? 'Nom cible' : 'Target name'}</th>
                    <th className="py-2 px-2">{isFr ? 'Type' : 'Type'}</th>
                    <th className="py-2 px-2 w-16">{isFr ? 'Long.' : 'Len.'}</th>
                    <th className="py-2 px-2">{isFr ? 'Alias / Commentaire' : 'Alias / Comment'}</th>
                    <th className="py-2 pl-2 pr-3 text-right">{isFr ? 'Statut' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-[#EBE5DC]' : 'divide-white/[0.05]'}`}>
                  {filteredColumns.map((col) => {
                    const resolvedType =
                      engine === 'sql'
                        ? mapTypeToSql(col.targetType, col.length, sqlDialect)
                        : mapTypeToArcpy(col.targetType).fieldType;
                    const showLength =
                      col.targetType === 'string' &&
                      !(engine === 'sql' && sqlDialect === 'sqlite');

                    return (
                      <tr
                        key={col.sourceName}
                        className={`transition-colors ${
                          col.selected
                            ? isLight
                              ? 'bg-white hover:bg-[#FAF8F5]'
                              : 'bg-transparent hover:bg-white/[0.02]'
                            : isLight
                              ? 'bg-[#FAF8F5]/60 opacity-65'
                              : 'bg-white/[0.01] opacity-55'
                        }`}
                      >
                        <td className="py-2 pl-3 pr-2 align-middle">
                          <button
                            type="button"
                            onClick={() => updateColumn(col.sourceName, { selected: !col.selected })}
                            className="text-amber-600 dark:text-amber-400 hover:opacity-80 cursor-pointer block"
                            aria-label={`Toggle ${col.sourceName}`}
                          >
                            {col.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-stone-400" />}
                          </button>
                        </td>

                        <td className="py-2 px-2 align-middle max-w-[165px]">
                          <div className="font-mono font-medium truncate" title={col.sourceName}>
                            {col.sourceName}
                          </div>
                          <div className={`text-[10px] font-mono tabular-nums truncate ${mutedText}`} title={col.sampleValues.join(' | ')}>
                            {col.nonNullCount}/{col.totalRows}
                            {col.sampleValues[0] ? ` · ${col.sampleValues[0]}` : ''}
                          </div>
                        </td>

                        <td className="py-2 px-2 align-middle min-w-[130px]">
                          <input
                            type="text"
                            value={col.targetName}
                            onChange={(e) => updateColumn(col.sourceName, { targetName: e.target.value })}
                            className={`w-full rounded border px-2 py-1 text-xs font-mono ${inputCls}`}
                          />
                        </td>

                        <td className="py-2 px-2 align-middle min-w-[135px]">
                          <select
                            value={col.targetType}
                            onChange={(e) => updateColumn(col.sourceName, { targetType: e.target.value as EnrichmentFieldType })}
                            className={`w-full rounded border px-1.5 py-1 text-xs ${inputCls}`}
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft.value} value={ft.value}>
                                {ft.label}
                              </option>
                            ))}
                          </select>
                          <div className={`text-[10px] font-mono mt-0.5 ${mutedText}`}>
                            {resolvedType}
                          </div>
                        </td>

                        <td className="py-2 px-2 align-middle">
                          {showLength ? (
                            <input
                              type="number"
                              min={1}
                              max={4000}
                              value={col.length}
                              onChange={(e) => updateColumn(col.sourceName, { length: Math.max(1, Number(e.target.value) || 50) })}
                              className={`w-16 rounded border px-1.5 py-1 text-xs font-mono tabular-nums ${inputCls}`}
                            />
                          ) : (
                            <span className={`font-mono text-[11px] ${mutedText}`}>—</span>
                          )}
                        </td>

                        <td className="py-2 px-2 align-middle min-w-[125px]">
                          <input
                            type="text"
                            value={col.alias}
                            onChange={(e) => updateColumn(col.sourceName, { alias: e.target.value })}
                            className={`w-full rounded border px-2 py-1 text-xs ${inputCls}`}
                          />
                        </td>

                        <td className="py-2 pl-2 pr-3 align-middle text-right whitespace-nowrap">
                          {col.existsInTarget ? (
                            <span className={`text-[11px] font-medium ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                              {isFr ? 'Existante' : 'Exists'}
                            </span>
                          ) : (
                            <span className={`text-[11px] font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                              {isFr ? 'Nouvelle' : 'New'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredColumns.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`py-8 text-center text-xs ${mutedText}`}>
                        {isFr ? 'Aucune colonne ne correspond au filtre.' : 'No columns match your filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* RIGHT PANE: Live Generated Script Preview & Export */}
        <div className={`flex flex-col overflow-hidden ${isLight ? 'bg-[#1A1613] text-stone-100' : 'bg-[#0F0D0B] text-stone-100'}`}>
          {/* Preview Header */}
          <div className="shrink-0 px-4 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[#15120F]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {engine === 'arcpy' ? (
                  <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-mono text-xs font-semibold text-stone-100 truncate">
                  {generatedResult?.suggestedFileName || 'enrichment_script'}
                </span>
              </div>
              {generatedResult && (
                <div className="text-[11px] font-mono text-stone-400 tabular-nums mt-0.5">
                  {generatedResult.newColumnsCount} {isFr ? 'nouvelles' : 'new'} · {generatedResult.existingColumnsCount} {isFr ? 'existantes' : 'existing'} · {generatedResult.lineCount} {isFr ? 'lignes' : 'lines'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!generatedResult}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-white/[0.1] transition-colors disabled:opacity-40 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={!generatedResult}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#A87945] px-3 py-1.5 text-xs font-semibold text-stone-950 hover:bg-[#B98953] transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {isFr ? 'Télécharger' : 'Download'} .{generatedResult?.fileExtension || (engine === 'arcpy' ? 'py' : 'sql')}
                </span>
              </button>
            </div>
          </div>

          {/* Warnings Banner (only if present) */}
          {generatedResult && generatedResult.warnings.length > 0 && (
            <div className="shrink-0 px-4 py-2.5 border-b border-amber-500/20 bg-amber-950/30 text-[11px] text-amber-200/90 space-y-1">
              {generatedResult.warnings.map((w, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Code Viewer with Line Numbers */}
          <div className="flex-1 overflow-auto font-mono text-[12px] leading-relaxed p-4 select-text">
            <table className="w-full border-collapse">
              <tbody>
                {codeLines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/[0.03]">
                    <td className="pr-4 text-right select-none text-stone-600 tabular-nums align-top w-10">
                      {i + 1}
                    </td>
                    <td className="whitespace-pre text-stone-200 align-top">
                      {line || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
