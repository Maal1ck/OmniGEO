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
  HelpCircle
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

  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedXCol, setSelectedXCol] = useState<string>('');
  const [selectedYCol, setSelectedYCol] = useState<string>('');
  const [selectedCRS, setSelectedCRS] = useState<string>('EPSG:4326');
  const [currentHeaders, setCurrentHeaders] = useState<string[]>([]);
  const [currentPreviewRows, setCurrentPreviewRows] = useState<Record<string, any>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Multi-Sheet Isolation State
  const [sheetIsolationMode, setSheetIsolationMode] = useState<'selected' | 'single'>('selected');
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());

  // 6,900+ CRS Search Tab States
  const [crsTab, setCrsTab] = useState<'search' | 'popular'>('search');
  const [crsSearchQuery, setCrsSearchQuery] = useState<string>('');
  const [crsTypeFilter, setCrsTypeFilter] = useState<'all' | 'geographic' | 'projected'>('all');
  const [isFullCRSModalOpen, setIsFullCRSModalOpen] = useState(false);

  // All sheets summaries
  const allSheetsSummaries: ExcelSheetSummary[] = useMemo(() => {
    if (!pendingFile) return [];
    try {
      return inspectAllExcelSheets(pendingFile.buffer);
    } catch {
      return [];
    }
  }, [pendingFile]);

  // Initialize or re-inspect when sheet changes
  useEffect(() => {
    if (!pendingFile) return;

    const sheet = pendingFile.selectedSheet || pendingFile.sheetNames[0] || '';
    setSelectedSheet(sheet);
    setSelectedSheets(new Set(pendingFile.sheetNames));
    setSheetIsolationMode(pendingFile.sheetNames.length > 1 ? 'selected' : 'single');
    setCurrentHeaders(pendingFile.headers);
    setCurrentPreviewRows(pendingFile.previewRows);
    setSelectedXCol(pendingFile.detectedXCol || '');
    setSelectedYCol(pendingFile.detectedYCol || '');
    setErrorMsg(null);
  }, [pendingFile]);

  // When user switches worksheet tab inside the modal
  const handleSheetChange = (newSheet: string) => {
    if (!pendingFile) return;
    try {
      setSelectedSheet(newSheet);
      const res = inspectExcelWorkbook(
        pendingFile.buffer,
        pendingFile.file.name,
        newSheet
      );
      setCurrentHeaders(res.headers);
      setCurrentPreviewRows(res.previewRows);
      if (res.detectedXCol) setSelectedXCol(res.detectedXCol);
      if (res.detectedYCol) setSelectedYCol(res.detectedYCol);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSheetSelection = (sheetName: string) => {
    const next = new Set(selectedSheets);
    if (next.has(sheetName)) {
      if (next.size > 1) next.delete(sheetName);
    } else {
      next.add(sheetName);
    }
    setSelectedSheets(next);
  };

  const isolateSingleSheetOnly = (sheetName: string) => {
    setSelectedSheets(new Set([sheetName]));
    setSheetIsolationMode('single');
    handleSheetChange(sheetName);
  };

  const selectAllSheets = () => {
    if (!pendingFile) return;
    setSelectedSheets(new Set(pendingFile.sheetNames));
    setSheetIsolationMode('selected');
  };

  // Active selected CRS details
  const activeCRSInfo = useMemo(() => {
    return getCRSByCode(selectedCRS) || {
      code: selectedCRS,
      name: selectedCRS,
      area: 'Global Reference',
      proj4: '',
      isGeographic: selectedCRS === 'EPSG:4326',
      unit: selectedCRS === 'EPSG:4326' ? 'degrees' : 'meters',
    };
  }, [selectedCRS]);

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

  const handleConfirm = () => {
    if (!selectedXCol || !selectedYCol) {
      setErrorMsg(lang === 'fr' 
        ? 'Veuillez sélectionner à la fois une colonne Longitude (X) et Latitude (Y) pour la feuille active.'
        : 'Please select both a Longitude (X) column and a Latitude (Y) column for the active sheet.');
      return;
    }

    try {
      // Single sheet mode or only 1 sheet selected
      if (sheetIsolationMode === 'single' || selectedSheets.size === 1) {
        const targetSheet = sheetIsolationMode === 'single' ? selectedSheet : Array.from(selectedSheets)[0];
        const res = inspectExcelWorkbook(
          pendingFile.buffer,
          pendingFile.file.name,
          targetSheet,
          targetSheet === selectedSheet ? selectedXCol : undefined,
          targetSheet === selectedSheet ? selectedYCol : undefined,
          selectedCRS
        );

        if (!res.dataset) {
          setErrorMsg(lang === 'fr' 
            ? 'Impossible de construire des entités spatiales valides à partir de cette feuille.'
            : 'Could not construct valid spatial features from the selected columns.');
          return;
        }

        onConfirmDataset(res.dataset);
        onClose();
        return;
      }

      // Multi-sheet isolation mode: process all selected sheets into separate layers!
      const createdDatasets: SpatialDataset[] = [];
      const sheetsToProcess = Array.from(selectedSheets);

      for (const sheetName of sheetsToProcess) {
        const isCurrentActive = sheetName === selectedSheet;
        const xToUse = isCurrentActive ? selectedXCol : undefined;
        const yToUse = isCurrentActive ? selectedYCol : undefined;

        try {
          const res = inspectExcelWorkbook(
            pendingFile.buffer,
            pendingFile.file.name,
            sheetName,
            xToUse,
            yToUse,
            selectedCRS
          );
          if (res.dataset) {
            createdDatasets.push(res.dataset);
          }
        } catch (e) {
          console.warn(`Could not parse sheet ${sheetName}:`, e);
        }
      }

      if (createdDatasets.length === 0) {
        setErrorMsg(lang === 'fr'
          ? 'Aucune des feuilles sélectionnées n\'a pu générer de données spatiales valides.'
          : 'None of the selected worksheets could produce valid spatial features.');
        return;
      }

      onConfirmDataset(createdDatasets);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div 
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
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
                  {pendingFile.sheetNames.length > 1 ? 'Classeur Multi-Feuilles' : 'Tableur Excel'}
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {pendingFile.sheetNames.length} {lang === 'fr' ? 'feuilles' : 'sheets'} · {(pendingFile.file.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <h2 className="text-sm font-display font-bold mt-0.5">
                {lang === 'fr' ? 'Isolation des feuilles & géolocalisation Excel' : 'Excel Sheet Isolation & Coordinate Mapping'}
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
          
          {/* MULTI-SHEET ISOLATION & SELECTION CARD (if workbook has multiple sheets) */}
          {pendingFile.sheetNames.length > 1 && (
            <div className={`p-4 rounded-2xl border space-y-3 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span className="font-display font-bold text-xs">
                    {lang === 'fr' ? 'Isoler les feuilles du classeur :' : 'Isolate Workbook Sheets :'}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">
                    ({selectedSheets.size}/{pendingFile.sheetNames.length} {lang === 'fr' ? 'sélectionnées' : 'selected'})
                  </span>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={selectAllSheets}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-colors ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                        : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {lang === 'fr' ? 'Tout cocher' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={() => isolateSingleSheetOnly(selectedSheet)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-colors ${
                      sheetIsolationMode === 'single'
                        ? 'bg-amber-500 text-stone-950 font-bold border-amber-600'
                        : theme === 'light'
                          ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                          : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {lang === 'fr' ? 'Isoler cette feuille seule' : 'Isolate active only'}
                  </button>
                </div>
              </div>

              {/* Sheet Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allSheetsSummaries.map((s) => {
                  const isChecked = selectedSheets.has(s.sheetName);
                  const isCurrentActive = selectedSheet === s.sheetName;

                  return (
                    <div
                      key={s.sheetName}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                        isCurrentActive
                          ? (theme === 'light'
                              ? 'bg-amber-50/90 border-amber-400 ring-1 ring-amber-400/40 text-stone-900 shadow-xs'
                              : 'bg-amber-950/40 border-amber-600/70 text-stone-100 ring-1 ring-amber-500/30')
                          : isChecked
                            ? (theme === 'light'
                                ? 'bg-white border-emerald-300 text-stone-800'
                                : 'bg-[#181411] border-emerald-800/60 text-stone-200')
                            : (theme === 'light'
                                ? 'bg-[#F2ECE3]/60 border-stone-300/70 text-stone-500 opacity-60'
                                : 'bg-[#120F0D] border-stone-800/60 text-stone-500 opacity-60')
                      }`}
                    >
                      {/* Left: Checkbox & Name */}
                      <div 
                        onClick={() => toggleSheetSelection(s.sheetName)}
                        className="flex items-center space-x-2.5 min-w-0 flex-1 cursor-pointer select-none"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-700 text-white'
                            : theme === 'light' ? 'border-stone-400 bg-white' : 'border-stone-700 bg-stone-900'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-bold text-xs truncate">
                              {s.sheetName}
                            </span>
                            {isCurrentActive && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-mono uppercase bg-amber-500 text-stone-950 font-bold">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-stone-500 flex items-center space-x-1.5 mt-0.5">
                            <span>{s.rowCount.toLocaleString()} {lang === 'fr' ? 'lignes' : 'rows'}</span>
                            <span>·</span>
                            {s.hasCoordinates ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                ✔ {s.detectedXCol}/{s.detectedYCol}
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                Manual mapping
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center space-x-1 shrink-0">
                        {!isCurrentActive ? (
                          <button
                            type="button"
                            onClick={() => handleSheetChange(s.sheetName)}
                            className={`px-2 py-0.5 text-[10px] font-mono rounded-md border transition-colors ${
                              theme === 'light'
                                ? 'bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-700'
                                : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-300'
                            }`}
                            title="Inspect & configure columns for this sheet"
                          >
                            {lang === 'fr' ? 'Configurer' : 'Config'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => isolateSingleSheetOnly(s.sheetName)}
                            className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-amber-500 text-stone-950 font-bold border border-amber-600"
                            title="Isolate this sheet exclusively"
                          >
                            {lang === 'fr' ? 'Isoler seule' : 'Isolate'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Coordinate Column Selection Grid (For active sheet) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Longitude (X) Column */}
            <div className={`p-3.5 rounded-xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#1D1714] border-stone-800'
            }`}>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <label className="font-display font-bold text-xs">
                  {lang === 'fr' ? 'Colonne Longitude (X) :' : 'Longitude (X) Column :'}
                </label>
              </div>
              <select
                value={selectedXCol}
                onChange={(e) => setSelectedXCol(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-emerald-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#130F0D] border-stone-700'
                }`}
              >
                <option value="">-- {lang === 'fr' ? 'Sélectionner la colonne Longitude / Est' : 'Select Longitude / Easting'} --</option>
                {currentHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-[10px] text-stone-400 block">
                Synonyms: lon, long, longitude, x, easting, xcoord
              </span>
            </div>

            {/* Latitude (Y) Column */}
            <div className={`p-3.5 rounded-xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#1D1714] border-stone-800'
            }`}>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <label className="font-display font-bold text-xs">
                  {lang === 'fr' ? 'Colonne Latitude (Y) :' : 'Latitude (Y) Column :'}
                </label>
              </div>
              <select
                value={selectedYCol}
                onChange={(e) => setSelectedYCol(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#130F0D] border-stone-700'
                }`}
              >
                <option value="">-- {lang === 'fr' ? 'Sélectionner la colonne Latitude / Nord' : 'Select Latitude / Northing'} --</option>
                {currentHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-[10px] text-stone-400 block">
                Synonyms: lat, latitude, y, northing, ycoord
              </span>
            </div>
          </div>

          {/* Coordinate Reference System (CRS) Selection - All 6,900+ EPSG Registry with Searchable Tab */}
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${
            theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#191411] border-stone-800'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                <label className="font-display font-bold text-xs">
                  {lang === 'fr' ? 'Système de coordonnées source (CRS) :' : 'Source Coordinate Reference System (CRS) :'}
                </label>
              </div>

              {/* Tabs & Full Modal Button */}
              <div className="flex items-center space-x-1.5">
                <div className={`flex items-center p-0.5 rounded-lg border text-[11px] font-mono ${
                  theme === 'light' ? 'bg-[#EFEAE2] border-[#DCD5C9]' : 'bg-[#110E0C] border-stone-800'
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
                    <span>Search 6,900+ CRS</span>
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
                    <span>Popular Standards</span>
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
                ? 'bg-white border-amber-300/80 shadow-xs'
                : 'bg-[#14100E] border-amber-600/40 shadow-inner'
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

              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 text-[10px] font-mono border border-emerald-700/50">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active Selection</span>
                </span>
              </div>
            </div>

            {/* TAB 1: Search All 6,900+ EPSG Registry */}
            {crsTab === 'search' && (
              <div className="space-y-2 pt-1">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={crsSearchQuery}
                      onChange={(e) => setCrsSearchQuery(e.target.value)}
                      placeholder="Search 6,900+ CRS by EPSG code, region, or projection (e.g. 4261, 26192, 2154, 4326, 3857, Lambert, Merchich)..."
                      className={`w-full rounded-xl pl-9 pr-8 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                        theme === 'light'
                          ? 'bg-white border-[#D6CEBE] text-stone-900 placeholder-stone-400'
                          : 'bg-[#120F0D] border-stone-700 text-stone-100 placeholder-stone-500'
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

                  {/* Type Filter Buttons */}
                  <div className={`flex items-center p-0.5 rounded-xl border text-[10px] font-mono self-start sm:self-auto ${
                    theme === 'light' ? 'bg-[#EFEAE2] border-[#DCD5C9]' : 'bg-[#120F0D] border-stone-800'
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

                {/* Match Counter Info */}
                <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 px-1">
                  <span>
                    {crsSearchQuery
                      ? `Found ${totalMatchingCRSs.toLocaleString()} matches across 6,900+ EPSG database`
                      : 'Live registry search active. Type to filter all 6,900+ worldwide projections.'}
                  </span>
                  <span>{searchResults.length} shown</span>
                </div>

                {/* Scrollable Results List */}
                <div className={`max-h-44 overflow-y-auto rounded-xl border divide-y ${
                  theme === 'light'
                    ? 'bg-white border-[#E2DBD0] divide-[#F0EBE3]'
                    : 'bg-[#120F0D] border-stone-800 divide-stone-800/60'
                }`}>
                  {searchResults.length > 0 ? (
                    searchResults.map(crs => {
                      const isSelected = selectedCRS.toUpperCase() === crs.code.toUpperCase();
                      return (
                        <div
                          key={crs.code}
                          onClick={() => setSelectedCRS(crs.code)}
                          className={`p-2 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? theme === 'light'
                                ? 'bg-[#FEF3C7] text-stone-900 font-bold'
                                : 'bg-amber-950/40 text-amber-200 font-semibold'
                              : theme === 'light'
                              ? 'hover:bg-[#FAF6F0]'
                              : 'hover:bg-stone-900/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                              isSelected
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : theme === 'light'
                                ? 'bg-stone-100 text-stone-800'
                                : 'bg-stone-800 text-stone-300'
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
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              crs.isGeographic
                                ? 'bg-sky-950/50 text-sky-300 border border-sky-800/40'
                                : 'bg-stone-800/70 text-stone-300'
                            }`}>
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
                    <div className="p-4 text-center text-xs text-stone-400">
                      No CRS matching &quot;{crsSearchQuery}&quot; found in the 6,900+ EPSG catalog.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Popular & Standard Presets Grid */}
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
                  const isSelected = selectedCRS.toUpperCase() === crs.code.toUpperCase();
                  return (
                    <button
                      key={crs.code}
                      type="button"
                      onClick={() => setSelectedCRS(crs.code)}
                      className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-amber-500 bg-amber-950/40 text-amber-200 shadow-xs'
                          : theme === 'light'
                          ? 'bg-white border-[#E2DBD0] hover:border-amber-400/80 text-stone-800'
                          : 'bg-[#120F0D] border-stone-800 hover:border-stone-700 text-stone-300'
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

          {/* Live Data Sample Preview */}
          <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <span className="font-semibold block text-[11px] uppercase tracking-wider text-stone-400">
              {lang === 'fr' 
                ? `Aperçu de la feuille active "${selectedSheet}" (${Math.min(5, currentPreviewRows.length)} lignes) :`
                : `Active Sheet Data Preview "${selectedSheet}" (${Math.min(5, currentPreviewRows.length)} rows) :`}
            </span>
            <div className={`rounded-xl border overflow-x-auto ${
              theme === 'light' ? 'border-[#E2DBD0]' : 'border-stone-800/80'
            }`}>
              <table className="w-full text-left text-[11px] font-mono border-collapse">
                <thead className={theme === 'light' ? 'bg-[#F2EFEA]' : 'bg-[#120F0D]'}>
                  <tr>
                    <th className="p-2 text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800">#</th>
                    <th className="p-2 text-emerald-600 dark:text-emerald-400 font-bold border-b border-stone-200 dark:border-stone-800">
                      X: {selectedXCol || '(Non sélectionné)'}
                    </th>
                    <th className="p-2 text-amber-600 dark:text-amber-400 font-bold border-b border-stone-200 dark:border-stone-800">
                      Y: {selectedYCol || '(Non sélectionné)'}
                    </th>
                    <th className="p-2 text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800">
                      Autres Champs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800/50">
                  {currentPreviewRows.slice(0, 5).map((row, idx) => {
                    const x = selectedXCol ? row[selectedXCol] : '—';
                    const y = selectedYCol ? row[selectedYCol] : '—';
                    const otherKeys = Object.keys(row).filter(k => k !== selectedXCol && k !== selectedYCol).slice(0, 3);

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

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            {pendingFile.sheetNames.length > 1 && (
              <span>
                {sheetIsolationMode === 'single'
                  ? (lang === 'fr' ? `1 feuille isolée (${selectedSheet})` : `1 sheet isolated (${selectedSheet})`)
                  : (lang === 'fr' ? `${selectedSheets.size} feuille(s) isolée(s)` : `${selectedSheets.size} sheet(s) isolated`)}
              </span>
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

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedXCol || !selectedYCol}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-md shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {sheetIsolationMode === 'selected' && selectedSheets.size > 1
                  ? (lang === 'fr' 
                      ? `Isoler & Importer (${selectedSheets.size} couches)` 
                      : `Isolate & Import (${selectedSheets.size} layers)`)
                  : (lang === 'fr' 
                      ? `Isoler & Importer la couche "${selectedSheet}"` 
                      : `Isolate & Import Layer "${selectedSheet}"`)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen CRS Registry Modal */}
      <CRSModal
        isOpen={isFullCRSModalOpen}
        onClose={() => setIsFullCRSModalOpen(false)}
        selectedCRS={selectedCRS}
        onSelectCRS={(crs) => setSelectedCRS(crs.code)}
      />
    </div>
  );
};
