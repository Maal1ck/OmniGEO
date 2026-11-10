/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { SpatialDataset, AttributeField } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { computeGeoJSONBounds, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

/**
 * Normalized synonym lists for Longitude (X) and Latitude (Y)
 */
export const EXHAUSTIVE_LON_SYNONYMS: string[] = [
  'longitude',
  'longitud',
  'long',
  'lon',
  'lng',
  'x',
  'xcoord',
  'x_coord',
  'coord_x',
  'coordx',
  'point_x',
  'pointx',
  'easting',
  'easting_m',
  'east',
  'lon_deg',
  'long_deg',
  'lon_dd',
  'long_dd',
  'dec_lon',
  'dec_long',
  'dec_longitude',
  'declon',
  'declong',
  'longitude_wgs84',
  'lon_wgs84',
  'wgs84_lon',
  'wgs84_longitude',
  'geom_x',
  'geometry_x',
  'gps_lon',
  'gps_longitude',
  'gps_long',
  'center_lon',
  'centroid_x',
  'x_centroid',
  'longueur',
  'longitudine',
  'laengengrad',
  'längengrad',
  'lengtegraad',
  'dlugosc',
  'długość',
  'خط_الطول',
  'خط الطول',
  '経度',
  '经度'
];

export const EXHAUSTIVE_LAT_SYNONYMS: string[] = [
  'latitude',
  'latitud',
  'lat',
  'y',
  'ycoord',
  'y_coord',
  'coord_y',
  'coordy',
  'point_y',
  'pointy',
  'northing',
  'northing_m',
  'north',
  'lat_deg',
  'lat_dd',
  'dec_lat',
  'dec_latitude',
  'declat',
  'latitude_wgs84',
  'lat_wgs84',
  'wgs84_lat',
  'wgs84_latitude',
  'geom_y',
  'geometry_y',
  'gps_lat',
  'gps_latitude',
  'center_lat',
  'centroid_y',
  'y_centroid',
  'largeur',
  'latitudine',
  'breitengrad',
  'breedtegraad',
  'szerokosc',
  'szerokość',
  'خط_العرض',
  'خط العرض',
  '緯度',
  '纬度'
];

/**
 * Normalizes text for resilient matching: removes parens, brackets, underscores, spaces
 */
export function normalizeHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[()[\]{}_.\-/\\]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Advanced detection of X (Longitude) and Y (Latitude) columns
 */
export function detectCoordinateColumns(
  headers: string[],
  sampleRows: Record<string, any>[] = []
): { xCol: string; yCol: string; confidence: 'high' | 'medium' | 'low' } | null {
  if (!headers || headers.length < 2) return null;

  let bestX = '';
  let bestY = '';
  let confidence: 'high' | 'medium' | 'low' = 'low';

  const normalizedMap = headers.map(h => ({
    original: h,
    lower: h.toLowerCase().trim(),
    norm: normalizeHeaderKey(h),
  }));

  // Step 1: Look for exact canonical names (e.g. "longitude", "latitude", "lon", "lat", "x", "y")
  for (const item of normalizedMap) {
    if (!bestX) {
      if (
        EXHAUSTIVE_LON_SYNONYMS.includes(item.lower) ||
        EXHAUSTIVE_LON_SYNONYMS.includes(item.norm) ||
        item.lower === 'x(longitude)' ||
        item.lower === 'x (longitude)' ||
        item.norm === 'xlongitude' ||
        item.norm === 'longitudex'
      ) {
        bestX = item.original;
      }
    }

    if (!bestY) {
      if (
        EXHAUSTIVE_LAT_SYNONYMS.includes(item.lower) ||
        EXHAUSTIVE_LAT_SYNONYMS.includes(item.norm) ||
        item.lower === 'y(latitude)' ||
        item.lower === 'y (latitude)' ||
        item.norm === 'ylatitude' ||
        item.norm === 'latitudey'
      ) {
        bestY = item.original;
      }
    }
  }

  if (bestX && bestY) {
    confidence = 'high';
    return { xCol: bestX, yCol: bestY, confidence };
  }

  // Step 2: Partial prefix / suffix / substring matching
  if (!bestX) {
    for (const item of normalizedMap) {
      if (item.norm.includes('longitude') || item.norm.includes('easting') || item.norm.startsWith('lon') || item.norm.endsWith('lon')) {
        bestX = item.original;
        break;
      }
    }
  }

  if (!bestY) {
    for (const item of normalizedMap) {
      if (item.norm.includes('latitude') || item.norm.includes('northing') || item.norm.startsWith('lat') || item.norm.endsWith('lat')) {
        bestY = item.original;
        break;
      }
    }
  }

  if (bestX && bestY) {
    confidence = 'medium';
    return { xCol: bestX, yCol: bestY, confidence };
  }

  // Step 3: Numerical heuristics on sample data
  if (sampleRows.length > 0 && (!bestX || !bestY)) {
    const numericCols = headers.filter(h => {
      return sampleRows.some(row => {
        const val = Number(row[h]);
        return !isNaN(val) && val !== 0;
      });
    });

    for (const col of numericCols) {
      const vals = sampleRows.map(r => Number(r[col])).filter(n => !isNaN(n));
      if (vals.length === 0) continue;
      const allLatRange = vals.every(v => v >= -90 && v <= 90);
      const allLonRange = vals.every(v => v >= -180 && v <= 180);

      const norm = normalizeHeaderKey(col);
      if (!bestY && allLatRange && (norm.includes('y') || norm.includes('lat') || norm.includes('north'))) {
        bestY = col;
      } else if (!bestX && allLonRange && (norm.includes('x') || norm.includes('lon') || norm.includes('east'))) {
        bestX = col;
      }
    }
  }

  if (bestX && bestY) {
    return { xCol: bestX, yCol: bestY, confidence: 'low' };
  }

  return null;
}

export interface ExcelParseResult {
  dataset: SpatialDataset | null;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  previewRows: Record<string, any>[];
  detectedXCol?: string;
  detectedYCol?: string;
  needsManualMapping: boolean;
  totalRowCount: number;
}

/**
 * Inspects and parses an Excel workbook (.xlsx / .xls) buffer into a SpatialDataset or metadata for manual mapping
 */
export function inspectExcelWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  targetSheetName?: string,
  forcedXCol?: string,
  forcedYCol?: string,
  crsCode: string = 'EPSG:4326'
): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('The Excel workbook contains no readable worksheets.');
  }

  const selectedSheet = targetSheetName && sheetNames.includes(targetSheetName)
    ? targetSheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) {
    throw new Error(`Worksheet "${selectedSheet}" could not be read.`);
  }

  // Parse sheet to array of objects
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  const totalRowCount = rawRows.length;

  if (totalRowCount === 0) {
    return {
      dataset: null,
      sheetNames,
      selectedSheet,
      headers: [],
      previewRows: [],
      needsManualMapping: true,
      totalRowCount: 0,
    };
  }

  // Extract all distinct headers
  const headerSet = new Set<string>();
  rawRows.slice(0, 100).forEach(row => {
    Object.keys(row).forEach(k => headerSet.add(k));
  });
  const headers = Array.from(headerSet);

  const previewRows = rawRows.slice(0, 10);

  // Determine coordinate columns
  let xCol = forcedXCol;
  let yCol = forcedYCol;

  if (!xCol || !yCol) {
    const detected = detectCoordinateColumns(headers, previewRows);
    if (detected) {
      xCol = detected.xCol;
      yCol = detected.yCol;
    }
  }

  // If coordinate columns could not be determined, return for manual mapping in the UI
  if (!xCol || !yCol) {
    return {
      dataset: null,
      sheetNames,
      selectedSheet,
      headers,
      previewRows,
      detectedXCol: xCol,
      detectedYCol: yCol,
      needsManualMapping: true,
      totalRowCount,
    };
  }

  // Convert rows with coordinate columns into GeoJSON FeatureCollection
  const features: any[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const xVal = Number(row[xCol]);
    const yVal = Number(row[yCol]);

    if (!isNaN(xVal) && !isNaN(yVal) && isFinite(xVal) && isFinite(yVal)) {
      const props = { ...row };
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [xVal, yVal],
        },
        properties: props,
      });
    }
  }

  if (features.length === 0) {
    return {
      dataset: null,
      sheetNames,
      selectedSheet,
      headers,
      previewRows,
      detectedXCol: xCol,
      detectedYCol: yCol,
      needsManualMapping: true,
      totalRowCount,
    };
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const detectedCRS = getCRSByCode(crsCode) || getCRSByCode('EPSG:4326')!;
  const bounds = computeGeoJSONBounds(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS.code);

  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  const dataset: SpatialDataset = {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: sheetNames.length > 1 ? `${cleanName}_${selectedSheet}` : cleanName,
    originalFileName: fileName,
    format: 'excel',
    sizeBytes: buffer.byteLength,
    featureCount: features.length,
    geometryType: 'Point',
    detectedCRS,
    crsStatus: 'verified',
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };

  return {
    dataset,
    sheetNames,
    selectedSheet,
    headers,
    previewRows,
    detectedXCol: xCol,
    detectedYCol: yCol,
    needsManualMapping: false,
    totalRowCount,
  };
}

export interface ExcelSheetSummary {
  sheetName: string;
  rowCount: number;
  headers: string[];
  detectedXCol?: string;
  detectedYCol?: string;
  hasCoordinates: boolean;
  previewRows: Record<string, any>[];
}

/**
 * Inspects all worksheets within an Excel workbook (.xlsx / .xls)
 */
export function inspectAllExcelSheets(buffer: ArrayBuffer): ExcelSheetSummary[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  return sheetNames.map(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return {
        sheetName,
        rowCount: 0,
        headers: [],
        hasCoordinates: false,
        previewRows: [],
      };
    }

    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    const headerSet = new Set<string>();
    rawRows.slice(0, 50).forEach(row => {
      Object.keys(row).forEach(k => headerSet.add(k));
    });
    const headers = Array.from(headerSet);
    const previewRows = rawRows.slice(0, 5);
    const detected = detectCoordinateColumns(headers, previewRows);

    return {
      sheetName,
      rowCount: rawRows.length,
      headers,
      detectedXCol: detected?.xCol,
      detectedYCol: detected?.yCol,
      hasCoordinates: !!(detected?.xCol && detected?.yCol),
      previewRows,
    };
  });
}

/**
 * Exports a GeoJSON FeatureCollection to an Excel workbook binary (.xlsx)
 */
export function geojsonToExcelBuffer(geojson: any, sheetName: string = 'Geospatial Data'): Uint8Array {
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);
  const rows: Record<string, any>[] = [];

  for (const f of features) {
    const row: Record<string, any> = {};
    const coords = f.geometry?.coordinates;
    if (f.geometry?.type === 'Point' && Array.isArray(coords)) {
      row['longitude'] = coords[0];
      row['latitude'] = coords[1];
    } else if (f.geometry) {
      row['geometry_type'] = f.geometry.type;
      row['coordinates_json'] = JSON.stringify(coords);
    }

    if (f.properties) {
      Object.assign(row, f.properties);
    }
    rows.push(row);
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}
