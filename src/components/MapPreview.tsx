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
  X,
  CheckSquare,
  Square,
  ZoomIn,
  Check
} from 'lucide-react';
import { SpatialDataset, ConversionJob } from '../types/gis';
import { SurfaceUnit } from '../core/spatialAnalytics';
import { getCRSByCode } from '../core/crsDefinitions';
import { reprojectGeoJSON } from '../core/crsEngine';
import { useI18n } from '../core/i18n';
import { useTheme } from '../core/theme';

interface MapPreviewProps {
  dataset: SpatialDataset | null;
  datasets: SpatialDataset[];
  onSelectDataset: (dataset: SpatialDataset) => void;
  processedJob?: ConversionJob | null;
  onCalculateSurfaces?: (unit: SurfaceUnit) => void;
  onOpenAggregationModal?: () => void;
  isOverlayOpen?: boolean;
}

export const LAYER_PALETTE = [
  { name: 'Amber Gold', hex: '#F59E0B' },
  { name: 'Sunset Terracotta', hex: '#EA580C' },
  { name: 'Deep Rust', hex: '#C2410C' },
  { name: 'Sunburst Ochre', hex: '#D97706' },
  { name: 'Lemon Lime', hex: '#EAB308' },
  { name: 'Chartreuse', hex: '#84CC16' },
  { name: 'Emerald Green', hex: '#10B981' },
  { name: 'Sage Mint', hex: '#14B8A6' },
  { name: 'Deep Forest', hex: '#059669' },
  { name: 'Ocean Cyan', hex: '#06B6D4' },
  { name: 'Sky Azure', hex: '#0284C7' },
  { name: 'Cobalt Royal', hex: '#2563EB' },
  { name: 'Deep Indigo', hex: '#6366F1' },
  { name: 'Amethyst Violet', hex: '#9333EA' },
  { name: 'Fuchsia Magenta', hex: '#D946EF' },
  { name: 'Coral Rose', hex: '#F43F5E' },
  { name: 'Ruby Crimson', hex: '#E11D48' },
  { name: 'Titanium Slate', hex: '#64748B' },
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
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const multiGeojsonLayersRef = useRef<Map<string, L.GeoJSON>>(new Map());
  const outputGeojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [basemap, setBasemap] = useState<'dark' | 'osm' | 'satellite' | 'offline_grid'>(() => theme === 'light' ? 'osm' : 'dark');

  // Multi-layer visibility and per-layer style maps
  const [visibleLayerIds, setVisibleLayerIds] = useState<Set<string>>(() => {
    if (datasets.length > 0) {
      return new Set(datasets.map(d => d.id));
    }
    return dataset ? new Set([dataset.id]) : new Set();
  });

  const [layerStyles, setLayerStyles] = useState<Record<string, { color: string; opacity: number }>>(() => {
    const initial: Record<string, { color: string; opacity: number }> = {};
    datasets.forEach((d, i) => {
      initial[d.id] = {
        color: LAYER_PALETTE[i % LAYER_PALETTE.length].hex,
        opacity: 0.85,
      };
    });
    return initial;
  });

  const [colorPickerLayerId, setColorPickerLayerId] = useState<string | null>(null);
  const [legendTab, setLegendTab] = useState<'layers' | 'style'>('layers');

  // Keep layerStyles and visibleLayerIds in sync as datasets are added or updated
  useEffect(() => {
    setLayerStyles(prev => {
      const next = { ...prev };
      let changed = false;
      datasets.forEach((d, i) => {
        if (!next[d.id]) {
          next[d.id] = {
            color: LAYER_PALETTE[i % LAYER_PALETTE.length].hex,
            opacity: 0.85,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setVisibleLayerIds(prev => {
      const next = new Set(prev);
      let changed = false;
      datasets.forEach(d => {
        if (!prev.has(d.id)) {
          next.add(d.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [datasets]);

  // Ensure inspected dataset is visible
  useEffect(() => {
    if (dataset && !visibleLayerIds.has(dataset.id)) {
      setVisibleLayerIds(prev => new Set([...prev, dataset.id]));
    }
  }, [dataset?.id]);

  // Active layer color & opacity shorthand based on inspected dataset
  const activeLayerColor = dataset && layerStyles[dataset.id]?.color 
    ? layerStyles[dataset.id].color 
    : '#F59E0B';
  const activeLayerOpacity = dataset && layerStyles[dataset.id]?.opacity !== undefined 
    ? layerStyles[dataset.id].opacity 
    : 0.85;
  const isInspectionLayerVisible = dataset ? visibleLayerIds.has(dataset.id) : false;

  const toggleLayerVisibility = (layerId: string) => {
    setVisibleLayerIds(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const showAllLayers = () => {
    setVisibleLayerIds(new Set(datasets.map(d => d.id)));
  };

  const hideAllLayers = () => {
    setVisibleLayerIds(new Set());
  };

  const updateLayerColor = (layerId: string, color: string) => {
    setLayerStyles(prev => ({
      ...prev,
      [layerId]: {
        ...(prev[layerId] || { opacity: 0.85 }),
        color,
      },
    }));
  };

  const updateLayerOpacity = (layerId: string, opacity: number) => {
    setLayerStyles(prev => ({
      ...prev,
      [layerId]: {
        ...(prev[layerId] || { color: '#F59E0B' }),
        opacity,
      },
    }));
  };

  // Sync basemap when theme toggles
  useEffect(() => {
    if (theme === 'light' && basemap === 'dark') {
      setBasemap('osm');
    } else if (theme === 'dark' && basemap === 'osm') {
      setBasemap('dark');
    }
  }, [theme]);
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

  // Africa Continental Geodetic Extent
  const AFRICA_BOUNDS: L.LatLngBoundsLiteral = [
    [-35.5, -18.0], // Cape Agulhas / South Atlantic
    [37.5, 52.0],   // Mediterranean / Horn of Africa
  ];
  const AFRICA_CENTER: [number, number] = [3.5, 20.0];

  // Initialize Map with Africa Continental View
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: AFRICA_CENTER,
        zoom: 3.5,
        zoomControl: false,
      });

      // Frame the entire African continent initially
      map.fitBounds(AFRICA_BOUNDS, { padding: [20, 20] });

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

  // Render Multi-Layer Dataset GeoJSON on Map with customizable symbology & visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setMapProjectionError(null);
    setMapProjectionWarning(null);

    // 1. Remove any layers that are no longer in visibleLayerIds or have been deleted
    const currentDatasetIds = new Set(datasets.map(d => d.id));
    multiGeojsonLayersRef.current.forEach((layer, id) => {
      if (!visibleLayerIds.has(id) || !currentDatasetIds.has(id)) {
        map.removeLayer(layer);
        multiGeojsonLayersRef.current.delete(id);
      }
    });

    // 2. Add or update layers for each visible dataset
    datasets.forEach((d, idx) => {
      if (!visibleLayerIds.has(d.id) || !d.geojson) return;

      const style = layerStyles[d.id] || {
        color: LAYER_PALETTE[idx % LAYER_PALETTE.length].hex,
        opacity: 0.85,
      };

      const existingLayer = multiGeojsonLayersRef.current.get(d.id);
      if (existingLayer) {
        // Just update symbology properties
        existingLayer.setStyle({
          color: style.color,
          weight: d.id === dataset?.id ? 2.5 : 1.5,
          opacity: style.opacity,
          fillColor: style.color,
          fillOpacity: style.opacity * 0.35,
        });
        existingLayer.eachLayer((subLayer: any) => {
          if (subLayer.setStyle) {
            subLayer.setStyle({
              color: style.color,
              fillColor: style.color,
              opacity: style.opacity,
              fillOpacity: style.opacity * (subLayer.feature?.geometry?.type?.includes('Point') ? 0.9 : 0.35),
            });
          }
        });
        return;
      }

      // Create new Leaflet GeoJSON layer
      try {
        const sourceCRS = d.detectedCRS?.code || 'EPSG:4326';
        if (!getCRSByCode(sourceCRS)) {
          console.warn(`Source CRS ${sourceCRS} not available for ${d.name}`);
        }

        const reprojection = sourceCRS === 'EPSG:4326'
          ? { geojson: d.geojson, warnings: [] as string[] }
          : reprojectGeoJSON(d.geojson, sourceCRS, 'EPSG:4326');

        const newLayer = L.geoJSON(reprojection.geojson, {
          style: () => ({
            color: style.color,
            weight: d.id === dataset?.id ? 2.5 : 1.5,
            opacity: style.opacity,
            fillColor: style.color,
            fillOpacity: style.opacity * 0.35,
          }),
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: d.id === dataset?.id ? 7 : 5,
              fillColor: style.color,
              color: '#1C1917',
              weight: 2,
              opacity: style.opacity,
              fillOpacity: style.opacity * 0.9,
            });
          },
          onEachFeature: (feature, fLayer) => {
            fLayer.on({
              click: () => {
                onSelectDataset(d);
                setSelectedFeatureProps(feature.properties || {});
              },
            });
          },
        }).addTo(map);

        multiGeojsonLayersRef.current.set(d.id, newLayer);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Layer render error for ${d.name}:`, err);
        if (d.id === dataset?.id) {
          setMapProjectionError(message);
        }
      }
    });
  }, [datasets, visibleLayerIds, layerStyles, dataset?.id]);

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

  // Reset to Africa view
  const resetToAfrica = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fitBounds(AFRICA_BOUNDS, { padding: [20, 20], animate: true });
  };

  const fitCurrentBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const groupBounds = L.latLngBounds([]);
    multiGeojsonLayersRef.current.forEach((layer) => {
      const b = layer.getBounds();
      if (b.isValid()) groupBounds.extend(b);
    });
    if (groupBounds.isValid()) {
      map.fitBounds(groupBounds, { padding: [40, 40], animate: true });
    } else if (dataset && multiGeojsonLayersRef.current.has(dataset.id)) {
      const b = multiGeojsonLayersRef.current.get(dataset.id)!.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40], animate: true });
      } else {
        resetToAfrica();
      }
    } else {
      resetToAfrica();
    }
  };

  const fitSingleLayerBounds = (layerId: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const layer = multiGeojsonLayersRef.current.get(layerId);
    if (layer) {
      const b = layer.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40], maxZoom: 16, animate: true });
      }
    }
  };

  // Auto-Zoom: Africa first until data is added, then smoothly zooms to data extent
  const lastFittedKeyRef = useRef<string>('');
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (datasets.length === 0) {
      resetToAfrica();
      lastFittedKeyRef.current = '';
      return;
    }

    const currentKey = datasets.map(d => `${d.id}:${d.featureCount}`).join('|');
    if (currentKey !== lastFittedKeyRef.current) {
      lastFittedKeyRef.current = currentKey;
      const timer = setTimeout(() => {
        fitCurrentBounds();
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [datasets]);

  // Temporary feature highlight layer reference
  const featureHighlightRef = useRef<L.Layer | null>(null);

  // Zoom to specific feature clicked in attribute table
  const zoomToFeature = (feature: any, rowIdx: number) => {
    const map = mapInstanceRef.current;
    if (!map || !feature) return;

    setSelectedFeatureProps(feature.properties || {});

    try {
      const sourceCRS = dataset?.detectedCRS?.code || 'EPSG:4326';
      let geo = feature;
      if (sourceCRS !== 'EPSG:4326' && getCRSByCode(sourceCRS)) {
        const rep = reprojectGeoJSON({ type: 'FeatureCollection', features: [feature] }, sourceCRS, 'EPSG:4326');
        if (rep.geojson.features && rep.geojson.features[0]) {
          geo = rep.geojson.features[0];
        }
      }

      // Remove previous feature highlight
      if (featureHighlightRef.current) {
        map.removeLayer(featureHighlightRef.current);
        featureHighlightRef.current = null;
      }

      const tempLayer = L.geoJSON(geo, {
        style: {
          color: '#F59E0B',
          weight: 4,
          fillColor: '#F59E0B',
          fillOpacity: 0.6,
        },
        pointToLayer: (_f, latlng) => {
          return L.circleMarker(latlng, {
            radius: 10,
            fillColor: '#F59E0B',
            color: '#FFFFFF',
            weight: 3,
            fillOpacity: 0.95,
          });
        }
      }).addTo(map);

      featureHighlightRef.current = tempLayer;

      // Auto-remove highlight layer after 4 seconds
      setTimeout(() => {
        if (featureHighlightRef.current === tempLayer) {
          map.removeLayer(tempLayer);
          featureHighlightRef.current = null;
        }
      }, 4000);

      const bounds = tempLayer.getBounds();
      if (bounds.isValid()) {
        const isPoint = geo.geometry?.type === 'Point' || geo.geometry?.type === 'MultiPoint';
        const center = bounds.getCenter();

        if (isPoint) {
          map.setView(center, 16, { animate: true });
        } else {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: true });
        }

        // Display brief interactive popup at the feature's location
        const propKeys = Object.keys(feature.properties || {}).slice(0, 4);
        const propRows = propKeys.map(k => `
          <div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; padding:1px 0;">
            <span style="color:#78716c; font-family:sans-serif;">${k}:</span>
            <span style="font-family:monospace; font-weight:600; color:#1c1917;">${String(feature.properties[k])}</span>
          </div>
        `).join('');

        L.popup({ autoClose: true, closeOnClick: true, offset: [0, -8] })
          .setLatLng(center)
          .setContent(`
            <div style="font-family: sans-serif; font-size: 11px; padding: 4px; min-width: 150px; color: #1c1917;">
              <div style="font-weight: bold; font-family: monospace; border-bottom: 1px solid #e7e5e4; padding-bottom: 3px; margin-bottom: 4px; color: #d97706; display:flex; justify-content:space-between;">
                <span>Feature #${rowIdx + 1}</span>
                <span style="font-size:10px; color:#78716c;">${geo.geometry?.type || 'Geometry'}</span>
              </div>
              ${propRows || '<div style="color:#a8a29e; font-style:italic;">No attributes</div>'}
            </div>
          `)
          .openOn(map);
      }
    } catch (err) {
      console.error('Failed to zoom to feature:', err);
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
    <div className={`flex-1 flex flex-col h-[calc(100vh-3.75rem)] overflow-hidden transition-colors ${
      theme === 'light' ? 'bg-[#FAF8F5] text-stone-900' : 'bg-[#13110E] text-[#F5EBE1]'
    }`}>
      {/* Top Map Control Bar */}
      <div className={`h-12 border-b px-4 flex items-center justify-between text-xs flex-shrink-0 transition-colors ${
        theme === 'light' ? 'border-[#E2DBD0] bg-[#FAF8F5]' : 'border-stone-800 bg-[#181411]'
      }`}>
        <div className="flex items-center space-x-3">
          {/* Toggle Legend Sidebar Outside Map Frame */}
          <button
            onClick={() => setIsLegendOpen(!isLegendOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              isLegendOpen
                ? (theme === 'light'
                    ? 'bg-amber-100/80 border-amber-400 text-amber-900 font-bold shadow-xs'
                    : 'bg-amber-950/80 border-amber-500/80 text-amber-300 font-semibold shadow-sm')
                : (theme === 'light'
                    ? 'bg-white border-[#D6CEBE] text-stone-700 hover:bg-[#F2ECE3]'
                    : 'bg-stone-850 border-stone-700 text-stone-300 hover:bg-stone-800')
            }`}
            title="Toggle Cartographic Legend Sidebar (Outside Map Frame)"
          >
            {isLegendOpen ? <PanelLeftClose className="w-3.5 h-3.5 text-amber-500" /> : <PanelLeftOpen className="w-3.5 h-3.5 text-stone-400" />}
            <span>{isLegendOpen ? t.map.hideLegend : t.map.showLegend}</span>
          </button>

          {/* Dataset Switcher */}
          <div className="flex items-center space-x-2">
            <span className={`font-medium ${theme === 'light' ? 'text-stone-600' : 'text-stone-400'}`}>{t.map.layerLabel}:</span>
            <select
              value={dataset?.id || ''}
              onChange={(e) => {
                const found = datasets.find(d => d.id === e.target.value);
                if (found) onSelectDataset(found);
              }}
              className={`border rounded-lg px-2.5 py-1 font-medium focus:border-amber-500 focus:outline-none max-w-xs truncate cursor-pointer text-xs ${
                theme === 'light'
                  ? 'bg-white border-[#D6CEBE] text-stone-900'
                  : 'bg-[#13110E] border-stone-700 text-stone-100'
              }`}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id} className={theme === 'light' ? 'bg-white text-stone-900' : 'bg-stone-900 text-stone-100'}>
                  {d.name} ({d.geometryType}, {d.featureCount} {t.common.features})
                </option>
              ))}
            </select>
          </div>

          {dataset && (
            <div className={`hidden sm:flex items-center space-x-2 font-mono text-xs ${
              theme === 'light' ? 'text-stone-600' : 'text-stone-400'
            }`}>
              <span className={`px-2 py-0.5 rounded-md border ${
                theme === 'light'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
                  : 'bg-amber-950/80 text-amber-300 border-amber-700/50'
              }`}>
                {dataset.detectedCRS?.code || 'EPSG:4326'}
              </span>
              <span>{dataset.featureCount} {t.common.features}</span>
            </div>
          )}

          {/* Multi-layer Active Status Badge */}
          {datasets.length > 1 && (
            <div className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] ${
              theme === 'light'
                ? 'bg-white border-[#E2DBD0] text-stone-700'
                : 'bg-[#201A16] border-stone-800 text-stone-300'
            }`}>
              <Layers className="w-3 h-3 text-amber-500" />
              <span>
                <strong className={theme === 'light' ? 'text-amber-700' : 'text-amber-400'}>{visibleLayerIds.size}</strong>/{datasets.length} visible
              </span>
            </div>
          )}
        </div>

        {/* Map View & Analytical Controls */}
        <div className="flex items-center space-x-2">
          {/* Zoom to Africa Button */}
          <button
            onClick={resetToAfrica}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              theme === 'light'
                ? 'bg-white border-[#D6CEBE] text-stone-700 hover:bg-[#F2ECE3]'
                : 'bg-stone-850 border-stone-700 text-stone-200 hover:bg-stone-800'
            }`}
            title="Reset Map View to Africa Continent"
          >
            <Globe className="w-3.5 h-3.5 text-amber-500" />
            <span>Africa</span>
          </button>

          {/* Zoom to extent */}
          <button
            onClick={fitCurrentBounds}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition-colors border text-xs ${
              theme === 'light'
                ? 'bg-white hover:bg-stone-100 text-stone-800 border-[#D6CEBE]'
                : 'bg-stone-850 hover:bg-stone-800 text-stone-200 border-stone-700'
            }`}
            title="Zoom to layer extent"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-500" />
            <span>{t.map.extentBtn}</span>
          </button>

          {/* Calculate Surface Button Dropdown */}
          {onCalculateSurfaces && (
            <div className="relative" ref={surfaceMenuRef}>
              <button
                onClick={() => setIsSurfaceMenuOpen(!isSurfaceMenuOpen)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-sm text-xs"
                title="Calculate geodesic surface area as new column"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>{t.map.calcSurfaces}</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isSurfaceMenuOpen && (
                <div className={`absolute right-0 mt-1.5 w-48 rounded-xl border p-1 z-40 text-xs shadow-2xl ${
                  theme === 'light'
                    ? 'bg-white border-[#E2DBD0] text-stone-900 shadow-stone-400/25'
                    : 'bg-[#1C1714] border-stone-700 text-stone-200 shadow-stone-950/80'
                }`}>
                  <div className={`px-2.5 py-1 text-[10px] font-mono uppercase font-semibold ${
                    theme === 'light' ? 'text-stone-500' : 'text-stone-400'
                  }`}>
                    {t.map.selectUnit}:
                  </div>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('ha');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-stone-800 text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <span>{t.map.unitHa}</span>
                    <span className={`font-mono text-[10px] font-bold ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`}>+surface_ha</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('m2');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-stone-800 text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <span>{t.map.unitM2}</span>
                    <span className={`font-mono text-[10px] font-bold ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`}>+surface_m2</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('km2');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-stone-800 text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <span>{t.map.unitKm2}</span>
                    <span className={`font-mono text-[10px] font-bold ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`}>+surface_km2</span>
                  </button>
                  <button
                    onClick={() => {
                      onCalculateSurfaces('acres');
                      setIsSurfaceMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                      theme === 'light'
                        ? 'hover:bg-[#F5EFE6] text-stone-800 hover:text-amber-800'
                        : 'hover:bg-stone-800 text-stone-200 hover:text-amber-300'
                    }`}
                  >
                    <span>{t.map.unitAcres}</span>
                    <span className={`font-mono text-[10px] font-bold ${theme === 'light' ? 'text-amber-700' : 'text-amber-400'}`}>+surface_acres</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Aggregate Attributes Trigger */}
          {onOpenAggregationModal && (
            <button
              onClick={onOpenAggregationModal}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
                theme === 'light'
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-[#241E19] hover:bg-[#2C241E] text-orange-300 border-orange-600/50'
              }`}
              title="Aggregate fields by category & append summary columns"
            >
              <PieChart className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{t.map.aggregateBtn}</span>
            </button>
          )}

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
                  : (theme === 'light'
                      ? 'bg-white border-[#D6CEBE] text-amber-800 hover:bg-stone-100'
                      : 'bg-stone-850 border-stone-700 text-amber-300 hover:bg-stone-800')
              }`}
              title="Interactive side-by-side swipe comparison curtain"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isSwipeMode ? t.map.swipeOn : t.map.swipeBtn}</span>
            </button>
          )}

          {/* Basemap Switcher */}
          <div className={`flex items-center border rounded-lg p-0.5 ${
            theme === 'light' ? 'bg-[#F2ECE3] border-[#E2DBD0]' : 'bg-[#13110E] border-stone-800'
          }`}>
            <button
              onClick={() => setBasemap('dark')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'dark'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : (theme === 'light' ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400 hover:text-stone-200')
              }`}
            >
              {t.map.basemapDark}
            </button>
            <button
              onClick={() => setBasemap('osm')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'osm'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : (theme === 'light' ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400 hover:text-stone-200')
              }`}
            >
              {t.map.basemapOsm}
            </button>
            <button
              onClick={() => setBasemap('satellite')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'satellite'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : (theme === 'light' ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400 hover:text-stone-200')
              }`}
            >
              {t.map.basemapSatellite}
            </button>
            <button
              onClick={() => setBasemap('offline_grid')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                basemap === 'offline_grid'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : (theme === 'light' ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400 hover:text-stone-200')
              }`}
            >
              {t.map.basemapGrid}
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Body: Legend Sidebar OUTSIDE Map Frame + Map Canvas Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* DEDICATED CARTOGRAPHIC MULTI-LAYER & LEGEND SIDEBAR (Outside map frame to eliminate Leaflet resize glitches) */}
        {isLegendOpen && (
          <aside className={`w-80 lg:w-88 flex-shrink-0 border-r flex flex-col h-full z-10 shadow-xl overflow-y-auto transition-colors ${
            theme === 'light'
              ? 'border-[#E2DBD0] bg-[#FAF8F5] text-stone-900'
              : 'border-stone-800 bg-[#16120F] text-[#F5EBE1]'
          }`}>
            {/* Sidebar Header */}
            <div className={`p-3.5 border-b flex items-center justify-between transition-colors ${
              theme === 'light' ? 'border-[#E2DBD0] bg-[#F2ECE3]' : 'border-stone-800 bg-[#130F0D]'
            }`}>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <h3 className={`font-display font-bold text-xs tracking-wide ${
                  theme === 'light' ? 'text-stone-900' : 'text-stone-100'
                }`}>
                  Multi-Layer GIS Studio
                </h3>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${
                  theme === 'light'
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                }`}>
                  {visibleLayerIds.size}/{datasets.length}
                </span>
              </div>
              <button
                onClick={() => setIsLegendOpen(false)}
                className={`p-1 rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'text-stone-500 hover:text-stone-900 hover:bg-stone-200'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`}
                title={t.map.hideLegend}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sidebar Navigation Tabs: All Layers vs Active Symbology */}
            <div className={`flex border-b text-xs font-mono transition-colors ${
              theme === 'light' ? 'border-[#E2DBD0] bg-[#F2ECE3]' : 'border-stone-800 bg-[#130F0D]'
            }`}>
              <button
                onClick={() => setLegendTab('layers')}
                className={`flex-1 py-2 px-3 flex items-center justify-center space-x-1.5 transition-colors border-b-2 ${
                  legendTab === 'layers'
                    ? (theme === 'light'
                        ? 'border-amber-600 text-amber-800 font-bold bg-white'
                        : 'border-amber-500 text-amber-300 font-bold bg-[#1C1714]')
                    : (theme === 'light'
                        ? 'border-transparent text-stone-600 hover:text-stone-950'
                        : 'border-transparent text-stone-400 hover:text-stone-200')
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Layers ({datasets.length})</span>
              </button>
              <button
                onClick={() => setLegendTab('style')}
                className={`flex-1 py-2 px-3 flex items-center justify-center space-x-1.5 transition-colors border-b-2 ${
                  legendTab === 'style'
                    ? (theme === 'light'
                        ? 'border-amber-600 text-amber-800 font-bold bg-white'
                        : 'border-amber-500 text-amber-300 font-bold bg-[#1C1714]')
                    : (theme === 'light'
                        ? 'border-transparent text-stone-600 hover:text-stone-950'
                        : 'border-transparent text-stone-400 hover:text-stone-200')
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-amber-500" />
                <span>Symbology</span>
              </button>
            </div>

            {/* Tab 1: Multi-Layer Manager & Stack */}
            {legendTab === 'layers' && (
              <div className="p-3.5 space-y-4 text-xs font-sans">
                {/* Mass Control Toolbar */}
                <div className={`flex items-center justify-between gap-1.5 text-[11px] font-mono pb-2 border-b ${
                  theme === 'light' ? 'border-stone-200' : 'border-stone-800'
                }`}>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={showAllLayers}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        theme === 'light'
                          ? 'bg-white hover:bg-stone-100 text-stone-800 border-stone-300'
                          : 'bg-[#241E19] hover:bg-[#2F2620] text-amber-300 border-stone-700/80'
                      }`}
                      title="Make all layers visible simultaneously"
                    >
                      Show All
                    </button>
                    <button
                      onClick={hideAllLayers}
                      className={`px-2 py-1 rounded-md border transition-colors ${
                        theme === 'light'
                          ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-300'
                          : 'bg-[#241E19] hover:bg-[#2F2620] text-stone-400 hover:text-stone-200 border-stone-700/80'
                      }`}
                      title="Hide all layers"
                    >
                      Hide All
                    </button>
                  </div>

                  <button
                    onClick={fitCurrentBounds}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border transition-colors ${
                      theme === 'light'
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 font-semibold'
                        : 'bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 border-amber-600/60'
                    }`}
                    title="Fit view to combined extent of all visible layers"
                  >
                    <Maximize2 className="w-3 h-3 text-amber-500" />
                    <span>Fit Extent</span>
                  </button>
                </div>

                {/* Layer Items Stack */}
                <div className="space-y-2.5">
                  {datasets.length === 0 ? (
                    <div className="p-6 text-center text-stone-500 space-y-2">
                      <Layers className="w-8 h-8 mx-auto text-stone-400" />
                      <p className="text-xs font-medium">No layers loaded in workspace</p>
                      <p className="text-[10px]">Import GIS datasets in the Workspace tab to visualize them on the canvas.</p>
                    </div>
                  ) : (
                    datasets.map((d, idx) => {
                      const isVis = visibleLayerIds.has(d.id);
                      const isSelected = dataset?.id === d.id;
                      const style = layerStyles[d.id] || {
                        color: LAYER_PALETTE[idx % LAYER_PALETTE.length].hex,
                        opacity: 0.85,
                      };
                      const isPickerOpen = colorPickerLayerId === d.id;

                      return (
                        <div
                          key={d.id}
                          className={`p-3 rounded-2xl border transition-all ${
                            isSelected
                              ? (theme === 'light'
                                  ? 'bg-amber-50/80 border-amber-400 shadow-xs ring-1 ring-amber-400/40 text-stone-900'
                                  : 'bg-[#221A15] border-amber-600/70 shadow-sm ring-1 ring-amber-500/30 text-[#FAF6F0]')
                              : (theme === 'light'
                                  ? 'bg-white border-[#E2DBD0] hover:border-amber-300 text-stone-800'
                                  : 'bg-[#181411] border-stone-800/90 hover:border-stone-700 text-stone-300')
                          }`}
                        >
                          {/* Row 1: Checkbox, Swatch, Name & Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                              {/* Visibility Toggle Checkbox */}
                              <button
                                type="button"
                                onClick={() => toggleLayerVisibility(d.id)}
                                className="text-amber-500 hover:text-amber-600 shrink-0"
                                title={isVis ? 'Hide layer on map' : 'Show layer on map'}
                              >
                                {isVis ? (
                                  <CheckSquare className="w-4 h-4 text-amber-500" />
                                ) : (
                                  <Square className={`w-4 h-4 ${theme === 'light' ? 'text-stone-400' : 'text-stone-600'}`} />
                                )}
                              </button>

                              {/* Interactive Color Swatch */}
                              <button
                                type="button"
                                onClick={() => setColorPickerLayerId(isPickerOpen ? null : d.id)}
                                style={{ backgroundColor: style.color }}
                                className="w-4 h-4 rounded-full border border-white/70 shadow-sm shrink-0 transition-transform hover:scale-125 cursor-pointer"
                                title="Click to pick a color for this layer"
                              />

                              {/* Layer Name & Feature Count */}
                              <div 
                                onClick={() => onSelectDataset(d)}
                                className="min-w-0 flex-1 cursor-pointer"
                                title="Click to inspect this layer"
                              >
                                <span className={`font-display font-bold text-xs truncate block ${
                                  isSelected
                                    ? (theme === 'light' ? 'text-amber-900' : 'text-amber-200')
                                    : (theme === 'light' ? 'text-stone-900 hover:text-amber-800' : 'text-stone-200 hover:text-white')
                                }`}>
                                  {d.name}
                                </span>
                                <span className={`text-[10px] font-mono block ${
                                  theme === 'light' ? 'text-stone-500' : 'text-stone-400'
                                }`}>
                                  {d.format.toUpperCase()} · {d.geometryType} · {d.featureCount} feats
                                </span>
                              </div>
                            </div>

                            {/* Right Actions: Zoom to layer & Inspect */}
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => fitSingleLayerBounds(d.id)}
                                className={`p-1 rounded-md transition-colors ${
                                  theme === 'light'
                                    ? 'text-stone-500 hover:text-amber-700 hover:bg-stone-100'
                                    : 'text-stone-400 hover:text-amber-300 hover:bg-stone-800'
                                }`}
                                title="Zoom map to this layer"
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Inline Color Palette Picker Popover */}
                          {isPickerOpen && (
                            <div className={`mt-2.5 pt-2.5 border-t animate-in fade-in-0 duration-150 ${
                              theme === 'light' ? 'border-stone-200' : 'border-stone-800/80'
                            }`}>
                              <div className={`flex items-center justify-between text-[10px] font-mono mb-1.5 ${
                                theme === 'light' ? 'text-stone-600' : 'text-stone-400'
                              }`}>
                                <span>Curated Palette (18 Colors):</span>
                                <label className="flex items-center space-x-1 text-amber-600 hover:underline cursor-pointer">
                                  <span>Custom</span>
                                  <input
                                    type="color"
                                    value={style.color}
                                    onChange={(e) => updateLayerColor(d.id, e.target.value)}
                                    className="w-4 h-4 rounded border-0 cursor-pointer p-0 bg-transparent"
                                  />
                                </label>
                              </div>

                              <div className="grid grid-cols-6 gap-1.5 pt-1">
                                {LAYER_PALETTE.map((p) => (
                                  <button
                                    key={p.hex}
                                    type="button"
                                    onClick={() => {
                                      updateLayerColor(d.id, p.hex);
                                      setColorPickerLayerId(null);
                                    }}
                                    style={{ backgroundColor: p.hex }}
                                    className={`w-5 h-5 rounded-md transition-all ${
                                      style.color.toLowerCase() === p.hex.toLowerCase()
                                        ? 'ring-2 ring-white scale-110 shadow-md'
                                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                                    }`}
                                    title={p.name}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Per-Layer Opacity Slider - Fully Themed for Light and Dark Modes */}
                          <div className={`mt-2 pt-2 border-t flex items-center space-x-2 text-[10px] font-mono transition-colors ${
                            theme === 'light' ? 'border-stone-200 text-stone-700' : 'border-stone-800/60 text-stone-400'
                          }`}>
                            <span className="shrink-0 font-medium">Opacity:</span>
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.05"
                              value={style.opacity}
                              onChange={(e) => updateLayerOpacity(d.id, parseFloat(e.target.value))}
                              className={`w-full accent-amber-600 cursor-pointer h-1.5 rounded-lg ${
                                theme === 'light' ? 'bg-stone-200' : 'bg-stone-800'
                              }`}
                            />
                            <span className={`tabular-nums w-8 text-right font-semibold ${
                              theme === 'light' ? 'text-stone-900' : 'text-stone-300'
                            }`}>
                              {Math.round(style.opacity * 100)}%
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Active Layer Symbology & Geodesy Details */}
            {legendTab === 'style' && dataset && (
              <div className="p-4 space-y-5 text-xs font-sans">
                {/* Active Layer Details */}
                <div className={`p-3.5 rounded-2xl border space-y-3 transition-colors ${
                  theme === 'light'
                    ? 'bg-white border-[#E2DBD0] shadow-xs text-stone-900'
                    : 'bg-[#1D1714] border-stone-800 shadow-inner text-[#FAF6F0]'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      {/* Visual Symbology Swatch */}
                      {dataset.geometryType.includes('Polygon') ? (
                        <div 
                          className="w-5 h-5 rounded border border-white/80 shadow-sm"
                          style={{ backgroundColor: activeLayerColor, opacity: activeLayerOpacity }}
                          title="Polygon Fill Swatch"
                        />
                      ) : dataset.geometryType.includes('Line') ? (
                        <div 
                          className="w-6 h-1.5 rounded shadow-sm"
                          style={{ backgroundColor: activeLayerColor }}
                          title="Line Stroke Swatch"
                        />
                      ) : (
                        <div 
                          className="w-4 h-4 rounded-full border-2 border-white/90 shadow-sm"
                          style={{ backgroundColor: activeLayerColor }}
                          title="Point Node Swatch"
                        />
                      )}
                      <div>
                        <span className={`font-display font-bold text-xs block truncate max-w-[150px] ${
                          theme === 'light' ? 'text-stone-900' : 'text-stone-100'
                        }`}>
                          {dataset.name}
                        </span>
                        <span className={`text-[10px] font-mono ${
                          theme === 'light' ? 'text-stone-500' : 'text-stone-400'
                        }`}>
                          {dataset.format.toUpperCase()} · {dataset.geometryType}
                        </span>
                      </div>
                    </div>

                    {/* Visibility Button */}
                    <button
                      onClick={() => toggleLayerVisibility(dataset.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        theme === 'light'
                          ? 'hover:bg-stone-100 text-stone-500 hover:text-amber-700'
                          : 'hover:bg-stone-800 text-stone-400 hover:text-amber-300'
                      }`}
                      title={isInspectionLayerVisible ? 'Hide Layer on Canvas' : 'Show Layer on Canvas'}
                    >
                      {isInspectionLayerVisible ? <Eye className="w-4 h-4 text-amber-500" /> : <EyeOff className="w-4 h-4 text-stone-400" />}
                    </button>
                  </div>

                  <div className={`flex items-center justify-between text-[11px] font-mono pt-1 border-t ${
                    theme === 'light' ? 'border-stone-200 text-stone-600' : 'border-stone-800/80 text-stone-400'
                  }`}>
                    <span>{t.map.recordCount}:</span>
                    <span className={`font-semibold ${theme === 'light' ? 'text-stone-900' : 'text-stone-200'}`}>
                      {dataset.featureCount} {t.common.features}
                    </span>
                  </div>

                  <div className={`flex items-center justify-between text-[11px] font-mono ${
                    theme === 'light' ? 'border-stone-200 text-stone-600' : 'border-stone-800/80 text-stone-400'
                  }`}>
                    <span>{t.map.datumCrs}:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">{dataset.detectedCRS?.code || 'EPSG:4326'}</span>
                  </div>

                  {/* Expanded 18-Color Palette Swatches */}
                  <div className={`pt-2 border-t space-y-1.5 ${
                    theme === 'light' ? 'border-stone-200' : 'border-stone-800/80'
                  }`}>
                    <div className={`flex items-center justify-between text-[10px] font-mono ${
                      theme === 'light' ? 'text-stone-600' : 'text-stone-400'
                    }`}>
                      <span className="uppercase font-semibold">{t.map.symbologyColor}:</span>
                      <label className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 cursor-pointer hover:underline">
                        <span>Custom Color</span>
                        <input
                          type="color"
                          value={activeLayerColor}
                          onChange={(e) => updateLayerColor(dataset.id, e.target.value)}
                          className="w-4 h-4 rounded border-0 cursor-pointer p-0 bg-transparent"
                        />
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1.5 pt-1">
                      {LAYER_PALETTE.map(p => (
                        <button
                          key={p.hex}
                          onClick={() => updateLayerColor(dataset.id, p.hex)}
                          style={{ backgroundColor: p.hex }}
                          className={`w-6 h-6 rounded-md transition-all ${
                            activeLayerColor.toLowerCase() === p.hex.toLowerCase() 
                              ? 'scale-115 ring-2 ring-stone-900 dark:ring-white shadow-md' 
                              : 'opacity-70 hover:opacity-100 hover:scale-105'
                          }`}
                          title={p.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Fill Opacity Slider - Fully Themed for Light Mode */}
                  <div className={`pt-2 border-t space-y-1.5 ${
                    theme === 'light' ? 'border-stone-200' : 'border-stone-800/80'
                  }`}>
                    <div className={`flex justify-between text-[10px] font-mono ${
                      theme === 'light' ? 'text-stone-700 font-medium' : 'text-stone-400'
                    }`}>
                      <span>{t.map.fillOpacity}:</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{Math.round(activeLayerOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={activeLayerOpacity}
                      onChange={(e) => updateLayerOpacity(dataset.id, parseFloat(e.target.value))}
                      className={`w-full accent-amber-600 cursor-pointer h-1.5 rounded-lg ${
                        theme === 'light' ? 'bg-stone-200' : 'bg-stone-800'
                      }`}
                    />
                  </div>
                </div>

                {/* Reprojected Comparison Layer Legend if active */}
                {showOutputCompare && processedJob && (
                  <div className={`p-3.5 rounded-2xl border space-y-2 ${
                    theme === 'light'
                      ? 'bg-amber-50/70 border-amber-300 text-stone-900'
                      : 'bg-orange-950/30 border-orange-700/50 text-[#FAF6F0]'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-3.5 rounded border-2 border-dashed border-orange-500 bg-orange-500/30" />
                      <span className={`font-display font-bold text-xs ${
                        theme === 'light' ? 'text-amber-900' : 'text-orange-200'
                      }`}>
                        {t.map.targetReprojection}
                      </span>
                    </div>
                    <div className={`text-[11px] font-mono ${
                      theme === 'light' ? 'text-stone-700' : 'text-orange-300'
                    }`}>
                      Target CRS: <span className="font-bold text-amber-700 dark:text-orange-400">{processedJob.targetCRS}</span>
                    </div>
                    <p className={`text-[10px] leading-relaxed font-sans ${
                      theme === 'light' ? 'text-stone-600' : 'text-stone-400'
                    }`}>
                      {t.map.conformalDrift}
                    </p>
                  </div>
                )}

                {/* Quick Actions in Legend Dock - Theme Aware */}
                <div className={`space-y-2 pt-2 border-t ${
                  theme === 'light' ? 'border-stone-200' : 'border-stone-800'
                }`}>
                  <span className={`text-[10px] uppercase font-mono font-semibold block ${
                    theme === 'light' ? 'text-stone-500' : 'text-stone-400'
                  }`}>
                    {t.map.quickActions}:
                  </span>
                  
                  {onCalculateSurfaces && dataset.geometryType.includes('Polygon') && (
                    <button
                      onClick={() => onCalculateSurfaces('ha')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                        theme === 'light'
                          ? 'bg-white hover:bg-stone-50 text-stone-800 hover:text-amber-800 border-[#D6CEBE]'
                          : 'bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-amber-300 border-stone-800'
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <Calculator className="w-3.5 h-3.5 text-amber-500" />
                        <span>{t.craft.calcHaBtn}</span>
                      </span>
                      <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold">+column</span>
                    </button>
                  )}

                  {onOpenAggregationModal && (
                    <button
                      onClick={onOpenAggregationModal}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                        theme === 'light'
                          ? 'bg-white hover:bg-stone-50 text-stone-800 hover:text-orange-800 border-[#D6CEBE]'
                          : 'bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-orange-300 border-stone-800'
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <PieChart className="w-3.5 h-3.5 text-orange-500" />
                        <span>{t.map.aggregateBtn}</span>
                      </span>
                      <span className="font-mono text-[10px] text-orange-600 dark:text-orange-400 font-bold">Group Σ</span>
                    </button>
                  )}

                  <button
                    onClick={fitCurrentBounds}
                    className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl border transition-colors ${
                      theme === 'light'
                        ? 'bg-white hover:bg-stone-50 text-stone-800 hover:text-amber-800 border-[#D6CEBE]'
                        : 'bg-[#201A16] hover:bg-[#29221C] text-stone-200 hover:text-amber-300 border-stone-800'
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t.map.zoomExtent}</span>
                  </button>
                </div>
              </div>
            )}
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
          <div className={`h-64 border-t flex flex-col flex-shrink-0 transition-colors ${
            theme === 'light' ? 'border-[#E2DBD0] bg-[#FAF8F5]' : 'border-stone-800 bg-[#161310]'
          }`}>
            {/* Tabs header */}
            <div className={`flex items-center justify-between px-4 h-10 border-b transition-colors ${
              theme === 'light' ? 'border-[#E2DBD0] bg-[#F2ECE3]' : 'border-stone-800 bg-[#110E0C]'
            }`}>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setActiveBottomTab('attributes')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'attributes'
                      ? (theme === 'light'
                          ? 'bg-white text-amber-800 font-bold shadow-xs'
                          : 'bg-stone-800 text-amber-300 font-semibold')
                      : (theme === 'light'
                          ? 'text-stone-600 hover:text-stone-900'
                          : 'text-stone-400 hover:text-stone-200')
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>{t.map.attrTableTab} ({filteredFeatures.length})</span>
                </button>

                <button
                  onClick={() => setActiveBottomTab('metadata')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'metadata'
                      ? (theme === 'light'
                          ? 'bg-white text-amber-800 font-bold shadow-xs'
                          : 'bg-stone-800 text-amber-300 font-semibold')
                      : (theme === 'light'
                          ? 'text-stone-600 hover:text-stone-900'
                          : 'text-stone-400 hover:text-stone-200')
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{t.map.metadataTab}</span>
                </button>

                <button
                  onClick={() => setActiveBottomTab('validation')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeBottomTab === 'validation'
                      ? (theme === 'light'
                          ? 'bg-white text-amber-800 font-bold shadow-xs'
                          : 'bg-stone-800 text-amber-300 font-semibold')
                      : (theme === 'light'
                          ? 'text-stone-600 hover:text-stone-900'
                          : 'text-stone-400 hover:text-stone-200')
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t.map.validationTab} ({dataset?.validationIssues.length || 0})</span>
                </button>
              </div>

              {activeBottomTab === 'attributes' && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={exportTableCSV}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs transition-colors border ${
                      theme === 'light'
                        ? 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                        : 'bg-stone-850 hover:bg-stone-800 text-stone-300 border-stone-700'
                    }`}
                    title={t.common.exportCsv}
                  >
                    <Download className="w-3 h-3 text-amber-500" />
                    <span className="hidden sm:inline">{t.common.exportCsv}</span>
                  </button>

                  <div className="relative">
                    <Search className={`w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 ${
                      theme === 'light' ? 'text-stone-400' : 'text-stone-400'
                    }`} />
                    <input
                      type="text"
                      placeholder={t.map.filterRowsPlaceholder}
                      value={attributeSearch}
                      onChange={(e) => setAttributeSearch(e.target.value)}
                      className={`border rounded-md px-2 pl-7 py-0.5 text-xs focus:outline-none focus:border-amber-500 ${
                        theme === 'light'
                          ? 'bg-white border-[#D6CEBE] text-stone-900 placeholder-stone-400'
                          : 'bg-[#13110E] border-stone-700 text-stone-100 placeholder-stone-500'
                      }`}
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
                      <thead className={`sticky top-0 border-b font-mono text-[11px] ${
                        theme === 'light'
                          ? 'bg-[#EAE4DA] border-stone-300 text-stone-700'
                          : 'bg-[#110E0C] border-stone-800 text-stone-400'
                      }`}>
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-stone-500">#</th>
                          {dataset.fields.map(f => {
                            const isCalculatedCol = f.name.startsWith('surface_') || f.name.startsWith('count_by_') || f.name.includes('_by_');
                            return (
                              <th key={f.name} className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`font-bold ${
                                  isCalculatedCol 
                                    ? (theme === 'light' ? 'text-amber-800' : 'text-amber-300')
                                    : (theme === 'light' ? 'text-stone-900' : 'text-stone-200')
                                }`}>
                                  {f.name}
                                </span>
                                {isCalculatedCol && (
                                  <span className={`ml-1 px-1 py-0.2 rounded text-[8px] uppercase font-bold border ${
                                    theme === 'light'
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-amber-950 text-amber-400 border-amber-600/50'
                                  }`}>
                                    CALC
                                  </span>
                                )}
                                <span className={`ml-1 text-[9px] uppercase ${
                                  theme === 'light' ? 'text-stone-500' : 'text-stone-500'
                                }`}>({f.type})</span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className={`divide-y font-mono text-[11px] ${
                        theme === 'light' ? 'divide-stone-200' : 'divide-stone-850/60'
                      }`}>
                        {filteredFeatures.slice(0, 100).map((f: any, idx: number) => (
                          <tr
                            key={idx}
                            onClick={() => zoomToFeature(f, idx)}
                            className={`cursor-pointer transition-colors group ${
                              theme === 'light'
                                ? 'hover:bg-amber-50/80 text-stone-900'
                                : 'hover:bg-stone-850/60 text-stone-200'
                            }`}
                            title="Click to zoom to this feature on the map"
                          >
                            <td className={`py-2 px-3 tabular-nums ${theme === 'light' ? 'text-stone-500 group-hover:text-amber-800' : 'text-stone-500 group-hover:text-amber-400'}`}>
                              {idx + 1}
                            </td>
                            {dataset.fields.map(field => {
                              const isCalculatedCol = field.name.startsWith('surface_') || field.name.startsWith('count_by_') || field.name.includes('_by_');
                              const val = f.properties?.[field.name];
                              return (
                                <td 
                                  key={field.name} 
                                  className={`py-2 px-3 max-w-xs truncate tabular-nums ${
                                    isCalculatedCol 
                                      ? (theme === 'light' ? 'text-amber-700 font-bold' : 'text-amber-300 font-semibold')
                                      : (theme === 'light' ? 'text-stone-800' : 'text-stone-300')
                                  }`}
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
