# WorldMaps — Handover

**Purpose of this file:** a re-entry point when a session is cut short. Read top-to-bottom in two minutes and you should know where the project is, what has been decided, and what the next decision is.

**Last updated:** 2026-05-24 (all open questions resolved through Q&A rounds 1–3)

---

## 1. What WorldMaps is

A project to (a) procedurally generate world maps and (b) provide tooling to annotate them. WorldMaps is intended to be the **canonical owner** of generated worlds; downstream consumers ("Meridian\* projects") load worlds and overlay their own annotations (borders, settlements, factions, names, etc.).

The relationship to consumers is the same pattern already in use between [`Meridian`](../../projects/Meridian) (canonical starfield) and [`MeridianWorlds`](../../projects/MeridianWorlds) (consumer with a read-only boundary module + `API_REQUESTS.md`). See [reports/client-server-architecture.md](reports/client-server-architecture.md) for the concrete proposal.

## 2. Current status

- **Phase:** early scoping. No code in `WorldMaps/` itself yet — only `README.md`, this handover, and `reports/`.
- **Reference implementation studied:** [`freezedriedmangos/realistic-planet-generation-and-simulation`](https://freezedriedmangos.github.io/realistic-planet-generation-and-simulation/) (p5.js). Local copy: [`/home/lentulus/projects/mapsamples/realistic-planet-generation-and-simulation`](../mapsamples/realistic-planet-generation-and-simulation). Treated as **algorithm reference, not a fork base**.
- **Implementation language:** **TypeScript** is the current candidate, not finalized.

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

## 5. Open decisions (the next questions to answer)

All architectural / scoping questions from the three reports are resolved as of 2026-05-24 round 3. Anything new should be filed as a fresh entry under §4 (with date) once decided.

## 8. Next concrete actions

The scoping/decision phase is closed. What's actually unblocked now:

1. **Land `packages/world-contract/`** — TypeScript types + manifest schema + `docs/world-contract.md`. Per client-server-architecture.md §9 Phase A, this is the unblocker for MeridianWorlds's parallel work on its `worlds/` boundary module.
2. **Add `docs/WORLDS_API_REQUESTS.md`** — change-request template, mirroring [`MeridianWorlds/meridian/API_REQUESTS.md`](../MeridianWorlds/meridian/API_REQUESTS.md).
3. **Begin engine port** — ~20 days behavioral parity + quality fixes. Web Worker scaffolding from day one (decision 17).
4. **Renderer scaffold with adaptive subdivision in mind** (decision 16). Don't commit to a fixed ISEA depth (decision 11) — keep it configurable.

## 6. Where things live

```
/home/lentulus/projects/
├── WorldMaps/                  ← this project (early scoping)
│   ├── README.md
│   ├── HANDOVER.md             ← you are here
│   └── reports/
│       ├── realistic-planet-generation-evaluation.md
│       ├── typescript-port-evaluation.md
│       └── client-server-architecture.md
├── mapsamples/
│   └── realistic-planet-generation-and-simulation/   ← reference impl, do not modify
├── MeridianWorlds/             ← example downstream consumer (existing pattern to mirror)
│   ├── meridian/               ← boundary module to upstream
│   │   └── API_REQUESTS.md     ← change-request template
│   └── docs/meridian_contract.md
└── ColonyModels/               ← sibling project, also client/server/shared layout
```

## 7. What to do when you re-enter a session

1. Read this file.
2. If the next task is implementation-related, also skim the three reports under `reports/`.
3. Check `git log --oneline -20` to see what (if anything) has happened since this was last updated.
4. If decisions in §5 still read as open, they probably are — confirm with the user before assuming any of them.
5. Update this file at the end of any non-trivial session.
