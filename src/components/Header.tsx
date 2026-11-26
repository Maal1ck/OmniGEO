/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles,
  Layers, 
  Settings2, 
  Map as MapIcon, 
  Activity, 
  Play, 
  Search, 
  ChevronDown,
  Terminal, 
  CheckCircle2, 
  AlertTriangle,
  Bookmark,
  Stethoscope,
  TableProperties,
  Award,
  Sun,
  Moon,
  Globe,
  Check,
  Database,
  BookOpen,
  GitMerge,
  KeyRound,
  SlidersHorizontal,
  FileCode2,
  ShieldCheck
} from 'lucide-react';
import { Logo } from './Logo';
import { BatchSettings, PresetProfile } from '../types/gis';
import { LicenseStatus } from '../core/licenseClient';
import { PRESET_PROFILES } from '../core/presets';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

export type NavTab = 'craft' | 'workspace' | 'lab' | 'map' | 'monitor' | 'scripts' | 'showcase';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  datasetCount: number;
  readyCount: number;
  runningJobCount: number;
  settings: BatchSettings;
  setSettings: React.Dispatch<React.SetStateAction<BatchSettings>>;
  onOpenCommandPalette: () => void;
  onOpenPythonModal: () => void;
  onOpenSpatialDoctor: () => void;
  onOpenSchemaHarmonizer: () => void;
  onOpenAuditCertificate: () => void;
  hasCertificate: boolean;
  onStartBatch: () => void;
  selectedPresetId: string;
  onSelectPreset: (preset: PresetProfile) => void;
  onOpenConcatenationModal?: () => void;
  onOpenPostgisModal?: () => void;
  onOpenJoinModal?: () => void;
  onOpenPostgresReport?: () => void;
  onOpenRelationshipMapper?: () => void;
  onOpenDataCleaning?: () => void;
  onOpenLicenseModal?: () => void;
  licenseStatus?: LicenseStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  datasetCount,
  readyCount,
  runningJobCount,
  settings,
  setSettings,
  onOpenCommandPalette,
  onOpenPythonModal,
  onOpenSpatialDoctor,
  onOpenSchemaHarmonizer,
  onOpenAuditCertificate,
  hasCertificate,
  onStartBatch,
  selectedPresetId,
  onSelectPreset,
  onOpenConcatenationModal,
  onOpenPostgisModal,
  onOpenJoinModal,
  onOpenPostgresReport,
  onOpenRelationshipMapper,
  onOpenDataCleaning,
  onOpenLicenseModal,
  licenseStatus,
}) => {
  const { lang, setLang, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activePreset = PRESET_PROFILES.find(p => p.id === selectedPresetId);
  const sh = t.shell;
  const SECTIONS: Record<NavTab, { step?: string; title: string; hint: string }> = {
    craft: { title: t.header.craftTab, hint: sh.hintCraft },
    workspace: { step: '01', title: t.header.workspaceTab, hint: sh.hintWorkspace },
    lab: { step: '02', title: t.header.labTab, hint: sh.hintLab },
    map: { step: '03', title: t.header.mapTab, hint: sh.hintMap },
    monitor: { step: '04', title: t.header.monitorTab, hint: sh.hintMonitor },
    scripts: { title: t.header.scriptsTab, hint: sh.hintScripts },
    showcase: { title: t.header.showcaseTab, hint: sh.hintShowcase },
  };
  const section = SECTIONS[activeTab];

  return (
    <header className={`h-[60px] shrink-0 border-b select-none z-[100] sticky top-0 flex items-center justify-between gap-4 px-5 backdrop-blur-md transition-colors ${
      theme === 'light'
        ? 'bg-[#F7FAF5]/95 border-[#D4DFD3] text-[#141F1D]'
        : 'bg-[#0D1413]/95 border-white/[0.06] text-stone-100'
    }`}>
      {/* Left: current section (brand + navigation live in the side rail) */}
      <div className="flex min-w-0 items-center gap-4">
        <button type="button" className="md:hidden shrink-0" onClick={() => setActiveTab('craft')} title="OmniGeo by Maodo">
          <Logo size={30} />
        </button>
        <div className="min-w-0 flex items-baseline gap-3">
          {section.step && (
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--og-accent)]">{section.step}</span>
          )}
          <h1 className="truncate font-display text-[18px] font-bold tracking-[-0.03em] text-[var(--og-fg)]">{section.title}</h1>
          <span className="hidden 2xl:inline truncate text-xs text-[var(--og-fg-3)]">{section.hint}</span>
        </div>
      </div>

      {/* Right: Streamlined Clean Controls & Primary CTA */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Theme-Matched Custom Language Dropdown */}
        <div className="relative" ref={langMenuRef}>
          <button
            type="button"
            onClick={() => setIsLangOpen(!isLangOpen)}
            aria-expanded={isLangOpen}
            aria-label={lang === 'fr' ? 'Changer de langue' : lang === 'ar' ? 'تغيير اللغة' : 'Change language'}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              isLangOpen
                ? theme === 'light'
                  ? 'border-amber-600/50 bg-amber-50 text-amber-900 font-bold'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : theme === 'light'
                  ? 'border-[#D4DFD3] bg-white text-stone-800 hover:bg-[#EBF3E8] hover:text-stone-950 shadow-xs'
                  : 'border-white/[0.08] bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] hover:text-stone-100'
            }`}
          >
            <Globe className={`h-3.5 w-3.5 shrink-0 ${isLangOpen ? (theme === 'light' ? 'text-amber-700' : 'text-amber-400') : (theme === 'light' ? 'text-stone-500' : 'text-stone-400')}`} />
            <span className="font-semibold">{lang === 'en' ? 'EN' : lang === 'fr' ? 'FR' : 'عربي'}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'} ${isLangOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLangOpen && (
            <div
              role="menu"
              className={`absolute right-0 top-full mt-1.5 w-40 rounded-xl border p-1 shadow-2xl z-50 animate-in fade-in-0 zoom-in-95 duration-100 ${
                theme === 'light'
                  ? 'bg-white border-[#D4DFD3] text-stone-900 shadow-stone-400/20'
                  : 'bg-[#101917] border-stone-800 text-stone-200 shadow-stone-950/70'
              }`}
            >
              {[
                { code: 'en' as const, label: t.common.langEn, short: 'EN' },
                { code: 'fr' as const, label: t.common.langFr, short: 'FR' },
                { code: 'ar' as const, label: t.common.langAr, short: 'عربي' },
              ].map((item) => {
                const isActive = lang === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLang(item.code);
                      setIsLangOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? theme === 'light'
                          ? 'bg-[#FBE6CA] text-[#8B3315] font-bold border border-[#F3AA56]'
                          : 'bg-[#182623] text-amber-300 font-semibold'
                        : theme === 'light'
                          ? 'text-stone-700 hover:bg-[#EBF3E8] hover:text-stone-950'
                          : 'text-stone-400 hover:bg-[#15211F] hover:text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                        isActive
                          ? theme === 'light'
                            ? 'border-amber-600/40 bg-amber-100 text-amber-800 font-bold'
                            : 'border-amber-600/40 bg-amber-500/10 text-amber-500 font-bold'
                          : theme === 'light'
                            ? 'border-[#C2D2C2] text-stone-600'
                            : 'border-stone-700/50 text-stone-500'
                      }`}>
                        {item.short}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {isActive && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Minimalist Theme Toggle (Light with white background / Default Dark) */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
            theme === 'light'
              ? 'border-[#D4DFD3] bg-white text-stone-700 hover:bg-[#EBF3E8] hover:text-stone-950 shadow-xs'
              : 'border-transparent text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
          }`}
          title={
            theme === 'dark' 
              ? (lang === 'fr' ? 'Activer le thème clair (fond blanc)' : 'Switch to Light theme (white background)') 
              : (lang === 'fr' ? 'Activer le thème sombre par défaut' : 'Switch to Default Dark theme')
          }
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden lg:flex h-9 min-w-[220px] items-center gap-2 rounded-lg border border-[var(--og-line)] bg-[var(--og-surface)] ps-3 pe-2 text-xs text-[var(--og-fg-3)] transition-colors hover:border-[var(--og-line-strong)] hover:text-[var(--og-fg-2)]"
          title={`${t.header.commands} (${t.header.commandsKbd})`}
          aria-label={t.header.commands}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-start">{sh.searchPill}</span>
          <kbd className="og-kbd">{t.header.commandsKbd}</kbd>
        </button>
        <button
          onClick={onOpenCommandPalette}
          className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg text-[var(--og-fg-2)] hover:bg-[var(--og-surface-2)]"
          title={`${t.header.commands} (${t.header.commandsKbd})`}
          aria-label={t.header.commands}
        >
          <Search className="h-4 w-4" />
        </button>

        {/* Specialized Tools & Presets Dropdown */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            title={t.header.toolsAndPresets}
            aria-label={t.header.toolsAndPresets}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              isToolsOpen || hasCertificate
                ? theme === 'light'
                  ? 'border-[#C6D6C6] bg-[#DFE7DD] text-stone-900 font-semibold shadow-xs'
                  : 'border-white/[0.12] bg-white/[0.06] text-stone-100'
                : theme === 'light'
                  ? 'border-[#D4DFD3] bg-white text-stone-800 hover:bg-[#EBF3E8] hover:text-stone-950 shadow-xs'
                  : 'border-transparent text-stone-300 hover:bg-white/[0.06]'
            }`}
          >
            <Settings2 className="h-4 w-4 xl:hidden" />
            <span className="hidden xl:inline">{t.header.toolsAndPresets}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${theme === 'light' ? 'text-stone-500' : 'text-stone-500'} ${isToolsOpen ? 'rotate-180' : ''}`} />
            {hasCertificate && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* Tools Menu Popover */}
          {isToolsOpen && (
            <div className={`absolute right-0 mt-2 w-72 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs font-sans shadow-2xl ${
              theme === 'light'
                ? 'bg-white border-[#D4DFD3] text-stone-900 shadow-stone-400/25'
                : 'bg-[#131D1B] border-stone-700/80 text-stone-200 shadow-stone-950/80'
            }`}>
              {/* Presets Sub-section */}
              <div className={`p-2 border-b ${theme === 'light' ? 'border-[#E1E8DF]' : 'border-stone-800'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-mono uppercase font-semibold tracking-wider flex items-center space-x-1 ${theme === 'light' ? 'text-stone-600' : 'text-stone-400'}`}>
                    <Bookmark className="w-3 h-3 text-amber-500" />
                    <span>{t.header.activePreset}</span>
                  </span>
                  <span className={`text-[10px] font-mono font-bold ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>{settings.targetCRS}</span>
                </div>
                <select
                  value={selectedPresetId}
                  onChange={(e) => {
                    const p = PRESET_PROFILES.find(pr => pr.id === e.target.value);
                    if (p) onSelectPreset(p);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-amber-500 cursor-pointer border ${
                    theme === 'light'
                      ? 'bg-[#F5F9F3] border-[#C2D2C2] text-stone-900'
                      : 'bg-[#0C1312] border-stone-700 text-stone-100'
                  }`}
                >
                  {PRESET_PROFILES.map((p) => (
                    <option key={p.id} value={p.id} className={theme === 'light' ? 'bg-white text-stone-900' : 'bg-stone-900 text-stone-100'}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specialized GIS Integrity Tools */}
              <div className={`py-1.5 space-y-0.5 border-b ${theme === 'light' ? 'border-[#E1E8DF]' : 'border-stone-800'}`}>
                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSpatialDoctor();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                      : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.spatialDoctor}</div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{t.header.spatialDoctorDesc}</div>
                  </div>
                </button>

                {onOpenDataCleaning && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenDataCleaning();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">
                        {lang === 'fr' ? 'Audit & Nettoyage Attributaire' : 'Data Cleaning & Numeric Audit'}
                      </div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {lang === 'fr'
                          ? 'Reparer nombres (19,.7 -> Double), casse & separateurs'
                          : 'Fix malformed numbers (-> Double/Float), case & separators'}
                      </div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSchemaHarmonizer();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-orange-800'
                      : 'hover:bg-[#1B2926] text-stone-200 hover:text-orange-300'
                  }`}
                >
                  <TableProperties className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.schemaHarmonizer}</div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{t.header.schemaHarmonizerDesc}</div>
                  </div>
                </button>

                {hasCertificate && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenAuditCertificate();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors border ${
                      theme === 'light'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-700/40'
                    }`}
                  >
                    <Award className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">{t.header.qaqcAudit}</div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-emerald-700' : 'text-emerald-400/80'}`}>{t.header.qaqcAuditDesc}</div>
                    </div>
                  </button>
                )}

                {onOpenConcatenationModal && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenConcatenationModal();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">Concatenate & Merge Layers</div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>Map columns, reproject, & consolidate into one output</div>
                    </div>
                  </button>
                )}

                {onOpenJoinModal && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenJoinModal();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-purple-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-purple-300'
                    }`}
                  >
                    <GitMerge className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">
                        {lang === 'fr' ? 'Jointures (Attributs & Spatiale)' : lang === 'ar' ? 'الربط المكاني والجدولي' : 'Spatial & Attribute Joins'}
                      </div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {lang === 'fr' ? 'Lier des tables par clé commune ou prédicat spatial' : lang === 'ar' ? 'ربط الجداول بواسطة المفاتيح أو التراكب المكاني' : 'Join tables by key field or spatial overlay (intersects, within)'}
                      </div>
                    </div>
                  </button>
                )}

                {onOpenPostgisModal && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenPostgisModal();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-indigo-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-indigo-300'
                    }`}
                  >
                    <Database className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">PostgreSQL / PostGIS Exporter</div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>Generate SQL dump, ogr2ogr, and psql scripts</div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    setActiveTab('scripts');
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    theme === 'light'
                      ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                      : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                  }`}
                >
                  <FileCode2 className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">
                      {lang === 'fr' ? 'Scripts d\'Enrichissement (ArcPy / SQL)' : 'Schema Enrichment Scripts (ArcPy / SQL)'}
                    </div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                      {lang === 'fr'
                        ? 'Ajouter les colonnes manquantes et alimenter une table cible'
                        : 'Add missing columns & populate target table via ArcPy or SQL'}
                    </div>
                  </div>
                </button>

                {onOpenRelationshipMapper && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenRelationshipMapper();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-emerald-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-emerald-300'
                    }`}
                  >
                    <KeyRound className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">
                        {lang === 'fr' ? 'IDs, Relations & Mapping FK' : 'ID Generation & FK Relations'}
                      </div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {lang === 'fr'
                          ? 'Definir les relations, generer les PK et mapper les FK'
                          : 'Define table relationships, PK generators & auto-map FKs'}
                      </div>
                    </div>
                  </button>
                )}

                {onOpenPostgresReport && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenPostgresReport();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <TableProperties className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">
                        {lang === 'fr' ? 'Rapport Global Base de Données (PostgreSQL)' : 'Global Database Report (PostgreSQL)'}
                      </div>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {lang === 'fr' ? 'Tables, relations FK, volumétrie et rapport HTML complet' : 'Tables, foreign keys, row counts, & standalone HTML report'}
                      </div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenPythonModal();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-amber-800'
                      : 'hover:bg-[#1B2926] text-stone-200 hover:text-amber-300'
                  }`}
                >
                  <Terminal className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.desktopApp}</div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{t.header.desktopAppDesc}</div>
                  </div>
                </button>

                {onOpenLicenseModal && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenLicenseModal();
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      theme === 'light'
                        ? 'hover:bg-[#EBF3E8] text-stone-800 hover:text-emerald-800'
                        : 'hover:bg-[#1B2926] text-stone-200 hover:text-emerald-300'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs">
                        {lang === 'fr' ? 'Licence Desktop (Hors Ligne)' : 'Desktop License (Offline)'}
                      </div>
                      <div className={`text-[10px] font-mono truncate ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                        {licenseStatus?.isDesktopElectron
                          ? licenseStatus.isLifetime
                            ? (lang === 'fr' ? 'Perpétuelle · Active' : 'Lifetime · Active')
                            : licenseStatus.tier === 'annual'
                              ? `${lang === 'fr' ? '1 An' : 'Annual'} · ${licenseStatus.daysRemaining ?? 0}d`
                              : licenseStatus.tier === 'trial'
                                ? `${lang === 'fr' ? 'Essai' : 'Trial'} · ${licenseStatus.daysRemaining ?? 0}d`
                                : (lang === 'fr' ? 'Activation requise' : 'Activation required')
                          : (lang === 'fr' ? 'Clé Ed25519 · Essai / 1 An / Illimitée' : 'Ed25519 · Trial / Annual / Lifetime')}
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Dry-Run Toggle */}
              <div className="p-2">
                <button
                  onClick={() => setSettings(s => ({ ...s, isDryRun: !s.isDryRun }))}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    settings.isDryRun
                      ? theme === 'light'
                        ? 'bg-[#FBE6CA] border-[#F3AA56] text-[#8B3315] font-bold'
                        : 'bg-amber-950/60 border-amber-600/70 text-amber-300 font-semibold'
                      : theme === 'light'
                        ? 'bg-[#F5F9F3] border-[#D4DFD3] text-stone-700 hover:bg-[#EBF3E8]'
                        : 'bg-[#0E1614] border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {settings.isDryRun ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-stone-400' : 'text-stone-500'}`} />
                    )}
                    <span>{t.header.dryRun}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase font-bold">{settings.isDryRun ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action: Process Batch */}
        <button
          onClick={onStartBatch}
          disabled={datasetCount === 0 || runningJobCount > 0}
          className="flex items-center space-x-2 rounded-lg bg-[#A3694A] px-3.5 py-2 text-xs font-semibold text-stone-950 transition-colors hover:bg-[#B47858] disabled:cursor-not-allowed disabled:opacity-40"
          title="Execute Batch Processing Pipeline"
          aria-label={settings.isDryRun ? t.header.dryCheck : t.header.processBatch}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span className="hidden xl:inline">{settings.isDryRun ? t.header.dryCheck : t.header.processBatch}</span>
          {readyCount > 0 && (
            <span className="ml-1 hidden xl:inline bg-stone-950/30 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold text-stone-950">
              {readyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
