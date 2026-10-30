/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Map as MapIcon, 
  Layers, 
  Table, 
  Info, 
  AlertTriangle, 
  CheckCircle2, 
  Split, 
  Search, 
  Globe, 
  Sliders, 
  Maximize2, 
  Eye, 
  EyeOff, 
  Palette, 
  Calculator, 
  PieChart, 
  Download, 
  ChevronDown, 
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  X
} from 'lucide-react';
import { SpatialDataset, ConversionJob } from '../types/gis';
import { SurfaceUnit } from '../core/spatialAnalytics';
import { getCRSByCode } from '../core/crsDefinitions';
import { reprojectGeoJSON } from '../core/crsEngine';
import { useI18n } from '../core/i18n';

interface MapPreviewProps {
  dataset: SpatialDataset | null;
  datasets: SpatialDataset[];
  onSelectDataset: (dataset: SpatialDataset) => void;
  processedJob?: ConversionJob | null;
  onCalculateSurfaces?: (unit: SurfaceUnit) => void;
  onOpenAggregationModal?: () => void;
  isOverlayOpen?: boolean;
}

const LAYER_PALETTE = [
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Terracotta', hex: '#EA580C' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Rose', hex: '#F43F5E' },
];

export const MapPreview: React.FC<MapPreviewProps> = ({
  dataset,
  datasets,
  onSelectDataset,
  processedJob,
  onCalculateSurfaces,
  onOpenAggregationModal,
  isOverlayOpen = false,
}) => {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const outputGeojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [basemap, setBasemap] = useState<'dark' | 'osm' | 'satellite' | 'offline_grid'>('dark');
  const [showOutputCompare, setShowOutputCompare] = useState(false);
  const [isSwipeMode, setIsSwipeMode] = useState(false);
  const [swipePosition, setSwipePosition] = useState(50);
  const [isDraggingSwipe, setIsDraggingSwipe] = useState(false);
  const [selectedFeatureProps, setSelectedFeatureProps] = useState<Record<string, any> | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'attributes' | 'metadata' | 'validation'>('attributes');
  const [attributeSearch, setAttributeSearch] = useState('');
  const [mapProjectionError, setMapProjectionError] = useState<string | null>(null);
  const [mapProjectionWarning, setMapProjectionWarning] = useState<string | null>(null);
  const [outputProjectionError, setOutputProjectionError] = useState<string | null>(null);

  // Cartographic Legend & Symbology States (Rendered outside the map frame to eliminate glitches)
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [layerColor, setLayerColor] = useState<string>('#F59E0B');
  const [layerOpacity, setLayerOpacity] = useState<number>(0.85);
  const [isLayerVisible, setIsLayerVisible] = useState<boolean>(true);
  const [isSurfaceMenuOpen, setIsSurfaceMenuOpen] = useState(false);
  const surfaceMenuRef = useRef<HTMLDivElement>(null);

  // Resize Leaflet when the outer legend dock opens/closes
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 120);
    return () => clearTimeout(timer);
  }, [isLegendOpen]);

  // When overlay windows close, ensure map size is immediately restored
  useEffect(() => {
    if (!isOverlayOpen) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOverlayOpen]);

  // Close surface menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (surfaceMenuRef.current && !surfaceMenuRef.current.contains(e.target as Node)) {
        setIsSurfaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Swipe dragging
  const handleMapMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSwipe) return;
    const container = mapContainerRef.current?.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(5, Math.min(95, Math.round((x / rect.width) * 100)));
    setSwipePosition(pct);
  };

  const handleMouseUp = () => {
    setIsDraggingSwipe(false);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [51.505, -0.09],
        zoom: 13,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      // Keep instance intact across renders
    };
  }, []);

  // Update Basemap Tiles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (basemap === 'dark') {
      tileLayerRef.current = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          className: 'dark-tiles',
          maxZoom: 19,
        }
      ).addTo(map);
    } else if (basemap === 'osm') {
      tileLayerRef.current = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }
      ).addTo(map);
    } else if (basemap === 'satellite') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri, Maxar',
          maxZoom: 19,
        }
      ).addTo(map);
    } else if (basemap === 'offline_grid') {
      const canvasTiles: any = L.gridLayer();
      canvasTiles.createTile = function (coords: any) {
        const tile = document.createElement('canvas');
        tile.width = 256;
        tile.height = 256;
        const ctx = tile.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#14110E';
          ctx.fillRect(0, 0, 256, 256);
          ctx.strokeStyle = '#29221C';
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, 256, 256);
          ctx.strokeStyle = '#1F1A16';
          ctx.beginPath();
          ctx.moveTo(128, 0); ctx.lineTo(128, 256);
          ctx.moveTo(0, 128); ctx.lineTo(256, 128);
          ctx.stroke();
          ctx.fillStyle = '#F59E0B';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(`Z${coords.z} [${coords.x}, ${coords.y}]`, 8, 18);
        }
        return tile;
      };
      tileLayerRef.current = canvasTiles;
      tileLayerRef.current?.addTo(map);
    }
  }, [basemap]);

  // Render Dataset GeoJSON on Map with customizable symbology & visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geojsonLayerRef.current) {
      map.removeLayer(geojsonLayerRef.current);
      geojsonLayerRef.current = null;
    }

    setMapProjectionError(null);
    setMapProjectionWarning(null);
    if (!dataset || !dataset.geojson || !isLayerVisible) return;

    try {
      const sourceCRS = dataset.detectedCRS?.code;
      if (!sourceCRS || !getCRSByCode(sourceCRS)) {
        throw new Error(`Cannot display this layer because its source CRS (${sourceCRS || 'unknown'}) is not available.`);
      }

      const reprojection = sourceCRS === 'EPSG:4326'
        ? { geojson: dataset.geojson, warnings: [] as string[] }
        : reprojectGeoJSON(dataset.geojson, sourceCRS, 'EPSG:4326');
      const coordinateErrors = reprojection.warnings.filter(warning => warning.startsWith('Coordinate transform error:'));
      if (coordinateErrors.length > 0) {
        throw new Error(coordinateErrors[0]);
      }
      const approximateWarning = reprojection.warnings.find(warning => warning.includes('not bundled'));
      if (approximateWarning) setMapProjectionWarning(approximateWarning);

      const layer = L.geoJSON(reprojection.geojson, {
        style: () => ({
          color: layerColor,
          weight: 2,
          opacity: layerOpacity,
          fillColor: layerColor,
          fillOpacity: layerOpacity * 0.35,
        }),
        pointToLayer: (feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: layerColor,
            color: '#1C1917',
            weight: 2,
            opacity: layerOpacity,
            fillOpacity: layerOpacity * 0.9,
          });
        },
        onEachFeature: (feature, fLayer) => {
          fLayer.on({
            click: () => {
              setSelectedFeatureProps(feature.properties || {});
            },
          });
        },
      }).addTo(map);

      geojsonLayerRef.current = layer;

      // Fit map to layer bounds
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Map preview render error:', err);
      setMapProjectionError(message);
    }
  }, [dataset, isLayerVisible, layerColor, layerOpacity]);

  // Render Processed Output comparison layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (outputGeojsonLayerRef.current) {
      map.removeLayer(outputGeojsonLayerRef.current);
      outputGeojsonLayerRef.current = null;
    }
    setOutputProjectionError(null);

    if (showOutputCompare && processedJob?.outputGeojson) {
      try {
        const targetCRS = processedJob.targetCRS;
        if (!getCRSByCode(targetCRS)) {
          throw new Error(`Cannot display comparison output because CRS ${targetCRS} is not available.`);
        }
        const reprojection = targetCRS === 'EPSG:4326'
          ? { geojson: processedJob.outputGeojson, warnings: [] as string[] }
          : reprojectGeoJSON(processedJob.outputGeojson, targetCRS, 'EPSG:4326');
        const coordinateErrors = reprojection.warnings.filter(warning => warning.startsWith('Coordinate transform error:'));
        if (coordinateErrors.length > 0) {
          throw new Error(coordinateErrors[0]);
        }

        const outLayer = L.geoJSON(reprojection.geojson, {
          style: () => ({
            color: '#EA580C',
            weight: 2,
            dashArray: '5, 5',
            fillColor: '#EA580C',
            fillOpacity: 0.25,
          }),
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 6,
              fillColor: '#EA580C',
              color: '#1C1917',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.9,
            });
          },
        }).addTo(map);

        outputGeojsonLayerRef.current = outLayer;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Output comparison render error:', err);
        setOutputProjectionError(message);
      }
    }
  }, [showOutputCompare, processedJob]);

  const fitCurrentBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !geojsonLayerRef.current) return;
    const bounds = geojsonLayerRef.current.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  const features = dataset?.geojson?.features || (dataset?.geojson?.type === 'Feature' ? [dataset.geojson] : []);
  const filteredFeatures = features.filter((f: any) => {
    if (!attributeSearch.trim()) return true;
    const s = attributeSearch.toLowerCase();
    return Object.values(f.properties || {}).some(v => String(v).toLowerCase().includes(s));
  });

  const exportTableCSV = () => {
    if (!dataset || !dataset.fields || dataset.fields.length === 0) return;
    const headers = dataset.fields.map(f => f.name);
    const rows = features.map((f: any) => 
      headers.map(h => `"${String(f.properties?.[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}_attributes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.75rem)] overflow-hidden bg-[#13110E] text-[#F5EBE1]">
      {/* Top Map Control Bar */}
      <div className="h-12 border-b border-stone-800 bg-[#181411] px-4 flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* Toggle Legend Sidebar Outside Map Frame */}
          <button
            onClick={() => setIsLegendOpen(!isLegendOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              isLegendOpen
                ? 'bg-amber-950/80 border-amber-500/80 text-amber-300 font-semibold shadow-sm'
                : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800'
            }`}
            title="Toggle Cartographic Legend Sidebar (Outside Map Frame)"
          >
            {isLegendOpen ? <PanelLeftClose className="w-3.5 h-3.5 text-amber-400" /> : <PanelLeftOpen className="w-3.5 h-3.5 text-stone-400" />}
            <span>{isLegendOpen ? t.map.hideLegend : t.map.showLegend}</span>
          </button>

          {/* Dataset Switcher */}
          <div className="flex items-center space-x-2">
            <span className="text-stone-400 font-medium">{t.map.layerLabel}:</span>
            <select
              value={dataset?.id || ''}
              onChange={(e) => {
                const found = datasets.find(d => d.id === e.target.value);
                if (found) onSelectDataset(found);
              }}
              className="bg-[#13110E] border border-stone-700 rounded-lg px-2.5 py-1 text-stone-100 font-medium focus:border-amber-500 focus:outline-none max-w-xs truncate cursor-pointer"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id} className="bg-stone-900 text-stone-100">
                  {d.name} ({d.geometryType}, {d.featureCount} {t.common.features})
                </option>
              ))}
            </select>
          </div>

          {dataset && (
            <div className="hidden sm:flex items-center space-x-2 text-stone-400 font-mono text-xs">
              <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-700/50">
                {dataset.detectedCRS?.code || 'EPSG:4326'}
              </span>
              <span>{dataset.featureCount} {t.common.features}</span>
            </div>
          )}
        </div>

        {/* Map View & Analytical Controls */}
        <div className="flex items-center space-x-2">
          {/* Calculate Surface Button Dropdown */}
          {onCalculateSurfaces && (
            <div className="relative" ref={surfaceMenuRef}>
              <button
                onClick={() => setIsSurfaceMenuOpen(!isSurfaceMenuOpen)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold transition-all shadow-sm text-xs"
                title="Calculate geodesic surface area as new column"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>{t.map.calcSurfaces}</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isSurfaceMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-[#1C1714] border border-stone-700 shadow-2xl p-1 z-40 text-xs">
                  <div className="px-2.5 py-1 text-[10px] font-mono text-stone-400 uppercase font-semibold">
                    {t.map.selectUnit}:
                  </div>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('ha');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-800 text-stone-200 hover:text-amber-300 flex items-center justify-between"
                  >
                    <span>{t.map.unitHa}</span>
                    <span className="font-mono text-[10px] text-amber-400 font-bold">+surface_ha</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('m2');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-800 text-stone-200 hover:text-amber-300 flex items-center justify-between"
                  >
                    <span>{t.map.unitM2}</span>
                    <span className="font-mono text-[10px] text-amber-400 font-bold">+surface_m2</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('km2');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-800 text-stone-200 hover:text-amber-300 flex items-center justify-between"
                  >
                    <span>{t.map.unitKm2}</span>
                    <span className="font-mono text-[10px] text-amber-400 font-bold">+surface_km2</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('acres');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-800 text-stone-200 hover:text-amber-300 flex items-center justify-between"
                  >
                    <span>{t.map.unitAcres}</span>
                    <span className="font-mono text-[10px] text-amber-400 font-bold">+surface_acres</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Aggregate Attributes Trigger */}
          {onOpenAggregationModal && (
            <button
              onClick={onOpenAggregationModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#241E19] hover:bg-[#2C241E] text-orange-300 border border-orange-600/50 text-xs font-semibold transition-all shadow-sm"
              title="Aggregate fields by category & append summary columns"
            >
              <PieChart className="w-3.5 h-3.5 text-orange-400" />
              <span className="hidden sm:inline">{t.map.aggregateBtn}</span>
            </button>
          )}

          {/* Zoom to extent */}
          <button
            onClick={fitCurrentBounds}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-stone-850 hover:bg-stone-800 text-stone-200 transition-colors border border-stone-700 text-xs"
            title="Zoom to layer extent"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.map.extentBtn}</span>
          </button>

          {/* Compare toggle if output exists */}
          {processedJob?.outputGeojson && (
            <button
              onClick={() => {
                const next = !isSwipeMode;
                setIsSwipeMode(next);
                if (next) setShowOutputCompare(true);
              }}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                isSwipeMode
                  ? 'bg-amber-500 text-stone-950 font-bold border-amber-400 shadow-md'
                  : 'bg-stone-850 border-stone-700 text-amber-300 hover:bg-stone-800'
              }`}
              title="Interactive side-by-side swipe comparison curtain"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isSwipeMode ? t.map.swipeOn : t.map.swipeBtn}</span>
            </button>
          )}

          {/* Basemap Switcher */}
          <div className="flex items-center bg-[#13110E] border border-stone-800 rounded-lg p-0.5">
            <button
              onClick={() => setBasemap('dark')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'dark' ? 'bg-amber-600 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t.map.basemapDark}
            </button>
            <button
              onClick={() => setBasemap('osm')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'osm' ? 'bg-amber-600 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t.map.basemapOsm}
            </button>
            <button
              onClick={() => setBasemap('satellite')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'satellite' ? 'bg-amber-600 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t.map.basemapSatellite}
            </button>
            <button
              onClick={() => setBasemap('offline_grid')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'offline_grid' ? 'bg-amber-600 text-stone-950 font-bold' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {t.map.basemapGrid}
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Body: Legend Sidebar OUTSIDE Map Frame + Map Canvas Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* DEDICATED CARTOGRAPHIC LEGEND SIDEBAR (Completely outside map frame to eliminate glitches) */}
        {isLegendOpen && dataset && (
          <aside className="w-72 lg:w-80 flex-shrink-0 border-r border-stone-800 bg-[#16120F] flex flex-col h-full z-10 shadow-xl overflow-y-auto">
            {/* Legend Header */}
            <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-[#130F0D]">
              <div className="flex items-center space-x-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <h3 className="font-display font-bold text-stone-100 text-xs tracking-wide">
                  {t.map.legendTitle}
                </h3>
              </div>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
                title={t.map.hideLegend}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-5 text-xs font-sans">
              {/* Active Layer Details */}
              <div className="p-3.5 rounded-2xl bg-[#1D1714] border border-stone-800 space-y-3 shadow-inner">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    {/* Visual Symbology Swatch */}
                    {dataset.geometryType.includes('Polygon') ? (
                      <div 
                        className="w-5 h-5 rounded border border-white/80 shadow-sm"
                        style={{ backgroundColor: layerColor, opacity: layerOpacity }}
                        title="Polygon Fill Swatch"
                      />
                    ) : dataset.geometryType.includes('Line') ? (
                      <div 
                        className="w-6 h-1.5 rounded shadow-sm"
                        style={{ backgroundColor: layerColor }}
                        title="Line Stroke Swatch"
                      />
                    ) : (
                      <div 
                        className="w-4 h-4 rounded-full border-2 border-white/90 shadow-sm"
                        style={{ backgroundColor: layerColor }}
                        title="Point Node Swatch"
                      />
                    )}
                    <div>
                      <span className="font-display font-bold text-stone-100 text-xs block truncate max-w-[150px]">
                        {dataset.name}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {dataset.format.toUpperCase()} · {dataset.geometryType}
                      </span>
                    </div>
                  </div>

                  {/* Visibility Button */}
                  <button
                    onClick={() => setIsLayerVisible(!isLayerVisible)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition-colors"
                    title={isLayerVisible ? 'Hide Layer on Canvas' : 'Show Layer on Canvas'}
                  >
                    {isLayerVisible ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-stone-500" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono pt-1 border-t border-stone-800/80">
                  <span>{t.map.recordCount}:</span>
                  <span className="text-stone-200 font-semibold">{dataset.featureCount} {t.common.features}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono">
                  <span>{t.map.datumCrs}:</span>
                  <span className="text-amber-400 font-bold">{dataset.detectedCRS?.code || 'EPSG:4326'}</span>
                </div>

                {/* Color Palette Swatches */}
                <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
                  <span className="text-[10px] text-stone-400 uppercase font-mono font-semibold block">
                    {t.map.symbologyColor}:
                  </span>
                  <div className="flex items-center space-x-2 pt-0.5">
                    {LAYER_PALETTE.map(p => (
                      <button
                        key={p.hex}
                        onClick={() => setLayerColor(p.hex)}
                        style={{ backgroundColor: p.hex }}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          layerColor === p.hex ? 'scale-125 ring-2 ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                        }`}
                        title={p.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Fill Opacity Slider */}
                <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-stone-400 font-mono">
                    <span>{t.map.fillOpacity}:</span>
                    <span className="text-amber-400 font-bold">{Math.round(layerOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={layerOpacity}
                    onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5"
                  />
                </div>
              </div>

              {/* Reprojected Comparison Layer Legend if active */}
              {showOutputCompare && processedJob && (
                <div className="p-3.5 rounded-2xl bg-orange-950/30 border border-orange-700/50 space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-3.5 rounded border-2 border-dashed border-orange-400 bg-orange-500/30" />
                    <span className="font-display font-bold text-orange-200 text-xs">
                      {t.map.targetReprojection}
                    </span>
                  </div>
                  <div className="text-[11px] text-orange-300 font-mono">
                    Target CRS: <span className="font-bold text-orange-400">{processedJob.targetCRS}</span>
                  </div>
                  <p className="text-[10px] text-stone-400 leading-relaxed font-sans">
                    {t.map.conformalDrift}
                  </p>
                </div>
              )}

              {/* Quick Actions in Legend Dock */}
              <div className="space-y-2 pt-2 border-t border-stone-800">
                <span className="text-[10px] text-stone-400 uppercase font-mono font-semibold block">
                  {t.map.quickActions}:
                </span>
                
                {onCalculateSurfaces && dataset.geometryType.includes('Polygon') && (
                  <button
                    onClick={() => onCalculateSurfaces('ha')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-amber-300 border border-stone-800 transition-colors"
                  >
                    <span className="flex items-center space-x-2">
                      <Calculator className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.craft.calcHaBtn}</span>
                    </span>
                    <span className="font-mono text-[10px] text-amber-400 font-bold">+column</span>
                  </button>
                )}

                {onOpenAggregationModal && (
                  <button
                    onClick={onOpenAggregationModal}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-orange-300 border border-stone-800 transition-colors"
                  >
                    <span className="flex items-center space-x-2">
                      <PieChart className="w-3.5 h-3.5 text-orange-400" />
                      <span>{t.map.aggregateBtn}</span>
                    </span>
                    <span className="font-mono text-[10px] text-orange-400 font-bold">Group Σ</span>
                  </button>
                )}

                <button
                  onClick={fitCurrentBounds}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-amber-300 border border-stone-800 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.map.zoomExtent}</span>
                </button>
              </div>

              {/* Other Loaded Datasets in Workspace */}
              {datasets.length > 1 && (
                <div className="space-y-2 pt-2 border-t border-stone-800">
                  <span className="text-[10px] text-stone-400 uppercase font-mono font-semibold block">
                    {t.map.allLayers} ({datasets.length}):
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {datasets.map(d => (
                      <div
                        key={d.id}
                        onClick={() => onSelectDataset(d)}
                        className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          dataset.id === d.id
                            ? 'bg-amber-950/60 border-amber-600/70 text-amber-300'
                            : 'bg-[#181411] border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                        }`}
                      >
                        <div className="truncate max-w-[180px]">
                          <span className="font-semibold block truncate text-[11px]">{d.name}</span>
                          <span className="text-[9px] font-mono opacity-80">{d.geometryType} · {d.featureCount} feats</span>
                        </div>
                        {dataset.id === d.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Map Canvas Frame & Bottom Attribute Drawer */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          
          {/* Map Viewport Area */}
          <div 
            className={`flex-1 relative min-h-0 w-full overflow-hidden ${
              isOverlayOpen ? 'invisible opacity-0 pointer-events-none' : ''
            }`}
            onMouseMove={handleMapMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Dedicated Leaflet DOM Container (Empty React node so Leaflet has 100% pure control) */}
            <div
              ref={mapContainerRef}
              className={`w-full h-full ${isOverlayOpen ? 'invisible opacity-0 pointer-events-none' : ''}`}
            />
            {(mapProjectionError || outputProjectionError || mapProjectionWarning) && (
              <div
                role={mapProjectionError || outputProjectionError ? 'alert' : 'status'}
                className={`absolute top-3 left-1/2 z-[1000] w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border px-3 py-2 text-xs shadow-lg ${
                  mapProjectionError || outputProjectionError
                    ? 'border-rose-700/70 bg-rose-950/90 text-rose-200'
                    : 'border-amber-700/70 bg-amber-950/90 text-amber-200'
                }`}
              >
                {mapProjectionError || outputProjectionError
                  ? `${t.map.mapProjectionError} ${mapProjectionError || outputProjectionError}`
                  : t.map.mapProjectionWarning}
              </div>
            )}

            {/* Overlays rendered outside mapContainerRef DOM */}
            {isSwipeMode && processedJob?.outputGeojson && (
              <>
                <div
                  style={{ left: `${swipePosition}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none shadow-[0_0_15px_rgba(245,158,11,0.8)]"
                >
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsDraggingSwipe(true);
                    }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 shadow-2xl border-2 border-stone-950 flex items-center justify-center cursor-ew-resize pointer-events-auto transition-transform active:scale-110"
                  >
                    <span className="text-stone-950 font-bold text-xs">↔</span>
                  </div>
                </div>

                {/* Side Indicators */}
                <div className="absolute top-3 left-4 z-20 pointer-events-none bg-[#161310]/90 backdrop-blur-md border border-amber-600/50 px-3 py-1 rounded-lg text-[10px] text-amber-300 font-mono shadow-xl flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>SOURCE: {dataset?.detectedCRS?.code || 'EPSG:4326'} (LEFT)</span>
                </div>

                <div className="absolute top-3 right-4 z-20 pointer-events-none bg-[#161310]/90 backdrop-blur-md border border-orange-500/50 px-3 py-1 rounded-lg text-[10px] text-orange-300 font-mono shadow-xl flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span>REPROJECTED: {processedJob.targetCRS} (RIGHT)</span>
                </div>
              </>
            )}

            {/* Clicked Feature Popup Overlay */}
            {selectedFeatureProps && (
              <div className="absolute top-4 right-4 z-20 bg-[#1A1613]/95 border border-stone-700 p-3.5 rounded-2xl shadow-2xl max-w-sm w-full backdrop-blur-md">
                <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                  <span className="font-display font-bold text-xs text-[#FAF6F0] flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Feature Attributes</span>
                  </span>
                  <button
                    onClick={() => setSelectedFeatureProps(null)}
                    className="text-stone-400 hover:text-white text-xs px-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto mt-2 space-y-1.5 font-mono text-xs">
                  {Object.entries(selectedFeatureProps).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-stone-800/60 text-[11px]">
                      <span className="text-stone-400">{k}:</span>
                      <span className="text-amber-300 font-medium ml-2 text-right truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Drawer: Attribute Table, Metadata & Validation */}
          <div className="h-64 border-t border-stone-800 bg-[#161310] flex flex-col flex-shrink-0">
            {/* Tabs header */}
            <div className="flex items-center justify-between px-4 h-10 border-b border-stone-800 bg-[#110E0C]">
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setActiveBottomTab('attributes')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'attributes'
                      ? 'bg-stone-800 text-amber-300 font-semibold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>{t.map.attrTableTab} ({filteredFeatures.length})</span>
                </button>

                <button
                  onClick={() => setActiveBottomTab('metadata')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'metadata'
                      ? 'bg-stone-800 text-amber-300 font-semibold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{t.map.metadataTab}</span>
                </button>

                <button
                  onClick={() => setActiveBottomTab('validation')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'validation'
                      ? 'bg-stone-800 text-amber-300 font-semibold'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.map.validationTab} ({dataset?.validationIssues.length || 0})</span>
                </button>
              </div>

              {activeBottomTab === 'attributes' && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={exportTableCSV}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-stone-850 hover:bg-stone-800 text-stone-300 text-xs transition-colors border border-stone-700"
                    title={t.common.exportCsv}
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span className="hidden sm:inline">{t.common.exportCsv}</span>
                  </button>

                  <div className="relative">
                    <Search className="w-3 h-3 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t.map.filterRowsPlaceholder}
                      value={attributeSearch}
                      onChange={(e) => setAttributeSearch(e.target.value)}
                      className="bg-[#13110E] border border-stone-700 rounded-md px-2 pl-7 py-0.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-auto">
              {activeBottomTab === 'attributes' && (
                <div className="w-full overflow-x-auto">
                  {dataset?.fields && dataset.fields.length > 0 ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#110E0C] border-b border-stone-800 font-mono text-stone-400 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-stone-500">#</th>
                          {dataset.fields.map(f => {
                            const isCalculatedCol = f.name.startsWith('surface_') || f.name.startsWith('count_by_') || f.name.includes('_by_');
                            return (
                              <th key={f.name} className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`font-bold ${isCalculatedCol ? 'text-amber-300' : 'text-stone-200'}`}>
                                  {f.name}
                                </span>
                                {isCalculatedCol && (
                                  <span className="ml-1 px-1 py-0.2 rounded text-[8px] bg-amber-950 text-amber-400 border border-amber-600/50 uppercase">
                                    CALC
                                  </span>
                                )}
                                <span className="ml-1 text-[9px] text-stone-500 uppercase">({f.type})</span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-850/60 font-mono text-[11px]">
                        {filteredFeatures.slice(0, 100).map((f: any, idx: number) => (
                          <tr
                            key={idx}
                            onClick={() => setSelectedFeatureProps(f.properties || {})}
                            className="hover:bg-stone-850/40 cursor-pointer"
                          >
                            <td className="py-2 px-3 text-stone-500 tabular-nums">{idx + 1}</td>
                            {dataset.fields.map(field => {
                              const isCalculatedCol = field.name.startsWith('surface_') || field.name.startsWith('count_by_') || field.name.includes('_by_');
                              const val = f.properties?.[field.name];
                              return (
                                <td 
                                  key={field.name} 
                                  className={`py-2 px-3 max-w-xs truncate tabular-nums ${isCalculatedCol ? 'text-amber-300 font-semibold' : 'text-stone-300'}`}
                                >
                                  {val !== undefined && val !== null ? String(val) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center text-stone-500 text-xs">
                      No attribute fields in current dataset.
                    </div>
                  )}
                </div>
              )}

              {activeBottomTab === 'metadata' && dataset && (
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="p-3 bg-stone-900/60 rounded-xl border border-stone-800">
                    <span className="text-stone-500 block mb-1">Detected CRS</span>
                    <span className="text-amber-400 font-bold text-sm">{dataset.detectedCRS?.code || 'None'}</span>
                    <p className="text-[10px] text-stone-400 mt-0.5">{dataset.detectedCRS?.name}</p>
                  </div>
                  <div className="p-3 bg-stone-900/60 rounded-xl border border-stone-800">
                    <span className="text-stone-500 block mb-1">Geometry Type</span>
                    <span className="text-[#FAF6F0] font-bold text-sm">{dataset.geometryType}</span>
                    <p className="text-[10px] text-stone-400 mt-0.5">{dataset.featureCount} spatial records</p>
                  </div>
                  <div className="p-3 bg-stone-900/60 rounded-xl border border-stone-800">
                    <span className="text-stone-500 block mb-1">Spatial Extent [MinX, MinY]</span>
                    <span className="text-stone-200 font-semibold tabular-nums">{dataset.bounds[0].toFixed(4)}, {dataset.bounds[1].toFixed(4)}</span>
                  </div>
                  <div className="p-3 bg-stone-900/60 rounded-xl border border-stone-800">
                    <span className="text-stone-500 block mb-1">Spatial Extent [MaxX, MaxY]</span>
                    <span className="text-stone-200 font-semibold tabular-nums">{dataset.bounds[2].toFixed(4)}, {dataset.bounds[3].toFixed(4)}</span>
                  </div>
                </div>
              )}

              {activeBottomTab === 'validation' && (
                <div className="p-4 space-y-2">
                  {dataset?.validationIssues && dataset.validationIssues.length > 0 ? (
                    dataset.validationIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-start space-x-2 text-xs ${
                          issue.severity === 'error'
                            ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                            : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-mono font-bold uppercase">{issue.code}: </span>
                          <span>{issue.message}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center space-x-2 text-emerald-400 text-xs p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>All geometry validity and CRS boundary checks passed successfully. Zero topological kinks detected.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
