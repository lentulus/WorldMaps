// Area-weighted neighbor diffusion. One forward step of a discrete Laplacian
// on the Voronoi graph where each neighbor contribution is weighted by its
// spherical cell area (steradians, precomputed on Topology). For a uniform
// input field this returns the same field — that's the invariant
// distinguishing a correct kernel from naive 1/d² or fixed-weight forms that
// drift near the poles (decision 13).
//
//   next[r] = (1 - alpha) * curr[r] + alpha * Σ_n (A[n] * curr[n]) / Σ_n A[n]
//
// Used by humidity and clouds; reusable by future scalar fields.

import type { Topology } from '../geom/voronoi.js';

/**
 * Perform one area-weighted diffusion step into `out`. Does not modify `curr`.
 * `alpha` is the blend toward the neighbor average; typical range 0.05–0.3.
 */
export function areaWeightedDiffuseStep(
  curr: Float32Array,
  out: Float32Array,
  topology: Topology,
  alpha: number,
): void {
  const { neighbors, cellArea } = topology;
  const { offsets, flat } = neighbors;
  const n = curr.length;
  if (out.length !== n) throw new Error('out length must match curr length');
  if (cellArea.length !== n) throw new Error('cellArea length must match field length');

  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const oneMinus = 1 - a;

  for (let r = 0; r < n; r++) {
    let sumWeighted = 0;
    let sumWeight = 0;
    for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
      const nb = flat[k]!;
      const w = cellArea[nb]!;
      sumWeighted += w * curr[nb]!;
      sumWeight += w;
    }
    const nbAvg = sumWeight > 0 ? sumWeighted / sumWeight : curr[r]!;
    out[r] = oneMinus * curr[r]! + a * nbAvg;
  }
}

/** Run `steps` diffusion steps using a ping-pong buffer. Returns the array
 *  that holds the final result (either `field` or `scratch`); the other is
 *  left in an intermediate state. */
export function areaWeightedDiffuse(
  field: Float32Array,
  scratch: Float32Array,
  topology: Topology,
  alpha: number,
  steps: number,
): Float32Array {
  let src = field;
  let dst = scratch;
  for (let i = 0; i < steps; i++) {
    areaWeightedDiffuseStep(src, dst, topology, alpha);
    const tmp = src;
    src = dst;
    dst = tmp;
  }
  return src;
}
