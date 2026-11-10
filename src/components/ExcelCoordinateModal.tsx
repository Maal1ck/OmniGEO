/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  MapPin, 
  Check, 
  AlertCircle, 
  X, 
  Globe, 
  Search, 
  Layers, 
  CheckCircle2, 
  Sparkles, 
  ExternalLink, 
  ChevronRight, 
  Filter, 
  CheckSquare, 
  Square,
  ArrowRight,
  Sliders,
  HelpCircle,
  CopyCheck
} from 'lucide-react';
import { COMMON_CRS_LIST, searchCRS, getCRSByCode } from '../core/crsDefinitions';
import { CRSInfo } from '../types/gis';
import { CRSModal } from './CRSModal';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';
import { inspectExcelWorkbook, inspectAllExcelSheets, ExcelSheetSummary } from '../core/excelParser';
import { SpatialDataset } from '../types/gis';

export interface PendingExcelFile {
  file: File;
  buffer: ArrayBuffer;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  previewRows: Record<string, any>[];
  detectedXCol?: string;
  detectedYCol?: string;
  totalRowCount: number;
}

export interface SheetConfig {
  sheetName: string;
  selected: boolean;
  xCol: string;
  yCol: string;
  crsCode: string;
  outputName: string;
  headers: string[];
  previewRows: Record<string, any>[];
  rowCount: number;
}

interface ExcelCoordinateModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingFile: PendingExcelFile | null;
  onConfirmDataset: (dataset: SpatialDataset | SpatialDataset[]) => void;
}

export const ExcelCoordinateModal: React.FC<ExcelCoordinateModalProps> = ({
  isOpen,
  onClose,
  pendingFile,
  onConfirmDataset,
}) => {
  const { lang } = useI18n();
  const { theme } = useTheme();

  // Active sheet currently being configured in the form
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  // Per-sheet configuration state
  const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetConfig>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 6,900+ CRS Search Tab States
  const [crsTab, setCrsTab] = useState<'search' | 'popular'>('search');
  const [crsSearchQuery, setCrsSearchQuery] = useState<string>('');
  const [crsTypeFilter, setCrsTypeFilter] = useState<'all' | 'geographic' | 'projected'>('all');
  const [isFullCRSModalOpen, setIsFullCRSModalOpen] = useState(false);

  // Initialize per-sheet configuration when pendingFile arrives
  useEffect(() => {
    if (!pendingFile) return;

    try {
      const summaries = inspectAllExcelSheets(pendingFile.buffer);
      const cleanBaseName = pendingFile.file.name.replace(/\.[^/.]+$/, '');
      const initialConfigs: Record<string, SheetConfig> = {};

      for (const summary of summaries) {
        initialConfigs[summary.sheetName] = {
          sheetName: summary.sheetName,
          selected: true,
          xCol: summary.detectedXCol || '',
          yCol: summary.detectedYCol || '',
          crsCode: 'EPSG:4326',
          outputName: summaries.length > 1 ? `${cleanBaseName}_${summary.sheetName}` : cleanBaseName,
          headers: summary.headers,
          previewRows: summary.previewRows,
          rowCount: summary.rowCount,
        };
      }

      setSheetConfigs(initialConfigs);
      const initialActive = pendingFile.selectedSheet || summaries[0]?.sheetName || pendingFile.sheetNames[0] || '';
      setActiveSheetName(initialActive);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [pendingFile]);

  const activeConfig = sheetConfigs[activeSheetName];

  // Helper to update active sheet config
  const updateActiveConfig = (updates: Partial<SheetConfig>) => {
    if (!activeSheetName) return;
    setSheetConfigs(prev => ({
      ...prev,
      [activeSheetName]: {
        ...prev[activeSheetName],
        ...updates,
      },
    }));
  };

  const toggleSheetSelected = (sheetName: string) => {
    setSheetConfigs(prev => {
      const curr = prev[sheetName];
      if (!curr) return prev;
      return {
        ...prev,
        [sheetName]: {
          ...curr,
          selected: !curr.selected,
        },
      };
    });
  };

  const selectAllSheets = () => {
    setSheetConfigs(prev => {
      const next: Record<string, SheetConfig> = {};
      Object.keys(prev).forEach(k => {
        next[k] = { ...prev[k], selected: true };
      });
      return next;
    });
  };

  const deselectAllSheets = () => {
    setSheetConfigs(prev => {
      const next: Record<string, SheetConfig> = {};
      Object.keys(prev).forEach(k => {
        next[k] = { ...prev[k], selected: false };
      });
      return next;
    });
  };

  const applyCrsToAllSheets = (code: string) => {
    setSheetConfigs(prev => {
      const next: Record<string, SheetConfig> = {};
      Object.keys(prev).forEach(k => {
        next[k] = { ...prev[k], crsCode: code };
      });
      return next;
    });
  };

  const applyColumnsToAllMatchingSheets = (xCol: string, yCol: string) => {
    setSheetConfigs(prev => {
      const next: Record<string, SheetConfig> = {};
      Object.keys(prev).forEach(k => {
        const item = prev[k];
        const hasX = item.headers.includes(xCol);
        const hasY = item.headers.includes(yCol);
        next[k] = {
          ...item,
          xCol: hasX ? xCol : item.xCol,
          yCol: hasY ? yCol : item.yCol,
        };
      });
      return next;
    });
  };

  // Selected sheets to import
  const selectedList = useMemo(() => {
    return Object.values(sheetConfigs).filter(s => s.selected);
  }, [sheetConfigs]);

  // Active selected CRS details
  const activeCRSInfo = useMemo(() => {
    const code = activeConfig?.crsCode || 'EPSG:4326';
    return getCRSByCode(code) || {
      code,
      name: code,
      area: 'Global Reference',
      proj4: '',
      isGeographic: code === 'EPSG:4326',
      unit: code === 'EPSG:4326' ? 'degrees' : 'meters',
    };
  }, [activeConfig?.crsCode]);

  // Filtered CRS search results from the 6,900+ registry
  const searchResults = useMemo(() => {
    let list = searchCRS(crsSearchQuery);
    if (crsTypeFilter === 'geographic') {
      list = list.filter(c => c.isGeographic);
    } else if (crsTypeFilter === 'projected') {
      list = list.filter(c => !c.isGeographic);
    }
    return list.slice(0, 80);
  }, [crsSearchQuery, crsTypeFilter]);

  const totalMatchingCRSs = useMemo(() => {
    let list = searchCRS(crsSearchQuery);
    if (crsTypeFilter === 'geographic') {
      list = list.filter(c => c.isGeographic);
    } else if (crsTypeFilter === 'projected') {
      list = list.filter(c => !c.isGeographic);
    }
    return list.length;
  }, [crsSearchQuery, crsTypeFilter]);

  if (!isOpen || !pendingFile) return null;

  // Bulk import all configured sheets simultaneously
  const handleImportAllConfigured = () => {
    const toImport = selectedList;
    if (toImport.length === 0) {
      setErrorMsg(lang === 'fr' ? 'Veuillez sélectionner au moins une feuille à importer.' : 'Please select at least one sheet to import.');
      return;
    }

    // Validate that every selected sheet has X and Y chosen
    const invalidSheet = toImport.find(s => !s.xCol || !s.yCol);
    if (invalidSheet) {
      setActiveSheetName(invalidSheet.sheetName);
      setErrorMsg(lang === 'fr'
        ? `La feuille "${invalidSheet.sheetName}" n'a pas de colonnes X et Y configurées. Veuillez les sélectionner.`
        : `Worksheet "${invalidSheet.sheetName}" is missing coordinate columns. Please assign X and Y.`);
      return;
    }

    try {
      const createdDatasets: SpatialDataset[] = [];

      for (const cfg of toImport) {
        const res = inspectExcelWorkbook(
          pendingFile.buffer,
          pendingFile.file.name,
          cfg.sheetName,
          cfg.xCol,
          cfg.yCol,
          cfg.crsCode
        );

        if (res.dataset) {
          if (cfg.outputName.trim()) {
            res.dataset.name = cfg.outputName.trim();
          }
          createdDatasets.push(res.dataset);
        }
      }

      if (createdDatasets.length === 0) {
        setErrorMsg(lang === 'fr' ? 'Aucune entité valide n\'a pu être créée à partir des feuilles configurées.' : 'No valid spatial features could be generated.');
        return;
      }

      onConfirmDataset(createdDatasets);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // Import single active sheet only
  const handleImportSingle = () => {
    if (!activeConfig || !activeConfig.xCol || !activeConfig.yCol) {
      setErrorMsg(lang === 'fr' ? 'Veuillez sélectionner les colonnes X et Y pour cette feuille.' : 'Please select X and Y columns for this sheet.');
      return;
    }

    try {
      const res = inspectExcelWorkbook(
        pendingFile.buffer,
        pendingFile.file.name,
        activeConfig.sheetName,
        activeConfig.xCol,
        activeConfig.yCol,
        activeConfig.crsCode
      );

      if (!res.dataset) {
        setErrorMsg(lang === 'fr' ? 'Impossible de construire des entités valides pour cette feuille.' : 'Could not construct valid features.');
        return;
      }

      if (activeConfig.outputName.trim()) {
        res.dataset.name = activeConfig.outputName.trim();
      }

      onConfirmDataset(res.dataset);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div 
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          theme === 'light'
            ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-amber-950/20'
            : 'bg-[#181411] border-stone-800 text-stone-100 shadow-stone-950/90'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {Object.keys(sheetConfigs).length > 1 ? 'Classeur Multi-Feuilles' : 'Tableur Excel'}
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {Object.keys(sheetConfigs).length} {lang === 'fr' ? 'feuilles détectées' : 'sheets detected'} · {(pendingFile.file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <h2 className="text-sm font-display font-bold mt-0.5">
                {lang === 'fr' 
                  ? 'Configuration et importation simultanée des feuilles Excel' 
                  : 'Simultaneous Multi-Sheet Configuration & Ingestion'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'light' ? 'text-stone-500 hover:bg-stone-200 text-stone-800' : 'text-stone-400 hover:bg-stone-800 text-stone-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">

          {/* 1. MULTI-SHEET SELECTOR & CONFIGURATION TABS (if workbook has multiple sheets) */}
          {Object.keys(sheetConfigs).length > 1 && (
            <div className={`p-3.5 rounded-2xl border space-y-3 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span className="font-display font-bold text-xs">
                    {lang === 'fr' ? 'Feuilles du classeur à importer :' : 'Workbook Sheets to Import :'}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    ({selectedList.length}/{Object.keys(sheetConfigs).length} {lang === 'fr' ? 'sélectionnées' : 'selected'})
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={selectAllSheets}
                    className="px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10"
                  >
                    {lang === 'fr' ? 'Tout cocher' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllSheets}
                    className="px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10"
                  >
                    {lang === 'fr' ? 'Tout décocher' : 'Deselect'}
                  </button>
                </div>
              </div>

              {/* Grid of Sheet cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {Object.values(sheetConfigs).map((cfg) => {
                  const isCurrentActive = activeSheetName === cfg.sheetName;
                  const isReady = cfg.xCol && cfg.yCol;

                  return (
                    <div
                      key={cfg.sheetName}
                      onClick={() => setActiveSheetName(cfg.sheetName)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isCurrentActive
                          ? (theme === 'light'
                              ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-400/50 shadow-xs'
                              : 'bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/40 text-stone-100')
                          : cfg.selected
                            ? (theme === 'light'
                                ? 'bg-white border-emerald-300 hover:border-emerald-400 text-stone-800'
                                : 'bg-[#181411] border-emerald-800/60 hover:border-emerald-600 text-stone-200')
                            : (theme === 'light'
                                ? 'bg-[#F2ECE3]/60 border-stone-300/70 text-stone-400 opacity-60'
                                : 'bg-[#120F0D] border-stone-800/60 text-stone-500 opacity-60')
                      }`}
                    >
                      {/* Checkbox & Details */}
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSheetSelected(cfg.sheetName);
                          }}
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            cfg.selected
                              ? 'bg-emerald-600 border-emerald-700 text-white'
                              : theme === 'light' ? 'border-stone-400 bg-white' : 'border-stone-700 bg-stone-900'
                          }`}
                          title="Toggle sheet for import"
                        >
                          {cfg.selected && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-bold text-xs truncate">
                              {cfg.sheetName}
                            </span>
                            {isCurrentActive && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-mono uppercase bg-amber-500 text-stone-950 font-bold">
                                Édition
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-stone-500 flex items-center space-x-1 mt-0.5 truncate">
                            <span>{cfg.rowCount.toLocaleString()} r</span>
                            <span>·</span>
                            {isReady ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                                ✓ {cfg.xCol}/{cfg.yCol}
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold truncate">
                                ⚠ X/Y requis
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Ready Indicator badge */}
                      <div className="shrink-0">
                        {isReady ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 block" title="Coordinates configured" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse block" title="Requires coordinate configuration" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. ACTIVE SHEET CONFIGURATION CARD */}
          {activeConfig && (
            <div className={`p-4 rounded-2xl border space-y-4 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-stone-800">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span className="font-display font-bold text-xs uppercase font-mono tracking-wider text-amber-600 dark:text-amber-400">
                    {lang === 'fr' 
                      ? `Configuration de la feuille active : "${activeConfig.sheetName}"` 
                      : `Active Sheet Settings: "${activeConfig.sheetName}"`}
                  </span>
                  <span className="text-[11px] font-mono text-stone-400">
                    ({activeConfig.rowCount.toLocaleString()} {lang === 'fr' ? 'lignes' : 'rows'})
                  </span>
                </div>

                {/* Quick actions for all sheets */}
                {Object.keys(sheetConfigs).length > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => applyColumnsToAllMatchingSheets(activeConfig.xCol, activeConfig.yCol)}
                      disabled={!activeConfig.xCol || !activeConfig.yCol}
                      className="flex items-center space-x-1 px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10 disabled:opacity-40"
                      title="Apply selected X/Y columns to all worksheets sharing these column names"
                    >
                      <CopyCheck className="w-3 h-3" />
                      <span>{lang === 'fr' ? 'Appliquer X/Y à toutes les feuilles' : 'Apply X/Y to all sheets'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCrsToAllSheets(activeConfig.crsCode)}
                      className="flex items-center space-x-1 px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10"
                      title="Apply active CRS to all worksheets"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{lang === 'fr' ? 'Appliquer CRS à toutes' : 'Apply CRS to all'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Layer Output Name */}
              <div>
                <label className="block text-[11px] font-mono text-stone-500 mb-1 font-semibold">
                  {lang === 'fr' ? 'Nom de la couche résultante dans l\'espace de travail :' : 'Output Layer Name in Workspace :'}
                </label>
                <input
                  type="text"
                  value={activeConfig.outputName}
                  onChange={(e) => updateActiveConfig({ outputName: e.target.value })}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                    theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                  }`}
                />
              </div>

              {/* Coordinate Columns Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Longitude (X) Column */}
                <div className={`p-3 rounded-xl border space-y-1.5 ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
                }`}>
                  <div className="flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    <label className="font-display font-bold text-xs">
                      {lang === 'fr' ? 'Colonne Longitude (X / Est) :' : 'Longitude (X / Easting) Column :'}
                    </label>
                  </div>
                  <select
                    value={activeConfig.xCol}
                    onChange={(e) => updateActiveConfig({ xCol: e.target.value })}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-emerald-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#181411] border-stone-700'
                    }`}
                  >
                    <option value="">-- {lang === 'fr' ? 'Sélectionner la colonne Longitude' : 'Select Longitude Column'} --</option>
                    {activeConfig.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400 block font-mono">
                    Synonymes: lon, long, longitude, x, easting
                  </span>
                </div>

                {/* Latitude (Y) Column */}
                <div className={`p-3 rounded-xl border space-y-1.5 ${
                  theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
                }`}>
                  <div className="flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    <label className="font-display font-bold text-xs">
                      {lang === 'fr' ? 'Colonne Latitude (Y / Nord) :' : 'Latitude (Y / Northing) Column :'}
                    </label>
                  </div>
                  <select
                    value={activeConfig.yCol}
                    onChange={(e) => updateActiveConfig({ yCol: e.target.value })}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#181411] border-stone-700'
                    }`}
                  >
                    <option value="">-- {lang === 'fr' ? 'Sélectionner la colonne Latitude' : 'Select Latitude Column'} --</option>
                    {activeConfig.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400 block font-mono">
                    Synonymes: lat, latitude, y, northing
                  </span>
                </div>
              </div>

              {/* Coordinate Reference System (CRS) Selection for this sheet */}
              <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                    <label className="font-display font-bold text-xs">
                      {lang === 'fr' ? 'Système de coordonnées (CRS) pour cette feuille :' : 'Source CRS for this Sheet :'}
                    </label>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center space-x-1.5">
                    <div className={`flex items-center p-0.5 rounded-lg border text-[11px] font-mono ${
                      theme === 'light' ? 'bg-[#EFEAE2] border-[#DCD5C9]' : 'bg-[#181411] border-stone-800'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setCrsTab('search')}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-all ${
                          crsTab === 'search'
                            ? theme === 'light'
                              ? 'bg-white text-stone-900 font-bold shadow-xs'
                              : 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <Search className="w-3 h-3" />
                        <span>Search 6,900+</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCrsTab('popular')}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md transition-all ${
                          crsTab === 'popular'
                            ? theme === 'light'
                              ? 'bg-white text-stone-900 font-bold shadow-xs'
                              : 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Presets</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsFullCRSModalOpen(true)}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
                        theme === 'light'
                          ? 'bg-white border-[#D6CEBE] text-stone-700 hover:bg-[#F2ECE3]'
                          : 'bg-[#181411] border-stone-700 text-stone-300 hover:text-white hover:bg-stone-800'
                      }`}
                      title="Open full CRS Registry dialog"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Registry Dialog...</span>
                    </button>
                  </div>
                </div>

                {/* Currently Active Selected CRS Badge Card */}
                <div className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  theme === 'light'
                    ? 'bg-[#FAF8F5] border-amber-300/80 shadow-xs'
                    : 'bg-[#181411] border-amber-600/40 shadow-inner'
                }`}>
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-500 font-mono font-bold text-xs border border-amber-500/30 shrink-0">
                      {activeCRSInfo.code}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs truncate ${theme === 'light' ? 'text-stone-900' : 'text-stone-100'}`}>
                        {activeCRSInfo.name}
                      </div>
                      <div className="text-[10px] text-stone-400 truncate flex items-center space-x-2 mt-0.5">
                        <span>{activeCRSInfo.area}</span>
                        <span>·</span>
                        <span className="capitalize">{activeCRSInfo.unit}</span>
                        <span>·</span>
                        <span>{activeCRSInfo.isGeographic ? 'Geographic 2D' : 'Projected 2D'}</span>
                      </div>
                    </div>
                  </div>

                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 text-[10px] font-mono border border-emerald-700/50 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Feuille: {activeConfig.sheetName}</span>
                  </span>
                </div>

                {/* TAB 1: Search All 6,900+ EPSG Registry */}
                {crsTab === 'search' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={crsSearchQuery}
                          onChange={(e) => setCrsSearchQuery(e.target.value)}
                          placeholder="Search 6,900+ CRS (e.g. 4261, 26192, 2154, 4326, Merchich, Lambert)..."
                          className={`w-full rounded-xl pl-9 pr-8 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                            theme === 'light'
                              ? 'bg-stone-50 border-[#D6CEBE] text-stone-900 placeholder-stone-400'
                              : 'bg-[#181411] border-stone-700 text-stone-100 placeholder-stone-500'
                          }`}
                        />
                        {crsSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCrsSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className={`flex items-center p-0.5 rounded-xl border text-[10px] font-mono self-start sm:self-auto ${
                        theme === 'light' ? 'bg-[#EFEAE2] border-[#DCD5C9]' : 'bg-[#181411] border-stone-800'
                      }`}>
                        {(['all', 'geographic', 'projected'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setCrsTypeFilter(type)}
                            className={`px-2 py-0.5 rounded-lg capitalize transition-colors ${
                              crsTypeFilter === type
                                ? theme === 'light'
                                  ? 'bg-white text-stone-900 font-bold shadow-xs'
                                  : 'bg-amber-600 text-stone-950 font-bold'
                                : 'text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {type === 'all' ? 'All' : type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scrollable Results List */}
                    <div className={`max-h-36 overflow-y-auto rounded-xl border divide-y ${
                      theme === 'light'
                        ? 'bg-white border-[#E2DBD0] divide-[#F0EBE3]'
                        : 'bg-[#181411] border-stone-800 divide-stone-800/60'
                    }`}>
                      {searchResults.length > 0 ? (
                        searchResults.map(crs => {
                          const isSelected = activeConfig.crsCode.toUpperCase() === crs.code.toUpperCase();
                          return (
                            <div
                              key={crs.code}
                              onClick={() => updateActiveConfig({ crsCode: crs.code })}
                              className={`p-2 flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected
                                  ? theme === 'light'
                                    ? 'bg-[#FEF3C7] text-stone-900 font-bold'
                                    : 'bg-amber-950/40 text-amber-200 font-semibold'
                                  : theme === 'light' ? 'hover:bg-[#FAF6F0]' : 'hover:bg-stone-900/60'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                                  isSelected
                                    ? 'bg-amber-500 text-stone-950 font-bold'
                                    : theme === 'light' ? 'bg-stone-100 text-stone-800' : 'bg-stone-800 text-stone-300'
                                }`}>
                                  {crs.code}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs truncate">{crs.name}</div>
                                  <div className="text-[10px] text-stone-400 truncate mt-0.5">
                                    {crs.area} · {crs.unit}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0">
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-stone-500/10 text-stone-400">
                                  {crs.isGeographic ? 'Geographic' : 'Projected'}
                                </span>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-amber-500 shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-xs text-stone-400">
                          No CRS matching &quot;{crsSearchQuery}&quot; found.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: Popular Presets Grid */}
                {crsTab === 'popular' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                    {[
                      { code: 'EPSG:4326', name: 'WGS 84 (GPS)', area: 'Global Standard', unit: 'degrees' },
                      { code: 'EPSG:4261', name: 'Sud_Maroc_degree (Merchich)', area: 'Morocco & Sahara', unit: 'degrees' },
                      { code: 'EPSG:26192', name: 'Sud_Maroc Metric (Lambert)', area: 'Morocco South Zone', unit: 'meters' },
                      { code: 'EPSG:3857', name: 'Web Mercator', area: 'Google / OSM', unit: 'meters' },
                      { code: 'EPSG:2154', name: 'RGF93 / Lambert-93', area: 'France', unit: 'meters' },
                      { code: 'EPSG:32628', name: 'WGS 84 / UTM 28N', area: 'West Africa / Atlantic', unit: 'meters' },
                      { code: 'EPSG:32629', name: 'WGS 84 / UTM 29N', area: 'West Africa', unit: 'meters' },
                      { code: 'EPSG:32630', name: 'WGS 84 / UTM 30N', area: 'West Africa / UK', unit: 'meters' },
                      { code: 'EPSG:27700', name: 'British National Grid', area: 'United Kingdom', unit: 'meters' },
                    ].map(crs => {
                      const isSelected = activeConfig.crsCode.toUpperCase() === crs.code.toUpperCase();
                      return (
                        <button
                          key={crs.code}
                          type="button"
                          onClick={() => updateActiveConfig({ crsCode: crs.code })}
                          className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-amber-500 bg-amber-950/40 text-amber-200 shadow-xs'
                              : theme === 'light'
                              ? 'bg-stone-50 border-[#E2DBD0] hover:border-amber-400/80 text-stone-800'
                              : 'bg-[#181411] border-stone-800 hover:border-stone-700 text-stone-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs text-amber-500">{crs.code}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <div className="font-semibold text-xs mt-1 truncate">{crs.name}</div>
                          <div className="text-[10px] text-stone-400 mt-0.5 truncate">{crs.area} ({crs.unit})</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live Data Sample Preview for Active Sheet */}
              <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                <span className="font-semibold block text-[11px] uppercase tracking-wider text-stone-400">
                  {lang === 'fr' 
                    ? `Aperçu des données de "${activeConfig.sheetName}" (${Math.min(4, activeConfig.previewRows.length)} lignes) :`
                    : `Data Preview for "${activeConfig.sheetName}" (${Math.min(4, activeConfig.previewRows.length)} rows) :`}
                </span>
                <div className={`rounded-xl border overflow-x-auto ${
                  theme === 'light' ? 'border-[#E2DBD0]' : 'border-stone-800/80'
                }`}>
                  <table className="w-full text-left text-[11px] font-mono border-collapse">
                    <thead className={theme === 'light' ? 'bg-[#F2EFEA]' : 'bg-[#120F0D]'}>
                      <tr>
                        <th className="p-2 text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800">#</th>
                        <th className="p-2 text-emerald-600 dark:text-emerald-400 font-bold border-b border-stone-200 dark:border-stone-800">
                          X: {activeConfig.xCol || '(Non sélectionné)'}
                        </th>
                        <th className="p-2 text-amber-600 dark:text-amber-400 font-bold border-b border-stone-200 dark:border-stone-800">
                          Y: {activeConfig.yCol || '(Non sélectionné)'}
                        </th>
                        <th className="p-2 text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800">
                          Autres Champs
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-stone-800/50">
                      {activeConfig.previewRows.slice(0, 4).map((row, idx) => {
                        const x = activeConfig.xCol ? row[activeConfig.xCol] : '—';
                        const y = activeConfig.yCol ? row[activeConfig.yCol] : '—';
                        const otherKeys = Object.keys(row).filter(k => k !== activeConfig.xCol && k !== activeConfig.yCol).slice(0, 3);

                        return (
                          <tr key={idx} className={theme === 'light' ? 'hover:bg-stone-50' : 'hover:bg-stone-900/50'}>
                            <td className="p-2 text-stone-500">{idx + 1}</td>
                            <td className="p-2 font-bold text-emerald-600 dark:text-emerald-400">{String(x ?? '—')}</td>
                            <td className="p-2 font-bold text-amber-600 dark:text-amber-400">{String(y ?? '—')}</td>
                            <td className="p-2 text-stone-400 truncate max-w-xs">
                              {otherKeys.map(k => `${k}: ${String(row[k] ?? '')}`).join(' · ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            {Object.keys(sheetConfigs).length > 1 ? (
              <span>
                {selectedList.length} / {Object.keys(sheetConfigs).length} {lang === 'fr' ? 'feuilles sélectionnées pour importation simultanée' : 'sheets selected for simultaneous import'}
              </span>
            ) : (
              <span>1 {lang === 'fr' ? 'feuille à importer' : 'sheet to import'}</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                theme === 'light' ? 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700' : 'bg-stone-900 border-stone-800 hover:bg-stone-800 text-stone-300'
              }`}
            >
              {lang === 'fr' ? 'Annuler' : 'Cancel'}
            </button>

            {Object.keys(sheetConfigs).length > 1 && (
              <button
                type="button"
                onClick={handleImportSingle}
                disabled={!activeConfig?.xCol || !activeConfig?.yCol}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border transition-all ${
                  theme === 'light'
                    ? 'bg-white border-stone-300 hover:bg-stone-100 text-stone-800'
                    : 'bg-stone-850 border-stone-700 hover:bg-stone-800 text-stone-200'
                }`}
                title={lang === 'fr' ? 'Importer uniquement la feuille en cours d\'édition' : 'Import only the actively edited sheet'}
              >
                {lang === 'fr' ? `Importer seule ("${activeConfig?.sheetName}")` : `Import "${activeConfig?.sheetName}" only`}
              </button>
            )}

            <button
              type="button"
              onClick={handleImportAllConfigured}
              disabled={selectedList.length === 0}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-md shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {Object.keys(sheetConfigs).length > 1
                  ? (lang === 'fr' 
                      ? `Importer toutes les feuilles cochées (${selectedList.length} couches)` 
                      : `Import All Selected Sheets (${selectedList.length} layers)`)
                  : (lang === 'fr' 
                      ? `Confirmer & Importer la couche` 
                      : `Confirm & Ingest Spatial Layer`)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen CRS Registry Modal */}
      <CRSModal
        isOpen={isFullCRSModalOpen}
        onClose={() => setIsFullCRSModalOpen(false)}
        selectedCRS={activeConfig?.crsCode || 'EPSG:4326'}
        onSelectCRS={(crs) => updateActiveConfig({ crsCode: crs.code })}
      />
    </div>
  );
};
