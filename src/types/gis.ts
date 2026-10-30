export type SupportedFormat = 'geojson' | 'shapefile' | 'geopackage' | 'kml' | 'csv' | 'flatgeobuf';

export type GeometryType = 
  | 'Point' 
  | 'LineString' 
  | 'Polygon' 
  | 'MultiPoint' 
  | 'MultiLineString' 
  | 'MultiPolygon' 
  | 'GeometryCollection' 
  | 'Unknown';

export interface CRSInfo {
  code: string; // e.g. "EPSG:4326"
  name: string; // e.g. "WGS 84"
  area: string; // e.g. "World"
  proj4: string;
  wkt?: string;
  transformationWarning?: string;
  isGeographic: boolean;
  unit: string;
}

export interface AttributeField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object';
  sampleValues: (string | number | boolean | null)[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  featureIndex?: number;
}

export interface SidecarFile {
  name: string;
  extension: string;
  size: number;
  present: boolean;
  required: boolean;
}

export interface SpatialDataset {
  id: string;
  name: string;
  originalFileName: string;
  format: SupportedFormat;
  sizeBytes: number;
  featureCount: number;
  geometryType: GeometryType;
  detectedCRS: CRSInfo | null;
  crsStatus: 'verified' | 'assumed' | 'missing' | 'ambiguous';
  bounds: [number, number, number, number]; // [minX, minY, maxX, maxY]
  fields: AttributeField[];
  geojson: any; // GeoJSON FeatureCollection representation for internal processing & preview
  sidecars?: SidecarFile[];
  validationIssues: ValidationIssue[];
  status: 'ready' | 'warning' | 'invalid';
  addedAt: number;
  rawFiles?: { [filename: string]: ArrayBuffer | string };
}

export type JobStatus = 
  | 'queued' 
  | 'running' 
  | 'completed' 
  | 'completed_warnings' 
  | 'failed' 
  | 'cancelled' 
  | 'dry_run_passed' 
  | 'dry_run_warning' 
  | 'dry_run_failed';

export interface JobLogEntry {
  timestamp: string;
  stage: 'inspect' | 'crs_transform' | 'validate' | 'convert' | 'write' | 'finalize';
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface ConversionJob {
  id: string;
  datasetId: string;
  inputDatasetName: string;
  inputFormat: SupportedFormat;
  sourceCRS: string;
  targetFormat: SupportedFormat;
  targetCRS: string;
  crsMode: 'reproject' | 'assign';
  outputFileName: string;
  layerName: string;
  status: JobStatus;
  progressPercent: number;
  stage: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  featuresProcessed: number;
  logs: JobLogEntry[];
  error?: string;
  outputBlob?: Blob;
  outputSize?: number;
  outputGeojson?: any;
}

export interface BatchSettings {
  targetFormat: SupportedFormat;
  targetCRS: string;
  crsMode: 'reproject' | 'assign';
  namingPattern: string; // e.g. "{name}_{crs}" or "{name}_converted"
  collisionPolicy: 'rename' | 'overwrite' | 'skip';
  maxConcurrentWorkers: number;
  isDryRun: boolean;
  csvXField?: string;
  csvYField?: string;
  layerNameTemplate: string;
  validateGeometries: boolean;
}

export interface BatchManifest {
  manifestVersion: string;
  generatedAt: string;
  generator: string;
  summary: {
    totalJobs: number;
    completed: number;
    completedWithWarnings: number;
    failed: number;
    cancelled: number;
    totalDurationSeconds: number;
  };
  jobs: {
    jobId: string;
    sourceFile: string;
    sourceFormat: string;
    sourceCRS: string;
    targetFormat: string;
    targetCRS: string;
    targetFile: string;
    status: string;
    featureCount: number;
    durationMs: number;
    warnings: string[];
    errors: string[];
  }[];
}

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  targetFormat: SupportedFormat;
  targetCRS: string;
  crsMode: 'reproject' | 'assign';
  namingPattern: string;
  badge: string;
}

export interface FieldMappingRule {
  targetField: string;
  targetType: 'string' | 'number' | 'boolean' | 'date';
  sourceFieldByDataset: Record<string, string>; // datasetId -> sourceField
  defaultValue?: string | number | boolean;
}

export interface SchemaHarmonizerConfig {
  enabled: boolean;
  casingMode: 'none' | 'lowercase' | 'UPPERCASE' | 'snake_case';
  rules: FieldMappingRule[];
}

export interface ConsolidationSettings {
  consolidateToSingleGeoPackage: boolean;
  packageFileName: string;
  generateQgisProject: boolean;
}

export interface SpatialDoctorDiagnosis {
  datasetId: string;
  datasetName: string;
  hasInvertedCoordinates: boolean;
  axisInversionConfidence: number; // 0-100%
  inversionReason?: string;
  suggestedCRS: CRSInfo[];
  unclosedRingsCount: number;
  duplicateVerticesCount: number;
  nanCoordinatesCount: number;
  emptyGeometriesCount: number;
  healthScore: number; // 0-100
  repairAvailable: boolean;
}

export interface QAQCReportData {
  reportId: string;
  generatedAt: string;
  issuedTo: string;
  organization: string;
  inputSha256Checksums: Record<string, string>;
  outputSha256Checksums: Record<string, string>;
  transformationChain: {
    sourceCRS: string;
    targetCRS: string;
    mode: string;
    datumName: string;
    ellipsoid: string;
    maxDisplacementMm: number;
  };
  validationMetrics: {
    totalFeatures: number;
    validGeometryPercent: number;
    selfIntersectionsResolved: number;
    unclosedRingsClosed: number;
    nanPointsScrubbed: number;
  };
  summary: {
    datasetsProcessed: number;
    targetFormat: string;
    targetCRS: string;
    executionDurationSeconds: number;
    complianceStatus: 'VERIFIED_PASSED' | 'PASSED_WITH_NOTICES' | 'FAILED';
  };
}
