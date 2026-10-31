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
  ShieldCheck,
  Check,
  Sun,
  Moon,
  Globe,
  Download
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
    <header className="h-15 border-b border-stone-800/80 bg-[#15120F]/95 backdrop-blur-xl select-none z-30 sticky top-0 flex items-center justify-between px-5">
      {/* Left: Refined Brand Identity */}
      <div className="flex items-center space-x-6">
        <div 
          className="flex items-center space-x-3 cursor-pointer group" 
          onClick={() => setActiveTab('craft')}
          title="OmniGeo by Maodo"
        >
          <Logo size={36} className="group-hover:scale-105 transition-transform duration-200" />
          
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-display font-extrabold tracking-tight text-[#FAF6F0] text-base group-hover:text-amber-200 transition-colors">
                OmniGeo
              </span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/40 tracking-wider">
                by Maodo
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-stone-400 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{t.header.airGapped}</span>
              <span className="text-stone-600">·</span>
              <span className="font-mono text-stone-400">{settings.targetFormat.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Center-Left Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1 bg-[#1E1915] p-1 rounded-xl border border-stone-800 shadow-inner">
          {/* Craft Studio Tab */}
          <button
            onClick={() => setActiveTab('craft')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'craft'
                ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-stone-950 shadow-md font-bold'
                : 'text-amber-300/90 hover:text-amber-200 hover:bg-stone-800/50'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'craft' ? 'text-stone-950 fill-current' : 'text-amber-400'}`} />
            <span>{t.header.craftTab}</span>
          </button>

          {/* Workspace Tab */}
          <button
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'workspace'
                ? 'bg-[#29221C] text-amber-300 shadow-sm border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t.header.workspaceTab}</span>
            {datasetCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800/50">
                {datasetCount}
              </span>
            )}
          </button>

          {/* Conversion Lab Tab */}
          <button
            onClick={() => setActiveTab('lab')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'lab'
                ? 'bg-[#29221C] text-amber-300 shadow-sm border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{t.header.labTab}</span>
          </button>

          {/* Map Preview Tab */}
          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'map'
                ? 'bg-[#29221C] text-amber-300 shadow-sm border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>{t.header.mapTab}</span>
          </button>

          {/* Job Monitor Tab */}
          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'monitor'
                ? 'bg-[#29221C] text-amber-300 shadow-sm border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t.header.monitorTab}</span>
            {runningJobCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* Showcase & Website Tab */}
          <button
            onClick={() => setActiveTab('showcase')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'showcase'
                ? 'bg-[#29221C] text-amber-300 shadow-sm border border-stone-700 font-semibold'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
            }`}
            title="View product presentation website & Windows .exe release"
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.header.showcaseTab}</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-950 text-amber-300 border border-amber-700/50 uppercase font-semibold">
              .exe
            </span>
          </button>
        </nav>
      </div>

      {/* Right: Streamlined Clean Controls & Primary CTA */}
      <div className="flex items-center space-x-2.5">
        {/* Direct Download .EXE CTA */}
        <a
          href="https://github.com/Maal1ck/OmniGEO/releases/latest/download/OmniGeo-Setup-1.0.0-x64.exe"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 text-xs font-bold transition-all shadow-md shadow-amber-950/30"
          title="Download OmniGeo Windows x64 .exe release installer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>.EXE</span>
        </a>
        {/* Subtle Language Switch */}
        <div 
          className="flex items-center rounded-xl bg-[#1C1713] border border-stone-800 p-0.5 text-xs font-mono shadow-sm"
          title={lang === 'ar' ? 'تبديل اللغة (EN / FR / عربي)' : lang === 'fr' ? 'Changer de langue (EN / FR / عربي)' : 'Switch language (EN / FR / AR)'}
        >
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2 py-1 rounded-lg transition-all text-[11px] font-semibold ${
              lang === 'en'
                ? 'bg-[#2A221C] text-amber-300 border border-amber-600/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            EN
          </button>
          <span className="text-stone-700 mx-0.5">·</span>
          <button
            type="button"
            onClick={() => setLang('fr')}
            className={`px-2 py-1 rounded-lg transition-all text-[11px] font-semibold ${
              lang === 'fr'
                ? 'bg-[#2A221C] text-amber-300 border border-amber-600/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            FR
          </button>
          <span className="text-stone-700 mx-0.5">·</span>
          <button
            type="button"
            onClick={() => setLang('ar')}
            className={`px-2 py-1 rounded-lg transition-all text-[11px] font-semibold ${
              lang === 'ar'
                ? 'bg-[#2A221C] text-amber-300 border border-amber-600/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="اللغة العربية"
          >
            عربي
          </button>
        </div>

        {/* Minimalist Theme Toggle (Light with white background / Default Dark) */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-xs font-medium shadow-sm ${
            theme === 'light'
              ? 'bg-amber-500/10 border-amber-600/40 text-amber-850 hover:bg-amber-500/20'
              : 'bg-[#1C1713] border-stone-800 hover:border-amber-600/40 text-stone-300 hover:text-stone-100 hover:bg-[#251E19]'
          }`}
          title={
            theme === 'dark' 
              ? (lang === 'fr' ? 'Activer le thème clair (fond blanc)' : 'Switch to Light theme (white background)') 
              : (lang === 'fr' ? 'Activer le thème sombre par défaut' : 'Switch to Default Dark theme')
          }
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline text-[11px] font-semibold">{lang === 'fr' ? 'Clair' : 'Light'}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline text-[11px] font-semibold">{lang === 'fr' ? 'Sombre' : 'Dark'}</span>
            </>
          )}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-2 bg-[#1C1713] hover:bg-[#251E19] border border-stone-800 hover:border-amber-600/40 px-3 py-1.5 rounded-xl text-xs text-stone-400 hover:text-stone-200 transition-all shadow-sm"
          title={t.header.commands}
        >
          <Search className="w-3.5 h-3.5 text-stone-400" />
          <span className="hidden lg:inline text-[11px]">{t.header.commands}</span>
          <kbd className="font-mono text-[10px] bg-stone-800/90 text-stone-300 px-1.5 py-0.5 rounded border border-stone-700">{t.header.commandsKbd}</kbd>
        </button>

        {/* Specialized Tools & Presets Dropdown */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              isToolsOpen || hasCertificate
                ? 'bg-[#251E19] text-amber-300 border-amber-600/50 shadow-sm'
                : 'bg-[#1C1713] text-stone-300 border-stone-800 hover:bg-[#251E19] hover:border-stone-700'
            }`}
          >
            <span>{t.header.toolsAndPresets}</span>
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
          className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-stone-950 shadow-lg shadow-amber-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
          title="Execute Batch Processing Pipeline"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{settings.isDryRun ? t.header.dryCheck : t.header.processBatch}</span>
          {readyCount > 0 && (
            <span className="ml-1 bg-stone-950/30 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold text-stone-950">
              {readyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
