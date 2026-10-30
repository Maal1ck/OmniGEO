import { Database } from 'sql.js';
import JSZip from 'jszip';
import { SpatialDataset } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { getWKTForCRS } from './shapefileBundle';
import { getSqlJs } from './sqlJs';

function geometryToGeoPackageBlob(geom: any, srsId: number): Uint8Array {
  if (!geom || !geom.coordinates) {
    return new Uint8Array(0);
  }

  const wkbParts: number[] = [];
  const gpbHeader = [0x47, 0x50, 0x00, 0x01];
  gpbHeader.push(srsId & 0xff);
  gpbHeader.push((srsId >> 8) & 0xff);
  gpbHeader.push((srsId >> 16) & 0xff);
  gpbHeader.push((srsId >> 24) & 0xff);

  wkbParts.push(1); // Little endian

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
 * Consolidates multiple datasets into a single multi-layer OGC GeoPackage
 */
export async function createMultiLayerGeoPackage(
  layers: { name: string; geojson: any }[],
  crsCode: string
): Promise<Blob> {
  const SQL = await getSqlJs();
  const db: Database = new SQL.Database();

  const srsIdMatch = crsCode.match(/\d+/);
  const srsId = srsIdMatch ? parseInt(srsIdMatch[0], 10) : 4326;
  const crsInfo = getCRSByCode(crsCode);
  const wkt = getWKTForCRS(crsCode);

  db.run(`PRAGMA application_id = 0x47504B47;`);
  db.run(`PRAGMA user_version = 10200;`);

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
  `, [crsInfo?.name || crsCode, srsId, srsId, wkt, crsInfo?.area || 'Global']);

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

  // Add each layer as a dedicated vector table
  for (const layer of layers) {
    const sanitizedLayer = layer.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const features = layer.geojson?.features || (layer.geojson?.type === 'Feature' ? [layer.geojson] : []);

    let geomType = 'POINT';
    const first = features.find((f: any) => f?.geometry)?.geometry?.type;
    if (first === 'Polygon' || first === 'MultiPolygon') geomType = 'POLYGON';
    else if (first === 'LineString' || first === 'MultiLineString') geomType = 'LINESTRING';

    const colMap = new Map<string, 'TEXT' | 'REAL' | 'INTEGER'>();
    for (const f of features) {
      const props = f?.properties || {};
      for (const [k, v] of Object.entries(props)) {
        const colName = k.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        if (!colMap.has(colName)) {
          let colType: 'TEXT' | 'REAL' | 'INTEGER' = 'TEXT';
          if (typeof v === 'number') {
            colType = Number.isInteger(v) ? 'INTEGER' : 'REAL';
          }
          colMap.set(colName, colType);
        }
      }
    }

    const colDefs = Array.from(colMap.entries()).map(([name, type]) => `"${name}" ${type}`);
    const createSql = `
      CREATE TABLE "${sanitizedLayer}" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        geom BLOB
        ${colDefs.length > 0 ? `, ${colDefs.join(', ')}` : ''}
      );
    `;
    db.run(createSql);

    db.run(`
      INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id)
      VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?);
    `, [sanitizedLayer, sanitizedLayer, `Consolidated OmniGeo layer: ${sanitizedLayer}`, -180, -90, 180, 90, srsId]);

    db.run(`
      INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
      VALUES (?, 'geom', ?, ?, 0, 0);
    `, [sanitizedLayer, geomType, srsId]);

    const colNames = Array.from(colMap.keys());
    const insertCols = ['geom', ...colNames.map(c => `"${c}"`)].join(', ');
    const placeholders = ['?', ...colNames.map(() => '?')].join(', ');
    const insertSql = `INSERT INTO "${sanitizedLayer}" (${insertCols}) VALUES (${placeholders});`;
    const stmt = db.prepare(insertSql);

    for (const f of features) {
      const geomBlob = geometryToGeoPackageBlob(f.geometry, srsId);
      const values: any[] = [geomBlob];
      const props = f.properties || {};
      for (const col of colNames) {
        values.push(props[col] ?? null);
      }
      stmt.run(values);
    }
    stmt.free();
  }

  const binaryArray = db.export();
  db.close();

  return new Blob([binaryArray.buffer as ArrayBuffer], { type: 'application/geopackage+sqlite3' });
}

/**
 * Generates a QGIS 3.x project file (.qgs) in XML format referencing the GeoPackage layers
 */
export function generateQgisProjectXml(
  gpkgFileName: string,
  layerNames: string[],
  crsCode: string
): string {
  const srsIdMatch = crsCode.match(/\d+/);
  const epsgNum = srsIdMatch ? srsIdMatch[0] : '4326';

  const palette = ['#14b8a6', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981'];

  const layersXml = layerNames.map((name, i) => {
    const color = palette[i % palette.length];
    return `
    <maplayer type="vector" id="${name}_${i}" name="${name}">
      <datasource>./${gpkgFileName}|layername=${name}</datasource>
      <renderer-v2 type="singleSymbol">
        <symbols>
          <symbol type="fill" name="0" alpha="0.75">
            <layer pass="0" class="SimpleFill" locked="0">
              <prop k="color" v="${color}"/>
              <prop k="outline_color" v="#0f172a"/>
              <prop k="outline_width" v="0.4"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
    </maplayer>`;
  }).join('\n');

  const layerTreeXml = layerNames.map((name, i) => `
    <layer-tree-layer id="${name}_${i}" name="${name}" checked="Qt::Checked" expanded="1" />
  `).join('\n');

  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="OmniGeo by Maodo Handoff" version="3.34.0">
  <title>OmniGeo by Maodo Consolidated Project</title>
  <projectCrs>
    <spatialrefsys>
      <authid>EPSG:${epsgNum}</authid>
    </spatialrefsys>
  </projectCrs>
  <layer-tree-group>
    <customproperties/>
    ${layerTreeXml}
  </layer-tree-group>
  <projectlayers>
    ${layersXml}
  </projectlayers>
</qgis>`;
}

/**
 * Bundles a consolidated multi-layer GeoPackage and accompanying QGIS Project into a ZIP archive
 */
export async function bundleConsolidatedHandoff(
  gpkgBlob: Blob,
  gpkgName: string,
  qgsXml: string,
  projectName: string
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(gpkgName, gpkgBlob);
  zip.file(`${projectName}.qgs`, qgsXml);
  zip.file('README_HANDOFF.txt', 
`OmniGeo by Maodo — Consolidated GIS Delivery Bundle
==================================================
Package File: ${gpkgName}
QGIS Project: ${projectName}.qgs
Generated:    ${new Date().toISOString()}

Instructions:
1. Double click "${projectName}.qgs" to open the pre-styled multi-layer project in QGIS.
2. Or drag "${gpkgName}" directly into ArcGIS Pro or QGIS Browser.
All vector tables are consolidated into this single OGC standard SQLite container.
`);

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
