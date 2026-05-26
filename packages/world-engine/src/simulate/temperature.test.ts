import { describe, it, expect } from 'vitest';
import { assignTemperature } from './temperature.js';
import { buildTopology } from '../geom/voronoi.js';
import { fibonacciSphere } from '../geom/sphere.js';

function flatWorld(n: number) {
  const latlon = new Float32Array(2 * n);
  fibonacciSphere(n, latlon);
  const topology = buildTopology(latlon, n);
  const elevation = new Float32Array(n); // all zero
  return { latlon, elevation, topology };
}

describe('temperature — bounds & finiteness', () => {
  it('stays in [-60, 40] for typical worlds (sea level + reasonable mountains)', () => {
    const { latlon, topology } = flatWorld(256);
    const elev = new Float32Array(256);
    for (let r = 0; r < 256; r++) elev[r] = ((r % 17) / 17) * 0.6; // up to 0.6
    const t = assignTemperature(256, latlon, elev, topology);
    for (let r = 0; r < 256; r++) {
      expect(t[r]!).toBeGreaterThanOrEqual(-60);
      expect(t[r]!).toBeLessThanOrEqual(40);
    }
  });

  it('contains no NaN or Infinity', () => {
    const { latlon, elevation, topology } = flatWorld(128);
    const t = assignTemperature(128, latlon, elevation, topology);
    for (let r = 0; r < 128; r++) expect(Number.isFinite(t[r]!)).toBe(true);
  });
});

describe('temperature — monotone in |lat| on a flat world (decision-10/13 symmetry)', () => {
  it('binned mean temperature decreases as |lat| increases', () => {
    const n = 2048;
    const { latlon, elevation, topology } = flatWorld(n);
    const t = assignTemperature(n, latlon, elevation, topology);

    // 9 lat bins: 0–10, 10–20, ..., 80–90. Compute mean temperature in each.
    const NUM_BINS = 9;
    const sums = new Float64Array(NUM_BINS);
    const counts = new Int32Array(NUM_BINS);
    for (let r = 0; r < n; r++) {
      const a = Math.abs(latlon[2 * r]!);
      const bin = Math.min(NUM_BINS - 1, Math.floor(a / 10));
      sums[bin]! += t[r]!;
      counts[bin]!++;
    }
    const means: number[] = [];
    for (let b = 0; b < NUM_BINS; b++) {
      if (counts[b]! > 0) means.push(sums[b]! / counts[b]!);
    }
    for (let i = 1; i < means.length; i++) {
      expect(means[i]!).toBeLessThan(means[i - 1]! + 1e-6);
    }
  });
});

describe('temperature — determinism', () => {
  it('two runs from the same inputs are byte-identical', () => {
    const { latlon, elevation, topology } = flatWorld(128);
    const a = assignTemperature(128, latlon, elevation, topology);
    const b = assignTemperature(128, latlon, elevation, topology);
    expect(a).toEqual(b);
  });
});
