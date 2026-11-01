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
  Check
} from 'lucide-react';
import { Logo } from './Logo';
import { BatchSettings, PresetProfile } from '../types/gis';
import { PRESET_PROFILES } from '../core/presets';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

export type NavTab = 'craft' | 'workspace' | 'lab' | 'map' | 'monitor' | 'showcase';

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

  return (
    <header className={`h-15 border-b select-none z-30 sticky top-0 flex items-center justify-between gap-4 px-5 backdrop-blur-md transition-colors ${
      theme === 'light'
        ? 'bg-[#FAF8F5]/95 border-[#E2DBD0] text-[#1C1917]'
        : 'bg-[#13110E]/95 border-white/[0.06] text-stone-100'
    }`}>
      {/* Left: Refined Brand Identity */}
      <div className="flex min-w-0 items-center gap-5">
        <button
          type="button"
          className="flex shrink-0 items-center gap-2.5 cursor-pointer group text-left"
          onClick={() => setActiveTab('craft')}
          title="OmniGeo by Maodo"
        >
          <Logo size={32} className="transition-transform duration-200 group-hover:scale-105" />
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`font-display font-bold tracking-tight text-sm transition-colors ${
                theme === 'light' ? 'text-stone-900 group-hover:text-amber-800' : 'text-stone-100 group-hover:text-white'
              }`}>
                OmniGeo
              </span>
              <span className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-500'}`}>by Maodo</span>
            </div>
            <div className={`hidden xl:flex items-center gap-1.5 text-[10px] font-sans ${
              theme === 'light' ? 'text-stone-500' : 'text-stone-500'
            }`}>
              <span>{t.header.airGapped}</span>
              <span className={theme === 'light' ? 'text-stone-400' : 'text-stone-700'}>·</span>
              <span className={`font-mono font-medium ${theme === 'light' ? 'text-amber-800' : 'text-stone-400'}`}>
                {settings.targetFormat.toUpperCase()}
              </span>
            </div>
          </div>
        </button>

        {/* Center-Left Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {/* Craft Studio Tab */}
          <button
            onClick={() => setActiveTab('craft')}
            title={t.header.craftTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'craft'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'craft' ? (theme === 'light' ? 'text-amber-700' : 'text-amber-300') : ''}`} />
            <span className="hidden xl:inline">{t.header.craftTab}</span>
          </button>

          {/* Workspace Tab */}
          <button
            onClick={() => setActiveTab('workspace')}
            title={t.header.workspaceTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'workspace'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.workspaceTab}</span>
            {datasetCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                theme === 'light' ? 'bg-[#D6CEBE] text-stone-800 font-bold' : 'bg-white/[0.08] text-stone-300'
              }`}>
                {datasetCount}
              </span>
            )}
          </button>

          {/* Conversion Lab Tab */}
          <button
            onClick={() => setActiveTab('lab')}
            title={t.header.labTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'lab'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.labTab}</span>
          </button>

          {/* Map Preview Tab */}
          <button
            onClick={() => setActiveTab('map')}
            title={t.header.mapTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'map'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.mapTab}</span>
          </button>

          {/* Job Monitor Tab */}
          <button
            onClick={() => setActiveTab('monitor')}
            title={t.header.monitorTab}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'monitor'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.monitorTab}</span>
            {runningJobCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          {/* Showcase & Website Tab */}
          <button
            onClick={() => setActiveTab('showcase')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeTab === 'showcase'
                ? theme === 'light'
                  ? 'bg-[#EAE4DA] text-stone-900 font-bold shadow-xs'
                  : 'bg-white/[0.08] text-stone-100 font-semibold shadow-xs'
                : theme === 'light'
                  ? 'text-stone-600 hover:text-stone-950 hover:bg-[#F2ECE3]'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
            title={t.header.showcaseTab}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.showcaseTab}</span>
          </button>
        </nav>
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
                  ? 'border-[#E2DBD0] bg-white text-stone-800 hover:bg-[#F5EFE6] hover:text-stone-950 shadow-xs'
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
                  ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-stone-400/20'
                  : 'bg-[#181411] border-stone-800 text-stone-200 shadow-stone-950/70'
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
                          ? 'bg-[#FEF3C7] text-[#92400E] font-bold border border-[#FCD34D]'
                          : 'bg-[#251E19] text-amber-300 font-semibold'
                        : theme === 'light'
                          ? 'text-stone-700 hover:bg-[#F5EFE6] hover:text-stone-950'
                          : 'text-stone-400 hover:bg-[#201A16] hover:text-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                        isActive
                          ? theme === 'light'
                            ? 'border-amber-600/40 bg-amber-100 text-amber-800 font-bold'
                            : 'border-amber-600/40 bg-amber-500/10 text-amber-500 font-bold'
                          : theme === 'light'
                            ? 'border-[#D6CEBE] text-stone-600'
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
              ? 'border-[#E2DBD0] bg-white text-stone-700 hover:bg-[#F5EFE6] hover:text-stone-950 shadow-xs'
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
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
            theme === 'light'
              ? 'text-stone-600 hover:bg-[#F2ECE3] hover:text-stone-900'
              : 'text-stone-400 hover:bg-white/[0.06] hover:text-stone-100'
          }`}
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
                  ? 'border-[#D9D0C3] bg-[#EAE4DA] text-stone-900 font-semibold shadow-xs'
                  : 'border-white/[0.12] bg-white/[0.06] text-stone-100'
                : theme === 'light'
                  ? 'border-[#E2DBD0] bg-white text-stone-800 hover:bg-[#F5EFE6] hover:text-stone-950 shadow-xs'
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
            <div className={`absolute right-0 mt-2 w-72 rounded-2xl border p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs font-sans shadow-2xl ${
              theme === 'light'
                ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-stone-400/25'
                : 'bg-[#1C1714] border-stone-700/80 text-stone-200 shadow-stone-950/80'
            }`}>
              {/* Presets Sub-section */}
              <div className={`p-2 border-b ${theme === 'light' ? 'border-[#EBE5DC]' : 'border-stone-800'}`}>
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
                      ? 'bg-[#FAF7F2] border-[#D6CEBE] text-stone-900'
                      : 'bg-[#120F0D] border-stone-700 text-stone-100'
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
              <div className={`py-1.5 space-y-0.5 border-b ${theme === 'light' ? 'border-[#EBE5DC]' : 'border-stone-800'}`}>
                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSpatialDoctor();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                      : 'hover:bg-[#28211C] text-stone-200 hover:text-amber-300'
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.spatialDoctor}</div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{t.header.spatialDoctorDesc}</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSchemaHarmonizer();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-orange-800'
                      : 'hover:bg-[#28211C] text-stone-200 hover:text-orange-300'
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

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenPythonModal();
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    theme === 'light'
                      ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                      : 'hover:bg-[#28211C] text-stone-200 hover:text-amber-300'
                  }`}
                >
                  <Terminal className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.desktopApp}</div>
                    <div className={`text-[10px] ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>{t.header.desktopAppDesc}</div>
                  </div>
                </button>
              </div>

              {/* Dry-Run Toggle */}
              <div className="p-2">
                <button
                  onClick={() => setSettings(s => ({ ...s, isDryRun: !s.isDryRun }))}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    settings.isDryRun
                      ? theme === 'light'
                        ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E] font-bold'
                        : 'bg-amber-950/60 border-amber-600/70 text-amber-300 font-semibold'
                      : theme === 'light'
                        ? 'bg-[#FAF7F2] border-[#E2DBD0] text-stone-700 hover:bg-[#F5EFE6]'
                        : 'bg-[#15120F] border-stone-800 text-stone-400 hover:text-stone-200'
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
          className="flex items-center space-x-2 rounded-lg bg-[#A87945] px-3.5 py-2 text-xs font-semibold text-stone-950 transition-colors hover:bg-[#B98953] disabled:cursor-not-allowed disabled:opacity-40"
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
