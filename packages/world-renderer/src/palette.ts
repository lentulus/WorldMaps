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
