# Plan 1 — WorldMaps implementation + testing

**Created:** 2026-05-26
**Status:** Proposed — awaiting user approval (first/second ask outstanding)
**Source conversation:** initial implementation planning, 2026-05-26
**Companion docs:** [`HANDOVER.md`](../HANDOVER.md), [`reports/typescript-port-evaluation.md`](../reports/typescript-port-evaluation.md), [`reports/client-server-architecture.md`](../reports/client-server-architecture.md), [`reports/realistic-planet-generation-evaluation.md`](../reports/realistic-planet-generation-evaluation.md)

This file is the **reporting baseline** for implementation. Update progress against the phases below; do not rewrite the plan — propose changes via a fresh `plan2.md` if redirection is large.

---

## Guiding constraints (lifted from HANDOVER §4 decisions)

- **world-contract lands first** — Phase A unblocks MeridianWorlds in parallel (arch §9). Cheapest revision point.
- **Quality fixes ship with v1, not later** — decisions 10 + 13. Tangent-frame vectors and area-weighted neighbor math are baked into the relevant module's first commit, not retrofitted.
- **Web Worker scaffolding day one** — decision 17. Message-passing seam is in place before any sim code runs in it.
- **ISEA depth/aperture stay parameter-driven** — decision 11. No defaults baked into engine or renderer.
- **Load determinism only, not generation determinism** — decision 12. Tests assert *re-load equals original*, not *same seed equals same world across machines*.

## Testing posture

- Favor computer-evaluated tests over human visual inspection (user preference).
- Human breakpoints exist for **subjective interface judgment** and **redirect opportunities**, not for regression catching.
- Each phase lists its computer tests inline — these are the acceptance criteria for that phase.
- Cross-cutting infra (test fixtures, canvas-hash helpers, float tolerance helpers) is built in phase 2/3 and reused thereafter.

---

## Phases

### Phase 0 — Scaffolding (~0.5 day)

Monorepo: `packages/world-contract`, `packages/world-engine`, `packages/world-renderer`, `apps/studio`, `apps/service`. Vite + TS strict (`noUncheckedIndexedAccess: true`) + Vitest + ESLint. Empty app boots, renders nothing.

**Computer tests:**
- `tsc --noEmit` clean across all packages
- `vitest run` runs zero tests successfully
- `vite build` produces a static bundle

**Visible output:** none.

### Phase 1 — `world-contract` package (~1 day)

All TS types from arch §4 (`WorldIdentity`, `WorldManifest`, `LayerDescriptor`, anchors) + JSON-schema for the manifest + `docs/world-contract.md` + `docs/WORLDS_API_REQUESTS.md` template.

**Computer tests:**
- Manifest JSON-schema validates a hand-written fixture manifest
- Hand-written fixture manifest + fake blob round-trips through `encode/decode` to byte equality
- `LayerDescriptor` discriminants exhaust at type level (no `never` leak)

**Visible output:** none.

### ⏸ BREAKPOINT 1 — Contract review (ask twice)

User reads published types + `docs/world-contract.md` and confirms shape **before** anything depends on it. Cheapest possible revision point; expensive later when MeridianWorlds pins to it.

---

### Phase 2 — Engine scaffold + state + sphere + projections (~1.5 days)

Worker boundary in place from first commit: studio posts `{seed, params}` to a worker, gets back a `WorldState` over `transferable`. State uses interleaved `Float32Array` for tuples, one typed array per scalar field (per ts-port §6).

Modules: `state.ts`, `rng.ts`, `geom/projections.ts`, `geom/sphere.ts`.

**Computer tests:**
- Projection round-trips: `equirectangular(inv(equirectangular(p))) ≈ p` within tolerance, same for stereographic; tested at equator, mid-latitudes, ε from each pole
- Fibonacci sphere: requested vs actual region count, all `lat ∈ [-90, 90]`, all `lon ∈ [0, 360)`, no NaN, pairwise minimum-distance lower bound
- RNG: same seed → same sequence within a process (the only determinism we promise per decision 12)
- Worker round-trip: post `{seed, params}`, receive a `WorldState` of expected shape with zero-copy (sender buffers detached)

**Visible output:** none yet — points exist in memory but no renderer.

### Phase 3 — Voronoi via d3-delaunay + pole closure (~1 day)

`geom/voronoi.ts`. Adjacency built directly in CSR (`offsets`, `flat`) into typed arrays — same shape as the contract demands, so engine internal repr matches export repr.

**Computer tests:**
- Every region has ≥3 neighbors (or document the exception cell)
- No region has null/undefined neighbors (south-pole regression test per ts-port §9)
- Adjacency symmetric: `r ∈ neighbors(s) ⇒ s ∈ neighbors(r)`
- Sum of spherical cell areas ≈ 4π within tolerance (also the area test the later area-weighting work depends on)

**Visible output:** none yet.

### Phase 4 — Renderer scaffold + first visible output (~1 day)

Canvas2D primitives, equirectangular projection, two render modes only: **dots** (centroids) and **cells** (filled Voronoi colored by RegionId). Tweakpane wired to `numRegions`, `seed`. Adaptive subdivision not implemented yet but renderer is structured with projection + mesh as separate inputs so it can be added without re-architecting (decision 16).

**Computer tests:**
- Canvas snapshot at low resolution: render `N=64`, hash the `ImageData`, assert against checked-in baseline
- "Mode switch produces different pixels" smoke test

**Visible output:** ✅ **FIRST GENERATED IMAGES** — dots + colored Voronoi cells on canvas.

### ⏸ BREAKPOINT 2 — First interface (ask twice)

**High-value redirect point.** Until now: only types and tests. Now: panel, canvas, two modes, Voronoi diagram colored by id. Per "anticipate changes once user sees the interface" — expected change classes:

- Projection wrong / want a different default
- Cell coloring scheme unhelpful
- Tweakpane layout / labels
- Resolution defaults wrong for user's screen
- Camera / pan / zoom expectations
- Aspect ratio, padding, background color

Cheaper to absorb here than after terrain + weather are wired into the same render path.

---

### Phase 5 — Terrain: plates + elevation (~2 days)

`generate/plates.ts`, `generate/elevation.ts`. BFS plate flood, plate-collision elevation per reference. Render modes: Plates, Elevation, Satellite.

**Computer tests:**
- `numPlates === seedCount`, all regions assigned a plate id (no -1)
- Elevation range: `min ≥ -1`, `max ≤ 1`, no NaN
- Golden-master at `N=128, seed=fixed`: hash of `elevation` Float32Array + `plate` Int32Array against baseline; re-run gives byte-identical buffers
- Boundary smoke test: collision-flagged region pairs straddle at least one plate boundary

**Visible output:** recognizable terrain — first time the world looks like a world.

### ⏸ BREAKPOINT 3 — Terrain visible (ask twice)

Likely redirects: palette, mountain visualization, plate boundary rendering, "continents should look more like X."

---

### Phase 6 — Weather core: temp, humidity, wind, clouds (~3 days)

`simulate/{temperature, humidity, wind, clouds}.ts`. **From this phase on:**
- `wind` stored in tangent-frame `[east m/s, north m/s]` (decision 10), not `[dlat, dlon]`
- Diffusion / neighbor averaging use area-weighted kernels (decision 13)

Both baked into module's first version, not retrofitted.

**Computer tests:**
- Conservation/bounds: temperature, humidity, clouds in documented ranges across N ticks; no NaN, no `Infinity`
- Steady-state symmetry: zero-topography world has average temperature monotone in `|lat|`
- Area-weighting verification: constant scalar field stays constant under one diffusion step (non-area-weighted code fails this near the poles — this is the test that proves the fix)
- Tangent-frame verification: synthetic eastward wind has constant magnitude across all latitudes (`[dlat, dlon]` storage would diverge near the poles)
- Golden-master tick: `N=128, seed=fixed`, 50 ticks, hash all weather arrays vs baseline

**Visible output:** weather modes (Climate, Temperature, Humidity, Clouds).

### Phase 7 — Currents + rivers (~3 days)

`simulate/currents.ts` (analytical re-derivation per decision 10), `simulate/rivers.ts` (per-edge `riverflow` AND per-region `riverPresence` per decision 15).

**Computer tests:**
- Hemisphere chirality preserved: northern band currents rotate CW around gyre centers, southern CCW
- River flow non-negativity; conservation along non-source edges within tolerance
- `riverPresence[r]` derives reproducibly from `riverflow[]` + topology (re-derivation in a test matches engine output)
- Golden-master extension of phase 6

**Visible output:** ocean gyres mode, river overlay.

### ⏸ BREAKPOINT 4 — Full sim visible (ask twice)

All 15 reference render modes selectable. Likely redirects: overlay styling, GUI grouping, mode labels, animation cadence of weather loop, "I don't actually need mode X."

---

### Phase 8 — Serialization to contract + studio export (~1.5 days)

Engine emits `WorldManifest` + binary blobs matching phase-1 contract exactly. Studio gets "Save world" action; loader can re-read its own output.

**Computer tests:**
- **Load determinism** (decision 12): generate → serialize → deserialize → re-render → byte-identical canvas hash
- Re-load: read serialized world from disk *N* times, assert byte equality across reads
- Manifest validates against phase-1 JSON schema
- All `sha256` hashes in manifest match actual blob bytes
- New `worldId` per generation: two saves with same params produce distinct ids (decision 12)

**Visible output:** save/load round-trip in studio.

### Phase 9 — `apps/service` HTTP wrapper (~1 day)

Endpoints per arch §6. Same engine binary, two delivery paths (Worker + HTTP).

**Computer tests:**
- Per-endpoint contract test: correct `Content-Type`, `ETag = sha256` for blobs, immutability (same `worldId` + path returns byte-identical body across requests)
- Concurrent generation safety: parallel `POST /worlds` produce distinct `worldId`s, no cross-contamination
- End-to-end: spin up service in test, run consumer-style loader against it, full manifest + every layer round-trips

**Visible output:** service runnable as separate process.

### ⏸ BREAKPOINT 5 — Pre-merge gate (ask twice)

Everything done, tests green, studio + service runnable. Review pass, HANDOVER.md update, first tagged release.

---

## Cross-cutting test infrastructure (built in phase 2/3, reused thereafter)

- **Test world fixtures**: `tinyWorld(N=64)`, `smallWorld(N=128)` — fixed seed, cheap enough that golden-master snapshots are fast
- **Canvas hash helper**: render to off-screen canvas, hash `ImageData`. Used for every "did the picture change?" assertion
- **Tolerance helpers**: `expectClose(a, b, eps)` for float arrays
- **No mocks for typed arrays / projections / RNG**: real implementations are fast enough that mocking introduces drift risk for zero benefit

**Intentionally not automated:** subjective visual quality of rendered worlds. Computer tests catch *regressions* (snapshot hashes); they do not validate aesthetic intent. That's the role of the human breakpoints.

---

## Effort summary

| Phase | Days | Cumulative | First visible output? |
|---|---:|---:|---|
| 0. Scaffolding | 0.5 | 0.5 | no |
| 1. world-contract | 1.0 | 1.5 | no |
| 2. Engine scaffold + sphere + worker | 1.5 | 3.0 | no |
| 3. Voronoi | 1.0 | 4.0 | no |
| **4. Renderer scaffold (BP 2)** | **1.0** | **5.0** | **✅ first images** |
| 5. Terrain (BP 3) | 2.0 | 7.0 | recognizable terrain |
| 6. Weather core | 3.0 | 10.0 | climate modes |
| 7. Currents + rivers (BP 4) | 3.0 | 13.0 | gyres, rivers |
| 8. Serialization | 1.5 | 14.5 | save/load |
| 9. Service (BP 5) | 1.0 | 15.5 | HTTP service |
| Slack / interface revisions absorbed at breakpoints | 4.5 | **~20** | — |

Matches the ~20-day target from HANDOVER decision 13 *with* the breakpoint-driven revision budget baked in.

---

## Reporting against this plan

When reporting progress, reference phase numbers and explicitly note:
- Which computer tests passed / are pending
- Whether breakpoints were reached and what redirects were absorbed
- Any deviation from the phase scope and why
