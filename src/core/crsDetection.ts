import { CRSInfo } from '../types/gis';
import { getCRSByCode, searchCRS } from './crsDefinitions';
import epsgCatalog from './epsgCatalog.json';

interface AuthorityMatch {
  code: string;
  depth: number;
  blockType: string;
  authorityType: 'EPSG' | 'ESRI';
}

/**
 * Extracts EPSG and ESRI authority tokens with their tree depth and enclosing block type
 */
export function extractWktAuthorities(wkt: string): AuthorityMatch[] {
  const matches: AuthorityMatch[] = [];
  let depth = 0;
  let inString = false;
  const blockStack: { type: string; depth: number }[] = [];

  for (let i = 0; i < wkt.length; i++) {
    const ch = wkt[i];

    if (ch === '"') {
      if (inString && wkt[i + 1] === '"') {
        i++;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (inString) continue;

    if (ch === '[') {
      // Find preceding identifier (e.g. PROJCS, GEOGCS, AUTHORITY, ID, etc.)
      let j = i - 1;
      while (j >= 0 && /\s/.test(wkt[j])) j--;
      const endWord = j + 1;
      while (j >= 0 && /[a-zA-Z0-9_]/.test(wkt[j])) j--;
      const blockName = wkt.slice(j + 1, endWord).toUpperCase();
      
      depth++;
      blockStack.push({ type: blockName, depth });

      if (blockName === 'AUTHORITY' || blockName === 'ID') {
        // Read authority payload (supports both EPSG and ESRI authority tags)
        const sub = wkt.slice(i);
        const authRegex = /^\[\s*["'](EPSG|ESRI)["']\s*,\s*["']?(\d+)["']?\s*\]/i;
        const match = authRegex.exec(sub);
        if (match) {
          const parentBlock = blockStack[blockStack.length - 2]?.type || 'ROOT';
          matches.push({
            authorityType: match[1].toUpperCase() as 'EPSG' | 'ESRI',
            code: match[2],
            depth: depth - 1,
            blockType: parentBlock,
          });
        }
      }
    } else if (ch === ']') {
      blockStack.pop();
      depth--;
    }
  }

  return matches;
}

/**
 * Normalizes string for fuzzy/token projection name matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts numeric parameters from WKT PARAMETER blocks
 */
function extractWktParameters(wkt: string): Record<string, number> {
  const params: Record<string, number> = {};
  const regex = /PARAMETER\s*\[\s*["']([^"']+)["']\s*,\s*([0-9.-]+)\s*\]/gi;
  let match;
  while ((match = regex.exec(wkt)) !== null) {
    const key = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const val = parseFloat(match[2]);
    if (Number.isFinite(val)) {
      params[key] = val;
    }
  }
  return params;
}

/**
 * Accurately determines if WKT coordinate system is in degrees (geographic)
 * rather than metric (projected), distinguishing inner datum units from outer projection units.
 */
export function isWktDegreeSystem(wkt: string): boolean {
  const upper = wkt.toUpperCase().trim();
  const isProjected = upper.includes('PROJCS') || upper.includes('PROJECTEDCRS');
  if (!isProjected) return true;

  const topMatch = /^(?:PROJCS|PROJECTEDCRS|GEOGCS|GEODETICCRS|GEOGRAPHICCRS)\s*\[\s*["']([^"']+)["']/i.exec(upper);
  const topName = topMatch ? topMatch[1].toUpperCase() : '';
  if (
    topName.includes('DEGREE') || 
    topName.includes('DEGREES') || 
    topName.includes('104261') ||
    topName.includes('SUD_MAROC_DEGREE') ||
    topName.includes('NORD_MAROC_DEGREE')
  ) {
    return true;
  }

  const allUnits = Array.from(upper.matchAll(/UNIT\s*\[\s*["']([^"']+)["']/gi)).map(m => m[1]);
  const outerUnit = allUnits[allUnits.length - 1] || '';
  if (outerUnit.toUpperCase().includes('DEGREE')) return true;

  return false;
}

/**
 * Matches projection mathematically based on geometric parameters (central meridian, standard parallel, false easting/northing)
 */
function matchByWktParameters(wkt: string): CRSInfo | null {
  const params = extractWktParameters(wkt);
  const lon0 = params.centralmeridian;
  const lat1 = params.standardparallel1 ?? params.latitudeoforigin;

  if (lon0 === undefined) return null;

  const isDegree = isWktDegreeSystem(wkt);

  // --- Morocco Merchich Projections (Central Meridian: -5.4° / -6.0 grads) ---
  if (Math.abs(lon0 - (-5.4)) < 0.05) {
    // If the projection is specified in degrees (Sud_Maroc_degree / Merchich degrees), it is EPSG:4261
    if (isDegree) {
      return getCRSByCode('EPSG:4261');
    }
    // Sud Maroc Metric (lat_1 = 29.7° / 33.0 grads)
    if (lat1 !== undefined && Math.abs(lat1 - 29.7) < 0.2) {
      return getCRSByCode('EPSG:26192');
    }
    // Nord Maroc Metric (lat_1 = 33.3° / 37.0 grads)
    if (lat1 !== undefined && Math.abs(lat1 - 33.3) < 0.2) {
      return getCRSByCode('EPSG:26191');
    }
    // Sahara Nord (lat_1 = 26.1° / 29.0 grads)
    if (lat1 !== undefined && Math.abs(lat1 - 26.1) < 0.2) {
      return getCRSByCode('EPSG:26194');
    }
    // Sahara Sud (lat_1 = 22.5° / 25.0 grads)
    if (lat1 !== undefined && Math.abs(lat1 - 22.5) < 0.2) {
      return getCRSByCode('EPSG:26195');
    }
  }

  // --- France Lambert-93 (lon_0 = 3.0°, lat_1 = 49.0°, lat_2 = 44.0°, x_0 = 700000, y_0 = 6600000) ---
  if (Math.abs(lon0 - 3.0) < 0.05 && params.falseeasting === 700000 && params.falsenorthing === 6600000) {
    return getCRSByCode('EPSG:2154');
  }

  // --- UK British National Grid (lon_0 = -2.0°, lat_0 = 49.0°, x_0 = 400000, y_0 = -100000) ---
  if (Math.abs(lon0 - (-2.0)) < 0.05 && params.falseeasting === 400000 && params.falsenorthing === -100000) {
    return getCRSByCode('EPSG:27700');
  }

  return null;
}

/**
 * Universal Catalog Search across all 6,900+ EPSG & ESRI entries using token and compact matching
 */
function matchFromCatalogByNames(names: string[]): CRSInfo | null {
  const catEntries = Object.entries(epsgCatalog as Record<string, { code: string; name: string; kind: string; proj4: string | null }>);

  for (const rawName of names) {
    if (!rawName || rawName.length < 3) continue;

    const norm = normalizeName(rawName);
    const compact = norm.replace(/\s+/g, '');
    const tokens = norm.split(' ').filter(t => 
      t.length > 2 && 
      !['degree', 'degrees', 'gcs', 'datum', 'd', 'fips', 'zone', 'projected', 'grid'].includes(t)
    );

    // 1. Exact Compact match
    for (const [code, entry] of catEntries) {
      const eNorm = normalizeName(entry.name);
      const eCompact = eNorm.replace(/\s+/g, '');
      if (eCompact === compact) {
        const found = getCRSByCode(`EPSG:${code}`);
        if (found) return found;
      }
    }

    // 2. All significant tokens match
    if (tokens.length >= 1) {
      let bestCode: string | null = null;
      let bestScore = -1;

      for (const [code, entry] of catEntries) {
        const eNorm = normalizeName(entry.name);
        const eCompact = eNorm.replace(/\s+/g, '');

        if (compact.includes(eCompact) || eCompact.includes(compact)) {
          const score = 500 - Math.abs(eCompact.length - compact.length);
          if (score > bestScore) {
            bestScore = score;
            bestCode = code;
          }
        }

        const matchCount = tokens.filter(t => eNorm.includes(t)).length;
        if (matchCount === tokens.length) {
          const score = 200 + matchCount * 25 - Math.abs(eNorm.length - norm.length);
          if (score > bestScore) {
            bestScore = score;
            bestCode = code;
          }
        }
      }

      if (bestCode && bestScore > 100) {
        const found = getCRSByCode(`EPSG:${bestCode}`);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Match ESRI PRJ Projection Names when no explicit AUTHORITY tag is present
 */
export function matchEsriProjectionName(prjText: string): CRSInfo | null {
  const upper = prjText.toUpperCase();
  const isProjected = upper.includes('PROJCS') || upper.includes('PROJECTEDCRS');
  const isGeographic = !isProjected && (upper.includes('GEOGCS') || upper.includes('GEODETICCRS') || upper.includes('GEOGRAPHICCRS'));

  // 1. FIRST-CLASS MOROCCAN GEODETIC DEGREE DETECTION:
  // "Sud_Maroc_degree", "Nord_Maroc_degree", and "Merchich (degrees)" are explicitly EPSG:4261 (Merchich geographic 2D in degrees)
  if (
    upper.includes('SUD_MAROC_DEGREE') ||
    upper.includes('SUD MAROC DEGREE') ||
    upper.includes('SUD_MAROC_DEGREES') ||
    upper.includes('MERCHICH_DEGREES') ||
    upper.includes('MERCHICH (DEGREES)') ||
    (isGeographic && upper.includes('GCS_MERCHICH')) ||
    upper.includes('NORD_MAROC_DEGREE') ||
    upper.includes('NORD MAROC DEGREE') ||
    (isGeographic && (upper.includes('MERCHICH') || upper.includes('SUD_MAROC') || upper.includes('SUD MAROC') || upper.includes('MAROC')))
  ) {
    return getCRSByCode('EPSG:4261');
  }

  // 2. Mathematical parameter match (exact and infallible for metric grids)
  const mathCRS = matchByWktParameters(prjText);
  if (mathCRS) return mathCRS;

  // Extract all quoted identifier names from WKT
  const extractedNames: string[] = [];
  const nameRegex = /(?:PROJCS|PROJECTEDCRS|GEOGCS|GEODETICCRS|GEOGRAPHICCRS|DATUM)\s*\[\s*["']([^"']+)["']/gi;
  let nMatch;
  while ((nMatch = nameRegex.exec(prjText)) !== null) {
    extractedNames.push(nMatch[1]);
  }

  const projName = extractedNames[0] || '';
  const normProjName = normalizeName(projName);

  // --- SPECIALIZED FAST SHORTCUTS ---
  // A. Morocco Merchich Projections (Metric Lambert - in meters)
  // Only matched if NOT a degree system!
  if (
    (normProjName.includes('SUD MAROC') || 
     normProjName.includes('SUD_MAROC') ||
     (normProjName.includes('MAROC') && normProjName.includes('SUD')) ||
     (upper.includes('SUD') && upper.includes('MAROC')) ||
     upper.includes('MERCHICH_SUD_MAROC')) &&
    !upper.includes('DEGREE')
  ) {
    return getCRSByCode('EPSG:26192');
  }

  if (
    (normProjName.includes('NORD MAROC') || 
     normProjName.includes('NORD_MAROC') ||
     (normProjName.includes('MAROC') && normProjName.includes('NORD')) ||
     (upper.includes('NORD') && upper.includes('MAROC')) ||
     upper.includes('MERCHICH_NORD_MAROC')) &&
    !upper.includes('DEGREE')
  ) {
    return getCRSByCode('EPSG:26191');
  }

  if (normProjName.includes('SAHARA NORD') && !upper.includes('DEGREE')) {
    return getCRSByCode('EPSG:26194');
  }
  if (normProjName.includes('SAHARA SUD') && !upper.includes('DEGREE')) {
    return getCRSByCode('EPSG:26195');
  }
  if (normProjName.includes('MERCHICH') && !isProjected) {
    return getCRSByCode('EPSG:4261');
  }

  // B. UTM Zones
  // WGS 84 UTM: e.g. "WGS_1984_UTM_Zone_32N" or "UTM Zone 32N"
  const wgsUtmMatch = /(?:WGS_?1984_UTM_ZONE_|WGS\s*84\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*([NS])/i.exec(projName);
  if (wgsUtmMatch) {
    const zone = parseInt(wgsUtmMatch[1], 10);
    const hemi = wgsUtmMatch[2].toUpperCase();
    if (zone >= 1 && zone <= 60) {
      const epsg = hemi === 'N' ? 32600 + zone : 32700 + zone;
      const crs = getCRSByCode(`EPSG:${epsg}`);
      if (crs) return crs;
    }
  }

  // NAD83 UTM
  const nad83UtmMatch = /(?:NAD_?1983_UTM_ZONE_|NAD83\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
  if (nad83UtmMatch) {
    const zone = parseInt(nad83UtmMatch[1], 10);
    if (zone >= 1 && zone <= 23) {
      const crs = getCRSByCode(`EPSG:${26900 + zone}`);
      if (crs) return crs;
    }
  }

  // ETRS89 UTM
  const etrsUtmMatch = /(?:ETRS_?1989_UTM_ZONE_|ETRS89\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
  if (etrsUtmMatch) {
    const zone = parseInt(etrsUtmMatch[1], 10);
    if (zone >= 28 && zone <= 38) {
      const crs = getCRSByCode(`EPSG:${25800 + zone}`);
      if (crs) return crs;
    }
  }

  // ED50 UTM
  const ed50UtmMatch = /(?:ED_?1950_UTM_ZONE_|ED50\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
  if (ed50UtmMatch) {
    const zone = parseInt(ed50UtmMatch[1], 10);
    if (zone >= 28 && zone <= 38) {
      const crs = getCRSByCode(`EPSG:${23000 + zone}`);
      if (crs) return crs;
    }
  }

  // C. France
  if (normProjName.includes('LAMBERT 93') || normProjName.includes('RGF93 LAMBERT 93')) {
    return getCRSByCode('EPSG:2154');
  }
  const ccMatch = /CC\s*(4[2-9]|50)\b/i.exec(normProjName);
  if (ccMatch) {
    const cc = parseInt(ccMatch[1], 10);
    return getCRSByCode(`EPSG:${3900 + cc}`);
  }
  if (normProjName.includes('LAMBERT II ETENDU') || normProjName.includes('LAMBERT 2 ETENDU')) {
    return getCRSByCode('EPSG:27572');
  }

  // D. UK & Ireland (ONLY if explicit UK keywords exist!)
  if (normProjName.includes('BRITISH NATIONAL GRID') || normProjName.includes('OSGB 1936') || normProjName.includes('OSGB36')) {
    return getCRSByCode('EPSG:27700');
  }
  if (normProjName.includes('IRISH TRANSVERSE MERCATOR') || normProjName.includes('ITM')) {
    return getCRSByCode('EPSG:2157');
  }

  // E. Web Mercator & Global Projected
  if (normProjName.includes('WEB MERCATOR') || normProjName.includes('PSEUDO MERCATOR') || normProjName.includes('POPULAR VISUALISATION')) {
    return getCRSByCode('EPSG:3857');
  }
  if (normProjName.includes('WORLD MERCATOR')) {
    return getCRSByCode('EPSG:3395');
  }

  // F. USA Standard Projections
  if (normProjName.includes('CONUS ALBERS') || normProjName.includes('USA CONTIGUOUS ALBERS')) {
    return getCRSByCode('EPSG:5070');
  }
  if (normProjName.includes('NEW YORK LONG ISLAND') || normProjName.includes('LONG ISLAND')) {
    return getCRSByCode('EPSG:2263');
  }

  // G. Switzerland, Netherlands, Belgium
  if (normProjName.includes('LV95') || normProjName.includes('CH1903+')) {
    return getCRSByCode('EPSG:2056');
  }
  if (normProjName.includes('LV03') || normProjName.includes('CH1903')) {
    return getCRSByCode('EPSG:21781');
  }
  if (normProjName.includes('AMERSFOORT') && normProjName.includes('RD NEW')) {
    return getCRSByCode('EPSG:28992');
  }
  if (normProjName.includes('BELGE 1972') || normProjName.includes('LAMBERT 72')) {
    return getCRSByCode('EPSG:31370');
  }

  // 2. Comprehensive Catalog Search across extracted names
  const catalogMatch = matchFromCatalogByNames(extractedNames);
  if (catalogMatch) return catalogMatch;

  // 3. Geographic Fallbacks (ONLY if NOT projected!)
  if (isGeographic) {
    if (upper.includes('GCS_WGS_1984') || upper.includes('WGS_1984') || upper.includes('WGS 84') || upper.includes('WORLD GEODETIC SYSTEM 1984')) {
      return getCRSByCode('EPSG:4326');
    }
    if (upper.includes('GCS_NORTH_AMERICAN_1983') || upper.includes('NAD83') || upper.includes('NAD_1983')) {
      return getCRSByCode('EPSG:4269');
    }
    if (upper.includes('GCS_NORTH_AMERICAN_1927') || upper.includes('NAD27') || upper.includes('NAD_1927')) {
      return getCRSByCode('EPSG:4267');
    }
    if (upper.includes('GCS_ETRS_1989') || upper.includes('ETRS89') || upper.includes('ETRS_1989')) {
      return getCRSByCode('EPSG:4258');
    }
    if (upper.includes('GCS_RGF_1993') || upper.includes('RGF93') || upper.includes('RGF_1993')) {
      return getCRSByCode('EPSG:4171');
    }
    if (upper.includes('GCS_OSGB_1936') || upper.includes('OSGB 1936')) {
      return getCRSByCode('EPSG:4277');
    }
  }

  return null;
}

/**
 * Robust CRS detection from .prj / WKT string
 */
export function detectCRSFromPRJRobust(prjContent: string): CRSInfo | null {
  if (!prjContent || !prjContent.trim()) return null;

  const upper = prjContent.toUpperCase();

  // Explicit Moroccan Degree Systems: Sud_Maroc_degree is canonical EPSG:4261 (Merchich geographic 2D in degrees)
  if (
    upper.includes('SUD_MAROC_DEGREE') ||
    upper.includes('SUD MAROC DEGREE') ||
    upper.includes('SUD_MAROC_DEGREES') ||
    upper.includes('NORD_MAROC_DEGREE') ||
    upper.includes('NORD MAROC DEGREE') ||
    upper.includes('MERCHICH_DEGREES') ||
    upper.includes('MERCHICH (DEGREES)') ||
    upper.includes('104261')
  ) {
    return getCRSByCode('EPSG:4261');
  }

  const isProjected = upper.includes('PROJCS') || upper.includes('PROJECTEDCRS');

  // 1. Check for authority codes (supporting both EPSG and ESRI authority tags)
  const authorities = extractWktAuthorities(prjContent);
  if (authorities.length > 0) {
    if (isProjected) {
      // Find authority associated directly with PROJCS / PROJECTEDCRS
      const projAuth = authorities.find(a => 
        a.blockType === 'PROJCS' || a.blockType === 'PROJECTEDCRS' || a.depth === 1
      );
      if (projAuth) {
        if (projAuth.code === '104261' || (projAuth.code === '102192' && upper.includes('DEGREE'))) {
          return getCRSByCode('EPSG:4261');
        }
        const found = getCRSByCode(`EPSG:${projAuth.code}`);
        if (found) return found;
      }
      // If no depth 1 authority, check the last authority if it's not the GEOGCS one
      const lastAuth = authorities[authorities.length - 1];
      if (lastAuth && lastAuth.code !== '4326' && lastAuth.code !== '4269') {
        if (lastAuth.code === '104261' || (lastAuth.code === '102192' && upper.includes('DEGREE'))) {
          return getCRSByCode('EPSG:4261');
        }
        const found = getCRSByCode(`EPSG:${lastAuth.code}`);
        if (found) return found;
      }
    } else {
      // Geographic: check depth 1 or first authority
      const geoAuth = authorities.find(a => a.blockType === 'GEOGCS' || a.depth === 1) || authorities[0];
      if (geoAuth) {
        if (geoAuth.code === '104261' || geoAuth.code === '4261') {
          return getCRSByCode('EPSG:4261');
        }
        const found = getCRSByCode(`EPSG:${geoAuth.code}`);
        if (found) return found;
      }
    }
  }

  // 2. Fall back to comprehensive ESRI projection dictionary & parameter matching
  const fromName = matchEsriProjectionName(prjContent);
  if (fromName) return fromName;

  return null;
}

/**
 * Extracts CRS from standard GeoJSON "crs" member (RFC 7946 & legacy OGC URNs)
 */
export function detectCRSFromGeoJSONMember(crsProperty: any): CRSInfo | null {
  if (!crsProperty) return null;

  let name = '';
  if (typeof crsProperty === 'string') {
    name = crsProperty;
  } else if (crsProperty.properties && typeof crsProperty.properties.name === 'string') {
    name = crsProperty.properties.name;
  }

  if (!name) return null;

  const upper = name.toUpperCase().trim();
  if (upper.includes('CRS84') || upper.includes('CRS:84') || upper.includes('OGC:1.3:CRS84')) {
    return getCRSByCode('EPSG:4326');
  }

  const epsgMatch = /(?:EPSG|ESRI)(?:::|:|\/)?(\d+)/i.exec(upper);
  if (epsgMatch) {
    return getCRSByCode(`EPSG:${epsgMatch[1]}`);
  }

  return null;
}

export interface CoordinateDetectionResult {
  detectedCRS: CRSInfo | null;
  crsStatus: 'verified' | 'assumed' | 'missing' | 'ambiguous';
  confidenceReason: string;
}

/**
 * Detects CRS from coordinate ranges and bounding box heuristics.
 * CRITICAL: Never fabricates false national projections (like 27700) on arbitrary coordinates!
 */
export function detectCRSFromCoordinates(
  bounds: [number, number, number, number],
  explicitCrs?: CRSInfo | null
): CoordinateDetectionResult {
  const [minX, minY, maxX, maxY] = bounds;

  const isWithinGeographic = minX >= -180.5 && maxX <= 180.5 && minY >= -90.5 && maxY <= 90.5;

  // If explicit verified CRS was already detected (e.g. from PRJ or GPKG header)
  if (explicitCrs) {
    // Moroccan projection vs geographic degrees cross-check:
    // If explicit CRS is metric Moroccan Lambert (EPSG:26192 Sud Maroc, 26191 Nord Maroc, or 102192)
    // BUT the coordinates are within geographic degree range:
    // It is in geographic degrees on the Merchich datum -> resolve to EPSG:4261!
    if (
      isWithinGeographic &&
      (explicitCrs.code === 'EPSG:26192' || explicitCrs.code === 'EPSG:26191' || explicitCrs.code === 'EPSG:26194' || explicitCrs.code === 'EPSG:26195' || explicitCrs.code === 'EPSG:102192')
    ) {
      const merchichGeo = getCRSByCode('EPSG:4261');
      if (merchichGeo) {
        return {
          detectedCRS: merchichGeo,
          crsStatus: 'verified',
          confidenceReason: `Coordinates [${minX.toFixed(4)}, ${minY.toFixed(4)}] to [${maxX.toFixed(4)}, ${maxY.toFixed(4)}] are in geographic degrees referenced to the Moroccan Merchich datum. Resolved to EPSG:4261 (Merchich Geographic 2D).`,
        };
      }
    }

    return {
      detectedCRS: explicitCrs,
      crsStatus: 'verified',
      confidenceReason: `CRS verified from file header metadata (${explicitCrs.code} - ${explicitCrs.name}).`,
    };
  }

  // Check if bounds are invalid / empty
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || (minX === -180 && maxX === 180 && minY === -90 && maxY === 90)) {
    return {
      detectedCRS: getCRSByCode('EPSG:4326'),
      crsStatus: 'assumed',
      confidenceReason: 'Defaulted to WGS 84 (EPSG:4326) for empty or global dataset.',
    };
  }

  // 1. Geographic Degrees: Longitude within [-180.5, 180.5] AND Latitude within [-90.5, 90.5]
  if (isWithinGeographic) {
    return {
      detectedCRS: getCRSByCode('EPSG:4326'),
      crsStatus: 'assumed',
      confidenceReason: `Coordinates [${minX.toFixed(4)}, ${minY.toFixed(4)}] to [${maxX.toFixed(4)}, ${maxY.toFixed(4)}] fit within standard geographic degrees [-180..180, -90..90]. Identified as WGS 84.`,
    };
  }

  // 2. Projected Coordinates Detected (Coordinates exceed [-180, 180] or [-90, 90])
  // Global Web Mercator (EPSG:3857) worldwide extent in millions of meters
  if (
    Math.abs(minX) <= 20037508 && Math.abs(maxX) <= 20037508 &&
    Math.abs(minY) <= 20037508 && Math.abs(maxY) <= 20037508 &&
    (Math.abs(maxX) > 1000000 || Math.abs(maxY) > 1000000)
  ) {
    return {
      detectedCRS: getCRSByCode('EPSG:3857'),
      crsStatus: 'assumed',
      confidenceReason: `Large metric coordinates within Web Mercator global projection bounds (EPSG:3857).`,
    };
  }

  // IMPORTANT: For local metric coordinates without a .prj, we NEVER assume a single country's grid
  // (e.g. coordinates between 0 and 700,000 exist in Morocco Merchich, France, UK, Switzerland, etc.).
  // We clearly flag it as projected and require/prompt the user to confirm the CRS!
  return {
    detectedCRS: null,
    crsStatus: 'missing',
    confidenceReason: `Projected metric coordinates detected ([${Math.round(minX)}, ${Math.round(minY)}] to [${Math.round(maxX)}, ${Math.round(maxY)}]). No .prj metadata found. Please assign your local CRS (e.g., Merchich / Sud Maroc EPSG:26192, Lambert-93, UTM).`,
  };
}
