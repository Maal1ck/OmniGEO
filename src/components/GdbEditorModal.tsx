/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Database,
  Table2,
  Columns,
  FileText,
  Plus,
  Trash2,
  Copy,
  Download,
  Save,
  Search,
  Replace,
  Check,
} from 'lucide-react';
import { SpatialDataset, AttributeField, DefinedRelationship } from '../types/gis';
import { computeGeoJSONBounds, validateDatasetGeometries } from '../core/geometryValidation';
import { extractSchemaFields } from '../core/formatParsers';
import { exportDatasetsToFileGdbZip } from '../core/fileGdbEngine';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

const getCellText = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const matchesFindValue = (cellValue: unknown, findValue: string): boolean => {
  const cellText = getCellText(cellValue);
  return findValue === ''
    ? cellText === ''
    : cellText.toLowerCase().includes(findValue.toLowerCase());
};

interface GdbEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: SpatialDataset | null;
  allDatasets: SpatialDataset[];
  relationships?: DefinedRelationship[];
  onSaveDataset: (updated: SpatialDataset) => void;
}

export const GdbEditorModal: React.FC<GdbEditorModalProps> = ({
  isOpen,
  onClose,
  dataset,
  allDatasets,
  relationships = [],
  onSaveDataset,
}) => {
  const { lang } = useI18n();
  const { theme } = useTheme();
  const isFr = lang === 'fr';

  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<'grid' | 'schema' | 'metadata'>('grid');

  // Local working draft of selected dataset
  const [draftName, setDraftName] = useState('');
  const [draftSchema, setDraftSchema] = useState('public');
  const [draftComment, setDraftComment] = useState('');
  const [draftPk, setDraftPk] = useState('OBJECTID');
  const [draftFields, setDraftFields] = useState<AttributeField[]>([]);
  const [draftFeatures, setDraftFeatures] = useState<any[]>([]);

  // Data Grid UI states
  const [rowSearch, setRowSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Bulk find & replace
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [replaceColumn, setReplaceColumn] = useState('');
  const [findValue, setFindValue] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [replaceResult, setReplaceResult] = useState('');

  // Schema add column
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<'string' | 'number' | 'boolean' | 'date'>('string');
  const [newColDefault, setNewColDefault] = useState('');
  const [newColAutoIncrement, setNewColAutoIncrement] = useState(false);

  const [isExportingGdb, setIsExportingGdb] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && dataset) {
      setActiveDatasetId(dataset.id);
    }
  }, [isOpen, dataset]);

  const currentSource = useMemo(() => {
    if (!activeDatasetId) return dataset;
    return allDatasets.find((d) => d.id === activeDatasetId) || dataset;
  }, [activeDatasetId, allDatasets, dataset]);

  useEffect(() => {
    if (!currentSource) return;
    setDraftName(currentSource.name || '');
    setDraftSchema(currentSource.schemaName || 'public');
    setDraftComment(currentSource.tableComment || '');
    setDraftPk(
      currentSource.primaryKeyColumn ||
        currentSource.fields[0]?.name ||
        'OBJECTID'
    );
    setDraftFields(currentSource.fields.map((f) => ({ ...f })));
    setDraftFeatures(
      (currentSource.geojson?.features || []).map((f: any) => ({
        ...f,
        properties: { ...(f.properties || {}) },
        geometry: f.geometry ? JSON.parse(JSON.stringify(f.geometry)) : null,
      }))
    );
    setReplaceColumn(currentSource.fields[0]?.name || '');
    setReplaceResult('');
    setNewColAutoIncrement(false);
    setPage(0);
    setRowSearch('');
    setSavedNotice(null);
  }, [currentSource]);

  const matchingReplaceCells = useMemo(() => {
    if (!replaceColumn) return 0;
    return draftFeatures.reduce(
      (count, feature) =>
        matchesFindValue(feature?.properties?.[replaceColumn], findValue) ? count + 1 : count,
      0
    );
  }, [draftFeatures, findValue, replaceColumn]);

  const filteredRowIndices = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    const indices: number[] = [];
    for (let i = 0; i < draftFeatures.length; i++) {
      if (!q) {
        indices.push(i);
        continue;
      }
      const props = draftFeatures[i]?.properties || {};
      const match = Object.values(props).some(
        (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      );
      if (match) indices.push(i);
    }
    return indices;
  }, [draftFeatures, rowSearch]);

  if (!isOpen || !currentSource) return null;

  const totalPages = Math.max(1, Math.ceil(filteredRowIndices.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleIndices = filteredRowIndices.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  const buildUpdatedDataset = (): SpatialDataset => {
    const geojson = {
      type: 'FeatureCollection',
      features: draftFeatures,
    };
    const crsCode = currentSource.detectedCRS?.code || 'EPSG:4326';
    const bounds = currentSource.isNonSpatial
      ? ([0, 0, 0, 0] as [number, number, number, number])
      : computeGeoJSONBounds(geojson);
    const derivedFields = extractSchemaFields(geojson);
    // Merge user-declared schema fields with any new/empty fields so empty columns aren't dropped
    const mergedFields: AttributeField[] = draftFields.map((df) => {
      const found = derivedFields.find((f) => f.name === df.name);
      return found ? { ...found, type: df.type } : df;
    });
    const validationIssues = currentSource.isNonSpatial
      ? []
      : validateDatasetGeometries(geojson, crsCode);

    return {
      ...currentSource,
      name: draftName.trim() || currentSource.name,
      schemaName: draftSchema.trim() || 'public',
      tableComment: draftComment.trim() || undefined,
      primaryKeyColumn: draftPk.trim() || undefined,
      featureCount: draftFeatures.length,
      fields: mergedFields,
      bounds,
      geojson,
      validationIssues,
      status: validationIssues.some((i) => i.severity === 'error')
        ? 'invalid'
        : validationIssues.length > 0
        ? 'warning'
        : 'ready',
    };
  };

  const handleSave = () => {
    const updated = buildUpdatedDataset();
    onSaveDataset(updated);
    setSavedNotice(
      isFr
        ? `Modifications enregistrées pour "${updated.name}".`
        : `Saved edits for "${updated.name}".`
    );
    setTimeout(() => setSavedNotice(null), 3000);
  };

  const handleExportGdbZip = async (scope: 'current' | 'all_gdb') => {
    setIsExportingGdb(true);
    try {
      const updatedCurrent = buildUpdatedDataset();
      onSaveDataset(updatedCurrent);

      const targetLayers =
        scope === 'all_gdb'
          ? allDatasets.map((d) => (d.id === updatedCurrent.id ? updatedCurrent : d))
          : [updatedCurrent];

      const archiveBase =
        updatedCurrent.gdbSourceName?.replace(/\.gdb$/i, '') ||
        updatedCurrent.name ||
        'edited_geodatabase';

      const blob = await exportDatasetsToFileGdbZip(targetLayers, archiveBase, relationships);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${archiveBase}_edited.gdb.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingGdb(false);
    }
  };

  const updateCell = (rowIdx: number, fieldName: string, rawVal: string, type: AttributeField['type']) => {
    setDraftFeatures((prev) => {
      const next = [...prev];
      const feat = { ...next[rowIdx], properties: { ...(next[rowIdx].properties || {}) } };
      if (rawVal === '') {
        feat.properties[fieldName] = null;
      } else if (type === 'number') {
        const parsed = Number(rawVal);
        feat.properties[fieldName] = Number.isFinite(parsed) ? parsed : rawVal;
      } else if (type === 'boolean') {
        feat.properties[fieldName] = rawVal.toLowerCase() === 'true' || rawVal === '1';
      } else {
        feat.properties[fieldName] = rawVal;
      }
      next[rowIdx] = feat;
      return next;
    });
  };

  const handleAddRow = () => {
    const emptyProps: Record<string, any> = {};
    for (const f of draftFields) {
      if (f.name === draftPk) {
        emptyProps[f.name] = draftFeatures.length + 1;
      } else {
        emptyProps[f.name] = null;
      }
    }
    const templateGeom =
      !currentSource.isNonSpatial && draftFeatures[0]?.geometry
        ? JSON.parse(JSON.stringify(draftFeatures[0].geometry))
        : null;
    setDraftFeatures((prev) => [
      ...prev,
      { type: 'Feature', properties: emptyProps, geometry: templateGeom },
    ]);
  };

  const handleCloneRow = (rowIdx: number) => {
    const src = draftFeatures[rowIdx];
    if (!src) return;
    const clonedProps = { ...(src.properties || {}) };
    if (draftPk && clonedProps[draftPk] !== undefined && typeof clonedProps[draftPk] === 'number') {
      clonedProps[draftPk] = draftFeatures.length + 1;
    }
    setDraftFeatures((prev) => [
      ...prev.slice(0, rowIdx + 1),
      {
        type: 'Feature',
        properties: clonedProps,
        geometry: src.geometry ? JSON.parse(JSON.stringify(src.geometry)) : null,
      },
      ...prev.slice(rowIdx + 1),
    ]);
  };

  const handleDeleteRow = (rowIdx: number) => {
    setDraftFeatures((prev) => prev.filter((_, idx) => idx !== rowIdx));
  };

  const handleBulkReplace = () => {
    const field = draftFields.find((item) => item.name === replaceColumn);
    if (!field) {
      setReplaceResult(isFr ? 'Sélectionnez une colonne cible.' : 'Select a target column.');
      return;
    }

    const escapedFindValue = findValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const findPattern = findValue === '' ? null : new RegExp(escapedFindValue, 'gi');
    let matchedCells = 0;
    let changedCells = 0;

    const updatedFeatures = draftFeatures.map((feature) => {
      const currentValue = feature?.properties?.[replaceColumn];
      if (!matchesFindValue(currentValue, findValue)) return feature;
      matchedCells++;

      const currentText = getCellText(currentValue);
      const replacedText = findPattern
        ? currentText.replace(findPattern, () => replaceWith)
        : replaceWith;
      let nextValue: unknown = replacedText === '' ? null : replacedText;

      if (replacedText !== '' && field.type === 'number') {
        const parsed = Number(replacedText);
        nextValue = Number.isFinite(parsed) ? parsed : replacedText;
      } else if (replacedText !== '' && field.type === 'boolean') {
        nextValue = replacedText.toLowerCase() === 'true' || replacedText === '1';
      }

      if (Object.is(currentValue, nextValue)) return feature;
      changedCells++;
      return {
        ...feature,
        properties: { ...(feature.properties || {}), [replaceColumn]: nextValue },
      };
    });

    if (changedCells > 0) setDraftFeatures(updatedFeatures);
    setReplaceResult(
      changedCells > 0
        ? isFr
          ? `${changedCells} cellule(s) remplacée(s).`
          : `Replaced ${changedCells} cell${changedCells === 1 ? '' : 's'}.`
        : matchedCells > 0
          ? isFr
            ? 'Correspondances trouvées, mais aucune valeur n’a changé.'
            : 'Matches found, but no values changed.'
          : isFr
            ? 'Aucune correspondance trouvée dans cette colonne.'
            : 'No matches found in this column.'
    );
  };

  const handleAddColumn = () => {
    const clean = newColName.trim().replace(/\s+/g, '_');
    if (!clean) return;
    if (draftFields.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return;
    let typedDefault: any = newColDefault === '' ? null : newColDefault;
    if (newColDefault !== '' && newColType === 'number') {
      const n = Number(newColDefault);
      if (Number.isFinite(n)) typedDefault = n;
    } else if (newColDefault !== '' && newColType === 'boolean') {
      typedDefault = newColDefault.toLowerCase() === 'true' || newColDefault === '1';
    }
    const sampleValue = newColAutoIncrement ? (draftFeatures.length > 0 ? 1 : null) : typedDefault;
    setDraftFields((prev) => [
      ...prev,
      { name: clean, type: newColType, sampleValues: sampleValue !== null ? [sampleValue] : [] },
    ]);
    setDraftFeatures((prev) =>
      prev.map((f, index) => ({
        ...f,
        properties: {
          ...(f.properties || {}),
          [clean]: newColAutoIncrement ? index + 1 : typedDefault,
        },
      }))
    );
    setNewColName('');
    setNewColDefault('');
    setNewColAutoIncrement(false);
  };

  const handleRenameColumn = (oldName: string, nextNameRaw: string) => {
    const nextName = nextNameRaw.trim();
    if (!nextName || nextName === oldName) return;
    if (draftFields.some((f) => f.name === nextName)) return;
    setDraftFields((prev) =>
      prev.map((f) => (f.name === oldName ? { ...f, name: nextName } : f))
    );
    setDraftFeatures((prev) =>
      prev.map((f) => {
        const props = { ...(f.properties || {}) };
        props[nextName] = props[oldName];
        delete props[oldName];
        return { ...f, properties: props };
      })
    );
    if (draftPk === oldName) setDraftPk(nextName);
  };

  const handleChangeColumnType = (colName: string, nextType: AttributeField['type']) => {
    setDraftFields((prev) =>
      prev.map((f) => (f.name === colName ? { ...f, type: nextType } : f))
    );
  };

  const handleDeleteColumn = (colName: string) => {
    setDraftFields((prev) => prev.filter((f) => f.name !== colName));
    setDraftFeatures((prev) =>
      prev.map((f) => {
        const props = { ...(f.properties || {}) };
        delete props[colName];
        return { ...f, properties: props };
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in-0 duration-150">
      <div className={`relative flex flex-col w-full max-w-6xl max-h-[94vh] rounded-2xl border shadow-2xl overflow-hidden ${
        theme === 'light'
          ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-900'
          : 'bg-[#0D1413] border-stone-800 text-stone-100'
      }`}>
        {/* Top Bar */}
        <div className={`px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
          theme === 'light' ? 'bg-white border-[#D4DFD3]' : 'bg-[#101917] border-stone-800'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-display font-bold">
                  {isFr ? 'Éditeur FileGDB (.gdb) & Table' : 'FileGDB (.gdb) & Table Editor'}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                  {currentSource.format.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] font-mono text-stone-400 mt-0.5">
                {draftFeatures.length.toLocaleString()} {isFr ? 'lignes' : 'rows'} &bull; {draftFields.length} {isFr ? 'colonnes' : 'columns'} &bull; {currentSource.detectedCRS?.code || 'Tabular'}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {allDatasets.length > 1 && (
              <select
                value={currentSource.id}
                onChange={(e) => setActiveDatasetId(e.target.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-mono border focus:outline-none cursor-pointer ${
                  theme === 'light'
                    ? 'bg-[#F7FAF5] border-[#C2D2C2] text-stone-900'
                    : 'bg-stone-900 border-stone-700 text-stone-200'
                }`}
              >
                {allDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.featureCount})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-bold transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isFr ? 'Appliquer à l’Atelier' : 'Save to Workspace'}</span>
            </button>

            <button
              type="button"
              disabled={isExportingGdb}
              onClick={() => handleExportGdbZip(allDatasets.length > 1 ? 'all_gdb' : 'current')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isExportingGdb
                  ? (isFr ? 'Export .gdb...' : 'Packing...')
                  : (isFr ? 'Exporter .gdb.zip' : 'Export .gdb.zip')}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Saved notice */}
        {savedNotice && (
          <div className="px-6 py-2 bg-emerald-950/60 border-b border-emerald-700/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className={`px-6 py-2 border-b flex items-center space-x-2 text-xs font-semibold ${
          theme === 'light' ? 'bg-[#EBF3E8] border-[#D4DFD3]' : 'bg-[#101817] border-stone-800'
        }`}>
          <button
            type="button"
            onClick={() => setEditorTab('grid')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              editorTab === 'grid'
                ? 'bg-amber-600 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>{isFr ? 'Données & Attributs' : 'Data & Attributes'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEditorTab('schema')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              editorTab === 'schema'
                ? 'bg-amber-600 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{isFr ? `Colonnes (${draftFields.length})` : `Columns (${draftFields.length})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setEditorTab('metadata')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              editorTab === 'metadata'
                ? 'bg-amber-600 text-stone-950 font-bold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isFr ? 'Métadonnées & Commentaire (Service)' : 'Metadata & Comment (Service)'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {editorTab === 'grid' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rowSearch}
                    onChange={(e) => {
                      setRowSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder={isFr ? 'Filtrer les lignes...' : 'Filter rows...'}
                    className={`w-full rounded-lg pl-8 pr-3 py-1.5 text-xs border focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border-[#C2D2C2] text-stone-900'
                        : 'bg-stone-900 border-stone-800 text-stone-100'
                    }`}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowFindReplace((v) => !v)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-200 text-xs font-semibold cursor-pointer"
                  >
                    <Replace className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isFr ? 'Rechercher & Remplacer' : 'Find & Replace'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Ajouter Ligne' : 'Add Row'}</span>
                  </button>
                </div>
              </div>

              {showFindReplace && (
                <div className="p-3 rounded-xl border border-amber-600/40 bg-amber-950/20 flex flex-wrap items-end gap-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Colonne cible' : 'Target column'}
                    </label>
                    <select
                      value={replaceColumn}
                      aria-label={isFr ? 'Colonne cible' : 'Target column'}
                      onChange={(e) => {
                        setReplaceColumn(e.target.value);
                        setReplaceResult('');
                      }}
                      className="rounded-lg px-2.5 py-1.5 bg-stone-900 border border-stone-700 text-stone-100 font-mono"
                    >
                      {draftFields.map((f) => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Texte à chercher (vide = cellules vides)' : 'Find text (empty = blank cells)'}
                    </label>
                    <input
                      type="text"
                      value={findValue}
                      aria-label={isFr ? 'Texte à chercher' : 'Find text'}
                      onChange={(e) => {
                        setFindValue(e.target.value);
                        setReplaceResult('');
                      }}
                      className="rounded-lg px-2.5 py-1.5 bg-stone-900 border border-stone-700 text-stone-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-stone-400 mb-1">
                      {isFr ? 'Remplacer par' : 'Replace with'}
                    </label>
                    <input
                      type="text"
                      value={replaceWith}
                      aria-label={isFr ? 'Remplacer par' : 'Replace with'}
                      onChange={(e) => {
                        setReplaceWith(e.target.value);
                        setReplaceResult('');
                      }}
                      className="rounded-lg px-2.5 py-1.5 bg-stone-900 border border-stone-700 text-stone-100 font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkReplace}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold cursor-pointer"
                  >
                    {isFr ? 'Remplacer Tout' : 'Replace All'}
                  </button>
                  <div className="w-full flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400" aria-live="polite">
                    <span>
                      {isFr
                        ? `${matchingReplaceCells} cellule(s) correspondante(s) dans cette colonne.`
                        : `${matchingReplaceCells} matching cell${matchingReplaceCells === 1 ? '' : 's'} in this column.`}
                    </span>
                    {replaceResult && (
                      <span role="status" className="font-semibold text-amber-300">
                        {replaceResult}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-stone-800">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-stone-900/90 text-stone-400 text-[10px] uppercase border-b border-stone-800">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">#</th>
                      {draftFields.map((f) => (
                        <th key={f.name} className="py-2 px-3 min-w-[140px]">
                          <div className="flex items-center space-x-1">
                            <span className={f.name === draftPk ? 'text-amber-400 font-bold' : 'text-stone-200'}>
                              {f.name}
                            </span>
                            {f.name === draftPk && (
                              <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                PK
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      {!currentSource.isNonSpatial && (
                        <th className="py-2 px-3 min-w-[150px]">
                          {isFr ? 'Géométrie' : 'Geometry'}
                        </th>
                      )}
                      <th className="py-2 px-3 w-20 text-right">{isFr ? 'Actions' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/70">
                    {visibleIndices.map((rowIdx) => {
                      const feat = draftFeatures[rowIdx];
                      const props = feat?.properties || {};
                      const geom = feat?.geometry;
                      return (
                        <tr key={`row-${rowIdx}`} className="hover:bg-white/[0.02]">
                          <td className="py-1.5 px-3 text-center text-stone-500">{rowIdx + 1}</td>
                          {draftFields.map((f) => {
                            const val = props[f.name];
                            const display = val === null || val === undefined ? '' : String(val);
                            return (
                              <td key={`${rowIdx}-${f.name}`} className="py-1 px-2">
                                <input
                                  type="text"
                                  value={display}
                                  onChange={(e) => updateCell(rowIdx, f.name, e.target.value, f.type)}
                                  className={`w-full px-2 py-1 rounded border border-transparent focus:border-amber-500/70 focus:outline-none text-xs ${
                                    theme === 'light'
                                      ? 'bg-white/70 text-stone-900 focus:bg-white'
                                      : 'bg-stone-900/50 text-stone-200 focus:bg-stone-900'
                                  }`}
                                />
                              </td>
                            );
                          })}
                          {!currentSource.isNonSpatial && (
                            <td className="py-1.5 px-3 text-[11px] text-emerald-400">
                              {geom ? (
                                geom.type === 'Point' && Array.isArray(geom.coordinates)
                                  ? `Point(${Number(geom.coordinates[0]).toFixed(5)}, ${Number(geom.coordinates[1]).toFixed(5)})`
                                  : `${geom.type}`
                              ) : (
                                <span className="text-stone-500">NULL</span>
                              )}
                            </td>
                          )}
                          <td className="py-1.5 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                type="button"
                                onClick={() => handleCloneRow(rowIdx)}
                                title={isFr ? 'Dupliquer ligne' : 'Clone row'}
                                className="p-1 rounded hover:bg-stone-800 text-stone-400 hover:text-amber-300 cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(rowIdx)}
                                title={isFr ? 'Supprimer ligne' : 'Delete row'}
                                className="p-1 rounded hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleIndices.length === 0 && (
                      <tr>
                        <td
                          colSpan={draftFields.length + (currentSource.isNonSpatial ? 2 : 3)}
                          className="py-8 text-center text-stone-500"
                        >
                          {isFr ? 'Aucun enregistrement trouvé.' : 'No rows found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs font-mono text-stone-400">
                  <span>
                    {isFr ? 'Page' : 'Page'} {safePage + 1} / {totalPages} ({filteredRowIndices.length} {isFr ? 'lignes' : 'rows'})
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={safePage === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="px-2.5 py-1 rounded border border-stone-700 disabled:opacity-40 cursor-pointer"
                    >
                      {isFr ? 'Précédent' : 'Previous'}
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className="px-2.5 py-1 rounded border border-stone-700 disabled:opacity-40 cursor-pointer"
                    >
                      {isFr ? 'Suivant' : 'Next'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {editorTab === 'schema' && (
            <div className="space-y-4">
              {/* Add column bar */}
              <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/60 flex flex-wrap items-end gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                    {isFr ? 'Nouveau Champ' : 'New Field Name'}
                  </label>
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="code_secteur"
                    className="rounded-lg px-3 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                    {isFr ? 'Type' : 'Data Type'}
                  </label>
                  <select
                    value={newColType}
                    onChange={(e) => {
                      const nextType = e.target.value as typeof newColType;
                      setNewColType(nextType);
                      if (nextType !== 'number') setNewColAutoIncrement(false);
                    }}
                    className="rounded-lg px-3 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                  >
                    <option value="string">string (varchar)</option>
                    <option value="number">number (numeric / int)</option>
                    <option value="boolean">boolean</option>
                    <option value="date">date / timestamp</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 pb-1.5 text-stone-300">
                  <input
                    type="checkbox"
                    checked={newColAutoIncrement}
                    disabled={newColType !== 'number'}
                    onChange={(e) => setNewColAutoIncrement(e.target.checked)}
                    className="rounded border-stone-700 bg-[#0D1413] text-amber-500 disabled:opacity-40"
                  />
                  <span>{isFr ? 'Numérotation automatique (1, 2, 3...)' : 'Auto-increment (1, 2, 3...)'}</span>
                </label>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                    {isFr ? 'Valeur initiale (optionnel)' : 'Initial value (optional)'}
                  </label>
                  <input
                    type="text"
                    value={newColDefault}
                    onChange={(e) => setNewColDefault(e.target.value)}
                    disabled={newColAutoIncrement}
                    className="rounded-lg px-3 py-1.5 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Ajouter Colonne' : 'Add Column'}</span>
                </button>
              </div>

              {/* Existing columns editor */}
              <div className="rounded-xl border border-stone-800 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-stone-900 text-[10px] uppercase text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="py-2.5 px-4">{isFr ? 'Nom du champ' : 'Field Name'}</th>
                      <th className="py-2.5 px-4">{isFr ? 'Type' : 'Type'}</th>
                      <th className="py-2.5 px-4">{isFr ? 'Clé Primaire' : 'Primary Key'}</th>
                      <th className="py-2.5 px-4 text-right">{isFr ? 'Supprimer' : 'Delete'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/70">
                    {draftFields.map((col) => (
                      <tr key={col.name} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            defaultValue={col.name}
                            onBlur={(e) => handleRenameColumn(col.name, e.target.value)}
                            className="w-full max-w-xs px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-stone-100"
                          />
                        </td>
                        <td className="py-2 px-4">
                          <select
                            value={col.type}
                            onChange={(e) => handleChangeColumnType(col.name, e.target.value as any)}
                            className="px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-stone-200"
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="date">date</option>
                            <option value="object">object</option>
                          </select>
                        </td>
                        <td className="py-2 px-4">
                          <button
                            type="button"
                            onClick={() => setDraftPk(col.name)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                              draftPk === col.name
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                : 'bg-stone-900 text-stone-500 border-stone-700 hover:text-stone-300'
                            }`}
                          >
                            {draftPk === col.name ? 'PK ACTIVE' : (isFr ? 'Définir PK' : 'Set PK')}
                          </button>
                        </td>
                        <td className="py-2 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteColumn(col.name)}
                            className="p-1 rounded hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 cursor-pointer"
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
          )}

          {editorTab === 'metadata' && (
            <div className="max-w-2xl space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/50 space-y-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                    {isFr ? 'Nom de la Table / Couche' : 'Table / Layer Name'}
                  </label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                      {isFr ? 'Schéma PostgreSQL / SDE' : 'Schema Name'}
                    </label>
                    <input
                      type="text"
                      value={draftSchema}
                      onChange={(e) => setDraftSchema(e.target.value)}
                      placeholder="public"
                      className="w-full rounded-lg px-3 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                      {isFr ? 'Colonne Clé Primaire (PK)' : 'Primary Key Column (PK)'}
                    </label>
                    <select
                      value={draftPk}
                      onChange={(e) => setDraftPk(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-mono"
                    >
                      {draftFields.map((f) => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-stone-400 mb-1">
                    {isFr
                      ? 'Commentaire / Service (utilisé pour le filtrage Dictionnaire & MCD/MPD)'
                      : 'Table Comment / Service (used for Dictionary & MCD/MPD filtering)'}
                  </label>
                  <textarea
                    rows={3}
                    value={draftComment}
                    onChange={(e) => setDraftComment(e.target.value)}
                    placeholder="Service : Gestion et Développement des Ressources en Eau"
                    className="w-full rounded-lg px-3 py-2 bg-[#0D1413] border border-stone-700 text-stone-100 font-sans"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'Service : Gestion et Développement des Ressources en Eau',
                      'Service : Conservation Foncière & Cadastre',
                      'Service : Urbanisme & Aménagement',
                      'Service : Réseaux & Infrastructures',
                    ].map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        onClick={() => setDraftComment(tpl)}
                        className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-[10px] text-amber-300 border border-stone-700 cursor-pointer"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
