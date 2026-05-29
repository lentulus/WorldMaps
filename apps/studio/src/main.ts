import { render, type RenderSource } from '@worldmaps/world-renderer';
import type {
  RequestMessage,
  ResponseMessage,
  WorldState,
} from '@worldmaps/world-engine';
import type { GenerationParams } from '@worldmaps/world-contract';
import EngineWorker from '@worldmaps/world-engine/src/worker.ts?worker';
import { buildPanel, syncPanelFromState, type UiState } from './panel.js';
import { saveWorldToFile, loadWorldFromFile, triggerDownload } from './persistence.js';

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
let currentState: WorldState | null = null;
let currentParams: GenerationParams | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function setSource(state: WorldState): void {
  if (!state.topology) throw new Error('engine returned no topology');
  currentState = state;
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
}

function postGenerate(): void {
  setStatus(`generating world (N=${ui.numRegions}, seed="${ui.seed}")…`);
  const t0 = performance.now();
  const params: GenerationParams = {
    numRegions: ui.numRegions,
    samplingMethod: 'fibonacci',
    numPlates: ui.numPlates,
    oceanFraction: ui.oceanFraction,
  };
  currentParams = params;
  worker.onmessage = (event: MessageEvent<ResponseMessage>) => {
    const dt = performance.now() - t0;
    const msg = event.data;
    if (msg.type === 'error') {
      setStatus(`error: ${msg.message}`);
      return;
    }
    setSource(msg.state);
    redraw();
    setStatus(
      `generated N=${msg.state.numRegions} in ${dt.toFixed(0)} ms · mode=${ui.mode} · ${
        msg.state.topology!.numEdges
      } edges`,
    );
  };
  const request: RequestMessage = {
    type: 'generate',
    request: { seed: ui.seed, params },
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

async function onSave(): Promise<void> {
  if (!currentState || !currentParams) {
    setStatus('nothing to save — generate a world first');
    return;
  }
  setStatus('saving…');
  try {
    const { filename, bytes } = await saveWorldToFile(currentState, currentParams);
    triggerDownload(filename, bytes);
    setStatus(`saved ${filename} (${(bytes.byteLength / 1024).toFixed(1)} KiB)`);
  } catch (err) {
    setStatus(`save failed: ${(err as Error).message}`);
  }
}

async function onLoad(file: File): Promise<void> {
  setStatus(`loading ${file.name}…`);
  try {
    const { state, manifest, params } = await loadWorldFromFile(file);
    ui.numRegions = manifest.numRegions;
    ui.seed = manifest.identity.seed;
    if (typeof params.numPlates === 'number') ui.numPlates = params.numPlates;
    if (typeof params.oceanFraction === 'number') ui.oceanFraction = params.oceanFraction;
    currentParams = params;
    syncPanelFromState(panelEl, ui);
    setSource(state);
    redraw();
    setStatus(
      `loaded worldId=${manifest.identity.worldId.slice(0, 10)}… · N=${manifest.numRegions} · ${manifest.numEdges} edges`,
    );
  } catch (err) {
    setStatus(`load failed: ${(err as Error).message}`);
  }
}

buildPanel(panelEl, ui, {
  onRegenerate: postGenerate,
  onRedraw: redraw,
  onSave: () => { void onSave(); },
  onLoad: (file) => { void onLoad(file); },
});

postGenerate();
