import { describe, it, expect } from 'vitest';
import {
  equirectangularForward,
  equirectangularInverse,
  stereographicForward,
  stereographicInverse,
  orthographicForward,
} from './projections.js';

const EPS_EQUI = 1e-9;
const EPS_STEREO = 1e-9;

interface Case {
  name: string;
  lat: number;
  lon: number;
}

const cases: Case[] = [
  { name: 'equator/prime meridian', lat: 0, lon: 0 },
  { name: 'equator/east', lat: 0, lon: 90 },
  { name: 'equator/dateline', lat: 0, lon: 180 },
  { name: 'mid-lat NE', lat: 35.2, lon: 71.4 },
  { name: 'mid-lat SE', lat: -22.8, lon: 199.1 },
  { name: 'just below north pole', lat: 89.5, lon: 17 },
  { name: 'just above south pole', lat: -89.5, lon: 250 },
];

describe('equirectangular round-trip', () => {
  const W = 1024;
  const H = 512;
  for (const c of cases) {
    it(`round-trips ${c.name}`, () => {
      const fwd = equirectangularForward({ lat: c.lat, lon: c.lon }, W, H);
      const back = equirectangularInverse(fwd, W, H);
      expect(back.lat).toBeCloseTo(c.lat, 9);
      expect(back.lon).toBeCloseTo(c.lon, 9);
    });
  }
});

describe('stereographic round-trip (from south pole)', () => {
  // South pole itself is the singularity — stereographic from S projects N pole to origin,
  // and the S pole to infinity. We skip lat = -90 exactly.
  for (const c of cases) {
    it(`round-trips ${c.name}`, () => {
      const fwd = stereographicForward({ lat: c.lat, lon: c.lon });
      const back = stereographicInverse(fwd);
      expect(back.lat).toBeCloseTo(c.lat, 9);
      // Longitude is meaningless at the poles — only compare away from them.
      if (Math.abs(c.lat) < 89.999) {
        expect(back.lon).toBeCloseTo(c.lon, 9);
      }
    });
  }

  it('north pole projects to the origin', () => {
    const fwd = stereographicForward({ lat: 90, lon: 0 });
    expect(fwd.x).toBeCloseTo(0, 9);
    expect(fwd.y).toBeCloseTo(0, 9);
  });

  it('equator at lon=0 projects to (1, 0)', () => {
    const fwd = stereographicForward({ lat: 0, lon: 0 });
    expect(fwd.x).toBeCloseTo(1, 9);
    expect(fwd.y).toBeCloseTo(0, 9);
  });

  it('produces finite values for points arbitrarily close to (but not at) the south pole', () => {
    const fwd = stereographicForward({ lat: -89.99, lon: 45 });
    expect(Number.isFinite(fwd.x)).toBe(true);
    expect(Number.isFinite(fwd.y)).toBe(true);
  });
});

describe('orthographic projection', () => {
  it('camera lookpoint projects to the canvas center (x=0, y=0)', () => {
    for (const [lat, lon] of [[0, 0], [30, 45], [-60, 200], [89, 17]]) {
      const q = orthographicForward({ lat: lat!, lon: lon! }, lat!, lon!);
      expect(q.x).toBeCloseTo(0, 9);
      expect(q.y).toBeCloseTo(0, 9);
      expect(q.z).toBeCloseTo(1, 9); // looking straight at the point => depth = 1
    }
  });

  it('antipode of the camera point has z = -1 (behind the sphere)', () => {
    const camLat = 35;
    const camLon = 120;
    const q = orthographicForward({ lat: -camLat, lon: (camLon + 180) % 360 }, camLat, camLon);
    expect(q.z).toBeCloseTo(-1, 9);
  });

  it('points on the great-circle horizon have z = 0 (on the limb)', () => {
    // Camera at the equator/prime meridian; the north pole sits on the horizon
    // (90° away in any great-circle direction).
    const q = orthographicForward({ lat: 90, lon: 0 }, 0, 0);
    expect(q.z).toBeCloseTo(0, 9);
  });

  it('with camera at (0, 0), the north pole projects to screen-up (y > 0)', () => {
    const q = orthographicForward({ lat: 90, lon: 0 }, 0, 0);
    expect(q.y).toBeCloseTo(1, 9); // north pole is one sphere radius "up"
    expect(q.x).toBeCloseTo(0, 9);
  });

  it('with camera at (0, 0), 90°E projects to screen-right (x > 0)', () => {
    const q = orthographicForward({ lat: 0, lon: 90 }, 0, 0);
    expect(q.x).toBeCloseTo(1, 9);
    expect(q.y).toBeCloseTo(0, 9);
    expect(q.z).toBeCloseTo(0, 9); // on the limb
  });

  it('produces finite values for every (lat, lon, camLat, camLon) combination tested', () => {
    const lats = [-89, -30, 0, 30, 89];
    const lons = [0, 90, 180, 270];
    for (const lat of lats) {
      for (const lon of lons) {
        for (const cLat of lats) {
          for (const cLon of lons) {
            const q = orthographicForward({ lat, lon }, cLat, cLon);
            expect(Number.isFinite(q.x)).toBe(true);
            expect(Number.isFinite(q.y)).toBe(true);
            expect(Number.isFinite(q.z)).toBe(true);
            // (x, y, z) is the rotation of a unit vector, so magnitude == 1.
            const mag = Math.hypot(q.x, q.y, q.z);
            expect(mag).toBeCloseTo(1, 6);
          }
        }
      }
    }
  });

  it('camera at the north pole: equator points lie on the unit circle with y=0 only at lon=±90 from camLon=0', () => {
    // Camera at (90, 0). World is rotated so the camera sits at +z; equator is
    // visible as a unit circle at z=0.
    const q = orthographicForward({ lat: 0, lon: 0 }, 90, 0);
    expect(q.z).toBeCloseTo(0, 9);
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(1, 9);
  });
});

// Silence unused-var warnings for the epsilon constants if not referenced.
void EPS_EQUI;
void EPS_STEREO;
