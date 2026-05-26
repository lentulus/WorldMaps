import { describe, it, expect } from 'vitest';
import {
  assignWind,
  cartesianToTangentWind,
  windMagnitude,
} from './wind.js';
import { fibonacciSphere } from '../geom/sphere.js';

describe('wind — tangent-frame storage (decision 10)', () => {
  it('a 3D eastward wind has constant magnitude across all latitudes', () => {
    // Synthetic field: a planet-wide eastward wind in 3D Cartesian space at
    // every region. After projection to the local tangent frame the stored
    // magnitude must equal the input magnitude at every latitude — including
    // near the poles, where [dlat, dlon] storage would diverge.
    const n = 256;
    const latlon = new Float32Array(2 * n);
    fibonacciSphere(n, latlon);

    const U = 12; // m/s
    for (let r = 0; r < n; r++) {
      const lat = latlon[2 * r]!;
      const lon = latlon[2 * r + 1]!;
      // Eastward unit vector in Cartesian at this lon: (-sin λ, cos λ, 0).
      const lam = (lon * Math.PI) / 180;
      const vx = -Math.sin(lam) * U;
      const vy = Math.cos(lam) * U;
      const vz = 0;
      const [e, north] = cartesianToTangentWind(vx, vy, vz, lat, lon);
      const mag = Math.hypot(e, north);
      // The east component should be U exactly (modulo float drift), north 0.
      expect(e).toBeCloseTo(U, 4);
      expect(north).toBeCloseTo(0, 4);
      expect(mag).toBeCloseTo(U, 4);
    }
  });

  it('a uniform eastward tangent-frame field has constant magnitude (storage invariant)', () => {
    const n = 64;
    const wind = new Float32Array(2 * n);
    for (let r = 0; r < n; r++) {
      wind[2 * r] = 7; // east
      wind[2 * r + 1] = 0; // north
    }
    for (let r = 0; r < n; r++) {
      expect(windMagnitude(wind, r)).toBeCloseTo(7, 6);
    }
  });

  it('cartesianToTangentWind projects pure-vertical (z) wind to zero at the equator', () => {
    // At the equator the local east basis is in the xy-plane and the north
    // basis is +z. A pure +z wind should have east=0 and north=|v|.
    const [e, n] = cartesianToTangentWind(0, 0, 5, 0, 30);
    expect(e).toBeCloseTo(0, 6);
    expect(n).toBeCloseTo(5, 6);
  });
});

describe('wind — banded zonal pattern', () => {
  it('produces easterlies in the tropics and westerlies in mid-latitudes', () => {
    const n = 512;
    const latlon = new Float32Array(2 * n);
    fibonacciSphere(n, latlon);
    const wind = assignWind(n, latlon);

    let tropicalEastSum = 0;
    let tropicalCount = 0;
    let midEastSum = 0;
    let midCount = 0;
    for (let r = 0; r < n; r++) {
      const lat = latlon[2 * r]!;
      const a = Math.abs(lat);
      if (a < 20) {
        tropicalEastSum += wind[2 * r]!;
        tropicalCount++;
      } else if (a > 40 && a < 60) {
        midEastSum += wind[2 * r]!;
        midCount++;
      }
    }
    const tropicalMean = tropicalEastSum / tropicalCount;
    const midMean = midEastSum / midCount;
    expect(tropicalMean).toBeLessThan(0); // easterlies
    expect(midMean).toBeGreaterThan(0); // westerlies
  });

  it('contains no NaN or Infinity', () => {
    const n = 256;
    const latlon = new Float32Array(2 * n);
    fibonacciSphere(n, latlon);
    const wind = assignWind(n, latlon);
    for (let i = 0; i < wind.length; i++) {
      expect(Number.isFinite(wind[i]!)).toBe(true);
    }
  });
});
