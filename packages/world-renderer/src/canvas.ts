// Canvas2D renderer. Phase 5: adds plate/elevation/satellite modes;
// equirectangular + orthographic projections. Projection + mesh + per-region
// coloring are decoupled so future phases can extend any axis independently.

import {
  equirectangularForward,
  orthographicForward,
  stereographicInverse,
  type LatLon,
} from '@worldmaps/world-engine';
import {
  regionIdColor,
  plateColor,
  elevationColor,
  satelliteColor,
} from './palette.js';
import type {
  RenderSource,
  RenderOptions,
  RenderMode,
  RenderProjection,
} from './types.js';

export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}

interface Pixel {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

interface ProjectFn {
  (p: LatLon): Pixel;
}

function makeProjector(
  projection: RenderProjection,
  width: number,
  height: number,
  cameraLat: number,
  cameraLon: number,
): ProjectFn {
  if (projection === 'equirectangular') {
    return (p) => {
      const q = equirectangularForward(p, width, height);
      return { x: q.x, y: q.y, visible: true };
    };
  }
  const scale = Math.min(width, height) * 0.48;
  const cx = width / 2;
  const cy = height / 2;
  return (p) => {
    const q = orthographicForward(p, cameraLat, cameraLon);
    return {
      x: cx + q.x * scale,
      y: cy - q.y * scale,
      visible: q.z >= 0,
    };
  };
}

/** Per-region color function for cell-fill modes. Returns null for modes that
 *  don't fill cells (dots) so the caller knows to use a different path. */
function makeCellColor(
  mode: RenderMode,
  source: RenderSource,
): ((regionId: number) => string) | null {
  switch (mode) {
    case 'cells':
      return (r) => regionIdColor(r);
    case 'plates': {
      const plate = source.plate;
      if (!plate) return (r) => regionIdColor(r); // fall back if not provided
      return (r) => plateColor(plate[r]!);
    }
    case 'elevation': {
      const elev = source.elevation;
      if (!elev) return null;
      return (r) => elevationColor(elev[r]!);
    }
    case 'satellite': {
      const elev = source.elevation;
      if (!elev) return null;
      return (r) => satelliteColor(elev[r]!);
    }
    case 'dots':
      return null;
  }
}

export function render(
  canvas: CanvasLike,
  source: RenderSource,
  options: RenderOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const { width, height, background } = options;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const project = makeProjector(
    options.projection,
    width,
    height,
    options.cameraLat,
    options.cameraLon,
  );

  if (options.projection === 'orthographic') {
    const scale = Math.min(width, height) * 0.48;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (options.mode === 'dots') {
    drawDots(ctx, source, options, project);
    return;
  }

  const cellColor = makeCellColor(options.mode, source);
  if (!cellColor) {
    // Required data not present (e.g. mode='elevation' but elevation layer absent).
    // Render nothing; caller is responsible for telling the user.
    return;
  }
  drawCells(ctx, source, options, project, cellColor);
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  source: RenderSource,
  options: RenderOptions,
  project: ProjectFn,
  cellColor: (r: number) => string,
): void {
  const { numRegions, cellVertexOffsets, cellVertexFlat, latlon } = source;

  for (let r = 0; r < numRegions; r++) {
    const start = cellVertexOffsets[r]!;
    const end = cellVertexOffsets[r + 1]!;
    const nVerts = (end - start) / 2;
    if (nVerts < 3) continue;

    if (options.projection === 'orthographic') {
      const lat = latlon[2 * r]!;
      const lon = latlon[2 * r + 1]!;
      const c = project({ lat, lon });
      if (!c.visible) continue;
    }

    ctx.fillStyle = cellColor(r);
    ctx.beginPath();

    let anyHidden = false;
    let first = true;
    for (let k = 0; k < nVerts; k++) {
      const sx = cellVertexFlat[start + 2 * k]!;
      const sy = cellVertexFlat[start + 2 * k + 1]!;
      const ll = stereographicInverse({ x: sx, y: sy });
      const p = project(ll);
      if (!p.visible) {
        anyHidden = true;
        break;
      }
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    if (options.projection === 'orthographic' && anyHidden) continue;

    ctx.closePath();
    ctx.fill();
  }
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  source: RenderSource,
  options: RenderOptions,
  project: ProjectFn,
): void {
  const { dotRadius } = options;
  const { numRegions, latlon } = source;

  ctx.fillStyle = '#e0e0e0';
  for (let r = 0; r < numRegions; r++) {
    const lat = latlon[2 * r]!;
    const lon = latlon[2 * r + 1]!;
    const p = project({ lat, lon });
    if (!p.visible) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
