import { AttributeField, SpatialDataset } from '../types/gis';

export interface PostgisExportOptions {
  schemaName: string; // e.g. "public"
  tableName: string; // e.g. "omni_parcels"
  geomColumnName: string; // e.g. "geom"
  srid: number; // e.g. 4326, 2154, 3857
  dropTableIfExists: boolean;
  createSpatialIndex: boolean;
  batchSize: number; // default 100
  host?: string;
  port?: number;
  database?: string;
  username?: string;
}

/**
 * Sanitizes PostgreSQL identifier (table name, column name, schema name)
 */
export function sanitizeSqlIdentifier(name: string): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || 'field';
}

/**
 * Maps attribute field type to PostgreSQL native data type
 */
function mapFieldToPostgresType(field: AttributeField): string {
  switch (field.type) {
    case 'number': {
      // Check sample values to see if all are integers
      const isAllInt = field.sampleValues.every(v => v === null || Number.isInteger(Number(v)));
      return isAllInt ? 'INTEGER' : 'DOUBLE PRECISION';
    }
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'TIMESTAMPTZ';
    case 'object':
      return 'JSONB';
    case 'string':
    default:
      return 'TEXT';
  }
}

/**
 * Escapes SQL string literal
 */
function escapeSqlLiteral(val: any): string {
  if (val === undefined || val === null) return 'NULL';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Extracts numeric SRID from CRSInfo or defaults to 4326
 */
export function extractSRID(dataset: SpatialDataset): number {
  if (dataset.detectedCRS?.code) {
    const num = parseInt(dataset.detectedCRS.code.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 4326;
}

/**
 * Generates complete PostGIS SQL script with DDL, spatial constraints, and batched inserts
 */
export function generatePostgisSql(
  dataset: SpatialDataset,
  options: Partial<PostgisExportOptions> = {}
): string {
  const schema = sanitizeSqlIdentifier(options.schemaName || 'public');
  const table = sanitizeSqlIdentifier(options.tableName || dataset.name || 'omni_features');
  const geomCol = sanitizeSqlIdentifier(options.geomColumnName || 'geom');
  const srid = options.srid || extractSRID(dataset);
  const dropTable = options.dropTableIfExists ?? true;
  const createIndex = options.createSpatialIndex ?? true;
  const batchSize = Math.max(1, Math.min(500, options.batchSize || 100));

  const features = dataset.geojson?.features || (dataset.geojson?.type === 'Feature' ? [dataset.geojson] : []);
  const geomType = dataset.geometryType === 'Unknown' ? 'Geometry' : dataset.geometryType;

  let sql = `-- ====================================================================\n`;
  sql += `-- OmniGeo by Maodo: PostGIS Automated Ingestion Script\n`;
  sql += `-- Dataset: ${dataset.name} (${dataset.originalFileName})\n`;
  sql += `-- Target: "${schema}"."${table}" | SRID: ${srid} | Features: ${features.length}\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- ====================================================================\n\n`;

  sql += `-- 1. Ensure PostGIS Spatial Extension & Schema exist\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS postgis;\n`;
  if (schema !== 'public') {
    sql += `CREATE SCHEMA IF NOT EXISTS "${schema}";\n`;
  }
  sql += `\n`;

  if (dropTable) {
    sql += `-- 2. Drop existing table if requested\n`;
    sql += `DROP TABLE IF EXISTS "${schema}"."${table}" CASCADE;\n\n`;
  }

  sql += `-- 3. Create Table DDL\n`;
  sql += `CREATE TABLE "${schema}"."${table}" (\n`;
  sql += `  ogc_fid SERIAL PRIMARY KEY,\n`;

  const colDefinitions: string[] = [];
  const fieldMapping: { sourceName: string; sanitizedName: string; pgType: string }[] = [];

  for (const field of dataset.fields) {
    const sanitized = sanitizeSqlIdentifier(field.name);
    if (sanitized === 'ogc_fid' || sanitized === geomCol) continue;
    const pgType = mapFieldToPostgresType(field);
    colDefinitions.push(`  "${sanitized}" ${pgType}`);
    fieldMapping.push({ sourceName: field.name, sanitizedName: sanitized, pgType });
  }

  // Geometry column with typed PostGIS geometry
  colDefinitions.push(`  "${geomCol}" geometry(${geomType}, ${srid})`);

  sql += colDefinitions.join(',\n');
  sql += `\n);\n\n`;

  sql += `COMMENT ON TABLE "${schema}"."${table}" IS 'Ingested from OmniGeo GIS Suite (${dataset.originalFileName})';\n\n`;

  if (features.length > 0) {
    sql += `-- 4. Batched Spatial Features DML Inserts (${features.length} records)\n`;

    const insertColNames = [
      ...fieldMapping.map(f => `"${f.sanitizedName}"`),
      `"${geomCol}"`,
    ].join(', ');

    for (let i = 0; i < features.length; i += batchSize) {
      const chunk = features.slice(i, i + batchSize);
      sql += `INSERT INTO "${schema}"."${table}" (${insertColNames})\nVALUES\n`;

      const rowValues: string[] = [];
      for (const f of chunk) {
        const props = f.properties || {};
        const values: string[] = [];

        for (const fMap of fieldMapping) {
          const val = props[fMap.sourceName];
          values.push(escapeSqlLiteral(val));
        }

        // Geometry value via ST_SetSRID(ST_GeomFromGeoJSON(...), srid)
        if (f.geometry) {
          const geomJson = JSON.stringify(f.geometry).replace(/'/g, "''");
          values.push(`ST_SetSRID(ST_GeomFromGeoJSON('${geomJson}'), ${srid})`);
        } else {
          values.push('NULL');
        }

        rowValues.push(`  (${values.join(', ')})`);
      }

      sql += rowValues.join(',\n');
      sql += `;\n\n`;
    }
  }

  if (createIndex) {
    sql += `-- 5. Spatial Index for ultra-fast bounding box & spatial queries\n`;
    sql += `CREATE INDEX "idx_${table}_${geomCol}" ON "${schema}"."${table}" USING GIST ("${geomCol}");\n\n`;
  }

  sql += `-- 6. Vacuum Analyze to update PostGIS query optimizer statistics\n`;
  sql += `VACUUM ANALYZE "${schema}"."${table}";\n`;

  return sql;
}

/**
 * Generates terminal psql command snippet
 */
export function generatePsqlCommand(options: PostgisExportOptions, sqlFileName: string): string {
  const host = options.host || 'localhost';
  const port = options.port || 5432;
  const user = options.username || 'postgres';
  const db = options.database || 'geodb';
  return `psql -h ${host} -p ${port} -U ${user} -d ${db} -f "${sqlFileName}"`;
}

/**
 * Generates GDAL ogr2ogr command snippet for direct PostGIS pipeline
 */
export function generateOgr2ogrCommand(
  datasetName: string,
  options: PostgisExportOptions,
  sourceGeojsonFile: string
): string {
  const host = options.host || 'localhost';
  const port = options.port || 5432;
  const user = options.username || 'postgres';
  const db = options.database || 'geodb';
  const schema = sanitizeSqlIdentifier(options.schemaName || 'public');
  const table = sanitizeSqlIdentifier(options.tableName || datasetName);
  const geomCol = sanitizeSqlIdentifier(options.geomColumnName || 'geom');

  return `ogr2ogr -f "PostgreSQL" PG:"host=${host} port=${port} dbname=${db} user=${user} password=YOUR_PASSWORD active_schema=${schema}" "${sourceGeojsonFile}" -nln "${table}" -overwrite -lco GEOMETRY_NAME=${geomCol} -lco SPATIAL_INDEX=GIST`;
}

/**
 * Generates Python GeoPandas / SQLAlchemy script snippet
 */
export function generatePythonScript(dataset: SpatialDataset, options: PostgisExportOptions): string {
  const host = options.host || 'localhost';
  const port = options.port || 5432;
  const user = options.username || 'postgres';
  const db = options.database || 'geodb';
  const schema = sanitizeSqlIdentifier(options.schemaName || 'public');
  const table = sanitizeSqlIdentifier(options.tableName || dataset.name);

  return `import geopandas as gpd
from sqlalchemy import create_engine

# 1. Load exported dataset
gdf = gpd.read_file("${dataset.originalFileName}")

# 2. Establish PostgreSQL / PostGIS Engine
connection_url = "postgresql://${user}:YOUR_PASSWORD@${host}:${port}/${db}"
engine = create_engine(connection_url)

# 3. Export to PostGIS with spatial index
gdf.to_postgis(
    name="${table}",
    con=engine,
    schema="${schema}",
    if_exists="replace",
    index=False
)
print("Successfully ingested ${dataset.name} (${dataset.featureCount} features) into PostGIS table: ${schema}.${table}")
`;
}
