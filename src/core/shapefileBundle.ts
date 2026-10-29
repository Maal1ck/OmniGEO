import JSZip from 'jszip';
import { getCRSByCode } from './crsDefinitions';

export interface ShapefileSidecars {
  shp?: ArrayBuffer;
  shx?: ArrayBuffer;
  dbf?: ArrayBuffer;
  prj?: string;
  cpg?: string;
}

/**
 * Common ESRI WKT definitions for .prj export
 */
export function getWKTForCRS(crsCode: string): string {
  switch (crsCode) {
    case 'EPSG:4326':
      return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
    case 'EPSG:3857':
      return 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';
    case 'EPSG:27700':
      return 'PROJCS["OSGB_1936_British_National_Grid",GEOGCS["GCS_OSGB_1936",DATUM["D_OSGB_1936",SPHEROID["Airy_1830",6377563.396,299.3249646]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",400000.0],PARAMETER["False_Northing",-100000.0],PARAMETER["Central_Meridian",-2.0],PARAMETER["Scale_Factor",0.9996012717],PARAMETER["Latitude_Of_Origin",49.0],UNIT["Meter",1.0]]';
    case 'EPSG:2154':
      return 'PROJCS["RGF93_Lambert_93",GEOGCS["GCS_RGF93",DATUM["D_RGF93",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",700000.0],PARAMETER["False_Northing",6600000.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Standard_Parallel_1",44.0],PARAMETER["Standard_Parallel_2",49.0],PARAMETER["Latitude_Of_Origin",46.5],UNIT["Meter",1.0]]';
    case 'EPSG:5070':
      return 'PROJCS["NAD_1983_Contiguous_USA_Albers",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Albers"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-96.0],PARAMETER["Standard_Parallel_1",29.5],PARAMETER["Standard_Parallel_2",45.5],PARAMETER["Latitude_Of_Origin",23.0],UNIT["Meter",1.0]]';
    default: {
      const info = getCRSByCode(crsCode);
      return `GEOGCS["${info?.name || crsCode}",DATUM["D_Unknown",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]`;
    }
  }
}

/**
 * Writes an ESRI Shapefile suite (.shp, .shx, .dbf, .prj, .cpg) into a JSZip Blob
 */
export async function createShapefileZip(
  geojson: any,
  baseName: string,
  crsCode: string
): Promise<Blob> {
  const zip = new JSZip();
  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);

  // Determine geometry type for shapefile
  // 1 = Point, 3 = PolyLine, 5 = Polygon
  let shapeType = 1;
  const firstGeom = features.find((f: any) => f?.geometry)?.geometry?.type;
  if (firstGeom === 'Polygon' || firstGeom === 'MultiPolygon') {
    shapeType = 5;
  } else if (firstGeom === 'LineString' || firstGeom === 'MultiLineString') {
    shapeType = 3;
  } else {
    shapeType = 1;
  }

  // 1. Generate SHP and SHX
  const { shpBuffer, shxBuffer } = writeShpAndShx(features, shapeType);
  zip.file(`${baseName}.shp`, shpBuffer);
  zip.file(`${baseName}.shx`, shxBuffer);

  // 2. Generate DBF
  const dbfBuffer = writeDbf(features);
  zip.file(`${baseName}.dbf`, dbfBuffer);

  // 3. Generate PRJ
  const prjContent = getWKTForCRS(crsCode);
  zip.file(`${baseName}.prj`, prjContent);

  // 4. Generate CPG (UTF-8 encoding flag)
  zip.file(`${baseName}.cpg`, 'UTF-8\n');

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function writeShpAndShx(
  features: any[],
  shapeType: number
): { shpBuffer: ArrayBuffer; shxBuffer: ArrayBuffer } {
  // Compute global bounds
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  let firstCoord = true;

  function trackBounds(x: number, y: number) {
    if (firstCoord) {
      minX = maxX = x;
      minY = maxY = y;
      firstCoord = false;
    } else {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Pre-calculate record sizes
  const recordsData: { buffer: ArrayBuffer; lengthWords: number }[] = [];

  for (const f of features) {
    const geom = f?.geometry;
    if (!geom || !geom.coordinates) {
      // Null shape
      const buf = new ArrayBuffer(8);
      new DataView(buf).setInt32(4, 0, true); // ShapeType 0 = Null
      recordsData.push({ buffer: buf, lengthWords: 4 });
      continue;
    }

    if (shapeType === 1) { // Point
      let pt = geom.coordinates;
      if (geom.type === 'MultiPoint' && pt[0]) pt = pt[0];
      const x = Number(pt[0]) || 0;
      const y = Number(pt[1]) || 0;
      trackBounds(x, y);

      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setInt32(0, 1, true); // Point type
      view.setFloat64(4, x, true);
      view.setFloat64(12, y, true);
      recordsData.push({ buffer: buf, lengthWords: 10 });
    } else if (shapeType === 5) { // Polygon
      let rings: number[][][] = [];
      if (geom.type === 'Polygon') {
        rings = geom.coordinates;
      } else if (geom.type === 'MultiPolygon') {
        rings = geom.coordinates.flat(1);
      }

      let numPoints = 0;
      for (const ring of rings) {
        numPoints += ring.length;
        for (const pt of ring) {
          trackBounds(pt[0], pt[1]);
        }
      }

      const numParts = rings.length;
      // Record length: 44 (header) + 4*numParts + 16*numPoints bytes
      const recBytes = 44 + numParts * 4 + numPoints * 16;
      const buf = new ArrayBuffer(recBytes);
      const view = new DataView(buf);

      view.setInt32(0, 5, true); // Polygon type
      view.setFloat64(4, minX, true);
      view.setFloat64(12, minY, true);
      view.setFloat64(20, maxX, true);
      view.setFloat64(28, maxY, true);
      view.setInt32(36, numParts, true);
      view.setInt32(40, numPoints, true);

      let partOffset = 44;
      let pointOffset = 44 + numParts * 4;
      let curPointIndex = 0;

      for (const ring of rings) {
        view.setInt32(partOffset, curPointIndex, true);
        partOffset += 4;
        for (const pt of ring) {
          view.setFloat64(pointOffset, pt[0], true);
          view.setFloat64(pointOffset + 8, pt[1], true);
          pointOffset += 16;
          curPointIndex++;
        }
      }

      recordsData.push({ buffer: buf, lengthWords: recBytes / 2 });
    } else { // PolyLine (shapeType = 3)
      let parts: number[][][] = [];
      if (geom.type === 'LineString') {
        parts = [geom.coordinates];
      } else if (geom.type === 'MultiLineString') {
        parts = geom.coordinates;
      }

      let numPoints = 0;
      for (const part of parts) {
        numPoints += part.length;
        for (const pt of part) {
          trackBounds(pt[0], pt[1]);
        }
      }

      const numParts = parts.length;
      const recBytes = 44 + numParts * 4 + numPoints * 16;
      const buf = new ArrayBuffer(recBytes);
      const view = new DataView(buf);

      view.setInt32(0, 3, true); // PolyLine type
      view.setFloat64(4, minX, true);
      view.setFloat64(12, minY, true);
      view.setFloat64(20, maxX, true);
      view.setFloat64(28, maxY, true);
      view.setInt32(36, numParts, true);
      view.setInt32(40, numPoints, true);

      let partOffset = 44;
      let pointOffset = 44 + numParts * 4;
      let curPointIndex = 0;

      for (const part of parts) {
        view.setInt32(partOffset, curPointIndex, true);
        partOffset += 4;
        for (const pt of part) {
          view.setFloat64(pointOffset, pt[0], true);
          view.setFloat64(pointOffset + 8, pt[1], true);
          pointOffset += 16;
          curPointIndex++;
        }
      }

      recordsData.push({ buffer: buf, lengthWords: recBytes / 2 });
    }
  }

  // Calculate total lengths
  let totalShpBytes = 100;
  for (const r of recordsData) {
    totalShpBytes += 8 + r.buffer.byteLength;
  }
  const totalShxBytes = 100 + recordsData.length * 8;

  const shpBuffer = new ArrayBuffer(totalShpBytes);
  const shpView = new DataView(shpBuffer);
  const shxBuffer = new ArrayBuffer(totalShxBytes);
  const shxView = new DataView(shxBuffer);

  // Write SHP Header (100 bytes)
  shpView.setInt32(0, 9994, false); // File Code
  shpView.setInt32(24, totalShpBytes / 2, false); // File Length in 16-bit words
  shpView.setInt32(28, 1000, true); // Version 1000
  shpView.setInt32(32, shapeType, true); // Shape Type
  shpView.setFloat64(36, minX, true);
  shpView.setFloat64(44, minY, true);
  shpView.setFloat64(52, maxX, true);
  shpView.setFloat64(60, maxY, true);

  // Write SHX Header (100 bytes)
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, totalShxBytes / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, shapeType, true);
  shxView.setFloat64(36, minX, true);
  shxView.setFloat64(44, minY, true);
  shxView.setFloat64(52, maxX, true);
  shxView.setFloat64(60, maxY, true);

  // Write records
  let shpOffset = 100;
  let shxOffset = 100;
  let recordNumber = 1;

  for (const r of recordsData) {
    // SHX record (offset in 16-bit words, length in 16-bit words)
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, r.lengthWords, false);
    shxOffset += 8;

    // SHP record header (record number, content length in 16-bit words)
    shpView.setInt32(shpOffset, recordNumber, false);
    shpView.setInt32(shpOffset + 4, r.lengthWords, false);
    shpOffset += 8;

    // Copy record content
    new Uint8Array(shpBuffer, shpOffset, r.buffer.byteLength).set(new Uint8Array(r.buffer));
    shpOffset += r.buffer.byteLength;
    recordNumber++;
  }

  return { shpBuffer, shxBuffer };
}

function writeDbf(features: any[]): ArrayBuffer {
  // Collect attributes
  const fieldMap = new Map<string, 'C' | 'N'>();
  for (const f of features) {
    const props = f?.properties || {};
    for (const key of Object.keys(props)) {
      const sanitizedKey = key.slice(0, 10).replace(/[^a-zA-Z0-9_]/g, '_');
      if (!fieldMap.has(sanitizedKey)) {
        const val = props[key];
        const isNum = typeof val === 'number';
        fieldMap.set(sanitizedKey, isNum ? 'N' : 'C');
      }
    }
  }

  // Always ensure at least one field (e.g. ID)
  if (fieldMap.size === 0) {
    fieldMap.set('id', 'N');
  }

  const fields: { name: string; type: 'C' | 'N'; length: number; decimals: number }[] = [];
  fieldMap.forEach((type, name) => {
    fields.push({
      name,
      type,
      length: type === 'N' ? 18 : 64,
      decimals: type === 'N' ? 6 : 0,
    });
  });

  const recordLength = 1 + fields.reduce((sum, f) => sum + f.length, 0); // 1 byte for deletion flag
  const headerLength = 32 + fields.length * 32 + 1; // +1 for terminator 0x0D
  const totalLength = headerLength + features.length * recordLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // DBF Header
  view.setUint8(0, 0x03); // dBASE III without memo
  const now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, features.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  // Field Descriptors
  let fieldOffset = 32;
  const encoder = new TextEncoder();
  for (const field of fields) {
    const nameBytes = encoder.encode(field.name);
    for (let i = 0; i < 11; i++) {
      view.setUint8(fieldOffset + i, i < nameBytes.length ? nameBytes[i] : 0);
    }
    view.setUint8(fieldOffset + 11, field.type.charCodeAt(0));
    view.setUint8(fieldOffset + 16, field.length);
    view.setUint8(fieldOffset + 17, field.decimals);
    fieldOffset += 32;
  }
  view.setUint8(fieldOffset, 0x0D); // Header terminator

  // Write Records
  let recPos = headerLength;
  for (let i = 0; i < features.length; i++) {
    const props = features[i]?.properties || {};
    bytes[recPos++] = 0x20; // Active record flag (space)

    for (const field of fields) {
      let val = props[field.name];
      if (val === undefined || val === null) {
        val = field.name === 'id' ? (i + 1) : '';
      }
      let str = String(val);
      if (field.type === 'N') {
        str = str.padStart(field.length, ' ').slice(-field.length);
      } else {
        str = str.padEnd(field.length, ' ').slice(0, field.length);
      }
      const valBytes = encoder.encode(str);
      for (let b = 0; b < field.length; b++) {
        bytes[recPos++] = b < valBytes.length ? valBytes[b] : 0x20;
      }
    }
  }

  return buffer;
}
