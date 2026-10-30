import proj4 from 'proj4';
import epsgIndex from './epsgCatalog.json';
import { CRSInfo } from '../types/gis';

interface EPSGDefinition {
  code: string;
  kind: string;
  name: string;
  proj4: string | null;
  unit: string | null;
  area: string | null;
}

export const COMMON_CRS_LIST: CRSInfo[] = [
  {
    code: 'EPSG:4326',
    name: 'WGS 84 (Geographic 2D)',
    area: 'World (GPS standard)',
    proj4: '+proj=longlat +datum=WGS84 +no_defs +type=crs',
    isGeographic: true,
    unit: 'degrees',
  },
  {
    code: 'EPSG:3857',
    name: 'WGS 84 / Pseudo-Mercator',
    area: 'World (Web Maps, OSM, Google)',
    proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:27700',
    name: 'OSGB36 / British National Grid',
    area: 'United Kingdom - Great Britain onshore',
    proj4: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:2154',
    name: 'RGF93 v1 / Lambert-93',
    area: 'France - mainland onshore and offshore',
    proj4: '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:25832',
    name: 'ETRS89 / UTM zone 32N',
    area: 'Europe - between 6°E and 12°E (Germany, Denmark, etc.)',
    proj4: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:25833',
    name: 'ETRS89 / UTM zone 33N',
    area: 'Europe - between 12°E and 18°E (Norway, Sweden, Poland, Italy)',
    proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:32632',
    name: 'WGS 84 / UTM zone 32N',
    area: 'Northern Hemisphere - between 6°E and 12°E',
    proj4: '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:32633',
    name: 'WGS 84 / UTM zone 33N',
    area: 'Northern Hemisphere - between 12°E and 18°E',
    proj4: '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:32618',
    name: 'WGS 84 / UTM zone 18N',
    area: 'Northern Hemisphere - between 78°W and 72°W (US East Coast, NYC)',
    proj4: '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:5070',
    name: 'NAD83 / Conus Albers',
    area: 'United States - CONUS (Lower 48)',
    proj4: '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:2263',
    name: 'NAD83 / New York Long Island (ftUS)',
    area: 'USA - New York Long Island & NYC',
    proj4: '+proj=lcc +lat_0=40.1666666666667 +lon_0=-74 +lat_1=41.0333333333333 +lat_2=40.6666666666667 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs +type=crs',
    isGeographic: false,
    unit: 'feet',
  },
  {
    code: 'EPSG:6428',
    name: 'NAD83(2011) / California zone 5',
    area: 'USA - California - Los Angeles area',
    proj4: '+proj=lcc +lat_0=33.5 +lon_0=-118 +lat_1=35.4666666666667 +lat_2=34.0333333333333 +x_0=2000000 +y_0=500000 +datum=NAD83 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:3006',
    name: 'SWEREF99 TM',
    area: 'Sweden onshore and offshore',
    proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:28992',
    name: 'Amersfoort / RD New',
    area: 'Netherlands onshore',
    proj4: '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,49.8668,465.84,1.934,-1.667,9.944,1.844 +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:31467',
    name: 'DHDN / 3-degree Gauss-Kruger zone 3',
    area: 'Germany - former West Germany 7.5°E to 10.5°E',
    proj4: '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs +type=crs',
    isGeographic: false,
    unit: 'meters',
  },
  {
    code: 'EPSG:4269',
    name: 'NAD83 (Geographic 2D)',
    area: 'North America - onshore and offshore',
    proj4: '+proj=longlat +datum=NAD83 +no_defs +type=crs',
    isGeographic: true,
    unit: 'degrees',
  },
  {
    code: 'EPSG:4258',
    name: 'ETRS89 (Geographic 2D)',
    area: 'Europe - onshore and offshore',
    proj4: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs +type=crs',
    isGeographic: true,
    unit: 'degrees',
  }
];

const epsgCRSList: CRSInfo[] = Object.values(epsgIndex as Record<string, EPSGDefinition>)
  .flatMap(entry => {
    if (
      (entry.kind !== 'CRS-PROJCRS' && entry.kind !== 'CRS-GEOGCRS') ||
      typeof entry.proj4 !== 'string' ||
      entry.proj4.length === 0
    ) return [];

    const gridFiles = [...entry.proj4.matchAll(/\+(?:nadgrids|geoidgrids)=([^\s]+)/g)]
      .flatMap(([, value]) => value.split(','))
      .filter(value => value && value !== '@null')
      .map(value => value.replace(/^@/, ''));
    const sourceUnit = entry.unit?.toLowerCase()
      || /\+units=([^\s]+)/i.exec(entry.proj4)?.[1]?.toLowerCase()
      || '';
    const unit = sourceUnit.includes('degree')
      ? 'degrees'
      : sourceUnit === 'm' || sourceUnit.includes('metre') || sourceUnit.includes('meter')
        ? 'meters'
        : sourceUnit.includes('foot') || sourceUnit.includes('feet') || sourceUnit === 'ft' || sourceUnit === 'us-ft'
          ? 'feet'
          : entry.unit || 'unknown';

    return [{
      code: `EPSG:${entry.code}`,
      name: entry.name,
      area: entry.area || 'Area not specified',
      proj4: entry.proj4.replace(/\s+\+(?:nadgrids|geoidgrids)=[^\s]+/g, ''),
      transformationWarning: gridFiles.length > 0
        ? `Datum grid file(s) ${[...new Set(gridFiles)].join(', ')} are not bundled; transformations use the available ellipsoid parameters and may be less accurate.`
        : undefined,
      isGeographic: entry.kind.includes('GEOGCRS'),
      unit,
    }];
  });

const crsByCode = new Map<string, CRSInfo>();
for (const crs of [...COMMON_CRS_LIST, ...epsgCRSList]) {
  crsByCode.set(crs.code.toUpperCase(), crs);
}

const registeredCRSCodes = new Set<string>();

function registerCRSDefinition(crs: CRSInfo): void {
  if (registeredCRSCodes.has(crs.code)) return;
  proj4.defs(crs.code, crs.proj4);
  registeredCRSCodes.add(crs.code);
}

// Initialize proj4 definitions
export function initializeCRS(): void {
  for (const crs of COMMON_CRS_LIST) {
    registerCRSDefinition(crsByCode.get(crs.code.toUpperCase()) || crs);
  }
}

// Auto-run initialization
initializeCRS();

export function getCRSByCode(code: string): CRSInfo | null {
  const trimmed = code.trim().toUpperCase();
  const normalized = /^\d+$/.test(trimmed)
    ? `EPSG:${trimmed}`
    : trimmed.replace(/^EPSG\s*:\s*/, 'EPSG:');
  const crs = crsByCode.get(normalized);
  if (crs) registerCRSDefinition(crs);
  return crs || null;
}

export function searchCRS(query: string): CRSInfo[] {
  if (!query || !query.trim()) {
    return COMMON_CRS_LIST.map(crs => crsByCode.get(crs.code.toUpperCase()) || crs);
  }
  const q = query.toLowerCase().trim();
  return [...crsByCode.values()]
    .filter(crs =>
      crs.code.toLowerCase().includes(q) ||
      crs.name.toLowerCase().includes(q) ||
      crs.area.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const aExact = a.code.toLowerCase() === q;
      const bExact = b.code.toLowerCase() === q;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    });
}

function findTopLevelEPSGAuthority(wkt: string): string | null {
  let depth = 0;
  let inString = false;

  for (let index = 0; index < wkt.length; index++) {
    const character = wkt[index];
    if (character === '"') {
      if (inString && wkt[index + 1] === '"') {
        index++;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (inString) continue;

    if (depth === 1 && /[a-z]/i.test(character)) {
      const authority = /^(?:AUTHORITY|ID)\s*\[\s*["']EPSG["']\s*,\s*["']?(\d+)["']?\s*\]/i
        .exec(wkt.slice(index));
      if (authority) return authority[1];
    }

    if (character === '[') depth++;
    else if (character === ']') depth--;
  }

  return null;
}

/**
 * Inspect .prj file string to identify the likely EPSG code
 */
export function detectCRSFromPRJ(prjContent: string): CRSInfo | null {
  if (!prjContent) return null;
  const upper = prjContent.toUpperCase();

  const authorityCode = findTopLevelEPSGAuthority(prjContent);
  if (authorityCode) {
    return getCRSByCode(`EPSG:${authorityCode}`);
  }

  if (upper.includes('WGS_1984_WEB_MERCATOR') || upper.includes('PSEUDO_MERCATOR') || upper.includes('WEB_MERCATOR')) {
    return getCRSByCode('EPSG:3857');
  }
  if (upper.includes('BRITISH_NATIONAL_GRID') || upper.includes('OSGB_1936')) {
    return getCRSByCode('EPSG:27700');
  }
  if (upper.includes('RGF93') || upper.includes('LAMBERT_93') || upper.includes('LAMBERT-93')) {
    return getCRSByCode('EPSG:2154');
  }
  if (upper.includes('ETRS_1989_UTM_ZONE_32N') || upper.includes('ETRS89 / UTM ZONE 32N')) {
    return getCRSByCode('EPSG:25832');
  }
  if (upper.includes('CONUS_ALBERS') || upper.includes('USA_CONTIGUOUS_ALBERS')) {
    return getCRSByCode('EPSG:5070');
  }
  if (upper.includes('LONG ISLAND') && upper.includes('NEW YORK')) {
    return getCRSByCode('EPSG:2263');
  }
  if (upper.includes('GCS_WGS_1984') || upper.includes('GEOGCS["WGS 84"') || upper.includes('DATUM["WGS_1984"')) {
    return getCRSByCode('EPSG:4326');
  }

  return null;
}
