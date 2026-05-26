export type WorldId = string;

export interface GenerationParams {
  readonly numRegions: number;
  readonly samplingMethod: SamplingMethod;
  /** Number of tectonic plates. Optional; engine picks a default if omitted. */
  readonly numPlates?: number;
  /** Fraction of the surface that should be below sea level, in [0, 1].
   *  Modeled on GURPS hydrographic coverage. Optional; engine default if omitted. */
  readonly oceanFraction?: number;
  readonly [key: string]: unknown;
}

export type SamplingMethod = 'fibonacci' | 'icosahedral';

export interface WorldIdentity {
  readonly worldId: WorldId;
  readonly schemaVersion: string;
  readonly generatorVersion: string;
  readonly seed: string;
  readonly params: GenerationParams;
  readonly createdAt: string;
}
