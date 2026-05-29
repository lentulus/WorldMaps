import { describe, it, expect } from 'vitest';
import {
  iseaForward,
  iseaFaceOf,
  ISEA_NET_WIDTH,
  ISEA_NET_HEIGHT,
} from './isea.js';

describe('iseaForward', () => {
  const H = Math.sqrt(3) / 2;

  it('net extents are 5.5 × 3·√3/2 in unit-edge coords', () => {
    expect(ISEA_NET_WIDTH).toBe(5.5);
    expect(ISEA_NET_HEIGHT).toBeCloseTo(3 * H, 6);
  });

  it('north pole lands at the apex of some top-cap face (y=0, x ∈ {0.5,…,4.5})', () => {
    const p = iseaForward(90, 0);
    expect(p.y).toBeCloseTo(0, 5);
    const capApexes = [0.5, 1.5, 2.5, 3.5, 4.5];
    expect(capApexes.some((ax) => Math.abs(p.x - ax) < 1e-4)).toBe(true);
  });

  it('south pole lands at the apex of some bottom-cap face (y=3·√3/2, x ∈ {1,…,5})', () => {
    const p = iseaForward(-90, 0);
    expect(p.y).toBeCloseTo(3 * H, 5);
    const capApexes = [1, 2, 3, 4, 5];
    expect(capApexes.some((ax) => Math.abs(p.x - ax) < 1e-4)).toBe(true);
  });

  it('north-ring vertex k=0 (lat≈26.57°, lon=0) lies on the cap-equator seam', () => {
    const p = iseaForward(Math.atan(0.5) * 180 / Math.PI, 0);
    // n_0 in face 0's layout sits at (0, H) — top-left vertex of cap 0.
    expect(p.y).toBeCloseTo(H, 4);
    // x depends on face tie-break; should be at a column boundary (an integer).
    expect(Math.abs(p.x - Math.round(p.x))).toBeLessThan(1e-4);
  });

  it('every point projects to a finite (x, y) inside the net bounds (small padding)', () => {
    // sample 200 random points
    for (let i = 0; i < 200; i++) {
      const lat = (Math.random() - 0.5) * 180;
      const lon = Math.random() * 360;
      const p = iseaForward(lat, lon);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(-1e-3);
      expect(p.x).toBeLessThanOrEqual(ISEA_NET_WIDTH + 1e-3);
      expect(p.y).toBeGreaterThanOrEqual(-1e-3);
      expect(p.y).toBeLessThanOrEqual(ISEA_NET_HEIGHT + 1e-3);
    }
  });

  it('iseaFaceOf returns a face index in [0, 19] for every point', () => {
    for (let i = 0; i < 50; i++) {
      const lat = (Math.random() - 0.5) * 180;
      const lon = Math.random() * 360;
      const f = iseaFaceOf(lat, lon);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(20);
    }
  });
});
