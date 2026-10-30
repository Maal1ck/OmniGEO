import { Database } from 'sql.js';
import { getCRSByCode } from './crsDefinitions';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';
import { getSqlJs } from './sqlJs';
import { SpatialDataset, ValidationIssue } from '../types/gis';

interface WkbGeometry {
  type: string;
  coordinates?: unknown[];
  geometries?: WkbGeometry[];
}

const envelopeSizes = [0, 4, 6, 6, 8];

function readWkbGeometry(view: DataView, state: { offset: number }): WkbGeometry {
  if (state.offset + 5 > view.byteLength) {
    throw new Error('Geometry data is truncated.');
  }

  const byteOrder = view.getUint8(state.offset++);
  if (byteOrder !== 0 && byteOrder !== 1) {
    throw new Error('Geometry uses an invalid byte order.');
  }
  const littleEndian = byteOrder === 1;
  const encodedType = view.getUint32(state.offset, littleEndian);
  state.offset += 4;

  const hasZ = (encodedType & 0x80000000) !== 0;
  const hasM = (encodedType & 0x40000000) !== 0;
  const hasSrid = (encodedType & 0x20000000) !== 0;
  const typeCode = encodedType & 0x1fffffff;
  const dimensionalCode = typeCode >= 3000 ? 3000 : typeCode >= 2000 ? 2000 : typeCode >= 1000 ? 1000 : 0;
  const baseType = typeCode - dimensionalCode;
  const dimensions = 2 + (hasZ || dimensionalCode === 1000 || dimensionalCode === 3000 ? 1 : 0)
    + (hasM || dimensionalCode === 2000 || dimensionalCode === 3000 ? 1 : 0);

  if (hasSrid) {
    if (state.offset + 4 > view.byteLength) throw new Error('Geometry SRID is truncated.');
    state.offset += 4;
  }

  const readCount = () => {
    if (state.offset + 4 > view.byteLength) throw new Error('Geometry data is truncated.');
    const count = view.getUint32(state.offset, littleEndian);
    state.offset += 4;
    return count;
  };

  const readPoint = (): number[] => {
    if (state.offset + dimensions * 8 > view.byteLength) throw new Error('Geometry coordinates are truncated.');
    const point: number[] = [];
    for (let dimension = 0; dimension < dimensions; dimension++) {
      point.push(view.getFloat64(state.offset, littleEndian));
      state.offset += 8;
    }
    return point;
  };

  const readPoints = (): number[][] => {
    const count = readCount();
    if (count > Math.floor((view.byteLength - state.offset) / (dimensions * 8))) {
      throw new Error('Geometry coordinate count is invalid.');
    }
    return Array.from({ length: count }, readPoint);
  };

  switch (baseType) {
    case 1:
      return { type: 'Point', coordinates: readPoint() };
    case 2:
      return { type: 'LineString', coordinates: readPoints() };
    case 3: {
      const count = readCount();
      const coordinates = [];
      for (let ring = 0; ring < count; ring++) coordinates.push(readPoints());
      return { type: 'Polygon', coordinates };
    }
    case 4:
    case 5:
    case 6: {
      const count = readCount();
      const childType = baseType === 4 ? 'Point' : baseType === 5 ? 'LineString' : 'Polygon';
      const coordinates: unknown[] = [];
      for (let index = 0; index < count; index++) {
        const child = readWkbGeometry(view, state);
        if (child.type !== childType) throw new Error('Geometry collection contains an unexpected type.');
        coordinates.push(child.coordinates);
      }
      return {
        type: baseType === 4 ? 'MultiPoint' : baseType === 5 ? 'MultiLineString' : 'MultiPolygon',
        coordinates,
      };
    }
    case 7: {
      const count = readCount();
      const geometries = [];
      for (let index = 0; index < count; index++) geometries.push(readWkbGeometry(view, state));
      return { type: 'GeometryCollection', geometries };
    }
    default:
      throw new Error(`Unsupported geometry type ${baseType}.`);
  }
}

function parseGeoPackageGeometry(blob: Uint8Array | null): WkbGeometry | null {
  if (!blob) return null;
  if (blob.byteLength < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) {
    throw new Error('Feature has an invalid GeoPackage geometry header.');
  }
  if (blob[2] !== 0) throw new Error(`Unsupported GeoPackage geometry version ${blob[2]}.`);

  const flags = blob[3];
  if (flags & 0x10) return null;
  const envelopeIndicator = (flags >> 1) & 0x07;
  const envelopeSize = envelopeSizes[envelopeIndicator];
  if (envelopeSize === undefined) throw new Error('Feature has an invalid GeoPackage geometry envelope.');

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const state = { offset: 8 + envelopeSize * 8 };
  if (state.offset > view.byteLength) throw new Error('Feature has a truncated GeoPackage geometry envelope.');

  return readWkbGeometry(view, state);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function createDataset(
  fileName: string,
  fileSize: number,
  layer: { tableName: string; identifier: string; geometryColumn: string; srsId: number },
  rows: Record<string, unknown>[],
  propertyNames: string[],
  issues: ValidationIssue[],
): SpatialDataset {
  const geojson = {
    type: 'FeatureCollection',
    features: rows.map(row => ({
      type: 'Feature',
      geometry: parseGeoPackageGeometry(row[layer.geometryColumn] as Uint8Array | null),
      properties: Object.fromEntries(propertyNames.map(name => [name, row[name] ?? null])),
    })),
  };
  const srs = getCRSByCode(`EPSG:${layer.srsId}`);
  const validationIssues = [
    ...issues,
    ...validateDatasetGeometries(geojson, srs?.code),
  ];

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: layer.identifier || layer.tableName,
    originalFileName: fileName,
    format: 'geopackage',
    sizeBytes: fileSize,
    featureCount: geojson.features.length,
    geometryType: detectGeometryType(geojson),
    detectedCRS: srs,
    crsStatus: srs ? 'verified' : 'missing',
    bounds: computeGeoJSONBounds(geojson),
    fields: extractSchemaFields(geojson),
    geojson,
    validationIssues,
    status: validationIssues.some(issue => issue.severity === 'error')
      ? 'invalid'
      : validationIssues.length > 0 || !srs ? 'warning' : 'ready',
    addedAt: Date.now(),
  };
}

function readRows(db: Database, sql: string): Record<string, unknown>[] {
  const statement = db.prepare(sql);
  const rows: Record<string, unknown>[] = [];
  try {
    while (statement.step()) rows.push(statement.getAsObject() as Record<string, unknown>);
  } finally {
    statement.free();
  }
  return rows;
}

export async function parseGeoPackage(
  content: ArrayBuffer,
  fileName: string,
  fileSize: number,
): Promise<SpatialDataset[]> {
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(content));

  try {
    const tables = readRows(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    const tableNames = new Set(tables.map(table => String(table.name)));
    if (!tableNames.has('gpkg_contents') || !tableNames.has('gpkg_geometry_columns')) {
      throw new Error('The selected SQLite file is not a valid GeoPackage.');
    }

    const layers = readRows(
      db,
      `SELECT c.table_name, c.identifier, g.column_name, g.srs_id
       FROM gpkg_contents c
       JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
       WHERE c.data_type = 'features'`,
    );
    if (layers.length === 0) {
      throw new Error('This GeoPackage contains no vector feature layers.');
    }

    const datasets = layers.map(layer => {
      const tableName = String(layer.table_name);
      const geometryColumn = String(layer.column_name);
      if (!tableNames.has(tableName)) {
        throw new Error(`GeoPackage layer "${tableName}" is missing its feature table.`);
      }

      const columns = readRows(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
      if (!columns.some(column => column.name === geometryColumn)) {
        throw new Error(`GeoPackage layer "${tableName}" is missing its geometry column.`);
      }
      const propertyNames = columns
        .map(column => String(column.name))
        .filter(name => name !== geometryColumn);
      const rows = readRows(
        db,
        `SELECT * FROM ${quoteIdentifier(tableName)}`,
      );
      const srsId = Number(layer.srs_id);
      const issues: ValidationIssue[] = [];
      if (!getCRSByCode(`EPSG:${srsId}`)) {
        issues.push({
          severity: 'warning',
          code: 'UNKNOWN_GPKG_CRS',
          message: `The GeoPackage layer uses SRS ${srsId}, which is not in the built-in CRS registry.`,
        });
      }

      return createDataset(
        fileName,
        fileSize,
        {
          tableName,
          identifier: String(layer.identifier || ''),
          geometryColumn,
          srsId,
        },
        rows,
        propertyNames,
        issues,
      );
    });

    return datasets;
  } finally {
    db.close();
  }
}
