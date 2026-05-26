// Renderer-side types. Decoupled from the engine: the renderer accepts a
// `RenderSource` view, not a WorldState directly, so it depends only on
// world-contract semantics (latlon + cell vertex CSR).

export type RenderMode =
  | 'dots'
  | 'cells'
  | 'plates'
  | 'elevation'
  | 'satellite'
  | 'climate'
  | 'temperature'
  | 'humidity'
  | 'clouds'
  | 'currents'
  | 'rivers';
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

  /** Per-region temperature, °C. Filled from Phase 6. */
  readonly temperature?: Float32Array;

  /** Per-region relative humidity in [0, 1]. Filled from Phase 6. */
  readonly humidity?: Float32Array;

  /** Per-region cloud cover in [0, 1]. Filled from Phase 6. */
  readonly clouds?: Float32Array;

  /** Per-region wind, tangent-frame [east, north] interleaved (m/s). Filled from Phase 6. */
  readonly wind?: Float32Array;

  /** Per-region surface ocean current, tangent-frame [east, north] interleaved (m/s).
   *  Filled from Phase 7. Land cells are (0, 0). */
  readonly currents?: Float32Array;

  /** Per-region river presence in [0, 1]. Filled from Phase 7. */
  readonly riverPresence?: Float32Array;

  /** Per-edge river flow, length = numEdges. Filled from Phase 7. */
  readonly riverflow?: Float32Array;

  /** Interleaved (regionA, regionB) per edge. Length = 2 * numEdges. */
  readonly edges?: Int32Array;
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
  /** Draw current-vector arrows on top of the cell pass. Independent of mode
   *  — works as an overlay over satellite, climate, currents, etc. */
  readonly showCurrentArrows?: boolean;
  /** Sample one arrow every N ocean cells. Default 16. */
  readonly currentArrowEveryN?: number;
}
