// Humidity pass.
//
// Model: ocean cells are pinned sources whose strength scales with surface
// temperature (warmer ocean → more evaporation). Land cells start at zero and
// relax toward neighbors through area-weighted diffusion (decision 13).
// Sources are re-applied each step (Dirichlet-style boundary), so the result
// is the steady-state of a diffusion-with-fixed-boundary problem.
//
// Wind-driven advection is intentionally *not* part of v1: a pure diffusion
// model already produces the wet-coast / dry-interior pattern, and the
// Voronoi-mesh advection kernel is enough work to deserve its own phase.
//
// Storage: relative humidity in [0, 1].

import type { Topology } from '../geom/voronoi.js';
import { areaWeightedDiffuseStep } from './diffusion.js';

export interface AssignHumidityOptions {
  /** Diffusion blend per step. Default 0.22. */
  readonly alpha?: number;
  /** Number of diffusion steps. Default 40. */
  readonly steps?: number;
  /** Humidity at coldest ocean source cells. Default 0.55. */
  readonly minOceanHumidity?: number;
  /** Humidity at warmest ocean source cells. Default 0.95. */
  readonly maxOceanHumidity?: number;
  /** Temperature (°C) mapped to minOceanHumidity. Default -5. */
  readonly minSourceTemp?: number;
  /** Temperature (°C) mapped to maxOceanHumidity. Default 30. */
  readonly maxSourceTemp?: number;
}

export function assignHumidity(
  numRegions: number,
  elevation: Float32Array,
  temperature: Float32Array,
  topology: Topology,
  options: AssignHumidityOptions = {},
): Float32Array {
  const alpha = options.alpha ?? 0.22;
  const steps = Math.max(0, Math.floor(options.steps ?? 40));
  const hMin = options.minOceanHumidity ?? 0.55;
  const hMax = options.maxOceanHumidity ?? 0.95;
  const tMin = options.minSourceTemp ?? -5;
  const tMax = options.maxSourceTemp ?? 30;
  const tRange = tMax - tMin;

  const source = new Float32Array(numRegions);
  const isSource = new Uint8Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r]! <= 0) {
      const u = tRange > 0 ? (temperature[r]! - tMin) / tRange : 0.5;
      const clamped = u < 0 ? 0 : u > 1 ? 1 : u;
      source[r] = hMin + (hMax - hMin) * clamped;
      isSource[r] = 1;
    }
  }

  let curr = new Float32Array(numRegions);
  let next = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    if (isSource[r]) curr[r] = source[r]!;
  }

  for (let s = 0; s < steps; s++) {
    areaWeightedDiffuseStep(curr, next, topology, alpha);
    for (let r = 0; r < numRegions; r++) {
      if (isSource[r]) next[r] = source[r]!;
    }
    const tmp = curr;
    curr = next;
    next = tmp;
  }

  // Defensive clamp to [0, 1]; the math shouldn't push outside but the
  // contract advertises this range.
  for (let r = 0; r < numRegions; r++) {
    const v = curr[r]!;
    if (!Number.isFinite(v)) curr[r] = 0;
    else if (v < 0) curr[r] = 0;
    else if (v > 1) curr[r] = 1;
  }
  return curr;
}
