// In-memory registry of generated worlds. The service holds them by worldId
// and serves them across endpoints. Worlds are immutable once stored
// (decision 12 / arch §4.1); a fresh POST always produces a new id.
//
// Disk persistence is intentionally out of scope here — the contract format is
// the same on disk as in HTTP, so a future flag like `--worlds-dir ./worlds`
// would just write/read each `SerializedWorld` to/from the on-disk layout
// without changing this module's interface.

import type { SerializedWorld } from '@worldmaps/world-engine';

export class WorldStore {
  private readonly worlds = new Map<string, SerializedWorld>();

  put(world: SerializedWorld): void {
    this.worlds.set(world.manifest.identity.worldId, world);
  }

  get(worldId: string): SerializedWorld | undefined {
    return this.worlds.get(worldId);
  }

  size(): number {
    return this.worlds.size;
  }
}
