# WorldMaps — Handover

**Purpose of this file:** a re-entry point when a session is cut short. Read top-to-bottom in two minutes and you should know where the project is, what has been decided, and what the next decision is.

**Last updated:** 2026-05-26 (Phases 0–5 implemented; BP 2 and BP 3 redirects absorbed)

---

## 1. What WorldMaps is

A project to (a) procedurally generate world maps and (b) provide tooling to annotate them. WorldMaps is intended to be the **canonical owner** of generated worlds; downstream consumers ("Meridian\* projects") load worlds and overlay their own annotations (borders, settlements, factions, names, etc.).

The relationship to consumers is the same pattern already in use between [`Meridian`](../../projects/Meridian) (canonical starfield) and [`MeridianWorlds`](../../projects/MeridianWorlds) (consumer with a read-only boundary module + `API_REQUESTS.md`). See [reports/client-server-architecture.md](reports/client-server-architecture.md) for the concrete proposal.

## 2. Current status

- **Phase:** mid-implementation. Phases 0–5 of [`plans/plan1.md`](plans/plan1.md) are done; **BP 2** (first interface) and **BP 3** (terrain visible) reached and the user's redirects from each are absorbed.
- **What works end-to-end:** studio → Web Worker → engine → renderer. Engine produces Fibonacci sphere → Voronoi topology → tectonic plates (BFS flood) → elevation (plate-motion convergence + hotspots + ocean-fraction quantile shift). Renderer supports orthographic (default) and equirectangular projections, modes: `dots`, `cells`, `plates`, `elevation`, `satellite`. ~50 ms generation at N=2048 in the worker; UI never blocks.
- **Tests:** 92 passing under `vitest run`. Computer-evaluated tests are favoured over visual inspection per user preference; human breakpoints exist for redirects.
- **Reference implementation studied:** [`freezedriedmangos/realistic-planet-generation-and-simulation`](https://freezedriedmangos.github.io/realistic-planet-generation-and-simulation/) (p5.js). Local copy: [`/home/lentulus/projects/mapsamples/realistic-planet-generation-and-simulation`](../mapsamples/realistic-planet-generation-and-simulation). Treated as **algorithm reference, not a fork base**.
- **Implementation language:** **TypeScript** — committed.
- **Next phase:** Phase 6 — weather core (temperature, humidity, wind, clouds; tangent-frame vectors + area-weighted diffusion baked in per decisions 10, 13).

## 3. What the reports say (one-paragraph each)

- **[reports/realistic-planet-generation-evaluation.md](reports/realistic-planet-generation-evaluation.md)** — The reference project stores all simulation state per-Voronoi-region in lat/lon space, which makes it **projection-agnostic**. Re-projecting onto an Icosahedral Snyder Equal-Area (ISEA) grid is viable and low-to-moderate effort; the work is dominated by the resampling strategy chosen and by how seriously we want to take the vector fields (wind/currents are stored as `[dlat, dlon]` in distorted coords). The data model itself transfers cleanly.

- **[reports/typescript-port-evaluation.md](reports/typescript-port-evaluation.md)** — Recommends a fresh port (not a fork) on **Vite + TypeScript**, **dropping p5.js**, using **d3-delaunay** for Voronoi and **Tweakpane** for GUI, with **typed arrays for per-region state from day one**. ~3,000 LOC of original logic to translate. Estimated **~14 days to behavioral parity**, **~20 days** if also fixing area-weighting and tangent-frame vector issues called out in the architecture eval.

- **[reports/client-server-architecture.md](reports/client-server-architecture.md)** — Proposes a client-server split where a generation service owns world creation and exposes a stable, versioned **World Manifest + binary layers** contract. Defines the data structure that lets Meridian\* consumer projects load any world and attach annotations (borders, settlements, place names) without forking WorldMaps.

## 4. Decisions made

| # | Decision | Source |
|---|---|---|
| 1 | Port the reference project, do not fork it. | typescript-port §1, §10 |
| 2 | Drop p5.js in the port. | typescript-port §4 |
| 3 | Use d3-delaunay (not Gorhill) for Voronoi. | typescript-port §4 |
| 4 | Use typed arrays for per-region state from day one. | typescript-port §6 |
| 5 | Canonical coordinate per region is `[lat, lon]`. Projections are a render-time concern. | realistic-planet-eval §2.4 |
| 6 | WorldMaps is the upstream owner; Meridian\* projects consume via a versioned contract, mirroring the Meridian → MeridianWorlds pattern. | client-server-arch §2 |
| 7 | Repo shape is a **monorepo with three packages**: `world-contract`, `world-engine`, `world-renderer`. | Q&A 2026-05-24 |
| 8 | First concrete consumer is **MeridianWorlds** (settlements / civilizations / borders). Contract is designed against its needs. | Q&A 2026-05-24 |
| 9 | Borders snap to **Voronoi edges (`EdgeId[]`)** in v1. The contract must remain forward-compatible with adding freeform `(lat, lon)` polylines later as a **MINOR** (additive) schema bump — not MAJOR. | Q&A 2026-05-24 |
| 10 | Wind / ocean current vectors are **analytically re-derived per ISEA face** from the underlying scalar fields, not rotated from the source `[dlat, dlon]` storage. Adds ~3 days to the port; gives physically meaningful vectors. | Q&A 2026-05-24, ts-port §8 |
| 11 | ISEA aperture and target maximum depth are **kept configurable, no fixed default yet**. Engine, contract, and renderer must stay parameter-driven; pick concrete defaults when renderer work begins. | Q&A 2026-05-24 round 2 |
| 12 | **Load determinism, not generation determinism.** Stored worlds + annotations must re-load byte-identically every time. The generator does NOT have to produce the same world from the same seed across machines/builds. → `worldId` is assigned at creation (UUID or content hash of bytes), not derived from `(seed, params, version)`. Blobs are immutable once written. | Q&A 2026-05-24 round 2 |
| 13 | Quality fixes (area-weighting, tangent-frame vectors) **ship with the initial port** (~20-day target), not as a follow-up pass. | Q&A 2026-05-24 round 2, ts-port §8 |
| 14 | License: **MIT**. Reference project has no formal license (only "Feel free to do whatever you want with this code!"); MIT matches that spirit while giving downstream consumers legal clarity. Attribution to the reference project in `README.md` Acknowledgements. | Q&A 2026-05-24 round 3 |
| 15 | **Rivers are exposed two ways:** canonical per-edge `riverflow` (preserves linear semantics) **and** a derived per-region `riverPresence` scalar (convenience for consumers that don't want to walk the edge graph). | Q&A 2026-05-24 round 3 |
| 16 | **Adaptive (region-of-interest) subdivision** is a v1 renderer design constraint. The renderer must support depth-on-demand from day one. Engine and contract are unaffected. | Q&A 2026-05-24 round 3 |
| 17 | **Web Worker from day one** for the engine. ~1 day of message-passing scaffolding; non-blocking UI is a v1 property, not a future optimization. | Q&A 2026-05-24 round 3 |
| 18 | **Renderer default projection: orthographic globe view.** Equirectangular still selectable via the panel. Reason: avoids the antimeridian-wrap artifact and matches user intuition of "show me a planet." Equirectangular's polygon-splitting fix is deferred (no consumer needs it yet). | BP 2 redirect, 2026-05-26 |
| 19 | **GUI: vanilla HTML panel for now.** Tweakpane v4's type packaging is broken (imports from `@tweakpane/core` which isn't an installed dep). Costs zero deps; user can swap to lil-gui or fix Tweakpane later. | BP 2 redirect, 2026-05-26 |
| 20 | **`oceanFraction` (GURPS-style hydrographic coverage) is a generation param.** Implemented as a post-hoc quantile shift on raw elevation: pick the threshold value that puts exactly `floor(N * oceanFraction)` regions below sea level, shift the field so that becomes 0, then normalize positive/negative sides to [-1, 1] independently. Default 0.60. | BP 3 redirect, 2026-05-26 |
| 21 | **`numPlates` is a generation param exposed in the panel.** Default 12. Range 2–30 enforced UI-side. Engine clamps to `[2, numRegions]`. | BP 3 redirect, 2026-05-26 |
| 22 | **Render modes are first-class engine concepts, not just palettes.** Each mode (`dots`, `cells`, `plates`, `elevation`, `satellite`) takes its data from a specific WorldState layer; modes that need a layer the engine hasn't produced fail gracefully (render nothing). This decouples render-mode growth from engine-pass growth — future weather modes (`temperature`, `wind`, etc.) plug into the same dispatch without touching the canvas core. | Implementation note, 2026-05-26 |
| 23 | **Boundary elevation BFS attenuation params (depth=6, decay=0.7) are constants for now, not generation params.** Kept simple; revisit if coastline shape quality becomes a redirect target. | BP 3 redirect 2026-05-26, user said "not closed off later" |

## 5. Open decisions (the next questions to answer)

All architectural / scoping questions are resolved through BP 3. Anything new should be filed as a fresh entry under §4 (with date) once decided.

Likely places for the next decisions: BP 4 (after Phase 7 currents+rivers) — overlay styling, weather animation cadence, mode subset. Phase 6 (weather) itself may surface a few minor decisions about scalar field calibration ranges.

## 8. Next concrete actions

Phases 0–5 of [`plans/plan1.md`](plans/plan1.md) are landed. Up next:

1. **Phase 6 — weather core** (~3 dev-days, ~4–6 hours active for the AI). Modules to add: `simulate/temperature.ts`, `simulate/humidity.ts`, `simulate/wind.ts`, `simulate/clouds.ts`. **Tangent-frame `[east, north]` storage for wind** (decision 10), **area-weighted neighbor diffusion** (decision 13) — both baked into module-first-version, not retrofitted. Add render modes: climate, temperature, humidity, clouds.
2. **Phase 7 — currents + rivers** (~3 days). Includes analytical re-derivation of current vectors (decision 10) and the dual rivers exposure: per-edge `riverflow` + per-region `riverPresence` (decision 15).
3. **Phase 8 — serialization to contract** (~1.5 days). Engine emits manifest + blobs; studio gets save/load. Load-determinism test (decision 12).
4. **Phase 9 — apps/service HTTP wrapper** (~1 day).
5. **BP 4** lands after Phase 7 — full sim visible.
6. **BP 5** lands after Phase 9 — pre-merge gate.

## 6. Where things live

```
/home/lentulus/projects/
├── WorldMaps/                              ← this project
│   ├── README.md
│   ├── HANDOVER.md                         ← you are here
│   ├── LICENSE                             ← MIT
│   ├── package.json, tsconfig*.json, …     ← root workspace config
│   ├── plans/
│   │   └── plan1.md                        ← implementation/testing plan (reported against)
│   ├── docs/
│   │   ├── world-contract.md               ← authoritative contract spec
│   │   └── WORLDS_API_REQUESTS.md          ← change-request template
│   ├── reports/                            ← scoping decisions inform the design
│   │   ├── realistic-planet-generation-evaluation.md
│   │   ├── typescript-port-evaluation.md
│   │   └── client-server-architecture.md
│   ├── packages/
│   │   ├── world-contract/                 ← published types, JSON schema, validators
│   │   │   ├── src/{identity,manifest,layer,annotation,resource,ids,codec,validation,schema}.ts
│   │   │   └── schema/world-manifest.schema.json
│   │   ├── world-engine/                   ← generator, runs in a Web Worker by default
│   │   │   └── src/{state,rng,generate,worker,worker-protocol}.ts
│   │   │       + geom/{projections,sphere,voronoi}.ts
│   │   │       + generate/{plates,elevation}.ts
│   │   └── world-renderer/                 ← Canvas2D, projections, palettes, modes
│   │       └── src/{canvas,palette,types}.ts
│   └── apps/
│       ├── studio/                         ← Vite app: panel + worker + renderer wired
│       │   └── src/{main,panel,vite-env.d}.ts + index.html + vite.config.ts
│       └── service/                        ← HTTP wrapper (Phase 9, currently stub)
├── mapsamples/
│   └── realistic-planet-generation-and-simulation/   ← reference impl, do not modify
├── MeridianWorlds/                         ← example downstream consumer
│   ├── meridian/                           ← boundary module pattern to mirror
│   │   └── API_REQUESTS.md
│   └── docs/meridian_contract.md
└── ColonyModels/                           ← sibling project, similar layout
```

## 7. What to do when you re-enter a session

1. Read this file.
2. Read [`plans/plan1.md`](plans/plan1.md) — that's the spec progress is reported against.
3. `git log --oneline -20` for what's landed since the last update of this file.
4. `npm install && npx vitest run` to verify the test suite is still green (currently 92).
5. Run the studio: `cd apps/studio && npx vite` — open `http://127.0.0.1:5173/`. Should see an orthographic globe.
6. If §5 lists decisions as open, confirm with the user before assuming.
7. **Update this file at the end of any non-trivial session.** New decisions go in §4 with the date.
