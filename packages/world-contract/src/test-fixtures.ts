import type { WorldManifest } from './manifest.js';

export function fixtureManifest(): WorldManifest {
  return {
    identity: {
      worldId: 'w_test_0001',
      schemaVersion: '1.0.0',
      generatorVersion: '0.1.0',
      seed: 'deadbeef',
      params: {
        numRegions: 64,
        samplingMethod: 'fibonacci',
      },
      createdAt: '2026-05-26T12:00:00Z',
    },
    numRegions: 64,
    numEdges: 192,
    resolution: {
      samplingMethod: 'fibonacci',
      targetRegions: 64,
      actualRegions: 64,
    },
    layers: [
      {
        name: 'latlon',
        kind: 'vec2',
        domain: 'region',
        dtype: 'f32',
        componentsPerEntry: 2,
        units: 'degrees',
        resource: {
          url: 'layers/latlon.bin',
          bytes: 64 * 2 * 4,
          sha256: 'a'.repeat(64),
        },
      },
      {
        name: 'elevation',
        kind: 'scalar',
        domain: 'region',
        dtype: 'f32',
        componentsPerEntry: 1,
        range: [-1, 1],
        units: 'normalized',
        resource: {
          url: 'layers/elevation.bin',
          bytes: 64 * 4,
          sha256: 'b'.repeat(64),
        },
      },
      {
        name: 'plate',
        kind: 'categorical',
        domain: 'region',
        dtype: 'i32',
        componentsPerEntry: 1,
        resource: {
          url: 'layers/plate.bin',
          bytes: 64 * 4,
          sha256: 'c'.repeat(64),
        },
      },
      {
        name: 'wind',
        kind: 'vec2',
        domain: 'region',
        dtype: 'f32',
        componentsPerEntry: 2,
        units: 'm/s',
        resource: {
          url: 'layers/wind.bin',
          bytes: 64 * 2 * 4,
          sha256: 'd'.repeat(64),
        },
      },
      {
        name: 'riverflow',
        kind: 'scalar',
        domain: 'edge',
        dtype: 'f32',
        componentsPerEntry: 1,
        resource: {
          url: 'layers/riverflow.bin',
          bytes: 192 * 4,
          sha256: 'e'.repeat(64),
        },
      },
    ],
    topology: {
      neighbors: {
        url: 'topology/neighbors.bin',
        bytes: 1024,
        sha256: '1'.repeat(64),
      },
      cellVertices: {
        url: 'topology/cellVertices.bin',
        bytes: 2048,
        sha256: '2'.repeat(64),
      },
      edges: {
        url: 'topology/edges.bin',
        bytes: 192 * 2 * 4,
        sha256: '3'.repeat(64),
      },
    },
  };
}
