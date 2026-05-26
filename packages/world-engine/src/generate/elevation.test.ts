import { describe, it, expect } from 'vitest';
import { runGenerate } from '../generate.js';

function make(
  n: number,
  seed = 'elev-test',
  numPlates = 8,
  oceanFraction?: number,
) {
  return runGenerate({
    seed,
    params:
      oceanFraction !== undefined
        ? { numRegions: n, samplingMethod: 'fibonacci', numPlates, oceanFraction }
        : { numRegions: n, samplingMethod: 'fibonacci', numPlates },
  });
}

function countOcean(elevation: Float32Array): number {
  let c = 0;
  for (let i = 0; i < elevation.length; i++) if (elevation[i]! < 0) c++;
  return c;
}

describe('elevation', () => {
  it('stays in [-1, 1] for every region', () => {
    const { elevation } = make(512);
    for (let i = 0; i < elevation.length; i++) {
      const v = elevation[i]!;
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('contains no NaN or Infinity', () => {
    const { elevation } = make(256);
    for (let i = 0; i < elevation.length; i++) {
      expect(Number.isFinite(elevation[i]!)).toBe(true);
    }
  });

  it('spans both signs (some land, some sea) for typical worlds', () => {
    const { elevation } = make(512);
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < elevation.length; i++) {
      if (elevation[i]! > 0) pos++;
      if (elevation[i]! < 0) neg++;
    }
    expect(pos).toBeGreaterThan(0);
    expect(neg).toBeGreaterThan(0);
  });
});

describe('terrain — golden-master determinism', () => {
  it('plate + elevation byte-identical across runs (N=128, seed=fixed)', () => {
    const a = make(128, 'gold', 8);
    const b = make(128, 'gold', 8);
    expect(a.plate).toEqual(b.plate);
    expect(a.elevation).toEqual(b.elevation);
  });

  it('different seed produces different elevation', () => {
    const a = make(128, 'seedA', 8);
    const b = make(128, 'seedB', 8);
    expect(a.elevation).not.toEqual(b.elevation);
  });

  it('different numPlates produces different plate assignment', () => {
    const a = make(128, 'np', 4);
    const b = make(128, 'np', 12);
    expect(a.plate).not.toEqual(b.plate);
  });
});

describe('elevation — oceanFraction targeting', () => {
  it('hits the requested ocean fraction within ±1 region (0.30)', () => {
    const n = 512;
    const { elevation } = make(n, 'ocean-30', 8, 0.30);
    const ocean = countOcean(elevation);
    expect(ocean).toBeGreaterThanOrEqual(Math.floor(n * 0.30) - 1);
    expect(ocean).toBeLessThanOrEqual(Math.floor(n * 0.30) + 1);
  });

  it('hits the requested ocean fraction within ±1 region (0.65)', () => {
    const n = 512;
    const { elevation } = make(n, 'ocean-65', 8, 0.65);
    const ocean = countOcean(elevation);
    expect(ocean).toBeGreaterThanOrEqual(Math.floor(n * 0.65) - 1);
    expect(ocean).toBeLessThanOrEqual(Math.floor(n * 0.65) + 1);
  });

  it('hits the requested ocean fraction within ±1 region (0.90)', () => {
    const n = 512;
    const { elevation } = make(n, 'ocean-90', 8, 0.90);
    const ocean = countOcean(elevation);
    expect(ocean).toBeGreaterThanOrEqual(Math.floor(n * 0.90) - 1);
    expect(ocean).toBeLessThanOrEqual(Math.floor(n * 0.90) + 1);
  });

  it('oceanFraction=1 produces no land (all elevation ≤ 0)', () => {
    const { elevation } = make(256, 'all-water', 8, 1.0);
    for (let i = 0; i < elevation.length; i++) {
      expect(elevation[i]!).toBeLessThanOrEqual(0);
    }
  });

  it('oceanFraction=0 produces no ocean (all elevation ≥ 0)', () => {
    const { elevation } = make(256, 'no-water', 8, 0.0);
    for (let i = 0; i < elevation.length; i++) {
      expect(elevation[i]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('changing oceanFraction changes the elevation field', () => {
    const a = make(256, 'cmp', 8, 0.30);
    const b = make(256, 'cmp', 8, 0.80);
    expect(a.elevation).not.toEqual(b.elevation);
  });
});

describe('terrain — boundary smoke test', () => {
  it('plate-boundary regions have neighbors on a different plate', () => {
    const state = make(256, 'bnd', 10);
    if (!state.topology) throw new Error('no topology');
    const { offsets, flat } = state.topology.neighbors;
    let boundaryFound = false;
    for (let r = 0; r < state.numRegions && !boundaryFound; r++) {
      for (let k = offsets[r]!; k < offsets[r + 1]!; k++) {
        const n = flat[k]!;
        if (state.plate[r] !== state.plate[n]) {
          boundaryFound = true;
          break;
        }
      }
    }
    expect(boundaryFound).toBe(true);
  });
});
