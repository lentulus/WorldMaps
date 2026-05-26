// Top-level generation entry. Pure function — no I/O, no Worker, no DOM.
// Phase 2: only populates the Fibonacci-sphere `latlon` layer.
// Subsequent phases extend `runGenerate` (or split it into staged passes).

import type { GenerationParams } from '@worldmaps/world-contract';
import { createWorldState, type WorldState } from './state.js';
import { fibonacciSphere } from './geom/sphere.js';
import { buildTopology } from './geom/voronoi.js';
import { createRng } from './rng.js';
import { assignPlates } from './generate/plates.js';
import { assignElevation } from './generate/elevation.js';
import { assignTemperature } from './simulate/temperature.js';
import { assignWind } from './simulate/wind.js';
import { assignHumidity } from './simulate/humidity.js';
import { assignClouds } from './simulate/clouds.js';

export interface GenerateRequest {
  readonly seed: string;
  readonly params: GenerationParams;
}

const DEFAULT_NUM_PLATES = 12;

export function runGenerate(req: GenerateRequest): WorldState {
  const { seed, params } = req;
  const target = params.numRegions;
  if (target < 1) throw new Error('numRegions must be >= 1');

  if (params.samplingMethod !== 'fibonacci') {
    throw new Error(
      `Phase 5: only samplingMethod="fibonacci" supported; got "${params.samplingMethod}"`,
    );
  }

  const actual = target;
  const latlon = new Float32Array(2 * actual);
  fibonacciSphere(actual, latlon);

  const topology = buildTopology(latlon, actual);

  const state = createWorldState(
    {
      seed,
      samplingMethod: params.samplingMethod,
      targetRegions: target,
      actualRegions: actual,
    },
    topology,
  );

  state.latlon.set(latlon);

  // Terrain pass (Phase 5).
  const rng = createRng(seed);
  const numPlates = Math.max(2, Math.min(actual, params.numPlates ?? DEFAULT_NUM_PLATES));
  const plates = assignPlates(actual, numPlates, topology, rng);
  state.plate.set(plates.plate);

  const elev = assignElevation(
    actual,
    numPlates,
    state.latlon,
    state.plate,
    plates.seedRegions,
    topology,
    rng,
    params.oceanFraction !== undefined ? { oceanFraction: params.oceanFraction } : {},
  );
  state.elevation.set(elev.elevation);

  // Weather pass (Phase 6). Order matters: temperature depends on elevation;
  // humidity uses temperature; clouds use humidity. Wind is independent.
  const temperature = assignTemperature(actual, state.latlon, state.elevation, topology);
  state.temperature.set(temperature);

  const wind = assignWind(actual, state.latlon);
  state.wind.set(wind);

  const humidity = assignHumidity(actual, state.elevation, state.temperature, topology);
  state.humidity.set(humidity);

  const clouds = assignClouds(actual, state.elevation, state.humidity, topology);
  state.clouds.set(clouds);

  return state;
}
