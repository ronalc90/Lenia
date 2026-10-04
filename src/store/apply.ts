/**
 * Turning equipped cosmetics into renderer/audio inputs, plus the colour maths the catalog tests use.
 *
 * INTEGRATION SPEC (the integrator adds these; nothing here edits src/sim or src/ui):
 *
 * 1. src/sim/webgl.ts — runtime palette:
 *      setMatterLUT(lut: Uint8Array): void   // 256×1 RGBA8, exactly what paletteLUT() returns
 *    Implementation: keep a copy for context restore, then
 *      gl.bindTexture(gl.TEXTURE_2D, this.lut);
 *      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, lut);
 *    (the texture is created in the GL setup with matterLUT(); restore must re-upload the copy).
 *
 * 2. src/sim/webgl.ts + shaders.ts — render style (optional but recommended, otherwise an Ember
 *    creature keeps cyan contours):
 *      setRenderStyle(style: RenderStyle): void
 *    RENDER shader: turn the constants BG, AGAR_IN, AGAR_OUT, RIM, CYAN, GLOW_CORE, GLOW_WIDE and
 *    the shadow tint vec3(0.42, 0.70, 1.0) into uniforms uBg, uAgarIn, uAgarOut, uRim, uContour,
 *    uGlowCore, uGlowWide, uShadow, and the rim factor 0.22 into uRimAmt. renderStyleFor() returns
 *    linear 0..1 RGB triples ready for gl.uniform3fv. Defaults reproduce today's look exactly.
 *    Optional: uGrid (vec4 rgba, a = 0 disables) for the 'blueprint' dish; rimStyle 'double' = a
 *    second rim line 3 px inside; 'glow' = rim halo factor 0.025 → 0.06.
 *
 * 3. Portraits / bestiary (src/ui/portrait.ts): colour with paletteColor(stops, v) instead of
 *    matterColor(v) and include the palette id in the cache key.
 *
 * 4. Overlay (src/ui/overlay.ts): halo / seed trail / golden spark drawing via src/store/draw.ts
 *    (drawHalo, trailBurst, drawSpark). Dish motes colour: DishTheme.motes.
 *
 * 5. Audio (src/audio/audio.ts): optional `setAmbience?(preset: AmbiencePreset)`; map bpm/mode/
 *    tonic/timbres/reverb onto the engine. SFX cues must stay identical across ambiences.
 *
 * 6. Leaderboard: badge/frame/name colour come from the SERVER entitlement record (server/store/
 *    entitlements.ts publicCosmetics), never from what the client claims.
 *
 * `bindCosmetics(ent, targets)` below wires 1–5 and keeps them in sync with the wardrobe.
 */
import type { AmbiencePreset, DishTheme, MatterStop, PaletteData, SlotData } from './catalog';
import { defaultItem } from './catalog';

// ───────────────────────────── colour maths ─────────────────────────────

export type RGB = [number, number, number];

/** '#RRGGBB' or '#RGB' → [r, g, b] 0..255. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an sRGB colour (0..255 channels). */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` with alpha `a` over an opaque `bg` (sRGB space, like the shader's mix()). */
export function over(fg: RGB, a: number, bg: RGB): RGB {
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

/** Sample a stop list (same algorithm as core/palette matterColor). [r, g, b] 0..255, a 0..1. */
export function paletteColor(stops: readonly MatterStop[], v: number): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    const [v1, r1, g1, b1, a1] = stops[i];
    if (x <= v1) {
      const [v0, r0, g0, b0, a0] = stops[i - 1];
      const t = (x - v0) / (v1 - v0 || 1);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

/** 256×1 RGBA8 lookup table for `sim.setMatterLUT` (byte-identical to matterLUT() for the default). */
export function paletteLUT(stops: readonly MatterStop[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = paletteColor(stops, i / 255);
    out[i * 4] = Math.round(r);
    out[i * 4 + 1] = Math.round(g);
    out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** CSS linear-gradient of the opaque part of a palette (swatches, chips). */
export function paletteCss(stops: readonly MatterStop[], angle = '90deg', from = 0.08): string {
  const parts: string[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const v = from + ((1 - from) * i) / (n - 1);
    const [r, g, b] = paletteColor(stops, v);
    parts.push(`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}) ${Math.round((i / (n - 1)) * 100)}%`);
  }
  return `linear-gradient(${angle}, ${parts.join(', ')})`;
}

// ───────────────────────────── renderer style ─────────────────────────────

/** Linear-0..1 colours for the RENDER shader uniforms (see the spec at the top of this file). */
export interface RenderStyle {
  bg: RGB;
  agarIn: RGB;
  agarOut: RGB;
  rim: RGB;
  rimAmt: number;
  rimStyle: DishTheme['rimStyle'];
  contour: RGB;
  glowCore: RGB;
  glowWide: RGB;
  shadow: RGB;
  /** rgba 0..1 of the optional grid; a = 0 disables. */
  grid: [number, number, number, number];
}

const unit = (hex: string): RGB => hexToRgb(hex).map((c) => c / 255) as RGB;

function parseRgba(css: string | null): [number, number, number, number] {
  if (!css) return [0, 0, 0, 0];
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(css);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]];
  const [r, g, b] = unit(css);
  return [r, g, b, 1];
}

export function renderStyleFor(palette: PaletteData, dish: DishTheme): RenderStyle {
  return {
    bg: unit(dish.bg),
    agarIn: unit(dish.agarIn),
    agarOut: unit(dish.agarOut),
    rim: unit(dish.rim),
    rimAmt: dish.rimStrength,
    rimStyle: dish.rimStyle,
    contour: unit(palette.contour),
    glowCore: unit(palette.glowCore),
    glowWide: unit(palette.glowWide),
    shadow: unit(palette.shadow),
    grid: parseRgba(dish.grid),
  };
}

// ───────────────────────────── live binding ─────────────────────────────

/** Optional hooks; pass whichever exist. Every call is guarded (missing method = skipped). */
export interface CosmeticTargets {
  sim?: { setMatterLUT?(lut: Uint8Array): void; setRenderStyle?(style: RenderStyle): void };
  overlay?: { setCosmetics?(c: Pick<SlotData, 'halo' | 'trail' | 'spark' | 'dish'>): void };
  portraits?: { setPalette?(id: string, stops: MatterStop[]): void };
  audio?: { setAmbience?(preset: AmbiencePreset): void };
}

/** Minimal view of Entitlements used here (avoids a circular import). */
export interface EquippedSource {
  equippedData<S extends keyof SlotData>(slot: S): SlotData[S];
  equippedId(slot: keyof SlotData): string;
  on(type: 'changed', fn: () => void): () => void;
}

/**
 * Push the equipped cosmetics to every target now and on every change. Returns an unsubscribe.
 * Only re-sends what changed (a new LUT upload only when the palette id changes).
 */
export function bindCosmetics(src: EquippedSource, targets: CosmeticTargets): () => void {
  let last: Record<string, string> = {};
  const push = () => {
    const ids = {
      palette: src.equippedId('palette'),
      dish: src.equippedId('dish'),
      halo: src.equippedId('halo'),
      trail: src.equippedId('trail'),
      spark: src.equippedId('spark'),
      music: src.equippedId('music'),
    };
    const pal = src.equippedData('palette');
    const dish = src.equippedData('dish');
    if (ids.palette !== last.palette) {
      try {
        targets.sim?.setMatterLUT?.(paletteLUT(pal.stops));
        targets.portraits?.setPalette?.(ids.palette, pal.stops);
      } catch (err) {
        console.error('[store] palette apply failed', err);
      }
    }
    if (ids.palette !== last.palette || ids.dish !== last.dish) {
      try {
        targets.sim?.setRenderStyle?.(renderStyleFor(pal, dish));
      } catch (err) {
        console.error('[store] render style apply failed', err);
      }
    }
    if (ids.halo !== last.halo || ids.trail !== last.trail || ids.spark !== last.spark || ids.dish !== last.dish) {
      try {
        targets.overlay?.setCosmetics?.({ halo: src.equippedData('halo'), trail: src.equippedData('trail'), spark: src.equippedData('spark'), dish });
      } catch (err) {
        console.error('[store] overlay apply failed', err);
      }
    }
    if (ids.music !== last.music) {
      try {
        targets.audio?.setAmbience?.(src.equippedData('music'));
      } catch (err) {
        console.error('[store] ambience apply failed', err);
      }
    }
    last = ids;
  };
  push();
  return src.on('changed', push);
}

/** Today's look, for code paths that run before entitlements load. */
export function defaultRenderStyle(): RenderStyle {
  return renderStyleFor(defaultItem('palette').data, defaultItem('dish').data);
}
