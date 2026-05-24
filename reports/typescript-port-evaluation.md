# Evaluation: TypeScript Port of `realistic-planet-generation-and-simulation`

**Source:** [`/home/lentulus/projects/mapsamples/realistic-planet-generation-and-simulation`](../../mapsamples/realistic-planet-generation-and-simulation) (p5.js, live at <https://freezedriedmangos.github.io/realistic-planet-generation-and-simulation/>)
**Mode:** *Port, not fork.* Start a fresh TypeScript codebase using the original as architectural reference and algorithm source.
**Companion document:** [realistic-planet-generation-evaluation.md](realistic-planet-generation-evaluation.md)
**Date:** 2026-05-24

---

## 1. TL;DR

- **The port is straightforward and worth doing.** Code surface is small (~3.5k LOC of original logic after dropping the in-tree GUI/font and the vendored Voronoi library).
- The original is a single global-namespace browser script. Most of the porting effort is **structural** (modules, types, explicit state) rather than **algorithmic**.
- Recommended stack: **Vite + TypeScript + d3-delaunay (Voronoi) + a minimal canvas renderer**, with **p5.js dropped entirely**. A thin GUI (Tweakpane or lil-gui) replaces the in-tree `magicgui.js`.
- Estimated effort: **2–4 weeks** for a faithful port behaviorally matching the demo; another 1–2 weeks if you also fix the area-weighting / vector-frame issues identified in the architecture report.
- The biggest single decision is **whether to keep p5.js as a thin compatibility layer** (faster port) **or to cut it cleanly** (better long-term — recommended, since WorldMaps's eventual ISEA renderer will not be p5-friendly anyway).

---

## 2. What You're Actually Porting

LOC by file (`wc -l src/*.js`):

| File | LOC | Port verdict |
|---|---:|---|
| `Generate_Weather.js` | 813 | **Port** — core simulation |
| `VoronoiDraw.js` | 811 | **Port partially** — keep cell/triangle drawing; drop p5 specifics |
| `Generate_Terrain.js` | 785 | **Port** — core terrain pipeline |
| `magicgui.js` | 757 | **Drop** — replace with Tweakpane/lil-gui |
| `A_Worldgen.js` | 561 | **Port** — but restructure as proper entry point + config |
| `pixelfont.js` | 474 | **Drop** — only needed because p5 WebGL has no text |
| `Utils.js` | 339 | **Port** — small, mostly math |
| `Projections.js` | 92 | **Port** — trivial, extend with ISEA later |
| `Colors.js` | 69 | **Port** — trivial |
| `rng.js` | 72 | **Port** — or replace with `seedrandom` |
| `voronoi.js` (Gorhill) | 1726 | **Replace** with `d3-delaunay` |
| `Worldgen.js` | 0 | empty |

**Net new-code surface to port: ~3,000 LOC** of original logic. Add ~500 LOC of TS scaffolding (types, modules, GUI adapter, build config) and ~500 LOC of renderer if you cut p5.

---

## 3. Structural Pain Points to Plan For

A quick read of [`Projections.js`](../../mapsamples/realistic-planet-generation-and-simulation/src/Projections.js) shows the patterns you'll be undoing throughout the codebase:

- **Implicit globals.** `Projections = {...}` with no `let`/`const`/`var` — every top-level binding is a window property. → Convert to ES module exports.
- **Direct reference to p5 globals.** `windowWidth`, `windowHeight`, `color()` are not imports, they're globals injected by p5. → Either inject a typed `Viewport`/`Renderer` interface, or wrap p5 with a typed shim if you keep it.
- **Single shared mutable `map` global.** All modules reach into the same object (`map.r_latlon`, `map.r_elevation`, etc.). → Replace with a typed `WorldState` interface passed explicitly, or a class. **This is the single most important refactor and the one that pays the most TS dividends.**
- **Tuples-as-arrays.** `[lat, lon]` everywhere. → TypeScript tuple types (`type LatLon = readonly [number, number]`) get you most of the safety; consider branded types (`Latitude`, `Longitude`) only if mix-ups have actually bitten the original (they may have — `[lat, lon]` vs `[lon, lat]` swaps are a recurring class of bug in the source's commented-out projection code).
- **Hot loops over thousands of regions.** Per-region scalars (e.g. `map.r_elevation`) are JS arrays of numbers. → Switch to `Float32Array` / `Int32Array` / `Uint8Array` for the per-region layers. Free perf, free memory, plays well with structured cloning if you later move generation to a Web Worker.
- **`p5.Color` objects in arrays.** `Colors.js` returns p5 color objects. → Replace with packed `Uint32Array` of RGBA, or `{r,g,b,a}` records — both serialize cheaply and don't need a p5 dependency.

---

## 4. Recommended Stack

| Layer | Recommended | Alternative | Why |
|---|---|---|---|
| Language | **TypeScript 5.x**, `strict: true`, `noUncheckedIndexedAccess: true` | — | The point of the port. |
| Build | **Vite** | esbuild, Parcel | Zero-config TS, fast HMR, deploys to the same static-site shape as the original. |
| Module system | **ESM** | — | Default. The original's script-tag-and-globals model is what you're escaping. |
| Voronoi | **`d3-delaunay`** | Roll spherical Voronoi from scratch | Modern, typed, fast, well-maintained. Same stereographic-then-invert trick as the original works fine. |
| RNG | **`seedrandom`** or keep the original's tiny RNG | — | Original's `rng.js` is 72 LOC and works; only swap if you want determinism guarantees across platforms. |
| GUI | **Tweakpane** | lil-gui, Leva | Typed, modern, ~30 KB; replaces 757 LOC of `magicgui.js`. |
| Graphics | **Canvas 2D directly** | Keep p5 via `@types/p5`; or PixiJS; or regl | The original is essentially "fill polygons with colors" — Canvas 2D is enough and removes a heavy dependency. If you need WebGL later for performance, PixiJS or regl are the natural step up. |
| Testing | **Vitest** | Jest | Vite-native, same config. Useful for the numerical pipelines (golden-frame snapshots of small worlds). |

### Why drop p5.js

p5.js makes sense for sketch-style prototypes; it's a poor fit for what WorldMaps is becoming:

- The eventual ISEA renderer needs explicit control over geometry and projection — p5's beginShape/endShape API gets in the way.
- p5 owns the run loop, the canvas, the input system, and ~250 global names. That's a lot of surface to wrap typed.
- The only p5 features the original actually uses are: `createCanvas`, polygon drawing, `color()`, and mouse/keyboard input. All are 1:1 replaceable with ~100 LOC of Canvas 2D + DOM events.
- `pixelfont.js` exists *only* because p5's WebGL mode has no native text. Dropping p5 also drops the need for the custom font.

If you want a faster first port and don't mind p5 staying, `@types/p5` is reasonable. Plan to remove it later.

---

## 5. Suggested Module Layout

```
src/
├── main.ts                  entry; wires config, generator, renderer, GUI
├── config.ts                typed default parameters (replaces the param blob in A_Worldgen.js)
├── state.ts                 WorldState interface + factory; owns all typed arrays
├── rng.ts
├── geom/
│   ├── projections.ts       equirectangular, stereographic, (later) ISEA
│   ├── sphere.ts            Fibonacci sphere, great-circle distance, tangent frames
│   └── voronoi.ts           thin wrapper over d3-delaunay; pole-closure logic
├── generate/
│   ├── terrain.ts           Generate_Terrain.js
│   ├── plates.ts            split out of terrain.ts; clearer types
│   └── elevation.ts         split out of terrain.ts
├── simulate/
│   ├── weather.ts           Generate_Weather.js orchestration
│   ├── temperature.ts
│   ├── humidity.ts
│   ├── wind.ts
│   ├── currents.ts          its own file given the design-notes folder
│   └── rivers.ts
├── render/
│   ├── canvas.ts            Canvas2D primitives
│   ├── modes.ts             the "Satellite/Climate/Plates/…" mode table
│   └── overlays.ts          plate vectors, wind, currents, lat/lon lines
└── gui/
    └── tweakpane.ts         binds config + draw mode to the panel
```

Splitting `terrain.ts` and `weather.ts` into smaller files isn't required, but the originals each pass 800 LOC and mix several phases — natural seams exist.

---

## 6. Suggested Type Sketch

```ts
// state.ts
export type RegionId = number;
export type LatLon = readonly [number, number]; // degrees, [lat, lon]
export type Vec2   = readonly [number, number]; // generic 2-tuple

export interface WorldState {
  readonly numRegions: number;

  // per-region typed arrays — one slot per RegionId
  readonly latlon:           Float32Array; // length 2*N, interleaved
  readonly elevation:        Float32Array;
  readonly plate:            Int32Array;
  readonly temperature:      Float32Array;
  readonly waterTemperature: Float32Array;
  readonly humidity:         Float32Array;
  readonly clouds:           Float32Array;
  readonly wetness:          Float32Array;
  readonly nightness:        Float32Array;
  readonly surfaceTemp:      Float32Array;
  readonly wind:             Float32Array; // length 2*N, interleaved
  readonly currents:         Float32Array; // length 2*N, interleaved

  // topology (from d3-delaunay)
  readonly neighbors: ReadonlyArray<ReadonlyArray<RegionId>>;
  readonly cellVertices: ReadonlyArray<Float32Array>; // per cell, in projected space

  // per-edge data
  readonly riverflow: Float32Array;
}
```

Notes:
- `readonly` on the *container* doesn't prevent mutating array contents, which is what you want for the simulation loop.
- Interleaved `Float32Array` for `[lat, lon]` pairs is half the memory of an array-of-tuples and dramatically faster in tight loops. The accessor cost is `lat = latlon[2*r]; lon = latlon[2*r+1]`.
- `RegionId` as a nominal type via branded types is optional but cheap: `type RegionId = number & { readonly __brand: 'RegionId' }`.

---

## 7. Algorithm-Level Notes for the Port

Things that will surprise you while porting line-by-line:

| In source | Watch out |
|---|---|
| Modulo on negative numbers | JS `%` returns negative for negative operands; ensure all longitude wrap math uses `((x % 360) + 360) % 360`. The original gets this right in some places and not others. |
| Mixed `latlondist` vs `newlatlondist` | The planar version is used in many hot loops as an optimization. Port both; consider precomputing a neighbor-distance table once per regeneration. |
| Implicit global `map` | Will turn into 100s of "Cannot find name 'map'" errors on first TS compile. Plan to introduce `WorldState` first thing, before porting any logic. |
| Array growth with `push` inside hot loops | Pre-size where you can; this is what gives you the Float32Array win. |
| p5 `color()` everywhere | Decide your color representation (`Uint32` RGBA packed, or `{r,g,b,a}`) before porting `Colors.js` or `VoronoiDraw.js`, or you'll redo the work. |
| Voronoi south-pole closure | Re-implement the explicit fix-up; d3-delaunay's edge cases are different from Gorhill's. Keep the original's logic as a *reference algorithm*, not as code-to-translate-verbatim. |

---

## 8. Effort Estimate

Assuming a single developer comfortable with TS and one of the candidate renderers:

| Phase | Days | Output |
|---|---:|---|
| 1. Scaffolding: Vite, tsconfig, lint, CI | 0.5 | Empty app boots, renders a blank canvas. |
| 2. State + types + RNG + projections + Fibonacci sphere | 1 | Can render the 5,545 sample points as dots. |
| 3. Voronoi via d3-delaunay + pole closure | 1 | Coloured Voronoi cells visible. |
| 4. Plates + elevation | 2 | Reproduces the demo's "Plates" and "Elevation" modes. |
| 5. Weather loop (temperature, humidity, wind, clouds) | 3 | Reproduces "Climate", "Temperature", "Humidity", "Clouds" modes. |
| 6. Currents + ocean gyres | 2 | Reproduces "Ocean Gyres" mode. |
| 7. Rivers + lakes | 1 | Reproduces river overlays. |
| 8. Render modes + overlays + GUI | 1.5 | All 15 visualization modes selectable. |
| 9. Polish, perf pass (Float32Array everywhere), tests | 2 | At parity with the demo. |
| **Subtotal — behavioral parity** | **~14 days** | |
| 10. (Optional) Area-weighted simulation fix | 2 | Pole artefacts gone. |
| 11. (Optional) Tangent-frame vector fields | 3 | Wind/current vectors physically meaningful. |
| 12. (Optional) Web Worker for generation | 1 | Non-blocking UI. |
| **Subtotal — quality fixes** | **~6 days** | |

Total: **~14 working days for parity, ~20 if you also fix the issues called out in the architecture report.**

---

## 9. Risks and Open Questions

**Risks**
- **d3-delaunay edge cases at the pole.** The original spent visible effort on south-pole stitching. Budget a day for the equivalent in d3-delaunay; verify with a low-N regression test that no cells have null neighbors.
- **Floating-point divergence from the original.** A port will not produce identical worlds for the same seed unless you replicate `Math.random` semantics (likely impossible) — use seeded RNG and write your own golden-master tests rather than comparing to the demo.
- **Performance.** The original runs in p5's draw loop at interactive rates. A naïve TS port with regular arrays will be slower; the typed-array recommendation is what closes that gap.
- **Scope creep into ISEA.** Keep the port and the ISEA work in separate commits/PRs; the port should reproduce the demo first.

**Open questions for you**
1. **Keep p5.js (faster port, heavier dep) or cut it (recommended, ~1 week more)?**
2. **Single-package repo, or split `world-engine` (sim) and `world-renderer` (canvas/ISEA) as separate packages from day one?** The latter pays off when ISEA work begins.
3. **Web Worker for generation now, or later?** Easy to add later if `WorldState` is built around typed arrays (transferable).
4. **Determinism requirement?** If you want bit-exact reproducibility across machines/browsers, pick the RNG library carefully and avoid `Math.sin`/`Math.cos` in seed-sensitive paths (different engines differ in the last ULP).
5. **License compatibility.** Confirm the original's license permits a derivative port and document the lineage in WorldMaps's README.

---

## 10. Recommendation

Port to **TypeScript on Vite**, **drop p5.js**, swap the **Voronoi library to d3-delaunay**, replace the **GUI with Tweakpane**, and use **typed arrays for per-region state from day one**. Treat the original as authoritative *algorithm* reference, not as code to translate line-by-line — its global-namespace structure is the main thing you're reorganizing away.

Aim for a **~14-day parity port** as the first milestone, then layer the simulation-quality fixes and ISEA work on top.
