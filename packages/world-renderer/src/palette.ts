// Color palettes by render mode.
//
// Phase 4 introduced `regionIdColor` for the cells sanity view. Phase 5 adds:
//   - plateColor(plateId): golden-angle hue, used by mode='plates'
//   - elevationColor(e):   blue→tan→white heatmap on [-1, 1], used by mode='elevation'
//   - satelliteColor(e):   land/water palette resembling a satellite view

export function regionIdColor(regionId: number): string {
  const hue = ((regionId * 137.508) % 360 + 360) % 360;
  return `hsl(${hue.toFixed(1)} 55% 50%)`;
}

export function plateColor(plateId: number): string {
  // Distinct, saturated, evenly spread.
  const hue = ((plateId * 47.5) % 360 + 360) % 360;
  return `hsl(${hue.toFixed(1)} 65% 55%)`;
}

/** Continuous color ramp for elevation in [-1, 1]. */
export function elevationColor(e: number): string {
  if (e <= 0) {
    // Ocean depths: deep navy → light teal as e → 0
    const t = Math.max(0, Math.min(1, (e + 1)));
    const r = lerp(10, 90, t);
    const g = lerp(20, 160, t);
    const b = lerp(80, 200, t);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  // Land: green → tan → white
  const t = Math.max(0, Math.min(1, e));
  if (t < 0.45) {
    // shallow → green
    const u = t / 0.45;
    return `rgb(${Math.round(lerp(160, 100, u))}, ${Math.round(lerp(200, 145, u))}, ${Math.round(lerp(120, 80, u))})`;
  }
  if (t < 0.85) {
    // green → tan/brown
    const u = (t - 0.45) / 0.4;
    return `rgb(${Math.round(lerp(100, 175, u))}, ${Math.round(lerp(145, 130, u))}, ${Math.round(lerp(80, 90, u))})`;
  }
  // tan → snow
  const u = (t - 0.85) / 0.15;
  return `rgb(${Math.round(lerp(175, 245, u))}, ${Math.round(lerp(130, 245, u))}, ${Math.round(lerp(90, 250, u))})`;
}

/** A simpler 2-tone land/water palette closer to a satellite map. */
export function satelliteColor(e: number): string {
  if (e <= 0) {
    // Ocean: shading by depth
    const t = Math.max(0, Math.min(1, e + 1));
    const r = lerp(18, 50, t);
    const g = lerp(40, 90, t);
    const b = lerp(95, 130, t);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  // Land: muted vegetation greens + browns by elevation
  if (e < 0.5) {
    const u = e / 0.5;
    return `rgb(${Math.round(lerp(80, 110, u))}, ${Math.round(lerp(120, 110, u))}, ${Math.round(lerp(60, 70, u))})`;
  }
  if (e < 0.9) {
    const u = (e - 0.5) / 0.4;
    return `rgb(${Math.round(lerp(110, 160, u))}, ${Math.round(lerp(110, 130, u))}, ${Math.round(lerp(70, 100, u))})`;
  }
  const u = (e - 0.9) / 0.1;
  return `rgb(${Math.round(lerp(160, 240, u))}, ${Math.round(lerp(130, 240, u))}, ${Math.round(lerp(100, 245, u))})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cool blue → warm red ramp for temperature in °C. */
export function temperatureColor(tempC: number): string {
  // Map a wide envelope into [0, 1].
  const t = clamp01((tempC + 35) / 75);
  if (t < 0.5) {
    const u = t / 0.5;
    const r = lerp(30, 220, u);
    const g = lerp(60, 220, u);
    const b = lerp(170, 200, u);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
  const u = (t - 0.5) / 0.5;
  const r = lerp(220, 200, u);
  const g = lerp(220, 60, u);
  const b = lerp(200, 40, u);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Dry tan → wet blue ramp for relative humidity in [0, 1]. */
export function humidityColor(h: number): string {
  const t = clamp01(h);
  const r = lerp(210, 30, t);
  const g = lerp(190, 90, t);
  const b = lerp(140, 180, t);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Grayscale ramp for cloud cover in [0, 1]. */
export function cloudColor(c: number): string {
  const t = clamp01(c);
  const v = Math.round(lerp(30, 245, t));
  return `rgb(${v}, ${v}, ${v})`;
}

/** Ocean current composite: satellite-base ocean tinted toward cyan where the
 *  surface current magnitude is high. Land cells use the plain satellite color
 *  so the eye anchors on coastlines. `magnitude` is m/s; saturates around 0.5. */
export function currentColor(elevation: number, magnitude: number): string {
  // Recompute satellite base inline (same as climateColor) — cheaper than
  // round-tripping through CSS.
  let r: number;
  let g: number;
  let b: number;
  if (elevation <= 0) {
    const t = clamp01(elevation + 1);
    r = lerp(18, 50, t);
    g = lerp(40, 90, t);
    b = lerp(95, 130, t);
  } else if (elevation < 0.5) {
    const u = elevation / 0.5;
    r = lerp(80, 110, u);
    g = lerp(120, 110, u);
    b = lerp(60, 70, u);
  } else if (elevation < 0.9) {
    const u = (elevation - 0.5) / 0.4;
    r = lerp(110, 160, u);
    g = lerp(110, 130, u);
    b = lerp(70, 100, u);
  } else {
    const u = (elevation - 0.9) / 0.1;
    r = lerp(160, 240, u);
    g = lerp(130, 240, u);
    b = lerp(100, 245, u);
  }
  if (elevation <= 0) {
    // Cyan-leaning highlight tint scaled by magnitude (saturates at ~0.4 m/s).
    const k = clamp01(magnitude / 0.4) * 0.85;
    const inv = 1 - k;
    return `rgb(${Math.round(r * inv + 80 * k)}, ${Math.round(g * inv + 230 * k)}, ${Math.round(b * inv + 230 * k)})`;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Climate composite: satellite base blended with cloud whiteness. */
export function climateColor(elevation: number, cloudCover: number): string {
  // Parse the satellite color back out for blending. Cheaper to recompute the
  // RGB components inline than to round-trip through CSS strings.
  let r: number;
  let g: number;
  let b: number;
  if (elevation <= 0) {
    const t = clamp01(elevation + 1);
    r = lerp(18, 50, t);
    g = lerp(40, 90, t);
    b = lerp(95, 130, t);
  } else if (elevation < 0.5) {
    const u = elevation / 0.5;
    r = lerp(80, 110, u);
    g = lerp(120, 110, u);
    b = lerp(60, 70, u);
  } else if (elevation < 0.9) {
    const u = (elevation - 0.5) / 0.4;
    r = lerp(110, 160, u);
    g = lerp(110, 130, u);
    b = lerp(70, 100, u);
  } else {
    const u = (elevation - 0.9) / 0.1;
    r = lerp(160, 240, u);
    g = lerp(130, 240, u);
    b = lerp(100, 245, u);
  }
  const k = clamp01(cloudCover) * 0.7;
  const inv = 1 - k;
  return `rgb(${Math.round(r * inv + 245 * k)}, ${Math.round(g * inv + 245 * k)}, ${Math.round(b * inv + 250 * k)})`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
