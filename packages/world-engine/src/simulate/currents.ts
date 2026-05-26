// Surface ocean currents pass.
//
// Storage convention (decision 10): tangent-frame [east m/s, north m/s] per
// region, interleaved. Currents are *analytically re-derived* from the wind
// field plus a latitude-dependent Coriolis deflection — they are not rotated
// from a [dlat, dlon] storage form. Land cells store (0, 0).
//
// Physical sketch: surface ocean drift is a small fraction of the local wind,
// deflected by the Ekman effect. We deflect to the right of the wind in the
// northern hemisphere and to the left in the southern hemisphere, with the
// deflection angle scaling with |sin(lat)| (vanishing at the equator where
// Coriolis is zero). This is the simplest model that:
//   1. yields the textbook gyre chirality (CW in N, CCW in S) given the
//      three-cell zonal wind pattern in `wind.ts`, and
//   2. respects f-plane physics qualitatively (no deflection at the equator).
//
// The wind pattern itself already drives the gyre rotation: the zonal wind
// reverses sign across each gyre center, so the rotated wind vectors trace
// the gyre. Ekman deflection just rotates each current vector a few degrees
// from the local wind direction; it does not flip the gyre sense.

import type { Topology } from '../geom/voronoi.js';

const DEG2RAD = Math.PI / 180;

export interface AssignCurrentsOptions {
  /** Fraction of wind speed transferred to the surface ocean drift.
   *  Default 0.04 — within the textbook 2–5% range. */
  readonly windCouplingFraction?: number;
  /** Maximum Ekman deflection angle (degrees) reached at the poles.
   *  Tapered by |sin(lat)| so it vanishes at the equator. Default 30°. */
  readonly maxEkmanDeg?: number;
}

export function assignCurrents(
  numRegions: number,
  latlon: Float32Array,
  elevation: Float32Array,
  wind: Float32Array,
  _topology: Topology,
  options: AssignCurrentsOptions = {},
): Float32Array {
  const coupling = options.windCouplingFraction ?? 0.04;
  const maxEkmanRad = (options.maxEkmanDeg ?? 30) * DEG2RAD;

  const out = new Float32Array(2 * numRegions);
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r]! > 0) continue;

    const lat = latlon[2 * r]!;
    const phi = lat * DEG2RAD;
    const fScale = Math.sin(phi);
    // Northern hemisphere: rotate right (clockwise looking down from N pole)
    // → negative angle in (east, north) standard-orientation frame.
    // Southern: rotate left → positive angle. |sin(lat)| modulates magnitude.
    const theta = -fScale * maxEkmanRad;

    const we = wind[2 * r]!;
    const wn = wind[2 * r + 1]!;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const cE = c * we - s * wn;
    const cN = s * we + c * wn;

    out[2 * r] = coupling * cE;
    out[2 * r + 1] = coupling * cN;
  }
  return out;
}

/** Magnitude (m/s) of the stored current vector at region r. */
export function currentMagnitude(currents: Float32Array, regionId: number): number {
  const u = currents[2 * regionId]!;
  const v = currents[2 * regionId + 1]!;
  return Math.hypot(u, v);
}
