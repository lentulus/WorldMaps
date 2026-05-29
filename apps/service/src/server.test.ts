import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createService, type Service } from './server.js';
import { deserializeWorld } from '@worldmaps/world-engine';
import { validateManifest, type WorldManifest } from '@worldmaps/world-contract';

const PARAMS = {
  numRegions: 96,
  samplingMethod: 'fibonacci' as const,
  numPlates: 5,
  oceanFraction: 0.6,
};

let svc: Service;
let baseUrl: string;

beforeAll(async () => {
  svc = createService();
  ({ baseUrl } = await svc.listen(0));
});

afterAll(async () => {
  await svc.close();
});

async function postWorld(seed = 'phase9-seed'): Promise<{ worldId: string; manifestUrl: string }> {
  const res = await fetch(`${baseUrl}/worlds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed, params: PARAMS }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  return JSON.parse(text) as { worldId: string; manifestUrl: string };
}

describe('Phase 9 — HTTP service', () => {
  it('POST /worlds creates a new world and returns worldId + manifestUrl', async () => {
    const body = await postWorld();
    expect(body.worldId).toMatch(/^w_/);
    expect(body.manifestUrl).toBe(`/worlds/${encodeURIComponent(body.worldId)}/manifest`);
  });

  it('GET manifest returns application/json and a schema-valid manifest', async () => {
    const { worldId } = await postWorld();
    const res = await fetch(`${baseUrl}/worlds/${encodeURIComponent(worldId)}/manifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const manifest = (await res.json()) as WorldManifest;
    const v = validateManifest(manifest);
    expect(v.valid, JSON.stringify(v.errors)).toBe(true);
    expect(manifest.identity.worldId).toBe(worldId);
  });

  it('GET layer/topology blobs are octet-stream, ETag = sha256, immutable cache', async () => {
    const { worldId } = await postWorld();
    const manifest = (await (await fetch(
      `${baseUrl}/worlds/${encodeURIComponent(worldId)}/manifest`,
    )).json()) as WorldManifest;

    const urls: { path: string; sha256: string; bytes: number }[] = [
      ...manifest.layers.map((l) => ({
        path: `/worlds/${encodeURIComponent(worldId)}/layers/${l.name}`,
        sha256: l.resource.sha256,
        bytes: l.resource.bytes,
      })),
      {
        path: `/worlds/${encodeURIComponent(worldId)}/topology/neighbors`,
        sha256: manifest.topology.neighbors.sha256,
        bytes: manifest.topology.neighbors.bytes,
      },
      {
        path: `/worlds/${encodeURIComponent(worldId)}/topology/cellVertices`,
        sha256: manifest.topology.cellVertices.sha256,
        bytes: manifest.topology.cellVertices.bytes,
      },
      {
        path: `/worlds/${encodeURIComponent(worldId)}/topology/edges`,
        sha256: manifest.topology.edges.sha256,
        bytes: manifest.topology.edges.bytes,
      },
    ];

    for (const { path, sha256, bytes } of urls) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
      expect(res.headers.get('etag')).toBe(`"${sha256}"`);
      expect(res.headers.get('cache-control')).toMatch(/immutable/);
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.byteLength).toBe(bytes);
    }
  });

  it('same worldId + path returns byte-identical body across requests', async () => {
    const { worldId } = await postWorld();
    const path = `${baseUrl}/worlds/${encodeURIComponent(worldId)}/layers/elevation`;
    const a = new Uint8Array(await (await fetch(path)).arrayBuffer());
    const b = new Uint8Array(await (await fetch(path)).arrayBuffer());
    expect(a).toEqual(b);
  });

  it('parallel POST /worlds produce distinct worldIds (no cross-contamination)', async () => {
    const N = 4;
    const responses = await Promise.all(Array.from({ length: N }, () => postWorld(`parallel-${Math.random()}`)));
    const ids = new Set(responses.map((r) => r.worldId));
    expect(ids.size).toBe(N);
  });

  it('end-to-end: fetch manifest + every blob, hydrate via deserializeWorld', async () => {
    const { worldId } = await postWorld();
    const manifest = (await (await fetch(
      `${baseUrl}/worlds/${encodeURIComponent(worldId)}/manifest`,
    )).json()) as WorldManifest;

    const blobs = new Map<string, Uint8Array>();
    const fetchBlob = async (path: string, url: string): Promise<void> => {
      const res = await fetch(`${baseUrl}${path}`);
      blobs.set(url, new Uint8Array(await res.arrayBuffer()));
    };
    await Promise.all([
      ...manifest.layers.map((l) =>
        fetchBlob(`/worlds/${encodeURIComponent(worldId)}/layers/${l.name}`, l.resource.url),
      ),
      fetchBlob(`/worlds/${encodeURIComponent(worldId)}/topology/neighbors`, manifest.topology.neighbors.url),
      fetchBlob(`/worlds/${encodeURIComponent(worldId)}/topology/cellVertices`, manifest.topology.cellVertices.url),
      fetchBlob(`/worlds/${encodeURIComponent(worldId)}/topology/edges`, manifest.topology.edges.url),
    ]);

    const state = await deserializeWorld(manifest, blobs);
    expect(state.numRegions).toBe(manifest.numRegions);
    expect(state.numEdges).toBe(manifest.numEdges);
    expect(state.topology).not.toBeNull();
  });

  it('404 for unknown worldId', async () => {
    const res = await fetch(`${baseUrl}/worlds/does-not-exist/manifest`);
    expect(res.status).toBe(404);
  });

  it('400 for malformed POST body', async () => {
    const res = await fetch(`${baseUrl}/worlds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it('every response carries Access-Control-Allow-Origin: * (decision 42)', async () => {
    const { worldId } = await postWorld();
    const paths = [
      `${baseUrl}/worlds/${encodeURIComponent(worldId)}/manifest`,
      `${baseUrl}/worlds/${encodeURIComponent(worldId)}/layers/elevation`,
      `${baseUrl}/worlds/does-not-exist/manifest`,
    ];
    for (const p of paths) {
      const res = await fetch(p);
      expect(res.headers.get('access-control-allow-origin'), p).toBe('*');
    }
  });

  it('OPTIONS preflight returns 204 with full CORS headers', async () => {
    const res = await fetch(`${baseUrl}/worlds`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('blobs are gzip-encoded when client sends Accept-Encoding: gzip (decision 40)', async () => {
    const { worldId } = await postWorld();
    const path = `${baseUrl}/worlds/${encodeURIComponent(worldId)}/layers/elevation`;

    const gzipRes = await fetch(path, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(gzipRes.status).toBe(200);
    // fetch() in Node auto-decompresses, so we can't read the encoding header
    // off the body — but we can confirm the round-trip byte length matches the
    // manifest and that the server advertised the negotiation via `Vary`.
    expect(gzipRes.headers.get('vary')).toMatch(/Accept-Encoding/i);

    const manifest = (await (await fetch(
      `${baseUrl}/worlds/${encodeURIComponent(worldId)}/manifest`,
    )).json()) as WorldManifest;
    const expectedBytes = manifest.layers.find((l) => l.name === 'elevation')!.resource.bytes;
    const body = new Uint8Array(await gzipRes.arrayBuffer());
    expect(body.byteLength).toBe(expectedBytes);
  });

  it('does not gzip small payloads (below the 256-byte threshold)', async () => {
    const res = await fetch(`${baseUrl}/worlds/no-such-id/manifest`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-encoding')).toBeNull();
  });
});
