// Rivers pass.
//
// Two outputs, per decision 15 (dual exposure):
//   - `riverflow`: per-edge scalar (length = numEdges). The canonical, linear
//     river data. Conserves mass: outflow on the downhill edge of a non-sink
//     land cell equals (own precipitation) + (sum of inflow from upstream
//     edges).
//   - `riverPresence`: per-region scalar in [0, 1] (length = numRegions). A
//     convenience field for consumers that don't want to walk the edge graph.
//     Derived deterministically from `riverflow` and topology — the test
//     re-derives it independently and compares.
//
// Algorithm (D8-style on the Voronoi mesh):
//   1. Each land cell's "downstream" target is its lowest neighbor strictly
//      lower than itself. Cells with no strictly-lower neighbor are sinks
//      (depressions) and emit no outflow in v1 — water simply disappears.
//      Ocean cells terminate flow (precipitation routed *into* them is
//      delivered on the boundary edge; they have no further outflow).
//   2. Precipitation per land cell is `humidity[r] * cellArea[r]` — this gives
//      a physically-shaped distribution (wetter, larger cells produce more
//      runoff) without committing to a real-world flux unit.
//   3. Process cells in order of *decreasing elevation*. For each cell we
//      know all upstream contributions have already been written into the
//      relevant edges; sum them, add the cell's own precipitation, and
//      deposit the total on the cell's outflow edge.
//
// This produces a strict accumulator: river flow grows monotonically along
// the downhill chain.

import type { Topology } from '../geom/voronoi.js';

export interface AssignRiversResult {
  /** Per-edge flow, length = topology.numEdges. */
  readonly riverflow: Float32Array;
  /** Per-region presence scalar in [0, 1], length = numRegions. */
  readonly riverPresence: Float32Array;
}

export interface AssignRiversOptions {
  /** Power applied to the normalized presence ramp. <1 emphasises tributaries,
   *  >1 emphasises major rivers. Default 0.5 (sqrt — broadens the spread). */
  readonly presenceGamma?: number;
}

export function assignRivers(
  numRegions: number,
  elevation: Float32Array,
  humidity: Float32Array,
  topology: Topology,
  options: AssignRiversOptions = {},
): AssignRiversResult {
  const gamma = options.presenceGamma ?? 0.5;
  const { neighbors, edges, numEdges, cellArea } = topology;
  const nOffsets = neighbors.offsets;
  const nFlat = neighbors.flat;

  const riverflow = new Float32Array(numEdges);

  // Parallel array to neighbors.flat: edge index for the (r, neighbor) pair.
  const neighborEdgeIdx = buildNeighborEdgeIndex(numRegions, neighbors, edges, numEdges);

  // Determine each land cell's downstream neighbor (-1 if none / sink / ocean).
  const downstream = new Int32Array(numRegions).fill(-1);
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r]! <= 0) continue;
    let bestN = -1;
    let bestE = elevation[r]!;
    for (let k = nOffsets[r]!; k < nOffsets[r + 1]!; k++) {
      const nb = nFlat[k]!;
      const eN = elevation[nb]!;
      if (eN < bestE) {
        bestE = eN;
        bestN = nb;
      }
    }
    downstream[r] = bestN;
  }

  // Walking order: land cells sorted by decreasing elevation.
  const landCells: number[] = [];
  for (let r = 0; r < numRegions; r++) {
    if (elevation[r]! > 0) landCells.push(r);
  }
  landCells.sort((a, b) => elevation[b]! - elevation[a]!);

  // Per-cell accumulated flow passing through cell r before it spills downstream.
  // Includes r's own precipitation + everything that drained into r from higher cells.
  const throughflow = new Float32Array(numRegions);

  for (const r of landCells) {
    const precip = humidity[r]! * cellArea[r]!;
    const flowAtR = throughflow[r]! + precip;
    const ds = downstream[r]!;
    if (ds < 0) continue; // sink: water disappears in v1

    // Find the edge index for (r, ds).
    let edgeIdx = -1;
    for (let k = nOffsets[r]!; k < nOffsets[r + 1]!; k++) {
      if (nFlat[k]! === ds) {
        edgeIdx = neighborEdgeIdx[k]!;
        break;
      }
    }
    if (edgeIdx >= 0) {
      riverflow[edgeIdx] = flowAtR;
    }

    // Propagate to the downstream cell only if it's land — ocean is a terminator.
    if (elevation[ds]! > 0) {
      throughflow[ds] = throughflow[ds]! + flowAtR;
    }
  }

  // riverPresence: max incident riverflow per cell, then normalize to [0,1]
  // with a γ ramp so tributaries remain visible alongside trunk rivers.
  const maxIncident = new Float32Array(numRegions);
  let globalMax = 0;
  for (let r = 0; r < numRegions; r++) {
    let m = 0;
    for (let k = nOffsets[r]!; k < nOffsets[r + 1]!; k++) {
      const e = neighborEdgeIdx[k]!;
      const f = riverflow[e]!;
      if (f > m) m = f;
    }
    maxIncident[r] = m;
    if (m > globalMax) globalMax = m;
  }
  const riverPresence = new Float32Array(numRegions);
  if (globalMax > 0) {
    for (let r = 0; r < numRegions; r++) {
      const u = maxIncident[r]! / globalMax;
      riverPresence[r] = u <= 0 ? 0 : Math.pow(u, gamma);
    }
  }

  return { riverflow, riverPresence };
}

/** Build a parallel array to `neighbors.flat` giving the edge index for each
 *  (cell, neighbor) pair. Edges in `topology.edges` are stored canonically as
 *  (min, max), so we hash on `min*N + max`. */
function buildNeighborEdgeIndex(
  numRegions: number,
  neighbors: Topology['neighbors'],
  edges: Int32Array,
  numEdges: number,
): Int32Array {
  const out = new Int32Array(neighbors.flat.length);
  const map = new Map<number, number>();
  for (let e = 0; e < numEdges; e++) {
    const a = edges[2 * e]!;
    const b = edges[2 * e + 1]!;
    map.set(a * numRegions + b, e);
  }
  const { offsets, flat } = neighbors;
  for (let r = 0; r < numRegions; r++) {
    for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
      const n = flat[k]!;
      const a = r < n ? r : n;
      const b = r < n ? n : r;
      const e = map.get(a * numRegions + b);
      out[k] = e === undefined ? -1 : e;
    }
  }
  return out;
}
