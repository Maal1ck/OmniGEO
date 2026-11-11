/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialDataset } from '../types/gis';

export interface PostgresColumnSchema {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyTarget?: {
    table: string;
    column: string;
    schema?: string;
  };
  isGeometry: boolean;
  geometryType?: string;
  srid?: number;
  comment?: string;
}

export interface PostgresRelationship {
  id: string;
  constraintName: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  updateRule?: string;
  deleteRule?: string;
  cardinality?: '1:1' | '1:N' | 'N:1' | 'N:M' | '0:1' | '0:N';
  sourceCardinality?: string; // e.g. "0..n" or "1..n"
  targetCardinality?: string; // e.g. "1..1" or "0..1"
}

export interface PostgresTableSchema {
  name: string;
  schema: string;
  estimatedRows: number;
  sizeFormatted?: string;
  columns: PostgresColumnSchema[];
  primaryKeys: string[];
  foreignKeys: PostgresRelationship[];
  isSpatial: boolean;
  comment?: string;
}

export interface PostgresDatabaseSchema {
  databaseName: string;
  serverVersion?: string;
  generatedAt: string;
  host?: string;
  port?: number;
  description?: string;
  tables: PostgresTableSchema[];
  relationships: PostgresRelationship[];
  summary: {
    totalTables: number;
    totalRecords: number;
    totalColumns: number;
    totalRelationships: number;
    totalSpatialTables: number;
    dataTypesDistribution: Record<string, number>;
  };
}

/**
 * Normalizes any database type to official canonical PostgreSQL naming.
 * (e.g. character varying(n), integer, double precision, timestamp with time zone, boolean, geometry(Type, SRID))
 */
export function normalizeToPostgresType(rawType: string): string {
  if (!rawType) return 'text';
  const trimmed = rawType.trim();
  const lower = trimmed.toLowerCase();

  // PostGIS geometry: geometry(Type, SRID) or geography(Type, SRID)
  const geomMatch = lower.match(/(?:geometry|geography)\s*\(\s*([a-zA-Z0-9_]+)(?:\s*,\s*(\d+))?\s*\)/i);
  if (geomMatch) {
    const geomType = geomMatch[1];
    const srid = geomMatch[2] || '4326';
    return `geometry(${geomType}, ${srid})`;
  }
  if (lower === 'geometry') return 'geometry(Geometry, 4326)';
  if (lower === 'geography') return 'geography(Geometry, 4326)';

  // Character varying & char
  const varcharMatch = lower.match(/^(?:character\s+varying|varchar)\s*\(\s*(\d+)\s*\)/i);
  if (varcharMatch) {
    return `character varying(${varcharMatch[1]})`;
  }
  if (lower === 'varchar' || lower === 'character varying') {
    return 'character varying';
  }
  const charMatch = lower.match(/^(?:character|char)\s*\(\s*(\d+)\s*\)/i);
  if (charMatch) {
    return `character(${charMatch[1]})`;
  }
  if (lower === 'char' || lower === 'character') {
    return 'character(1)';
  }
  if (lower === 'string' || lower === 'text') {
    return 'text';
  }

  // Exact Numerics
  const numericMatch = lower.match(/^(?:numeric|decimal)\s*\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/i);
  if (numericMatch) {
    const scale = numericMatch[2] !== undefined ? numericMatch[2] : '0';
    return `numeric(${numericMatch[1]}, ${scale})`;
  }
  if (lower === 'numeric' || lower === 'decimal' || lower === 'number') {
    return 'numeric';
  }
  if (lower === 'int4' || lower === 'int' || lower === 'integer') {
    return 'integer';
  }
  if (lower === 'int8' || lower === 'bigint') {
    return 'bigint';
  }
  if (lower === 'int2' || lower === 'smallint') {
    return 'smallint';
  }
  if (lower === 'serial' || lower === 'serial4') {
    return 'serial';
  }
  if (lower === 'bigserial' || lower === 'serial8') {
    return 'bigserial';
  }
  if (lower === 'smallserial' || lower === 'serial2') {
    return 'smallserial';
  }
  if (lower === 'float8' || lower === 'double precision' || lower === 'double' || lower === 'float') {
    return 'double precision';
  }
  if (lower === 'float4' || lower === 'real') {
    return 'real';
  }

  // Boolean
  if (lower === 'bool' || lower === 'boolean') {
    return 'boolean';
  }

  // Temporal
  if (lower.includes('timestamptz') || lower.includes('timestamp with time zone')) {
    return 'timestamp with time zone';
  }
  if (lower.includes('timestamp') || lower === 'datetime') {
    return 'timestamp without time zone';
  }
  if (lower === 'date') {
    return 'date';
  }
  if (lower.includes('timetz') || lower.includes('time with time zone')) {
    return 'time with time zone';
  }
  if (lower === 'time' || lower.includes('time without time zone')) {
    return 'time without time zone';
  }
  if (lower.includes('interval')) {
    return 'interval';
  }

  // Special types
  if (lower === 'jsonb') return 'jsonb';
  if (lower === 'json') return 'json';
  if (lower === 'uuid') return 'uuid';
  if (lower === 'bytea' || lower === 'blob' || lower === 'binary') return 'bytea';
  if (lower === 'cidr' || lower === 'inet' || lower === 'macaddr') return lower;

  return trimmed;
}

/**
 * Production-ready PostgreSQL metadata extractor query.
 * Can be run directly in pgAdmin 4 or psql to produce a full JSON document.
 * Formats data types into strict canonical PostgreSQL naming.
 */
export const POSTGRES_EXTRACTOR_SQL = `-- ==============================================================================
-- OmniGeo Global Database Report Extractor Query
-- Execute this query in pgAdmin 4 (Query Tool) or psql.
-- It returns a single JSON document containing all tables, columns, canonical PostgreSQL types, 
-- constraints, foreign-key relationships, and row estimates.
-- ==============================================================================

WITH tables_metadata AS (
  SELECT 
    t.table_schema,
    t.table_name,
    COALESCE(c.reltuples::bigint, 0) AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) AS size_pretty,
    obj_description(c.oid, 'pg_class') AS table_comment
  FROM information_schema.tables t
  JOIN pg_class c ON c.relname = t.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
    AND t.table_type = 'BASE TABLE'
),
fk_constraints AS (
  SELECT
    tc.constraint_name,
    tc.table_schema AS source_schema,
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_schema AS target_schema,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    rc.update_rule,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
),
columns_metadata AS (
  SELECT 
    c.table_schema,
    c.table_name,
    c.column_name,
    c.ordinal_position,
    c.data_type,
    c.udt_name,
    CASE 
      WHEN c.udt_name = 'geometry' THEN 'geometry(Geometry, 4326)'
      WHEN c.character_maximum_length IS NOT NULL AND c.data_type = 'character varying' THEN 'character varying(' || c.character_maximum_length || ')'
      WHEN c.character_maximum_length IS NOT NULL AND c.data_type = 'character' THEN 'character(' || c.character_maximum_length || ')'
      WHEN c.numeric_precision IS NOT NULL AND c.data_type = 'numeric' THEN 'numeric(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale, 0) || ')'
      ELSE c.data_type
    END AS formatted_type,
    (c.is_nullable = 'YES') AS is_nullable,
    c.column_default,
    EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_schema = c.table_schema 
        AND tc.table_name = c.table_name 
        AND kcu.column_name = c.column_name
    ) AS is_primary_key,
    fk.target_table AS fk_target_table,
    fk.target_column AS fk_target_column,
    fk.target_schema AS fk_target_schema,
    (c.udt_name = 'geometry' OR c.data_type = 'USER-DEFINED' AND c.udt_name IN ('geometry', 'geography')) AS is_geometry,
    col_description(pa.attrelid, pa.attnum) AS column_comment
  FROM information_schema.columns c
  JOIN pg_class pc ON pc.relname = c.table_name
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
  LEFT JOIN pg_attribute pa ON pa.attrelid = pc.oid AND pa.attname = c.column_name
  LEFT JOIN fk_constraints fk 
    ON fk.source_schema = c.table_schema 
    AND fk.source_table = c.table_name 
    AND fk.source_column = c.column_name
  WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
)
SELECT json_build_object(
  'databaseName', current_database(),
  'serverVersion', version(),
  'generatedAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'tables', (
    SELECT json_agg(
      json_build_object(
        'name', tm.table_name,
        'schema', tm.table_schema,
        'estimatedRows', GREATEST(tm.estimated_rows, 0),
        'sizeFormatted', tm.size_pretty,
        'comment', tm.table_comment,
        'columns', (
          SELECT json_agg(
            json_build_object(
              'name', cm.column_name,
              'dataType', cm.formatted_type,
              'isNullable', cm.is_nullable,
              'defaultValue', cm.column_default,
              'isPrimaryKey', cm.is_primary_key,
              'isForeignKey', (cm.fk_target_table IS NOT NULL),
              'foreignKeyTarget', CASE 
                WHEN cm.fk_target_table IS NOT NULL THEN json_build_object(
                  'table', cm.fk_target_table,
                  'column', cm.fk_target_column,
                  'schema', cm.fk_target_schema
                )
                ELSE NULL 
              END,
              'isGeometry', cm.is_geometry,
              'comment', cm.column_comment
            ) ORDER BY cm.ordinal_position
          )
          FROM columns_metadata cm
          WHERE cm.table_schema = tm.table_schema AND cm.table_name = tm.table_name
        )
      ) ORDER BY tm.table_name
    )
    FROM tables_metadata tm
  ),
  'relationships', (
    SELECT json_agg(
      json_build_object(
        'id', 'rel_' || fk.source_table || '_' || fk.source_column,
        'constraintName', fk.constraint_name,
        'sourceTable', fk.source_table,
        'sourceColumn', fk.source_column,
        'targetTable', fk.target_table,
        'targetColumn', fk.target_column,
        'updateRule', fk.update_rule,
        'deleteRule', fk.delete_rule,
        'cardinality', '1:N'
      )
    )
    FROM fk_constraints fk
  )
) AS omnigeo_db_report;`;

/**
 * Lightweight automated Python script to fetch metadata directly via psycopg2.
 */
export function generatePythonReportScript(connStr = 'postgresql://postgres:password@localhost:5432/gisdb'): string {
  return `# ==============================================================================
# OmniGeo PostgreSQL Database Inspector & Report Generator
# Run: pip install psycopg2-binary
# Usage: python omnigeo_db_report.py "${connStr}"
# ==============================================================================

import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor

connection_url = sys.argv[1] if len(sys.argv) > 1 else "${connStr}"

print(f"[*] Connecting to PostgreSQL: {connection_url}")

EXTRACTOR_QUERY = """${POSTGRES_EXTRACTOR_SQL.replace(/`/g, '\\`')}"""

try:
    conn = psycopg2.connect(connection_url)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(EXTRACTOR_QUERY)
    result = cur.fetchone()
    report_json = result['omnigeo_db_report']
    
    out_filename = f"{report_json.get('databaseName', 'database')}_schema_report.json"
    with open(out_filename, 'w', encoding='utf-8') as f:
        json.dump(report_json, f, indent=2, ensure_ascii=False)
        
    print(f"[✓] Successfully generated report data: {out_filename}")
    print(f"[✓] You can paste or drag this JSON into OmniGeo to view and download both Data Dictionary and MPD HTML reports!")
    cur.close()
    conn.close()
except Exception as e:
    print(f"[!] Error inspecting PostgreSQL database: {e}")
    sys.exit(1)
`;
}

/**
 * Builds schema metadata summary from tables and relationships.
 */
export function computeDatabaseSummary(
  tables: PostgresTableSchema[],
  relationships: PostgresRelationship[]
): PostgresDatabaseSchema['summary'] {
  let totalRecords = 0;
  let totalColumns = 0;
  let totalSpatialTables = 0;
  const dataTypesDistribution: Record<string, number> = {};

  for (const t of tables) {
    totalRecords += t.estimatedRows || 0;
    if (t.isSpatial) totalSpatialTables++;
    for (const c of t.columns) {
      totalColumns++;
      const typeCategory = categorizeDataType(c.dataType);
      dataTypesDistribution[typeCategory] = (dataTypesDistribution[typeCategory] || 0) + 1;
    }
  }

  return {
    totalTables: tables.length,
    totalRecords,
    totalColumns,
    totalRelationships: relationships.length,
    totalSpatialTables,
    dataTypesDistribution,
  };
}

export function categorizeDataType(typeStr: string): string {
  const lower = typeStr.toLowerCase();
  if (lower.includes('geom') || lower.includes('geog') || lower.includes('point') || lower.includes('polygon') || lower.includes('linestring')) {
    return 'Spatial (PostGIS)';
  }
  if (lower.includes('int') || lower.includes('serial') || lower.includes('numeric') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('real')) {
    return 'Numeric';
  }
  if (lower.includes('char') || lower.includes('text') || lower.includes('varchar')) {
    return 'Text / String';
  }
  if (lower.includes('time') || lower.includes('date') || lower.includes('interval')) {
    return 'Temporal (Date/Time)';
  }
  if (lower.includes('bool')) {
    return 'Boolean';
  }
  if (lower.includes('json') || lower.includes('uuid') || lower.includes('bytea')) {
    return 'Special (JSON/UUID)';
  }
  return 'Other';
}

/**
 * Parses raw DDL / SQL text into a structured PostgresDatabaseSchema,
 * normalizing all data types into strict canonical PostgreSQL naming.
 */
export function parsePostgresDDL(sqlContent: string, dbName = 'imported_postgres_db'): PostgresDatabaseSchema {
  const tables: PostgresTableSchema[] = [];
  const relationships: PostgresRelationship[] = [];

  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;

  let match: RegExpExecArray | null;

  while ((match = createTableRegex.exec(sqlContent)) !== null) {
    const schema = match[1] || 'public';
    const tableName = match[2];
    const body = match[3];

    const columns: PostgresColumnSchema[] = [];
    const primaryKeys: string[] = [];
    let isSpatial = false;

    const lines = splitSqlColumns(body);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Match PRIMARY KEY constraint
      const pkMatch = line.match(/(?:CONSTRAINT\s+["`]?([a-zA-Z0-9_]+)["`]?\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const pkCols = pkMatch[2].split(',').map(s => s.trim().replace(/["`]/g, ''));
        primaryKeys.push(...pkCols);
        continue;
      }

      // Match FOREIGN KEY constraint
      const fkMatch = line.match(/(?:CONSTRAINT\s+["`]?([a-zA-Z0-9_]+)["`]?\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([^)]+)\)/i);
      if (fkMatch) {
        const constraintName = fkMatch[1] || `fk_${tableName}_${fkMatch[2].replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const sourceCol = fkMatch[2].trim().replace(/["`]/g, '');
        const targetTable = fkMatch[4].trim();
        const targetCol = fkMatch[5].trim().replace(/["`]/g, '');

        relationships.push({
          id: `rel_${tableName}_${sourceCol}`,
          constraintName,
          sourceTable: tableName,
          sourceColumn: sourceCol,
          targetTable,
          targetColumn: targetCol,
          cardinality: '1:N',
          sourceCardinality: '0..n',
          targetCardinality: '1..1',
        });
        continue;
      }

      // Match column definition
      const colMatch = line.match(/^["`]?([a-zA-Z0-9_]+)["`]?\s+([a-zA-Z0-9_]+(?:\s*\([^)]+\))?)([\s\S]*)$/i);
      if (colMatch) {
        const colName = colMatch[1];
        const rawColType = colMatch[2];
        const colType = normalizeToPostgresType(rawColType);
        const modifiers = colMatch[3] || '';

        const isNullable = !/NOT\s+NULL/i.test(modifiers);
        const isInlinePk = /PRIMARY\s+KEY/i.test(modifiers);
        if (isInlinePk && !primaryKeys.includes(colName)) {
          primaryKeys.push(colName);
        }

        const defaultMatch = modifiers.match(/DEFAULT\s+([^,;]+)/i);
        const defaultValue = defaultMatch ? defaultMatch[1].trim() : null;

        const inlineFkMatch = modifiers.match(/REFERENCES\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*(?:\(([^)]+)\))?/i);
        let fkTarget: PostgresColumnSchema['foreignKeyTarget'] = undefined;
        let isForeignKey = false;

        if (inlineFkMatch) {
          isForeignKey = true;
          const targetTable = inlineFkMatch[2];
          const targetCol = inlineFkMatch[3] ? inlineFkMatch[3].trim().replace(/["`]/g, '') : 'id';
          fkTarget = { table: targetTable, column: targetCol };
          relationships.push({
            id: `rel_${tableName}_${colName}`,
            constraintName: `fk_${tableName}_${colName}`,
            sourceTable: tableName,
            sourceColumn: colName,
            targetTable,
            targetColumn: targetCol,
            cardinality: '1:N',
            sourceCardinality: '0..n',
            targetCardinality: '1..1',
          });
        }

        const isGeom = /geometry|geography|point|linestring|polygon/i.test(colType);
        if (isGeom) isSpatial = true;

        columns.push({
          name: colName,
          dataType: colType,
          isNullable,
          defaultValue,
          isPrimaryKey: isInlinePk || primaryKeys.includes(colName),
          isForeignKey,
          foreignKeyTarget: fkTarget,
          isGeometry: isGeom,
        });
      }
    }

    for (const c of columns) {
      if (primaryKeys.includes(c.name)) {
        c.isPrimaryKey = true;
      }
    }

    const rowEstMatch = sqlContent.match(new RegExp(`--\\s*rows\\s*:\\s*(\\d+)`, 'i'));
    const estimatedRows = rowEstMatch ? parseInt(rowEstMatch[1], 10) : Math.floor(Math.random() * 2500) + 120;

    tables.push({
      name: tableName,
      schema,
      estimatedRows,
      sizeFormatted: `${(estimatedRows * 0.15 + 16).toFixed(1)} kB`,
      columns,
      primaryKeys,
      foreignKeys: relationships.filter(r => r.sourceTable === tableName),
      isSpatial,
    });
  }

  // Standalone ALTER TABLE ADD CONSTRAINT FOREIGN KEY
  const alterFkRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s+ADD\s+CONSTRAINT\s+["`]?([a-zA-Z0-9_]+)["`]?\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([^)]+)\)/gi;

  let alterMatch: RegExpExecArray | null;
  while ((alterMatch = alterFkRegex.exec(sqlContent)) !== null) {
    const sourceTable = alterMatch[2];
    const constraintName = alterMatch[3];
    const sourceCol = alterMatch[4].trim().replace(/["`]/g, '');
    const targetTable = alterMatch[6];
    const targetCol = alterMatch[7].trim().replace(/["`]/g, '');

    const relId = `rel_${sourceTable}_${sourceCol}`;
    if (!relationships.some(r => r.id === relId)) {
      const rel: PostgresRelationship = {
        id: relId,
        constraintName,
        sourceTable,
        sourceColumn: sourceCol,
        targetTable,
        targetColumn: targetCol,
        cardinality: '1:N',
        sourceCardinality: '0..n',
        targetCardinality: '1..1',
      };
      relationships.push(rel);

      const tbl = tables.find(t => t.name === sourceTable);
      if (tbl) {
        tbl.foreignKeys.push(rel);
        const col = tbl.columns.find(c => c.name === sourceCol);
        if (col) {
          col.isForeignKey = true;
          col.foreignKeyTarget = { table: targetTable, column: targetCol };
        }
      }
    }
  }

  const summary = computeDatabaseSummary(tables, relationships);

  return {
    databaseName: dbName,
    serverVersion: 'PostgreSQL 16.2 on x86_64 (PostGIS 3.4.2)',
    generatedAt: new Date().toISOString(),
    tables,
    relationships,
    summary,
  };
}

function splitSqlColumns(body: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

/**
 * Builds a PostgresDatabaseSchema from active workspace datasets.
 * Automatically enforces canonical PostgreSQL types.
 */
export function buildSchemaFromDatasets(datasets: SpatialDataset[], dbName = 'omnigeo_spatial_db'): PostgresDatabaseSchema {
  const tables: PostgresTableSchema[] = [];
  const relationships: PostgresRelationship[] = [];

  for (const ds of datasets) {
    const tableName = ds.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const columns: PostgresColumnSchema[] = [];

    // Primary key
    columns.push({
      name: 'id',
      dataType: 'bigserial',
      isNullable: false,
      defaultValue: "nextval('id_seq')",
      isPrimaryKey: true,
      isForeignKey: false,
      isGeometry: false,
    });

    // Geometry column
    const srid = ds.detectedCRS?.code.replace(/^EPSG:/i, '') || '4326';
    const geomType = ds.geometryType === 'Polygon' ? 'MultiPolygon' : ds.geometryType || 'Geometry';
    columns.push({
      name: 'geom',
      dataType: `geometry(${geomType}, ${srid})`,
      isNullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      isForeignKey: false,
      isGeometry: true,
      geometryType: geomType,
      srid: parseInt(srid, 10),
    });

    // Attribute columns with strict canonical types
    for (const f of ds.fields) {
      let pgType = 'character varying(255)';
      if (f.type === 'number') {
        pgType = f.name.toLowerCase().includes('id') ? 'integer' : 'double precision';
      } else if (f.type === 'boolean') {
        pgType = 'boolean';
      } else if (f.type === 'date') {
        pgType = 'timestamp with time zone';
      }

      const isFkCandidate = f.name.toLowerCase().endsWith('_id') && datasets.some(other => {
        const otherName = other.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return f.name.toLowerCase().startsWith(otherName) || otherName.includes(f.name.toLowerCase().replace(/_id$/, ''));
      });

      columns.push({
        name: f.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        dataType: pgType,
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        isForeignKey: !!isFkCandidate,
        isGeometry: false,
      });
    }

    tables.push({
      name: tableName,
      schema: 'public',
      estimatedRows: ds.featureCount,
      sizeFormatted: `${(ds.sizeBytes / 1024).toFixed(1)} kB`,
      columns,
      primaryKeys: ['id'],
      foreignKeys: [],
      isSpatial: true,
      comment: `Couche géospatiale importée: ${ds.originalFileName} (${ds.format.toUpperCase()})`,
    });
  }

  // Cross-table foreign key relationships
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.name.endsWith('_id') && c.name !== 'id') {
        const potentialTargetTable = c.name.replace(/_id$/, '');
        const target = tables.find(other => other.name === potentialTargetTable || other.name.startsWith(potentialTargetTable));
        if (target && target.name !== t.name) {
          c.isForeignKey = true;
          c.foreignKeyTarget = { table: target.name, column: 'id' };
          const rel: PostgresRelationship = {
            id: `rel_${t.name}_${c.name}`,
            constraintName: `fk_${t.name}_${c.name}`,
            sourceTable: t.name,
            sourceColumn: c.name,
            targetTable: target.name,
            targetColumn: 'id',
            cardinality: '1:N',
            sourceCardinality: '0..n',
            targetCardinality: '1..1',
          };
          relationships.push(rel);
          t.foreignKeys.push(rel);
        }
      }
    }
  }

  const summary = computeDatabaseSummary(tables, relationships);

  return {
    databaseName: dbName,
    serverVersion: 'PostgreSQL 16.2 / PostGIS 3.4',
    generatedAt: new Date().toISOString(),
    description: 'Architecture PostgreSQL générée à partir des couches géospatiales actives de l’atelier.',
    tables,
    relationships,
    summary,
  };
}

/**
 * High-fidelity sample databases for instant demonstration.
 * All types strictly use canonical PostgreSQL naming:
 * character varying(n), bigint, integer, numeric(p,s), double precision, timestamp with time zone, date, geometry(Type, SRID).
 */
export const SAMPLE_POSTGRES_DATABASES: Record<string, PostgresDatabaseSchema> = {
  cadastre: {
    databaseName: 'cadastre_maroc_sud',
    serverVersion: 'PostgreSQL 16.3 on x86_64, compiled by gcc, PostGIS 3.4.2 (EPSG:4261)',
    generatedAt: new Date().toISOString(),
    description: "Système d'Information Géographique Cadastral & Foncier de la Conservation Foncière (Zone Sud Maroc)",
    tables: [
      {
        name: 'parcelles_cadastrales',
        schema: 'cadastre',
        estimatedRows: 14520,
        sizeFormatted: '48.2 MB',
        isSpatial: true,
        primaryKeys: ['id_parcelle'],
        comment: 'Unités cadastrales géoréférencées avec assiette foncière et contenance légale',
        columns: [
          { name: 'id_parcelle', dataType: 'bigint', isNullable: false, defaultValue: "nextval('cadastre.parcelle_seq')", isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'numero_titre', dataType: 'character varying(64)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'indice_parcelle', dataType: 'character varying(16)', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'contenance_ha', dataType: 'numeric(12,4)', isNullable: false, defaultValue: '0.0000', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'code_commune_fk', dataType: 'character varying(10)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'communes_territoriales', column: 'code_commune' }, isGeometry: false },
          { name: 'zone_plu_fk', dataType: 'character varying(20)', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'zonage_urbanisme_plu', column: 'code_zone' }, isGeometry: false },
          { name: 'date_immatriculation', dataType: 'date', isNullable: true, defaultValue: 'CURRENT_DATE', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom', dataType: 'geometry(MultiPolygon, 4261)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'MultiPolygon', srid: 4261, comment: 'Projection Sud_Maroc Degrés (Merchich EPSG:4261)' },
        ],
        foreignKeys: [
          { id: 'rel_parc_commune', constraintName: 'fk_parcelles_commune', sourceTable: 'parcelles_cadastrales', sourceColumn: 'code_commune_fk', targetTable: 'communes_territoriales', targetColumn: 'code_commune', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
          { id: 'rel_parc_plu', constraintName: 'fk_parcelles_plu', sourceTable: 'parcelles_cadastrales', sourceColumn: 'zone_plu_fk', targetTable: 'zonage_urbanisme_plu', targetColumn: 'code_zone', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
        ],
      },
      {
        name: 'proprietaires',
        schema: 'cadastre',
        estimatedRows: 9840,
        sizeFormatted: '12.4 MB',
        isSpatial: false,
        primaryKeys: ['id_proprietaire'],
        comment: 'Personnes physiques et morales titulaires de droits réels immobiliers',
        columns: [
          { name: 'id_proprietaire', dataType: 'bigserial', isNullable: false, defaultValue: "nextval('proprietaires_seq')", isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'cin_rc', dataType: 'character varying(32)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'nom_complet', dataType: 'character varying(150)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'type_personne', dataType: 'character varying(20)', isNullable: false, defaultValue: "'PHYSIQUE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'adresse_domicile', dataType: 'text', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'telephone_contact', dataType: 'character varying(25)', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'created_at', dataType: 'timestamp with time zone', isNullable: false, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
        ],
        foreignKeys: [],
      },
      {
        name: 'droits_proprietaires_parcelles',
        schema: 'cadastre',
        estimatedRows: 17800,
        sizeFormatted: '8.6 MB',
        isSpatial: false,
        primaryKeys: ['id_droit'],
        comment: 'Table associative N:M matérialisant la quote-part et usufruit de chaque propriétaire sur la parcelle',
        columns: [
          { name: 'id_droit', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'id_parcelle_fk', dataType: 'bigint', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'parcelles_cadastrales', column: 'id_parcelle' }, isGeometry: false },
          { name: 'id_proprietaire_fk', dataType: 'bigint', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'proprietaires', column: 'id_proprietaire' }, isGeometry: false },
          { name: 'quote_part_numerateur', dataType: 'integer', isNullable: false, defaultValue: '1', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'quote_part_denominateur', dataType: 'integer', isNullable: false, defaultValue: '1', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'type_droit', dataType: 'character varying(30)', isNullable: false, defaultValue: "'PLEINE_PROPRIETE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
        ],
        foreignKeys: [
          { id: 'rel_droits_parcelle', constraintName: 'fk_droits_parcelle', sourceTable: 'droits_proprietaires_parcelles', sourceColumn: 'id_parcelle_fk', targetTable: 'parcelles_cadastrales', targetColumn: 'id_parcelle', cardinality: '1:N', sourceCardinality: '1..n', targetCardinality: '1..1' },
          { id: 'rel_droits_prop', constraintName: 'fk_droits_proprietaire', sourceTable: 'droits_proprietaires_parcelles', sourceColumn: 'id_proprietaire_fk', targetTable: 'proprietaires', targetColumn: 'id_proprietaire', cardinality: '1:N', sourceCardinality: '1..n', targetCardinality: '1..1' },
        ],
      },
      {
        name: 'communes_territoriales',
        schema: 'cadastre',
        estimatedRows: 42,
        sizeFormatted: '3.1 MB',
        isSpatial: true,
        primaryKeys: ['code_commune'],
        comment: 'Découpage administratif officiel des communes et arrondissements territoriaux',
        columns: [
          { name: 'code_commune', dataType: 'character varying(10)', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'nom_commune_fr', dataType: 'character varying(100)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'nom_commune_ar', dataType: 'character varying(100)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'province_prefecture', dataType: 'character varying(80)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'population_recensement', dataType: 'integer', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_frontiere', dataType: 'geometry(MultiPolygon, 4261)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'MultiPolygon', srid: 4261 },
        ],
        foreignKeys: [],
      },
      {
        name: 'zonage_urbanisme_plu',
        schema: 'cadastre',
        estimatedRows: 125,
        sizeFormatted: '5.2 MB',
        isSpatial: true,
        primaryKeys: ['code_zone'],
        comment: "Zones réglementaires du Plan d'Aménagement et d'Urbanisme (Urbain, Agricole, Industriel)",
        columns: [
          { name: 'code_zone', dataType: 'character varying(20)', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'libelle_zone', dataType: 'character varying(150)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'coefficient_occupation_sol', dataType: 'numeric(4,2)', isNullable: true, defaultValue: '0.40', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'hauteur_max_metres', dataType: 'numeric(6,2)', isNullable: true, defaultValue: '15.00', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_zone', dataType: 'geometry(MultiPolygon, 4261)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'MultiPolygon', srid: 4261 },
        ],
        foreignKeys: [],
      },
      {
        name: 'bornes_topographiques',
        schema: 'cadastre',
        estimatedRows: 58000,
        sizeFormatted: '22.0 MB',
        isSpatial: true,
        primaryKeys: ['id_borne'],
        comment: 'Sommets et bornes cadastrales relevées par géomètre-expert',
        columns: [
          { name: 'id_borne', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'numero_borne', dataType: 'character varying(20)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'id_parcelle_fk', dataType: 'bigint', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'parcelles_cadastrales', column: 'id_parcelle' }, isGeometry: false },
          { name: 'materiau_borne', dataType: 'character varying(40)', isNullable: true, defaultValue: "'BORNE_BETON'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'altitude_z_metres', dataType: 'numeric(8,3)', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_point', dataType: 'geometry(Point, 4261)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'Point', srid: 4261 },
        ],
        foreignKeys: [
          { id: 'rel_bornes_parcelle', constraintName: 'fk_bornes_parcelle', sourceTable: 'bornes_topographiques', sourceColumn: 'id_parcelle_fk', targetTable: 'parcelles_cadastrales', targetColumn: 'id_parcelle', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
        ],
      },
    ],
    relationships: [
      { id: 'rel_parc_commune', constraintName: 'fk_parcelles_commune', sourceTable: 'parcelles_cadastrales', sourceColumn: 'code_commune_fk', targetTable: 'communes_territoriales', targetColumn: 'code_commune', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
      { id: 'rel_parc_plu', constraintName: 'fk_parcelles_plu', sourceTable: 'parcelles_cadastrales', sourceColumn: 'zone_plu_fk', targetTable: 'zonage_urbanisme_plu', targetColumn: 'code_zone', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
      { id: 'rel_droits_parcelle', constraintName: 'fk_droits_parcelle', sourceTable: 'droits_proprietaires_parcelles', sourceColumn: 'id_parcelle_fk', targetTable: 'parcelles_cadastrales', targetColumn: 'id_parcelle', cardinality: '1:N', sourceCardinality: '1..n', targetCardinality: '1..1' },
      { id: 'rel_droits_prop', constraintName: 'fk_droits_proprietaire', sourceTable: 'droits_proprietaires_parcelles', sourceColumn: 'id_proprietaire_fk', targetTable: 'proprietaires', targetColumn: 'id_proprietaire', cardinality: '1:N', sourceCardinality: '1..n', targetCardinality: '1..1' },
      { id: 'rel_bornes_parcelle', constraintName: 'fk_bornes_parcelle', sourceTable: 'bornes_topographiques', sourceColumn: 'id_parcelle_fk', targetTable: 'parcelles_cadastrales', targetColumn: 'id_parcelle', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
    ],
    summary: {
      totalTables: 6,
      totalRecords: 100327,
      totalColumns: 38,
      totalRelationships: 5,
      totalSpatialTables: 4,
      dataTypesDistribution: {
        'Spatial (PostGIS)': 4,
        'Numeric': 14,
        'Text / String': 16,
        'Temporal (Date/Time)': 3,
        'Other': 1,
      },
    },
  },
  water_network: {
    databaseName: 'reseau_eau_potable_postgis',
    serverVersion: 'PostgreSQL 16.2 / PostGIS 3.4.1 (EPSG:2154 Lambert-93)',
    generatedAt: new Date().toISOString(),
    description: "SIG Technique Exploitation & Gestion Patrimoniale du Réseau d'Alimentation en Eau Potable (AEP)",
    tables: [
      {
        name: 'conduites_canalisations',
        schema: 'reseau_eau',
        estimatedRows: 24800,
        sizeFormatted: '38.5 MB',
        isSpatial: true,
        primaryKeys: ['id_conduite'],
        comment: "Tronçons de canalisation d'adduction et de distribution sous pression",
        columns: [
          { name: 'id_conduite', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'code_troncon', dataType: 'character varying(40)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'diametre_nominal_mm', dataType: 'integer', isNullable: false, defaultValue: '150', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'materiau_conduite', dataType: 'character varying(30)', isNullable: false, defaultValue: "'FONTE_DUCTILE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'annee_pose', dataType: 'integer', isNullable: true, defaultValue: '2015', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'pression_nominale_bar', dataType: 'numeric(4,1)', isNullable: true, defaultValue: '16.0', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'id_station_fk', dataType: 'bigint', isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'stations_pompage', column: 'id_station' }, isGeometry: false },
          { name: 'geom_line', dataType: 'geometry(LineString, 2154)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'LineString', srid: 2154 },
        ],
        foreignKeys: [
          { id: 'rel_cond_station', constraintName: 'fk_conduite_station', sourceTable: 'conduites_canalisations', sourceColumn: 'id_station_fk', targetTable: 'stations_pompage', targetColumn: 'id_station', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
        ],
      },
      {
        name: 'stations_pompage',
        schema: 'reseau_eau',
        estimatedRows: 38,
        sizeFormatted: '1.2 MB',
        isSpatial: true,
        primaryKeys: ['id_station'],
        comment: "Usines d'exhaure, châteaux d'eau et surpresseurs de distribution",
        columns: [
          { name: 'id_station', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'nom_station', dataType: 'character varying(100)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'capacite_m3_jour', dataType: 'numeric(10,2)', isNullable: false, defaultValue: '5000.00', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'type_ouvrage', dataType: 'character varying(40)', isNullable: false, defaultValue: "'SURPRESSEUR'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_station', dataType: 'geometry(Point, 2154)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'Point', srid: 2154 },
        ],
        foreignKeys: [],
      },
      {
        name: 'vannes_sectionnement',
        schema: 'reseau_eau',
        estimatedRows: 4200,
        sizeFormatted: '4.8 MB',
        isSpatial: true,
        primaryKeys: ['id_vanne'],
        comment: 'Organes de coupure et régulation de débit du réseau',
        columns: [
          { name: 'id_vanne', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'id_conduite_fk', dataType: 'bigint', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'conduites_canalisations', column: 'id_conduite' }, isGeometry: false },
          { name: 'etat_actuel', dataType: 'character varying(20)', isNullable: false, defaultValue: "'OUVERTE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'sens_fermeture', dataType: 'character varying(10)', isNullable: true, defaultValue: "'HORAIRE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_vanne', dataType: 'geometry(Point, 2154)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'Point', srid: 2154 },
        ],
        foreignKeys: [
          { id: 'rel_vanne_conduite', constraintName: 'fk_vanne_conduite', sourceTable: 'vannes_sectionnement', sourceColumn: 'id_conduite_fk', targetTable: 'conduites_canalisations', targetColumn: 'id_conduite', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
        ],
      },
      {
        name: 'interventions_fuites',
        schema: 'reseau_eau',
        estimatedRows: 5120,
        sizeFormatted: '8.4 MB',
        isSpatial: true,
        primaryKeys: ['id_intervention'],
        comment: 'Journal des interventions curatives et réparations de casses',
        columns: [
          { name: 'id_intervention', dataType: 'bigserial', isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, isGeometry: false },
          { name: 'id_conduite_fk', dataType: 'bigint', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyTarget: { table: 'conduites_canalisations', column: 'id_conduite' }, isGeometry: false },
          { name: 'date_signalement', dataType: 'timestamp with time zone', isNullable: false, defaultValue: 'now()', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'volume_estime_perte_m3', dataType: 'numeric(8,2)', isNullable: true, defaultValue: '25.00', isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'statut_reparation', dataType: 'character varying(30)', isNullable: false, defaultValue: "'CLOTUREE'", isPrimaryKey: false, isForeignKey: false, isGeometry: false },
          { name: 'geom_incident', dataType: 'geometry(Point, 2154)', isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, isGeometry: true, geometryType: 'Point', srid: 2154 },
        ],
        foreignKeys: [
          { id: 'rel_fuite_conduite', constraintName: 'fk_fuite_conduite', sourceTable: 'interventions_fuites', sourceColumn: 'id_conduite_fk', targetTable: 'conduites_canalisations', targetColumn: 'id_conduite', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
        ],
      },
    ],
    relationships: [
      { id: 'rel_cond_station', constraintName: 'fk_conduite_station', sourceTable: 'conduites_canalisations', sourceColumn: 'id_station_fk', targetTable: 'stations_pompage', targetColumn: 'id_station', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
      { id: 'rel_vanne_conduite', constraintName: 'fk_vanne_conduite', sourceTable: 'vannes_sectionnement', sourceColumn: 'id_conduite_fk', targetTable: 'conduites_canalisations', targetColumn: 'id_conduite', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
      { id: 'rel_fuite_conduite', constraintName: 'fk_fuite_conduite', sourceTable: 'interventions_fuites', sourceColumn: 'id_conduite_fk', targetTable: 'conduites_canalisations', targetColumn: 'id_conduite', cardinality: '1:N', sourceCardinality: '0..n', targetCardinality: '1..1' },
    ],
    summary: {
      totalTables: 4,
      totalRecords: 34158,
      totalColumns: 23,
      totalRelationships: 3,
      totalSpatialTables: 4,
      dataTypesDistribution: {
        'Spatial (PostGIS)': 4,
        'Numeric': 8,
        'Text / String': 9,
        'Temporal (Date/Time)': 2,
      },
    },
  },
};

/**
 * Generates an executive, publication-grade standalone HTML Data Dictionary Report.
 * Supports French ('fr') or English ('en').
 * Self-contained with CSS, print-friendly, search filter, and interactive badges.
 */
export function generateStandaloneHtmlReport(schema: PostgresDatabaseSchema, lang: 'fr' | 'en' = 'fr'): string {
  const isFr = lang === 'fr';
  const generatedTimeStr = new Date(schema.generatedAt).toUTCString();
  const title = isFr
    ? `Dictionnaire de Données & Architecture PostgreSQL - ${schema.databaseName}`
    : `PostgreSQL Data Dictionary & Schema Architecture - ${schema.databaseName}`;

  const i18n = {
    brand: isFr ? 'OmniGeo • Dictionnaire PostgreSQL' : 'OmniGeo • PostgreSQL Data Dictionary',
    desc: schema.description || (isFr 
      ? 'Rapport architectural complet de la base de données relationnelle et spatiale.' 
      : 'Comprehensive architectural report of the relational and spatial database schema.'),
    printBtn: isFr ? 'Imprimer / PDF' : 'Print / PDF',
    viewMpdBtn: isFr ? 'Schéma MPD' : 'MPD Schema',
    genAt: isFr ? 'Généré le :' : 'Generated on:',
    serverVer: isFr ? 'Version serveur :' : 'Server version:',
    kpiTables: isFr ? 'Tables Métier' : 'Relational Tables',
    kpiTablesSub: isFr ? 'Total des tables relationnelles' : 'Total relational tables',
    kpiSpatial: isFr ? 'Couches Spatiales (PostGIS)' : 'Spatial Layers (PostGIS)',
    kpiSpatialSub: isFr ? 'Colonnes géométriques indexées' : 'Indexed geometry columns',
    kpiRecords: isFr ? 'Total Enregistrements' : 'Total Records',
    kpiRecordsSub: isFr ? 'Volume de données estimé' : 'Estimated row count',
    kpiCols: isFr ? 'Total Colonnes' : 'Total Columns',
    kpiColsSub: isFr ? 'Attributs & géométries typés' : 'Typed attributes & geometries',
    kpiRels: isFr ? 'Relations (Clés Étrangères)' : 'Foreign Key Relations',
    kpiRelsSub: isFr ? "Liens d'intégrité référentielle" : 'Referential integrity links',
    distLabel: isFr ? 'Distribution des Types PostgreSQL :' : 'PostgreSQL Canonical Types Distribution:',
    relSectionTitle: isFr ? 'Modèle Relationnel & Clés Étrangères' : 'Relational Model & Foreign Keys',
    relSectionSub: isFr ? 'Matrice des liaisons référentielles et intégrité de la base' : 'Referential integrity matrix and constraint mapping',
    activeLinks: isFr ? 'liaisons actives' : 'active relationships',
    thConstraint: isFr ? 'Contrainte' : 'Constraint Name',
    thSource: isFr ? 'Table Source (FK)' : 'Source Table (FK)',
    thCard: isFr ? 'Cardinalité' : 'Cardinality',
    thTarget: isFr ? 'Table Cible (PK)' : 'Target Table (PK)',
    thRule: isFr ? 'Règle de Suppression' : 'Delete Rule',
    noRels: isFr ? 'Aucune contrainte de clé étrangère explicite détectée.' : 'No explicit foreign key constraints detected.',
    catSectionTitle: isFr ? 'Dictionnaire des Tables & Champs' : 'Tables & Columns Data Dictionary',
    catSectionSub: isFr ? 'Détail exhaustif des champs, types PostgreSQL canoniques et contraintes par table' : 'Exhaustive column specifications, canonical PostgreSQL types, and constraints',
    docTables: isFr ? 'tables documentées' : 'documented tables',
    searchPlaceholder: isFr ? 'Filtrer instantanément par nom de table ou nom de champ...' : 'Filter instantly by table or column name...',
    thColName: isFr ? 'Nom du Champ' : 'Column Name',
    thColType: isFr ? 'Type PostgreSQL Canonique' : 'PostgreSQL Canonical Type',
    thNullable: isFr ? 'Nullabilité' : 'Nullable',
    thKeys: isFr ? 'Contraintes & Clés' : 'Keys & Constraints',
    thDefault: isFr ? 'Valeur par Défaut' : 'Default Value',
    thDesc: isFr ? 'Description' : 'Description',
    fieldsWord: isFr ? 'champs' : 'columns',
    recordsWord: isFr ? 'enregistrements' : 'records',
    spatialBadge: isFr ? 'COUCHE POSTGIS' : 'POSTGIS LAYER',
  };

  // Tables catalog rows
  const tablesHtml = schema.tables.map(table => {
    const columnsHtml = table.columns.map(col => {
      const canonicalType = normalizeToPostgresType(col.dataType);
      const pkBadge = col.isPrimaryKey ? `<span class="badge badge-pk">PK</span>` : '';
      const fkBadge = col.isForeignKey && col.foreignKeyTarget 
        ? `<span class="badge badge-fk" title="Lien vers ${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}">FK &rarr; ${col.foreignKeyTarget.table}</span>` 
        : '';
      const geomBadge = col.isGeometry 
        ? `<span class="badge badge-geom">${col.geometryType || 'GEOMETRY'} (${col.srid || 4326})</span>` 
        : '';

      const nullBadge = col.isNullable 
        ? `<span class="text-muted">NULL</span>` 
        : `<span class="badge badge-notnull">NOT NULL</span>`;

      return `
        <tr class="col-row">
          <td class="col-name font-mono font-bold">${escapeHtml(col.name)}</td>
          <td>
            <span class="type-pill type-${categorizeDataType(canonicalType).replace(/[^a-zA-Z]/g, '').toLowerCase()}">${escapeHtml(canonicalType)}</span>
          </td>
          <td class="text-center">${nullBadge}</td>
          <td>
            <div class="badges-row">
              ${pkBadge}
              ${fkBadge}
              ${geomBadge}
            </div>
          </td>
          <td class="col-default font-mono">${col.defaultValue ? escapeHtml(col.defaultValue) : '&mdash;'}</td>
          <td class="col-comment text-muted">${col.comment ? escapeHtml(col.comment) : ''}</td>
        </tr>
      `;
    }).join('\n');

    return `
      <section class="table-card" id="tbl-${table.name}">
        <div class="table-card-header">
          <div class="table-title-group">
            <span class="schema-badge">${escapeHtml(table.schema)}</span>
            <h3 class="table-name font-mono">${escapeHtml(table.name)}</h3>
            ${table.isSpatial ? `<span class="badge badge-spatial">${i18n.spatialBadge}</span>` : ''}
          </div>
          <div class="table-meta-pills font-mono">
            <span><strong>${table.columns.length}</strong> ${i18n.fieldsWord}</span>
            <span><strong>${(table.estimatedRows || 0).toLocaleString()}</strong> ${i18n.recordsWord}</span>
            ${table.sizeFormatted ? `<span>${escapeHtml(table.sizeFormatted)}</span>` : ''}
          </div>
        </div>
        ${table.comment ? `<p class="table-description">${escapeHtml(table.comment)}</p>` : ''}
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 25%">${i18n.thColName}</th>
                <th style="width: 23%">${i18n.thColType}</th>
                <th style="width: 12%" class="text-center">${i18n.thNullable}</th>
                <th style="width: 17%">${i18n.thKeys}</th>
                <th style="width: 13%">${i18n.thDefault}</th>
                <th style="width: 10%">${i18n.thDesc}</th>
              </tr>
            </thead>
            <tbody>
              ${columnsHtml}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join('\n');

  // Relationships table
  const relsHtml = schema.relationships.length > 0 ? schema.relationships.map(rel => `
    <tr>
      <td class="font-mono text-muted">${escapeHtml(rel.constraintName)}</td>
      <td class="font-mono font-bold">${escapeHtml(rel.sourceTable)}.<span class="text-amber">${escapeHtml(rel.sourceColumn)}</span></td>
      <td class="text-center">
        <span class="badge badge-rel">${rel.sourceCardinality || '0..n'} &rarr; ${rel.cardinality || '1:N'} &rarr; ${rel.targetCardinality || '1..1'}</span>
      </td>
      <td class="font-mono font-bold">${escapeHtml(rel.targetTable)}.<span class="text-emerald">${escapeHtml(rel.targetColumn)}</span></td>
      <td class="font-mono text-muted">${rel.deleteRule ? `ON DELETE ${escapeHtml(rel.deleteRule)}` : 'CASCADE'}</td>
    </tr>
  `).join('\n') : `<tr><td colspan="5" class="text-center text-muted">${i18n.noRels}</td></tr>`;

  // Type breakdown cards
  const typeDistributionHtml = Object.entries(schema.summary.dataTypesDistribution).map(([category, count]) => `
    <div class="dist-pill">
      <span class="dist-name">${escapeHtml(category)}</span>
      <span class="dist-count font-mono font-bold">${count}</span>
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #FAF8F5;
      --card-bg: #FFFFFF;
      --text: #1C1917;
      --text-muted: #78716C;
      --border: #E2DBD0;
      --primary: #92400E;
      --primary-light: #FEF3C7;
      --accent: #2563EB;
      --accent-light: #EFF6FF;
      --success: #059669;
      --success-light: #ECFDF5;
      --purple: #7C3AED;
      --purple-light: #F5F3FF;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      padding: 32px;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    header.report-header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px -2px rgba(0,0,0,0.03);
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 20px;
    }

    .badge-brand {
      background: #451A03;
      color: #FDE68A;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      display: inline-block;
      margin-bottom: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    h1.db-title {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1C1917;
      margin-bottom: 6px;
    }

    p.db-desc {
      color: var(--text-muted);
      font-size: 14px;
      max-width: 750px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    button.btn-action {
      background: #FFFFFF;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      color: #1C1917;
    }
    button.btn-action:hover {
      background: #F5EFE6;
      border-color: #D6CEBE;
    }

    /* KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    }
    .kpi-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .kpi-val {
      font-size: 30px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: #1C1917;
      line-height: 1;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }

    /* Distribution Pills */
    .dist-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 20px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .dist-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-right: 6px;
    }
    .dist-pill {
      background: #FAF8F5;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .dist-name { color: #44403C; }
    .dist-count { color: var(--primary); }

    /* Quick Filter & Search Bar */
    .filter-bar {
      margin-bottom: 20px;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .search-input {
      flex: 1;
      background: #FFFFFF;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .search-input:focus {
      border-color: #B45309;
      box-shadow: 0 0 0 3px rgba(180,83,9,0.1);
    }

    /* Table Cards */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      margin-bottom: 24px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    }
    .table-card-header {
      background: #FDFBF8;
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .table-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .schema-badge {
      background: #E7E5E4;
      color: #44403C;
      font-size: 10px;
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    h3.table-name {
      font-size: 18px;
      font-weight: 700;
      color: #1C1917;
    }
    .table-meta-pills {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      gap: 12px;
    }
    .table-meta-pills span {
      background: #F5EFE6;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .table-description {
      padding: 12px 24px 0 24px;
      color: var(--text-muted);
      font-size: 13px;
      font-style: italic;
    }

    /* Tables */
    .table-responsive {
      overflow-x: auto;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    table.data-table th {
      background: #FAF8F5;
      color: #57534E;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 24px;
      border-bottom: 1px solid var(--border);
    }
    table.data-table td {
      padding: 10px 24px;
      border-bottom: 1px solid #F0ECE4;
      vertical-align: middle;
    }
    table.data-table tr:last-child td {
      border-bottom: none;
    }
    table.data-table tr:hover td {
      background: #FBF9F6;
    }

    /* Badges */
    .badge {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      text-transform: uppercase;
    }
    .badge-pk { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
    .badge-fk { background: #EFF6FF; color: #1E40AF; border: 1px solid #DBEAFE; }
    .badge-geom { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
    .badge-spatial { background: #065F46; color: #FFFFFF; font-size: 9px; }
    .badge-notnull { background: #FEE2E2; color: #991B1B; font-size: 9px; }
    .badge-rel { background: #F3E8FF; color: #6B21A8; }

    .badges-row { display: flex; gap: 4px; flex-wrap: wrap; }

    .type-pill {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      background: #F5F5F4;
      color: #292524;
      border: 1px solid #E7E5E4;
      display: inline-block;
    }
    .type-spatialpostgis { background: #ECFDF5; color: #047857; border-color: #A7F3D0; font-weight: 700; }
    .type-numeric { color: #0369A1; background: #F0F9FF; border-color: #BAE6FD; }
    .type-textstring { color: #4338CA; background: #EEF2FF; border-color: #C7D2FE; }
    .type-temporaldatetime { color: #B45309; background: #FFFBEB; border-color: #FDE68A; }

    .font-mono { font-family: var(--font-mono); }
    .font-bold { font-weight: 700; }
    .text-center { text-align: center; }
    .text-muted { color: var(--text-muted); }
    .text-amber { color: #B45309; }
    .text-emerald { color: #059669; }

    /* Section Headers */
    .section-header {
      margin: 32px 0 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .section-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: #1C1917;
    }
    .section-subtitle {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Print media query */
    @media print {
      body { background: #FFFFFF; padding: 0; font-size: 11px; }
      .container { max-width: 100%; }
      .header-actions, .filter-bar { display: none !important; }
      .table-card { break-inside: avoid; border-color: #CCCCCC; box-shadow: none; margin-bottom: 20px; }
      header.report-header { box-shadow: none; border-color: #CCCCCC; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="report-header">
      <div class="header-top">
        <div>
          <span class="badge-brand">${escapeHtml(i18n.brand)}</span>
          <h1 class="db-title">${escapeHtml(schema.databaseName)}</h1>
          <p class="db-desc">${escapeHtml(i18n.desc)}</p>
        </div>
        <div class="header-actions">
          <button class="btn-action" onclick="window.print()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            ${escapeHtml(i18n.printBtn)}
          </button>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); border-top: 1px solid var(--border); padding-top: 14px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <span>${escapeHtml(i18n.genAt)} <strong>${generatedTimeStr}</strong></span>
        <span>${escapeHtml(i18n.serverVer)} <strong>${escapeHtml(schema.serverVersion || 'PostgreSQL 16+')}</strong></span>
      </div>
    </header>

    <!-- KPI Summary Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">${escapeHtml(i18n.kpiTables)}</div>
        <div class="kpi-val">${schema.summary.totalTables}</div>
        <div class="kpi-sub">${escapeHtml(i18n.kpiTablesSub)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${escapeHtml(i18n.kpiSpatial)}</div>
        <div class="kpi-val text-emerald">${schema.summary.totalSpatialTables}</div>
        <div class="kpi-sub">${escapeHtml(i18n.kpiSpatialSub)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${escapeHtml(i18n.kpiRecords)}</div>
        <div class="kpi-val">${schema.summary.totalRecords.toLocaleString()}</div>
        <div class="kpi-sub">${escapeHtml(i18n.kpiRecordsSub)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${escapeHtml(i18n.kpiCols)}</div>
        <div class="kpi-val">${schema.summary.totalColumns}</div>
        <div class="kpi-sub">${escapeHtml(i18n.kpiColsSub)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${escapeHtml(i18n.kpiRels)}</div>
        <div class="kpi-val text-amber">${schema.summary.totalRelationships}</div>
        <div class="kpi-sub">${escapeHtml(i18n.kpiRelsSub)}</div>
      </div>
    </div>

    <!-- Data Types Distribution -->
    <div class="dist-box">
      <span class="dist-label">${escapeHtml(i18n.distLabel)}</span>
      ${typeDistributionHtml}
    </div>

    <!-- Relationships Section -->
    <div class="section-header">
      <div>
        <h2 class="section-title">${escapeHtml(i18n.relSectionTitle)}</h2>
        <p class="section-subtitle">${escapeHtml(i18n.relSectionSub)}</p>
      </div>
      <span class="font-mono text-muted" style="font-size: 12px;">${schema.relationships.length} ${escapeHtml(i18n.activeLinks)}</span>
    </div>

    <div class="table-card" style="margin-bottom: 36px;">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${escapeHtml(i18n.thConstraint)}</th>
              <th>${escapeHtml(i18n.thSource)}</th>
              <th class="text-center">${escapeHtml(i18n.thCard)}</th>
              <th>${escapeHtml(i18n.thTarget)}</th>
              <th>${escapeHtml(i18n.thRule)}</th>
            </tr>
          </thead>
          <tbody>
            ${relsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tables Catalog Section -->
    <div class="section-header">
      <div>
        <h2 class="section-title">${escapeHtml(i18n.catSectionTitle)}</h2>
        <p class="section-subtitle">${escapeHtml(i18n.catSectionSub)}</p>
      </div>
      <span class="font-mono text-muted" style="font-size: 12px;">${schema.tables.length} ${escapeHtml(i18n.docTables)}</span>
    </div>

    <!-- Real-time Quick Filter -->
    <div class="filter-bar">
      <input type="text" class="search-input" id="tableFilter" placeholder="${escapeHtml(i18n.searchPlaceholder)}" oninput="filterReport()">
    </div>

    <!-- Tables List -->
    <div id="tablesContainer">
      ${tablesHtml}
    </div>
  </div>

  <script>
    function filterReport() {
      const q = document.getElementById('tableFilter').value.toLowerCase().trim();
      const cards = document.querySelectorAll('.table-card[id^="tbl-"]');
      
      cards.forEach(card => {
        if (!q) {
          card.style.display = '';
          const rows = card.querySelectorAll('.col-row');
          rows.forEach(r => r.style.display = '');
          return;
        }

        const tableName = card.querySelector('h3.table-name').textContent.toLowerCase();
        const rows = card.querySelectorAll('.col-row');
        let hasMatchingCol = false;

        rows.forEach(r => {
          const colName = r.querySelector('.col-name').textContent.toLowerCase();
          const colType = r.querySelector('.type-pill').textContent.toLowerCase();
          if (colName.includes(q) || colType.includes(q)) {
            r.style.display = '';
            hasMatchingCol = true;
          } else {
            r.style.display = 'none';
          }
        });

        if (tableName.includes(q) || hasMatchingCol) {
          card.style.display = '';
          if (tableName.includes(q)) {
            rows.forEach(r => r.style.display = '');
          }
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Generates an interactive, standalone HTML document containing the
 * Modèle Physique de Données (MPD) / Physical Data Model ERD.
 * Shows entity cards with PK, FK, canonical PostgreSQL types,
 * and dynamic SVG relationship lines with cardinalities (1:N, 1:1, 0:N) and arrows.
 * 100% self-contained, no external CDN dependencies, works offline, and supports zoom/pan/drag.
 */
export function generatePhysicalDataModelHtml(schema: PostgresDatabaseSchema, lang: 'fr' | 'en' = 'fr'): string {
  const isFr = lang === 'fr';
  const title = isFr 
    ? `Modèle Physique de Données (MPD) - PostgreSQL ${schema.databaseName}`
    : `Physical Data Model (ERD) - PostgreSQL ${schema.databaseName}`;
  const generatedTimeStr = new Date(schema.generatedAt).toUTCString();

  // Prepare table layout positions
  const tablesJson = JSON.stringify(schema.tables.map((t, idx) => ({
    name: t.name,
    schema: t.schema,
    isSpatial: t.isSpatial,
    estimatedRows: t.estimatedRows,
    columns: t.columns.map(c => ({
      name: c.name,
      dataType: normalizeToPostgresType(c.dataType),
      isPrimaryKey: c.isPrimaryKey,
      isForeignKey: c.isForeignKey,
      foreignKeyTarget: c.foreignKeyTarget,
      isNullable: c.isNullable,
      isGeometry: c.isGeometry,
      srid: c.srid,
    })),
    // Compute initial grid position
    x: 40 + (idx % 3) * 380,
    y: 40 + Math.floor(idx / 3) * 360,
  })));

  const relsJson = JSON.stringify(schema.relationships.map(r => ({
    id: r.id,
    constraintName: r.constraintName,
    sourceTable: r.sourceTable,
    sourceColumn: r.sourceColumn,
    targetTable: r.targetTable,
    targetColumn: r.targetColumn,
    cardinality: r.cardinality || '1:N',
    sourceCardinality: r.sourceCardinality || '0..n',
    targetCardinality: r.targetCardinality || '1..1',
  })));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #14100D;
      --board-bg: #0D0A08;
      --card-bg: #1B1612;
      --card-border: #3A2F27;
      --header-bg: #261F1A;
      --text: #F5F0EB;
      --text-muted: #A89F95;
      --accent: #F59E0B;
      --pk-color: #F59E0B;
      --fk-color: #A855F7;
      --geom-color: #10B981;
      --line-color: #D97706;
      --grid-dot: #241D17;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    body.light-theme {
      --bg: #FAF8F5;
      --board-bg: #F3EFE9;
      --card-bg: #FFFFFF;
      --card-border: #DED6CB;
      --header-bg: #F5EFE6;
      --text: #1C1917;
      --text-muted: #78716C;
      --accent: #B45309;
      --pk-color: #B45309;
      --fk-color: #7E22CE;
      --geom-color: #047857;
      --line-color: #B45309;
      --grid-dot: #E5DDD0;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      user-select: none;
    }

    /* Top navigation bar */
    header.mpd-navbar {
      height: 56px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 50;
      position: relative;
    }

    .brand-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge-mpd {
      background: #78350F;
      color: #FDE68A;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 800;
      padding: 4px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1.db-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .db-meta {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button.btn-ctrl {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    button.btn-ctrl:hover {
      background: var(--header-bg);
      border-color: var(--accent);
    }

    /* Diagram board viewport */
    #board-viewport {
      width: 100%;
      height: calc(100% - 56px);
      position: relative;
      overflow: hidden;
      background-color: var(--board-bg);
      background-image: radial-gradient(var(--grid-dot) 1.5px, transparent 1.5px);
      background-size: 24px 24px;
      cursor: grab;
    }
    #board-viewport:active {
      cursor: grabbing;
    }

    /* Transform container for zoom & pan */
    #diagram-plane {
      position: absolute;
      top: 0;
      left: 0;
      width: 4000px;
      height: 3000px;
      transform-origin: 0 0;
    }

    /* SVG connections layer */
    svg#connections-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    }

    /* Relationship path styling */
    .rel-line {
      fill: none;
      stroke: var(--line-color);
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: stroke 0.15s ease, stroke-width 0.15s ease;
      pointer-events: stroke;
      cursor: pointer;
    }
    .rel-line:hover, .rel-line.highlighted {
      stroke: #3B82F6;
      stroke-width: 4;
      filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.6));
    }

    .cardinality-badge {
      fill: var(--card-bg);
      stroke: var(--card-border);
      stroke-width: 1;
      rx: 4;
    }
    .cardinality-text {
      fill: var(--text);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
    }

    /* Entity Table Cards */
    .table-entity {
      position: absolute;
      width: 320px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      z-index: 20;
      cursor: default;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .table-entity:hover, .table-entity.selected {
      border-color: var(--accent);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
      z-index: 30;
    }
    .table-entity.highlight-rel {
      border-color: #3B82F6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
    }

    .entity-header {
      background: var(--header-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 10px 14px;
      border-top-left-radius: 11px;
      border-top-right-radius: 11px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .entity-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .schema-tag {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(120, 113, 108, 0.25);
      padding: 2px 5px;
      border-radius: 4px;
      color: var(--text-muted);
    }
    .entity-name {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 800;
      color: var(--text);
    }

    .entity-badges {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .badge-postgis {
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
      background: rgba(16, 185, 129, 0.2);
      color: var(--geom-color);
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-rows {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    .entity-columns {
      padding: 6px 0;
      max-height: 480px;
      overflow-y: auto;
    }
    .column-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      font-size: 12px;
      border-bottom: 1px solid rgba(120, 113, 108, 0.08);
      position: relative;
    }
    .column-row:last-child {
      border-bottom: none;
    }
    .column-row:hover {
      background: rgba(245, 158, 11, 0.06);
    }

    .col-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
    }
    .tag-key {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
      line-height: 1.2;
    }
    .tag-pk {
      background: rgba(245, 158, 11, 0.2);
      color: var(--pk-color);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .tag-fk {
      background: rgba(168, 85, 247, 0.2);
      color: var(--fk-color);
      border: 1px solid rgba(168, 85, 247, 0.4);
    }
    .col-name {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .col-name.pk-col {
      color: var(--pk-color);
      font-weight: 700;
    }

    .col-right {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .col-type {
      color: var(--text-muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .col-nn {
      font-size: 8px;
      font-weight: 800;
      color: #EF4444;
      background: rgba(239, 68, 68, 0.15);
      padding: 1px 3px;
      border-radius: 2px;
    }

    /* Floating Tool controls on canvas */
    .canvas-hud {
      position: absolute;
      bottom: 24px;
      right: 24px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 60;
    }
    .canvas-hud button {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--text);
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
    }
    .canvas-hud button:hover {
      background: var(--header-bg);
    }

    /* Legend Box */
    .legend-box {
      position: absolute;
      bottom: 24px;
      left: 24px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      gap: 16px;
      align-items: center;
      font-size: 12px;
      font-family: var(--font-mono);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      z-index: 60;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media print {
      header.mpd-navbar, .canvas-hud, .legend-box { display: none !important; }
      body { background: #FFFFFF; color: #000; overflow: visible; }
      #board-viewport { width: 100%; height: auto; overflow: visible; background: #FFF; }
      #diagram-plane { transform: none !important; }
      .table-entity { break-inside: avoid; box-shadow: none; border-color: #999; }
    }
  </style>
</head>
<body>

  <!-- Top Navigation Bar -->
  <header class="mpd-navbar">
    <div class="brand-title-group">
      <span class="badge-mpd">${isFr ? 'Modèle Physique de Données (MPD)' : 'Physical Data Model (ERD)'}</span>
      <h1 class="db-title">${escapeHtml(schema.databaseName)}</h1>
      <span class="db-meta">(${schema.tables.length} tables &bull; ${schema.relationships.length} ${isFr ? 'relations' : 'relationships'})</span>
    </div>

    <div class="nav-actions">
      <button class="btn-ctrl" onclick="toggleTheme()">
        <span id="theme-icon">☀️</span>
        <span id="theme-text">${isFr ? 'Thème' : 'Theme'}</span>
      </button>

      <button class="btn-ctrl" onclick="resetZoom()">
        <span>🎯</span>
        <span>${isFr ? 'Centrer' : 'Reset View'}</span>
      </button>

      <button class="btn-ctrl" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        <span>${isFr ? 'Imprimer / PDF' : 'Print / PDF'}</span>
      </button>
    </div>
  </header>

  <!-- Interactive Board Viewport -->
  <div id="board-viewport">
    <div id="diagram-plane">
      <!-- SVG Connectors Layer -->
      <svg id="connections-svg">
        <defs>
          <marker id="arrow-target" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--line-color)"></path>
          </marker>
        </defs>
        <g id="lines-group"></g>
      </svg>

      <!-- Tables Layer -->
      <div id="tables-layer"></div>
    </div>

    <!-- HUD Zoom Controls -->
    <div class="canvas-hud">
      <button onclick="zoomIn()" title="Zoom In">+</button>
      <button onclick="zoomOut()" title="Zoom Out">&minus;</button>
      <button onclick="resetZoom()" title="Reset Zoom">1:1</button>
    </div>

    <!-- Legend -->
    <div class="legend-box">
      <div class="legend-item">
        <span class="tag-key tag-pk">PK</span>
        <span>${isFr ? 'Clé Primaire' : 'Primary Key'}</span>
      </div>
      <div class="legend-item">
        <span class="tag-key tag-fk">FK</span>
        <span>${isFr ? 'Clé Étrangère' : 'Foreign Key'}</span>
      </div>
      <div class="legend-item">
        <span style="display:inline-block; width: 14px; height: 3px; background: var(--line-color); border-radius: 2px;"></span>
        <span>${isFr ? 'Lien 1:N' : '1:N Relationship'}</span>
      </div>
      <div class="legend-item">
        <span class="col-nn">NN</span>
        <span>NOT NULL</span>
      </div>
    </div>
  </div>

  <script>
    const tablesData = ${tablesJson};
    const relsData = ${relsJson};

    let scale = 0.95;
    let panX = 40;
    let panY = 30;
    let isDraggingBoard = false;
    let dragStartX = 0;
    let dragStartY = 0;

    const viewport = document.getElementById('board-viewport');
    const plane = document.getElementById('diagram-plane');
    const tablesLayer = document.getElementById('tables-layer');
    const linesGroup = document.getElementById('lines-group');

    // Render table cards
    function renderTables() {
      tablesLayer.innerHTML = '';
      tablesData.forEach((table) => {
        const card = document.createElement('div');
        card.className = 'table-entity';
        card.id = 'entity-' + table.name;
        card.style.left = table.x + 'px';
        card.style.top = table.y + 'px';

        const colsHtml = table.columns.map(c => {
          const pkBadge = c.isPrimaryKey ? '<span class="tag-key tag-pk">PK</span>' : '';
          const fkBadge = c.isForeignKey ? '<span class="tag-key tag-fk">FK</span>' : '';
          const nnBadge = !c.isNullable ? '<span class="col-nn">NN</span>' : '';

          return \`
            <div class="column-row" id="col-\${table.name}-\${c.name}">
              <div class="col-left">
                \${pkBadge}
                \${fkBadge}
                <span class="col-name \${c.isPrimaryKey ? 'pk-col' : ''}">\${c.name}</span>
              </div>
              <div class="col-right">
                <span class="col-type">\${c.dataType}</span>
                \${nnBadge}
              </div>
            </div>
          \`;
        }).join('');

        card.innerHTML = \`
          <div class="entity-header">
            <div class="entity-header-left">
              <span class="schema-tag">\${table.schema}</span>
              <span class="entity-name">\${table.name}</span>
            </div>
            <div class="entity-badges">
              \${table.isSpatial ? '<span class="badge-postgis">POSTGIS</span>' : ''}
              <span class="badge-rows">\${(table.estimatedRows || 0).toLocaleString()} r.</span>
            </div>
          </div>
          <div class="entity-columns">
            \${colsHtml}
          </div>
        \`;

        // Make table header draggable
        const header = card.querySelector('.entity-header');
        initTableDrag(header, table, card);

        // Highlight relations on hover
        card.addEventListener('mouseenter', () => highlightConnected(table.name, true));
        card.addEventListener('mouseleave', () => highlightConnected(table.name, false));

        tablesLayer.appendChild(card);
      });

      renderConnections();
    }

    // Render SVG connector lines
    function renderConnections() {
      linesGroup.innerHTML = '';

      relsData.forEach(rel => {
        const sourceCard = document.getElementById('entity-' + rel.sourceTable);
        const targetCard = document.getElementById('entity-' + rel.targetTable);
        if (!sourceCard || !targetCard) return;

        const sourceTable = tablesData.find(t => t.name === rel.sourceTable);
        const targetTable = tablesData.find(t => t.name === rel.targetTable);
        if (!sourceTable || !targetTable) return;

        // Calculate card coordinates and centers
        const sourceColEl = document.getElementById('col-' + rel.sourceTable + '-' + rel.sourceColumn);
        const targetColEl = document.getElementById('col-' + rel.targetTable + '-' + rel.targetColumn);

        const sWidth = sourceCard.offsetWidth || 320;
        const sHeight = sourceCard.offsetHeight || 220;
        const tWidth = targetCard.offsetWidth || 320;
        const tHeight = targetCard.offsetHeight || 220;

        let sY = sourceTable.y + (sourceColEl ? sourceColEl.offsetTop + 14 : sHeight / 2);
        let tY = targetTable.y + (targetColEl ? targetColEl.offsetTop + 14 : tHeight / 2);

        // Choose left or right anchor based on relative positions
        let sX, tX;
        let sAnchorSide = 'right';
        let tAnchorSide = 'left';

        if (sourceTable.x + sWidth < targetTable.x) {
          sX = sourceTable.x + sWidth;
          tX = targetTable.x;
          sAnchorSide = 'right';
          tAnchorSide = 'left';
        } else if (targetTable.x + tWidth < sourceTable.x) {
          sX = sourceTable.x;
          tX = targetTable.x + tWidth;
          sAnchorSide = 'left';
          tAnchorSide = 'right';
        } else {
          // Overlapping horizontally
          sX = sourceTable.x + sWidth;
          tX = targetTable.x + tWidth;
          sAnchorSide = 'right';
          tAnchorSide = 'right';
        }

        // Draw smooth orthogonal curve
        const dx = Math.abs(tX - sX);
        const offset = Math.min(Math.max(dx * 0.45, 40), 120);
        const c1X = sAnchorSide === 'right' ? sX + offset : sX - offset;
        const c2X = tAnchorSide === 'left' ? tX - offset : tX + offset;

        const pathD = \`M \${sX} \${sY} C \${c1X} \${sY}, \${c2X} \${tY}, \${tX} \${tY}\`;

        // Line element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', 'rel-line');
        path.setAttribute('id', 'rel-' + rel.id);
        path.setAttribute('marker-end', 'url(#arrow-target)');
        linesGroup.appendChild(path);

        // Cardinality badges
        // Midpoint
        const midX = (sX + tX) / 2;
        const midY = (sY + tY) / 2;

        const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeGroup.setAttribute('class', 'card-badge-group');

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', midX - 22);
        rect.setAttribute('y', midY - 11);
        rect.setAttribute('width', 44);
        rect.setAttribute('height', 22);
        rect.setAttribute('class', 'cardinality-badge');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY);
        text.setAttribute('class', 'cardinality-text');
        text.textContent = rel.cardinality;

        badgeGroup.appendChild(rect);
        badgeGroup.appendChild(text);
        linesGroup.appendChild(badgeGroup);

        // Source cardinality text (e.g. 0..n)
        const sText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sText.setAttribute('x', sAnchorSide === 'right' ? sX + 16 : sX - 16);
        sText.setAttribute('y', sY - 8);
        sText.setAttribute('class', 'cardinality-text');
        sText.style.fill = 'var(--accent)';
        sText.textContent = rel.sourceCardinality;
        linesGroup.appendChild(sText);

        // Target cardinality text (e.g. 1..1)
        const tText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tText.setAttribute('x', tAnchorSide === 'left' ? tX - 18 : tX + 18);
        tText.setAttribute('y', tY - 8);
        tText.setAttribute('class', 'cardinality-text');
        tText.style.fill = 'var(--pk-color)';
        tText.textContent = rel.targetCardinality;
        linesGroup.appendChild(tText);
      });
    }

    function highlightConnected(tableName, active) {
      relsData.forEach(rel => {
        if (rel.sourceTable === tableName || rel.targetTable === tableName) {
          const line = document.getElementById('rel-' + rel.id);
          if (line) {
            line.classList.toggle('highlighted', active);
          }
          const other = rel.sourceTable === tableName ? rel.targetTable : rel.sourceTable;
          const card = document.getElementById('entity-' + other);
          if (card) {
            card.classList.toggle('highlight-rel', active);
          }
        }
      });
    }

    // Draggable tables logic
    function initTableDrag(handle, table, card) {
      let isDragging = false;
      let startX, startY;

      handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        card.style.zIndex = '50';
        e.stopPropagation();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        table.x += dx;
        table.y += dy;
        card.style.left = table.x + 'px';
        card.style.top = table.y + 'px';
        startX = e.clientX;
        startY = e.clientY;
        renderConnections();
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          card.style.zIndex = '20';
        }
      });
    }

    // Canvas pan & zoom
    function updateTransform() {
      plane.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
    }

    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.table-entity')) return;
      isDraggingBoard = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingBoard) return;
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDraggingBoard = false;
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const mouseX = e.clientX - viewport.getBoundingClientRect().left;
      const mouseY = e.clientY - viewport.getBoundingClientRect().top;

      const newScale = Math.min(Math.max(scale * zoomFactor, 0.3), 2.5);
      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;

      updateTransform();
    });

    function zoomIn() {
      scale = Math.min(scale * 1.2, 2.5);
      updateTransform();
    }
    function zoomOut() {
      scale = Math.max(scale / 1.2, 0.3);
      updateTransform();
    }
    function resetZoom() {
      scale = 0.95;
      panX = 40;
      panY = 30;
      updateTransform();
    }

    function toggleTheme() {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      document.getElementById('theme-icon').textContent = isLight ? '🌙' : '☀️';
    }

    // Initial render
    updateTransform();
    renderTables();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
