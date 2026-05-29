// Snyder-style Icosahedral Equal-Area (ISEA) projection. The 20 spherical
// triangles of the icosahedron are mapped to 20 planar equilateral triangles
// arranged in a 4-row "Traveller wargame net":
//
//   row 1 (y ∈ [0,   h]): 5 top-cap triangles,  point up
//   row 2 (y ∈ [h,  2h]): 5 north-equator,      point down  ─┐ continuous
//   row 3 (y ∈ [h,  2h]): 5 south-equator,      point up    ─┘ zigzag strip
//   row 4 (y ∈ [2h, 3h]): 5 bottom-cap,         point down
//
// where h = √3/2 is the height of a unit equilateral triangle. Layout extents
// are x ∈ [0, 5], y ∈ [0, 3h] in unit-edge coordinates; callers scale that
// into pixel space.
//
// Within-face transform is *gnomonic-barycentric*: project the input direction
// onto the planar face through 3-vertex barycentric coordinates (= gnomonic
// projection onto the face plane), then interpolate within the planar
// equilateral triangle in net space. This is approximate equal-area — exact at
// vertices and centroid, ~few % off elsewhere. Going to *exact* Snyder
// requires the radial angular correction from his 1992 paper; reserved for if
// precision ever becomes load-bearing. Visualization-grade is fine for now.

const DEG2RAD = Math.PI / 180;
const SQRT3_OVER_2 = Math.sqrt(3) / 2;

// --- icosahedron geometry --------------------------------------------------

const ATAN_HALF = Math.atan(0.5); // northern/southern ring latitude

/** 12 vertices as 3D unit vectors in ECEF-like coords (x toward lon=0). */
const VERTICES_3D: ReadonlyArray<readonly [number, number, number]> = (() => {
  const v: [number, number, number][] = [];
  v.push([0, 0, 1]); // 0: north pole
  const c = Math.cos(ATAN_HALF);
  const s = Math.sin(ATAN_HALF);
  for (let k = 0; k < 5; k++) {
    const lon = k * 72 * DEG2RAD;
    v.push([c * Math.cos(lon), c * Math.sin(lon), s]);
  }
  for (let k = 0; k < 5; k++) {
    const lon = (36 + k * 72) * DEG2RAD;
    v.push([c * Math.cos(lon), c * Math.sin(lon), -s]);
  }
  v.push([0, 0, -1]); // 11: south pole
  return v;
})();

/** 20 faces, each as 3 vertex indices into VERTICES_3D. Vertex order is
 *  consistent across the net so barycentric coords match the layout. */
const FACES: ReadonlyArray<readonly [number, number, number]> = (() => {
  const f: [number, number, number][] = [];
  // top cap: pole, n_k, n_(k+1)
  for (let k = 0; k < 5; k++) f.push([0, 1 + k, 1 + ((k + 1) % 5)]);
  // north equator (down on the sphere): n_k, n_(k+1), s_k
  for (let k = 0; k < 5; k++) f.push([1 + k, 1 + ((k + 1) % 5), 6 + k]);
  // south equator (up on the sphere): s_k, s_(k+1), n_(k+1)
  for (let k = 0; k < 5; k++) f.push([6 + k, 6 + ((k + 1) % 5), 1 + ((k + 1) % 5)]);
  // bottom cap: south pole, s_(k+1), s_k
  for (let k = 0; k < 5; k++) f.push([11, 6 + ((k + 1) % 5), 6 + k]);
  return f;
})();

/** Per-face 2D positions of the 3 face vertices in the planar net (unit edge
 *  length). Order matches FACES. */
const FACE_2D: ReadonlyArray<readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
]> = (() => {
  const H = SQRT3_OVER_2;
  const out: [[number, number], [number, number], [number, number]][] = [];
  // Top cap k (k=0..4): apex at top, base spans column k.
  for (let k = 0; k < 5; k++) {
    out.push([
      [k + 0.5, 0],         // pole
      [k, H],               // n_k
      [k + 1, H],           // n_(k+1)
    ]);
  }
  // North-equator down k: top-left n_k, top-right n_(k+1), bottom s_k.
  for (let k = 0; k < 5; k++) {
    out.push([
      [k, H],               // n_k
      [k + 1, H],           // n_(k+1)
      [k + 0.5, 2 * H],     // s_k
    ]);
  }
  // South-equator up k: bottom-left s_k, bottom-right s_(k+1), top n_(k+1).
  for (let k = 0; k < 5; k++) {
    out.push([
      [k + 0.5, 2 * H],     // s_k
      [k + 1.5, 2 * H],     // s_(k+1)
      [k + 1, H],           // n_(k+1)
    ]);
  }
  // Bottom cap k: apex at bottom, base spans column k+0.5 (aligned under
  // south-equator-up k).
  for (let k = 0; k < 5; k++) {
    out.push([
      [k + 1, 3 * H],       // pole
      [k + 1.5, 2 * H],     // s_(k+1)
      [k + 0.5, 2 * H],     // s_k
    ]);
  }
  return out;
})();

/** Face centers in 3D (precomputed for fast face lookup). */
const FACE_CENTERS_3D: ReadonlyArray<readonly [number, number, number]> = FACES.map((face) => {
  const [a, b, c] = face;
  const va = VERTICES_3D[a]!;
  const vb = VERTICES_3D[b]!;
  const vc = VERTICES_3D[c]!;
  const cx = (va[0] + vb[0] + vc[0]) / 3;
  const cy = (va[1] + vb[1] + vc[1]) / 3;
  const cz = (va[2] + vb[2] + vc[2]) / 3;
  const len = Math.hypot(cx, cy, cz);
  return [cx / len, cy / len, cz / len] as const;
});

// --- forward projection ----------------------------------------------------

export interface IseaPoint {
  readonly x: number;
  readonly y: number;
}

/** Net width and height in unit-edge coords. The south-equator-up and
 *  bottom-cap rows extend 0.5L right of the top-cap row because the two
 *  longitude rings of equator vertices are offset by 36° (half a face-width)
 *  on the sphere. Net width is 5.5; aspect ratio 5.5 / (3·√3/2) ≈ 2.117:1. */
export const ISEA_NET_WIDTH = 5.5;
export const ISEA_NET_HEIGHT = 3 * SQRT3_OVER_2;

/** Forward project (lat, lon) in degrees to net coords in [0, ISEA_NET_WIDTH]
 *  × [0, ISEA_NET_HEIGHT]. */
export function iseaForward(latDeg: number, lonDeg: number): IseaPoint {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const c = Math.cos(phi);
  const px = c * Math.cos(lam);
  const py = c * Math.sin(lam);
  const pz = Math.sin(phi);

  // Find the face whose centroid this point is closest to (max dot product).
  let bestF = 0;
  let bestDot = -Infinity;
  for (let f = 0; f < 20; f++) {
    const cc = FACE_CENTERS_3D[f]!;
    const d = px * cc[0] + py * cc[1] + pz * cc[2];
    if (d > bestDot) {
      bestDot = d;
      bestF = f;
    }
  }

  return projectOntoFace(px, py, pz, bestF);
}

/** Direct face mapping when the caller already knows the face. Useful when
 *  projecting a Voronoi cell — find the face once for the cell center, then
 *  project all cell vertices through the same face so cells don't split. */
export function iseaForwardOnFace(
  latDeg: number,
  lonDeg: number,
  faceIndex: number,
): IseaPoint {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const c = Math.cos(phi);
  return projectOntoFace(
    c * Math.cos(lam),
    c * Math.sin(lam),
    Math.sin(phi),
    faceIndex,
  );
}

/** Find which face's centroid is closest to (lat, lon). Used by the renderer
 *  to anchor each Voronoi cell to a single face before drawing. */
export function iseaFaceOf(latDeg: number, lonDeg: number): number {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const c = Math.cos(phi);
  const px = c * Math.cos(lam);
  const py = c * Math.sin(lam);
  const pz = Math.sin(phi);
  let bestF = 0;
  let bestDot = -Infinity;
  for (let f = 0; f < 20; f++) {
    const cc = FACE_CENTERS_3D[f]!;
    const d = px * cc[0] + py * cc[1] + pz * cc[2];
    if (d > bestDot) {
      bestDot = d;
      bestF = f;
    }
  }
  return bestF;
}

function projectOntoFace(
  px: number,
  py: number,
  pz: number,
  faceIndex: number,
): IseaPoint {
  const face = FACES[faceIndex]!;
  const va = VERTICES_3D[face[0]]!;
  const vb = VERTICES_3D[face[1]]!;
  const vc = VERTICES_3D[face[2]]!;

  // 3D barycentric (= gnomonic onto the face plane). Solve
  //   a*va + b*vb + c*vc = t * P     with a+b+c=1
  // by inverting the 3×3 matrix [va | vb | vc].
  const inv = invert3x3(va, vb, vc);
  if (!inv) return { x: 0, y: 0 };
  let a = inv[0]! * px + inv[1]! * py + inv[2]! * pz;
  let b = inv[3]! * px + inv[4]! * py + inv[5]! * pz;
  let c = inv[6]! * px + inv[7]! * py + inv[8]! * pz;
  const sum = a + b + c;
  if (sum !== 0) {
    a /= sum;
    b /= sum;
    c /= sum;
  }

  const f2d = FACE_2D[faceIndex]!;
  return {
    x: a * f2d[0][0] + b * f2d[1][0] + c * f2d[2][0],
    y: a * f2d[0][1] + b * f2d[1][1] + c * f2d[2][1],
  };
}

function invert3x3(
  va: readonly [number, number, number],
  vb: readonly [number, number, number],
  vc: readonly [number, number, number],
): Float64Array | null {
  const a = va[0]; const b = vb[0]; const c = vc[0];
  const d = va[1]; const e = vb[1]; const f = vc[1];
  const g = va[2]; const h = vb[2]; const i = vc[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const m = new Float64Array(9);
  m[0] = (e * i - f * h) * inv;
  m[1] = (c * h - b * i) * inv;
  m[2] = (b * f - c * e) * inv;
  m[3] = (f * g - d * i) * inv;
  m[4] = (a * i - c * g) * inv;
  m[5] = (c * d - a * f) * inv;
  m[6] = (d * h - e * g) * inv;
  m[7] = (b * g - a * h) * inv;
  m[8] = (a * e - b * d) * inv;
  return m;
}
