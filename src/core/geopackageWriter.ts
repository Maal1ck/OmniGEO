import { Database } from 'sql.js';
import { getCRSByCode } from './crsDefinitions';
import { getWKTForCRS } from './shapefileBundle';
import { getSqlJs } from './sqlJs';
import {
  encodeGeoPackageGeometry,
  getGeoPackageBounds,
  getGeoPackageGeometryTypeName,
  getGeoPackagePropertyColumns,
  getUniqueGeoPackageLayerNames,
  quoteSqliteIdentifier,
  toGeoPackageValue,
} from './geoPackageUtils';

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

  const [sanitizedLayer] = getUniqueGeoPackageLayerNames([layerName || 'features']);
  const srsIdMatch = crsCode.match(/\d+/);
  const srsId = srsIdMatch ? parseInt(srsIdMatch[0], 10) : 4326;
  const crsInfo = getCRSByCode(crsCode);
  const wkt = getWKTForCRS(crsCode);

  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
  const geomType = getGeoPackageGeometryTypeName(features);
  const bounds = getGeoPackageBounds(features);

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

  // Discover property columns across all rows so floats widen INTEGER->REAL and dirty strings stay TEXT
  const columns = getGeoPackagePropertyColumns(features);

  // 5. Create vector feature table
  const colSql = columns
    .map(column => `${quoteSqliteIdentifier(column.name)} ${column.type || 'TEXT'}`)
    .join(', ');
  const tableIdentifier = quoteSqliteIdentifier(sanitizedLayer);
  const createTableSql = `
    CREATE TABLE ${tableIdentifier} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB
      ${colSql ? `, ${colSql}` : ''}
    );
  `;
  db.run(createTableSql);

  // 6. Register layer in gpkg_contents and gpkg_geometry_columns
  db.run(`
    INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id)
    VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?);
  `, [sanitizedLayer, sanitizedLayer, `OmniGeo export layer: ${sanitizedLayer}`, ...(bounds || [null, null, null, null]), srsId]);

  db.run(`
    INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
    VALUES (?, 'geom', ?, ?, 0, 0);
  `, [sanitizedLayer, geomType, srsId]);

  // 7. Insert features
  const insertCols = [quoteSqliteIdentifier('geom'), ...columns.map(column => quoteSqliteIdentifier(column.name))].join(', ');
  const placeholders = ['?', ...columns.map(() => '?')].join(', ');
  const insertSql = `INSERT INTO ${tableIdentifier} (${insertCols}) VALUES (${placeholders});`;
  const stmt = db.prepare(insertSql);

  try {
    for (const feature of features) {
      const geomBlob = encodeGeoPackageGeometry(feature?.geometry, srsId);
      const values: (string | number | Uint8Array | null)[] = [geomBlob];
      const properties = feature?.properties || {};
      for (const column of columns) {
        values.push(toGeoPackageValue(properties[column.sourceName]));
      }
      stmt.run(values);
    }
  } finally {
    stmt.free();
  }

  const binaryArray = db.export();
  db.close();

  return new Blob([binaryArray.buffer as ArrayBuffer], { type: 'application/geopackage+sqlite3' });
}
