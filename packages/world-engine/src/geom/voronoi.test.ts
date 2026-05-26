import { describe, it, expect } from 'vitest';
import { buildTopology, cellSphericalArea } from './voronoi.js';
import { fibonacciSphere } from './sphere.js';

function makeTopology(n: number) {
  const latlon = new Float32Array(2 * n);
  fibonacciSphere(n, latlon);
  const topology = buildTopology(latlon, n);
  return { latlon, topology };
}

function neighborsOf(offsets: Int32Array, flat: Int32Array, i: number): number[] {
  const start = offsets[i]!;
  const end = offsets[i + 1]!;
  return Array.from(flat.subarray(start, end));
}

describe('buildTopology — neighbor invariants', () => {
  it('every region has >= 3 neighbors (for N >= 64)', () => {
    const { topology } = makeTopology(64);
    const { offsets } = topology.neighbors;
    for (let i = 0; i < 64; i++) {
      const deg = offsets[i + 1]! - offsets[i]!;
      expect(deg).toBeGreaterThanOrEqual(3);
    }
  });

  it('no region has a null/undefined neighbor (south-pole closure regression)', () => {
    const { topology } = makeTopology(128);
    const { flat } = topology.neighbors;
    for (let k = 0; k < flat.length; k++) {
      const v = flat[k]!;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(128);
    }
  });

  it('adjacency is symmetric: j in neighbors(i) <=> i in neighbors(j)', () => {
    const { topology } = makeTopology(64);
    const { offsets, flat } = topology.neighbors;
    for (let i = 0; i < 64; i++) {
      for (const j of neighborsOf(offsets, flat, i)) {
        expect(neighborsOf(offsets, flat, j)).toContain(i);
      }
    }
  });

  it('edge count equals number of unique unordered adjacencies', () => {
    const { topology } = makeTopology(128);
    const { offsets } = topology.neighbors;
    let directed = 0;
    for (let i = 0; i < 128; i++) {
      directed += offsets[i + 1]! - offsets[i]!;
    }
    expect(topology.numEdges).toBe(directed / 2);
    expect(topology.edges.length).toBe(2 * topology.numEdges);
  });

  it('every edge entry references valid region ids', () => {
    const { topology } = makeTopology(64);
    for (let e = 0; e < topology.numEdges; e++) {
      const a = topology.edges[2 * e]!;
      const b = topology.edges[2 * e + 1]!;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(64);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(64);
      expect(a).not.toBe(b);
    }
  });
});

describe('buildTopology — cell vertices', () => {
  it('every cell has >= 3 vertices (closed polygon)', () => {
    const { topology } = makeTopology(64);
    const { offsets } = topology.cellVertices;
    for (let i = 0; i < 64; i++) {
      const floats = offsets[i + 1]! - offsets[i]!;
      const verts = floats / 2;
      expect(verts).toBeGreaterThanOrEqual(3);
    }
  });

  it('cell-vertex floats are finite', () => {
    const { topology } = makeTopology(64);
    const { flat } = topology.cellVertices;
    for (let k = 0; k < flat.length; k++) {
      expect(Number.isFinite(flat[k]!)).toBe(true);
    }
  });
});

describe('buildTopology — spherical area sum', () => {
  it('Σ cell areas ≈ 4π within tolerance (N=128)', () => {
    const { topology } = makeTopology(128);
    let total = 0;
    for (let i = 0; i < 128; i++) {
      total += cellSphericalArea(topology, i);
    }
    const FOUR_PI = 4 * Math.PI;
    // 5% tolerance: cells near the south pole are clipped against the bbox
    // and slightly over- or under-estimated. Acceptance is that we're in the
    // right ballpark, not exact.
    expect(total).toBeGreaterThan(FOUR_PI * 0.95);
    expect(total).toBeLessThan(FOUR_PI * 1.05);
  });

  it('Σ cell areas ≈ 4π within tolerance (N=512)', () => {
    const { topology } = makeTopology(512);
    let total = 0;
    for (let i = 0; i < 512; i++) {
      total += cellSphericalArea(topology, i);
    }
    const FOUR_PI = 4 * Math.PI;
    expect(total).toBeGreaterThan(FOUR_PI * 0.98);
    expect(total).toBeLessThan(FOUR_PI * 1.02);
  });
});

describe('buildTopology — determinism', () => {
  it('same input produces byte-identical neighbor flat array', () => {
    const { topology: a } = makeTopology(64);
    const { topology: b } = makeTopology(64);
    expect(a.neighbors.offsets).toEqual(b.neighbors.offsets);
    expect(a.neighbors.flat).toEqual(b.neighbors.flat);
    expect(a.edges).toEqual(b.edges);
  });
});
