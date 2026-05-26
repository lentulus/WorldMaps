// Temperature pass.
//
// Two physically-motivated terms:
//   1. Insolation by latitude: peak at equator, smoothly falling toward the
//      poles. Uses cos(lat) shape so transitions are continuous (the test
//      "average temperature is monotone in |lat| on a flat world" relies on
//      this).
//   2. Adiabatic lapse from elevation: high terrain is cooler. Submarine
//      cells get a small warming bonus from depth (a stand-in for the fact
//      that we never see deep-ocean surface temperature drop linearly with
//      bathymetry — kept small).
//
// Then a short area-weighted diffusion sweep smooths sharp neighbor jumps
// without erasing the latitudinal gradient.
//
// Storage: degrees Celsius. Expected operating range roughly [-50, +35].

import type { Topology } from '../geom/voronoi.js';
import { areaWeightedDiffuse } from './diffusion.js';

const DEG2RAD = Math.PI / 180;

export interface AssignTemperatureOptions {
  /** Temperature at the equator at sea level (°C). Default 28. */
  readonly equatorTemp?: number;
  /** Temperature at the poles at sea level (°C). Default -30. */
  readonly poleTemp?: number;
  /** Adiabatic lapse expressed as °C subtracted at peak elevation (e = +1). Default 22. */
  readonly elevationLapse?: number;
  /** Diffusion smoothing steps. Default 3. */
  readonly diffusionSteps?: number;
  /** Diffusion blend per step. Default 0.18. */
  readonly diffusionAlpha?: number;
}

export function assignTemperature(
  numRegions: number,
  latlon: Float32Array,
  elevation: Float32Array,
  topology: Topology,
  options: AssignTemperatureOptions = {},
): Float32Array {
  const equatorT = options.equatorTemp ?? 28;
  const poleT = options.poleTemp ?? -30;
  const lapse = options.elevationLapse ?? 22;
  const steps = Math.max(0, Math.floor(options.diffusionSteps ?? 3));
  const alpha = options.diffusionAlpha ?? 0.18;

  const out = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const lat = latlon[2 * r]!;
    // cos(lat)² blends smoothly from 1 at the equator to 0 at the poles.
    const c = Math.cos(lat * DEG2RAD);
    const insol = c * c;
    const baseT = poleT + (equatorT - poleT) * insol;

    const e = elevation[r]!;
    const lapseTerm = e > 0 ? -lapse * e : 0.15 * lapse * e; // small warming with depth
    out[r] = baseT + lapseTerm;
  }

  if (steps === 0) return out;
  const scratch = new Float32Array(numRegions);
  return areaWeightedDiffuse(out, scratch, topology, alpha, steps);
}
