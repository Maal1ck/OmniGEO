import Papa from 'papaparse';
import shp from 'shpjs';
import JSZip from 'jszip';
import { AttributeField, CRSInfo, GeometryType, SidecarFile, SpatialDataset, SupportedFormat } from '../types/gis';
import { detectCRSFromPRJ, getCRSByCode } from './crsDefinitions';
import { detectCRSFromCoordinates, detectCRSFromGeoJSONMember, detectCRSFromPRJRobust } from './crsDetection';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';


/**
 * Extracts schema attribute fields from GeoJSON features
 */
export function extractSchemaFields(geojson: any): AttributeField[] {
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);
  if (!features || !features.length) return [];

  const fieldStats: Record<
    string,
    {
      sawNumber: boolean;
      sawString: boolean;
      sawBoolean: boolean;
      sawDate: boolean;
      sawObject: boolean;
      samples: any[];
    }
  > = {};

  for (const f of features) {
    const props = f?.properties || {};
    for (const [k, v] of Object.entries(props)) {
      if (!fieldStats[k]) {
        fieldStats[k] = {
          sawNumber: false,
          sawString: false,
          sawBoolean: false,
          sawDate: false,
          sawObject: false,
          samples: [],
        };
      }
      const stat = fieldStats[k];
      if (v !== undefined && v !== null) {
        if (stat.samples.length < 5) {
          stat.samples.push(v as any);
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
          stat.sawNumber = true;
        } else if (typeof v === 'boolean') {
          stat.sawBoolean = true;
        } else if (v instanceof Date) {
          stat.sawDate = true;
        } else if (typeof v === 'object') {
          stat.sawObject = true;
        } else if (typeof v === 'string') {
          if (v.trim() !== '') stat.sawString = true;
        }
      }
    }
  }

  return Object.keys(fieldStats).map((name) => {
    const s = fieldStats[name];
    let type: AttributeField['type'] = 'string';
    if (s.sawString) {
      type = 'string';
    } else if (s.sawObject) {
      type = 'object';
    } else if (s.sawNumber && !s.sawBoolean && !s.sawDate) {
      type = 'number';
    } else if (s.sawBoolean && !s.sawNumber && !s.sawDate) {
      type = 'boolean';
    } else if (s.sawDate && !s.sawNumber && !s.sawBoolean) {
      type = 'date';
    }
    return {
      name,
      type,
      sampleValues: s.samples,
    };
  });
}

/**
 * Parses GeoJSON text or object
 */
export function parseGeoJSON(
  content: string,
  fileName: string,
  fileSize: number
): SpatialDataset {
  const json = JSON.parse(content);
  const geojson = json.type === 'FeatureCollection' ? json : {
    type: 'FeatureCollection',
    features: json.type === 'Feature' ? [json] : [{ type: 'Feature', geometry: json, properties: {} }],
  };

  const crsFromMember = detectCRSFromGeoJSONMember(json.crs);
  const bounds = computeGeoJSONBounds(geojson);
  const coordResult = detectCRSFromCoordinates(bounds, crsFromMember);
  const detectedCRS = coordResult.detectedCRS;
  const crsStatus = coordResult.crsStatus;

  const geometryType = detectGeometryType(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS?.code);

  if (crsStatus === 'missing') {
    validationIssues.push({
      severity: 'warning',
      code: 'PROJECTED_COORDINATES_DETECTED',
      message: coordResult.confidenceReason,
    });
  }

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'geojson',
    sizeBytes: fileSize,
    featureCount: geojson.features.length,
    geometryType,
    detectedCRS,
    crsStatus,
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };
}

import { detectCoordinateColumns } from './excelParser';

/**
 * Detects coordinate columns in CSV files using exhaustive synonyms and normalization
 */
export function findCSVCoordinateColumns(headers: string[], sampleRows?: Record<string, any>[]): { xCol: string; yCol: string } | null {
  const result = detectCoordinateColumns(headers, sampleRows);
  if (result) {
    return { xCol: result.xCol, yCol: result.yCol };
  }
  return null;
}

function parseCsvNumber(raw: any): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return NaN;
  // Handle optional decimal comma in numeric strings (e.g. "31,625")
  const normalized = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
  return Number(normalized);
}

/**
 * Parses spatial or non-spatial CSV into GeoJSON FeatureCollection
 */
export function parseCSV(
  csvText: string,
  fileName: string,
  fileSize: number,
  customXCol?: string,
  customYCol?: string,
  forceNonSpatial: boolean = false
): SpatialDataset {
  const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const headers = (parsed.meta.fields || []).filter((h) => h && h.trim() !== '');
  const data = parsed.data as Record<string, any>[];

  const coordCols = forceNonSpatial
    ? null
    : (customXCol && customYCol)
    ? { xCol: customXCol, yCol: customYCol }
    : findCSVCoordinateColumns(headers, data.slice(0, 20));

  const spatialFeatures: any[] = [];

  if (coordCols) {
    for (const row of data) {
      const x = parseCsvNumber(row[coordCols.xCol]);
      const y = parseCsvNumber(row[coordCols.yCol]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        spatialFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [x, y],
          },
          properties: row,
        });
      }
    }
  }

  // If no spatial coordinates were found (or non-spatial requested), ingest all rows as an attribute table
  const isNonSpatial = forceNonSpatial || !coordCols || spatialFeatures.length === 0;
  const features = isNonSpatial
    ? data.map((row, idx) => ({
        type: 'Feature',
        id: idx + 1,
        geometry: null,
        properties: row,
      }))
    : spatialFeatures;

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  let fields = extractSchemaFields(geojson);
  if (fields.length === 0 && headers.length > 0) {
    fields = headers.map((h) => ({ name: h, type: 'string' as const, sampleValues: [] }));
  }

  if (isNonSpatial) {
    const defaultCrs = getCRSByCode('EPSG:4326')!;
    return {
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: fileName.replace(/\.[^/.]+$/, ''),
      originalFileName: fileName,
      format: 'csv',
      sizeBytes: fileSize,
      featureCount: features.length,
      geometryType: 'Unknown',
      detectedCRS: defaultCrs,
      crsStatus: 'verified',
      bounds: [0, 0, 0, 0],
      fields,
      geojson,
      validationIssues: [],
      status: 'ready',
      addedAt: Date.now(),
      isNonSpatial: true,
    };
  }

  const bounds = computeGeoJSONBounds(geojson);
  const coordResult = detectCRSFromCoordinates(bounds);
  const detectedCRS = coordResult.detectedCRS;
  const crsStatus = coordResult.crsStatus;
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS?.code);

  if (coordResult.crsStatus === 'missing') {
    validationIssues.push({
      severity: 'warning',
      code: 'PROJECTED_COORDINATES_DETECTED',
      message: coordResult.confidenceReason,
    });
  }

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'csv',
    sizeBytes: fileSize,
    featureCount: features.length,
    geometryType: 'Point',
    detectedCRS,
    crsStatus,
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
    isNonSpatial: false,
  };
}

/**
 * Parses KML text into GeoJSON
 */
export function parseKML(
  kmlText: string,
  fileName: string,
  fileSize: number
): SpatialDataset {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = xml.querySelectorAll('Placemark');
  const features: any[] = [];

  placemarks.forEach((pm) => {
    const name = pm.querySelector('name')?.textContent || '';
    const description = pm.querySelector('description')?.textContent || '';
    const properties: Record<string, any> = { name, description };

    // Extract ExtendedData SimpleData
    const simpleData = pm.querySelectorAll('SimpleData');
    simpleData.forEach(sd => {
      const field = sd.getAttribute('name');
      if (field) properties[field] = sd.textContent;
    });

    let geometry: any = null;

    // Check Point
    const point = pm.querySelector('Point > coordinates');
    if (point && point.textContent) {
      const parts = point.textContent.trim().split(',');
      if (parts.length >= 2) {
        geometry = {
          type: 'Point',
          coordinates: [parseFloat(parts[0]), parseFloat(parts[1])],
        };
      }
    }

    // Check LineString
    if (!geometry) {
      const line = pm.querySelector('LineString > coordinates');
      if (line && line.textContent) {
        const coords = line.textContent.trim().split(/\s+/).map(pair => {
          const [lon, lat] = pair.split(',');
          return [parseFloat(lon), parseFloat(lat)];
        }).filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));

        if (coords.length > 0) {
          geometry = {
            type: 'LineString',
            coordinates: coords,
          };
        }
      }
    }

    // Check Polygon
    if (!geometry) {
      const poly = pm.querySelector('Polygon');
      if (poly) {
        const outer = poly.querySelector('outerBoundaryIs > LinearRing > coordinates');
        if (outer && outer.textContent) {
          const coords = outer.textContent.trim().split(/\s+/).map(pair => {
            const [lon, lat] = pair.split(',');
            return [parseFloat(lon), parseFloat(lat)];
          }).filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));

          if (coords.length >= 4) {
            geometry = {
              type: 'Polygon',
              coordinates: [coords],
            };
          }
        }
      }
    }

    if (geometry) {
      features.push({
        type: 'Feature',
        geometry,
        properties,
      });
    }
  });

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const detectedCRS = getCRSByCode('EPSG:4326');
  const bounds = computeGeoJSONBounds(geojson);
  const geometryType = detectGeometryType(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, 'EPSG:4326');

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'kml',
    sizeBytes: fileSize,
    featureCount: features.length,
    geometryType,
    detectedCRS,
    crsStatus: 'verified',
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
  };
}

/**
 * Parses zipped or sidecar shapefiles using shpjs
 */
export async function parseShapefileZipOrBuffers(
  zipBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): Promise<SpatialDataset[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const prjFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith('.prj'));
  const prjCRSByLayer = new Map<string, CRSInfo | null>();

  for (const prjFile of prjFiles) {
    const prjText = await prjFile.async('text');
    const layerName = (prjFile.name.replace(/\\/g, '/').split('/').pop() || '')
      .replace(/\.prj$/i, '')
      .toLowerCase();
    prjCRSByLayer.set(layerName, detectCRSFromPRJRobust(prjText));
    // Let the reader preserve raw coordinates; CRS assignment is handled per layer below.
    zip.remove(prjFile.name);
  }

  const shapefileBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  const parsed = await (shp as any)(shapefileBuffer);
  const layers = Array.isArray(parsed) ? parsed : [parsed];
  if (layers.length === 0 || !layers[0]) {
    throw new Error(`No readable Shapefile layers were found in "${fileName}".`);
  }

  return layers.map((geojson: any) => {
    const layerName = String(geojson.fileName || '').replace(/\\/g, '/').split('/').pop() || '';
    const layerKey = layerName.toLowerCase();
    const prjCRS = prjCRSByLayer.get(layerKey) ?? null;
    const prjMatched = prjCRSByLayer.has(layerKey);
    const bounds = computeGeoJSONBounds(geojson);
    const coordResult = detectCRSFromCoordinates(bounds, prjCRS);
    const detectedCRS = coordResult.detectedCRS;
    const crsStatus = prjCRS ? 'verified' : coordResult.crsStatus;
    const geometryType = detectGeometryType(geojson);
    const fields = extractSchemaFields(geojson);
    const validationIssues = validateDatasetGeometries(geojson, detectedCRS?.code);

    if (crsStatus === 'missing') {
      validationIssues.push({
        severity: 'warning',
        code: 'UNVERIFIED_PROJECTED_CRS',
        message: prjMatched
          ? `PRJ file present but CRS was ambiguous. ${coordResult.confidenceReason}`
          : `No matching .prj sidecar found. ${coordResult.confidenceReason}`,
      });
    }

    const archiveName = fileName.replace(/\.[^/.]+$/, '');
    const name = layers.length > 1 && layerName
      ? `${archiveName} - ${layerName}`
      : archiveName;

    return {
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      originalFileName: fileName,
      format: 'shapefile',
      sizeBytes: fileSize,
      featureCount: geojson.features ? geojson.features.length : 0,
      geometryType,
      detectedCRS,
      crsStatus,
      bounds,
      fields,
      geojson,
      validationIssues,
      status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
      addedAt: Date.now(),
    };
  });
}

/**
 * Serializes GeoJSON to KML string
 */
export function geojsonToKML(geojson: any, documentName: string): string {
  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  
  let placemarksXml = '';
  for (const f of features) {
    const name = f.properties?.name || f.properties?.id || 'Placemark';
    const desc = f.properties?.description || '';
    
    let extData = '<ExtendedData>\n';
    if (f.properties) {
      for (const [k, v] of Object.entries(f.properties)) {
        if (k !== 'name' && k !== 'description') {
          extData += `  <Data name="${k}"><value>${v ?? ''}</value></Data>\n`;
        }
      }
    }
    extData += '</ExtendedData>';

    let geomXml = '';
    const geom = f.geometry;
    if (geom) {
      if (geom.type === 'Point') {
        geomXml = `<Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]}</coordinates></Point>`;
      } else if (geom.type === 'LineString') {
        const coordsStr = geom.coordinates.map((c: number[]) => `${c[0]},${c[1]}`).join(' ');
        geomXml = `<LineString><coordinates>${coordsStr}</coordinates></LineString>`;
      } else if (geom.type === 'Polygon') {
        const ringsStr = geom.coordinates[0]?.map((c: number[]) => `${c[0]},${c[1]}`).join(' ');
        geomXml = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ringsStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
    }

    placemarksXml += `
    <Placemark>
      <name>${escapeXml(String(name))}</name>
      <description>${escapeXml(String(desc))}</description>
      ${extData}
      ${geomXml}
    </Placemark>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    ${placemarksXml}
  </Document>
</kml>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Serializes GeoJSON to CSV string
 */
export function geojsonToCSV(geojson: any): string {
  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  const rows: Record<string, any>[] = [];

  for (const f of features) {
    const geom = f.geometry;
    const row: Record<string, any> = { ...f.properties };

    if (geom) {
      if (geom.type === 'Point') {
        row['longitude'] = geom.coordinates[0];
        row['latitude'] = geom.coordinates[1];
      } else {
        row['wkt_geometry'] = `${geom.type.toUpperCase()}(${JSON.stringify(geom.coordinates)})`;
      }
    }
    rows.push(row);
  }

  return Papa.unparse(rows);
}

export { parseCadFile, parseDxfContent, parseGpxFile } from './cadParser';
export { 
  inspectExcelWorkbook, 
  geojsonToExcelBuffer, 
  detectCoordinateColumns, 
  EXHAUSTIVE_LON_SYNONYMS, 
  EXHAUSTIVE_LAT_SYNONYMS 
} from './excelParser';
