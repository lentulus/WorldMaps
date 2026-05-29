// Studio save/load: packs the engine's {manifest, blobs} output into a zip the
// user can download, and reads it back via a file picker. Decision 12 demands
// load determinism (same bytes → same state) — the engine layer guarantees
// that; this file is just the browser-side container.

import {
  serializeWorld,
  deserializeWorld,
  type WorldState,
} from '@worldmaps/world-engine';
import type { GenerationParams, WorldManifest } from '@worldmaps/world-contract';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const MANIFEST_PATH = 'manifest.json';

export interface LoadedWorld {
  readonly state: WorldState;
  readonly manifest: WorldManifest;
  readonly params: GenerationParams;
}

export async function saveWorldToFile(
  state: WorldState,
  params: GenerationParams,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const { manifest, blobs } = await serializeWorld(state, params);
  const archive: Record<string, Uint8Array> = {};
  archive[MANIFEST_PATH] = strToU8(JSON.stringify(manifest, null, 2));
  for (const [url, bytes] of blobs) archive[url] = bytes;
  const zipped = zipSync(archive, { level: 0 });
  const shortId = manifest.identity.worldId.replace(/^w_/, '').slice(0, 8);
  return { filename: `worldmap-${shortId}.zip`, bytes: zipped };
}

export async function loadWorldFromFile(file: File): Promise<LoadedWorld> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const manifestBytes = entries[MANIFEST_PATH];
  if (!manifestBytes) throw new Error('archive missing manifest.json');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as WorldManifest;

  const blobs = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path === MANIFEST_PATH) continue;
    blobs.set(path, bytes);
  }
  const state = await deserializeWorld(manifest, blobs);
  return { state, manifest, params: manifest.identity.params };
}

export function triggerDownload(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
