// Phase 7 acceptance: rivers.
//
// Tests cover:
//   - Non-negativity of every per-edge riverflow value.
//   - Conservation: for each non-sink land cell, outflow on its downhill edge
//     equals (sum of inflow from upstream edges) + (own precipitation), within
//     a float tolerance.
//   - Re-derivability: an independent re-derivation of `riverPresence` from
//     `riverflow` + topology matches the engine's output exactly. This is
//     decision 15's contract — the per-region scalar is a *function* of the
//     canonical per-edge field, not an independently-modeled layer.
//   - Determinism across two runs.

import { describe, it, expect } from 'vitest';
import { runGenerate } from '../generate.js';

function make(n: number, seed = 'rivers-test', ocean = 0.6) {
  return runGenerate({
    seed,
    params: { numRegions: n, samplingMethod: 'fibonacci', numPlates: 8, oceanFraction: ocean },
  });
}

describe('rivers — basic invariants', () => {
  it('every per-edge riverflow value is non-negative and finite', () => {
    const s = make(512);
    let nonzero = 0;
    for (let e = 0; e < s.numEdges; e++) {
      const v = s.riverflow[e]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      if (v > 0) nonzero++;
    }
    // Sanity: a world with land cells and humidity should yield some flow.
    expect(nonzero).toBeGreaterThan(0);
  });

  it('riverPresence values lie in [0, 1] and are finite', () => {
    const s = make(512);
    for (let r = 0; r < s.numRegions; r++) {
      const v = s.riverPresence[r]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('rivers — conservation', () => {
  it('non-source land cells: outflow ≈ inflow + own precipitation', () => {
    const s = make(512, 'conserve-rivers');
    const topo = s.topology!;
    const { offsets, flat } = topo.neighbors;

    // Edge-index lookup parallel to neighbors.flat (same scheme as rivers.ts).
    const edgeIdx = new Map<number, number>();
    for (let e = 0; e < s.numEdges; e++) {
      const a = topo.edges[2 * e]!;
      const b = topo.edges[2 * e + 1]!;
      edgeIdx.set(a * s.numRegions + b, e);
    }
    function lookupEdge(a: number, b: number): number {
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      return edgeIdx.get(lo * s.numRegions + hi)!;
    }

    // Recompute downstream identically to rivers.ts to know each cell's
    // outflow edge / inflow edges.
    const downstream = new Int32Array(s.numRegions).fill(-1);
    for (let r = 0; r < s.numRegions; r++) {
      if (s.elevation[r]! <= 0) continue;
      let bestN = -1;
      let bestE = s.elevation[r]!;
      for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
        const nb = flat[k]!;
        const eN = s.elevation[nb]!;
        if (eN < bestE) {
          bestE = eN;
          bestN = nb;
        }
      }
      downstream[r] = bestN;
    }

    let checked = 0;
    for (let r = 0; r < s.numRegions; r++) {
      if (s.elevation[r]! <= 0) continue;
      const ds = downstream[r]!;
      if (ds < 0) continue; // sink — no outflow expected
      const outflow = s.riverflow[lookupEdge(r, ds)]!;
      // Sum inflow from each neighbor n whose downstream is r.
      let inflow = 0;
      for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
        const nb = flat[k]!;
        if (downstream[nb]! === r) {
          inflow += s.riverflow[lookupEdge(nb, r)]!;
        }
      }
      const precip = s.humidity[r]! * topo.cellArea[r]!;
      // Float32 sum tolerance: 1e-3 relative or 1e-5 absolute.
      const expected = inflow + precip;
      const diff = Math.abs(outflow - expected);
      const tol = Math.max(1e-5, expected * 1e-3);
      expect(diff).toBeLessThanOrEqual(tol);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('rivers — riverPresence re-derivability (decision 15)', () => {
  it('engine output matches an independent re-derivation from riverflow + topology', () => {
    const s = make(512, 'rederive-presence');
    const topo = s.topology!;
    const { offsets, flat } = topo.neighbors;
    const n = s.numRegions;

    // Mirror buildNeighborEdgeIndex from rivers.ts inline.
    const edgeIdx = new Map<number, number>();
    for (let e = 0; e < s.numEdges; e++) {
      const a = topo.edges[2 * e]!;
      const b = topo.edges[2 * e + 1]!;
      edgeIdx.set(a * n + b, e);
    }

    // max incident flow per region.
    const maxIncident = new Float32Array(n);
    let globalMax = 0;
    for (let r = 0; r < n; r++) {
      let m = 0;
      for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
        const nb = flat[k]!;
        const lo = r < nb ? r : nb;
        const hi = r < nb ? nb : r;
        const e = edgeIdx.get(lo * n + hi)!;
        const f = s.riverflow[e]!;
        if (f > m) m = f;
      }
      maxIncident[r] = m;
      if (m > globalMax) globalMax = m;
    }
    const expected = new Float32Array(n);
    if (globalMax > 0) {
      for (let r = 0; r < n; r++) {
        const u = maxIncident[r]! / globalMax;
        expected[r] = u <= 0 ? 0 : Math.pow(u, 0.5);
      }
    }
    expect(s.riverPresence).toEqual(expected);
  });
});

describe('rivers — determinism', () => {
  it('byte-identical across two runs with the same seed', () => {
    const a = make(128, 'gold-rivers');
    const b = make(128, 'gold-rivers');
    expect(a.riverflow).toEqual(b.riverflow);
    expect(a.riverPresence).toEqual(b.riverPresence);
  });
});
