// Sphere primitives: Fibonacci sampling, great-circle distance, tangent frames.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Generate `n` approximately-uniform points on the unit sphere using the
 * Fibonacci-spiral pattern. Writes results into the provided interleaved
 * Float32Array `out` as [lat0, lon0, lat1, lon1, ...] in degrees,
 * lat ∈ [-90, 90], lon ∈ [0, 360).
 *
 * `out` must have length >= 2 * n.
 */
export function fibonacciSphere(n: number, out: Float32Array): void {
  if (n < 1) throw new Error('n must be >= 1');
  if (out.length < 2 * n) {
    throw new Error(`out too small: need ${2 * n}, have ${out.length}`);
  }

  for (let i = 0; i < n; i++) {
    // z is evenly distributed in [-1 + 1/n, 1 - 1/n] (offset to avoid the poles exactly)
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = GOLDEN_ANGLE * i;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    const lat = Math.asin(z) * RAD2DEG;
    let lon = Math.atan2(y, x) * RAD2DEG;
    if (lon < 0) lon += 360;

    out[2 * i] = lat;
    out[2 * i + 1] = lon;
  }
}

/** Great-circle distance between two lat/lon points (degrees), in radians. */
export function greatCircleDistance(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const aLat = latA * DEG2RAD;
  const bLat = latB * DEG2RAD;
  const dLat = (latB - latA) * DEG2RAD;
  const dLon = (lonB - lonA) * DEG2RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Convert lat/lon (degrees) to a unit-vector point on the sphere. */
export function latLonToUnit(lat: number, lon: number): [number, number, number] {
  const phi = lat * DEG2RAD;
  const lam = lon * DEG2RAD;
  const c = Math.cos(phi);
  return [c * Math.cos(lam), c * Math.sin(lam), Math.sin(phi)];
}
