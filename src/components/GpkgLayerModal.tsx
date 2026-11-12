/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  X, 
  Check, 
  MapPin, 
  Activity, 
  Square, 
  Box, 
  Search, 
  Filter, 
  CheckSquare, 
  ArrowRight,
  Database,
  Sparkles,
  HelpCircle,
  FileCheck
} from 'lucide-react';
import { GeoPackageLayerInfo } from '../core/geoPackageParser';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';

export interface PendingGpkgFile {
  file: File;
  buffer: ArrayBuffer;
  displayName: string;
  fileSize: number;
  layers: GeoPackageLayerInfo[];
}

interface GpkgLayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingGpkg: PendingGpkgFile | null;
  onConfirmLayers: (selectedTableNames: string[]) => void;
}

export const GpkgLayerModal: React.FC<GpkgLayerModalProps> = ({
  isOpen,
  onClose,
  pendingGpkg,
  onConfirmLayers,
}) => {
  const { theme } = useTheme();
  const { lang } = useI18n();

  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // When a pending file arrives, default to selecting all layers
  React.useEffect(() => {
    if (pendingGpkg && pendingGpkg.layers.length > 0) {
      setSelectedTables(new Set(pendingGpkg.layers.map(l => l.tableName)));
      setSearchQuery('');
    }
  }, [pendingGpkg]);

  const filteredLayers = useMemo(() => {
    if (!pendingGpkg) return [];
    if (!searchQuery.trim()) return pendingGpkg.layers;
    const q = searchQuery.toLowerCase();
    return pendingGpkg.layers.filter(
      l => l.tableName.toLowerCase().includes(q) || 
           l.identifier.toLowerCase().includes(q) ||
           (l.geometryType && l.geometryType.toLowerCase().includes(q))
    );
  }, [pendingGpkg, searchQuery]);

  if (!isOpen || !pendingGpkg) return null;

  const toggleLayer = (tableName: string) => {
    const next = new Set(selectedTables);
    if (next.has(tableName)) {
      next.delete(tableName);
    } else {
      next.add(tableName);
    }
    setSelectedTables(next);
  };

  const isolateSingleLayer = (tableName: string) => {
    setSelectedTables(new Set([tableName]));
  };

  const selectAll = () => {
    if (!pendingGpkg) return;
    setSelectedTables(new Set(pendingGpkg.layers.map(l => l.tableName)));
  };

  const deselectAll = () => {
    setSelectedTables(new Set());
  };

  const handleConfirm = () => {
    if (selectedTables.size === 0) return;
    onConfirmLayers(Array.from(selectedTables));
    onClose();
  };

  const renderGeomIcon = (geomType?: string) => {
    const t = (geomType || '').toUpperCase();
    if (t.includes('POINT')) return <MapPin className="w-3.5 h-3.5 text-emerald-500" />;
    if (t.includes('LINE')) return <Activity className="w-3.5 h-3.5 text-amber-500" />;
    if (t.includes('POLYGON')) return <Square className="w-3.5 h-3.5 text-orange-500" />;
    return <Box className="w-3.5 h-3.5 text-sky-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors ${
          theme === 'light'
            ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-amber-950/20'
            : 'bg-[#181411] border-stone-800 text-stone-100 shadow-stone-950/90'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  GeoPackage Multi-Couches
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {pendingGpkg.layers.length} {lang === 'fr' ? 'couches détectées' : 'layers detected'}
                </span>
              </div>
              <h2 className="text-base font-display font-bold truncate max-w-md mt-0.5">
                {lang === 'fr' ? 'Isoler les couches à importer' : 'Isolate Layers to Ingest'}
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

        {/* File Info & Guidance */}
        <div className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
        }`}>
          <div className="space-y-0.5 min-w-0">
            <div className="font-mono font-semibold truncate text-stone-800 dark:text-stone-200">
              {pendingGpkg.displayName}
            </div>
            <p className="text-[11px] text-stone-500 font-sans">
              {lang === 'fr'
                ? 'Ce GeoPackage contient plusieurs couches vectorielles. Choisissez celles que vous souhaitez isoler ou importer.'
                : 'This GeoPackage contains multiple feature layers. Select which ones to isolate or import.'}
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={selectAll}
              className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-colors ${
                theme === 'light'
                  ? 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700'
                  : 'bg-stone-850 border-stone-700 hover:bg-stone-800 text-stone-300'
              }`}
            >
              {lang === 'fr' ? 'Tout cocher' : 'Select All'}
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-colors ${
                theme === 'light'
                  ? 'bg-white border-stone-300 hover:bg-stone-100 text-stone-600'
                  : 'bg-stone-850 border-stone-700 hover:bg-stone-800 text-stone-400'
              }`}
            >
              {lang === 'fr' ? 'Tout décocher' : 'Deselect'}
            </button>
          </div>
        </div>

        {/* Filter Input if > 3 layers */}
        {pendingGpkg.layers.length > 3 && (
          <div className={`px-4 py-2.5 border-b ${
            theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
          }`}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'fr' ? 'Filtrer les couches par nom ou géométrie...' : 'Filter layers by name or geometry...'}
                className={`w-full pl-8 pr-4 py-1.5 text-xs font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  theme === 'light'
                    ? 'bg-stone-50 border-[#D6CEBE] text-stone-900 placeholder:text-stone-400'
                    : 'bg-[#181411] border-stone-700 text-stone-100 placeholder:text-stone-500'
                }`}
              />
            </div>
          </div>
        )}

        {/* Layers List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filteredLayers.map((layer) => {
            const isSelected = selectedTables.has(layer.tableName);

            return (
              <div
                key={layer.tableName}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? (theme === 'light'
                        ? 'bg-amber-50/80 border-amber-400 text-stone-900 shadow-xs'
                        : 'bg-amber-950/40 border-amber-600/70 text-stone-100')
                    : (theme === 'light'
                        ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-600 hover:bg-stone-50'
                        : 'bg-[#14100D] border-stone-800/80 text-stone-400 hover:bg-[#1A1512]')
                }`}
              >
                {/* Left: Checkbox & Layer details */}
                <div 
                  onClick={() => toggleLayer(layer.tableName)}
                  className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer select-none"
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected 
                      ? 'bg-amber-500 border-amber-600 text-stone-950' 
                      : theme === 'light' ? 'border-stone-300 bg-white' : 'border-stone-700 bg-stone-900'
                  }`}>
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-display font-bold text-xs truncate text-stone-900 dark:text-stone-100">
                        {layer.identifier || layer.tableName}
                      </span>
                      {layer.tableName !== layer.identifier && (
                        <span className="text-[10px] font-mono text-stone-400 truncate hidden sm:inline">
                          ({layer.tableName})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-stone-500">
                      <span className="flex items-center space-x-1">
                        {renderGeomIcon(layer.geometryType)}
                        <span>{layer.geometryType || 'Geometry'}</span>
                      </span>
                      <span>·</span>
                      <span>{layer.featureCount.toLocaleString()} {lang === 'fr' ? 'entités' : 'features'}</span>
                      <span>·</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        EPSG:{layer.srsId}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Quick Isolate Button */}
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      isolateSingleLayer(layer.tableName);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-colors ${
                      isSelected && selectedTables.size === 1
                        ? 'bg-amber-500 text-stone-950 border-amber-600 font-bold'
                        : theme === 'light'
                          ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-amber-400'
                          : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800 hover:border-amber-500'
                    }`}
                    title={lang === 'fr' ? 'Isoler uniquement cette couche' : 'Isolate only this layer'}
                  >
                    {isSelected && selectedTables.size === 1
                      ? (lang === 'fr' ? 'Isolée seule' : 'Isolated')
                      : (lang === 'fr' ? 'Isoler seule' : 'Isolate')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {selectedTables.size}
            </span> / {pendingGpkg.layers.length} {lang === 'fr' ? 'couche(s) sélectionnée(s)' : 'layers selected'}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                theme === 'light'
                  ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                  : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800'
              }`}
            >
              {lang === 'fr' ? 'Annuler' : 'Cancel'}
            </button>

            <button
              type="button"
              disabled={selectedTables.size === 0}
              onClick={handleConfirm}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-display font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-950/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
            >
              <span>
                {lang === 'fr'
                  ? `Isoler & Importer (${selectedTables.size})`
                  : `Isolate & Import (${selectedTables.size})`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
