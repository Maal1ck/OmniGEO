/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Layers, CheckSquare, Square, Database, Globe, Table2, Link2 } from 'lucide-react';
import { GdbInspectionResult } from '../core/fileGdbEngine';
import { useI18n } from '../core/i18n';

interface GdbLayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  gdbInfo: GdbInspectionResult | null;
  onConfirmSelection: (selectedTableNames: string[]) => void;
}

export const GdbLayerModal: React.FC<GdbLayerModalProps> = ({
  isOpen,
  onClose,
  gdbInfo,
  onConfirmSelection,
}) => {
  const { lang } = useI18n();
  const isFr = lang === 'fr';
  const [selected, setSelected] = useState<string[]>(() =>
    gdbInfo ? gdbInfo.layers.map((l) => l.tableName) : []
  );

  React.useEffect(() => {
    if (gdbInfo) {
      setSelected(gdbInfo.layers.map((l) => l.tableName));
    }
  }, [gdbInfo]);

  if (!isOpen || !gdbInfo) return null;

  const toggleLayer = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const toggleAll = () => {
    if (selected.length === gdbInfo.layers.length) {
      setSelected([]);
    } else {
      setSelected(gdbInfo.layers.map((l) => l.tableName));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#191410] border border-stone-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-stone-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-[#14100D]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-[#FAF6F0]">
                {isFr ? 'Inspecteur Esri File Geodatabase (.gdb)' : 'Esri File Geodatabase (.gdb) Inspector'}
              </h2>
              <p className="text-xs text-stone-400 font-mono truncate max-w-md">
                {gdbInfo.gdbName} &bull; {gdbInfo.layers.length} {isFr ? 'couches / tables' : 'layers / tables'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-300">
              {isFr
                ? 'Sélectionnez les classes d’entités et tables à importer dans l’atelier :'
                : 'Select feature classes and attribute tables to import into workspace:'}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-mono text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
            >
              {selected.length === gdbInfo.layers.length
                ? isFr ? 'Tout désélectionner' : 'Deselect All'
                : isFr ? 'Tout sélectionner' : 'Select All'}
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {gdbInfo.layers.map((layer) => {
              const isChecked = selected.includes(layer.tableName);
              return (
                <div
                  key={layer.internalFileName}
                  onClick={() => toggleLayer(layer.tableName)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    isChecked
                      ? 'bg-amber-950/35 border-amber-500/60 shadow-sm'
                      : 'bg-stone-900/50 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start space-x-3 min-w-0">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-mono font-bold text-xs text-[#FAF6F0]">
                          {layer.tableName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
                          {layer.internalFileName}
                        </span>
                        {layer.isNonSpatial ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-700/40 inline-flex items-center gap-1">
                            <Table2 className="w-3 h-3" />
                            <span>{isFr ? 'Table Attributaire' : 'Attribute Table'}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/40 inline-flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>{layer.geometryType}</span>
                          </span>
                        )}
                      </div>
                      {layer.comment && (
                        <p className="text-[11px] text-amber-300/90 mt-1 truncate">
                          {layer.comment}
                        </p>
                      )}
                      <div className="flex items-center flex-wrap gap-3 mt-1.5 text-[11px] text-stone-400 font-mono">
                        <span>{layer.featureCount.toLocaleString()} {isFr ? 'entités' : 'records'}</span>
                        <span>{layer.fieldNames.length} {isFr ? 'champs' : 'fields'}</span>
                        {!layer.isNonSpatial && (
                          <span className="inline-flex items-center gap-1 text-stone-300">
                            <Globe className="w-3 h-3 text-amber-500" />
                            {layer.crsCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {gdbInfo.discoveredRelationships.length > 0 && (
            <div className="p-3 rounded-xl bg-purple-950/25 border border-purple-700/40 space-y-1.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-purple-300">
                <Link2 className="w-3.5 h-3.5" />
                <span>
                  {isFr
                    ? `${gdbInfo.discoveredRelationships.length} RelationshipClass détectée(s) dans GDB_Items`
                    : `${gdbInfo.discoveredRelationships.length} RelationshipClass(es) detected in GDB_Items`}
                </span>
              </div>
              <div className="text-[11px] font-mono text-stone-300 space-y-0.5">
                {gdbInfo.discoveredRelationships.map((r, i) => (
                  <div key={`${r.name}-${i}`}>
                    {r.originTable} ({r.originPrimaryKey || 'PK'}) &rarr; {r.destinationTable} ({r.originForeignKey || 'FK'}) [{r.cardinality || '1:N'}]
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-800 bg-[#14100D] flex items-center justify-between">
          <span className="text-xs font-mono text-stone-400">
            {selected.length} / {gdbInfo.layers.length} {isFr ? 'sélectionnée(s)' : 'selected'}
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-700 text-xs font-semibold text-stone-300 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onConfirmSelection(selected)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 text-xs font-bold transition-colors cursor-pointer"
            >
              {isFr ? `Importer ${selected.length} Couche(s)` : `Import ${selected.length} Layer(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
