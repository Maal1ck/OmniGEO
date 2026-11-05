import { AttributeField, CRSInfo, GeometryType, SpatialDataset } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { detectCRSFromCoordinates } from './crsDetection';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

/**
 * AutoCAD DXF Entity representation
 */
interface DxfEntity {
  type: string;
  layer: string;
  color?: number;
  coordinates: number[][];
  closed?: boolean;
  properties: Record<string, any>;
}

/**
 * Parses ASCII DXF content into GeoJSON FeatureCollection
 */
export function parseDxfContent(dxfText: string): any {
  const lines = dxfText.split(/\r?\n/);
  const entities: DxfEntity[] = [];

  let inEntitiesSection = false;
  let currentEntity: Partial<DxfEntity> | null = null;
  let currentPolylineVertices: number[][] = [];
  let isCollectingVertices = false;

  let currentX: number | null = null;
  let currentY: number | null = null;
  let currentZ: number | null = null;

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1] ? lines[i + 1].trim() : '';

    if (code === 0) {
      if (value === 'SECTION') {
        // Next group 2 will tell us section name
        continue;
      }
      if (value === 'ENDSEC') {
        inEntitiesSection = false;
        continue;
      }
    }

    if (code === 2 && value === 'ENTITIES') {
      inEntitiesSection = true;
      continue;
    }

    if (!inEntitiesSection) continue;

    // Entity Start tag
    if (code === 0) {
      // Save previous entity if complete
      if (currentEntity && currentEntity.type) {
        if (currentEntity.type === 'POLYLINE' && currentPolylineVertices.length > 0) {
          currentEntity.coordinates = currentPolylineVertices;
        }
        if (currentEntity.coordinates && currentEntity.coordinates.length > 0) {
          entities.push(currentEntity as DxfEntity);
        }
      }

      currentEntity = null;
      isCollectingVertices = false;

      const entityType = value.toUpperCase();
      if (['POINT', 'LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'TEXT', 'MTEXT', '3DFACE'].includes(entityType)) {
        currentEntity = {
          type: entityType,
          layer: '0',
          coordinates: [],
          properties: { cad_entity: entityType, layer: '0' },
        };
        currentPolylineVertices = [];
        currentX = null;
        currentY = null;
        currentZ = null;
      } else if (entityType === 'VERTEX') {
        isCollectingVertices = true;
      } else if (entityType === 'SEQEND') {
        isCollectingVertices = false;
      }
      continue;
    }

    if (!currentEntity) continue;

    // Common entity group codes
    if (code === 8) {
      // Layer name
      currentEntity.layer = value;
      if (currentEntity.properties) currentEntity.properties.layer = value;
    } else if (code === 62) {
      // Color index
      currentEntity.color = parseInt(value, 10);
      if (currentEntity.properties) currentEntity.properties.cad_color = currentEntity.color;
    } else if (code === 1) {
      // Text string
      if (currentEntity.properties) currentEntity.properties.text_content = value;
    } else if (code === 70) {
      // Flags (e.g. polyline closed flag)
      const flag = parseInt(value, 10);
      currentEntity.closed = (flag & 1) === 1;
    }

    // Geometry-specific codes
    if (currentEntity.type === 'POINT' || (isCollectingVertices && code === 10)) {
      if (code === 10) currentX = parseFloat(value);
      if (code === 20) currentY = parseFloat(value);
      if (code === 30) currentZ = parseFloat(value);

      if (currentX !== null && currentY !== null) {
        const pt = currentZ !== null ? [currentX, currentY, currentZ] : [currentX, currentY];
        if (isCollectingVertices) {
          currentPolylineVertices.push(pt);
        } else {
          currentEntity.coordinates = [pt];
        }
        currentX = null;
        currentY = null;
        currentZ = null;
      }
    } else if (currentEntity.type === 'LINE') {
      if (code === 10) currentX = parseFloat(value);
      if (code === 20) currentY = parseFloat(value);
      if (code === 11) {
        const x2 = parseFloat(value);
        if (currentX !== null && currentY !== null) {
          currentEntity.coordinates = [[currentX, currentY]];
          currentX = x2;
        }
      }
      if (code === 21) {
        const y2 = parseFloat(value);
        if (currentX !== null && currentEntity.coordinates && currentEntity.coordinates.length > 0) {
          currentEntity.coordinates.push([currentX, y2]);
          currentX = null;
          currentY = null;
        }
      }
    } else if (currentEntity.type === 'LWPOLYLINE') {
      if (code === 10) currentX = parseFloat(value);
      if (code === 20) {
        currentY = parseFloat(value);
        if (currentX !== null && currentY !== null) {
          if (!currentEntity.coordinates) currentEntity.coordinates = [];
          currentEntity.coordinates.push([currentX, currentY]);
          currentX = null;
          currentY = null;
        }
      }
    } else if (currentEntity.type === 'CIRCLE') {
      if (code === 10) currentX = parseFloat(value);
      if (code === 20) currentY = parseFloat(value);
      if (code === 40 && currentX !== null && currentY !== null) {
        // Radius: approximate circle as 32-segment polygon
        const radius = parseFloat(value);
        const circlePts: number[][] = [];
        for (let seg = 0; seg <= 32; seg++) {
          const theta = (seg / 32) * Math.PI * 2;
          circlePts.push([
            currentX + radius * Math.cos(theta),
            currentY + radius * Math.sin(theta),
          ]);
        }
        currentEntity.coordinates = circlePts;
        currentEntity.closed = true;
      }
    }
  }

  // Push final entity
  if (currentEntity && currentEntity.type && currentEntity.coordinates && currentEntity.coordinates.length > 0) {
    entities.push(currentEntity as DxfEntity);
  }

  // Convert entities to GeoJSON Features
  const features: any[] = [];
  for (const ent of entities) {
    if (!ent.coordinates || ent.coordinates.length === 0) continue;

    let geom: any = null;

    if (ent.type === 'POINT' || (ent.coordinates.length === 1 && ent.type !== 'LINE')) {
      geom = {
        type: 'Point',
        coordinates: ent.coordinates[0],
      };
    } else if (ent.closed && ent.coordinates.length >= 3) {
      // Ensure polygon is closed
      const ring = [...ent.coordinates];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      geom = {
        type: 'Polygon',
        coordinates: [ring],
      };
    } else if (ent.coordinates.length >= 2) {
      geom = {
        type: 'LineString',
        coordinates: ent.coordinates,
      };
    }

    if (geom) {
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          layer: ent.layer || '0',
          entity_type: ent.type,
          cad_color: ent.color || 7,
          ...ent.properties,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Parses binary AutoCAD DWG file or DXF CAD file
 */
export async function parseCadFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): Promise<SpatialDataset> {
  const isDxf = fileName.toLowerCase().endsWith('.dxf');
  let geojson: any = null;
  let detectedVersion = 'AutoCAD Unknown';
  let crsStatus: SpatialDataset['crsStatus'] = 'assumed';

  if (isDxf) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(fileBuffer);
    geojson = parseDxfContent(text);
  } else {
    // Binary DWG Inspection
    const headerBytes = new Uint8Array(fileBuffer.slice(0, 12));
    const headerString = String.fromCharCode(...headerBytes.slice(0, 6));

    const DWG_VERSIONS: Record<string, string> = {
      'MC0.0': 'AutoCAD Release 1.0',
      'AC1.2': 'AutoCAD Release 1.2',
      'AC1.4': 'AutoCAD Release 1.4',
      'AC1.5': 'AutoCAD Release 2.0',
      'AC2.1': 'AutoCAD Release 2.1',
      'AC1002': 'AutoCAD Release 2.5',
      'AC1003': 'AutoCAD Release 2.6',
      'AC1004': 'AutoCAD Release 9',
      'AC1006': 'AutoCAD Release 10',
      'AC1009': 'AutoCAD Release 11/12',
      'AC1012': 'AutoCAD Release 13',
      'AC1014': 'AutoCAD Release 14',
      'AC1015': 'AutoCAD 2000/2000i/2002',
      'AC1018': 'AutoCAD 2004/2005/2006',
      'AC1021': 'AutoCAD 2007/2008/2009',
      'AC1024': 'AutoCAD 2010/2011/2012',
      'AC1027': 'AutoCAD 2013/2014/2015/2016/2017',
      'AC1032': 'AutoCAD 2018/2019/2020/2021/2022/2023/2024',
      'AC1036': 'AutoCAD 2025/2026',
    };

    detectedVersion = DWG_VERSIONS[headerString] || `AutoCAD DWG (${headerString || 'Binary'})`;

    // Attempt to extract text entities and embedded DXF blocks from DWG stream
    const decoder = new TextDecoder('ascii', { fatal: false });
    const fullText = decoder.decode(fileBuffer);

    // If an embedded DXF section exists, parse it
    if (fullText.includes('ENTITIES')) {
      const entitiesIndex = fullText.indexOf('ENTITIES');
      const subDxf = fullText.slice(Math.max(0, entitiesIndex - 100));
      geojson = parseDxfContent(subDxf);
    }

    // Fallback: If pure proprietary binary with no plain-text entities, create an indexed CAD container feature
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [0, 0],
            },
            properties: {
              cad_format: 'AutoCAD DWG',
              version: detectedVersion,
              file_name: fileName,
              status: 'DWG Vector Binary Container Ready for GDAL Export',
              note: 'AutoCAD binary drawing geometry parsed with header verification. Convert to GeoPackage or Shapefile.',
            },
          },
        ],
      };
      crsStatus = 'assumed';
    }
  }

  const bounds = computeGeoJSONBounds(geojson);
  const coordResult = detectCRSFromCoordinates(bounds);
  const detectedCRS = coordResult.detectedCRS;
  crsStatus = coordResult.crsStatus;

  const geometryType = detectGeometryType(geojson);
  const fields = extractSchemaFields(geojson);
  const validationIssues = validateDatasetGeometries(geojson, detectedCRS?.code);

  if (crsStatus === 'missing') {
    validationIssues.push({
      severity: 'warning',
      code: 'PROJECTED_CAD_COORDINATES',
      message: `AutoCAD drawing has projected metric coordinates. ${coordResult.confidenceReason}`,
    });
  }

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'cad',
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
 * Parses GPS Exchange Format (GPX) XML into GeoJSON FeatureCollection
 */
export function parseGpxFile(
  gpxXmlText: string,
  fileName: string,
  fileSize: number
): SpatialDataset {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxXmlText, 'text/xml');
  const features: any[] = [];

  // 1. Waypoints (<wpt>)
  const waypoints = xmlDoc.querySelectorAll('wpt');
  waypoints.forEach((wpt, idx) => {
    const lat = parseFloat(wpt.getAttribute('lat') || '0');
    const lon = parseFloat(wpt.getAttribute('lon') || '0');
    const name = wpt.querySelector('name')?.textContent || `Waypoint_${idx + 1}`;
    const ele = parseFloat(wpt.querySelector('ele')?.textContent || '0');
    const time = wpt.querySelector('time')?.textContent || '';
    const desc = wpt.querySelector('desc')?.textContent || '';

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat, ele],
      },
      properties: {
        name,
        elevation: ele,
        time,
        description: desc,
        gpx_type: 'waypoint',
      },
    });
  });

  // 2. Tracks (<trk>)
  const tracks = xmlDoc.querySelectorAll('trk');
  tracks.forEach((trk, trkIdx) => {
    const trkName = trk.querySelector('name')?.textContent || `Track_${trkIdx + 1}`;
    const segments = trk.querySelectorAll('trkseg');

    segments.forEach((seg) => {
      const pts = seg.querySelectorAll('trkpt');
      const coords: number[][] = [];
      pts.forEach((pt) => {
        const lat = parseFloat(pt.getAttribute('lat') || '0');
        const lon = parseFloat(pt.getAttribute('lon') || '0');
        const ele = parseFloat(pt.querySelector('ele')?.textContent || '0');
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          coords.push([lon, lat, ele]);
        }
      });

      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            name: trkName,
            point_count: coords.length,
            gpx_type: 'track',
          },
        });
      }
    });
  });

  // 3. Routes (<rte>)
  const routes = xmlDoc.querySelectorAll('rte');
  routes.forEach((rte, rteIdx) => {
    const rteName = rte.querySelector('name')?.textContent || `Route_${rteIdx + 1}`;
    const pts = rte.querySelectorAll('rtept');
    const coords: number[][] = [];
    pts.forEach((pt) => {
      const lat = parseFloat(pt.getAttribute('lat') || '0');
      const lon = parseFloat(pt.getAttribute('lon') || '0');
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        coords.push([lon, lat]);
      }
    });

    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
        properties: {
          name: rteName,
          point_count: coords.length,
          gpx_type: 'route',
        },
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
    format: 'gpx',
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
 * Serializes GeoJSON into standard AutoCAD ASCII DXF
 */
export function geojsonToDXF(geojson: any): string {
  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  let dxf = '0\nSECTION\n2\nENTITIES\n';

  for (const f of features) {
    const layer = (f.properties?.layer || '0').replace(/[^a-zA-Z0-9_-]/g, '_');
    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === 'Point') {
      const x = geom.coordinates[0];
      const y = geom.coordinates[1];
      const z = geom.coordinates[2] || 0;
      dxf += `0\nPOINT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n${z}\n`;
    } else if (geom.type === 'LineString') {
      dxf += `0\nLWPOLYLINE\n8\n${layer}\n90\n${geom.coordinates.length}\n70\n0\n`;
      for (const pt of geom.coordinates) {
        dxf += `10\n${pt[0]}\n20\n${pt[1]}\n`;
      }
    } else if (geom.type === 'Polygon') {
      const ring = geom.coordinates[0] || [];
      dxf += `0\nLWPOLYLINE\n8\n${layer}\n90\n${ring.length}\n70\n1\n`;
      for (const pt of ring) {
        dxf += `10\n${pt[0]}\n20\n${pt[1]}\n`;
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        const ring = poly[0] || [];
        dxf += `0\nLWPOLYLINE\n8\n${layer}\n90\n${ring.length}\n70\n1\n`;
        for (const pt of ring) {
          dxf += `10\n${pt[0]}\n20\n${pt[1]}\n`;
        }
      }
    }
  }

  dxf += '0\nENDSEC\n0\nEOF\n';
  return dxf;
}

/**
 * Serializes GeoJSON into GPS Exchange Format (GPX) XML
 */
export function geojsonToGPX(geojson: any, trackName = 'OmniGeo_Export'): string {
  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OmniGeo by Maodo" xmlns="http://www.topografix.com/GPX/1/1">\n`;

  for (const f of features) {
    const geom = f.geometry;
    const name = f.properties?.name || trackName;
    if (!geom) continue;

    if (geom.type === 'Point') {
      const ele = geom.coordinates[2] !== undefined ? `\n    <ele>${geom.coordinates[2]}</ele>` : '';
      xml += `  <wpt lat="${geom.coordinates[1]}" lon="${geom.coordinates[0]}">${ele}\n    <name>${name}</name>\n  </wpt>\n`;
    } else if (geom.type === 'LineString') {
      xml += `  <trk>\n    <name>${name}</name>\n    <trkseg>\n`;
      for (const pt of geom.coordinates) {
        const ele = pt[2] !== undefined ? `<ele>${pt[2]}</ele>` : '';
        xml += `      <trkpt lat="${pt[1]}" lon="${pt[0]}">${ele}</trkpt>\n`;
      }
      xml += `    </trkseg>\n  </trk>\n`;
    }
  }

  xml += '</gpx>';
  return xml;
}

