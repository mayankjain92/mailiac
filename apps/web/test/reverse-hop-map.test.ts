import { describe, it, expect } from 'vitest';
import type { ForensicHop } from '@mailiac/shared-types';
import { extractGeolocatedHops } from '../src/lib/findings';
import {
  generateGeodesicArc,
  getTrustTierMarkerColor,
} from '../src/lib/geo-utils';

describe('Reverse Hop Geospatial Utilities & Geodesic Arcs', () => {
  describe('getTrustTierMarkerColor', () => {
    it('returns emerald color theme for TRUSTED INFRA', () => {
      const theme = getTrustTierMarkerColor('TRUSTED INFRA');
      expect(theme.primary).toBe('#10B981');
      expect(theme.ring).toContain('16, 185, 129');
    });

    it('returns blue color theme for RECOGNIZED PROVIDER', () => {
      const theme = getTrustTierMarkerColor('RECOGNIZED PROVIDER');
      expect(theme.primary).toBe('#0052FF');
      expect(theme.ring).toContain('0, 82, 255');
    });

    it('returns amber color theme for UNVERIFIED', () => {
      const theme = getTrustTierMarkerColor('UNVERIFIED');
      expect(theme.primary).toBe('#F59E0B');
      expect(theme.ring).toContain('245, 158, 11');
    });

    it('returns red color theme for LIKELY FORGED', () => {
      const theme = getTrustTierMarkerColor('LIKELY FORGED');
      expect(theme.primary).toBe('#EF4444');
      expect(theme.ring).toContain('239, 68, 68');
    });

    it('defaults to blue for unknown tier', () => {
      const theme = getTrustTierMarkerColor('OTHER');
      expect(theme.primary).toBe('#0052FF');
    });
  });

  describe('generateGeodesicArc', () => {
    it('generates smooth interpolated intermediate points between two geographic locations', () => {
      // From New York (40.71, -74.00) to London (51.50, -0.12)
      const from: [number, number] = [40.7128, -74.006];
      const to: [number, number] = [51.5074, -0.1278];

      const arc = generateGeodesicArc(from, to, 20);

      // Should contain 21 points (0 through 20)
      expect(arc.length).toBe(21);

      // First point should be very close to 'from'
      expect(arc[0][0]).toBeCloseTo(from[0], 1);
      expect(arc[0][1]).toBeCloseTo(from[1], 1);

      // Last point should be very close to 'to'
      expect(arc[arc.length - 1][0]).toBeCloseTo(to[0], 1);
      expect(arc[arc.length - 1][1]).toBeCloseTo(to[1], 1);

      // Middle point should be properly bounded within valid world latitudes
      const midPoint = arc[10];
      expect(midPoint[0]).toBeGreaterThan(-85);
      expect(midPoint[0]).toBeLessThan(85);
      expect(midPoint[1]).toBeGreaterThan(-180);
      expect(midPoint[1]).toBeLessThan(180);
    });

    it('gracefully handles identical origin and destination coordinates', () => {
      const point: [number, number] = [37.7749, -122.4194];
      const arc = generateGeodesicArc(point, point);
      expect(arc.length).toBe(1);
      expect(arc[0]).toEqual(point);
    });

    it('handles trans-Pacific antimeridian wrapping', () => {
      // Tokyo (35.67, 139.65) to San Francisco (37.77, -122.41)
      const tokyo: [number, number] = [35.6762, 139.6503];
      const sf: [number, number] = [37.7749, -122.4194];

      const arc = generateGeodesicArc(tokyo, sf, 25);
      expect(arc.length).toBe(26);

      // Verify all points remain valid lat/lon
      arc.forEach(([lat, lon]) => {
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
      });
    });
  });

  describe('extractGeolocatedHops for Leaflet Map', () => {
    it('filters invalid coordinates and preserves valid geolocated hops', () => {
      const sampleHops: ForensicHop[] = [
        {
          ip: '10.0.0.1',
          isPrivate: true,
          ptrValid: false,
          trusted: true,
          // No coordinates
        },
        {
          ip: '192.30.252.1',
          isPrivate: false,
          ptrValid: true,
          trusted: true,
          city: 'San Francisco',
          country: 'United States',
          coordinates: [37.7749, -122.4194],
          asn: 'AS36459 GITHUB',
        },
        {
          ip: '185.220.101.5',
          isPrivate: false,
          ptrValid: false,
          trusted: false,
          city: 'Frankfurt',
          country: 'Germany',
          coordinates: [50.1109, 8.6821],
          asn: 'AS208312 TOR-EXIT',
        },
      ];

      const mapped = extractGeolocatedHops(sampleHops);
      expect(mapped.length).toBe(2);

      expect(mapped[0].ip).toBe('192.30.252.1');
      expect(mapped[0].hopNumber).toBe(2);
      expect(mapped[0].lat).toBeCloseTo(37.7749);
      expect(mapped[0].lon).toBeCloseTo(-122.4194);
      expect(mapped[0].classification.tier).toBe('TRUSTED INFRA');

      expect(mapped[1].ip).toBe('185.220.101.5');
      expect(mapped[1].hopNumber).toBe(3);
      expect(mapped[1].lat).toBeCloseTo(50.1109);
      expect(mapped[1].lon).toBeCloseTo(8.6821);
      expect(mapped[1].classification.tier).toBe('UNVERIFIED');
    });

    it('correctly maps multiple collocated hops sharing the exact same coordinates', () => {
      // e.g. Redmond Outlook hops 2 & 3
      const collocatedHops: ForensicHop[] = [
        {
          ip: '::1',
          isPrivate: true,
          ptrValid: false,
          trusted: true,
        },
        {
          ip: '2603:10a6:10:130::24',
          isPrivate: false,
          ptrValid: false,
          trusted: false,
          city: 'Redmond',
          country: 'United States',
          coordinates: [47.6739, -122.1215],
        },
        {
          ip: '2603:10a6:10:130:cafe::9b',
          isPrivate: false,
          ptrValid: false,
          trusted: false,
          city: 'Redmond',
          country: 'United States',
          coordinates: [47.6739, -122.1215],
        },
        {
          ip: '89.144.44.2',
          isPrivate: false,
          ptrValid: false,
          trusted: false,
          city: 'Warsaw',
          country: 'Poland',
          coordinates: [52.2297, 21.0122],
        },
      ];

      const mapped = extractGeolocatedHops(collocatedHops);
      expect(mapped.length).toBe(3);

      expect(mapped[0].hopNumber).toBe(2);
      expect(mapped[0].ip).toBe('2603:10a6:10:130::24');
      expect(mapped[0].lat).toBeCloseTo(47.6739);
      expect(mapped[0].lon).toBeCloseTo(-122.1215);

      expect(mapped[1].hopNumber).toBe(3);
      expect(mapped[1].ip).toBe('2603:10a6:10:130:cafe::9b');
      expect(mapped[1].lat).toBeCloseTo(47.6739);
      expect(mapped[1].lon).toBeCloseTo(-122.1215);

      expect(mapped[2].hopNumber).toBe(4);
      expect(mapped[2].ip).toBe('89.144.44.2');
      expect(mapped[2].lat).toBeCloseTo(52.2297);
      expect(mapped[2].lon).toBeCloseTo(21.0122);
    });

    it('returns empty array when hops array is null or empty', () => {
      expect(extractGeolocatedHops(null)).toEqual([]);
      expect(extractGeolocatedHops([])).toEqual([]);
    });
  });
});
