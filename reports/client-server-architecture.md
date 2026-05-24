# Architecture: Client-Server Generation + Consumer-Facing World Contract

**Companion documents:** [realistic-planet-generation-evaluation.md](realistic-planet-generation-evaluation.md), [typescript-port-evaluation.md](typescript-port-evaluation.md)
**Date:** 2026-05-24

---

## 1. TL;DR

- Split WorldMaps into **three packages**: a **generation service** (heavy CPU, stateless, server-side), a **renderer** (browser, interactive), and a **world contract** (types + manifest schema + binary layer layout shared by both).
- The contract package is also the **public API surface** for downstream Meridian\* consumer projects. Same pattern already in use between `Meridian` and `MeridianWorlds`: upstream owns canonical data, consumer holds a thin read-only boundary module, schema changes go through a written `API_REQUESTS.md`.
- The on-the-wire format is a **JSON manifest + N binary layer blobs** (typed-array dumps). Binary blobs are projection-agnostic, indexed by `RegionId`, and stable for the lifetime of a `world_id`.
- Consumers attach annotations (borders, settlements, place names) as **their own layers in their own namespace**, referencing WorldMaps `RegionId` / Voronoi-edge ids. WorldMaps does not need to know they exist.
- The contract is **versioned** (`schema_version`) and **content-addressed** by `world_id = hash(seed, params, generator_version)`. A consumer that has previously loaded `world_id = abc123` can rely on every layer being identical on re-fetch — that is the property that makes downstream annotation storage safe.

---

## 2. Why this shape

Two pressures dictate the split:

1. **Generation is expensive, rendering is interactive.** A 5k-region world at parity with the reference impl is sub-second; a 50k-region ISEA world with the weather simulator running is not. Generation belongs off the UI thread (Web Worker at minimum, separate process for batch / pre-generated worlds).
2. **The same world will be consumed by multiple downstream projects.** MeridianWorlds is the known case (settlements, biomes-for-habitability, civilizational claims). The asterisk in "Meridian\*" implies more will follow. Each consumer needs:
   - **Stable references** into the world: a settlement pinned to region `r=4218` must still be on the same patch of ground next session.
   - **No requirement to run the generator** themselves to display a world.
   - **A schema they can code against** that won't silently change shape under them.

The Meridian → MeridianWorlds relationship already encodes the conventions: `STARFIELD_DB` is read-only from MeridianWorlds; the boundary lives in `meridian/api.py` + `meridian/models.py`; consumer-driven schema requests are written into `meridian/API_REQUESTS.md` using a template in `docs/meridian_contract.md`. The proposal below is the WorldMaps-shaped version of that same contract.

## 3. Package layout

```
WorldMaps/                    (monorepo, one git repo, three packages)
├── packages/
│   ├── world-contract/       PUBLISHED: types, manifest schema, layer codec
│   ├── world-engine/         server-side: generator + simulator
│   └── world-renderer/       browser: Canvas2D / WebGL renderer + GUI
├── apps/
│   ├── studio/               dev app: engine + renderer wired together
│   └── service/              HTTP service wrapping world-engine
└── docs/
    ├── world-contract.md     authoritative contract spec
    └── WORLDS_API_REQUESTS.md change-request template (mirrors meridian/API_REQUESTS.md)
```

The contract package is the only thing **Meridian\* consumers depend on**. They never depend on `world-engine` or `world-renderer`. A consumer that wants to render the base world inside its own app can either embed `world-renderer` (it also depends only on `world-contract`) or render the layers itself.

`world-engine` can be invoked three ways without changing the contract:
- in a Web Worker, transferring typed arrays — **default for v1** (HANDOVER decision 17), so the UI never blocks during generation;
- behind the HTTP service in `apps/service`, for batch generation or to serve pre-generated worlds;
- in-process for tests or CLI tools where a Worker would be overhead.

## 4. The World Contract

### 4.1 Identity

```ts
type WorldId = string; // e.g. "w_2026_a1b2c3..." — opaque, assigned at creation

interface WorldIdentity {
  worldId:           WorldId;
  schemaVersion:     string;  // semver, e.g. "1.0.0"
  generatorVersion:  string;  // semver of world-engine that produced it
  seed:              string;  // RNG seed used (informational; not an identity input)
  params:            GenerationParams; // fully-specified, no implicit defaults
  createdAt:         string;  // ISO-8601
}
```

**Identity is load-deterministic, not generation-deterministic.** `worldId` is assigned at world-creation time (UUID v4, or a content hash of the canonical byte stream — implementation detail). Once a `worldId` exists, its manifest and blobs are **immutable**; fetching them tomorrow returns byte-identical data to fetching them today. That is the property downstream Meridian\* projects rely on to store `{worldId, regionId}` pairs and trust them across sessions.

`worldId` is **not** a deterministic function of `(seed, params, generatorVersion)`. Two `POST /worlds` calls with the same parameters produce two distinct `worldId`s, each individually stable. Re-running the generator on a different machine, or after an engine update, is not expected to reproduce a prior world; if you need that world, fetch it by its `worldId`. This trades reproducibility-from-seed for a much simpler engine (no constraints on `Math.sin/cos`, RNG portability, etc.).

`schemaVersion` is the *contract* version (this document). `generatorVersion` is the *engine* version. They move independently: a generator change bumps `generatorVersion` but does not invalidate any existing `worldId` (those blobs are immutable). `schemaVersion` only bumps when the on-the-wire shape changes.

`seed` and `params` are kept in the identity record for **provenance / debugging**, not as identity inputs. A consumer can use them to attempt regeneration, but should not rely on the result matching.

### 4.2 Manifest

A single JSON document. Small (< 50 KB), cacheable, the only thing a consumer needs to bootstrap.

```ts
interface WorldManifest {
  identity: WorldIdentity;

  numRegions: number;
  numEdges:   number;

  // resolution / projection metadata
  resolution: {
    samplingMethod: "fibonacci" | "icosahedral";
    targetRegions:  number;       // requested
    actualRegions:  number;       // achieved after pole-closure
  };

  // every per-region or per-edge data product the world exposes
  layers: LayerDescriptor[];

  // topology + geometry (required; consumers need this for any spatial reasoning)
  topology: {
    neighbors: ResourceRef;       // CSR-style adjacency
    cellVertices: ResourceRef;    // polygon outlines per region
    edges: ResourceRef;           // (regionA, regionB) pairs, indexed by edge id
  };

  // optional reprojections precomputed by the engine; otherwise consumer projects
  projections?: {
    equirectangular?: ResourceRef;
    isea?: { depth: number; aperture: 3 | 4; resource: ResourceRef }[];
  };
}

interface LayerDescriptor {
  name:        string;          // e.g. "elevation", "wind", "plate"
  kind:        "scalar" | "vec2" | "categorical";
  domain:      "region" | "edge";
  dtype:       "f32" | "i32" | "u8" | "u32";
  componentsPerEntry: number;   // 1 for scalar, 2 for vec2
  range?:      [number, number]; // documented value range, advisory
  units?:      string;          // e.g. "normalized", "celsius", "m/s"
  resource:    ResourceRef;
}

interface ResourceRef {
  // relative URL OR a content-addressed blob id; consumer should not parse
  url:    string;
  bytes:  number;
  sha256: string;
}
```

### 4.3 Binary layers

One blob per layer. The blob is a **raw typed array dump** — no headers, no padding — because the manifest already tells the consumer how to interpret it:

| Layer | dtype | components | length |
|---|---|---|---|
| `latlon` | f32 | 2 | `2 * numRegions` |
| `elevation` | f32 | 1 | `numRegions` |
| `plate` | i32 | 1 | `numRegions` |
| `temperature`, `humidity`, `clouds`, `wetness`, `nightness`, `surfaceTemp`, `waterTemp` | f32 | 1 | `numRegions` |
| `wind`, `currents` | f32 | 2 | `2 * numRegions` (see §4.3.1 on vector frames) |
| `riverflow` | f32 | 1 | `numEdges` (per-edge, canonical) |
| `riverPresence` | f32 | 1 | `numRegions` (per-region convenience, derived from `riverflow`) |
| `topology/neighbors` | i32 | varies | CSR: `offsets[N+1]` then `flat[totalAdj]` |
| `topology/cellVertices` | f32 | 2 | CSR over polygon vertex lists |
| `topology/edges` | i32 | 2 | `2 * numEdges` (regionA, regionB) |

This is the same shape as the `WorldState` interface proposed in [typescript-port-evaluation.md §6](typescript-port-evaluation.md) — the contract is just that internal state structure serialized.

#### 4.3.1 Vector-field frame

`wind` and `currents` are stored as **tangent-plane vectors at each region centroid**, in a local east-north basis (component 0 = eastward m/s, component 1 = northward m/s). They are **not** the reference impl's `[dlat, dlon]` form, which lives in distorted lat/lon coords.

Per the analytical-derivation decision (HANDOVER §4 decision 10), the engine computes these vectors directly from the underlying scalar fields rather than translating from the reference impl's storage. ISEA reprojections (`projections.isea[*]`) re-derive a fresh per-face vector field rather than rotating the per-region one — this is what makes them physically meaningful near the poles.

Consumers consuming the per-region layer get tangent-frame vectors directly; consumers consuming an ISEA reprojection get face-derived vectors. Both are exposed via the same `vec2 / f32` layer shape, distinguished only by which resource they fetch.

### 4.4 Stable IDs

Three id spaces, all stable for the lifetime of a `worldId`:

- **`RegionId`** — `number` in `[0, numRegions)`. Order is determined by the Fibonacci sphere seed and is part of the engine output, not re-derived. A consumer pinning a settlement to `RegionId = 4218` references the same patch of ground forever.
- **`EdgeId`** — `number` in `[0, numEdges)`. Index into `topology/edges`. Order is determined by the Voronoi build and frozen in the export.
- **`PlateId`** — `number`. Categorical, also frozen.

What is **not** stable across world ids: lat/lon (different seeds → different geometry), pixel positions (depend on projection), or anything ISEA-face-indexed (depends on chosen depth/aperture).

## 5. Consumer-side annotations

A Meridian\* project loads a `WorldManifest`, fetches the layers it needs, and produces **its own data products keyed by WorldMaps ids**. None of this lives in WorldMaps; the contract just defines the *anchoring* primitives the consumer uses.

### 5.1 Anchoring primitives

| Primitive | Anchor | Example use |
|---|---|---|
| **Point feature** | `(regionId, lat, lon)` | a settlement, a landmark |
| **Region feature** | `regionId` | "this region is claimed by faction X" |
| **Region-set feature** | `RegionId[]` | a province, a biome region, a territorial claim |
| **Border / polyline** | `EdgeId[]` | a political border that snaps to Voronoi edges |
| **Per-region scalar/categorical** | layer with `domain: "region"`, named in consumer namespace | "habitability score", "claim id" |
| **Free polyline / polygon** | `(lat, lon)[]` | a road, a coastline trace, anything that doesn't snap to topology |

**Decision (2026-05-24):** borders snap to Voronoi edges (`EdgeId[]`) in v1. This is what `EdgeId` is for — a political border is a subset of `topology/edges`, possibly with per-edge styling. Borders never disagree with terrain, never cross a single Voronoi cell, and draw with the same geometry as the base map.

**Forward-compatibility requirement:** the contract must not paint itself into a corner that prevents adding freeform `(lat, lon)` polyline borders later. Concretely, the `Annotation.anchor` discriminated union in §5.2 already lists `"polyline"` / `"polygon"` as valid kinds — they're defined now but not promised by any consumer. Adding them as supported anchor kinds later is a **MINOR** (additive) schema bump for the annotation schema and a no-op for the World Contract itself.

### 5.2 Annotation schema (consumer-defined)

The contract does **not** prescribe an annotation schema. Each consumer (MeridianWorlds, future Meridian\*) defines its own. A reasonable shape for the first consumer:

```ts
// consumer-side, NOT part of world-contract
interface Annotation {
  id:          string;                  // consumer's id
  worldId:     WorldId;                 // which world this anchors to
  schemaVersion: string;                // consumer's annotation schema version

  anchor:
    | { kind: "point";    regionId: number; lat: number; lon: number }
    | { kind: "region";   regionId: number }
    | { kind: "region-set"; regionIds: number[] }
    | { kind: "border";   edgeIds: number[] }
    | { kind: "polyline"; points: [number, number][] }
    | { kind: "polygon";  points: [number, number][] };

  // payload is consumer-defined; e.g. settlement record, faction id, name, tags
  payload: unknown;
}
```

Storage is consumer's problem (e.g. MeridianWorlds's existing `WORLDS_DB`). WorldMaps's responsibility ends at giving them stable ids and topology.

### 5.3 Consumer boundary module

Mirroring [`MeridianWorlds/meridian/`](../../MeridianWorlds/meridian/), each consumer should have a `worlds/` (or similar) directory holding:

- `worlds/contract.ts` — re-exports `world-contract` types; **the only place the consumer imports from `world-contract`**.
- `worlds/loader.ts` — fetches a manifest + layers, returns a typed in-memory `World` object.
- `worlds/api.md` — documents how the consumer uses the contract.
- `worlds/API_REQUESTS.md` — change requests filed against WorldMaps, using the template below.

This isolates the dependency: if `world-contract` changes shape, only `worlds/` needs to update; the rest of the consumer codebase sees its own re-exports.

### 5.4 Change-request template

Add to `WorldMaps/docs/WORLDS_API_REQUESTS.md`, identical structure to `meridian/API_REQUESTS.md`:

```markdown
## Request: <short title>
**Requester:** <project name>
**Date:** YYYY-MM-DD
**Need:** What data the consumer requires that the World Contract does not currently expose.
**Proposed change:** New layer / new manifest field / modified resource layout.
**Rationale:** Why WorldMaps should own this rather than the consumer deriving it.
**Status:** PROPOSED
```

Status transitions: `PROPOSED` → `ACCEPTED` / `REJECTED` / `DEFERRED`. Accepted requests bump `schemaVersion`.

## 6. Service surface

`apps/service/` exposes the engine over HTTP. Minimal endpoints, all returning standard `world-contract` resources:

| Method | Path | Returns |
|---|---|---|
| `POST` | `/worlds` | `{ worldId, manifestUrl }` — always creates a **new** world with a fresh `worldId`; same `(seed, params)` is not deduped (see §4.1). Idempotency, if needed, is the caller's responsibility (e.g. by passing an `Idempotency-Key` header). |
| `GET`  | `/worlds/{worldId}/manifest` | `WorldManifest` JSON |
| `GET`  | `/worlds/{worldId}/layers/{layerName}` | raw layer blob, `Content-Type: application/octet-stream` |
| `GET`  | `/worlds/{worldId}/topology/{neighbors\|cellVertices\|edges}` | raw topology blob |
| `GET`  | `/worlds/{worldId}/projections/isea/{depth}` | ISEA reprojection blob (if precomputed) |

Notes:
- All blob responses include `ETag` = `sha256` from the manifest, and may be cached indefinitely (blobs are immutable per §4.1).
- Authentication is out of scope for this document; for the foreseeable future the service is local/internal.

For consumers that don't need a live service, the same files can be written to disk by a CLI (`world-engine generate --seed ... --out ./worlds/abc123/`). The on-disk layout matches the URL layout; a consumer's loader should not need to know whether it's reading from HTTP or from disk.

## 7. Versioning rules

`schemaVersion` follows semver:

- **MAJOR** — breaking change to manifest shape, layer dtype, or id semantics. Consumers must update.
- **MINOR** — additive: new optional layer, new optional manifest field, new annotation anchor kinds (e.g. freeform polyline borders added alongside `EdgeId[]`). Existing consumers keep working.
- **PATCH** — clarifications, doc-only, no wire change.

`generatorVersion` follows semver of the engine package and moves independently. Existing `worldId`s never become stale on a `generatorVersion` bump — their blobs are immutable. A new generation under the new engine simply produces a new `worldId`.

## 8. What this does *not* solve

- **Generator-side adaptive subdivision.** Adaptive (region-of-interest) subdivision *render-side* is a v1 design constraint (HANDOVER decision 16) and works fine over this contract — the source data doesn't change, the renderer just resamples at higher depth in the viewport. Adaptive subdivision *generator-side* (high-resolution generation only inside a user's viewport) would require a streaming/chunked layer flavor and is a future `MAJOR` schema bump if needed.
- **Mutable worlds.** Worlds are immutable under this design. A consumer wanting "edit terrain, re-simulate weather" needs either a new endpoint (`POST /worlds/{id}/derive`, returning a new `worldId`) or a different contract entirely. Defer until the first concrete use case appears.
- **Real-time simulation streaming.** The reference impl runs a continuous weather loop. For Meridian\* purposes the world is usually static (worldbuilding / settlement placement). If a consumer ever needs live weather, expose it as a separate WebSocket stream keyed by `worldId`; do not bake it into the manifest.
- **Annotation conflict resolution between consumers.** Multiple Meridian\* projects annotating the same world is fine as long as they hold their own annotation stores. WorldMaps does not arbitrate.

## 9. Effort and ordering

Assuming the TypeScript port from [typescript-port-evaluation.md](typescript-port-evaluation.md) is happening anyway:

| Phase | Days | Output |
|---|---:|---|
| A. Define `world-contract` package: types, manifest schema, `world-contract.md` | 1 | Contract is checked in; downstream can start coding against types even before the engine exists. |
| B. Build engine + renderer against the contract (the port itself) | ~14 | Studio app at parity with reference demo, but state shaped as the contract. |
| C. Add `apps/service/` HTTP wrapper | 1 | Engine runnable as a service; blobs cacheable. |
| D. Write `docs/WORLDS_API_REQUESTS.md` template + boundary-module guidance | 0.5 | Consumers have an onboarding path. |
| E. (consumer side, MeridianWorlds) Build `worlds/` boundary module | ~2 | First consumer integrated; validates the contract under real use. |

Phase A is what unblocks consumer work; do it first, even if engine implementation comes much later. A stable contract document plus stub types in `world-contract/` is enough for MeridianWorlds to design its annotation schema and database tables.

## 10. Recommendation

Land the contract package first (`packages/world-contract/` + `docs/world-contract.md` + `docs/WORLDS_API_REQUESTS.md`) before any rendering or engine code. Then build engine and renderer behind it. This mirrors the discipline already in place between Meridian and MeridianWorlds and avoids the worst failure mode for a multi-consumer system: a contract that is implicitly defined by the first consumer's needs and breaks the second.
