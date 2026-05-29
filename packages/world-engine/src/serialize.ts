// Phase 8: serialize a WorldState to the contract format (manifest + blobs)
// and hydrate it back. The contract owns the *shape*; this module owns the
// *bytes*.
//
// Format:
//   - One JSON manifest (see @worldmaps/world-contract WorldManifest).
//   - One binary blob per ResourceRef, addressed by `url` relative to the
//     manifest. Studio packs them into a zip; service serves them as files.
//
// Layer set (final per decisions 29–31):
//   latlon, plate, elevation, temperature, wind, humidity, clouds, currents,
//   riverPresence  → region-domain
//   riverflow      → edge-domain (first user of the edge discriminator)
//
// Topology CSR encoding (single blob per CSR):
//   neighbors.bin     = [offsets: Int32 × (numRegions+1)] [flat: Int32 × totalAdj]
//   cellVertices.bin  = [offsets: Int32 × (numRegions+1)] [flat: Float32 × totalVerts]
//   edges.bin         = [Int32 × (2 * numEdges)] (interleaved a,b pairs)
//
// The loader knows numRegions from the manifest, so the offsets array length
// is implicit; total payload size is encoded in ResourceRef.bytes.
//
// Endianness: blobs are written using the host platform's native byte order
// (typed-array views). Decision 12 promises *load determinism* on the same
// machine, not portable byte-identity, so this is acceptable for v1.

import {
  CURRENT_SCHEMA_VERSION,
  type GenerationParams,
  type LayerDescriptor,
  type ResourceRef,
  type SamplingMethod,
  type WorldManifest,
} from '@worldmaps/world-contract';
import { createWorldState, type WorldState } from './state.js';
import type { CsrArray, CsrFloatArray, Topology } from './geom/voronoi.js';

export const GENERATOR_VERSION = '0.1.0' as const;

export interface SerializedWorld {
  readonly manifest: WorldManifest;
  /** Blobs keyed by ResourceRef.url. Each value is the exact bytes the
   *  manifest's ResourceRef points at. */
  readonly blobs: ReadonlyMap<string, Uint8Array>;
}

export interface SerializeOptions {
  /** Override the generated worldId. Useful for tests that need a stable id. */
  readonly worldId?: string;
  /** Override the createdAt timestamp. Useful for tests. */
  readonly createdAt?: string;
}

export async function serializeWorld(
  state: WorldState,
  params: GenerationParams,
  options: SerializeOptions = {},
): Promise<SerializedWorld> {
  if (!state.topology) {
    throw new Error('serializeWorld: state.topology is null — generation did not run');
  }
  const topology = state.topology;
  const blobs = new Map<string, Uint8Array>();

  const layerDescriptors: LayerDescriptor[] = [];
  layerDescriptors.push(
    await emitLayer(blobs, 'latlon', 'layers/latlon.bin', state.latlon, {
      kind: 'vec2', domain: 'region', dtype: 'f32', componentsPerEntry: 2, units: 'degrees',
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'plate', 'layers/plate.bin', state.plate, {
      kind: 'categorical', domain: 'region', dtype: 'i32', componentsPerEntry: 1,
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'elevation', 'layers/elevation.bin', state.elevation, {
      kind: 'scalar', domain: 'region', dtype: 'f32', componentsPerEntry: 1,
      range: [-1, 1], units: 'normalized',
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'temperature', 'layers/temperature.bin', state.temperature, {
      kind: 'scalar', domain: 'region', dtype: 'f32', componentsPerEntry: 1, units: 'celsius',
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'wind', 'layers/wind.bin', state.wind, {
      kind: 'vec2', domain: 'region', dtype: 'f32', componentsPerEntry: 2, units: 'm/s',
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'humidity', 'layers/humidity.bin', state.humidity, {
      kind: 'scalar', domain: 'region', dtype: 'f32', componentsPerEntry: 1, range: [0, 1],
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'clouds', 'layers/clouds.bin', state.clouds, {
      kind: 'scalar', domain: 'region', dtype: 'f32', componentsPerEntry: 1, range: [0, 1],
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'currents', 'layers/currents.bin', state.currents, {
      kind: 'vec2', domain: 'region', dtype: 'f32', componentsPerEntry: 2, units: 'm/s',
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'riverflow', 'layers/riverflow.bin', state.riverflow, {
      kind: 'scalar', domain: 'edge', dtype: 'f32', componentsPerEntry: 1,
    }),
  );
  layerDescriptors.push(
    await emitLayer(blobs, 'riverPresence', 'layers/riverPresence.bin', state.riverPresence, {
      kind: 'scalar', domain: 'region', dtype: 'f32', componentsPerEntry: 1, range: [0, 1],
    }),
  );

  const neighborsRef = await emitBlob(blobs, 'topology/neighbors.bin', concatCsrInt(topology.neighbors));
  const cellVerticesRef = await emitBlob(blobs, 'topology/cellVertices.bin', concatCsrFloat(topology.cellVertices));
  const edgesRef = await emitBlob(blobs, 'topology/edges.bin', viewBytes(topology.edges));

  const manifest: WorldManifest = {
    identity: {
      worldId: options.worldId ?? generateWorldId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      seed: state.meta.seed,
      params,
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    numRegions: state.numRegions,
    numEdges: state.numEdges,
    resolution: {
      samplingMethod: state.meta.samplingMethod,
      targetRegions: state.meta.targetRegions,
      actualRegions: state.meta.actualRegions,
    },
    layers: layerDescriptors,
    topology: {
      neighbors: neighborsRef,
      cellVertices: cellVerticesRef,
      edges: edgesRef,
    },
  };

  return { manifest, blobs };
}

export async function deserializeWorld(
  manifest: WorldManifest,
  blobs: ReadonlyMap<string, Uint8Array>,
): Promise<WorldState> {
  const samplingMethod: SamplingMethod = manifest.resolution.samplingMethod;
  const numRegions = manifest.numRegions;
  const numEdges = manifest.numEdges;

  const neighborsBytes = takeBlob(blobs, manifest.topology.neighbors);
  const cellVerticesBytes = takeBlob(blobs, manifest.topology.cellVertices);
  const edgesBytes = takeBlob(blobs, manifest.topology.edges);

  const neighbors = splitCsrInt(neighborsBytes, numRegions);
  const cellVertices = splitCsrFloat(cellVerticesBytes, numRegions);
  const edges = bytesToInt32(edgesBytes);
  if (edges.length !== 2 * numEdges) {
    throw new Error(`edges length mismatch: expected ${2 * numEdges}, got ${edges.length}`);
  }

  const layerByName = new Map<string, LayerDescriptor>();
  for (const layer of manifest.layers) layerByName.set(layer.name, layer);

  const cellArea = new Float32Array(numRegions);
  const topology: Topology = { neighbors, cellVertices, edges, numEdges, cellArea };

  const state = createWorldState(
    {
      seed: manifest.identity.seed,
      samplingMethod,
      targetRegions: manifest.resolution.targetRegions,
      actualRegions: manifest.resolution.actualRegions,
    },
    topology,
  );

  loadLayerInto(state.latlon, blobs, layerByName.get('latlon'));
  loadLayerInto(state.plate, blobs, layerByName.get('plate'));
  loadLayerInto(state.elevation, blobs, layerByName.get('elevation'));
  loadLayerInto(state.temperature, blobs, layerByName.get('temperature'));
  loadLayerInto(state.wind, blobs, layerByName.get('wind'));
  loadLayerInto(state.humidity, blobs, layerByName.get('humidity'));
  loadLayerInto(state.clouds, blobs, layerByName.get('clouds'));
  loadLayerInto(state.currents, blobs, layerByName.get('currents'));
  loadLayerInto(state.riverflow, blobs, layerByName.get('riverflow'));
  loadLayerInto(state.riverPresence, blobs, layerByName.get('riverPresence'));

  return state;
}

// --- helpers --------------------------------------------------------------

type TypedArray = Float32Array | Int32Array | Uint8Array | Uint32Array;

type LayerMeta = Omit<LayerDescriptor, 'name' | 'resource'>;

async function emitLayer(
  blobs: Map<string, Uint8Array>,
  name: string,
  url: string,
  array: TypedArray,
  meta: LayerMeta,
): Promise<LayerDescriptor> {
  const resource = await emitBlob(blobs, url, viewBytes(array));
  return { name, resource, ...meta };
}

async function emitBlob(
  blobs: Map<string, Uint8Array>,
  url: string,
  bytes: Uint8Array,
): Promise<ResourceRef> {
  blobs.set(url, bytes);
  const sha256 = await sha256Hex(bytes);
  return { url, bytes: bytes.byteLength, sha256 };
}

function viewBytes(arr: TypedArray): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function concatCsrInt(csr: CsrArray): Uint8Array {
  const out = new Uint8Array(csr.offsets.byteLength + csr.flat.byteLength);
  out.set(viewBytes(csr.offsets), 0);
  out.set(viewBytes(csr.flat), csr.offsets.byteLength);
  return out;
}

function concatCsrFloat(csr: CsrFloatArray): Uint8Array {
  const out = new Uint8Array(csr.offsets.byteLength + csr.flat.byteLength);
  out.set(viewBytes(csr.offsets), 0);
  out.set(viewBytes(csr.flat), csr.offsets.byteLength);
  return out;
}

function splitCsrInt(bytes: Uint8Array, numRegions: number): CsrArray {
  const offsetsBytes = (numRegions + 1) * 4;
  if (bytes.byteLength < offsetsBytes) {
    throw new Error(`CSR int blob too short: ${bytes.byteLength} < ${offsetsBytes}`);
  }
  const offsets = copyToInt32(bytes.subarray(0, offsetsBytes));
  const flatLen = offsets[numRegions]!;
  const flatBytes = flatLen * 4;
  if (bytes.byteLength !== offsetsBytes + flatBytes) {
    throw new Error(
      `CSR int blob length mismatch: expected ${offsetsBytes + flatBytes}, got ${bytes.byteLength}`,
    );
  }
  const flat = copyToInt32(bytes.subarray(offsetsBytes));
  return { offsets, flat };
}

function splitCsrFloat(bytes: Uint8Array, numRegions: number): CsrFloatArray {
  const offsetsBytes = (numRegions + 1) * 4;
  if (bytes.byteLength < offsetsBytes) {
    throw new Error(`CSR float blob too short: ${bytes.byteLength} < ${offsetsBytes}`);
  }
  const offsets = copyToInt32(bytes.subarray(0, offsetsBytes));
  const flatLen = offsets[numRegions]!;
  const flatBytes = flatLen * 4;
  if (bytes.byteLength !== offsetsBytes + flatBytes) {
    throw new Error(
      `CSR float blob length mismatch: expected ${offsetsBytes + flatBytes}, got ${bytes.byteLength}`,
    );
  }
  const flat = copyToFloat32(bytes.subarray(offsetsBytes));
  return { offsets, flat };
}

function copyToInt32(src: Uint8Array): Int32Array {
  const out = new Int32Array(src.byteLength / 4);
  new Uint8Array(out.buffer).set(src);
  return out;
}

function copyToFloat32(src: Uint8Array): Float32Array {
  const out = new Float32Array(src.byteLength / 4);
  new Uint8Array(out.buffer).set(src);
  return out;
}

function bytesToInt32(src: Uint8Array): Int32Array {
  return copyToInt32(src);
}

function takeBlob(blobs: ReadonlyMap<string, Uint8Array>, ref: ResourceRef): Uint8Array {
  const blob = blobs.get(ref.url);
  if (!blob) throw new Error(`missing blob: ${ref.url}`);
  if (blob.byteLength !== ref.bytes) {
    throw new Error(`blob ${ref.url} length mismatch: expected ${ref.bytes}, got ${blob.byteLength}`);
  }
  return blob;
}

function loadLayerInto(
  dest: TypedArray,
  blobs: ReadonlyMap<string, Uint8Array>,
  descriptor: LayerDescriptor | undefined,
): void {
  if (!descriptor) throw new Error('manifest missing required layer');
  const blob = takeBlob(blobs, descriptor.resource);
  if (blob.byteLength !== dest.byteLength) {
    throw new Error(
      `layer ${descriptor.name} byte size mismatch: blob ${blob.byteLength}, slot ${dest.byteLength}`,
    );
  }
  new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(blob);
}

function generateWorldId(): string {
  // crypto.randomUUID() is available in Node 19+ and all modern browsers.
  const uuid = globalThis.crypto.randomUUID();
  return `w_${uuid}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', view.buffer);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}
