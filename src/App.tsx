import React, { useState, useEffect, useRef } from 'react';
import { 
  BatchManifest, 
  BatchSettings, 
  ConsolidationSettings, 
  ConversionJob, 
  PresetProfile, 
  QAQCReportData, 
  SchemaHarmonizerConfig, 
  SpatialDataset 
} from './types/gis';
import { executeConversionJob, generateBatchManifest, resolveOutputFileName } from './core/conversionEngine';
import { PRESET_PROFILES } from './core/presets';
import { Header, NavTab } from './components/Header';
import { CraftStudio } from './components/CraftStudio';
import { BatchWorkspace } from './components/BatchWorkspace';
import { ConversionLab } from './components/ConversionLab';
import { MapPreview } from './components/MapPreview';
import { JobMonitor } from './components/JobMonitor';
import { ShowcaseWebsite } from './components/ShowcaseWebsite';
import { CommandPalette } from './components/CommandPalette';
import { PythonCoreModal } from './components/PythonCoreModal';
import { CRSModal } from './components/CRSModal';
import { SpatialDoctorModal } from './components/SpatialDoctorModal';
import { SchemaHarmonizerModal } from './components/SchemaHarmonizerModal';
import { AuditCertificateModal } from './components/AuditCertificateModal';
import { AggregationModal } from './components/AggregationModal';
import { generateAutoHarmonizerRules, applySchemaHarmonization } from './core/schemaHarmonizer';
import { createMultiLayerGeoPackage, generateQgisProjectXml, bundleConsolidatedHandoff } from './core/multiLayerGpkg';
import { generateQAQCReportData } from './core/auditCertificate';
import { appendSurfaceColumnToDataset, SurfaceUnit } from './core/spatialAnalytics';
import { useTheme } from './core/theme';

export default function App() {
  const { theme } = useTheme();
  // Work queue starts clean for user imports
  const [datasets, setDatasets] = useState<SpatialDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('craft');

  // Conversion settings
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset-gpkg-standard');
  const [settings, setSettings] = useState<BatchSettings>({
    targetFormat: 'geopackage',
    targetCRS: 'EPSG:4326',
    crsMode: 'reproject',
    namingPattern: '{name}_{crs}',
    collisionPolicy: 'rename',
    maxConcurrentWorkers: 4,
    isDryRun: false,
    layerNameTemplate: '{name}',
    validateGeometries: true,
  });

  // Advanced Groundbreaking Feature States
  const [consolidationSettings, setConsolidationSettings] = useState<ConsolidationSettings>({
    consolidateToSingleGeoPackage: false,
    packageFileName: 'consolidated_delivery.gpkg',
    generateQgisProject: true,
  });

  const [harmonizerConfig, setHarmonizerConfig] = useState<SchemaHarmonizerConfig>(() => ({
    enabled: false,
    casingMode: 'none',
    rules: [],
  }));

  const [qaqcReport, setQaqcReport] = useState<QAQCReportData | null>(null);
  const [consolidatedHandoffBlob, setConsolidatedHandoffBlob] = useState<Blob | null>(null);

  // Batch execution & jobs
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [manifest, setManifest] = useState<BatchManifest | null>(null);
  const cancelRequestedRef = useRef<boolean>(false);

  // Modals
  const [isCRSModalOpen, setIsCRSModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPythonModalOpen, setIsPythonModalOpen] = useState(false);
  const [isDoctorOpen, setIsDoctorOpen] = useState(false);
  const [isHarmonizerOpen, setIsHarmonizerOpen] = useState(false);
  const [isCertificateOpen, setIsCertificateOpen] = useState(false);
  const [isAggregationModalOpen, setIsAggregationModalOpen] = useState(false);

  // Surface calculation handler - appends new column to dataset
  const handleCalculateSurfaces = (unit: SurfaceUnit = 'ha') => {
    const target = datasets.find(d => d.id === selectedDatasetId) || datasets[0];
    if (!target) return;
    const { updatedDataset } = appendSurfaceColumnToDataset(target, unit);
    setDatasets(prev => prev.map(d => d.id === updatedDataset.id ? updatedDataset : d));
  };

  // Synchronize preset selection
  const handleSelectPreset = (preset: PresetProfile) => {
    setSelectedPresetId(preset.id);
    setSettings(prev => ({
      ...prev,
      targetFormat: preset.targetFormat,
      targetCRS: preset.targetCRS,
      crsMode: preset.crsMode,
      namingPattern: preset.namingPattern,
    }));
  };

  // Switch to Map Preview
  const handlePreviewOnMap = (dataset: SpatialDataset) => {
    setSelectedDatasetId(dataset.id);
    setActiveTab('map');
  };

  // Update a single dataset from Pre-Flight Doctor
  const handleUpdateDataset = (updated: SpatialDataset) => {
    setDatasets(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  // Build jobs from datasets
  const initializeJobsFromQueue = (): ConversionJob[] => {
    return datasets.map((d) => {
      const outputFileName = resolveOutputFileName(
        d.name,
        settings.targetFormat,
        settings.targetCRS,
        settings.namingPattern
      );

      return {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        datasetId: d.id,
        inputDatasetName: d.originalFileName,
        inputFormat: d.format,
        sourceCRS: d.detectedCRS?.code || 'EPSG:4326',
        targetFormat: settings.targetFormat,
        targetCRS: settings.targetCRS,
        crsMode: settings.crsMode,
        outputFileName,
        layerName: d.name,
        status: 'queued',
        progressPercent: 0,
        stage: 'Queued',
        featuresProcessed: 0,
        logs: [],
      };
    });
  };

  // Run Batch Processing
  const handleStartBatch = async () => {
    if (datasets.length === 0 || isProcessing) return;

    cancelRequestedRef.current = false;
    const initialJobs = initializeJobsFromQueue();
    setJobs(initialJobs);
    setIsProcessing(true);
    setActiveTab('monitor');

    const startTime = Date.now();
    const updatedJobs = [...initialJobs];

    // Worker queue with concurrency limit
    const queue = [...updatedJobs];
    const maxWorkers = Math.min(settings.maxConcurrentWorkers, queue.length);

    const worker = async () => {
      while (queue.length > 0) {
        if (cancelRequestedRef.current) break;
        const job = queue.shift();
        if (!job) break;

        const dataset = datasets.find(d => d.id === job.datasetId);
        if (!dataset) continue;

        // Apply Schema Harmonization if enabled
        let workingDataset = dataset;
        if (harmonizerConfig.enabled) {
          const harmonizedGeojson = applySchemaHarmonization(dataset.geojson, dataset.id, harmonizerConfig);
          workingDataset = {
            ...dataset,
            geojson: harmonizedGeojson,
          };
        }

        // Mark as running
        job.status = 'running';
        job.stage = 'Initializing';
        setJobs([...updatedJobs]);

        const completedJob = await executeConversionJob(
          job,
          workingDataset,
          settings,
          (pct, stage) => {
            job.progressPercent = pct;
            job.stage = stage;
            setJobs([...updatedJobs]);
          }
        );

        // Update in list
        const idx = updatedJobs.findIndex(j => j.id === job.id);
        if (idx !== -1) {
          updatedJobs[idx] = completedJob;
          setJobs([...updatedJobs]);
        }
      }
    };

    // Run pool
    const workers = Array.from({ length: maxWorkers }, () => worker());
    await Promise.all(workers);

    setIsProcessing(false);
    const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const batchManifest = generateBatchManifest(updatedJobs, durationSec);
    setManifest(batchManifest);

    // Generate Certified QA/QC Audit Certificate
    const report = await generateQAQCReportData(updatedJobs, datasets, durationSec);
    setQaqcReport(report);

    // Feature 3: Multi-Layer GeoPackage Consolidation & QGIS Handoff
    if (consolidationSettings.consolidateToSingleGeoPackage) {
      try {
        const layers = updatedJobs
          .filter(j => j.outputGeojson)
          .map(j => ({
            name: j.layerName,
            geojson: j.outputGeojson,
          }));

        if (layers.length > 0) {
          const multiGpkgBlob = await createMultiLayerGeoPackage(layers, settings.targetCRS);
          const layerNames = layers.map(l => l.name);
          const qgsXml = generateQgisProjectXml(consolidationSettings.packageFileName, layerNames, settings.targetCRS);
          const bundleZip = await bundleConsolidatedHandoff(
            multiGpkgBlob,
            consolidationSettings.packageFileName,
            qgsXml,
            'OmniGeo_Project'
          );
          setConsolidatedHandoffBlob(bundleZip);
        }
      } catch (err) {
        console.warn('Consolidation bundle error:', err);
      }
    }
  };

  // Download Consolidated GeoPackage + QGIS project bundle
  const handleDownloadConsolidatedHandoff = () => {
    if (!consolidatedHandoffBlob) return;
    const url = URL.createObjectURL(consolidatedHandoffBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OmniGeo_Consolidated_Handoff_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Cancel Batch
  const handleCancelBatch = () => {
    cancelRequestedRef.current = true;
    setJobs(prev => prev.map(j => j.status === 'running' || j.status === 'queued' ? { ...j, status: 'cancelled', stage: 'Cancelled by user' } : j));
    setIsProcessing(false);
  };

  // Retry Failed
  const handleRetryFailed = async () => {
    const failedJobs = jobs.filter(j => j.status === 'failed');
    if (!failedJobs.length) return;

    setIsProcessing(true);
    const updatedJobs = [...jobs];

    for (const job of failedJobs) {
      const dataset = datasets.find(d => d.id === job.datasetId);
      if (!dataset) continue;

      job.status = 'running';
      job.logs = [];
      setJobs([...updatedJobs]);

      const res = await executeConversionJob(job, dataset, settings);
      const idx = updatedJobs.findIndex(j => j.id === job.id);
      if (idx !== -1) updatedJobs[idx] = res;
      setJobs([...updatedJobs]);
    }

    setIsProcessing(false);
  };

  // Export Manifest
  const handleExportManifest = (format: 'json' | 'csv') => {
    if (!manifest) return;

    let content = '';
    let mime = '';
    let filename = '';

    if (format === 'json') {
      content = JSON.stringify(manifest, null, 2);
      mime = 'application/json';
      filename = `batch_manifest_${Date.now()}.json`;
    } else {
      const headers = ['jobId', 'sourceFile', 'sourceFormat', 'sourceCRS', 'targetFormat', 'targetCRS', 'targetFile', 'status', 'featureCount', 'durationMs', 'warnings', 'errors'];
      const rows = manifest.jobs.map(j => [
        j.jobId,
        `"${j.sourceFile}"`,
        j.sourceFormat,
        j.sourceCRS,
        j.targetFormat,
        j.targetCRS,
        `"${j.targetFile}"`,
        j.status,
        j.featureCount,
        j.durationMs,
        `"${j.warnings.join('; ')}"`,
        `"${j.errors.join('; ')}"`,
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      mime = 'text/csv';
      filename = `batch_manifest_${Date.now()}.csv`;
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedDataset = datasets.find(d => d.id === selectedDatasetId) || datasets[0] || null;
  const processedJobForPreview = jobs.find(j => j.datasetId === selectedDataset?.id && j.outputGeojson) || null;

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans antialiased transition-colors duration-200 ${
      theme === 'light' ? 'bg-[#F8F6F1] text-[#1C1917]' : 'bg-[#13110E] text-[#F5EBE1]'
    }`}>
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        datasetCount={datasets.length}
        readyCount={datasets.filter(d => d.status === 'ready').length}
        runningJobCount={jobs.filter(j => j.status === 'running').length}
        settings={settings}
        setSettings={setSettings}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenPythonModal={() => setIsPythonModalOpen(true)}
        onOpenSpatialDoctor={() => setIsDoctorOpen(true)}
        onOpenSchemaHarmonizer={() => setIsHarmonizerOpen(true)}
        onOpenAuditCertificate={() => setIsCertificateOpen(true)}
        hasCertificate={!!qaqcReport}
        onStartBatch={handleStartBatch}
        selectedPresetId={selectedPresetId}
        onSelectPreset={handleSelectPreset}
      />

      {/* Main Work Area Views */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'craft' && (
          <CraftStudio
            datasets={datasets}
            selectedDataset={selectedDataset}
            onSelectDataset={(d) => setSelectedDatasetId(d.id)}
            setActiveTab={setActiveTab}
            settings={settings}
            setSettings={setSettings}
            consolidationSettings={consolidationSettings}
            setConsolidationSettings={setConsolidationSettings}
            onOpenSpatialDoctor={() => setIsDoctorOpen(true)}
            onOpenSchemaHarmonizer={() => setIsHarmonizerOpen(true)}
            onOpenAuditCertificate={() => setIsCertificateOpen(true)}
            onOpenPythonModal={() => setIsPythonModalOpen(true)}
            onCalculateSurfaces={handleCalculateSurfaces}
            onOpenAggregationModal={() => setIsAggregationModalOpen(true)}
            onStartBatch={handleStartBatch}
            hasCertificate={!!qaqcReport}
          />
        )}

        {activeTab === 'workspace' && (
          <BatchWorkspace
            datasets={datasets}
            setDatasets={setDatasets}
            selectedDatasetId={selectedDatasetId}
            setSelectedDatasetId={setSelectedDatasetId}
            onPreviewOnMap={handlePreviewOnMap}
            onOpenSpatialDoctor={() => setIsDoctorOpen(true)}
            onCalculateSurfaces={handleCalculateSurfaces}
            onOpenAggregationModal={() => setIsAggregationModalOpen(true)}
          />
        )}

        {activeTab === 'lab' && (
          <ConversionLab
            settings={settings}
            setSettings={setSettings}
            consolidationSettings={consolidationSettings}
            setConsolidationSettings={setConsolidationSettings}
            onOpenCRSModal={() => setIsCRSModalOpen(true)}
            isCRSModalOpen={isCRSModalOpen}
            onCloseCRSModal={() => setIsCRSModalOpen(false)}
            onOpenSchemaHarmonizer={() => setIsHarmonizerOpen(true)}
            onOpenSpatialDoctor={() => setIsDoctorOpen(true)}
            harmonizerRulesCount={harmonizerConfig.rules.length}
          />
        )}

        {activeTab === 'map' && (
          <MapPreview
            dataset={selectedDataset}
            datasets={datasets}
            onSelectDataset={(d) => setSelectedDatasetId(d.id)}
            processedJob={processedJobForPreview}
            onCalculateSurfaces={handleCalculateSurfaces}
            onOpenAggregationModal={() => setIsAggregationModalOpen(true)}
            isOverlayOpen={isCRSModalOpen || isCommandPaletteOpen || isPythonModalOpen || isDoctorOpen || isHarmonizerOpen || isCertificateOpen || isAggregationModalOpen}
          />
        )}

        {activeTab === 'monitor' && (
          <JobMonitor
            jobs={jobs}
            isProcessing={isProcessing}
            onStartBatch={handleStartBatch}
            onCancelBatch={handleCancelBatch}
            onRetryFailed={handleRetryFailed}
            manifest={manifest}
            onExportManifest={handleExportManifest}
            onOpenAuditCertificate={() => setIsCertificateOpen(true)}
            hasCertificate={!!qaqcReport}
            onDownloadConsolidated={handleDownloadConsolidatedHandoff}
            hasConsolidated={!!consolidatedHandoffBlob}
          />
        )}

        {activeTab === 'showcase' && (
          <ShowcaseWebsite
            onLaunchWorkbench={(tab) => setActiveTab(tab || 'craft')}
          />
        )}
      </main>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setActiveTab={setActiveTab}
        onStartBatch={handleStartBatch}
        onSetFormat={(fmt) => setSettings(s => ({ ...s, targetFormat: fmt }))}
        onSetCRS={(code) => setSettings(s => ({ ...s, targetCRS: code }))}
        onToggleDryRun={() => setSettings(s => ({ ...s, isDryRun: !s.isDryRun }))}
        onClearDatasets={() => { setDatasets([]); setSelectedDatasetId(null); setJobs([]); setConsolidatedHandoffBlob(null); setQaqcReport(null); }}
        onOpenPythonModal={() => setIsPythonModalOpen(true)}
        onOpenSpatialDoctor={() => setIsDoctorOpen(true)}
        onOpenSchemaHarmonizer={() => setIsHarmonizerOpen(true)}
        onOpenAuditCertificate={() => setIsCertificateOpen(true)}
      />

      {/* Python Architecture & Packaging Modal */}
      <PythonCoreModal
        isOpen={isPythonModalOpen}
        onClose={() => setIsPythonModalOpen(false)}
      />

      {/* CRS Modal */}
      <CRSModal
        isOpen={isCRSModalOpen}
        onClose={() => setIsCRSModalOpen(false)}
        selectedCRS={settings.targetCRS}
        onSelectCRS={(crs) => setSettings(s => ({ ...s, targetCRS: crs.code }))}
      />

      {/* Feature 1: Spatial Pre-Flight Doctor Modal */}
      <SpatialDoctorModal
        isOpen={isDoctorOpen}
        onClose={() => setIsDoctorOpen(false)}
        datasets={datasets}
        onUpdateDataset={handleUpdateDataset}
      />

      {/* Feature 4: Visual Batch Schema Harmonizer Modal */}
      <SchemaHarmonizerModal
        isOpen={isHarmonizerOpen}
        onClose={() => setIsHarmonizerOpen(false)}
        datasets={datasets}
        config={harmonizerConfig}
        setConfig={setHarmonizerConfig}
      />

      {/* Feature 5: Certified QA/QC Audit Certificate Modal */}
      <AuditCertificateModal
        isOpen={isCertificateOpen}
        onClose={() => setIsCertificateOpen(false)}
        reportData={qaqcReport}
      />

      {/* Field Aggregation & Attribute Intelligence Modal */}
      <AggregationModal
        isOpen={isAggregationModalOpen}
        onClose={() => setIsAggregationModalOpen(false)}
        dataset={selectedDataset}
        onUpdateDataset={handleUpdateDataset}
      />
    </div>
  );
}
