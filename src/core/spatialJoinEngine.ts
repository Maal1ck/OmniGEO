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
  fuzzyMatching?: boolean;
  fuzzyThreshold?: number;
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
  fuzzyMatchedCount: number;
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

function normalizeFuzzyValue(value: string, caseSensitive = false): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function getBigrams(value: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) {
    bigrams.add(value.slice(i, i + 2));
  }
  return bigrams;
}

function levenshteinDistanceAtMost(left: string, right: string, maxDistance: number): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) return null;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maxDistance) return null;
    previous = current;
  }

  return previous[right.length] <= maxDistance ? previous[right.length] : null;
}

function normalizeComparableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'object') return JSON.stringify(value) || '';
  return String(value).trim().toLowerCase();
}

function countSharedValueMatches(
  targetProperties: Record<string, any>,
  sourceProperties: Record<string, any>,
  targetKeyField: string,
  sourceKeyField: string
): number {
  const excludedNames = new Set([
    normalizeFuzzyValue(targetKeyField).replace(/\s/g, ''),
    normalizeFuzzyValue(sourceKeyField).replace(/\s/g, ''),
  ]);
  const sourceValues = new Map<string, unknown>();
  for (const [name, value] of Object.entries(sourceProperties)) {
    const normalizedName = normalizeFuzzyValue(name).replace(/\s/g, '');
    if (normalizedName && !excludedNames.has(normalizedName)) {
      sourceValues.set(normalizedName, value);
    }
  }

  let matches = 0;
  for (const [name, value] of Object.entries(targetProperties)) {
    const normalizedName = normalizeFuzzyValue(name).replace(/\s/g, '');
    if (!normalizedName || excludedNames.has(normalizedName) || !sourceValues.has(normalizedName)) continue;
    const targetValue = normalizeComparableValue(value);
    const sourceValue = normalizeComparableValue(sourceValues.get(normalizedName));
    if (targetValue && sourceValue && targetValue === sourceValue) matches++;
  }
  return matches;
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
    fuzzyMatching = false,
    fuzzyThreshold = 0.85,
  } = options;

  const targetFeatures = targetDataset.geojson?.features || [];
  const sourceFeatures = sourceDataset.geojson?.features || [];
  const targetKeyIsText = targetDataset.fields.find(field => field.name === targetKeyField)?.type === 'string';
  const sourceKeyIsText = sourceDataset.fields.find(field => field.name === sourceKeyField)?.type === 'string';

  // Index the source features by the sourceKeyField for O(1) lookups
  const sourceIndex = new Map<string, Record<string, any>>();
  const fuzzyRowsByKey = new Map<string, Record<string, any>[]>();
  const fuzzyKeyIndex = new Map<string, Set<string>>();
  for (const sf of sourceFeatures) {
    if (!sf.properties) continue;
    const rawVal = sf.properties[sourceKeyField];
    const key = normalizeKeyValue(rawVal, caseSensitive);
    if (key && !sourceIndex.has(key)) {
      sourceIndex.set(key, sf.properties);
    }

    if (fuzzyMatching && targetKeyIsText && sourceKeyIsText && typeof rawVal === 'string') {
      const fuzzyKey = normalizeFuzzyValue(rawVal, caseSensitive);
      if (!fuzzyKey) continue;

      const rows = fuzzyRowsByKey.get(fuzzyKey) || [];
      rows.push(sf.properties);
      fuzzyRowsByKey.set(fuzzyKey, rows);

      if (rows.length === 1) {
        for (const bigram of getBigrams(fuzzyKey)) {
          const keys = fuzzyKeyIndex.get(bigram) || new Set<string>();
          keys.add(fuzzyKey);
          fuzzyKeyIndex.set(bigram, keys);
        }
      }
    }
  }

  const threshold = Number.isFinite(fuzzyThreshold)
    ? Math.max(0.6, Math.min(1, fuzzyThreshold))
    : 0.85;
  const joinedFeatures: any[] = [];
  let matchedCount = 0;
  let fuzzyMatchedCount = 0;

  for (let i = 0; i < targetFeatures.length; i++) {
    const tf = targetFeatures[i];
    const targetProps = { ...(tf.properties || {}) };
    const rawTargetKey = targetProps[targetKeyField];
    const key = normalizeKeyValue(rawTargetKey, caseSensitive);

    let matchingSourceProps = key ? sourceIndex.get(key) : undefined;
    let fuzzyMatched = false;

    if (
      !matchingSourceProps &&
      fuzzyMatching &&
      targetKeyIsText &&
      sourceKeyIsText &&
      typeof rawTargetKey === 'string'
    ) {
      const fuzzyTargetKey = normalizeFuzzyValue(rawTargetKey, caseSensitive);
      const candidates = new Set<string>();
      for (const bigram of getBigrams(fuzzyTargetKey)) {
        for (const candidateKey of fuzzyKeyIndex.get(bigram) || []) {
          candidates.add(candidateKey);
        }
      }

      const bestCandidates: { key: string; score: number }[] = [];
      let bestScore = -1;
      const candidateKeys = fuzzyTargetKey.length < 5 ? fuzzyRowsByKey.keys() : candidates;
      for (const candidateKey of candidateKeys) {
        const maxLength = Math.max(fuzzyTargetKey.length, candidateKey.length);
        if (maxLength === 0) continue;
        const maxDistance = Math.floor((1 - threshold) * maxLength + 1e-9);
        const distance = levenshteinDistanceAtMost(fuzzyTargetKey, candidateKey, maxDistance);
        if (distance === null) continue;
        const score = 1 - distance / maxLength;
        if (score > bestScore) {
          bestScore = score;
          bestCandidates.length = 0;
          bestCandidates.push({ key: candidateKey, score });
        } else if (score === bestScore) {
          bestCandidates.push({ key: candidateKey, score });
        }
      }

      const bestRows = bestCandidates.flatMap(candidate => fuzzyRowsByKey.get(candidate.key) || []);
      if (bestRows.length === 1) {
        matchingSourceProps = bestRows[0];
      } else if (bestRows.length > 1) {
        const rankedRows = bestRows.map(properties => ({
          properties,
          sharedValueMatches: countSharedValueMatches(
            targetProps,
            properties,
            targetKeyField,
            sourceKeyField
          ),
        }));
        const highestSharedMatches = Math.max(...rankedRows.map(row => row.sharedValueMatches));
        const bestRowsByContext = rankedRows.filter(row => row.sharedValueMatches === highestSharedMatches);
        if (highestSharedMatches > 0 && bestRowsByContext.length === 1) {
          matchingSourceProps = bestRowsByContext[0].properties;
        }
      }

      fuzzyMatched = matchingSourceProps !== undefined;
    }

    if (matchingSourceProps) {
      matchedCount++;
      if (fuzzyMatched) fuzzyMatchedCount++;
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

  const isTargetNonSpatial = Boolean(targetDataset.isNonSpatial || targetDataset.geometryType === 'Unknown');
  const detectedCRS = targetDataset.detectedCRS || getCRSByCode('EPSG:4326')!;
  const bounds: [number, number, number, number] = isTargetNonSpatial
    ? [0, 0, 0, 0]
    : computeGeoJSONBounds(geojson);
  let fields = extractSchemaFields(geojson);
  if (fields.length === 0) {
    fields = [...targetDataset.fields];
  }
  const validationIssues = isTargetNonSpatial ? [] : validateDatasetGeometries(geojson, detectedCRS.code);

  const cleanName = outputName.trim() || `${targetDataset.name}_joined_${sourceDataset.name}`;
  const newDataset: SpatialDataset = {
    id: `ds-join-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    originalFileName: isTargetNonSpatial ? `${cleanName}.csv` : `${cleanName}.geojson`,
    format: isTargetNonSpatial ? targetDataset.format : 'geojson',
    sizeBytes: targetDataset.sizeBytes + Math.round(sourceDataset.sizeBytes * 0.4),
    featureCount: joinedFeatures.length,
    geometryType: isTargetNonSpatial ? 'Unknown' : targetDataset.geometryType,
    detectedCRS,
    crsStatus: isTargetNonSpatial ? 'verified' : (targetDataset.crsStatus || 'verified'),
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
    isNonSpatial: isTargetNonSpatial,
    primaryKeyColumn: targetDataset.primaryKeyColumn,
    tableComment: targetDataset.tableComment,
  };

  const sampleRows = joinedFeatures.slice(0, 8).map(f => f.properties || {});

  return {
    dataset: newDataset,
    targetCount,
    matchedCount,
    fuzzyMatchedCount,
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
    fuzzyMatchedCount: 0,
    unmatchedCount,
    matchPercentage,
    addedFieldCount: selectedSourceFields.length,
    sampleRows,
  };
}
