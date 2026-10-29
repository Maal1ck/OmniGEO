import { GeometryType, ValidationIssue } from '../types/gis';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeGeoJSONBounds(geojson: any): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function processCoords(coords: any): void {
    if (!coords || !Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0];
      const y = coords[1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    } else {
      for (const item of coords) {
        processCoords(item);
      }
    }
  }

  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);
  for (const f of features) {
    if (f.geometry && f.geometry.coordinates) {
      processCoords(f.geometry.coordinates);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return [-180, -90, 180, 90];
  }
  return [minX, minY, maxX, maxY];
}

export function detectGeometryType(geojson: any): GeometryType {
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);
  if (!features.length) return 'Unknown';

  const typeCounts: Record<string, number> = {};
  for (const f of features) {
    const t = f?.geometry?.type || 'Unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const types = Object.keys(typeCounts);
  if (types.length === 1) return types[0] as GeometryType;
  if (types.length > 1) return 'GeometryCollection';
  return 'Unknown';
}

export function validateDatasetGeometries(
  geojson: any,
  crsCode?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);

  if (!features || features.length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_DATASET',
      message: 'Dataset contains zero spatial features.',
    });
    return issues;
  }

  const isWgs84 = crsCode === 'EPSG:4326' || !crsCode;
  let emptyGeometryCount = 0;
  let outOfBoundsCount = 0;
  let unclosedRingCount = 0;
  let degenerateCount = 0;
  let nanCoordCount = 0;

  function checkCoordinates(coords: any, depth = 0): { hasNan: boolean } {
    let hasNan = false;
    if (!coords || !Array.isArray(coords)) return { hasNan: true };

    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords;
      if (!Number.isFinite(x) || !Number.isFinite(y) || Number.isNaN(x) || Number.isNaN(y)) {
        hasNan = true;
      } else if (isWgs84) {
        if (x < -180.5 || x > 180.5 || y < -90.5 || y > 90.5) {
          outOfBoundsCount++;
        }
      }
    } else {
      for (const sub of coords) {
        const res = checkCoordinates(sub, depth + 1);
        if (res.hasNan) hasNan = true;
      }
    }
    return { hasNan };
  }

  features.forEach((feature: any, idx: number) => {
    if (!feature || !feature.geometry) {
      emptyGeometryCount++;
      return;
    }

    const { type, coordinates } = feature.geometry;
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      emptyGeometryCount++;
      return;
    }

    const { hasNan } = checkCoordinates(coordinates);
    if (hasNan) nanCoordCount++;

    if (type === 'Polygon') {
      for (const ring of coordinates) {
        if (!Array.isArray(ring) || ring.length < 4) {
          degenerateCount++;
        } else {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first && last && (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7)) {
            unclosedRingCount++;
          }
        }
      }
    } else if (type === 'MultiPolygon') {
      for (const poly of coordinates) {
        for (const ring of poly) {
          if (!Array.isArray(ring) || ring.length < 4) {
            degenerateCount++;
          } else {
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first && last && (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7)) {
              unclosedRingCount++;
            }
          }
        }
      }
    }
  });

  if (emptyGeometryCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'EMPTY_GEOMETRIES',
      message: `${emptyGeometryCount} feature(s) contain null or empty geometries.`,
    });
  }

  if (nanCoordCount > 0) {
    issues.push({
      severity: 'error',
      code: 'NAN_COORDINATES',
      message: `${nanCoordCount} feature(s) have invalid NaN or Infinite coordinate numbers.`,
    });
  }

  if (outOfBoundsCount > 0 && isWgs84) {
    issues.push({
      severity: 'error',
      code: 'CRS_COORDINATE_MISMATCH',
      message: `${outOfBoundsCount} coordinate(s) are outside valid geographic latitude [-90, 90] / longitude [-180, 180] limits. Possible projected CRS misidentified as WGS84.`,
    });
  }

  if (unclosedRingCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'UNCLOSED_POLYGON_RING',
      message: `${unclosedRingCount} polygon ring(s) are unclosed (first and last vertex do not match).`,
    });
  }

  if (degenerateCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'DEGENERATE_GEOMETRY',
      message: `${degenerateCount} polygon ring(s) have fewer than the required 4 vertices.`,
    });
  }

  return issues;
}
