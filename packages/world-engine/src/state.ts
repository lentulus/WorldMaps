// WorldState is the typed-array container holding all per-region and per-edge
// engine output. Phases grow it: Phase 2 adds `latlon`; Phase 3 adds topology;
// Phases 5/6/7 add terrain/weather/rivers.

import type { SamplingMethod } from '@worldmaps/world-contract';
import type { Topology } from './geom/voronoi.js';

export interface WorldStateMeta {
  readonly seed: string;
  readonly samplingMethod: SamplingMethod;
  readonly targetRegions: number;
  readonly actualRegions: number;
}

export interface WorldState {
  readonly meta: WorldStateMeta;
  readonly numRegions: number;

  /** Interleaved [lat, lon] in degrees. Length = 2 * numRegions. */
  readonly latlon: Float32Array;

  /** Voronoi topology — populated in Phase 3. Null before then. */
  readonly topology: Topology | null;

  /** Plate id per region. Length = numRegions. Filled in Phase 5; zeroed before. */
  readonly plate: Int32Array;

  /** Elevation per region, range [-1, 1]. Length = numRegions. Filled in Phase 5. */
  readonly elevation: Float32Array;

  /** Temperature per region, °C. Length = numRegions. Filled in Phase 6. */
  readonly temperature: Float32Array;

  /** Relative humidity per region, [0, 1]. Length = numRegions. Filled in Phase 6. */
  readonly humidity: Float32Array;

  /** Cloud cover per region, [0, 1]. Length = numRegions. Filled in Phase 6. */
  readonly clouds: Float32Array;

  /** Surface wind per region, tangent-frame [east m/s, north m/s] interleaved.
   *  Length = 2 * numRegions. Tangent-frame storage means the stored
   *  magnitude IS the physical wind speed at every latitude — decision 10. */
  readonly wind: Float32Array;

  // Future phases:
  //   - Phase 7: riverflow (edge), riverPresence (region)
}

export function createWorldState(meta: WorldStateMeta, topology: Topology | null = null): WorldState {
  const n = meta.actualRegions;
  return {
    meta,
    numRegions: n,
    latlon: new Float32Array(2 * n),
    topology,
    plate: new Int32Array(n),
    elevation: new Float32Array(n),
    temperature: new Float32Array(n),
    humidity: new Float32Array(n),
    clouds: new Float32Array(n),
    wind: new Float32Array(2 * n),
  };
}

/**
 * Collect every ArrayBuffer in a WorldState that can be transferred (zero-copy)
 * across a Worker boundary. Order is stable so tests can assert exact composition.
 */
export function collectTransferables(state: WorldState): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [
    state.latlon.buffer as ArrayBuffer,
    state.plate.buffer as ArrayBuffer,
    state.elevation.buffer as ArrayBuffer,
    state.temperature.buffer as ArrayBuffer,
    state.humidity.buffer as ArrayBuffer,
    state.clouds.buffer as ArrayBuffer,
    state.wind.buffer as ArrayBuffer,
  ];
  if (state.topology) {
    buffers.push(
      state.topology.neighbors.offsets.buffer as ArrayBuffer,
      state.topology.neighbors.flat.buffer as ArrayBuffer,
      state.topology.cellVertices.offsets.buffer as ArrayBuffer,
      state.topology.cellVertices.flat.buffer as ArrayBuffer,
      state.topology.edges.buffer as ArrayBuffer,
      state.topology.cellArea.buffer as ArrayBuffer,
    );
  }
  return buffers;
}
