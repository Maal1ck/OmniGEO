import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { getCRSByCode } from './crsDefinitions';
import { getWKTForCRS } from './shapefileBundle';

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }
  return sqlPromise;
}

/**
 * Converts a GeoJSON geometry into GeoPackage Binary (GPB) header + WKB
 */
function geometryToGeoPackageBlob(geom: any, srsId: number): Uint8Array {
  if (!geom || !geom.coordinates) {
    return new Uint8Array(0);
  }

  // WKB generator for basic geometries
  const wkbParts: number[] = [];

  // GeoPackage Binary Header:
  // Byte 0-1: Magic 'GP' (0x47, 0x50)
  // Byte 2: Version (0)
  // Byte 3: Flags (Bit 0: Little Endian 1, Bits 1-3: Envelope Indicator 0 = no envelope)
  // Byte 4-7: srs_id (32-bit int, little-endian)
  const gpbHeader = [0x47, 0x50, 0x00, 0x01];
  // srsId 4 bytes little endian
  gpbHeader.push(srsId & 0xff);
  gpbHeader.push((srsId >> 8) & 0xff);
  gpbHeader.push((srsId >> 16) & 0xff);
  gpbHeader.push((srsId >> 24) & 0xff);

  // WKB Body: Byte Order (1 = little endian)
  wkbParts.push(1);

  function writeDouble(val: number) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, val, true);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) wkbParts.push(u8[i]);
  }

  function writeInt32(val: number) {
    wkbParts.push(val & 0xff);
    wkbParts.push((val >> 8) & 0xff);
    wkbParts.push((val >> 16) & 0xff);
    wkbParts.push((val >> 24) & 0xff);
  }

  if (geom.type === 'Point') {
    writeInt32(1); // WKBPoint
    writeDouble(Number(geom.coordinates[0]) || 0);
    writeDouble(Number(geom.coordinates[1]) || 0);
  } else if (geom.type === 'LineString') {
    writeInt32(2); // WKBLineString
    writeInt32(geom.coordinates.length);
    for (const pt of geom.coordinates) {
      writeDouble(Number(pt[0]) || 0);
      writeDouble(Number(pt[1]) || 0);
    }
  } else if (geom.type === 'Polygon') {
    writeInt32(3); // WKBPolygon
    writeInt32(geom.coordinates.length);
    for (const ring of geom.coordinates) {
      writeInt32(ring.length);
      for (const pt of ring) {
        writeDouble(Number(pt[0]) || 0);
        writeDouble(Number(pt[1]) || 0);
      }
    }
  } else {
    // Default fallback Point
    writeInt32(1);
    writeDouble(0);
    writeDouble(0);
  }

  const result = new Uint8Array(gpbHeader.length + wkbParts.length);
  result.set(gpbHeader, 0);
  result.set(wkbParts, gpbHeader.length);
  return result;
}

/**
 * Creates an OGC GeoPackage database file
 */
export async function createGeoPackageFile(
  geojson: any,
  layerName: string,
  crsCode: string
): Promise<Blob> {
  const SQL = await getSqlJs();
  const db: Database = new SQL.Database();

  const sanitizedLayer = (layerName || 'features').replace(/[^a-zA-Z0-9_]/g, '_');
  const srsIdMatch = crsCode.match(/\d+/);
  const srsId = srsIdMatch ? parseInt(srsIdMatch[0], 10) : 4326;
  const crsInfo = getCRSByCode(crsCode);
  const wkt = getWKTForCRS(crsCode);

  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  let geomType = 'POINT';
  const first = features.find((f: any) => f?.geometry)?.geometry?.type;
  if (first === 'Polygon' || first === 'MultiPolygon') geomType = 'POLYGON';
  else if (first === 'LineString' || first === 'MultiLineString') geomType = 'LINESTRING';

  // 1. Set PRAGMAs for GeoPackage
  db.run(`PRAGMA application_id = 0x47504B47;`); // 'GPKG'
  db.run(`PRAGMA user_version = 10200;`); // GeoPackage 1.2

  // 2. Create gpkg_spatial_ref_sys table
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    );
  `);

  db.run(`
    INSERT INTO gpkg_spatial_ref_sys VALUES 
    ('Undefined Cartesian', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'),
    ('Undefined Geographic', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'),
    (?, ?, 'EPSG', ?, ?, ?);
  `, [
    crsInfo?.name || crsCode,
    srsId,
    srsId,
    wkt,
    crsInfo?.area || 'Global'
  ]);

  // 3. Create gpkg_contents table
  db.run(`
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  // 4. Create gpkg_geometry_columns table
  db.run(`
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL,
      m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);

  // Discover property columns
  const columnDefs: { name: string; type: 'TEXT' | 'REAL' | 'INTEGER' }[] = [];
  const colSet = new Set<string>();

  for (const f of features) {
    const props = f?.properties || {};
    for (const [k, v] of Object.entries(props)) {
      const colName = k.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!colSet.has(colName)) {
        colSet.add(colName);
        let colType: 'TEXT' | 'REAL' | 'INTEGER' = 'TEXT';
        if (typeof v === 'number') {
          colType = Number.isInteger(v) ? 'INTEGER' : 'REAL';
        }
        columnDefs.push({ name: colName, type: colType });
      }
    }
  }

  // 5. Create vector feature table
  const colSql = columnDefs.map(c => `"${c.name}" ${c.type}`).join(', ');
  const createTableSql = `
    CREATE TABLE "${sanitizedLayer}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB
      ${colSql ? `, ${colSql}` : ''}
    );
  `;
  db.run(createTableSql);

  // 6. Register layer in gpkg_contents and gpkg_geometry_columns
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (geojson.bbox) {
    [minX, minY, maxX, maxY] = geojson.bbox;
  }

  db.run(`
    INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id)
    VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?);
  `, [sanitizedLayer, sanitizedLayer, `OmniGeo export layer: ${sanitizedLayer}`, minX, minY, maxX, maxY, srsId]);

  db.run(`
    INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
    VALUES (?, 'geom', ?, ?, 0, 0);
  `, [sanitizedLayer, geomType, srsId]);

  // 7. Insert features
  const insertCols = ['geom', ...columnDefs.map(c => `"${c.name}"`)].join(', ');
  const placeholders = ['?', ...columnDefs.map(() => '?')].join(', ');
  const insertSql = `INSERT INTO "${sanitizedLayer}" (${insertCols}) VALUES (${placeholders});`;
  const stmt = db.prepare(insertSql);

  for (const f of features) {
    const geomBlob = geometryToGeoPackageBlob(f.geometry, srsId);
    const values: any[] = [geomBlob];
    const props = f.properties || {};
    for (const col of columnDefs) {
      values.push(props[col.name] ?? null);
    }
    stmt.run(values);
  }
  stmt.free();

  const binaryArray = db.export();
  db.close();

  return new Blob([binaryArray.buffer as ArrayBuffer], { type: 'application/geopackage+sqlite3' });
}
