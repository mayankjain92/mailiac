'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ForensicHop } from '@mailiac/shared-types';
import {
  extractGeolocatedHops,
  type GeolocatedHopSummary,
} from '@/lib/findings';
import {
  Globe,
  MapPin,
  Maximize2,
  Minimize2,
  Shield,
  Loader2,
  Info,
} from 'lucide-react';

export interface ReverseHopMapVisualizerProps {
  hops: ForensicHop[];
  selectedHopIndex: number | null;
  onSelectHop: (index: number | null) => void;
  className?: string;
}

export type MappedHop = GeolocatedHopSummary;

// Dynamically import Leaflet map component to prevent SSR "window is not defined" issues
const ReverseHopLeafletMap = dynamic(
  () => import('./ReverseHopLeafletMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[380px] bg-[#0E1210] flex flex-col items-center justify-center text-xs font-mono text-[#737688] dark:text-[#A0A7A3] gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#0052FF]" />
        <span>Initializing Forensics Basemap...</span>
      </div>
    ),
  }
);

export default function ReverseHopMapVisualizer({
  hops,
  selectedHopIndex,
  onSelectHop,
  className = '',
}: ReverseHopMapVisualizerProps): React.JSX.Element {
  const [hoveredHopIndex, setHoveredHopIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract valid geolocated hops with coordinate validation
  const mappedHops: MappedHop[] = useMemo(() => {
    return extractGeolocatedHops(hops);
  }, [hops]);

  // Identify hops that cannot be physically geolocated (e.g. Hop 1 loopback ::1 or RFC 1918 private)
  const unmappedHops = useMemo(() => {
    if (!hops || !Array.isArray(hops)) return [];
    return hops
      .map((hop, index) => {
        const isMapped = mappedHops.some((m) => m.originalIndex === index);
        if (isMapped) return null;

        let reason = 'No physical coordinates';
        if (hop.ip === '::1' || hop.ip === '127.0.0.1') {
          reason = 'Loopback IP (local host)';
        } else if (hop.isPrivate) {
          reason = 'Private network (RFC 1918)';
        }

        return {
          originalIndex: index,
          hopNumber: index + 1,
          hop,
          reason,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [hops, mappedHops]);

  const activeHop = useMemo(() => {
    const targetIndex = hoveredHopIndex !== null ? hoveredHopIndex : selectedHopIndex;
    if (targetIndex === null) return null;
    return mappedHops.find((m) => m.originalIndex === targetIndex) || null;
  }, [hoveredHopIndex, selectedHopIndex, mappedHops]);

  const mappedCount = mappedHops.length;
  const totalHops = hops?.length || 0;

  // Fallback if no hops possess geographic coordinates
  if (mappedCount === 0) {
    return (
      <div
        className={`p-4 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F] text-xs font-mono text-center text-[#737688] dark:text-[#A0A7A3] ${className}`}
      >
        <div className="flex items-center justify-center gap-2 mb-1 text-[#121212] dark:text-[#F2F2EE] font-bold">
          <Globe className="w-4 h-4 text-[#737688] dark:text-[#A0A7A3]" />
          <span>Geographic trace unavailable for this email</span>
        </div>
        <p className="text-[11px] leading-relaxed max-w-md mx-auto">
          No public IP hops contained resolvable latitude/longitude coordinates. Network hops remain analyzed in the forensic dissection trail below.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] rounded shadow-sm overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Map Card Header */}
      <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#29342F] bg-[#F2F2EE]/60 dark:bg-[#1B211E]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" />
              Observed Infrastructure Locations
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] font-bold border border-[#0052FF]/20">
              {mappedCount} of {totalHops} Hops Mapped
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] font-semibold border border-[#10B981]/20 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" />
              ArcGIS Forensics Basemap
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3] mt-0.5">
            Approximate IP Geolocation Trace • Great Circle Geodesic Routing
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {selectedHopIndex !== null && (
            <button
              type="button"
              onClick={() => onSelectHop(null)}
              className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3] hover:text-[#121212] dark:hover:text-[#F2F2EE] underline cursor-pointer"
            >
              Reset Selection
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-[#E5E5E5] dark:hover:bg-[#29342F] text-[#737688] dark:text-[#A0A7A3] transition-colors cursor-pointer"
            title={isExpanded ? 'Compress View' : 'Expand View'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Unmapped Nodes Explanatory Ribbon */}
      {unmappedHops.length > 0 && (
        <div className="px-4 py-1.5 bg-[#F2F2EE]/70 dark:bg-[#1B211E]/70 border-b border-[#E5E5E5] dark:border-[#29342F] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Info className="w-3 h-3 text-[#F59E0B]" />
            <span className="font-semibold text-[#121212] dark:text-[#F2F2EE]">
              Unmapped Internal Node{unmappedHops.length > 1 ? 's' : ''}:
            </span>
            {unmappedHops.map((u) => (
              <span
                key={u.originalIndex}
                className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px]"
              >
                Hop {u.hopNumber} ({u.hop.ip}) &bull; {u.reason}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-[#737688] dark:text-[#A0A7A3]">
            Excluded from geographic map (internal infrastructure)
          </span>
        </div>
      )}

      {/* Interactive Map Canvas Container */}
      <div
        className={`relative w-full bg-[#0E1210] overflow-hidden select-none transition-all duration-300 ${
          isExpanded ? 'h-[560px]' : 'h-[380px]'
        }`}
      >
        <ReverseHopLeafletMap
          hops={mappedHops}
          selectedHopIndex={selectedHopIndex}
          hoveredHopIndex={hoveredHopIndex}
          onSelectHop={onSelectHop}
          onHoverHop={setHoveredHopIndex}
          isExpanded={isExpanded}
        />

        {/* Floating Detailed Telemetry Card */}
        {activeHop && (
          <div className="absolute top-3 left-3 max-w-[280px] sm:max-w-[320px] bg-[#FFFFFF]/95 dark:bg-[#151A17]/95 backdrop-blur-md p-3.5 rounded border border-[#E5E5E5] dark:border-[#29342F] shadow-lg font-mono text-xs z-[400] transition-all pointer-events-auto">
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E5E5] dark:border-[#29342F] pb-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#0052FF] text-[#FFFFFF] flex items-center justify-center text-[10px] font-bold">
                  {activeHop.hopNumber}
                </span>
                <span className="font-bold text-[#121212] dark:text-[#F2F2EE]">
                  Hop {activeHop.hopNumber} of {totalHops}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${activeHop.classification.tierBadgeBg} ${activeHop.classification.tierBadgeText} ${activeHop.classification.tierBadgeBorder}`}
              >
                {activeHop.classification.tier}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] text-[#434656] dark:text-[#A0A7A3]">
              <div className="flex justify-between items-start gap-1">
                <span className="text-[#737688]">IP Address:</span>
                <strong className="text-[#121212] dark:text-[#F2F2EE]">{activeHop.hop.ip}</strong>
              </div>

              {activeHop.hop.hostnameClaimed && (
                <div className="flex justify-between items-start gap-1">
                  <span className="text-[#737688]">Claimed:</span>
                  <span
                    className="text-[#121212] dark:text-[#F2F2EE] truncate max-w-[170px]"
                    title={activeHop.hop.hostnameClaimed}
                  >
                    {activeHop.hop.hostnameClaimed}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-start gap-1">
                <span className="text-[#737688]">Location:</span>
                <span className="text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#EF4444] shrink-0" />
                  {activeHop.hop.city ? `${activeHop.hop.city}, ` : ''}
                  {activeHop.hop.country || 'Unknown'}
                </span>
              </div>

              <div className="flex justify-between items-start gap-1">
                <span className="text-[#737688]">Coordinates:</span>
                <span className="text-[#121212] dark:text-[#F2F2EE]">
                  {activeHop.lat.toFixed(2)}°, {activeHop.lon.toFixed(2)}°
                </span>
              </div>

              {activeHop.hop.asn && (
                <div className="flex justify-between items-start gap-1">
                  <span className="text-[#737688]">ASN / Provider:</span>
                  <span
                    className="text-[#121212] dark:text-[#F2F2EE] truncate max-w-[170px]"
                    title={activeHop.hop.asn}
                  >
                    {activeHop.hop.asn}
                  </span>
                </div>
              )}

              <div className="mt-2 pt-1.5 border-t border-dashed border-[#E5E5E5] dark:border-[#29342F] text-[10px]">
                <span className="text-[#737688] font-bold">Evidence Rationale:</span>
                <p className="text-[#121212] dark:text-[#F2F2EE] mt-0.5 leading-tight">
                  {activeHop.classification.evidence}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Map Legend Overlay */}
        <div className="absolute bottom-2 left-2 px-2.5 py-1.5 bg-[#FFFFFF]/90 dark:bg-[#151A17]/90 backdrop-blur-sm rounded border border-[#E5E5E5] dark:border-[#29342F] flex items-center gap-3 text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3] z-[400]">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>Trusted</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
            <span>Recognized</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            <span>Unverified</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span>Forged</span>
          </div>
        </div>
      </div>
    </div>
  );
}
