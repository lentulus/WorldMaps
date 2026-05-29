# WorldMaps — Handover

**Purpose of this file:** a re-entry point when a session is cut short. Read top-to-bottom in two minutes and you should know where the project is, what has been decided, and what the next decision is.

**Last updated:** 2026-05-29 (Bundle A renderer polish + disk persistence landed; next: ISEA projection + JPEG export)

---

## 1. What WorldMaps is

A project to (a) procedurally generate world maps and (b) provide tooling to annotate them. WorldMaps is intended to be the **canonical owner** of generated worlds; downstream consumers ("Meridian\* projects") load worlds and overlay their own annotations (borders, settlements, factions, names, etc.).

The relationship to consumers is the same pattern already in use between [`Meridian`](../../projects/Meridian) (canonical starfield) and [`MeridianWorlds`](../../projects/MeridianWorlds) (consumer with a read-only boundary module + `API_REQUESTS.md`). See [reports/client-server-architecture.md](reports/client-server-architecture.md) for the concrete proposal.

## 2. Current status

- **Phase:** end of plan1.md. Phases 0–9 of [`plans/plan1.md`](plans/plan1.md) are done; **BP 2** (first interface), **BP 3** (terrain visible), and **BP 4** (full sim visible) all reached, redirects absorbed. **BP 5** (pre-merge gate, tagged release) is the next breakpoint.
- **What works end-to-end:** studio → Web Worker → engine → renderer. Engine produces Fibonacci sphere → Voronoi topology (with cached per-cell area) → tectonic plates (BFS flood) → elevation (plate-motion convergence + hotspots + ocean-fraction quantile shift) → weather (temperature insolation+lapse, banded zonal wind in tangent-frame, **humidity = semi-Lagrangian wind advection + area-weighted diffusion + Dirichlet ocean sources**, clouds humidity+orographic lift) → currents (Ekman-deflected wind in tangent-frame, ocean cells only) → rivers (D8 downhill routing on Voronoi mesh; per-edge `riverflow` + derived per-region `riverPresence`). Renderer supports orthographic (default) and equirectangular projections, modes: `dots`, `cells`, `plates`, `elevation`, `satellite`, `temperature`, `humidity`, `clouds`, `currents`, `rivers` (lines), `climate`. Overlay: `showCurrentArrows` toggle works over any mode. ~100 ms generation at N=2048 in the worker; UI never blocks.
- **Tests:** 141 passing under `vitest run` (Phase 8 added 6 acceptance tests in [`packages/world-engine/src/serialize.test.ts`](packages/world-engine/src/serialize.test.ts); Phase 9 + BP 5 added 12 in [`apps/service/src/server.test.ts`](apps/service/src/server.test.ts)).
- **Reference implementation studied:** [`freezedriedmangos/realistic-planet-generation-and-simulation`](https://freezedriedmangos.github.io/realistic-planet-generation-and-simulation/) (p5.js). Local copy: [`/home/lentulus/projects/mapsamples/realistic-planet-generation-and-simulation`](../mapsamples/realistic-planet-generation-and-simulation). Treated as **algorithm reference, not a fork base**.
- **Implementation language:** **TypeScript** — committed.
- **Save/load works:** studio Save world button packs the engine's manifest + blobs into a `worldmap-<id>.zip`; Load reads any prior save back and re-renders. The first user of the `LayerDomain = 'edge'` discriminator (`riverflow`) ships in the manifest. Load-determinism guaranteed per decision 12 (acceptance test in serialize.test.ts).
- **HTTP service runnable:** `npm start --workspace=apps/service` exposes the engine on port 8787. Endpoints match arch §6 exactly (`POST /worlds`, `GET /worlds/:id/manifest`, `GET /worlds/:id/layers/:name`, `GET /worlds/:id/topology/:piece`). All blob responses set `ETag = sha256` and `Cache-Control: immutable`. CORS is open (`Access-Control-Allow-Origin: *`); responses are gzipped when the client sends `Accept-Encoding: gzip`. Storage is in-memory only — no disk persistence in v1.
- **Next:** **plan1 is closed.** Tag `v0.1.0` cut at this commit. Next concrete work is whatever the first downstream consumer (likely the MeridianWorlds boundary module) needs; until that pins to the contract, schema can still change.

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
| 24 | **Per-cell spherical area cached on `Topology` (`cellArea: Float32Array`).** Computed once in `buildTopology`, transferred to the worker boundary, and used as weights by `simulate/diffusion.ts`. Future passes (Phase 7+) read it directly instead of recomputing. | Phase 6 implementation 2026-05-26 |
| 25 | ~~**Wind-driven advection deferred from Phase 6.**~~ **REVERSED at BP 4** — see decision 29. Original wording kept for the audit trail: "Humidity uses pure area-weighted diffusion with re-pinned ocean sources. The Voronoi-mesh advection kernel is enough work to deserve its own pass." Reversed because Phase 8 freezes contract bytes (decision 12) and we'd rather ship post-advection humidity in v1 than pin pre-advection forever. | Phase 6 implementation, reversed BP 4 2026-05-26 |
| 26 | **Currents are scaled, Ekman-deflected wind on ocean cells only** — tangent-frame `[east, north]` per region, deflection angle `−sin(lat) · 30°` (right-of-wind in N, left in S, zero at equator), magnitude `0.04 · wind`. Land cells store `(0, 0)`. No closed gyres without continent boundaries; the user-facing "chirality" property the tests verify is the Ekman deflection sense, not basin rotation. Decision 10's "analytical re-derivation per ISEA face" reduces to "compute per-region from the scalar/vector fields, do not store in `[dlat, dlon]`" — that is what we do. | Phase 7 implementation 2026-05-26 |
| 27 | **Rivers use D8-style downhill routing on the Voronoi mesh.** Each land cell's downstream is its strictly-lower-elevation neighbor with minimum elevation; cells with no lower neighbor are sinks and water disappears in v1 (no lake filling). Precipitation per cell is `humidity[r] · cellArea[r]`. Cells are processed in decreasing-elevation order so accumulation is single-pass. `riverPresence[r]` is `(maxIncidentFlow / globalMax) ^ 0.5` — sqrt ramp chosen so tributaries stay visible alongside trunk rivers. The γ ramp is a candidate BP 4 redirect target (default ramp is fairly muted at low-to-mid N). | Phase 7 implementation 2026-05-26 |
| 28 | **`WorldState.numEdges` is mirrored from `topology.numEdges` at creation time.** First edge-domain layer (`riverflow`) needed a size, and exposing it on `WorldState` matches the contract's `LayerDomain = 'edge'` discriminator and keeps consumers from having to reach through `topology`. | Phase 7 implementation 2026-05-26 |
| 29 | **Humidity now ships with wind-driven advection (reverses decision 25).** Implemented as a semi-Lagrangian step per iteration, interleaved with area-weighted diffusion: each cell samples its upstream cell along the local wind direction (greedy neighbor descent on dot-product against the displaced target unit vector). Unconditionally stable, costs ~O(N · avgDeg) per step like diffusion. Driver was BP 4: pure-diffusion humidity hid windward/leeward asymmetry, and Phase 8 freezes contract bytes (decision 12) — pre-advection humidity in v1 would be permanent. | BP 4 redirect 2026-05-26 |
| 30 | **Rivers render as edge lines, not per-region tint.** The previous per-region `riverPresence` tint (decision in canvas.ts before BP 4) was too muted at default N. Rendering switched to: satellite base + per-edge line stroke with width/alpha scaled by `sqrt(normalized riverflow)`, threshold `nf > 0.01`. Per-region `riverPresence` is still emitted in `WorldState` because the contract advertises it (decision 15) and consumers may prefer the scalar form. | BP 4 redirect 2026-05-26 |
| 31 | **Current arrows are an independent overlay toggle, not tied to mode.** Studio panel exposes a `current arrows` checkbox; when on, the renderer draws short arrows (subsampled, every 16th ocean cell by default) on top of WHATEVER cell pass is active. Implementation: cell centre + great-circle tip displaced along the current direction in 3D, both projected; works in equirectangular and orthographic. Cell-tint mode `currents` is kept as a magnitude legend; arrows complement it. | BP 4 redirect 2026-05-26 |
| 32 | **Studio N cap raised from 5,000 → 1,000,000** with a yellow warning past 100,000 that displays an estimated generation time (extrapolated linearly from N=2048 → ~80 ms, so ~40 µs/cell). The cap was an arbitrary UI guard; no engine constraint. Past 100k the single-threaded worker blocks visibly, so the warning makes that trade-off explicit. | BP 4 redirect 2026-05-26 |
| 33 | **Topology CSR blobs encode `offsets` then `flat` in a single ResourceRef** (one for `neighbors`, one for `cellVertices`). Loader knows `numRegions` from the manifest, so `offsets` length is implicit and `flat` length follows from `offsets[numRegions]`. Reason: the Phase 1 contract types model each topology piece as a single ResourceRef, so splitting CSR into two refs would require a contract revision (cheaper to encode the seam instead). | Phase 8 implementation 2026-05-29 |
| 34 | **`worldId` is a UUID v4** generated via `crypto.randomUUID()` at serialize time (prefixed `w_`). Two saves of the same in-memory `WorldState` therefore produce distinct `worldId`s, matching decision 12's "worldId assigned at creation, not derived from `(seed, params, version)`". | Phase 8 implementation 2026-05-29 |
| 35 | **Studio packs saves as a `.zip` via `fflate`** (~10 KB dep, isomorphic Node/browser). Layout inside the archive matches the contract `url`s exactly: `manifest.json` at root, `layers/<name>.bin`, `topology/<piece>.bin`. The HTTP service in Phase 9 will serve the same files unzipped, so consumers see the same paths in either delivery channel. | Phase 8 implementation 2026-05-29 |
| 36 | **Blob endianness is host-native** (typed-array buffers written/read as-is). Decision 12 promises *load determinism*, not portable byte-identity; revisit if a cross-arch consumer appears. | Phase 8 implementation 2026-05-29 |
| 37 | **Service uses Node's built-in `http` module — no Express/Fastify.** Surface is small enough (5 routes, regex match) that a dependency would be bigger than the code. Revisit if middleware needs (auth, CORS, rate-limit) accumulate. | Phase 9 implementation 2026-05-29 |
| 38 | **Service stores worlds in memory only (`Map<worldId, SerializedWorld>`).** Restart loses everything. Disk persistence is deferred — the contract format is identical on-disk, so a future `--worlds-dir` flag is a localized change. Driver: no consumer requires durable storage yet, and Phase 9 was sized for "engine runnable as a service," not "production data store." | Phase 9 implementation 2026-05-29 |
| 39 | **Blob responses set `Cache-Control: public, max-age=31536000, immutable` alongside `ETag = sha256`.** Arch §6 explicitly allows indefinite caching since blobs are immutable; setting the long max-age makes that the default browser behavior without consumers having to opt in. | Phase 9 implementation 2026-05-29 |
| 40 | **Blob compression lives at the HTTP layer (`Content-Encoding: gzip`), not in the contract.** Service gzips responses when the client sends `Accept-Encoding: gzip`; raw bytes on disk and in studio zips stay uncompressed. Reason: layer blobs are float arrays with ~20–30% entropy headroom — small win, and contract-level encoding would force a MINOR schema bump. Revisit if a consumer needs smaller on-disk footprint. | BP 5 prep 2026-05-29 |
| 41 | **Service stays in-memory in v1; disk persistence deferred.** The on-disk layout already exists (studio zip), so a future `--worlds-dir` flag is a localized change. No consumer needs durable storage yet. | BP 5 prep 2026-05-29 (confirms decision 38) |
| 42 | **Service sends `Access-Control-Allow-Origin: *` on every response.** Lets the studio (or any browser-side tool) call a remote service. Service is currently 127.0.0.1-bound, so the practical impact today is dev-mode. No `Access-Control-Allow-Credentials` — pure read/write of public worlds. | BP 5 prep 2026-05-29 |
| 43 | **Tag v0.1.0 marks plan1 complete.** Pre-1.0 explicitly preserves the right to break the schema before a downstream consumer pins; v1.0.0 will be cut when the first MeridianWorlds boundary module locks in. Per decision 7 semver, once v1.0.0 ships, breaking changes become MAJOR. | BP 5 prep 2026-05-29 |

## 5. Open decisions (the next questions to answer)

All architectural / scoping questions are resolved through BP 5 (decisions 40–43 close blob compression, persistence, CORS, and release tagging). Anything new should be filed as a fresh entry under §4 (with date) once decided.

Likely places for the next decisions: the **MeridianWorlds boundary module** (first contract consumer) and any redirects that come back from it — that's what will push the schema toward `v1.0.0`.

## 8. Next concrete actions

`plans/plan1.md` is fully landed; `v0.1.0` tagged. **Post-v0.1.0 priority sequence agreed 2026-05-29** after user reviewed the running studio:

1. **Bundle A — Renderer polish (landed 2026-05-29).** All three items complete.
   - **R1 ✓:** Hypsometric elevation palette in `packages/world-renderer/src/palette.ts`. Mountain ranges read as a cool-gray rock band (e ∈ [0.65, 0.85]) against warmer tan/green land, with a pale-sand strip at sea level and snow peaks above 0.85.
   - **R2 ✓:** Graticule overlay (equator solid yellow, tropics dashed gold, polar circles dashed light-blue, meridians every 30° gray, N/S pole labels). Panel toggle `graticule` defaults ON. Works in both projections. Implemented in `canvas.ts` (`drawGraticule` + `strokeParallel` + `strokeMeridian`).
   - **R3 ✓:** Diagnosed and documented (no code fix). White spirals at very high N are sub-pixel Canvas2D AA + Fibonacci point draw-order; not a generation bug. Existing N>100k warning now mentions the rendering artifact. See `project_high_n_spiral_artifact` auto-memory for the mechanism and the cheap mitigation path (adaptive dots-on-overflow in canvas.ts) if it becomes a complaint.
   - **Side change:** `currents` mode and `current arrows` overlay removed from the studio UI pending physics revision (user judged Ekman-deflected wind model from decision 26 too rough to publish). Engine still computes currents and serializes them in the contract — re-enabling is a UI-only edit. See `project_currents_hidden_until_physics_fix` auto-memory.
   - **Side change:** Default `numRegions` raised 512 → 5000 in `apps/studio/src/main.ts` (5000 = minimum useful detail at typical viewport size).
2. **Disk persistence (`--worlds-dir`) in `apps/service` ✓ (landed 2026-05-29).** New `apps/service/src/disk.ts` writes each stored world to `<worldsDir>/<worldId>/{manifest.json,layers/<name>.bin,topology/<piece>.bin}` — the **exact** layout the studio zip uses (decision 35), so a user can unzip a `worldmap-*.zip` straight into `<worldsDir>/<worldId>/` and the service picks it up. `WorldStore` gains a `worldsDir` option + async `init()` that eager-loads any pre-existing worlds at startup. `createService({ worldsDir })` wires it through; CLI parses `--worlds-dir <path>` (or `WORLDS_DIR` env). Test coverage in `server.test.ts` exercises full write+restart+reload round-trip. **Important:** worlds are loaded into memory at startup — fine for v1 (<100 worlds), would need lazy load on miss if scale grows. Tag decisions 38/41 satisfied.
3. **Snyder ISEA projection + flat-map JPEG export at configurable resolution.** Renderer-only, **standalone deliverable** — not gated on MeridianWorlds merge (see ship-gate auto-memory). Connects to decisions 5, 10, 11, 16.
4. **Annotations side of the contract** — consumer-owned borders (`EdgeId[]` per decision 9), settlements, names against `worldId`s. Contract-touching; gated on MeridianWorlds merge for `v1.0.0` semantics but design can begin earlier.
5. **MeridianWorlds boundary module** — the actual contract pin that triggers `v1.0.0`. May force redirects on (4).

**Deferred:**
- **R4** (equirectangular polygon-splitting fix from decision 18). Recommended drop: ISEA is becoming the preferred flat projection, and equirect can stay as the ugly fallback. Revisit only if a use case for equirect specifically resurfaces.

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
│   │   │   └── src/{state,rng,generate,worker,worker-protocol,serialize}.ts
│   │   │       + geom/{projections,sphere,voronoi}.ts
│   │   │       + generate/{plates,elevation}.ts
│   │   │       + simulate/{diffusion,temperature,wind,humidity,clouds,currents,rivers}.ts
│   │   └── world-renderer/                 ← Canvas2D, projections, palettes, modes
│   │       └── src/{canvas,palette,types}.ts
│   └── apps/
│       ├── studio/                         ← Vite app: panel + worker + renderer wired
│       │   └── src/{main,panel,persistence,vite-env.d}.ts + index.html + vite.config.ts
│       └── service/                        ← HTTP wrapper (Phase 9)
│           └── src/{index,server,store}.ts
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
4. `npm install && npx vitest run` to verify the test suite is still green (currently 137).
5. Run the studio: `cd apps/studio && npx vite` — open `http://127.0.0.1:5173/`. Should see an orthographic globe; the mode dropdown lists climate / satellite / elevation / temperature / humidity / clouds / currents / rivers / plates / cells / dots. Save / Load buttons under "World file".
6. Run the service: `npm start --workspace=apps/service` (default port 8787). `POST /worlds` to generate; `GET /worlds/:id/manifest` etc. to retrieve.
6. If §5 lists decisions as open, confirm with the user before assuming.
7. **Update this file at the end of any non-trivial session.** New decisions go in §4 with the date.
