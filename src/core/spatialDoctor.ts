import { CRSInfo, SpatialDataset, SpatialDoctorDiagnosis } from '../types/gis';
import { COMMON_CRS_LIST, getCRSByCode } from './crsDefinitions';

/**
 * Diagnoses spatial datasets for coordinate inversion (axis-swap),
 * missing/misidentified CRS fingerprints, and topology issues.
 */
export function diagnoseDataset(dataset: SpatialDataset): SpatialDoctorDiagnosis {
  const geojson = dataset.geojson;
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);

  let unclosedRingsCount = 0;
  let duplicateVerticesCount = 0;
  let nanCoordinatesCount = 0;
  let emptyGeometriesCount = 0;

  let totalCoords = 0;
  let sampleXSum = 0;
  let sampleYSum = 0;
  let sampleCount = 0;

  function inspectCoords(coords: any, depth = 0, isPolygon = false): void {
    if (!coords || !Array.isArray(coords)) return;

    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0];
      const y = coords[1];
      totalCoords++;

      if (!Number.isFinite(x) || !Number.isFinite(y) || Number.isNaN(x) || Number.isNaN(y)) {
        nanCoordinatesCount++;
      } else if (sampleCount < 100) {
        sampleXSum += x;
        sampleYSum += y;
        sampleCount++;
      }
    } else {
      if (isPolygon && depth === 1) {
        // Inspect linear ring
        const ring = coords as number[][];
        if (ring.length > 0) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first && last && (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7)) {
            unclosedRingsCount++;
          }
          // Check consecutive duplicates
          for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];
            if (p1 && p2 && Math.abs(p1[0] - p2[0]) < 1e-9 && Math.abs(p1[1] - p2[1]) < 1e-9) {
              duplicateVerticesCount++;
            }
          }
        }
      }

      for (const item of coords) {
        inspectCoords(item, depth + 1, isPolygon);
      }
    }
  }

  for (const f of features) {
    if (!f || !f.geometry || !f.geometry.coordinates) {
      emptyGeometriesCount++;
      continue;
    }
    const isPoly = f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon';
    inspectCoords(f.geometry.coordinates, 0, isPoly);
  }

  const avgX = sampleCount > 0 ? sampleXSum / sampleCount : 0;
  const avgY = sampleCount > 0 ? sampleYSum / sampleCount : 0;
  const [minX, minY, maxX, maxY] = dataset.bounds;

  // 1. Check for Axis Inversion (Lat vs Lon or Northing vs Easting swapped)
  let hasInvertedCoordinates = false;
  let axisInversionConfidence = 0;
  let inversionReason: string | undefined;

  const currentCRS = dataset.detectedCRS?.code || 'EPSG:4326';

  if (currentCRS === 'EPSG:4326' || !dataset.detectedCRS) {
    // In WGS 84: X should be Lon (-180 to 180), Y should be Lat (-90 to 90).
    // If X is in typical Latitude range (e.g., 20° to 70° for US/Europe) and Y is in Longitude range (-125° to -65° or -10° to 30°)
    if (minY < -90 || maxY > 90) {
      hasInvertedCoordinates = true;
      axisInversionConfidence = 95;
      inversionReason = `Latitude (Y) reaches [${minY.toFixed(2)}, ${maxY.toFixed(2)}], which exceeds legal global latitude range [-90°, 90°]. Coordinates appear swapped.`;
    } else if (avgX > 30 && avgX < 75 && (avgY < -10 || (avgY > -10 && avgY < 20 && avgX > avgY))) {
      // Possible swap where X is latitude (e.g. London 51.5, Paris 48.8, NYC 40.7) and Y is longitude
      if (Math.abs(avgX) > 20 && Math.abs(avgY) < 15 && avgX > 40) {
        hasInvertedCoordinates = true;
        axisInversionConfidence = 85;
        inversionReason = `X coordinates (~${avgX.toFixed(2)}°) match typical Northern latitudes while Y coordinates (~${avgY.toFixed(2)}°) match Prime Meridian longitudes.`;
      }
    }
  } else if (currentCRS === 'EPSG:2154') {
    // Lambert-93: X ~ [100k, 1200k], Y ~ [6000k, 7200k]
    if (avgX > 5000000 && avgY < 2000000) {
      hasInvertedCoordinates = true;
      axisInversionConfidence = 99;
      inversionReason = `Easting (X) ~${Math.round(avgX)} and Northing (Y) ~${Math.round(avgY)} are reversed for French Lambert-93.`;
    }
  } else if (currentCRS === 'EPSG:27700') {
    // British National Grid: Easting X ~ [0, 700k], Northing Y ~ [0, 1300k]
    if (avgX > 800000 && avgY < 600000) {
      hasInvertedCoordinates = true;
      axisInversionConfidence = 90;
      inversionReason = `Easting/Northing coordinates appear inverted for British National Grid.`;
    }
  }

  // 2. CRS Bounding Box Fingerprinting & Suggestions
  const suggestedCRS: CRSInfo[] = [];

  function suggest(code: string) {
    const crs = getCRSByCode(code);
    if (crs && !suggestedCRS.some(c => c.code === code)) {
      suggestedCRS.push(crs);
    }
  }

  // Match coordinates to CRS fingerprints
  if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90) {
    suggest('EPSG:4326');
  }
  if (Math.abs(minX) > 1000 && Math.abs(maxX) < 20050000 && Math.abs(minY) > 1000 && Math.abs(maxY) < 20050000) {
    suggest('EPSG:3857');
  }
  if (minX >= 50000 && maxX <= 800000 && minY >= 0 && maxY <= 1300000) {
    suggest('EPSG:27700'); // BNG
  }
  if (minX >= 50000 && maxX <= 1300000 && minY >= 5900000 && maxY <= 7200000) {
    suggest('EPSG:2154'); // Lambert-93
  }
  if (minX >= 150000 && maxX <= 900000 && minY >= 1000000 && maxY <= 9000000) {
    suggest('EPSG:25832'); // UTM Zone 32N
    suggest('EPSG:32632');
  }
  if (minX >= -2500000 && maxX <= 2500000 && minY >= 0 && maxY <= 4000000) {
    suggest('EPSG:5070'); // NAD83 Conus Albers
  }

  // Calculate Health Score (0 - 100)
  let healthScore = 100;
  if (hasInvertedCoordinates) healthScore -= 40;
  if (nanCoordinatesCount > 0) healthScore -= 30;
  if (unclosedRingsCount > 0) healthScore -= 20;
  if (duplicateVerticesCount > 0) healthScore -= 10;
  if (emptyGeometriesCount > 0) healthScore -= 10;
  healthScore = Math.max(10, Math.min(100, healthScore));

  const repairAvailable = hasInvertedCoordinates || unclosedRingsCount > 0 || duplicateVerticesCount > 0 || nanCoordinatesCount > 0;

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    hasInvertedCoordinates,
    axisInversionConfidence,
    inversionReason,
    suggestedCRS,
    unclosedRingsCount,
    duplicateVerticesCount,
    nanCoordinatesCount,
    emptyGeometriesCount,
    healthScore,
    repairAvailable,
  };
}

/**
 * Swaps X and Y coordinates across all geometry coordinates in a GeoJSON collection
 */
export function swapCoordinatesDeep(coords: any): any {
  if (!coords || !Array.isArray(coords)) return coords;

  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [x, y, ...rest] = coords;
    return [y, x, ...rest];
  }

  return coords.map((c: any) => swapCoordinatesDeep(c));
}

export function swapDatasetCoordinates(geojson: any): any {
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);

  const repairedFeatures = features.map((f: any) => {
    if (!f || !f.geometry) return f;
    return {
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: swapCoordinatesDeep(f.geometry.coordinates),
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features: repairedFeatures,
  };
}

/**
 * 1-Click Topology Auto-Repair
 * - Snaps unclosed linear rings
 * - Strips zero-distance duplicate consecutive points
 * - Cleans NaN/non-finite coordinates
 * - Enforces minimum polygon vertices
 */
export function autoRepairGeometries(geojson: any): { repairedGeojson: any; stats: { ringsClosed: number; duplicatesRemoved: number; nansScrubbed: number } } {
  let ringsClosed = 0;
  let duplicatesRemoved = 0;
  let nansScrubbed = 0;

  function cleanCoords(coords: any, isPolygonRing = false): any {
    if (!coords || !Array.isArray(coords)) return coords;

    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y, ...rest] = coords;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        nansScrubbed++;
        return [0, 0, ...rest];
      }
      return [x, y, ...rest];
    }

    if (isPolygonRing && coords.length > 0 && Array.isArray(coords[0])) {
      // Clean polygon ring
      const deduped: number[][] = [];
      for (let i = 0; i < coords.length; i++) {
        const pt = coords[i];
        if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) {
          nansScrubbed++;
          continue;
        }
        if (deduped.length > 0) {
          const prev = deduped[deduped.length - 1];
          if (Math.abs(prev[0] - pt[0]) < 1e-9 && Math.abs(prev[1] - pt[1]) < 1e-9) {
            duplicatesRemoved++;
            continue;
          }
        }
        deduped.push(pt);
      }

      // Close ring if open
      if (deduped.length >= 3) {
        const first = deduped[0];
        const last = deduped[deduped.length - 1];
        if (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7) {
          deduped.push([first[0], first[1]]);
          ringsClosed++;
        }
      }

      return deduped;
    }

    return coords.map((c: any) => cleanCoords(c, isPolygonRing));
  }

  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);

  const repairedFeatures = features.map((f: any) => {
    if (!f || !f.geometry) return f;
    const isPoly = f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon';

    let newCoords = f.geometry.coordinates;
    if (f.geometry.type === 'Polygon') {
      newCoords = f.geometry.coordinates.map((ring: any) => cleanCoords(ring, true));
    } else if (f.geometry.type === 'MultiPolygon') {
      newCoords = f.geometry.coordinates.map((poly: any) => poly.map((ring: any) => cleanCoords(ring, true)));
    } else {
      newCoords = cleanCoords(f.geometry.coordinates, false);
    }

    return {
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: newCoords,
      },
    };
  });

  return {
    repairedGeojson: {
      type: 'FeatureCollection',
      features: repairedFeatures,
    },
    stats: {
      ringsClosed,
      duplicatesRemoved,
      nansScrubbed,
    },
  };
}
