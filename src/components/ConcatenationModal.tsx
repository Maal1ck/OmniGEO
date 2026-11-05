import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  X, 
  ArrowRight, 
  Check, 
  Plus, 
  Trash2, 
  Sparkles, 
  Database, 
  AlertCircle, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { COMMON_CRS_LIST } from '../core/crsDefinitions';
import { 
  ColumnMapping, 
  ConcatenationOptions, 
  generateInitialColumnMappings, 
  concatenateDatasets 
} from '../core/datasetConcatenator';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';

interface ConcatenationModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  onAddConcatenatedDataset: (newDataset: SpatialDataset) => void;
  initialSelectedIds?: string[];
}

export const ConcatenationModal: React.FC<ConcatenationModalProps> = ({
  isOpen,
  onClose,
  datasets,
  onAddConcatenatedDataset,
  initialSelectedIds,
}) => {
  const { theme } = useTheme();
  const { t } = useI18n();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialSelectedIds && initialSelectedIds.length >= 2) {
      return new Set(initialSelectedIds);
    }
    return new Set(datasets.slice(0, 3).map(d => d.id));
  });

  const [outputName, setOutputName] = useState<string>('concatenated_dataset');
  const [targetCRS, setTargetCRS] = useState<string>('EPSG:4326');
  const [addSourceField, setAddSourceField] = useState<boolean>(true);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  // Filter datasets currently selected for concatenation
  const selectedDatasets = datasets.filter(d => selectedIds.has(d.id));

  // Auto-generate initial mappings when selected datasets change
  useEffect(() => {
    if (selectedDatasets.length >= 2) {
      const initial = generateInitialColumnMappings(selectedDatasets);
      setMappings(initial);
      // Auto-set targetCRS to the first dataset's CRS if available
      if (selectedDatasets[0]?.detectedCRS?.code) {
        setTargetCRS(selectedDatasets[0].detectedCRS.code);
      }
    }
  }, [selectedIds.size]);

  if (!isOpen) return null;

  const toggleDataset = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size > 2) next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleAddColumn = () => {
    const newId = `map-${Date.now()}`;
    const emptySources: Record<string, string | null> = {};
    selectedDatasets.forEach(d => { emptySources[d.id] = null; });

    setMappings(prev => [
      ...prev,
      {
        id: newId,
        targetName: `custom_field_${prev.length + 1}`,
        targetType: 'string',
        sourceColumns: emptySources,
      },
    ]);
  };

  const handleRemoveColumn = (id: string) => {
    setMappings(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateTargetName = (id: string, name: string) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, targetName: name } : m));
  };

  const handleUpdateTargetType = (id: string, type: ColumnMapping['targetType']) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, targetType: type } : m));
  };

  const handleUpdateSourceColumn = (mapId: string, datasetId: string, sourceCol: string | null) => {
    setMappings(prev => prev.map(m => {
      if (m.id !== mapId) return m;
      return {
        ...m,
        sourceColumns: {
          ...m.sourceColumns,
          [datasetId]: sourceCol === '__empty__' ? null : sourceCol,
        },
      };
    }));
  };

  const handleAutoRemap = () => {
    const remap = generateInitialColumnMappings(selectedDatasets);
    setMappings(remap);
  };

  const handleExecuteConcatenation = () => {
    if (selectedDatasets.length < 2) {
      setErrorMsg('Please select at least 2 datasets to concatenate.');
      return;
    }
    if (!outputName.trim()) {
      setErrorMsg('Please provide a name for the output dataset.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const options: ConcatenationOptions = {
        outputName: outputName.trim(),
        targetCRS,
        addSourceLayerField: addSourceField,
        sourceLayerFieldName: '_source_layer',
        mappings,
      };

      const result = concatenateDatasets(selectedDatasets, options);
      onAddConcatenatedDataset(result.dataset);
      setSuccessCount(result.featureCount);
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'Error occurred during layer concatenation.');
    }
  };

  const totalFeatures = selectedDatasets.reduce((sum, d) => sum + d.featureCount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          theme === 'light'
            ? 'bg-[#FAF8F5] border-[#E2DBD0] text-stone-900 shadow-stone-500/20'
            : 'bg-[#181411] border-stone-800 text-stone-100 shadow-stone-950/80'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          theme === 'light' ? 'border-[#EBE5DC] bg-white' : 'border-stone-800/80 bg-[#1F1915]'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl ${
              theme === 'light' ? 'bg-amber-100 text-amber-800' : 'bg-amber-950/60 text-amber-400 border border-amber-700/40'
            }`}>
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-display font-bold flex items-center gap-2">
                <span>Concatenate & Merge Layers</span>
                <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {selectedDatasets.length} Layers Selected
                </span>
              </h2>
              <p className={`text-xs ${theme === 'light' ? 'text-stone-500' : 'text-stone-400'}`}>
                Harmonize column schemas across multiple files and generate a unified consolidated output dataset.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'light' ? 'hover:bg-stone-200 text-stone-600' : 'hover:bg-stone-800 text-stone-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Select Layers to Merge */}
          <div>
            <label className="text-xs font-mono uppercase tracking-wider font-bold mb-2 block">
              1. Select Source Layers to Combine (Minimum 2)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {datasets.map(d => {
                const isSelected = selectedIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDataset(d.id)}
                    className={`flex items-start justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? theme === 'light'
                          ? 'bg-[#FEF3C7] border-amber-500 text-amber-950 font-semibold shadow-xs'
                          : 'bg-amber-950/40 border-amber-600 text-amber-200 shadow-xs'
                        : theme === 'light'
                          ? 'bg-white border-[#E2DBD0] text-stone-700 hover:border-stone-400'
                          : 'bg-[#201A16] border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold truncate">{d.name}</div>
                      <div className="text-[10px] opacity-75 font-mono mt-0.5">
                        {d.featureCount} feats · {d.detectedCRS?.code || 'CRS?'} · {d.format}
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                      isSelected 
                        ? 'bg-amber-600 border-amber-600 text-white' 
                        : theme === 'light' ? 'border-stone-400' : 'border-stone-700'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Output Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider font-bold mb-1.5 block">
                Output Layer Name
              </label>
              <input
                type="text"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                placeholder="concatenated_output"
                className={`w-full px-3 py-2 text-xs rounded-xl border font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-900' : 'bg-[#201A16] border-stone-700 text-stone-100'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-mono uppercase tracking-wider font-bold mb-1.5 block">
                Target CRS / Coordinate System
              </label>
              <select
                value={targetCRS}
                onChange={(e) => setTargetCRS(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-900' : 'bg-[#201A16] border-stone-700 text-stone-100'
                }`}
              >
                {COMMON_CRS_LIST.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className={`flex items-center space-x-2.5 p-2 rounded-xl border cursor-pointer ${
                theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#201A16] border-stone-700'
              }`}>
                <input
                  type="checkbox"
                  checked={addSourceField}
                  onChange={(e) => setAddSourceField(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-medium">Add <code className="font-mono text-amber-600 dark:text-amber-400">_source_layer</code> column</span>
              </label>
            </div>
          </div>

          {/* Step 3: Column Mapping Matrix */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider font-bold">
                2. Unified Column Schema & Field Mapping Matrix
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleAutoRemap}
                  className={`flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                    theme === 'light' 
                      ? 'bg-white hover:bg-stone-100 border-[#D6CEBE] text-stone-700' 
                      : 'bg-[#201A16] hover:bg-[#28211C] border-stone-700 text-stone-300'
                  }`}
                  title="Auto-detect matches and synonyms across layers"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Auto-Align Synonyms</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Target Field</span>
                </button>
              </div>
            </div>

            <div className={`border rounded-xl overflow-hidden ${
              theme === 'light' ? 'border-[#E2DBD0] bg-white' : 'border-stone-800 bg-[#171310]'
            }`}>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b font-mono uppercase text-[10px] tracking-wider ${
                      theme === 'light' ? 'bg-[#F5EFE6] border-[#E2DBD0] text-stone-600' : 'bg-[#201A16] border-stone-800 text-stone-400'
                    }`}>
                      <th className="py-2.5 px-3">Target Field Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      {selectedDatasets.map(d => (
                        <th key={d.id} className="py-2.5 px-3 truncate max-w-[160px]" title={d.name}>
                          From: {d.name}
                        </th>
                      ))}
                      <th className="py-2.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                    {mappings.map((m) => (
                      <tr key={m.id} className={theme === 'light' ? 'hover:bg-[#FAF6F0]' : 'hover:bg-stone-800/30'}>
                        {/* Target Field Name */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={m.targetName}
                            onChange={(e) => handleUpdateTargetName(m.id, e.target.value)}
                            className={`w-36 px-2 py-1 text-xs font-mono rounded border ${
                              theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                            }`}
                          />
                        </td>

                        {/* Target Field Type */}
                        <td className="py-2 px-3">
                          <select
                            value={m.targetType}
                            onChange={(e) => handleUpdateTargetType(m.id, e.target.value as any)}
                            className={`px-2 py-1 text-xs font-mono rounded border ${
                              theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                            }`}
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="date">Date</option>
                          </select>
                        </td>

                        {/* Per-Dataset Column Dropdowns */}
                        {selectedDatasets.map(d => {
                          const currentVal = m.sourceColumns[d.id] || '__empty__';
                          return (
                            <td key={d.id} className="py-2 px-3">
                              <select
                                value={currentVal}
                                onChange={(e) => handleUpdateSourceColumn(m.id, d.id, e.target.value)}
                                className={`w-36 px-2 py-1 text-xs font-mono rounded border truncate ${
                                  currentVal === '__empty__'
                                    ? 'opacity-60 italic'
                                    : 'font-semibold text-amber-700 dark:text-amber-400'
                                } ${theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'}`}
                              >
                                <option value="__empty__">[Empty / Null]</option>
                                {d.fields.map(f => (
                                  <option key={f.name} value={f.name}>
                                    {f.name} ({f.type})
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}

                        {/* Delete Row */}
                        <td className="py-2 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveColumn(m.id)}
                            className="p-1 rounded text-stone-400 hover:text-rose-500 transition-colors"
                            title="Remove field mapping"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'border-[#EBE5DC] bg-[#FAF8F5]' : 'border-stone-800 bg-[#1A1512]'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            <span>Result: <strong>{totalFeatures.toLocaleString()}</strong> combined features in <strong>{targetCRS}</strong></span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                theme === 'light' ? 'bg-white border-[#D6CEBE] text-stone-700 hover:bg-stone-100' : 'bg-[#201A16] border-stone-700 text-stone-300 hover:bg-stone-800'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteConcatenation}
              disabled={isProcessing || selectedDatasets.length < 2}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-display font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 shadow-md shadow-amber-950/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? (
                <span>Generating Harmonized Dataset...</span>
              ) : (
                <>
                  <Layers className="w-4 h-4 fill-current" />
                  <span>Concatenate & Add to Queue ({selectedDatasets.length} Layers)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
