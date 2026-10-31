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
  Globe
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
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activePreset = PRESET_PROFILES.find(p => p.id === selectedPresetId);

  return (
    <header className="h-15 border-b border-white/[0.06] bg-[#13110E]/95 backdrop-blur-md select-none z-30 sticky top-0 flex items-center justify-between gap-4 px-5">
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
              <span className="font-display font-bold tracking-tight text-stone-100 text-sm group-hover:text-white transition-colors">
                OmniGeo
              </span>
              <span className="text-[10px] text-stone-500">by Maodo</span>
            </div>
            <div className="hidden xl:flex items-center gap-1.5 text-[10px] text-stone-500 font-sans">
              <span>{t.header.airGapped}</span>
              <span className="text-stone-700">·</span>
              <span className="font-mono text-stone-400">{settings.targetFormat.toUpperCase()}</span>
            </div>
          </div>
        </button>

        {/* Center-Left Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-0.5">
          {/* Craft Studio Tab */}
          <button
            onClick={() => setActiveTab('craft')}
            title={t.header.craftTab}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'craft'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
                : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'craft' ? 'text-amber-300' : ''}`} />
            <span className="hidden xl:inline">{t.header.craftTab}</span>
          </button>

          {/* Workspace Tab */}
          <button
            onClick={() => setActiveTab('workspace')}
            title={t.header.workspaceTab}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'workspace'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
                : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.workspaceTab}</span>
            {datasetCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-stone-300">
                {datasetCount}
              </span>
            )}
          </button>

          {/* Conversion Lab Tab */}
          <button
            onClick={() => setActiveTab('lab')}
            title={t.header.labTab}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'lab'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
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
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'map'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
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
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'monitor'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
                : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.monitorTab}</span>
            {runningJobCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* Showcase & Website Tab */}
          <button
            onClick={() => setActiveTab('showcase')}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              activeTab === 'showcase'
                ? 'bg-white/[0.07] text-stone-100 font-semibold'
                : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
            }`}
            title={t.header.showcaseTab}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{t.header.showcaseTab}</span>
            <span className="hidden xl:inline px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/[0.08] text-stone-300 uppercase">
              .exe
            </span>
          </button>
        </nav>
      </div>

      {/* Right: Streamlined Clean Controls & Primary CTA */}
      <div className="flex shrink-0 items-center gap-1.5">
        <label className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-stone-400 transition-colors hover:bg-white/[0.04] hover:text-stone-200 focus-within:ring-2 focus-within:ring-amber-500/60">
          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
            aria-label={lang === 'fr' ? 'Langue' : lang === 'ar' ? 'اللغة' : 'Language'}
            className="w-10 cursor-pointer appearance-none bg-transparent py-1 text-xs text-current focus:outline-none"
          >
            <option value="en" className="bg-[#1C1713] text-stone-100">{t.common.langEn}</option>
            <option value="fr" className="bg-[#1C1713] text-stone-100">{t.common.langFr}</option>
            <option value="ar" className="bg-[#1C1713] text-stone-100">{t.common.langAr}</option>
          </select>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        </label>

        {/* Minimalist Theme Toggle (Light with white background / Default Dark) */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
            theme === 'light'
              ? 'border-stone-200 text-stone-600 hover:bg-stone-100'
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
          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/[0.06] hover:text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
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
                ? 'border-white/[0.12] bg-white/[0.06] text-stone-100'
                : 'border-transparent text-stone-300 hover:bg-white/[0.06]'
            }`}
          >
            <Settings2 className="h-4 w-4 xl:hidden" />
            <span className="hidden xl:inline">{t.header.toolsAndPresets}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-stone-500 transition-transform ${isToolsOpen ? 'rotate-180' : ''}`} />
            {hasCertificate && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* Tools Menu Popover */}
          {isToolsOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#1C1714] border border-stone-700/80 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-stone-200 text-xs font-sans">
              {/* Presets Sub-section */}
              <div className="p-2 border-b border-stone-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase text-stone-400 font-semibold tracking-wider flex items-center space-x-1">
                    <Bookmark className="w-3 h-3 text-amber-400" />
                    <span>{t.header.activePreset}</span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">{settings.targetCRS}</span>
                </div>
                <select
                  value={selectedPresetId}
                  onChange={(e) => {
                    const p = PRESET_PROFILES.find(pr => pr.id === e.target.value);
                    if (p) onSelectPreset(p);
                  }}
                  className="w-full bg-[#120F0D] border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-100 font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {PRESET_PROFILES.map((p) => (
                    <option key={p.id} value={p.id} className="bg-stone-900 text-stone-100">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specialized GIS Integrity Tools */}
              <div className="py-1.5 space-y-0.5 border-b border-stone-800">
                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSpatialDoctor();
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg hover:bg-[#28211C] text-stone-200 hover:text-amber-300 text-left transition-colors"
                >
                  <Stethoscope className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.spatialDoctor}</div>
                    <div className="text-[10px] text-stone-400">{t.header.spatialDoctorDesc}</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSchemaHarmonizer();
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg hover:bg-[#28211C] text-stone-200 hover:text-orange-300 text-left transition-colors"
                >
                  <TableProperties className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.schemaHarmonizer}</div>
                    <div className="text-[10px] text-stone-400">{t.header.schemaHarmonizerDesc}</div>
                  </div>
                </button>

                {hasCertificate && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenAuditCertificate();
                    }}
                    className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 text-left transition-colors border border-emerald-700/40"
                  >
                    <Award className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">{t.header.qaqcAudit}</div>
                      <div className="text-[10px] text-emerald-400/80">{t.header.qaqcAuditDesc}</div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenPythonModal();
                  }}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg hover:bg-[#28211C] text-stone-200 hover:text-amber-300 text-left transition-colors"
                >
                  <Terminal className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">{t.header.desktopApp}</div>
                    <div className="text-[10px] text-stone-400">{t.header.desktopAppDesc}</div>
                  </div>
                </button>
              </div>

              {/* Dry-Run Toggle */}
              <div className="p-2">
                <button
                  onClick={() => setSettings(s => ({ ...s, isDryRun: !s.isDryRun }))}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    settings.isDryRun
                      ? 'bg-amber-950/60 border-amber-600/70 text-amber-300 font-semibold'
                      : 'bg-[#15120F] border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {settings.isDryRun ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-stone-500" />
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
