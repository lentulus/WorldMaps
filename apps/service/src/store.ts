// Registry of generated worlds. Worlds are immutable once stored
// (decision 12 / arch §4.1); a fresh POST always produces a new id.
//
// In v1 the store keeps every loaded world fully in memory and uses that as
// the read cache. If `worldsDir` is supplied, the store also writes each
// new world to disk (so `put` is durable) and loads any pre-existing worlds
// from that directory at `init()` time. The on-disk layout matches the
// studio zip (decision 35 / 41), so users can swap saves between channels.

import type { SerializedWorld } from '@worldmaps/world-engine';
import {
  listWorldIdsOnDisk,
  readWorldFromDir,
  writeWorldToDir,
} from './disk.js';

export interface WorldStoreOptions {
  /** If set, persist each stored world under `<worldsDir>/<worldId>/...`
   *  and load any worlds already present at `init()`. */
  readonly worldsDir?: string;
}

export class WorldStore {
  private readonly worlds = new Map<string, SerializedWorld>();
  private readonly worldsDir: string | undefined;

  constructor(options: WorldStoreOptions = {}) {
    this.worldsDir = options.worldsDir;
  }

  /** Load any worlds already present on disk into the in-memory cache. Safe
   *  to call multiple times; in-memory entries win and re-loading just
   *  re-reads. No-op when no `worldsDir` is configured. */
  async init(): Promise<void> {
    if (!this.worldsDir) return;
    const ids = await listWorldIdsOnDisk(this.worldsDir);
    for (const id of ids) {
      if (this.worlds.has(id)) continue;
      const world = await readWorldFromDir(this.worldsDir, id);
      this.worlds.set(world.manifest.identity.worldId, world);
    }
  }

  async put(world: SerializedWorld): Promise<void> {
    this.worlds.set(world.manifest.identity.worldId, world);
    if (this.worldsDir) {
      await writeWorldToDir(this.worldsDir, world);
    }
  }

  get(worldId: string): SerializedWorld | undefined {
    return this.worlds.get(worldId);
  }

  size(): number {
    return this.worlds.size;
  }
}
