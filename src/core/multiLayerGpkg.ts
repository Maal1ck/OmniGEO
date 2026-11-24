import { Database } from 'sql.js';
import JSZip from 'jszip';
import { SpatialDataset } from '../types/gis';
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
  const sanitizedLayerNames = getUniqueGeoPackageLayerNames(layers.map(layer => layer.name));
  for (const [layerIndex, layer] of layers.entries()) {
    const sanitizedLayer = sanitizedLayerNames[layerIndex];
    const features = layer.geojson?.features || (layer.geojson?.type === 'Feature' ? [layer.geojson] : []);
    const geomType = getGeoPackageGeometryTypeName(features);
    const bounds = getGeoPackageBounds(features);
    const columns = getGeoPackagePropertyColumns(features);
    const tableIdentifier = quoteSqliteIdentifier(sanitizedLayer);
    const colDefs = columns.map(column =>
      `${quoteSqliteIdentifier(column.name)} ${column.type || 'TEXT'}`
    );
    const createSql = `
      CREATE TABLE ${tableIdentifier} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        geom BLOB
        ${colDefs.length > 0 ? `, ${colDefs.join(', ')}` : ''}
      );
    `;
    db.run(createSql);

    db.run(`
      INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id)
      VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?);
    `, [
      sanitizedLayer,
      sanitizedLayer,
      `Consolidated OmniGeo layer: ${sanitizedLayer}`,
      ...(bounds || [null, null, null, null]),
      srsId,
    ]);

    db.run(`
      INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
      VALUES (?, 'geom', ?, ?, 0, 0);
    `, [sanitizedLayer, geomType, srsId]);

    const insertCols = [
      quoteSqliteIdentifier('geom'),
      ...columns.map(column => quoteSqliteIdentifier(column.name)),
    ].join(', ');
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

  const palette = ['#14B8A6', '#E96A17', '#3B82F6', '#EC4899', '#8B5CF6', '#10B981'];

  const sanitizedLayerNames = getUniqueGeoPackageLayerNames(layerNames);
  const layersXml = sanitizedLayerNames.map((name, i) => {
    const color = palette[i % palette.length];
    return `
    <maplayer type="vector" id="${name}_${i}" name="${name}">
      <datasource>./${gpkgFileName}|layername=${name}</datasource>
      <renderer-v2 type="singleSymbol">
        <symbols>
          <symbol type="fill" name="0" alpha="0.75">
            <layer pass="0" class="SimpleFill" locked="0">
              <prop k="color" v="${color}"/>
              <prop k="outline_color" v="#0F172A"/>
              <prop k="outline_width" v="0.4"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
    </maplayer>`;
  }).join('\n');

  const layerTreeXml = sanitizedLayerNames.map((name, i) => `
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
