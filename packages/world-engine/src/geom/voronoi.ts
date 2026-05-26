// Voronoi / topology builder.
// Strategy: project all lat/lon points stereographically from the south pole
// into the 2D plane, then run d3-delaunay. Delaunay neighbors correspond 1:1 to
// Voronoi-edge-sharing cells, which is the topology the rest of the engine wants.
//
// South-pole closure: the southernmost ring of points are mutual Delaunay
// neighbors on the convex hull of the projected point set. d3-delaunay's
// `delaunay.neighbors(i)` reports these adjacencies correctly. Acceptance tests
// (no null neighbors, symmetric adjacency, area-sum ≈ 4π) catch failures.

import { Delaunay } from 'd3-delaunay';
import { stereographicForward, stereographicInverse } from './projections.js';
import { latLonToUnit } from './sphere.js';

export interface CsrArray {
  /** offsets[i] is the start index into `flat` for entry i.
   *  offsets[N] is the total length of `flat`. */
  readonly offsets: Int32Array;
  readonly flat: Int32Array;
}

export interface CsrFloatArray {
  readonly offsets: Int32Array;
  /** Interleaved [x0, y0, x1, y1, ...] per entry. */
  readonly flat: Float32Array;
}

export interface Topology {
  /** For each region, the list of region ids that share a Voronoi edge. */
  readonly neighbors: CsrArray;

  /** For each region, the polygon outline in stereographic-projected space.
   *  Flat layout: 2 floats per vertex. */
  readonly cellVertices: CsrFloatArray;

  /** Interleaved (regionA, regionB) per edge. Length = 2 * numEdges. */
  readonly edges: Int32Array;

  readonly numEdges: number;

  /** Precomputed spherical cell area (steradians) per region. Used as weights
   *  by area-weighted diffusion in the weather simulation. */
  readonly cellArea: Float32Array;
}

export interface BuildTopologyOptions {
  /** Padding factor on the computed stereographic bounding box used to clip
   *  Voronoi cells (which can be unbounded for hull sites). Default 2.0. */
  readonly bboxPadding?: number;
}

export function buildTopology(
  latlon: Float32Array,
  numRegions: number,
  options: BuildTopologyOptions = {},
): Topology {
  if (numRegions < 1) throw new Error('numRegions must be >= 1');
  if (latlon.length < 2 * numRegions) {
    throw new Error(`latlon too short: need ${2 * numRegions}, have ${latlon.length}`);
  }

  // 1. Stereographic projection of every region centroid.
  const projected = new Float64Array(2 * numRegions);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < numRegions; i++) {
    const p = stereographicForward({ lat: latlon[2 * i]!, lon: latlon[2 * i + 1]! });
    projected[2 * i] = p.x;
    projected[2 * i + 1] = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // 2. Bounding box with padding so unbounded hull cells get clipped to a
  //    finite polygon big enough to be visually meaningful.
  const pad = options.bboxPadding ?? 2.0;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = ((maxX - minX) / 2) * (1 + pad);
  const halfH = ((maxY - minY) / 2) * (1 + pad);
  const half = Math.max(halfW, halfH);

  // 3. d3-delaunay.
  const delaunay = new Delaunay(projected);
  const voronoi = delaunay.voronoi([cx - half, cy - half, cx + half, cy + half]);

  // 4. Neighbor CSR.
  const neighborLists: number[][] = new Array(numRegions);
  let totalAdj = 0;
  for (let i = 0; i < numRegions; i++) {
    const list: number[] = [];
    for (const j of delaunay.neighbors(i)) list.push(j);
    list.sort((a, b) => a - b);
    neighborLists[i] = list;
    totalAdj += list.length;
  }
  const nOffsets = new Int32Array(numRegions + 1);
  const nFlat = new Int32Array(totalAdj);
  let cursor = 0;
  for (let i = 0; i < numRegions; i++) {
    nOffsets[i] = cursor;
    const list = neighborLists[i]!;
    for (let k = 0; k < list.length; k++) {
      nFlat[cursor++] = list[k]!;
    }
  }
  nOffsets[numRegions] = cursor;

  // 5. Cell vertex CSR.
  const polys: Float32Array[] = new Array(numRegions);
  let totalVertFloats = 0;
  for (let i = 0; i < numRegions; i++) {
    const poly = voronoi.cellPolygon(i);
    if (poly == null) {
      // Should not happen given the clipping bbox. Use a degenerate one-vertex
      // cell so downstream consumers don't crash, but acceptance tests should
      // fail before this matters in practice.
      polys[i] = new Float32Array([projected[2 * i]!, projected[2 * i + 1]!]);
    } else {
      const flat = new Float32Array(poly.length * 2);
      for (let k = 0; k < poly.length; k++) {
        flat[2 * k] = poly[k]![0];
        flat[2 * k + 1] = poly[k]![1];
      }
      polys[i] = flat;
    }
    totalVertFloats += polys[i]!.length;
  }
  const vOffsets = new Int32Array(numRegions + 1);
  const vFlat = new Float32Array(totalVertFloats);
  cursor = 0;
  for (let i = 0; i < numRegions; i++) {
    vOffsets[i] = cursor;
    const p = polys[i]!;
    vFlat.set(p, cursor);
    cursor += p.length;
  }
  vOffsets[numRegions] = cursor;

  // 6. Edges. Canonical (min, max) per edge. Stable order: scan i ascending,
  //    add edge for each neighbor j > i.
  const edgePairs: number[] = [];
  for (let i = 0; i < numRegions; i++) {
    const list = neighborLists[i]!;
    for (let k = 0; k < list.length; k++) {
      const j = list[k]!;
      if (j > i) {
        edgePairs.push(i, j);
      }
    }
  }
  const edges = new Int32Array(edgePairs);

  // 7. Per-cell spherical area (precomputed for area-weighted diffusion).
  const cellArea = new Float32Array(numRegions);
  for (let i = 0; i < numRegions; i++) {
    const start = vOffsets[i]!;
    const end = vOffsets[i + 1]!;
    const nVerts = (end - start) / 2;
    if (nVerts < 3) {
      cellArea[i] = 0;
      continue;
    }
    const units: Vec3[] = new Array(nVerts);
    for (let k = 0; k < nVerts; k++) {
      const x = vFlat[start + 2 * k]!;
      const y = vFlat[start + 2 * k + 1]!;
      const ll = stereographicInverse({ x, y });
      units[k] = latLonToUnit(ll.lat, ll.lon);
    }
    cellArea[i] = sphericalPolygonArea(units);
  }

  return {
    neighbors: { offsets: nOffsets, flat: nFlat },
    cellVertices: { offsets: vOffsets, flat: vFlat },
    edges,
    numEdges: edges.length / 2,
    cellArea,
  };
}

// --- Spherical cell area --------------------------------------------------
//
// Used by the area-sum acceptance test (Σ ≈ 4π) and reusable in Phase 6 for
// area-weighted diffusion.

type Vec3 = [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Van Oosterom-Strackee solid angle of a spherical triangle (vertices are unit vectors). */
function sphericalTriangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const num = Math.abs(dot(a, cross(b, c)));
  const den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2 * Math.atan2(num, den);
}

/** Area (steradians) of a spherical polygon given its 3D unit-vector vertices. */
export function sphericalPolygonArea(verts: ReadonlyArray<Vec3>): number {
  if (verts.length < 3) return 0;
  let area = 0;
  const v0 = verts[0]!;
  for (let i = 1; i < verts.length - 1; i++) {
    area += sphericalTriangleArea(v0, verts[i]!, verts[i + 1]!);
  }
  return area;
}

/** Area (steradians) of a single Voronoi cell, given its stereographic-projected
 *  polygon vertices. Vertices are inverse-projected to lat/lon then to unit vectors. */
export function cellSphericalArea(
  topology: Topology,
  regionId: number,
): number {
  const { offsets, flat } = topology.cellVertices;
  const start = offsets[regionId]!;
  const end = offsets[regionId + 1]!;
  const nVerts = (end - start) / 2;
  if (nVerts < 3) return 0;
  const units: Vec3[] = new Array(nVerts);
  for (let k = 0; k < nVerts; k++) {
    const x = flat[start + 2 * k]!;
    const y = flat[start + 2 * k + 1]!;
    const ll = stereographicInverse({ x, y });
    units[k] = latLonToUnit(ll.lat, ll.lon);
  }
  return sphericalPolygonArea(units);
}
