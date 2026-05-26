# Worlds API Requests

Consumer-driven change requests against the [World Contract](./world-contract.md). Mirrors the pattern in [`MeridianWorlds/meridian/API_REQUESTS.md`](../../MeridianWorlds/meridian/API_REQUESTS.md).

## How to file a request

1. Append a new entry under §1 using the template in §2.
2. Open a PR against this repository titled `worlds-api: <short title>`.
3. A WorldMaps maintainer triages: `PROPOSED` → `ACCEPTED` / `REJECTED` / `DEFERRED`.
4. `ACCEPTED` requests bump `schemaVersion` per [contract §9](./world-contract.md#9-versioning).

---

## 1. Requests

*(none yet — first consumer is MeridianWorlds; expect requests here once their `worlds/` boundary module is built and surfaces gaps)*

---

## 2. Template

```markdown
## Request: <short title>
**Requester:** <project name, e.g. MeridianWorlds>
**Date:** YYYY-MM-DD
**Need:** What data the consumer requires that the World Contract does not currently expose.
**Proposed change:** New layer / new manifest field / modified resource layout.
**Rationale:** Why WorldMaps should own this rather than the consumer deriving it.
**Status:** PROPOSED
```

Status transitions:

- `PROPOSED` → `ACCEPTED` — accepted; tracked into the next schema bump.
- `PROPOSED` → `REJECTED` — declined with reason (e.g. "consumer should derive").
- `PROPOSED` → `DEFERRED` — valid but not now; revisit on next contract review.
- `ACCEPTED` → `SHIPPED` — landed in `schemaVersion` X.Y.Z.
