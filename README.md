# WorldMaps

Project to procedurally generate world maps and provide tools to annotate them. WorldMaps is the canonical owner of generated worlds; downstream "Meridian\*" consumer projects load worlds via a versioned contract and overlay their own annotations (borders, settlements, factions, place names).

## Status

Mid-implementation. Phases 0–5 of [`plans/plan1.md`](plans/plan1.md) are landed: contract package, engine (sphere + Voronoi + plates + elevation), renderer (orthographic + equirectangular, five modes), studio (Web Worker, vanilla panel). 92 tests passing. Next: Phase 6 weather. See [HANDOVER.md](HANDOVER.md) for the live decision log.

Stack: **TypeScript** monorepo with three packages — `world-contract`, `world-engine`, `world-renderer` — on Vite, using d3-delaunay for Voronoi. Engine runs in a Web Worker by default.

## Running it

```sh
npm install
npx vitest run                 # 92 tests
cd apps/studio && npx vite     # open http://127.0.0.1:5173/
```

## Documents

- [HANDOVER.md](HANDOVER.md) — re-entry point: status, decisions, next actions.
- [reports/realistic-planet-generation-evaluation.md](reports/realistic-planet-generation-evaluation.md) — architectural analysis of the reference project and ISEA re-projection viability.
- [reports/typescript-port-evaluation.md](reports/typescript-port-evaluation.md) — port plan, recommended stack, effort estimate.
- [reports/client-server-architecture.md](reports/client-server-architecture.md) — client-server split and the World Contract that consumer projects depend on.

## Acknowledgements

Architectural inspiration and algorithm reference comes from [`freezedriedmangos/realistic-planet-generation-and-simulation`](https://freezedriedmangos.github.io/realistic-planet-generation-and-simulation/) — a p5.js world generator and weather simulator. WorldMaps is a fresh TypeScript implementation (not a fork) that adapts that project's Voronoi-on-sphere data model to an icosahedral equal-area target tessellation. The original carries the note *"Feel free to do whatever you want with this code!"*; this project is dedicated to the same spirit.

## License

[MIT](LICENSE).
