/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Type,
  LayoutList,
  Image as ImageIcon,
  Upload,
  Trash2,
  Plus,
  RotateCcw,
  Download,
  Printer,
  AlignLeft,
  AlignCenter,
  Columns,
  Check,
  Eye,
  FileText,
  Palette,
} from 'lucide-react';
import {
  HtmlReportConfig,
  HtmlReportFontKey,
  HTML_REPORT_FONTS,
  PROFILE_RUBRIQUES_META,
  PHYSICAL_COLUMNS_META,
  ProfileRubriqueKey,
  PhysicalColumnKey,
  CustomProfileRubrique,
  CustomReportSection,
  createDefaultHtmlReportConfig,
  DATA_DICTIONARY_SERVICES,
  getColumnMetadataKey,
  getRelationshipMetadataKey,
  getTableMetadataKey,
  classifyTableFamily,
  HtmlColumnMetadata,
  HtmlRelationshipMetadata,
  HtmlTableMetadata,
  PostgresDatabaseSchema,
  PostgresRelationship,
  isBusinessTable,
} from '../core/postgresReportEngine';

interface DataDictionaryCustomizerProps {
  config: HtmlReportConfig;
  schema: PostgresDatabaseSchema;
  onChange: (next: HtmlReportConfig) => void;
  htmlPreview: string;
  databaseName: string;
  lang: 'fr' | 'en';
  theme: 'light' | 'dark';
  onDownloadHtml: () => void;
  onPrintHtml: () => void;
}

const ACCENT_PRESETS = [
  { hex: '#CE5311', labelFr: 'Terracotta OmniGeo', labelEn: 'OmniGeo Terracotta' },
  { hex: '#1D4ED8', labelFr: 'Bleu Institutionnel', labelEn: 'Institutional Blue' },
  { hex: '#047857', labelFr: 'Vert Émeraude', labelEn: 'Emerald Green' },
  { hex: '#1E293B', labelFr: 'Ardoise Sobre', labelEn: 'Executive Slate' },
  { hex: '#881337', labelFr: 'Bordeaux Officiel', labelEn: 'Official Burgundy' },
  { hex: '#6D28D9', labelFr: 'Indigo Technique', labelEn: 'Technical Indigo' },
];

const QUICK_CUSTOM_RUBRIQUES_FR = [
  { label: 'Producteur / Service propriétaire', value: 'Direction SIG / DSI' },
  { label: 'Fréquence de mise à jour', value: 'Trimestrielle' },
  { label: 'Niveau de confidentialité', value: 'Usage interne' },
  { label: 'Système de coordonnées (CRS)', value: 'EPSG:4326 / WGS 84' },
];

const QUICK_CUSTOM_RUBRIQUES_EN = [
  { label: 'Data Owner / Producer', value: 'GIS Department / IT' },
  { label: 'Update Frequency', value: 'Quarterly' },
  { label: 'Confidentiality Level', value: 'Internal Use' },
  { label: 'Coordinate Reference System', value: 'EPSG:4326 / WGS 84' },
];

export const DataDictionaryCustomizer: React.FC<DataDictionaryCustomizerProps> = ({
  config,
  schema,
  onChange,
  htmlPreview,
  databaseName,
  lang,
  theme,
  onDownloadHtml,
  onPrintHtml,
}) => {
  const isFr = lang === 'fr';
  const isLight = theme === 'light';

  const [subTab, setSubTab] = useState<'header' | 'rubriques' | 'typography' | 'business'>('rubriques');
  const [selectedTableKey, setSelectedTableKey] = useState('');
  const [relationSource, setRelationSource] = useState('');
  const [relationTarget, setRelationTarget] = useState('');
  const [relationSourceColumn, setRelationSourceColumn] = useState('');
  const [relationTargetColumn, setRelationTargetColumn] = useState('');
  const [relationNature, setRelationNature] = useState('');
  const [relationCardinality, setRelationCardinality] = useState('1:N');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [newRubriqueLabel, setNewRubriqueLabel] = useState('');
  const [newRubriqueValue, setNewRubriqueValue] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionContent, setNewSectionContent] = useState('');
  const [newSectionPosition, setNewSectionPosition] = useState<'top' | 'bottom'>('top');

  const logoLeftInputRef = useRef<HTMLInputElement>(null);
  const logoRightInputRef = useRef<HTMLInputElement>(null);

  const tables = schema.tables || [];
  const selectedTable = tables.find(table => getTableMetadataKey(table) === selectedTableKey) || tables[0];
  const tableKey = selectedTable ? getTableMetadataKey(selectedTable) : '';
  const savedTableMetadata = config.tableMetadata[tableKey];
  const tableMetadata: HtmlTableMetadata = {
    service: savedTableMetadata?.service || (selectedTable ? classifyTableFamily(selectedTable, tables, lang) : ''),
    description: savedTableMetadata?.description || '',
    purpose: savedTableMetadata?.purpose || '',
    nature: savedTableMetadata?.nature || '',
    technicalIdentifier: savedTableMetadata?.technicalIdentifier || '',
    businessIdentifier: savedTableMetadata?.businessIdentifier || '',
    transversal: savedTableMetadata?.transversal || false,
  };
  const tableOptions = tables.map(table => ({
    key: getTableMetadataKey(table),
    table,
    label: `${getTableMetadataKey(table)} — ${config.tableMetadata[getTableMetadataKey(table)]?.service || classifyTableFamily(table, tables, lang)}`,
  }));
  const includedTables = tables.filter(table =>
    !config.excludedTables.includes(getTableMetadataKey(table)) &&
    !(config.excludeTechnicalTables && !isBusinessTable(table))
  );
  const relationships = [
    ...(schema.relationships || []),
    ...config.manualRelationships,
  ].filter(rel => {
    const source = rel.sourceTable.toLowerCase();
    const target = rel.targetTable.toLowerCase();
    const names = new Set(includedTables.flatMap(table => [
      table.name.toLowerCase(),
      getTableMetadataKey(table).toLowerCase(),
    ]));
    return names.has(source) && names.has(target);
  });

  const updateTableMetadata = (patch: Partial<HtmlTableMetadata>) => {
    if (!tableKey) return;
    onChange({
      ...config,
      tableMetadata: {
        ...config.tableMetadata,
        [tableKey]: { ...tableMetadata, ...patch },
      },
    });
  };

  const updateColumnMetadata = (columnName: string, patch: Partial<HtmlColumnMetadata>) => {
    if (!selectedTable) return;
    const key = getColumnMetadataKey(selectedTable, columnName);
    onChange({
      ...config,
      columnMetadata: {
        ...config.columnMetadata,
        [key]: {
          description: patch.description ?? config.columnMetadata[key]?.description ?? '',
          unit: patch.unit ?? config.columnMetadata[key]?.unit ?? '',
          valueDomain: patch.valueDomain ?? config.columnMetadata[key]?.valueDomain ?? '',
          businessRule: patch.businessRule ?? config.columnMetadata[key]?.businessRule ?? '',
          relatedTable: patch.relatedTable ?? config.columnMetadata[key]?.relatedTable ?? '',
          relatedField: patch.relatedField ?? config.columnMetadata[key]?.relatedField ?? '',
        },
      },
    });
  };

  const updateRelationshipMetadata = (rel: PostgresRelationship, patch: Partial<HtmlRelationshipMetadata>) => {
    const key = getRelationshipMetadataKey(rel);
    onChange({
      ...config,
      relationshipMetadata: {
        ...config.relationshipMetadata,
        [key]: {
          nature: patch.nature ?? config.relationshipMetadata[key]?.nature ?? '',
          cardinality: patch.cardinality ?? config.relationshipMetadata[key]?.cardinality ?? rel.cardinality ?? '1:N',
          sourceCardinality: patch.sourceCardinality ?? config.relationshipMetadata[key]?.sourceCardinality ?? rel.sourceCardinality ?? '',
          targetCardinality: patch.targetCardinality ?? config.relationshipMetadata[key]?.targetCardinality ?? rel.targetCardinality ?? '',
          mandatory: patch.mandatory !== undefined
            ? patch.mandatory
            : config.relationshipMetadata[key]
              ? config.relationshipMetadata[key].mandatory
              : rel.mandatory ?? null,
          management: patch.management ?? config.relationshipMetadata[key]?.management ?? rel.management ?? 'application',
        },
      },
    });
  };

  const addManualRelationship = () => {
    const sourceTable = tables.find(table => getTableMetadataKey(table) === relationSource);
    const targetTable = tables.find(table => getTableMetadataKey(table) === relationTarget);
    if (!sourceTable || !targetTable || !relationSourceColumn || !relationTargetColumn) return;
    const relation: PostgresRelationship = {
      id: `manual_${Date.now()}`,
      constraintName: `manual_${sourceTable.name}_${relationSourceColumn}_${targetTable.name}`,
      sourceTable: getTableMetadataKey(sourceTable),
      sourceColumn: relationSourceColumn,
      targetTable: getTableMetadataKey(targetTable),
      targetColumn: relationTargetColumn,
      cardinality: relationCardinality as PostgresRelationship['cardinality'],
      nature: relationNature.trim(),
      management: 'application',
    };
    const key = getRelationshipMetadataKey(relation);
    onChange({
      ...config,
      manualRelationships: [...config.manualRelationships, relation],
      relationshipMetadata: {
        ...config.relationshipMetadata,
        [key]: {
          nature: relationNature.trim(),
          cardinality: relationCardinality,
          sourceCardinality: '',
          targetCardinality: '',
          mandatory: null,
          management: 'application',
        },
      },
    });
    setRelationNature('');
  };

  const updateHeader = (patch: Partial<HtmlReportConfig['header']>) => {
    onChange({
      ...config,
      header: { ...config.header, ...patch },
    });
  };

  const updateSections = (patch: Partial<HtmlReportConfig['sections']>) => {
    onChange({
      ...config,
      sections: { ...config.sections, ...patch },
    });
  };

  const toggleProfileRubrique = (key: ProfileRubriqueKey) => {
    onChange({
      ...config,
      profileRubriques: {
        ...config.profileRubriques,
        [key]: !config.profileRubriques[key],
      },
    });
  };

  const setAllProfileRubriques = (enabled: boolean) => {
    const next = { ...config.profileRubriques };
    PROFILE_RUBRIQUES_META.forEach(item => {
      next[item.key] = enabled;
    });
    onChange({ ...config, profileRubriques: next });
  };

  const togglePhysicalColumn = (key: PhysicalColumnKey) => {
    const currentCount = Object.values(config.physicalColumns).filter(Boolean).length;
    if (config.physicalColumns[key] && currentCount <= 1) {
      return; // Keep at least one visible column
    }
    onChange({
      ...config,
      physicalColumns: {
        ...config.physicalColumns,
        [key]: !config.physicalColumns[key],
      },
    });
  };

  const handleAddCustomRubrique = (labelOverride?: string, valueOverride?: string) => {
    const label = (labelOverride ?? newRubriqueLabel).trim();
    const value = (valueOverride ?? newRubriqueValue).trim();
    if (!label) return;
    const item: CustomProfileRubrique = {
      id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      value,
      enabled: true,
    };
    onChange({
      ...config,
      customProfileRubriques: [...config.customProfileRubriques, item],
    });
    if (!labelOverride) {
      setNewRubriqueLabel('');
      setNewRubriqueValue('');
    }
  };

  const updateCustomRubrique = (id: string, patch: Partial<CustomProfileRubrique>) => {
    onChange({
      ...config,
      customProfileRubriques: config.customProfileRubriques.map(r =>
        r.id === id ? { ...r, ...patch } : r
      ),
    });
  };

  const removeCustomRubrique = (id: string) => {
    onChange({
      ...config,
      customProfileRubriques: config.customProfileRubriques.filter(r => r.id !== id),
    });
  };

  const handleAddCustomSection = () => {
    const title = newSectionTitle.trim();
    if (!title) return;
    const item: CustomReportSection = {
      id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      content: newSectionContent.trim(),
      position: newSectionPosition,
      enabled: true,
    };
    onChange({
      ...config,
      customSections: [...config.customSections, item],
    });
    setNewSectionTitle('');
    setNewSectionContent('');
  };

  const updateCustomSection = (id: string, patch: Partial<CustomReportSection>) => {
    onChange({
      ...config,
      customSections: config.customSections.map(s =>
        s.id === id ? { ...s, ...patch } : s
      ),
    });
  };

  const removeCustomSection = (id: string) => {
    onChange({
      ...config,
      customSections: config.customSections.filter(s => s.id !== id),
    });
  };

  const handleLogoFileUpload = (side: 'logoLeft' | 'logoRight', file?: File) => {
    setLogoError(null);
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setLogoError(
        isFr
          ? 'Format non pris en charge. Utilisez PNG, JPG, SVG ou WebP.'
          : 'Unsupported format. Please upload PNG, JPG, SVG, or WebP.'
      );
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(
        isFr
          ? 'Le logo dépasse 2 Mo. Veuillez choisir une image plus légère.'
          : 'Logo exceeds 2 MB. Please choose a smaller image.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateHeader({ [side]: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetDefaults = () => {
    onChange(createDefaultHtmlReportConfig());
    setLogoError(null);
  };

  const activeFont = HTML_REPORT_FONTS.find(f => f.key === config.fontFamily) || HTML_REPORT_FONTS[0];
  const activeProfileRubriqueCount =
    Object.values(config.profileRubriques).filter(Boolean).length +
    config.customProfileRubriques.filter(r => r.enabled && r.label.trim()).length;

  const surfaceCard = isLight
    ? 'bg-white border-[#D4DFD3] text-stone-900'
    : 'bg-[#101817] border-stone-800 text-stone-100';
  const inputClass = isLight
    ? 'w-full rounded-lg px-2.5 py-1.5 text-xs bg-[#F7FAF5] border border-[#C2D2C2] text-stone-900 placeholder-stone-400 outline-none focus:border-amber-600'
    : 'w-full rounded-lg px-2.5 py-1.5 text-xs bg-[#0C1211] border border-stone-800 text-stone-100 placeholder-stone-500 outline-none focus:border-amber-500';
  const labelClass = 'block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-semibold mb-1';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[620px]">
      {/* LEFT COLUMN: CUSTOMIZATION CONTROLS */}
      <div className="lg:col-span-5 flex flex-col space-y-4">
        {/* Sub-tab Switcher */}
        <div className={`p-1 rounded-xl border grid grid-cols-4 gap-1 ${
          isLight ? 'bg-[#EBF3E8] border-[#C2D2C2]' : 'bg-stone-900 border-stone-800'
        }`}>
          <button
            type="button"
            onClick={() => setSubTab('rubriques')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'rubriques'
                ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isFr ? 'Rubriques' : 'Sections'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('business')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'business'
                ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isFr ? 'Métier' : 'Business data'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('header')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'header'
                ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isFr ? 'En-tête & Logos' : 'Header & Logos'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('typography')}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'typography'
                ? 'bg-amber-600 text-stone-950 font-bold shadow-xs'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Type className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isFr ? 'Police & Style' : 'Font & Style'}</span>
          </button>
        </div>

        {/* Controls Container */}
        <div className="space-y-4 overflow-y-auto max-h-[600px] pr-1">
          {/* SUB-TAB 1: RUBRIQUES & SECTIONS */}
          {subTab === 'rubriques' && (
            <>
              {/* Global HTML Report Sections */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    {isFr ? 'Sections globales du fichier HTML' : 'Global HTML Document Sections'}
                  </h4>
                  <span className="text-[10px] font-mono text-stone-500">
                    {Object.values(config.sections).filter(Boolean).length} / 7
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { key: 'kpis' as const, fr: 'Cartes KPI de synthèse', en: 'Summary KPI Cards' },
                    { key: 'typeDistribution' as const, fr: 'Distribution des types SQL', en: 'SQL Types Distribution' },
                    { key: 'relationships' as const, fr: 'Matrice des relations (FK)', en: 'Foreign Keys Matrix' },
                    { key: 'filterPanel' as const, fr: 'Barre de recherche / filtres', en: 'Interactive Filter Panel' },
                    { key: 'tableDescription' as const, fr: 'Commentaire de chaque table', en: 'Table Description Comment' },
                    { key: 'tableProfile' as const, fr: '1- Fiche descriptive par table', en: '1- Table Profile Sheet' },
                    { key: 'physicalFields' as const, fr: '2- Structure physique des champs', en: '2- Physical Fields Table' },
                  ].map(sec => (
                    <label
                      key={sec.key}
                      className={`flex items-center space-x-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                        config.sections[sec.key]
                          ? isLight
                            ? 'bg-amber-50/70 border-amber-400/60 text-stone-900'
                            : 'bg-amber-500/10 border-amber-500/40 text-stone-100'
                          : isLight
                          ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-500'
                          : 'bg-[#0C1211] border-stone-800/80 text-stone-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={config.sections[sec.key]}
                        onChange={() => updateSections({ [sec.key]: !config.sections[sec.key] })}
                        className="accent-amber-600 rounded cursor-pointer"
                      />
                      <span className="truncate font-medium">{isFr ? sec.fr : sec.en}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Profile Rubriques (1- Fiche descriptive) */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                      {isFr ? 'Rubriques de la Fiche descriptive' : 'Table Profile Rubriques'}
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      {isFr
                        ? 'Cochez ou décochez les lignes affichées dans chaque fiche de table.'
                        : 'Check or uncheck rows displayed inside each table profile sheet.'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAllProfileRubriques(true)}
                      className="text-[10px] font-mono px-2 py-1 rounded border border-stone-700/60 hover:border-amber-500/60 text-stone-400 hover:text-amber-500 cursor-pointer"
                    >
                      {isFr ? 'Tout' : 'All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllProfileRubriques(false)}
                      className="text-[10px] font-mono px-2 py-1 rounded border border-stone-700/60 hover:border-amber-500/60 text-stone-400 hover:text-amber-500 cursor-pointer"
                    >
                      {isFr ? 'Aucun' : 'None'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {PROFILE_RUBRIQUES_META.map(item => (
                    <label
                      key={item.key}
                      className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none ${
                        config.profileRubriques[item.key]
                          ? isLight
                            ? 'bg-white border-[#C2D2C2] text-stone-900'
                            : 'bg-[#14201D] border-stone-700 text-stone-100'
                          : isLight
                          ? 'bg-[#F7FAF5] border-[#E1E8DF] text-stone-400 line-through'
                          : 'bg-[#0C1211] border-stone-800/60 text-stone-500 line-through'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={config.profileRubriques[item.key]}
                        onChange={() => toggleProfileRubrique(item.key)}
                        className="accent-amber-600 rounded cursor-pointer"
                      />
                      <span className="truncate">{isFr ? item.labelFr : item.labelEn}</span>
                    </label>
                  ))}
                </div>

                {/* Custom Added Rubriques in Fiche descriptive */}
                <div className="pt-3 border-t border-stone-800/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-500">
                      {isFr ? 'Ajouter des rubriques personnalisées (Fiche table)' : 'Add Custom Profile Rubriques'}
                    </span>
                  </div>

                  {/* Quick suggestion chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {(isFr ? QUICK_CUSTOM_RUBRIQUES_FR : QUICK_CUSTOM_RUBRIQUES_EN).map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddCustomRubrique(preset.label, preset.value)}
                        className={`text-[10px] px-2 py-1 rounded-md border flex items-center space-x-1 transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-[#F7FAF5] border-[#C2D2C2] text-stone-700 hover:border-amber-600'
                            : 'bg-[#0C1211] border-stone-800 text-stone-300 hover:border-amber-500/60'
                        }`}
                      >
                        <Plus className="w-2.5 h-2.5 text-amber-500" />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={newRubriqueLabel}
                      onChange={e => setNewRubriqueLabel(e.target.value)}
                      placeholder={isFr ? 'Nom de la rubrique (ex: Producteur)' : 'Rubrique label (e.g. Owner)'}
                      className={`sm:col-span-5 ${inputClass}`}
                    />
                    <input
                      type="text"
                      value={newRubriqueValue}
                      onChange={e => setNewRubriqueValue(e.target.value)}
                      placeholder={isFr ? 'Valeur par défaut...' : 'Default value...'}
                      className={`sm:col-span-5 ${inputClass}`}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomRubrique();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomRubrique()}
                      disabled={!newRubriqueLabel.trim()}
                      className="sm:col-span-2 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-bold text-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Ajout' : 'Add'}</span>
                    </button>
                  </div>

                  {config.customProfileRubriques.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {config.customProfileRubriques.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border ${
                            isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={() => updateCustomRubrique(item.id, { enabled: !item.enabled })}
                            className="accent-amber-600 cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            value={item.label}
                            onChange={e => updateCustomRubrique(item.id, { label: e.target.value })}
                            className={`flex-1 min-w-0 px-2 py-1 text-xs rounded border ${
                              isLight ? 'bg-white border-[#C2D2C2]' : 'bg-[#101817] border-stone-700 text-stone-100'
                            }`}
                          />
                          <input
                            type="text"
                            value={item.value}
                            onChange={e => updateCustomRubrique(item.id, { value: e.target.value })}
                            className={`flex-1 min-w-0 px-2 py-1 text-xs rounded border ${
                              isLight ? 'bg-white border-[#C2D2C2]' : 'bg-[#101817] border-stone-700 text-stone-300'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomRubrique(item.id)}
                            className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                            title={isFr ? 'Supprimer' : 'Remove'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Physical Columns Table Visibility */}
              <div className={`p-4 rounded-xl border space-y-2.5 ${surfaceCard}`}>
                <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                  {isFr ? 'Colonnes de la Structure physique' : 'Physical Structure Table Columns'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PHYSICAL_COLUMNS_META.map(col => (
                    <label
                      key={col.key}
                      className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none ${
                        config.physicalColumns[col.key]
                          ? isLight
                            ? 'bg-white border-[#C2D2C2] text-stone-900'
                            : 'bg-[#14201D] border-stone-700 text-stone-100'
                          : isLight
                          ? 'bg-[#F7FAF5] border-[#E1E8DF] text-stone-400'
                          : 'bg-[#0C1211] border-stone-800/60 text-stone-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={config.physicalColumns[col.key]}
                        onChange={() => togglePhysicalColumn(col.key)}
                        className="accent-amber-600 rounded cursor-pointer"
                      />
                      <span className="truncate">{isFr ? col.labelFr : col.labelEn}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Free-Text Sections in the HTML Document */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div>
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                    <span>{isFr ? 'Ajouter une rubrique libre au rapport' : 'Add Custom Report Section'}</span>
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {isFr
                      ? 'Ajoutez un bloc personnalisé (Avant-propos, Méthodologie, Glossaire, Visa...) en haut ou en bas du fichier HTML.'
                      : 'Add a free-text section (Introduction, Methodology, Sign-off...) at the top or bottom of the HTML document.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={newSectionTitle}
                      onChange={e => setNewSectionTitle(e.target.value)}
                      placeholder={isFr ? 'Titre de la rubrique (ex: Méthodologie & Périmètre)' : 'Section title (e.g. Scope & Methodology)'}
                      className={`sm:col-span-8 ${inputClass}`}
                    />
                    <select
                      value={newSectionPosition}
                      onChange={e => setNewSectionPosition(e.target.value as 'top' | 'bottom')}
                      className={`sm:col-span-4 ${inputClass} cursor-pointer`}
                    >
                      <option value="top">{isFr ? 'Position : Haut' : 'Position: Top'}</option>
                      <option value="bottom">{isFr ? 'Position : Bas' : 'Position: Bottom'}</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={newSectionContent}
                    onChange={e => setNewSectionContent(e.target.value)}
                    placeholder={isFr ? 'Contenu texte de cette rubrique...' : 'Section body text...'}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSection}
                    disabled={!newSectionTitle.trim()}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-bold text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Insérer cette rubrique dans le HTML' : 'Insert Section into HTML'}</span>
                  </button>
                </div>

                {config.customSections.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-stone-800/40">
                    {config.customSections.map(sec => (
                      <div
                        key={sec.id}
                        className={`p-2.5 rounded-lg border space-y-1.5 ${
                          isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={sec.enabled}
                            onChange={() => updateCustomSection(sec.id, { enabled: !sec.enabled })}
                            className="accent-amber-600 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={sec.title}
                            onChange={e => updateCustomSection(sec.id, { title: e.target.value })}
                            className={`flex-1 px-2 py-1 text-xs font-semibold rounded border ${
                              isLight ? 'bg-white border-[#C2D2C2]' : 'bg-[#101817] border-stone-700 text-stone-100'
                            }`}
                          />
                          <select
                            value={sec.position}
                            onChange={e => updateCustomSection(sec.id, { position: e.target.value as 'top' | 'bottom' })}
                            className={`px-2 py-1 text-[11px] rounded border cursor-pointer ${
                              isLight ? 'bg-white border-[#C2D2C2]' : 'bg-[#101817] border-stone-700 text-stone-300'
                            }`}
                          >
                            <option value="top">{isFr ? 'Haut' : 'Top'}</option>
                            <option value="bottom">{isFr ? 'Bas' : 'Bottom'}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeCustomSection(sec.id)}
                            className="p-1 text-stone-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={sec.content}
                          onChange={e => updateCustomSection(sec.id, { content: e.target.value })}
                          className={`w-full px-2 py-1 text-xs rounded border ${
                            isLight ? 'bg-white border-[#C2D2C2]' : 'bg-[#101817] border-stone-700 text-stone-300'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {subTab === 'business' && (
            <div className="space-y-3">
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div>
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    {isFr ? 'Périmètre métier et exclusions' : 'Business scope and exclusions'}
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-1">
                    {isFr
                      ? 'Les exclusions sont appliquées aux fiches, indicateurs, inventaires et relations du document.'
                      : 'Exclusions apply to profiles, metrics, inventories, and relationships in the report.'}
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={config.excludeTechnicalTables}
                    onChange={e => onChange({ ...config, excludeTechnicalTables: e.target.checked })}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span>{isFr ? 'Exclure les tables système, ArcGIS/SDE, internes et techniques détectées automatiquement' : 'Exclude detected system, ArcGIS/SDE, internal, and technical tables'}</span>
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {tableOptions.map(({ key, table }) => {
                    const checked = config.excludedTables.includes(key);
                    return (
                      <label key={key} className="flex items-center gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onChange({
                            ...config,
                            excludedTables: checked
                              ? config.excludedTables.filter(item => item !== key)
                              : [...config.excludedTables, key],
                          })}
                          className="accent-amber-600"
                        />
                        <span className="font-mono">{key}</span>
                        {!isBusinessTable(table) && <span className="text-stone-500">{isFr ? '(technique)' : '(technical)'}</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-stone-500">
                  {includedTables.length} / {tables.length} {isFr ? 'tables dans le périmètre actuel' : 'tables in current report scope'}
                </p>
              </div>

              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                  {isFr ? 'Fiche métier et attributs' : 'Business profile and attributes'}
                </h4>
                <select
                  value={tableKey}
                  onChange={e => setSelectedTableKey(e.target.value)}
                  className={inputClass}
                >
                  {tableOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                {selectedTable && (
                  <>
                    <label className="block text-[10px] text-stone-500">{isFr ? 'Domaine / service fonctionnel' : 'Functional domain / service'}</label>
                    <select
                      value={tableMetadata.service || 'Autres Tables Métiers'}
                      onChange={e => updateTableMetadata({ service: e.target.value })}
                      className={inputClass}
                    >
                      {!DATA_DICTIONARY_SERVICES.includes(tableMetadata.service) && tableMetadata.service && (
                        <option value={tableMetadata.service}>{tableMetadata.service}</option>
                      )}
                      {DATA_DICTIONARY_SERVICES.map(service => <option key={service} value={service}>{service}</option>)}
                      <option value="Autres Tables Métiers">{isFr ? 'Autres Tables Métiers (à reclasser)' : 'Other business tables (to classify)'}</option>
                    </select>
                    <textarea
                      value={tableMetadata.description}
                      onChange={e => updateTableMetadata({ description: e.target.value })}
                      placeholder={isFr ? 'Description fonctionnelle' : 'Functional description'}
                      className={inputClass}
                      rows={2}
                    />
                    <textarea
                      value={tableMetadata.purpose}
                      onChange={e => updateTableMetadata({ purpose: e.target.value })}
                      placeholder={isFr ? 'Finalité et rôle de la donnée' : 'Purpose and role of the data'}
                      className={inputClass}
                      rows={2}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={tableMetadata.nature} onChange={e => updateTableMetadata({ nature: e.target.value })} placeholder={isFr ? 'Nature géographique / tabulaire' : 'Spatial / tabular nature'} className={inputClass} />
                      <input value={tableMetadata.technicalIdentifier} onChange={e => updateTableMetadata({ technicalIdentifier: e.target.value })} placeholder={isFr ? 'Identifiant technique' : 'Technical identifier'} className={inputClass} />
                      <input value={tableMetadata.businessIdentifier} onChange={e => updateTableMetadata({ businessIdentifier: e.target.value })} placeholder={isFr ? 'Identifiant métier (à valider)' : 'Business identifier (validate)'} className={inputClass} />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={tableMetadata.transversal} onChange={e => updateTableMetadata({ transversal: e.target.checked, ...(e.target.checked ? { service: DATA_DICTIONARY_SERVICES[0] } : {}) })} className="accent-amber-600" />
                      {isFr ? 'Donnée transversale partagée, sans duplication de fiche' : 'Shared cross-service data; do not duplicate its profile'}
                    </label>
                    <div className="pt-2 border-t border-stone-800/50 space-y-2">
                      <p className="text-[11px] font-semibold text-amber-500">{isFr ? 'Dictionnaire des attributs' : 'Attribute dictionary'}</p>
                      {selectedTable.columns.map(column => {
                        const key = getColumnMetadataKey(selectedTable, column.name);
                        const meta = config.columnMetadata[key] || { description: '', unit: '', valueDomain: '', businessRule: '', relatedTable: '', relatedField: '' };
                        return (
                          <details key={column.name} className={`rounded-lg border p-2 ${isLight ? 'border-[#D4DFD3]' : 'border-stone-800'}`}>
                            <summary className="cursor-pointer text-xs font-mono">{column.name} <span className="text-stone-500">· {column.dataType}</span></summary>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <input value={meta.description} onChange={e => updateColumnMetadata(column.name, { description: e.target.value })} placeholder={isFr ? 'Description / signification' : 'Description / meaning'} className={inputClass} />
                              <input value={meta.unit} onChange={e => updateColumnMetadata(column.name, { unit: e.target.value })} placeholder={isFr ? 'Unité de mesure' : 'Measurement unit'} className={inputClass} />
                              <input value={meta.valueDomain} onChange={e => updateColumnMetadata(column.name, { valueDomain: e.target.value })} placeholder={isFr ? 'Domaine / référentiel' : 'Value domain / reference'} className={inputClass} />
                              <input value={meta.businessRule} onChange={e => updateColumnMetadata(column.name, { businessRule: e.target.value })} placeholder={isFr ? 'Règle de gestion validée' : 'Validated business rule'} className={inputClass} />
                              <input value={meta.relatedTable} onChange={e => updateColumnMetadata(column.name, { relatedTable: e.target.value })} placeholder={isFr ? 'Table de rattachement' : 'Related table'} className={inputClass} />
                              <input value={meta.relatedField} onChange={e => updateColumnMetadata(column.name, { relatedField: e.target.value })} placeholder={isFr ? 'Champ de rattachement' : 'Related field'} className={inputClass} />
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div>
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">{isFr ? 'Relations métier' : 'Business relationships'}</h4>
                  <p className="text-[11px] text-stone-500 mt-1">{isFr ? 'Renseignez aussi les liens applicatifs/ArcGIS non matérialisés par une FK SQL.' : 'Document application/ArcGIS links that are not backed by SQL foreign keys.'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={relationSource} onChange={e => { setRelationSource(e.target.value); setRelationSourceColumn(''); }} className={inputClass}>
                    <option value="">{isFr ? 'Table d’origine' : 'Source table'}</option>
                    {tables.map(table => <option key={getTableMetadataKey(table)} value={getTableMetadataKey(table)}>{getTableMetadataKey(table)}</option>)}
                  </select>
                  <select value={relationSourceColumn} onChange={e => setRelationSourceColumn(e.target.value)} className={inputClass}>
                    <option value="">{isFr ? 'Champ source' : 'Source field'}</option>
                    {(tables.find(table => getTableMetadataKey(table) === relationSource)?.columns || []).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}
                  </select>
                  <select value={relationTarget} onChange={e => { setRelationTarget(e.target.value); setRelationTargetColumn(''); }} className={inputClass}>
                    <option value="">{isFr ? 'Table de destination' : 'Target table'}</option>
                    {tables.map(table => <option key={getTableMetadataKey(table)} value={getTableMetadataKey(table)}>{getTableMetadataKey(table)}</option>)}
                  </select>
                  <select value={relationTargetColumn} onChange={e => setRelationTargetColumn(e.target.value)} className={inputClass}>
                    <option value="">{isFr ? 'Champ destination' : 'Target field'}</option>
                    {(tables.find(table => getTableMetadataKey(table) === relationTarget)?.columns || []).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}
                  </select>
                  <input value={relationNature} onChange={e => setRelationNature(e.target.value)} placeholder={isFr ? 'Nature de la relation' : 'Relationship nature'} className={inputClass} />
                  <select value={relationCardinality} onChange={e => setRelationCardinality(e.target.value)} className={inputClass}>
                    {['1:1', '1:N', 'N:1', 'N:M', '0:1', '0:N'].map(value => <option key={value}>{value}</option>)}
                  </select>
                </div>
                <button type="button" onClick={addManualRelationship} disabled={!relationSourceColumn || !relationTargetColumn} className="px-3 py-1.5 rounded-lg bg-amber-600 text-stone-950 text-xs font-bold disabled:opacity-40">
                  {isFr ? 'Ajouter la relation métier' : 'Add business relationship'}
                </button>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {relationships.map(rel => {
                    const key = getRelationshipMetadataKey(rel);
                    const meta = config.relationshipMetadata[key] || {
                      nature: rel.nature || '',
                      cardinality: rel.cardinality || '',
                      sourceCardinality: rel.sourceCardinality || '',
                      targetCardinality: rel.targetCardinality || '',
                      mandatory: rel.mandatory ?? null,
                      management: rel.management || 'application',
                    };
                    return (
                      <div key={`${key}:${rel.id}`} className={`p-2 rounded-lg border space-y-2 ${isLight ? 'border-[#D4DFD3]' : 'border-stone-800'}`}>
                        <div className="text-[10px] font-mono break-all">{rel.sourceTable}.{rel.sourceColumn} → {rel.targetTable}.{rel.targetColumn}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={meta.nature} onChange={e => updateRelationshipMetadata(rel, { nature: e.target.value })} placeholder={isFr ? 'Nature' : 'Nature'} className={inputClass} />
                          <select value={meta.cardinality} onChange={e => updateRelationshipMetadata(rel, { cardinality: e.target.value })} className={inputClass}>
                            <option value="">{isFr ? 'Cardinalité métier à valider' : 'Validate business cardinality'}</option>
                            {['1:1', '1:N', 'N:1', 'N:M', '0:1', '0:N'].map(value => <option key={value}>{value}</option>)}
                          </select>
                          <input value={meta.sourceCardinality} onChange={e => updateRelationshipMetadata(rel, { sourceCardinality: e.target.value })} placeholder={isFr ? 'Cardinalité côté origine (ex. 0..n)' : 'Source-side cardinality (e.g. 0..n)'} className={inputClass} />
                          <input value={meta.targetCardinality} onChange={e => updateRelationshipMetadata(rel, { targetCardinality: e.target.value })} placeholder={isFr ? 'Cardinalité côté destination (ex. 1..1)' : 'Target-side cardinality (e.g. 1..1)'} className={inputClass} />
                          <select value={meta.mandatory === null ? '' : String(meta.mandatory)} onChange={e => updateRelationshipMetadata(rel, { mandatory: e.target.value === '' ? null : e.target.value === 'true' })} className={inputClass}>
                            <option value="">{isFr ? 'Obligation à valider' : 'Mandatory status to validate'}</option>
                            <option value="true">{isFr ? 'Obligatoire' : 'Required'}</option>
                            <option value="false">{isFr ? 'Facultatif' : 'Optional'}</option>
                          </select>
                          <select value={meta.management} onChange={e => updateRelationshipMetadata(rel, { management: e.target.value as HtmlRelationshipMetadata['management'] })} className={inputClass}>
                            <option value="sql">Contrainte SQL</option><option value="arcgis">ArcGIS</option><option value="application">{isFr ? 'Logique applicative' : 'Application logic'}</option>
                          </select>
                        </div>
                        {rel.constraintName.startsWith('manual_') && (
                          <button type="button" onClick={() => onChange({ ...config, manualRelationships: config.manualRelationships.filter(item => item.id !== rel.id) })} className="text-[10px] text-rose-400">
                            {isFr ? 'Supprimer cette relation' : 'Remove relationship'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: HEADER & LOGOS */}
          {subTab === 'header' && (
            <>
              {/* Header Visibility & Layout */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    {isFr ? 'Structure & Disposition de l’en-tête' : 'Header Structure & Layout'}
                  </h4>
                  <label className="flex items-center space-x-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.header.showHeader}
                      onChange={e => updateHeader({ showHeader: e.target.checked })}
                      className="accent-amber-600 cursor-pointer"
                    />
                    <span>{isFr ? 'Afficher' : 'Show'}</span>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={config.showCoverPage}
                    onChange={e => onChange({ ...config, showCoverPage: e.target.checked })}
                    className="accent-amber-600"
                  />
                  {isFr ? 'Ajouter une page de garde imprimable (modèle ajustable après réception de votre exemple)' : 'Add a printable cover page (layout can be matched after you share your sample)'}
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'left' as const, icon: AlignLeft, fr: 'Aligné à gauche', en: 'Left Aligned' },
                    { key: 'center' as const, icon: AlignCenter, fr: 'Centré', en: 'Centered' },
                    { key: 'split' as const, icon: Columns, fr: '2 Logos (Officiel)', en: 'Dual Logo Split' },
                  ].map(layout => {
                    const Icon = layout.icon;
                    const active = config.header.layout === layout.key;
                    return (
                      <button
                        key={layout.key}
                        type="button"
                        onClick={() => updateHeader({ layout: layout.key })}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-[11px] font-semibold space-y-1 transition-all cursor-pointer ${
                          active
                            ? 'bg-amber-600/15 border-amber-500 text-amber-500'
                            : isLight
                            ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-600 hover:border-stone-400'
                            : 'bg-[#0C1211] border-stone-800 text-stone-400 hover:border-stone-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-center leading-tight">{isFr ? layout.fr : layout.en}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Logos Upload */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    {isFr ? 'Logos personnalisés (embarqués dans le HTML)' : 'Custom Logos (Embedded in HTML)'}
                  </h4>
                  <span className="text-[10px] font-mono text-stone-500">PNG / JPG / SVG</span>
                </div>

                {logoError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                    {logoError}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Left Logo */}
                  <div className={`p-3 rounded-lg border space-y-2 ${
                    isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
                  }`}>
                    <span className={labelClass}>{isFr ? 'Logo principal (Gauche)' : 'Primary Logo (Left)'}</span>
                    <input
                      ref={logoLeftInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={e => {
                        handleLogoFileUpload('logoLeft', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {config.header.logoLeft ? (
                      <div className="flex items-center justify-between gap-2 bg-white/95 p-2 rounded border border-stone-300">
                        <img
                          src={config.header.logoLeft}
                          alt="Logo gauche"
                          className="max-h-10 max-w-[120px] object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => updateHeader({ logoLeft: '' })}
                          className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          title={isFr ? 'Retirer le logo' : 'Remove logo'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoLeftInputRef.current?.click()}
                        className={`w-full py-3 rounded-lg border border-dashed flex flex-col items-center justify-center space-y-1 text-xs cursor-pointer transition-colors ${
                          isLight
                            ? 'border-[#C2D2C2] text-stone-600 hover:border-amber-600 hover:text-amber-700'
                            : 'border-stone-700 text-stone-400 hover:border-amber-500 hover:text-amber-400'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        <span>{isFr ? 'Importer un logo' : 'Upload Logo'}</span>
                      </button>
                    )}
                    <input
                      type="text"
                      value={config.header.logoLeft.startsWith('data:') ? '' : config.header.logoLeft}
                      onChange={e => updateHeader({ logoLeft: e.target.value })}
                      placeholder={isFr ? 'Ou coller une URL https://...' : 'Or paste https:// URL...'}
                      className={inputClass}
                    />
                  </div>

                  {/* Right Logo */}
                  <div className={`p-3 rounded-lg border space-y-2 ${
                    isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
                  }`}>
                    <span className={labelClass}>{isFr ? 'Logo secondaire (Droite)' : 'Secondary Logo (Right)'}</span>
                    <input
                      ref={logoRightInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      className="hidden"
                      onChange={e => {
                        handleLogoFileUpload('logoRight', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {config.header.logoRight ? (
                      <div className="flex items-center justify-between gap-2 bg-white/95 p-2 rounded border border-stone-300">
                        <img
                          src={config.header.logoRight}
                          alt="Logo droit"
                          className="max-h-10 max-w-[120px] object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => updateHeader({ logoRight: '' })}
                          className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          title={isFr ? 'Retirer le logo' : 'Remove logo'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoRightInputRef.current?.click()}
                        className={`w-full py-3 rounded-lg border border-dashed flex flex-col items-center justify-center space-y-1 text-xs cursor-pointer transition-colors ${
                          isLight
                            ? 'border-[#C2D2C2] text-stone-600 hover:border-amber-600 hover:text-amber-700'
                            : 'border-stone-700 text-stone-400 hover:border-amber-500 hover:text-amber-400'
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        <span>{isFr ? 'Importer un logo' : 'Upload Logo'}</span>
                      </button>
                    )}
                    <input
                      type="text"
                      value={config.header.logoRight.startsWith('data:') ? '' : config.header.logoRight}
                      onChange={e => updateHeader({ logoRight: e.target.value })}
                      placeholder={isFr ? 'Ou coller une URL https://...' : 'Or paste https:// URL...'}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Logo Height Slider */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={labelClass}>{isFr ? 'Hauteur maximale des logos' : 'Max Logo Height'}</span>
                    <span className="text-[11px] font-mono text-amber-500 font-bold">{config.header.logoHeight}px</span>
                  </div>
                  <input
                    type="range"
                    min={32}
                    max={110}
                    step={4}
                    value={config.header.logoHeight}
                    onChange={e => updateHeader({ logoHeight: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Editable Header Texts & Metadata */}
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                  {isFr ? 'Textes & Métadonnées de l’en-tête' : 'Header Text & Metadata'}
                </h4>

                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelClass}>{isFr ? 'Sur-titre / Badge' : 'Eyebrow / Brand Badge'}</label>
                      <label className="flex items-center space-x-1 text-[11px] text-stone-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.header.showBrandBadge}
                          onChange={e => updateHeader({ showBrandBadge: e.target.checked })}
                          className="accent-amber-600 cursor-pointer"
                        />
                        <span>{isFr ? 'Visible' : 'Visible'}</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={config.header.brandBadgeText}
                      onChange={e => updateHeader({ brandBadgeText: e.target.value })}
                      placeholder={isFr ? 'OmniGeo • Dictionnaire PostgreSQL' : 'OmniGeo • PostgreSQL Data Dictionary'}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{isFr ? 'Titre principal du document' : 'Document Main Title'}</label>
                    <input
                      type="text"
                      value={config.header.customTitle}
                      onChange={e => updateHeader({ customTitle: e.target.value })}
                      placeholder={databaseName}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{isFr ? 'Sous-titre / Description' : 'Subtitle / Description'}</label>
                    <textarea
                      rows={2}
                      value={config.header.customSubtitle}
                      onChange={e => updateHeader({ customSubtitle: e.target.value })}
                      placeholder={
                        isFr
                          ? 'Rapport architectural complet de la base de données relationnelle et spatiale.'
                          : 'Comprehensive architectural report of the relational and spatial database schema.'
                      }
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className={labelClass}>{isFr ? 'Organisation / Direction' : 'Organization / Department'}</label>
                      <input
                        type="text"
                        value={config.header.organization}
                        onChange={e => updateHeader({ organization: e.target.value })}
                        placeholder={isFr ? 'ex: Direction SIG' : 'e.g. GIS Department'}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{isFr ? 'Auteur / Référent' : 'Author / Maintainer'}</label>
                      <input
                        type="text"
                        value={config.header.author}
                        onChange={e => updateHeader({ author: e.target.value })}
                        placeholder={isFr ? 'ex: Pôle Géomatique' : 'e.g. Geomatics Team'}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{isFr ? 'Référence / Version' : 'Reference / Version'}</label>
                      <input
                        type="text"
                        value={config.header.documentRef}
                        onChange={e => updateHeader({ documentRef: e.target.value })}
                        placeholder="v1.0 — DOC-SIG-2026"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{isFr ? 'Date personnalisée' : 'Custom Date'}</label>
                      <input
                        type="text"
                        value={config.header.customDate}
                        onChange={e => updateHeader({ customDate: e.target.value })}
                        placeholder={isFr ? 'Auto (date du jour)' : 'Auto (current date)'}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>{isFr ? 'Pied de page (optionnel)' : 'Document Footer (Optional)'}</label>
                    <input
                      type="text"
                      value={config.header.footerText}
                      onChange={e => updateHeader({ footerText: e.target.value })}
                      placeholder={isFr ? 'ex: Document interne — Direction SIG' : 'e.g. Internal Document — GIS Department'}
                      className={inputClass}
                    />
                  </div>

                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="flex items-center space-x-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.header.showServerVersion}
                        onChange={e => updateHeader({ showServerVersion: e.target.checked })}
                        className="accent-amber-600 cursor-pointer"
                      />
                      <span>{isFr ? 'Afficher version serveur' : 'Show server version'}</span>
                    </label>
                    <label className="flex items-center space-x-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.header.showPrintButton}
                        onChange={e => updateHeader({ showPrintButton: e.target.checked })}
                        className="accent-amber-600 cursor-pointer"
                      />
                      <span>{isFr ? 'Afficher bouton Imprimer / PDF' : 'Show Print / PDF button'}</span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SUB-TAB 3: TYPOGRAPHY & STYLE */}
          {subTab === 'typography' && (
            <>
              <div className={`p-4 rounded-xl border space-y-3 ${surfaceCard}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    {isFr ? 'Police du fichier HTML' : 'HTML Document Font Family'}
                  </h4>
                  <span className="text-[10px] font-mono text-amber-500 font-bold">
                    {activeFont.label.split('(')[0].trim()}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {HTML_REPORT_FONTS.map(font => {
                    const selected = config.fontFamily === font.key;
                    return (
                      <button
                        key={font.key}
                        type="button"
                        onClick={() => onChange({ ...config, fontFamily: font.key as HtmlReportFontKey })}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          selected
                            ? 'bg-amber-600/15 border-amber-500 text-amber-500'
                            : isLight
                            ? 'bg-[#F7FAF5] border-[#D4DFD3] text-stone-800 hover:border-stone-400'
                            : 'bg-[#0C1211] border-stone-800 text-stone-200 hover:border-stone-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div
                            className="text-sm font-bold truncate"
                            style={{ fontFamily: font.cssStack }}
                          >
                            {font.label}
                          </div>
                          <div
                            className="text-[11px] text-stone-500 truncate mt-0.5"
                            style={{ fontFamily: font.cssStack }}
                          >
                            {isFr
                              ? 'Dictionnaire de données — Table parcelles_cadastrales (12 450 lignes)'
                              : 'Data Dictionary — Table cadastral_parcels (12,450 rows)'}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          {font.offlineSafe && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                              {isFr ? 'Hors-ligne' : 'Offline'}
                            </span>
                          )}
                          {selected && <Check className="w-4 h-4 text-amber-500" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Size & Monospace Behavior */}
              <div className={`p-4 rounded-xl border space-y-4 ${surfaceCard}`}>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={labelClass}>{isFr ? 'Taille de police de base' : 'Base Font Size'}</span>
                    <span className="text-xs font-mono font-bold text-amber-500">{config.baseFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={11}
                    max={17}
                    step={1}
                    value={config.baseFontSize}
                    onChange={e => onChange({ ...config, baseFontSize: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-stone-500 mt-1">
                    <span>11px ({isFr ? 'Compact' : 'Compact'})</span>
                    <span>14px ({isFr ? 'Standard' : 'Standard'})</span>
                    <span>17px ({isFr ? 'Confort' : 'Large'})</span>
                  </div>
                </div>

                <label className={`flex items-start space-x-2.5 p-2.5 rounded-lg border cursor-pointer ${
                  isLight ? 'bg-[#F7FAF5] border-[#D4DFD3]' : 'bg-[#0C1211] border-stone-800'
                }`}>
                  <input
                    type="checkbox"
                    checked={config.keepMonospaceForCode}
                    onChange={e => onChange({ ...config, keepMonospaceForCode: e.target.checked })}
                    className="mt-0.5 accent-amber-600 cursor-pointer"
                  />
                  <div className="text-xs">
                    <div className="font-semibold">
                      {isFr ? 'Police monospace pour les noms techniques / types SQL' : 'Keep monospace font for SQL identifiers & types'}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      {isFr
                        ? 'Décochez pour appliquer la police sélectionnée (ex: Times New Roman) à 100% du document.'
                        : 'Uncheck to apply the chosen font (e.g. Times New Roman) to 100% of the document.'}
                    </div>
                  </div>
                </label>

                {/* Accent Color */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={labelClass}>
                      <Palette className="w-3 h-3 inline mr-1" />
                      {isFr ? 'Couleur d’accentuation (En-tête & Titres)' : 'Accent Color (Header & Headings)'}
                    </span>
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={e => onChange({ ...config, accentColor: e.target.value })}
                      className="w-7 h-6 rounded border border-stone-700 bg-transparent cursor-pointer"
                      title={isFr ? 'Couleur personnalisée' : 'Custom color'}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCENT_PRESETS.map(p => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => onChange({ ...config, accentColor: p.hex })}
                        className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-[11px] cursor-pointer transition-all ${
                          config.accentColor.toLowerCase() === p.hex.toLowerCase()
                            ? 'border-amber-500 font-bold'
                            : isLight
                            ? 'border-[#D4DFD3] text-stone-600'
                            : 'border-stone-800 text-stone-400'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full inline-block border border-black/20"
                          style={{ backgroundColor: p.hex }}
                        />
                        <span>{isFr ? p.labelFr : p.labelEn}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Reset Defaults Bar */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleResetDefaults}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-[#C2D2C2] text-stone-700 hover:bg-stone-100'
                : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isFr ? 'Réinitialiser par défaut' : 'Reset Defaults'}</span>
          </button>

          <span className="text-[11px] font-mono text-stone-500">
            {activeProfileRubriqueCount} {isFr ? 'rubriques actives' : 'active rubriques'}
          </span>
        </div>
      </div>

      {/* RIGHT COLUMN: LIVE STANDALONE HTML PREVIEW */}
      <div className="lg:col-span-7 flex flex-col rounded-xl border overflow-hidden min-h-[580px] border-stone-700/60 bg-[#0C1211]">
        {/* Preview Top Bar */}
        <div className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${
          isLight ? 'bg-[#EBF3E8] border-[#D4DFD3] text-stone-800' : 'bg-[#14201D] border-stone-800 text-stone-200'
        }`}>
          <div className="flex items-center space-x-2 text-xs font-semibold">
            <Eye className="w-3.5 h-3.5 text-amber-500" />
            <span>{isFr ? 'Aperçu temps réel du fichier HTML généré' : 'Live Standalone HTML Preview'}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
              {activeFont.label.split('(')[0].trim()} &bull; {config.baseFontSize}px
            </span>
            <span className="text-[10px] font-mono text-stone-500">
              {(htmlPreview.length / 1024).toFixed(1)} KB
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onPrintHtml}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                isLight
                  ? 'bg-white border-[#C2D2C2] text-stone-800 hover:bg-stone-100'
                  : 'bg-stone-900 border-stone-700 text-stone-200 hover:bg-stone-800'
              }`}
            >
              <Printer className="w-3 h-3" />
              <span>{isFr ? 'Imprimer / PDF' : 'Print / PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onDownloadHtml}
              className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-[11px] cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>{isFr ? 'Télécharger .html' : 'Download .html'}</span>
            </button>
          </div>
        </div>

        {/* Live Iframe */}
        <div className="flex-1 bg-white">
          <iframe
            title={isFr ? 'Aperçu HTML du dictionnaire de données' : 'Data Dictionary HTML Preview'}
            srcDoc={htmlPreview}
            sandbox="allow-scripts allow-modals"
            className="w-full h-full min-h-[540px] border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
