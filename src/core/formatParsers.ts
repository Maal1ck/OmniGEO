import Papa from 'papaparse';
import shp from 'shpjs';
import JSZip from 'jszip';
import { AttributeField, CRSInfo, GeometryType, SidecarFile, SpatialDataset, SupportedFormat } from '../types/gis';
import { detectCRSFromPRJ, getCRSByCode } from './crsDefinitions';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';

/**
 * Extracts schema attribute fields from GeoJSON features
 */
export function extractSchemaFields(geojson: any): AttributeField[] {
  const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : []);
  if (!features || !features.length) return [];

  const fieldTypes: Record<string, { type: AttributeField['type']; samples: any[] }> = {};

  for (const f of features.slice(0, 200)) {
    const props = f?.properties || {};
    for (const [k, v] of Object.entries(props)) {
      if (!fieldTypes[k]) {
        let t: AttributeField['type'] = 'string';
        if (typeof v === 'number') t = 'number';
        else if (typeof v === 'boolean') t = 'boolean';
        else if (v instanceof Date) t = 'date';
        else if (typeof v === 'object' && v !== null) t = 'object';

        fieldTypes[k] = { type: t, samples: [] };
      }
      if (v !== undefined && v !== null && fieldTypes[k].samples.length < 5) {
        fieldTypes[k].samples.push(v as any);
      }
    }
  }

  return Object.keys(fieldTypes).map(name => ({
    name,
    type: fieldTypes[name].type,
    sampleValues: fieldTypes[name].samples,
  }));
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

  const detectedCRS = getCRSByCode('EPSG:4326');
  const bounds = computeGeoJSONBounds(geojson);
  const geometryType = detectGeometryType(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, 'EPSG:4326');

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'geojson',
    sizeBytes: fileSize,
    featureCount: geojson.features.length,
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
 * Detects coordinate columns in CSV files
 */
export function findCSVCoordinateColumns(headers: string[]): { xCol: string; yCol: string } | null {
  const lower = headers.map(h => h.toLowerCase().trim());

  // X / Longitude candidates
  const xCandidates = ['longitude', 'lon', 'lng', 'long', 'x', 'easting', 'coord_x', 'point_x'];
  // Y / Latitude candidates
  const yCandidates = ['latitude', 'lat', 'y', 'northing', 'coord_y', 'point_y'];

  let foundX = '';
  let foundY = '';

  for (const cand of xCandidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) {
      foundX = headers[idx];
      break;
    }
  }

  for (const cand of yCandidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) {
      foundY = headers[idx];
      break;
    }
  }

  if (foundX && foundY) {
    return { xCol: foundX, yCol: foundY };
  }

  return null;
}

/**
 * Parses spatial CSV into GeoJSON FeatureCollection
 */
export function parseCSV(
  csvText: string,
  fileName: string,
  fileSize: number,
  customXCol?: string,
  customYCol?: string
): SpatialDataset {
  const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const headers = parsed.meta.fields || [];
  const coordCols = (customXCol && customYCol) 
    ? { xCol: customXCol, yCol: customYCol }
    : findCSVCoordinateColumns(headers);

  const features: any[] = [];
  const data = parsed.data as Record<string, any>[];

  if (coordCols) {
    for (const row of data) {
      const x = Number(row[coordCols.xCol]);
      const y = Number(row[coordCols.yCol]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        features.push({
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

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const detectedCRS = getCRSByCode('EPSG:4326');
  const bounds = computeGeoJSONBounds(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, 'EPSG:4326');

  if (!coordCols) {
    validationIssues.push({
      severity: 'warning',
      code: 'NO_COORDINATE_COLS',
      message: 'Could not auto-detect Longitude/Latitude columns. Please configure CSV spatial columns in Conversion Lab.',
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
    crsStatus: coordCols ? 'assumed' : 'missing',
    bounds,
    fields,
    geojson,
    validationIssues,
    status: validationIssues.some(i => i.severity === 'error') ? 'invalid' : validationIssues.length > 0 ? 'warning' : 'ready',
    addedAt: Date.now(),
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
): Promise<SpatialDataset> {
  const parsed = await (shp as any)(zipBuffer);
  const geojson = Array.isArray(parsed) ? parsed[0] : parsed;

  // Check for PRJ inside zip if accessible
  let detectedCRS = getCRSByCode('EPSG:4326');
  let crsStatus: SpatialDataset['crsStatus'] = 'assumed';

  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const prjFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.prj'));
    if (prjFile) {
      const prjText = await prjFile.async('text');
      const fromPrj = detectCRSFromPRJ(prjText);
      if (fromPrj) {
        detectedCRS = fromPrj;
        crsStatus = 'verified';
      }
    }
  } catch {
    // Keep assumed WGS84
  }

  const bounds = computeGeoJSONBounds(geojson);
  const geometryType = detectGeometryType(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS?.code);

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
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
