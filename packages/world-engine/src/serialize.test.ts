import { describe, it, expect } from 'vitest';
import { validateManifest, type GenerationParams } from '@worldmaps/world-contract';
import { runGenerate } from './generate.js';
import { serializeWorld, deserializeWorld, sha256Hex } from './serialize.js';
import type { WorldState } from './state.js';

const PARAMS: GenerationParams = {
  numRegions: 128,
  samplingMethod: 'fibonacci',
  numPlates: 6,
  oceanFraction: 0.6,
};

function gen(seed = 'phase8-seed'): WorldState {
  return runGenerate({ seed, params: PARAMS });
}

describe('Phase 8 — serialization', () => {
  it('manifest validates against the published JSON schema', async () => {
    const state = gen();
    const { manifest } = await serializeWorld(state, PARAMS);
    const result = validateManifest(manifest);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('every ResourceRef.sha256 matches the actual blob bytes', async () => {
    const state = gen();
    const { manifest, blobs } = await serializeWorld(state, PARAMS);

    const refs = [
      manifest.topology.neighbors,
      manifest.topology.cellVertices,
      manifest.topology.edges,
      ...manifest.layers.map((l) => l.resource),
    ];
    for (const ref of refs) {
      const blob = blobs.get(ref.url);
      expect(blob, `missing blob ${ref.url}`).toBeDefined();
      expect(blob!.byteLength).toBe(ref.bytes);
      expect(await sha256Hex(blob!)).toBe(ref.sha256);
    }
  });

  it('two saves of the same generated world produce distinct worldIds (decision 12)', async () => {
    const state = gen();
    const a = await serializeWorld(state, PARAMS);
    const b = await serializeWorld(state, PARAMS);
    expect(a.manifest.identity.worldId).not.toBe(b.manifest.identity.worldId);
  });

  it('re-loading the same serialized bytes N times yields byte-identical state', async () => {
    const state = gen();
    const { manifest, blobs } = await serializeWorld(state, PARAMS);

    const reloads: WorldState[] = [];
    for (let i = 0; i < 3; i++) {
      reloads.push(await deserializeWorld(manifest, blobs));
    }
    const ref = reloads[0]!;
    for (let i = 1; i < reloads.length; i++) {
      const r = reloads[i]!;
      expect(r.numRegions).toBe(ref.numRegions);
      expect(r.numEdges).toBe(ref.numEdges);
      expect(viewBytes(r.latlon)).toEqual(viewBytes(ref.latlon));
      expect(viewBytes(r.elevation)).toEqual(viewBytes(ref.elevation));
      expect(viewBytes(r.riverflow)).toEqual(viewBytes(ref.riverflow));
      expect(viewBytes(r.topology!.edges)).toEqual(viewBytes(ref.topology!.edges));
      expect(viewBytes(r.topology!.neighbors.flat)).toEqual(viewBytes(ref.topology!.neighbors.flat));
      expect(viewBytes(r.topology!.cellVertices.flat)).toEqual(viewBytes(ref.topology!.cellVertices.flat));
    }
  });

  it('generate → serialize → deserialize round-trips every layer byte-identically (load determinism, decision 12)', async () => {
    const original = gen();
    const { manifest, blobs } = await serializeWorld(original, PARAMS);
    const loaded = await deserializeWorld(manifest, blobs);

    expect(loaded.numRegions).toBe(original.numRegions);
    expect(loaded.numEdges).toBe(original.numEdges);

    expect(viewBytes(loaded.latlon)).toEqual(viewBytes(original.latlon));
    expect(viewBytes(loaded.plate)).toEqual(viewBytes(original.plate));
    expect(viewBytes(loaded.elevation)).toEqual(viewBytes(original.elevation));
    expect(viewBytes(loaded.temperature)).toEqual(viewBytes(original.temperature));
    expect(viewBytes(loaded.wind)).toEqual(viewBytes(original.wind));
    expect(viewBytes(loaded.humidity)).toEqual(viewBytes(original.humidity));
    expect(viewBytes(loaded.clouds)).toEqual(viewBytes(original.clouds));
    expect(viewBytes(loaded.currents)).toEqual(viewBytes(original.currents));
    expect(viewBytes(loaded.riverflow)).toEqual(viewBytes(original.riverflow));
    expect(viewBytes(loaded.riverPresence)).toEqual(viewBytes(original.riverPresence));

    expect(viewBytes(loaded.topology!.edges)).toEqual(viewBytes(original.topology!.edges));
    expect(viewBytes(loaded.topology!.neighbors.offsets)).toEqual(viewBytes(original.topology!.neighbors.offsets));
    expect(viewBytes(loaded.topology!.neighbors.flat)).toEqual(viewBytes(original.topology!.neighbors.flat));
    expect(viewBytes(loaded.topology!.cellVertices.offsets)).toEqual(viewBytes(original.topology!.cellVertices.offsets));
    expect(viewBytes(loaded.topology!.cellVertices.flat)).toEqual(viewBytes(original.topology!.cellVertices.flat));
  });

  it('manifest declares the edge-domain riverflow layer (first user of LayerDomain = "edge")', async () => {
    const state = gen();
    const { manifest } = await serializeWorld(state, PARAMS);
    const riverflow = manifest.layers.find((l) => l.name === 'riverflow');
    expect(riverflow).toBeDefined();
    expect(riverflow!.domain).toBe('edge');
    expect(riverflow!.resource.bytes).toBe(state.numEdges * 4);
  });
});

function viewBytes(arr: Float32Array | Int32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
