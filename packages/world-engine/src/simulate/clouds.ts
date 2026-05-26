// Cloud cover pass.
//
// Heuristic: clouds form where humidity saturates against cooling. Two
// effects combined:
//   - direct: cloud cover scales with humidity above a low floor (humid air
//     → some persistent overcast).
//   - orographic lift: positive elevation forces uplift cooling, raising the
//     cloud-from-humidity yield. Below sea level there is no lift bonus.
//
// A short area-weighted diffusion sweep softens the pattern.
//
// Storage: cloud cover in [0, 1].

import type { Topology } from '../geom/voronoi.js';
import { areaWeightedDiffuse } from './diffusion.js';

export interface AssignCloudsOptions {
  /** Humidity below this contributes no clouds. Default 0.25. */
  readonly humidityFloor?: number;
  /** Multiplier on the orographic boost from positive elevation. Default 0.7. */
  readonly orographicGain?: number;
  /** Diffusion blend per step. Default 0.15. */
  readonly alpha?: number;
  /** Number of diffusion steps. Default 4. */
  readonly steps?: number;
}

export function assignClouds(
  numRegions: number,
  elevation: Float32Array,
  humidity: Float32Array,
  topology: Topology,
  options: AssignCloudsOptions = {},
): Float32Array {
  const floor = options.humidityFloor ?? 0.25;
  const gain = options.orographicGain ?? 0.7;
  const alpha = options.alpha ?? 0.15;
  const steps = Math.max(0, Math.floor(options.steps ?? 4));

  const denom = 1 - floor;
  const out = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const h = humidity[r]!;
    const excess = h > floor ? (h - floor) / denom : 0;
    const e = elevation[r]!;
    const lift = e > 0 ? 1 + gain * e : 1;
    let v = excess * lift;
    if (v < 0) v = 0;
    else if (v > 1) v = 1;
    out[r] = v;
  }

  const result: Float32Array = steps > 0
    ? areaWeightedDiffuse(out, new Float32Array(numRegions), topology, alpha, steps)
    : out;

  for (let r = 0; r < numRegions; r++) {
    const v = result[r]!;
    if (!Number.isFinite(v)) result[r] = 0;
    else if (v < 0) result[r] = 0;
    else if (v > 1) result[r] = 1;
  }
  return result;
}
