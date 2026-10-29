/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialDataset, AttributeField } from '../types/gis';

export type SurfaceUnit = 'm2' | 'ha' | 'km2' | 'acres';
export type LengthUnit = 'm' | 'km';

export interface AggregationResult {
  groupByField: string;
  metric: 'count' | 'sum' | 'mean' | 'min' | 'max';
  valueField?: string;
  groups: {
    key: string;
    count: number;
    value?: number;
    percentOfTotal?: number;
  }[];
  totalCount: number;
  totalSum?: number;
}

/**
 * Calculates spherical geodesic area of a polygon ring in square meters.
 * Coordinates are assumed to be [longitude, latitude] in degrees (WGS84).
 */
export function calculateSphericalRingArea(ring: number[][]): number {
  if (!ring || ring.length < 3) return 0;
  const RADIUS = 6378137.0; // WGS84 semi-major axis in meters
  let total = 0;
  const len = ring.length;

  for (let i = 0; i < len; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % len];
    if (!p1 || !p2 || p1.length < 2 || p2.length < 2) continue;

    const lon1 = (p1[0] * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lon2 = (p2[0] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;

    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs((total * RADIUS * RADIUS) / 2.0);
}

/**
 * Calculates the total area of a Polygon or MultiPolygon geometry in square meters.
 */
export function calculateGeometryArea(geometry: any): number {
  if (!geometry) return 0;
  const { type, coordinates } = geometry;

  if (type === 'Polygon') {
    if (!coordinates || coordinates.length === 0) return 0;
    // Exterior ring minus interior holes
    let area = calculateSphericalRingArea(coordinates[0]);
    for (let i = 1; i < coordinates.length; i++) {
      area -= calculateSphericalRingArea(coordinates[i]);
    }
    return Math.max(0, area);
  }

  if (type === 'MultiPolygon') {
    if (!coordinates) return 0;
    let total = 0;
    for (const polygon of coordinates) {
      if (!polygon || polygon.length === 0) continue;
      let polyArea = calculateSphericalRingArea(polygon[0]);
      for (let i = 1; i < polygon.length; i++) {
        polyArea -= calculateSphericalRingArea(polygon[i]);
      }
      total += Math.max(0, polyArea);
    }
    return total;
  }

  return 0;
}

/**
 * Calculates the geodesic length of a LineString in meters.
 */
export function calculateGeometryLength(geometry: any): number {
  if (!geometry) return 0;
  const { type, coordinates } = geometry;
  const RADIUS = 6378137.0;

  const haversineDistance = (p1: number[], p2: number[]): number => {
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RADIUS * c;
  };

  if (type === 'LineString') {
    if (!coordinates || coordinates.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      dist += haversineDistance(coordinates[i], coordinates[i + 1]);
    }
    return dist;
  }

  if (type === 'MultiLineString') {
    if (!coordinates) return 0;
    let total = 0;
    for (const line of coordinates) {
      for (let i = 0; i < line.length - 1; i++) {
        total += haversineDistance(line[i], line[i + 1]);
      }
    }
    return total;
  }

  return 0;
}

/**
 * Calculates surfaces / geometries and appends a new column to the dataset.
 */
export function appendSurfaceColumnToDataset(
  dataset: SpatialDataset,
  unit: SurfaceUnit = 'ha',
  customColumnName?: string
): { updatedDataset: SpatialDataset; addedColumn: string; count: number } {
  const isPolygon = dataset.geometryType.includes('Polygon');
  const isLine = dataset.geometryType.includes('Line');

  let colName = customColumnName?.trim();
  if (!colName) {
    if (isPolygon) {
      colName = `surface_${unit}`;
    } else if (isLine) {
      colName = 'length_km';
    } else {
      colName = 'coord_lat';
    }
  }

  // Clone geojson
  const geojsonCopy = JSON.parse(JSON.stringify(dataset.geojson));
  const features = geojsonCopy.features || (geojsonCopy.type === 'Feature' ? [geojsonCopy] : []);

  const sampleValues: number[] = [];

  features.forEach((feature: any) => {
    if (!feature.properties) feature.properties = {};

    let val = 0;
    if (isPolygon) {
      const areaM2 = calculateGeometryArea(feature.geometry);
      switch (unit) {
        case 'm2':
          val = Math.round(areaM2 * 100) / 100;
          break;
        case 'ha':
          val = Math.round((areaM2 / 10000) * 10000) / 10000;
          break;
        case 'km2':
          val = Math.round((areaM2 / 1000000) * 10000) / 10000;
          break;
        case 'acres':
          val = Math.round((areaM2 / 4046.856) * 10000) / 10000;
          break;
      }
    } else if (isLine) {
      const lengthM = calculateGeometryLength(feature.geometry);
      val = Math.round((lengthM / 1000) * 1000) / 1000; // km
    } else {
      // Point: store latitude
      val = feature.geometry?.coordinates?.[1] ? Math.round(feature.geometry.coordinates[1] * 10000) / 10000 : 0;
    }

    feature.properties[colName] = val;
    if (sampleValues.length < 5) sampleValues.push(val);
  });

  // Update fields array if column didn't already exist
  const existingFieldIdx = dataset.fields.findIndex(f => f.name.toLowerCase() === colName.toLowerCase());
  let updatedFields: AttributeField[] = [...dataset.fields];

  const newField: AttributeField = {
    name: colName,
    type: 'number',
    sampleValues,
  };

  if (existingFieldIdx >= 0) {
    updatedFields[existingFieldIdx] = newField;
  } else {
    updatedFields.push(newField);
  }

  const updatedDataset: SpatialDataset = {
    ...dataset,
    geojson: geojsonCopy,
    fields: updatedFields,
  };

  return {
    updatedDataset,
    addedColumn: colName,
    count: features.length,
  };
}

/**
 * Calculates aggregations based on a field (group by).
 */
export function computeFieldAggregation(
  dataset: SpatialDataset,
  groupByField: string,
  metric: 'count' | 'sum' | 'mean' | 'min' | 'max' = 'count',
  valueField?: string
): AggregationResult {
  const features = dataset.geojson?.features || (dataset.geojson?.type === 'Feature' ? [dataset.geojson] : []);
  const map: Record<string, { count: number; values: number[] }> = {};

  let totalCount = 0;
  let totalSum = 0;

  features.forEach((f: any) => {
    const rawKey = f.properties?.[groupByField];
    const key = rawKey !== undefined && rawKey !== null && String(rawKey).trim() !== '' ? String(rawKey) : '(Empty)';
    
    if (!map[key]) {
      map[key] = { count: 0, values: [] };
    }
    map[key].count++;
    totalCount++;

    if (valueField && f.properties?.[valueField] !== undefined) {
      const num = Number(f.properties[valueField]);
      if (!isNaN(num)) {
        map[key].values.push(num);
        totalSum += num;
      }
    }
  });

  const groups = Object.entries(map).map(([key, data]) => {
    let resultVal: number | undefined = undefined;

    if (metric === 'count') {
      resultVal = data.count;
    } else if (metric === 'sum') {
      resultVal = Math.round(data.values.reduce((a, b) => a + b, 0) * 100) / 100;
    } else if (metric === 'mean') {
      resultVal = data.values.length > 0 
        ? Math.round((data.values.reduce((a, b) => a + b, 0) / data.values.length) * 100) / 100 
        : 0;
    } else if (metric === 'min') {
      resultVal = data.values.length > 0 ? Math.min(...data.values) : 0;
    } else if (metric === 'max') {
      resultVal = data.values.length > 0 ? Math.max(...data.values) : 0;
    }

    const percentOfTotal = totalCount > 0 ? Math.round((data.count / totalCount) * 1000) / 10 : 0;

    return {
      key,
      count: data.count,
      value: resultVal,
      percentOfTotal,
    };
  });

  // Sort by count or value descending
  groups.sort((a, b) => (b.value ?? b.count) - (a.value ?? a.count));

  return {
    groupByField,
    metric,
    valueField,
    groups,
    totalCount,
    totalSum: Math.round(totalSum * 100) / 100,
  };
}

/**
 * Appends aggregated summary stats into each feature as a new column!
 * E.g., `avg_surface_by_zone` or `category_count`.
 */
export function appendAggregationColumnToDataset(
  dataset: SpatialDataset,
  aggregation: AggregationResult,
  customColumnName?: string
): { updatedDataset: SpatialDataset; addedColumn: string } {
  const colName = customColumnName?.trim() || 
    (aggregation.metric === 'count' 
      ? `count_by_${aggregation.groupByField}` 
      : `${aggregation.metric}_${aggregation.valueField || 'val'}_by_${aggregation.groupByField}`);

  // Create lookup
  const lookup: Record<string, number> = {};
  aggregation.groups.forEach(g => {
    lookup[g.key] = g.value ?? g.count;
  });

  const geojsonCopy = JSON.parse(JSON.stringify(dataset.geojson));
  const features = geojsonCopy.features || (geojsonCopy.type === 'Feature' ? [geojsonCopy] : []);
  const sampleValues: number[] = [];

  features.forEach((f: any) => {
    if (!f.properties) f.properties = {};
    const rawKey = f.properties[aggregation.groupByField];
    const key = rawKey !== undefined && rawKey !== null && String(rawKey).trim() !== '' ? String(rawKey) : '(Empty)';
    const val = lookup[key] ?? 0;
    f.properties[colName] = val;
    if (sampleValues.length < 5) sampleValues.push(val);
  });

  const existingFieldIdx = dataset.fields.findIndex(f => f.name.toLowerCase() === colName.toLowerCase());
  let updatedFields = [...dataset.fields];

  const newField: AttributeField = {
    name: colName,
    type: 'number',
    sampleValues,
  };

  if (existingFieldIdx >= 0) {
    updatedFields[existingFieldIdx] = newField;
  } else {
    updatedFields.push(newField);
  }

  const updatedDataset: SpatialDataset = {
    ...dataset,
    geojson: geojsonCopy,
    fields: updatedFields,
  };

  return {
    updatedDataset,
    addedColumn: colName,
  };
}
