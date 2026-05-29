// On-disk persistence for SerializedWorld. Layout matches the studio zip
// (decision 35) so a user can unzip a `worldmap-*.zip` into
// `<worldsDir>/<worldId>/` and the service serves it.
//
//   <worldsDir>/
//     <worldId>/
//       manifest.json
//       layers/<name>.bin
//       topology/{neighbors,cellVertices,edges}.bin

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SerializedWorld } from '@worldmaps/world-engine';
import type { WorldManifest } from '@worldmaps/world-contract';

const MANIFEST_FILENAME = 'manifest.json';

export async function writeWorldToDir(
  worldsDir: string,
  world: SerializedWorld,
): Promise<void> {
  const dir = join(worldsDir, world.manifest.identity.worldId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, MANIFEST_FILENAME),
    JSON.stringify(world.manifest, null, 2),
    'utf-8',
  );
  for (const [url, bytes] of world.blobs) {
    const target = join(dir, url);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

export async function readWorldFromDir(
  worldsDir: string,
  worldId: string,
): Promise<SerializedWorld> {
  const dir = join(worldsDir, worldId);
  const manifest = JSON.parse(
    await readFile(join(dir, MANIFEST_FILENAME), 'utf-8'),
  ) as WorldManifest;

  const blobs = new Map<string, Uint8Array>();
  for (const layer of manifest.layers) {
    blobs.set(layer.resource.url, await readBlob(dir, layer.resource.url));
  }
  for (const ref of [
    manifest.topology.neighbors,
    manifest.topology.cellVertices,
    manifest.topology.edges,
  ]) {
    blobs.set(ref.url, await readBlob(dir, ref.url));
  }

  return { manifest, blobs };
}

/** Returns worldIds of every directory under `worldsDir` that contains a
 *  `manifest.json`. Entries without a manifest are silently skipped. */
export async function listWorldIdsOnDisk(worldsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(worldsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const found: string[] = [];
  for (const name of entries) {
    try {
      await readFile(join(worldsDir, name, MANIFEST_FILENAME));
      found.push(name);
    } catch {
      // not a world dir
    }
  }
  return found;
}

async function readBlob(dir: string, url: string): Promise<Uint8Array> {
  const buf = await readFile(join(dir, url));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
