/**
 * Visual identity shared by the WebGL renderer, the overlay and portraits.
 * "Night lab microscope": near-black background, luminous matter.
 */
export const UI = {
  bg: '#0B0E12',
  surface: '#141A21',
  surface2: '#1B232C',
  text: '#E6EDF3',
  textDim: '#8B98A5',
  accent: '#5BC0EB',
  warn: '#F2A541',
  danger: '#E4572E',
  good: '#8AE234',
  gold: '#FFD166',
} as const;

/** Matter colormap stops: [value, r, g, b, alpha] with rgb 0..255. */
export const MATTER_STOPS: [number, number, number, number, number][] = [
  [0.0, 11, 14, 18, 0],
  [0.08, 24, 20, 72, 0.55],
  [0.15, 46, 30, 120, 0.85],
  [0.4, 40, 190, 230, 1],
  [0.7, 255, 236, 205, 1],
  [1.0, 255, 255, 255, 1],
];

/** Sample the matter colormap; returns [r, g, b, a] with rgb 0..255 and a 0..1. */
export function matterColor(v: number): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < MATTER_STOPS.length; i++) {
    const [v1, r1, g1, b1, a1] = MATTER_STOPS[i];
    if (x <= v1) {
      const [v0, r0, g0, b0, a0] = MATTER_STOPS[i - 1];
      const t = (x - v0) / (v1 - v0 || 1);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t];
    }
  }
  const last = MATTER_STOPS[MATTER_STOPS.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

/** 256×1 RGBA8 lookup table of the matter colormap (for a GL texture). */
export function matterLUT(): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = matterColor(i / 255);
    out[i * 4] = Math.round(r);
    out[i * 4 + 1] = Math.round(g);
    out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Colour per behaviour (marker dots, bestiary tags). Shape is also used, never colour alone. */
export const BEHAVIOR_COLOR: Record<string, string> = {
  still: '#5BC0EB',
  pulsing: '#B892FF',
  swimmer: '#8AE234',
  spinner: '#FFD166',
  divider: '#FF8FAB',
  colony: '#F2A541',
};
