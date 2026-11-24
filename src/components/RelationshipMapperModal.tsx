/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Link2,
  KeyRound,
  Play,
  Plus,
  Trash2,
  Wand2,
  ArrowRight,
  CheckCircle2,
  Network,
  Download,
} from 'lucide-react';
import {
  SpatialDataset,
  DatasetIdConfig,
  DefinedRelationship,
  IdGenerationStrategy,
  RelationshipCardinality,
  RelationshipMatchMode,
} from '../types/gis';
import {
  autoDetectRelationships,
  applyIdsAndForeignKeyMapping,
  buildDefaultIdConfig,
  defaultEndpointCardinalities,
  previewIdValue,
  sanitizeIdentifier,
  RelationshipExecutionResult,
} from '../core/relationshipMapper';
import { DiscoveredGdbRelationship, exportDatasetsToFileGdbZip } from '../core/fileGdbEngine';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

interface RelationshipMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: SpatialDataset[];
  idConfigs: Record<string, DatasetIdConfig>;
  setIdConfigs: React.Dispatch<React.SetStateAction<Record<string, DatasetIdConfig>>>;
  relationships: DefinedRelationship[];
  setRelationships: React.Dispatch<React.SetStateAction<DefinedRelationship[]>>;
  discoveredGdbRelationships?: DiscoveredGdbRelationship[];
  onApplyToWorkspace: (updatedDatasets: SpatialDataset[], updatedRelationships: DefinedRelationship[]) => void;
  onOpenPostgresReport?: () => void;
}

export const RelationshipMapperModal: React.FC<RelationshipMapperModalProps> = ({
  isOpen,
  onClose,
  datasets,
  idConfigs,
  setIdConfigs,
  relationships,
  setRelationships,
  discoveredGdbRelationships = [],
  onApplyToWorkspace,
  onOpenPostgresReport,
}) => {
  const { lang } = useI18n();
  const { theme } = useTheme();
  const isFr = lang === 'fr';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [executionResult, setExecutionResult] = useState<RelationshipExecutionResult | null>(null);
  const [isExportingGdb, setIsExportingGdb] = useState(false);

  // Add relationship draft controls
  const [newParentId, setNewParentId] = useState<string>('');
  const [newChildId, setNewChildId] = useState<string>('');
  const [newFkCol, setNewFkCol] = useState<string>('');
  const [newCardinality, setNewCardinality] = useState<RelationshipCardinality>('1:N');
  const [newMatchMode, setNewMatchMode] = useState<RelationshipMatchMode>('spatial_within');
  const [newParentMatchField, setNewParentMatchField] = useState<string>('');
  const [newChildMatchField, setNewChildMatchField] = useState<string>('');

  // Ensure every active dataset has a default ID config
  useEffect(() => {
    if (!isOpen || datasets.length === 0) return;
    setIdConfigs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const ds of datasets) {
        if (!next[ds.id]) {
          next[ds.id] = buildDefaultIdConfig(ds);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, datasets, setIdConfigs]);

  useEffect(() => {
    if (isOpen && datasets.length >= 2) {
      if (!newParentId || !datasets.some((d) => d.id === newParentId)) {
        setNewParentId(datasets[0].id);
      }
      if (!newChildId || !datasets.some((d) => d.id === newChildId)) {
        setNewChildId(datasets[1].id);
      }
    } else if (isOpen && datasets.length === 1) {
      setNewParentId(datasets[0].id);
      setNewChildId(datasets[0].id);
    }
  }, [isOpen, datasets, newParentId, newChildId]);

  const parentDataset = useMemo(
    () => datasets.find((d) => d.id === newParentId) || null,
    [datasets, newParentId]
  );
  const childDataset = useMemo(
    () => datasets.find((d) => d.id === newChildId) || null,
    [datasets, newChildId]
  );

  // Auto-suggest FK name when parent changes
  useEffect(() => {
    if (parentDataset) {
      const clean = sanitizeIdentifier(parentDataset.name).replace(/s$/, '');
      setNewFkCol(`id_${clean}`);
      setNewParentMatchField(
        idConfigs[parentDataset.id]?.pkColumn ||
          parentDataset.primaryKeyColumn ||
          parentDataset.fields[0]?.name ||
          ''
      );
    }
  }, [parentDataset, idConfigs]);

  useEffect(() => {
    if (childDataset && childDataset.fields.length > 0) {
      setNewChildMatchField(childDataset.fields[0].name);
    }
  }, [childDataset]);

  if (!isOpen) return null;

  const handleAutoDetect = () => {
    const detected = autoDetectRelationships(datasets, idConfigs, discoveredGdbRelationships);
    if (detected.length === 0) return;
    setRelationships((prev) => {
      const existingKeys = new Set(
        prev.map((r) => `${r.parentDatasetId}->${r.childDatasetId}:${r.fkColumnName}`)
      );
      const merged = [...prev];
      for (const rel of detected) {
        const key = `${rel.parentDatasetId}->${rel.childDatasetId}:${rel.fkColumnName}`;
        if (!existingKeys.has(key)) {
          merged.push(rel);
          existingKeys.add(key);
        }
      }
      return merged;
    });
  };

  const handleAddRelationship = () => {
    if (!parentDataset || !childDataset || !newFkCol.trim()) return;
    const ends = defaultEndpointCardinalities(newCardinality);
    const parentPk = idConfigs[parentDataset.id]?.pkColumn || parentDataset.primaryKeyColumn || 'id';
    const rel: DefinedRelationship = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      constraintName: `fk_${sanitizeIdentifier(childDataset.name)}_${sanitizeIdentifier(newFkCol)}`,
      parentDatasetId: parentDataset.id,
      parentPkColumn: parentPk,
      childDatasetId: childDataset.id,
      fkColumnName: sanitizeIdentifier(newFkCol),
      cardinality: newCardinality,
      sourceCardinality: ends.sourceCardinality,
      targetCardinality: ends.targetCardinality,
      matchMode: newMatchMode,
      parentMatchField: newMatchMode === 'attribute' ? newParentMatchField : undefined,
      childMatchField: newMatchMode === 'attribute' ? newChildMatchField : undefined,
      enabled: true,
    };
    setRelationships((prev) => [...prev, rel]);
  };

  const handleUpdateRelationship = (id: string, patch: Partial<DefinedRelationship>) => {
    setRelationships((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.cardinality && !patch.sourceCardinality && !patch.targetCardinality) {
          const ends = defaultEndpointCardinalities(patch.cardinality);
          next.sourceCardinality = ends.sourceCardinality;
          next.targetCardinality = ends.targetCardinality;
        }
        return next;
      })
    );
  };

  const handleDeleteRelationship = (id: string) => {
    setRelationships((prev) => prev.filter((r) => r.id !== id));
  };

  const updateIdConfig = (datasetId: string, patch: Partial<DatasetIdConfig>) => {
    setIdConfigs((prev) => {
      const current = prev[datasetId] || {
        datasetId,
        pkColumn: 'id',
        strategy: 'auto_increment' as IdGenerationStrategy,
        startAt: 1,
        padLength: 4,
      };
      const updated = { ...current, ...patch };
      return { ...prev, [datasetId]: updated };
    });

    // Keep parentPkColumn synced in defined relationships when parent PK name changes
    if (patch.pkColumn) {
      setRelationships((prev) =>
        prev.map((r) =>
          r.parentDatasetId === datasetId ? { ...r, parentPkColumn: patch.pkColumn! } : r
        )
      );
    }
  };

  const handleExecutePipeline = () => {
    const result = applyIdsAndForeignKeyMapping(datasets, idConfigs, relationships);
    setExecutionResult(result);
    onApplyToWorkspace(result.updatedDatasets, result.updatedRelationships);
    setStep(3);
  };

  const handleExportMappedGdb = async () => {
    if (!executionResult) return;
    setIsExportingGdb(true);
    try {
      const blob = await exportDatasetsToFileGdbZip(
        executionResult.updatedDatasets,
        'omnigeo_mapped_relations',
        executionResult.updatedRelationships
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'omnigeo_mapped_relations.gdb.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingGdb(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-150">
      <div className={`relative flex flex-col w-full max-w-6xl max-h-[94vh] rounded-2xl border shadow-2xl overflow-hidden ${
        theme === 'light'
          ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-900'
          : 'bg-[#0D1413] border-stone-800 text-stone-100'
      }`}>
        {/* Top Bar */}
        <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
          theme === 'light' ? 'bg-white border-[#D4DFD3]' : 'bg-[#101917] border-stone-800'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold">
                {isFr
                  ? 'Studio IDs & Mapping Automatique des Clés Étrangères (FK)'
                  : 'ID Generation & Automatic Foreign Key Mapping Studio'}
              </h2>
              <p className="text-xs text-stone-400">
                {isFr
                  ? '1. Définissez d’abord vos relations et cardinalités · 2. Configurez les générateurs d’ID (PK) · 3. Exécutez le mapping FK automatique'
                  : '1. Define relationships & cardinalities first · 2. Configure PK ID generators · 3. Auto-map FK columns'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Step Workflow Bar */}
        <div className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
          theme === 'light' ? 'bg-[#EBF3E8] border-[#D4DFD3]' : 'bg-[#101817] border-stone-800'
        }`}>
          <div className="flex items-center space-x-2">
            {[
              { num: 1 as const, label: isFr ? '1. Relations & Cardinalités' : '1. Define Relationships', icon: Link2 },
              { num: 2 as const, label: isFr ? '2. Génération des IDs (PK)' : '2. PK ID Generation', icon: KeyRound },
              { num: 3 as const, label: isFr ? '3. Résultats & Mapping FK' : '3. FK Auto-Mapping Results', icon: CheckCircle2 },
            ].map((item) => {
              const Icon = item.icon;
              const active = step === item.num;
              return (
                <button
                  key={item.num}
                  type="button"
                  onClick={() => setStep(item.num)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-600 text-stone-950 font-bold'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-2">
            {step === 1 && (
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={datasets.length < 2}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{isFr ? 'Auto-Détecter Relations' : 'Auto-Detect Relationships'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExecutePipeline}
              disabled={datasets.length === 0}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {isFr
                  ? 'Générer IDs & Mapper FK Automatiquement'
                  : 'Generate IDs & Auto-Map Foreign Keys'}
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {datasets.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-stone-700 text-center text-xs text-stone-400">
              {isFr
                ? 'Importez au moins une couche (.gdb, .gpkg, .shp, .geojson) dans l’atelier pour définir vos relations et générer vos identifiants.'
                : 'Import at least one dataset (.gdb, .gpkg, .shp, .geojson) into the workspace to define relationships and generate IDs.'}
            </div>
          )}

          {/* STEP 1: DEFINE RELATIONSHIPS FIRST */}
          {step === 1 && datasets.length > 0 && (
            <div className="space-y-5">
              {/* New Relationship Composer */}
              <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/60 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-stone-200 uppercase tracking-wider text-[11px]">
                    {isFr ? 'Nouvelle Relation (Table Parente PK -> Table Enfant FK)' : 'New Relationship (Parent PK -> Child FK)'}
                  </h3>
                  <span className="text-[11px] font-mono text-stone-400">
                    {relationships.length} {isFr ? 'relation(s) définie(s)' : 'relationship(s) defined'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Table Parente (PK)' : 'Parent Table (PK)'}
                    </label>
                    <select
                      value={newParentId}
                      onChange={(e) => setNewParentId(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.featureCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Table Enfant (FK)' : 'Child Table (FK)'}
                    </label>
                    <select
                      value={newChildId}
                      onChange={(e) => setNewChildId(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.featureCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Colonne FK à créer/remplir' : 'Target FK Column'}
                    </label>
                    <input
                      type="text"
                      value={newFkCol}
                      onChange={(e) => setNewFkCol(e.target.value)}
                      placeholder="id_commune"
                      className="w-full rounded-lg px-2.5 py-2 bg-[#0D1413] border border-stone-700 text-amber-300 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Cardinalité' : 'Cardinality'}
                    </label>
                    <select
                      value={newCardinality}
                      onChange={(e) => setNewCardinality(e.target.value as RelationshipCardinality)}
                      className="w-full rounded-lg px-2.5 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                    >
                      <option value="1:N">1:N (0..n -&gt; 1..1)</option>
                      <option value="1:1">1:1 (1..1 -&gt; 1..1)</option>
                      <option value="0:1">0:1 (0..1 -&gt; 1..1)</option>
                      <option value="0:N">0:N (0..n -&gt; 0..1)</option>
                      <option value="N:M">N:M (0..n -&gt; 0..n)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Méthode de Mapping FK' : 'FK Auto-Match Mode'}
                    </label>
                    <select
                      value={newMatchMode}
                      onChange={(e) => setNewMatchMode(e.target.value as RelationshipMatchMode)}
                      className="w-full rounded-lg px-2.5 py-2 bg-[#0D1413] border border-stone-700 text-stone-100"
                    >
                      <option value="spatial_within">{isFr ? 'Spatial : Contenu dans Parent' : 'Spatial: Within Parent'}</option>
                      <option value="spatial_intersects">{isFr ? 'Spatial : Intersection' : 'Spatial: Intersects'}</option>
                      <option value="spatial_nearest">{isFr ? 'Spatial : Plus proche voisin' : 'Spatial: Nearest Feature'}</option>
                      <option value="attribute">{isFr ? 'Attribut : Clé commune' : 'Attribute: Key Equality'}</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRelationship}
                    className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isFr ? 'Ajouter' : 'Add Link'}</span>
                  </button>
                </div>

                {newMatchMode === 'attribute' && parentDataset && childDataset && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-800">
                    <div>
                      <label className="block text-[10px] font-mono text-stone-400 mb-1">
                        {isFr ? `Champ de correspondance sur ${parentDataset.name}` : `Match field on ${parentDataset.name}`}
                      </label>
                      <select
                        value={newParentMatchField}
                        onChange={(e) => setNewParentMatchField(e.target.value)}
                        className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                      >
                        {parentDataset.fields.map((f) => (
                          <option key={f.name} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-stone-400 mb-1">
                        {isFr ? `Champ de correspondance sur ${childDataset.name}` : `Match field on ${childDataset.name}`}
                      </label>
                      <select
                        value={newChildMatchField}
                        onChange={(e) => setNewChildMatchField(e.target.value)}
                        className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                      >
                        {childDataset.fields.map((f) => (
                          <option key={f.name} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Defined Relationships Table */}
              <div className="space-y-2">
                {relationships.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-stone-800 text-center text-xs text-stone-400">
                    {isFr
                      ? 'Aucune relation définie. Ajoutez une relation ci-dessus ou cliquez sur "Auto-Détecter Relations".'
                      : 'No relationships defined yet. Add a relationship above or click "Auto-Detect Relationships".'}
                  </div>
                ) : (
                  relationships.map((rel) => {
                    const pDs = datasets.find((d) => d.id === rel.parentDatasetId);
                    const cDs = datasets.find((d) => d.id === rel.childDatasetId);
                    return (
                      <div
                        key={rel.id}
                        className="p-3.5 rounded-xl border border-stone-800 bg-stone-900/50 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                          <input
                            type="checkbox"
                            checked={rel.enabled}
                            onChange={(e) => handleUpdateRelationship(rel.id, { enabled: e.target.checked })}
                            className="accent-amber-500 cursor-pointer"
                          />
                          <div className="font-mono flex items-center space-x-2">
                            <span className="font-bold text-emerald-400">{pDs?.name || '?'}</span>
                            <span className="text-stone-500">({rel.parentPkColumn})</span>
                            <ArrowRight className="w-3.5 h-3.5 text-stone-500" />
                            <span className="font-bold text-amber-400">{cDs?.name || '?'}</span>
                            <span className="text-purple-300">.{rel.fkColumnName}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <select
                            value={rel.cardinality || '1:N'}
                            onChange={(e) =>
                              handleUpdateRelationship(rel.id, {
                                cardinality: e.target.value as RelationshipCardinality,
                              })
                            }
                            className="rounded-lg px-2 py-1 bg-[#0D1413] border border-stone-700 font-mono text-[11px] text-purple-300"
                          >
                            <option value="1:N">1:N</option>
                            <option value="1:1">1:1</option>
                            <option value="0:1">0:1</option>
                            <option value="0:N">0:N</option>
                            <option value="N:M">N:M</option>
                          </select>

                          <select
                            value={rel.matchMode}
                            onChange={(e) =>
                              handleUpdateRelationship(rel.id, {
                                matchMode: e.target.value as RelationshipMatchMode,
                              })
                            }
                            className="rounded-lg px-2 py-1 bg-[#0D1413] border border-stone-700 text-[11px] text-stone-200"
                          >
                            <option value="spatial_within">{isFr ? 'Spatial: Contenu' : 'Spatial: Within'}</option>
                            <option value="spatial_intersects">{isFr ? 'Spatial: Intersection' : 'Spatial: Intersects'}</option>
                            <option value="spatial_nearest">{isFr ? 'Spatial: Plus proche' : 'Spatial: Nearest'}</option>
                            <option value="attribute">{isFr ? 'Attribut' : 'Attribute'}</option>
                          </select>

                          <input
                            type="text"
                            value={rel.fkColumnName}
                            onChange={(e) =>
                              handleUpdateRelationship(rel.id, { fkColumnName: e.target.value })
                            }
                            className="w-32 rounded-lg px-2 py-1 bg-[#0D1413] border border-stone-700 font-mono text-[11px] text-amber-300"
                            title="FK Column Name"
                          />

                          <button
                            type="button"
                            onClick={() => handleDeleteRelationship(rel.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs cursor-pointer"
                >
                  <span>{isFr ? 'Étape 2 : Génération des Identifiants (PK)' : 'Next: Configure ID Generation'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CONFIGURE PK ID GENERATION */}
          {step === 2 && datasets.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {datasets.map((ds) => {
                  const cfg = idConfigs[ds.id] || buildDefaultIdConfig(ds);
                  const sampleFeatProps = ds.geojson?.features?.[0]?.properties || {};
                  const samplePreview = [0, 1, 2]
                    .slice(0, Math.max(1, Math.min(3, ds.featureCount || 1)))
                    .map((idx) =>
                      previewIdValue(cfg, idx, ds.geojson?.features?.[idx]?.properties || sampleFeatProps)
                    );

                  return (
                    <div
                      key={ds.id}
                      className="p-4 rounded-xl border border-stone-800 bg-stone-900/50 space-y-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <KeyRound className="w-4 h-4 text-amber-400" />
                          <span className="font-mono font-bold text-sm text-[#F4F8F2]">{ds.name}</span>
                          <span className="text-[11px] font-mono text-stone-400">
                            ({ds.featureCount} {isFr ? 'entités' : 'rows'})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-emerald-400">
                          {isFr ? 'Aperçu PK :' : 'PK Preview:'} {samplePreview.join(', ')}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-mono text-stone-400 mb-1">
                            {isFr ? 'Colonne Clé Primaire (PK)' : 'Primary Key Column'}
                          </label>
                          <input
                            type="text"
                            value={cfg.pkColumn}
                            onChange={(e) => updateIdConfig(ds.id, { pkColumn: e.target.value })}
                            className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 font-mono text-amber-300"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-stone-400 mb-1">
                            {isFr ? 'Stratégie d’ID' : 'ID Strategy'}
                          </label>
                          <select
                            value={cfg.strategy}
                            onChange={(e) =>
                              updateIdConfig(ds.id, { strategy: e.target.value as IdGenerationStrategy })
                            }
                            className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100"
                          >
                            <option value="keep_existing">{isFr ? 'Conserver existant (+ completer vides)' : 'Keep Existing (+ fill blanks)'}</option>
                            <option value="auto_increment">{isFr ? 'Séquence numérique (1, 2, 3...)' : 'Auto-Increment (1, 2, 3...)'}</option>
                            <option value="prefixed_sequence">{isFr ? 'Code Préfixé (PARC-0001)' : 'Prefixed Sequence (PARC-0001)'}</option>
                            <option value="uuid">UUID v4</option>
                            <option value="composite_hash">{isFr ? 'Code Composite (Attribut + Seq)' : 'Composite Code (Field + Seq)'}</option>
                          </select>
                        </div>

                        {(cfg.strategy === 'prefixed_sequence' || cfg.strategy === 'composite_hash') && (
                          <div>
                            <label className="block text-[10px] font-mono text-stone-400 mb-1">
                              {isFr ? 'Préfixe' : 'Prefix'}
                            </label>
                            <input
                              type="text"
                              value={cfg.prefix || ''}
                              onChange={(e) => updateIdConfig(ds.id, { prefix: e.target.value })}
                              className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 font-mono text-stone-100"
                            />
                          </div>
                        )}

                        {cfg.strategy === 'composite_hash' && (
                          <div>
                            <label className="block text-[10px] font-mono text-stone-400 mb-1">
                              {isFr ? 'Champ Source' : 'Source Field'}
                            </label>
                            <select
                              value={cfg.sourceField || ''}
                              onChange={(e) => updateIdConfig(ds.id, { sourceField: e.target.value })}
                              className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 font-mono text-stone-100"
                            >
                              {ds.fields.map((f) => (
                                <option key={f.name} value={f.name}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {cfg.strategy !== 'uuid' && (
                          <div>
                            <label className="block text-[10px] font-mono text-stone-400 mb-1">
                              {isFr ? 'Départ Séquence' : 'Start Number'}
                            </label>
                            <input
                              type="number"
                              value={cfg.startAt ?? 1}
                              onChange={(e) =>
                                updateIdConfig(ds.id, { startAt: parseInt(e.target.value, 10) || 1 })
                              }
                              className="w-full rounded-lg px-2.5 py-1.5 bg-[#0D1413] border border-stone-700 font-mono text-stone-100"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: EXECUTION AUDIT & SYNC */}
          {step === 3 && (
            <div className="space-y-4">
              {!executionResult ? (
                <div className="p-8 rounded-xl border border-dashed border-stone-700 text-center text-xs text-stone-400 space-y-3">
                  <p>
                    {isFr
                      ? 'Cliquez sur "Générer IDs & Mapper FK Automatiquement" en haut pour lancer le calcul.'
                      : 'Click "Generate IDs & Auto-Map Foreign Keys" above to run the pipeline.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-emerald-950/35 border border-emerald-700/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <div>
                        <div className="font-bold text-emerald-200">
                          {isFr
                            ? `Mapping appliqué à l'atelier : ${executionResult.totalPkGenerated} PK générées, ${executionResult.totalFkAssigned} FK assignées.`
                            : `Applied to workspace: ${executionResult.totalPkGenerated} PKs generated, ${executionResult.totalFkAssigned} FKs mapped.`}
                        </div>
                        <div className="text-emerald-300/80">
                          {isFr
                            ? 'Toutes les relations et cardinalités sont maintenant synchronisées avec le rapport MCD/MPD et prêtes pour l’export .gdb.'
                            : 'All relationships and cardinalities are now synced with the MCD/MPD report and ready for .gdb export.'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        disabled={isExportingGdb}
                        onClick={handleExportMappedGdb}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isExportingGdb ? 'Packing...' : 'Exporter .gdb.zip'}</span>
                      </button>
                      {onOpenPostgresReport && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenPostgresReport();
                          }}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
                        >
                          <Network className="w-3.5 h-3.5" />
                          <span>{isFr ? 'Voir dans MCD / MPD' : 'Open MCD / MPD Report'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {executionResult.audits.map((audit) => (
                    <div
                      key={audit.relationshipId}
                      className="p-4 rounded-xl border border-stone-800 bg-stone-900/50 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono font-bold">
                          <span className="text-emerald-400">{audit.parentName}</span>
                          <span className="text-stone-500 mx-2">&rarr;</span>
                          <span className="text-amber-400">{audit.childName}.{audit.fkColumnName}</span>
                        </div>
                        <div className="flex items-center space-x-3 font-mono text-[11px]">
                          <span className="text-emerald-400 font-bold">
                            {audit.matched} / {audit.totalChild} {isFr ? 'liés' : 'matched'} ({audit.matchPercentage}%)
                          </span>
                          {audit.unmatched > 0 && (
                            <span className="text-amber-400">
                              {audit.unmatched} {isFr ? 'orphelins (NULL)' : 'unmatched (NULL)'}
                            </span>
                          )}
                        </div>
                      </div>

                      {audit.sampleMappings.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                          {audit.sampleMappings.map((s, idx) => (
                            <div
                              key={idx}
                              className="px-2.5 py-1.5 rounded bg-black/30 border border-stone-800 truncate"
                            >
                              #{s.childRowIndex} (PK:{String(s.childPk)}) &rarr;{' '}
                              <span className="text-purple-300 font-bold">
                                {audit.fkColumnName}={s.mappedFk ?? 'NULL'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
