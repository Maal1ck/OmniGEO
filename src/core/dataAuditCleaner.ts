/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeField, SpatialDataset } from '../types/gis';
import { extractSchemaFields } from './formatParsers';

export type NumericIssueCode =
  | 'DOUBLE_SEPARATOR'
  | 'COMMA_DECIMAL'
  | 'THOUSANDS_CONFUSION'
  | 'WHITESPACE_IN_NUMBER'
  | 'STRAY_UNIT_OR_CHAR'
  | 'STRING_STORED_NUMBER'
  | 'NON_NUMERIC_SENTINEL';

export interface NumericAnalysisResult {
  original: any;
  status:
    | 'valid_number'
    | 'clean_numeric_string'
    | 'malformed_recoverable'
    | 'non_numeric_sentinel'
    | 'unparseable_text'
    | 'empty';
  repairedNumber: number | null;
  repairedDecimalString: string | null;
  issueCode?: NumericIssueCode;
  reason?: string;
}

export type AnomalyCategory =
  | 'malformed_number'
  | 'decimal_separator'
  | 'string_in_numeric_col'
  | 'case_mismatch'
  | 'delimiter_inconsistency'
  | 'whitespace';

export interface AttributeCellAnomaly {
  featureIndex: number;
  rowNumber: number;
  columnName: string;
  category: AnomalyCategory;
  rawValue: any;
  rawType: string;
  suggestedValue: string | number | null;
  reason: string;
}

export interface ColumnCaseStats {
  lowercase: number;
  uppercase: number;
  titlecase: number;
  mixed: number;
  dominantCase: 'lowercase' | 'uppercase' | 'titlecase' | 'mixed' | 'none';
  hasMixedCasing: boolean;
}

export interface ColumnAuditSummary {
  columnName: string;
  currentFieldType: AttributeField['type'];
  recommendedOutputType: 'Double / Float' | 'Integer' | 'String' | 'Boolean' | 'Date';
  isMajorityNumeric: boolean;
  isBlockedNumericCast: boolean;
  totalRows: number;
  nonEmptyRows: number;
  emptyRows: number;
  validNumericCount: number;
  cleanNumericStringCount: number;
  malformedNumericCount: number;
  sentinelCount: number;
  nonNumericStringCount: number;
  numericDominancePct: number;
  hasDecimalFloat: boolean;
  decimalCommaCount: number;
  decimalDotCount: number;
  doubleSeparatorCount: number;
  detectedDelimiters: { delimiter: string; count: number }[];
  whitespaceIssuesCount: number;
  caseStats: ColumnCaseStats;
  anomalies: AttributeCellAnomaly[];
}

export interface DatasetAttributeAuditReport {
  datasetId: string;
  datasetName: string;
  totalRows: number;
  totalColumns: number;
  blockedNumericColumnsCount: number;
  malformedNumericCellsCount: number;
  caseIssueColumnsCount: number;
  separatorIssueColumnsCount: number;
  columns: ColumnAuditSummary[];
}

export type TextCaseMode =
  | 'lowercase'
  | 'uppercase'
  | 'titlecase'
  | 'sentencecase'
  | 'trim_only';

export interface NumericCleanOptions {
  castToNumber: boolean;
  targetNumericKind?: 'auto' | 'double' | 'integer';
  decimalOutputSeparator?: '.' | ',';
  stripStrayUnits?: boolean;
  convertSentinelsToNull?: boolean;
  fixMalformedSeparators?: boolean;
}

export interface SeparatorCleanOptions {
  mode:
    | 'collapse_malformed_decimals'
    | 'decimal_comma_to_dot'
    | 'decimal_dot_to_comma'
    | 'replace_delimiter';
  fromDelimiter?: string;
  toDelimiter?: string;
  trimAroundDelimiter?: boolean;
}

const NULL_SENTINELS = new Set([
  'n/a',
  'na',
  'n.a',
  'n.a.',
  'n/d',
  'nd',
  'null',
  'none',
  'nil',
  'nan',
  'undefined',
  'vide',
  '-',
  '--',
  '---',
  '?',
  '??',
  '.',
]);

// ============================================================================
// Numeric Candidate Analyzer
// ============================================================================

export function analyzeNumericCandidate(
  rawValue: any,
  stripUnits = true
): NumericAnalysisResult {
  if (rawValue === null || rawValue === undefined) {
    return { original: rawValue, status: 'empty', repairedNumber: null, repairedDecimalString: null };
  }

  if (typeof rawValue === 'number') {
    if (Number.isFinite(rawValue)) {
      return {
        original: rawValue,
        status: 'valid_number',
        repairedNumber: rawValue,
        repairedDecimalString: String(rawValue),
      };
    }
    return {
      original: rawValue,
      status: 'non_numeric_sentinel',
      repairedNumber: null,
      repairedDecimalString: null,
      issueCode: 'NON_NUMERIC_SENTINEL',
      reason: 'Non-finite IEEE number (NaN / Infinity)',
    };
  }

  if (typeof rawValue !== 'string') {
    return {
      original: rawValue,
      status: 'unparseable_text',
      repairedNumber: null,
      repairedDecimalString: null,
      reason: `Non-scalar value type (${typeof rawValue})`,
    };
  }

  const trimmed = rawValue.trim();
  if (trimmed === '') {
    return { original: rawValue, status: 'empty', repairedNumber: null, repairedDecimalString: null };
  }

  const lower = trimmed.toLowerCase();
  if (NULL_SENTINELS.has(lower)) {
    return {
      original: rawValue,
      status: 'non_numeric_sentinel',
      repairedNumber: null,
      repairedDecimalString: null,
      issueCode: 'NON_NUMERIC_SENTINEL',
      reason: `Placeholder string "${trimmed}" blocks numeric column typing`,
    };
  }

  // Already a clean standard ASCII numeric string ("19.7", "-42", "1200.5", "1.5e-4")
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      const hadOuterSpace = rawValue !== trimmed;
      return {
        original: rawValue,
        status: 'clean_numeric_string',
        repairedNumber: n,
        repairedDecimalString: trimmed,
        issueCode: hadOuterSpace ? 'WHITESPACE_IN_NUMBER' : 'STRING_STORED_NUMBER',
        reason: hadOuterSpace
          ? 'Leading/trailing whitespace around numeric string prevents Double/Float output'
          : 'Stored as String instead of numeric Double/Float',
      };
    }
  }

  // Normalize non-breaking spaces / thin spaces inside candidate
  let work = trimmed.replace(/[\u00A0\u202F\u2009]/g, ' ');
  const hadLeadingTrailing = rawValue !== trimmed;
  let hadInternalSpaces = /\d\s+\d/.test(work) || /\d\s*[.,]\s*\d/.test(work);

  // Strip spaces around separators or thousands groups like "1 250,7" or "19 . 7"
  if (/^[+-]?\d[\d\s.,]*\d?$/.test(work)) {
    work = work.replace(/\s+/g, '');
  } else if (stripUnits) {
    // Check optional currency/prefix/unit suffix (e.g., "~19,.7 m", "45,2%", "12.5 km2")
    const unitMatch = work.match(
      /^[~≈<>±€$£]?\s*([+-]?\d[\d\s.,]*\d|\d)\s*(?:%|°|mm|cm|dm|m|km|m2|m²|ha|km2|km²|l\/s|m3\/s|mg\/l|kg|t|bar|psi)?$/i
    );
    if (unitMatch) {
      const candidateBody = unitMatch[1].replace(/\s+/g, '');
      const inner = analyzeNumericCandidate(candidateBody, false);
      if (inner.repairedNumber !== null) {
        return {
          original: rawValue,
          status: 'malformed_recoverable',
          repairedNumber: inner.repairedNumber,
          repairedDecimalString: inner.repairedDecimalString,
          issueCode: 'STRAY_UNIT_OR_CHAR',
          reason: `Numeric value "${trimmed}" contains attached unit or prefix character`,
        };
      }
    }
  }

  // Collapse malformed adjacent punctuation like "19,.7", "19.,7", "19..7", "19,,7", "19.,.7"
  if (/[.,]{2,}/.test(work)) {
    const collapsed = work.replace(/[.,]+/g, '.');
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(collapsed)) {
      const n = Number(collapsed);
      if (Number.isFinite(n)) {
        return {
          original: rawValue,
          status: 'malformed_recoverable',
          repairedNumber: n,
          repairedDecimalString: collapsed,
          issueCode: 'DOUBLE_SEPARATOR',
          reason: `Malformed separator sequence in "${trimmed}" -> clean ${n}`,
        };
      }
    }
    // Check comma thousands + collapsed double decimal: e.g. "1,250,.7"
    const normalizedMulti = collapseAndParseLocalizedNumber(work);
    if (normalizedMulti !== null) {
      return {
        original: rawValue,
        status: 'malformed_recoverable',
        repairedNumber: normalizedMulti,
        repairedDecimalString: String(normalizedMulti),
        issueCode: 'DOUBLE_SEPARATOR',
        reason: `Malformed separator sequence in "${trimmed}" -> clean ${normalizedMulti}`,
      };
    }
  }

  // Simple French / European comma decimal: "19,7" -> 19.7
  if (/^[+-]?\d+,\d+$/.test(work)) {
    const dotStr = work.replace(',', '.');
    const n = Number(dotStr);
    if (Number.isFinite(n)) {
      return {
        original: rawValue,
        status: 'malformed_recoverable',
        repairedNumber: n,
        repairedDecimalString: dotStr,
        issueCode: hadInternalSpaces || hadLeadingTrailing ? 'WHITESPACE_IN_NUMBER' : 'COMMA_DECIMAL',
        reason: `Decimal comma in "${trimmed}" blocks Float/Double casting (expected ${n})`,
      };
    }
  }

  // Trailing comma/dot typo like "19," or "19."
  if (/^[+-]?\d+[.,]$/.test(work)) {
    const n = Number(work.slice(0, -1));
    if (Number.isFinite(n)) {
      return {
        original: rawValue,
        status: 'malformed_recoverable',
        repairedNumber: n,
        repairedDecimalString: String(n),
        issueCode: 'DOUBLE_SEPARATOR',
        reason: `Trailing dangling decimal separator in "${trimmed}"`,
      };
    }
  }

  // Mixed thousands + decimal separators ("1,250.75", "1.250,75", "1 250,75")
  const localized = collapseAndParseLocalizedNumber(work);
  if (localized !== null) {
    return {
      original: rawValue,
      status: 'malformed_recoverable',
      repairedNumber: localized,
      repairedDecimalString: String(localized),
      issueCode: hadInternalSpaces ? 'WHITESPACE_IN_NUMBER' : 'THOUSANDS_CONFUSION',
      reason: `Formatted/grouped number "${trimmed}" needs separator normalization -> ${localized}`,
    };
  }

  return {
    original: rawValue,
    status: 'unparseable_text',
    repairedNumber: null,
    repairedDecimalString: null,
    reason: `Non-numeric text value "${trimmed}"`,
  };
}

function collapseAndParseLocalizedNumber(input: string): number | null {
  const s = input.replace(/[\s\u00A0\u202F]+/g, '');
  if (!/^[+-]?[\d.,]+$/.test(s)) return null;

  // Replace consecutive runs of dots/commas cleanly
  const cleanedRuns = s.replace(/([.,])[.,]+/g, '$1');

  const lastDot = cleanedRuns.lastIndexOf('.');
  const lastComma = cleanedRuns.lastIndexOf(',');

  if (lastDot === -1 && lastComma === -1) {
    const n = Number(cleanedRuns);
    return Number.isFinite(n) ? n : null;
  }

  // Identify rightmost separator
  const lastSepIdx = Math.max(lastDot, lastComma);
  const sepChar = cleanedRuns[lastSepIdx];
  const sepCount = (cleanedRuns.match(new RegExp(`\\${sepChar}`, 'g')) || []).length;
  const digitsAfter = cleanedRuns.length - lastSepIdx - 1;

  // If the only separator appears multiple times (e.g. "1.000.000"), treat all as thousands separators
  if (sepCount > 1 && lastDot !== -1 && lastComma === -1) {
    const joined = cleanedRuns.replace(/\./g, '');
    const n = Number(joined);
    return Number.isFinite(n) ? n : null;
  }
  if (sepCount > 1 && lastComma !== -1 && lastDot === -1) {
    const joined = cleanedRuns.replace(/,/g, '');
    const n = Number(joined);
    return Number.isFinite(n) ? n : null;
  }

  // Both '.' and ',' exist: whichever comes last is decimal separator
  if (lastDot !== -1 && lastComma !== -1) {
    const intPart = cleanedRuns.slice(0, lastSepIdx).replace(/[.,]/g, '');
    const fracPart = cleanedRuns.slice(lastSepIdx + 1);
    const n = Number(`${intPart}.${fracPart}`);
    return Number.isFinite(n) ? n : null;
  }

  // Single separator: could be decimal (19,7 or 19.7) or thousands (1,250)
  if (sepChar === ',' && digitsAfter === 3 && cleanedRuns.replace(/[+-]/, '').split(',')[0].length >= 1 && cleanedRuns.replace(/[+-]/, '').split(',')[0].length <= 3) {
    // Ambiguous thousands vs 3-decimal precision: preserve decimal unless multiple commas; check decimal interpretation
    const n = Number(cleanedRuns.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const normalized = cleanedRuns.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ============================================================================
// Text Casing Helpers
// ============================================================================

export function classifyStringCase(str: string): 'lowercase' | 'uppercase' | 'titlecase' | 'mixed' | 'neutral' {
  const letters = str.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length === 0) return 'neutral';

  const trimmed = str.trim();
  if (trimmed === trimmed.toLowerCase()) return 'lowercase';
  if (trimmed === trimmed.toUpperCase()) return 'uppercase';

  // Title case check: first letter of words uppercase, remaining lowercase (short prepositions allowed)
  const words = trimmed.split(/[\s\-_'’]+/).filter((w) => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(w));
  if (words.length > 0) {
    const minorWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'of', 'the', 'and', 'in', 'on', 'for']);
    const looksTitle = words.every((w, idx) => {
      const cleanWord = w.replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ]+/, '');
      if (!cleanWord) return true;
      if (idx > 0 && minorWords.has(cleanWord.toLowerCase())) {
        return cleanWord === cleanWord.toLowerCase() || cleanWord[0] === cleanWord[0].toUpperCase();
      }
      const first = cleanWord[0];
      const rest = cleanWord.slice(1);
      return first === first.toUpperCase() && rest === rest.toLowerCase();
    });
    if (looksTitle) return 'titlecase';
  }

  return 'mixed';
}

export function applyTextCaseTransform(value: string, mode: TextCaseMode): string {
  const collapsedSpaces = value.trim().replace(/\s+/g, ' ');
  switch (mode) {
    case 'trim_only':
      return collapsedSpaces;
    case 'lowercase':
      return collapsedSpaces.toLowerCase();
    case 'uppercase':
      return collapsedSpaces.toUpperCase();
    case 'sentencecase':
      if (!collapsedSpaces) return '';
      return collapsedSpaces[0].toUpperCase() + collapsedSpaces.slice(1).toLowerCase();
    case 'titlecase':
      return collapsedSpaces
        .toLowerCase()
        .replace(/(^|[\s\-_/'])([a-zà-öø-ÿ])/g, (m, sep, ch) => `${sep}${ch.toUpperCase()}`);
    default:
      return collapsedSpaces;
  }
}

// ============================================================================
// Full Dataset Column & Record Auditor
// ============================================================================

export function auditDatasetAttributes(dataset: SpatialDataset): DatasetAttributeAuditReport {
  const features = dataset.geojson?.features || (dataset.geojson?.type === 'Feature' ? [dataset.geojson] : []);
  const columnNameSet = new Set<string>(dataset.fields.map((f) => f.name));
  for (const f of features) {
    const props = f?.properties || {};
    for (const k of Object.keys(props)) {
      columnNameSet.add(k);
    }
  }

  const columns: ColumnAuditSummary[] = [];
  let blockedNumericColumnsCount = 0;
  let malformedNumericCellsCount = 0;
  let caseIssueColumnsCount = 0;
  let separatorIssueColumnsCount = 0;

  for (const columnName of columnNameSet) {
    const existingField = dataset.fields.find((f) => f.name === columnName);
    let nonEmptyRows = 0;
    let emptyRows = 0;
    let validNumericCount = 0;
    let cleanNumericStringCount = 0;
    let malformedNumericCount = 0;
    let sentinelCount = 0;
    let nonNumericStringCount = 0;
    let hasDecimalFloat = false;
    let decimalCommaCount = 0;
    let decimalDotCount = 0;
    let doubleSeparatorCount = 0;
    let whitespaceIssuesCount = 0;

    let lowercase = 0;
    let uppercase = 0;
    let titlecase = 0;
    let mixed = 0;

    const delimiterCounts = new Map<string, number>();
    const commonListDelims = [';', '|', '/', ' - ', ', '];

    const numericAnomalies: AttributeCellAnomaly[] = [];
    const textEntries: {
      featureIndex: number;
      rowNumber: number;
      rawValue: string;
      caseClass: ReturnType<typeof classifyStringCase>;
    }[] = [];

    for (let idx = 0; idx < features.length; idx++) {
      const raw = features[idx]?.properties?.[columnName];
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        emptyRows++;
        continue;
      }
      nonEmptyRows++;

      const rawType = typeof raw;
      if (typeof raw === 'string') {
        if (raw !== raw.trim() || /\s{2,}/.test(raw)) {
          whitespaceIssuesCount++;
        }

        if (/[.,]{2,}/.test(raw)) {
          doubleSeparatorCount++;
        }

        for (const d of commonListDelims) {
          if (raw.includes(d)) {
            delimiterCounts.set(d, (delimiterCounts.get(d) || 0) + 1);
          }
        }
      }

      const numRes = analyzeNumericCandidate(raw, true);
      if (numRes.status === 'valid_number') {
        validNumericCount++;
        if (numRes.repairedNumber !== null && !Number.isInteger(numRes.repairedNumber)) {
          hasDecimalFloat = true;
        }
      } else if (numRes.status === 'clean_numeric_string') {
        cleanNumericStringCount++;
        if (typeof raw === 'string' && raw.includes('.')) decimalDotCount++;
        if (numRes.repairedNumber !== null && !Number.isInteger(numRes.repairedNumber)) {
          hasDecimalFloat = true;
        }
        numericAnomalies.push({
          featureIndex: idx,
          rowNumber: idx + 1,
          columnName,
          category: numRes.issueCode === 'WHITESPACE_IN_NUMBER' ? 'whitespace' : 'string_in_numeric_col',
          rawValue: raw,
          rawType,
          suggestedValue: numRes.repairedNumber,
          reason: numRes.reason || 'Numeric value stored as string',
        });
      } else if (numRes.status === 'malformed_recoverable') {
        malformedNumericCount++;
        if (typeof raw === 'string') {
          if (/[.,]{2,}/.test(raw)) {
            doubleSeparatorCount++;
          } else if (raw.includes(',')) {
            decimalCommaCount++;
          }
        }
        if (numRes.repairedNumber !== null && !Number.isInteger(numRes.repairedNumber)) {
          hasDecimalFloat = true;
        }
        numericAnomalies.push({
          featureIndex: idx,
          rowNumber: idx + 1,
          columnName,
          category:
            numRes.issueCode === 'COMMA_DECIMAL' || numRes.issueCode === 'THOUSANDS_CONFUSION'
              ? 'decimal_separator'
              : 'malformed_number',
          rawValue: raw,
          rawType,
          suggestedValue: numRes.repairedNumber,
          reason: numRes.reason || 'Malformed numeric value',
        });
      } else if (numRes.status === 'non_numeric_sentinel') {
        sentinelCount++;
        numericAnomalies.push({
          featureIndex: idx,
          rowNumber: idx + 1,
          columnName,
          category: 'string_in_numeric_col',
          rawValue: raw,
          rawType,
          suggestedValue: null,
          reason: numRes.reason || 'Placeholder text in column',
        });
      } else {
        nonNumericStringCount++;
        if (typeof raw === 'string') {
          const cClass = classifyStringCase(raw);
          if (cClass === 'lowercase') lowercase++;
          else if (cClass === 'uppercase') uppercase++;
          else if (cClass === 'titlecase') titlecase++;
          else if (cClass === 'mixed') mixed++;
          textEntries.push({ featureIndex: idx, rowNumber: idx + 1, rawValue: raw, caseClass: cClass });
        }
      }
    }

    const effectiveNonSentinel = Math.max(1, nonEmptyRows - sentinelCount);
    const totalNumericCandidates = validNumericCount + cleanNumericStringCount + malformedNumericCount;
    const numericDominancePct =
      nonEmptyRows > 0 ? Math.round((totalNumericCandidates / effectiveNonSentinel) * 100) : 0;

    // A column is majority numeric if >= 50% of its non-sentinel non-empty entries parse/recover as numbers
    const isMajorityNumeric = totalNumericCandidates > 0 && numericDominancePct >= 50;

    // Blocked from Double/Float/Integer export if majority numeric AND any non-valid-number cells exist
    const isBlockedNumericCast =
      isMajorityNumeric &&
      (cleanNumericStringCount > 0 || malformedNumericCount > 0 || sentinelCount > 0 || (nonNumericStringCount > 0 && validNumericCount > 0));

    let recommendedOutputType: ColumnAuditSummary['recommendedOutputType'] = 'String';
    if (isMajorityNumeric) {
      recommendedOutputType = hasDecimalFloat ? 'Double / Float' : 'Integer';
    } else if (existingField?.type === 'boolean') {
      recommendedOutputType = 'Boolean';
    } else if (existingField?.type === 'date') {
      recommendedOutputType = 'Date';
    }

    // Text Case Summary
    const totalCased = lowercase + uppercase + titlecase + mixed;
    let dominantCase: ColumnCaseStats['dominantCase'] = 'none';
    if (totalCased > 0) {
      const pairs: ['lowercase' | 'uppercase' | 'titlecase' | 'mixed', number][] = [
        ['uppercase', uppercase],
        ['lowercase', lowercase],
        ['titlecase', titlecase],
        ['mixed', mixed],
      ];
      pairs.sort((a, b) => b[1] - a[1]);
      dominantCase = pairs[0][0];
    }
    const activeCaseBuckets = [lowercase, uppercase, titlecase, mixed].filter((c) => c > 0).length;
    const hasMixedCasing = !isMajorityNumeric && (activeCaseBuckets > 1 || mixed > 0);

    const caseStats: ColumnCaseStats = {
      lowercase,
      uppercase,
      titlecase,
      mixed,
      dominantCase,
      hasMixedCasing,
    };

    const anomalies: AttributeCellAnomaly[] = [];
    if (isMajorityNumeric) {
      // Include numeric anomalies and any unparseable string outliers blocking Float/Double
      anomalies.push(...numericAnomalies);
      for (const te of textEntries) {
        anomalies.push({
          featureIndex: te.featureIndex,
          rowNumber: te.rowNumber,
          columnName,
          category: 'string_in_numeric_col',
          rawValue: te.rawValue,
          rawType: 'string',
          suggestedValue: null,
          reason: 'Text outlier blocks Double/Float column casting',
        });
      }
      malformedNumericCellsCount += malformedNumericCount;
    } else {
      // Even in non-majority numeric columns, surface obvious malformed numeric typos (e.g. "19,.7")
      for (const na of numericAnomalies) {
        if (na.category === 'malformed_number') {
          anomalies.push(na);
          malformedNumericCellsCount++;
        }
      }
      // Flag casing mismatches relative to dominant case (or mixed case entries)
      if (hasMixedCasing && dominantCase !== 'none') {
        const targetMode: TextCaseMode =
          dominantCase === 'uppercase'
            ? 'uppercase'
            : dominantCase === 'lowercase'
            ? 'lowercase'
            : 'titlecase';
        for (const te of textEntries) {
          if (te.caseClass !== 'neutral' && te.caseClass !== dominantCase) {
            anomalies.push({
              featureIndex: te.featureIndex,
              rowNumber: te.rowNumber,
              columnName,
              category: 'case_mismatch',
              rawValue: te.rawValue,
              rawType: 'string',
              suggestedValue: applyTextCaseTransform(te.rawValue, targetMode),
              reason: `Case differs from dominant column style (${dominantCase})`,
            });
          }
        }
      }
    }

    // Surface whitespace issues if not already listed on that row
    const seenRowIdx = new Set(anomalies.map((a) => a.featureIndex));
    for (let idx = 0; idx < features.length; idx++) {
      if (seenRowIdx.has(idx)) continue;
      const raw = features[idx]?.properties?.[columnName];
      if (typeof raw === 'string' && (raw !== raw.trim() || /\s{2,}/.test(raw))) {
        anomalies.push({
          featureIndex: idx,
          rowNumber: idx + 1,
          columnName,
          category: 'whitespace',
          rawValue: raw,
          rawType: 'string',
          suggestedValue: raw.trim().replace(/\s+/g, ' '),
          reason: 'Leading, trailing, or consecutive whitespace characters',
        });
      }
    }

    const detectedDelimiters = Array.from(delimiterCounts.entries())
      .map(([delimiter, count]) => ({ delimiter, count }))
      .sort((a, b) => b.count - a.count);

    if (isBlockedNumericCast) blockedNumericColumnsCount++;
    if (hasMixedCasing) caseIssueColumnsCount++;
    if (
      doubleSeparatorCount > 0 ||
      (decimalCommaCount > 0 && decimalDotCount > 0) ||
      detectedDelimiters.length > 1
    ) {
      separatorIssueColumnsCount++;
    }

    columns.push({
      columnName,
      currentFieldType: existingField?.type || 'string',
      recommendedOutputType,
      isMajorityNumeric,
      isBlockedNumericCast,
      totalRows: features.length,
      nonEmptyRows,
      emptyRows,
      validNumericCount,
      cleanNumericStringCount,
      malformedNumericCount,
      sentinelCount,
      nonNumericStringCount,
      numericDominancePct,
      hasDecimalFloat,
      decimalCommaCount,
      decimalDotCount,
      doubleSeparatorCount,
      detectedDelimiters,
      whitespaceIssuesCount,
      caseStats,
      anomalies,
    });
  }

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    totalRows: features.length,
    totalColumns: columns.length,
    blockedNumericColumnsCount,
    malformedNumericCellsCount,
    caseIssueColumnsCount,
    separatorIssueColumnsCount,
    columns,
  };
}

// ============================================================================
// Column Repair & Standardization Transformations
// ============================================================================

export function repairColumnNumbers(
  dataset: SpatialDataset,
  columnName: string,
  options: NumericCleanOptions = {
    castToNumber: true,
    targetNumericKind: 'auto',
    decimalOutputSeparator: '.',
    stripStrayUnits: true,
    convertSentinelsToNull: true,
    fixMalformedSeparators: true,
  }
): {
  updatedDataset: SpatialDataset;
  repairedCount: number;
  nullifiedSentinelsCount: number;
  unchangedCount: number;
} {
  const features = (dataset.geojson?.features || []).map((f: any) => ({
    ...f,
    properties: { ...(f.properties || {}) },
  }));

  let repairedCount = 0;
  let nullifiedSentinelsCount = 0;
  let unchangedCount = 0;

  for (const f of features) {
    const raw = f.properties[columnName];
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      if (options.castToNumber && raw === '') {
        f.properties[columnName] = null;
      }
      unchangedCount++;
      continue;
    }

    const analysis = analyzeNumericCandidate(raw, options.stripStrayUnits !== false);

    if (analysis.status === 'valid_number') {
      if (options.targetNumericKind === 'integer' && analysis.repairedNumber !== null) {
        const rounded = Math.round(analysis.repairedNumber);
        if (rounded !== raw) {
          f.properties[columnName] = rounded;
          repairedCount++;
        } else {
          unchangedCount++;
        }
      } else if (!options.castToNumber && options.decimalOutputSeparator === ',') {
        f.properties[columnName] = String(raw).replace('.', ',');
        repairedCount++;
      } else {
        unchangedCount++;
      }
      continue;
    }

    if (
      analysis.status === 'clean_numeric_string' ||
      (analysis.status === 'malformed_recoverable' && options.fixMalformedSeparators !== false)
    ) {
      if (analysis.repairedNumber !== null) {
        const numVal =
          options.targetNumericKind === 'integer'
            ? Math.round(analysis.repairedNumber)
            : analysis.repairedNumber;

        if (options.castToNumber) {
          f.properties[columnName] = numVal;
        } else {
          const decSep = options.decimalOutputSeparator || '.';
          f.properties[columnName] = decSep === ',' ? String(numVal).replace('.', ',') : String(numVal);
        }
        repairedCount++;
        continue;
      }
    }

    if (analysis.status === 'non_numeric_sentinel' && options.convertSentinelsToNull !== false) {
      f.properties[columnName] = null;
      nullifiedSentinelsCount++;
      continue;
    }

    unchangedCount++;
  }

  const nextGeoJson = {
    ...(dataset.geojson || { type: 'FeatureCollection' }),
    type: 'FeatureCollection',
    features,
  };

  return {
    updatedDataset: {
      ...dataset,
      geojson: nextGeoJson,
      fields: extractSchemaFields(nextGeoJson),
    },
    repairedCount,
    nullifiedSentinelsCount,
    unchangedCount,
  };
}

export function transformColumnCase(
  dataset: SpatialDataset,
  columnName: string,
  mode: TextCaseMode
): {
  updatedDataset: SpatialDataset;
  modifiedCount: number;
} {
  const features = (dataset.geojson?.features || []).map((f: any) => ({
    ...f,
    properties: { ...(f.properties || {}) },
  }));

  let modifiedCount = 0;
  for (const f of features) {
    const raw = f.properties[columnName];
    if (typeof raw !== 'string') continue;
    const next = applyTextCaseTransform(raw, mode);
    if (next !== raw) {
      f.properties[columnName] = next;
      modifiedCount++;
    }
  }

  const nextGeoJson = {
    ...(dataset.geojson || { type: 'FeatureCollection' }),
    type: 'FeatureCollection',
    features,
  };

  return {
    updatedDataset: {
      ...dataset,
      geojson: nextGeoJson,
      fields: extractSchemaFields(nextGeoJson),
    },
    modifiedCount,
  };
}

export function transformColumnSeparators(
  dataset: SpatialDataset,
  columnName: string,
  options: SeparatorCleanOptions
): {
  updatedDataset: SpatialDataset;
  modifiedCount: number;
} {
  const features = (dataset.geojson?.features || []).map((f: any) => ({
    ...f,
    properties: { ...(f.properties || {}) },
  }));

  let modifiedCount = 0;
  for (const f of features) {
    const raw = f.properties[columnName];
    if (raw === null || raw === undefined) continue;
    const str = String(raw);
    let next: any = raw;

    if (options.mode === 'collapse_malformed_decimals') {
      if (typeof raw === 'string') {
        const analysis = analyzeNumericCandidate(raw, false);
        if (analysis.status === 'malformed_recoverable' && analysis.repairedNumber !== null) {
          // Keep original single decimal style unless ambiguous: normalize ',.' or '.,' -> '.'
          next = String(analysis.repairedNumber);
        } else if (/[.,]{2,}/.test(str)) {
          next = str.replace(/[.,]+/g, '.');
        }
      }
    } else if (options.mode === 'decimal_comma_to_dot') {
      if (typeof raw === 'string') {
        const analysis = analyzeNumericCandidate(raw, false);
        if (analysis.repairedNumber !== null) {
          next = String(analysis.repairedNumber);
        } else {
          next = str.replace(/(\d),(\d)/g, '$1.$2');
        }
      }
    } else if (options.mode === 'decimal_dot_to_comma') {
      const analysis = analyzeNumericCandidate(raw, false);
      if (analysis.repairedNumber !== null) {
        next = String(analysis.repairedNumber).replace('.', ',');
      } else if (typeof raw === 'string') {
        next = str.replace(/(\d)\.(\d)/g, '$1,$2');
      }
    } else if (options.mode === 'replace_delimiter') {
      const from = options.fromDelimiter ?? '';
      const to = options.toDelimiter ?? '';
      if (from !== '' && typeof raw === 'string') {
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.trimAroundDelimiter) {
          const re = new RegExp(`\\s*${escaped}\\s*`, 'g');
          next = str.replace(re, to);
        } else {
          const re = new RegExp(escaped, 'g');
          next = str.replace(re, to);
        }
      }
    }

    if (next !== raw) {
      f.properties[columnName] = next;
      modifiedCount++;
    }
  }

  const nextGeoJson = {
    ...(dataset.geojson || { type: 'FeatureCollection' }),
    type: 'FeatureCollection',
    features,
  };

  return {
    updatedDataset: {
      ...dataset,
      geojson: nextGeoJson,
      fields: extractSchemaFields(nextGeoJson),
    },
    modifiedCount,
  };
}

export function patchDatasetCellValue(
  dataset: SpatialDataset,
  featureIndex: number,
  columnName: string,
  nextValue: any
): SpatialDataset {
  const features = (dataset.geojson?.features || []).map((f: any, idx: number) => {
    if (idx !== featureIndex) return f;
    return {
      ...f,
      properties: {
        ...(f.properties || {}),
        [columnName]: nextValue,
      },
    };
  });

  const nextGeoJson = {
    ...(dataset.geojson || { type: 'FeatureCollection' }),
    type: 'FeatureCollection',
    features,
  };

  return {
    ...dataset,
    geojson: nextGeoJson,
    fields: extractSchemaFields(nextGeoJson),
  };
}

export function autoCleanAllBlockedNumericColumns(dataset: SpatialDataset): {
  updatedDataset: SpatialDataset;
  columnsFixed: number;
  cellsRepaired: number;
} {
  const audit = auditDatasetAttributes(dataset);
  let current = dataset;
  let columnsFixed = 0;
  let cellsRepaired = 0;

  for (const col of audit.columns) {
    if (col.isBlockedNumericCast || col.malformedNumericCount > 0) {
      const res = repairColumnNumbers(current, col.columnName, {
        castToNumber: col.isMajorityNumeric,
        targetNumericKind: col.hasDecimalFloat ? 'double' : 'auto',
        stripStrayUnits: true,
        convertSentinelsToNull: true,
        fixMalformedSeparators: true,
      });
      current = res.updatedDataset;
      if (res.repairedCount + res.nullifiedSentinelsCount > 0) {
        columnsFixed++;
        cellsRepaired += res.repairedCount + res.nullifiedSentinelsCount;
      }
    }
  }

  return {
    updatedDataset: current,
    columnsFixed,
    cellsRepaired,
  };
}
