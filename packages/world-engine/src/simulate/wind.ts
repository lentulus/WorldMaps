// Surface wind pass.
//
// Storage convention (decision 10): tangent-frame [east m/s, north m/s] per
// region, interleaved. This means the stored magnitude IS the physical wind
// speed at every latitude — no division-by-cos(lat) blowup near the poles
// that [dlat, dlon] storage would produce.
//
// Pattern (v1): three-cell zonal structure approximated by harmonics of
// latitude. Trade easterlies in the tropics, mid-latitude westerlies,
// polar easterlies. A meridional component models Hadley/Ferrel surface
// convergence at a coarse level.
//
// Future phases can add: orographic deflection from elevation gradients,
// ocean–land thermal contrast, seasonal variation.

const DEG2RAD = Math.PI / 180;

export interface AssignWindOptions {
  /** Peak zonal wind magnitude, m/s. Default 9. */
  readonly zonalAmplitude?: number;
  /** Peak meridional wind magnitude, m/s. Default 3. */
  readonly meridionalAmplitude?: number;
}

export function assignWind(
  numRegions: number,
  latlon: Float32Array,
  options: AssignWindOptions = {},
): Float32Array {
  const zonal = options.zonalAmplitude ?? 9;
  const mer = options.meridionalAmplitude ?? 3;

  const out = new Float32Array(2 * numRegions);
  for (let r = 0; r < numRegions; r++) {
    const lat = latlon[2 * r]!;
    const phi = lat * DEG2RAD;
    // -cos(3φ): -1 at equator (trade easterlies), +1 at ~60° (westerlies),
    //           transitions back near the poles.
    const uEast = -zonal * Math.cos(3 * phi);
    // -sin(3φ): equatorward at 30°N, poleward at 60°N, equatorward at 30°S, etc.
    const uNorth = -mer * Math.sin(3 * phi);
    out[2 * r] = uEast;
    out[2 * r + 1] = uNorth;
  }
  return out;
}

/**
 * Project a 3D Cartesian wind vector onto the local tangent frame at (lat, lon)
 * and return [east, north]. This is the conversion future phases will use when
 * sourcing winds from 3D models (e.g. analytical re-derivation of ocean
 * currents in Phase 7 per decision 10).
 */
export function cartesianToTangentWind(
  vx: number,
  vy: number,
  vz: number,
  lat: number,
  lon: number,
): [east: number, north: number] {
  const phi = lat * DEG2RAD;
  const lam = lon * DEG2RAD;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const cl = Math.cos(lam);
  const sl = Math.sin(lam);
  // Local basis vectors at (lat, lon) on the unit sphere.
  // east  = (-sin λ, cos λ, 0)
  // north = (-sin φ cos λ, -sin φ sin λ, cos φ)
  const east = vx * -sl + vy * cl;
  const north = vx * -sp * cl + vy * -sp * sl + vz * cp;
  return [east, north];
}

/** Magnitude (m/s) of the stored wind vector at region r. */
export function windMagnitude(wind: Float32Array, regionId: number): number {
  const u = wind[2 * regionId]!;
  const v = wind[2 * regionId + 1]!;
  return Math.hypot(u, v);
}
