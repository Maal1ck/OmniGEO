/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Download, 
  ExternalLink, 
  Github, 
  Sparkles, 
  ShieldCheck, 
  Globe, 
  Layers, 
  Stethoscope, 
  Calculator, 
  Award, 
  TableProperties, 
  Terminal, 
  Cpu, 
  FileBox, 
  Check, 
  Copy, 
  ChevronRight, 
  CheckCircle2, 
  ArrowRight,
  Monitor,
  Flame,
  FileCheck,
  Maximize2,
  HardDrive
} from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';
import { NavTab } from './Header';

interface ShowcaseWebsiteProps {
  onLaunchWorkbench: (tab?: NavTab) => void;
}

export const ShowcaseWebsite: React.FC<ShowcaseWebsiteProps> = ({ onLaunchWorkbench }) => {
  const { t, lang, setLang } = useI18n();
  const { theme } = useTheme();
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [activeFeatureTab, setActiveFeatureTab] = useState<'formats' | 'geodesy' | 'doctor' | 'cartography' | 'audit'>('formats');

  const githubRepoUrl = 'https://github.com/Maal1ck/OmniGEO';
  const exeDownloadUrl = 'https://github.com/Maal1ck/OmniGEO/releases/latest/download/OmniGeo-Setup-1.0.0-x64.exe';
  const releasesUrl = 'https://github.com/Maal1ck/OmniGEO/releases';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2200);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.75rem)] overflow-y-auto bg-[#13110E] text-[#F5EBE1] font-sans selection:bg-amber-500/30 selection:text-amber-200">
      
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <aside aria-label="Version announcement" className="bg-gradient-to-r from-amber-950 via-amber-900/60 to-orange-950 border-b border-amber-600/30 px-4 py-2 text-xs flex items-center justify-between">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-amber-200">OmniGeo v1.0.0 Released:</span>
            <span className="text-stone-300 hidden sm:inline">Windows x64 Native Installer & Offline Web GIS Studio</span>
          </div>
          <div className="flex items-center space-x-3">
            <a 
              href={exeDownloadUrl} 
              className="text-amber-300 hover:text-white font-bold flex items-center space-x-1 underline decoration-amber-500/50"
            >
              <span>Download .EXE</span>
              <Download className="w-3 h-3" />
            </a>
            <span className="text-stone-600">·</span>
            <a 
              href={githubRepoUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-stone-400 hover:text-amber-300 flex items-center space-x-1"
            >
              <Github className="w-3 h-3" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </aside>

      <div className="max-w-6xl mx-auto w-full px-6 py-12 space-y-20">

        {/* 2. HERO SECTION */}
        <section className="text-center space-y-6 pt-4">
          <div className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-amber-950/80 border border-amber-600/40 text-amber-300 text-xs font-mono font-medium shadow-lg shadow-amber-950/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.showcase.badge}</span>
          </div>

          <div className="flex justify-center my-3">
            <div className="relative group cursor-pointer" onClick={() => onLaunchWorkbench('craft')}>
              <Logo size={84} className="group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute -inset-4 bg-amber-500/10 rounded-full blur-xl -z-10 group-hover:bg-amber-500/20 transition-all" />
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold tracking-tight text-[#FAF6F0] max-w-4xl mx-auto leading-[1.12]">
            {t.showcase.heroTitlePrefix}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-orange-400">
              {t.showcase.heroTitleHighlight}
            </span>{' '}
            {t.showcase.heroTitleSuffix}
          </h1>

          <p className="text-sm sm:text-base text-stone-300 max-w-2xl mx-auto leading-relaxed">
            {t.showcase.heroSubtitle}
          </p>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            {/* Windows EXE Download Button */}
            <a
              href={exeDownloadUrl}
              className="group flex items-center space-x-3 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-stone-950 font-display font-bold text-sm shadow-xl shadow-amber-950/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              title="Download Windows x64 .exe release installer"
            >
              <div className="p-1 rounded-lg bg-stone-950/15">
                <Download className="w-5 h-5 text-stone-950" />
              </div>
              <div className="text-left">
                <span className="block leading-tight text-sm font-extrabold">{t.showcase.downloadExeBtn}</span>
                <span className="block text-[10px] text-stone-950/80 font-mono font-medium">{t.showcase.downloadExeSub}</span>
              </div>
            </a>

            {/* Launch Web Workbench Button */}
            <button
              onClick={() => onLaunchWorkbench('craft')}
              className="flex items-center space-x-2.5 px-6 py-3.5 rounded-2xl bg-[#1F1915] hover:bg-[#2A221C] border border-stone-700/80 hover:border-amber-500/50 text-[#FAF6F0] font-display font-bold text-sm transition-all shadow-md transform hover:-translate-y-0.5"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{t.showcase.launchWebBtn}</span>
              <ArrowRight className="w-4 h-4 text-stone-400" />
            </button>

            {/* View on GitHub */}
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-3.5 rounded-2xl bg-[#181411] hover:bg-[#221B17] border border-stone-800 text-stone-300 hover:text-white text-sm font-semibold transition-colors"
            >
              <Github className="w-4 h-4 text-stone-400" />
              <span>{t.showcase.viewGitHubBtn}</span>
            </a>
          </div>

          {/* Air-gapped and security check pills */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-mono text-stone-400">
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#181411] border border-stone-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Air-Gapped / Zero Telemetry</span>
            </span>
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#181411] border border-stone-800">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Client-Side SQLite WASM</span>
            </span>
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#181411] border border-stone-800">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>PROJ 6,900+ EPSG Systems</span>
            </span>
          </div>
        </section>

        {/* 3. DOWNLOAD & RELEASE CENTER */}
        <section className="relative rounded-3xl p-8 bg-gradient-to-br from-[#1C1713] via-[#16120F] to-[#120E0C] border border-amber-600/40 shadow-2xl overflow-hidden">
          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-amber-950 text-amber-300 border border-amber-600/40 text-[11px] font-mono font-semibold">
                <Monitor className="w-3.5 h-3.5 text-amber-400" />
                <span>Windows 64-bit Native Desktop</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#FAF6F0]">
                {t.showcase.releaseTitle}
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-sans">
                {t.showcase.releaseSub}
              </p>
              
              <div className="p-3.5 rounded-xl bg-[#110E0C] border border-stone-800 font-mono text-xs space-y-1.5">
                <div className="flex justify-between text-stone-400 text-[11px]">
                  <span>Artifact:</span>
                  <span className="text-amber-300 font-semibold">OmniGeo-Setup-1.0.0-x64.exe</span>
                </div>
                <div className="flex justify-between text-stone-400 text-[11px]">
                  <span>Release Tag:</span>
                  <span className="text-stone-200">v1.0.0 (Latest Release)</span>
                </div>
                <div className="flex justify-between text-stone-400 text-[11px]">
                  <span>License:</span>
                  <span className="text-emerald-400">Apache 2.0 (Open Source)</span>
                </div>
                <div className="flex justify-between text-stone-400 text-[11px]">
                  <span>SmartScreen Tip:</span>
                  <span className="text-stone-300">Click &ldquo;More info&rdquo; &rarr; &ldquo;Run anyway&rdquo;</span>
                </div>
              </div>

              <p className="text-[11px] text-stone-400 font-mono">
                {t.showcase.winReqs}
              </p>
            </div>

            {/* Action Box */}
            <div className="w-full lg:w-auto flex flex-col items-center sm:items-end space-y-3 flex-shrink-0">
              <a
                href={exeDownloadUrl}
                className="w-full sm:w-auto flex items-center justify-center space-x-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-display font-extrabold text-base shadow-2xl shadow-amber-950/60 transition-all transform hover:scale-105 active:scale-95"
              >
                <Download className="w-5 h-5" />
                <span>Download .EXE (x64)</span>
              </a>

              <div className="flex items-center space-x-3 text-xs font-mono">
                <a
                  href={releasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-400 hover:text-amber-300 underline flex items-center space-x-1"
                >
                  <span>All Release Assets</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-stone-600">·</span>
                <button
                  onClick={() => copyToClipboard(exeDownloadUrl, 'link')}
                  className="text-stone-400 hover:text-amber-300 flex items-center space-x-1"
                >
                  {copiedCmd === 'link' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd === 'link' ? 'Copied' : 'Copy Direct URL'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. FOUR KEY ARCHITECTURAL PILLARS */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#FAF6F0]">
              {t.showcase.featuresTitle}
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 max-w-xl mx-auto">
              {t.showcase.featuresSub}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Pillar 1 */}
            <div className="p-6 rounded-2xl bg-[#181411] border border-stone-800 space-y-3 shadow-lg hover:border-amber-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-sm text-[#FAF6F0]">
                {t.showcase.airGappedCardTitle}
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                {t.showcase.airGappedCardDesc}
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="p-6 rounded-2xl bg-[#181411] border border-stone-800 space-y-3 shadow-lg hover:border-amber-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-sm text-[#FAF6F0]">
                {t.showcase.formatCardTitle}
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                {t.showcase.formatCardDesc}
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="p-6 rounded-2xl bg-[#181411] border border-stone-800 space-y-3 shadow-lg hover:border-amber-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-sm text-[#FAF6F0]">
                {t.showcase.projCardTitle}
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                {t.showcase.projCardDesc}
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="p-6 rounded-2xl bg-[#181411] border border-stone-800 space-y-3 shadow-lg hover:border-amber-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Stethoscope className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-sm text-[#FAF6F0]">
                {t.showcase.doctorCardTitle}
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                {t.showcase.doctorCardDesc}
              </p>
            </div>
          </div>
        </section>

        {/* 5. INTERACTIVE FEATURE DEEP DIVE */}
        <section className="rounded-3xl p-6 sm:p-8 bg-[#16120F] border border-stone-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div>
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider">
                Full Spectrum GIS Capabilities
              </span>
              <h3 className="text-xl font-display font-bold text-[#FAF6F0]">
                Seven Groundbreaking Features Built for Production
              </h3>
            </div>

            {/* Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto text-xs font-mono p-1 rounded-xl bg-[#110E0C] border border-stone-800">
              {[
                { id: 'formats', label: 'Vector Engine' },
                { id: 'geodesy', label: 'Geodesy & Area' },
                { id: 'doctor', label: 'Spatial Doctor' },
                { id: 'cartography', label: 'Swipe Curtain' },
                { id: 'audit', label: 'QA/QC Audit' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFeatureTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeFeatureTab === tab.id
                      ? 'bg-amber-600 text-stone-950 font-bold shadow-sm'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content 1: Vector Engine */}
          {activeFeatureTab === 'formats' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-lg text-[#FAF6F0]">
                  Native OGC GeoPackage & Automated Shapefile Sidecar Bundling
                </h4>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Unlike traditional tools that corrupt shapefiles by losing sidecars, OmniGeo intelligently groups `.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg` files together into structured ZIP archives. GeoPackage output writes full SQLite schemas compliant with OGC standards.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-[#1C1713] border border-stone-800">
                    <span className="text-amber-400 font-bold block">GeoPackage (.gpkg)</span>
                    <span className="text-[11px] text-stone-400">Single-file SQLite spatial db</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#1C1713] border border-stone-800">
                    <span className="text-amber-400 font-bold block">ESRI Shapefile (.zip)</span>
                    <span className="text-[11px] text-stone-400">Sidecars preserved automatically</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#1C1713] border border-stone-800">
                    <span className="text-emerald-400 font-bold block">GeoJSON (RFC 7946)</span>
                    <span className="text-[11px] text-stone-400">High-fidelity web coordinates</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#1C1713] border border-stone-800">
                    <span className="text-orange-400 font-bold block">Google Earth KML</span>
                    <span className="text-[11px] text-stone-400">ExtendedData & styled placemarks</span>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#110E0C] border border-stone-800 font-mono text-xs space-y-2 shadow-inner">
                <div className="flex items-center justify-between text-stone-400 pb-2 border-b border-stone-800 text-[11px]">
                  <span>GDAL / CLI Equivalent</span>
                  <span className="text-amber-400">Air-Gapped WASM Engine</span>
                </div>
                <div className="p-3 rounded-lg bg-[#181411] border border-stone-800/80 text-amber-300 overflow-x-auto text-[11px]">
                  <code>ogr2ogr -f &quot;GPKG&quot; output.gpkg input.shp -t_srs EPSG:4326</code>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
                  OmniGeo reproduces GDAL and PROJ command line output with 100% zero-configuration graphical batch speed.
                </p>
              </div>
            </div>
          )}

          {/* Tab Content 2: Geodesy & Area */}
          {activeFeatureTab === 'geodesy' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-lg text-[#FAF6F0]">
                  Automated Geodesic Surface Calculations & Field Aggregations
                </h4>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Calculate surface areas on the WGS 84 ellipsoid or equal-area projections seamlessly into new columns (<code className="text-amber-300 font-mono">surface_ha</code>, <code className="text-amber-300 font-mono">surface_m2</code>). Aggregate fields dynamically with Count, Sum, Mean, Min, and Max metrics.
                </p>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-600/50">Hectares (ha)</span>
                  <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-600/50">Square Meters (m²)</span>
                  <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-600/50">Square Kilometers (km²)</span>
                  <span className="px-3 py-1 rounded-lg bg-amber-950 text-amber-300 border border-amber-600/50">Acres</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#110E0C] border border-stone-800 space-y-3 font-mono text-xs">
                <div className="flex items-center space-x-2 text-amber-400 font-bold">
                  <Calculator className="w-4 h-4" />
                  <span>Geodesic Area Engine</span>
                </div>
                <div className="p-3 rounded-lg bg-[#181411] text-[11px] text-stone-300 space-y-1">
                  <div>// Geodesic polygon area on Equal-Area Cylindrical</div>
                  <div className="text-emerald-400">gdf[&apos;surface_ha&apos;] = gdf.to_crs(6933).area / 10000;</div>
                  <div>// Group-by field aggregation</div>
                  <div className="text-amber-300">gdf[&apos;count_by_zone&apos;] = gdf.groupby(&apos;zone&apos;).transform(&apos;count&apos;)</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 3: Spatial Doctor */}
          {activeFeatureTab === 'doctor' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-lg text-[#FAF6F0]">
                  Pre-Flight Spatial Doctor & 1-Click Axis Inversion Repair
                </h4>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Inverted Latitude/Longitude coordinates are the #1 cause of corrupted GIS deliveries. OmniGeo runs heuristic bounds checking and coordinate range analysis, flagging swapped axes with confidence ratings and enabling 1-click inversion repair without modifying external files.
                </p>
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs">
                  <span>✔ Snaps unclosed polygon rings · Cleans consecutive duplicate vertices · Strips NaNs</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#110E0C] border border-stone-800 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] pb-2 border-b border-stone-800">
                  <span className="text-stone-400">Axis Inversion Diagnostic</span>
                  <span className="text-emerald-400 font-bold">99.4% Confidence</span>
                </div>
                <div className="p-3 rounded-lg bg-[#181411] text-[11px] space-y-1">
                  <div className="text-rose-400">Detected: Y in [-180, 180] & X in [-90, 90]</div>
                  <div className="text-emerald-400 font-bold">&rarr; 1-Click Axis Swap (X &harr; Y) Applied Successfully</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 4: Swipe Curtain */}
          {activeFeatureTab === 'cartography' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-lg text-[#FAF6F0]">
                  Interactive Leaflet Cartography & Split-Screen Swipe Curtain
                </h4>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Visually audit your reprojection accuracy by dragging a real-time vertical curtain across the map. Compare raw input geometries on the left against reprojected coordinates on the right, inspecting vertex drift down to sub-millimeter survey tolerances.
                </p>
                <div className="flex items-center space-x-2 text-xs font-mono text-stone-400">
                  <span className="px-2.5 py-1 rounded-md bg-[#1C1713] border border-stone-800">OSM</span>
                  <span className="px-2.5 py-1 rounded-md bg-[#1C1713] border border-stone-800">Dark Minimal</span>
                  <span className="px-2.5 py-1 rounded-md bg-[#1C1713] border border-stone-800">Satellite</span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-950 text-amber-300 border border-amber-700/50">100% Offline Grid</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#110E0C] border border-stone-800 font-mono text-xs text-center space-y-3">
                <div className="h-32 rounded-xl bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border border-stone-800 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-amber-400" />
                  <div className="absolute left-6 text-xs text-amber-300">SOURCE: WGS84</div>
                  <div className="absolute right-6 text-xs text-orange-400">TARGET: LAMBERT-93</div>
                </div>
                <span className="text-[11px] text-stone-400 block">External legend outside map frame eliminates all Leaflet glitches.</span>
              </div>
            </div>
          )}

          {/* Tab Content 5: QA/QC Audit */}
          {activeFeatureTab === 'audit' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-lg text-[#FAF6F0]">
                  Certified QA/QC Audit Certificate with Cryptographic SHA-256 Seals
                </h4>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Generate formal, audit-ready compliance certificates for spatial deliverables. Every report includes input/output SHA-256 hashes, exact PROJ datum shift parameters, validation pass rates, and can be printed or exported as standalone HTML documents.
                </p>
                <button
                  onClick={() => onLaunchWorkbench('monitor')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-bold text-xs transition-colors"
                >
                  View Sample QA/QC Certificate
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-[#110E0C] border border-stone-800 font-mono text-xs space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold pb-2 border-b border-stone-800">
                  <Award className="w-4 h-4" />
                  <span>ISO 19115 / OGC Geodetic Audit Record</span>
                </div>
                <div className="text-[11px] text-stone-400 space-y-1">
                  <div>SHA-256: <span className="text-stone-300">e3b0c44298fc1c149afbf4c8996fb92427ae...</span></div>
                  <div>Datum Shift: <span className="text-amber-400">EPSG:2154 &rarr; EPSG:4326 (Passed 100%)</span></div>
                  <div>Geometry Validity: <span className="text-emerald-400">100% Rings Closed, 0 Inversions</span></div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 6. DESKTOP VS WEB COMPARISON TABLE */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#FAF6F0]">
              {t.showcase.desktopVsWebTitle}
            </h2>
            <p className="text-xs sm:text-sm text-stone-400">
              {t.showcase.desktopVsWebSub}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 overflow-hidden bg-[#16120F]">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-[#110E0C] border-b border-stone-800 text-stone-400 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Feature / Capability</th>
                  <th className="py-3 px-4 text-amber-400 font-bold">Windows Desktop (.exe)</th>
                  <th className="py-3 px-4 text-stone-300">Web GIS Workbench</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800 text-xs">
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">Installation</td>
                  <td className="py-3 px-4 text-amber-300 font-bold">Native Windows Setup (.exe)</td>
                  <td className="py-3 px-4 text-stone-400">Zero install (Browser)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">Air-Gapped & Offline</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ 100% Offline Local-First</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ 100% Offline WASM</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">Batch File Ingestion</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Direct OS File Drop</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Browser Drag &amp; Drop</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">OGC GeoPackage & Shapefile</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Full Bundle Support</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Full Bundle Support</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">6,900+ EPSG Geodetic Engine</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Embedded PROJ Registry</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Embedded PROJ Registry</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-stone-300 font-sans font-medium">Telemetry & Data Privacy</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Zero Tracking / Private</td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">✔ Zero Tracking / Private</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. GITHUB PAGES DEPLOYMENT GUIDE */}
        <section className="rounded-3xl p-6 sm:p-8 bg-[#181411] border border-stone-800 space-y-4">
          <div className="flex items-center space-x-2 text-amber-400 font-display font-bold text-base">
            <Github className="w-5 h-5" />
            <span>{t.showcase.ghPagesDeployTitle}</span>
          </div>
          <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-sans">
            {t.showcase.ghPagesDeploySub} To publish this website live on GitHub Pages:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-[#110E0C] border border-stone-800 space-y-1">
              <span className="text-amber-400 font-bold block">1. Open GitHub Repo</span>
              <span className="text-stone-400 text-[11px]">Navigate to Settings &rarr; Pages on <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="underline text-amber-300">Maal1ck/OmniGEO</a></span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#110E0C] border border-stone-800 space-y-1">
              <span className="text-amber-400 font-bold block">2. Select Source</span>
              <span className="text-stone-400 text-[11px]">Select &quot;Deploy from a branch&quot; and choose <code className="text-amber-300 font-bold">main</code> branch with <code className="text-amber-300 font-bold">/docs</code> folder.</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#110E0C] border border-stone-800 space-y-1">
              <span className="text-emerald-400 font-bold block">3. Instant Live Site</span>
              <span className="text-stone-400 text-[11px]">Your website is published at <code className="text-emerald-300">maal1ck.github.io/OmniGEO</code> with download links!</span>
            </div>
          </div>
        </section>

        {/* 8. FOOTER */}
        <footer className="pt-8 border-t border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
          <div className="flex items-center space-x-2.5">
            <Logo size={24} />
            <span className="font-semibold text-stone-200">OmniGeo by Maodo</span>
            <span className="text-stone-600">·</span>
            <span>Apache 2.0 Open Source</span>
          </div>

          <div className="flex items-center space-x-4">
            <a href={exeDownloadUrl} className="text-amber-400 hover:text-white font-bold flex items-center space-x-1">
              <Download className="w-3.5 h-3.5" />
              <span>Windows .EXE</span>
            </a>
            <a href={releasesUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-200">
              Releases
            </a>
            <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-200 flex items-center space-x-1">
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </footer>

      </div>
    </div>
  );
};
