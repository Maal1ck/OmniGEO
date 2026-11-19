/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialDataset } from '../types/gis';

export type EnrichmentScriptEngine = 'arcpy' | 'sql';

export type SqlDialect = 'postgresql' | 'sqlserver' | 'oracle' | 'sqlite';

export type SqlGenerationMode = 'alter_only' | 'alter_and_update' | 'standalone_embedded';

export type ArcpyGenerationMode = 'add_fields_only' | 'add_and_update_cursor' | 'join_field' | 'standalone_embedded';

export type EnrichmentFieldType =
  | 'string'
  | 'smallint'
  | 'integer'
  | 'bigint'
  | 'double'
  | 'date'
  | 'timestamp'
  | 'boolean';

export type NamingConvention = 'keep' | 'snake_case' | 'lowercase' | 'UPPERCASE';

export type OverwritePolicy = 'overwrite' | 'fill_null_only';

export interface EnrichmentColumnSpec {
  sourceName: string;
  targetName: string;
  alias: string;
  selected: boolean;
  existsInTarget: boolean;
  inferredType: EnrichmentFieldType;
  targetType: EnrichmentFieldType;
  length: number;
  nullable: boolean;
  defaultValue: string;
  maxObservedLength: number;
  nonNullCount: number;
  totalRows: number;
  sampleValues: string[];
}

export interface EnrichmentScriptConfig {
  engine: EnrichmentScriptEngine;
  // Source & Target metadata
  sourceDataset: SpatialDataset;
  targetSchema: string;
  targetTableName: string;
  sourceSchema: string;
  sourceTableName: string;
  // ArcPy paths
  arcpyTargetPath: string;
  arcpySourcePath: string;
  arcpyMode: ArcpyGenerationMode;
  arcpyUseEditSession: boolean;
  arcpyAddMessages: boolean;
  // SQL options
  sqlDialect: SqlDialect;
  sqlMode: SqlGenerationMode;
  sqlWrapTransaction: boolean;
  sqlIncludeComments: boolean;
  // Join & update behavior
  targetJoinKey: string;
  sourceJoinKey: string;
  caseInsensitiveJoin: boolean;
  overwritePolicy: OverwritePolicy;
  embeddedRowLimit: number; // 0 = all rows
  // Columns
  columns: EnrichmentColumnSpec[];
}

export interface GeneratedScriptResult {
  code: string;
  fileExtension: 'py' | 'sql';
  suggestedFileName: string;
  selectedColumnsCount: number;
  newColumnsCount: number;
  existingColumnsCount: number;
  lineCount: number;
  warnings: string[];
}

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Formats a field name according to a chosen naming convention and optional prefix.
 */
export function formatColumnName(
  rawName: string,
  convention: NamingConvention,
  prefix: string = ''
): string {
  const cleanPrefix = prefix.trim();
  const base = rawName.trim();
  let formatted = base;

  if (convention === 'snake_case') {
    formatted = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  } else if (convention === 'lowercase') {
    formatted = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  } else if (convention === 'UPPERCASE') {
    formatted = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  if (!formatted) formatted = 'col_field';
  if (cleanPrefix && !formatted.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    formatted = `${cleanPrefix}${formatted}`;
  }
  return formatted;
}

/**
 * Sanitizes an identifier for ArcPy / Geodatabase field names.
 */
export function sanitizeArcpyFieldName(name: string): string {
  let clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!clean) clean = 'field_col';
  if (/^[0-9]/.test(clean)) clean = `f_${clean}`;
  return clean.slice(0, 64);
}

/**
 * Sanitizes a generic SQL identifier (preserving readability while removing unsafe characters).
 */
export function sanitizeSqlName(name: string): string {
  const clean = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || 'field_col';
}

function roundUpStringLength(maxObserved: number): number {
  if (maxObserved <= 0) return 100;
  if (maxObserved <= 25) return 50;
  if (maxObserved <= 60) return 100;
  if (maxObserved <= 180) return 255;
  if (maxObserved <= 400) return 500;
  if (maxObserved <= 800) return 1000;
  if (maxObserved <= 1800) return 2000;
  return Math.min(4000, Math.ceil(maxObserved / 500) * 500);
}

/**
 * Parses a pasted list of existing target column names (comma, semicolon, tab, or newline separated).
 */
export function parseExistingTargetColumns(rawText: string): Set<string> {
  const set = new Set<string>();
  if (!rawText.trim()) return set;
  const tokens = rawText.split(/[\r\n,;\t]+/);
  for (const tok of tokens) {
    const cleaned = tok.trim().replace(/^["'`[\]]+|["'`[\]]+$/g, '').toLowerCase();
    if (cleaned) set.add(cleaned);
  }
  return set;
}

/**
 * Profiles every attribute field of a workspace dataset and optionally diffs against target columns.
 */
export function profileSourceColumns(
  sourceDataset: SpatialDataset,
  existingTargetColumnNames: Set<string>,
  convention: NamingConvention = 'keep',
  prefix: string = ''
): EnrichmentColumnSpec[] {
  const features = sourceDataset.geojson?.features || [];
  const totalRows = features.length;

  // Gather union of declared schema fields + actual feature keys
  const orderedFieldNames: string[] = [];
  const seen = new Set<string>();
  for (const f of sourceDataset.fields) {
    if (!seen.has(f.name)) {
      seen.add(f.name);
      orderedFieldNames.push(f.name);
    }
  }
  for (let i = 0; i < Math.min(features.length, 200); i++) {
    const props = features[i]?.properties || {};
    for (const k of Object.keys(props)) {
      if (!seen.has(k)) {
        seen.add(k);
        orderedFieldNames.push(k);
      }
    }
  }

  return orderedFieldNames.map((colName) => {
    let nonNullCount = 0;
    let maxObservedLength = 0;
    let sawNonNumericText = false;
    let sawDecimal = false;
    let sawBoolean = false;
    let sawNonBoolean = false;
    let sawDateOnly = false;
    let sawTimestamp = false;
    let sawNonDate = false;
    let minNum = Infinity;
    let maxNum = -Infinity;
    const samples: string[] = [];

    for (let i = 0; i < features.length; i++) {
      const raw = features[i]?.properties?.[colName];
      if (raw === null || raw === undefined || raw === '') continue;

      nonNullCount++;

      if (raw instanceof Date) {
        sawTimestamp = true;
        sawNonNumericText = true;
        sawNonBoolean = true;
        const iso = raw.toISOString();
        if (samples.length < 3) samples.push(iso);
        if (iso.length > maxObservedLength) maxObservedLength = iso.length;
        continue;
      }

      if (typeof raw === 'boolean') {
        sawBoolean = true;
        sawNonNumericText = true;
        sawNonDate = true;
        if (samples.length < 3) samples.push(String(raw));
        continue;
      }

      if (typeof raw === 'number' && Number.isFinite(raw)) {
        sawNonBoolean = true;
        sawNonDate = true;
        if (!Number.isInteger(raw)) sawDecimal = true;
        if (raw < minNum) minNum = raw;
        if (raw > maxNum) maxNum = raw;
        const s = String(raw);
        if (s.length > maxObservedLength) maxObservedLength = s.length;
        if (samples.length < 3) samples.push(s);
        continue;
      }

      const strVal = typeof raw === 'object' ? JSON.stringify(raw) : String(raw).trim();
      if (strVal.length > maxObservedLength) maxObservedLength = strVal.length;
      if (samples.length < 3) samples.push(strVal.slice(0, 60));

      // Check date formats
      if (ISO_DATE_ONLY_RE.test(strVal)) {
        sawDateOnly = true;
        sawNonNumericText = true;
        sawNonBoolean = true;
        continue;
      }
      if (ISO_TIMESTAMP_RE.test(strVal)) {
        sawTimestamp = true;
        sawNonNumericText = true;
        sawNonBoolean = true;
        continue;
      }
      sawNonDate = true;

      // Check boolean text
      const low = strVal.toLowerCase();
      if (low === 'true' || low === 'false') {
        sawBoolean = true;
        sawNonNumericText = true;
        continue;
      }
      sawNonBoolean = true;

      // Numeric string check (excluding leading-zero identifiers like "00412")
      const isLeadingZeroCode = /^0\d+$/.test(strVal);
      if (!isLeadingZeroCode && /^-?\d+([.,]\d+)?$/.test(strVal)) {
        const parsedNum = Number(strVal.replace(',', '.'));
        if (Number.isFinite(parsedNum)) {
          if (!Number.isInteger(parsedNum)) sawDecimal = true;
          if (parsedNum < minNum) minNum = parsedNum;
          if (parsedNum > maxNum) maxNum = parsedNum;
          continue;
        }
      }

      sawNonNumericText = true;
    }

    let inferredType: EnrichmentFieldType = 'string';
    if (nonNullCount > 0) {
      if (sawBoolean && !sawNonBoolean) {
        inferredType = 'boolean';
      } else if ((sawTimestamp || sawDateOnly) && !sawNonDate) {
        inferredType = sawTimestamp ? 'timestamp' : 'date';
      } else if (!sawNonNumericText && Number.isFinite(minNum) && Number.isFinite(maxNum)) {
        if (sawDecimal) {
          inferredType = 'double';
        } else if (minNum >= -32768 && maxNum <= 32767) {
          inferredType = 'smallint';
        } else if (minNum >= -2147483648 && maxNum <= 2147483647) {
          inferredType = 'integer';
        } else {
          inferredType = 'bigint';
        }
      } else {
        inferredType = 'string';
      }
    } else {
      // Fallback to dataset declared field type if all rows are null
      const declared = sourceDataset.fields.find((f) => f.name === colName);
      if (declared?.type === 'number') inferredType = 'double';
      else if (declared?.type === 'boolean') inferredType = 'boolean';
      else if (declared?.type === 'date') inferredType = 'date';
      else inferredType = 'string';
    }

    const targetName = formatColumnName(colName, convention, prefix);
    const existsInTarget =
      existingTargetColumnNames.has(colName.toLowerCase()) ||
      existingTargetColumnNames.has(targetName.toLowerCase());

    const isSystemOid = /^(objectid|fid|ogc_fid|shape|shape_length|shape_area|geom|geometry)$/i.test(colName);

    return {
      sourceName: colName,
      targetName,
      alias: colName,
      selected: !existsInTarget && !isSystemOid,
      existsInTarget,
      inferredType,
      targetType: inferredType,
      length: inferredType === 'string' ? roundUpStringLength(maxObservedLength) : 0,
      nullable: true,
      defaultValue: '',
      maxObservedLength,
      nonNullCount,
      totalRows,
      sampleValues: samples,
    };
  });
}

// ============================================================================
// SQL Dialect Helpers & Generator
// ============================================================================

function quoteSqlIdent(ident: string, dialect: SqlDialect): string {
  const clean = ident.trim();
  if (dialect === 'sqlserver') {
    return `[${clean.replace(/\]/g, ']]')}]`;
  }
  return `"${clean.replace(/"/g, '""')}"`;
}

function qualifySqlTable(schema: string, table: string, dialect: SqlDialect): string {
  const s = schema.trim();
  const t = table.trim() || 'target_table';
  if (!s || dialect === 'sqlite') {
    return quoteSqlIdent(t, dialect);
  }
  return `${quoteSqlIdent(s, dialect)}.${quoteSqlIdent(t, dialect)}`;
}

export function mapTypeToSql(
  type: EnrichmentFieldType,
  length: number,
  dialect: SqlDialect
): string {
  const safeLen = Math.max(1, Math.min(4000, Math.round(length || 255)));

  switch (dialect) {
    case 'postgresql':
      switch (type) {
        case 'smallint': return 'SMALLINT';
        case 'integer': return 'INTEGER';
        case 'bigint': return 'BIGINT';
        case 'double': return 'DOUBLE PRECISION';
        case 'date': return 'DATE';
        case 'timestamp': return 'TIMESTAMP WITH TIME ZONE';
        case 'boolean': return 'BOOLEAN';
        case 'string':
        default:
          return safeLen > 1000 ? 'TEXT' : `VARCHAR(${safeLen})`;
      }

    case 'sqlserver':
      switch (type) {
        case 'smallint': return 'SMALLINT';
        case 'integer': return 'INT';
        case 'bigint': return 'BIGINT';
        case 'double': return 'FLOAT';
        case 'date': return 'DATE';
        case 'timestamp': return 'DATETIME2';
        case 'boolean': return 'BIT';
        case 'string':
        default:
          return safeLen > 4000 ? 'NVARCHAR(MAX)' : `NVARCHAR(${safeLen})`;
      }

    case 'oracle':
      switch (type) {
        case 'smallint': return 'NUMBER(5)';
        case 'integer': return 'NUMBER(10)';
        case 'bigint': return 'NUMBER(19)';
        case 'double': return 'BINARY_DOUBLE';
        case 'date': return 'DATE';
        case 'timestamp': return 'TIMESTAMP';
        case 'boolean': return 'NUMBER(1)';
        case 'string':
        default:
          return `VARCHAR2(${Math.min(4000, safeLen)} CHAR)`;
      }

    case 'sqlite':
      switch (type) {
        case 'smallint':
        case 'integer':
        case 'bigint':
        case 'boolean':
          return 'INTEGER';
        case 'double':
          return 'REAL';
        case 'date':
        case 'timestamp':
        case 'string':
        default:
          return 'TEXT';
      }
  }
}

export function mapTypeToArcpy(type: EnrichmentFieldType): {
  fieldType: string;
  usesLength: boolean;
} {
  switch (type) {
    case 'smallint':
      return { fieldType: 'SHORT', usesLength: false };
    case 'integer':
      return { fieldType: 'LONG', usesLength: false };
    case 'bigint':
      return { fieldType: 'DOUBLE', usesLength: false }; // Compatible across ArcGIS Pro 2.x & 3.x (BIGINTEGER requires 3.2+ 64-bit OIDs)
    case 'double':
      return { fieldType: 'DOUBLE', usesLength: false };
    case 'date':
    case 'timestamp':
      return { fieldType: 'DATE', usesLength: false };
    case 'boolean':
      return { fieldType: 'SHORT', usesLength: false };
    case 'string':
    default:
      return { fieldType: 'TEXT', usesLength: true };
  }
}

function escapeSqlValue(raw: any, type: EnrichmentFieldType, dialect: SqlDialect): string {
  if (raw === null || raw === undefined || raw === '') return 'NULL';

  if (type === 'smallint' || type === 'integer' || type === 'bigint' || type === 'double') {
    const num = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(num)) return 'NULL';
    if (type !== 'double') return String(Math.trunc(num));
    return String(num);
  }

  if (type === 'boolean') {
    const truthy = raw === true || raw === 1 || String(raw).trim().toLowerCase() === 'true' || String(raw).trim() === '1';
    if (dialect === 'postgresql') return truthy ? 'TRUE' : 'FALSE';
    return truthy ? '1' : '0';
  }

  if (raw instanceof Date) {
    const iso = raw.toISOString();
    return `'${iso.replace(/'/g, "''")}'`;
  }

  const str = (typeof raw === 'object' ? JSON.stringify(raw) : String(raw)).replace(/'/g, "''");
  if (dialect === 'sqlserver') return `N'${str}'`;
  return `'${str}'`;
}

function formatSqlDefaultClause(col: EnrichmentColumnSpec, dialect: SqlDialect): string {
  if (!col.defaultValue.trim()) return '';
  const lit = escapeSqlValue(col.defaultValue.trim(), col.targetType, dialect);
  if (lit === 'NULL') return '';
  return ` DEFAULT ${lit}`;
}

function buildSqlJoinExpression(
  alias: string,
  colName: string,
  dialect: SqlDialect,
  caseInsensitive: boolean
): string {
  const ref = `${alias}.${quoteSqlIdent(colName, dialect)}`;
  if (!caseInsensitive) return ref;
  if (dialect === 'postgresql') return `LOWER(TRIM(CAST(${ref} AS TEXT)))`;
  if (dialect === 'sqlserver') return `LOWER(LTRIM(RTRIM(CAST(${ref} AS NVARCHAR(4000)))))`;
  if (dialect === 'oracle') return `LOWER(TRIM(TO_CHAR(${ref})))`;
  return `LOWER(TRIM(CAST(${ref} AS TEXT)))`;
}

function buildSqlScript(config: EnrichmentScriptConfig): { code: string; warnings: string[] } {
  const warnings: string[] = [];
  const selectedCols = config.columns.filter((c) => c.selected);
  const dialect = config.sqlDialect;
  const targetQualified = qualifySqlTable(config.targetSchema, config.targetTableName, dialect);
  const sourceQualified = qualifySqlTable(config.sourceSchema, config.sourceTableName, dialect);

  if (selectedCols.length === 0) {
    warnings.push('No columns selected. Select at least one column to generate ALTER / UPDATE statements.');
  }

  const lines: string[] = [];
  lines.push('-- ============================================================================');
  lines.push('-- OmniGeo Schema Evolution & Data Enrichment Script (SQL)');
  lines.push(`-- Dialect        : ${dialect.toUpperCase()}`);
  lines.push(`-- Source Dataset : ${config.sourceDataset.name} (${config.sourceDataset.originalFileName})`);
  lines.push(`-- Target Table   : ${targetQualified}`);
  lines.push(`-- Columns Added  : ${selectedCols.length}`);
  lines.push(`-- Generated At   : ${new Date().toISOString()}`);
  lines.push('-- ============================================================================');
  lines.push('');

  if (config.sqlWrapTransaction) {
    if (dialect === 'sqlserver') {
      lines.push('BEGIN TRANSACTION;');
    } else if (dialect === 'oracle') {
      lines.push('-- Oracle auto-starts transaction on DML; DDL statements auto-commit.');
    } else {
      lines.push('BEGIN;');
    }
    lines.push('');
  }

  // Step 1: ALTER TABLE ADD COLUMN
  lines.push('-- ----------------------------------------------------------------------------');
  lines.push('-- STEP 1: Add missing columns to target table');
  lines.push('-- ----------------------------------------------------------------------------');

  if (selectedCols.length === 0) {
    lines.push('-- (No columns selected)');
  } else if (dialect === 'postgresql') {
    for (const col of selectedCols) {
      const colIdent = quoteSqlIdent(col.targetName, dialect);
      const sqlType = mapTypeToSql(col.targetType, col.length, dialect);
      const defaultClause = formatSqlDefaultClause(col, dialect);
      lines.push(`ALTER TABLE ${targetQualified} ADD COLUMN IF NOT EXISTS ${colIdent} ${sqlType}${defaultClause};`);
    }
    if (config.sqlIncludeComments) {
      lines.push('');
      lines.push('-- Column documentation comments');
      for (const col of selectedCols) {
        const commentText = (col.alias || col.sourceName).replace(/'/g, "''");
        lines.push(
          `COMMENT ON COLUMN ${targetQualified}.${quoteSqlIdent(col.targetName, dialect)} IS '${commentText} (source: ${col.sourceName.replace(/'/g, "''")})';`
        );
      }
    }
  } else if (dialect === 'sqlserver') {
    const schemaClean = (config.targetSchema || 'dbo').replace(/'/g, "''");
    const tableClean = (config.targetTableName || 'target_table').replace(/'/g, "''");
    for (const col of selectedCols) {
      const colIdent = quoteSqlIdent(col.targetName, dialect);
      const colLiteral = col.targetName.replace(/'/g, "''");
      const sqlType = mapTypeToSql(col.targetType, col.length, dialect);
      const defaultClause = formatSqlDefaultClause(col, dialect);
      lines.push(`IF COL_LENGTH(N'${schemaClean}.${tableClean}', N'${colLiteral}') IS NULL`);
      lines.push(`BEGIN`);
      lines.push(`    ALTER TABLE ${targetQualified} ADD ${colIdent} ${sqlType}${defaultClause};`);
      lines.push(`END;`);
    }
  } else if (dialect === 'oracle') {
    lines.push('DECLARE');
    lines.push('    v_cnt NUMBER;');
    lines.push('BEGIN');
    const tableUpper = (config.targetTableName || 'TARGET_TABLE').toUpperCase().replace(/'/g, "''");
    for (const col of selectedCols) {
      const colIdent = quoteSqlIdent(col.targetName, dialect);
      const colUpper = col.targetName.toUpperCase().replace(/'/g, "''");
      const sqlType = mapTypeToSql(col.targetType, col.length, dialect);
      const defaultClause = formatSqlDefaultClause(col, dialect);
      lines.push(`    SELECT COUNT(*) INTO v_cnt FROM user_tab_columns WHERE UPPER(table_name) = '${tableUpper}' AND UPPER(column_name) = '${colUpper}';`);
      lines.push(`    IF v_cnt = 0 THEN`);
      lines.push(`        EXECUTE IMMEDIATE 'ALTER TABLE ${targetQualified} ADD (${colIdent} ${sqlType}${defaultClause})';`);
      lines.push(`    END IF;`);
    }
    lines.push('END;');
    lines.push('/');
    if (config.sqlIncludeComments) {
      lines.push('');
      for (const col of selectedCols) {
        const commentText = (col.alias || col.sourceName).replace(/'/g, "''");
        lines.push(`COMMENT ON COLUMN ${targetQualified}.${quoteSqlIdent(col.targetName, dialect)} IS '${commentText}';`);
      }
    }
  } else {
    // SQLite / GeoPackage
    lines.push('-- Note: SQLite ALTER TABLE ADD COLUMN does not support IF NOT EXISTS; skip columns that already exist.');
    for (const col of selectedCols) {
      const colIdent = quoteSqlIdent(col.targetName, dialect);
      const sqlType = mapTypeToSql(col.targetType, col.length, dialect);
      const defaultClause = formatSqlDefaultClause(col, dialect);
      lines.push(`ALTER TABLE ${targetQualified} ADD COLUMN ${colIdent} ${sqlType}${defaultClause};`);
    }
  }

  // Step 2: Populate columns (UPDATE FROM source table OR embedded staging VALUES)
  if (config.sqlMode === 'alter_and_update' && selectedCols.length > 0) {
    const tKey = config.targetJoinKey.trim() || 'id';
    const sKey = config.sourceJoinKey.trim() || tKey;
    const tExpr = buildSqlJoinExpression('tgt', tKey, dialect, config.caseInsensitiveJoin);
    const sExpr = buildSqlJoinExpression('src', sKey, dialect, config.caseInsensitiveJoin);

    lines.push('');
    lines.push('-- ----------------------------------------------------------------------------');
    lines.push(`-- STEP 2: Populate new columns from source table ${sourceQualified}`);
    lines.push(`-- Join Key: target.${tKey} = source.${sKey}`);
    lines.push('-- ----------------------------------------------------------------------------');

    const assignExpr = (col: EnrichmentColumnSpec) => {
      const tCol = quoteSqlIdent(col.targetName, dialect);
      const sCol = `src.${quoteSqlIdent(col.sourceName, dialect)}`;
      if (config.overwritePolicy === 'fill_null_only') {
        return `    ${tCol} = COALESCE(tgt.${tCol}, ${sCol})`;
      }
      return `    ${tCol} = ${sCol}`;
    };

    if (dialect === 'postgresql' || dialect === 'sqlite') {
      lines.push(`UPDATE ${targetQualified} AS tgt`);
      lines.push('SET');
      lines.push(selectedCols.map(assignExpr).join(',\n'));
      lines.push(`FROM ${sourceQualified} AS src`);
      lines.push(`WHERE ${tExpr} = ${sExpr};`);
    } else if (dialect === 'sqlserver') {
      lines.push('UPDATE tgt');
      lines.push('SET');
      lines.push(selectedCols.map((col) => {
        const tCol = quoteSqlIdent(col.targetName, dialect);
        const sCol = `src.${quoteSqlIdent(col.sourceName, dialect)}`;
        return config.overwritePolicy === 'fill_null_only'
          ? `    tgt.${tCol} = COALESCE(tgt.${tCol}, ${sCol})`
          : `    tgt.${tCol} = ${sCol}`;
      }).join(',\n'));
      lines.push(`FROM ${targetQualified} AS tgt`);
      lines.push(`INNER JOIN ${sourceQualified} AS src`);
      lines.push(`    ON ${tExpr} = ${sExpr};`);
    } else if (dialect === 'oracle') {
      lines.push(`MERGE INTO ${targetQualified} tgt`);
      lines.push(`USING ${sourceQualified} src`);
      lines.push(`ON (${tExpr} = ${sExpr})`);
      lines.push('WHEN MATCHED THEN UPDATE SET');
      lines.push(selectedCols.map((col) => {
        const tCol = quoteSqlIdent(col.targetName, dialect);
        const sCol = `src.${quoteSqlIdent(col.sourceName, dialect)}`;
        return config.overwritePolicy === 'fill_null_only'
          ? `    tgt.${tCol} = NVL(tgt.${tCol}, ${sCol})`
          : `    tgt.${tCol} = ${sCol}`;
      }).join(',\n') + ';');
    }
  } else if (config.sqlMode === 'standalone_embedded' && selectedCols.length > 0) {
    const tKey = config.targetJoinKey.trim() || 'id';
    const sKey = config.sourceJoinKey.trim() || tKey;
    const features = config.sourceDataset.geojson?.features || [];
    const maxRows = config.embeddedRowLimit > 0 ? Math.min(config.embeddedRowLimit, features.length) : features.length;

    if (config.embeddedRowLimit > 0 && features.length > config.embeddedRowLimit) {
      warnings.push(
        `Embedded SQL data truncated to ${config.embeddedRowLimit} of ${features.length} rows. Set Row Limit to 0 to embed all rows.`
      );
    }

    const keyColMeta = config.columns.find((c) => c.sourceName === sKey);
    const keyType: EnrichmentFieldType = keyColMeta?.targetType || 'string';

    // Deduplicate rows by join key
    const validRows: { keyRaw: any; props: Record<string, any> }[] = [];
    const seenKeys = new Set<string>();
    for (let i = 0; i < maxRows; i++) {
      const props = features[i]?.properties || {};
      const keyRaw = props[sKey];
      if (keyRaw === null || keyRaw === undefined || String(keyRaw).trim() === '') continue;
      const dedupKey = config.caseInsensitiveJoin ? String(keyRaw).trim().toLowerCase() : String(keyRaw).trim();
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);
      validRows.push({ keyRaw, props });
    }

    lines.push('');
    lines.push('-- ----------------------------------------------------------------------------');
    lines.push(`-- STEP 2: Standalone embedded enrichment (${validRows.length} rows from "${config.sourceDataset.name}")`);
    lines.push(`-- Match Key: target.${tKey} = source.${sKey}`);
    lines.push('-- ----------------------------------------------------------------------------');

    if (validRows.length === 0) {
      lines.push(`-- Warning: No non-null values found for source key column "${sKey}".`);
      warnings.push(`No non-null values found for source join key "${sKey}".`);
    } else if (dialect === 'postgresql') {
      const chunkSize = 250;
      const allCols = [
        { name: '__join_key', type: keyType, length: 255 },
        ...selectedCols.map((c) => ({ name: c.targetName, type: c.targetType, length: c.length })),
      ];

      for (let start = 0; start < validRows.length; start += chunkSize) {
        const chunk = validRows.slice(start, start + chunkSize);
        lines.push(`-- Batch ${Math.floor(start / chunkSize) + 1} (rows ${start + 1}..${start + chunk.length})`);
        lines.push(`WITH src (${allCols.map((c) => quoteSqlIdent(c.name, dialect)).join(', ')}) AS (`);
        lines.push('    VALUES');

        const valueLines = chunk.map((row, rIdx) => {
          const vals = [
            escapeSqlValue(row.keyRaw, keyType, dialect) + (rIdx === 0 ? `::${mapTypeToSql(keyType, 255, dialect)}` : ''),
            ...selectedCols.map((col) => {
              const lit = escapeSqlValue(row.props[col.sourceName], col.targetType, dialect);
              return rIdx === 0 ? `${lit}::${mapTypeToSql(col.targetType, col.length, dialect)}` : lit;
            }),
          ];
          return `        (${vals.join(', ')})`;
        });

        lines.push(valueLines.join(',\n'));
        lines.push(')');
        lines.push(`UPDATE ${targetQualified} AS tgt`);
        lines.push('SET');
        lines.push(
          selectedCols
            .map((col) => {
              const tCol = quoteSqlIdent(col.targetName, dialect);
              return config.overwritePolicy === 'fill_null_only'
                ? `    ${tCol} = COALESCE(tgt.${tCol}, src.${tCol})`
                : `    ${tCol} = src.${tCol}`;
            })
            .join(',\n')
        );
        lines.push('FROM src');
        const tExpr = buildSqlJoinExpression('tgt', tKey, dialect, config.caseInsensitiveJoin);
        const sExpr = buildSqlJoinExpression('src', '__join_key', dialect, config.caseInsensitiveJoin);
        lines.push(`WHERE ${tExpr} = ${sExpr};`);
        lines.push('');
      }
    } else {
      // Universal per-row UPDATE statements for SQL Server, Oracle, SQLite
      const tColKey = quoteSqlIdent(tKey, dialect);
      for (const row of validRows) {
        const setClause = selectedCols
          .map((col) => {
            const tCol = quoteSqlIdent(col.targetName, dialect);
            const lit = escapeSqlValue(row.props[col.sourceName], col.targetType, dialect);
            if (config.overwritePolicy === 'fill_null_only') {
              const fn = dialect === 'oracle' ? 'NVL' : 'COALESCE';
              return `${tCol} = ${fn}(${tCol}, ${lit})`;
            }
            return `${tCol} = ${lit}`;
          })
          .join(', ');

        const keyLit = escapeSqlValue(row.keyRaw, keyType, dialect);
        let whereExpr = `${tColKey} = ${keyLit}`;
        if (config.caseInsensitiveJoin) {
          if (dialect === 'sqlserver') {
            whereExpr = `LOWER(LTRIM(RTRIM(CAST(${tColKey} AS NVARCHAR(4000))))) = LOWER(LTRIM(RTRIM(CAST(${keyLit} AS NVARCHAR(4000)))))`;
          } else if (dialect === 'oracle') {
            whereExpr = `LOWER(TRIM(TO_CHAR(${tColKey}))) = LOWER(TRIM(TO_CHAR(${keyLit})))`;
          } else {
            whereExpr = `LOWER(TRIM(CAST(${tColKey} AS TEXT))) = LOWER(TRIM(CAST(${keyLit} AS TEXT)))`;
          }
        }
        lines.push(`UPDATE ${targetQualified} SET ${setClause} WHERE ${whereExpr};`);
      }
    }
  }

  if (config.sqlWrapTransaction && dialect !== 'oracle') {
    lines.push('');
    lines.push('COMMIT;');
  } else if (config.sqlWrapTransaction && dialect === 'oracle') {
    lines.push('');
    lines.push('COMMIT;');
  }

  return { code: lines.join('\n'), warnings };
}

// ============================================================================
// ArcPy (ArcGIS Pro Python 3) Script Generator
// ============================================================================

function pyString(val: string): string {
  return JSON.stringify(val);
}

function pyRawPath(pathVal: string): string {
  const clean = pathVal.trim().replace(/"/g, '');
  return `r"${clean}"`;
}

function pyLiteral(raw: any, type: EnrichmentFieldType): string {
  if (raw === null || raw === undefined || raw === '') return 'None';
  if (type === 'smallint' || type === 'integer' || type === 'bigint' || type === 'double') {
    const num = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(num)) return 'None';
    return type === 'double' ? String(num) : String(Math.trunc(num));
  }
  if (type === 'boolean') {
    const truthy = raw === true || raw === 1 || String(raw).trim().toLowerCase() === 'true' || String(raw).trim() === '1';
    return truthy ? '1' : '0';
  }
  if (raw instanceof Date) {
    return pyString(raw.toISOString());
  }
  return pyString(typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
}

function buildArcpyScript(config: EnrichmentScriptConfig): { code: string; warnings: string[] } {
  const warnings: string[] = [];
  const selectedCols = config.columns.filter((c) => c.selected);

  if (selectedCols.length === 0) {
    warnings.push('No columns selected. Select at least one column to generate ArcPy field creation and update code.');
  }

  const sanitizedCols = selectedCols.map((col) => {
    const safeField = sanitizeArcpyFieldName(col.targetName);
    if (safeField !== col.targetName) {
      warnings.push(`ArcPy field name "${col.targetName}" adjusted to "${safeField}" for Geodatabase compatibility.`);
    }
    return { ...col, safeField };
  });

  const targetPath = config.arcpyTargetPath.trim() || `C:\\GIS\\TargetDatabase.gdb\\${config.targetTableName || 'target_table'}`;
  const sourcePath = config.arcpySourcePath.trim() || `C:\\GIS\\Import\\${config.sourceDataset.originalFileName}`;
  const tKey = config.targetJoinKey.trim() || 'OBJECTID';
  const sKey = config.sourceJoinKey.trim() || tKey;

  const logFn = config.arcpyAddMessages ? 'arcpy.AddMessage' : 'print';

  const lines: string[] = [];
  lines.push('# -*- coding: utf-8 -*-');
  lines.push('"""');
  lines.push('OmniGeo Schema Evolution & Data Enrichment Script (ArcPy / ArcGIS Pro)');
  lines.push(`Source Dataset : ${config.sourceDataset.name} (${config.sourceDataset.originalFileName})`);
  lines.push(`Target Table   : ${targetPath}`);
  lines.push(`Mode           : ${config.arcpyMode}`);
  lines.push(`Columns to Add : ${sanitizedCols.length}`);
  lines.push(`Generated At   : ${new Date().toISOString()}`);
  lines.push('"""');
  lines.push('');
  lines.push('import os');
  if (config.arcpyMode === 'add_and_update_cursor' && (config.sourceDataset.format === 'csv' || config.sourceDataset.format === 'excel')) {
    lines.push('import csv');
  }
  lines.push('import arcpy');
  lines.push('');
  lines.push('# ============================================================================');
  lines.push('# 1. CONFIGURATION');
  lines.push('# ============================================================================');
  lines.push(`TARGET_TABLE = ${pyRawPath(targetPath)}`);
  if (config.arcpyMode !== 'add_fields_only' && config.arcpyMode !== 'standalone_embedded') {
    lines.push(`SOURCE_TABLE = ${pyRawPath(sourcePath)}`);
  }
  if (config.arcpyMode !== 'add_fields_only') {
    lines.push(`TARGET_JOIN_KEY = ${pyString(tKey)}`);
    if (config.arcpyMode !== 'standalone_embedded') {
      lines.push(`SOURCE_JOIN_KEY = ${pyString(sKey)}`);
    }
    lines.push(`CASE_INSENSITIVE_JOIN = ${config.caseInsensitiveJoin ? 'True' : 'False'}`);
    lines.push(`FILL_NULL_ONLY = ${config.overwritePolicy === 'fill_null_only' ? 'True' : 'False'}`);
  }
  lines.push('');
  lines.push('# Field definitions: [field_name, field_type, field_alias, field_length, default_value, field_domain]');
  lines.push('FIELDS_TO_ADD = [');
  for (const col of sanitizedCols) {
    const mapped = mapTypeToArcpy(col.targetType);
    const lenVal = mapped.usesLength ? Math.max(1, Math.min(4000, col.length || 255)) : 'None';
    const defVal = col.defaultValue.trim() ? pyLiteral(col.defaultValue.trim(), col.targetType) : 'None';
    lines.push(
      `    [${pyString(col.safeField)}, ${pyString(mapped.fieldType)}, ${pyString(col.alias || col.sourceName)}, ${lenVal}, ${defVal}, ""],  # source: ${col.sourceName}`
    );
  }
  lines.push(']');
  lines.push('');

  if (config.arcpyMode === 'add_and_update_cursor' || config.arcpyMode === 'standalone_embedded') {
    lines.push('# Mapping: source_column -> target_column');
    lines.push('COLUMN_MAPPING = [');
    for (const col of sanitizedCols) {
      lines.push(`    (${pyString(col.sourceName)}, ${pyString(col.safeField)}, ${pyString(col.targetType)}),`);
    }
    lines.push(']');
    lines.push('');
  }

  lines.push('def log(message):');
  lines.push(`    ${logFn}(message)`);
  lines.push('');
  lines.push('def normalize_key(value):');
  lines.push('    if value is None:');
  lines.push('        return None');
  lines.push('    text = str(value).strip()');
  lines.push('    if not text:');
  lines.push('        return None');
  lines.push('    return text.lower() if CASE_INSENSITIVE_JOIN else text');
  lines.push('');

  if (config.arcpyMode === 'add_and_update_cursor' || config.arcpyMode === 'standalone_embedded') {
    lines.push('def coerce_value(value, target_type):');
    lines.push('    if value is None or value == "":');
    lines.push('        return None');
    lines.push('    try:');
    lines.push('        if target_type in ("smallint", "integer", "boolean"):');
    lines.push('            if isinstance(value, bool):');
    lines.push('                return 1 if value else 0');
    lines.push('            return int(float(str(value).strip().replace(",", ".")))');
    lines.push('        if target_type in ("double", "bigint"):');
    lines.push('            return float(str(value).strip().replace(",", "."))');
    lines.push('        return str(value)');
    lines.push('    except (ValueError, TypeError):');
    lines.push('        return None');
    lines.push('');
  }

  // Helper: ensure missing fields exist
  lines.push('def ensure_target_fields(target_table, field_specs):');
  lines.push('    existing = {f.name.lower() for f in arcpy.ListFields(target_table)}');
  lines.push('    missing_specs = [spec for spec in field_specs if spec[0].lower() not in existing]');
  lines.push('    if not missing_specs:');
  lines.push('        log("All requested columns already exist in target table.")');
  lines.push('        return 0');
  lines.push('    log(f"Adding {len(missing_specs)} missing column(s) to {target_table}...")');
  lines.push('    arcpy.management.AddFields(target_table, missing_specs)');
  lines.push('    for spec in missing_specs:');
  lines.push('        log(f"  + Added field: {spec[0]} ({spec[1]})")');
  lines.push('    return len(missing_specs)');
  lines.push('');

  if (config.arcpyMode === 'standalone_embedded') {
    const features = config.sourceDataset.geojson?.features || [];
    const maxRows = config.embeddedRowLimit > 0 ? Math.min(config.embeddedRowLimit, features.length) : features.length;

    if (config.embeddedRowLimit > 0 && features.length > config.embeddedRowLimit) {
      warnings.push(
        `Embedded ArcPy dictionary truncated to ${config.embeddedRowLimit} of ${features.length} rows. Set Row Limit to 0 to embed all rows.`
      );
    }

    lines.push('# ============================================================================');
    lines.push(`# EMBEDDED SOURCE LOOKUP DATA (keyed by "${sKey}")`);
    lines.push('# ============================================================================');
    lines.push('EMBEDDED_LOOKUP = {');
    const seenKeys = new Set<string>();
    for (let i = 0; i < maxRows; i++) {
      const props = features[i]?.properties || {};
      const rawKey = props[sKey];
      if (rawKey === null || rawKey === undefined || String(rawKey).trim() === '') continue;
      const normKey = config.caseInsensitiveJoin ? String(rawKey).trim().toLowerCase() : String(rawKey).trim();
      if (seenKeys.has(normKey)) continue;
      seenKeys.add(normKey);
      const tupleVals = sanitizedCols.map((c) => pyLiteral(props[c.sourceName], c.targetType)).join(', ');
      lines.push(`    ${pyString(normKey)}: (${tupleVals}${sanitizedCols.length === 1 ? ',' : ''}),`);
    }
    lines.push('}');
    lines.push('');
  }

  if (config.arcpyMode === 'add_and_update_cursor') {
    lines.push('def load_source_lookup(source_table, join_key, column_mapping):');
    lines.push('    """Loads source rows into an in-memory dictionary keyed by join_key."""');
    lines.push('    lookup = {}');
    lines.push('    ext = os.path.splitext(source_table)[1].lower()');
    if (config.sourceDataset.format === 'csv' || config.sourceDataset.format === 'excel') {
      lines.push('    if ext == ".csv":');
      lines.push('        with open(source_table, mode="r", encoding="utf-8-sig", newline="") as f:');
      lines.push('            sample = f.read(4096)');
      lines.push('            f.seek(0)');
      lines.push('            dialect = csv.Sniffer().sniff(sample, delimiters=",;\\t|") if sample else csv.excel');
      lines.push('            reader = csv.DictReader(f, dialect=dialect)');
      lines.push('            for row in reader:');
      lines.push('                k = normalize_key(row.get(join_key))');
      lines.push('                if k is not None and k not in lookup:');
      lines.push('                    lookup[k] = tuple(coerce_value(row.get(src), ttype) for src, _, ttype in column_mapping)');
      lines.push('        return lookup');
      lines.push('    if ext in (".xlsx", ".xls"):');
      lines.push('        # ArcGIS Pro ships with openpyxl/pandas or TableToTable conversion');
      lines.push('        import pandas as pd');
      lines.push('        df = pd.read_excel(source_table)');
      lines.push('        for _, row in df.iterrows():');
      lines.push('            k = normalize_key(row.get(join_key))');
      lines.push('            if k is not None and k not in lookup:');
      lines.push('                lookup[k] = tuple(coerce_value(None if pd.isna(row.get(src)) else row.get(src), ttype) for src, _, ttype in column_mapping)');
      lines.push('        return lookup');
    }
    lines.push('    src_fields = [join_key] + [src for src, _, _ in column_mapping]');
    lines.push('    with arcpy.da.SearchCursor(source_table, src_fields) as cursor:');
    lines.push('        for row in cursor:');
    lines.push('            k = normalize_key(row[0])');
    lines.push('            if k is not None and k not in lookup:');
    lines.push('                lookup[k] = tuple(coerce_value(row[idx + 1], column_mapping[idx][2]) for idx in range(len(column_mapping)))');
    lines.push('    return lookup');
    lines.push('');
  }

  lines.push('def main():');
  lines.push('    if not arcpy.Exists(TARGET_TABLE):');
  lines.push('        raise FileNotFoundError(f"Target table not found: {TARGET_TABLE}")');
  lines.push('');
  lines.push('    # Step 1: Create any missing fields in target table');
  lines.push('    ensure_target_fields(TARGET_TABLE, FIELDS_TO_ADD)');
  lines.push('');

  if (config.arcpyMode === 'add_fields_only') {
    lines.push('    log("Schema update completed successfully.")');
  } else if (config.arcpyMode === 'join_field') {
    lines.push('    # Step 2: Populate newly added fields using JoinField / UpdateCursor');
    lines.push('    if not arcpy.Exists(SOURCE_TABLE):');
    lines.push('        raise FileNotFoundError(f"Source table not found: {SOURCE_TABLE}")');
    lines.push('    source_field_names = [' + sanitizedCols.map((c) => pyString(c.sourceName)).join(', ') + ']');
    lines.push('    log(f"Running arcpy.management.JoinField on {TARGET_JOIN_KEY} = {SOURCE_JOIN_KEY}...")');
    lines.push('    arcpy.management.JoinField(');
    lines.push('        in_data=TARGET_TABLE,');
    lines.push('        in_field=TARGET_JOIN_KEY,');
    lines.push('        join_table=SOURCE_TABLE,');
    lines.push('        join_field=SOURCE_JOIN_KEY,');
    lines.push('        fields=source_field_names');
    lines.push('    )');
    lines.push('    log("JoinField enrichment completed successfully.")');
  } else {
    // add_and_update_cursor or standalone_embedded
    if (config.arcpyMode === 'add_and_update_cursor') {
      lines.push('    # Step 2: Load source attribute lookup dictionary');
      lines.push('    lookup = load_source_lookup(SOURCE_TABLE, SOURCE_JOIN_KEY, COLUMN_MAPPING)');
    } else {
      lines.push('    # Step 2: Use embedded source lookup dictionary');
      lines.push('    lookup = EMBEDDED_LOOKUP');
    }
    lines.push('    log(f"Loaded {len(lookup)} unique source key(s) for enrichment.")');
    lines.push('');
    lines.push('    # Step 3: Update target table rows via arcpy.da.UpdateCursor');
    lines.push('    target_fields = [TARGET_JOIN_KEY] + [tgt for _, tgt, _ in COLUMN_MAPPING]');
    lines.push('    updated_rows = 0');
    lines.push('    unmatched_rows = 0');
    lines.push('');

    const indent = config.arcpyUseEditSession ? '        ' : '    ';
    if (config.arcpyUseEditSession) {
      lines.push('    workspace = os.path.dirname(TARGET_TABLE)');
      lines.push('    # Handle Feature Dataset nesting inside File/Enterprise GDB');
      lines.push('    if not workspace.lower().endswith((".gdb", ".sde")) and os.path.dirname(workspace).lower().endswith((".gdb", ".sde")):');
      lines.push('        workspace = os.path.dirname(workspace)');
      lines.push('    edit = arcpy.da.Editor(workspace)');
      lines.push('    edit.startEditing(False, True)');
      lines.push('    edit.startOperation()');
      lines.push('    try:');
    }

    lines.push(`${indent}with arcpy.da.UpdateCursor(TARGET_TABLE, target_fields) as cursor:`);
    lines.push(`${indent}    for row in cursor:`);
    lines.push(`${indent}        k = normalize_key(row[0])`);
    lines.push(`${indent}        src_vals = lookup.get(k) if k is not None else None`);
    lines.push(`${indent}        if src_vals is None:`);
    lines.push(`${indent}            unmatched_rows += 1`);
    lines.push(`${indent}            continue`);
    lines.push(`${indent}        changed = False`);
    lines.push(`${indent}        for idx, new_val in enumerate(src_vals):`);
    lines.push(`${indent}            if FILL_NULL_ONLY and row[idx + 1] not in (None, ""):`);
    lines.push(`${indent}                continue`);
    lines.push(`${indent}            row[idx + 1] = new_val`);
    lines.push(`${indent}            changed = True`);
    lines.push(`${indent}        if changed:`);
    lines.push(`${indent}            cursor.updateRow(row)`);
    lines.push(`${indent}            updated_rows += 1`);

    if (config.arcpyUseEditSession) {
      lines.push('        edit.stopOperation()');
      lines.push('        edit.stopEditing(True)');
      lines.push('    except Exception:');
      lines.push('        edit.stopOperation()');
      lines.push('        edit.stopEditing(False)');
      lines.push('        raise');
    }

    lines.push('');
    lines.push('    log(f"Enrichment finished: {updated_rows} row(s) updated, {unmatched_rows} unmatched.")');
  }

  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    main()');

  return { code: lines.join('\n'), warnings };
}

/**
 * Main entrypoint: generates an ArcPy (.py) or SQL (.sql) schema evolution & enrichment script.
 */
export function generateEnrichmentScript(config: EnrichmentScriptConfig): GeneratedScriptResult {
  const selectedCols = config.columns.filter((c) => c.selected);
  const newCols = selectedCols.filter((c) => !c.existsInTarget);
  const existingCols = selectedCols.filter((c) => c.existsInTarget);

  const cleanTarget = sanitizeSqlName(config.targetTableName || 'target_table').toLowerCase();
  const cleanSource = sanitizeSqlName(config.sourceDataset.name || 'source').toLowerCase();

  if (config.engine === 'arcpy') {
    const { code, warnings } = buildArcpyScript(config);
    return {
      code,
      fileExtension: 'py',
      suggestedFileName: `enrich_${cleanTarget}_from_${cleanSource}_arcpy.py`,
      selectedColumnsCount: selectedCols.length,
      newColumnsCount: newCols.length,
      existingColumnsCount: existingCols.length,
      lineCount: code.split('\n').length,
      warnings,
    };
  }

  const { code, warnings } = buildSqlScript(config);
  return {
    code,
    fileExtension: 'sql',
    suggestedFileName: `enrich_${cleanTarget}_from_${cleanSource}_${config.sqlDialect}.sql`,
    selectedColumnsCount: selectedCols.length,
    newColumnsCount: newCols.length,
    existingColumnsCount: existingCols.length,
    lineCount: code.split('\n').length,
    warnings,
  };
}
