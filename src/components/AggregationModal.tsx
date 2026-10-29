/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  X, 
  PieChart, 
  Plus, 
  Download, 
  Check, 
  Layers, 
  Calculator, 
  TableProperties, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { 
  computeFieldAggregation, 
  appendAggregationColumnToDataset, 
  AggregationResult 
} from '../core/spatialAnalytics';

interface AggregationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: SpatialDataset | null;
  onUpdateDataset: (updatedDataset: SpatialDataset) => void;
}

export const AggregationModal: React.FC<AggregationModalProps> = ({
  isOpen,
  onClose,
  dataset,
  onUpdateDataset,
}) => {
  if (!isOpen || !dataset) return null;

  const fields = dataset.fields || [];
  const stringFields = fields.filter(f => f.type === 'string' || f.type === 'object');
  const numberFields = fields.filter(f => f.type === 'number');

  const defaultGroupBy = stringFields[0]?.name || fields[0]?.name || '';
  const defaultValField = numberFields[0]?.name || '';

  const [groupByField, setGroupByField] = useState<string>(defaultGroupBy);
  const [metric, setMetric] = useState<'count' | 'sum' | 'mean' | 'min' | 'max'>('count');
  const [valueField, setValueField] = useState<string>(defaultValField);
  const [customColName, setCustomColName] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Compute aggregation on the fly
  const aggregation: AggregationResult = useMemo(() => {
    if (!groupByField) {
      return {
        groupByField: '',
        metric: 'count',
        groups: [],
        totalCount: 0,
      };
    }
    return computeFieldAggregation(dataset, groupByField, metric, metric === 'count' ? undefined : valueField);
  }, [dataset, groupByField, metric, valueField]);

  const handleAppendColumn = () => {
    const { updatedDataset, addedColumn } = appendAggregationColumnToDataset(
      dataset,
      aggregation,
      customColName.trim() || undefined
    );
    onUpdateDataset(updatedDataset);
    setToastMsg(`Successfully added "${addedColumn}" column to ${dataset.name}!`);
    setTimeout(() => {
      setToastMsg(null);
      onClose();
    }, 1500);
  };

  const handleExportCSV = () => {
    const headers = ['Category', 'Feature_Count', ...(metric !== 'count' ? [`${metric}_${valueField}`] : []), 'Percent_Of_Total'];
    const rows = aggregation.groups.map(g => [
      `"${g.key.replace(/"/g, '""')}"`,
      g.count,
      ...(metric !== 'count' ? [g.value ?? 0] : []),
      `${g.percentOfTotal || 0}%`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}_aggregation_${groupByField}_${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="bg-[#181411] border border-stone-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#F5EBE1]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-[#13110E]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/25">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-stone-100 text-base tracking-wide flex items-center space-x-2">
                <span>Field Aggregation & Attribute Intelligence</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700/50">
                  {dataset.name}
                </span>
              </h3>
              <p className="text-xs text-stone-400 font-sans">
                Group spatial features by categorical fields, compute statistics, and append as a new column.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {toastMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-600/70 text-emerald-300 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{toastMsg}</span>
            </div>
          )}

          {/* Group By and Metric Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-stone-300 block mb-1.5 font-sans">
                Group By Field:
              </label>
              <select
                value={groupByField}
                onChange={(e) => setGroupByField(e.target.value)}
                className="w-full bg-[#120F0D] border border-stone-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {fields.map(f => (
                  <option key={f.name} value={f.name} className="bg-stone-900 text-stone-100">
                    {f.name} ({f.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-300 block mb-1.5 font-sans">
                Aggregation Metric:
              </label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as any)}
                className="w-full bg-[#120F0D] border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="count">Count Features</option>
                <option value="sum">Sum of Field</option>
                <option value="mean">Average (Mean)</option>
                <option value="min">Minimum Value</option>
                <option value="max">Maximum Value</option>
              </select>
            </div>

            {metric !== 'count' && (
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5 font-sans">
                  Numeric Value Field:
                </label>
                <select
                  value={valueField}
                  onChange={(e) => setValueField(e.target.value)}
                  className="w-full bg-[#120F0D] border border-stone-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {numberFields.length > 0 ? (
                    numberFields.map(f => (
                      <option key={f.name} value={f.name} className="bg-stone-900 text-stone-100">
                        {f.name}
                      </option>
                    ))
                  ) : (
                    fields.map(f => (
                      <option key={f.name} value={f.name} className="bg-stone-900 text-stone-100">
                        {f.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Aggregated Preview Table */}
          <div className="rounded-2xl border border-stone-800 bg-[#120F0D] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#171310] border-b border-stone-800 flex items-center justify-between text-xs font-mono">
              <span className="text-stone-300 font-bold">
                Aggregation Summary ({aggregation.groups.length} distinct groups)
              </span>
              <span className="text-stone-400">Total Features: {aggregation.totalCount}</span>
            </div>

            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#14100E] border-b border-stone-800/80 text-stone-400 font-mono text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Category ({groupByField})</th>
                    <th className="py-2 px-3 text-right">Feature Count</th>
                    {metric !== 'count' && (
                      <th className="py-2 px-3 text-right capitalize">{metric} ({valueField})</th>
                    )}
                    <th className="py-2 px-3 text-right">% of Total</th>
                    <th className="py-2 px-3 w-32">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50 font-mono text-[11px]">
                  {aggregation.groups.map((group, idx) => (
                    <tr key={idx} className="hover:bg-stone-850/30">
                      <td className="py-2 px-3 font-semibold text-stone-200 truncate max-w-xs">{group.key}</td>
                      <td className="py-2 px-3 text-right text-stone-400 tabular-nums">{group.count}</td>
                      {metric !== 'count' && (
                        <td className="py-2 px-3 text-right text-amber-300 font-bold tabular-nums">
                          {group.value?.toLocaleString() ?? 0}
                        </td>
                      )}
                      <td className="py-2 px-3 text-right text-stone-400 tabular-nums">{group.percentOfTotal}%</td>
                      <td className="py-2 px-3">
                        <div className="w-full bg-stone-800 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-amber-500 h-1.5 rounded-full" 
                            style={{ width: `${Math.min(100, Math.max(5, group.percentOfTotal || 0))}%` }} 
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* New Column Name Specification */}
          <div className="p-4 rounded-2xl bg-[#15110E] border border-stone-800/80 space-y-2">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <label className="text-xs font-display font-bold text-stone-200">
                Append as New Column to All Features
              </label>
            </div>
            <p className="text-[11px] text-stone-400 font-sans leading-relaxed">
              Every feature in this dataset will receive this new column populated with its group's aggregated value.
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                placeholder={metric === 'count' ? `count_by_${groupByField}` : `${metric}_${valueField}_by_${groupByField}`}
                value={customColName}
                onChange={(e) => setCustomColName(e.target.value)}
                className="flex-1 bg-[#120F0D] border border-stone-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleAppendColumn}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-display font-bold text-xs transition-all shadow-md shadow-amber-950/40 flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-800 bg-[#13110E] flex items-center justify-between text-xs text-stone-400">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium transition-colors border border-stone-700"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
