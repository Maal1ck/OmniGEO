/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  GitMerge, 
  X, 
  ArrowRight, 
  Check, 
  Layers, 
  MapPin, 
  Database, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Sliders, 
  TableProperties, 
  Globe, 
  Compass, 
  HelpCircle 
} from 'lucide-react';
import { SpatialDataset } from '../types/gis';
import { 
  AttributeJoinType, 
  SpatialPredicate, 
  executeAttributeJoin, 
  executeSpatialJoin, 
  JoinExecutionSummary 
} from '../core/spatialJoinEngine';
import { useTheme } from '../core/theme';
import { useI18n } from '../core/i18n';

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  onAddJoinedDataset: (newDataset: SpatialDataset) => void;
  initialTargetDatasetId?: string | null;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  isOpen,
  onClose,
  datasets,
  onAddJoinedDataset,
  initialTargetDatasetId,
}) => {
  const { theme } = useTheme();
  const { lang } = useI18n();

  const [joinMode, setJoinMode] = useState<'attribute' | 'spatial'>('attribute');

  // Layer selections
  const [targetDatasetId, setTargetDatasetId] = useState<string>('');
  const [sourceDatasetId, setSourceDatasetId] = useState<string>('');

  // Attribute Join settings
  const [targetKeyField, setTargetKeyField] = useState<string>('');
  const [sourceKeyField, setSourceKeyField] = useState<string>('');
  const [attributeJoinType, setAttributeJoinType] = useState<AttributeJoinType>('left');
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);

  // Spatial Join settings
  const [spatialPredicate, setSpatialPredicate] = useState<SpatialPredicate>('intersects');
  const [spatialJoinType, setSpatialJoinType] = useState<AttributeJoinType>('left');

  // Attribute selection and output
  const [selectedSourceFields, setSelectedSourceFields] = useState<Set<string>>(new Set());
  const [fieldPrefix, setFieldPrefix] = useState<string>('join_');
  const [outputName, setOutputName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Initialize datasets
  useEffect(() => {
    if (datasets.length >= 2) {
      const targetId = initialTargetDatasetId && datasets.some(d => d.id === initialTargetDatasetId)
        ? initialTargetDatasetId
        : datasets[0].id;
      setTargetDatasetId(targetId);

      const sourceCandidate = datasets.find(d => d.id !== targetId);
      if (sourceCandidate) {
        setSourceDatasetId(sourceCandidate.id);
      }
    } else if (datasets.length === 1) {
      setTargetDatasetId(datasets[0].id);
      setSourceDatasetId('');
    }
  }, [datasets, initialTargetDatasetId, isOpen]);

  const targetDataset = useMemo(() => datasets.find(d => d.id === targetDatasetId), [datasets, targetDatasetId]);
  const sourceDataset = useMemo(() => datasets.find(d => d.id === sourceDatasetId), [datasets, sourceDatasetId]);

  // Set default output name and preselect fields when datasets change
  useEffect(() => {
    if (targetDataset && sourceDataset) {
      setOutputName(`${targetDataset.name}_joined_${sourceDataset.name}`);
      // Select all non-geometry fields from source
      setSelectedSourceFields(new Set(sourceDataset.fields.map(f => f.name)));

      // Auto-detect matching keys for attribute join
      const targetFieldNames = targetDataset.fields.map(f => f.name.toLowerCase());
      const sourceFieldNames = sourceDataset.fields.map(f => f.name.toLowerCase());

      // Look for exact matches (e.g. "id" == "id", "code_insee" == "code_insee")
      let matchedTarget = targetDataset.fields[0]?.name || '';
      let matchedSource = sourceDataset.fields[0]?.name || '';

      for (const tf of targetDataset.fields) {
        const found = sourceDataset.fields.find(sf => 
          sf.name.toLowerCase() === tf.name.toLowerCase() ||
          (tf.name.toLowerCase().includes('id') && sf.name.toLowerCase().includes('id'))
        );
        if (found) {
          matchedTarget = tf.name;
          matchedSource = found.name;
          break;
        }
      }

      setTargetKeyField(matchedTarget);
      setSourceKeyField(matchedSource);
    }
  }, [targetDatasetId, sourceDatasetId]);

  // Pre-calculate live match preview
  const previewSummary = useMemo<JoinExecutionSummary | null>(() => {
    if (!targetDataset || !sourceDataset) return null;

    try {
      if (joinMode === 'attribute') {
        if (!targetKeyField || !sourceKeyField) return null;
        return executeAttributeJoin({
          targetDataset,
          sourceDataset,
          targetKeyField,
          sourceKeyField,
          joinType: attributeJoinType,
          selectedSourceFields: Array.from(selectedSourceFields),
          prefix: fieldPrefix,
          outputName: outputName || 'preview_join',
          caseSensitive,
        });
      } else {
        return executeSpatialJoin({
          targetDataset,
          sourceDataset,
          predicate: spatialPredicate,
          joinType: spatialJoinType,
          selectedSourceFields: Array.from(selectedSourceFields),
          prefix: fieldPrefix,
          outputName: outputName || 'preview_join',
        });
      }
    } catch {
      return null;
    }
  }, [
    targetDataset, 
    sourceDataset, 
    joinMode, 
    targetKeyField, 
    sourceKeyField, 
    attributeJoinType, 
    caseSensitive, 
    spatialPredicate, 
    spatialJoinType, 
    selectedSourceFields, 
    fieldPrefix, 
    outputName
  ]);

  if (!isOpen) return null;

  const toggleSourceField = (field: string) => {
    const next = new Set(selectedSourceFields);
    if (next.has(field)) {
      next.delete(field);
    } else {
      next.add(field);
    }
    setSelectedSourceFields(next);
  };

  const selectAllSourceFields = () => {
    if (!sourceDataset) return;
    setSelectedSourceFields(new Set(sourceDataset.fields.map(f => f.name)));
  };

  const deselectAllSourceFields = () => {
    setSelectedSourceFields(new Set());
  };

  const handleExecute = () => {
    if (!targetDataset || !sourceDataset) {
      setErrorMsg(lang === 'fr' ? 'Veuillez sélectionner deux couches valides.' : 'Please select two valid layers.');
      return;
    }

    if (joinMode === 'attribute' && (!targetKeyField || !sourceKeyField)) {
      setErrorMsg(lang === 'fr' ? 'Veuillez sélectionner les colonnes clés d\'association.' : 'Please select the key fields for matching.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    setTimeout(() => {
      try {
        let result: JoinExecutionSummary;
        if (joinMode === 'attribute') {
          result = executeAttributeJoin({
            targetDataset,
            sourceDataset,
            targetKeyField,
            sourceKeyField,
            joinType: attributeJoinType,
            selectedSourceFields: Array.from(selectedSourceFields),
            prefix: fieldPrefix,
            outputName: outputName.trim() || `${targetDataset.name}_joined_${sourceDataset.name}`,
            caseSensitive,
          });
        } else {
          result = executeSpatialJoin({
            targetDataset,
            sourceDataset,
            predicate: spatialPredicate,
            joinType: spatialJoinType,
            selectedSourceFields: Array.from(selectedSourceFields),
            prefix: fieldPrefix,
            outputName: outputName.trim() || `${targetDataset.name}_spatial_${sourceDataset.name}`,
          });
        }

        onAddJoinedDataset(result.dataset);
        setIsProcessing(false);
        onClose();
      } catch (err) {
        setIsProcessing(false);
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    }, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-200">
      <div 
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors ${
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
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {lang === 'fr' ? 'Jointures SIG' : 'GIS Join Tool'}
                </span>
                <span className="text-xs font-mono text-stone-400">
                  {joinMode === 'attribute' ? (lang === 'fr' ? 'Jointure Attributaire' : 'Attribute Join') : (lang === 'fr' ? 'Jointure Spatiale' : 'Spatial Join')}
                </span>
              </div>
              <h2 className="text-base font-display font-bold mt-0.5">
                {lang === 'fr' ? 'Fusionner et enrichir des couches par jointure' : 'Join & Enrich Geospatial Layers'}
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

        {/* Mode Selector Tabs */}
        <div className={`px-4 pt-3 border-b flex items-center space-x-2 text-xs font-mono ${
          theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#14100D] border-stone-800'
        }`}>
          <button
            type="button"
            onClick={() => setJoinMode('attribute')}
            className={`flex items-center space-x-2 px-3.5 py-2 border-b-2 font-semibold transition-all ${
              joinMode === 'attribute'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <TableProperties className="w-4 h-4" />
            <span>{lang === 'fr' ? '1. Jointure Attributaire (Clé commune)' : '1. Attribute Join (Common Key)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setJoinMode('spatial')}
            className={`flex items-center space-x-2 px-3.5 py-2 border-b-2 font-semibold transition-all ${
              joinMode === 'spatial'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-bold'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'fr' ? '2. Jointure Spatiale (Localisation)' : '2. Spatial Join (Location)'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          
          {/* Layer Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Layer (Left) */}
            <div className={`p-3.5 rounded-xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <label className="font-display font-bold text-xs">
                    {lang === 'fr' ? 'Couche cible (Base géométrique) :' : 'Target Layer (Base Geometry) :'}
                  </label>
                </div>
                {targetDataset && (
                  <span className="text-[10px] font-mono text-stone-400">
                    {targetDataset.featureCount} feats
                  </span>
                )}
              </div>

              <select
                value={targetDatasetId}
                onChange={(e) => setTargetDatasetId(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-emerald-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.geometryType} · {d.featureCount} feats)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-500">
                {lang === 'fr' 
                  ? 'La géométrie de cette couche sera conservée dans le résultat.' 
                  : 'Geometries from this layer will be preserved in the output.'}
              </p>
            </div>

            {/* Source Layer (Right) */}
            <div className={`p-3.5 rounded-xl border space-y-2 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <label className="font-display font-bold text-xs">
                    {lang === 'fr' ? 'Couche à joindre (Attributs à ajouter) :' : 'Join Layer (Attributes to Append) :'}
                  </label>
                </div>
                {sourceDataset && (
                  <span className="text-[10px] font-mono text-stone-400">
                    {sourceDataset.featureCount} feats
                  </span>
                )}
              </div>

              <select
                value={sourceDatasetId}
                onChange={(e) => setSourceDatasetId(e.target.value)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                  theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                }`}
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id} disabled={d.id === targetDatasetId}>
                    {d.name} ({d.geometryType} · {d.featureCount} feats)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-stone-500">
                {lang === 'fr' 
                  ? 'Ses attributs seront fusionnés avec la couche cible.' 
                  : 'Its attributes will be attached to matching target features.'}
              </p>
            </div>
          </div>

          {/* PARAMETERS SECTION (Attribute vs Spatial) */}
          {joinMode === 'attribute' ? (
            /* Attribute Join Parameters */
            <div className={`p-4 rounded-xl border space-y-3 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <span className="font-display font-bold text-xs text-amber-600 dark:text-amber-400 block uppercase font-mono tracking-wider">
                {lang === 'fr' ? 'Configuration des clés d\'association :' : 'Key Matching Fields :'}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Target Key */}
                <div>
                  <label className="block text-[11px] font-mono text-stone-500 mb-1 font-semibold">
                    {lang === 'fr' ? 'Champ clé dans la couche cible :' : 'Target Key Field :'}
                  </label>
                  <select
                    value={targetKeyField}
                    onChange={(e) => setTargetKeyField(e.target.value)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                    }`}
                  >
                    {targetDataset?.fields.map(f => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source Key */}
                <div>
                  <label className="block text-[11px] font-mono text-stone-500 mb-1 font-semibold">
                    {lang === 'fr' ? 'Champ clé dans la couche source :' : 'Join Key Field :'}
                  </label>
                  <select
                    value={sourceKeyField}
                    onChange={(e) => setSourceKeyField(e.target.value)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                    }`}
                  >
                    {sourceDataset?.fields.map(f => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Join Type & Case Sensitivity */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className="flex items-center space-x-3">
                  <span className="text-[11px] font-mono font-semibold text-stone-500">
                    {lang === 'fr' ? 'Type de jointure :' : 'Join Type :'}
                  </span>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="attrJoinType"
                      checked={attributeJoinType === 'left'}
                      onChange={() => setAttributeJoinType('left')}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs">Left Outer ({lang === 'fr' ? 'Conserver toutes les entités cibles' : 'Keep all target'})</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="attrJoinType"
                      checked={attributeJoinType === 'inner'}
                      onChange={() => setAttributeJoinType('inner')}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs">Inner ({lang === 'fr' ? 'Uniquement les correspondances' : 'Matches only'})</span>
                  </label>
                </div>

                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-[11px] font-mono text-stone-500">
                    {lang === 'fr' ? 'Sensible à la casse' : 'Case sensitive'}
                  </span>
                </label>
              </div>
            </div>
          ) : (
            /* Spatial Join Parameters */
            <div className={`p-4 rounded-xl border space-y-3 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <span className="font-display font-bold text-xs text-amber-600 dark:text-amber-400 block uppercase font-mono tracking-wider">
                {lang === 'fr' ? 'Prédicat géographique & relation spatiale :' : 'Spatial Relationship Predicate :'}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'intersects' as SpatialPredicate, label: lang === 'fr' ? 'Se croisent (Intersects)' : 'Intersects', desc: 'Overlap or touch' },
                  { id: 'within' as SpatialPredicate, label: lang === 'fr' ? 'Est contenu dans (Within)' : 'Within', desc: 'Inside boundary' },
                  { id: 'contains' as SpatialPredicate, label: lang === 'fr' ? 'Contient (Contains)' : 'Contains', desc: 'Encloses geometry' },
                ].map(pred => (
                  <button
                    key={pred.id}
                    type="button"
                    onClick={() => setSpatialPredicate(pred.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      spatialPredicate === pred.id
                        ? 'bg-amber-500 text-stone-950 font-bold border-amber-600 shadow-xs'
                        : theme === 'light'
                          ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                          : 'bg-[#120F0D] border-stone-800 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <div className="text-xs font-semibold">{pred.label}</div>
                    <div className="text-[10px] opacity-75 font-mono">{pred.desc}</div>
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-3 pt-2 border-t border-stone-200 dark:border-stone-800">
                <span className="text-[11px] font-mono font-semibold text-stone-500">
                  {lang === 'fr' ? 'Type de jointure :' : 'Join Type :'}
                </span>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="spatJoinType"
                    checked={spatialJoinType === 'left'}
                    onChange={() => setSpatialJoinType('left')}
                    className="text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-xs">Left Outer ({lang === 'fr' ? 'Conserver toutes les entités cibles' : 'Keep all target'})</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="spatJoinType"
                    checked={spatialJoinType === 'inner'}
                    onChange={() => setSpatialJoinType('inner')}
                    className="text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-xs">Inner ({lang === 'fr' ? 'Uniquement les intersections' : 'Intersections only'})</span>
                </label>
              </div>
            </div>
          )}

          {/* ATTRIBUTE ENRICHMENT & PREFIX CONFIGURATION */}
          {sourceDataset && (
            <div className={`p-4 rounded-xl border space-y-3 ${
              theme === 'light' ? 'bg-[#FAF8F5] border-[#E2DBD0]' : 'bg-[#15110E] border-stone-800'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
                <div>
                  <span className="font-display font-bold text-xs text-amber-600 dark:text-amber-400 block uppercase font-mono tracking-wider">
                    {lang === 'fr' ? 'Champs de la couche source à ajouter :' : 'Attributes to Transfer :'}
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    {selectedSourceFields.size}/{sourceDataset.fields.length} {lang === 'fr' ? 'champs sélectionnés' : 'fields selected'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={selectAllSourceFields}
                    className="px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10"
                  >
                    {lang === 'fr' ? 'Tout cocher' : 'Select All'}
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllSourceFields}
                    className="px-2 py-0.5 text-[10px] font-mono rounded border hover:bg-stone-500/10"
                  >
                    {lang === 'fr' ? 'Tout décocher' : 'Deselect'}
                  </button>
                </div>
              </div>

              {/* Fields checklist */}
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                {sourceDataset.fields.map(f => {
                  const isChecked = selectedSourceFields.has(f.name);
                  return (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => toggleSourceField(f.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all flex items-center space-x-1.5 ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-500/70 text-amber-700 dark:text-amber-300 font-semibold'
                          : theme === 'light' ? 'bg-white border-stone-300 text-stone-500 opacity-60' : 'bg-stone-900 border-stone-800 text-stone-500 opacity-60'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-xs border flex items-center justify-center text-[9px] ${
                        isChecked ? 'bg-amber-500 text-stone-950 font-bold' : 'border-stone-400'
                      }`}>
                        {isChecked && '✓'}
                      </span>
                      <span>{f.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Prefix & Layer Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div>
                  <label className="block text-[11px] font-mono text-stone-500 mb-1 font-semibold">
                    {lang === 'fr' ? 'Préfixe des colonnes (évite les collisions) :' : 'Attribute Column Prefix :'}
                  </label>
                  <input
                    type="text"
                    value={fieldPrefix}
                    onChange={(e) => setFieldPrefix(e.target.value)}
                    placeholder="e.g. join_ or src_"
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-stone-500 mb-1 font-semibold">
                    {lang === 'fr' ? 'Nom de la nouvelle couche créée :' : 'New Output Layer Name :'}
                  </label>
                  <input
                    type="text"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    placeholder="e.g. parcels_enriched"
                    className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none focus:border-amber-500 ${
                      theme === 'light' ? 'bg-white border-[#D6CEBE]' : 'bg-[#120F0D] border-stone-700'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* LIVE MATCH STATISTICS & PREVIEW */}
          {previewSummary && (
            <div className={`p-4 rounded-xl border space-y-3 ${
              theme === 'light' ? 'bg-white border-[#E2DBD0]' : 'bg-[#120F0D] border-stone-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{lang === 'fr' ? 'Aperçu du résultat de la jointure :' : 'Live Join Simulation & Preview :'}</span>
                </span>

                <div className="flex items-center space-x-2 text-[11px] font-mono">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {previewSummary.matchedCount.toLocaleString()} {lang === 'fr' ? 'appariées' : 'matched'} ({previewSummary.matchPercentage}%)
                  </span>
                  <span>·</span>
                  <span className="text-stone-400">
                    {previewSummary.dataset.featureCount.toLocaleString()} {lang === 'fr' ? 'entités générées' : 'output features'}
                  </span>
                </div>
              </div>

              {/* Sample Table */}
              <div className={`rounded-xl border overflow-x-auto ${
                theme === 'light' ? 'border-[#E2DBD0]' : 'border-stone-800/80'
              }`}>
                <table className="w-full text-left text-[11px] font-mono border-collapse">
                  <thead className={theme === 'light' ? 'bg-[#F2EFEA]' : 'bg-[#181411]'}>
                    <tr>
                      <th className="p-2 text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800">#</th>
                      {previewSummary.dataset.fields.slice(0, 5).map(f => (
                        <th key={f.name} className="p-2 text-stone-700 dark:text-stone-300 font-semibold border-b border-stone-200 dark:border-stone-800 truncate max-w-[120px]">
                          {f.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800/50">
                    {previewSummary.sampleRows.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className={theme === 'light' ? 'hover:bg-stone-50' : 'hover:bg-stone-900/50'}>
                        <td className="p-2 text-stone-400">{idx + 1}</td>
                        {previewSummary.dataset.fields.slice(0, 5).map(f => (
                          <td key={f.name} className="p-2 text-stone-800 dark:text-stone-200 truncate max-w-[120px]">
                            {String(row[f.name] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'bg-[#F8F6F1] border-[#E2DBD0]' : 'bg-[#130F0D] border-stone-800'
        }`}>
          <div className="text-xs font-mono text-stone-500">
            {previewSummary ? (
              <span>
                {lang === 'fr' 
                  ? `+${selectedSourceFields.size} attributs ajoutés sur ${previewSummary.dataset.featureCount} entités` 
                  : `+${selectedSourceFields.size} fields added to ${previewSummary.dataset.featureCount} features`}
              </span>
            ) : null}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                theme === 'light' ? 'bg-white border-stone-300 hover:bg-stone-100 text-stone-700' : 'bg-stone-900 border-stone-800 hover:bg-stone-800 text-stone-300'
              }`}
            >
              {lang === 'fr' ? 'Annuler' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleExecute}
              disabled={isProcessing || !targetDataset || !sourceDataset}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-display font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md shadow-amber-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? (lang === 'fr' ? 'Jointure en cours...' : 'Joining...')
                  : (lang === 'fr' ? 'Exécuter la jointure' : 'Execute Join')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
