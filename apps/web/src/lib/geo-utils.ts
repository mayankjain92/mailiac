/**
 * Geospatial computation utilities for forensic network hop visualization.
 */

export interface MarkerColorTheme {
  primary: string;
  ring: string;
  glow: string;
  text: string;
}

/**
 * Maps a forensic hop trust classification tier to its corresponding UI color palette.
 */
export function getTrustTierMarkerColor(tier: string): MarkerColorTheme {
  switch (tier) {
    case 'TRUSTED INFRA':
      return {
        primary: '#10B981',
        ring: 'rgba(16, 185, 129, 0.35)',
        glow: 'rgba(16, 185, 129, 0.6)',
        text: '#FFFFFF',
      };
    case 'UNVERIFIED':
      return {
        primary: '#F59E0B',
        ring: 'rgba(245, 158, 11, 0.35)',
        glow: 'rgba(245, 158, 11, 0.6)',
        text: '#FFFFFF',
      };
    case 'LIKELY FORGED':
      return {
        primary: '#EF4444',
        ring: 'rgba(239, 68, 68, 0.35)',
        glow: 'rgba(239, 68, 68, 0.6)',
        text: '#FFFFFF',
      };
    case 'RECOGNIZED PROVIDER':
    default:
      return {
        primary: '#0052FF',
        ring: 'rgba(0, 82, 255, 0.35)',
        glow: 'rgba(0, 82, 255, 0.6)',
        text: '#FFFFFF',
      };
  }
}

/**
 * Converts degrees to radians.
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 */
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Generates an interpolated Great Circle / Geodesic curved arc between two latitude/longitude points.
 * Includes subtle arc height offset to give a distinct curved "flight path" trajectory even
 * for points on similar latitudes, avoiding straight overlapping lines.
 *
 * @param from [latitude, longitude]
 * @param to [latitude, longitude]
 * @param numPoints Number of intermediate sampling vertices (default: 25)
 * @returns Array of [latitude, longitude] tuples suitable for Leaflet polylines.
 */
export function generateGeodesicArc(
  from: [number, number],
  to: [number, number],
  numPoints = 25
): [number, number][] {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;

  // Handle identical coordinates
  if (Math.abs(lat1 - lat2) < 0.0001 && Math.abs(lon1 - lon2) < 0.0001) {
    return [[lat1, lon1]];
  }

  const phi1 = toRad(lat1);
  const lambda1 = toRad(lon1);
  const phi2 = toRad(lat2);
  let lambda2 = toRad(lon2);

  // Normalize antimeridian wrap
  let dLon = lambda2 - lambda1;
  if (dLon > Math.PI) {
    lambda2 -= 2 * Math.PI;
    dLon = lambda2 - lambda1;
  } else if (dLon < -Math.PI) {
    lambda2 += 2 * Math.PI;
    dLon = lambda2 - lambda1;
  }

  // Angular distance between points using Haversine
  const sinHalfDLat = Math.sin((phi2 - phi1) / 2);
  const sinHalfDLon = Math.sin(dLon / 2);
  const a =
    sinHalfDLat * sinHalfDLat +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDLon * sinHalfDLon;
  const angularDist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  if (angularDist < 0.001) {
    return [
      [lat1, lon1],
      [lat2, lon2],
    ];
  }

  const points: [number, number][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;

    // Standard Spherical Linear Interpolation (Slerp) along great circle
    const A = Math.sin((1 - f) * angularDist) / Math.sin(angularDist);
    const B = Math.sin(f * angularDist) / Math.sin(angularDist);

    const x =
      A * Math.cos(phi1) * Math.cos(lambda1) +
      B * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      A * Math.cos(phi1) * Math.sin(lambda1) +
      B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    let intermediateLat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let intermediateLon = toDeg(Math.atan2(y, x));

    // Add slight parabolic arc elevation offset (perpendicular to path) for visual depth
    const curvatureFactor = Math.sin(f * Math.PI);
    const arcHeight = Math.min(12, Math.max(2, toDeg(angularDist) * 0.08));
    intermediateLat += curvatureFactor * arcHeight * 0.35;

    // Clamp coordinates to valid ranges
    intermediateLat = Math.max(-85, Math.min(85, intermediateLat));
    if (intermediateLon > 180) intermediateLon -= 360;
    if (intermediateLon < -180) intermediateLon += 360;

    points.push([intermediateLat, intermediateLon]);
  }

  return points;
}
