import proj4 from 'proj4';
import { getCRSByCode } from './crsDefinitions';

export interface ReprojectionResult {
  geojson: any;
  featuresTransformed: number;
  warnings: string[];
}

/**
 * Transforms coordinates between two CRSs using Proj4
 */
export function reprojectCoordinate(
  coord: [number, number, ...number[]],
  fromCRS: string,
  toCRS: string
): [number, number, ...number[]] {
  if (fromCRS === toCRS) return coord;

  const [x, y, ...rest] = coord;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid coordinate [${x}, ${y}]`);
  }

  const p = proj4(fromCRS, toCRS, [x, y]);
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
    throw new Error(`Reprojection resulted in non-finite coordinates from ${fromCRS} to ${toCRS}`);
  }

  // Round to 7 decimal places for geographic or 3 for projected to avoid floating noise
  const toInfo = getCRSByCode(toCRS);
  const precision = toInfo?.isGeographic ? 7 : 3;
  const rx = Number(p[0].toFixed(precision));
  const ry = Number(p[1].toFixed(precision));

  return [rx, ry, ...rest];
}

/**
 * Recursively reprojects coordinates of any geometry level
 */
function transformCoordsDeep(
  coords: any,
  fromCRS: string,
  toCRS: string,
  warnings: string[]
): any {
  if (!coords || !Array.isArray(coords)) return coords;

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    try {
      return reprojectCoordinate(coords as [number, number], fromCRS, toCRS);
    } catch (err: any) {
      if (warnings.length < 5) {
        warnings.push(`Coordinate transform error: ${err.message}`);
      }
      return coords;
    }
  }

  return coords.map((c: any) => transformCoordsDeep(c, fromCRS, toCRS, warnings));
}

/**
 * Reprojects an entire GeoJSON FeatureCollection
 */
export function reprojectGeoJSON(
  geojson: any,
  fromCRS: string,
  toCRS: string
): ReprojectionResult {
  const warnings: string[] = [];
  if (!geojson) {
    return { geojson: null, featuresTransformed: 0, warnings: ['Null GeoJSON passed'] };
  }

  if (fromCRS === toCRS) {
    return { geojson, featuresTransformed: geojson.features?.length || 0, warnings: [] };
  }

  const fromInfo = getCRSByCode(fromCRS);
  const toInfo = getCRSByCode(toCRS);

  for (const warning of new Set([
    fromInfo?.transformationWarning,
    toInfo?.transformationWarning,
  ].filter((value): value is string => !!value))) {
    warnings.push(warning);
  }

  if (!fromInfo) {
    warnings.push(`Source CRS ${fromCRS} definition not found in registry. Using standard fallback.`);
  }
  if (!toInfo) {
    warnings.push(`Target CRS ${toCRS} definition not found in registry. Using standard fallback.`);
  }

  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  let count = 0;

  const transformedFeatures = features.map((f: any) => {
    if (!f || !f.geometry) return f;
    count++;
    const transformGeometry = (geometry: any): any => {
      if (!geometry) return geometry;
      if (geometry.type === 'GeometryCollection') {
        return {
          ...geometry,
          geometries: geometry.geometries.map(transformGeometry),
        };
      }
      return {
        ...geometry,
        coordinates: transformCoordsDeep(geometry.coordinates, fromCRS, toCRS, warnings),
      };
    };

    return {
      ...f,
      geometry: transformGeometry(f.geometry),
    };
  });

  return {
    geojson: {
      type: 'FeatureCollection',
      features: transformedFeatures,
    },
    featuresTransformed: count,
    warnings,
  };
}
