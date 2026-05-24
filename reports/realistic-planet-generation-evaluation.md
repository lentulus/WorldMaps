# Evaluation: `realistic-planet-generation-and-simulation`

**Source:** [`/home/lentulus/projects/mapsamples/realistic-planet-generation-and-simulation`](../../mapsamples/realistic-planet-generation-and-simulation)
**Purpose:** Assess the project's architecture and the viability of re-projecting its outputs onto an **Icosahedral Snyder Equal-Area (ISEA)** projection with a (likely triangular, variable-subdivision) tessellation.
**Date:** 2026-05-24

---

## 1. TL;DR

- The project is a single-page **p5.js** (JavaScript, browser) world generator and weather simulator. No build step; runs from `index.html`.
- The world is represented as a **Voronoi tessellation of a sphere**, generated from a **Fibonacci-sphere** point set, computed in **stereographic projection**, then unwound back to **lat/lon**. Equirectangular is used only for screen rendering.
- All simulation state (elevation, plates, temperature, humidity, clouds, wind, currents, rivers, etc.) is **stored per Voronoi region in lat/lon space** — it is not tied to any particular display projection.
- **Re-mapping the outputs to ISEA is viable and relatively cheap**, because the data model is projection-agnostic. The work is mostly:
  1. swap the screen projection,
  2. resample per-region scalars onto the ISEA triangle grid you choose,
  3. fix two pre-existing physical weaknesses (no spherical area weighting; vector fields stored as `[dlat, dlon]`) if you care about quantitative accuracy.

---

## 2. Project Architecture

### 2.1 Tech stack

| Item | Value |
|---|---|
| Language | JavaScript (p5.js) |
| Build system | None — static HTML loads scripts in order |
| Dependencies | `p5.min.js`, Gorhill `voronoi.js`, an in-tree pixel-font + custom GUI |
| Origin | Originally written for the iOS *Processing* app; now runs in the browser |
| Output | On-screen canvas only — **no file/data export path exists** |

### 2.2 Source layout

```
src/
├── A_Worldgen.js          entry point: setup(), draw(), GUI, params, Fibonacci sphere
├── Generate_Terrain.js    Voronoi-on-sphere, plates, elevation
├── Generate_Weather.js    weather loop, currents
├── Projections.js         equirectangular + stereographic (fwd/inv)
├── Utils.js               great-circle distance, neighbor traversal, shadows
├── VoronoiDraw.js         cell / triangle / quad rendering
├── Colors.js              biome/heatmap palettes
├── magicgui.js            in-tree GUI
├── pixelfont.js           in-tree bitmap font (WebGL has no text)
├── rng.js                 seeded RNG
└── voronoi.js             Gorhill's JS-Voronoi (vendored)

CurrentsGenerationAlgorithm/   design notes + diagrams for the gyre algorithm
build/                         deployable static site
Showoff*/                      screenshot/video galleries
```

### 2.3 Pipeline

```
Regenerate Map
└── generateMap()                              [Generate_Terrain.js]
    ├── createVoronoi()
    │   ├── generateFibonacciSphere(N, jitter)   ← ~5,545 points by default
    │   ├── project lat/lon → stereographic
    │   ├── Voronoi.compute(...)
    │   ├── south-pole edge closure (explicit)
    │   └── invert stereographic → lat/lon
    ├── createPlates()      BFS-flood plate IDs from seed regions
    └── assignElevation()   plate-collision events → mountains / subduction /
                             rifts / hotspots, distance-weighted

Weather tick (looped)
└── advanceWeather()                           [Generate_Weather.js]
    ├── nightness            (with mountain shadowing)
    ├── water temperature    (latitude base + diffusion + current advection)
    ├── wind vectors         (latitude bands + elevation deflection)
    ├── surface temperature
    ├── air temperature      (wind advection + diffusion + sun + clouds)
    ├── humidity             (elevation + ocean + wind + rainfall sink)
    ├── clouds + precipitation
    └── edge river flow      (elevation gradient on Voronoi edges)

Currents (one-shot, at init)
└── generateCurrents()       BFS gyre groups from seed lat bands (±60°, ±75°),
                              hemispheric merge, distance-to-edge BFS, then
                              tangential vector = inward-direction rotated 90°
                              (CW or CCW by hemisphere → fake Coriolis).
```

### 2.4 Data model — the part that matters for ISEA

Every layer is a **flat array indexed by region id `r`**:

| Array | Shape | Range |
|---|---|---|
| `map.r_latlon[r]` | `[lat, lon]` degrees | lat ∈ [−90, 90], lon ∈ [0, 360) |
| `map.r_elevation[r]` | scalar | [−1, 1], 0 = sea level |
| `map.r_plate[r]` | int | plate id |
| `map.r_temperature[r]`, `r_waterTemperature`, `r_humidity`, `r_clouds`, `r_wetness`, `r_nightness`, `r_surfaceTemperature` | scalar | [0, 1] |
| `map.r_wind[r]`, `map.r_currents[r]` | 2-vector `[dlat, dlon]` | unbounded |
| `map.e_riverflow[e]` | scalar per Voronoi edge | flow magnitude |

Neighbors are read from the Voronoi adjacency (`map.voronoi.cells[r].getNeighborIds()`). Two distance functions exist in [`src/Utils.js`](../../mapsamples/realistic-planet-generation-and-simulation/src/Utils.js):

- `latlondist()` — **planar** Euclidean in degree space (used in hot loops where speed matters more than accuracy).
- `newlatlondist()` — **true great-circle** via 3-D unit-vector dot product (used in elevation where accuracy matters).

Resolution is configurable: `numRegions` defaults 5,545, max 10,000.

### 2.5 What the project does *well* w.r.t. the sphere

- Fibonacci-sphere seeding gives roughly uniform area sampling.
- Voronoi is computed in stereographic to avoid the pole singularity, then inverted.
- The unbounded edges that fall out the bottom of the stereographic plane are explicitly stitched back into a single south-pole region.
- The authoritative coordinate for every region is its `[lat, lon]` — not a pixel and not a projection-specific cell index.

### 2.6 What it does *not* do

- **No area weighting.** Every region contributes equally to diffusion, neighbor averaging, current vector sums, etc. Near the poles, where the Fibonacci sphere still places one region per ~uniform area but the surrounding lat/lon coordinate distortion is severe, the planar `latlondist()` skews neighbor weights.
- **Wind/current vectors are stored as `[dlat, dlon]`**, i.e. they live in the distorted lat/lon coordinate frame, not in a tangent plane on the sphere. A unit-magnitude vector near the pole "moves" much further in real surface distance than near the equator.
- **No Coriolis force.** The gyre algorithm cheats it by hard-coding CW/CCW per hemisphere band.
- **No export path.** All outputs are rendered straight to canvas; nothing is serialized.

---

## 3. Mapping the Outputs to ISEA

### 3.1 The good news

The simulation's source of truth is *already* a discrete sphere sampling indexed by `(lat, lon)`. **ISEA is just another projection of that sphere**, so re-projection does not require touching the generator or the weather simulator. The data layers from §2.4 are exactly what an ISEA renderer wants as input.

### 3.2 The two-axis matching problem

You have **two independent tessellations**:

| | Source (this project) | Target (your ISEA grid) |
|---|---|---|
| Cells | Voronoi polygons | Triangles (likely) |
| Sampling | ~uniform Fibonacci, ~5.5k cells default | Recursive icosahedral subdivision, **variable** |
| Origin | Random jittered | Deterministic from icosahedron vertices |
| Coordinate | `[lat, lon]` of centroid | barycentric within a face |

So "mapping the outputs" really means **resampling per-region scalars from one sphere tessellation onto another**. Three reasonable resampling strategies, in increasing cost/quality:

1. **Nearest-cell lookup** — for each ISEA triangle, find the Voronoi region whose centroid is closest (great-circle). O(N·M) naïvely; O(M log N) with a spatial index (e.g. spherical k-d tree, or just bucket by ISEA face first). Fine for visualization, blocky if the ISEA grid is finer than the Voronoi grid.
2. **Barycentric over the Voronoi-dual triangle mesh** — the project already builds a dual triangle mesh (it draws it as the `"Triangles"` mode). For each ISEA triangle centroid, locate the containing dual triangle, interpolate with barycentric weights. Smooth, cheap once you have a point-location structure.
3. **Area-weighted overlay** — clip each ISEA triangle against the Voronoi cells it intersects and average each layer weighted by intersected spherical area. Most accurate, most code.

For variable subdivision, (1) and (2) both work at any ISEA depth; choose source resolution `numRegions` to be ≥ the finest ISEA depth you intend to render, or you'll just be upsampling and seeing Voronoi cell boundaries.

### 3.3 Per-layer concerns

| Layer | Resampling | Notes |
|---|---|---|
| Elevation, temperature, humidity, clouds, wetness, surface/water temp, nightness | Trivial — scalar interpolation by any of the three methods above. | These are the easy wins. |
| Plate id, gyre id | **Nominal/categorical** — do **not** interpolate; use nearest-cell only, else you get fractional plate ids. | Plate *boundaries* become jagged at the ISEA scale; that's intrinsic. |
| Wind vector, ocean current vector | Need projection-aware handling. The stored `[dlat, dlon]` is in lat/lon coords; to render on ISEA you must either (a) convert each vector to a 3-D tangent vector on the sphere then project onto the target ISEA face's local tangent frame, or (b) re-derive vectors per ISEA face from the underlying scalar fields. (a) is straightforward but inherits the project's existing distortion. (b) is more work but gives you a clean, physically meaningful vector field on the icosahedral grid. | This is the single biggest correctness gotcha in the port. |
| River edge flow (`e_riverflow`) | Voronoi-edge quantity — doesn't transfer directly to triangle-edges. Either keep rivers as a separate overlay drawn in spherical coords (independent of the triangle mesh) or rasterize flow magnitude into a per-triangle scalar and lose the linear-feature semantics. | Worth deciding early. |

### 3.4 Variable subdivision

ISEA naturally supports recursive triangle subdivision (frequency / aperture-3 / aperture-4 etc.). Two practical patterns:

- **Uniform global depth.** Easiest. Pick a depth, generate all triangles, resample everything once. Works fine if `numRegions` source-side is ≥ triangle count target-side.
- **Adaptive / region-of-interest subdivision.** Subdivide only triangles where some criterion fires (e.g. elevation gradient, coastline proximity, user pan/zoom). This is where the projection-agnostic data model genuinely pays off: you can resample on demand at any depth from the same source arrays — the underlying simulation never needs to run at the higher resolution.

### 3.5 What you would actually need to change in the source project

If your intent is just to **borrow this project's outputs** (rather than fork and port it):

- Add a one-shot exporter: dump `r_latlon` plus each scalar/vector layer to JSON or a binary blob. ~30 lines.
- Everything else (ISEA triangulation, resampling, rendering) lives in your own WorldMaps codebase and is decoupled from this generator.

If your intent is to **fork and replace the renderer** with an ISEA renderer:

- Add an ISEA forward projection to `Projections.js`.
- Swap `equirectangular_screenspace` in `VoronoiDraw.js` and `A_Worldgen.js`.
- Add a triangle-mesh renderer (the existing `drawTriangles()` is a Voronoi-dual mesh, not an ISEA mesh — it's not reusable directly but is a useful template).
- Decide on the vector-field handling per §3.3.

### 3.6 Things to fix only if you care about quantitative realism

These are pre-existing in the source project and will *show* under ISEA because ISEA's equal-area property makes the planar-lat/lon assumptions visually obvious near the poles:

- Add area weighting to diffusion / neighbor averaging.
- Replace `latlondist()` with `newlatlondist()` in the hot loops, or precompute a neighbor-distance table once per regeneration.
- Convert `r_wind` and `r_currents` to tangent-plane vectors (magnitude + bearing, or 3-D tangent) and update the advection code accordingly.

For purely visual use ("make pretty equal-area maps from this generator") none of this is required.

---

## 4. Verdict

**Viable, low-to-moderate effort, high value.**

The project's data model is a clean per-region lat/lon dictionary, which is the easiest possible starting point for a re-projection. The Voronoi-on-sphere step already proves the authors thought spherically. The cost of an ISEA front-end is dominated by the resampling strategy you pick and by how seriously you want to take the vector fields — not by anything intrinsic to this codebase.

The main strategic question is **whether to consume this project as a black-box data source (recommended for a first cut) or to fork it and replace its renderer**. The black-box path lets you iterate on ISEA tessellation, subdivision strategy, and annotation tooling in your own clean codebase without inheriting p5.js or the in-tree GUI.

---

## 5. Open Questions for You

1. Triangle tessellation aperture — 3, 4, or mixed? Affects subdivision math and neighbor counts.
2. Target maximum depth — sets the minimum `numRegions` you need source-side.
3. Adaptive subdivision yes/no — drives renderer architecture more than data architecture.
4. Vector-field fidelity — are wind/currents decorative (option a in §3.3) or analytical (option b)?
5. Rivers — keep as vector overlay or rasterize into triangles?
