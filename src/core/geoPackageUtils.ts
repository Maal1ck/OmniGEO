export type GeoPackageColumnType = 'TEXT' | 'REAL' | 'INTEGER';

export interface GeoPackagePropertyColumn {
  sourceName: string;
  name: string;
  type: GeoPackageColumnType | null;
}

const geometryTypeCodes: Record<string, number> = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7,
};

function isCoordinate(value: unknown): value is number[] {
  return Array.isArray(value)
    && typeof value[0] === 'number'
    && Number.isFinite(value[0])
    && typeof value[1] === 'number'
    && Number.isFinite(value[1]);
}

function hasGeometryCoordinates(geometry: any): boolean {
  if (!geometry) return false;
  if (geometry.type === 'GeometryCollection') {
    return Array.isArray(geometry.geometries)
      && geometry.geometries.some(hasGeometryCoordinates);
  }

  const visit = (coordinates: any): boolean => {
    if (!Array.isArray(coordinates)) return false;
    if (isCoordinate(coordinates)) return true;
    return coordinates.some(visit);
  };
  return visit(geometry.coordinates);
}

export function getGeoPackageGeometryTypeName(features: any[]): string {
  const geometryTypes = new Set(
    features
      .map(feature => feature?.geometry?.type)
      .filter((type): type is string => !!type)
      .map(type => type.toUpperCase())
  );
  return geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'GEOMETRY';
}

export function getGeoPackageBounds(features: any[]): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visitCoordinates = (coordinates: any): void => {
    if (!Array.isArray(coordinates)) return;
    if (isCoordinate(coordinates)) {
      minX = Math.min(minX, coordinates[0]);
      minY = Math.min(minY, coordinates[1]);
      maxX = Math.max(maxX, coordinates[0]);
      maxY = Math.max(maxY, coordinates[1]);
      return;
    }
    coordinates.forEach(visitCoordinates);
  };

  const visitGeometry = (geometry: any): void => {
    if (geometry?.type === 'GeometryCollection') {
      geometry.geometries?.forEach(visitGeometry);
    } else {
      visitCoordinates(geometry?.coordinates);
    }
  };

  features.forEach(feature => visitGeometry(feature?.geometry));
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function encodeGeoPackageGeometry(geometry: any, srsId: number): Uint8Array | null {
  if (!hasGeometryCoordinates(geometry)) return null;

  const wkb: number[] = [];
  const writeByte = (value: number): void => {
    wkb.push(value & 0xff);
  };
  const writeInt32 = (value: number): void => {
    wkb.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
  };
  const writeDouble = (value: number): void => {
    if (!Number.isFinite(value)) throw new Error('GeoPackage export encountered a non-finite coordinate.');
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    wkb.push(...new Uint8Array(buffer));
  };
  const writePoint = (coordinate: unknown): void => {
    if (!isCoordinate(coordinate)) {
      throw new Error('GeoPackage export encountered an invalid coordinate pair.');
    }
    writeDouble(coordinate[0]);
    writeDouble(coordinate[1]);
  };
  const writeLineString = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('GeoPackage export requires at least two points for a LineString.');
    }
    writeInt32(coordinates.length);
    coordinates.forEach(writePoint);
  };
  const writePolygon = (rings: unknown): void => {
    if (!Array.isArray(rings) || rings.length === 0) {
      throw new Error('GeoPackage export requires at least one ring for a Polygon.');
    }
    writeInt32(rings.length);
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error('GeoPackage export requires polygon rings with at least four points.');
      }
      writeInt32(ring.length);
      ring.forEach(writePoint);
    }
  };
  const writeGeometry = (item: any): void => {
    const typeCode = geometryTypeCodes[item?.type];
    if (!typeCode) throw new Error(`GeoPackage export does not support geometry type "${item?.type}".`);

    writeByte(1);
    writeInt32(typeCode);
    switch (item.type) {
      case 'Point':
        writePoint(item.coordinates);
        break;
      case 'LineString':
        writeLineString(item.coordinates);
        break;
      case 'Polygon':
        writePolygon(item.coordinates);
        break;
      case 'MultiPoint':
        if (!Array.isArray(item.coordinates)) throw new Error('Invalid MultiPoint coordinates.');
        writeInt32(item.coordinates.length);
        item.coordinates.forEach((point: unknown) => {
          writeByte(1);
          writeInt32(1);
          writePoint(point);
        });
        break;
      case 'MultiLineString':
        if (!Array.isArray(item.coordinates)) throw new Error('Invalid MultiLineString coordinates.');
        writeInt32(item.coordinates.length);
        item.coordinates.forEach((line: unknown) => {
          writeByte(1);
          writeInt32(2);
          writeLineString(line);
        });
        break;
      case 'MultiPolygon':
        if (!Array.isArray(item.coordinates)) throw new Error('Invalid MultiPolygon coordinates.');
        writeInt32(item.coordinates.length);
        item.coordinates.forEach((polygon: unknown) => {
          writeByte(1);
          writeInt32(3);
          writePolygon(polygon);
        });
        break;
      case 'GeometryCollection': {
        const geometries = Array.isArray(item.geometries)
          ? item.geometries.filter(hasGeometryCoordinates)
          : [];
        writeInt32(geometries.length);
        geometries.forEach(writeGeometry);
        break;
      }
    }
  };

  writeGeometry(geometry);
  const header = new Uint8Array(8);
  header.set([0x47, 0x50, 0x00, 0x01]);
  new DataView(header.buffer).setInt32(4, srsId, true);

  const result = new Uint8Array(header.length + wkb.length);
  result.set(header, 0);
  result.set(wkb, header.length);
  return result;
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  const withFallback = sanitized || 'layer';
  return /^\d/.test(withFallback) ? `layer_${withFallback}` : withFallback;
}

export function getUniqueGeoPackageLayerNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map(name => {
    const base = sanitizeIdentifier(name);
    let unique = base;
    let suffix = 2;
    while (used.has(unique.toLowerCase())) {
      unique = `${base}_${suffix++}`;
    }
    used.add(unique.toLowerCase());
    return unique;
  });
}

export function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function inferColumnType(value: unknown): GeoPackageColumnType {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  }
  return 'TEXT';
}

export function getGeoPackagePropertyColumns(
  features: any[],
  reservedNames: string[] = ['id', 'geom']
): GeoPackagePropertyColumn[] {
  const usedNames = new Set(reservedNames.map(name => name.toLowerCase()));
  const columns = new Map<string, GeoPackagePropertyColumn>();

  for (const feature of features) {
    for (const [sourceName, value] of Object.entries(feature?.properties || {})) {
      let column = columns.get(sourceName);
      if (!column) {
        const base = sanitizeIdentifier(sourceName);
        let name = base;
        let suffix = 2;
        while (usedNames.has(name.toLowerCase())) {
          name = `${base}_${suffix++}`;
        }
        usedNames.add(name.toLowerCase());
        const type = value === null || value === undefined
          || (typeof value === 'string' && value.trim() === '')
          ? null
          : inferColumnType(value);
        column = { sourceName, name, type };
        columns.set(sourceName, column);
        continue;
      }

      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) continue;
      const nextType = inferColumnType(value);
      if (column.type === null) {
        column.type = nextType;
      } else if (column.type === 'TEXT' || nextType === 'TEXT') {
        column.type = 'TEXT';
      } else if (column.type === 'REAL' || nextType === 'REAL') {
        column.type = 'REAL';
      }
    }
  }

  return Array.from(columns.values());
}

export function toGeoPackageValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value) ?? String(value);
  }
  return typeof value === 'string' || typeof value === 'number' ? value : String(value);
}
