// HTTP wrapper around the engine. Routes match arch §6 exactly so a consumer
// can swap a saved-to-disk world for a live service URL without code changes.
//
// Endpoints:
//   POST /worlds                                     → { worldId, manifestUrl }
//   GET  /worlds/{id}/manifest                       → WorldManifest JSON
//   GET  /worlds/{id}/layers/{name}                  → raw layer blob
//   GET  /worlds/{id}/topology/{neighbors|cellVertices|edges}
//                                                    → raw topology blob
//
// All blob responses set `ETag = sha256` from the manifest. Blobs are
// immutable, so a consumer may cache them forever.

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { runGenerate, serializeWorld } from '@worldmaps/world-engine';
import type { ResourceRef } from '@worldmaps/world-contract';
import { WorldStore } from './store.js';

export interface ServiceOptions {
  /** Override the store. Tests inject one; production lets the server create
   *  its own. */
  readonly store?: WorldStore;
}

export interface Service {
  readonly server: Server;
  readonly store: WorldStore;
  listen(port: number): Promise<{ port: number; baseUrl: string }>;
  close(): Promise<void>;
}

export function createService(options: ServiceOptions = {}): Service {
  const store = options.store ?? new WorldStore();
  const server = createHttpServer((req, res) => {
    handle(req, res, store).catch((err) => {
      sendJson(res, 500, { error: (err as Error).message ?? 'internal error' });
    });
  });

  return {
    server,
    store,
    listen(port) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          const address = server.address();
          if (typeof address !== 'object' || address === null) {
            reject(new Error('unexpected server address'));
            return;
          }
          const actualPort = address.port;
          resolve({ port: actualPort, baseUrl: `http://127.0.0.1:${actualPort}` });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, store: WorldStore): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (method === 'POST' && path === '/worlds') {
    return handlePostWorlds(req, res, store);
  }

  if (method === 'GET') {
    const m = path.match(/^\/worlds\/([^/]+)\/(manifest|layers\/[^/]+|topology\/[^/]+)$/);
    if (m) {
      const worldId = decodeURIComponent(m[1]!);
      const sub = m[2]!;
      const world = store.get(worldId);
      if (!world) {
        sendJson(res, 404, { error: `unknown worldId: ${worldId}` });
        return;
      }
      if (sub === 'manifest') {
        sendJson(res, 200, world.manifest);
        return;
      }
      if (sub.startsWith('layers/')) {
        const name = sub.slice('layers/'.length);
        const layer = world.manifest.layers.find((l) => l.name === name);
        if (!layer) {
          sendJson(res, 404, { error: `unknown layer: ${name}` });
          return;
        }
        sendBlob(res, layer.resource, world.blobs.get(layer.resource.url));
        return;
      }
      if (sub.startsWith('topology/')) {
        const piece = sub.slice('topology/'.length);
        const ref = pickTopologyRef(world.manifest.topology, piece);
        if (!ref) {
          sendJson(res, 404, { error: `unknown topology piece: ${piece}` });
          return;
        }
        sendBlob(res, ref, world.blobs.get(ref.url));
        return;
      }
    }
  }

  sendJson(res, 404, { error: `no route for ${method} ${path}` });
}

async function handlePostWorlds(
  req: IncomingMessage,
  res: ServerResponse,
  store: WorldStore,
): Promise<void> {
  const body = await readJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'body must be a JSON object' });
    return;
  }
  const { seed, params } = body as { seed?: unknown; params?: unknown };
  if (typeof seed !== 'string') {
    sendJson(res, 400, { error: '`seed` must be a string' });
    return;
  }
  if (typeof params !== 'object' || params === null) {
    sendJson(res, 400, { error: '`params` must be an object' });
    return;
  }

  const state = runGenerate({ seed, params: params as Parameters<typeof runGenerate>[0]['params'] });
  const world = await serializeWorld(state, params as Parameters<typeof serializeWorld>[1]);
  store.put(world);
  const worldId = world.manifest.identity.worldId;
  sendJson(res, 201, {
    worldId,
    manifestUrl: `/worlds/${encodeURIComponent(worldId)}/manifest`,
  });
}

function pickTopologyRef(
  topology: { neighbors: ResourceRef; cellVertices: ResourceRef; edges: ResourceRef },
  piece: string,
): ResourceRef | null {
  switch (piece) {
    case 'neighbors': return topology.neighbors;
    case 'cellVertices': return topology.cellVertices;
    case 'edges': return topology.edges;
    default: return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = Buffer.from(JSON.stringify(body), 'utf-8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': json.byteLength,
  });
  res.end(json);
}

function sendBlob(res: ServerResponse, ref: ResourceRef, bytes: Uint8Array | undefined): void {
  if (!bytes) {
    sendJson(res, 500, { error: `blob missing for ${ref.url}` });
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': bytes.byteLength,
    'ETag': `"${ref.sha256}"`,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return null;
  return JSON.parse(raw);
}
