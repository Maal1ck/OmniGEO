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
  if (lower.includes('merchich') && lower.includes('nord')) {
    return getCRSByCode('EPSG:26191') || getCRSByCode('EPSG:4261') || wgs84;
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

export function isFileGdbFolderFiles(files: File[]): boolean {
  return files.some((f) => {
    const rel = ((f as any).webkitRelativePath || f.name || '').toLowerCase();
    const base = f.name.toLowerCase();
    return rel.includes('.gdb/') || base.endsWith('.gdbtable') || base.endsWith('.gdbtablx') || base === 'gdb';
  });
}

export function groupFileGdbFolderUploads(files: File[]): {
  gdbBundles: { name: string; files: File[] }[];
  remainingFiles: File[];
} {
  const bundleMap = new Map<string, File[]>();
  const remainingFiles: File[] = [];

  for (const file of files) {
    const rel = ((file as any).webkitRelativePath || '').replace(/\\/g, '/');
    const gdbMatch = rel.match(/(^|.*\/)([^/]+\.gdb)\//i);
    if (gdbMatch) {
      const bundleName = gdbMatch[2];
      const existing = bundleMap.get(bundleName) || [];
      existing.push(file);
      bundleMap.set(bundleName, existing);
    } else if (
      file.name.toLowerCase().endsWith('.gdbtable') ||
      file.name.toLowerCase().endsWith('.gdbtablx') ||
      file.name.toLowerCase() === 'gdb' ||
      file.name.toLowerCase() === 'timestamps'
    ) {
      const existing = bundleMap.get('imported_geodatabase.gdb') || [];
      existing.push(file);
      bundleMap.set('imported_geodatabase.gdb', existing);
    } else {
      remainingFiles.push(file);
    }
  }

  const gdbBundles = Array.from(bundleMap.entries()).map(([name, bundleFiles]) => ({
    name,
    files: bundleFiles,
  }));

  return { gdbBundles, remainingFiles };
}

export async function isFileGdbZipArchive(file: File): Promise<boolean> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.zip') && !lower.endsWith('.gdb.zip')) return false;
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const keys = Object.keys(zip.files).map((k) => k.toLowerCase());
    return keys.some((k) => k.endsWith('.gdbtable') || k.endsWith('/gdb') || k === 'gdb');
  } catch {
    return false;
  }
}

// ============================================================================
// Binary Table Parser (.gdbtable + optional .gdbtablx)
// ============================================================================

async function collectGdbFileMap(
  input: File | File[]
): Promise<{ gdbName: string; entries: Map<string, Uint8Array> }> {
  const entries = new Map<string, Uint8Array>();
  let gdbName = 'geodatabase.gdb';

  if (Array.isArray(input)) {
    for (const f of input) {
      const rel = ((f as any).webkitRelativePath || f.name).replace(/\\/g, '/');
      const m = rel.match(/([^/]+\.gdb)\//i);
      if (m) gdbName = m[1];
      const base = rel.split('/').pop()!.toLowerCase();
      entries.set(base, new Uint8Array(await f.arrayBuffer()));
    }
    return { gdbName, entries };
  }

  const lowerName = input.name.toLowerCase();
  if (lowerName.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await input.arrayBuffer());
    const rawKeys = Object.keys(zip.files);
    const gdbFolderKey = rawKeys.find((k) => /\.gdb\//i.test(k));
    if (gdbFolderKey) {
      const m = gdbFolderKey.match(/([^/]+\.gdb)\//i);
      if (m) gdbName = m[1];
    } else {
      gdbName = input.name.replace(/(\.gdb)?\.zip$/i, '') + '.gdb';
    }
    for (const key of rawKeys) {
      const entry = zip.files[key];
      if (entry.dir) continue;
      const base = key.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
      entries.set(base, await entry.async('uint8array'));
    }
  } else {
    entries.set(lowerName, new Uint8Array(await input.arrayBuffer()));
    gdbName = input.name.replace(/\.[^.]+$/, '') + '.gdb';
  }

  return { gdbName, entries };
}

function parseTablxOffsets(tablxBytes?: Uint8Array): number[] | null {
  if (!tablxBytes || tablxBytes.length < 16) return null;
  const r = new ByteReader(tablxBytes);
  const sig = r.readU32();
  if (sig !== 3) return null;
  const n1024Blocks = r.readU32();
  const nMaxRows = r.readU32();
  const sizeOffsets = r.readU32();
  if (sizeOffsets < 4 || sizeOffsets > 6) return null;

  const totalSlots = n1024Blocks > 0 ? Math.min(n1024Blocks * 1024, nMaxRows || n1024Blocks * 1024) : nMaxRows;
  if (totalSlots === 0) return null;
  if (16 + totalSlots * sizeOffsets > tablxBytes.length) return null;

  const offsets: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    let off = 0;
    let mult = 1;
    for (let b = 0; b < sizeOffsets; b++) {
      off += tablxBytes[16 + i * sizeOffsets + b] * mult;
      mult *= 256;
    }
    if (off > 0) offsets.push(off);
  }
  return offsets;
}

function parseFieldDescriptions(tableBytes: Uint8Array, fieldDescOffset: number): {
  geomTypeCode: number;
  fields: ParsedFieldDescriptor[];
  sectionEndOffset: number;
} {
  const r = new ByteReader(tableBytes, fieldDescOffset);
  const descSize = r.readU32();
  const sectionEndOffset = fieldDescOffset + 4 + descSize;
  const _version = r.readU32();
  const geomTypeCode = r.readU8();
  const _geomFlagsBytes = r.readBytes(3);
  const nFields = r.readU16();
  const fields: ParsedFieldDescriptor[] = [];

  for (let i = 0; i < nFields && r.pos < sectionEndOffset; i++) {
    const nameLen = r.readU8();
    const name = r.readUtf16(nameLen);
    const aliasLen = r.readU8();
    const alias = r.readUtf16(aliasLen);
    const fieldType = r.readU8();

    if (fieldType === 4) {
      // String
      const width = r.readU32();
      const flag = r.readU8();
      if ((flag & 4) !== 0 && r.pos < sectionEndOffset) {
        const defLen = r.readVarUInt();
        if (defLen > 0 && r.pos + defLen <= sectionEndOffset) {
          r.readBytes(defLen);
        }
      }
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    } else if (fieldType === 6) {
      // ObjectID
      const width = r.readU8();
      const flag = r.readU8();
      fields.push({ name, alias, fieldType, width, flag, nullable: false });
    } else if (fieldType === 7) {
      // Geometry
      const width = r.readU8();
      const flag = r.readU8();
      const wktByteLen = r.readU16();
      const wktBytes = r.readBytes(Math.min(wktByteLen, Math.max(0, sectionEndOffset - r.pos)));
      const wkt = new TextDecoder('utf-16le').decode(wktBytes).replace(/\0+$/, '');
      const geomFlags = r.pos < sectionEndOffset ? r.readU8() : 0;
      const hasM = (geomFlags & 2) !== 0;
      const hasZ = (geomFlags & 4) !== 0;
      const xOrigin = r.pos + 8 <= sectionEndOffset ? r.readF64() : -400;
      const yOrigin = r.pos + 8 <= sectionEndOffset ? r.readF64() : -400;
      const xyScale = r.pos + 8 <= sectionEndOffset ? r.readF64() : 1000000000;
      let mOrigin = 0, mScale = 1, zOrigin = 0, zScale = 1;
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

      // Bounding box xmin, ymin, xmax, ymax (+ optional zmin, zmax, mmin, mmax)
      if (r.pos + 32 <= sectionEndOffset) {
        r.readF64(); r.readF64(); r.readF64(); r.readF64();
      }
      if (hasZ && r.pos + 16 <= sectionEndOffset) {
        r.readF64(); r.readF64();
      }
      if (hasM && r.pos + 16 <= sectionEndOffset) {
        r.readF64(); r.readF64();
      }

      // Spatial index grid sizes
      if (r.pos + 4 <= sectionEndOffset) {
        const numGrids = r.readU32();
        if (numGrids < 16 && r.pos + numGrids * 8 <= sectionEndOffset) {
          r.pos += numGrids * 8;
        } else {
          r.pos = sectionEndOffset;
        }
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
    } else if (fieldType === 8 || fieldType === 12) {
      // Binary or XML
      const width = r.readU8();
      const flag = r.readU8();
      fields.push({ name, alias, fieldType, width, flag, nullable: (flag & 1) !== 0 });
    } else {
      // Fixed numeric / date / guid / globalid / int64
      const width = r.readU8();
      const flag = r.readU8();
      if ((flag & 4) !== 0 && r.pos < sectionEndOffset) {
        const defLen = r.readU8();
        if (defLen > 0 && r.pos + defLen <= sectionEndOffset) {
          r.readBytes(defLen);
        }
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

  // Point types: 1=Point, 9=PointZM, 11=PointZ, 21=PointM
  if (baseType === 1 || baseType === 9 || baseType === 11 || baseType === 21) {
    const viX = r.readVarUInt();
    const viY = r.readVarUInt();
    if (viX === 0 && viY === 0) return null;
    const x = (viX - 1) / xyScale + xOrigin;
    const y = (viY - 1) / xyScale + yOrigin;
    return { type: 'Point', coordinates: [x, y] };
  }

  // MultiPoint: 8, 18, 20, 28
  if (baseType === 8 || baseType === 18 || baseType === 20 || baseType === 28) {
    const nPts = r.readVarUInt();
    if (nPts === 0) return null;
    // BBox: xmin, ymin, xmax, ymax
    r.readVarUInt(); r.readVarUInt(); r.readVarUInt(); r.readVarUInt();
    const coords: [number, number][] = [];
    let accX = 0;
    let accY = 0;
    for (let i = 0; i < nPts; i++) {
      accX += r.readVarInt();
      accY += r.readVarInt();
      coords.push([accX / xyScale + xOrigin, accY / xyScale + yOrigin]);
    }
    return coords.length === 1
      ? { type: 'Point', coordinates: coords[0] }
      : { type: 'MultiPoint', coordinates: coords };
  }

  // Polyline (3, 10, 13, 23) & Polygon (5, 15, 19, 25)
  const isPolygon = baseType === 5 || baseType === 15 || baseType === 19 || baseType === 25;
  const isPolyline = baseType === 3 || baseType === 10 || baseType === 13 || baseType === 23;
  if (!isPolygon && !isPolyline) return null;

  const nPts = r.readVarUInt();
  if (nPts === 0) return null;
  const nParts = r.readVarUInt();
  if (nParts === 0) return null;

  const hasCurves = (rawType & 0x20000000) !== 0;
  let _nCurves = 0;
  if (hasCurves) {
    _nCurves = r.readVarUInt();
  }

  // BBox: xmin, ymin, dx, dy
  r.readVarUInt();
  r.readVarUInt();
  r.readVarUInt();
  r.readVarUInt();

  const partCounts: number[] = [];
  let sumPrev = 0;
  for (let p = 0; p < nParts - 1; p++) {
    const count = r.readVarUInt();
    partCounts.push(count);
    sumPrev += count;
  }
  partCounts.push(Math.max(0, nPts - sumPrev));

  const ringsOrLines: [number, number][][] = [];
  let accX = 0;
  let accY = 0;
  for (let p = 0; p < nParts; p++) {
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

  if (closedRings.length === 1) {
    return { type: 'Polygon', coordinates: [closedRings[0]] };
  }

  // In FileGDB/Shapefile, negative signed area (clockwise in XY) denotes an exterior ring
  const polys: number[][][][] = [];
  for (const ring of closedRings) {
    const area = signedRingArea(ring);
    if (area <= 0 || polys.length === 0) {
      polys.push([ring]);
    } else {
      polys[polys.length - 1].push(ring);
    }
  }
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
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
  const _fileSize = headerReader.readU64();
  const fieldDescOffset = headerReader.readU64();

  if (fieldDescOffset < 40 || fieldDescOffset >= tableBytes.length) return null;

  const { geomTypeCode, fields, sectionEndOffset } = parseFieldDescriptions(tableBytes, fieldDescOffset);
  const nullableFields = fields.filter((f) => f.fieldType !== 6 && f.nullable);
  const nullBitmapBytes = Math.ceil(nullableFields.length / 8);

  const offsetsFromIndex = parseTablxOffsets(tablxBytes);
  const candidateOffsets: number[] = [];

  if (offsetsFromIndex && offsetsFromIndex.length > 0) {
    for (const off of offsetsFromIndex) {
      if (off >= 40 && off < fieldDescOffset) {
        candidateOffsets.push(off);
      }
    }
  } else if (nValidRows > 0) {
    // Sequential scan between byte 40 and fieldDescOffset (or after sectionEndOffset)
    const scanStart = fieldDescOffset > 40 ? 40 : sectionEndOffset;
    const scanEnd = fieldDescOffset > 40 ? fieldDescOffset : tableBytes.length;
    let cursor = scanStart;
    while (cursor + 4 <= scanEnd) {
      const dv = new DataView(tableBytes.buffer, tableBytes.byteOffset + cursor, 4);
      const recLen = dv.getInt32(0, true);
      if (recLen === 0) break;
      if (recLen < 0) {
        cursor += 4 + Math.abs(recLen);
        continue;
      }
      if (cursor + 4 + recLen > scanEnd) break;
      candidateOffsets.push(cursor);
      cursor += 4 + recLen;
    }
  }

  const rows: { oid: number; props: Record<string, any>; geometry: any }[] = [];

  for (let rowIdx = 0; rowIdx < candidateOffsets.length; rowIdx++) {
    const offset = candidateOffsets[rowIdx];
    const r = new ByteReader(tableBytes, offset);
    const recSize = r.readI32();
    if (recSize <= 0 || offset + 4 + recSize > tableBytes.length) continue;

    const recordEnd = offset + 4 + recSize;
    const nullBytes = r.readBytes(nullBitmapBytes);
    let nullableIdx = 0;

    const props: Record<string, any> = {};
    let geometry: any = null;
    const oid = rowIdx + 1;

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
          props[field.name] = r.readI16();
          break;
        case 1: // Int32
          props[field.name] = r.readI32();
          break;
        case 2: // Float32
          props[field.name] = Number(r.readF32().toFixed(6));
          break;
        case 3: // Float64
          props[field.name] = r.readF64();
          break;
        case 4: { // String
          const strLen = r.readVarUInt();
          props[field.name] = strLen > 0 ? r.readUtf8(Math.min(strLen, recordEnd - r.pos)) : '';
          break;
        }
        case 5: { // DateTime
          const days = r.readF64();
          props[field.name] = daysToIsoDate(days);
          break;
        }
        case 7: { // Geometry
          const geomLen = r.readVarUInt();
          const geomBlob = r.readBytes(Math.min(geomLen, recordEnd - r.pos));
          geometry = decodeGdbGeometry(geomBlob, field);
          break;
        }
        case 8: { // Blob
          const blobLen = r.readVarUInt();
          r.readBytes(Math.min(blobLen, recordEnd - r.pos));
          props[field.name] = `[BLOB ${blobLen}B]`;
          break;
        }
        case 10:
        case 11: { // GUID / GlobalID
          const guidBytes = r.readBytes(16);
          props[field.name] = formatGuid(guidBytes);
          break;
        }
        case 12: { // XML
          const xmlLen = r.readVarUInt();
          props[field.name] = xmlLen > 0 ? r.readUtf8(Math.min(xmlLen, recordEnd - r.pos)) : '';
          break;
        }
        case 13: { // Int64
          props[field.name] = r.readI64();
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

  const parsed = parseSingleGdbTable('a00000001.gdbtable', sysBytes, sysTablx, 'GDB_SystemCatalog');
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

  const parsed = parseSingleGdbTable('a00000004.gdbtable', itemsBytes, itemsTablx, 'GDB_Items');
  if (!parsed) return { commentsByTable, relationships };

  for (const row of parsed.rows) {
    const itemName = String(row.props.Name ?? row.props.name ?? '').trim();
    const docXml = String(row.props.Documentation ?? row.props.documentation ?? '');
    const defXml = String(row.props.Definition ?? row.props.definition ?? '');

    if (itemName) {
      let commentText = '';
      if (docXml) {
        const descMatch = docXml.match(/<Description>([\s\S]*?)<\/Description>/i) ||
                          docXml.match(/<Abstract>([\s\S]*?)<\/Abstract>/i) ||
                          docXml.match(/<Purpose>([\s\S]*?)<\/Purpose>/i);
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
        commentsByTable.set(itemName.toLowerCase(), commentText);
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
    case 4: return 'MultiPolygon';
    default: return 'Unknown';
  }
}

export async function inspectFileGdb(input: File | File[]): Promise<GdbInspectionResult> {
  const { gdbName, entries } = await collectGdbFileMap(input);
  const catalog = decodeSystemCatalog(entries);
  const { commentsByTable, relationships } = extractGdbItemsMetadata(entries);

  const catalogMap = new Map<string, string>();
  for (const c of catalog) {
    catalogMap.set(`${c.baseFileName}.gdbtable`.toLowerCase(), c.tableName);
  }

  const layers: GdbLayerSummary[] = [];
  const tableFiles = Array.from(entries.keys())
    .filter((k) => k.endsWith('.gdbtable'))
    .sort();

  for (const fileKey of tableFiles) {
    // Skip internal GDB system tables a00000001..a00000008 unless no user tables exist
    if (/^a0000000[1-8]\.gdbtable$/i.test(fileKey)) continue;

    const mappedName = catalogMap.get(fileKey);
    if (mappedName && /^GDB_/i.test(mappedName)) continue;

    const tableBytes = entries.get(fileKey);
    if (!tableBytes) continue;
    const tablxKey = fileKey.replace(/\.gdbtable$/i, '.gdbtablx');
    const tablxBytes = entries.get(tablxKey);

    const parsed = parseSingleGdbTable(fileKey, tableBytes, tablxBytes, mappedName);
    if (!parsed) continue;

    const geomField = parsed.fields.find((f) => f.fieldType === 7);
    const crs = detectCrsFromWkt(geomField?.wkt);
    const isNonSpatial = !geomField || parsed.geomTypeCode === 0;

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

  return {
    gdbName,
    layers,
    discoveredRelationships: relationships,
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
  const { gdbName, entries } = await collectGdbFileMap(input);
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

    const parsed = parseSingleGdbTable(fileKey, tableBytes, tablxBytes, mappedName);
    if (!parsed) continue;

    const geomField = parsed.fields.find((f) => f.fieldType === 7);
    const oidField = parsed.fields.find((f) => f.fieldType === 6);
    const isNonSpatial = !geomField || parsed.geomTypeCode === 0;
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
            : f.fieldType === 5
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
  // Patch 40-byte header
  w.patchU32(0, 3); // signature
  w.patchU32(4, rows.length);
  w.patchU32(8, maxRecordSize);
  w.patchU32(12, 5);
  w.patchU64(16, fileSize);
  w.patchU64(24, fieldDescOffset);

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
