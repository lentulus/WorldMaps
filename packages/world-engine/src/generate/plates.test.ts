import { describe, it, expect } from 'vitest';
import { assignPlates } from './plates.js';
import { fibonacciSphere } from '../geom/sphere.js';
import { buildTopology } from '../geom/voronoi.js';
import { createRng } from '../rng.js';

function setup(n: number, k: number) {
  const latlon = new Float32Array(2 * n);
  fibonacciSphere(n, latlon);
  const topology = buildTopology(latlon, n);
  const rng = createRng('plates-test');
  return assignPlates(n, k, topology, rng);
}

describe('assignPlates', () => {
  it('assigns a plate id to every region (no -1)', () => {
    const { plate } = setup(256, 8);
    for (let i = 0; i < 256; i++) {
      expect(plate[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses exactly numPlates distinct plate ids', () => {
    const { plate, numPlates } = setup(256, 8);
    const used = new Set(Array.from(plate));
    expect(numPlates).toBe(8);
    expect(used.size).toBe(8);
    expect([...used].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('seed regions are distinct and within bounds', () => {
    const { seedRegions } = setup(128, 6);
    const set = new Set(Array.from(seedRegions));
    expect(set.size).toBe(6);
    for (const v of seedRegions) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(128);
    }
  });

  it('is deterministic for the same RNG seed', () => {
    const a = setup(128, 5);
    const b = setup(128, 5);
    expect(a.plate).toEqual(b.plate);
    expect(a.seedRegions).toEqual(b.seedRegions);
  });

  it('rejects numPlates > numRegions', () => {
    expect(() => {
      const latlon = new Float32Array(2 * 16);
      fibonacciSphere(16, latlon);
      const topology = buildTopology(latlon, 16);
      const rng = createRng('x');
      assignPlates(16, 32, topology, rng);
    }).toThrow();
  });
});
