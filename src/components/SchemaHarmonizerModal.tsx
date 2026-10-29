import React from 'react';
import { 
  TableProperties, 
  X, 
  Plus, 
  Trash2, 
  Sparkles, 
  CaseSensitive
} from 'lucide-react';
import { FieldMappingRule, SchemaHarmonizerConfig, SpatialDataset } from '../types/gis';
import { generateAutoHarmonizerRules } from '../core/schemaHarmonizer';

interface SchemaHarmonizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  config: SchemaHarmonizerConfig;
  setConfig: React.Dispatch<React.SetStateAction<SchemaHarmonizerConfig>>;
}

export const SchemaHarmonizerModal: React.FC<SchemaHarmonizerModalProps> = ({
  isOpen,
  onClose,
  datasets,
  config,
  setConfig,
}) => {
  if (!isOpen) return null;

  const handleAutoHarmonize = () => {
    const autoRules = generateAutoHarmonizerRules(datasets);
    setConfig(prev => ({
      ...prev,
      enabled: true,
      rules: autoRules,
    }));
  };

  const handleAddField = () => {
    const newRule: FieldMappingRule = {
      targetField: `field_${config.rules.length + 1}`,
      targetType: 'string',
      sourceFieldByDataset: {},
    };
    setConfig(prev => ({
      ...prev,
      rules: [...prev.rules, newRule],
    }));
  };

  const handleRemoveRule = (index: number) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateRuleTarget = (index: number, newTarget: string) => {
    setConfig(prev => {
      const next = [...prev.rules];
      next[index] = { ...next[index], targetField: newTarget };
      return { ...prev, rules: next };
    });
  };

  const handleUpdateRuleType = (index: number, type: FieldMappingRule['targetType']) => {
    setConfig(prev => {
      const next = [...prev.rules];
      next[index] = { ...next[index], targetType: type };
      return { ...prev, rules: next };
    });
  };

  const handleUpdateSourceMapping = (ruleIndex: number, datasetId: string, sourceField: string) => {
    setConfig(prev => {
      const next = [...prev.rules];
      const sourceMap = { ...next[ruleIndex].sourceFieldByDataset };
      if (!sourceField) {
        delete sourceMap[datasetId];
      } else {
        sourceMap[datasetId] = sourceField;
      }
      next[ruleIndex] = { ...next[ruleIndex], sourceFieldByDataset: sourceMap };
      return { ...prev, rules: next };
    });
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-[#110E0C]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-500/15 rounded-xl text-orange-400 border border-orange-500/30">
              <TableProperties className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-display font-bold text-[#FAF6F0] text-base">Visual Batch Schema Harmonizer</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-orange-950 text-orange-300 border border-orange-700/50">
                  Cross-Dataset Normalizer
                </span>
              </div>
              <p className="text-xs text-stone-400">Map and harmonize disparate column names across contractor files into a single unified schema</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Controls Toolbar */}
        <div className="px-6 py-3 bg-stone-900/90 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                className="rounded border-stone-700 bg-[#13110E] text-amber-500 focus:ring-0"
              />
              <span className="font-bold text-stone-200">Enable Schema Harmonization on Export</span>
            </label>

            <div className="flex items-center space-x-1.5 pl-3 border-l border-stone-800">
              <CaseSensitive className="w-4 h-4 text-amber-400" />
              <span className="text-stone-400">Casing Normalization:</span>
              <select
                value={config.casingMode}
                onChange={(e) => setConfig(prev => ({ ...prev, casingMode: e.target.value as any }))}
                className="bg-[#13110E] border border-stone-700 rounded-lg px-2 py-1 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="none">Preserve Original</option>
                <option value="lowercase">lowercase</option>
                <option value="UPPERCASE">UPPERCASE</option>
                <option value="snake_case">snake_case</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleAutoHarmonize}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Detect Aliases</span>
            </button>
            <button
              onClick={handleAddField}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Field</span>
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="flex-1 overflow-auto p-6">
          {config.rules.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#110E0C] border-b border-stone-800 text-stone-400 font-semibold uppercase tracking-wider text-[11px] z-10">
                <tr>
                  <th className="py-2.5 px-3 w-48">Unified Target Field</th>
                  <th className="py-2.5 px-3 w-28">Data Type</th>
                  {datasets.map((d) => (
                    <th key={d.id} className="py-2.5 px-3 min-w-[160px] text-stone-300 truncate" title={d.name}>
                      <span className="font-mono text-amber-400 block text-[10px] uppercase font-bold">{d.format}</span>
                      <span>{d.name}</span>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 w-10 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-850/60 font-mono text-xs">
                {config.rules.map((rule, idx) => (
                  <tr key={idx} className="hover:bg-stone-850/40 transition-colors">
                    {/* Target Field Name */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={rule.targetField}
                        onChange={(e) => handleUpdateRuleTarget(idx, e.target.value)}
                        className="w-full bg-[#13110E] border border-stone-700 rounded-lg px-2.5 py-1 text-stone-100 font-mono text-xs focus:border-amber-500 focus:outline-none"
                      />
                    </td>

                    {/* Target Type */}
                    <td className="py-2 px-3">
                      <select
                        value={rule.targetType}
                        onChange={(e) => handleUpdateRuleType(idx, e.target.value as any)}
                        className="w-full bg-[#13110E] border border-stone-700 rounded-lg px-2 py-1 text-stone-200 text-xs focus:border-amber-500 focus:outline-none font-sans cursor-pointer"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                      </select>
                    </td>

                    {/* Source Field Per Dataset */}
                    {datasets.map((ds) => {
                      const currentVal = rule.sourceFieldByDataset[ds.id] || '';
                      return (
                        <td key={ds.id} className="py-2 px-3">
                          <select
                            value={currentVal}
                            onChange={(e) => handleUpdateSourceMapping(idx, ds.id, e.target.value)}
                            className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none transition-colors cursor-pointer ${
                              currentVal
                                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 font-semibold'
                                : 'bg-[#13110E] border-stone-800 text-stone-500'
                            }`}
                          >
                            <option value="">(None / Null)</option>
                            {ds.fields.map((f) => (
                              <option key={f.name} value={f.name} className="bg-stone-900 text-stone-100">
                                {f.name} ({f.type})
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}

                    {/* Delete action */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleRemoveRule(idx)}
                        className="p-1 text-stone-500 hover:text-rose-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-16 text-center text-stone-500">
              <TableProperties className="w-10 h-10 mx-auto mb-2 text-stone-600" />
              <p className="font-display font-bold text-stone-300">No schema harmonization rules defined</p>
              <p className="text-xs text-stone-400 mt-1">Click "Auto-Detect Aliases" to automatically match disparate column names across datasets.</p>
              <button
                onClick={handleAutoHarmonize}
                className="mt-4 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40 text-xs transition-colors"
              >
                Auto-Harmonize All Columns
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-[#110E0C] flex items-center justify-between text-xs text-stone-400">
          <span>Active Rules: {config.rules.length} columns standardized across {datasets.length} datasets</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-850 hover:bg-stone-800 text-stone-200 font-semibold transition-colors"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
