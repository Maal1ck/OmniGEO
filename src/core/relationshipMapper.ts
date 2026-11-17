/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpatialDataset,
  DatasetIdConfig,
  DefinedRelationship,
  RelationshipMatchMode,
  RelationshipCardinality,
} from '../types/gis';
import { reprojectGeoJSON } from './crsEngine';
import { extractSchemaFields } from './formatParsers';
import { DiscoveredGdbRelationship } from './fileGdbEngine';

export interface RelationshipMappingAudit {
  relationshipId: string;
  constraintName: string;
  parentName: string;
  childName: string;
  fkColumnName: string;
  matchMode: RelationshipMatchMode;
  totalChild: number;
  matched: number;
  unmatched: number;
  matchPercentage: number;
  sampleMappings: { childRowIndex: number; childPk: any; mappedFk: any }[];
}

export interface RelationshipExecutionResult {
  updatedDatasets: SpatialDataset[];
  updatedRelationships: DefinedRelationship[];
  audits: RelationshipMappingAudit[];
  totalPkGenerated: number;
  totalFkAssigned: number;
}

// ============================================================================
// PK ID Generation Helpers
// ============================================================================

function randomUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function slugToken(val: any): string {
  if (val === null || val === undefined) return 'REC';
  const s = String(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return s.slice(0, 6) || 'REC';
}

export function previewIdValue(
  config: DatasetIdConfig,
  rowIndex: number,
  props: Record<string, any> = {}
): string | number {
  const startAt = Number.isFinite(config.startAt) ? Number(config.startAt) : 1;
  const seq = startAt + rowIndex;
  const pad = Math.max(1, Math.min(12, config.padLength ?? 4));

  switch (config.strategy) {
    case 'keep_existing': {
      const existing = props[config.pkColumn];
      if (existing !== null && existing !== undefined && String(existing).trim() !== '') {
        return existing;
      }
      return seq;
    }
    case 'auto_increment':
      return seq;
    case 'prefixed_sequence': {
      const prefix = config.prefix ?? 'ID_';
      return `${prefix}${String(seq).padStart(pad, '0')}`;
    }
    case 'uuid':
      return randomUuidV4();
    case 'composite_hash': {
      const prefix = config.prefix ? `${config.prefix}-` : '';
      const srcVal = config.sourceField ? slugToken(props[config.sourceField]) : 'ENT';
      return `${prefix}${srcVal}-${String(seq).padStart(pad, '0')}`;
    }
    default:
      return seq;
  }
}

export function buildDefaultIdConfig(ds: SpatialDataset): DatasetIdConfig {
  const existingPk =
    ds.primaryKeyColumn ||
    ds.fields.find((f) => /^id$/i.test(f.name) || /^id_/i.test(f.name) || /_id$/i.test(f.name) || /^objectid$/i.test(f.name))?.name ||
    `id_${sanitizeIdentifier(ds.name).slice(0, 20)}`;

  const hasValues = (ds.geojson?.features || []).some(
    (f: any) => f.properties && f.properties[existingPk] !== null && f.properties[existingPk] !== undefined && String(f.properties[existingPk]).trim() !== ''
  );

  return {
    datasetId: ds.id,
    pkColumn: existingPk,
    strategy: hasValues ? 'keep_existing' : 'auto_increment',
    prefix: `${sanitizeIdentifier(ds.name).slice(0, 4).toUpperCase()}-`,
    startAt: 1,
    padLength: 4,
    sourceField: ds.fields.find((f) => f.type === 'string')?.name,
  };
}

export function sanitizeIdentifier(raw: string): string {
  return (raw || 'table')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '') || 'table';
}

export function defaultEndpointCardinalities(card: RelationshipCardinality = '1:N'): {
  sourceCardinality: string;
  targetCardinality: string;
} {
  switch (card) {
    case '1:1':
      return { sourceCardinality: '1..1', targetCardinality: '1..1' };
    case '0:1':
      return { sourceCardinality: '0..1', targetCardinality: '1..1' };
    case 'N:M':
      return { sourceCardinality: '0..n', targetCardinality: '0..n' };
    case '0:N':
      return { sourceCardinality: '0..n', targetCardinality: '0..1' };
    case 'N:1':
      return { sourceCardinality: '1..1', targetCardinality: '0..n' };
    case '1:N':
    default:
      return { sourceCardinality: '0..n', targetCardinality: '1..1' };
  }
}

// ============================================================================
// Geometry Predicates for Spatial FK Auto-Mapping
// ============================================================================

function getBBox(geom: any): [number, number, number, number] | null {
  if (!geom || !geom.coordinates) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (arr: any) => {
    if (!Array.isArray(arr)) return;
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      const [x, y] = arr;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    } else {
      for (const item of arr) walk(item);
    }
  };
  walk(geom.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function boxesOverlap(a?: [number, number, number, number], b?: [number, number, number, number]): boolean {
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function pointInRing(pt: [number, number], ring: number[][]): boolean {
  if (!ring || ring.length < 3) return false;
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt: [number, number], geom: any): boolean {
  if (!geom || !geom.coordinates) return false;
  if (geom.type === 'Polygon') {
    if (!geom.coordinates[0] || !pointInRing(pt, geom.coordinates[0])) return false;
    for (let h = 1; h < geom.coordinates.length; h++) {
      if (pointInRing(pt, geom.coordinates[h])) return false;
    }
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (poly[0] && pointInRing(pt, poly[0])) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (pointInRing(pt, poly[h])) {
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

function getRepresentativePoint(geom: any): [number, number] | null {
  if (!geom || !geom.coordinates) return null;
  if (geom.type === 'Point') {
    const [x, y] = geom.coordinates;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }
  if (geom.type === 'LineString' && geom.coordinates.length > 0) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    return [mid[0], mid[1]];
  }
  const bbox = getBBox(geom);
  if (!bbox) return null;
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function sampleVertices(geom: any, limit = 16): [number, number][] {
  const pts: [number, number][] = [];
  const walk = (arr: any) => {
    if (pts.length >= limit || !Array.isArray(arr)) return;
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      if (Number.isFinite(arr[0]) && Number.isFinite(arr[1])) pts.push([arr[0], arr[1]]);
    } else {
      for (const item of arr) walk(item);
    }
  };
  walk(geom?.coordinates);
  return pts;
}

function matchChildToParentSpatial(
  childGeom: any,
  indexedParents: { pkVal: any; geom: any; bbox: [number, number, number, number]; centroid: [number, number] | null }[],
  mode: RelationshipMatchMode
): any {
  if (!childGeom || indexedParents.length === 0) return null;
  const childBBox = getBBox(childGeom);
  const childCenter = getRepresentativePoint(childGeom);
  if (!childBBox || !childCenter) return null;

  if (mode === 'spatial_nearest') {
    let bestPk: any = null;
    let bestDistSq = Infinity;
    for (const p of indexedParents) {
      if (!p.centroid) continue;
      const dx = p.centroid[0] - childCenter[0];
      const dy = p.centroid[1] - childCenter[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestPk = p.pkVal;
      }
    }
    return bestPk;
  }

  for (const p of indexedParents) {
    if (!boxesOverlap(childBBox, p.bbox)) continue;

    const pIsPoly = p.geom?.type === 'Polygon' || p.geom?.type === 'MultiPolygon';
    if (pIsPoly) {
      if (pointInPolygon(childCenter, p.geom)) {
        return p.pkVal;
      }
      if (mode === 'spatial_intersects') {
        const verts = sampleVertices(childGeom, 12);
        if (verts.some((v) => pointInPolygon(v, p.geom))) {
          return p.pkVal;
        }
      }
    } else if (mode === 'spatial_intersects') {
      return p.pkVal;
    }
  }

  return null;
}

// ============================================================================
// Auto-Detect Candidate Relationships
// ============================================================================

function computeBBoxArea(b?: [number, number, number, number]): number {
  if (!b || b.length < 4) return 0;
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

export function autoDetectRelationships(
  datasets: SpatialDataset[],
  idConfigs: Record<string, DatasetIdConfig>,
  discoveredGdbRels: DiscoveredGdbRelationship[] = []
): DefinedRelationship[] {
  const results: DefinedRelationship[] = [];
  const seenPairs = new Set<string>();

  const getPk = (ds: SpatialDataset) => idConfigs[ds.id]?.pkColumn || ds.primaryKeyColumn || 'id';

  // 1. Honor any RelationshipClass discovered directly inside .gdb metadata
  for (const gdbRel of discoveredGdbRels) {
    const parent = datasets.find((d) => sanitizeIdentifier(d.name) === sanitizeIdentifier(gdbRel.originTable));
    const child = datasets.find((d) => sanitizeIdentifier(d.name) === sanitizeIdentifier(gdbRel.destinationTable));
    if (!parent || !child || parent.id === child.id) continue;
    const fkCol = gdbRel.originForeignKey || `id_${sanitizeIdentifier(parent.name)}`;
    const card: RelationshipCardinality = gdbRel.cardinality || '1:N';
    const ends = defaultEndpointCardinalities(card);
    const key = `${parent.id}->${child.id}:${fkCol}`;
    seenPairs.add(key);
    results.push({
      id: `rel-${Date.now()}-${results.length}`,
      constraintName: sanitizeIdentifier(gdbRel.name || `fk_${child.name}_${parent.name}`),
      parentDatasetId: parent.id,
      parentPkColumn: gdbRel.originPrimaryKey || getPk(parent),
      childDatasetId: child.id,
      fkColumnName: fkCol,
      cardinality: card,
      sourceCardinality: ends.sourceCardinality,
      targetCardinality: ends.targetCardinality,
      matchMode: gdbRel.originForeignKey ? 'attribute' : 'spatial_within',
      parentMatchField: gdbRel.originPrimaryKey || getPk(parent),
      childMatchField: gdbRel.originForeignKey,
      enabled: true,
    });
  }

  // 2. Attribute FK column name heuristics (_id, _fk, id_...)
  for (const child of datasets) {
    const childClean = sanitizeIdentifier(child.name);
    for (const parent of datasets) {
      if (child.id === parent.id) continue;
      const parentClean = sanitizeIdentifier(parent.name);
      const parentSingular = parentClean.replace(/s$/, '');
      const matchingField = child.fields.find((f) => {
        const fn = sanitizeIdentifier(f.name);
        return (
          fn === `${parentClean}_id` ||
          fn === `${parentSingular}_id` ||
          fn === `id_${parentClean}` ||
          fn === `id_${parentSingular}` ||
          fn === `${parentClean}_fk` ||
          fn === `${parentSingular}_fk` ||
          fn === `code_${parentSingular}_fk`
        );
      });

      if (matchingField) {
        const key = `${parent.id}->${child.id}:${matchingField.name}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const ends = defaultEndpointCardinalities('1:N');
        results.push({
          id: `rel-attr-${child.id}-${parent.id}-${results.length}`,
          constraintName: `fk_${childClean}_${sanitizeIdentifier(matchingField.name)}`,
          parentDatasetId: parent.id,
          parentPkColumn: getPk(parent),
          childDatasetId: child.id,
          fkColumnName: matchingField.name,
          cardinality: '1:N',
          sourceCardinality: ends.sourceCardinality,
          targetCardinality: ends.targetCardinality,
          matchMode: child.isNonSpatial || parent.isNonSpatial ? 'attribute' : 'spatial_within',
          parentMatchField: getPk(parent),
          childMatchField: matchingField.name,
          enabled: true,
        });
      }
    }
  }

  // 3. Spatial containment heuristics (Polygon Parent <-> Point/Line/Smaller Polygon Child)
  if (results.length === 0 && datasets.length >= 2) {
    const spatialPolys = datasets.filter(
      (d) => !d.isNonSpatial && (d.geometryType === 'Polygon' || d.geometryType === 'MultiPolygon')
    );

    for (const parent of spatialPolys) {
      const parentArea = computeBBoxArea(parent.bounds);
      const parentClean = sanitizeIdentifier(parent.name);
      const fkCol = `id_${parentClean.replace(/s$/, '')}`;

      for (const child of datasets) {
        if (child.id === parent.id || child.isNonSpatial) continue;
        const already = Array.from(seenPairs).some((k) => k.startsWith(`${parent.id}->${child.id}:`));
        if (already) continue;

        const childIsPoly = child.geometryType === 'Polygon' || child.geometryType === 'MultiPolygon';
        const childArea = computeBBoxArea(child.bounds);
        // Only treat Polygon as parent of Polygon if parent is larger container (fewer/larger features)
        if (childIsPoly && parentArea <= childArea * 1.05 && parent.featureCount >= child.featureCount) {
          continue;
        }

        if (boxesOverlap(parent.bounds, child.bounds)) {
          const key = `${parent.id}->${child.id}:${fkCol}`;
          seenPairs.add(key);
          const ends = defaultEndpointCardinalities('1:N');
          results.push({
            id: `rel-sp-${parent.id}-${child.id}-${results.length}`,
            constraintName: `fk_${sanitizeIdentifier(child.name)}_${parentClean}`,
            parentDatasetId: parent.id,
            parentPkColumn: getPk(parent),
            childDatasetId: child.id,
            fkColumnName: fkCol,
            cardinality: '1:N',
            sourceCardinality: ends.sourceCardinality,
            targetCardinality: ends.targetCardinality,
            matchMode: 'spatial_within',
            enabled: true,
          });
        }
      }
    }
  }

  return results;
}

// ============================================================================
// Pipeline Execution: Generate IDs first, then Auto-Map Foreign Key Columns
// ============================================================================

export function applyIdsAndForeignKeyMapping(
  datasets: SpatialDataset[],
  idConfigs: Record<string, DatasetIdConfig>,
  relationships: DefinedRelationship[]
): RelationshipExecutionResult {
  let totalPkGenerated = 0;
  let totalFkAssigned = 0;

  // Clone datasets & GeoJSON features cleanly
  const clonedDatasets: SpatialDataset[] = datasets.map((ds) => ({
    ...ds,
    geojson: {
      type: 'FeatureCollection',
      features: (ds.geojson?.features || []).map((f: any) => ({
        ...f,
        properties: { ...(f.properties || {}) },
      })),
    },
  }));

  const dsById = new Map<string, SpatialDataset>();
  clonedDatasets.forEach((d) => dsById.set(d.id, d));

  // Step 1: Generate Primary Keys on every configured table first
  for (const ds of clonedDatasets) {
    const cfg = idConfigs[ds.id];
    if (!cfg || !cfg.pkColumn.trim()) continue;
    const pkCol = cfg.pkColumn.trim();
    const features = ds.geojson.features || [];

    for (let i = 0; i < features.length; i++) {
      const feat = features[i];
      const nextVal = previewIdValue(cfg, i, feat.properties);
      feat.properties[pkCol] = nextVal;
      totalPkGenerated++;
    }

    ds.primaryKeyColumn = pkCol;
    ds.fields = extractSchemaFields(ds.geojson);
  }

  // Step 2: Execute Foreign Key Mapping for each enabled relationship
  const audits: RelationshipMappingAudit[] = [];
  const updatedRelationships: DefinedRelationship[] = [];

  for (const rel of relationships) {
    if (!rel.enabled) {
      updatedRelationships.push(rel);
      continue;
    }

    const parent = dsById.get(rel.parentDatasetId);
    const child = dsById.get(rel.childDatasetId);
    if (!parent || !child) {
      updatedRelationships.push(rel);
      continue;
    }

    const fkCol = rel.fkColumnName.trim() || `id_${sanitizeIdentifier(parent.name)}`;
    const parentPkCol = rel.parentPkColumn.trim() || parent.primaryKeyColumn || 'id';
    const childFeatures = child.geojson.features || [];
    const parentFeatures = parent.geojson.features || [];

    let matched = 0;
    const sampleMappings: RelationshipMappingAudit['sampleMappings'] = [];

    if (rel.matchMode === 'attribute') {
      const pMatchField = rel.parentMatchField?.trim() || parentPkCol;
      const cMatchField = rel.childMatchField?.trim() || fkCol;

      const parentLookup = new Map<string, any>();
      for (const pf of parentFeatures) {
        const rawKey = pf.properties?.[pMatchField];
        if (rawKey === null || rawKey === undefined) continue;
        const normKey = String(rawKey).trim().toLowerCase();
        if (normKey && !parentLookup.has(normKey)) {
          parentLookup.set(normKey, pf.properties?.[parentPkCol] ?? rawKey);
        }
      }

      for (let idx = 0; idx < childFeatures.length; idx++) {
        const cf = childFeatures[idx];
        const rawChildKey = cf.properties?.[cMatchField];
        const normChildKey =
          rawChildKey !== null && rawChildKey !== undefined
            ? String(rawChildKey).trim().toLowerCase()
            : '';
        const matchedParentPk = normChildKey ? parentLookup.get(normChildKey) ?? null : null;
        cf.properties[fkCol] = matchedParentPk;

        if (matchedParentPk !== null) {
          matched++;
          totalFkAssigned++;
        }
        if (sampleMappings.length < 6) {
          sampleMappings.push({
            childRowIndex: idx + 1,
            childPk: cf.properties?.[child.primaryKeyColumn || 'id'] ?? idx + 1,
            mappedFk: matchedParentPk,
          });
        }
      }
    } else {
      // Spatial matching (reproject child to parent CRS if needed)
      const parentCrs = parent.detectedCRS?.code || 'EPSG:4326';
      const childCrs = child.detectedCRS?.code || 'EPSG:4326';
      let reprojectedChildFeatures = childFeatures;
      if (parentCrs !== childCrs) {
        try {
          const reproj = reprojectGeoJSON(child.geojson, childCrs, parentCrs);
          if (reproj?.geojson?.features?.length === childFeatures.length) {
            reprojectedChildFeatures = reproj.geojson.features;
          }
        } catch {
          // Fallback to raw coordinates if projection transforms aren't registered
        }
      }

      const indexedParents = parentFeatures
        .map((pf: any) => {
          const bbox = getBBox(pf.geometry);
          if (!bbox) return null;
          return {
            pkVal: pf.properties?.[parentPkCol] ?? pf.id ?? null,
            geom: pf.geometry,
            bbox,
            centroid: getRepresentativePoint(pf.geometry),
          };
        })
        .filter((x: { pkVal: any; geom: any; bbox: [number, number, number, number]; centroid: [number, number] | null } | null): x is { pkVal: any; geom: any; bbox: [number, number, number, number]; centroid: [number, number] | null } => x !== null);

      for (let idx = 0; idx < childFeatures.length; idx++) {
        const cf = childFeatures[idx];
        const geomForTest = reprojectedChildFeatures[idx]?.geometry;
        const matchedParentPk = matchChildToParentSpatial(geomForTest, indexedParents, rel.matchMode);
        cf.properties[fkCol] = matchedParentPk;

        if (matchedParentPk !== null && matchedParentPk !== undefined) {
          matched++;
          totalFkAssigned++;
        }
        if (sampleMappings.length < 6) {
          sampleMappings.push({
            childRowIndex: idx + 1,
            childPk: cf.properties?.[child.primaryKeyColumn || 'id'] ?? idx + 1,
            mappedFk: matchedParentPk,
          });
        }
      }
    }

    child.fields = extractSchemaFields(child.geojson);

    const totalChild = childFeatures.length;
    const unmatched = Math.max(0, totalChild - matched);
    const matchPercentage = totalChild > 0 ? Math.round((matched / totalChild) * 100) : 0;

    const stats = { totalChild, matched, unmatched, matchPercentage };
    audits.push({
      relationshipId: rel.id,
      constraintName: rel.constraintName,
      parentName: parent.name,
      childName: child.name,
      fkColumnName: fkCol,
      matchMode: rel.matchMode,
      ...stats,
      sampleMappings,
    });

    updatedRelationships.push({
      ...rel,
      lastStats: stats,
    });
  }

  return {
    updatedDatasets: clonedDatasets,
    updatedRelationships,
    audits,
    totalPkGenerated,
    totalFkAssigned,
  };
}
