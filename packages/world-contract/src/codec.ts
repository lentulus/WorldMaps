import type { WorldManifest } from './manifest.js';

export const CURRENT_SCHEMA_VERSION = '1.0.0' as const;

export function encodeManifest(manifest: WorldManifest): Uint8Array {
  const json = JSON.stringify(manifest);
  return new TextEncoder().encode(json);
}

export function decodeManifest(bytes: Uint8Array): WorldManifest {
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(json) as WorldManifest;
}
