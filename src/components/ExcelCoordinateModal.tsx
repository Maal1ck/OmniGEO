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
  Filter
} from 'lucide-react';
import { COMMON_CRS_LIST, searchCRS, getCRSByCode } from '../core/crsDefinitions';
import { CRSInfo } from '../types/gis';
import { CRSModal } from './CRSModal';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';
import { inspectExcelWorkbook } from '../core/excelParser';
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
  onConfirmDataset: (dataset: SpatialDataset) => void;
}

export const ExcelCoordinateModal: React.FC<ExcelCoordinateModalProps> = ({
  isOpen,
  onClose,
  pendingFile,
  onConfirmDataset,
}) => {
  const { t } = useI18n();
  const { theme } = useTheme();

  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedXCol, setSelectedXCol] = useState<string>('');
  const [selectedYCol, setSelectedYCol] = useState<string>('');
  const [selectedCRS, setSelectedCRS] = useState<string>('EPSG:4326');
  const [currentHeaders, setCurrentHeaders] = useState<string[]>([]);
  const [currentPreviewRows, setCurrentPreviewRows] = useState<Record<string, any>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 6,900+ CRS Search Tab States
  const [crsTab, setCrsTab] = useState<'search' | 'popular'>('search');
  const [crsSearchQuery, setCrsSearchQuery] = useState<string>('');
  const [crsTypeFilter, setCrsTypeFilter] = useState<'all' | 'geographic' | 'projected'>('all');
  const [isFullCRSModalOpen, setIsFullCRSModalOpen] = useState(false);

  // Initialize or re-inspect when sheet changes
  useEffect(() => {
    if (!pendingFile) return;

    const sheet = pendingFile.selectedSheet || pendingFile.sheetNames[0] || '';
    setSelectedSheet(sheet);
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
      setErrorMsg('Please select both a Longitude (X) column and a Latitude (Y) column.');
      return;
    }

    try {
      const res = inspectExcelWorkbook(
        pendingFile.buffer,
        pendingFile.file.name,
        selectedSheet,
        selectedXCol,
        selectedYCol,
        selectedCRS
      );

      if (!res.dataset) {
        setErrorMsg('Could not construct valid spatial features from the selected columns.');
        return;
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
              <h2 className="text-sm font-display font-bold">
                Excel Coordinate Column Mapper
              </h2>
              <p className="text-[11px] text-stone-400 font-mono mt-0.5">
                {pendingFile.file.name} ({(pendingFile.file.size / 1024).toFixed(1)} KB · {pendingFile.totalRowCount} rows)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'light' ? 'text-stone-500 hover:bg-stone-200' : 'text-stone-400 hover:bg-stone-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Worksheet Selector if multiple sheets */}
          {pendingFile.sheetNames.length > 1 && (
            <div className="space-y-1.5">
              <label className="font-semibold block text-[11px] uppercase tracking-wider text-stone-400">
                Active Worksheet:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {pendingFile.sheetNames.map(sheet => (
                  <button
                    key={sheet}
                    type="button"
                    onClick={() => handleSheetChange(sheet)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                      selectedSheet === sheet
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold shadow-xs'
                        : theme === 'light'
                        ? 'bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800'
                    }`}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Coordinate Column Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Longitude (X) Column */}
            <div className={`p-3.5 rounded-xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#1D1714] border-stone-800'
            }`}>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <label className="font-display font-bold text-xs">
                  Longitude (X) Column:
                </label>
              </div>
              <select
                value={selectedXCol}
                onChange={(e) => setSelectedXCol(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-emerald-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#130F0D] border-stone-700'
                }`}
              >
                <option value="">-- Select Longitude / Easting Column --</option>
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
                  Latitude (Y) Column:
                </label>
              </div>
              <select
                value={selectedYCol}
                onChange={(e) => setSelectedYCol(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#130F0D] border-stone-700'
                }`}
              >
                <option value="">-- Select Latitude / Northing Column --</option>
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
                  Source Coordinate Reference System (CRS):
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
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-mono font-bold text-xs border border-amber-500/30 shrink-0">
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
                      placeholder="Search 6,900+ CRS by EPSG code, region, or projection (e.g. 2154, 3857, Lambert, UTM 32N, France, USA)..."
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
                  { code: 'EPSG:3857', name: 'Web Mercator', area: 'Google / OSM', unit: 'meters' },
                  { code: 'EPSG:2154', name: 'RGF93 / Lambert-93', area: 'France', unit: 'meters' },
                  { code: 'EPSG:27700', name: 'British National Grid', area: 'United Kingdom', unit: 'meters' },
                  { code: 'EPSG:25832', name: 'ETRS89 / UTM 32N', area: 'Central Europe', unit: 'meters' },
                  { code: 'EPSG:32632', name: 'WGS 84 / UTM 32N', area: 'Northern Europe', unit: 'meters' },
                  { code: 'EPSG:5070', name: 'NAD83 / Conus Albers', area: 'United States', unit: 'meters' },
                  { code: 'EPSG:2263', name: 'NAD83 / NY Long Island', area: 'New York (ftUS)', unit: 'feet' },
                  { code: 'EPSG:4269', name: 'NAD83 (Geographic)', area: 'North America', unit: 'degrees' },
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
                        <span className="font-mono font-bold text-xs text-amber-400">{crs.code}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
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
          <div className="space-y-2 pt-2 border-t border-stone-800">
            <span className="font-semibold block text-[11px] uppercase tracking-wider text-stone-400">
              Data Sample Verification ({Math.min(5, currentPreviewRows.length)} rows):
            </span>
            <div className="rounded-xl border overflow-x-auto border-stone-800/80">
              <table className="w-full text-left text-[11px] font-mono border-collapse">
                <thead className={theme === 'light' ? 'bg-[#F2EFEA]' : 'bg-[#120F0D]'}>
                  <tr>
                    <th className="p-2 text-stone-400 font-medium border-b border-stone-800">#</th>
                    <th className="p-2 text-emerald-400 font-bold border-b border-stone-800">
                      X: {selectedXCol || '(Unselected)'}
                    </th>
                    <th className="p-2 text-amber-400 font-bold border-b border-stone-800">
                      Y: {selectedYCol || '(Unselected)'}
                    </th>
                    <th className="p-2 text-stone-400 font-medium border-b border-stone-800">
                      Other Fields
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {currentPreviewRows.slice(0, 5).map((row, idx) => {
                    const x = selectedXCol ? row[selectedXCol] : '—';
                    const y = selectedYCol ? row[selectedYCol] : '—';
                    const otherKeys = Object.keys(row).filter(k => k !== selectedXCol && k !== selectedYCol).slice(0, 3);

                    return (
                      <tr key={idx} className={theme === 'light' ? 'hover:bg-stone-50' : 'hover:bg-stone-900/50'}>
                        <td className="p-2 text-stone-500">{idx + 1}</td>
                        <td className="p-2 font-bold text-emerald-400">{String(x ?? '—')}</td>
                        <td className="p-2 font-bold text-amber-400">{String(y ?? '—')}</td>
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
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              theme === 'light' ? 'bg-white border-stone-300 hover:bg-stone-100' : 'bg-stone-900 border-stone-800 hover:bg-stone-800 text-stone-300'
            }`}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedXCol || !selectedYCol}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-md shadow-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Confirm &amp; Ingest Spatial Layer</span>
          </button>
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
