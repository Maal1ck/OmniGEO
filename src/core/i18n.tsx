/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'fr';

export interface Translations {
  common: {
    langEn: string;
    langFr: string;
    loading: string;
    close: string;
    save: string;
    cancel: string;
    delete: string;
    apply: string;
    search: string;
    all: string;
    features: string;
    layers: string;
    records: string;
    valid: string;
    warning: string;
    invalid: string;
    selected: string;
    success: string;
    copied: string;
    copy: string;
    exportCsv: string;
    actions: string;
  };
  header: {
    brandSubtitle: string;
    airGapped: string;
    craftTab: string;
    workspaceTab: string;
    labTab: string;
    mapTab: string;
    monitorTab: string;
    commands: string;
    commandsKbd: string;
    toolsAndPresets: string;
    activePreset: string;
    spatialDoctor: string;
    spatialDoctorDesc: string;
    schemaHarmonizer: string;
    schemaHarmonizerDesc: string;
    qaqcAudit: string;
    qaqcAuditDesc: string;
    desktopApp: string;
    desktopAppDesc: string;
    dryRun: string;
    dryRunOn: string;
    dryRunOff: string;
    processBatch: string;
    dryCheck: string;
  };
  craft: {
    heroBadge: string;
    heroTitlePrefix: string;
    heroTitleCraft: string;
    heroTitleSuffix: string;
    heroSubtitle: string;
    targetDataset: string;
    searchPlaceholder: string;
    allCrafts: string;
    catAnalytics: string;
    catGeodesy: string;
    catPackaging: string;
    catQuality: string;
    catMap: string;
    calcHaTitle: string;
    calcHaDesc: string;
    calcHaBtn: string;
    calcHaToast: string;
    calcM2Title: string;
    calcM2Desc: string;
    calcM2Btn: string;
    calcM2Toast: string;
    aggregateTitle: string;
    aggregateDesc: string;
    aggregateBtn: string;
    reprojectWgs84Title: string;
    reprojectWgs84Desc: string;
    reprojectWgs84Btn: string;
    reprojectWgs84Toast: string;
    reprojectMercatorTitle: string;
    reprojectMercatorDesc: string;
    reprojectMercatorBtn: string;
    reprojectMercatorToast: string;
    gpkgBundleTitle: string;
    gpkgBundleDesc: string;
    gpkgBundleBtn: string;
    gpkgBundleToast: string;
    shpTitle: string;
    shpDesc: string;
    shpBtn: string;
    shpToast: string;
    doctorTitle: string;
    doctorDesc: string;
    doctorBtn: string;
    harmonizerTitle: string;
    harmonizerDesc: string;
    harmonizerBtn: string;
    certTitle: string;
    certDesc: string;
    certBtnView: string;
    certBtnRun: string;
    certToast: string;
    mapStudioTitle: string;
    mapStudioDesc: string;
    mapStudioBtn: string;
    desktopTitle: string;
    desktopDesc: string;
    desktopBtn: string;
    shortcutsTitle: string;
    shortcutsSub: string;
    scPalette: string;
    scSurface: string;
    scAgg: string;
    scLegend: string;
  };
  map: {
    hideLegend: string;
    showLegend: string;
    layerLabel: string;
    calcSurfaces: string;
    selectUnit: string;
    unitHa: string;
    unitM2: string;
    unitKm2: string;
    unitAcres: string;
    aggregateBtn: string;
    extentBtn: string;
    swipeOn: string;
    swipeBtn: string;
    basemapDark: string;
    basemapOsm: string;
    basemapSatellite: string;
    basemapGrid: string;
    legendTitle: string;
    recordCount: string;
    datumCrs: string;
    symbologyColor: string;
    fillOpacity: string;
    targetReprojection: string;
    conformalDrift: string;
    quickActions: string;
    zoomExtent: string;
    allLayers: string;
    attrTableTab: string;
    metadataTab: string;
    validationTab: string;
    exportCsv: string;
    filterRowsPlaceholder: string;
    noAttributes: string;
    sourceLeft: string;
    reprojectedRight: string;
    featureAttributes: string;
    detectedCrs: string;
    geomType: string;
    extentMin: string;
    extentMax: string;
    allPassed: string;
    mapProjectionError: string;
    mapProjectionWarning: string;
  };
  aggregation: {
    title: string;
    subtitle: string;
    groupByField: string;
    metricLabel: string;
    countFeatures: string;
    sumField: string;
    meanField: string;
    minField: string;
    maxField: string;
    numericField: string;
    summaryTitle: string;
    totalFeatures: string;
    categoryCol: string;
    countCol: string;
    pctCol: string;
    distCol: string;
    appendTitle: string;
    appendDesc: string;
    addColumnBtn: string;
    exportCsvBtn: string;
    toastAdded: string;
  };
  workspace: {
    queueTitle: string;
    filesCount: string;
    totalFeatures: string;
    totalSize: string;
    warningsCount: string;
    invalidCount: string;
    fixWarnings: string;
    loadSamples: string;
    addFiles: string;
    removeSelected: string;
    searchPlaceholder: string;
    allFormats: string;
    allStatuses: string;
    dropzoneTitle: string;
    dropzoneSubtitle: string;
    supportedFormatsBadge: string;
    uploadErrorTitle: string;
    dismissUploadError: string;
    colName: string;
    colFormat: string;
    colCrs: string;
    colFeatures: string;
    colSize: string;
    colStatus: string;
    colActions: string;
  };
  lab: {
    title: string;
    subtitle: string;
    activePipeline: string;
    section1Title: string;
    selectedFormat: string;
    section2Title: string;
    browseCrs: string;
    changeCrs: string;
    areaOfUse: string;
    units: string;
    presetsTitle: string;
    coordOperation: string;
    reprojectTitle: string;
    reprojectDesc: string;
    assignTitle: string;
    assignDesc: string;
    section3Title: string;
    namingPattern: string;
    availableTokens: string;
    collisionPolicy: string;
    collisionRename: string;
    collisionOverwrite: string;
    collisionSkip: string;
    section4Title: string;
    workerLimit: string;
    workerPoolDesc: string;
    validateGeom: string;
    validateGeomDesc: string;
    section5Title: string;
    consolidateGpkg: string;
    consolidateGpkgDesc: string;
    containerName: string;
    generateQgis: string;
    integrityWorkflows: string;
    integrityDesc: string;
    doctorBtn: string;
    harmonizerBtn: string;
  };
  monitor: {
    title: string;
    subtitle: string;
    overallProgress: string;
    statusRunning: string;
    statusIdle: string;
    cardCompleted: string;
    cardWarnings: string;
    cardFailed: string;
    cardThroughput: string;
    btnCancel: string;
    btnExportManifest: string;
    btnRetry: string;
    btnViewCert: string;
    btnDownloadBundle: string;
    queueHeader: string;
    colJobFile: string;
    colTransformation: string;
    colStage: string;
    colDuration: string;
    colStatus: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      langEn: 'EN',
      langFr: 'FR',
      loading: 'Loading...',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      apply: 'Apply',
      search: 'Search...',
      all: 'All',
      features: 'features',
      layers: 'layers',
      records: 'records',
      valid: 'Valid',
      warning: 'Warning',
      invalid: 'Invalid',
      selected: 'Selected',
      success: 'Success',
      copied: 'Copied',
      copy: 'Copy',
      exportCsv: 'Export CSV',
      actions: 'Actions',
    },
    header: {
      brandSubtitle: 'Cartographic Batch Studio',
      airGapped: 'Air-Gapped WASM',
      craftTab: 'Craft',
      workspaceTab: 'Workspace',
      labTab: 'Conversion Lab',
      mapTab: 'Map Studio',
      monitorTab: 'Monitor',
      commands: 'Commands',
      commandsKbd: '⌘K',
      toolsAndPresets: 'Tools & Presets',
      activePreset: 'Active Preset',
      spatialDoctor: 'Pre-Flight Spatial Doctor',
      spatialDoctorDesc: 'Detect inverted Lat/Lon & auto-repair geometries',
      schemaHarmonizer: 'Batch Schema Harmonizer',
      schemaHarmonizerDesc: 'Standardize disparate column names across files',
      qaqcAudit: 'QA/QC Audit Certificate',
      qaqcAuditDesc: 'View certified geodetic compliance stamp',
      desktopApp: 'Electron Desktop App',
      desktopAppDesc: 'Build the Windows installer',
      dryRun: 'Dry-Run Simulation',
      dryRunOn: 'Dry-Run On',
      dryRunOff: 'Dry-Run Off',
      processBatch: 'Process Batch',
      dryCheck: 'Dry Check',
    },
    craft: {
      heroBadge: 'OmniGeo Studio Dispatch',
      heroTitlePrefix: 'What do you want to ',
      heroTitleCraft: 'craft',
      heroTitleSuffix: ' today?',
      heroSubtitle: 'Calculate surfaces, aggregate spatial fields, reproject coordinate systems, consolidate multi-layer GeoPackages, or run pre-flight health checks in seconds.',
      targetDataset: 'Active Target Dataset:',
      searchPlaceholder: 'Search crafts, algorithms, or commands (e.g. surface, aggregate, GeoPackage, doctor)...',
      allCrafts: 'All Crafts',
      catAnalytics: 'Surface & Aggregations',
      catGeodesy: 'Datum & Reprojection',
      catPackaging: 'Multi-Layer & Formats',
      catQuality: 'QA/QC & Pre-Flight',
      catMap: 'Cartography & Legends',
      calcHaTitle: 'Calculate Surfaces in Hectares (ha)',
      calcHaDesc: 'Calculates geodesic spherical area for all polygons and seamlessly appends a new "surface_ha" column into the attribute table.',
      calcHaBtn: 'Calculate in Hectares',
      calcHaToast: 'Calculated surface area in hectares (ha)! New column added to attribute table.',
      calcM2Title: 'Calculate Surfaces in Square Meters (m²)',
      calcM2Desc: 'Calculates high-precision geodesic surface areas and creates a new "surface_m2" column for spatial cadastral appraisal.',
      calcM2Btn: 'Calculate in m²',
      calcM2Toast: 'Calculated surface area in m²! New column added to attribute table.',
      aggregateTitle: 'Aggregate Attributes by Field',
      aggregateDesc: 'Group spatial features by category/zone and compute Count, Sum, Mean, Min, or Max. Append summary stats directly as a new column.',
      aggregateBtn: 'Open Aggregation Builder',
      reprojectWgs84Title: 'Reproject to Global GPS (WGS 84 - EPSG:4326)',
      reprojectWgs84Desc: 'Converts projected national grid coordinates into unprojected latitude/longitude ellipsoidal coordinates for web & GPS consumption.',
      reprojectWgs84Btn: 'Set WGS 84 Target',
      reprojectWgs84Toast: 'Configured pipeline for WGS 84 (EPSG:4326) reprojection.',
      reprojectMercatorTitle: 'Reproject to Web Mercator (EPSG:3857)',
      reprojectMercatorDesc: 'Converts datasets into spherical mercator for seamless overlay on Mapbox, OpenStreetMap, Google Maps, and Leaflet.',
      reprojectMercatorBtn: 'Set Web Mercator Target',
      reprojectMercatorToast: 'Configured pipeline for Web Mercator (EPSG:3857).',
      gpkgBundleTitle: 'Consolidate into Single Multi-Layer GeoPackage + QGIS Project',
      gpkgBundleDesc: 'Bundles all imported vector datasets into a single OGC SQLite GeoPackage container with an auto-generated QGIS 3.x project (.qgs).',
      gpkgBundleBtn: 'Configure GPKG Bundle',
      gpkgBundleToast: 'Multi-Layer GeoPackage consolidation activated!',
      shpTitle: 'Convert Batch to ESRI Shapefile (.zip)',
      shpDesc: 'Strict 10-character DBF truncation handling, .prj WKT coordinate specification, and sidecar bundle packaging.',
      shpBtn: 'Set Shapefile Target',
      shpToast: 'Target format set to ESRI Shapefile bundle.',
      doctorTitle: 'Run Spatial Pre-Flight Doctor',
      doctorDesc: 'Audit dataset for inverted latitude/longitude bounding boxes (e.g. coordinates in Null Island or outer space) and 1-click axis swap repair.',
      doctorBtn: 'Launch Pre-Flight Doctor',
      harmonizerTitle: 'Batch Standardize Schema Across Files',
      harmonizerDesc: 'Harmonize mismatched column names across multiple datasets (e.g., mapping "ID_PARCELLE" and "p_id" into "parcel_id").',
      harmonizerBtn: 'Launch Schema Harmonizer',
      certTitle: 'Generate Certified QA/QC Compliance Certificate',
      certDesc: 'Produces a tamper-proof spatial audit certificate with SHA-256 cryptographic hashes, coordinate boundary stamps, and topological audits.',
      certBtnView: 'View Audit Certificate',
      certBtnRun: 'Run Batch to Certify',
      certToast: 'Run the batch conversion first to generate the certified audit certificate.',
      mapStudioTitle: 'Explore Cartographic Studio & Visual Legends',
      mapStudioDesc: 'Inspect live rendered features with interactive visual layer legends, layer opacity controls, swipe comparison curtains, and attribute inspection.',
      mapStudioBtn: 'Launch Map Studio',
      desktopTitle: 'Electron Desktop Installer',
      desktopDesc: 'Build the OmniGeo Windows desktop app with its bundled workbench and setup installer.',
      desktopBtn: 'View desktop build guide',
      shortcutsTitle: 'Cartographic Studio Keyboard & Command Shortcuts',
      shortcutsSub: 'OmniGeo by Maodo Core',
      scPalette: 'Open Master Command Dispatch',
      scSurface: 'Auto-appends `surface_ha` & `m²`',
      scAgg: 'Group by zone/type with count & sum',
      scLegend: 'Toggleable outside map canvas',
    },
    map: {
      hideLegend: 'Hide Legend',
      showLegend: 'Show Legend',
      layerLabel: 'Layer:',
      calcSurfaces: 'Calc Surfaces',
      selectUnit: 'Select Surface Unit:',
      unitHa: 'Hectares (ha)',
      unitM2: 'Square Meters (m²)',
      unitKm2: 'Square Kilometers',
      unitAcres: 'Acres',
      aggregateBtn: 'Aggregate',
      extentBtn: 'Extent',
      swipeOn: 'Swipe On',
      swipeBtn: 'Swipe',
      basemapDark: 'Dark',
      basemapOsm: 'OSM',
      basemapSatellite: 'Satellite',
      basemapGrid: 'Grid',
      legendTitle: 'Layer Legend & Symbology',
      recordCount: 'Record Count:',
      datumCrs: 'Datum / CRS:',
      symbologyColor: 'Layer Symbology Color:',
      fillOpacity: 'Fill Opacity:',
      targetReprojection: 'Target Reprojection',
      conformalDrift: 'Sub-millimeter conformal drift verified via PROJ 9.3 pipeline.',
      quickActions: 'Quick Analytical Actions:',
      zoomExtent: 'Zoom to Extent',
      allLayers: 'All Workspace Layers',
      attrTableTab: 'Attribute Table',
      metadataTab: 'Layer Metadata & Bounds',
      validationTab: 'Validation Audit',
      exportCsv: 'Export CSV',
      filterRowsPlaceholder: 'Filter rows...',
      noAttributes: 'No attribute fields in current dataset.',
      sourceLeft: 'SOURCE',
      reprojectedRight: 'REPROJECTED',
      featureAttributes: 'Feature Attributes',
      detectedCrs: 'Detected CRS',
      geomType: 'Geometry Type',
      extentMin: 'Spatial Extent [MinX, MinY]',
      extentMax: 'Spatial Extent [MaxX, MaxY]',
      allPassed: 'All geometry validity and CRS boundary checks passed successfully. Zero topological kinks detected.',
      mapProjectionError: 'The layer could not be transformed to map coordinates:',
      mapProjectionWarning: 'Map display uses an approximate datum transformation because a required grid file is unavailable.',
    },
    aggregation: {
      title: 'Field Aggregation & Attribute Intelligence',
      subtitle: 'Group spatial features by categorical fields, compute statistics, and append as a new column.',
      groupByField: 'Group By Field:',
      metricLabel: 'Aggregation Metric:',
      countFeatures: 'Count Features',
      sumField: 'Sum of Field',
      meanField: 'Average (Mean)',
      minField: 'Minimum Value',
      maxField: 'Maximum Value',
      numericField: 'Numeric Value Field:',
      summaryTitle: 'Aggregation Summary',
      totalFeatures: 'Total Features:',
      categoryCol: 'Category',
      countCol: 'Feature Count',
      pctCol: '% of Total',
      distCol: 'Distribution',
      appendTitle: 'Append as New Column to All Features',
      appendDesc: 'Every feature in this dataset will receive this new column populated with its group\'s aggregated value.',
      addColumnBtn: 'Add Column',
      exportCsvBtn: 'Export CSV',
      toastAdded: 'Successfully added column to dataset!',
    },
    workspace: {
      queueTitle: 'Geospatial Queue',
      filesCount: 'files',
      totalFeatures: 'features',
      totalSize: 'total',
      warningsCount: 'warnings',
      invalidCount: 'invalid',
      fixWarnings: 'Fix Warnings',
      loadSamples: 'Load Sample GIS Datasets',
      addFiles: 'Add Files',
      removeSelected: 'Remove Selected',
      searchPlaceholder: 'Search datasets by name or CRS...',
      allFormats: 'All Formats',
      allStatuses: 'All Statuses',
      dropzoneTitle: 'Drag & Drop GIS Vector Files Here',
      dropzoneSubtitle: 'Supports GeoJSON, ESRI Shapefile (.shp/.zip), OGC GeoPackage (.gpkg), KML/KMZ, and CSV with Lon/Lat coordinates.',
      supportedFormatsBadge: 'AIR-GAPPED VECTOR INGESTION',
      uploadErrorTitle: 'Some files could not be imported',
      dismissUploadError: 'Dismiss',
      colName: 'Dataset Name',
      colFormat: 'Format',
      colCrs: 'Detected CRS',
      colFeatures: 'Features',
      colSize: 'Size',
      colStatus: 'Status',
      colActions: 'Actions',
    },
    lab: {
      title: 'Conversion Lab & Geodetic Parameters',
      subtitle: 'Target format encoding, PROJ datum transformation parameters, layer schema policies, and delivery handoffs',
      activePipeline: 'Active Pipeline:',
      section1Title: 'Target Output Format',
      selectedFormat: 'Selected:',
      section2Title: 'Geodetic Datum & Coordinate Reference System (CRS)',
      browseCrs: 'Browse 6,900+ EPSG Systems...',
      changeCrs: 'Change Target CRS',
      areaOfUse: 'Area of Use:',
      units: 'Units:',
      presetsTitle: 'Standard EPSG Presets:',
      coordOperation: 'Coordinate Operation Mode',
      reprojectTitle: 'Reproject Coordinates (Rigorous PROJ Math)',
      reprojectDesc: 'Transforms geometry coordinates using mathematical PROJ equations (e.g. degrees to projected meters). Preserves exact geospatial location on Earth.',
      assignTitle: 'Assign CRS Only (Header Override)',
      assignDesc: 'Only tags metadata without modifying coordinate numbers. Use ONLY when the dataset already contains coordinates for the target CRS but was missing its .prj header.',
      section3Title: 'Output Naming & Collision Policy',
      namingPattern: 'Filename Pattern:',
      availableTokens: 'Available tokens:',
      collisionPolicy: 'Collision Policy:',
      collisionRename: 'Auto-increment filename (e.g. parcels_1.gpkg)',
      collisionOverwrite: 'Overwrite existing target files',
      collisionSkip: 'Skip file if destination exists',
      section4Title: 'Processing Engine & Thread Pool',
      workerLimit: 'Concurrent Worker Limit:',
      workerPoolDesc: 'Non-blocking worker pool preventing browser UI thread locking during massive multi-layer conversion batches.',
      validateGeom: 'Enforce Strict Geometry Audit before Export',
      validateGeomDesc: 'Checks for unclosed polygon rings, NaN coordinates, self-intersections, and boundary violations.',
      section5Title: 'Multi-Layer GeoPackage Consolidator & GIS Handoff Bundler',
      consolidateGpkg: 'Consolidate Batch into Single Multi-Layer GeoPackage (.gpkg)',
      consolidateGpkgDesc: 'Merges all input datasets into individual feature tables inside one single OGC GeoPackage container instead of exporting loose files.',
      containerName: 'Unified Container Filename:',
      generateQgis: 'Generate QGIS 3.x Project File (.qgs) with automated symbology',
      integrityWorkflows: 'Groundbreaking Integrity Workflows',
      integrityDesc: 'Pre-flight check datasets for inverted Lat/Lon coordinates, or harmonize disparate field names across files before export.',
      doctorBtn: 'Pre-Flight Doctor',
      harmonizerBtn: 'Harmonizer',
    },
    monitor: {
      title: 'Real-Time Batch Execution & Worker Monitor',
      subtitle: 'Air-gapped WASM conversion pipeline, thread status, and throughput telemetrics',
      overallProgress: 'Overall Batch Progress',
      statusRunning: 'PROCESSING ACTIVE',
      statusIdle: 'READY / IDLE',
      cardCompleted: 'Completed Datasets',
      cardWarnings: 'Completed w/ Warnings',
      cardFailed: 'Failed Jobs',
      cardThroughput: 'Throughput',
      btnCancel: 'Cancel Execution',
      btnExportManifest: 'Export Manifest (JSON)',
      btnRetry: 'Retry Failed Jobs',
      btnViewCert: 'View Audit Certificate',
      btnDownloadBundle: 'Download Consolidated GPKG + QGIS (.zip)',
      queueHeader: 'Job Execution Pipeline',
      colJobFile: 'Input Dataset',
      colTransformation: 'Transformation',
      colStage: 'Stage / Progress',
      colDuration: 'Duration',
      colStatus: 'Status',
    },
  },
  fr: {
    common: {
      langEn: 'EN',
      langFr: 'FR',
      loading: 'Chargement...',
      close: 'Fermer',
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      apply: 'Appliquer',
      search: 'Rechercher...',
      all: 'Tous',
      features: 'entités',
      layers: 'couches',
      records: 'enregistrements',
      valid: 'Valide',
      warning: 'Avertissement',
      invalid: 'Invalide',
      selected: 'Sélectionné',
      success: 'Succès',
      copied: 'Copié',
      copy: 'Copier',
      exportCsv: 'Exporter en CSV',
      actions: 'Actions',
    },
    header: {
      brandSubtitle: 'Atelier Cartographique & Traitement Spatial',
      airGapped: 'WASM Local Isolé',
      craftTab: 'Atelier',
      workspaceTab: 'Espace de travail',
      labTab: 'Labo de conversion',
      mapTab: 'Studio carto',
      monitorTab: 'Supervision',
      commands: 'Commandes',
      commandsKbd: '⌘K',
      toolsAndPresets: 'Outils & Profils',
      activePreset: 'Profil actif',
      spatialDoctor: 'Docteur Spatial Pré-vol',
      spatialDoctorDesc: 'Détection d\'inversion Lat/Lon & auto-réparation',
      schemaHarmonizer: 'Harmoniseur de Schéma',
      schemaHarmonizerDesc: 'Normalisation des colonnes hétérogènes entre fichiers',
      qaqcAudit: 'Certificat d\'Audit QA/QC',
      qaqcAuditDesc: 'Consulter le tampon de conformité géodésique scellé',
      desktopApp: 'Application Electron',
      desktopAppDesc: 'Créer l’installeur Windows',
      dryRun: 'Simulation à blanc',
      dryRunOn: 'Simulation ON',
      dryRunOff: 'Simulation OFF',
      processBatch: 'Lancer le traitement',
      dryCheck: 'Vérification à blanc',
    },
    craft: {
      heroBadge: 'Régie OmniGeo Studio',
      heroTitlePrefix: 'Que souhaitez-vous ',
      heroTitleCraft: 'façonner',
      heroTitleSuffix: ' aujourd\'hui ?',
      heroSubtitle: 'Calculez des surfaces géodésiques, agrégez des attributs par zone, reprojetez des systèmes géodésiques ou consolidez vos GeoPackages multi-couches en quelques secondes.',
      targetDataset: 'Jeu de données ciblé :',
      searchPlaceholder: 'Rechercher un algorithme, une commande ou un outil (surface, agréger, GeoPackage, docteur)...',
      allCrafts: 'Tous les outils',
      catAnalytics: 'Surfaces & Agrégations',
      catGeodesy: 'Systèmes & Reprojection',
      catPackaging: 'Multi-Couches & Formats',
      catQuality: 'Qualité & Contrôle Pré-vol',
      catMap: 'Cartographie & Légendes',
      calcHaTitle: 'Calculer les surfaces en hectares (ha)',
      calcHaDesc: 'Calcule la surface géodésique sphérique pour tous les polygones et ajoute automatiquement la colonne "surface_ha" à la table.',
      calcHaBtn: 'Calculer en hectares',
      calcHaToast: 'Surfaces calculées en hectares (ha) ! Nouvelle colonne injectée.',
      calcM2Title: 'Calculer les surfaces en mètres carrés (m²)',
      calcM2Desc: 'Calcul géodésique haute précision des aires avec création immédiate de la colonne "surface_m2" pour expertise cadastrale.',
      calcM2Btn: 'Calculer en m²',
      calcM2Toast: 'Surfaces calculées en m² ! Nouvelle colonne injectée.',
      aggregateTitle: 'Agréger les attributs par champ',
      aggregateDesc: 'Regroupez les entités par catégorie/zone et calculez Nombre, Somme, Moyenne, Min ou Max. Ajoutez les statistiques en nouvelle colonne.',
      aggregateBtn: 'Ouvrir l\'agrégateur',
      reprojectWgs84Title: 'Reprojeter en GPS Mondial (WGS 84 - EPSG:4326)',
      reprojectWgs84Desc: 'Convertit les coordonnées projetées planes en coordonnées géographiques ellipsoïdales latitude/longitude pour le web et les récepteurs GPS.',
      reprojectWgs84Btn: 'Définir WGS 84 comme cible',
      reprojectWgs84Toast: 'Pipeline configuré pour la reprojection WGS 84 (EPSG:4326).',
      reprojectMercatorTitle: 'Reprojeter en Web Mercator (EPSG:3857)',
      reprojectMercatorDesc: 'Reprojection sphérique pour superposition fluide sur fonds de plan Mapbox, OpenStreetMap, Google Maps et Leaflet.',
      reprojectMercatorBtn: 'Définir Web Mercator comme cible',
      reprojectMercatorToast: 'Pipeline configuré pour Web Mercator (EPSG:3857).',
      gpkgBundleTitle: 'Consolider en un GeoPackage Multi-Couches + Projet QGIS',
      gpkgBundleDesc: 'Rassemble tous les vecteurs du lot dans un conteneur OGC SQLite GeoPackage unique avec projet QGIS 3.x prêt à l\'emploi (.qgs).',
      gpkgBundleBtn: 'Configurer le lot GPKG',
      gpkgBundleToast: 'Consolidation multi-couches GeoPackage activée !',
      shpTitle: 'Convertir le lot en ESRI Shapefile (.zip)',
      shpDesc: 'Gestion stricte de la troncature DBF à 10 caractères, définition des coordonnées WKT dans le .prj et archive zip complète.',
      shpBtn: 'Définir Shapefile comme cible',
      shpToast: 'Format cible défini sur ESRI Shapefile.',
      doctorTitle: 'Lancer le Docteur Spatial Pré-vol',
      doctorDesc: 'Audit des boîtes englobantes inversées (lat/lon interverties, coordonnées Null Island) et inversion des axes en 1 clic.',
      doctorBtn: 'Ouvrir le Docteur Pré-vol',
      harmonizerTitle: 'Harmoniser le schéma entre fichiers',
      harmonizerDesc: 'Normalisez les intitulés de colonnes disparates entre sous-traitants (ex. unifier "ID_PARCELLE" et "p_id" en "parcel_id").',
      harmonizerBtn: 'Ouvrir l\'Harmoniseur',
      certTitle: 'Générer le Certificat d\'Audit QA/QC',
      certDesc: 'Édite un certificat d\'audit spatial infalsifiable avec empreintes cryptographiques SHA-256, tolérances géodésiques et intégrité topologique.',
      certBtnView: 'Voir le certificat d\'audit',
      certBtnRun: 'Exécuter le lot pour certifier',
      certToast: 'Exécutez d\'abord le lot de conversion pour générer le certificat d\'audit certifié.',
      mapStudioTitle: 'Studio Cartographique & Légendes Dynamiques',
      mapStudioDesc: 'Visualisez vos entités avec légendes interactives, gestion de l\'opacité, rideau comparatif avant/après et inspection tabulaire.',
      mapStudioBtn: 'Ouvrir le Studio Carto',
      desktopTitle: 'Installeur de bureau Electron',
      desktopDesc: 'Générez l’application OmniGeo Windows avec son interface intégrée et son installeur.',
      desktopBtn: 'Voir le guide de compilation',
      shortcutsTitle: 'Raccourcis Clavier & Ligne de Commande',
      shortcutsSub: 'Moteur OmniGeo par Maodo',
      scPalette: 'Palette de commandes globale',
      scSurface: 'Injection auto de `surface_ha` & `m²`',
      scAgg: 'Regroupement par zone avec total/somme',
      scLegend: 'Volet légende extérieur au canevas',
    },
    map: {
      hideLegend: 'Masquer la légende',
      showLegend: 'Afficher la légende',
      layerLabel: 'Couche :',
      calcSurfaces: 'Calculer surfaces',
      selectUnit: 'Choisir l\'unité de surface :',
      unitHa: 'Hectares (ha)',
      unitM2: 'Mètres carrés (m²)',
      unitKm2: 'Kilomètres carrés',
      unitAcres: 'Acres',
      aggregateBtn: 'Agréger',
      extentBtn: 'Emprise',
      swipeOn: 'Rideau actif',
      swipeBtn: 'Rideau',
      basemapDark: 'Sombre',
      basemapOsm: 'OSM',
      basemapSatellite: 'Satellite',
      basemapGrid: 'Grille',
      legendTitle: 'Légende & Symbologie de la couche',
      recordCount: 'Nombre d\'entités :',
      datumCrs: 'Système / SCR :',
      symbologyColor: 'Couleur de symbologie :',
      fillOpacity: 'Opacité de remplissage :',
      targetReprojection: 'Reprojection cible',
      conformalDrift: 'Dérive conforme sub-millimétrique validée par PROJ 9.3.',
      quickActions: 'Actions analytiques rapides :',
      zoomExtent: 'Zoomer sur l\'emprise',
      allLayers: 'Toutes les couches du lot',
      attrTableTab: 'Table attributaire',
      metadataTab: 'Métadonnées & Emprise',
      validationTab: 'Audit de validation',
      exportCsv: 'Exporter en CSV',
      filterRowsPlaceholder: 'Filtrer les lignes...',
      noAttributes: 'Aucun champ attributaire dans ce jeu de données.',
      sourceLeft: 'SOURCE',
      reprojectedRight: 'REPROJETÉ',
      featureAttributes: 'Attributs de l\'entité',
      detectedCrs: 'SCR Détecté',
      geomType: 'Type géométrique',
      extentMin: 'Emprise spatiale [MinX, MinY]',
      extentMax: 'Emprise spatiale [MaxX, MaxY]',
      allPassed: 'Tous les tests de conformité géométrique et de limites SCR sont validés. Aucun nœud topologique invalide.',
      mapProjectionError: 'La couche ne peut pas être transformée pour son affichage sur la carte :',
      mapProjectionWarning: 'L’affichage utilise une transformation de datum approximative car un fichier de grille requis est indisponible.',
    },
    aggregation: {
      title: 'Agrégation Attributaire & Intelligence Spatiale',
      subtitle: 'Regroupez les entités géospatiales par champ qualitatif, calculez des métriques et injectez-les en nouvelle colonne.',
      groupByField: 'Champ de regroupement :',
      metricLabel: 'Métrique d\'agrégation :',
      countFeatures: 'Nombre d\'entités (Count)',
      sumField: 'Somme du champ (Sum)',
      meanField: 'Moyenne (Mean)',
      minField: 'Valeur minimale (Min)',
      maxField: 'Valeur maximale (Max)',
      numericField: 'Champ numérique calculé :',
      summaryTitle: 'Synthèse de l\'agrégation',
      totalFeatures: 'Total des entités :',
      categoryCol: 'Catégorie',
      countCol: 'Nombre',
      pctCol: '% du total',
      distCol: 'Répartition',
      appendTitle: 'Injecter comme nouvelle colonne à toutes les entités',
      appendDesc: 'Chaque entité de ce jeu de données recevra cette nouvelle colonne avec la valeur calculée de son groupe.',
      addColumnBtn: 'Ajouter la colonne',
      exportCsvBtn: 'Exporter en CSV',
      toastAdded: 'Nouvelle colonne injectée avec succès !',
    },
    workspace: {
      queueTitle: 'File Géospatiale',
      filesCount: 'fichiers',
      totalFeatures: 'entités',
      totalSize: 'au total',
      warningsCount: 'alertes',
      invalidCount: 'invalides',
      fixWarnings: 'Corriger alertes',
      loadSamples: 'Charger exemples SIG',
      addFiles: 'Ajouter fichiers',
      removeSelected: 'Supprimer sélection',
      searchPlaceholder: 'Rechercher par nom ou système SCR...',
      allFormats: 'Tous les formats',
      allStatuses: 'Tous les statuts',
      dropzoneTitle: 'Glissez-déposez vos fichiers vectoriels SIG ici',
      dropzoneSubtitle: 'Prise en charge de GeoJSON, ESRI Shapefile (.shp/.zip), GeoPackage OGC (.gpkg), KML/KMZ et CSV avec colonnes Lon/Lat.',
      supportedFormatsBadge: 'INGESTION VECTORIELLE ISOLÉE',
      uploadErrorTitle: 'Certains fichiers n’ont pas pu être importés',
      dismissUploadError: 'Fermer',
      colName: 'Nom du jeu de données',
      colFormat: 'Format',
      colCrs: 'SCR Détecté',
      colFeatures: 'Entités',
      colSize: 'Taille',
      colStatus: 'Statut',
      colActions: 'Actions',
    },
    lab: {
      title: 'Laboratoire de Conversion & Paramètres Géodésiques',
      subtitle: 'Encodage cible, transformation de datum PROJ, politiques de schéma et préparation des livrables',
      activePipeline: 'Pipeline Actif :',
      section1Title: 'Format de Sortie Cible',
      selectedFormat: 'Sélectionné :',
      section2Title: 'Système de Coordonnées de Référence (SCR) & Datum',
      browseCrs: 'Parcourir plus de 6 900 codes EPSG...',
      changeCrs: 'Modifier le SCR cible',
      areaOfUse: 'Zone d\'application :',
      units: 'Unités :',
      presetsTitle: 'Préréglages EPSG standards :',
      coordOperation: 'Mode d\'opération sur les coordonnées',
      reprojectTitle: 'Reprojection rigoureuse (Formules PROJ)',
      reprojectDesc: 'Calcule la position géographique exacte par formules géodésiques PROJ (ex. degrés vers mètres projetés). Préserve l\'emplacement réel sur Terre.',
      assignTitle: 'Assignation simple de métadonnées (Remplacement)',
      assignDesc: 'Modifie uniquement l\'en-tête SCR sans changer la valeur des coordonnées. À utiliser uniquement si le fichier était déjà dans le SCR visé.',
      section3Title: 'Nommage des fichiers & Gestion des collisions',
      namingPattern: 'Modèle de nom de fichier :',
      availableTokens: 'Variables disponibles :',
      collisionPolicy: 'Politique de collision :',
      collisionRename: 'Incrémenter automatiquement le nom (ex. parcelles_1.gpkg)',
      collisionOverwrite: 'Écraser les fichiers cibles existants',
      collisionSkip: 'Ignorer si le fichier de destination existe déjà',
      section4Title: 'Moteur de Traitement & Pool de Threads',
      workerLimit: 'Nombre maximal de workers concurrents :',
      workerPoolDesc: 'Pool de threads évitant tout gel de l\'interface utilisateur pendant les conversions massives multi-couches.',
      validateGeom: 'Exiger un audit topologique strict avant export',
      validateGeomDesc: 'Détecte les anneaux non fermés, coordonnées NaN, auto-intersections et sorties de bornes.',
      section5Title: 'Consolidateur GeoPackage Multi-Couches & Projet QGIS',
      consolidateGpkg: 'Fusionner le lot dans un unique GeoPackage multi-couches (.gpkg)',
      consolidateGpkgDesc: 'Rassemble toutes les couches dans des tables distinctes au sein d\'un unique fichier SQLite OGC au lieu d\'exporter des fichiers isolés.',
      containerName: 'Nom du conteneur unifié :',
      generateQgis: 'Générer le fichier projet QGIS 3.x (.qgs) avec symbologie prête',
      integrityWorkflows: 'Contrôles d\'Intégrité Avancés',
      integrityDesc: 'Vérifiez les inversions de latitude/longitude ou harmonisez les champs de colonnes entre plusieurs fichiers avant export.',
      doctorBtn: 'Docteur Pré-vol',
      harmonizerBtn: 'Harmoniseur',
    },
    monitor: {
      title: 'Exécution en Temps Réel & Supervision des Tâches',
      subtitle: 'Pipeline de conversion WASM isolé, état des threads et métriques de débit',
      overallProgress: 'Progression globale du lot',
      statusRunning: 'TRAITEMENT EN COURS',
      statusIdle: 'EN ATTENTE / PRÊT',
      cardCompleted: 'Lots terminés',
      cardWarnings: 'Terminés avec alertes',
      cardFailed: 'Échecs',
      cardThroughput: 'Débit',
      btnCancel: 'Annuler l\'exécution',
      btnExportManifest: 'Exporter le manifeste (JSON)',
      btnRetry: 'Relancer les échecs',
      btnViewCert: 'Consulter le certificat d\'audit',
      btnDownloadBundle: 'Télécharger le bundle GPKG + QGIS (.zip)',
      queueHeader: 'File d\'Exécution des Tâches',
      colJobFile: 'Fichier source',
      colTransformation: 'Transformation',
      colStage: 'Étape / Progression',
      colDuration: 'Durée',
      colStatus: 'Statut',
    },
  },
};

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: translations.en,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('omnigeo_lang') as Language;
      if (saved === 'en' || saved === 'fr') return saved;
      // Default to browser language if starts with fr
      if (navigator.language && navigator.language.startsWith('fr')) return 'fr';
    } catch {
      // ignore
    }
    return 'en';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('omnigeo_lang', newLang);
    } catch {
      // ignore
    }
  };

  const t = translations[lang] || translations.en;

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
