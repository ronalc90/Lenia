/**
 * Title / splash screen (docs/ARTE-PULIDO.md B-13, docs/ARTE-REALISTA.md §6.7): a living Orbium breathing
 * in the dark at 38 % of the height, framed as plate 0 of a scientific atlas: registration marks in the
 * corners, a hairline reticle at 4 %, a 5-mm scale bar and *Orbium unicaudatus* in Fraunces italic under
 * the creature, and the instrument label «ESTACIÓN VIGILIA · TURNO DE NOCHE» on top. The "BIOLUMA"
 * wordmark in Fraunces at 62 % keeps its ONE sweep of light; "Toca para empezar" at 88 %. The archive
 * photo's snowy horizon fills the lower 20 %, 70 % darker (nothing without it), and a few dust motes
 * drift in the window's beam: no fantasy particles. The version shows once, small, in a corner.
 *
 * Cheap at rest: the creature is drawn sharp once (cubic B-spline + bloom at the screen's resolution,
 * portrait.ts), the plate (reticle, marks, horizon, beam) once per size; each frame only blits them, a
 * few motes and the scale bar (no filter, no new gradient per frame). The tap (or any key) dismisses it;
 * the UI's first-gesture hook unlocks audio with it.
 */
import './splash.css';
import type { Lang } from '../core/types';
import { catalogByCode, catalogPattern } from '../sim/catalog';
import { PHOTOS, peekPhoto } from './art/photos';
import { PLATE, PLATE_MM_PER_CELL } from './art/tokens';
import { h } from './dom';
import { t } from './i18n';
import { icon } from './icons';
import { portraitCanvas, portraitPx, PORTRAIT_HERO_MAX_PX } from './portrait';
import { VERSION_LABEL } from '../version';
import { coverCrop, grade } from './intro/photofx';

/** Pattern cells of the creature's visible extent (the same 0.04 threshold as portrait.ts bounds). */
function patternSpan(p: { w: number; h: number; data: Float32Array }): number {
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.data[y * p.w + x] > 0.04) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? Math.max(p.w, p.h) : Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

/** The creature fills 90 % of its sprite (portraitCanvas `fill`), so its scale bar can be measured. */
const SPRITE_FILL = 0.9;
/** The scale bar's length (§6.7: «5 mm» under the creature; 1 cell = 0.7 mm, §6.5 rule 4). */
const BAR_MM = 5;

export interface Splash {
  readonly el: HTMLElement;
  readonly visible: boolean;
  dismiss(): void;
  relabel(): void;
}

interface Mote {
  /** Position along the beam (0..1) and across it (−1..1). */
  a: number;
  b: number;
  r: number;
  v: number;
  ph: number;
}

export interface SplashOptions {
  reduceMotion: () => boolean;
  onDone: () => void;
  /** Optional language and sound controls on the title screen (QA2 H-21). */
  lang?: () => Lang;
  setLang?: (l: Lang) => void;
  muted?: () => boolean;
  toggleMute?: () => void;
}

export function createSplash(root: HTMLElement, opts: SplashOptions): Splash {
  const canvas = h('canvas', { class: 'splash-cv', 'aria-hidden': 'true' });
  // The wordmark in Fraunces; one sweep of light crosses it when it lands (a mask, transform only).
  const word = h('h1', { class: 'splash-word', 'aria-label': 'Bioluma' }, h('span', { class: 'sw-t', 'aria-hidden': 'true' }, 'BIOLUMA'), h('span', { class: 'sw-sweep', 'aria-hidden': 'true' }));
  const tag = h('p', { class: 'splash-tag' });
  const tap = h('div', { class: 'splash-tap' }, h('span', { class: 'splash-tap-ring' }), h('span', { class: 'splash-tap-t' }));
  // The instrument label of plate 0 (Mono, upper case, tracked).
  const plateLabel = h('p', { class: 'splash-plate', 'aria-hidden': 'true' });
  const credit = h('div', { class: 'splash-credit' });
  // Language and sound before the game starts: these taps never dismiss the title.
  const controls = h('div', { class: 'splash-ctl' });
  const langBtns: { l: Lang; b: HTMLButtonElement }[] = [];
  let soundBtn: HTMLButtonElement | null = null;
  if (opts.setLang && opts.lang) {
    const seg = h('div', { class: 'splash-lang', role: 'group' });
    for (const l of ['es', 'en'] as Lang[]) {
      const b = h('button', { type: 'button', text: l.toUpperCase(), 'data-testid': `splash-lang-${l}` });
      b.addEventListener('click', () => {
        opts.setLang?.(l);
        relabel();
      });
      langBtns.push({ l, b });
      seg.appendChild(b);
    }
    controls.appendChild(seg);
  }
  if (opts.toggleMute && opts.muted) {
    soundBtn = h('button', { type: 'button', class: 'splash-sound', 'data-testid': 'splash-sound' });
    soundBtn.addEventListener('click', () => {
      opts.toggleMute?.();
      relabel();
    });
    controls.appendChild(soundBtn);
  }
  controls.addEventListener('pointerdown', (e) => e.stopPropagation());
  controls.addEventListener('keydown', (e) => e.stopPropagation());
  const el = h(
    'div',
    { class: 'splash art-force-dark', role: 'button', tabindex: '0', 'aria-label': 'Bioluma', 'data-testid': 'splash' },
    canvas,
    plateLabel,
    h('div', { class: 'splash-center' }, word, tag),
    tap,
    credit,
    // The version, once, in a corner (B-13; Settings › About has it too).
    h('p', { class: 'splash-ver', 'data-testid': 'splash-version' }, VERSION_LABEL),
    controls.childElementCount ? controls : null,
  );
  const relabel = () => {
    tag.textContent = t('splashTagline');
    plateLabel.textContent = t('splashPlate');
    (tap.lastChild as HTMLElement).textContent = t('splashTap');
    credit.textContent = t('splashCredit');
    const cur = opts.lang?.();
    for (const { l, b } of langBtns) {
      b.classList.toggle('on', l === cur);
      b.setAttribute('aria-pressed', String(l === cur));
    }
    if (soundBtn) {
      const m = !!opts.muted?.();
      soundBtn.innerHTML = icon(m ? 'mute' : 'sound', 22);
      soundBtn.setAttribute('aria-label', m ? t('unmute') : t('mute'));
      soundBtn.classList.toggle('on', !m);
    }
  };
  relabel();
  root.appendChild(el);

  // ───────────── living background ─────────────
  const ctx = canvas.getContext('2d');
  // Dust in the window's beam, deterministic (no Math.random in drawing: the same title every time).
  const motes: Mote[] = Array.from({ length: 26 }, (_, i) => {
    const r = (k: number) => {
      const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return { a: r(1), b: r(2) * 2 - 1, r: 0.6 + r(3) * 0.9, v: 0.006 + r(4) * 0.01, ph: r(5) * Math.PI * 2 };
  });
  const species = catalogByCode('O2u');
  const latin = species?.name ?? 'Orbium unicaudatus';
  let span = 20;
  try {
    span = patternSpan(catalogPattern('O2u'));
  } catch {
    /* keep the default */
  }
  let w = 1;
  let hgt = 1;
  let dpr = 1;
  let sprite: HTMLCanvasElement | null = null;
  let nebula: HTMLCanvasElement | null = null;
  let plate: HTMLCanvasElement | null = null;
  let plateHasPhoto = false;
  /**
   * The creature's on-screen size (CSS px): ~240 on a phone, more on a tall screen, but never so big that
   * it and its scale-bar line reach the wordmark at 62 % (24 % of the height, minus the caption line and
   * half the wordmark, for its 0.45-size radius).
   */
  const creatureCss = () => Math.round(Math.max(160, Math.min(360, Math.max(220, Math.min(w, hgt) * 0.62), (hgt * 0.24 - 84) / 0.45)));
  /** The beam from the window at the top left, across the creature: origin, direction, half width. */
  const beam = () => ({ x0: -w * 0.1, y0: -hgt * 0.05, dx: w * 0.95, dy: hgt * 0.7, half: Math.min(w, hgt) * 0.16 });
  /** Plate 0, drawn once per size (and again when the photo arrives): reticle, marks, horizon, beam. */
  const buildPlate = () => {
    const img = peekPhoto('estacion-aurora-noaa');
    plateHasPhoto = !!img;
    plate = document.createElement('canvas');
    plate.width = Math.max(1, Math.round(w * dpr));
    plate.height = Math.max(1, Math.round(hgt * dpr));
    const p = plate.getContext('2d');
    if (!p) return;
    p.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The snowy horizon of the archive photo in the lower 20 %, 70 % darker, fading up into the night.
    if (img) {
      const P = PHOTOS['estacion-aurora-noaa'];
      const bandH = hgt * 0.2;
      const top = hgt - bandH;
      // The photo's horizon sits at ~79 % of its height: crop around it so it lands near the band's top.
      const c = coverCrop(P.w, P.h, w, bandH * 2.2, 0.32, 0.86, 1);
      p.save();
      p.beginPath();
      p.rect(0, top - bandH * 0.6, w, bandH * 1.6);
      p.clip();
      p.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, top - bandH * 1.2, w, bandH * 2.2);
      grade(p, 0, top - bandH * 0.6, w, bandH * 1.6, { desat: 0.3, tint: '#7f98b3', tintA: 0.5, dark: 0.7 });
      const fade = p.createLinearGradient(0, top - bandH * 0.6, 0, top + bandH * 0.25);
      fade.addColorStop(0, 'rgba(6,8,11,1)');
      fade.addColorStop(1, 'rgba(6,8,11,0)');
      p.fillStyle = fade;
      p.fillRect(0, top - bandH * 0.6, w, bandH * 0.86);
      p.restore();
    }
    // The window's beam: one soft band of cold light across the plate.
    const b = beam();
    const len = Math.hypot(b.dx, b.dy);
    p.save();
    p.translate(b.x0, b.y0);
    p.rotate(Math.atan2(b.dy, b.dx));
    const bg = p.createLinearGradient(0, -b.half, 0, b.half);
    bg.addColorStop(0, 'rgba(170,200,230,0)');
    bg.addColorStop(0.5, 'rgba(170,200,230,0.045)');
    bg.addColorStop(1, 'rgba(170,200,230,0)');
    p.fillStyle = bg;
    p.fillRect(0, -b.half, len * 1.3, b.half * 2);
    p.restore();
    // A hairline reticle at 4 % (one device pixel, on the pixel grid).
    const hair = 1 / dpr;
    const stepPx = 32;
    p.fillStyle = 'rgba(223,231,238,0.04)';
    for (let x = (w % stepPx) / 2; x < w; x += stepPx) p.fillRect(Math.round(x * dpr) / dpr, 0, hair, hgt);
    for (let y = (hgt % stepPx) / 2; y < hgt; y += stepPx) p.fillRect(0, Math.round(y * dpr) / dpr, w, hair);
    // Registration marks in the four corners (hair, 6 px).
    p.fillStyle = PLATE.dark.ink2;
    p.globalAlpha = 0.6;
    const m = 10;
    for (const [cx, cy, sx, sy] of [
      [m, m, 1, 1],
      [w - m, m, -1, 1],
      [m, hgt - m, 1, -1],
      [w - m, hgt - m, -1, -1],
    ] as const) {
      p.fillRect(cx - (sx < 0 ? 6 : 0), cy, 6, hair * sy);
      p.fillRect(cx, cy - (sy < 0 ? 6 : 0), hair * sx, 6);
    }
    p.globalAlpha = 1;
  };
  const resize = () => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    hgt = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    // Drawn once per size: the creature (sharp, with bloom), its glow and the plate.
    try {
      sprite = portraitCanvas(catalogPattern('O2u'), portraitPx(creatureCss(), dpr, PORTRAIT_HERO_MAX_PX), { theme: 'dark', fill: SPRITE_FILL });
    } catch {
      sprite = null;
    }
    const nb = Math.round(creatureCss() * 2.4 * dpr);
    nebula = document.createElement('canvas');
    nebula.width = nebula.height = Math.max(2, nb);
    const n = nebula.getContext('2d');
    if (n) {
      // The creature's own light on the dark (the dish's cyan bounce), not a coloured nebula.
      const g = n.createRadialGradient(nb / 2, nb / 2, 0, nb / 2, nb / 2, nb / 2);
      g.addColorStop(0, 'rgba(91,192,235,0.16)');
      g.addColorStop(0.5, 'rgba(91,192,235,0.05)');
      g.addColorStop(1, 'rgba(91,192,235,0)');
      n.fillStyle = g;
      n.fillRect(0, 0, nb, nb);
    }
    buildPlate();
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(el);
  let raf = 0;
  let t0 = performance.now();
  let last = t0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (!ctx) return;
    const time = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const rm = opts.reduceMotion();
    // The archive photo arrives late (or never): the plate is redrawn once when it does.
    if (!plateHasPhoto && peekPhoto('estacion-aurora-noaa')) buildPlate();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    if (plate) ctx.drawImage(plate, 0, 0, w, hgt);
    const cx = w / 2;
    // The creature sits at 38 % of the height (B-13), the wordmark at 62 %.
    const cy = hgt * 0.38;
    const size = creatureCss();
    const breathe = rm ? 1 : 1 + 0.04 * Math.sin(time * 1.3);
    if (nebula) {
      const ns = size * 2.4 * breathe;
      ctx.drawImage(nebula, cx - ns / 2, cy - ns / 2, ns, ns);
    }
    // Dust in the beam: visible only inside it, brighter on its axis; still under Reduce motion.
    const b = beam();
    const bl = Math.hypot(b.dx, b.dy);
    const ux = b.dx / bl;
    const uy = b.dy / bl;
    ctx.fillStyle = 'rgb(220,232,244)';
    for (const m of motes) {
      if (!rm) {
        m.a += m.v * dt * 0.4;
        if (m.a > 1.05) m.a = -0.05;
      }
      const drift = rm ? 0 : Math.sin(time * 0.4 + m.ph) * 0.12;
      const across = m.b + drift;
      const x = b.x0 + ux * bl * m.a - uy * b.half * across;
      const y = b.y0 + uy * bl * m.a + ux * b.half * across;
      ctx.globalAlpha = 0.5 * Math.max(0, 1 - Math.abs(across)) * (0.6 + 0.4 * Math.sin(time * 1.1 + m.ph));
      ctx.fillRect(Math.round(x), Math.round(y), m.r * 1.4, m.r * 1.4);
    }
    ctx.globalAlpha = 1;
    // The creature: a slow swim in place and a breath; its glow is baked into the sprite.
    if (sprite) {
      const s2 = size * breathe;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rm ? -0.5 : -0.5 + Math.sin(time * 0.25) * 0.25);
      ctx.drawImage(sprite, -s2 / 2, -s2 / 2, s2, s2);
      ctx.restore();
    }
    // The scale bar and the species under the creature, on one line like a figure's caption.
    const barPx = (BAR_MM / PLATE_MM_PER_CELL) * ((size * SPRITE_FILL) / span);
    const by = Math.round(cy + size * 0.47) + 0.5;
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    const barLabel = `${BAR_MM} mm`;
    const lw = ctx.measureText(barLabel).width;
    ctx.font = "italic 500 16px Fraunces, Georgia, serif";
    const nw = ctx.measureText(latin).width;
    const total = barPx + 8 + lw + 20 + nw;
    let x = Math.round(cx - total / 2);
    ctx.fillStyle = PLATE.dark.ink;
    ctx.fillRect(x, by - 3, barPx, 3);
    ctx.fillRect(x, by - 7, 1, 7);
    ctx.fillRect(x + barPx - 1, by - 7, 1, 7);
    x += barPx + 8;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.fillStyle = PLATE.dark.ink2;
    ctx.fillText(barLabel, x, by);
    x += lw + 20;
    ctx.font = "italic 500 16px Fraunces, Georgia, serif";
    ctx.fillStyle = PLATE.dark.ink;
    ctx.fillText(latin, x, by + 1);
  };
  raf = requestAnimationFrame(draw);

  let visible = true;
  const dismiss = () => {
    if (!visible) return;
    visible = false;
    el.classList.add('out');
    const done = () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      el.remove();
    };
    setTimeout(done, opts.reduceMotion() ? 50 : 650);
    opts.onDone();
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dismiss();
  });
  el.addEventListener('keydown', () => dismiss());
  requestAnimationFrame(() => el.focus({ preventScroll: true }));
  t0 = performance.now();

  return {
    el,
    get visible() {
      return visible;
    },
    dismiss,
    relabel,
  };
}
