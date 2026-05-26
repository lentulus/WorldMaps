// Projections. All inputs in DEGREES, lat ∈ [-90, 90], lon ∈ [0, 360).

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

// --- Equirectangular -------------------------------------------------------
// Maps lat ∈ [-90, 90] → y ∈ [0, height], lon ∈ [0, 360) → x ∈ [0, width).
// y=0 is the north pole; y=height is the south pole. (Screen-space convention.)

export function equirectangularForward(p: LatLon, width: number, height: number): Point2D {
  return {
    x: (p.lon / 360) * width,
    y: ((90 - p.lat) / 180) * height,
  };
}

export function equirectangularInverse(p: Point2D, width: number, height: number): LatLon {
  return {
    lat: 90 - (p.y / height) * 180,
    lon: (p.x / width) * 360,
  };
}

// --- Orthographic (globe view) --------------------------------------------
// Camera sits at (cameraLat, cameraLon) on the unit sphere, looking at the
// origin. North is up. Returns coordinates in unit-sphere space: x ∈ [-1, 1],
// y ∈ [-1, 1] (positive = up on screen), z = depth (>= 0 means the point is on
// the hemisphere facing the camera; < 0 means behind).

export interface OrthoPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function orthographicForward(
  p: LatLon,
  cameraLat: number,
  cameraLon: number,
): OrthoPoint {
  const phi = p.lat * DEG2RAD;
  const lam = p.lon * DEG2RAD;
  const cosPhi = Math.cos(phi);
  const px = cosPhi * Math.cos(lam);
  const py = cosPhi * Math.sin(lam);
  const pz = Math.sin(phi);

  const cPhi = cameraLat * DEG2RAD;
  const cLam = cameraLon * DEG2RAD;
  const cosCPhi = Math.cos(cPhi);
  const sinCPhi = Math.sin(cPhi);
  const cosCLam = Math.cos(cLam);
  const sinCLam = Math.sin(cLam);

  // ENU basis at the camera point. east×north = outward (right-handed).
  const ex = -sinCLam;
  const ey = cosCLam;
  // ez = 0

  const nx = -sinCPhi * cosCLam;
  const ny = -sinCPhi * sinCLam;
  const nz = cosCPhi;

  const ox = cosCPhi * cosCLam;
  const oy = cosCPhi * sinCLam;
  const oz = sinCPhi;

  return {
    x: px * ex + py * ey,
    y: px * nx + py * ny + pz * nz,
    z: px * ox + py * oy + pz * oz,
  };
}

// --- Stereographic from south pole ----------------------------------------
// Projects from (0, 0, -1) onto the plane z = 0. Maps the entire sphere
// except the south pole into the plane. Used by the engine to compute Voronoi
// in 2D before inverting back to lat/lon (per the reference implementation).

export function stereographicForward(p: LatLon): Point2D {
  const lat = p.lat * DEG2RAD;
  const lon = p.lon * DEG2RAD;
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  // Project from (0, 0, -1) onto z = 0:
  // (x, y, z) → (x / (1 + z), y / (1 + z))
  const denom = 1 + z;
  return { x: x / denom, y: y / denom };
}

export function stereographicInverse(p: Point2D): LatLon {
  const r2 = p.x * p.x + p.y * p.y;
  const denom = 1 + r2;
  const x = (2 * p.x) / denom;
  const y = (2 * p.y) / denom;
  const z = (1 - r2) / denom;
  const lat = Math.asin(z) * RAD2DEG;
  let lon = Math.atan2(y, x) * RAD2DEG;
  if (lon < 0) lon += 360;
  return { lat, lon };
}
