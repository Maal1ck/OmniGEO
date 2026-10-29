import { FieldMappingRule, SchemaHarmonizerConfig, SpatialDataset } from '../types/gis';

/**
 * Extracts a unified list of all attribute field names found across all datasets
 */
export function discoverAllFields(datasets: SpatialDataset[]): { name: string; types: Set<string>; sampleValues: any[]; datasets: string[] }[] {
  const map = new Map<string, { types: Set<string>; sampleValues: any[]; datasets: Set<string> }>();

  for (const ds of datasets) {
    for (const f of ds.fields) {
      if (!map.has(f.name)) {
        map.set(f.name, {
          types: new Set([f.type]),
          sampleValues: [...f.sampleValues],
          datasets: new Set([ds.name]),
        });
      } else {
        const item = map.get(f.name)!;
        item.types.add(f.type);
        item.datasets.add(ds.name);
        for (const s of f.sampleValues) {
          if (item.sampleValues.length < 5 && !item.sampleValues.includes(s)) {
            item.sampleValues.push(s);
          }
        }
      }
    }
  }

  return Array.from(map.entries()).map(([name, data]) => ({
    name,
    types: data.types,
    sampleValues: data.sampleValues,
    datasets: Array.from(data.datasets),
  }));
}

/**
 * Auto-generates initial harmonization rules by fuzzy-matching field names across datasets
 */
export function generateAutoHarmonizerRules(datasets: SpatialDataset[]): FieldMappingRule[] {
  const discovered = discoverAllFields(datasets);
  const rules: FieldMappingRule[] = [];

  // Group similar field names (e.g. ID, parcel_id, PARCEL_NUM)
  const canonicalMap: Record<string, string[]> = {
    'id': ['id', 'fid', 'gid', 'objectid', 'feature_id', 'parcel_id', 'pid', 'parcel_num', 'station_id', 'line_id', 'site_code'],
    'name': ['name', 'title', 'label', 'description', 'line_name', 'location', 'habitat'],
    'status': ['status', 'state', 'condition', 'designation'],
    'value': ['value', 'val', 'assessed_val', 'area_sqm', 'area_ha', 'pm25', 'no2', 'elevation_m', 'gauge_mm'],
  };

  const processedSources = new Set<string>();

  for (const [targetKey, aliases] of Object.entries(canonicalMap)) {
    const matchingFields = discovered.filter(f => aliases.includes(f.name.toLowerCase()));
    if (matchingFields.length > 0) {
      const sourceByDataset: Record<string, string> = {};
      for (const ds of datasets) {
        const found = ds.fields.find(f => aliases.includes(f.name.toLowerCase()));
        if (found) {
          sourceByDataset[ds.id] = found.name;
          processedSources.add(found.name);
        }
      }

      rules.push({
        targetField: targetKey,
        targetType: targetKey === 'value' ? 'number' : 'string',
        sourceFieldByDataset: sourceByDataset,
      });
    }
  }

  // Add remaining unmapped fields
  for (const f of discovered) {
    if (!processedSources.has(f.name)) {
      const sourceByDataset: Record<string, string> = {};
      for (const ds of datasets) {
        if (ds.fields.some(field => field.name === f.name)) {
          sourceByDataset[ds.id] = f.name;
        }
      }
      rules.push({
        targetField: f.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        targetType: f.types.has('number') ? 'number' : 'string',
        sourceFieldByDataset: sourceByDataset,
      });
      processedSources.add(f.name);
    }
  }

  return rules;
}

/**
 * Applies schema harmonizer rules and casing transformation to a dataset's GeoJSON
 */
export function applySchemaHarmonization(
  geojson: any,
  datasetId: string,
  config: SchemaHarmonizerConfig
): any {
  if (!config.enabled || !config.rules || config.rules.length === 0) {
    return geojson;
  }

  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);

  const transformCase = (name: string): string => {
    switch (config.casingMode) {
      case 'lowercase':
        return name.toLowerCase();
      case 'UPPERCASE':
        return name.toUpperCase();
      case 'snake_case':
        return name.replace(/[\s\-]+/g, '_').toLowerCase();
      case 'none':
      default:
        return name;
    }
  };

  const harmonizedFeatures = features.map((f: any) => {
    const oldProps = f.properties || {};
    const newProps: Record<string, any> = {};

    for (const rule of config.rules) {
      const targetCol = transformCase(rule.targetField);
      const sourceField = rule.sourceFieldByDataset[datasetId];
      let val = sourceField !== undefined ? oldProps[sourceField] : rule.defaultValue;

      if (val === undefined && rule.defaultValue !== undefined) {
        val = rule.defaultValue;
      }

      // Type coercion
      if (val !== undefined && val !== null) {
        if (rule.targetType === 'number') {
          const num = Number(val);
          val = Number.isFinite(num) ? num : null;
        } else if (rule.targetType === 'string') {
          val = String(val);
        } else if (rule.targetType === 'boolean') {
          val = Boolean(val);
        }
      }

      newProps[targetCol] = val ?? null;
    }

    return {
      ...f,
      properties: newProps,
    };
  });

  return {
    ...geojson,
    features: harmonizedFeatures,
  };
}
