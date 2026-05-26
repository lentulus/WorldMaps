import { render, type RenderSource } from '@worldmaps/world-renderer';
import type {
  RequestMessage,
  ResponseMessage,
} from '@worldmaps/world-engine';
import EngineWorker from '@worldmaps/world-engine/src/worker.ts?worker';
import { buildPanel, type UiState } from './panel.js';

const ui: UiState = {
  numRegions: 512,
  seed: 'hello-world',
  numPlates: 12,
  oceanFraction: 0.6,
  mode: 'satellite',
  projection: 'orthographic',
  cameraLat: 20,
  cameraLon: 0,
  background: '#0a0a0a',
  dotRadius: 2,
  showCurrentArrows: false,
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const panelEl = document.getElementById('panel')!;

const worker = new EngineWorker();

let currentSource: RenderSource | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function postGenerate(): void {
  setStatus(`generating world (N=${ui.numRegions}, seed="${ui.seed}")…`);
  const t0 = performance.now();
  worker.onmessage = (event: MessageEvent<ResponseMessage>) => {
    const dt = performance.now() - t0;
    const msg = event.data;
    if (msg.type === 'error') {
      setStatus(`error: ${msg.message}`);
      return;
    }
    const { state } = msg;
    if (!state.topology) {
      setStatus('error: engine returned no topology');
      return;
    }
    currentSource = {
      numRegions: state.numRegions,
      latlon: state.latlon,
      cellVertexOffsets: state.topology.cellVertices.offsets,
      cellVertexFlat: state.topology.cellVertices.flat,
      plate: state.plate,
      elevation: state.elevation,
      temperature: state.temperature,
      humidity: state.humidity,
      clouds: state.clouds,
      wind: state.wind,
      currents: state.currents,
      riverPresence: state.riverPresence,
      riverflow: state.riverflow,
      edges: state.topology.edges,
    };
    redraw();
    setStatus(
      `generated N=${state.numRegions} in ${dt.toFixed(0)} ms · mode=${ui.mode} · ${
        state.topology.numEdges
      } edges`,
    );
  };
  const request: RequestMessage = {
    type: 'generate',
    request: {
      seed: ui.seed,
      params: {
        numRegions: ui.numRegions,
        samplingMethod: 'fibonacci',
        numPlates: ui.numPlates,
        oceanFraction: ui.oceanFraction,
      },
    },
  };
  worker.postMessage(request);
}

function redraw(): void {
  if (!currentSource) return;
  render(canvas, currentSource, {
    mode: ui.mode,
    projection: ui.projection,
    width: canvas.width,
    height: canvas.height,
    background: ui.background,
    dotRadius: ui.dotRadius,
    cameraLat: ui.cameraLat,
    cameraLon: ui.cameraLon,
    showCurrentArrows: ui.showCurrentArrows,
  });
}

buildPanel(panelEl, ui, {
  onRegenerate: postGenerate,
  onRedraw: redraw,
});

postGenerate();
