// Phase 4 canvas snapshot test.
//
// The plan calls for a low-resolution canvas-hash snapshot. Real Canvas2D
// isn't available in vitest's Node environment without adding `canvas`
// (node-canvas, native build). To stay light, we:
//   (1) golden-master the renderer's *input* — a tiny world's latlon and
//       cellVertex CSR — which is the deterministic-within-process output of
//       the engine. Any regression in topology or sphere flows through here.
//   (2) capture the sequence of canvas-API operations against a recording
//       stub and snapshot that, which proves render() does different things
//       in each mode and the same thing across runs.
//
// A true pixel-hash test happens once the studio integration test (Playwright /
// browser harness) lands; deferred per the BP 4 boundary in plan1.md.

import { describe, it, expect } from 'vitest';
import { runGenerate } from '@worldmaps/world-engine';
import { render } from './canvas.js';
import type { RenderSource, RenderOptions } from './types.js';

interface RecordedOp {
  readonly call: string;
  readonly args: unknown[];
}

function makeRecordingCanvas(width: number, height: number) {
  const ops: RecordedOp[] = [];
  const ctx = new Proxy(
    {
      fillStyle: '',
      lineWidth: 0,
    },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        return (...args: unknown[]) => {
          ops.push({ call: String(prop), args });
        };
      },
      set(target, prop, value) {
        (target as Record<string | symbol, unknown>)[prop] = value;
        ops.push({ call: `set:${String(prop)}`, args: [value] });
        return true;
      },
    },
  );
  const canvas = {
    width,
    height,
    getContext: (_id: '2d') => ctx as unknown as CanvasRenderingContext2D,
  };
  return { canvas, ops };
}

function makeTinySource(): RenderSource {
  const state = runGenerate({
    seed: 'snapshot',
    params: { numRegions: 64, samplingMethod: 'fibonacci' },
  });
  if (!state.topology) throw new Error('engine returned no topology');
  return {
    numRegions: state.numRegions,
    latlon: state.latlon,
    cellVertexOffsets: state.topology.cellVertices.offsets,
    cellVertexFlat: state.topology.cellVertices.flat,
  };
}

const baseOptions: Omit<RenderOptions, 'mode'> = {
  projection: 'equirectangular',
  width: 64,
  height: 32,
  background: '#000',
  dotRadius: 1,
  cameraLat: 0,
  cameraLon: 0,
};

describe('renderer — input determinism (golden-master)', () => {
  it('tiny-world latlon is stable across runs', () => {
    const a = makeTinySource();
    const b = makeTinySource();
    expect(a.latlon).toEqual(b.latlon);
  });

  it('tiny-world cellVertex CSR is stable across runs', () => {
    const a = makeTinySource();
    const b = makeTinySource();
    expect(a.cellVertexOffsets).toEqual(b.cellVertexOffsets);
    expect(a.cellVertexFlat).toEqual(b.cellVertexFlat);
  });

  it('first 8 latlon entries match expected fingerprint', () => {
    // Snapshot of the first 8 lat/lon values for seed="snapshot", N=64.
    // If this fails, the engine output for tiny worlds has changed — verify
    // that the change was intentional before updating the baseline.
    const { latlon } = makeTinySource();
    const fingerprint = Array.from(latlon.subarray(0, 16)).map((v) => v.toFixed(4));
    expect(fingerprint).toMatchInlineSnapshot(`
      [
        "79.8582",
        "0.0000",
        "72.3876",
        "137.5078",
        "67.2018",
        "275.0155",
        "62.9519",
        "52.5233",
        "59.2465",
        "190.0311",
        "55.9066",
        "327.5388",
        "52.8327",
        "105.0466",
        "49.9626",
        "242.5544",
      ]
    `);
  });
});

describe('renderer — mode produces different operations', () => {
  it('cells mode and dots mode produce different op sequences', () => {
    const source = makeTinySource();
    const cellsRec = makeRecordingCanvas(64, 32);
    const dotsRec = makeRecordingCanvas(64, 32);
    render(cellsRec.canvas, source, { ...baseOptions, mode: 'cells' });
    render(dotsRec.canvas, source, { ...baseOptions, mode: 'dots' });
    expect(cellsRec.ops.length).toBeGreaterThan(0);
    expect(dotsRec.ops.length).toBeGreaterThan(0);
    expect(cellsRec.ops).not.toEqual(dotsRec.ops);
  });

  it('cells mode is deterministic across runs', () => {
    const source = makeTinySource();
    const a = makeRecordingCanvas(64, 32);
    const b = makeRecordingCanvas(64, 32);
    render(a.canvas, source, { ...baseOptions, mode: 'cells' });
    render(b.canvas, source, { ...baseOptions, mode: 'cells' });
    expect(a.ops).toEqual(b.ops);
  });

  it('dots mode is deterministic across runs', () => {
    const source = makeTinySource();
    const a = makeRecordingCanvas(64, 32);
    const b = makeRecordingCanvas(64, 32);
    render(a.canvas, source, { ...baseOptions, mode: 'dots' });
    render(b.canvas, source, { ...baseOptions, mode: 'dots' });
    expect(a.ops).toEqual(b.ops);
  });
});
