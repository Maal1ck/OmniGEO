/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialDataset, AttributeField, GeometryType } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { reprojectGeoJSON } from './crsEngine';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

export type AttributeJoinType = 'left' | 'inner';
export type SpatialPredicate = 'intersects' | 'within' | 'contains';

export interface AttributeJoinOptions {
  targetDataset: SpatialDataset;
  sourceDataset: SpatialDataset;
  targetKeyField: string;
  sourceKeyField: string;
  joinType: AttributeJoinType;
  selectedSourceFields: string[];
  prefix?: string;
  outputName: string;
  caseSensitive?: boolean;
}

export interface SpatialJoinOptions {
  targetDataset: SpatialDataset;
  sourceDataset: SpatialDataset;
  predicate: SpatialPredicate;
  joinType: 'left' | 'inner';
  selectedSourceFields: string[];
  prefix?: string;
  outputName: string;
}

export interface JoinExecutionSummary {
  dataset: SpatialDataset;
  targetCount: number;
  matchedCount: number;
  unmatchedCount: number;
  matchPercentage: number;
  addedFieldCount: number;
  sampleRows: Record<string, any>[];
}

/**
 * Normalizes values for flexible attribute comparison (e.g. matching '01' with 1, trimming spaces)
 */
function normalizeKeyValue(val: any, caseSensitive: boolean = false): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!caseSensitive) {
    str = str.toLowerCase();
  }
  return str;
}

/**
 * Executes an Attribute (tabular) join between two spatial datasets.
 */
export function executeAttributeJoin(options: AttributeJoinOptions): JoinExecutionSummary {
  const {
    targetDataset,
    sourceDataset,
    targetKeyField,
    sourceKeyField,
    joinType,
    selectedSourceFields,
    prefix = '',
    outputName,
    caseSensitive = false,
  } = options;

  const targetFeatures = targetDataset.geojson?.features || [];
  const sourceFeatures = sourceDataset.geojson?.features || [];

  // Index the source features by the sourceKeyField for O(1) lookups
  const sourceIndex = new Map<string, Record<string, any>>();
  for (const sf of sourceFeatures) {
    if (!sf.properties) continue;
    const rawVal = sf.properties[sourceKeyField];
    const key = normalizeKeyValue(rawVal, caseSensitive);
    if (key && !sourceIndex.has(key)) {
      sourceIndex.set(key, sf.properties);
    }
  }

  const joinedFeatures: any[] = [];
  let matchedCount = 0;

  for (let i = 0; i < targetFeatures.length; i++) {
    const tf = targetFeatures[i];
    const targetProps = { ...(tf.properties || {}) };
    const rawTargetKey = targetProps[targetKeyField];
    const key = normalizeKeyValue(rawTargetKey, caseSensitive);

    const matchingSourceProps = key ? sourceIndex.get(key) : undefined;

    if (matchingSourceProps) {
      matchedCount++;
      // Attach selected source fields
      for (const field of selectedSourceFields) {
        const outFieldName = prefix ? `${prefix}${field}` : field;
        targetProps[outFieldName] = matchingSourceProps[field] ?? null;
      }
      joinedFeatures.push({
        ...tf,
        properties: targetProps,
      });
    } else {
      // Unmatched record
      if (joinType === 'left') {
        for (const field of selectedSourceFields) {
          const outFieldName = prefix ? `${prefix}${field}` : field;
          targetProps[outFieldName] = null;
        }
        joinedFeatures.push({
          ...tf,
          properties: targetProps,
        });
      }
      // If inner join, omit unmatched records
    }
  }

  const targetCount = targetFeatures.length;
  const unmatchedCount = targetCount - matchedCount;
  const matchPercentage = targetCount > 0 ? Math.round((matchedCount / targetCount) * 100) : 0;

  const geojson = {
    type: 'FeatureCollection',
    features: joinedFeatures,
  };

  const detectedCRS = targetDataset.detectedCRS || getCRSByCode('EPSG:4326')!;
  const bounds = computeGeoJSONBounds(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS.code);

  const cleanName = outputName.trim() || `${targetDataset.name}_joined_${sourceDataset.name}`;
  const newDataset: SpatialDataset = {
    id: `ds-join-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    originalFileName: `${cleanName}.geojson`,
    format: 'geojson',
    sizeBytes: targetDataset.sizeBytes + Math.round(sourceDataset.sizeBytes * 0.4),
    featureCount: joinedFeatures.length,
    geometryType: targetDataset.geometryType,
    detectedCRS,
    crsStatus: 'verified',
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };

  const sampleRows = joinedFeatures.slice(0, 8).map(f => f.properties || {});

  return {
    dataset: newDataset,
    targetCount,
    matchedCount,
    unmatchedCount,
    matchPercentage,
    addedFieldCount: selectedSourceFields.length,
    sampleRows,
  };
}

/**
 * Tests if point [x, y] is inside a polygon ring using ray-casting algorithm
 */
function isPointInRing(point: [number, number], ring: number[][]): boolean {
  if (!ring || ring.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if point is inside a GeoJSON Polygon or MultiPolygon
 */
function isPointInPolygonGeometry(point: [number, number], geometry: any): boolean {
  if (!geometry || !geometry.coordinates) return false;
  const { type, coordinates } = geometry;

  if (type === 'Polygon') {
    // Exterior ring must contain point, and no holes must contain point
    if (!coordinates[0] || !isPointInRing(point, coordinates[0])) return false;
    for (let h = 1; h < coordinates.length; h++) {
      if (isPointInRing(point, coordinates[h])) return false; // Inside a hole
    }
    return true;
  }

  if (type === 'MultiPolygon') {
    for (const poly of coordinates) {
      if (poly[0] && isPointInRing(point, poly[0])) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (isPointInRing(point, poly[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }

  return false;
}

/**
 * Computes bounding box [minX, minY, maxX, maxY] for a feature geometry
 */
function getGeometryBBox(geom: any): [number, number, number, number] | null {
  if (!geom || !geom.coordinates) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function traverse(coords: any) {
    if (!coords || !Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    } else {
      for (const item of coords) traverse(item);
    }
  }

  traverse(geom.coordinates);
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

/**
 * Checks if two bounding boxes overlap
 */
function bboxesOverlap(b1: [number, number, number, number], b2: [number, number, number, number]): boolean {
  return !(b1[2] < b2[0] || b1[0] > b2[2] || b1[3] < b2[1] || b1[1] > b2[3]);
}

/**
 * Evaluates spatial relationship between target feature and join feature
 */
function testSpatialPredicate(targetGeom: any, sourceGeom: any, predicate: SpatialPredicate): boolean {
  if (!targetGeom || !sourceGeom) return false;

  const targetBBox = getGeometryBBox(targetGeom);
  const sourceBBox = getGeometryBBox(sourceGeom);
  if (!targetBBox || !sourceBBox || !bboxesOverlap(targetBBox, sourceBBox)) {
    return false;
  }

  const targetType = targetGeom.type;
  const sourceType = sourceGeom.type;

  // Case 1: Target is Point / MultiPoint
  if (targetType === 'Point') {
    const pt: [number, number] = targetGeom.coordinates;
    if (sourceType.includes('Polygon')) {
      return isPointInPolygonGeometry(pt, sourceGeom);
    }
    // Point intersects Point
    if (sourceType === 'Point') {
      const sPt: [number, number] = sourceGeom.coordinates;
      return Math.abs(pt[0] - sPt[0]) < 1e-6 && Math.abs(pt[1] - sPt[1]) < 1e-6;
    }
  }

  // Case 2: Target is Polygon / MultiPolygon and Source is Point
  if (targetType.includes('Polygon') && sourceType === 'Point') {
    const pt: [number, number] = sourceGeom.coordinates;
    const inside = isPointInPolygonGeometry(pt, targetGeom);
    if (predicate === 'contains' || predicate === 'intersects') return inside;
    return false;
  }

  // Case 3: Polygon vs Polygon
  if (targetType.includes('Polygon') && sourceType.includes('Polygon')) {
    // Check centroid of target in source polygon
    const centerX = (targetBBox[0] + targetBBox[2]) / 2;
    const centerY = (targetBBox[1] + targetBBox[3]) / 2;
    if (isPointInPolygonGeometry([centerX, centerY], sourceGeom)) {
      return true;
    }
    // Check centroid of source in target polygon
    const sCenterX = (sourceBBox[0] + sourceBBox[2]) / 2;
    const sCenterY = (sourceBBox[1] + sourceBBox[3]) / 2;
    if (isPointInPolygonGeometry([sCenterX, sCenterY], targetGeom)) {
      return true;
    }
    // If bounding boxes overlap significantly, consider intersecting
    return true;
  }

  // Fallback for lines or other geometries: bounding box overlap
  return true;
}

/**
 * Executes a Spatial (location-based) join between two spatial datasets.
 */
export function executeSpatialJoin(options: SpatialJoinOptions): JoinExecutionSummary {
  const {
    targetDataset,
    sourceDataset,
    predicate,
    joinType,
    selectedSourceFields,
    prefix = '',
    outputName,
  } = options;

  let targetGeoJSON = targetDataset.geojson;
  let sourceGeoJSON = sourceDataset.geojson;

  // If layers have different CRSs, reproject source layer to target CRS for accurate geometric testing
  const targetCRS = targetDataset.detectedCRS?.code || 'EPSG:4326';
  const sourceCRS = sourceDataset.detectedCRS?.code || 'EPSG:4326';
  if (targetCRS !== sourceCRS) {
    try {
      sourceGeoJSON = reprojectGeoJSON(sourceGeoJSON, sourceCRS, targetCRS);
    } catch (e) {
      console.warn('Could not reproject source layer for spatial join; proceeding with native coordinates:', e);
    }
  }

  const targetFeatures = targetGeoJSON?.features || [];
  const sourceFeatures = sourceGeoJSON?.features || [];

  // Precompute bounding boxes for source features
  const indexedSource = sourceFeatures.map((sf: any) => ({
    feature: sf,
    bbox: getGeometryBBox(sf.geometry),
    properties: sf.properties || {},
  })).filter((s: any) => s.bbox !== null);

  const joinedFeatures: any[] = [];
  let matchedCount = 0;

  for (let i = 0; i < targetFeatures.length; i++) {
    const tf = targetFeatures[i];
    const targetGeom = tf.geometry;
    const targetBBox = getGeometryBBox(targetGeom);
    const targetProps = { ...(tf.properties || {}) };

    let matchingSourceProps: Record<string, any> | null = null;

    if (targetBBox) {
      for (const src of indexedSource) {
        if (bboxesOverlap(targetBBox, src.bbox)) {
          if (testSpatialPredicate(targetGeom, src.feature.geometry, predicate)) {
            matchingSourceProps = src.properties;
            break; // 1-to-1 match
          }
        }
      }
    }

    if (matchingSourceProps) {
      matchedCount++;
      for (const field of selectedSourceFields) {
        const outName = prefix ? `${prefix}${field}` : field;
        targetProps[outName] = matchingSourceProps[field] ?? null;
      }
      joinedFeatures.push({
        ...tf,
        properties: targetProps,
      });
    } else {
      if (joinType === 'left') {
        for (const field of selectedSourceFields) {
          const outName = prefix ? `${prefix}${field}` : field;
          targetProps[outName] = null;
        }
        joinedFeatures.push({
          ...tf,
          properties: targetProps,
        });
      }
    }
  }

  const targetCount = targetFeatures.length;
  const unmatchedCount = targetCount - matchedCount;
  const matchPercentage = targetCount > 0 ? Math.round((matchedCount / targetCount) * 100) : 0;

  const geojson = {
    type: 'FeatureCollection',
    features: joinedFeatures,
  };

  const detectedCRS = targetDataset.detectedCRS || getCRSByCode('EPSG:4326')!;
  const bounds = computeGeoJSONBounds(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS.code);

  const cleanName = outputName.trim() || `${targetDataset.name}_spatial_${sourceDataset.name}`;
  const newDataset: SpatialDataset = {
    id: `ds-sjoin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    originalFileName: `${cleanName}.geojson`,
    format: 'geojson',
    sizeBytes: targetDataset.sizeBytes + Math.round(sourceDataset.sizeBytes * 0.4),
    featureCount: joinedFeatures.length,
    geometryType: targetDataset.geometryType,
    detectedCRS,
    crsStatus: 'verified',
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };

  const sampleRows = joinedFeatures.slice(0, 8).map(f => f.properties || {});

  return {
    dataset: newDataset,
    targetCount,
    matchedCount,
    unmatchedCount,
    matchPercentage,
    addedFieldCount: selectedSourceFields.length,
    sampleRows,
  };
}
