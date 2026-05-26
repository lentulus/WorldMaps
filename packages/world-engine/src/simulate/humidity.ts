// Humidity pass.
//
// Model: ocean cells are pinned sources whose strength scales with surface
// temperature (warmer ocean → more evaporation). Each step we (a) advect the
// field along the local wind using a semi-Lagrangian scheme (decision 29,
// reversing decision 25), then (b) re-pin sources, (c) area-weighted diffuse
// (decision 13), (d) re-pin sources again. The result approximates a
// wind-driven, source-pinned steady state, producing wet windward coasts and
// dry leeward / interior regions.
//
// Storage: relative humidity in [0, 1].
//
// Semi-Lagrangian step:
//   For each cell r, project a small displacement back along the wind in the
//   local tangent frame, find the nearest mesh cell to that displaced point
//   (greedy neighbor descent on dot-product with the target unit vector), and
//   set next[r] := curr[upstream]. The displacement is `tau * cellRadius` per
//   step, scaled by wind magnitude relative to a reference. Unconditionally
//   stable (no CFL constraint) because we sample, never extrapolate.

import type { Topology } from '../geom/voronoi.js';
import { areaWeightedDiffuseStep } from './diffusion.js';
import { latLonToUnit } from '../geom/sphere.js';

const DEG2RAD = Math.PI / 180;

export interface AssignHumidityOptions {
  /** Diffusion blend per step. Default 0.18. */
  readonly alpha?: number;
  /** Number of advect+diffuse steps. Default 40. */
  readonly steps?: number;
  /** Humidity at coldest ocean source cells. Default 0.55. */
  readonly minOceanHumidity?: number;
  /** Humidity at warmest ocean source cells. Default 0.95. */
  readonly maxOceanHumidity?: number;
  /** Temperature (°C) mapped to minOceanHumidity. Default -5. */
  readonly minSourceTemp?: number;
  /** Temperature (°C) mapped to maxOceanHumidity. Default 30. */
  readonly maxSourceTemp?: number;
  /** Per-step displacement, as a multiple of the local cell radius, at the
   *  reference wind speed. Default 0.6 → typical land cells see flow of
   *  ~0.6 cell-widths per tick. Smaller = more diffusive, larger = sharper
   *  upwind/downwind contrast. */
  readonly advectionStrength?: number;
  /** Reference wind speed (m/s) at which advectionStrength applies. Wind
   *  above this scales the step linearly; wind below it scales sub-linearly.
   *  Default 8 m/s. */
  readonly referenceWindSpeed?: number;
}

export function assignHumidity(
  numRegions: number,
  elevation: Float32Array,
  temperature: Float32Array,
  wind: Float32Array,
  latlon: Float32Array,
  topology: Topology,
  options: AssignHumidityOptions = {},
): Float32Array {
  const alpha = options.alpha ?? 0.18;
  const steps = Math.max(0, Math.floor(options.steps ?? 40));
  const hMin = options.minOceanHumidity ?? 0.55;
  const hMax = options.maxOceanHumidity ?? 0.95;
  const tMin = options.minSourceTemp ?? -5;
  const tMax = options.maxSourceTemp ?? 30;
  const tRange = tMax - tMin;
  const tau = options.advectionStrength ?? 0.6;
  const refSpeed = options.referenceWindSpeed ?? 8;

  // Precompute per-cell unit vectors and cell radii in radians (rough linear
  // size, derived from spherical cell area: a small disc of radius r on the
  // unit sphere has area ≈ π r²).
  const cellUnits = new Float32Array(3 * numRegions);
  const cellRad = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const [ux, uy, uz] = latLonToUnit(latlon[2 * r]!, latlon[2 * r + 1]!);
    cellUnits[3 * r] = ux;
    cellUnits[3 * r + 1] = uy;
    cellUnits[3 * r + 2] = uz;
    cellRad[r] = Math.sqrt(Math.max(0, topology.cellArea[r]!) / Math.PI);
  }

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
    semiLagrangianAdvectStep(
      curr,
      next,
      latlon,
      wind,
      cellUnits,
      cellRad,
      topology,
      tau,
      refSpeed,
    );
    for (let r = 0; r < numRegions; r++) {
      if (isSource[r]) next[r] = source[r]!;
    }

    areaWeightedDiffuseStep(next, curr, topology, alpha);
    for (let r = 0; r < numRegions; r++) {
      if (isSource[r]) curr[r] = source[r]!;
    }
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

/**
 * One semi-Lagrangian advection step. For each cell r, sample the field at
 * the cell whose center is closest to `unit_at_r − (tau * cellRad) * windDir`
 * on the sphere, where `windDir` is the wind vector mapped from tangent
 * frame to 3D. Greedy neighbor descent on dot-product (= cosine of angular
 * distance) — terminates when no neighbor is closer to the target than the
 * current cell.
 */
function semiLagrangianAdvectStep(
  curr: Float32Array,
  out: Float32Array,
  latlon: Float32Array,
  wind: Float32Array,
  cellUnits: Float32Array,
  cellRad: Float32Array,
  topology: Topology,
  tau: number,
  refSpeed: number,
): void {
  const numRegions = curr.length;
  const { offsets, flat } = topology.neighbors;

  for (let r = 0; r < numRegions; r++) {
    const we = wind[2 * r]!;
    const wn = wind[2 * r + 1]!;
    const speed = Math.hypot(we, wn);
    if (speed < 1e-3) {
      out[r] = curr[r]!;
      continue;
    }
    // Per-step displacement: tau cell-radii at refSpeed, linear in wind speed,
    // capped at ~2 cell-radii so a single step never skips more than a couple
    // of neighbors (keeps the greedy walk cheap).
    const stepMag = Math.min(2.0, tau * (speed / refSpeed)) * cellRad[r]!;

    // Build target unit vector: u_target = normalize(u_r + stepMag * (-windDir_3d))
    // wind unit in tangent frame:
    const uE = we / speed;
    const uN = wn / speed;

    // Tangent basis at r in 3D:
    const lat = latlon[2 * r]! * DEG2RAD;
    const lon = latlon[2 * r + 1]! * DEG2RAD;
    const cp = Math.cos(lat);
    const sp = Math.sin(lat);
    const cl = Math.cos(lon);
    const sl = Math.sin(lon);
    // east  = (-sin λ, cos λ, 0)
    // north = (-sin φ cos λ, -sin φ sin λ, cos φ)
    const eX = -sl;
    const eY = cl;
    const eZ = 0;
    const nX = -sp * cl;
    const nY = -sp * sl;
    const nZ = cp;

    // Move OPPOSITE the wind to get the upstream point.
    const dispX = -stepMag * (uE * eX + uN * nX);
    const dispY = -stepMag * (uE * eY + uN * nY);
    const dispZ = -stepMag * (uE * eZ + uN * nZ);

    const tX = cellUnits[3 * r]! + dispX;
    const tY = cellUnits[3 * r + 1]! + dispY;
    const tZ = cellUnits[3 * r + 2]! + dispZ;
    const tLen = Math.hypot(tX, tY, tZ);
    const txn = tX / tLen;
    const tyn = tY / tLen;
    const tzn = tZ / tLen;

    // Greedy walk neighbors toward target (maximize dot product).
    let cellIdx = r;
    let bestDot =
      cellUnits[3 * r]! * txn + cellUnits[3 * r + 1]! * tyn + cellUnits[3 * r + 2]! * tzn;
    // Bound the walk so a pathological case can't loop forever (shouldn't
    // happen with greedy ascent on a convex objective, but be safe).
    for (let hop = 0; hop < 8; hop++) {
      let foundBetter = false;
      for (let k = offsets[cellIdx]!; k < offsets[cellIdx + 1]!; k++) {
        const nb = flat[k]!;
        const d =
          cellUnits[3 * nb]! * txn +
          cellUnits[3 * nb + 1]! * tyn +
          cellUnits[3 * nb + 2]! * tzn;
        if (d > bestDot) {
          bestDot = d;
          cellIdx = nb;
          foundBetter = true;
        }
      }
      if (!foundBetter) break;
    }
    out[r] = curr[cellIdx]!;
  }
}
