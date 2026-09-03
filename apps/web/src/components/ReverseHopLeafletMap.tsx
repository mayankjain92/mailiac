'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeolocatedHopSummary } from '@/lib/findings';
import { generateGeodesicArc, getTrustTierMarkerColor } from '@/lib/geo-utils';
import { Plus, Minus, Crosshair, Layers } from 'lucide-react';

export interface ReverseHopLeafletMapProps {
  hops: GeolocatedHopSummary[];
  selectedHopIndex: number | null;
  hoveredHopIndex: number | null;
  onSelectHop: (index: number | null) => void;
  onHoverHop: (index: number | null) => void;
  isExpanded?: boolean;
}

export interface MappedHopWithDisplay extends GeolocatedHopSummary {
  displayLat: number;
  displayLon: number;
  isCollocated: boolean;
}

type BasemapMode = 'dark' | 'light' | 'streets';

export default function ReverseHopLeafletMap({
  hops,
  selectedHopIndex,
  hoveredHopIndex,
  onSelectHop,
  onHoverHop,
  isExpanded = false,
}: ReverseHopLeafletMapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const arcsLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayersRef = useRef<L.Layer[]>([]);
  const allArcPointsRef = useRef<[number, number][]>([]);
  const [basemap, setBasemap] = useState<BasemapMode>('dark');

  // Separate collocated hops (e.g. Hop 2 and Hop 3 sharing identical coordinates in Redmond, WA)
  const hopsWithDisplay: MappedHopWithDisplay[] = useMemo(() => {
    // Cluster hops by proximity (within ~0.15 degrees)
    const clusters: { centerLat: number; centerLon: number; items: GeolocatedHopSummary[] }[] = [];

    hops.forEach((h) => {
      let cluster = clusters.find(
        (c) => Math.abs(c.centerLat - h.lat) < 0.15 && Math.abs(c.centerLon - h.lon) < 0.15
      );
      if (!cluster) {
        cluster = { centerLat: h.lat, centerLon: h.lon, items: [] };
        clusters.push(cluster);
      }
      cluster.items.push(h);
    });

    return hops.map((h) => {
      const cluster = clusters.find((c) =>
        c.items.some((item) => item.originalIndex === h.originalIndex)
      );

      if (!cluster || cluster.items.length <= 1) {
        return { ...h, displayLat: h.lat, displayLon: h.lon, isCollocated: false };
      }

      const clusterIndex = cluster.items.findIndex(
        (item) => item.originalIndex === h.originalIndex
      );
      const totalInCluster = cluster.items.length;

      // Radially separate collocated hops so both are visible side-by-side
      const baseAngle = -Math.PI / 2;
      const angle = baseAngle + (clusterIndex * (2 * Math.PI)) / totalInCluster;
      const offsetDistance = 1.75; // ~180km offset in degrees for distinct visual separation at world zoom

      const displayLat = h.lat + Math.sin(angle) * (offsetDistance * 0.6);
      const displayLon = h.lon + Math.cos(angle) * offsetDistance;

      return {
        ...h,
        displayLat,
        displayLon,
        isCollocated: true,
      };
    });
  }, [hops]);

  // Determine initial basemap from HTML dark class or dark mode preference
  useEffect(() => {
    const isDark =
      document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setBasemap(isDark ? 'dark' : 'streets');
  }, []);

  // Fit all geolocated hops within bounds, defaulted to a zoomed-out global view
  const fitAllHops = useCallback(() => {
    const map = mapRef.current;
    if (!map || hopsWithDisplay.length === 0) return;

    if (hopsWithDisplay.length === 1) {
      map.setView([hopsWithDisplay[0].displayLat, hopsWithDisplay[0].displayLon], 2, {
        animate: true,
      });
    } else {
      // Include all markers AND arc curve vertices so the full trajectory is captured
      const allCoords: [number, number][] = hopsWithDisplay.map((h) => [
        h.displayLat,
        h.displayLon,
      ]);
      allArcPointsRef.current.forEach((pt) => allCoords.push(pt));

      const bounds = L.latLngBounds(allCoords);
      // Max zoom capped at 2 so the global landscape is fully visible by default without interacting
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 2,
        animate: true,
      });
    }
  }, [hopsWithDisplay]);

  // Initialize Leaflet Map Instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 1, // Allow zooming out to view full global map
      maxZoom: 18,
    });

    // Custom dark-mode themed attribution
    L.control
      .attribution({
        position: 'bottomright',
        prefix: false,
      })
      .addTo(map);

    const arcsLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    arcsLayerRef.current = arcsLayer;
    markersLayerRef.current = markersLayer;

    // Default initial world overview zoomed out
    map.setView([30, -20], 1.5);

    return (): void => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      arcsLayerRef.current = null;
      tileLayersRef.current = [];
    };
  }, []);

  // Fit all hops in view whenever hops list updates
  useEffect(() => {
    fitAllHops();
  }, [fitAllHops]);

  // Update Tile Layer when basemap changes (No API key required)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing tile layers
    tileLayersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    tileLayersRef.current = [];

    if (basemap === 'dark') {
      // ESRI ArcGIS Dark Gray Canvas Base + Country/City Labels (Free, No API Key Required)
      const base = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        }
      ).addTo(map);

      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          opacity: 0.85,
        }
      ).addTo(map);

      tileLayersRef.current = [base, labels];
    } else if (basemap === 'light') {
      const base = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        }
      ).addTo(map);

      const labels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 16,
          opacity: 0.85,
        }
      ).addTo(map);

      tileLayersRef.current = [base, labels];
    } else {
      // OpenStreetMap Standard Cartography (Free, Open Source)
      const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> contributors',
      }).addTo(map);

      tileLayersRef.current = [osm];
    }
  }, [basemap]);

  // Recompute Markers and Curved Geodesic Flight Arcs
  useEffect(() => {
    const arcsLayer = arcsLayerRef.current;
    const markersLayer = markersLayerRef.current;
    if (!arcsLayer || !markersLayer) return;

    arcsLayer.clearLayers();
    markersLayer.clearLayers();
    allArcPointsRef.current = [];

    // 1. Draw Curved Geodesic Arcs connecting consecutive hops
    for (let i = 0; i < hopsWithDisplay.length - 1; i++) {
      const from = hopsWithDisplay[i];
      const to = hopsWithDisplay[i + 1];

      const arcCoordinates = generateGeodesicArc(
        [from.displayLat, from.displayLon],
        [to.displayLat, to.displayLon],
        28
      );

      arcCoordinates.forEach((pt) => allArcPointsRef.current.push(pt));

      // Outer glow line
      L.polyline(arcCoordinates, {
        color: '#0052FF',
        weight: 5,
        opacity: 0.25,
        lineCap: 'round',
        interactive: false,
      }).addTo(arcsLayer);

      // Core glowing dash-flow line
      L.polyline(arcCoordinates, {
        color: '#3B82F6',
        weight: 2.5,
        dashArray: '7, 5',
        opacity: 0.9,
        interactive: false,
        className: 'leaflet-hop-arc-glow',
      }).addTo(arcsLayer);
    }

    // 2. Place Custom Hop Markers
    hopsWithDisplay.forEach((m) => {
      const isSelected = selectedHopIndex === m.originalIndex;
      const isHovered = hoveredHopIndex === m.originalIndex;
      const isActive = isSelected || isHovered;
      const theme = getTrustTierMarkerColor(m.classification.tier);

      const markerHtml = `
        <div class="hop-marker-root ${isActive ? 'is-active' : ''}">
          <div class="hop-radar-pulse" style="background-color: ${theme.ring}; border-color: ${theme.primary};"></div>
          <div class="hop-node-badge" style="background-color: ${theme.primary}; box-shadow: 0 0 12px ${theme.glow};">
            <span class="hop-number-text">${m.hopNumber}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'leaflet-custom-marker-wrapper',
        html: markerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([m.displayLat, m.displayLon], {
        icon: customIcon,
        zIndexOffset: isActive ? 1000 : 100 + m.hopNumber,
      });

      marker.on('click', () => {
        onSelectHop(isSelected ? null : m.originalIndex);
      });

      marker.on('mouseover', () => {
        onHoverHop(m.originalIndex);
      });

      marker.on('mouseout', () => {
        onHoverHop(null);
      });

      marker.bindTooltip(
        `
        <div class="font-mono text-xs p-1">
          <div class="flex items-center gap-1.5 font-bold mb-0.5">
            <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white" style="background-color: ${theme.primary}">
              ${m.hopNumber}
            </span>
            <span>Hop ${m.hopNumber}: ${m.ip}</span>
          </div>
          <div class="text-[10px] text-gray-400">
            ${m.city ? `${m.city}, ` : ''}${m.country || 'Unknown Location'}
          </div>
          <div class="text-[9px] font-semibold mt-0.5" style="color: ${theme.primary}">
            ${m.classification.tier}
          </div>
          ${m.isCollocated ? '<div class="text-[8.5px] text-amber-400 font-mono mt-0.5">Collocated Infrastructure Node</div>' : ''}
        </div>
      `,
        {
          direction: 'top',
          offset: [0, -14],
          className: 'mailiac-leaflet-tooltip',
          opacity: 0.95,
        }
      );

      marker.addTo(markersLayer);
    });
  }, [hopsWithDisplay, selectedHopIndex, hoveredHopIndex, onSelectHop, onHoverHop]);

  // Smoothly Fly camera to selected hop when selected from sidebar or map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedHopIndex === null) return;

    const target = hopsWithDisplay.find((h) => h.originalIndex === selectedHopIndex);
    if (target) {
      map.flyTo([target.displayLat, target.displayLon], Math.max(map.getZoom(), 4), {
        duration: 0.9,
        easeLinearity: 0.25,
      });
    }
  }, [selectedHopIndex, hopsWithDisplay]);

  // Resize invalidation when expanding / collapsing container view
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return (): void => {
      clearTimeout(timer);
    };
  }, [isExpanded]);

  const handleZoomIn = (): void => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = (): void => {
    mapRef.current?.zoomOut();
  };

  const toggleBasemap = (): void => {
    setBasemap((prev) => (prev === 'dark' ? 'streets' : 'dark'));
  };

  return (
    <div className="relative w-full h-full">
      {/* Map DOM Container */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Modern Cyber-HUD Map Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-[400]">
        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-7 h-7 rounded bg-[#FFFFFF]/90 dark:bg-[#151A17]/90 hover:bg-[#FFFFFF] dark:hover:bg-[#1E2521] text-[#121212] dark:text-[#F2F2EE] border border-[#E5E5E5] dark:border-[#29342F] shadow-sm flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
          title="Zoom In"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-7 h-7 rounded bg-[#FFFFFF]/90 dark:bg-[#151A17]/90 hover:bg-[#FFFFFF] dark:hover:bg-[#1E2521] text-[#121212] dark:text-[#F2F2EE] border border-[#E5E5E5] dark:border-[#29342F] shadow-sm flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
          title="Zoom Out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Fit / Recenter All Hops */}
        <button
          type="button"
          onClick={fitAllHops}
          className="w-7 h-7 rounded bg-[#FFFFFF]/90 dark:bg-[#151A17]/90 hover:bg-[#FFFFFF] dark:hover:bg-[#1E2521] text-[#121212] dark:text-[#F2F2EE] border border-[#E5E5E5] dark:border-[#29342F] shadow-sm flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
          title="Fit All Hops In View"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        {/* Basemap Toggle (Dark Canvas / OpenStreetMap) */}
        <button
          type="button"
          onClick={toggleBasemap}
          className="w-7 h-7 rounded bg-[#FFFFFF]/90 dark:bg-[#151A17]/90 hover:bg-[#FFFFFF] dark:hover:bg-[#1E2521] text-[#121212] dark:text-[#F2F2EE] border border-[#E5E5E5] dark:border-[#29342F] shadow-sm flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
          title={`Switch Basemap (${basemap === 'dark' ? 'Street View' : 'Dark Canvas'})`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Global Scoped Marker & Tooltip CSS */}
      <style jsx global>{`
        .leaflet-custom-marker-wrapper {
          background: transparent !important;
          border: none !important;
        }

        .hop-marker-root {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .hop-radar-pulse {
          position: absolute;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid;
          opacity: 0.6;
          animation: hopPulse 2.4s ease-out infinite;
        }

        .hop-marker-root.is-active .hop-radar-pulse {
          width: 36px;
          height: 36px;
          opacity: 0.9;
          animation: hopPulseActive 1.4s cubic-bezier(0.25, 1, 0.5, 1) infinite;
        }

        @keyframes hopPulse {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          70% {
            transform: scale(1.4);
            opacity: 0.15;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }

        @keyframes hopPulseActive {
          0% {
            transform: scale(0.6);
            opacity: 1;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }

        .hop-node-badge {
          position: relative;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
          z-index: 2;
        }

        .hop-marker-root:hover .hop-node-badge,
        .hop-marker-root.is-active .hop-node-badge {
          transform: scale(1.25);
        }

        .hop-number-text {
          color: #ffffff;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9px;
          font-weight: 800;
          line-height: 1;
          user-select: none;
        }

        .mailiac-leaflet-tooltip {
          background: rgba(18, 24, 21, 0.95) !important;
          border: 1px solid #29342f !important;
          border-radius: 6px !important;
          color: #f2f2ee !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
          backdrop-filter: blur(8px) !important;
          padding: 4px 8px !important;
        }

        .mailiac-leaflet-tooltip::before {
          border-top-color: rgba(18, 24, 21, 0.95) !important;
        }

        .leaflet-hop-arc-glow {
          filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.7));
          stroke-dashoffset: 0;
          animation: hopDashFlow 20s linear infinite;
        }

        @keyframes hopDashFlow {
          to {
            stroke-dashoffset: -100;
          }
        }

        .leaflet-container {
          background-color: #0e1210 !important;
          font-family: inherit;
        }

        .leaflet-control-attribution {
          background: rgba(18, 24, 21, 0.75) !important;
          color: #737688 !important;
          font-size: 9px !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          backdrop-filter: blur(4px) !important;
          border-radius: 4px 0 0 0 !important;
          padding: 2px 6px !important;
        }

        .leaflet-control-attribution a {
          color: #a0a7a3 !important;
          text-decoration: none !important;
        }

        .leaflet-control-attribution a:hover {
          text-decoration: underline !important;
        }
      `}</style>
    </div>
  );
}
