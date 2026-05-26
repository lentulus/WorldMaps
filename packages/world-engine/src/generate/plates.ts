// Tectonic-plate assignment.
//
// Algorithm: pick K seed regions uniformly at random, then run multi-source
// BFS over the Voronoi adjacency. Each region's plate id is the seed that
// reached it first. Equivalent to a discrete Voronoi-of-Voronoi partition.

import type { Rng } from '../rng.js';
import type { Topology } from '../geom/voronoi.js';

export interface PlatesResult {
  readonly plate: Int32Array;
  readonly seedRegions: Int32Array;
  readonly numPlates: number;
}

export function assignPlates(
  numRegions: number,
  numPlates: number,
  topology: Topology,
  rng: Rng,
): PlatesResult {
  if (numPlates < 1) throw new Error('numPlates must be >= 1');
  if (numPlates > numRegions) {
    throw new Error(`numPlates (${numPlates}) > numRegions (${numRegions})`);
  }

  // 1. Pick K distinct seed regions.
  const seedRegions = pickDistinct(numRegions, numPlates, rng);

  // 2. Multi-source BFS. Each frontier entry: (region, plateId).
  //    A region's plate is whichever frontier reaches it first.
  const plate = new Int32Array(numRegions);
  plate.fill(-1);
  const queue: number[] = [];
  for (let k = 0; k < numPlates; k++) {
    const seed = seedRegions[k]!;
    plate[seed] = k;
    queue.push(seed);
  }

  const { offsets, flat } = topology.neighbors;
  let head = 0;
  while (head < queue.length) {
    const r = queue[head++]!;
    const myPlate = plate[r]!;
    const start = offsets[r]!;
    const end = offsets[r + 1]!;
    for (let k = start; k < end; k++) {
      const n = flat[k]!;
      if (plate[n] === -1) {
        plate[n] = myPlate;
        queue.push(n);
      }
    }
  }

  return { plate, seedRegions, numPlates };
}

/** Pick `k` distinct integers from [0, n) using `rng`. Reservoir-style. */
function pickDistinct(n: number, k: number, rng: Rng): Int32Array {
  const out = new Int32Array(k);
  const seen = new Set<number>();
  let i = 0;
  // Cap retries to avoid infinite loop in degenerate cases (n only slightly > k).
  let attempts = 0;
  const maxAttempts = 20 * k;
  while (i < k && attempts < maxAttempts) {
    attempts++;
    const v = rng.int(n);
    if (seen.has(v)) continue;
    seen.add(v);
    out[i++] = v;
  }
  if (i < k) {
    // Fallback: linear scan for any missing slots.
    for (let v = 0; v < n && i < k; v++) {
      if (!seen.has(v)) {
        out[i++] = v;
        seen.add(v);
      }
    }
  }
  return out;
}
