import { describe, it, expect } from 'vitest';
import { fibonacciSphere, greatCircleDistance, latLonToUnit } from './sphere.js';

function makeSphere(n: number): Float32Array {
  const out = new Float32Array(2 * n);
  fibonacciSphere(n, out);
  return out;
}

describe('fibonacciSphere', () => {
  it('writes exactly 2*n entries', () => {
    const n = 128;
    const out = makeSphere(n);
    expect(out.length).toBe(2 * n);
  });

  it('lat ∈ [-90, 90] and lon ∈ [0, 360) for every point', () => {
    const out = makeSphere(2048);
    for (let i = 0; i < 2048; i++) {
      const lat = out[2 * i]!;
      const lon = out[2 * i + 1]!;
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(0);
      expect(lon).toBeLessThan(360);
    }
  });

  it('no NaN, no Infinity', () => {
    const out = makeSphere(1024);
    for (let i = 0; i < out.length; i++) {
      const v = out[i]!;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('is deterministic for the same n', () => {
    const a = makeSphere(256);
    const b = makeSphere(256);
    expect(a).toEqual(b);
  });

  it('has a pairwise minimum great-circle distance lower bound', () => {
    // For n quasi-uniform points on a unit sphere, min distance ≳ c/√n radians.
    // We use a loose lower bound c = 1.0 so this test catches gross failures
    // (e.g. all points at one location, duplicate points) but doesn't flake on
    // legitimate small jitter.
    const n = 256;
    const out = makeSphere(n);
    const expectedLB = 1.0 / Math.sqrt(n);

    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = greatCircleDistance(
          out[2 * i]!,
          out[2 * i + 1]!,
          out[2 * j]!,
          out[2 * j + 1]!,
        );
        if (d < minDist) minDist = d;
      }
    }
    expect(minDist).toBeGreaterThan(expectedLB);
  });

  it('throws on n < 1', () => {
    expect(() => fibonacciSphere(0, new Float32Array(0))).toThrow();
  });

  it('throws on undersized output buffer', () => {
    expect(() => fibonacciSphere(10, new Float32Array(5))).toThrow();
  });
});

describe('greatCircleDistance', () => {
  it('returns 0 for identical points', () => {
    expect(greatCircleDistance(10, 20, 10, 20)).toBeCloseTo(0, 9);
  });

  it('returns π for antipodal points', () => {
    expect(greatCircleDistance(0, 0, 0, 180)).toBeCloseTo(Math.PI, 9);
    expect(greatCircleDistance(90, 0, -90, 0)).toBeCloseTo(Math.PI, 9);
  });

  it('is symmetric', () => {
    const d1 = greatCircleDistance(35, 100, -22, 250);
    const d2 = greatCircleDistance(-22, 250, 35, 100);
    expect(d1).toBeCloseTo(d2, 12);
  });
});

describe('latLonToUnit', () => {
  it('produces a unit vector', () => {
    for (const [lat, lon] of [[0, 0], [45, 90], [-30, 200], [89.9, 17]]) {
      const [x, y, z] = latLonToUnit(lat!, lon!);
      const mag = Math.hypot(x, y, z);
      expect(mag).toBeCloseTo(1, 9);
    }
  });
});
