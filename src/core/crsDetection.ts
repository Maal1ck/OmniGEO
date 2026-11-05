import { CRSInfo } from '../types/gis';
import { getCRSByCode, searchCRS } from './crsDefinitions';

interface AuthorityMatch {
  code: string;
  depth: number;
  blockType: string;
}

/**
 * Extracts EPSG authority tokens with their tree depth and enclosing block type
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
      let endWord = j + 1;
      while (j >= 0 && /[a-zA-Z0-9_]/.test(wkt[j])) j--;
      const blockName = wkt.slice(j + 1, endWord).toUpperCase();
      
      depth++;
      blockStack.push({ type: blockName, depth });

      if (blockName === 'AUTHORITY' || blockName === 'ID') {
        // Read authority payload
        const sub = wkt.slice(i);
        const authRegex = /^\[\s*["']EPSG["']\s*,\s*["']?(\d+)["']?\s*\]/i;
        const match = authRegex.exec(sub);
        if (match) {
          const parentBlock = blockStack[blockStack.length - 2]?.type || 'ROOT';
          matches.push({
            code: match[1],
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
    .toUpperCase()
    .replace(/[_\-/\\,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match ESRI PRJ Projection Names when no explicit AUTHORITY tag is present
 */
export function matchEsriProjectionName(prjText: string): CRSInfo | null {
  const upper = prjText.toUpperCase();
  const isProjected = upper.includes('PROJCS') || upper.includes('PROJECTEDCRS');
  const isGeographic = !isProjected && (upper.includes('GEOGCS') || upper.includes('GEODETICCRS') || upper.includes('GEOGRAPHICCRS'));

  // 1. If PROJECTED: First extract the PROJCS name
  if (isProjected) {
    const nameMatch = /PROJCS\s*\[\s*["']([^"']+)["']/i.exec(prjText) ||
                      /PROJECTEDCRS\s*\[\s*["']([^"']+)["']/i.exec(prjText);
    const projName = nameMatch ? nameMatch[1] : '';
    const normProjName = normalizeName(projName);

    // --- A. UTM Zones ---
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

    // NAD83 UTM: e.g. "NAD_1983_UTM_Zone_18N"
    const nad83UtmMatch = /(?:NAD_?1983_UTM_ZONE_|NAD83\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
    if (nad83UtmMatch) {
      const zone = parseInt(nad83UtmMatch[1], 10);
      if (zone >= 1 && zone <= 23) {
        const crs = getCRSByCode(`EPSG:${26900 + zone}`);
        if (crs) return crs;
      }
    }

    // NAD27 UTM: e.g. "NAD_1927_UTM_Zone_12N"
    const nad27UtmMatch = /(?:NAD_?1927_UTM_ZONE_|NAD27\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
    if (nad27UtmMatch) {
      const zone = parseInt(nad27UtmMatch[1], 10);
      if (zone >= 1 && zone <= 22) {
        const crs = getCRSByCode(`EPSG:${26700 + zone}`);
        if (crs) return crs;
      }
    }

    // ETRS89 UTM: e.g. "ETRS_1989_UTM_Zone_32N" or "ETRS89 / UTM zone 32N"
    const etrsUtmMatch = /(?:ETRS_?1989_UTM_ZONE_|ETRS89\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
    if (etrsUtmMatch) {
      const zone = parseInt(etrsUtmMatch[1], 10);
      if (zone >= 28 && zone <= 38) {
        const crs = getCRSByCode(`EPSG:${25800 + zone}`);
        if (crs) return crs;
      }
    }

    // ED50 UTM: e.g. "ED_1950_UTM_Zone_30N"
    const ed50UtmMatch = /(?:ED_?1950_UTM_ZONE_|ED50\s*[\/\-_]?\s*UTM\s*ZONE\s*)(\d{1,2})\s*N?/i.exec(projName);
    if (ed50UtmMatch) {
      const zone = parseInt(ed50UtmMatch[1], 10);
      if (zone >= 28 && zone <= 38) {
        const crs = getCRSByCode(`EPSG:${23000 + zone}`);
        if (crs) return crs;
      }
    }

    // Australia MGA (GDA2020 & GDA94)
    const gda2020Match = /GDA2020\s*[\/\-_]?\s*MGA\s*ZONE\s*(\d{1,2})/i.exec(projName);
    if (gda2020Match) {
      const zone = parseInt(gda2020Match[1], 10);
      if (zone >= 48 && zone <= 58) {
        const crs = getCRSByCode(`EPSG:${7800 + zone}`);
        if (crs) return crs;
      }
    }

    // --- B. National Grids & Standards ---
    // France: RGF93 / Lambert-93 & CC42-CC50 & Lambert II Etendu
    if (normProjName.includes('LAMBERT 93') || normProjName.includes('RGF93 LAMBERT 93') || normProjName.includes('RGF 1993 LAMBERT 93')) {
      return getCRSByCode('EPSG:2154');
    }
    const ccMatch = /CC\s*(4[2-9]|50)\b/i.exec(normProjName);
    if (ccMatch) {
      const cc = parseInt(ccMatch[1], 10);
      return getCRSByCode(`EPSG:${3900 + cc}`);
    }
    if (normProjName.includes('LAMBERT II ETENDU') || normProjName.includes('LAMBERT 2 ETENDU') || normProjName.includes('LAMBERT II EXPANDED')) {
      return getCRSByCode('EPSG:27572');
    }
    if (normProjName.includes('LAMBERT I\b') || normProjName.includes('LAMBERT 1\b')) {
      return getCRSByCode('EPSG:27571');
    }
    if (normProjName.includes('LAMBERT III\b') || normProjName.includes('LAMBERT 3\b')) {
      return getCRSByCode('EPSG:27573');
    }
    if (normProjName.includes('LAMBERT IV\b') || normProjName.includes('LAMBERT 4\b')) {
      return getCRSByCode('EPSG:27574');
    }

    // UK & Ireland
    if (normProjName.includes('BRITISH NATIONAL GRID') || normProjName.includes('OSGB 1936') || normProjName.includes('OSGB36')) {
      return getCRSByCode('EPSG:27700');
    }
    if (normProjName.includes('IRISH TRANSVERSE MERCATOR') || normProjName.includes('ITM')) {
      return getCRSByCode('EPSG:2157');
    }

    // Web Mercator & Global Projected
    if (normProjName.includes('WEB MERCATOR') || normProjName.includes('PSEUDO MERCATOR') || normProjName.includes('POPULAR VISUALISATION')) {
      return getCRSByCode('EPSG:3857');
    }
    if (normProjName.includes('WORLD MERCATOR')) {
      return getCRSByCode('EPSG:3395');
    }

    // USA Standard Projections
    if (normProjName.includes('CONUS ALBERS') || normProjName.includes('USA CONTIGUOUS ALBERS')) {
      return getCRSByCode('EPSG:5070');
    }
    if (normProjName.includes('NEW YORK LONG ISLAND') || normProjName.includes('LONG ISLAND')) {
      return getCRSByCode('EPSG:2263');
    }

    // Switzerland & Low Countries
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

    // Try catalog search by projected name
    if (projName.length >= 4) {
      const searchResults = searchCRS(projName);
      if (searchResults.length > 0 && !searchResults[0].isGeographic) {
        return searchResults[0];
      }
    }
  }

  // 2. If strictly GEOGRAPHIC (NO PROJCS):
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
  const isProjected = upper.includes('PROJCS') || upper.includes('PROJECTEDCRS');

  // 1. Check for authority codes
  const authorities = extractWktAuthorities(prjContent);
  if (authorities.length > 0) {
    if (isProjected) {
      // Find authority associated directly with PROJCS / PROJECTEDCRS
      const projAuth = authorities.find(a => 
        a.blockType === 'PROJCS' || a.blockType === 'PROJECTEDCRS' || a.depth === 1
      );
      if (projAuth) {
        const found = getCRSByCode(`EPSG:${projAuth.code}`);
        if (found) return found;
      }
      // If no depth 1 authority, check the last authority if it's not the GEOGCS one
      const lastAuth = authorities[authorities.length - 1];
      if (lastAuth && lastAuth.code !== '4326' && lastAuth.code !== '4269') {
        const found = getCRSByCode(`EPSG:${lastAuth.code}`);
        if (found) return found;
      }
    } else {
      // Geographic: check depth 1 or first authority
      const geoAuth = authorities.find(a => a.blockType === 'GEOGCS' || a.depth === 1) || authorities[0];
      if (geoAuth) {
        const found = getCRSByCode(`EPSG:${geoAuth.code}`);
        if (found) return found;
      }
    }
  }

  // 2. Fall back to comprehensive ESRI projection & datum name dictionary
  const fromName = matchEsriProjectionName(prjContent);
  if (fromName) return fromName;

  return null;
}

/**
 * Extracts CRS from standard GeoJSON "crs" member (RFC 7946 & legacy OGC URNs)
 */
export function detectCRSFromGeoJSONMember(crsProperty: any): CRSInfo | null {
  if (!crsProperty) return null;

  // e.g. { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } }
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

  const epsgMatch = /EPSG(?:::|:|\/)?(\d+)/i.exec(upper);
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
 * Accurately prevents projecting files from mistakenly defaulting to WGS 84!
 */
export function detectCRSFromCoordinates(
  bounds: [number, number, number, number],
  explicitCrs?: CRSInfo | null
): CoordinateDetectionResult {
  const [minX, minY, maxX, maxY] = bounds;

  // If explicit verified CRS was already detected (e.g. from PRJ or GPKG header)
  if (explicitCrs) {
    return {
      detectedCRS: explicitCrs,
      crsStatus: 'verified',
      confidenceReason: `CRS verified from file header metadata (${explicitCrs.code}).`,
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
  const isWithinGeographic = minX >= -180.5 && maxX <= 180.5 && minY >= -90.5 && maxY <= 90.5;
  if (isWithinGeographic) {
    return {
      detectedCRS: getCRSByCode('EPSG:4326'),
      crsStatus: 'assumed',
      confidenceReason: `Coordinates [${minX.toFixed(4)}, ${minY.toFixed(4)}] to [${maxX.toFixed(4)}, ${maxY.toFixed(4)}] fit within standard geographic degrees [-180..180, -90..90]. Identified as WGS 84.`,
    };
  }

  // 2. Projected Coordinates Detected (Coordinates exceed [-180, 180] or [-90, 90])
  // Lambert-93 (France): X in [50000, 1400000], Y in [6000000, 7200000]
  if (minX >= 40000 && maxX <= 1450000 && minY >= 5900000 && maxY <= 7300000) {
    return {
      detectedCRS: getCRSByCode('EPSG:2154'),
      crsStatus: 'assumed',
      confidenceReason: `Coordinates (X: ${Math.round(minX)}..${Math.round(maxX)}, Y: ${Math.round(minY)}..${Math.round(maxY)}) match mainland France Lambert-93 (EPSG:2154) metric range.`,
    };
  }

  // British National Grid (OSGB36): X in [0, 700000], Y in [0, 1350000]
  if (minX >= 0 && maxX <= 700000 && minY >= 0 && maxY <= 1350000) {
    return {
      detectedCRS: getCRSByCode('EPSG:27700'),
      crsStatus: 'assumed',
      confidenceReason: `Coordinates match Great Britain National Grid OSGB36 (EPSG:27700) metric bounds.`,
    };
  }

  // Web Mercator (EPSG:3857): X and Y in [-20037508, 20037508] and large values (> 180)
  if (
    Math.abs(minX) <= 20037508 && Math.abs(maxX) <= 20037508 &&
    Math.abs(minY) <= 20037508 && Math.abs(maxY) <= 20037508 &&
    (Math.abs(maxX) > 1000 || Math.abs(maxY) > 1000)
  ) {
    // If coordinates are in millions or worldwide Web Mercator extent
    if (Math.abs(maxX) > 100000 || Math.abs(maxY) > 100000) {
      return {
        detectedCRS: getCRSByCode('EPSG:3857'),
        crsStatus: 'assumed',
        confidenceReason: `Large metric coordinates within Web Mercator global projection bounds (EPSG:3857).`,
      };
    }
  }

  // UTM False Easting Range: Easting in [100000, 900000], Northing in [0, 10000000]
  if (minX >= 100000 && maxX <= 900000 && minY >= 0 && maxY <= 10000000) {
    return {
      detectedCRS: null,
      crsStatus: 'missing',
      confidenceReason: `Metric coordinates (X: ${Math.round(minX)}, Y: ${Math.round(minY)}) characteristic of UTM projection (False Easting ~500,000m). Please select the exact UTM zone.`,
    };
  }

  // Projected but ambiguous
  return {
    detectedCRS: null,
    crsStatus: 'missing',
    confidenceReason: `Projected coordinates detected ([${Math.round(minX)}, ${Math.round(minY)}] to [${Math.round(maxX)}, ${Math.round(maxY)}]). Cannot assume WGS 84 degrees. Please assign a CRS.`,
  };
}
