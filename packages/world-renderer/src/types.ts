// Renderer-side types. Decoupled from the engine: the renderer accepts a
// `RenderSource` view, not a WorldState directly, so it depends only on
// world-contract semantics (latlon + cell vertex CSR).

export type RenderMode =
  | 'dots'
  | 'cells'
  | 'plates'
  | 'elevation'
  | 'satellite';
export type RenderProjection = 'equirectangular' | 'orthographic';

export interface RenderSource {
  readonly numRegions: number;

  /** Interleaved [lat, lon] degrees. Length = 2 * numRegions. */
  readonly latlon: Float32Array;

  /** CSR cell-vertex offsets. Length = numRegions + 1. */
  readonly cellVertexOffsets: Int32Array;

  /** CSR cell-vertex flat. Interleaved [x, y] in stereographic-projected space. */
  readonly cellVertexFlat: Float32Array;

  /** Per-region plate id. Filled from Phase 5. */
  readonly plate?: Int32Array;

  /** Per-region elevation in [-1, 1]. Filled from Phase 5. */
  readonly elevation?: Float32Array;
}

export interface RenderOptions {
  readonly mode: RenderMode;
  readonly projection: RenderProjection;
  readonly width: number;
  readonly height: number;
  /** Background fill color, CSS string. */
  readonly background: string;
  /** Dot radius in px (`mode === 'dots'`). */
  readonly dotRadius: number;
  /** Orthographic camera latitude (degrees). Ignored for equirectangular. */
  readonly cameraLat: number;
  /** Orthographic camera longitude (degrees). Ignored for equirectangular. */
  readonly cameraLon: number;
}
