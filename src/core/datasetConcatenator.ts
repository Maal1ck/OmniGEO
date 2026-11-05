import { AttributeField, CRSInfo, GeometryType, SpatialDataset } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { reprojectGeoJSON } from './crsEngine';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

export interface ColumnMapping {
  id: string;
  targetName: string;
  targetType: 'string' | 'number' | 'boolean' | 'date';
  sourceColumns: Record<string, string | null>; // datasetId -> sourceFieldName (or null)
  defaultValue?: string | number | boolean;
}

export interface ConcatenationOptions {
  outputName: string;
  targetCRS: string; // e.g. "EPSG:4326"
  addSourceLayerField: boolean;
  sourceLayerFieldName?: string;
  mappings: ColumnMapping[];
}

export interface ConcatenationResult {
  dataset: SpatialDataset;
  featureCount: number;
  layersMergedCount: number;
  warnings: string[];
}

/**
 * Normalizes field name for synonym detection (e.g. "OBJECTID" -> "id", "NOM_COMMUNE" -> "name")
 */
function normalizeFieldName(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['id', 'gid', 'objectid', 'featureid', 'fid'].includes(lower)) return 'id';
  if (['name', 'nom', 'label', 'title', 'intitule', 'libelle'].includes(lower)) return 'name';
  if (['type', 'category', 'categorie', 'class', 'classe'].includes(lower)) return 'type';
  if (['code', 'insee', 'postal', 'zipcode'].includes(lower)) return 'code';
  if (['desc', 'description', 'comment', 'remarque'].includes(lower)) return 'description';
  if (['surface', 'area', 'superficie'].includes(lower)) return 'area';
  return name.trim();
}

/**
 * Auto-generates initial column mappings by finding exact matches and synonyms across datasets
 */
export function generateInitialColumnMappings(datasets: SpatialDataset[]): ColumnMapping[] {
  if (!datasets || datasets.length === 0) return [];

  // Group columns across datasets by canonical/normalized key
  const fieldGroups = new Map<string, {
    preferredName: string;
    type: 'string' | 'number' | 'boolean' | 'date';
    sourceCols: Record<string, string>;
  }>();

  for (const ds of datasets) {
    for (const field of ds.fields) {
      const normKey = normalizeFieldName(field.name);
      const existing = fieldGroups.get(normKey);

      if (!existing) {
        fieldGroups.set(normKey, {
          preferredName: field.name,
          type: field.type === 'object' ? 'string' : field.type,
          sourceCols: { [ds.id]: field.name },
        });
      } else {
        existing.sourceCols[ds.id] = field.name;
        // Keep simpler or lowercase name if preferred
        if (field.name.length < existing.preferredName.length) {
          existing.preferredName = field.name;
        }
      }
    }
  }

  // Convert to ColumnMapping array
  const mappings: ColumnMapping[] = [];
  let index = 1;

  for (const [, group] of fieldGroups) {
    const sourceColumns: Record<string, string | null> = {};
    for (const ds of datasets) {
      sourceColumns[ds.id] = group.sourceCols[ds.id] || null;
    }

    mappings.push({
      id: `map-${index++}`,
      targetName: group.preferredName,
      targetType: group.type,
      sourceColumns,
    });
  }

  return mappings;
}

/**
 * Converts a raw feature value to the target column type
 */
function castValue(val: any, targetType: ColumnMapping['targetType']): any {
  if (val === undefined || val === null || val === '') return null;

  switch (targetType) {
    case 'number': {
      const num = Number(val);
      return Number.isFinite(num) ? num : null;
    }
    case 'boolean': {
      if (typeof val === 'boolean') return val;
      const s = String(val).toLowerCase().trim();
      return s === 'true' || s === '1' || s === 'yes' || s === 'oui';
    }
    case 'date': {
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toISOString();
    }
    case 'string':
    default:
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
  }
}

/**
 * Concatenates multiple datasets into a single harmonized SpatialDataset
 */
export function concatenateDatasets(
  datasets: SpatialDataset[],
  options: ConcatenationOptions
): ConcatenationResult {
  if (!datasets || datasets.length === 0) {
    throw new Error('No datasets selected for concatenation');
  }

  const warnings: string[] = [];
  const targetCRS = options.targetCRS || 'EPSG:4326';
  const targetCRSInfo = getCRSByCode(targetCRS);
  const sourceFieldName = options.sourceLayerFieldName || '_source_layer';

  const mergedFeatures: any[] = [];

  for (const ds of datasets) {
    if (!ds.geojson) continue;

    const sourceCRS = ds.detectedCRS?.code || 'EPSG:4326';
    let workingGeojson = ds.geojson;

    // Reproject if CRS differs
    if (sourceCRS !== targetCRS) {
      try {
        const reprojected = reprojectGeoJSON(ds.geojson, sourceCRS, targetCRS);
        workingGeojson = reprojected.geojson;
        if (reprojected.warnings.length > 0) {
          warnings.push(`[${ds.name}] ${reprojected.warnings[0]}`);
        }
      } catch (err: any) {
        warnings.push(`Failed to reproject ${ds.name} from ${sourceCRS} to ${targetCRS}: ${err.message}. Using raw coordinates.`);
      }
    }

    const features = workingGeojson.features || (workingGeojson.type === 'Feature' ? [workingGeojson] : []);

    for (let fIdx = 0; fIdx < features.length; fIdx++) {
      const f = features[fIdx];
      if (!f || !f.geometry) continue;

      const oldProps = f.properties || {};
      const newProps: Record<string, any> = {};

      // Map according to defined rules
      for (const m of options.mappings) {
        if (!m.targetName || !m.targetName.trim()) continue;

        const srcCol = m.sourceColumns[ds.id];
        let val = srcCol ? oldProps[srcCol] : undefined;

        if (val === undefined && m.defaultValue !== undefined && m.defaultValue !== '') {
          val = m.defaultValue;
        }

        newProps[m.targetName] = castValue(val, m.targetType);
      }

      // Add provenance layer tag if requested
      if (options.addSourceLayerField) {
        newProps[sourceFieldName] = ds.name;
      }

      mergedFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: newProps,
      });
    }
  }

  const finalGeoJSON = {
    type: 'FeatureCollection',
    features: mergedFeatures,
  };

  const bounds = computeGeoJSONBounds(finalGeoJSON);
  const geometryType = detectGeometryType(finalGeoJSON);
  const fields = extractSchemaFields(finalGeoJSON);
  const validationIssues = validateDatasetGeometries(finalGeoJSON, targetCRS);

  const cleanOutputName = (options.outputName || 'concatenated_layers')
    .trim()
    .replace(/\.[^/.]+$/, '');

  const newDataset: SpatialDataset = {
    id: `ds-concat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanOutputName,
    originalFileName: `${cleanOutputName}.geojson`,
    format: 'geojson',
    sizeBytes: JSON.stringify(finalGeoJSON).length,
    featureCount: mergedFeatures.length,
    geometryType,
    detectedCRS: targetCRSInfo,
    crsStatus: 'verified',
    bounds,
    fields,
    geojson: finalGeoJSON,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };

  return {
    dataset: newDataset,
    featureCount: mergedFeatures.length,
    layersMergedCount: datasets.length,
    warnings,
  };
}
