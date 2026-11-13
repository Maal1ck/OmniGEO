/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialDataset } from '../types/gis';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

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
  SELECT DISTINCT
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
        'id', 'rel_' || fk.constraint_name || '_' || fk.source_table || '_' || fk.source_column || '_' || fk.target_table,
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
        
    print(f"[OK] Successfully generated report data: {out_filename}")
    print(f"[OK] You can paste or drag this JSON into OmniGeo to view and download both Data Dictionary and MPD HTML reports!")
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

  for (const t of (tables || [])) {
    totalRecords += t.estimatedRows || 0;
    if (t.isSpatial) totalSpatialTables++;
    for (const c of (t.columns || [])) {
      totalColumns++;
      const typeCategory = categorizeDataType(c.dataType || 'text');
      dataTypesDistribution[typeCategory] = (dataTypesDistribution[typeCategory] || 0) + 1;
    }
  }

  return {
    totalTables: (tables || []).length,
    totalRecords,
    totalColumns,
    totalRelationships: (relationships || []).length,
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
        comment: 'Service : Conservation Foncière & Cadastre | Unités cadastrales géoréférencées avec assiette foncière',
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
        comment: 'Service : Droits Réels & Propriétaires | Personnes physiques et morales titulaires de droits immobiliers',
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
        comment: 'Service : Droits Réels & Propriétaires | Table associative N:M quote-part et usufruit sur parcelle',
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
        comment: 'Service : Aménagement du Territoire & Urbanisme | Découpage administratif officiel des communes',
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
        comment: "Service : Aménagement du Territoire & Urbanisme | Zones réglementaires du Plan d'Aménagement",
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
        comment: 'Service : Conservation Foncière & Cadastre | Sommets et bornes cadastrales relevées par géomètre',
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
        comment: "Service : Exploitation Réseau AEP | Tronçons de canalisation d'adduction et distribution",
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
        comment: "Service : Ouvrages Hydrauliques & Pompage | Usines d'exhaure et surpresseurs",
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
        comment: 'Service : Exploitation Réseau AEP | Organes de coupure et régulation de débit',
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
        comment: 'Service : Maintenance & Interventions | Journal des réparations et casses réseau',
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

export interface TableProfileSheetData {
  service: string;
  tableName: string;
  nature: string;
  identifiantMetier: string;
  rattachement: string;
  champsTemporels: string;
  champsQuantitatifs: string;
  nombreEnregistrements: string;
  controles: string;
  etatValidation: string;
}

/**
 * Determines if a PostgreSQL table is a business/domain table ("table métier")
 * as opposed to internal PostgreSQL, PostGIS, ArcSDE, or GDB system/registry/delta tables.
 */
export function isBusinessTable(table: PostgresTableSchema): boolean {
  const name = (table.name || '').toLowerCase();
  const schema = (table.schema || 'public').toLowerCase();

  if (['pg_catalog', 'information_schema', 'topology', 'tiger', 'tiger_data'].includes(schema)) {
    return false;
  }

  if (
    name.startsWith('sde_') ||
    name.startsWith('gdb_') ||
    name.startsWith('st_') ||
    name.startsWith('rel_sde_') ||
    name.startsWith('pg_') ||
    name.startsWith('sql_') ||
    name.startsWith('keyset_') ||
    name.startsWith('tmp_') ||
    name.startsWith('temp_')
  ) {
    return false;
  }

  // ArcSDE versioned delta / spatial index / auxiliary tables (a123, d123, i123, f123, s123, s123_idx$)
  if (/^[adifs]\d+(_idx\$?)?$/i.test(name)) {
    return false;
  }

  if ([
    'spatial_ref_sys',
    'geometry_columns',
    'geography_columns',
    'raster_columns',
    'raster_overviews',
    'layer',
    'topology',
    'schema_migrations',
    'flyway_schema_history',
    'spatial_index',
  ].includes(name)) {
    return false;
  }

  return true;
}

/**
 * Extracts a universal grouping label ("Service", "Famille", "Domaine", etc.)
 * from a PostgreSQL table comment.
 * Examples supported:
 *  - "Service : Gestion et Développement des Ressources en Eau" -> "Gestion et Développement des Ressources en Eau"
 *  - "Service : Eau Potable | Description..." -> "Eau Potable"
 *  - "Domaine : Foncier & Cadastre" -> "Foncier & Cadastre"
 *  - "Module - Ressources Humaines" -> "Ressources Humaines"
 *  - Shared concise comment across multiple tables -> comment itself
 */
export function extractGroupFromComment(
  comment?: string | null,
  allTables: PostgresTableSchema[] = []
): string | null {
  if (!comment || typeof comment !== 'string') return null;
  const trimmed = comment.trim();
  if (!trimmed) return null;

  // 1. Explicit structured label in comment (Service :, Famille :, Domaine :, Module :, Direction :, Catégorie :, etc.)
  const labelRegex = /(?:^|\n|\|)\s*(?:Service|Famille|Family|Domaine|Domain|Direction|Département|Departement|Department|Module|Thème|Theme|Catégorie|Categorie|Category|Groupe|Group|Unité|Unite|Unit|Division|Section|Pôle|Pole|Branche)\s*[:=\-]\s*([^\n|;]+)/i;
  const labelMatch = trimmed.match(labelRegex);
  if (labelMatch && labelMatch[1]) {
    const val = labelMatch[1].trim().replace(/[.\s]+$/, '');
    if (val.length > 0) return val;
  }

  // 2. Delimited prefix format: "Group Name | Description" or "Group Name — Description"
  const pipeOrDashParts = trimmed.split(/\s*(?:\||—|\n)\s*/);
  if (pipeOrDashParts.length >= 2) {
    const firstPart = pipeOrDashParts[0].trim();
    if (firstPart.length >= 2 && firstPart.length <= 75) {
      return firstPart;
    }
  }

  // 3. Generic "Key : Value" on single short line
  const colonMatch = trimmed.match(/^([^:\n]{2,35})\s*:\s*([^\n.;]{2,80})$/);
  if (colonMatch && !/^https?$/i.test(colonMatch[1].trim())) {
    return colonMatch[2].trim();
  }

  // 4. Shared identical comment used across >= 2 tables (universal convention)
  const normalized = trimmed.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 85) {
    const sameCommentCount = allTables.filter(
      t => (t.comment || '').replace(/\s+/g, ' ').trim().toLowerCase() === normalized.toLowerCase()
    ).length;
    if (sameCommentCount >= 2) {
      return normalized;
    }
  }

  // 5. Concise single-phrase comment without full-sentence punctuation
  if (normalized.length <= 55 && !normalized.includes('. ')) {
    return normalized.replace(/\.+$/, '');
  }

  return null;
}

/**
 * Classifies a table universally across ANY PostgreSQL database:
 * 1. System / Technical tables -> "Tables Système & Techniques"
 * 2. Table `comment` (e.g., "Service : Gestion et Développement des Ressources en Eau")
 * 3. Shared naming prefix among >= 2 business tables (e.g., `rh_*`, `sig_*`, `bilan_*`)
 * 4. Non-generic PostgreSQL schema name (if other than public/sde/dbo/gis/data)
 * 5. Default fallback ("Autres Tables Métiers")
 */
export function classifyTableFamily(
  table: PostgresTableSchema,
  allTables: PostgresTableSchema[] = [],
  lang: 'fr' | 'en' = 'fr'
): string {
  const isFr = lang === 'fr';

  if (!isBusinessTable(table)) {
    return isFr ? 'Tables Système & Techniques' : 'System & Technical Tables';
  }

  // Priority 1: Extract directly from PostgreSQL table comment (e.g., "Service : ...")
  const commentGroup = extractGroupFromComment(table.comment, allTables);
  if (commentGroup) {
    return commentGroup;
  }

  const name = (table.name || '').toLowerCase();
  const schema = (table.schema || 'public').toLowerCase();

  // Priority 2: Shared naming prefix across >= 2 business tables without comment group
  const parts = name.split('_').filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 3 && !['tbl', 'tab', 'dim', 'fact', 'vue', 'view'].includes(parts[0])) {
    const prefix = parts[0];
    const siblingCount = allTables.filter(
      t => isBusinessTable(t) && !extractGroupFromComment(t.comment, allTables) && (t.name || '').toLowerCase().startsWith(prefix + '_')
    ).length;
    if (siblingCount >= 2) {
      const titlePrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      return isFr ? `Groupe ${titlePrefix}` : `${titlePrefix} Group`;
    }
  }

  // Priority 3: Fallback to non-generic schema name
  if (schema && !['public', 'sde', 'dbo', 'gis', 'data'].includes(schema)) {
    const formattedSchema = schema
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return isFr ? `Schéma ${formattedSchema}` : `${formattedSchema} Schema`;
  }

  return isFr ? 'Autres Tables Métiers' : 'Other Business Tables';
}

function sanitizeArchiveName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'Groupe';
}

function buildUniqueSheetName(rawName: string, usedNames: Set<string>): string {
  const base = rawName.replace(/[:\\/?*[\]]/g, '_').slice(0, 28) || 'Table';
  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${counter}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    counter++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Computes structured table profile metadata matching the normalized data dictionary card.
 * (1- Fiche descriptive par table)
 */
export function computeTableProfile(
  table: PostgresTableSchema,
  schema: PostgresDatabaseSchema,
  lang: 'fr' | 'en' = 'fr'
): TableProfileSheetData {
  const isFr = lang === 'fr';

  // 1. Service / Groupe extrait du commentaire en priorité, sinon schéma PostgreSQL
  const extractedService = extractGroupFromComment(table.comment, schema.tables || []);
  const service = extractedService || (table.schema || 'public');

  // 2. Table name
  const tableName = `${table.schema ? table.schema + '.' : ''}${table.name}`;

  // 3. Nature
  let nature = isFr ? 'Donnée tabulaire' : 'Tabular data';
  if (table.isSpatial) {
    const geomCol = (table.columns || []).find(c => c.isGeometry);
    const geomType = geomCol?.geometryType || (table.columns || []).find(c => /geom/i.test(c.name))?.geometryType || 'Geometry';
    const srid = geomCol?.srid || (geomCol?.dataType.match(/\d{4,5}/)?.[0]) || '4326';
    nature = isFr 
      ? `Donnée spatiale (${geomType}, EPSG:${srid})`
      : `Spatial vector data (${geomType}, EPSG:${srid})`;
  }

  // 4. Identifiant métier (Primary Key)
  const pkCols = table.primaryKeys && table.primaryKeys.length > 0
    ? table.primaryKeys.join(', ')
    : (table.columns || []).find(c => c.isPrimaryKey)?.name
    || (table.columns || []).find(c => /^(id|gid|ogc_fid|code|num|objectid)/i.test(c.name))?.name
    || (isFr ? 'Non défini (Aucune PK explicite)' : 'Not defined (No explicit PK)');
  const identifiantMetier = pkCols;

  // 5. Rattachement (Clés étrangères)
  const rels = (schema.relationships || []).filter(
    r => r.sourceTable === table.name || r.sourceTable === tableName
  );
  let rattachement = isFr ? 'Aucun (Table racine / primaire)' : 'None (Root / primary table)';
  if (rels.length > 0) {
    rattachement = rels.map(r => `${r.sourceColumn} -> ${r.targetTable}.${r.targetColumn}`).join(' ; ');
  } else {
    const fkCols = (table.columns || []).filter(c => c.isForeignKey);
    if (fkCols.length > 0) {
      rattachement = fkCols.map(c => c.name).join(', ');
    }
  }

  // 6. Champs temporels
  const temporalCols = (table.columns || []).filter(c => {
    const dt = (c.dataType || '').toLowerCase();
    const nm = c.name.toLowerCase();
    return dt.includes('date') || dt.includes('time') || dt.includes('year') || dt.includes('interval')
      || /date|annee|year|mois|month|jour|day|time|horodate|timestamp|created|updated|debut|fin/i.test(nm);
  });
  const champsTemporels = temporalCols.length > 0
    ? temporalCols.map(c => c.name).join(', ')
    : (isFr ? 'Aucun' : 'None');

  // 7. Champs quantitatifs
  const quantCols = (table.columns || []).filter(c => {
    const dt = (c.dataType || '').toLowerCase();
    const nm = c.name.toLowerCase();
    if (c.isPrimaryKey || c.isForeignKey || c.isGeometry) return false;
    if (/^(id|gid|code|uuid|guid|matricule)/i.test(nm)) return false;
    return dt.includes('int') || dt.includes('numeric') || dt.includes('decimal')
      || dt.includes('real') || dt.includes('double') || dt.includes('float')
      || /cote|volume|debit|surface|hauteur|longueur|larg|capacite|taux|montant|valeur|prix|pente|aire|area|length|density|quantite|stock|mesure|solde/i.test(nm);
  });
  const champsQuantitatifs = quantCols.length > 0
    ? quantCols.map(c => c.name).join(', ') + (quantCols.length > 7 ? ' (etc.)' : '')
    : (isFr ? 'Aucun' : 'None');

  // 8. Nombre d'enregistrements
  const nombreEnregistrements = table.estimatedRows !== undefined && table.estimatedRows !== null && table.estimatedRows > 0
    ? table.estimatedRows.toLocaleString()
    : '';

  // 9. Contrôles
  const controles = isFr
    ? 'À renseigner selon les rapports de contrôle'
    : 'To be specified according to audit control reports';

  // 10. État de validation
  const etatValidation = isFr
    ? 'À confirmer selon le périmètre contrôlé'
    : 'To be confirmed according to controlled perimeter';

  return {
    service,
    tableName,
    nature,
    identifiantMetier,
    rattachement,
    champsTemporels,
    champsQuantitatifs,
    nombreEnregistrements,
    controles,
    etatValidation,
  };
}

/**
 * Generates an Excel (.xlsx) workbook for a specific subset of tables (a single family or whole DB).
 * Features renamed headers per table:
 * - Banner per table: "FICHE TABLE : schema.table"
 * - Section 1: "1- Fiche descriptive — <tableName>" with headers ("Rubrique" | "Spécification / Valeur")
 * - Section 2: "2- Dictionnaire physique des champs — <tableName>" with unified headers
 */
export function buildFamilyExcelWorkbook(
  tables: PostgresTableSchema[],
  schema: PostgresDatabaseSchema,
  familyTitle: string,
  lang: 'fr' | 'en' = 'fr'
): Uint8Array {
  const isFr = lang === 'fr';
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const summaryRows: any[][] = [];
  summaryRows.push([
    isFr ? `DICTIONNAIRE DE DONNÉES — SERVICE / GROUPE : ${familyTitle.toUpperCase()}` : `DATA DICTIONARY — SERVICE / GROUP: ${familyTitle.toUpperCase()}`,
    '', '', '', '', ''
  ]);
  summaryRows.push([
    isFr ? `Base de données : ${schema.databaseName} | Tables : ${tables.length} | Généré le ${new Date().toLocaleDateString()}` : `Database: ${schema.databaseName} | Tables: ${tables.length} | Generated on ${new Date().toLocaleDateString()}`,
    '', '', '', '', ''
  ]);
  summaryRows.push(['', '', '', '', '', '']);

  const buildTableRows = (table: PostgresTableSchema, targetRows: any[][]) => {
    const profile = computeTableProfile(table, schema, lang);

    // Explicitly renamed table header banner
    targetRows.push([
      isFr ? `TABLE : ${profile.tableName}` : `TABLE: ${profile.tableName}`,
      isFr ? `Classification : ${isBusinessTable(table) ? 'Table Métier' : 'Table Technique'}` : `Classification: ${isBusinessTable(table) ? 'Business Table' : 'Technical Table'}`,
      '', '', '', ''
    ]);

    // Section 1: Profile Sheet
    targetRows.push([
      isFr ? `1- Fiche descriptive : ${table.name}` : `1- Table Profile: ${table.name}`,
      ''
    ]);
    targetRows.push([
      isFr ? 'Rubrique' : 'Property',
      isFr ? 'Spécification / Valeur' : 'Specification / Value'
    ]);
    targetRows.push([isFr ? 'Service' : 'Service', profile.service]);
    targetRows.push([isFr ? 'Table' : 'Table', profile.tableName]);
    targetRows.push([isFr ? 'Nature' : 'Nature', profile.nature]);
    targetRows.push([isFr ? 'Identifiant métier' : 'Business Identifier (PK)', profile.identifiantMetier]);
    targetRows.push([isFr ? 'Rattachement' : 'Foreign Key Links', profile.rattachement]);
    targetRows.push([isFr ? 'Champs temporels' : 'Temporal Fields', profile.champsTemporels]);
    targetRows.push([isFr ? 'Champs quantitatifs' : 'Quantitative Fields', profile.champsQuantitatifs]);
    targetRows.push([isFr ? "Nombre d'enregistrements" : 'Record Count', profile.nombreEnregistrements]);
    targetRows.push([isFr ? 'Contrôles' : 'Integrity Controls', profile.controles]);
    targetRows.push([isFr ? 'État de validation' : 'Validation Status', profile.etatValidation]);
    targetRows.push(['', '', '', '', '', '']);

    // Section 2: Physical Data Dictionary
    targetRows.push([
      isFr ? `2- Structure physique des champs : ${table.name}` : `2- Physical Fields Structure: ${table.name}`,
      '', '', '', '', ''
    ]);
    targetRows.push([
      isFr ? 'Nom du champ' : 'Field Name',
      isFr ? 'Type PostgreSQL' : 'PostgreSQL Type',
      isFr ? 'Nullabilité' : 'Nullability',
      isFr ? 'Contrainte / Clé' : 'Key / Constraint',
      isFr ? 'Valeur par défaut' : 'Default Value',
      isFr ? 'Description / Commentaire' : 'Description / Notes'
    ]);

    for (const col of table.columns || []) {
      const canonicalType = normalizeToPostgresType(col.dataType || 'text');
      const keyParts: string[] = [];
      if (col.isPrimaryKey) keyParts.push('PK');
      if (col.isForeignKey) {
        keyParts.push(col.foreignKeyTarget ? `FK -> ${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}` : 'FK');
      }
      if (col.isGeometry) keyParts.push(`GEOM(${col.srid || 4326})`);
      const keyRole = keyParts.length > 0 ? keyParts.join(' | ') : '-';
      const nullableStr = col.isNullable ? (isFr ? 'Optionnel (NULL)' : 'Optional (NULL)') : (isFr ? 'Obligatoire (NOT NULL)' : 'Required (NOT NULL)');
      targetRows.push([
        col.name,
        canonicalType,
        nullableStr,
        keyRole,
        col.defaultValue || '-',
        col.comment || (col.isPrimaryKey ? (isFr ? 'Identifiant unique' : 'Primary key') : '-')
      ]);
    }
  };

  for (const table of tables) {
    buildTableRows(table, summaryRows);
    summaryRows.push(['', '', '', '', '', '']);
    summaryRows.push(['--------------------------------------------------', '--------------------------------------------------', '', '', '', '']);
    summaryRows.push(['', '', '', '', '', '']);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 32 },
    { wch: 42 },
    { wch: 22 },
    { wch: 26 },
    { wch: 22 },
    { wch: 44 },
  ];
  const summarySheetName = buildUniqueSheetName(isFr ? 'Catalogue_Service' : 'Service_Catalog', usedSheetNames);
  XLSX.utils.book_append_sheet(wb, wsSummary, summarySheetName);

  // Individual sheet tab per table in this family
  for (const table of tables.slice(0, 35)) {
    const tableRows: any[][] = [];
    buildTableRows(table, tableRows);
    const tableWs = XLSX.utils.aoa_to_sheet(tableRows);
    tableWs['!cols'] = [
      { wch: 32 },
      { wch: 42 },
      { wch: 22 },
      { wch: 26 },
      { wch: 22 },
      { wch: 44 },
    ];
    const safeName = buildUniqueSheetName(table.name, usedSheetNames);
    XLSX.utils.book_append_sheet(wb, tableWs, safeName);
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generates an Excel (.xlsx) single workbook (legacy compatibility).
 */
export function generateProfileSheetExcel(schema: PostgresDatabaseSchema, lang: 'fr' | 'en' = 'fr'): Uint8Array {
  return buildFamilyExcelWorkbook(schema.tables || [], schema, schema.databaseName, lang);
}

/**
 * Generates a ZIP archive containing individual Excel (.xlsx) files for each family of tables,
 * plus an overall index workbook (`00_Sommaire_Familles.xlsx`).
 */
export async function generateProfileSheetExcelZip(
  schema: PostgresDatabaseSchema,
  lang: 'fr' | 'en' = 'fr'
): Promise<{
  zipBytes: Uint8Array;
  familyCount: number;
  families: { family: string; fileName: string; tableCount: number }[];
}> {
  const isFr = lang === 'fr';
  const allTables = schema.tables || [];
  const familyMap = new Map<string, PostgresTableSchema[]>();

  for (const t of allTables) {
    const fam = classifyTableFamily(t, allTables, lang);
    if (!familyMap.has(fam)) {
      familyMap.set(fam, []);
    }
    familyMap.get(fam)!.push(t);
  }

  const zip = new JSZip();
  const familiesMeta: { family: string; fileName: string; tableCount: number }[] = [];
  const usedFiles = new Set<string>();

  // Sort families so business families appear first and System/Technical last
  const systemLabel = isFr ? 'Tables Système & Techniques' : 'System & Technical Tables';
  const sortedEntries = Array.from(familyMap.entries()).sort(([a], [b]) => {
    if (a === systemLabel && b !== systemLabel) return 1;
    if (b === systemLabel && a !== systemLabel) return -1;
    return a.localeCompare(b);
  });

  // Build index workbook rows
  const indexRows: any[][] = [];
  indexRows.push([
    isFr ? `SOMMAIRE DES SERVICES & GROUPES (COMMENTAIRES) — ${schema.databaseName.toUpperCase()}` : `SERVICES & GROUPS INDEX (FROM COMMENTS) — ${schema.databaseName.toUpperCase()}`,
    '', '', '', '', '', '', ''
  ]);
  indexRows.push([
    isFr ? 'Service / Groupe' : 'Service / Group',
    isFr ? 'Fichier Excel dédié' : 'Dedicated Excel File',
    isFr ? 'Schéma' : 'Schema',
    isFr ? 'Nom de la table' : 'Table Name',
    isFr ? 'Classification' : 'Classification',
    isFr ? 'Nature' : 'Nature',
    isFr ? 'Nb Champs' : 'Field Count',
    isFr ? 'Nb Enregistrements' : 'Record Count',
  ]);

  let fileIndex = 1;
  for (const [familyName, famTables] of sortedEntries) {
    const prefixNum = String(fileIndex).padStart(2, '0');
    fileIndex++;
    let baseFileName = `${prefixNum}_${sanitizeArchiveName(familyName)}_${lang}.xlsx`;
    while (usedFiles.has(baseFileName.toLowerCase())) {
      baseFileName = `${prefixNum}_${sanitizeArchiveName(familyName)}_${fileIndex}_${lang}.xlsx`;
    }
    usedFiles.add(baseFileName.toLowerCase());

    const xlsxBytes = buildFamilyExcelWorkbook(famTables, schema, familyName, lang);
    zip.file(baseFileName, xlsxBytes);
    familiesMeta.push({ family: familyName, fileName: baseFileName, tableCount: famTables.length });

    for (const t of famTables) {
      indexRows.push([
        familyName,
        baseFileName,
        t.schema || 'public',
        t.name,
        isBusinessTable(t) ? (isFr ? 'Table Métier' : 'Business Table') : (isFr ? 'Table Technique' : 'Technical Table'),
        t.isSpatial ? (isFr ? 'Couche Spatiale PostGIS' : 'PostGIS Spatial Layer') : (isFr ? 'Table Tabulaire' : 'Tabular Table'),
        (t.columns || []).length,
        t.estimatedRows || 0,
      ]);
    }
  }

  // Create 00_Sommaire_Familles.xlsx
  const indexWb = XLSX.utils.book_new();
  const indexWs = XLSX.utils.aoa_to_sheet(indexRows);
  indexWs['!cols'] = [
    { wch: 34 },
    { wch: 38 },
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(indexWb, indexWs, isFr ? 'Sommaire_Services' : 'Services_Index');
  const indexOut = XLSX.write(indexWb, { bookType: 'xlsx', type: 'array' });
  const indexFileName = isFr ? `00_Sommaire_Services_Groupes_${lang}.xlsx` : `00_Services_Groups_Index_${lang}.xlsx`;
  zip.file(indexFileName, new Uint8Array(indexOut));

  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return {
    zipBytes,
    familyCount: familiesMeta.length,
    families: familiesMeta,
  };
}

/**
 * Generates an RFC-compliant CSV with UTF-8 BOM matching the normalized profile sheet layout.
 */
export function generateProfileSheetCsv(schema: PostgresDatabaseSchema, lang: 'fr' | 'en' = 'fr'): string {
  const isFr = lang === 'fr';
  const sep = ';';
  const lines: string[] = [];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    if (s.includes('"') || s.includes(sep) || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  lines.push(`${escapeCsv(isFr ? `DICTIONNAIRE DE DONNÉES - ${schema.databaseName.toUpperCase()}` : `DATA DICTIONARY - ${schema.databaseName.toUpperCase()}`)}${sep}`);
  lines.push('');

  for (const table of schema.tables || []) {
    const profile = computeTableProfile(table, schema, lang);

    lines.push(`${escapeCsv(isFr ? `TABLE : ${profile.tableName}` : `TABLE: ${profile.tableName}`)}${sep}`);
    lines.push(`${escapeCsv(isFr ? `1- Fiche descriptive : ${table.name}` : `1- Table Profile: ${table.name}`)}${sep}`);
    lines.push(`${escapeCsv(isFr ? 'Rubrique' : 'Property')}${sep}${escapeCsv(isFr ? 'Spécification / Valeur' : 'Specification / Value')}`);
    lines.push(`${escapeCsv(isFr ? 'Service' : 'Service')}${sep}${escapeCsv(profile.service)}`);
    lines.push(`${escapeCsv(isFr ? 'Table' : 'Table')}${sep}${escapeCsv(profile.tableName)}`);
    lines.push(`${escapeCsv(isFr ? 'Nature' : 'Nature')}${sep}${escapeCsv(profile.nature)}`);
    lines.push(`${escapeCsv(isFr ? 'Identifiant métier' : 'Business Identifier (PK)')}${sep}${escapeCsv(profile.identifiantMetier)}`);
    lines.push(`${escapeCsv(isFr ? 'Rattachement' : 'Foreign Key Links')}${sep}${escapeCsv(profile.rattachement)}`);
    lines.push(`${escapeCsv(isFr ? 'Champs temporels' : 'Temporal Fields')}${sep}${escapeCsv(profile.champsTemporels)}`);
    lines.push(`${escapeCsv(isFr ? 'Champs quantitatifs' : 'Quantitative Fields')}${sep}${escapeCsv(profile.champsQuantitatifs)}`);
    lines.push(`${escapeCsv(isFr ? "Nombre d'enregistrements" : 'Record Count')}${sep}${escapeCsv(profile.nombreEnregistrements)}`);
    lines.push(`${escapeCsv(isFr ? 'Contrôles' : 'Integrity Controls')}${sep}${escapeCsv(profile.controles)}`);
    lines.push(`${escapeCsv(isFr ? 'État de validation' : 'Validation Status')}${sep}${escapeCsv(profile.etatValidation)}`);
    lines.push('');

    lines.push(`${escapeCsv(isFr ? `2- Structure physique des champs : ${table.name}` : `2- Physical Fields Structure: ${table.name}`)}${sep}${sep}${sep}${sep}${sep}`);
    lines.push([
      escapeCsv(isFr ? 'Nom du champ' : 'Field Name'),
      escapeCsv(isFr ? 'Type PostgreSQL' : 'PostgreSQL Type'),
      escapeCsv(isFr ? 'Nullabilité' : 'Nullability'),
      escapeCsv(isFr ? 'Contrainte / Clé' : 'Key / Constraint'),
      escapeCsv(isFr ? 'Valeur par défaut' : 'Default Value'),
      escapeCsv(isFr ? 'Description / Commentaire' : 'Description / Notes'),
    ].join(sep));

    for (const col of table.columns || []) {
      const canonicalType = normalizeToPostgresType(col.dataType || 'text');
      const keyParts: string[] = [];
      if (col.isPrimaryKey) keyParts.push('PK');
      if (col.isForeignKey) keyParts.push(col.foreignKeyTarget ? `FK -> ${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}` : 'FK');
      if (col.isGeometry) keyParts.push(`GEOM(${col.srid || 4326})`);
      const keyRole = keyParts.length > 0 ? keyParts.join(' | ') : '-';
      const nullableStr = col.isNullable ? (isFr ? 'Optionnel (NULL)' : 'Optional (NULL)') : (isFr ? 'Obligatoire (NOT NULL)' : 'Required (NOT NULL)');
      lines.push([
        escapeCsv(col.name),
        escapeCsv(canonicalType),
        escapeCsv(nullableStr),
        escapeCsv(keyRole),
        escapeCsv(col.defaultValue || '-'),
        escapeCsv(col.comment || (col.isPrimaryKey ? (isFr ? 'Identifiant unique' : 'Primary key') : '-')),
      ].join(sep));
    }

    lines.push('');
    lines.push('');
  }

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Generates an executive, publication-grade standalone HTML Data Dictionary Report.
 * Supports French ('fr') or English ('en').
 * Self-contained with CSS, print-friendly, multi-criteria filtering, and interactive badges.
 */
export function generateStandaloneHtmlReport(schema: PostgresDatabaseSchema, lang: 'fr' | 'en' = 'fr'): string {
  const isFr = lang === 'fr';
  const generatedTimeStr = new Date(schema.generatedAt).toUTCString();
  const title = isFr
    ? `Dictionnaire de Données & Architecture PostgreSQL - ${schema.databaseName}`
    : `PostgreSQL Data Dictionary & Schema Architecture - ${schema.databaseName}`;

  const allTables = schema.tables || [];
  const uniqueSchemas = Array.from(new Set(allTables.map(t => t.schema || 'public'))).sort();
  const uniqueFamilies = Array.from(new Set(allTables.map(t => classifyTableFamily(t, allTables, lang)))).sort();

  const i18n = {
    brand: isFr ? 'OmniGeo • Dictionnaire PostgreSQL' : 'OmniGeo • PostgreSQL Data Dictionary',
    desc: schema.description || (isFr 
      ? 'Rapport architectural complet de la base de données relationnelle et spatiale.' 
      : 'Comprehensive architectural report of the relational and spatial database schema.'),
    printBtn: isFr ? 'Imprimer / PDF' : 'Print / PDF',
    viewMpdBtn: isFr ? 'Schéma MPD' : 'MPD Schema',
    genAt: isFr ? 'Généré le :' : 'Generated on:',
    serverVer: isFr ? 'Version serveur :' : 'Server version:',
    kpiTables: isFr ? 'Tables Base' : 'Total Tables',
    kpiTablesSub: isFr ? 'Total des tables inventoriées' : 'Total inventoried tables',
    kpiSpatial: isFr ? 'Couches Spatiales (PostGIS)' : 'Spatial Layers (PostGIS)',
    kpiSpatialSub: isFr ? 'Colonnes géométriques indexées' : 'Indexed geometry columns',
    kpiRecords: isFr ? 'Total Enregistrements' : 'Total Records',
    kpiRecordsSub: isFr ? 'Volume de données estimé' : 'Estimated row count',
    kpiCols: isFr ? 'Total Colonnes' : 'Total Columns',
    kpiColsSub: isFr ? 'Attributs & géométries typés' : 'Typed attributes & geometries',
    kpiRels: isFr ? 'Relations (Clés Étrangères)' : 'Foreign Key Relations',
    kpiRelsSub: isFr ? "Liens d'intégrité référentielle" : 'Referential integrity links',
    distLabel: isFr ? 'Distribution des Types PostgreSQL :' : 'PostgreSQL Canonical Types Distribution:',
    relSectionTitle: isFr ? 'Matrice des Relations & Clés Étrangères' : 'Relational Model & Foreign Keys Matrix',
    relSectionSub: isFr ? 'Liaisons référentielles et intégrité entre les tables' : 'Referential integrity links and constraint mapping',
    activeLinks: isFr ? 'liaisons actives' : 'active relationships',
    thConstraint: isFr ? 'Contrainte FK' : 'FK Constraint',
    thSource: isFr ? 'Table & Champ Source (FK)' : 'Source Table & Column (FK)',
    thCard: isFr ? 'Cardinalité' : 'Cardinality',
    thTarget: isFr ? 'Table & Champ Cible (PK)' : 'Target Table & Column (PK)',
    thRule: isFr ? "Règle d'Intégrité" : 'Integrity Rule',
    noRels: isFr ? 'Aucune contrainte de clé étrangère explicite détectée.' : 'No explicit foreign key constraints detected.',
    catSectionTitle: isFr ? 'Catalogue & Dictionnaire des Tables' : 'Tables & Columns Data Dictionary',
    catSectionSub: isFr ? 'Recherche avancée et fiches détaillées par table' : 'Advanced filtering and detailed specifications per table',
    docTables: isFr ? 'tables documentées' : 'documented tables',
    searchPlaceholder: isFr ? 'Rechercher par table, colonne, type PostgreSQL, commentaire ou FK...' : 'Search by table, column, PostgreSQL type, comment or FK...',
    thColName: isFr ? 'Nom du Champ' : 'Field Name',
    thColType: isFr ? 'Type PostgreSQL' : 'PostgreSQL Type',
    thNullable: isFr ? 'Nullabilité' : 'Nullability',
    thKeys: isFr ? 'Contrainte / Clé' : 'Key / Constraint',
    thDefault: isFr ? 'Valeur par Défaut' : 'Default Value',
    thDesc: isFr ? 'Description' : 'Description',
    fieldsWord: isFr ? 'champs' : 'columns',
    recordsWord: isFr ? 'enregistrements' : 'records',
    spatialBadge: isFr ? 'COUCHE POSTGIS' : 'POSTGIS LAYER',
    techBadge: isFr ? 'TECHNIQUE' : 'SYSTEM',
  };

  // Tables catalog rows
  const tablesHtml = allTables.map(table => {
    const tableFamily = classifyTableFamily(table, allTables, lang);
    const isBiz = isBusinessTable(table);

    const columnsHtml = (table.columns || []).map(col => {
      const canonicalType = normalizeToPostgresType(col.dataType || 'text');
      const category = categorizeDataType(canonicalType);
      const pkBadge = col.isPrimaryKey ? `<span class="badge badge-pk">PK</span>` : '';
      const fkBadge = col.isForeignKey && col.foreignKeyTarget 
        ? `<span class="badge badge-fk" title="Liaison vers ${escapeHtml(col.foreignKeyTarget.table)}.${escapeHtml(col.foreignKeyTarget.column)}">FK &rarr; ${escapeHtml(col.foreignKeyTarget.table)}</span>` 
        : '';
      const geomBadge = col.isGeometry 
        ? `<span class="badge badge-geom" title="PostGIS Geometry">${escapeHtml(col.geometryType || 'GEOMETRY')}${col.srid ? ` (${col.srid})` : ''}</span>` 
        : '';

      const nullBadge = col.isNullable 
        ? `<span class="nullable-tag tag-null">NULL</span>` 
        : `<span class="nullable-tag tag-notnull">NOT NULL</span>`;

      const fkText = col.foreignKeyTarget ? `${col.foreignKeyTarget.table}.${col.foreignKeyTarget.column}` : '';

      return `
        <tr class="col-row"
            data-category="${escapeHtml(category)}"
            data-pk="${col.isPrimaryKey ? '1' : '0'}"
            data-fk="${col.isForeignKey ? '1' : '0'}"
            data-notnull="${!col.isNullable ? '1' : '0'}"
            data-comment="${escapeHtml((col.comment || '').toLowerCase())}"
            data-fktarget="${escapeHtml(fkText.toLowerCase())}">
          <td class="col-name font-mono font-bold" title="${escapeHtml(col.name)}">${escapeHtml(col.name)}</td>
          <td class="col-type-cell" title="${escapeHtml(canonicalType)}">
            <span class="type-badge font-mono">${escapeHtml(canonicalType)}</span>
          </td>
          <td class="text-center">${nullBadge}</td>
          <td>
            <div class="badges-row">
              ${pkBadge}
              ${fkBadge}
              ${geomBadge}
            </div>
          </td>
          <td class="col-default font-mono" title="${col.defaultValue ? escapeHtml(col.defaultValue) : ''}">${col.defaultValue ? escapeHtml(col.defaultValue) : '<span class="text-subtle">&mdash;</span>'}</td>
          <td class="col-comment" title="${col.comment ? escapeHtml(col.comment) : ''}">${col.comment ? escapeHtml(col.comment) : '<span class="text-subtle">&mdash;</span>'}</td>
        </tr>
      `;
    }).join('\n');

    const profile = computeTableProfile(table, schema, lang);

    return `
      <section class="table-card"
               id="tbl-${escapeHtml(table.name)}"
               data-schema="${escapeHtml((table.schema || 'public').toLowerCase())}"
               data-family="${escapeHtml(tableFamily)}"
               data-spatial="${table.isSpatial ? '1' : '0'}"
               data-business="${isBiz ? '1' : '0'}"
               data-rows="${table.estimatedRows || 0}"
               data-comment="${escapeHtml((table.comment || '').toLowerCase())}">
        <div class="table-card-header" onclick="toggleCardBody(this)">
          <div class="table-title-group">
            <span class="schema-tag font-mono">${escapeHtml(table.schema || 'public')}</span>
            <h3 class="table-name font-mono" title="${escapeHtml(table.name)}">${escapeHtml(table.name)}</h3>
            <span class="family-pill">${escapeHtml(tableFamily)}</span>
            ${table.isSpatial ? `<span class="badge badge-postgis">${i18n.spatialBadge}</span>` : ''}
            ${!isBiz ? `<span class="badge" style="background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;">${i18n.techBadge}</span>` : ''}
          </div>
          <div class="table-meta-row font-mono">
            <span><strong>${(table.columns || []).length}</strong> ${i18n.fieldsWord}</span>
            <span class="meta-sep">&bull;</span>
            <span><strong>${(table.estimatedRows || 0).toLocaleString()}</strong> ${i18n.recordsWord}</span>
            ${table.sizeFormatted ? `<span class="meta-sep">&bull;</span><span>${escapeHtml(table.sizeFormatted)}</span>` : ''}
            <span class="collapse-chevron" style="margin-left:8px; font-weight:700; opacity:0.6;">&#9662;</span>
          </div>
        </div>
        <div class="table-card-body">
          ${table.comment ? `<p class="table-description">${escapeHtml(table.comment)}</p>` : ''}

          <!-- 1- Fiche descriptive par table -->
          <div class="fiche-box">
            <div class="fiche-box-title">1- ${isFr ? `Fiche descriptive : ${escapeHtml(table.name)}` : `Table Profile: ${escapeHtml(table.name)}`}</div>
            <table class="fiche-table">
              <thead>
                <tr>
                  <th class="fiche-th-label">${isFr ? 'Rubrique' : 'Property'}</th>
                  <th class="fiche-th-value">${isFr ? 'Spécification / Valeur' : 'Specification / Value'}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="fiche-label">${isFr ? 'Service' : 'Service'}</td>
                  <td class="fiche-value">${escapeHtml(profile.service)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Table' : 'Table'}</td>
                  <td class="fiche-value font-mono font-bold">${escapeHtml(profile.tableName)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Nature' : 'Nature'}</td>
                  <td class="fiche-value">${escapeHtml(profile.nature)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Identifiant métier' : 'Business Identifier (PK)'}</td>
                  <td class="fiche-value font-mono font-bold text-accent">${escapeHtml(profile.identifiantMetier)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Rattachement' : 'Foreign Key Links'}</td>
                  <td class="fiche-value font-mono">${escapeHtml(profile.rattachement)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Champs temporels' : 'Temporal Fields'}</td>
                  <td class="fiche-value font-mono">${escapeHtml(profile.champsTemporels)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Champs quantitatifs' : 'Quantitative Fields'}</td>
                  <td class="fiche-value font-mono">${escapeHtml(profile.champsQuantitatifs)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? "Nombre d'enregistrements" : 'Record Count'}</td>
                  <td class="fiche-value font-mono">${escapeHtml(profile.nombreEnregistrements)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'Contrôles' : 'Integrity Controls'}</td>
                  <td class="fiche-value">${escapeHtml(profile.controles)}</td>
                </tr>
                <tr>
                  <td class="fiche-label">${isFr ? 'État de validation' : 'Validation Status'}</td>
                  <td class="fiche-value">${escapeHtml(profile.etatValidation)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 2- Structure physique des champs -->
          <div class="fiche-box-title" style="margin-top: 20px;">2- ${isFr ? `Structure physique des champs : ${escapeHtml(table.name)}` : `Physical Fields Structure: ${escapeHtml(table.name)}`}</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 24%">${i18n.thColName}</th>
                  <th style="width: 24%">${i18n.thColType}</th>
                  <th style="width: 12%" class="text-center">${i18n.thNullable}</th>
                  <th style="width: 18%">${i18n.thKeys}</th>
                  <th style="width: 11%">${i18n.thDefault}</th>
                  <th style="width: 11%">${i18n.thDesc}</th>
                </tr>
              </thead>
              <tbody>
                ${columnsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }).join('\n');

  // Relationships table
  const relsHtml = (schema.relationships && schema.relationships.length > 0) ? schema.relationships.map(rel => `
    <tr>
      <td class="font-mono text-muted text-truncate" title="${escapeHtml(rel.constraintName)}">${escapeHtml(rel.constraintName)}</td>
      <td class="font-mono font-bold text-truncate" title="${escapeHtml(rel.sourceTable)}.${escapeHtml(rel.sourceColumn)}">
        ${escapeHtml(rel.sourceTable)}.<span class="text-accent">${escapeHtml(rel.sourceColumn)}</span>
      </td>
      <td class="text-center">
        <span class="cardinality-chip font-mono">${rel.sourceCardinality || '0..n'} &rarr; ${rel.cardinality || '1:N'} &rarr; ${rel.targetCardinality || '1..1'}</span>
      </td>
      <td class="font-mono font-bold text-truncate" title="${escapeHtml(rel.targetTable)}.${escapeHtml(rel.targetColumn)}">
        ${escapeHtml(rel.targetTable)}.<span class="text-success">${escapeHtml(rel.targetColumn)}</span>
      </td>
      <td class="font-mono text-muted">${rel.deleteRule ? `ON DELETE ${escapeHtml(rel.deleteRule)}` : 'CASCADE'}</td>
    </tr>
  `).join('\n') : `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">${i18n.noRels}</td></tr>`;

  // Type breakdown cards
  const typeDistributionHtml = Object.entries(schema.summary?.dataTypesDistribution || {}).map(([category, count]) => `
    <div class="dist-item">
      <span class="dist-name font-mono">${escapeHtml(category)}</span>
      <span class="dist-count font-mono font-bold">${count}</span>
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --text: #0F172A;
      --text-muted: #64748B;
      --text-subtle: #94A3B8;
      --border: #E2E8F0;
      --border-dark: #CBD5E1;
      --primary: #1E293B;
      --accent: #2563EB;
      --accent-subtle: #EFF6FF;
      --success: #059669;
      --success-subtle: #ECFDF5;
      --warning: #D97706;
      --warning-subtle: #FFFBEB;
      --purple: #7C3AED;
      --purple-subtle: #F5F3FF;
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

    /* Quick Filter & Search Panel */
    .filter-panel {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 20px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    }
    .filter-top-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-input {
      flex: 1;
      min-width: 240px;
      background: #FAF8F5;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 13px;
      outline: none;
      font-family: var(--font-sans);
    }
    .search-input:focus {
      border-color: #B45309;
      background: #FFFFFF;
      box-shadow: 0 0 0 3px rgba(180,83,9,0.1);
    }
    .filter-controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 155px;
      flex: 1;
    }
    .filter-group label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .filter-select {
      background: #FAF8F5;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      font-family: var(--font-sans);
      color: var(--text);
      outline: none;
      cursor: pointer;
    }
    .filter-select:focus {
      border-color: var(--accent);
      background: #FFFFFF;
    }
    .filter-bottom-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      font-size: 12px;
    }
    .filter-toggles {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
    }
    .filter-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: #44403C;
      font-weight: 500;
      user-select: none;
    }
    .filter-checkbox input {
      accent-color: var(--accent);
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    .filter-status-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .match-counter {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      background: var(--accent-subtle);
      color: var(--accent);
      border: 1px solid #BFDBFE;
    }
    .btn-filter-mini {
      background: #FAF8F5;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      color: #44403C;
    }
    .btn-filter-mini:hover {
      background: #F1F5F9;
      border-color: var(--border-dark);
    }
    .family-pill {
      font-size: 10px;
      font-weight: 600;
      background: #F1F5F9;
      color: #475569;
      border: 1px solid #CBD5E1;
      padding: 2px 7px;
      border-radius: 4px;
    }
    .empty-filter-state {
      display: none;
      text-align: center;
      padding: 40px 24px;
      background: var(--card-bg);
      border: 1px dashed var(--border-dark);
      border-radius: 16px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }
    .table-card-header { cursor: pointer; }
    .table-card.collapsed .table-card-body { display: none; }
    .table-card.collapsed .collapse-chevron { transform: rotate(-90deg); display: inline-block; }

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

    /* Fiche Par Table (Section 1) */
    .fiche-box {
      margin: 16px 24px;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: var(--card-bg);
    }
    .fiche-box-title {
      font-size: 13px;
      font-weight: 700;
      color: #D97706;
      padding: 10px 24px;
      letter-spacing: -0.01em;
      border-bottom: 1px solid var(--border);
      background: rgba(217, 119, 6, 0.05);
    }
    .fiche-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .fiche-table th {
      padding: 8px 18px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 700;
      text-align: left;
      background: #F8FAFC;
      color: #475569;
    }
    .fiche-table th.fiche-th-label {
      width: 260px;
      border-right: 1px solid var(--border);
    }
    .fiche-table td {
      padding: 9px 18px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      vertical-align: middle;
      line-height: 1.4;
    }
    .fiche-table tr:last-child td {
      border-bottom: none;
    }
    .fiche-label {
      width: 260px;
      font-weight: 700;
      color: #1C1917;
      background: rgba(0, 0, 0, 0.02);
      border-right: 1px solid var(--border);
    }
    .fiche-value {
      color: #44403C;
      word-break: break-word;
    }
    .dark-theme .fiche-label {
      color: #FAF6F0;
      background: rgba(255, 255, 255, 0.02);
    }
    .dark-theme .fiche-value {
      color: #D6D3D1;
    }
    .dark-theme .fiche-box-title {
      background: rgba(217, 119, 6, 0.12);
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
    /* Badges */
    .badges-row { display: flex; gap: 4px; align-items: center; overflow: hidden; }
    .badge {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 3px;
      display: inline-block;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .badge-pk { background: #FEF3C7; color: #B45309; border: 1px solid #FCD34D; }
    .badge-fk { background: #EDE9FE; color: #6D28D9; border: 1px solid #C4B5FD; }
    .badge-geom { background: #ECFDF5; color: #047857; border: 1px solid #6EE7B7; }
    .badge-postgis { background: #047857; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
    
    .type-badge {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: #1E293B;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .nullable-tag {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 3px;
      display: inline-block;
    }
    .tag-null { color: var(--text-subtle); background: transparent; }
    .tag-notnull { color: #DC2626; background: #FEF2F2; border: 1px solid #FCA5A5; }

    .cardinality-chip {
      display: inline-block;
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: var(--text);
    }

    .font-mono { font-family: var(--font-mono); }
    .font-bold { font-weight: 700; }
    .text-center { text-align: center; }
    .text-muted { color: var(--text-muted); }
    .text-subtle { color: var(--text-subtle); }
    .text-accent { color: var(--accent); }
    .text-success { color: var(--success); }
    .text-truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
      .header-actions, .filter-panel { display: none !important; }
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

    <!-- Advanced Multi-Criteria Search & Filter Panel -->
    <div class="filter-panel" id="search-filter-panel">
      <div class="filter-top-row">
        <input type="text" class="search-input" id="tableFilter" placeholder="${escapeHtml(i18n.searchPlaceholder)}" oninput="filterReport()">
        <span class="match-counter" id="matchCounter">${allTables.length} / ${allTables.length} ${isFr ? 'tables' : 'tables'}</span>
        <button type="button" class="btn-filter-mini" onclick="toggleAllCards(true)">${isFr ? 'Tout déplier' : 'Expand All'}</button>
        <button type="button" class="btn-filter-mini" onclick="toggleAllCards(false)">${isFr ? 'Tout replier' : 'Collapse All'}</button>
        <button type="button" class="btn-filter-mini" onclick="resetFilters()">${isFr ? 'Réinitialiser' : 'Reset'}</button>
      </div>

      <div class="filter-controls-row">
        <div class="filter-group">
          <label for="filterSchema">${isFr ? 'Schéma' : 'Schema'}</label>
          <select id="filterSchema" class="filter-select" onchange="filterReport()">
            <option value="all">${isFr ? `Tous les schémas (${uniqueSchemas.length})` : `All Schemas (${uniqueSchemas.length})`}</option>
            ${uniqueSchemas.map(s => `<option value="${escapeHtml(s.toLowerCase())}">${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>

        <div class="filter-group">
          <label for="filterFamily">${isFr ? 'Service / Groupe (Commentaire)' : 'Service / Group (Comment)'}</label>
          <select id="filterFamily" class="filter-select" onchange="filterReport()">
            <option value="all">${isFr ? `Tous les services/groupes (${uniqueFamilies.length})` : `All Services/Groups (${uniqueFamilies.length})`}</option>
            ${uniqueFamilies.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
          </select>
        </div>

        <div class="filter-group">
          <label for="filterScope">${isFr ? 'Classification / Nature' : 'Table Scope'}</label>
          <select id="filterScope" class="filter-select" onchange="filterReport()">
            <option value="all">${isFr ? 'Toutes les tables' : 'All Tables'}</option>
            <option value="business">${isFr ? 'Tables métiers uniquement' : 'Business Tables Only'}</option>
            <option value="spatial">${isFr ? 'Couches spatiales (PostGIS)' : 'Spatial Layers (PostGIS)'}</option>
            <option value="tabular">${isFr ? 'Tables tabulaires uniquement' : 'Tabular Tables Only'}</option>
            <option value="system">${isFr ? 'Tables techniques / système' : 'Technical / System Tables'}</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filterColType">${isFr ? 'Type de champ PostgreSQL' : 'PostgreSQL Field Type'}</label>
          <select id="filterColType" class="filter-select" onchange="filterReport()">
            <option value="all">${isFr ? 'Tous les types' : 'All Types'}</option>
            <option value="Spatial (PostGIS)">Spatial (geometry / geography)</option>
            <option value="Numeric">${isFr ? 'Numérique (int, numeric, double)' : 'Numeric (int, numeric, double)'}</option>
            <option value="Text / String">${isFr ? 'Texte (varchar, text)' : 'Text (varchar, text)'}</option>
            <option value="Temporal (Date/Time)">${isFr ? 'Temporel (date, timestamp)' : 'Temporal (date, timestamp)'}</option>
            <option value="Boolean">${isFr ? 'Booléen (boolean)' : 'Boolean'}</option>
            <option value="Special (JSON/UUID)">${isFr ? 'Spécial (jsonb, uuid, bytea)' : 'Special (jsonb, uuid, bytea)'}</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filterConstraint">${isFr ? 'Contraintes & Clés' : 'Keys & Constraints'}</label>
          <select id="filterConstraint" class="filter-select" onchange="filterReport()">
            <option value="all">${isFr ? 'Toutes les colonnes' : 'All Columns'}</option>
            <option value="pk">${isFr ? 'Clés Primaires (PK)' : 'Primary Keys (PK)'}</option>
            <option value="fk">${isFr ? 'Clés Étrangères (FK)' : 'Foreign Keys (FK)'}</option>
            <option value="notnull">${isFr ? 'Obligatoires (NOT NULL)' : 'Required (NOT NULL)'}</option>
          </select>
        </div>
      </div>

      <div class="filter-bottom-row">
        <div class="filter-toggles">
          <label class="filter-checkbox">
            <input type="checkbox" id="filterHideEmpty" onchange="filterReport()">
            <span>${isFr ? 'Masquer les tables vides (0 enregistrement)' : 'Hide empty tables (0 rows)'}</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filterMatchingColsOnly" onchange="filterReport()">
            <span>${isFr ? 'Afficher uniquement les champs correspondants lors du filtrage' : 'Show matching columns only when filtering'}</span>
          </label>
        </div>
        <div class="filter-status-actions">
          <span class="text-muted" id="colMatchSummary"></span>
        </div>
      </div>
    </div>

    <div class="empty-filter-state" id="emptyFilterState">
      <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">
        ${isFr ? 'Aucune table ou colonne ne correspond aux critères sélectionnés.' : 'No tables or columns match the selected filters.'}
      </p>
      <button type="button" class="btn-action" onclick="resetFilters()">
        ${isFr ? 'Réinitialiser tous les filtres' : 'Reset all filters'}
      </button>
    </div>

    <!-- Tables List -->
    <div id="tablesContainer">
      ${tablesHtml}
    </div>
  </div>

  <script>
    function toggleCardBody(headerEl) {
      const card = headerEl.closest('.table-card');
      if (card) card.classList.toggle('collapsed');
    }

    function toggleAllCards(expand) {
      document.querySelectorAll('.table-card[id^="tbl-"]').forEach(card => {
        if (expand) card.classList.remove('collapsed');
        else card.classList.add('collapsed');
      });
    }

    function resetFilters() {
      document.getElementById('tableFilter').value = '';
      document.getElementById('filterSchema').value = 'all';
      document.getElementById('filterFamily').value = 'all';
      document.getElementById('filterScope').value = 'all';
      document.getElementById('filterColType').value = 'all';
      document.getElementById('filterConstraint').value = 'all';
      document.getElementById('filterHideEmpty').checked = false;
      document.getElementById('filterMatchingColsOnly').checked = false;
      filterReport();
    }

    function filterReport() {
      const q = (document.getElementById('tableFilter').value || '').toLowerCase().trim();
      const schemaVal = document.getElementById('filterSchema').value;
      const familyVal = document.getElementById('filterFamily').value;
      const scopeVal = document.getElementById('filterScope').value;
      const colTypeVal = document.getElementById('filterColType').value;
      const constraintVal = document.getElementById('filterConstraint').value;
      const hideEmpty = document.getElementById('filterHideEmpty').checked;
      const matchingColsOnly = document.getElementById('filterMatchingColsOnly').checked;

      const cards = document.querySelectorAll('.table-card[id^="tbl-"]');
      const totalTables = cards.length;
      let visibleTables = 0;
      let visibleCols = 0;

      const hasColFilter = Boolean(q || colTypeVal !== 'all' || constraintVal !== 'all');

      cards.forEach(card => {
        const cSchema = card.getAttribute('data-schema') || '';
        const cFamily = card.getAttribute('data-family') || '';
        const cSpatial = card.getAttribute('data-spatial') === '1';
        const cBiz = card.getAttribute('data-business') === '1';
        const cRows = parseInt(card.getAttribute('data-rows') || '0', 10);
        const cComment = card.getAttribute('data-comment') || '';
        const tableName = (card.querySelector('h3.table-name')?.textContent || '').toLowerCase();

        // Table-level filters
        if (schemaVal !== 'all' && cSchema !== schemaVal) { card.style.display = 'none'; return; }
        if (familyVal !== 'all' && cFamily !== familyVal) { card.style.display = 'none'; return; }
        if (scopeVal === 'business' && !cBiz) { card.style.display = 'none'; return; }
        if (scopeVal === 'spatial' && !cSpatial) { card.style.display = 'none'; return; }
        if (scopeVal === 'tabular' && cSpatial) { card.style.display = 'none'; return; }
        if (scopeVal === 'system' && cBiz) { card.style.display = 'none'; return; }
        if (hideEmpty && cRows <= 0) { card.style.display = 'none'; return; }

        const tableTextMatch = !q || tableName.includes(q) || cComment.includes(q) || cFamily.toLowerCase().includes(q) || cSchema.includes(q);
        const rows = card.querySelectorAll('.col-row');
        let matchingRowsInCard = 0;

        rows.forEach(r => {
          const colName = (r.querySelector('.col-name')?.textContent || '').toLowerCase();
          const colType = (r.querySelector('.type-badge')?.textContent || '').toLowerCase();
          const colCat = r.getAttribute('data-category') || '';
          const isPk = r.getAttribute('data-pk') === '1';
          const isFk = r.getAttribute('data-fk') === '1';
          const isNotNull = r.getAttribute('data-notnull') === '1';
          const colComment = r.getAttribute('data-comment') || '';
          const fkTarget = r.getAttribute('data-fktarget') || '';

          const matchesType = colTypeVal === 'all' || colCat === colTypeVal;
          const matchesConstraint =
            constraintVal === 'all' ||
            (constraintVal === 'pk' && isPk) ||
            (constraintVal === 'fk' && isFk) ||
            (constraintVal === 'notnull' && isNotNull);
          const matchesQuery =
            !q ||
            colName.includes(q) ||
            colType.includes(q) ||
            colComment.includes(q) ||
            fkTarget.includes(q);

          const isColMatch = matchesType && matchesConstraint && matchesQuery;
          if (isColMatch) matchingRowsInCard++;

          if (!hasColFilter) {
            r.style.display = '';
          } else if (matchingColsOnly) {
            r.style.display = isColMatch ? '' : 'none';
          } else if (colTypeVal !== 'all' || constraintVal !== 'all') {
            r.style.display = isColMatch ? '' : 'none';
          } else {
            // Only text query active and table header didn't match -> filter rows
            r.style.display = tableTextMatch ? '' : (isColMatch ? '' : 'none');
          }
        });

        const colCriteriaRequired = colTypeVal !== 'all' || constraintVal !== 'all';
        const showCard = colCriteriaRequired
          ? (matchingRowsInCard > 0 && (tableTextMatch || matchingRowsInCard > 0))
          : (tableTextMatch || matchingRowsInCard > 0);

        if (showCard) {
          card.style.display = '';
          visibleTables++;
          rows.forEach(r => { if (r.style.display !== 'none') visibleCols++; });
        } else {
          card.style.display = 'none';
        }
      });

      const counterEl = document.getElementById('matchCounter');
      if (counterEl) {
        counterEl.textContent = visibleTables + ' / ' + totalTables + ' ${isFr ? 'tables' : 'tables'}';
      }
      const colSummaryEl = document.getElementById('colMatchSummary');
      if (colSummaryEl) {
        colSummaryEl.textContent = visibleCols + ' ${isFr ? 'champs affichés' : 'fields visible'}';
      }
      const emptyEl = document.getElementById('emptyFilterState');
      if (emptyEl) {
        emptyEl.style.display = visibleTables === 0 ? 'block' : 'none';
      }
    }

    document.addEventListener('DOMContentLoaded', () => { filterReport(); });
  </script>
</body>
</html>`;
}

/**
 * Generates an interactive, standalone HTML document containing the
 * Modèle Physique de Données (MPD) / Physical Data Model ERD (MCD).
 * Filters out system/technical tables by default (`businessOnly = true`) so the MCD
 * displays strictly business tables ("tables métiers") without visual overload.
 */
export function generatePhysicalDataModelHtml(
  schema: PostgresDatabaseSchema,
  lang: 'fr' | 'en' = 'fr',
  options: { businessOnly?: boolean } = { businessOnly: true }
): string {
  const isFr = lang === 'fr';
  const businessOnly = options.businessOnly !== false;
  const title = isFr 
    ? `Modèle Physique & Conceptuel (MCD/MPD) - PostgreSQL ${schema.databaseName}`
    : `Physical & Conceptual Data Model (MCD/MPD) - PostgreSQL ${schema.databaseName}`;

  const allTables = schema.tables || [];
  const rawTables = businessOnly ? allTables.filter(isBusinessTable) : allTables;
  const includedTableNames = new Set(rawTables.map(t => t.name));
  const filteredRelationships = (schema.relationships || []).filter(
    r => includedTableNames.has(r.sourceTable) && includedTableNames.has(r.targetTable)
  );
  const hiddenTechnicalCount = allTables.length - rawTables.length;

  const defaultCardWidth = 340;
  const colGap = 130;
  const rowGap = 50;
  const numCols = Math.min(Math.max(Math.ceil(Math.sqrt(Math.max(rawTables.length, 1) * 1.5)), 2), 4);
  const colHeights = new Array(numCols).fill(40);

  const tablesJson = JSON.stringify(rawTables.map((t, idx) => {
    let minCol = 0;
    for (let c = 1; c < numCols; c++) {
      if (colHeights[c] < colHeights[minCol]) minCol = c;
    }
    const cols = t.columns || [];
    const estHeight = 46 + (cols.length * 28) + 20;
    const x = 50 + minCol * (defaultCardWidth + colGap);
    const y = colHeights[minCol];
    colHeights[minCol] += estHeight + rowGap;

    return {
      name: t.name || `table_${idx}`,
      schema: t.schema || 'public',
      isSpatial: !!t.isSpatial,
      estimatedRows: t.estimatedRows || 0,
      width: defaultCardWidth,
      columns: cols.map(c => ({
        name: c.name || 'unnamed_col',
        dataType: normalizeToPostgresType(c.dataType || 'text'),
        isPrimaryKey: !!c.isPrimaryKey,
        isForeignKey: !!c.isForeignKey,
        foreignKeyTarget: c.foreignKeyTarget,
        isNullable: c.isNullable !== false,
        isGeometry: !!c.isGeometry,
        srid: c.srid,
      })),
      x,
      y,
    };
  }));

  const relsJson = JSON.stringify(filteredRelationships.map((r, rIdx) => ({
    id: r.id ? `${r.id}_${rIdx}` : `rel_${r.sourceTable}_${r.sourceColumn}_${rIdx}`,
    constraintName: r.constraintName || `fk_${r.sourceTable}_${r.sourceColumn}_${rIdx}`,
    sourceTable: r.sourceTable || '',
    sourceColumn: r.sourceColumn || '',
    targetTable: r.targetTable || '',
    targetColumn: r.targetColumn || '',
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090D16;
      --board-bg: #0B1120;
      --card-bg: #111827;
      --card-border: #1F2937;
      --header-bg: #1A2234;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --accent: #3B82F6;
      --pk-color: #F59E0B;
      --fk-color: #A855F7;
      --geom-color: #10B981;
      --line-color: #3B82F6;
      --grid-dot: #1E293B;
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    body.light-theme {
      --bg: #F8FAFC;
      --board-bg: #F1F5F9;
      --card-bg: #FFFFFF;
      --card-border: #CBD5E1;
      --header-bg: #F8FAFC;
      --text: #0F172A;
      --text-muted: #64748B;
      --accent: #2563EB;
      --pk-color: #D97706;
      --fk-color: #7C3AED;
      --geom-color: #059669;
      --line-color: #2563EB;
      --grid-dot: #CBD5E1;
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
      -webkit-font-smoothing: antialiased;
    }

    .font-mono { font-family: var(--font-mono); }

    /* Top navigation bar */
    header.mpd-navbar {
      height: 56px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      z-index: 50;
      position: relative;
    }

    .brand-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .badge-mpd {
      background: var(--header-bg);
      color: var(--accent);
      border: 1px solid var(--card-border);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    h1.db-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .db-meta {
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      white-space: nowrap;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Width control group */
    .width-ctrl-group {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--header-bg);
      border: 1px solid var(--card-border);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
    }
    .width-label {
      font-weight: 600;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .width-slider {
      width: 75px;
      cursor: pointer;
    }
    .width-presets {
      display: flex;
      gap: 2px;
      align-items: center;
    }
    .btn-preset {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
      padding: 2px 5px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-preset:hover, .btn-preset.active {
      background: var(--accent);
      color: #FFFFFF;
      border-color: var(--accent);
    }

    button.btn-ctrl {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
      font-family: var(--font-sans);
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
      width: 340px;
      min-width: 240px;
      max-width: 850px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      z-index: 20;
      cursor: default;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .table-entity:hover, .table-entity.selected {
      border-color: var(--accent);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 30;
    }
    .table-entity.highlight-rel {
      border-color: #3B82F6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    }

    /* Draggable Right-Edge Resize Handle on Table Cards */
    .card-resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: 100%;
      cursor: ew-resize;
      z-index: 25;
      background: transparent;
      transition: background 0.15s ease;
    }
    .card-resize-handle:hover, .table-entity.resizing .card-resize-handle {
      background: rgba(59, 130, 246, 0.45);
    }

    .entity-header {
      background: var(--header-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 9px 12px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      overflow: hidden;
      min-width: 0;
    }
    .entity-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
      flex: 1;
    }
    .schema-tag {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(120, 113, 108, 0.25);
      padding: 2px 5px;
      border-radius: 3px;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .entity-name {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .entity-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .badge-postgis {
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
      background: rgba(16, 185, 129, 0.2);
      color: var(--geom-color);
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .badge-rows {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    .entity-columns {
      padding: 4px 0;
      max-height: 480px;
      overflow-y: auto;
      box-sizing: border-box;
      width: 100%;
    }
    .column-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 12px;
      font-size: 11px;
      border-bottom: 1px solid rgba(120, 113, 108, 0.08);
      position: relative;
      box-sizing: border-box;
      width: 100%;
      overflow: hidden;
    }
    .column-row:last-child {
      border-bottom: none;
    }
    .column-row:hover {
      background: rgba(59, 130, 246, 0.06);
    }

    .col-left {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      flex: 1;
      min-width: 0;
    }
    .tag-key {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
      line-height: 1.2;
      flex-shrink: 0;
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
      flex: 1;
      min-width: 0;
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
      flex-shrink: 0;
      max-width: 50%;
      overflow: hidden;
    }
    .col-type {
      color: var(--text-muted);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .col-nn {
      font-size: 8px;
      font-weight: 800;
      color: #EF4444;
      background: rgba(239, 68, 68, 0.15);
      padding: 1px 3px;
      border-radius: 2px;
      flex-shrink: 0;
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
      <span class="badge-mpd">${isFr ? 'MCD / MPD (Tables Métiers)' : 'MCD / ERD (Business Tables)'}</span>
      <h1 class="db-title">${escapeHtml(schema.databaseName)}</h1>
      <span class="db-meta">(${rawTables.length} ${isFr ? 'tables métiers' : 'business tables'}${hiddenTechnicalCount > 0 ? (isFr ? ` • ${hiddenTechnicalCount} tech. masquées` : ` • ${hiddenTechnicalCount} tech. hidden`) : ''} &bull; ${filteredRelationships.length} ${isFr ? 'relations' : 'relationships'})</span>
    </div>

    <div class="nav-actions">
      <!-- Table Width Controls -->
      <div class="width-ctrl-group">
        <span class="width-label">${isFr ? 'Largeur :' : 'Width :'}</span>
        <input 
          type="range" 
          id="global-width-slider" 
          class="width-slider" 
          min="260" 
          max="650" 
          value="340" 
          oninput="setGlobalTableWidth(this.value)" 
          title="${isFr ? 'Ajuster la largeur des tables' : 'Adjust table width'}" 
        />
        <span id="global-width-val" class="font-mono">340px</span>
        <div class="width-presets">
          <button class="btn-preset" data-w="280" onclick="setGlobalTableWidth(280)">280</button>
          <button class="btn-preset active" data-w="340" onclick="setGlobalTableWidth(340)">340</button>
          <button class="btn-preset" data-w="440" onclick="setGlobalTableWidth(440)">440</button>
          <button class="btn-preset" data-w="560" onclick="setGlobalTableWidth(560)">560</button>
          <button class="btn-preset" onclick="autoFitAllWidths()" title="${isFr ? 'Ajuster automatiquement à la longueur des colonnes' : 'Auto-fit width to columns'}">Auto</button>
        </div>
      </div>

      <!-- Auto Layout (No Overlap) Button -->
      <button class="btn-ctrl" onclick="autoLayoutNoOverlap()" title="${isFr ? 'Réorganiser proprement toutes les tables sans aucun chevauchement' : 'Pack tables neatly with zero overlap'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <span>${isFr ? 'Auto-Disposition' : 'Auto-Layout'}</span>
      </button>

      <button class="btn-ctrl" onclick="toggleTheme()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        <span id="theme-text">${isFr ? 'Thème' : 'Theme'}</span>
      </button>

      <button class="btn-ctrl" onclick="resetZoom()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>
        <span>${isFr ? 'Centrer' : 'Reset View'}</span>
      </button>

      <button class="btn-ctrl" onclick="window.print()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
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
        card.style.width = (table.width || 340) + 'px';

        const colsHtml = table.columns.map(c => {
          const pkBadge = c.isPrimaryKey ? '<span class="tag-key tag-pk">PK</span>' : '';
          const fkBadge = c.isForeignKey ? '<span class="tag-key tag-fk">FK</span>' : '';
          const nnBadge = !c.isNullable ? '<span class="col-nn">NN</span>' : '';

          return \`
            <div class="column-row" id="col-\${table.name}-\${c.name}">
              <div class="col-left">
                \${pkBadge}
                \${fkBadge}
                <span class="col-name \${c.isPrimaryKey ? 'pk-col' : ''}" title="\${c.name}">\${c.name}</span>
              </div>
              <div class="col-right">
                <span class="col-type" title="\${c.dataType}">\${c.dataType}</span>
                \${nnBadge}
              </div>
            </div>
          \`;
        }).join('');

        card.innerHTML = \`
          <div class="entity-header">
            <div class="entity-header-left">
              <span class="schema-tag">\${table.schema}</span>
              <span class="entity-name" title="\${table.name}">\${table.name}</span>
            </div>
            <div class="entity-badges">
              \${table.isSpatial ? '<span class="badge-postgis">POSTGIS</span>' : ''}
              <span class="badge-rows">\${(table.estimatedRows || 0).toLocaleString()} r.</span>
            </div>
          </div>
          <div class="entity-columns">
            \${colsHtml}
          </div>
          <div class="card-resize-handle" title="${isFr ? 'Glisser pour ajuster la largeur' : 'Drag to resize width'}"></div>
        \`;

        // Make table header draggable
        const header = card.querySelector('.entity-header');
        initTableDrag(header, table, card);

        // Make card right edge resizable
        const resizeHandle = card.querySelector('.card-resize-handle');
        initTableResize(resizeHandle, table, card);

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

        const sWidth = sourceTable.width || sourceCard.offsetWidth || 340;
        const sHeight = sourceCard.offsetHeight || 220;
        const tWidth = targetTable.width || targetCard.offsetWidth || 340;
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
        sText.setAttribute('class', 'cardinality-text font-mono');
        sText.style.fill = 'var(--accent)';
        sText.textContent = rel.sourceCardinality;
        linesGroup.appendChild(sText);

        // Target cardinality text (e.g. 1..1)
        const tText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tText.setAttribute('x', tAnchorSide === 'left' ? tX - 18 : tX + 18);
        tText.setAttribute('y', tY - 8);
        tText.setAttribute('class', 'cardinality-text font-mono');
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

    // Draggable card right-edge width resize
    function initTableResize(handle, table, card) {
      let isResizing = false;
      let startX, startWidth;

      handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = table.width || card.offsetWidth || 340;
        card.classList.add('resizing');
        card.style.zIndex = '55';
        document.body.style.cursor = 'ew-resize';
        e.stopPropagation();
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dx = (e.clientX - startX) / scale;
        const newWidth = Math.min(Math.max(startWidth + dx, 240), 850);
        table.width = Math.round(newWidth);
        card.style.width = table.width + 'px';
        renderConnections();
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          card.classList.remove('resizing');
          document.body.style.cursor = '';
          card.style.zIndex = '20';
        }
      });
    }

    // Set global width across all tables
    function setGlobalTableWidth(w) {
      const width = parseInt(w, 10);
      const slider = document.getElementById('global-width-slider');
      const label = document.getElementById('global-width-val');
      if (slider) slider.value = width;
      if (label) label.textContent = width + 'px';

      document.querySelectorAll('.btn-preset').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-w'), 10) === width);
      });

      tablesData.forEach(table => {
        table.width = width;
        const card = document.getElementById('entity-' + table.name);
        if (card) card.style.width = width + 'px';
      });
      renderConnections();
    }

    // Automatically fit each table's width to its longest column text
    function autoFitAllWidths() {
      tablesData.forEach(table => {
        let maxChars = table.name.length + 8;
        table.columns.forEach(c => {
          const chars = (c.name || '').length + (c.dataType || '').length + 8;
          if (chars > maxChars) maxChars = chars;
        });
        const fitted = Math.min(Math.max(maxChars * 8.5 + 46, 270), 800);
        table.width = Math.round(fitted);
        const card = document.getElementById('entity-' + table.name);
        if (card) card.style.width = table.width + 'px';
      });
      renderConnections();
    }

    // Reorganize all tables into non-overlapping columns
    function autoLayoutNoOverlap() {
      const colGap = 130;
      const rowGap = 50;
      const numCols = Math.min(Math.max(Math.ceil(Math.sqrt(tablesData.length * 1.5)), 2), 4);
      const colHeights = new Array(numCols).fill(40);

      tablesData.forEach(table => {
        let minCol = 0;
        for (let c = 1; c < numCols; c++) {
          if (colHeights[c] < colHeights[minCol]) minCol = c;
        }

        const card = document.getElementById('entity-' + table.name);
        const w = table.width || (card ? card.offsetWidth : 340);
        const h = card ? (card.offsetHeight || (46 + table.columns.length * 28 + 20)) : (46 + table.columns.length * 28 + 20);

        table.x = 50 + minCol * (w + colGap);
        table.y = colHeights[minCol];
        colHeights[minCol] += h + rowGap;

        if (card) {
          card.style.left = table.x + 'px';
          card.style.top = table.y + 'px';
        }
      });
      renderConnections();
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
