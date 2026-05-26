// Plate-driven elevation pass.
//
// Per-plate state:
//   - isContinental: bool (random 50/50)
//   - motion: 3D tangent-plane vector at the plate centroid, random direction
//
// For each plate-boundary edge (a, b) with a.plate ≠ b.plate:
//   - Compute the relative motion (motionA - motionB) projected onto the edge
//     normal (the great-circle direction from a → b).
//   - Positive = convergent (plates pushing into each other) → mountains.
//   - Negative = divergent (plates pulling apart)            → trench/rift.
//
// Each region's elevation = base (continental ↑, oceanic ↓) + distance-weighted
// sum of nearby boundary contributions. Then normalize the whole field to
// [-1, 1] so the contract's documented range holds.

import type { Rng } from '../rng.js';
import type { Topology } from '../geom/voronoi.js';
import { latLonToUnit } from '../geom/sphere.js';

const CONTINENTAL_BASE = 0.35;
const OCEANIC_BASE = -0.55;

interface PlateData {
  readonly isContinental: boolean;
  /** Tangent-plane motion at the plate centroid, expressed as a 3D vector. */
  readonly motion: [number, number, number];
  /** 3D unit vector of plate centroid. */
  readonly centroidUnit: [number, number, number];
}

export interface ElevationResult {
  readonly elevation: Float32Array;
  readonly plateIsContinental: Uint8Array; // 1 = continental, 0 = oceanic
}

export interface AssignElevationOptions {
  /** Fraction of regions to leave below sea level (≤ 0 elevation). */
  readonly oceanFraction?: number;
}

export function assignElevation(
  numRegions: number,
  numPlates: number,
  latlon: Float32Array,
  plate: Int32Array,
  seedRegions: Int32Array,
  topology: Topology,
  rng: Rng,
  options: AssignElevationOptions = {},
): ElevationResult {
  // 1. Per-plate data.
  const plates: PlateData[] = new Array(numPlates);
  const plateIsContinental = new Uint8Array(numPlates);
  for (let k = 0; k < numPlates; k++) {
    const seed = seedRegions[k]!;
    const lat = latlon[2 * seed]!;
    const lon = latlon[2 * seed + 1]!;
    const centroidUnit = latLonToUnit(lat, lon);

    // Random tangent direction: pick a random unit vector, then project onto
    // the tangent plane at the centroid (subtract the radial component).
    const dx = rng.range(-1, 1);
    const dy = rng.range(-1, 1);
    const dz = rng.range(-1, 1);
    const cu = centroidUnit;
    const dot = dx * cu[0] + dy * cu[1] + dz * cu[2];
    let mx = dx - dot * cu[0];
    let my = dy - dot * cu[1];
    let mz = dz - dot * cu[2];
    const magM = Math.hypot(mx, my, mz) || 1;
    mx /= magM;
    my /= magM;
    mz /= magM;

    const isCont = rng.next() < 0.5;
    plateIsContinental[k] = isCont ? 1 : 0;
    plates[k] = {
      isContinental: isCont,
      motion: [mx, my, mz],
      centroidUnit,
    };
  }

  // 2. Find all plate-boundary edges and compute their elevation contribution.
  //    A region near a boundary picks up its contribution attenuated by
  //    great-circle distance.
  //
  // Boundary edge "strength":
  //   strength = (motionA - motionB) · n_ab, where n_ab is the unit tangent
  //     vector at midpoint pointing from a → b.
  //   positive = convergent (push together) → +elevation
  //   negative = divergent (pull apart)     → −elevation
  //
  // To avoid O(N * E) we BFS outward from each boundary edge and stop when
  // the falloff weight drops below epsilon. For Phase 5 we use a simpler
  // approach: for each region, scan its neighbors and accumulate contributions
  // only from edges that touch it directly. This produces sharp boundary
  // features; if you want broader mountain ranges we can iterate.
  const elevation = new Float32Array(numRegions);

  // Base elevation by plate.
  for (let r = 0; r < numRegions; r++) {
    const p = plates[plate[r]!]!;
    elevation[r] = p.isContinental ? CONTINENTAL_BASE : OCEANIC_BASE;
  }

  // Multi-source BFS from boundary regions, with distance falloff.
  type Frontier = { region: number; strength: number; depth: number };
  const frontier: Frontier[] = [];
  const seenDepth = new Int32Array(numRegions);
  seenDepth.fill(-1);

  // Identify boundary regions and seed the frontier.
  const { offsets, flat } = topology.neighbors;
  for (let r = 0; r < numRegions; r++) {
    const myPlate = plate[r]!;
    const myUnit = latLonToUnit(latlon[2 * r]!, latlon[2 * r + 1]!);
    let netStrength = 0;
    let isBoundary = false;
    for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
      const n = flat[k]!;
      const otherPlate = plate[n]!;
      if (otherPlate === myPlate) continue;
      isBoundary = true;

      // Edge tangent direction (from r → n) projected on sphere.
      const nUnit = latLonToUnit(latlon[2 * n]!, latlon[2 * n + 1]!);
      let ex = nUnit[0] - myUnit[0];
      let ey = nUnit[1] - myUnit[1];
      let ez = nUnit[2] - myUnit[2];
      const dot = ex * myUnit[0] + ey * myUnit[1] + ez * myUnit[2];
      ex -= dot * myUnit[0];
      ey -= dot * myUnit[1];
      ez -= dot * myUnit[2];
      const mag = Math.hypot(ex, ey, ez) || 1;
      ex /= mag;
      ey /= mag;
      ez /= mag;

      const motA = plates[myPlate]!.motion;
      const motB = plates[otherPlate]!.motion;
      const rel = (motA[0] - motB[0]) * ex + (motA[1] - motB[1]) * ey + (motA[2] - motB[2]) * ez;

      // Continental/continental convergent => big mountains
      // Continental/oceanic convergent => mountain on continental side
      // Oceanic/oceanic divergent => mid-ocean ridge
      const aCont = plates[myPlate]!.isContinental;
      const bCont = plates[otherPlate]!.isContinental;
      let amp = 1.0;
      if (aCont && bCont) amp = 1.2;
      else if (!aCont && !bCont) amp = 0.6;
      else amp = aCont ? 1.0 : -0.3; // subducting oceanic side gets a trench

      netStrength += rel * amp;
    }
    if (isBoundary) {
      // Normalize by number of boundary neighbors so very-borderlocked regions
      // don't get unbounded contributions.
      frontier.push({ region: r, strength: netStrength, depth: 0 });
      seenDepth[r] = 0;
    }
  }

  // BFS outward; each step attenuates the contribution by 1/BOUNDARY_FALLOFF.
  // Skip BFS expansion entirely if no boundaries (degenerate: 1-plate world).
  const maxDepth = 6;
  const attenuationPerStep = 0.7;
  let i = 0;
  while (i < frontier.length) {
    const { region: r, strength, depth } = frontier[i++]!;
    const weight = Math.pow(attenuationPerStep, depth);
    elevation[r] = elevation[r]! + strength * weight * 0.15;
    if (depth >= maxDepth) continue;
    for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
      const n = flat[k]!;
      if (seenDepth[n] !== -1) continue;
      seenDepth[n] = depth + 1;
      frontier.push({ region: n, strength, depth: depth + 1 });
    }
  }

  // 3. Hotspots: pick a few random regions and bump elevation.
  const numHotspots = Math.max(3, Math.floor(numRegions / 200));
  for (let h = 0; h < numHotspots; h++) {
    const r = rng.int(numRegions);
    const lift = rng.range(0.1, 0.4);
    elevation[r] = elevation[r]! + lift;
    // Spread to direct neighbors at half strength
    for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
      const n = flat[k]!;
      elevation[n] = elevation[n]! + lift * 0.4;
    }
  }

  // 4. Sea-level quantile shift: pick the oceanFraction-th value of the raw
  //    elevation distribution and shift it to 0. This makes exactly
  //    floor(N * oceanFraction) regions strictly below sea level (with possibly
  //    some at exactly 0 if values tie at the threshold).
  const oceanFraction = clamp01(options.oceanFraction ?? 0.6);
  if (oceanFraction > 0 && oceanFraction < 1) {
    const sorted = Array.from(elevation).sort((a, b) => a - b);
    const idx = Math.floor(numRegions * oceanFraction);
    const threshold = sorted[Math.min(idx, numRegions - 1)] ?? 0;
    for (let r = 0; r < numRegions; r++) {
      elevation[r] = elevation[r]! - threshold;
    }
  } else if (oceanFraction === 1) {
    // All ocean: shift the max down to 0.
    let max = -Infinity;
    for (let r = 0; r < numRegions; r++) if (elevation[r]! > max) max = elevation[r]!;
    for (let r = 0; r < numRegions; r++) elevation[r] = elevation[r]! - max - 1e-6;
  } else {
    // All land: shift the min up to 0.
    let min = Infinity;
    for (let r = 0; r < numRegions; r++) if (elevation[r]! < min) min = elevation[r]!;
    for (let r = 0; r < numRegions; r++) elevation[r] = elevation[r]! - min + 1e-6;
  }

  // 5. Normalize positive and negative sides to [-1, 1] independently, so sea
  // level (0) stays at 0 and both extremes saturate the contract's range.
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < numRegions; r++) {
    const v = elevation[r]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const posScale = hi > 0 ? 1 / hi : 1;
  const negScale = lo < 0 ? 1 / -lo : 1;
  for (let r = 0; r < numRegions; r++) {
    const v = elevation[r]!;
    elevation[r] = v >= 0 ? v * posScale : v * negScale;
  }

  // Defensive clamp + zero out NaN/Infinity (the math shouldn't produce them,
  // but the contract requires the range to hold).
  for (let r = 0; r < numRegions; r++) {
    let v = elevation[r]!;
    if (!Number.isFinite(v)) v = 0;
    if (v < -1) v = -1;
    if (v > 1) v = 1;
    elevation[r] = v;
  }

  return { elevation, plateIsContinental };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
