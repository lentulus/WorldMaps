import { describe, it, expect } from 'vitest';
import { handleRequest } from './worker-protocol.js';

describe('worker protocol — handleRequest', () => {
  it('returns a `generated` response for a valid generate request', () => {
    const { response } = handleRequest({
      type: 'generate',
      request: {
        seed: 'test',
        params: { numRegions: 64, samplingMethod: 'fibonacci' },
      },
    });
    expect(response.type).toBe('generated');
    if (response.type !== 'generated') throw new Error('unreachable');
    expect(response.state.numRegions).toBe(64);
    expect(response.state.latlon.length).toBe(2 * 64);
    expect(response.state.meta.seed).toBe('test');
  });

  it('includes every WorldState typed-array buffer in the transferables list', () => {
    const { response, transfer } = handleRequest({
      type: 'generate',
      request: {
        seed: 'transferables',
        params: { numRegions: 64, samplingMethod: 'fibonacci' },
      },
    });
    if (response.type !== 'generated') throw new Error('unreachable');
    const topology = response.state.topology;
    expect(topology).not.toBeNull();
    if (!topology) throw new Error('unreachable');

    // Phase 5: latlon + plate + elevation + 5 topology buffers = 8.
    // When future phases add more typed-array layers, this assertion will fail
    // and force collectTransferables to be updated — that's the point.
    expect(transfer).toHaveLength(8);
    expect(transfer).toContain(response.state.latlon.buffer);
    expect(transfer).toContain(response.state.plate.buffer);
    expect(transfer).toContain(response.state.elevation.buffer);
    expect(transfer).toContain(topology.neighbors.offsets.buffer);
    expect(transfer).toContain(topology.neighbors.flat.buffer);
    expect(transfer).toContain(topology.cellVertices.offsets.buffer);
    expect(transfer).toContain(topology.cellVertices.flat.buffer);
    expect(transfer).toContain(topology.edges.buffer);
  });

  it('returns an `error` response on invalid params', () => {
    const { response, transfer } = handleRequest({
      type: 'generate',
      request: {
        seed: 'bad',
        params: { numRegions: 0, samplingMethod: 'fibonacci' },
      },
    });
    expect(response.type).toBe('error');
    expect(transfer).toHaveLength(0);
  });

  it('returns an `error` response for unsupported samplingMethod', () => {
    const { response } = handleRequest({
      type: 'generate',
      request: {
        seed: 'bad',
        params: { numRegions: 32, samplingMethod: 'icosahedral' },
      },
    });
    expect(response.type).toBe('error');
  });
});
