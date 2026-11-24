/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Check,
  RotateCcw,
  Hash,
  Type,
  Split,
  Wand2,
  Search,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import {
  auditDatasetAttributes,
  autoCleanAllBlockedNumericColumns,
  patchDatasetCellValue,
  repairColumnNumbers,
  transformColumnCase,
  transformColumnSeparators,
  ColumnAuditSummary,
  TextCaseMode,
} from '../core/dataAuditCleaner';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

interface DataCleaningAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  initialDatasetId?: string | null;
  onUpdateDataset: (updated: SpatialDataset) => void;
}

type ColumnFilterTab = 'all' | 'numeric' | 'case' | 'separators';
type StudioTab = 'numeric' | 'case' | 'separators';

export const DataCleaningAuditModal: React.FC<DataCleaningAuditModalProps> = ({
  isOpen,
  onClose,
  datasets,
  initialDatasetId,
  onUpdateDataset,
}) => {
  const { lang } = useI18n();
  const { theme } = useTheme();
  const isFr = lang === 'fr';
  const isLight = theme === 'light';

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedColumnName, setSelectedColumnName] = useState<string>('');
  const [colFilter, setColFilter] = useState<ColumnFilterTab>('all');
  const [colSearch, setColSearch] = useState<string>('');
  const [studioTab, setStudioTab] = useState<StudioTab>('numeric');
  const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'malformed' | 'case' | 'whitespace'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [historySnapshots, setHistorySnapshots] = useState<Record<string, SpatialDataset>>({});

  // Numeric repair options
  const [castToNumber, setCastToNumber] = useState<boolean>(true);
  const [targetNumericKind, setTargetNumericKind] = useState<'auto' | 'double' | 'integer'>('double');
  const [stripStrayUnits, setStripStrayUnits] = useState<boolean>(true);
  const [convertSentinelsToNull, setConvertSentinelsToNull] = useState<boolean>(true);
  const [decimalStringSep, setDecimalStringSep] = useState<'.' | ','>('.');

  // Separator converter controls
  const [fromDelimiter, setFromDelimiter] = useState<string>(';');
  const [toDelimiter, setToDelimiter] = useState<string>(',');
  const [trimAroundDelimiter, setTrimAroundDelimiter] = useState<boolean>(true);

  // Inline manual cell override values keyed by `${featureIndex}::${columnName}`
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const preferred =
      (initialDatasetId && datasets.find((d) => d.id === initialDatasetId)) ||
      datasets[0];
    if (preferred) {
      setSelectedDatasetId(preferred.id);
    }
    setNotice(null);
    setCellDrafts({});
  }, [isOpen, initialDatasetId, datasets]);

  const currentDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) || datasets[0] || null,
    [datasets, selectedDatasetId]
  );

  const auditReport = useMemo(() => {
    if (!currentDataset) return null;
    return auditDatasetAttributes(currentDataset);
  }, [currentDataset]);

  const filteredColumns = useMemo(() => {
    if (!auditReport) return [];
    return auditReport.columns.filter((c) => {
      if (colSearch.trim() && !c.columnName.toLowerCase().includes(colSearch.toLowerCase())) {
        return false;
      }
      if (colFilter === 'numeric') {
        return c.isBlockedNumericCast || c.malformedNumericCount > 0 || c.cleanNumericStringCount > 0;
      }
      if (colFilter === 'case') {
        return c.caseStats.hasMixedCasing;
      }
      if (colFilter === 'separators') {
        return (
          c.doubleSeparatorCount > 0 ||
          (c.decimalCommaCount > 0 && c.decimalDotCount > 0) ||
          c.decimalCommaCount > 0 ||
          c.detectedDelimiters.length > 0 ||
          c.whitespaceIssuesCount > 0
        );
      }
      return true;
    });
  }, [auditReport, colFilter, colSearch]);

  useEffect(() => {
    if (!auditReport || auditReport.columns.length === 0) {
      setSelectedColumnName('');
      return;
    }
    const stillValid = auditReport.columns.some((c) => c.columnName === selectedColumnName);
    if (!stillValid) {
      const firstIssueCol =
        auditReport.columns.find((c) => c.isBlockedNumericCast || c.anomalies.length > 0) ||
        auditReport.columns[0];
      setSelectedColumnName(firstIssueCol.columnName);
    }
  }, [auditReport, selectedColumnName]);

  const activeCol: ColumnAuditSummary | null = useMemo(() => {
    if (!auditReport) return null;
    return auditReport.columns.find((c) => c.columnName === selectedColumnName) || auditReport.columns[0] || null;
  }, [auditReport, selectedColumnName]);

  // Switch studio tab heuristically when clicking a column so the most relevant tool opens first
  const handleSelectColumn = (col: ColumnAuditSummary) => {
    setSelectedColumnName(col.columnName);
    setCellDrafts({});
    if (col.isBlockedNumericCast || col.malformedNumericCount > 0 || col.isMajorityNumeric) {
      setStudioTab('numeric');
    } else if (col.caseStats.hasMixedCasing) {
      setStudioTab('case');
    } else if (col.doubleSeparatorCount > 0 || col.detectedDelimiters.length > 0 || col.decimalCommaCount > 0) {
      setStudioTab('separators');
    }
  };

  if (!isOpen || !currentDataset || !auditReport) return null;

  const pushNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4500);
  };

  const ensureSnapshot = (ds: SpatialDataset) => {
    setHistorySnapshots((prev) => {
      if (prev[ds.id]) return prev;
      return {
        ...prev,
        [ds.id]: {
          ...ds,
          fields: ds.fields.map((f) => ({ ...f })),
          geojson: ds.geojson
            ? {
                ...ds.geojson,
                features: (ds.geojson.features || []).map((f: any) => ({
                  ...f,
                  properties: { ...(f.properties || {}) },
                })),
              }
            : ds.geojson,
        },
      };
    });
  };

  const handleRevertSnapshot = () => {
    const snap = historySnapshots[currentDataset.id];
    if (!snap) return;
    onUpdateDataset(snap);
    setHistorySnapshots((prev) => {
      const copy = { ...prev };
      delete copy[currentDataset.id];
      return copy;
    });
    setCellDrafts({});
    pushNotice(isFr ? 'Modifications annulees (etat initial restaure).' : 'Reverted changes to initial snapshot.');
  };

  const handleBatchCleanNumeric = () => {
    ensureSnapshot(currentDataset);
    const res = autoCleanAllBlockedNumericColumns(currentDataset);
    onUpdateDataset(res.updatedDataset);
    pushNotice(
      isFr
        ? `${res.columnsFixed} colonne(s) numerique(s) reparee(s) et convertie(s) en Double/Float (${res.cellsRepaired} cellule(s)).`
        : `Repaired and cast ${res.columnsFixed} numeric column(s) to Double/Float (${res.cellsRepaired} cell(s)).`
    );
  };

  const handleApplyNumericClean = () => {
    if (!activeCol) return;
    ensureSnapshot(currentDataset);
    const res = repairColumnNumbers(currentDataset, activeCol.columnName, {
      castToNumber,
      targetNumericKind,
      decimalOutputSeparator: decimalStringSep,
      stripStrayUnits,
      convertSentinelsToNull,
      fixMalformedSeparators: true,
    });
    onUpdateDataset(res.updatedDataset);
    pushNotice(
      isFr
        ? `${activeCol.columnName}: ${res.repairedCount} valeur(s) reparee(s), ${res.nullifiedSentinelsCount} sentinelle(s) -> NULL.`
        : `${activeCol.columnName}: ${res.repairedCount} value(s) repaired, ${res.nullifiedSentinelsCount} sentinel(s) -> NULL.`
    );
  };

  const handleApplyCase = (mode: TextCaseMode) => {
    if (!activeCol) return;
    ensureSnapshot(currentDataset);
    const res = transformColumnCase(currentDataset, activeCol.columnName, mode);
    onUpdateDataset(res.updatedDataset);
    pushNotice(
      isFr
        ? `${activeCol.columnName}: casse appliquee (${mode}) sur ${res.modifiedCount} enregistrement(s).`
        : `${activeCol.columnName}: applied "${mode}" across ${res.modifiedCount} record(s).`
    );
  };

  const handleApplySeparatorPreset = (
    mode: 'collapse_malformed_decimals' | 'decimal_comma_to_dot' | 'decimal_dot_to_comma' | 'replace_delimiter',
    customFrom?: string,
    customTo?: string
  ) => {
    if (!activeCol) return;
    ensureSnapshot(currentDataset);
    const res = transformColumnSeparators(currentDataset, activeCol.columnName, {
      mode,
      fromDelimiter: customFrom ?? fromDelimiter,
      toDelimiter: customTo ?? toDelimiter,
      trimAroundDelimiter,
    });
    onUpdateDataset(res.updatedDataset);
    pushNotice(
      isFr
        ? `${activeCol.columnName}: separateurs mis a jour sur ${res.modifiedCount} enregistrement(s).`
        : `${activeCol.columnName}: updated separators on ${res.modifiedCount} record(s).`
    );
  };

  const handleApplyCellOverride = (featureIndex: number, rawDraft: string, numericSuggested: any) => {
    if (!activeCol) return;
    ensureSnapshot(currentDataset);
    let nextVal: any = rawDraft;
    if (rawDraft.trim() === '' || rawDraft.trim().toLowerCase() === 'null') {
      nextVal = null;
    } else if (typeof numericSuggested === 'number' && !Number.isNaN(Number(rawDraft))) {
      nextVal = Number(rawDraft);
    } else if (activeCol.isMajorityNumeric && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(rawDraft.trim())) {
      nextVal = Number(rawDraft.trim());
    }

    const updated = patchDatasetCellValue(currentDataset, featureIndex, activeCol.columnName, nextVal);
    onUpdateDataset(updated);
    setCellDrafts((prev) => {
      const next = { ...prev };
      delete next[`${featureIndex}::${activeCol.columnName}`];
      return next;
    });
    pushNotice(
      isFr
        ? `Ligne #${featureIndex + 1} (${activeCol.columnName}) mise a jour.`
        : `Updated row #${featureIndex + 1} in ${activeCol.columnName}.`
    );
  };

  const visibleAnomalies = (activeCol?.anomalies || []).filter((a) => {
    if (anomalyFilter === 'all') return true;
    if (anomalyFilter === 'malformed') {
      return a.category === 'malformed_number' || a.category === 'decimal_separator' || a.category === 'string_in_numeric_col';
    }
    if (anomalyFilter === 'case') return a.category === 'case_mismatch';
    if (anomalyFilter === 'whitespace') return a.category === 'whitespace';
    return true;
  });

  const hasSnapshot = Boolean(historySnapshots[currentDataset.id]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-6xl h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
          isLight
            ? 'bg-white border-[#D4DFD3] text-stone-900'
            : 'bg-[#0F1816] border-stone-800 text-stone-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between gap-4 ${
            isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                isLight
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base truncate">
                {isFr
                  ? 'Audit Attributaire & Nettoyage des Donnees'
                  : 'Attribute Audit & Data Cleaning Studio'}
              </h2>
              <div
                className={`flex flex-wrap items-center gap-2 text-xs mt-0.5 ${
                  isLight ? 'text-stone-600' : 'text-stone-400'
                }`}
              >
                <span className="font-mono tabular-nums">{auditReport.totalRows} {isFr ? 'lignes' : 'rows'}</span>
                <span aria-hidden="true">&middot;</span>
                <span className="font-mono tabular-nums">{auditReport.totalColumns} {isFr ? 'colonnes' : 'columns'}</span>
                <span aria-hidden="true">&middot;</span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    auditReport.blockedNumericColumnsCount > 0
                      ? isLight
                        ? 'text-rose-700'
                        : 'text-rose-400'
                      : isLight
                      ? 'text-emerald-700'
                      : 'text-emerald-400'
                  }`}
                >
                  {auditReport.blockedNumericColumnsCount}{' '}
                  {isFr ? 'colonne(s) Double/Float bloquee(s)' : 'blocked Double/Float column(s)'}
                </span>
                <span aria-hidden="true">&middot;</span>
                <span className="font-mono tabular-nums">
                  {auditReport.caseIssueColumnsCount}{' '}
                  {isFr ? 'colonne(s) casse mixte' : 'mixed-case column(s)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <select
              value={currentDataset.id}
              onChange={(e) => {
                setSelectedDatasetId(e.target.value);
                setCellDrafts({});
              }}
              aria-label={isFr ? 'Couche a auditer' : 'Dataset to audit'}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-amber-500 cursor-pointer ${
                isLight
                  ? 'bg-white border-[#C2D2C2] text-stone-900'
                  : 'bg-[#131E1C] border-stone-700 text-stone-100'
              }`}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.featureCount})
                </option>
              ))}
            </select>

            {hasSnapshot && (
              <button
                type="button"
                onClick={handleRevertSnapshot}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white border-[#C2D2C2] text-stone-700 hover:bg-stone-100'
                    : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFr ? 'Annuler changements' : 'Revert'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLight ? 'text-stone-500 hover:bg-stone-200 text-stone-800' : 'text-stone-400 hover:bg-stone-800 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* One-Click Batch Sweep Banner & Notice */}
        {(auditReport.blockedNumericColumnsCount > 0 || notice) && (
          <div
            className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
              isLight ? 'bg-[#FDFAF7] border-[#E1E8DF]' : 'bg-[#111A18] border-stone-800/80'
            }`}
          >
            {notice ? (
              <div className="flex items-center gap-2 font-medium text-emerald-500">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notice}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {isFr
                    ? `${auditReport.blockedNumericColumnsCount} colonne(s) majoritairement numerique(s) contiennent des saisies malformees (ex: 19,.7 ou 19,7) qui bloquent le format Double/Float en sortie.`
                    : `${auditReport.blockedNumericColumnsCount} majority-numeric column(s) contain malformed values (e.g. 19,.7 or 19,7) preventing Double/Float output type.`}
                </span>
              </div>
            )}

            {auditReport.blockedNumericColumnsCount > 0 && (
              <button
                type="button"
                onClick={handleBatchCleanNumeric}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>
                  {isFr
                    ? 'Tout reparer et convertir en Double/Float'
                    : 'Auto-Fix All Numeric Columns to Double/Float'}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Main Split Layout: Left Columns List + Right Remediation Studio */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column Sidebar */}
          <div
            className={`w-80 border-r flex flex-col shrink-0 ${
              isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'
            }`}
          >
            <div className={`p-3 border-b space-y-2.5 ${isLight ? 'border-[#E1E8DF]' : 'border-stone-800'}`}>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={colSearch}
                  onChange={(e) => setColSearch(e.target.value)}
                  placeholder={isFr ? 'Filtrer les colonnes...' : 'Filter columns...'}
                  className={`w-full rounded-lg pl-8 pr-3 py-1.5 text-xs border focus:outline-none focus:border-amber-500 ${
                    isLight
                      ? 'bg-white border-[#C2D2C2] text-stone-900 placeholder-stone-400'
                      : 'bg-[#131E1C] border-stone-800 text-stone-100 placeholder-stone-500'
                  }`}
                />
              </div>

              {/* Segmented Filter Controls */}
              <div className={`grid grid-cols-4 gap-1 p-1 rounded-lg ${isLight ? 'bg-[#E2E9E0]' : 'bg-stone-900'}`}>
                {(
                  [
                    { id: 'all', label: isFr ? 'Toutes' : 'All' },
                    { id: 'numeric', label: isFr ? 'Num.' : 'Numeric' },
                    { id: 'case', label: isFr ? 'Casse' : 'Case' },
                    { id: 'separators', label: isFr ? 'Sep.' : 'Sep.' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setColFilter(tab.id)}
                    className={`py-1 px-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer truncate ${
                      colFilter === tab.id
                        ? isLight
                          ? 'bg-white text-stone-900 shadow-xs font-semibold'
                          : 'bg-stone-800 text-amber-300 font-semibold'
                        : isLight
                        ? 'text-stone-600 hover:text-stone-900'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-800/30">
              {filteredColumns.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  {isFr ? 'Aucune colonne pour ce filtre.' : 'No columns match this filter.'}
                </div>
              ) : (
                filteredColumns.map((col) => {
                  const isActive = activeCol?.columnName === col.columnName;
                  const issueCount = col.anomalies.length;
                  return (
                    <button
                      key={col.columnName}
                      type="button"
                      onClick={() => handleSelectColumn(col)}
                      className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer ${
                        isActive
                          ? isLight
                            ? 'bg-amber-50 border-r-2 border-amber-600'
                            : 'bg-[#172421] border-r-2 border-amber-500'
                          : isLight
                          ? 'hover:bg-[#E9EEE7]'
                          : 'hover:bg-stone-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold truncate">
                          {col.columnName}
                        </span>
                        {col.isBlockedNumericCast ? (
                          <span className={`text-[11px] font-mono tabular-nums font-semibold shrink-0 ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>
                            {col.malformedNumericCount + col.cleanNumericStringCount} err
                          </span>
                        ) : issueCount > 0 ? (
                          <span className={`text-[11px] font-mono tabular-nums shrink-0 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                            {issueCount} obs
                          </span>
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        )}
                      </div>

                      <div
                        className={`mt-1 flex items-center gap-1.5 text-[11px] font-mono ${
                          isLight ? 'text-stone-500' : 'text-stone-400'
                        }`}
                      >
                        <span>{col.currentFieldType}</span>
                        {col.isBlockedNumericCast && (
                          <>
                            <span aria-hidden="true">-&gt;</span>
                            <span className={isLight ? 'text-emerald-700 font-semibold' : 'text-emerald-400 font-semibold'}>
                              {col.recommendedOutputType}
                            </span>
                          </>
                        )}
                        {col.isMajorityNumeric && !col.isBlockedNumericCast && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span>{col.recommendedOutputType}</span>
                          </>
                        )}
                        {!col.isMajorityNumeric && col.caseStats.hasMixedCasing && (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span>{isFr ? 'casse mixte' : 'mixed case'}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Workspace */}
          {activeCol ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6">
              {/* Selected Column Header & Stats */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-stone-800/40">
                <div>
                  <h3 className="font-mono font-bold text-lg">{activeCol.columnName}</h3>
                  <div
                    className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                      isLight ? 'text-stone-600' : 'text-stone-400'
                    }`}
                  >
                    <span>
                      {isFr ? 'Type actuel' : 'Current type'}:{' '}
                      <strong className="font-mono">{activeCol.currentFieldType}</strong>
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>
                      {isFr ? 'Sortie recommandee' : 'Recommended output'}:{' '}
                      <strong className="font-mono text-emerald-500">
                        {activeCol.recommendedOutputType}
                      </strong>
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="font-mono tabular-nums">
                      {activeCol.numericDominancePct}% {isFr ? 'numerique' : 'numeric'}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="font-mono tabular-nums">
                      {activeCol.emptyRows} {isFr ? 'vide(s)' : 'empty'}
                    </span>
                  </div>
                </div>

                {/* Action Studio Mode Switcher */}
                <div className={`flex items-center gap-1 p-1 rounded-lg ${isLight ? 'bg-[#E5EBE3]' : 'bg-stone-900'}`}>
                  <button
                    type="button"
                    onClick={() => setStudioTab('numeric')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      studioTab === 'numeric'
                        ? isLight
                          ? 'bg-white text-stone-900 shadow-xs font-semibold'
                          : 'bg-stone-800 text-amber-300 font-semibold'
                        : isLight
                        ? 'text-stone-600 hover:text-stone-900'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Nombres & Double/Float' : 'Numbers & Double/Float'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioTab('case')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      studioTab === 'case'
                        ? isLight
                          ? 'bg-white text-stone-900 shadow-xs font-semibold'
                          : 'bg-stone-800 text-amber-300 font-semibold'
                        : isLight
                        ? 'text-stone-600 hover:text-stone-900'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Casse (Maj/Min)' : 'Text Case'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioTab('separators')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      studioTab === 'separators'
                        ? isLight
                          ? 'bg-white text-stone-900 shadow-xs font-semibold'
                          : 'bg-stone-800 text-amber-300 font-semibold'
                        : isLight
                        ? 'text-stone-600 hover:text-stone-900'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Split className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Separateurs' : 'Separators'}</span>
                  </button>
                </div>
              </div>

              {/* Studio Panel A: Numeric Repair & Double/Float Casting */}
              {studioTab === 'numeric' && (
                <div
                  className={`p-5 rounded-xl border space-y-4 ${
                    isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#131E1C] border-stone-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold">
                        {isFr
                          ? 'Correction des nombres malformees et typage Double / Float'
                          : 'Malformed Number Repair & Double / Float Casting'}
                      </h4>
                      <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                        {isFr
                          ? 'Corrige les doubles separateurs (19,.7 -> 19.7), virgules decimales (19,7 -> 19.7), espaces et convertit les chaines en format numerique.'
                          : 'Repairs double separators (19,.7 -> 19.7), decimal commas (19,7 -> 19.7), and spaces so GeoPackage/Shapefile/FGDB/PostgreSQL output Double/Float.'}
                      </p>
                    </div>
                  </div>

                  {/* Numeric Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs tabular-nums">
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">{isFr ? 'Nombres valides' : 'Valid Numbers'}</div>
                      <div className="text-base font-bold text-emerald-500 mt-0.5">{activeCol.validNumericCount}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">{isFr ? 'Chaines numeriques' : 'Numeric Strings'}</div>
                      <div className="text-base font-bold text-amber-500 mt-0.5">{activeCol.cleanNumericStringCount}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">{isFr ? 'Malformees (ex: 19,.7)' : 'Malformed (e.g. 19,.7)'}</div>
                      <div className="text-base font-bold text-rose-500 mt-0.5">{activeCol.malformedNumericCount}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">{isFr ? 'Texte / Sentinelles' : 'Text / Sentinels'}</div>
                      <div className="text-base font-bold text-stone-400 mt-0.5">
                        {activeCol.nonNumericStringCount + activeCol.sentinelCount}
                      </div>
                    </div>
                  </div>

                  {/* Options Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
                    <div className="space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={castToNumber}
                          onChange={(e) => setCastToNumber(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span className="font-medium">
                          {isFr
                            ? 'Convertir le type en nombre reel (Double / Float / Int)'
                            : 'Cast column values to true numeric type (Double / Float / Int)'}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stripStrayUnits}
                          onChange={(e) => setStripStrayUnits(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span>
                          {isFr
                            ? 'Extraire le nombre si unites attachees (ex: "19,.7 m", "45%")'
                            : 'Strip attached units/prefixes (e.g. "19,.7 m", "45%")'}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={convertSentinelsToNull}
                          onChange={(e) => setConvertSentinelsToNull(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span>
                          {isFr
                            ? 'Convertir les sentinelles ("N/A", "-", "null") en NULL'
                            : 'Convert placeholder text ("N/A", "-", "null") to NULL'}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-3">
                      {castToNumber ? (
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                            {isFr ? 'Format numerique cible' : 'Target Numeric Format'}
                          </label>
                          <select
                            value={targetNumericKind}
                            onChange={(e) => setTargetNumericKind(e.target.value as 'auto' | 'double' | 'integer')}
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs ${
                              isLight
                                ? 'bg-white border-[#C2D2C2] text-stone-900'
                                : 'bg-[#0D1513] border-stone-700 text-stone-100'
                            }`}
                          >
                            <option value="double">Double / Float (REAL / DOUBLE PRECISION)</option>
                            <option value="integer">Integer (INTEGER)</option>
                            <option value="auto">Auto (Integer if exact, else Double / Float)</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                            {isFr ? 'Separateur decimal (chaine formatee)' : 'Decimal Separator (Formatted String)'}
                          </label>
                          <select
                            value={decimalStringSep}
                            onChange={(e) => setDecimalStringSep(e.target.value as '.' | ',')}
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs ${
                              isLight
                                ? 'bg-white border-[#C2D2C2] text-stone-900'
                                : 'bg-[#0D1513] border-stone-700 text-stone-100'
                            }`}
                          >
                            <option value=".">Point decimal (19.7)</option>
                            <option value=",">Virgule decimale (19,7)</option>
                          </select>
                        </div>
                      )}

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleApplyNumericClean}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 transition-colors cursor-pointer"
                        >
                          {isFr
                            ? 'Appliquer la reparation numerique sur cette colonne'
                            : 'Repair & Cast This Column'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Studio Panel B: Case Standardization */}
              {studioTab === 'case' && (
                <div
                  className={`p-5 rounded-xl border space-y-4 ${
                    isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#131E1C] border-stone-800'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-semibold">
                      {isFr
                        ? 'Harmonisation de la casse & espaces (Majuscules / Minuscules)'
                        : 'Text Case Standardization & Whitespace Cleanup'}
                    </h4>
                    <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                      {isFr
                        ? 'Uniformisez les enregistrements en minuscules, MAJUSCULES, Nom Propre ou Phrase et supprimez les espaces superflus.'
                        : 'Standardize all string records in this column to lowercase, UPPERCASE, Title Case, Sentence case, or clean extra whitespace.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs tabular-nums">
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">UPPERCASE</div>
                      <div className="text-base font-bold mt-0.5">{activeCol.caseStats.uppercase}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">lowercase</div>
                      <div className="text-base font-bold mt-0.5">{activeCol.caseStats.lowercase}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">Title Case</div>
                      <div className="text-base font-bold mt-0.5">{activeCol.caseStats.titlecase}</div>
                    </div>
                    <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-[#D4DFD3]' : 'bg-[#0D1513] border-stone-800'}`}>
                      <div className="text-[11px] text-stone-500">{isFr ? 'Mixte / Espaces' : 'Mixed / Spaces'}</div>
                      <div className="text-base font-bold text-amber-500 mt-0.5">
                        {activeCol.caseStats.mixed} / {activeCol.whitespaceIssuesCount}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {(
                      [
                        { mode: 'uppercase', label: 'UPPERCASE' },
                        { mode: 'lowercase', label: 'lowercase' },
                        { mode: 'titlecase', label: 'Title Case' },
                        { mode: 'sentencecase', label: 'Sentence case' },
                        { mode: 'trim_only', label: isFr ? 'Nettoyer espaces uniquement' : 'Trim & Collapse Spaces Only' },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.mode}
                        type="button"
                        onClick={() => handleApplyCase(btn.mode)}
                        className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-white border-[#C2D2C2] text-stone-900 hover:bg-amber-50 hover:border-amber-400'
                            : 'bg-[#0D1513] border-stone-700 text-stone-100 hover:bg-amber-950/50 hover:border-amber-600'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Studio Panel C: Separator Converter */}
              {studioTab === 'separators' && (
                <div
                  className={`p-5 rounded-xl border space-y-4 ${
                    isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#131E1C] border-stone-800'
                  }`}
                >
                  <div>
                    <h4 className="text-sm font-semibold">
                      {isFr ? 'Conversion des separateurs & delimiteurs' : 'Decimal & String Separator Converter'}
                    </h4>
                    <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                      {isFr
                        ? 'Normalisez les separateurs decimaux (, / . / ,.) ou remplacez les delimiteurs de valeurs (;, |, /, -, _).'
                        : 'Normalize decimal separators (, / . / ,.) or swap multi-value delimiters (;, |, /, -, _).'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplySeparatorPreset('collapse_malformed_decimals')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        isLight
                          ? 'bg-white border-[#C2D2C2] hover:bg-amber-50 text-stone-900'
                          : 'bg-[#0D1513] border-stone-700 hover:bg-stone-800 text-stone-200'
                      }`}
                    >
                      {isFr ? 'Corriger doubles separateurs (19,.7 -> 19.7)' : 'Fix Double Separators (19,.7 -> 19.7)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySeparatorPreset('decimal_comma_to_dot')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        isLight
                          ? 'bg-white border-[#C2D2C2] hover:bg-amber-50 text-stone-900'
                          : 'bg-[#0D1513] border-stone-700 hover:bg-stone-800 text-stone-200'
                      }`}
                    >
                      {isFr ? 'Virgule decimale (,) -> Point (.)' : 'Decimal Comma (,) -> Dot (.)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySeparatorPreset('decimal_dot_to_comma')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        isLight
                          ? 'bg-white border-[#C2D2C2] hover:bg-amber-50 text-stone-900'
                          : 'bg-[#0D1513] border-stone-700 hover:bg-stone-800 text-stone-200'
                      }`}
                    >
                      {isFr ? 'Point decimal (.) -> Virgule (,)' : 'Decimal Dot (.) -> Comma (,)'}
                    </button>
                  </div>

                  {/* Detected delimiters quick swaps */}
                  <div className="pt-2 border-t border-stone-800/30 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end text-xs">
                      <div>
                        <label className="block font-medium mb-1">
                          {isFr ? 'Remplacer le separateur' : 'From Separator'}
                        </label>
                        <input
                          type="text"
                          value={fromDelimiter}
                          onChange={(e) => setFromDelimiter(e.target.value)}
                          placeholder="; ou | ou /"
                          className={`w-full rounded-lg border px-3 py-1.5 font-mono text-xs ${
                            isLight
                              ? 'bg-white border-[#C2D2C2] text-stone-900'
                              : 'bg-[#0D1513] border-stone-700 text-stone-100'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1">
                          {isFr ? 'Nouveau separateur' : 'To Separator'}
                        </label>
                        <input
                          type="text"
                          value={toDelimiter}
                          onChange={(e) => setToDelimiter(e.target.value)}
                          placeholder=", ou - ou ;"
                          className={`w-full rounded-lg border px-3 py-1.5 font-mono text-xs ${
                            isLight
                              ? 'bg-white border-[#C2D2C2] text-stone-900'
                              : 'bg-[#0D1513] border-stone-700 text-stone-100'
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplySeparatorPreset('replace_delimiter')}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 transition-colors cursor-pointer h-[34px]"
                      >
                        {isFr ? 'Remplacer separateur' : 'Apply Separator Swap'}
                      </button>
                    </div>

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trimAroundDelimiter}
                        onChange={(e) => setTrimAroundDelimiter(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>
                        {isFr
                          ? 'Supprimer les espaces autour du separateur lors du remplacement'
                          : 'Trim whitespace around delimiter during replacement'}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Anomalies Detail Table */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    {isFr ? 'Enregistrements detectes' : 'Detected Anomalies & Records'}{' '}
                    <span className="font-mono text-xs text-stone-400 tabular-nums">
                      ({visibleAnomalies.length})
                    </span>
                  </h4>

                  <div className={`flex items-center gap-1 p-1 rounded-lg ${isLight ? 'bg-[#E5EBE3]' : 'bg-stone-900'}`}>
                    {(
                      [
                        { id: 'all', label: isFr ? 'Tout' : 'All' },
                        { id: 'malformed', label: isFr ? 'Nombres' : 'Numeric' },
                        { id: 'case', label: isFr ? 'Casse' : 'Case' },
                        { id: 'whitespace', label: isFr ? 'Espaces' : 'Spaces' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAnomalyFilter(f.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                          anomalyFilter === f.id
                            ? isLight
                              ? 'bg-white text-stone-900 shadow-xs font-semibold'
                              : 'bg-stone-800 text-amber-300 font-semibold'
                            : isLight
                            ? 'text-stone-600 hover:text-stone-900'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleAnomalies.length === 0 ? (
                  <div
                    className={`p-8 rounded-xl border text-center text-xs flex flex-col items-center gap-2 ${
                      isLight ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-600' : 'bg-[#131E1C] border-stone-800 text-stone-400'
                    }`}
                  >
                    <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    <span className="font-medium">
                      {isFr
                        ? 'Aucune anomalie detectee dans cette vue pour cette colonne.'
                        : 'No anomalies detected for this column under the current filter.'}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border overflow-hidden ${
                      isLight ? 'border-[#D4DFD3]' : 'border-stone-800'
                    }`}
                  >
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead
                          className={`sticky top-0 border-b ${
                            isLight
                              ? 'bg-[#F0F6ED] border-[#D4DFD3] text-stone-700'
                              : 'bg-[#0D1513] border-stone-800 text-stone-400'
                          }`}
                        >
                          <tr>
                            <th className="py-2.5 px-3 font-mono w-16">#</th>
                            <th className="py-2.5 px-3">{isFr ? 'Valeur brute' : 'Raw Value'}</th>
                            <th className="py-2.5 px-3">{isFr ? 'Diagnostic' : 'Diagnostic'}</th>
                            <th className="py-2.5 px-3">{isFr ? 'Correction / Edition manuelle' : 'Suggested / Manual Fix'}</th>
                            <th className="py-2.5 px-3 text-right w-24">{isFr ? 'Action' : 'Action'}</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isLight ? 'divide-[#E5EBE3]' : 'divide-stone-800/70'}`}>
                          {visibleAnomalies.slice(0, 150).map((a) => {
                            const draftKey = `${a.featureIndex}::${a.columnName}`;
                            const draftVal =
                              cellDrafts[draftKey] !== undefined
                                ? cellDrafts[draftKey]
                                : a.suggestedValue === null
                                ? ''
                                : String(a.suggestedValue);
                            return (
                              <tr key={`${a.featureIndex}-${a.category}`} className={isLight ? 'hover:bg-[#F4F8F2]' : 'hover:bg-stone-900/40'}>
                                <td className="py-2 px-3 font-mono tabular-nums text-stone-400">
                                  {a.rowNumber}
                                </td>
                                <td className="py-2 px-3 font-mono">
                                  <span className={isLight ? 'text-rose-700 font-semibold' : 'text-rose-400 font-semibold'}>
                                    {JSON.stringify(a.rawValue)}
                                  </span>
                                  <span className="ml-1.5 text-[10px] text-stone-500">({a.rawType})</span>
                                </td>
                                <td className={`py-2 px-3 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                                  {a.reason}
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="text"
                                    value={draftVal}
                                    onChange={(e) =>
                                      setCellDrafts((prev) => ({
                                        ...prev,
                                        [draftKey]: e.target.value,
                                      }))
                                    }
                                    placeholder="NULL"
                                    className={`w-full rounded border px-2 py-1 font-mono text-xs ${
                                      isLight
                                        ? 'bg-white border-[#C2D2C2] text-stone-900'
                                        : 'bg-[#0C1211] border-stone-700 text-emerald-300'
                                    }`}
                                  />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyCellOverride(a.featureIndex, draftVal, a.suggestedValue)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                                      isLight
                                        ? 'bg-white border-[#C2D2C2] hover:bg-emerald-50 text-emerald-800'
                                        : 'bg-stone-900 border-stone-700 hover:bg-emerald-950/60 text-emerald-300'
                                    }`}
                                  >
                                    {isFr ? 'Corriger' : 'Apply'}
                                  </button>
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
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-stone-500">
              {isFr ? 'Aucune colonne disponible.' : 'No columns available.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
