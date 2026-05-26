# World Contract — v1.0.0

**Status:** Authoritative specification for the WorldMaps ↔ Meridian\* boundary.
**Implementation:** [`packages/world-contract/`](../packages/world-contract).
**Related decisions:** [HANDOVER.md §4](../HANDOVER.md) — decisions 6, 8, 9, 10, 12, 15.

This document is the single source of truth for the on-the-wire shape between the WorldMaps generation engine and any downstream consumer. If this document and the TypeScript types disagree, the **TypeScript is authoritative** — file a contract-spec PR against this document to bring them back in sync.

---

## 1. Scope

The World Contract defines:

1. **Identity** — how a world is named and how `worldId`s are minted (§3).
2. **Manifest** — the JSON envelope a consumer fetches first (§4).
3. **Layers** — the raw typed-array blobs the manifest points at (§5).
4. **Topology** — the Voronoi adjacency, polygon vertices, and edge list that anchor everything else (§6).
5. **Stable IDs** — `RegionId`, `EdgeId`, `PlateId` semantics (§7).
6. **Annotation anchors** — how consumers pin their own data to a world (§8).
7. **Versioning** — semver rules for the schema vs. the engine (§9).

Out of scope (intentionally — see arch report §8): generator-side adaptive subdivision, mutable worlds, real-time simulation streaming, annotation conflict resolution between consumers.

## 2. Design principles

- **Projection-agnostic.** Per-region state is canonical in `[lat, lon]`. ISEA or other reprojections are optional `projections` derivations of the same source data (HANDOVER decision 5).
- **Load determinism, not generation determinism.** Worlds are byte-identical on re-load forever, but no guarantee that the same `(seed, params)` regenerates the same world on a different machine (HANDOVER decision 12).
- **Stable across schema PATCH/MINOR.** Existing consumers that pin to `^1.0.0` keep working when new optional layers or anchor kinds are added.
- **Renderer/engine never appear in this document.** This is the boundary; both sides depend on it, neither side defines it.

## 3. Identity

```ts
type WorldId = string;             // opaque, assigned at creation
interface WorldIdentity {
  worldId: WorldId;
  schemaVersion: string;           // semver of this contract
  generatorVersion: string;        // semver of world-engine
  seed: string;                    // informational only
  params: GenerationParams;        // fully-specified, no implicit defaults
  createdAt: string;               // ISO-8601
}
```

- **`worldId` is opaque** — UUIDv4 or a content hash of the canonical byte stream. Consumers must not parse it.
- **`worldId` is NOT a function of `(seed, params, generatorVersion)`.** Two `POST /worlds` with the same args produce two distinct ids, each individually stable forever (decision 12).
- **`seed` and `params` are provenance**, not identity inputs. A consumer can attempt regeneration from them but should not rely on the result matching.
- **`generatorVersion` bumps never invalidate existing `worldId`s** — blobs are immutable; engine updates only affect *new* worlds.

## 4. Manifest

A single JSON document, < 50 KB, returned by `GET /worlds/{worldId}/manifest` (or read from disk in the equivalent location).

```ts
interface WorldManifest {
  identity:   WorldIdentity;
  numRegions: number;
  numEdges:   number;
  resolution: {
    samplingMethod: "fibonacci" | "icosahedral";
    targetRegions:  number;
    actualRegions:  number;
  };
  layers:     LayerDescriptor[];
  topology:   { neighbors: ResourceRef; cellVertices: ResourceRef; edges: ResourceRef };
  projections?: {
    equirectangular?: ResourceRef;
    isea?: { depth: number; aperture: 3 | 4; resource: ResourceRef }[];
  };
}

interface ResourceRef {
  url:    string;   // relative URL OR opaque blob id
  bytes:  number;   // exact byte length of the blob
  sha256: string;   // lowercase hex
}
```

**Rules:**

- `numRegions === resolution.actualRegions`.
- Every `LayerDescriptor.resource.bytes` must match `expectedLayerByteLength(descriptor, entryCount)` where `entryCount = numRegions` for region-domain layers, `numEdges` for edge-domain layers.
- `topology.*.sha256` and every `layers[*].resource.sha256` are authoritative — if a fetched blob does not hash to the declared `sha256`, the consumer MUST reject it.
- `projections` is entirely optional. v1 engines may emit zero projections; consumers must tolerate this.

## 5. Layer blobs

Each blob is a **raw typed-array dump** — no header, no padding, no endianness marker. The manifest descriptor tells the consumer how to interpret it.

| Layer | `dtype` | `kind` | `domain` | `componentsPerEntry` | length |
|---|---|---|---|---:|---|
| `latlon` | `f32` | `vec2` | `region` | 2 | `2 * numRegions` |
| `elevation` | `f32` | `scalar` | `region` | 1 | `numRegions` |
| `plate` | `i32` | `categorical` | `region` | 1 | `numRegions` |
| `temperature`, `humidity`, `clouds`, `wetness`, `nightness`, `surfaceTemp`, `waterTemp` | `f32` | `scalar` | `region` | 1 | `numRegions` |
| `wind`, `currents` | `f32` | `vec2` | `region` | 2 | `2 * numRegions` |
| `riverflow` | `f32` | `scalar` | `edge` | 1 | `numEdges` |
| `riverPresence` | `f32` | `scalar` | `region` | 1 | `numRegions` |

**Endianness.** Little-endian. Modern target platforms (x86, ARM, every browser engine) are little-endian. If a future big-endian target appears, that is a MAJOR schema bump.

### 5.1 Vector-field frame

`wind` and `currents` are stored as **tangent-plane vectors at each region centroid**, in a local east-north basis:

- component 0 = eastward velocity (m/s)
- component 1 = northward velocity (m/s)

They are **not** the reference implementation's `[dlat, dlon]` form. The engine derives these vectors analytically per HANDOVER decision 10. ISEA reprojections (`projections.isea[*]`) re-derive a fresh per-face vector field from the underlying scalar fields rather than rotating the per-region one.

### 5.2 Rivers (two views)

Per HANDOVER decision 15, rivers are exposed two ways:

- **`riverflow`** — per-edge `f32` scalar. Canonical form; preserves linear semantics. This is what consumers wanting to draw rivers as polylines should consume.
- **`riverPresence`** — per-region `f32` scalar in `[0, 1]`. Derived convenience for consumers (e.g. habitability scoring) that don't want to walk the edge graph. The engine guarantees it is reproducibly derivable from `riverflow` + `topology` — a consumer can re-derive and compare if they want to verify.

## 6. Topology

```ts
topology: {
  neighbors:    ResourceRef;  // CSR: i32 offsets[numRegions+1] || i32 flat[totalAdj]
  cellVertices: ResourceRef;  // CSR: i32 offsets[numRegions+1] || f32 flat[2*totalVertices]
  edges:        ResourceRef;  // i32, length 2*numEdges, interleaved [regionA, regionB]
}
```

- **`neighbors`** uses CSR (compressed sparse row): `offsets[r]` is the start index into `flat` for region `r`'s neighbor list, ending at `offsets[r+1]`. Length = `offsets[numRegions]`. Both halves are concatenated into one blob; the consumer slices.
- **`cellVertices`** uses the same CSR shape, with `f32` vertex coords. Vertices are in **projected** space at the engine's working projection (currently stereographic from the south pole); consumers needing a different projection should use `latlon` per region or render via `projections.*`.
- **`edges`** lists `(regionA, regionB)` pairs indexed by `EdgeId`. Adjacency is symmetric — both `(a, b)` and `(b, a)` appearances in `neighbors` correspond to the same `EdgeId`.

Adjacency invariants the engine MUST satisfy and consumers MAY assume:

1. Every region has ≥3 neighbors (or the engine documents the exception).
2. Adjacency is symmetric.
3. No `null` / sentinel-value neighbors after south-pole closure.
4. Sum of (spherical) cell areas ≈ 4π within numerical tolerance.

## 7. Stable IDs

| Id | Type | Range | Stability |
|---|---|---|---|
| `RegionId` | `number` | `[0, numRegions)` | stable for the lifetime of `worldId` |
| `EdgeId` | `number` | `[0, numEdges)` | stable for the lifetime of `worldId` |
| `PlateId` | `number` | arbitrary | stable for the lifetime of `worldId` |

What is **NOT** stable across `worldId`s: lat/lon (different seeds → different geometry), pixel positions (depend on projection), any ISEA face index (depends on chosen depth/aperture).

## 8. Annotation anchors

The contract does **not** prescribe an annotation storage schema. It defines the **anchor primitives** consumers use to pin their own data into a world:

```ts
type AnnotationAnchor =
  | { kind: "point";       regionId: number; lat: number; lon: number }
  | { kind: "region";      regionId: number }
  | { kind: "region-set";  regionIds: number[] }
  | { kind: "border";      edgeIds: number[] }
  | { kind: "polyline";    points: [number, number][] }
  | { kind: "polygon";     points: [number, number][] };
```

Per HANDOVER decision 9, **v1 borders snap to `EdgeId[]`**. The `polyline` / `polygon` kinds are defined now for forward-compatibility — adding them as supported anchor kinds in a consumer is a MINOR (additive) schema bump for that consumer and a no-op for this contract.

## 9. Versioning

`schemaVersion` follows semver of **this document**:

- **MAJOR** — breaking change to manifest shape, layer dtype, id semantics, or endianness. Consumers MUST update.
- **MINOR** — additive: new optional layer, new optional manifest field, new annotation anchor kinds. Existing consumers keep working.
- **PATCH** — clarifications, doc-only, no wire change.

`generatorVersion` moves independently. Existing `worldId`s never become stale on a `generatorVersion` bump.

## 10. Change requests

Consumers needing data not currently exposed file a request in [`docs/WORLDS_API_REQUESTS.md`](./WORLDS_API_REQUESTS.md). Accepted requests bump `schemaVersion` per §9.
