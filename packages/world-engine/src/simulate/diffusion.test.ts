import { describe, it, expect } from 'vitest';
import { areaWeightedDiffuseStep, areaWeightedDiffuse } from './diffusion.js';
import { buildTopology } from '../geom/voronoi.js';
import { fibonacciSphere } from '../geom/sphere.js';

function makeTopology(n: number) {
  const latlon = new Float32Array(2 * n);
  fibonacciSphere(n, latlon);
  return buildTopology(latlon, n);
}

describe('area-weighted diffusion', () => {
  it('preserves a constant field after one step (decision-13 invariant)', () => {
    const n = 256;
    const topology = makeTopology(n);
    const curr = new Float32Array(n);
    curr.fill(0.42);
    const next = new Float32Array(n);
    areaWeightedDiffuseStep(curr, next, topology, 0.25);
    for (let r = 0; r < n; r++) {
      expect(next[r]!).toBeCloseTo(0.42, 6);
    }
  });

  it('preserves a constant field after many steps (poles included)', () => {
    const n = 512;
    const topology = makeTopology(n);
    const field = new Float32Array(n);
    field.fill(0.7);
    const scratch = new Float32Array(n);
    const result = areaWeightedDiffuse(field, scratch, topology, 0.3, 50);
    for (let r = 0; r < n; r++) {
      expect(result[r]!).toBeCloseTo(0.7, 5);
    }
  });

  it('alpha=0 is the identity (no neighbor mixing)', () => {
    const n = 64;
    const topology = makeTopology(n);
    const curr = new Float32Array(n);
    for (let r = 0; r < n; r++) curr[r] = r * 0.01;
    const next = new Float32Array(n);
    areaWeightedDiffuseStep(curr, next, topology, 0);
    for (let r = 0; r < n; r++) expect(next[r]!).toBe(curr[r]!);
  });

  it('smooths an impulse: peak shrinks, neighbors rise', () => {
    const n = 128;
    const topology = makeTopology(n);
    const curr = new Float32Array(n);
    const seed = 17;
    curr[seed] = 1.0;
    const next = new Float32Array(n);
    areaWeightedDiffuseStep(curr, next, topology, 0.5);
    expect(next[seed]!).toBeLessThan(1.0);
    const { offsets, flat } = topology.neighbors;
    let anyNeighborRose = false;
    for (let k = offsets[seed]!; k < offsets[seed + 1]!; k++) {
      const nb = flat[k]!;
      if (next[nb]! > 0) anyNeighborRose = true;
    }
    expect(anyNeighborRose).toBe(true);
  });
});
