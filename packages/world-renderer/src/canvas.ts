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
  temperatureColor,
  humidityColor,
  cloudColor,
  climateColor,
  currentColor,
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
    case 'temperature': {
      const temp = source.temperature;
      if (!temp) return null;
      return (r) => temperatureColor(temp[r]!);
    }
    case 'humidity': {
      const hum = source.humidity;
      if (!hum) return null;
      return (r) => humidityColor(hum[r]!);
    }
    case 'clouds': {
      const cl = source.clouds;
      if (!cl) return null;
      return (r) => cloudColor(cl[r]!);
    }
    case 'climate': {
      const elev = source.elevation;
      const cl = source.clouds;
      if (!elev || !cl) return null;
      return (r) => climateColor(elev[r]!, cl[r]!);
    }
    case 'currents': {
      const elev = source.elevation;
      const cur = source.currents;
      if (!elev || !cur) return null;
      return (r) => {
        const u = cur[2 * r]!;
        const v = cur[2 * r + 1]!;
        const m = Math.hypot(u, v);
        return currentColor(elev[r]!, m);
      };
    }
    case 'rivers': {
      // 'rivers' is a satellite-base cell pass; the actual rivers are drawn
      // as edge lines in the overlay pass after cells. (Decision 30: rivers
      // are line geometry, not per-region tint.)
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

  // Overlay passes. Rivers are line geometry tied to the rivers mode (decision
  // 30). Currents arrows are an independent toggle that works over any mode
  // (decision 31).
  if (options.mode === 'rivers') {
    drawRiverLines(ctx, source, project);
  }
  if (options.showCurrentArrows) {
    drawCurrentArrows(ctx, source, options, project);
  }
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

/** Overlay pass: draw river edges as cell-center-to-cell-center line segments,
 *  width and alpha scaled by normalized flow. Cheap (one stroke per edge over
 *  threshold) and works in any projection because both endpoints are real
 *  cell centers. */
function drawRiverLines(
  ctx: CanvasRenderingContext2D,
  source: RenderSource,
  project: ProjectFn,
): void {
  const { riverflow, edges, latlon } = source;
  if (!riverflow || !edges) return;
  const numEdges = riverflow.length;
  if (numEdges === 0) return;

  // Per-render normalization. We don't keep state between draws.
  let maxFlow = 0;
  for (let e = 0; e < numEdges; e++) {
    const f = riverflow[e]!;
    if (f > maxFlow) maxFlow = f;
  }
  if (maxFlow === 0) return;

  // Anything below this fraction of the max is too thin to draw and just
  // adds clutter at high N.
  const minNormFlow = 0.01;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let e = 0; e < numEdges; e++) {
    const f = riverflow[e]!;
    const nf = f / maxFlow;
    if (nf < minNormFlow) continue;
    const a = edges[2 * e]!;
    const b = edges[2 * e + 1]!;
    const pA = project({ lat: latlon[2 * a]!, lon: latlon[2 * a + 1]! });
    const pB = project({ lat: latlon[2 * b]!, lon: latlon[2 * b + 1]! });
    if (!pA.visible || !pB.visible) continue;

    // Sqrt ramp so trunks dominate but tributaries remain readable.
    const ramp = Math.sqrt(nf);
    // 1.2–4.5 px width and bright cyan-white so lines pop against any base.
    const lineWidth = 1.2 + ramp * 3.3;
    const alpha = 0.55 + ramp * 0.4;
    ctx.strokeStyle = `rgba(140, 200, 255, ${alpha.toFixed(3)})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
  }
}

/** Overlay pass: draw current vectors as short arrows at a sampled subset of
 *  ocean cells. The arrow tip is the cell center displaced by the current
 *  direction along the great circle, then projected — this keeps the visible
 *  direction correct under both equirectangular and orthographic. */
function drawCurrentArrows(
  ctx: CanvasRenderingContext2D,
  source: RenderSource,
  options: RenderOptions,
  project: ProjectFn,
): void {
  const { currents, elevation, latlon, numRegions } = source;
  if (!currents) return;
  const everyN = Math.max(1, Math.floor(options.currentArrowEveryN ?? 16));

  // Find the global current magnitude so all arrows share a length scale.
  let maxMag = 0;
  for (let r = 0; r < numRegions; r++) {
    if (elevation && elevation[r]! > 0) continue;
    const m = Math.hypot(currents[2 * r]!, currents[2 * r + 1]!);
    if (m > maxMag) maxMag = m;
  }
  if (maxMag === 0) return;

  // Arrow length scaled in radians (angular distance along the great circle).
  // ~2° at max magnitude reads cleanly at N=512–4096; smaller worlds get
  // visibly bigger arrows because the projector zoom is the same.
  const maxArrowRad = 2 * (Math.PI / 180);

  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  for (let r = 0; r < numRegions; r += everyN) {
    if (elevation && elevation[r]! > 0) continue;
    const ce = currents[2 * r]!;
    const cn = currents[2 * r + 1]!;
    const mag = Math.hypot(ce, cn);
    if (mag < 1e-4) continue;

    const lat = latlon[2 * r]!;
    const lon = latlon[2 * r + 1]!;
    const cp = Math.cos(lat * (Math.PI / 180));
    const sp = Math.sin(lat * (Math.PI / 180));
    const cl = Math.cos(lon * (Math.PI / 180));
    const sl = Math.sin(lon * (Math.PI / 180));

    // 3D unit at the cell.
    const ux = cp * cl;
    const uy = cp * sl;
    const uz = sp;

    // Tangent basis (east, north) at (lat, lon).
    const eX = -sl;
    const eY = cl;
    const eZ = 0;
    const nX = -sp * cl;
    const nY = -sp * sl;
    const nZ = cp;

    // Displacement: maxArrowRad * (mag/maxMag) along the current direction.
    const step = maxArrowRad * (mag / maxMag);
    const dirE = ce / mag;
    const dirN = cn / mag;
    const dx = step * (dirE * eX + dirN * nX);
    const dy = step * (dirE * eY + dirN * nY);
    const dz = step * (dirE * eZ + dirN * nZ);
    const tx = ux + dx;
    const ty = uy + dy;
    const tz = uz + dz;
    const tlen = Math.hypot(tx, ty, tz);
    const tlat = Math.asin(tz / tlen) * (180 / Math.PI);
    let tlon = Math.atan2(ty / tlen, tx / tlen) * (180 / Math.PI);
    if (tlon < 0) tlon += 360;

    const p1 = project({ lat, lon });
    const p2 = project({ lat: tlat, lon: tlon });
    if (!p1.visible || !p2.visible) continue;

    const alpha = 0.45 + 0.5 * (mag / maxMag);
    ctx.strokeStyle = `rgba(70, 230, 230, ${alpha.toFixed(3)})`;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Arrowhead: two short strokes off the tip, at ±25° from the inbound dir.
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const vlen = Math.hypot(vx, vy);
    if (vlen < 1.5) continue;
    const headLen = Math.min(4, vlen * 0.4);
    const ang = 25 * (Math.PI / 180);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ux2 = vx / vlen;
    const uy2 = vy / vlen;
    // Two rotations by ±ang of the *inbound* unit vector, then go backwards from tip.
    const ax1 = -(ca * ux2 - sa * uy2) * headLen;
    const ay1 = -(sa * ux2 + ca * uy2) * headLen;
    const ax2 = -(ca * ux2 + sa * uy2) * headLen;
    const ay2 = -(-sa * ux2 + ca * uy2) * headLen;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x + ax1, p2.y + ay1);
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x + ax2, p2.y + ay2);
    ctx.stroke();
  }
}
