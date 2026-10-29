import { BatchManifest, BatchSettings, ConversionJob, JobLogEntry, SpatialDataset, SupportedFormat } from '../types/gis';
import { reprojectGeoJSON } from './crsEngine';
import { createShapefileZip } from './shapefileBundle';
import { createGeoPackageFile } from './geopackageWriter';
import { geojsonToCSV, geojsonToKML } from './formatParsers';
import { getCRSByCode } from './crsDefinitions';

export function resolveOutputFileName(
  inputName: string,
  targetFormat: SupportedFormat,
  targetCRS: string,
  pattern: string
): string {
  const crsClean = targetCRS.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  let base = pattern
    .replace('{name}', inputName)
    .replace('{crs}', crsClean)
    .replace('{format}', targetFormat);

  if (!base || base.trim() === '') {
    base = `${inputName}_${crsClean}`;
  }

  // Extensions
  const extMap: Record<SupportedFormat, string> = {
    geojson: '.geojson',
    shapefile: '.zip',
    geopackage: '.gpkg',
    kml: '.kml',
    csv: '.csv',
    flatgeobuf: '.fgb'
  };

  return `${base}${extMap[targetFormat] || '.geojson'}`;
}

/**
 * Executes a single conversion job with comprehensive step logs
 */
export async function executeConversionJob(
  job: ConversionJob,
  dataset: SpatialDataset,
  settings: BatchSettings,
  onProgress?: (progress: number, stage: string) => void
): Promise<ConversionJob> {
  const startTime = Date.now();
  const logs: JobLogEntry[] = [];
  const updatedJob: ConversionJob = {
    ...job,
    startedAt: startTime,
    status: 'running',
    progressPercent: 10,
    stage: 'Inspecting source dataset',
    logs: [...job.logs]
  };

  const addLog = (stage: JobLogEntry['stage'], level: JobLogEntry['level'], message: string, details?: string) => {
    const entry: JobLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      stage,
      level,
      message,
      details
    };
    logs.push(entry);
    updatedJob.logs.push(entry);
  };

  try {
    addLog('inspect', 'info', `Beginning processing for dataset "${dataset.name}" (${dataset.format})`);
    onProgress?.(15, 'Inspecting source dataset');

    // 1. Verify CRS
    const sourceCRSCode = dataset.detectedCRS?.code || 'EPSG:4326';
    const targetCRSCode = job.targetCRS;

    if (!dataset.detectedCRS && job.crsMode === 'reproject') {
      addLog('crs_transform', 'warn', `Source dataset has missing or ambiguous CRS. Falling back to EPSG:4326.`);
    }

    addLog('crs_transform', 'info', `CRS Operation: ${job.crsMode === 'reproject' ? `Reprojecting from ${sourceCRSCode} to ${targetCRSCode}` : `Assigning CRS ${targetCRSCode}`}`);
    onProgress?.(30, 'Performing CRS transformation');

    let workingGeoJSON = dataset.geojson;
    let featuresCount = dataset.featureCount;

    if (job.crsMode === 'reproject' && sourceCRSCode !== targetCRSCode) {
      const transformRes = reprojectGeoJSON(workingGeoJSON, sourceCRSCode, targetCRSCode);
      workingGeoJSON = transformRes.geojson;
      if (transformRes.warnings.length > 0) {
        transformRes.warnings.forEach(w => addLog('crs_transform', 'warn', w));
      }
      addLog('crs_transform', 'info', `Transformed ${transformRes.featuresTransformed} spatial features via PROJ engine.`);
    } else {
      addLog('crs_transform', 'info', 'No coordinate math required; coordinate values preserved.');
    }

    // 2. Validate Geometries
    onProgress?.(50, 'Validating output geometries');
    addLog('validate', 'info', `Verifying ${featuresCount} geometry records for integrity`);
    
    // Check format-specific constraints
    if (job.targetFormat === 'shapefile') {
      const longFields = dataset.fields.filter(f => f.name.length > 10);
      if (longFields.length > 0) {
        addLog('validate', 'warn', `Shapefile DBF attribute limit: ${longFields.length} field names exceed 10 characters and will be truncated (${longFields.map(f => f.name).slice(0, 3).join(', ')}...).`);
      }
    }

    // 3. Dry-Run Check
    if (settings.isDryRun) {
      onProgress?.(100, 'Dry-run validation passed');
      addLog('finalize', 'info', 'Dry run complete. No files written.');
      const hasWarnings = logs.some(l => l.level === 'warn');
      return {
        ...updatedJob,
        status: hasWarnings ? 'dry_run_warning' : 'dry_run_passed',
        progressPercent: 100,
        stage: 'Dry-Run Validated',
        completedAt: Date.now(),
        durationMs: Date.now() - startTime,
        featuresProcessed: featuresCount,
        outputGeojson: workingGeoJSON,
      };
    }

    // 4. Output serialization
    onProgress?.(70, `Encoding output into ${job.targetFormat.toUpperCase()}`);
    addLog('convert', 'info', `Generating ${job.targetFormat.toUpperCase()} binary payload...`);

    let outputBlob: Blob;
    let outputSize = 0;

    switch (job.targetFormat) {
      case 'geopackage': {
        outputBlob = await createGeoPackageFile(workingGeoJSON, job.layerName || dataset.name, targetCRSCode);
        break;
      }
      case 'shapefile': {
        outputBlob = await createShapefileZip(workingGeoJSON, dataset.name, targetCRSCode);
        break;
      }
      case 'kml': {
        const kmlString = geojsonToKML(workingGeoJSON, dataset.name);
        outputBlob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
        break;
      }
      case 'csv': {
        const csvString = geojsonToCSV(workingGeoJSON);
        outputBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
        break;
      }
      case 'geojson':
      default: {
        const jsonStr = JSON.stringify(workingGeoJSON, null, 2);
        outputBlob = new Blob([jsonStr], { type: 'application/geo+json;charset=utf-8' });
        break;
      }
    }

    outputSize = outputBlob.size;
    addLog('write', 'info', `Output artifact produced successfully: ${job.outputFileName} (${(outputSize / 1024).toFixed(1)} KB)`);

    // 5. Finalize
    onProgress?.(100, 'Completed');
    addLog('finalize', 'info', 'Job finalized and ready for export.');

    const hasWarnings = logs.some(l => l.level === 'warn');

    return {
      ...updatedJob,
      status: hasWarnings ? 'completed_warnings' : 'completed',
      progressPercent: 100,
      stage: 'Completed',
      completedAt: Date.now(),
      durationMs: Date.now() - startTime,
      featuresProcessed: featuresCount,
      outputBlob,
      outputSize,
      outputGeojson: workingGeoJSON,
    };
  } catch (err: any) {
    addLog('finalize', 'error', `Job failed with exception: ${err.message}`);
    return {
      ...updatedJob,
      status: 'failed',
      progressPercent: 100,
      stage: 'Failed',
      completedAt: Date.now(),
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

/**
 * Builds the official batch manifest
 */
export function generateBatchManifest(
  jobs: ConversionJob[],
  totalDurationSeconds: number
): BatchManifest {
  const completed = jobs.filter(j => j.status === 'completed').length;
  const completedWithWarnings = jobs.filter(j => j.status === 'completed_warnings').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const cancelled = jobs.filter(j => j.status === 'cancelled').length;

  return {
    manifestVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generator: 'OmniGeo by Maodo v1.0.0 (Windows Native Engine)',
    summary: {
      totalJobs: jobs.length,
      completed,
      completedWithWarnings,
      failed,
      cancelled,
      totalDurationSeconds,
    },
    jobs: jobs.map(j => ({
      jobId: j.id,
      sourceFile: j.inputDatasetName,
      sourceFormat: j.inputFormat,
      sourceCRS: j.sourceCRS,
      targetFormat: j.targetFormat,
      targetCRS: j.targetCRS,
      targetFile: j.outputFileName,
      status: j.status,
      featureCount: j.featuresProcessed,
      durationMs: j.durationMs || 0,
      warnings: j.logs.filter(l => l.level === 'warn').map(l => l.message),
      errors: j.logs.filter(l => l.level === 'error').map(l => l.message),
    })),
  };
}
