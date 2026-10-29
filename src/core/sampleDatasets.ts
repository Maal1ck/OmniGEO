import { SpatialDataset } from '../types/gis';
import { getCRSByCode } from './crsDefinitions';
import { computeGeoJSONBounds, detectGeometryType, validateDatasetGeometries } from './geometryValidation';
import { extractSchemaFields } from './formatParsers';

export function createSampleDatasets(): SpatialDataset[] {
  // 1. Urban Cadastral Parcels (Polygon)
  const parcelsGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { parcel_id: 'PAR-8901', zoning: 'Commercial-High', area_sqm: 4250, owner: 'Metro Realty Corp', assessed_val: 1850000 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.1278, 51.5074],
            [-0.1250, 51.5074],
            [-0.1250, 51.5095],
            [-0.1278, 51.5095],
            [-0.1278, 51.5074]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: { parcel_id: 'PAR-8902', zoning: 'Residential-Mixed', area_sqm: 2900, owner: 'Canalview Ltd', assessed_val: 920000 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.1250, 51.5074],
            [-0.1220, 51.5074],
            [-0.1220, 51.5095],
            [-0.1250, 51.5095],
            [-0.1250, 51.5074]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: { parcel_id: 'PAR-8903', zoning: 'Public Park / Green', area_sqm: 8100, owner: 'City Council', assessed_val: 0 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.1280, 51.5050],
            [-0.1220, 51.5050],
            [-0.1220, 51.5070],
            [-0.1280, 51.5070],
            [-0.1280, 51.5050]
          ]]
        }
      },
      {
        type: 'Feature',
        properties: { parcel_id: 'PAR-8904', zoning: 'Industrial-Light', area_sqm: 5400, owner: 'Logistics One', assessed_val: 1250000 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.1320, 51.5060],
            [-0.1285, 51.5060],
            [-0.1285, 51.5090],
            [-0.1320, 51.5090],
            [-0.1320, 51.5060]
          ]]
        }
      }
    ]
  };

  // 2. Air Quality Sensor Stations (CSV-origin Point dataset)
  const sensorsGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { station_id: 'AQ-101', location: 'Trafalgar Square', pm25: 14.2, no2: 28.5, status: 'Good', elevation_m: 18 },
        geometry: { type: 'Point', coordinates: [-0.1281, 51.5080] }
      },
      {
        type: 'Feature',
        properties: { station_id: 'AQ-102', location: 'Waterloo Bridge', pm25: 22.8, no2: 44.1, status: 'Moderate', elevation_m: 12 },
        geometry: { type: 'Point', coordinates: [-0.1172, 51.5085] }
      },
      {
        type: 'Feature',
        properties: { station_id: 'AQ-103', location: 'Westminster Pier', pm25: 18.5, no2: 32.0, status: 'Moderate', elevation_m: 9 },
        geometry: { type: 'Point', coordinates: [-0.1246, 51.5014] }
      },
      {
        type: 'Feature',
        properties: { station_id: 'AQ-104', location: 'St James Park', pm25: 8.7, no2: 16.3, status: 'Excellent', elevation_m: 14 },
        geometry: { type: 'Point', coordinates: [-0.1340, 51.5025] }
      },
      {
        type: 'Feature',
        properties: { station_id: 'AQ-105', location: 'Covent Garden', pm25: 19.4, no2: 37.6, status: 'Moderate', elevation_m: 24 },
        geometry: { type: 'Point', coordinates: [-0.1232, 51.5117] }
      }
    ]
  };

  // 3. Transit Infrastructure Corridors (LineString)
  const transitGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { line_id: 'TR-NORTH', line_name: 'Northern Arterial', gauge_mm: 1435, electrified: true, frequency_min: 3 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-0.1420, 51.5000],
            [-0.1350, 51.5045],
            [-0.1278, 51.5074],
            [-0.1210, 51.5120],
            [-0.1150, 51.5170]
          ]
        }
      },
      {
        type: 'Feature',
        properties: { line_id: 'TR-RIVER', line_name: 'Thames Express Express', gauge_mm: 1435, electrified: true, frequency_min: 5 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-0.1380, 51.5010],
            [-0.1260, 51.5030],
            [-0.1170, 51.5070],
            [-0.1080, 51.5100],
            [-0.0980, 51.5120]
          ]
        }
      }
    ]
  };

  // 4. Regional Nature Reserve (Shapefile simulation with sidecars)
  const reserveGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { site_code: 'BIO-RES-01', habitat: 'Ancient Broadleaf Woodland', designation: 'SSSI', area_ha: 312.4, managed_by: 'Forestry Comm' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.1400, 51.5150],
            [-0.1300, 51.5150],
            [-0.1280, 51.5220],
            [-0.1380, 51.5240],
            [-0.1420, 51.5190],
            [-0.1400, 51.5150]
          ]]
        }
      }
    ]
  };

  const crs4326 = getCRSByCode('EPSG:4326')!;

  const datasets: SpatialDataset[] = [
    {
      id: 'demo-parcels',
      name: 'urban_cadastral_parcels',
      originalFileName: 'urban_cadastral_parcels.geojson',
      format: 'geojson',
      sizeBytes: 18450,
      featureCount: parcelsGeoJSON.features.length,
      geometryType: 'Polygon',
      detectedCRS: crs4326,
      crsStatus: 'verified',
      bounds: computeGeoJSONBounds(parcelsGeoJSON),
      fields: extractSchemaFields(parcelsGeoJSON),
      geojson: parcelsGeoJSON,
      validationIssues: validateDatasetGeometries(parcelsGeoJSON, 'EPSG:4326'),
      status: 'ready',
      addedAt: Date.now() - 3600000,
    },
    {
      id: 'demo-sensors',
      name: 'air_quality_monitoring_stations',
      originalFileName: 'air_quality_monitoring_stations.csv',
      format: 'csv',
      sizeBytes: 9420,
      featureCount: sensorsGeoJSON.features.length,
      geometryType: 'Point',
      detectedCRS: crs4326,
      crsStatus: 'verified',
      bounds: computeGeoJSONBounds(sensorsGeoJSON),
      fields: extractSchemaFields(sensorsGeoJSON),
      geojson: sensorsGeoJSON,
      validationIssues: validateDatasetGeometries(sensorsGeoJSON, 'EPSG:4326'),
      status: 'ready',
      addedAt: Date.now() - 3000000,
    },
    {
      id: 'demo-transit',
      name: 'metro_transit_corridors',
      originalFileName: 'metro_transit_corridors.kml',
      format: 'kml',
      sizeBytes: 14200,
      featureCount: transitGeoJSON.features.length,
      geometryType: 'LineString',
      detectedCRS: crs4326,
      crsStatus: 'verified',
      bounds: computeGeoJSONBounds(transitGeoJSON),
      fields: extractSchemaFields(transitGeoJSON),
      geojson: transitGeoJSON,
      validationIssues: validateDatasetGeometries(transitGeoJSON, 'EPSG:4326'),
      status: 'ready',
      addedAt: Date.now() - 2500000,
    },
    {
      id: 'demo-reserve-shp',
      name: 'biodiversity_nature_reserves',
      originalFileName: 'biodiversity_nature_reserves.shp',
      format: 'shapefile',
      sizeBytes: 42100,
      featureCount: reserveGeoJSON.features.length,
      geometryType: 'Polygon',
      detectedCRS: crs4326,
      crsStatus: 'verified',
      bounds: computeGeoJSONBounds(reserveGeoJSON),
      fields: extractSchemaFields(reserveGeoJSON),
      geojson: reserveGeoJSON,
      sidecars: [
        { name: 'biodiversity_nature_reserves.shp', extension: '.shp', size: 2840, present: true, required: true },
        { name: 'biodiversity_nature_reserves.shx', extension: '.shx', size: 108, present: true, required: true },
        { name: 'biodiversity_nature_reserves.dbf', extension: '.dbf', size: 1240, present: true, required: true },
        { name: 'biodiversity_nature_reserves.prj', extension: '.prj', size: 142, present: true, required: false },
        { name: 'biodiversity_nature_reserves.cpg', extension: '.cpg', size: 6, present: true, required: false },
      ],
      validationIssues: validateDatasetGeometries(reserveGeoJSON, 'EPSG:4326'),
      status: 'ready',
      addedAt: Date.now() - 1800000,
    }
  ];

  return datasets;
}
