// End-to-end Phase 6 acceptance tests against the wired-up engine.
// Phase 6 plan tests: bounds across the field, no NaN/Infinity, golden-master
// determinism on weather arrays.

import { describe, it, expect } from 'vitest';
import { runGenerate } from '../generate.js';

function make(n: number, seed = 'weather-test') {
  return runGenerate({
    seed,
    params: { numRegions: n, samplingMethod: 'fibonacci', numPlates: 8 },
  });
}

describe('weather — bounds & finiteness across the full pipeline', () => {
  it('temperature finite and inside [-60, 40] (after diffusion smoothing)', () => {
    const s = make(512);
    for (let r = 0; r < s.numRegions; r++) {
      const v = s.temperature[r]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-60);
      expect(v).toBeLessThanOrEqual(40);
    }
  });

  it('humidity finite and inside [0, 1]', () => {
    const s = make(512);
    for (let r = 0; r < s.numRegions; r++) {
      const v = s.humidity[r]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('clouds finite and inside [0, 1]', () => {
    const s = make(512);
    for (let r = 0; r < s.numRegions; r++) {
      const v = s.clouds[r]!;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('wind components finite at every region', () => {
    const s = make(256);
    for (let r = 0; r < s.numRegions; r++) {
      expect(Number.isFinite(s.wind[2 * r]!)).toBe(true);
      expect(Number.isFinite(s.wind[2 * r + 1]!)).toBe(true);
    }
  });
});

describe('weather — coupling sanity', () => {
  it('ocean cells average higher humidity than land cells', () => {
    const s = make(1024);
    let oceanSum = 0;
    let oceanCount = 0;
    let landSum = 0;
    let landCount = 0;
    for (let r = 0; r < s.numRegions; r++) {
      if (s.elevation[r]! <= 0) {
        oceanSum += s.humidity[r]!;
        oceanCount++;
      } else {
        landSum += s.humidity[r]!;
        landCount++;
      }
    }
    const oceanMean = oceanSum / oceanCount;
    const landMean = landSum / landCount;
    expect(oceanMean).toBeGreaterThan(landMean);
  });
});

describe('weather — golden-master determinism', () => {
  it('weather arrays byte-identical across two runs (N=128, seed=fixed)', () => {
    const a = make(128, 'gold-weather');
    const b = make(128, 'gold-weather');
    expect(a.temperature).toEqual(b.temperature);
    expect(a.humidity).toEqual(b.humidity);
    expect(a.clouds).toEqual(b.clouds);
    expect(a.wind).toEqual(b.wind);
  });

  it('different seed produces different humidity (drives off different elevation)', () => {
    const a = make(128, 'wA');
    const b = make(128, 'wB');
    expect(a.humidity).not.toEqual(b.humidity);
  });
});
