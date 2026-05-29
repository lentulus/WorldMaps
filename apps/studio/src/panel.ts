// Minimal vanilla-HTML control panel. Decoupled from the rest of the app so a
// future swap to Tweakpane / lil-gui only touches this file.

import type { RenderMode, RenderProjection } from '@worldmaps/world-renderer';

export interface UiState {
  numRegions: number;
  seed: string;
  numPlates: number;
  /** Fraction in [0, 1]. Shown as 0–100% in the panel. */
  oceanFraction: number;
  mode: RenderMode;
  projection: RenderProjection;
  cameraLat: number;
  cameraLon: number;
  background: string;
  dotRadius: number;
  /** Overlay: draw current-vector arrows on top of whatever mode is active. */
  showCurrentArrows: boolean;
}

export interface PanelCallbacks {
  onRegenerate: () => void;
  onRedraw: () => void;
  onSave: () => void;
  onLoad: (file: File) => void;
}

export function buildPanel(
  root: HTMLElement,
  state: UiState,
  cb: PanelCallbacks,
): void {
  root.innerHTML = `
    <style>
      .panel-row { display: flex; align-items: center; margin: 8px 0; gap: 8px; font-size: 13px; }
      .panel-row label { flex: 0 0 90px; opacity: 0.85; }
      .panel-row input, .panel-row select { flex: 1; min-width: 0; background: #222; color: #eee;
                                              border: 1px solid #444; padding: 4px 6px; border-radius: 3px; }
      .panel-row input[type=color] { padding: 0; height: 26px; }
      .panel-row input[type=range] { padding: 0; }
      .panel-button { width: 100%; padding: 8px; margin-top: 12px; background: #2a4365; color: #fff;
                      border: 1px solid #4a90e2; border-radius: 3px; cursor: pointer; font-size: 13px; }
      .panel-button:hover { background: #3563a1; }
      .panel-section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #333;
                        font-size: 11px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.05em; }
    </style>
    <div class="panel-section" style="border-top: none; margin-top: 0; padding-top: 0;">Generation</div>
    <div class="panel-row"><label>numRegions</label><input id="ui-num" type="number" min="16" max="1000000" step="1"></div>
    <div class="panel-row" id="ui-num-warn-row" style="display: none; margin-top: -4px;">
      <label></label>
      <span id="ui-num-warn" style="font-size: 11px; color: #d4a44a; flex: 1;"></span>
    </div>
    <div class="panel-row"><label>seed</label><input id="ui-seed" type="text"></div>
    <div class="panel-row"><label>plates</label><input id="ui-plates" type="number" min="2" max="30" step="1"></div>
    <div class="panel-row"><label>ocean %</label><input id="ui-ocean" type="number" min="0" max="100" step="1"></div>
    <button class="panel-button" id="ui-regen">Regenerate</button>

    <div class="panel-section">Projection</div>
    <div class="panel-row"><label>projection</label>
      <select id="ui-proj">
        <option value="orthographic">orthographic (globe)</option>
        <option value="equirectangular">equirectangular</option>
      </select>
    </div>
    <div class="panel-row"><label>camera lat</label><input id="ui-cam-lat" type="range" min="-90" max="90" step="1"></div>
    <div class="panel-row"><label>camera lon</label><input id="ui-cam-lon" type="range" min="0" max="360" step="1"></div>

    <div class="panel-section">Rendering</div>
    <div class="panel-row"><label>mode</label>
      <select id="ui-mode">
        <option value="climate">climate</option>
        <option value="satellite">satellite</option>
        <option value="elevation">elevation</option>
        <option value="temperature">temperature</option>
        <option value="humidity">humidity</option>
        <option value="clouds">clouds</option>
        <option value="currents">currents</option>
        <option value="rivers">rivers</option>
        <option value="plates">plates</option>
        <option value="cells">cells (region id)</option>
        <option value="dots">dots</option>
      </select>
    </div>
    <div class="panel-row"><label>background</label><input id="ui-bg" type="color"></div>
    <div class="panel-row"><label>dot radius</label><input id="ui-dot" type="number" min="0.5" max="8" step="0.5"></div>

    <div class="panel-section">Overlays</div>
    <div class="panel-row"><label>current arrows</label>
      <input id="ui-arrows" type="checkbox" style="flex: none; width: 18px; height: 18px; margin: 0;">
      <span style="flex: 1;"></span>
    </div>

    <div class="panel-section">World file</div>
    <button class="panel-button" id="ui-save">Save world (.zip)</button>
    <button class="panel-button" id="ui-load" style="margin-top: 6px; background: #444; border-color: #666;">Load world…</button>
    <input id="ui-load-file" type="file" accept=".zip,application/zip" style="display: none;">
  `;

  const num = root.querySelector<HTMLInputElement>('#ui-num')!;
  const seed = root.querySelector<HTMLInputElement>('#ui-seed')!;
  const plates = root.querySelector<HTMLInputElement>('#ui-plates')!;
  const ocean = root.querySelector<HTMLInputElement>('#ui-ocean')!;
  const proj = root.querySelector<HTMLSelectElement>('#ui-proj')!;
  const camLat = root.querySelector<HTMLInputElement>('#ui-cam-lat')!;
  const camLon = root.querySelector<HTMLInputElement>('#ui-cam-lon')!;
  const mode = root.querySelector<HTMLSelectElement>('#ui-mode')!;
  const bg = root.querySelector<HTMLInputElement>('#ui-bg')!;
  const dot = root.querySelector<HTMLInputElement>('#ui-dot')!;
  const arrows = root.querySelector<HTMLInputElement>('#ui-arrows')!;
  const regen = root.querySelector<HTMLButtonElement>('#ui-regen')!;
  const save = root.querySelector<HTMLButtonElement>('#ui-save')!;
  const load = root.querySelector<HTMLButtonElement>('#ui-load')!;
  const loadFile = root.querySelector<HTMLInputElement>('#ui-load-file')!;

  num.value = String(state.numRegions);
  seed.value = state.seed;
  plates.value = String(state.numPlates);
  ocean.value = String(Math.round(state.oceanFraction * 100));
  proj.value = state.projection;
  camLat.value = String(state.cameraLat);
  camLon.value = String(state.cameraLon);
  mode.value = state.mode;
  bg.value = state.background;
  dot.value = String(state.dotRadius);
  arrows.checked = state.showCurrentArrows;

  const warnRow = root.querySelector<HTMLDivElement>('#ui-num-warn-row')!;
  const warn = root.querySelector<HTMLSpanElement>('#ui-num-warn')!;
  function updateNumWarn(n: number): void {
    if (n > 100000) {
      // Linear-ish extrapolation calibrated from N=2048 → ~80 ms at Phase 7.
      // ~40 µs / cell with Voronoi build dominating at high N. Order-of-
      // magnitude only — the worker is single-threaded so big N will block.
      const estSec = Math.round((n * 0.00004) * 10) / 10;
      warn.textContent = `large N — generation may take ~${estSec}s and freeze the worker`;
      warnRow.style.display = 'flex';
    } else {
      warnRow.style.display = 'none';
    }
  }
  updateNumWarn(state.numRegions);

  num.addEventListener('change', () => {
    const v = Math.max(16, Math.min(1000000, Math.floor(Number(num.value) || state.numRegions)));
    state.numRegions = v;
    num.value = String(v);
    updateNumWarn(v);
    cb.onRegenerate();
  });
  seed.addEventListener('change', () => {
    state.seed = seed.value;
    cb.onRegenerate();
  });
  plates.addEventListener('change', () => {
    const v = Math.max(2, Math.min(30, Math.floor(Number(plates.value) || state.numPlates)));
    state.numPlates = v;
    plates.value = String(v);
    cb.onRegenerate();
  });
  ocean.addEventListener('change', () => {
    const pct = Math.max(0, Math.min(100, Math.floor(Number(ocean.value))));
    state.oceanFraction = pct / 100;
    ocean.value = String(pct);
    cb.onRegenerate();
  });
  regen.addEventListener('click', () => cb.onRegenerate());

  proj.addEventListener('change', () => {
    state.projection = proj.value as RenderProjection;
    cb.onRedraw();
  });
  camLat.addEventListener('input', () => {
    state.cameraLat = Number(camLat.value);
    cb.onRedraw();
  });
  camLon.addEventListener('input', () => {
    state.cameraLon = Number(camLon.value);
    cb.onRedraw();
  });

  mode.addEventListener('change', () => {
    state.mode = mode.value as RenderMode;
    cb.onRedraw();
  });
  bg.addEventListener('input', () => {
    state.background = bg.value;
    cb.onRedraw();
  });
  dot.addEventListener('change', () => {
    state.dotRadius = Number(dot.value) || state.dotRadius;
    cb.onRedraw();
  });
  arrows.addEventListener('change', () => {
    state.showCurrentArrows = arrows.checked;
    cb.onRedraw();
  });

  save.addEventListener('click', () => cb.onSave());
  load.addEventListener('click', () => loadFile.click());
  loadFile.addEventListener('change', () => {
    const file = loadFile.files?.[0];
    if (file) cb.onLoad(file);
    loadFile.value = '';
  });
}

export function syncPanelFromState(root: HTMLElement, state: UiState): void {
  const set = <T extends HTMLInputElement | HTMLSelectElement>(sel: string, value: string): void => {
    const el = root.querySelector<T>(sel);
    if (el) el.value = value;
  };
  set<HTMLInputElement>('#ui-num', String(state.numRegions));
  set<HTMLInputElement>('#ui-seed', state.seed);
  set<HTMLInputElement>('#ui-plates', String(state.numPlates));
  set<HTMLInputElement>('#ui-ocean', String(Math.round(state.oceanFraction * 100)));
  set<HTMLSelectElement>('#ui-proj', state.projection);
  set<HTMLInputElement>('#ui-cam-lat', String(state.cameraLat));
  set<HTMLInputElement>('#ui-cam-lon', String(state.cameraLon));
  set<HTMLSelectElement>('#ui-mode', state.mode);
}
