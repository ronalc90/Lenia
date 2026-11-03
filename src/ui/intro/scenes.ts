/**
 * The intro's illustrations as a realistic night in a polar lab (docs/ARTE-REALISTA.md §6.6, ADR-029):
 * one Canvas 2D painter per panel, animated and deterministic (hashes and sines, never Math.random).
 * Every painter fills any rectangle: layout comes from the canvas size (u = one design unit, 300 u ≈
 * the short side), so the same scene works on a phone (portrait) and a laptop (landscape).
 *
 *  station  the archive photo of a polar station under the aurora (Ken Burns 1.04 in 4 s), fine snow,
 *           one window lit amber; the vector station when the photo is missing
 *  tape     the lab at night: the window, Albor's Polaroid pinned on the cork, the tape recorder playing
 *  arrive   the vestibule: the door open on the snow, the coat rack with its three chrome hooks
 *  candle   VELA (the MC-7 culture monitor) switches on: her lamp warms 2200 → 2700 K and lights the room
 *  dish     the dish under the lamp, real creatures in it, a sepia print of Albor's last photo beside it
 *  sow … tree  the how-to panels as scientific plates (§6.5): figure number, panels a/b, leaders, scale bars
 *  go       the dish with its first creature under the lamp, VELA ready on the bench
 *
 * Light is the same everywhere (§3.1): the window at the top left (cold, main), VELA's lamp at the
 * right (warm), the dish from below (cyan). The scenes are always night (GDD §14). Creatures are real
 * catalog patterns, never drawn fakes. Photos are decoration (photos.ts): `peekPhoto` returns null until
 * one has loaded, and every scene draws its vector fallback then. Under Reduce motion the painters get
 * a fixed "hero" time: each panel shows its finished state and nothing loops.
 *
 * VELA is drawn only through P1's kept `drawVelaArt` (lab.ts velaOnBench); the people are P2's (the coat
 * rack's coats, the gloved hand and Albor's Polaroid arrive with P2's `drawBataCard`, `drawGlovedHand`
 * and `drawAlborPolaroid`, §7.2).
 */
import type { Lang, Text } from '../../core/types';
import { COAT_IDS, drawAlborPolaroid, drawBataCard, drawGlovedHand, type PlayerLookId } from '../art/characters';
import { LayerCache, kelvin, type Ctx2D } from '../art/vector';
import { MATERIAL, PLATE, PLATE_MM_PER_CELL, ROUTE_COLOR, type RouteId } from '../art/tokens';
import { type ArtMood } from '../art/vela';
import { WORLD_ART_IDS, WORLD_HUE } from '../art/worlds';
import { PHOTOS, peekPhoto, type PhotoId } from '../art/photos';
import { catalogPattern } from '../../sim/catalog';
import type { IntroSceneId } from '../../story/introScript';
import {
  INK_ON_PLATE,
  TEAL,
  auroraCurtain,
  bench,
  clamp01,
  contactShadow,
  creature,
  culture,
  cylinderRamp,
  darkness,
  dish3q,
  dishTop,
  dishWallH,
  hash,
  labWall,
  labWindow,
  leader,
  lampState,
  lightPool,
  mediumDrop,
  nightSky,
  panelLabel,
  pipetteTip,
  plateSheet,
  plateText,
  probeCable,
  scaleBar,
  smooth,
  snowfall,
  stars,
  techArrow,
  velaCableAt,
  velaLampAt,
  velaOnBench,
  velaSpot,
  verdict,
  windowPanes,
  windowSnow,
  type Rect,
  type Specimen,
} from './lab';
import { NIGHT_GRADE, coverCrop, cropToScreen, drawGraded, filmGrain, grade, kenBurns, sepia, vignette } from './photofx';

const TAU = Math.PI * 2;

export interface SceneEnv {
  w: number;
  h: number;
  /** Seconds since the panel appeared (a fixed hero time under Reduce motion). */
  t: number;
  rm: boolean;
  look: PlayerLookId;
  /** Language of the few labels in the art (plates, captions). Default 'es'. */
  lang?: Lang;
  /** Device pixel ratio of the canvas (hairlines, grain). Default 1. */
  dpr?: number;
  /** Seconds since the player picked a coat on this panel (the coat comes off its hook, the hand enters). */
  pickAge?: number;
}

type Painter = (ctx: CanvasRenderingContext2D, e: SceneEnv) => void;

/** Seconds at which each panel's animation reaches its finished, still-worthy state. */
export const HERO_TIME: Record<IntroSceneId, number> = {
  station: 3.2,
  tape: 2.4,
  arrive: 3.4,
  candle: 3.6,
  dish: 2.6,
  sow: 2.5,
  essence: 2.2,
  clock: 3.9,
  tree: 4.2,
  go: 2.6,
};

// ───────────────────────────── helpers ─────────────────────────────

function unit(e: SceneEnv): number {
  return Math.min(e.w, e.h * 1.15) / 300;
}
const wide = (e: SceneEnv) => e.w > e.h * 1.05;
const tr = (e: SceneEnv, es: string, en: string) => (e.lang === 'en' ? en : es);
const dprOf = (e: SceneEnv) => (e.dpr && e.dpr > 0 ? e.dpr : 1);
/** How P1's VELA is told the DPR and the language of her screen. */
const draw = (e: SceneEnv) => ({ dpr: dprOf(e), lang: e.lang ?? 'es' });
/** VELA's screen lines of the intro (docs/ARTE-REALISTA.md §6.6): her self-test, then ready. */
const AUTOTEST: Text = { es: 'MC-7 · AUTOTEST OK', en: 'MC-7 · SELF-TEST OK' };
const READY: Text = { es: 'LISTA', en: 'READY' };

/** A photo if it has loaded (it starts loading on the first ask), else null: the vector fallback draws. */
function photo(id: PhotoId): HTMLImageElement | null {
  return peekPhoto(id);
}

/**
 * Static layers (the rooms) drawn once per scene × size × DPR × photo state (§3.9). Each is a full-size
 * canvas, so few are kept (Safari caps a page's canvas memory) and the intro frees them when it closes.
 */
const layers = new LayerCache(6);

/** Frees the cached rooms (the intro closed). */
export function releaseSceneLayers(): void {
  layers.clear();
}

/** Draws a static layer from the cache, or directly when no offscreen canvas can be made. */
function cached(ctx: CanvasRenderingContext2D, key: string, e: SceneEnv, paint: (c: Ctx2D) => void): void {
  const layer = layers.get(key, e.w, e.h, dprOf(e), (c) => paint(c));
  if (layer) ctx.drawImage(layer, 0, 0, e.w, e.h);
  else paint(ctx);
}

/** The documentary finish of every lit scene: a lens vignette and film grain. */
function finish(ctx: CanvasRenderingContext2D, e: SceneEnv, vig = 0.5): void {
  vignette(ctx, 0, 0, e.w, e.h, vig, 0.5, 0.45);
  filmGrain(ctx, 0, 0, e.w, e.h, dprOf(e), e.t, e.rm, 0.06);
}

/** Pixels per catalog cell of a sprite drawn `px` wide (sprites.ts draws the pattern at 62 % of the box). */
function cellPx(code: string, px: number): number {
  try {
    const p = catalogPattern(code);
    return (px * 0.62) / Math.max(p.w, p.h);
  } catch {
    return px / 32;
  }
}

/** The sprite size (in agar-radius units) that puts `code` at the dish's true scale (Ø128 cells, ADR-025). */
function trueSize(code: string): number {
  try {
    const p = catalogPattern(code);
    return Math.max(p.w, p.h) / 0.62 / 64;
  } catch {
    return 0.5;
  }
}

/** Second-order step response (ζ 0.8, ωn 19 rad/s: 99 % in ~300 ms, 1.5 % overshoot), §6.4 L8. */
function needleStep(tau: number): number {
  if (tau <= 0) return 0;
  const z = 0.8;
  const wn = 19;
  const wd = wn * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * wn * tau) * (Math.cos(wd * tau) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * tau));
}

/** A reading that advances in whole steps at 8 Hz (instrument motion, §6.4). */
const at8Hz = (t: number) => Math.floor(t * 8) / 8;

// ───────────────────────────── 1 · the station ─────────────────────────────

/** Pixel positions of the two lit windows in estacion-aurora-noaa.webp (900 × 596). */
const STATION_WINDOWS: readonly [number, number][] = [
  [763, 355],
  [832, 355],
];

const station: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const img = photo('estacion-aurora-noaa');
  if (img) {
    const P = PHOTOS['estacion-aurora-noaa'];
    const z = kenBurns(t, 4, 1.04, rm);
    const c = coverCrop(P.w, P.h, w, h, wide(e) ? 0.6 : 0.5, 0.6, z);
    drawGraded(ctx, img, c, 0, 0, w, h, NIGHT_GRADE);
    const s = w / c.sw;
    // One window lit amber (VELA's lamp inside); the other one off.
    STATION_WINDOWS.forEach(([px, py], i) => {
      const [x, y] = cropToScreen(c, 0, 0, w, h, px, py);
      if (x < -20 || x > w + 20) return;
      const r = 10 * s;
      ctx.save();
      if (i === 0) {
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = '#ffa757';
        ctx.fillRect(x - r, y - r * 0.8, r * 2, r * 1.6);
        ctx.restore();
        const flick = rm ? 1 : 0.94 + 0.06 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
        lightPool(ctx, x, y, r * 3.4, r * 3, kelvin(2700), 0.42 * flick);
        lightPool(ctx, x, y, r * 1.1, r * 0.9, kelvin(3200), 0.5 * flick);
      } else {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#3a3f48';
        ctx.fillRect(x - r, y - r * 0.8, r * 2, r * 1.6);
        ctx.restore();
      }
    });
  } else stationVector(ctx, e, u);
  // Fine snow in the air (1-px flakes), blown from the right.
  snowfall(ctx, 0, 0, w, h, t, rm, Math.round((w * h) / 2600), -14, 5);
  finish(ctx, e, 0.55);
  // The caption of an archive photo: where and when (instrument type, Mono 13 px).
  ctx.save();
  ctx.globalAlpha = 0.78;
  plateText(ctx, tr(e, 'ESTACIÓN VIGILIA · 78° N', 'VIGIL STATION · 78° N'), 16, h - 42, 13, { mono: true, track: 0.08, color: '#c9d6e2' });
  plateText(ctx, '−41 °C', w - 16, h - 42, 13, { mono: true, track: 0.08, color: '#c9d6e2', align: 'right' });
  ctx.restore();
};

/** The station without the photo: sky, aurora, the snow plain and a lab block on stilts, one amber window. */
function stationVector(ctx: CanvasRenderingContext2D, e: SceneEnv, u: number): void {
  const { w, h, t, rm } = e;
  const hz = h * 0.78;
  nightSky(ctx, 0, 0, w, hz);
  stars(ctx, 0, 0, w, hz * 0.9, t, rm, Math.round((w * hz) / 700), 2);
  // The Milky Way: a faint diagonal haze.
  ctx.save();
  ctx.translate(w * 0.45, h * 0.3);
  ctx.rotate(-0.9);
  ctx.scale(1, 0.22);
  const mw = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.6);
  mw.addColorStop(0, 'rgba(200,190,230,0.10)');
  mw.addColorStop(1, 'rgba(200,190,230,0)');
  ctx.fillStyle = mw;
  ctx.fillRect(-w, -h * 3, w * 2, h * 6);
  ctx.restore();
  auroraCurtain(ctx, -w * 0.1, h * 0.22, w * 0.8, hz - h * 0.22, t, rm, 1);
  // Snow plain with sastrugi.
  const sn = ctx.createLinearGradient(0, hz, 0, h);
  sn.addColorStop(0, '#1f2b38');
  sn.addColorStop(1, '#0b1118');
  ctx.fillStyle = sn;
  ctx.fillRect(0, hz, w, h - hz);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const y = hz + (h - hz) * hash(i, 31) ** 0.7;
    const x = hash(i, 32) * w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 30 * u, y - 2 * u, x + (50 + hash(i, 33) * 60) * u, y + 1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(190,215,235,0.16)';
  ctx.fillRect(0, hz, w, 1);
  // A met tower (lattice) and a fence line.
  const tx = w * 0.14;
  ctx.strokeStyle = 'rgba(20,26,34,0.95)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(tx - 3 * u, hz);
  ctx.lineTo(tx - 1 * u, hz - 70 * u);
  ctx.moveTo(tx + 3 * u, hz);
  ctx.lineTo(tx + 1 * u, hz - 70 * u);
  for (let k = 0; k < 9; k++) {
    const y = hz - k * 8 * u;
    ctx.moveTo(tx - 3 * u + k * 0.22 * u, y);
    ctx.lineTo(tx + 3 * u - k * 0.22 * u, y - 8 * u);
  }
  ctx.stroke();
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = tx + 10 * u + i * 14 * u;
    ctx.moveTo(x, hz + 1);
    ctx.lineTo(x, hz - 5 * u);
  }
  ctx.moveTo(tx + 10 * u, hz - 4 * u);
  ctx.lineTo(tx + 122 * u, hz - 3.5 * u);
  ctx.stroke();
  // The lab block on stilts.
  const bw = Math.min(w * 0.58, 190 * u);
  const bx = w - bw * 0.92;
  const by = hz - 70 * u;
  const bh = 52 * u;
  ctx.fillStyle = '#0a0e13';
  for (let i = 0; i <= 6; i++) ctx.fillRect(bx + (i * (bw - 4 * u)) / 6, by + bh, 2.4 * u, hz - by - bh + 6 * u);
  const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  bg.addColorStop(0, '#141c26');
  bg.addColorStop(1, '#0b1016');
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);
  // The aurora's green on the left face of the block (rim light).
  ctx.fillStyle = 'rgba(94,230,170,0.22)';
  ctx.fillRect(bx, by, 1.5, bh);
  // Railings (hairlines) and the diagonal stairs.
  ctx.strokeStyle = 'rgba(170,190,210,0.4)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (const ry of [by - 8 * u, by + bh * 0.48]) {
    ctx.moveTo(bx - 2 * u, ry);
    ctx.lineTo(bx + bw, ry);
    for (let x = bx; x < bx + bw; x += 6 * u) {
      ctx.moveTo(x, ry);
      ctx.lineTo(x, ry + 6 * u);
    }
  }
  ctx.moveTo(bx + bw * 0.42, by + bh * 0.48);
  ctx.lineTo(bx + bw * 0.62, by - 8 * u);
  ctx.moveTo(bx + bw * 0.6, by + bh);
  ctx.lineTo(bx + bw * 0.8, by + bh * 0.48);
  ctx.stroke();
  // Windows: dark, one amber (VELA's lamp inside).
  for (let i = 0; i < 4; i++) {
    const wx = bx + bw * (0.12 + i * 0.22);
    const wy = by + bh * 0.16;
    ctx.fillStyle = i === 2 ? '#ffa757' : '#05070a';
    ctx.fillRect(wx, wy, 8 * u, 6 * u);
    if (i === 2) {
      const flick = rm ? 1 : 0.94 + 0.06 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
      lightPool(ctx, wx + 4 * u, wy + 3 * u, 34 * u, 30 * u, kelvin(2700), 0.35 * flick);
    }
  }
  // The mast with its red beacon (1 Hz; still under Reduce motion).
  const mx = bx + bw * 0.86;
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(mx, by - 46 * u, 1.5 * u, 46 * u);
  const on = rm || Math.sin(t * TAU) > 0;
  ctx.fillStyle = on ? '#ff5a4a' : '#4a1c18';
  ctx.fillRect(mx - 0.6 * u, by - 48 * u, 2.6 * u, 2.6 * u);
  if (on) lightPool(ctx, mx + 0.7 * u, by - 46.7 * u, 10 * u, 10 * u, [255, 90, 74], 0.5);
}

// ───────────────────────────── the lab room (shared) ─────────────────────────────

interface Room {
  win: Rect;
  panes: number;
  benchY: number;
}

/** Wall, window (photo or vector night) and bench: the static part of an interior, cached per size. */
function room(ctx: CanvasRenderingContext2D, e: SceneEnv, id: string, r: Room, extra?: (c: Ctx2D) => void): void {
  const u = unit(e);
  const img = photo('estacion-aurora-noaa');
  const P = PHOTOS['estacion-aurora-noaa'];
  cached(ctx, `${id}|${img ? 'p' : 'v'}`, e, (c) => {
    labWall(c, e.w, e.h, 64 * u);
    labWindow(c, r.win, u, img, P.w, P.h, r.panes, e.t, e.rm);
    bench(c, e.w, e.h, r.benchY, r.win);
    extra?.(c);
  });
  windowSnow(ctx, windowPanes(r.win, u, r.panes), e.t, e.rm, Math.round((r.win.w * r.win.h) / 900));
}

// ───────────────────────────── props ─────────────────────────────

/**
 * A portable cassette recorder of the seventies on the bench (§5.6): cream plastic (`#e9dfc8`, the same
 * powder-coat family as VELA but yellower) in the night's light, chrome carry handle, a smoked window
 * with the cassette and its turning reels, a backlit VU meter with a damped needle (§6.4), piano keys
 * with PLAY down, a speaker grille and the masking-tape label «Cinta 3 · A.».
 */
function recorder(ctx: CanvasRenderingContext2D, cx: number, base: number, W: number, t: number, rm: boolean, label: string): void {
  const H = W * 0.46;
  const x = cx - W / 2;
  const y = base - H;
  contactShadow(ctx, cx + W * 0.03, base, W * 0.58, W * 0.05, 0.6);
  // Carry handle: chrome tube on two posts.
  const hy = y - H * 0.2;
  ctx.fillStyle = cylinderRamp(ctx, 0, hy - 2, 0, hy + 3);
  ctx.fillRect(x + W * 0.14, hy - 2, W * 0.72, 4.5);
  ctx.fillStyle = MATERIAL.rubber[1];
  ctx.fillRect(x + W * 0.15, hy, W * 0.03, H * 0.22);
  ctx.fillRect(x + W * 0.82, hy, W * 0.03, H * 0.22);
  // Body: local colour, form shadow and the night ambient (multiply), one sharp contour.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, W, H, W * 0.04);
  const body = ctx.createLinearGradient(0, y, 0, base);
  body.addColorStop(0, '#f1e9d6');
  body.addColorStop(0.12, '#e9dfc8');
  body.addColorStop(0.7, '#d5c7a8');
  body.addColorStop(1, '#b9aa88');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  const sh = ctx.createLinearGradient(x, y, x + W, base);
  sh.addColorStop(0, '#ffffff');
  sh.addColorStop(0.6, '#d9d3c8');
  sh.addColorStop(1, '#9a958c');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = 'rgba(70,86,108,0.72)';
  ctx.fillRect(x, y, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // Top face catching the window light (specular band, one per surface).
  ctx.fillStyle = 'rgba(220,232,245,0.16)';
  ctx.fillRect(x, y, W, H * 0.09);
  ctx.restore();
  // Smoked window with the cassette.
  const wx = x + W * 0.07;
  const wy = y + H * 0.24;
  const ww = W * 0.52;
  const wh = H * 0.5;
  ctx.fillStyle = '#100d0b';
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, wh, 3);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, wh, 3);
  ctx.clip();
  const spin = rm ? 0.4 : t * 2.4;
  const reels: [number, number][] = [
    [wx + ww * 0.3, 0.42 + (rm ? 0.1 : 0.1 * Math.sin(t * 0.05))],
    [wx + ww * 0.7, 0.3],
  ];
  const ry = wy + wh * 0.52;
  // The brown tape between the packs.
  ctx.fillStyle = '#3b2416';
  ctx.fillRect(wx + ww * 0.3, ry + wh * 0.28, ww * 0.4, 1.5);
  for (const [rx, pack] of reels) {
    const R = wh * pack;
    ctx.fillStyle = '#2e1c11';
    ctx.beginPath();
    ctx.arc(rx, ry, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,50,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(rx, ry, R * 0.8, 0, TAU);
    ctx.stroke();
    // The hub: six teeth turning.
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(spin);
    ctx.fillStyle = '#cfc9bd';
    ctx.beginPath();
    ctx.arc(0, 0, wh * 0.13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#100d0b';
    ctx.beginPath();
    ctx.arc(0, 0, wh * 0.06, 0, TAU);
    ctx.fill();
    for (let k = 0; k < 6; k++) {
      ctx.rotate(TAU / 6);
      ctx.fillRect(-wh * 0.012, wh * 0.06, wh * 0.024, wh * 0.035);
    }
    ctx.restore();
  }
  // The smoked glass: one diagonal reflection.
  const gl = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.3, 'rgba(255,255,255,0.03)');
  gl.addColorStop(0.31, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, wh, 3);
  ctx.stroke();
  // The masking-tape label on the window frame.
  const lw = Math.min(ww * 0.8, 96);
  ctx.save();
  ctx.translate(wx + ww / 2, wy - H * 0.06);
  ctx.rotate(-0.025);
  ctx.fillStyle = '#9c927a';
  ctx.fillRect(-lw / 2, -9, lw, 16);
  ctx.globalAlpha = 0.9;
  plateText(ctx, label, 0, 4, 13, { italic: true, weight: 500, color: '#1c2a44', align: 'center' });
  ctx.restore();
  // VU meter, backlit amber; its needle follows the voice with a damped swing.
  const vx = x + W * 0.66;
  const vy = y + H * 0.2;
  const vw = W * 0.27;
  const vh = H * 0.34;
  ctx.fillStyle = '#1a140d';
  ctx.fillRect(vx - 1.5, vy - 1.5, vw + 3, vh + 3);
  const vg = ctx.createLinearGradient(0, vy, 0, vy + vh);
  vg.addColorStop(0, '#e9c98c');
  vg.addColorStop(1, '#b98a46');
  ctx.fillStyle = vg;
  ctx.fillRect(vx, vy, vw, vh);
  lightPool(ctx, vx + vw / 2, vy + vh, vw * 1.4, vh * 1.6, kelvin(2700), 0.18);
  const px = vx + vw / 2;
  const py = vy + vh * 1.05;
  const R = vh * 0.82;
  ctx.strokeStyle = '#2a1d10';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 - 0.85 + (i / 10) * 1.7;
    const r0 = i % 5 === 0 ? R * 0.78 : R * 0.84;
    ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
    ctx.lineTo(px + Math.cos(a) * R * 0.92, py + Math.sin(a) * R * 0.92);
  }
  ctx.stroke();
  ctx.strokeStyle = '#a3241a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, R * 0.88, -Math.PI / 2 + 0.45, -Math.PI / 2 + 0.85);
  ctx.stroke();
  const voice = rm ? 0.55 : clamp01(0.42 + 0.22 * Math.sin(t * 9.1) * Math.sin(t * 2.3 + 1) + 0.16 * Math.sin(t * 15.7 + 2) + 0.12 * Math.sin(t * 1.3));
  const na = -Math.PI / 2 - 0.85 + voice * 1.7;
  ctx.strokeStyle = '#120c08';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(na) * R * 0.95, py + Math.sin(na) * R * 0.95);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 0.75;
  ctx.strokeRect(vx, vy, vw, vh);
  // Speaker grille.
  ctx.fillStyle = 'rgba(10,8,6,0.75)';
  const gx = x + W * 0.67;
  const gy = y + H * 0.64;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) ctx.fillRect(gx + c * (W * 0.037), gy + r * (H * 0.09), W * 0.016, W * 0.016);
  // Piano keys along the top front, PLAY (the second) held down; the record lamp lit.
  const kw = W * 0.08;
  for (let i = 0; i < 5; i++) {
    const kx = x + W * 0.1 + i * (kw + W * 0.012);
    const down = i === 1;
    ctx.fillStyle = cylinderRamp(ctx, kx, 0, kx + kw, 0, MATERIAL.chrome);
    ctx.fillRect(kx, y - (down ? 0 : H * 0.07), kw, H * (down ? 0.05 : 0.09));
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(kx, y - (down ? 0 : H * 0.07), kw, H * (down ? 0.05 : 0.09));
  }
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(x + W * 0.66, y + H * 0.06, 3, 3);
  lightPool(ctx, x + W * 0.66 + 1.5, y + H * 0.06 + 1.5, 8, 8, [255, 90, 74], 0.45);
  ctx.strokeStyle = 'rgba(8,10,12,0.88)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(x, y, W, H, W * 0.04);
  ctx.stroke();
}

/** A cork board on the wall: dark cork in the night, its grain, an aluminium frame. Static (cached). */
function corkBoard(c: Ctx2D, r: Rect): void {
  c.fillStyle = '#2b2118';
  c.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < Math.round((r.w * r.h) / 30); i++) {
    c.fillStyle = hash(i, 51) > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(200,160,110,0.10)';
    c.fillRect(r.x + hash(i, 52) * r.w, r.y + hash(i, 53) * r.h, 1 + hash(i, 54), 1);
  }
  const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, 'rgba(120,150,180,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = g;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.strokeStyle = MATERIAL.anod[1];
  c.lineWidth = 3;
  c.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = 1.25;
  c.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
}

/** A push pin (red plastic, one specular dot) at (x, y). */
function pushPin(c: Ctx2D, x: number, y: number, r: number): void {
  contactShadow(c, x + r * 0.5, y + r * 0.7, r * 1.4, r * 0.9, 0.5);
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#d0503e');
  g.addColorStop(1, '#5e1410');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,240,230,0.8)';
  c.beginPath();
  c.arc(x - r * 0.35, y - r * 0.38, r * 0.22, 0, TAU);
  c.fill();
}

// ───────────────────────────── 2 · Albor's farewell tape ─────────────────────────────

const tape: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const wd = wide(e);
  const r: Room = wd
    ? { win: { x: w * 0.07, y: h * 0.12, w: w * 0.34, h: h * 0.5 }, panes: 2, benchY: h * 0.72 }
    : { win: { x: w * 0.06, y: h * 0.15, w: w * 0.32, h: h * 0.38 }, panes: 1, benchY: h * 0.64 };
  const cork: Rect = wd ? { x: w * 0.5, y: h * 0.14, w: w * 0.3, h: h * 0.42 } : { x: w * 0.45, y: h * 0.14, w: w * 0.5, h: h * 0.4 };
  const img = photo('estacion-aurora-noaa');
  room(ctx, e, `tape${wd ? 'w' : 'n'}`, r, (c) => {
    corkBoard(c, cork);
    // An old shift rota pinned beside the photo (ruled paper, no words).
    const nx = cork.x + cork.w * (wd ? 0.72 : 0.84);
    const ny = cork.y + cork.h * 0.3;
    c.save();
    c.translate(nx, ny);
    c.rotate(0.06);
    c.fillStyle = '#5d5b55';
    c.fillRect(-cork.w * 0.12, -cork.h * 0.16, cork.w * 0.24, cork.h * 0.34);
    c.fillStyle = 'rgba(30,40,60,0.45)';
    for (let i = 0; i < 6; i++) c.fillRect(-cork.w * 0.1, -cork.h * 0.1 + i * cork.h * 0.045, cork.w * (0.12 + hash(i, 61) * 0.07), 0.75);
    c.restore();
    pushPin(c, nx, ny - cork.h * 0.14, 2.6 * u);
  });
  // Albor's Polaroid (P2, §5.6): her from behind at this same window, the aurora outside, her note.
  const pw = Math.min(cork.w * (wd ? 0.6 : 0.74), cork.h * 0.66);
  drawAlborPolaroid(ctx, cork.x + cork.w * (wd ? 0.36 : 0.42) - pw / 2, cork.y + cork.h * 0.5 - pw * 0.6, pw, t, rm, img, { lang: e.lang ?? 'es', tilt: -0.05 });
  // VELA asleep at the end of the bench (her lamp breathes: she is waiting).
  if (wd) {
    const v = velaSpot(w * 0.88, r.benchY + h * 0.1, w * 0.2);
    velaOnBench(ctx, v, 'sleepy', 10, t, rm, 1, [], draw(e));
  }
  const W = wd ? Math.min(w * 0.3, 260) : Math.min(w * 0.56, 220);
  recorder(ctx, wd ? w * 0.56 : w * 0.5, r.benchY + (h - r.benchY) * (wd ? 0.55 : 0.72), W, t, rm, tr(e, 'Cinta 3 · A.', 'Tape 3 · A.'));
  finish(ctx, e, 0.42);
};

// ───────────────────────────── 3 · you arrive ─────────────────────────────

/** The vestibule: the outer door open on the snow, the cold light on the floor, the coat rack's hooks. */
const arrive: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const wd = wide(e);
  const floorY = h * (wd ? 0.84 : 0.8);
  const door: Rect = wd ? { x: w * 0.6, y: h * 0.12, w: w * 0.22, h: floorY - h * 0.12 } : { x: w * 0.64, y: h * 0.17, w: w * 0.3, h: floorY - h * 0.17 };
  const rack = arriveRack(e, door);
  const img = photo('cupula-aurora-nsf');
  const P = PHOTOS['cupula-aurora-nsf'];
  cached(ctx, `arrive${wd ? 'w' : 'n'}|${img ? 'p' : 'v'}`, e, (c) => {
    labWall(c, w, floorY, 64 * u);
    // Floor: dark rubber, the doorway's cold light lying on it.
    const fg = c.createLinearGradient(0, floorY, 0, h);
    fg.addColorStop(0, '#0d1014');
    fg.addColorStop(1, '#07090b');
    c.fillStyle = fg;
    c.fillRect(0, floorY, w, h - floorY);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, floorY - 1, w, 1.5);
    // Outside: the photo through the doorway, or the vector night.
    c.save();
    c.beginPath();
    c.rect(door.x, door.y, door.w, door.h);
    c.clip();
    if (img) {
      const cr = coverCrop(P.w, P.h, door.w, door.h, 0.5, 0.62, 1);
      drawGraded(c, img, cr, door.x, door.y, door.w, door.h, NIGHT_GRADE);
    } else {
      nightSky(c, door.x, door.y, door.w, door.h * 0.8);
      stars(c, door.x, door.y, door.w, door.h * 0.6, 0, true, 40, 7);
      auroraCurtain(c, door.x - door.w * 0.3, door.y, door.w * 1.6, door.h * 0.7, 2, true, 0.9);
      const sn = c.createLinearGradient(0, door.y + door.h * 0.8, 0, door.y + door.h);
      sn.addColorStop(0, '#26323f');
      sn.addColorStop(1, '#3a4756');
      c.fillStyle = sn;
      c.fillRect(door.x, door.y + door.h * 0.8, door.w, door.h * 0.2);
    }
    c.restore();
    // The cold light from the doorway on the floor (a trapezoid towards you).
    c.save();
    c.globalCompositeOperation = 'screen';
    const lg = c.createLinearGradient(0, floorY, 0, h);
    lg.addColorStop(0, 'rgba(140,175,205,0.20)');
    lg.addColorStop(1, 'rgba(140,175,205,0.02)');
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(door.x, floorY);
    c.lineTo(door.x + door.w, floorY);
    c.lineTo(door.x + door.w * 1.05 - w * 0.12, h);
    c.lineTo(door.x - w * 0.3, h);
    c.closePath();
    c.fill();
    c.restore();
    // Snow drifted in over the threshold.
    c.fillStyle = 'rgba(200,215,228,0.55)';
    c.beginPath();
    c.moveTo(door.x - 4 * u, floorY + 1);
    c.quadraticCurveTo(door.x + door.w * 0.3, floorY - 5 * u, door.x + door.w * 0.7, floorY - 2 * u);
    c.quadraticCurveTo(door.x + door.w, floorY - 1 * u, door.x + door.w + 3 * u, floorY + 1);
    c.lineTo(door.x + door.w * 0.6, floorY + 6 * u);
    c.quadraticCurveTo(door.x + door.w * 0.1, floorY + 8 * u, door.x - 14 * u, floorY + 3 * u);
    c.closePath();
    c.fill();
    // Door frame (anodised), the leaf swung in towards you (white steel in the dark, a wired window).
    c.strokeStyle = MATERIAL.anod[1];
    c.lineWidth = 4 * u;
    c.strokeRect(door.x - 2 * u, door.y - 2 * u, door.w + 4 * u, door.h + 2 * u);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 1.25;
    c.strokeRect(door.x - 4 * u, door.y - 4 * u, door.w + 8 * u, door.h + 4 * u);
    const lx = door.x + door.w + 4 * u;
    const lw = door.w * 0.42;
    c.beginPath();
    c.moveTo(lx, door.y - 2 * u);
    c.lineTo(lx + lw, door.y - door.h * 0.06);
    c.lineTo(lx + lw, floorY + door.h * 0.05);
    c.lineTo(lx, floorY);
    c.closePath();
    const lg2 = c.createLinearGradient(lx, 0, lx + lw, 0);
    lg2.addColorStop(0, '#3a4148');
    lg2.addColorStop(1, '#222830');
    c.fillStyle = lg2;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 1.25;
    c.stroke();
    // Its cold edge, lit from outside.
    c.fillStyle = 'rgba(170,200,225,0.35)';
    c.fillRect(lx, door.y - 2 * u, 1.5, door.h + 2 * u);
    // Wired glass window and the chrome lever.
    c.beginPath();
    c.moveTo(lx + lw * 0.25, door.y + door.h * 0.12);
    c.lineTo(lx + lw * 0.75, door.y + door.h * 0.1);
    c.lineTo(lx + lw * 0.75, door.y + door.h * 0.34);
    c.lineTo(lx + lw * 0.25, door.y + door.h * 0.35);
    c.closePath();
    c.fillStyle = '#0d151d';
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 0.75;
    c.stroke();
    c.fillStyle = cylinderRamp(c, 0, door.y + door.h * 0.55, 0, door.y + door.h * 0.55 + 4 * u);
    c.fillRect(lx + lw * 0.62, door.y + door.h * 0.55, lw * 0.3, 3.2 * u);
    // The coat rack on the left wall: an anodised rail (the hooks and the coats are P2's drawBataCard).
    const { x0, x1, y: ry } = rack;
    const rh = Math.max(4, 4 * u);
    contactShadow(c, (x0 + x1) / 2, ry + rh, (x1 - x0) * 0.55, 4 * u, 0.5);
    c.fillStyle = cylinderRamp(c, 0, ry - rh / 2, 0, ry + rh / 2, MATERIAL.anod, [0, 0.08, 0.55, 1]);
    c.fillRect(x0, ry - rh / 2, x1 - x0, rh);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 1.25;
    c.strokeRect(x0, ry - rh / 2, x1 - x0, rh);
  });
  // Snow blowing in through the doorway, spreading into the room.
  ctx.save();
  ctx.fillStyle = '#e9f1f8';
  const n = Math.round(60 + w * 0.05);
  for (let i = 0; i < n; i++) {
    const life = 2.6 + hash(i, 71) * 1.8;
    const k = rm ? hash(i, 72) : ((t + hash(i, 72) * life) % life) / life;
    const sx = door.x + hash(i, 73) * door.w;
    const sy = door.y + door.h * (0.2 + hash(i, 74) * 0.75);
    const x = sx - k * (w * 0.5) * (0.3 + hash(i, 75));
    const y = sy + k * k * (floorY - sy + 12 * u) + Math.sin(k * 6 + i) * 3 * u;
    if (y > floorY + 10 * u || x < -4) continue;
    ctx.globalAlpha = (0.25 + 0.6 * hash(i, 76)) * (1 - k * 0.6);
    const s = hash(i, 77) > 0.85 ? 1.6 : 1;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
  snowfall(ctx, door.x, door.y, door.w, door.h, t, rm, 40, -6, 9, 0.9);
  // The three coats on their hooks (§5.5): the one you pick comes off its hook, its ID card swings.
  // `pickAge` counts from the player's pick; on arrival the current coat is taken a moment in.
  const age = e.pickAge ?? t - 0.8;
  const lift = rm ? 1 : drawer(clamp01((age - 0.15) / 0.22));
  COAT_IDS.forEach((id, i) => {
    const x = rack.x0 + rack.step * i;
    ctx.save();
    ctx.translate(x, rack.y - rack.hook);
    drawBataCard(ctx, id, rack.tw, rack.th, t, rm, id === e.look ? lift : 0, { wall: false, ring: false, lang: e.lang ?? 'es', age: id === e.look ? age - 0.15 : Infinity });
    ctx.restore();
  });
  // Your gloved hand comes into the frame from below and reaches for it (P2's drawGlovedHand, §3.7).
  const pick = COAT_IDS.indexOf(e.look);
  const target = { x: rack.x0 + rack.step * Math.max(0, pick) + rack.tw / 2, y: rack.y + rack.th * 0.5 };
  // It enters from the bottom right (§3.7), the wrist low, the fingers towards the coat.
  const handLen = h * 0.3;
  const k = handLen / 62;
  const wx = Math.min(w - handLen * 0.18, target.x + w * 0.3);
  const wy = h - handLen * 0.08;
  const angle = Math.round(Math.atan2(target.x - wx, wy - target.y) * 50) / 50;
  const inK = rm ? 1 : drawer(clamp01(age / 0.45));
  if (inK > 0.001) drawGlovedHand(ctx, 'reach', wx, wy + (1 - inK) * handLen * 1.3, k, e.look, { angle });
  finish(ctx, e, 0.42);
};

/** The 220-ms drawer of §6.4 (ease-out, no overshoot) as a function of progress. */
function drawer(p: number): number {
  const q = 1 - clamp01(p);
  return 1 - q * q * q;
}

/**
 * Where the coat rack sits in the vestibule: its rail (x0 → x1 at y) left of the door, the coat tiles
 * (`tw` × `th`, a coat about half the door's height) overlapping a little, and how far the hook sits
 * below a tile's top (drawBataCard hangs the coat at its rail line: 3.5 % + 1.5 % of the tile).
 */
function arriveRack(e: SceneEnv, door: Rect): { x0: number; x1: number; y: number; tw: number; th: number; step: number; hook: number } {
  const wd = wide(e);
  const x0 = e.w * (wd ? 0.07 : 0.04);
  const x1 = door.x - e.w * (wd ? 0.06 : 0.05);
  const y = e.h * (wd ? 0.2 : 0.24);
  const th = Math.min(door.h * 0.56, ((x1 - x0) / 2.5) * 1.5);
  const tw = th / 1.5;
  const step = (x1 - x0 - tw) / 2;
  const railY = Math.max(3, th * 0.035);
  const railH = Math.max(3, th * 0.03);
  return { x0, x1, y, tw, th, step, hook: railY + railH * 0.5 };
}

// ───────────────────────────── 4 · VELA switches on ─────────────────────────────

const candle: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const wd = wide(e);
  const r: Room = wd
    ? { win: { x: w * 0.06, y: h * 0.1, w: w * 0.28, h: h * 0.5 }, panes: 2, benchY: h * 0.66 }
    : { win: { x: w * 0.06, y: h * 0.13, w: w * 0.3, h: h * 0.4 }, panes: 1, benchY: h * 0.62 };
  room(ctx, e, `candle${wd ? 'w' : 'n'}`, r);
  // The lamp warms with thermal inertia (§6.4): 2200 → 2700 K in 1.2 s, the screen starts (P1).
  const warm = rm ? 1 : smooth(0.5, 1.7, t);
  const mood: ArtMood = rm ? 'happy' : t < 0.5 ? 'sleepy' : t < 2.2 ? 'neutral' : 'happy';
  const v = velaSpot(wd ? w * 0.62 : w * 0.6, r.benchY + (h - r.benchY) * 0.45, wd ? Math.min(w * 0.34, h * 0.5) : w * 0.56);
  // The dish on the bench to her left, wired to her probe.
  const dx = wd ? w * 0.3 : w * 0.2;
  const dy = r.benchY + (h - r.benchY) * 0.62;
  const drx = wd ? w * 0.1 : w * 0.15;
  const [cx0, cy0] = velaCableAt(v);
  probeCable(ctx, cx0, cy0, dx + drx * 0.95, dy + drx * 0.12, 6 * u, Math.max(2, 2.2 * u));
  dish3q(ctx, dx, dy, drx, 0.36, 0.5 + 0.5 * warm, (c, rr) => culture(c, rr, [{ code: 'O2u', x: -0.2, y: 0.05, size: trueSize('O2u'), rot: 0.6, alpha: 0.6 + 0.4 * warm }]), warm);
  // Her self-test once the screen is up (§6.6), then her own label.
  const selfTest = !rm && t >= 0.5 && t < 2.2 ? AUTOTEST : null;
  velaOnBench(ctx, v, mood, rm ? 10 : t < 0.5 ? t : t < 2.2 ? t - 0.5 : t - 2.2, t, rm, warm, [], { ...draw(e), label: selfTest });
  // The room before the lamp: dark, lifting as the filament heats.
  const [lx, ly] = velaLampAt(v);
  darkness(ctx, w, h, lx, ly, Math.max(w, h) * (0.25 + warm * 1.1), 0.82 - warm * 0.5);
  const K = Math.round((2200 + 500 * warm) / 10) * 10;
  const { b } = lampState(mood, t, rm);
  lightPool(ctx, lx, ly, 160 * v.k, 140 * v.k, kelvin(K), 0.1 * warm * b);
  // An annotation, like a lab photo's: the lamp's colour temperature as it warms (at 8 Hz).
  if (warm > 0.15) {
    ctx.save();
    ctx.globalAlpha = smooth(0.15, 0.5, warm);
    const lab = `${Math.round((2200 + 500 * (rm ? 1 : smooth(0.5, 1.7, at8Hz(t)))) / 10) * 10} K`;
    const ax = Math.max(16, v.cx - 34 * v.k);
    const ay = v.foot - 104 * v.k;
    const tw = plateText(ctx, lab, ax, ay, 13, { mono: true, track: 0.06, color: INK_ON_PLATE.ink });
    leader(ctx, ax + tw + 6, ay - 4, lx - 3, ly - 3, INK_ON_PLATE.ink2);
    ctx.restore();
  }
  finish(ctx, e, 0.55);
};

// ───────────────────────────── 5 · the dish glows ─────────────────────────────

const DISH_CODES: readonly string[] = ['O2u', 'OG2g', 'S1s', 'O2u'];

const dish: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const wd = wide(e);
  const benchY = h * (wd ? 0.3 : 0.34);
  cached(ctx, `dish${wd ? 'w' : 'n'}`, e, (c) => {
    labWall(c, w, benchY, 64 * u);
    bench(c, w, h, benchY, null);
  });
  const on = rm ? 1 : smooth(0, 1.2, t);
  const cx = w * 0.5;
  const cy = h * (wd ? 0.56 : 0.6);
  const rx = Math.min(w * 0.4, h * 0.56);
  // The lamp off-frame on the right, the window's cold sheen from the top left.
  lightPool(ctx, w * 1.02, cy - rx * 0.4, w * 0.75, rx * 0.9, kelvin(2700), 0.16);
  lightPool(ctx, w * 0.05, benchY, w * 0.6, h * 0.2, [130, 165, 200], 0.05);
  // Albor's last photo, an old print lying on the bench in sepia (§5.6), if it has loaded.
  const old = photo('placa-microscopio-nci');
  if (old) {
    const P = PHOTOS['placa-microscopio-nci'];
    const pw = Math.min(w * (wd ? 0.22 : 0.36), 220);
    const ph = pw * 0.72;
    const px = wd ? w * 0.8 : w * 0.74;
    const py = benchY + (wd ? h * 0.07 : h * 0.06);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, 0.62);
    ctx.rotate(0.1);
    contactShadow(ctx, pw * 0.03, ph * 0.06, pw * 0.6, ph * 0.55, 0.6);
    ctx.fillStyle = '#7d766a';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    const m = pw * 0.05;
    const cr = coverCrop(P.w, P.h, pw - 2 * m, ph - 2 * m, 0.48, 0.55, 1.05);
    ctx.drawImage(old, cr.sx, cr.sy, cr.sw, cr.sh, -pw / 2 + m, -ph / 2 + m, pw - 2 * m, ph - 2 * m);
    sepia(ctx, -pw / 2 + m, -ph / 2 + m, pw - 2 * m, ph - 2 * m, 1);
    grade(ctx, -pw / 2, -ph / 2, pw, ph, { desat: 0, tint: '#9a9184', tintA: 0.55, dark: 0.18 });
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    ctx.restore();
  }
  // The dish, three-quarter view, with real creatures at their true scale.
  dish3q(ctx, cx, cy, rx, 0.42, on, (c, rr) => {
    const list: Specimen[] = DISH_CODES.map((code, i) => {
      const ph = t * 0.12 + i * 1.7;
      return {
        code,
        x: (rm ? Math.cos(i * 1.7) : Math.cos(ph)) * (0.25 + 0.35 * hash(i, 81)),
        y: (rm ? Math.sin(i * 2.3) : Math.sin(ph * 1.3)) * 0.5,
        size: trueSize(code),
        rot: rm ? i : ph * 0.8,
        alpha: on,
      };
    });
    culture(c, rr, list);
  }, 0.9);
  // A dimension line under the dish: Ø 90 mm (1 cell = 0.7 mm, Ø128 cells, §6.5 rule 4).
  const wallH = dishWallH(rx, 0.42);
  const ly = cy + rx * 0.42 + wallH + 22;
  if (ly < h - 30) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = INK_ON_PLATE.ink2;
    ctx.fillRect(cx - rx, ly, rx * 2, 1);
    ctx.fillRect(cx - rx, ly - 5, 1, 10);
    ctx.fillRect(cx + rx - 1, ly - 5, 1, 10);
    const label = `Ø ${Math.round(128 * PLATE_MM_PER_CELL)} mm`;
    ctx.font = "600 13px 'JetBrains Mono', ui-monospace, Menlo, monospace";
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#0d1012';
    ctx.fillRect(cx - tw / 2, ly - 8, tw, 16);
    plateText(ctx, label, cx, ly + 4.5, 13, { mono: true, color: INK_ON_PLATE.ink, align: 'center' });
    ctx.restore();
  }
  finish(ctx, e, 0.6);
};

// ───────────────────────────── the plates (how to play, §6.5) ─────────────────────────────

interface Plate {
  /** Content area (below the header, inside the margins). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The night paper of a plate with its registration marks and «FIG. n · TITLE» in Mono. */
function plate(ctx: CanvasRenderingContext2D, e: SceneEnv, n: number, title: string): Plate {
  const m = 16;
  const top = wide(e) ? 76 : 70;
  plateSheet(ctx, e.w, e.h, dprOf(e), m, top - 22);
  plateText(ctx, `FIG. ${n} · ${title.toUpperCase()}`, m + 8, top, 13, { mono: true, track: 0.12, color: PLATE.dark.ink2 });
  ctx.fillStyle = PLATE.dark.rule;
  ctx.fillRect(m + 8, top + 9, e.w - 2 * m - 16, 1);
  return { x: m + 8, y: top + 22, w: e.w - 2 * m - 16, h: e.h - top - 22 - 40 };
}

/** A panel frame (1 px rule) with its letter above the top-left corner. */
function panelFrame(ctx: CanvasRenderingContext2D, r: Rect, ch: string): void {
  ctx.strokeStyle = PLATE.dark.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
  panelLabel(ctx, ch, r.x + 8, r.y + 20);
}

// ───────────────────────────── 6 · how to: sow ─────────────────────────────

const sow: Painter = (ctx, e) => {
  const { t, rm } = e;
  const wd = wide(e);
  const P = plate(ctx, e, 1, tr(e, 'Siembra', 'Sowing'));
  const gap = 12;
  // a · the still photo of a gloved hand with a pipette; b · the dish, where the drop lands.
  const aw = wd ? P.w * 0.34 : P.w * 0.38;
  const A: Rect = { x: P.x, y: P.y, w: aw, h: P.h };
  const B: Rect = { x: P.x + aw + gap, y: P.y, w: P.w - aw - gap, h: P.h };
  const img = photo('pipeta-guante-csiro');
  if (img) {
    const PH = PHOTOS['pipeta-guante-csiro'];
    drawGraded(ctx, img, coverCrop(PH.w, PH.h, A.w, A.h, 0.5, 0.45, 1.05), A.x, A.y, A.w, A.h, NIGHT_GRADE);
    vignette(ctx, A.x, A.y, A.w, A.h, 0.45);
  } else {
    // Without the photo: the same still in vector, a pipette tip over the night.
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(A.x, A.y, A.w, A.h);
    pipetteTip(ctx, A.x + A.w / 2, A.y + A.h * 0.8, A.h * 0.62, 0.5);
  }
  panelFrame(ctx, A, 'a');
  // The dish in three-quarter view.
  const rx = Math.min(B.w * 0.4, B.h * 0.42);
  const cx = B.x + B.w / 2;
  const cy = B.y + B.h * 0.6;
  const tilt = 0.5;
  // Reduce motion shows the finished figure: both seeds landed, one creature, one faded.
  const loop = rm ? 4.6 : t % 4.8;
  const seeds = [
    { x: -0.32, y: -0.1, at: 0.2, lives: true },
    { x: 0.38, y: 0.3, at: 2.6, lives: false },
  ];
  const wallH = dishWallH(rx, tilt);
  const agarY = cy + wallH * 0.4;
  dish3q(ctx, cx, cy, rx, tilt, 0.6, (c, rr) => {
    for (const s of seeds) {
      const k = loop - s.at - 0.9;
      if (k < 0) continue;
      if (s.lives) {
        const grow = smooth(0, 1.2, k);
        lightPool(c, s.x * rr, s.y * rr, rr * 0.4 * grow, rr * 0.4 * grow, [91, 192, 235], 0.3 * (1 - smooth(1, 2, k) * 0.5));
        creature(c, 'O2u', s.x * rr, s.y * rr, trueSize('O2u') * rr * 1.4 * (0.5 + 0.5 * grow), 0.4 + (rm ? 0 : k * 0.12), smooth(0.3, 1.4, k));
      } else {
        const fade = 1 - smooth(0.8, 1.8, k);
        lightPool(c, s.x * rr, s.y * rr, rr * 0.28, rr * 0.28, [120, 165, 200], 0.4 * fade * smooth(0, 0.4, k));
      }
    }
  }, 0.5);
  // The pipette tip comes down over each seed, lets go one drop, and lifts.
  const tipLen = Math.min(B.h * 0.36, 120);
  for (const s of seeds) {
    const k = loop - s.at;
    if (k < -0.1 || k > 1.6) continue;
    const sx = cx + s.x * rx;
    const sy = agarY + s.y * rx * tilt;
    const hover = sy - rx * 0.55;
    const down = smooth(-0.1, 0.4, k) * (1 - smooth(1.1, 1.6, k));
    const tipY = B.y + 8 + (hover - B.y - 8) * down;
    if (k < 1.6) pipetteTip(ctx, sx, tipY, tipLen, 0.45);
    if (k > 0.45 && k < 0.95) {
      const f = smooth(0.45, 0.95, k);
      mediumDrop(ctx, sx, tipY + 4 + (sy - tipY - 4) * f * f, 3.2, 1 - smooth(0.85, 0.95, k));
    }
  }
  // Leaders and verdicts: a seed that keeps its shape is a creature; the other one fades.
  const s1x = cx + seeds[0].x * rx;
  const s1y = agarY + seeds[0].y * rx * tilt;
  const s2x = cx + seeds[1].x * rx;
  const s2y = agarY + seeds[1].y * rx * tilt;
  const lyA = Math.min(B.y + B.h - 30, cy + rx * tilt + wallH + 34);
  const k1 = smooth(2, 2.3, loop);
  const k2 = smooth(4.1, 4.4, loop);
  if (k1 > 0) {
    ctx.globalAlpha = k1;
    leader(ctx, B.x + 18, lyA - 4, s1x - 6, s1y + 8);
    plateText(ctx, tr(e, 'criatura', 'creature'), B.x + 18, lyA + 14, 14);
    verdict(ctx, B.x + 26 + ctx.measureText(tr(e, 'criatura', 'creature')).width + 12, lyA + 9, 8, true, k1);
    ctx.globalAlpha = 1;
  }
  if (k2 > 0) {
    const tx = B.x + B.w - 18;
    ctx.globalAlpha = k2;
    leader(ctx, tx, lyA - 4, s2x + 6, s2y + 6);
    const tw = plateText(ctx, tr(e, 'se apaga', 'fades'), tx, lyA + 14, 14, { align: 'right', color: PLATE.dark.ink2 });
    verdict(ctx, tx - tw - 16, lyA + 9, 8, false, k2);
    ctx.globalAlpha = 1;
  }
  panelFrame(ctx, B, 'b');
  scaleBar(ctx, B.x + 12, B.y + B.h - 12, (rx * 10) / 45, '10 mm');
};

// ───────────────────────────── 7 · how to: shape → Esencia ─────────────────────────────

/** A moving-coil panel meter (line art): an arc scale 0–20 with ticks, a damped needle, its unit. */
function panelMeter(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, value: number, max: number, unitLabel: string): void {
  const a0 = -Math.PI / 2 - 1;
  const span = 2;
  ctx.save();
  ctx.strokeStyle = PLATE.dark.ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, a0, a0 + span);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = a0 + (i / 20) * span;
    const r0 = i % 5 === 0 ? R * 0.86 : R * 0.92;
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  ctx.stroke();
  for (let i = 0; i <= 4; i++) {
    const a = a0 + (i / 4) * span;
    plateText(ctx, String((max * i) / 4), cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14) + 4.5, 13, { align: 'center', color: PLATE.dark.ink2 });
  }
  const na = a0 + clamp01(value / max) * span;
  ctx.strokeStyle = PLATE.dark.ink;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * R * 1.02, cy + Math.sin(na) * R * 1.02);
  ctx.stroke();
  ctx.fillStyle = PLATE.dark.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fill();
  plateText(ctx, unitLabel, cx, cy + 22, 13, { mono: true, track: 0.1, align: 'center', color: PLATE.dark.ink2 });
  ctx.restore();
}

const essence: Painter = (ctx, e) => {
  const { t, rm } = e;
  const wd = wide(e);
  const P = plate(ctx, e, 2, tr(e, 'Luz', 'Glow'));
  const gap = 12;
  const A: Rect = wd ? { x: P.x, y: P.y, w: P.w * 0.58, h: P.h } : { x: P.x, y: P.y, w: P.w, h: P.h * 0.58 };
  const B: Rect = wd ? { x: P.x + A.w + gap, y: P.y, w: P.w - A.w - gap, h: P.h } : { x: P.x, y: P.y + A.h + gap, w: P.w, h: P.h - A.h - gap };
  // a · a field of the dish seen from above: a creature with a shape, and a shapeless smear.
  const r = Math.min(A.w * 0.44, A.h * 0.4);
  const fx = A.x + A.w / 2;
  const fy = A.y + A.h * 0.5;
  const breathe = rm ? 1 : 1 + Math.sin(t * 2.2) * 0.02;
  // A magnified field (so a creature can be read): its scale bar is measured on the creature itself.
  const cpx = r * 0.8;
  const cx = fx - r * 0.4;
  const cy = fy - r * 0.05;
  const bx = fx + r * 0.42;
  const by = fy + r * 0.12;
  dishTop(ctx, fx, fy, r, 0.8, (c) => {
    creature(c, 'O2u', cx, cy, cpx * breathe, 0.6, 1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (rm ? 0 : t * 0.15);
      const rr = r * (0.07 + 0.05 * hash(i, 101));
      lightPool(c, bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.7, r * 0.12, r * 0.12, [120, 150, 180], 0.28);
    }
  }, 0.4);
  verdict(ctx, cx, cy + r * 0.36, 8, true);
  verdict(ctx, bx, by + r * 0.3, 8, false);
  const ly = A.y + 44;
  const lw1 = plateText(ctx, tr(e, 'forma', 'shape'), A.x + 30, ly, 14);
  leader(ctx, A.x + 30 + lw1 + 6, ly - 5, cx - r * 0.12, cy - r * 0.16);
  const lw2 = plateText(ctx, tr(e, 'sin forma', 'no shape'), A.x + A.w - 14, ly, 14, { align: 'right', color: PLATE.dark.ink2 });
  leader(ctx, A.x + A.w - 14 - lw2 - 6, ly - 5, bx + r * 0.06, by - r * 0.14);
  panelFrame(ctx, A, 'a');
  const cells = 5 / PLATE_MM_PER_CELL;
  scaleBar(ctx, A.x + 12, A.y + A.h - 12, cells * cellPx('O2u', cpx), '5 mm');
  // b · the Essence meter: the creature's reading rises with a damped needle; the smear reads 0.
  const R = Math.min(B.w * 0.4, B.h * 0.5 - 22, 150);
  const mx = B.x + B.w / 2;
  const my = B.y + B.h * 0.5 + R * 0.45;
  const target = 12;
  const value = rm ? target : target * clamp01(at8Hz(t) / 1.6) * needleStep(Math.max(0, t - 0.2));
  panelMeter(ctx, mx, my, R, value, 20, tr(e, 'LUZ /s', 'GLOW /s'));
  plateText(ctx, `+${Math.round(value)}`, B.x + B.w - 14, B.y + 30, 16, { weight: 700, align: 'right', color: TEAL });
  panelFrame(ctx, B, 'b');
};

// ───────────────────────────── 8 · how to: the clock → Datos ─────────────────────────────

/** A lab stopwatch (line art with a chrome bezel): 60 ticks, minutes, a damped hand that steps each second. */
function stopwatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, left: number, rm: boolean, tick: number): void {
  // Crown and the bezel: turned metal, one specular facing the window.
  ctx.fillStyle = cylinderRamp(ctx, cx - R * 0.09, 0, cx + R * 0.09, 0);
  ctx.fillRect(cx - R * 0.09, cy - R * 1.2, R * 0.18, R * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(cx - R * 0.09, cy - R * 1.2, R * 0.18, R * 0.16);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.08, 0, TAU);
  ctx.arc(cx, cy, R, 0, TAU, true);
  ctx.fillStyle = cylinderRamp(ctx, cx - R, cy - R, cx + R, cy + R);
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.08, 0, TAU);
  ctx.stroke();
  // Dial.
  ctx.fillStyle = '#0c1116';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PLATE.dark.ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * TAU;
    const r0 = i % 5 === 0 ? R * 0.84 : R * 0.91;
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * R * 0.96, cy + Math.sin(a) * R * 0.96);
  }
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * TAU;
    plateText(ctx, String(i * 15), cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7 + 4.5, 13, { align: 'center', color: PLATE.dark.ink2 });
  }
  // The remaining time as a sector (2 minutes = two turns: the second turn in the sector).
  const secs = left * 120;
  if (secs > 0.01) {
    ctx.fillStyle = 'rgba(94,230,200,0.12)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.min(1, secs / 60) * TAU);
    ctx.closePath();
    ctx.fill();
  }
  // The seconds hand steps once a second and settles (ζ 0.8): instrument motion, not a smooth sweep.
  const whole = Math.floor(secs);
  const settle = rm ? 1 : needleStep(tick);
  const shown = whole + 1 - settle;
  const a = -Math.PI / 2 + ((shown % 60) / 60) * TAU;
  ctx.strokeStyle = '#ff5a4a';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * R * 0.16, cy - Math.sin(a) * R * 0.16);
  ctx.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
  ctx.stroke();
  ctx.fillStyle = '#ff5a4a';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fill();
  // The reading in Mono, tabular.
  const s = Math.max(0, Math.ceil(secs));
  plateText(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, cx, cy + R * 0.42, Math.max(16, Math.round(R * 0.2)), { mono: true, weight: 700, align: 'center' });
}

const clock: Painter = (ctx, e) => {
  const { t, rm } = e;
  const wd = wide(e);
  const P = plate(ctx, e, 3, tr(e, 'Tiempo de laboratorio', 'Lab time'));
  const gap = 12;
  const A: Rect = wd ? { x: P.x, y: P.y, w: P.w * 0.55, h: P.h } : { x: P.x, y: P.y, w: P.w, h: P.h * 0.6 };
  const B: Rect = wd ? { x: P.x + A.w + gap, y: P.y, w: P.w - A.w - gap, h: P.h } : { x: P.x, y: P.y + A.h + gap, w: P.w, h: P.h - A.h - gap };
  const loop = rm ? HERO_TIME.clock : t % 5;
  const run = clamp01(loop / 2.4);
  // The intro's two minutes run in 2.4 s; the hand still steps (a fast-forward of a real stopwatch).
  const left = 1 - run;
  const R = Math.min(A.w * 0.34, A.h * 0.36);
  stopwatch(ctx, A.x + A.w / 2, A.y + A.h * 0.54, R, left, rm, ((loop * 50) % 1) / 1);
  panelFrame(ctx, A, 'a');
  // b · when time is up, the Essence turns into Datos (both readings step at 8 Hz).
  const conv = rm ? 1 : clamp01((at8Hz(loop) - 2.4) / 1.2);
  const ess = Math.round(12 * (1 - conv));
  const dat = Math.round(12 * conv);
  const rowY = B.y + B.h * 0.36;
  const left0 = B.x + 18;
  const right0 = B.x + B.w - 18;
  plateText(ctx, tr(e, 'LUZ', 'GLOW'), left0, rowY, 13, { mono: true, track: 0.1, color: PLATE.dark.ink2 });
  plateText(ctx, String(ess), left0, rowY + 34, 28, { mono: true, weight: 700 });
  plateText(ctx, tr(e, 'DATOS', 'DATA'), right0, rowY, 13, { mono: true, track: 0.1, color: PLATE.dark.ink2, align: 'right' });
  plateText(ctx, `+${dat}`, right0, rowY + 34, 28, { mono: true, weight: 700, color: TEAL, align: 'right' });
  techArrow(ctx, left0 + 64, rowY + 22, right0 - 72, rowY + 22, conv > 0 ? TEAL : PLATE.dark.ink2);
  // Under it, the conversion as two bars at the same scale.
  const by = rowY + 62;
  const bw = B.w - 36;
  if (by + 30 < B.y + B.h) {
    ctx.fillStyle = PLATE.dark.rule;
    ctx.fillRect(left0, by, bw, 8);
    ctx.fillRect(left0, by + 18, bw, 8);
    ctx.fillStyle = '#5bc0eb';
    ctx.fillRect(left0, by, bw * (ess / 12), 8);
    ctx.fillStyle = TEAL;
    ctx.fillRect(left0, by + 18, bw * (dat / 12), 8);
  }
  panelFrame(ctx, B, 'b');
};

// ───────────────────────────── 9 · how to: the Árbol and the Mundos ─────────────────────────────

const ROUTES: readonly RouteId[] = ['time', 'dropper', 'dish', 'life', 'discovery', 'worlds', 'spark'];
const WORLD_CODES: readonly string[] = ['O2u', 'OG2g', 'S1s', 'O4d', 'H3s', '3GH2n', 'K4d'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const tree: Painter = (ctx, e) => {
  const { t, rm } = e;
  const wd = wide(e);
  const P = plate(ctx, e, 4, tr(e, 'Árbol y Mundos', 'Tree and Worlds'));
  const gap = 12;
  const A: Rect = wd ? { x: P.x, y: P.y, w: P.w * 0.64, h: P.h } : { x: P.x, y: P.y, w: P.w, h: P.h * 0.7 };
  const B: Rect = wd ? { x: P.x + A.w + gap, y: P.y, w: P.w - A.w - gap, h: P.h } : { x: P.x, y: P.y + A.h + gap, w: P.w, h: P.h - A.h - gap };
  const lt = rm ? 99 : t;
  // a · the research tree as a route diagram: the root, seven routes at 24° and three levels each.
  // The fan is as long as the panel allows (its outer routes reach 3 × step to each side) and centred in it.
  const step = wd ? 0.3 : 0.42;
  const len = Math.max(40, Math.min(A.h - 96, (A.w / 2 - 28) / Math.sin(3 * step)));
  const root = { x: A.x + A.w / 2, y: Math.min(A.y + A.h - 34, A.y + (A.h + len) / 2 + 16) };
  ROUTES.forEach((rid, i) => {
    const a = -Math.PI / 2 + (i - 3) * step;
    const col = ROUTE_COLOR.dark[rid];
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(root.x + Math.cos(a) * len, root.y + Math.sin(a) * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let n = 1; n <= 3; n++) {
      const k = [0, 0.42, 0.72, 1][n];
      const x = root.x + Math.cos(a) * len * k;
      const y = root.y + Math.sin(a) * len * k;
      const on = lt > 0.3 + (n - 1) * 0.9 + i * 0.1;
      ctx.fillStyle = on ? col : PLATE.dark.paper;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(x, y, n === 3 ? 6 : 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  });
  // Dimension: the angle between two routes and the levels along one (cotas).
  ctx.strokeStyle = PLATE.dark.ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(root.x, root.y, len * 0.24, -Math.PI / 2 - step, -Math.PI / 2);
  ctx.stroke();
  const am = -Math.PI / 2 - step / 2;
  plateText(ctx, `${Math.round((step * 180) / Math.PI)}°`, root.x + Math.cos(am) * len * 0.33, root.y + Math.sin(am) * len * 0.33 + 4, 13, { align: 'center', color: PLATE.dark.ink2 });
  ctx.fillStyle = PLATE.dark.ink;
  ctx.beginPath();
  ctx.arc(root.x, root.y, 7, 0, TAU);
  ctx.fill();
  plateText(ctx, tr(e, 'raíz', 'root'), root.x + 14, root.y + 18, 13, { color: PLATE.dark.ink2 });
  plateText(ctx, tr(e, '7 rutas · 3 niveles', '7 routes · 3 levels'), A.x + 30, A.y + 20, 14);
  panelFrame(ctx, A, 'a');
  // b · the seven Worlds: seven small dishes, each with its own real creature and hue.
  const n = WORLD_ART_IDS.length;
  WORLD_ART_IDS.forEach((id, i) => {
    let x: number;
    let y: number;
    let r: number;
    if (wd) {
      // Two staggered columns: I, III, V, VII on the left; II, IV, VI between them on the right.
      const col = i % 2;
      const row = Math.floor(i / 2);
      r = Math.min(B.w * 0.17, (B.h - 64) / 10.2);
      x = B.x + B.w * (col ? 0.7 : 0.3);
      y = B.y + 34 + r + row * (r * 2.7) + (col ? r * 1.35 : 0);
    } else {
      r = Math.min((B.w - 24) / (n * 2.5), B.h * 0.24);
      x = B.x + 12 + (B.w - 24) * ((i + 0.5) / n);
      y = B.y + B.h * 0.48;
    }
    const appear = rm ? 1 : smooth(1.4 + i * 0.16, 1.9 + i * 0.16, t);
    if (appear <= 0) return;
    ctx.save();
    ctx.globalAlpha = appear;
    dishTop(ctx, x, y, r, 0.5, (c) => {
      c.fillStyle = `hsla(${WORLD_HUE[id]}, 50%, 30%, 0.35)`;
      c.fillRect(x - r, y - r, r * 2, r * 2);
      creature(c, WORLD_CODES[i], x, y, r * 1.6, i + (rm ? 0 : t * 0.1), 1);
    }, 0);
    plateText(ctx, ROMAN[i], x, y + r + 18, 13, { mono: true, align: 'center', color: PLATE.dark.ink2 });
    ctx.restore();
  });
  panelFrame(ctx, B, 'b');
};

// ───────────────────────────── 10 · let's go ─────────────────────────────

const go: Painter = (ctx, e) => {
  const { w, h, t, rm } = e;
  const u = unit(e);
  const wd = wide(e);
  const r: Room = wd
    ? { win: { x: w * 0.06, y: h * 0.1, w: w * 0.3, h: h * 0.48 }, panes: 2, benchY: h * 0.64 }
    : { win: { x: w * 0.06, y: h * 0.13, w: w * 0.34, h: h * 0.38 }, panes: 1, benchY: h * 0.6 };
  const cork: Rect | null = wd ? { x: w * 0.44, y: h * 0.14, w: w * 0.2, h: h * 0.3 } : null;
  const img = photo('estacion-aurora-noaa');
  room(ctx, e, `go${wd ? 'w' : 'n'}`, r, (c) => {
    if (!cork) return;
    corkBoard(c, cork);
  });
  if (cork) {
    const pw = Math.min(cork.w * 0.62, cork.h * 0.68);
    drawAlborPolaroid(ctx, cork.x + cork.w * 0.5 - pw / 2, cork.y + cork.h * 0.5 - pw * 0.6, pw, t, rm, img, { lang: e.lang ?? 'es', tilt: 0.04 });
  }
  const mood: ArtMood = rm ? 'proud' : t < 1.2 ? 'happy' : 'proud';
  const v = velaSpot(wd ? w * 0.78 : w * 0.7, r.benchY + (h - r.benchY) * 0.42, wd ? Math.min(w * 0.3, h * 0.46) : w * 0.5);
  const dx = wd ? w * 0.42 : w * 0.3;
  const dy = r.benchY + (h - r.benchY) * 0.6;
  const drx = wd ? w * 0.14 : w * 0.22;
  const [cx0, cy0] = velaCableAt(v);
  probeCable(ctx, cx0, cy0, dx + drx * 0.95, dy + drx * 0.1, 5 * u, Math.max(2, 2.2 * u));
  dish3q(ctx, dx, dy, drx, 0.38, 1, (c, rr) => culture(c, rr, [{ code: 'O2u', x: -0.1, y: 0, size: trueSize('O2u') * 1.4, rot: rm ? 0.5 : 0.5 + t * 0.2, alpha: 1 }]), 1);
  velaOnBench(ctx, v, mood, rm ? 10 : t < 1.2 ? 10 : t - 1.2, t, rm, 1, [], { ...draw(e), label: mood === 'proud' ? READY : null });
  finish(ctx, e, 0.5);
};

export const SCENE_PAINTERS: Record<IntroSceneId, Painter> = { station, tape, arrive, candle, dish, sow, essence, clock, tree, go };

/** Paint one scene into a canvas context (CSS-pixel transform already applied). */
export function paintScene(ctx: CanvasRenderingContext2D, id: IntroSceneId, e: SceneEnv): void {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  SCENE_PAINTERS[id](ctx, e.rm ? { ...e, t: HERO_TIME[id] } : e);
  ctx.restore();
}

/** The photos the intro shows, to start loading them as it opens (each scene still draws without them). */
export const INTRO_PHOTOS: readonly PhotoId[] = ['estacion-aurora-noaa', 'cupula-aurora-nsf', 'placa-microscopio-nci', 'pipeta-guante-csiro'];
