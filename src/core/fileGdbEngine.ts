/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import {
  SpatialDataset,
  GeometryType,
  CRSInfo,
  DefinedRelationship,
} from '../types/gis';
import { COMMON_CRS_LIST, getCRSByCode } from './crsDefinitions';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

export interface DiscoveredGdbRelationship {
  name: string;
  originTable: string;
  destinationTable: string;
  originPrimaryKey?: string;
  originForeignKey?: string;
  cardinality?: '1:1' | '1:N' | 'N:M';
}

export interface GdbLayerSummary {
  internalFileName: string;
  tableName: string;
  geometryType: GeometryType;
  isNonSpatial: boolean;
  featureCount: number;
  crsCode: string;
  crsName: string;
  comment?: string;
  fieldNames: string[];
}

export interface GdbInspectionResult {
  gdbName: string;
  layers: GdbLayerSummary[];
  discoveredRelationships: DiscoveredGdbRelationship[];
  diagnostics?: string[];
}

interface ParsedFieldDescriptor {
  name: string;
  alias: string;
  fieldType: number; // 0=int16,1=int32,2=float32,3=float64,4=string,5=date,6=oid,7=geom,8=blob,10/11=guid,12=xml,13=int64
  width: number;
  flag: number;
  nullable: boolean;
  wkt?: string;
  geomFlags?: number;
  hasZ?: boolean;
  hasM?: boolean;
  xOrigin?: number;
  yOrigin?: number;
  xyScale?: number;
  mOrigin?: number;
  mScale?: number;
  zOrigin?: number;
  zScale?: number;
}

interface ParsedGdbTable {
  fileName: string;
  tableName: string;
  geomTypeCode: number;
  fields: ParsedFieldDescriptor[];
  rows: { oid: number; props: Record<string, any>; geometry: any }[];
}

// ============================================================================
// Low-level Binary Readers / Writers (OpenFileGDB v10+)
// ============================================================================

class ByteReader {
  public pos: number = 0;
  private view: DataView;
  public bytes: Uint8Array;

  constructor(buffer: Uint8Array | ArrayBuffer, startOffset = 0) {
    this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.pos = startOffset;
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  readU8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  readI16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readU16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readI32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU64(): number {
    const low = this.view.getUint32(this.pos, true);
    const high = this.view.getUint32(this.pos + 4, true);
    this.pos += 8;
    return high * 4294967296 + low;
  }

  readI64(): number {
    const low = this.view.getUint32(this.pos, true);
    const high = this.view.getInt32(this.pos + 4, true);
    this.pos += 8;
    return high * 4294967296 + low;
  }

  readF32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readF64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  readBytes(len: number): Uint8Array {
    const slice = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  readUtf16(charCount: number): string {
    const byteLen = charCount * 2;
    const slice = this.readBytes(byteLen);
    try {
      return new TextDecoder('utf-16le').decode(slice).replace(/\0+$/, '');
    } catch {
      let out = '';
      for (let i = 0; i + 1 < slice.length; i += 2) {
        const code = slice[i] | (slice[i + 1] << 8);
        if (code !== 0) out += String.fromCharCode(code);
      }
      return out;
    }
  }

  readUtf8(byteLen: number): string {
    const slice = this.readBytes(byteLen);
    return new TextDecoder('utf-8').decode(slice);
  }

  readVarUInt(): number {
    let val = 0;
    let multiplier = 1;
    while (this.pos < this.bytes.length) {
      const b = this.bytes[this.pos++];
      val += (b & 0x7f) * multiplier;
      if ((b & 0x80) === 0) break;
      multiplier *= 128;
    }
    return val;
  }

  readVarInt(): number {
    if (this.pos >= this.bytes.length) return 0;
    const b0 = this.bytes[this.pos++];
    const negative = (b0 & 0x40) !== 0;
    let val = b0 & 0x3f;
    if ((b0 & 0x80) !== 0) {
      let multiplier = 64;
      while (this.pos < this.bytes.length) {
        const b = this.bytes[this.pos++];
        val += (b & 0x7f) * multiplier;
        if ((b & 0x80) === 0) break;
        multiplier *= 128;
      }
    }
    return negative ? -val : val;
  }
}

class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  public length: number = 0;

  constructor(initialCapacity = 4096) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number) {
    const needed = this.length + extra;
    if (needed <= this.buf.length) return;
    let nextCap = this.buf.length * 2;
    while (nextCap < needed) nextCap *= 2;
    const next = new Uint8Array(nextCap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  writeU8(v: number) {
    this.ensure(1);
    this.view.setUint8(this.length, v & 0xff);
    this.length += 1;
  }

  writeI16(v: number) {
    this.ensure(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
  }

  writeU16(v: number) {
    this.ensure(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }

  writeI32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }

  writeU32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.length, v >>> 0, true);
    this.length += 4;
  }

  writeU64(v: number) {
    this.ensure(8);
    const low = v % 4294967296;
    const high = Math.floor(v / 4294967296);
    this.view.setUint32(this.length, low >>> 0, true);
    this.view.setUint32(this.length + 4, high >>> 0, true);
    this.length += 8;
  }

  writeUIntN(v: number, byteSize: number) {
    let rem = Math.max(0, Math.floor(v));
    for (let i = 0; i < byteSize; i++) {
      this.writeU8(rem % 256);
      rem = Math.floor(rem / 256);
    }
  }

  writeF64(v: number) {
    this.ensure(8);
    this.view.setFloat64(this.length, v, true);
    this.length += 8;
  }

  writeBytes(arr: Uint8Array) {
    this.ensure(arr.length);
    this.buf.set(arr, this.length);
    this.length += arr.length;
  }

  writeUtf16WithCharLen(str: string) {
    const clean = str.slice(0, 250);
    this.writeU8(clean.length);
    for (let i = 0; i < clean.length; i++) {
      this.writeU16(clean.charCodeAt(i));
    }
  }

  writeUtf16Raw(str: string): Uint8Array {
    const out = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      out[i * 2] = c & 0xff;
      out[i * 2 + 1] = (c >> 8) & 0xff;
    }
    return out;
  }

  writeVarUInt(rawVal: number) {
    let v = Math.max(0, Math.floor(rawVal));
    while (v >= 128) {
      this.writeU8((v % 128) | 0x80);
      v = Math.floor(v / 128);
    }
    this.writeU8(v);
  }

  writeVarInt(rawVal: number) {
    const negative = rawVal < 0;
    let absVal = Math.round(Math.abs(rawVal));
    let first = absVal % 64;
    absVal = Math.floor(absVal / 64);
    if (negative) first |= 0x40;
    if (absVal > 0) {
      this.writeU8(first | 0x80);
      this.writeVarUInt(absVal);
    } else {
      this.writeU8(first);
    }
  }

  patchU32(offset: number, v: number) {
    this.view.setUint32(offset, v >>> 0, true);
  }

  patchU64(offset: number, v: number) {
    const low = v % 4294967296;
    const high = Math.floor(v / 4294967296);
    this.view.setUint32(offset, low >>> 0, true);
    this.view.setUint32(offset + 4, high >>> 0, true);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

// ============================================================================
// Helpers: Detection, Date, GUID, WKT CRS & Polygon Ring Winding
// ============================================================================

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function daysToIsoDate(days: number): string | null {
  if (!Number.isFinite(days)) return null;
  const ms = EXCEL_EPOCH_MS + days * 86400000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoOrValueToDays(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    return (val - EXCEL_EPOCH_MS) / 86400000;
  }
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return null;
  return (d.getTime() - EXCEL_EPOCH_MS) / 86400000;
}

function formatGuid(bytes: Uint8Array): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const p1 = `${hex(bytes[3])}${hex(bytes[2])}${hex(bytes[1])}${hex(bytes[0])}`;
  const p2 = `${hex(bytes[5])}${hex(bytes[4])}`;
  const p3 = `${hex(bytes[7])}${hex(bytes[6])}`;
  const p4 = `${hex(bytes[8])}${hex(bytes[9])}`;
  const p5 = `${hex(bytes[10])}${hex(bytes[11])}${hex(bytes[12])}${hex(bytes[13])}${hex(bytes[14])}${hex(bytes[15])}`;
  return `{${p1}-${p2}-${p3}-${p4}-${p5}}`;
}

function signedRingArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return area / 2;
}

function pointInRing(point: number[], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function groupPolygonRings(rings: number[][][]): number[][][][] {
  const ringAreas = rings.map((ring) => Math.abs(signedRingArea(ring)));
  if (rings.length > 256) {
    // Avoid quadratic containment checks for unusually high-part-count features.
    let largestRingIndex = 0;
    for (let index = 1; index < ringAreas.length; index++) {
      if (ringAreas[index] > ringAreas[largestRingIndex]) largestRingIndex = index;
    }
    const exteriorOrientation = Math.sign(signedRingArea(rings[largestRingIndex])) || -1;
    const polygons: number[][][][] = [];
    for (const ring of rings) {
      if (Math.sign(signedRingArea(ring)) === exteriorOrientation || polygons.length === 0) {
        polygons.push([ring]);
      } else {
        polygons[polygons.length - 1].push(ring);
      }
    }
    return polygons;
  }

  const parents = rings.map((_ring, index) => {
    let parentIndex = -1;
    let parentArea = Infinity;
    for (let candidateIndex = 0; candidateIndex < rings.length; candidateIndex++) {
      if (
        candidateIndex === index ||
        ringAreas[candidateIndex] <= ringAreas[index] ||
        ringAreas[candidateIndex] >= parentArea
      ) {
        continue;
      }
      if (pointInRing(rings[index][0], rings[candidateIndex])) {
        parentIndex = candidateIndex;
        parentArea = ringAreas[candidateIndex];
      }
    }
    return parentIndex;
  });

  const depths = rings.map((_ring, index) => {
    let depth = 0;
    let parentIndex = parents[index];
    while (parentIndex !== -1) {
      depth++;
      parentIndex = parents[parentIndex];
    }
    return depth;
  });

  const polygons: number[][][][] = [];
  const polygonByRingIndex = new Map<number, number[][][]>();
  for (let index = 0; index < rings.length; index++) {
    if (depths[index] % 2 === 0) {
      const polygon = [rings[index]];
      polygons.push(polygon);
      polygonByRingIndex.set(index, polygon);
    }
  }

  for (let index = 0; index < rings.length; index++) {
    if (depths[index] % 2 === 0) continue;
    let exteriorIndex = parents[index];
    while (exteriorIndex !== -1 && depths[exteriorIndex] % 2 !== 0) {
      exteriorIndex = parents[exteriorIndex];
    }
    const polygon = exteriorIndex === -1 ? undefined : polygonByRingIndex.get(exteriorIndex);
    if (polygon) polygon.push(rings[index]);
  }

  return polygons;
}

function detectCrsFromWkt(wkt?: string): CRSInfo {
  const wgs84 = getCRSByCode('EPSG:4326') || COMMON_CRS_LIST[0];
  if (!wkt || !wkt.trim()) return wgs84;

  const epsgMatch = wkt.match(/AUTHORITY\["EPSG"\s*,\s*"?(\d+)"?\]/i);
  if (epsgMatch) {
    const found = getCRSByCode(`EPSG:${epsgMatch[1]}`);
    if (found) return found;
    return {
      code: `EPSG:${epsgMatch[1]}`,
      name: extractWktName(wkt) || `EPSG:${epsgMatch[1]}`,
      area: 'From FileGDB Spatial Reference',
      proj4: '',
      wkt,
      isGeographic: /GEOGCS\[/i.test(wkt) && !/PROJCS\[/i.test(wkt),
      unit: /UNIT\["Meter/i.test(wkt) || /UNIT\["metre/i.test(wkt) ? 'meters' : 'degrees',
    };
  }

  const lower = wkt.toLowerCase();
  if (lower.includes('wgs_1984_web_mercator') || lower.includes('3857')) {
    return getCRSByCode('EPSG:3857') || wgs84;
  }
  if (lower.includes('rgf93_lambert_93') || lower.includes('lambert_93')) {
    return getCRSByCode('EPSG:2154') || wgs84;
  }
  if (lower.includes('merchich') && lower.includes('sud')) {
    return getCRSByCode('EPSG:26192') || getCRSByCode('EPSG:4261') || wgs84;
  }
  if (lower.includes('nord_maroc') || (lower.includes('merchich') && lower.includes('nord'))) {
    return getCRSByCode('EPSG:26191') || getCRSByCode('EPSG:4261') || wgs84;
  }
  if (lower.includes('sud_maroc') || (lower.includes('merchich') && lower.includes('sud'))) {
    return getCRSByCode('EPSG:26192') || getCRSByCode('EPSG:4261') || wgs84;
  }
  const utmMatch = wkt.match(/UTM_Zone_(\d{1,2})([NS])/i);
  if (utmMatch && lower.includes('wgs_1984')) {
    const zone = Number(utmMatch[1]);
    const hemiPrefix = utmMatch[2].toUpperCase() === 'S' ? '327' : '326';
    const epsg = `EPSG:${hemiPrefix}${String(zone).padStart(2, '0')}`;
    const found = getCRSByCode(epsg);
    if (found) return found;
  }
  if (lower.includes('gcs_wgs_1984') || lower.includes('wgs_1984')) {
    return wgs84;
  }
  return wgs84;
}

function extractWktName(wkt: string): string {
  const m = wkt.match(/^(?:PROJCS|GEOGCS)\["([^"]+)"/i);
  return m ? m[1] : '';
}

function crsToEsriWkt(crs: CRSInfo | null): string {
  const code = crs?.code?.toUpperCase() || 'EPSG:4326';
  if (code === 'EPSG:3857') {
    return 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0],AUTHORITY["EPSG",3857]]';
  }
  if (crs?.wkt) return crs.wkt;
  const epsgNum = code.replace(/^EPSG:/i, '');
  if (crs && !crs.isGeographic && /^\d+$/.test(epsgNum)) {
    return `PROJCS["${crs.name.replace(/"/g, '')}",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],UNIT["Meter",1.0],AUTHORITY["EPSG",${epsgNum}]]`;
  }
  return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG",4326]]';
}

const uploadedRelPathMap = new WeakMap<File, string>();

export function registerUploadedFileRelativePath(file: File, relPath: string): void {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  uploadedRelPathMap.set(file, normalized);
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: normalized,
      writable: true,
      configurable: true,
    });
  } catch {
    // Fallback handled via uploadedRelPathMap
  }
}

export function getUploadedFileRelativePath(file: File): string {
  const mapped = uploadedRelPathMap.get(file);
  if (mapped) return mapped;
  return ((file as any).webkitRelativePath || file.name || '').replace(/\\/g, '/');
}

function isOsJunkFile(pathOrName: string): boolean {
  const normalized = pathOrName.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const base = lower.split('/').pop() || '';
  return (
    lower.includes('__macosx/') ||
    base.startsWith('._') ||
    base === '.ds_store' ||
    base === 'thumbs.db' ||
    base.endsWith('.lock') ||
    base.endsWith('.sr.lock')
  );
}

export function isFileGdbFolderFiles(files: File[]): boolean {
  return files.some((f) => {
    if (isOsJunkFile(getUploadedFileRelativePath(f))) return false;
    const rel = getUploadedFileRelativePath(f).toLowerCase();
    const base = f.name.toLowerCase();
    return rel.includes('.gdb/') || base.endsWith('.gdbtable') || base.endsWith('.gdbtablx') || base.endsWith('.cdf') || base === 'gdb';
  });
}

export function groupFileGdbFolderUploads(files: File[]): {
  gdbBundles: { name: string; files: File[] }[];
  remainingFiles: File[];
} {
  const bundleMap = new Map<string, File[]>();
  const bundleKeyToName = new Map<string, string>();
  const remainingFiles: File[] = [];

  for (const file of files) {
    const rel = getUploadedFileRelativePath(file);
    if (isOsJunkFile(rel)) continue;
    const gdbMatch = rel.match(/^(.*?\/)?([^/]+\.gdb)\//i);
    if (gdbMatch) {
      const fullFolderKey = `${(gdbMatch[1] || '').toLowerCase()}${gdbMatch[2].toLowerCase()}`;
      const bundleName = gdbMatch[2];
      bundleKeyToName.set(fullFolderKey, bundleName);
      const existing = bundleMap.get(fullFolderKey) || [];
      existing.push(file);
      bundleMap.set(fullFolderKey, existing);
    } else if (
      file.name.toLowerCase().endsWith('.gdbtable') ||
      file.name.toLowerCase().endsWith('.gdbtablx') ||
      file.name.toLowerCase().endsWith('.cdf') ||
      file.name.toLowerCase() === 'gdb' ||
      file.name.toLowerCase() === 'timestamps'
    ) {
      const key = '__loose_gdb__';
      bundleKeyToName.set(key, 'imported_geodatabase.gdb');
      const existing = bundleMap.get(key) || [];
      existing.push(file);
      bundleMap.set(key, existing);
    } else {
      remainingFiles.push(file);
    }
  }

  const gdbBundles = Array.from(bundleMap.entries()).map(([key, bundleFiles]) => ({
    name: bundleKeyToName.get(key) || 'imported_geodatabase.gdb',
    files: bundleFiles,
  }));

  return { gdbBundles, remainingFiles };
}

export async function isFileGdbZipArchive(file: File): Promise<boolean> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.zip') && !lower.endsWith('.gdb.zip')) return false;
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const keys = Object.keys(zip.files)
      .filter((k) => !isOsJunkFile(k))
      .map((k) => k.replace(/\\/g, '/').toLowerCase());
    return keys.some(
      (k) =>
        k.endsWith('.gdbtable') ||
        k.endsWith('.cdf') ||
        k.endsWith('/gdb') ||
        k === 'gdb' ||
        /\.gdb\//i.test(k)
    );
  } catch {
    return false;
  }
}

export async function splitFileGdbZipBundles(
  file: File
): Promise<{ name: string; sourceInput: File | File[] }[]> {
  const maps = await collectGdbFileMaps(file);
  if (maps.length <= 1) {
    return [{ name: maps[0]?.gdbName || file.name, sourceInput: file }];
  }
  return maps.map((m) => {
    const virtualFiles: File[] = [];
    for (const [base, data] of m.entries.entries()) {
      const f = new File([data.slice().buffer], base);
      registerUploadedFileRelativePath(f, `${m.gdbName}/${base}`);
      virtualFiles.push(f);
    }
    return { name: m.gdbName, sourceInput: virtualFiles };
  });
}

// ============================================================================
// Binary Table Parser (.gdbtable + optional .gdbtablx)
// ============================================================================

async function collectGdbFileMaps(
  input: File | File[]
): Promise<{ gdbName: string; entries: Map<string, Uint8Array>; hasCdfFiles: boolean }[]> {
  if (Array.isArray(input)) {
    const entries = new Map<string, Uint8Array>();
    let gdbName = 'geodatabase.gdb';
    let hasCdfFiles = false;

    for (const f of input) {
      const rel = getUploadedFileRelativePath(f);
      if (isOsJunkFile(rel)) continue;
      const m = rel.match(/([^/]+\.gdb)\//i);
      if (m) gdbName = m[1];
      const base = rel.split('/').pop()!.toLowerCase();
      if (base.endsWith('.cdf')) hasCdfFiles = true;
      entries.set(base, new Uint8Array(await f.arrayBuffer()));
    }
    return [{ gdbName, entries, hasCdfFiles }];
  }

  const lowerName = input.name.toLowerCase();
  if (lowerName.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await input.arrayBuffer());
    const rawKeys = Object.keys(zip.files).filter((k) => !isOsJunkFile(k));

    // Group entries by .gdb folder when a zip contains one or more .gdb directories
    const grouped = new Map<string, { gdbName: string; entries: Map<string, Uint8Array>; hasCdfFiles: boolean }>();

    for (const key of rawKeys) {
      const entry = zip.files[key];
      if (entry.dir) continue;
      const normKey = key.replace(/\\/g, '/');
      const m = normKey.match(/^(.*?\/)?([^/]+\.gdb)\//i);
      const groupId = m ? `${(m[1] || '').toLowerCase()}${m[2].toLowerCase()}` : '__root__';
      const defaultName = m ? m[2] : (input.name.replace(/(\.gdb)?\.zip$/i, '') + '.gdb');

      if (!grouped.has(groupId)) {
        grouped.set(groupId, {
          gdbName: defaultName,
          entries: new Map<string, Uint8Array>(),
          hasCdfFiles: false,
        });
      }

      const bucket = grouped.get(groupId)!;
      const base = normKey.split('/').pop()!.toLowerCase();
      if (base.endsWith('.cdf')) bucket.hasCdfFiles = true;
      bucket.entries.set(base, await entry.async('uint8array'));
    }

    // If zip had both a __root__ and named .gdb folders, keep only groups with actual GDB artifacts
    const result = Array.from(grouped.values()).filter((g) => {
      const keys = Array.from(g.entries.keys());
      return keys.some((k) => k.endsWith('.gdbtable') || k.endsWith('.cdf') || k === 'gdb');
    });

    if (result.length > 0) return result;
    return Array.from(grouped.values());
  }

  const entries = new Map<string, Uint8Array>();
  entries.set(lowerName, new Uint8Array(await input.arrayBuffer()));
  return [{
    gdbName: input.name.replace(/\.[^.]+$/, '') + '.gdb',
    entries,
    hasCdfFiles: lowerName.endsWith('.cdf'),
  }];
}

async function collectGdbFileMap(
  input: File | File[]
): Promise<{ gdbName: string; entries: Map<string, Uint8Array>; hasCdfFiles: boolean }> {
  const maps = await collectGdbFileMaps(input);
  if (maps.length === 1) return maps[0];

  // Merge when multiple .gdb folders live in a single archive by prefixing keys only if colliding
  // Note: inspectFileGdb and parseFileGdbLayers handle multi-bundle arrays cleanly via collectGdbFileMaps
  return maps[0] || {
    gdbName: 'geodatabase.gdb',
    entries: new Map<string, Uint8Array>(),
    hasCdfFiles: false,
  };
}

interface TablxRowOffset {
  oid: number;
  offset: number;
}

function parseTablxOffsets(tablxBytes?: Uint8Array): TablxRowOffset[] | null {
  if (!tablxBytes || tablxBytes.length < 16) return null;
  const r = new ByteReader(tablxBytes);
  const sig = r.readU32();
  if (sig !== 3) return null;
  const n1024Blocks = r.readU32();
  const nMaxRows = r.readU32();
  const sizeOffsets = r.readU32();
  if (sizeOffsets < 4 || sizeOffsets > 6) return null;

  if (n1024Blocks === 0) {
    return nMaxRows === 0 ? [] : null;
  }

  const maxPhysicalSlots = Math.floor((tablxBytes.length - 16) / sizeOffsets);
  const physicalSlots = Math.min(n1024Blocks * 1024, maxPhysicalSlots);
  if (physicalSlots <= 0) return null;

  // Check optional sparse block bitmap trailer located right after the offset table
  const physicalToLogicalBlock = new Map<number, number>();
  const trailerOffset = 16 + n1024Blocks * 1024 * sizeOffsets;
  if (trailerOffset + 16 <= tablxBytes.length) {
    const dvTrailer = new DataView(tablxBytes.buffer, tablxBytes.byteOffset + trailerOffset, tablxBytes.length - trailerOffset);
    const nBitmapInt32Words = dvTrailer.getUint32(0, true);
    const nBitsForBlockMap = dvTrailer.getUint32(4, true);
    const nPhysicalBlocksTrailer = dvTrailer.getUint32(8, true);
    if (
      nBitmapInt32Words > 0 &&
      nPhysicalBlocksTrailer === n1024Blocks &&
      trailerOffset + 16 + nBitmapInt32Words * 4 <= tablxBytes.length
    ) {
      let physIdx = 0;
      const bitmapStart = trailerOffset + 16;
      const maxBits = Math.min(nBitsForBlockMap, nBitmapInt32Words * 32);
      for (let bitIdx = 0; bitIdx < maxBits && physIdx < n1024Blocks; bitIdx++) {
        const byteVal = tablxBytes[bitmapStart + (bitIdx >> 3)];
        if ((byteVal & (1 << (bitIdx & 7))) !== 0) {
          physicalToLogicalBlock.set(physIdx, bitIdx);
          physIdx++;
        }
      }
    }
  }

  const rows: TablxRowOffset[] = [];
  for (let i = 0; i < physicalSlots; i++) {
    let off = 0;
    let mult = 1;
    const base = 16 + i * sizeOffsets;
    for (let b = 0; b < sizeOffsets; b++) {
      off += tablxBytes[base + b] * mult;
      mult *= 256;
    }
    if (off > 0) {
      const physBlock = Math.floor(i / 1024);
      const slotInBlock = i & 1023;
      const logicalBlock = physicalToLogicalBlock.get(physBlock) ?? physBlock;
      rows.push({
        oid: logicalBlock * 1024 + slotInBlock + 1,
        offset: off,
      });
    }
  }
  return rows;
}

function isValidUtf16Identifier(bytes: Uint8Array, pos: number, charLen: number): boolean {
  if (charLen < 1 || charLen > 128) return false;
  if (pos + charLen * 2 > bytes.length) return false;
  for (let c = 0; c < charLen; c++) {
    const code = bytes[pos + c * 2] | (bytes[pos + c * 2 + 1] << 8);
    if (code === 0 || code < 32) return false;
  }
  return true;
}

function isValidFieldHeaderAt(
  bytes: Uint8Array,
  pos: number,
  sectionEndOffset: number
): { nextMinPos: number; fieldType: number } | null {
  if (pos < 0 || pos + 5 > sectionEndOffset) return null;
  const nameLen = bytes[pos];
  if (!isValidUtf16Identifier(bytes, pos + 1, nameLen)) return null;
  const aliasPos = pos + 1 + nameLen * 2;
  if (aliasPos + 2 > sectionEndOffset) return null;
  const aliasLen = bytes[aliasPos];
  if (aliasLen > 128 || aliasPos + 1 + aliasLen * 2 + 3 > sectionEndOffset) return null;
  // Verify alias chars have no null control characters when non-empty
  for (let c = 0; c < aliasLen; c++) {
    const code = bytes[aliasPos + 1 + c * 2] | (bytes[aliasPos + 1 + c * 2 + 1] << 8);
    if (code === 0) return null;
  }
  const typePos = aliasPos + 1 + aliasLen * 2;
  const fieldType = bytes[typePos];
  if (fieldType > 16) return null;
  return { nextMinPos: typePos + 3, fieldType };
}

function resolveGeometrySectionEndOffset(
  tableBytes: Uint8Array,
  posAfterXYBox: number,
  hasZ: boolean,
  hasM: boolean,
  sectionEndOffset: number,
  isLastField: boolean
): number {
  if (isLastField) return sectionEndOffset;

  const dv = new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.length);
  const candidates: number[] = [];

  const zmVariants: number[] = [];
  const exactZmBytes = (hasZ ? 16 : 0) + (hasM ? 16 : 0);
  zmVariants.push(exactZmBytes);
  if (hasZ && hasM) zmVariants.push(16, 0);
  else if (hasZ || hasM) zmVariants.push(0);

  for (const zmExtra of zmVariants) {
    for (const magicByte of [1, 0]) {
      const gridCountPos = posAfterXYBox + zmExtra + magicByte;
      if (gridCountPos + 4 <= sectionEndOffset) {
        const numGrids = dv.getUint32(gridCountPos, true);
        if (numGrids <= 8) {
          const afterGrids = gridCountPos + 4 + numGrids * 8;
          if (afterGrids <= sectionEndOffset) candidates.push(afterGrids);
        }
      }
      if (gridCountPos <= sectionEndOffset) {
        candidates.push(gridCountPos);
      }
    }
  }

  for (const cand of candidates) {
    if (isValidFieldHeaderAt(tableBytes, cand, sectionEndOffset)) {
      return cand;
    }
  }

  // Fallback bounded scan for the next valid field header when ArcGIS emits extra Z/M or spatial index bytes
  const scanLimit = Math.min(sectionEndOffset, posAfterXYBox + 160);
  for (let probe = posAfterXYBox; probe < scanLimit; probe++) {
    if (isValidFieldHeaderAt(tableBytes, probe, sectionEndOffset)) {
      return probe;
    }
  }

  return Math.min(sectionEndOffset, posAfterXYBox);
}

function parseFieldDescriptions(tableBytes: Uint8Array, fieldDescOffset: number): {
  geomTypeCode: number;
  fields: ParsedFieldDescriptor[];
  sectionEndOffset: number;
} {
  const r = new ByteReader(tableBytes, fieldDescOffset);
  if (r.remaining < 14) {
    return { geomTypeCode: 0, fields: [], sectionEndOffset: fieldDescOffset };
  }
  const descSize = r.readU32();
  const sectionEndOffset = Math.min(tableBytes.length, fieldDescOffset + 4 + descSize);
  const _version = r.readU32();
  const geomTypeCode = r.readU8();
  const _geomFlagsBytes = r.readBytes(3);
  const nFields = r.readU16();
  const fields: ParsedFieldDescriptor[] = [];

  for (let i = 0; i < nFields && r.pos < sectionEndOffset; i++) {
    const isLastField = i === nFields - 1;
    if (r.pos + 2 > sectionEndOffset) break;
    const nameLen = r.readU8();
    if (r.pos + nameLen * 2 >= sectionEndOffset) break;
    const name = r.readUtf16(nameLen);
    if (r.pos >= sectionEndOffset) break;
    const aliasLen = r.readU8();
    if (r.pos + aliasLen * 2 >= sectionEndOffset) break;
    const alias = r.readUtf16(aliasLen);
    if (r.pos >= sectionEndOffset) break;
    const fieldType = r.readU8();

    if (fieldType === 4) {
      // String
      if (r.pos + 5 > sectionEndOffset) break;
      const width = r.readU32();
      const flag = r.readU8();
      if (r.pos >= sectionEndOffset) break;
      const defLen = r.readVarUInt();
      if (defLen > sectionEndOffset - r.pos) break;
      if (defLen > 0) {
        r.readBytes(defLen);
      }
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    } else if (fieldType === 6) {
      // ObjectID
      if (r.pos + 2 > sectionEndOffset) break;
      const width = r.readU8();
      const flag = r.readU8();
      fields.push({ name, alias, fieldType, width, flag, nullable: false });
    } else if (fieldType === 7) {
      // Geometry
      if (r.pos + 4 > sectionEndOffset) break;
      const width = r.readU8();
      const flag = r.readU8();
      const wktByteLen = r.readU16();
      const wktBytes = r.readBytes(Math.min(wktByteLen, Math.max(0, sectionEndOffset - r.pos)));
      const wkt = new TextDecoder('utf-16le').decode(wktBytes).replace(/\0+$/, '');
      const geomFlags = r.pos < sectionEndOffset ? r.readU8() : 0;
      let hasM = (geomFlags & 2) !== 0;
      let hasZ = (geomFlags & 4) !== 0;
      let xOrigin = -400;
      let yOrigin = -400;
      let xyScale = 1000000000;
      let mOrigin = 0, mScale = 1, zOrigin = 0, zScale = 1;

      // Some tables with Unknown CRS (geomFlags === 0) omit origin/tolerance/bbox doubles entirely
      if (geomFlags === 0 && !isLastField && isValidFieldHeaderAt(tableBytes, r.pos, sectionEndOffset)) {
        hasM = false;
        hasZ = false;
      } else {
        xOrigin = r.pos + 8 <= sectionEndOffset ? r.readF64() : -400;
        yOrigin = r.pos + 8 <= sectionEndOffset ? r.readF64() : -400;
        xyScale = r.pos + 8 <= sectionEndOffset ? r.readF64() : 1000000000;
        if (hasM && r.pos + 16 <= sectionEndOffset) {
          mOrigin = r.readF64();
          mScale = r.readF64();
        }
        if (hasZ && r.pos + 16 <= sectionEndOffset) {
          zOrigin = r.readF64();
          zScale = r.readF64();
        }
        // xyTolerance (+ optional m/z tolerances)
        if (r.pos + 8 <= sectionEndOffset) r.readF64();
        if (hasM && r.pos + 8 <= sectionEndOffset) r.readF64();
        if (hasZ && r.pos + 8 <= sectionEndOffset) r.readF64();

        // Mandatory 2D Bounding box xmin, ymin, xmax, ymax
        if (r.pos + 32 <= sectionEndOffset) {
          r.pos += 32;
        } else {
          r.pos = sectionEndOffset;
        }

        // Resolve Z/M bbox, optional 0x00 separator, and spatial index grids without losing alignment on subsequent fields
        r.pos = resolveGeometrySectionEndOffset(
          tableBytes,
          r.pos,
          hasZ,
          hasM,
          sectionEndOffset,
          isLastField
        );
      }

      fields.push({
        name,
        alias,
        fieldType,
        width,
        flag,
        nullable: (flag & 1) !== 0,
        wkt,
        geomFlags,
        hasZ,
        hasM,
        xOrigin,
        yOrigin,
        xyScale: xyScale || 1000000000,
        mOrigin,
        mScale,
        zOrigin,
        zScale,
      });
    } else if (fieldType === 9) {
      // Raster field
      if (r.pos + 2 > sectionEndOffset) break;
      const width = r.readU8();
      const flag = r.readU8();
      if (r.pos < sectionEndOffset) {
        const rasColLen = r.readU8();
        r.pos = Math.min(sectionEndOffset, r.pos + rasColLen * 2);
      }
      if (r.pos + 2 <= sectionEndOffset) {
        const rasWktLen = r.readU16();
        r.pos = Math.min(sectionEndOffset, r.pos + rasWktLen);
      }
      if (!isLastField) {
        const scanLimit = Math.min(sectionEndOffset, r.pos + 160);
        for (let probe = r.pos; probe < scanLimit; probe++) {
          if (isValidFieldHeaderAt(tableBytes, probe, sectionEndOffset)) {
            r.pos = probe;
            break;
          }
        }
      } else {
        r.pos = sectionEndOffset;
      }
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    } else if (fieldType === 8 || fieldType === 10 || fieldType === 11 || fieldType === 12) {
      // Binary, GUID, GlobalID, or XML
      if (r.pos + 2 > sectionEndOffset) break;
      const width = r.readU8();
      const flag = r.readU8();
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    } else {
      // Fixed numeric, date, int64, and ArcGIS Pro date/time types
      if (r.pos + 2 > sectionEndOffset) break;
      const width = r.readU8();
      const flag = r.readU8();
      if (r.pos >= sectionEndOffset) break;
      const defLen = r.readU8();
      if (defLen > sectionEndOffset - r.pos) break;
      if (defLen > 0) {
        r.readBytes(defLen);
      }
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    }
  }

  return { geomTypeCode, fields, sectionEndOffset };
}

function decodeGdbGeometry(blob: Uint8Array, geomField: ParsedFieldDescriptor): any | null {
  if (!blob || blob.length === 0) return null;
  const r = new ByteReader(blob);
  const rawType = r.readVarUInt();
  const baseType = rawType & 0xff;
  if (baseType === 0) return null;

  const xOrigin = geomField.xOrigin ?? -400;
  const yOrigin = geomField.yOrigin ?? -400;
  const xyScale = geomField.xyScale || 1000000000;

  // Point types: 1=Point, 9=PointZM, 11=PointZ, 21=PointM, 52=GeneralPoint
  if (baseType === 1 || baseType === 9 || baseType === 11 || baseType === 21 || baseType === 52) {
    if (r.remaining === 0) return null;
    const viX = r.readVarUInt();
    if (r.remaining === 0) return null;
    const viY = r.readVarUInt();
    if (viX === 0 && viY === 0) return null;
    const x = (viX - 1) / xyScale + xOrigin;
    const y = (viY - 1) / xyScale + yOrigin;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { type: 'Point', coordinates: [x, y] };
  }

  // MultiPoint: 8, 18, 20, 28, 53=GeneralMultiPoint
  if (baseType === 8 || baseType === 18 || baseType === 20 || baseType === 28 || baseType === 53) {
    const nPts = r.readVarUInt();
    if (nPts === 0 || nPts > 5000000) return null;
    // BBox: xmin, ymin, dx, dy
    r.readVarUInt(); r.readVarUInt(); r.readVarUInt(); r.readVarUInt();
    const coords: [number, number][] = [];
    let accX = 0;
    let accY = 0;
    for (let i = 0; i < nPts && r.remaining > 0; i++) {
      accX += r.readVarInt();
      accY += r.readVarInt();
      coords.push([accX / xyScale + xOrigin, accY / xyScale + yOrigin]);
    }
    if (coords.length === 0) return null;
    return coords.length === 1
      ? { type: 'Point', coordinates: coords[0] }
      : { type: 'MultiPoint', coordinates: coords };
  }

  // Polyline (3, 10, 13, 23, 50=GeneralPolyline) & Polygon (5, 15, 19, 25, 51=GeneralPolygon)
  const isPolygon = baseType === 5 || baseType === 15 || baseType === 19 || baseType === 25 || baseType === 51;
  const isPolyline = baseType === 3 || baseType === 10 || baseType === 13 || baseType === 23 || baseType === 50;
  if (!isPolygon && !isPolyline) return null;

  const nPts = r.readVarUInt();
  if (nPts === 0 || nPts > 5000000) return null;
  const nParts = r.readVarUInt();
  if (nParts === 0 || nParts > 1000000) return null;

  const hasCurves = (rawType & 0x20000000) !== 0;
  if (hasCurves && r.remaining > 0) {
    r.readVarUInt();
  }

  // BBox: xmin, ymin, dx, dy
  r.readVarUInt();
  r.readVarUInt();
  r.readVarUInt();
  r.readVarUInt();

  const partCounts: number[] = [];
  let sumPrev = 0;
  for (let p = 0; p < nParts - 1 && r.remaining > 0; p++) {
    const count = r.readVarUInt();
    partCounts.push(count);
    sumPrev += count;
  }
  partCounts.push(Math.max(0, nPts - sumPrev));

  const ringsOrLines: [number, number][][] = [];
  let accX = 0;
  let accY = 0;
  for (let p = 0; p < partCounts.length; p++) {
    const cnt = partCounts[p];
    const pts: [number, number][] = [];
    for (let i = 0; i < cnt && r.remaining > 0; i++) {
      accX += r.readVarInt();
      accY += r.readVarInt();
      pts.push([accX / xyScale + xOrigin, accY / xyScale + yOrigin]);
    }
    if (pts.length > 0) ringsOrLines.push(pts);
  }

  if (ringsOrLines.length === 0) return null;

  if (isPolyline) {
    return ringsOrLines.length === 1
      ? { type: 'LineString', coordinates: ringsOrLines[0] }
      : { type: 'MultiLineString', coordinates: ringsOrLines };
  }

  // Polygon: close rings if needed & group holes inside exterior rings
  const closedRings = ringsOrLines.map((ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      return [...ring, [first[0], first[1]]];
    }
    return ring;
  });

  const polygons = groupPolygonRings(closedRings);
  if (polygons.length === 1) {
    return { type: 'Polygon', coordinates: polygons[0] };
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function isPlausibleFieldDescOffset(tableBytes: Uint8Array, offset: number): boolean {
  if (!Number.isFinite(offset) || offset < 40 || offset + 14 > tableBytes.length) return false;
  const dv = new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.length);
  const descSize = dv.getUint32(offset, true);
  if (descSize < 10 || offset + 4 + descSize > tableBytes.length) return false;
  const version = dv.getUint32(offset + 4, true);
  return version === 3 || version === 4;
}

function resolveFieldDescOffsetFromHeader(tableBytes: Uint8Array, u64At24: number, u64At32: number): number {
  // Standard Esri / GDAL OpenFileGDB v10+ places fileSize at bytes 24..31 and fieldDescOffset at bytes 32..39
  if (isPlausibleFieldDescOffset(tableBytes, u64At32)) return u64At32;
  // Fallback for legacy single-file writers storing fieldDescOffset at bytes 24..31
  if (isPlausibleFieldDescOffset(tableBytes, u64At24)) return u64At24;
  if (u64At32 >= 40 && u64At32 < tableBytes.length) return u64At32;
  if (u64At24 >= 40 && u64At24 < tableBytes.length) return u64At24;
  return 0;
}

function parseSingleGdbTable(
  fileName: string,
  tableBytes: Uint8Array,
  tablxBytes?: Uint8Array,
  tableNameOverride?: string
): ParsedGdbTable | null {
  if (!tableBytes || tableBytes.length < 40) return null;
  const headerReader = new ByteReader(tableBytes, 0);
  const sig = headerReader.readU32();
  if (sig !== 3) return null;
  const nValidRows = headerReader.readU32();
  const _largestRecordSize = headerReader.readU32();
  const _flags = headerReader.readU32();
  const _reservedOrFileSize = headerReader.readU64(); // offset 16..23 (0 in Esri/GDAL)
  const u64At24 = headerReader.readU64();              // offset 24..31 (fileSize in Esri/GDAL)
  const u64At32 = headerReader.readU64();              // offset 32..39 (fieldDescOffset in Esri/GDAL)

  const fieldDescOffset = resolveFieldDescOffsetFromHeader(tableBytes, u64At24, u64At32);
  if (fieldDescOffset < 40 || fieldDescOffset >= tableBytes.length) return null;

  const { geomTypeCode, fields, sectionEndOffset } = parseFieldDescriptions(tableBytes, fieldDescOffset);
  if (fields.length === 0) return null;

  const nullableFields = fields.filter((f) => f.fieldType !== 6 && f.nullable);
  const nullBitmapBytes = Math.ceil(nullableFields.length / 8);

  const offsetsFromIndex = parseTablxOffsets(tablxBytes);
  const candidateRows: TablxRowOffset[] = [];

  if (offsetsFromIndex && offsetsFromIndex.length > 0) {
    for (const entry of offsetsFromIndex) {
      // Allow rows before fieldDescOffset (when schema is at EOF) OR after sectionEndOffset (when schema is at byte 40)
      if (
        entry.offset >= 40 &&
        entry.offset + 4 <= tableBytes.length &&
        (entry.offset < fieldDescOffset || entry.offset >= sectionEndOffset)
      ) {
        candidateRows.push(entry);
      }
    }
  } else if (nValidRows > 0) {
    // Sequential scan between byte 40 and fieldDescOffset (or after sectionEndOffset when schema is at byte 40)
    const scanStart = fieldDescOffset > 40 ? 40 : sectionEndOffset;
    const scanEnd = fieldDescOffset > 40 ? fieldDescOffset : tableBytes.length;
    let cursor = scanStart;
    let seqOid = 1;
    while (cursor + 4 <= scanEnd) {
      const dv = new DataView(tableBytes.buffer, tableBytes.byteOffset + cursor, 4);
      const recLen = dv.getInt32(0, true);
      if (recLen === 0) break;
      if (recLen < 0) {
        cursor += 4 + Math.abs(recLen);
        seqOid++;
        continue;
      }
      if (cursor + 4 + recLen > scanEnd) break;
      candidateRows.push({ oid: seqOid, offset: cursor });
      seqOid++;
      cursor += 4 + recLen;
    }
  }

  const rows: { oid: number; props: Record<string, any>; geometry: any }[] = [];

  for (let rowIdx = 0; rowIdx < candidateRows.length; rowIdx++) {
    const { oid, offset } = candidateRows[rowIdx];
    const r = new ByteReader(tableBytes, offset);
    if (r.remaining < 4) continue;
    const recSize = r.readI32();
    if (recSize <= 0 || offset + 4 + recSize > tableBytes.length) continue;

    const recordEnd = offset + 4 + recSize;
    if (r.pos + nullBitmapBytes > recordEnd) continue;
    const nullBytes = r.readBytes(nullBitmapBytes);
    let nullableIdx = 0;

    const props: Record<string, any> = {};
    let geometry: any = null;

    for (const field of fields) {
      let isNull = false;
      if (field.fieldType !== 6 && field.nullable) {
        const byteIndex = nullableIdx >> 3;
        const bitIndex = nullableIdx & 7;
        isNull = (nullBytes[byteIndex] & (1 << bitIndex)) !== 0;
        nullableIdx++;
      }

      if (field.fieldType === 6) {
        props[field.name] = oid;
        continue;
      }

      if (isNull || r.pos >= recordEnd) {
        if (field.fieldType !== 7) {
          props[field.name] = null;
        }
        continue;
      }

      switch (field.fieldType) {
        case 0: // Int16
          if (r.pos + 2 <= recordEnd) props[field.name] = r.readI16();
          break;
        case 1: // Int32
          if (r.pos + 4 <= recordEnd) props[field.name] = r.readI32();
          break;
        case 2: // Float32
          if (r.pos + 4 <= recordEnd) props[field.name] = Number(r.readF32().toFixed(6));
          break;
        case 3: // Float64
          if (r.pos + 8 <= recordEnd) props[field.name] = r.readF64();
          break;
        case 4: { // String
          const strLen = r.readVarUInt();
          props[field.name] = strLen > 0 ? r.readUtf8(Math.min(strLen, recordEnd - r.pos)) : '';
          break;
        }
        case 5: { // DateTime
          if (r.pos + 8 <= recordEnd) {
            const days = r.readF64();
            props[field.name] = daysToIsoDate(days);
          }
          break;
        }
        case 7: { // Geometry
          const geomLen = r.readVarUInt();
          const geomBlob = r.readBytes(Math.min(geomLen, recordEnd - r.pos));
          try {
            geometry = decodeGdbGeometry(geomBlob, field);
          } catch {
            geometry = null;
          }
          break;
        }
        case 8: { // Blob
          const blobLen = r.readVarUInt();
          r.readBytes(Math.min(blobLen, recordEnd - r.pos));
          props[field.name] = `[BLOB ${blobLen}B]`;
          break;
        }
        case 9: { // Raster
          const rasLen = r.readVarUInt();
          r.readBytes(Math.min(rasLen, recordEnd - r.pos));
          props[field.name] = `[RASTER ${rasLen}B]`;
          break;
        }
        case 10:
        case 11: { // GUID / GlobalID
          if (r.pos + 16 <= recordEnd) {
            const guidBytes = r.readBytes(16);
            props[field.name] = formatGuid(guidBytes);
          } else {
            r.pos = recordEnd;
            props[field.name] = null;
          }
          break;
        }
        case 12: { // XML
          const xmlLen = r.readVarUInt();
          props[field.name] = xmlLen > 0 ? r.readUtf8(Math.min(xmlLen, recordEnd - r.pos)) : '';
          break;
        }
        case 13: { // Int64
          if (r.pos + 8 <= recordEnd) props[field.name] = r.readI64();
          break;
        }
        case 14: { // DateOnly
          if (field.width === 4 && r.pos + 4 <= recordEnd) {
            props[field.name] = daysToIsoDate(r.readI32());
          } else if (r.pos + 8 <= recordEnd) {
            props[field.name] = daysToIsoDate(r.readF64());
          }
          break;
        }
        case 15: { // TimeOnly
          if (r.pos + 8 <= recordEnd) {
            const frac = r.readF64();
            props[field.name] = Number.isFinite(frac) ? String(frac) : null;
          }
          break;
        }
        case 16: { // TimestampOffset
          const span = Math.min(Math.max(field.width || 10, 8), recordEnd - r.pos);
          if (span >= 8) {
            const days = r.readF64();
            if (span > 8) r.pos += span - 8;
            props[field.name] = daysToIsoDate(days);
          }
          break;
        }
        default:
          break;
      }
    }

    rows.push({ oid, props, geometry });
  }

  return {
    fileName,
    tableName: tableNameOverride || fileName.replace(/\.gdbtable$/i, ''),
    geomTypeCode,
    fields,
    rows,
  };
}

// ============================================================================
// System Table Catalog & GDB_Items Metadata Extraction
// ============================================================================

interface CatalogEntry {
  baseFileName: string; // e.g. a00000009
  tableName: string;
}

interface GdbItemsMetadata {
  commentsByTable: Map<string, string>;
  relationships: DiscoveredGdbRelationship[];
}

function decodeSystemCatalog(entries: Map<string, Uint8Array>): CatalogEntry[] {
  const sysBytes = entries.get('a00000001.gdbtable');
  const sysTablx = entries.get('a00000001.gdbtablx');
  if (!sysBytes) return [];

  let parsed: ParsedGdbTable | null = null;
  try {
    parsed = parseSingleGdbTable('a00000001.gdbtable', sysBytes, sysTablx, 'GDB_SystemCatalog');
  } catch {
    return [];
  }
  if (!parsed) return [];

  const result: CatalogEntry[] = [];
  for (const row of parsed.rows) {
    const idVal = Number(row.props.ID ?? row.props.id ?? row.oid);
    const nameVal = String(row.props.Name ?? row.props.name ?? '').trim();
    if (!nameVal || !Number.isFinite(idVal)) continue;
    const hexId = idVal.toString(16).padStart(8, '0');
    result.push({
      baseFileName: `a${hexId}`,
      tableName: nameVal,
    });
  }
  return result;
}

function extractGdbItemsMetadata(entries: Map<string, Uint8Array>): GdbItemsMetadata {
  const commentsByTable = new Map<string, string>();
  const relationships: DiscoveredGdbRelationship[] = [];

  const itemsBytes = entries.get('a00000004.gdbtable');
  const itemsTablx = entries.get('a00000004.gdbtablx');
  if (!itemsBytes) return { commentsByTable, relationships };

  let parsed: ParsedGdbTable | null = null;
  try {
    parsed = parseSingleGdbTable('a00000004.gdbtable', itemsBytes, itemsTablx, 'GDB_Items');
  } catch {
    return { commentsByTable, relationships };
  }
  if (!parsed) return { commentsByTable, relationships };

  for (const row of parsed.rows) {
    const itemName = String(row.props.Name ?? row.props.name ?? '').trim();
    const physicalName = String(row.props.PhysicalName ?? row.props.physicalname ?? '').trim();
    const docXml = String(row.props.Documentation ?? row.props.documentation ?? '');
    const defXml = String(row.props.Definition ?? row.props.definition ?? '');

    if (itemName || physicalName) {
      let commentText = '';
      if (docXml) {
        const descMatch =
          docXml.match(/<Description>([\s\S]*?)<\/Description>/i) ||
          docXml.match(/<Abstract>([\s\S]*?)<\/Abstract>/i) ||
          docXml.match(/<idAbs>([\s\S]*?)<\/idAbs>/i) ||
          docXml.match(/<Purpose>([\s\S]*?)<\/Purpose>/i) ||
          docXml.match(/<idPurp>([\s\S]*?)<\/idPurp>/i);
        if (descMatch && descMatch[1]) {
          commentText = descMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
        }
      }
      if (!commentText && defXml) {
        const aliasMatch = defXml.match(/<AliasName>([\s\S]*?)<\/AliasName>/i);
        if (aliasMatch && aliasMatch[1] && aliasMatch[1].trim() !== itemName) {
          commentText = aliasMatch[1].trim();
        }
      }
      if (commentText) {
        if (itemName) {
          commentsByTable.set(itemName.toLowerCase(), commentText);
          const shortName = itemName.split('.').pop();
          if (shortName) commentsByTable.set(shortName.toLowerCase(), commentText);
        }
        if (physicalName) {
          commentsByTable.set(physicalName.toLowerCase(), commentText);
        }
      }
    }

    if (defXml && /DERelationshipClassInfo/i.test(defXml)) {
      const originMatch = defXml.match(/<OriginClassNames[\s\S]*?<Name>([^<]+)<\/Name>/i);
      const destMatch = defXml.match(/<DestinationClassNames[\s\S]*?<Name>([^<]+)<\/Name>/i);
      const cardMatch = defXml.match(/<Cardinality>([^<]+)<\/Cardinality>/i);
      const originPk = defXml.match(/<OriginPrimaryKey>([^<]+)<\/OriginPrimaryKey>/i);
      const originFk = defXml.match(/<OriginForeignKey>([^<]+)<\/OriginForeignKey>/i);
      if (originMatch && destMatch) {
        let mappedCard: '1:1' | '1:N' | 'N:M' = '1:N';
        const cStr = (cardMatch?.[1] || '').toLowerCase();
        if (cStr.includes('onetoone')) mappedCard = '1:1';
        else if (cStr.includes('manytomany')) mappedCard = 'N:M';
        relationships.push({
          name: itemName || `rel_${originMatch[1]}_${destMatch[1]}`,
          originTable: originMatch[1].trim(),
          destinationTable: destMatch[1].trim(),
          originPrimaryKey: originPk?.[1]?.trim(),
          originForeignKey: originFk?.[1]?.trim(),
          cardinality: mappedCard,
        });
      }
    }
  }

  return { commentsByTable, relationships };
}

function mapGdbGeomType(code: number): GeometryType {
  switch (code) {
    case 1: return 'Point';
    case 2: return 'MultiPoint';
    case 3: return 'MultiLineString';
    case 4:
    case 9: return 'MultiPolygon';
    default: return 'Unknown';
  }
}

export async function inspectFileGdb(input: File | File[]): Promise<GdbInspectionResult> {
  const { gdbName, entries, hasCdfFiles } = await collectGdbFileMap(input);
  const catalog = decodeSystemCatalog(entries);
  const { commentsByTable, relationships } = extractGdbItemsMetadata(entries);

  const catalogMap = new Map<string, string>();
  for (const c of catalog) {
    catalogMap.set(`${c.baseFileName}.gdbtable`.toLowerCase(), c.tableName);
  }

  const layers: GdbLayerSummary[] = [];
  const diagnostics: string[] = [];
  const tableFiles = Array.from(entries.keys())
    .filter((k) => k.endsWith('.gdbtable'))
    .sort();

  if (tableFiles.length === 0) {
    if (hasCdfFiles) {
      throw new Error(
        `${gdbName} uses Esri compressed File Geodatabase (.cdf) format, which cannot be decoded natively in the browser. Uncompress it in ArcGIS Pro / QGIS or export to uncompressed .gdb / GeoPackage (.gpkg).`
      );
    }
    throw new Error(
      `No .gdbtable files were found in ${gdbName}. Please upload the complete .gdb folder (via "Select Folder" or Drag & Drop) or a compressed .gdb.zip archive.`
    );
  }

  for (const fileKey of tableFiles) {
    if (/^a0000000[1-8]\.gdbtable$/i.test(fileKey)) continue;

    const mappedName = catalogMap.get(fileKey);
    if (mappedName && /^GDB_/i.test(mappedName)) continue;

    const tableBytes = entries.get(fileKey);
    if (!tableBytes) continue;
    const tablxKey = fileKey.replace(/\.gdbtable$/i, '.gdbtablx');
    const tablxBytes = entries.get(tablxKey);

    let parsed: ParsedGdbTable | null = null;
    try {
      parsed = parseSingleGdbTable(fileKey, tableBytes, tablxBytes, mappedName);
    } catch (err) {
      diagnostics.push(`${mappedName || fileKey}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!parsed) {
      if (tableBytes.length >= 40) {
        const dv = new DataView(tableBytes.buffer, tableBytes.byteOffset, 40);
        const sig = dv.getUint32(0, true);
        if (sig !== 3) {
          diagnostics.push(`${mappedName || fileKey}: unsupported table header signature (${sig}).`);
        } else {
          diagnostics.push(`${mappedName || fileKey}: could not decode field descriptor block (${tableBytes.length} bytes).`);
        }
      }
      continue;
    }

    const geomField = parsed.fields.find((f) => f.fieldType === 7);
    const crs = detectCrsFromWkt(geomField?.wkt);
    const hasDecodedGeoms = parsed.rows.some((r) => r.geometry !== null);
    const isNonSpatial = !geomField || (parsed.geomTypeCode === 0 && !hasDecodedGeoms);

    layers.push({
      internalFileName: fileKey,
      tableName: parsed.tableName,
      geometryType: isNonSpatial ? 'Unknown' : mapGdbGeomType(parsed.geomTypeCode),
      isNonSpatial,
      featureCount: parsed.rows.length,
      crsCode: crs.code,
      crsName: crs.name,
      comment: commentsByTable.get(parsed.tableName.toLowerCase()),
      fieldNames: parsed.fields
        .filter((f) => f.fieldType !== 7)
        .map((f) => f.name),
    });
  }

  if (layers.length === 0 && hasCdfFiles) {
    throw new Error(
      `${gdbName} contains compressed (.cdf) File Geodatabase vectors. Please uncompress it in ArcGIS Pro / QGIS before ingesting.`
    );
  }
  if (layers.length === 0 && diagnostics.length > 0) {
    throw new Error(`Could not decode tables in ${gdbName}: ${diagnostics.slice(0, 3).join('; ')}`);
  }

  return {
    gdbName,
    layers,
    discoveredRelationships: relationships,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  };
}

export async function parseFileGdbLayers(
  input: File | File[],
  selectedTableNames?: string[]
): Promise<{
  datasets: SpatialDataset[];
  discoveredRelationships: DiscoveredGdbRelationship[];
  gdbName: string;
}> {
  const { gdbName, entries, hasCdfFiles } = await collectGdbFileMap(input);
  const catalog = decodeSystemCatalog(entries);
  const { commentsByTable, relationships } = extractGdbItemsMetadata(entries);

  const catalogMap = new Map<string, string>();
  for (const c of catalog) {
    catalogMap.set(`${c.baseFileName}.gdbtable`.toLowerCase(), c.tableName);
  }

  const datasets: SpatialDataset[] = [];
  const tableFiles = Array.from(entries.keys())
    .filter((k) => k.endsWith('.gdbtable'))
    .sort();

  const selectedSet = selectedTableNames && selectedTableNames.length > 0
    ? new Set(selectedTableNames)
    : null;

  for (const fileKey of tableFiles) {
    if (/^a0000000[1-8]\.gdbtable$/i.test(fileKey)) continue;
    const mappedName = catalogMap.get(fileKey);
    if (mappedName && /^GDB_/i.test(mappedName)) continue;

    const resolvedName = mappedName || fileKey.replace(/\.gdbtable$/i, '');
    if (selectedSet && !selectedSet.has(resolvedName) && !selectedSet.has(fileKey)) {
      continue;
    }

    const tableBytes = entries.get(fileKey);
    if (!tableBytes) continue;
    const tablxKey = fileKey.replace(/\.gdbtable$/i, '.gdbtablx');
    const tablxBytes = entries.get(tablxKey);

    let parsed: ParsedGdbTable | null = null;
    try {
      parsed = parseSingleGdbTable(fileKey, tableBytes, tablxBytes, mappedName);
    } catch {
      continue;
    }
    if (!parsed) continue;

    const geomField = parsed.fields.find((f) => f.fieldType === 7);
    const oidField = parsed.fields.find((f) => f.fieldType === 6);
    const hasDecodedGeoms = parsed.rows.some((r) => r.geometry !== null);
    const isNonSpatial = !geomField || (parsed.geomTypeCode === 0 && !hasDecodedGeoms);
    const crs = detectCrsFromWkt(geomField?.wkt);

    const features = parsed.rows.map((row) => ({
      type: 'Feature',
      id: row.oid,
      properties: row.props,
      geometry: isNonSpatial ? null : row.geometry,
    }));

    const geojson = {
      type: 'FeatureCollection',
      features,
    };

    const bounds = isNonSpatial ? ([0, 0, 0, 0] as [number, number, number, number]) : computeGeoJSONBounds(geojson);
    const detectedGeomType = isNonSpatial
      ? 'Unknown'
      : (detectGeometryType(geojson) !== 'Unknown' ? detectGeometryType(geojson) : mapGdbGeomType(parsed.geomTypeCode));
    let fields = extractSchemaFields(geojson);
    if (fields.length === 0 && parsed.fields.length > 0) {
      fields = parsed.fields
        .filter((f) => f.fieldType !== 7)
        .map((f) => ({
          name: f.name,
          type: (f.fieldType === 0 || f.fieldType === 1 || f.fieldType === 2 || f.fieldType === 3 || f.fieldType === 6 || f.fieldType === 13)
            ? 'number'
            : (f.fieldType === 5 || f.fieldType === 14 || f.fieldType === 16)
            ? 'date'
            : 'string',
          sampleValues: [],
        }));
    }
    const validationIssues = isNonSpatial ? [] : validateDatasetGeometries(geojson, crs.code);
    const comment = commentsByTable.get(parsed.tableName.toLowerCase());

    datasets.push({
      id: `ds-gdb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: parsed.tableName,
      originalFileName: `${gdbName}/${parsed.tableName}`,
      format: 'filegdb',
      sizeBytes: tableBytes.length + (tablxBytes?.length || 0),
      featureCount: features.length,
      geometryType: detectedGeomType,
      detectedCRS: crs,
      crsStatus: geomField?.wkt ? 'verified' : 'assumed',
      bounds,
      fields,
      geojson,
      validationIssues,
      status: validationIssues.some((i) => i.severity === 'error')
        ? 'invalid'
        : validationIssues.length > 0
        ? 'warning'
        : 'ready',
      addedAt: Date.now(),
      tableComment: comment,
      primaryKeyColumn: oidField?.name || 'OBJECTID',
      isNonSpatial,
      gdbSourceName: gdbName,
    });
  }

  if (datasets.length === 0 && hasCdfFiles) {
    throw new Error(
      `${gdbName} uses Esri compressed (.cdf) format. Please uncompress it in ArcGIS Pro / QGIS before importing.`
    );
  }

  return {
    datasets,
    discoveredRelationships: relationships,
    gdbName,
  };
}

// ============================================================================
// Binary Writer (OpenFileGDB v10+ .gdb.zip Export)
// ============================================================================

interface WriterColumnSpec {
  name: string;
  fieldType: number; // 1=int32, 3=float64, 4=string, 5=date, 6=oid, 7=geometry
  maxStrWidth?: number;
  nullable: boolean;
}

function encodeGdbGeometry(
  geometry: any,
  gdbGeomTypeCode: number,
  xOrigin: number,
  yOrigin: number,
  xyScale: number
): Uint8Array | null {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  const w = new ByteWriter(256);

  if (gdbGeomTypeCode === 1) {
    // Point
    let pt: number[] | null = null;
    if (geometry.type === 'Point') pt = geometry.coordinates;
    else if (geometry.type === 'MultiPoint' && geometry.coordinates.length > 0) pt = geometry.coordinates[0];
    if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return null;
    w.writeVarUInt(1); // SHPT_POINT
    const ix = Math.max(1, Math.round((pt[0] - xOrigin) * xyScale) + 1);
    const iy = Math.max(1, Math.round((pt[1] - yOrigin) * xyScale) + 1);
    w.writeVarUInt(ix);
    w.writeVarUInt(iy);
    return w.toUint8Array();
  }

  if (gdbGeomTypeCode === 2) {
    // MultiPoint
    const pts: number[][] =
      geometry.type === 'MultiPoint'
        ? geometry.coordinates
        : geometry.type === 'Point'
        ? [geometry.coordinates]
        : [];
    if (pts.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    w.writeVarUInt(8); // SHPT_MULTIPOINT
    w.writeVarUInt(pts.length);
    const iminX = Math.max(1, Math.round((minX - xOrigin) * xyScale) + 1);
    const iminY = Math.max(1, Math.round((minY - yOrigin) * xyScale) + 1);
    const dxBox = Math.max(0, Math.round((maxX - minX) * xyScale));
    const dyBox = Math.max(0, Math.round((maxY - minY) * xyScale));
    w.writeVarUInt(iminX);
    w.writeVarUInt(iminY);
    w.writeVarUInt(dxBox);
    w.writeVarUInt(dyBox);

    let prevX = 0;
    let prevY = 0;
    for (const p of pts) {
      const gx = Math.round((p[0] - xOrigin) * xyScale);
      const gy = Math.round((p[1] - yOrigin) * xyScale);
      w.writeVarInt(gx - prevX);
      w.writeVarInt(gy - prevY);
      prevX = gx;
      prevY = gy;
    }
    return w.toUint8Array();
  }

  // Polyline (3) or Polygon (4)
  let parts: number[][][] = [];
  let shpType = 3;
  if (gdbGeomTypeCode === 3) {
    shpType = 3;
    if (geometry.type === 'LineString') parts = [geometry.coordinates];
    else if (geometry.type === 'MultiLineString') parts = geometry.coordinates;
  } else if (gdbGeomTypeCode === 4) {
    shpType = 5;
    if (geometry.type === 'Polygon') {
      parts = geometry.coordinates;
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates) {
        for (const ring of poly) parts.push(ring);
      }
    }
  }

  parts = parts.filter((p) => Array.isArray(p) && p.length > 0);
  if (parts.length === 0) return null;

  let totalPts = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const part of parts) {
    totalPts += part.length;
    for (const pt of part) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }

  w.writeVarUInt(shpType);
  w.writeVarUInt(totalPts);
  w.writeVarUInt(parts.length);

  const iminX = Math.max(1, Math.round((minX - xOrigin) * xyScale) + 1);
  const iminY = Math.max(1, Math.round((minY - yOrigin) * xyScale) + 1);
  const dxBox = Math.max(0, Math.round((maxX - minX) * xyScale));
  const dyBox = Math.max(0, Math.round((maxY - minY) * xyScale));
  w.writeVarUInt(iminX);
  w.writeVarUInt(iminY);
  w.writeVarUInt(dxBox);
  w.writeVarUInt(dyBox);

  for (let i = 0; i < parts.length - 1; i++) {
    w.writeVarUInt(parts[i].length);
  }

  let prevX = 0;
  let prevY = 0;
  for (const part of parts) {
    for (const pt of part) {
      const gx = Math.round((pt[0] - xOrigin) * xyScale);
      const gy = Math.round((pt[1] - yOrigin) * xyScale);
      w.writeVarInt(gx - prevX);
      w.writeVarInt(gy - prevY);
      prevX = gx;
      prevY = gy;
    }
  }
  return w.toUint8Array();
}

function buildBinaryGdbTableAndIndex(params: {
  geomTypeCode: number;
  columns: WriterColumnSpec[];
  rows: { props: Record<string, any>; geometry?: any }[];
  wkt?: string;
  bounds?: [number, number, number, number];
}): { gdbtable: Uint8Array; gdbtablx: Uint8Array } {
  const { geomTypeCode, columns, rows, wkt = '', bounds = [-180, -90, 180, 90] } = params;
  const xOrigin = -400;
  const yOrigin = -400;
  const xyScale = 1000000000;

  const w = new ByteWriter(8192);
  // Reserve 40-byte header
  for (let i = 0; i < 40; i++) w.writeU8(0);

  const nullableCols = columns.filter((c) => c.fieldType !== 6 && c.nullable);
  const nullBitmapLen = Math.ceil(nullableCols.length / 8);

  const offsets: number[] = [];
  let maxRecordSize = 0;

  // Write rows starting at byte 40
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowOffset = w.length;
    offsets.push(rowOffset);
    const rw = new ByteWriter(512);
    const row = rows[rIdx];

    const nullBitmap = new Uint8Array(nullBitmapLen);
    let nullablePos = 0;
    const fieldPayloadChunks: Uint8Array[] = [];

    for (const col of columns) {
      if (col.fieldType === 6) {
        continue; // OID implicit
      }

      if (col.fieldType === 7) {
        const geomBlob = encodeGdbGeometry(row.geometry, geomTypeCode, xOrigin, yOrigin, xyScale);
        if (!geomBlob) {
          if (col.nullable) {
            nullBitmap[nullablePos >> 3] |= (1 << (nullablePos & 7));
          } else {
            const emptyGeom = new Uint8Array([0]);
            const cw = new ByteWriter(4);
            cw.writeVarUInt(emptyGeom.length);
            cw.writeBytes(emptyGeom);
            fieldPayloadChunks.push(cw.toUint8Array());
          }
        } else {
          const cw = new ByteWriter(geomBlob.length + 8);
          cw.writeVarUInt(geomBlob.length);
          cw.writeBytes(geomBlob);
          fieldPayloadChunks.push(cw.toUint8Array());
        }
        if (col.nullable) nullablePos++;
        continue;
      }

      const rawVal = row.props ? row.props[col.name] : null;
      const isNullVal = rawVal === null || rawVal === undefined;
      if (isNullVal) {
        if (col.nullable) {
          nullBitmap[nullablePos >> 3] |= (1 << (nullablePos & 7));
          nullablePos++;
          continue;
        }
      }
      if (col.nullable) nullablePos++;

      const cw = new ByteWriter(64);
      switch (col.fieldType) {
        case 1: {
          const num = isNullVal ? 0 : Math.trunc(Number(rawVal) || 0);
          cw.writeI32(num);
          break;
        }
        case 3: {
          const num = isNullVal ? 0 : Number(rawVal) || 0;
          cw.writeF64(num);
          break;
        }
        case 5: {
          const days = isoOrValueToDays(rawVal) ?? 0;
          cw.writeF64(days);
          break;
        }
        case 4:
        case 12:
        default: {
          const str = isNullVal ? '' : typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal);
          const utf8 = new TextEncoder().encode(str);
          cw.writeVarUInt(utf8.length);
          cw.writeBytes(utf8);
          break;
        }
      }
      fieldPayloadChunks.push(cw.toUint8Array());
    }

    rw.writeBytes(nullBitmap);
    for (const chunk of fieldPayloadChunks) rw.writeBytes(chunk);
    const payload = rw.toUint8Array();
    if (payload.length > maxRecordSize) maxRecordSize = payload.length;

    w.writeU32(payload.length);
    w.writeBytes(payload);
  }

  // Write Field Description section
  const fieldDescOffset = w.length;
  const fw = new ByteWriter(2048);
  fw.writeU32(3); // version 3
  fw.writeU8(geomTypeCode); // geomType
  fw.writeU8(geomTypeCode > 0 ? 3 : 0);
  fw.writeU8(0);
  fw.writeU8(0);
  fw.writeU16(columns.length);

  for (const col of columns) {
    fw.writeUtf16WithCharLen(col.name);
    fw.writeUtf16WithCharLen(col.name);
    fw.writeU8(col.fieldType);

    const flag = col.nullable ? 1 : 0;
    if (col.fieldType === 4) {
      fw.writeU32(col.maxStrWidth || 255);
      fw.writeU8(flag);
    } else if (col.fieldType === 6) {
      fw.writeU8(4);
      fw.writeU8(2); // OID flag
    } else if (col.fieldType === 7) {
      fw.writeU8(0);
      fw.writeU8(flag);
      const wktRaw = fw.writeUtf16Raw(wkt);
      fw.writeU16(wktRaw.length);
      fw.writeBytes(wktRaw);
      fw.writeU8(0); // 2D XY
      fw.writeF64(xOrigin);
      fw.writeF64(yOrigin);
      fw.writeF64(xyScale);
      fw.writeF64(0.000000001); // xyTolerance
      fw.writeF64(bounds[0]);
      fw.writeF64(bounds[1]);
      fw.writeF64(bounds[2]);
      fw.writeF64(bounds[3]);
      fw.writeU32(1); // 1 grid size
      fw.writeF64(1.0);
    } else if (col.fieldType === 12) {
      fw.writeU8(0);
      fw.writeU8(flag);
    } else if (col.fieldType === 1) {
      fw.writeU8(4);
      fw.writeU8(flag);
    } else {
      fw.writeU8(8);
      fw.writeU8(flag);
    }
  }

  const fieldSectionBytes = fw.toUint8Array();
  w.writeU32(fieldSectionBytes.length);
  w.writeBytes(fieldSectionBytes);

  const fileSize = w.length;
  // Patch 40-byte header per OpenFileGDB v10+ spec (fileSize at 24..31, fieldDescOffset at 32..39)
  w.patchU32(0, 3); // signature
  w.patchU32(4, rows.length);
  w.patchU32(8, maxRecordSize);
  w.patchU32(12, 5);
  w.patchU64(16, 0);
  w.patchU64(24, fileSize);
  w.patchU64(32, fieldDescOffset);

  // Build .gdbtablx
  const n1024Blocks = Math.max(1, Math.ceil(Math.max(rows.length, 1) / 1024));
  const totalSlots = n1024Blocks * 1024;
  const ix = new ByteWriter(16 + totalSlots * 5 + 16);
  ix.writeU32(3); // sig
  ix.writeU32(n1024Blocks);
  ix.writeU32(rows.length);
  ix.writeU32(5); // 5 bytes per offset
  for (let i = 0; i < totalSlots; i++) {
    ix.writeUIntN(i < offsets.length ? offsets[i] : 0, 5);
  }
  // Trailing empty block bitmap header
  ix.writeU32(0);
  ix.writeU32(totalSlots);
  ix.writeU32(0);
  ix.writeU32(0);

  return {
    gdbtable: w.toUint8Array(),
    gdbtablx: ix.toUint8Array(),
  };
}

function datasetGeometryToGdbCode(ds: SpatialDataset): number {
  if (ds.isNonSpatial || ds.geometryType === 'Unknown') return 0;
  if (ds.geometryType === 'Point') return 1;
  if (ds.geometryType === 'MultiPoint') return 2;
  if (ds.geometryType === 'LineString' || ds.geometryType === 'MultiLineString') return 3;
  return 4; // Polygon / MultiPolygon
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportDatasetsToFileGdbZip(
  datasets: SpatialDataset[],
  gdbBaseName = 'omnigeo_geodatabase',
  relationships: DefinedRelationship[] = []
): Promise<Blob> {
  const zip = new JSZip();
  const cleanGdbFolder = `${gdbBaseName.replace(/\.gdb$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'omnigeo_geodatabase'}.gdb`;
  const folder = zip.folder(cleanGdbFolder)!;

  // Standard FGDB root files
  folder.file('gdb', new TextEncoder().encode('File Geodatabase'));
  folder.file('timestamps', new Uint8Array(400));

  const catalogRows: { props: Record<string, any> }[] = [
    { props: { ID: 1, Name: 'GDB_SystemCatalog', FileFormat: 0 } },
    { props: { ID: 2, Name: 'GDB_DBTune', FileFormat: 0 } },
    { props: { ID: 3, Name: 'GDB_SpatialRefs', FileFormat: 0 } },
    { props: { ID: 4, Name: 'GDB_Items', FileFormat: 0 } },
    { props: { ID: 5, Name: 'GDB_ItemTypes', FileFormat: 0 } },
    { props: { ID: 6, Name: 'GDB_ItemRelationships', FileFormat: 0 } },
    { props: { ID: 7, Name: 'GDB_ItemRelationshipTypes', FileFormat: 0 } },
    { props: { ID: 8, Name: 'GDB_ReplicaLog', FileFormat: 0 } },
  ];

  const gdbItemsRows: { props: Record<string, any> }[] = [];

  // Build user tables starting at ID = 9 (a00000009)
  let nextTableId = 9;
  const writtenDatasetNames = new Map<string, string>();

  for (const ds of datasets) {
    const tableId = nextTableId++;
    const hexId = tableId.toString(16).padStart(8, '0');
    const baseFile = `a${hexId}`;
    const cleanTableName = (ds.name || `layer_${tableId}`).replace(/[^a-zA-Z0-9_]/g, '_');
    writtenDatasetNames.set(ds.id, cleanTableName);

    catalogRows.push({
      props: { ID: tableId, Name: cleanTableName, FileFormat: 0 },
    });

    const docXml = ds.tableComment
      ? `<Documentation><Description>${escapeXml(ds.tableComment)}</Description></Documentation>`
      : '';
    const wkt = crsToEsriWkt(ds.detectedCRS);
    const defXml = `<DEFeatureClassInfo><Name>${escapeXml(cleanTableName)}</Name><AliasName>${escapeXml(cleanTableName)}</AliasName></DEFeatureClassInfo>`;

    gdbItemsRows.push({
      props: {
        Name: cleanTableName,
        Definition: defXml,
        Documentation: docXml,
        Properties: wkt,
      },
    });

    const geomCode = datasetGeometryToGdbCode(ds);
    const oidColName = ds.primaryKeyColumn && ds.fields.every((f) => f.name !== ds.primaryKeyColumn)
      ? 'OBJECTID'
      : 'OBJECTID';

    const columns: WriterColumnSpec[] = [
      { name: oidColName, fieldType: 6, nullable: false },
    ];
    if (geomCode > 0) {
      columns.push({ name: 'Shape', fieldType: 7, nullable: true });
    }

    const features = ds.geojson?.features || [];
    for (const f of ds.fields) {
      if (f.name.toUpperCase() === 'OBJECTID' || f.name.toUpperCase() === 'SHAPE') continue;
      let fType = 4;
      let maxStrWidth = 255;
      if (f.type === 'number') {
        const allInts = features.every((feat: any) => {
          const val = feat.properties?.[f.name];
          return val === null || val === undefined || Number.isInteger(Number(val));
        });
        fType = allInts ? 1 : 3;
      } else if (f.type === 'date') {
        fType = 5;
      } else if (f.type === 'boolean') {
        fType = 1;
      } else {
        let longest = 64;
        for (const feat of features) {
          const v = feat.properties?.[f.name];
          if (v !== null && v !== undefined) {
            longest = Math.max(longest, String(v).length + 16);
          }
        }
        maxStrWidth = Math.min(4096, longest);
      }

      columns.push({
        name: f.name,
        fieldType: fType,
        maxStrWidth,
        nullable: true,
      });
    }

    const rowData = features.map((feat: any) => {
      const props: Record<string, any> = {};
      for (const col of columns) {
        if (col.fieldType === 6 || col.fieldType === 7) continue;
        const val = feat.properties ? feat.properties[col.name] : null;
        if (typeof val === 'boolean') {
          props[col.name] = val ? 1 : 0;
        } else {
          props[col.name] = val ?? null;
        }
      }
      return {
        props,
        geometry: geomCode > 0 ? feat.geometry : null,
      };
    });

    const bounds = ds.bounds && Number.isFinite(ds.bounds[0])
      ? ds.bounds
      : ([-180, -90, 180, 90] as [number, number, number, number]);

    const { gdbtable, gdbtablx } = buildBinaryGdbTableAndIndex({
      geomTypeCode: geomCode,
      columns,
      rows: rowData,
      wkt,
      bounds,
    });

    folder.file(`${baseFile}.gdbtable`, gdbtable);
    folder.file(`${baseFile}.gdbtablx`, gdbtablx);
  }

  // Embed RelationshipClass items into GDB_Items so re-ingesting restores relationships
  for (const rel of relationships) {
    if (!rel.enabled) continue;
    const parentName = writtenDatasetNames.get(rel.parentDatasetId);
    const childName = writtenDatasetNames.get(rel.childDatasetId);
    if (!parentName || !childName) continue;
    const cardTag =
      rel.cardinality === '1:1'
        ? 'esriRelCardinalityOneToOne'
        : rel.cardinality === 'N:M'
        ? 'esriRelCardinalityManyToMany'
        : 'esriRelCardinalityOneToMany';
    const relXml = `<DERelationshipClassInfo><Name>${escapeXml(rel.constraintName)}</Name><Cardinality>${cardTag}</Cardinality><OriginPrimaryKey>${escapeXml(rel.parentPkColumn)}</OriginPrimaryKey><OriginForeignKey>${escapeXml(rel.fkColumnName)}</OriginForeignKey><OriginClassNames><Name>${escapeXml(parentName)}</Name></OriginClassNames><DestinationClassNames><Name>${escapeXml(childName)}</Name></DestinationClassNames></DERelationshipClassInfo>`;
    gdbItemsRows.push({
      props: {
        Name: rel.constraintName,
        Definition: relXml,
        Documentation: '',
        Properties: '',
      },
    });
  }

  // Write a00000001 (GDB_SystemCatalog)
  const catBinary = buildBinaryGdbTableAndIndex({
    geomTypeCode: 0,
    columns: [
      { name: 'ID', fieldType: 6, nullable: false },
      { name: 'Name', fieldType: 4, maxStrWidth: 226, nullable: false },
      { name: 'FileFormat', fieldType: 1, nullable: false },
    ],
    rows: catalogRows,
  });
  folder.file('a00000001.gdbtable', catBinary.gdbtable);
  folder.file('a00000001.gdbtablx', catBinary.gdbtablx);

  // Write a00000004 (GDB_Items)
  const itemsBinary = buildBinaryGdbTableAndIndex({
    geomTypeCode: 0,
    columns: [
      { name: 'OBJECTID', fieldType: 6, nullable: false },
      { name: 'Name', fieldType: 4, maxStrWidth: 226, nullable: true },
      { name: 'Definition', fieldType: 12, nullable: true },
      { name: 'Documentation', fieldType: 12, nullable: true },
      { name: 'Properties', fieldType: 12, nullable: true },
    ],
    rows: gdbItemsRows,
  });
  folder.file('a00000004.gdbtable', itemsBinary.gdbtable);
  folder.file('a00000004.gdbtablx', itemsBinary.gdbtablx);

  // Empty placeholder system tables so Esri/GDAL recognizes a full catalog skeleton
  for (const sysId of [2, 3, 5, 6, 7, 8]) {
    const hexSys = `a${sysId.toString(16).padStart(8, '0')}`;
    const emptyBin = buildBinaryGdbTableAndIndex({
      geomTypeCode: 0,
      columns: [
        { name: 'OBJECTID', fieldType: 6, nullable: false },
        { name: 'Name', fieldType: 4, maxStrWidth: 128, nullable: true },
      ],
      rows: [],
    });
    folder.file(`${hexSys}.gdbtable`, emptyBin.gdbtable);
    folder.file(`${hexSys}.gdbtablx`, emptyBin.gdbtablx);
  }

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
