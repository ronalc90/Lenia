/**
 * Title / splash screen (docs/ARTE-PULIDO.md B-13): a living Orbium breathing in the dark at 38 % of the
 * height, the "BIOLUMA" wordmark in Fraunces at 62 % with ONE sweep of light when it lands, and "Toca para
 * empezar" at 88 % with a ring that breathes. The version shows once, small, in a corner.
 *
 * Cheap at rest: the creature is drawn sharp once (cubic B-spline + bloom at the screen's resolution,
 * portrait.ts) and the nebula once; each frame only blits them and a few motes (no filter, no gradient,
 * no new colour strings per frame). The tap (or any key) dismisses it; the UI's first-gesture hook
 * unlocks audio with it.
 */
import type { Lang } from '../core/types';
import { catalogPattern } from '../sim/catalog';
import { h } from './dom';
import { t } from './i18n';
import { icon } from './icons';
import { portraitCanvas, portraitPx, PORTRAIT_HERO_MAX_PX } from './portrait';
import { VERSION_LABEL } from '../version';

export interface Splash {
  readonly el: HTMLElement;
  readonly visible: boolean;
  dismiss(): void;
  relabel(): void;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
  hue: number;
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
    h('div', { class: 'splash-center' }, word, tag),
    tap,
    credit,
    // The version, once, in a corner (B-13; Settings › About has it too).
    h('p', { class: 'splash-ver', 'data-testid': 'splash-version' }, VERSION_LABEL),
    controls.childElementCount ? controls : null,
  );
  const relabel = () => {
    tag.textContent = t('splashTagline');
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
  // Deterministic motes (no Math.random in drawing: the same title every time).
  const motes: Mote[] = Array.from({ length: 56 }, (_, i) => {
    const r = (k: number) => {
      const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return { x: r(1), y: r(2), r: 0.6 + r(3) * 1.5, vy: 0.004 + r(4) * 0.012, ph: r(5) * Math.PI * 2, hue: r(6) };
  });
  let w = 1;
  let hgt = 1;
  let dpr = 1;
  let sprite: HTMLCanvasElement | null = null;
  let nebula: HTMLCanvasElement | null = null;
  /** The creature's on-screen size (CSS px): 300 on a phone, a little more on a laptop. */
  const creatureCss = () => Math.round(Math.min(360, Math.max(220, Math.min(w, hgt) * 0.62)));
  const resize = () => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    hgt = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    // Drawn once per size: the creature (sharp, with bloom) and the nebula behind it.
    try {
      sprite = portraitCanvas(catalogPattern('O2u'), portraitPx(creatureCss(), dpr, PORTRAIT_HERO_MAX_PX), { theme: 'dark', fill: 0.9 });
    } catch {
      sprite = null;
    }
    const nb = Math.round(creatureCss() * 2.6 * dpr);
    nebula = document.createElement('canvas');
    nebula.width = nebula.height = Math.max(2, nb);
    const n = nebula.getContext('2d');
    if (n) {
      const g = n.createRadialGradient(nb / 2, nb / 2, 0, nb / 2, nb / 2, nb / 2);
      g.addColorStop(0, 'rgba(64,150,220,0.22)');
      g.addColorStop(0.45, 'rgba(70,40,160,0.12)');
      g.addColorStop(1, 'rgba(11,14,18,0)');
      n.fillStyle = g;
      n.fillRect(0, 0, nb, nb);
    }
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const cx = w / 2;
    // The creature sits at 38 % of the height (B-13), the wordmark at 62 %.
    const cy = hgt * 0.38;
    const size = creatureCss();
    const breathe = rm ? 1 : 1 + 0.04 * Math.sin(time * 1.3);
    if (nebula) {
      const ns = size * 2.6 * breathe;
      ctx.drawImage(nebula, cx - ns / 2, cy - ns / 2, ns, ns);
    }
    // Motes: two colours, opacity through globalAlpha (no colour string per mote and frame).
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? 'rgb(140,220,255)' : 'rgb(190,160,255)';
      for (const m of motes) {
        if ((m.hue < 0.7) !== (pass === 0)) continue;
        if (!rm) {
          m.y -= m.vy * dt;
          if (m.y < -0.02) m.y = 1.02;
        }
        ctx.globalAlpha = (pass === 0 ? 0.35 : 0.3) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + m.ph)));
        const x = m.x * w + (rm ? 0 : Math.sin(time * 0.6 + m.ph) * 8);
        ctx.fillRect(Math.round(x), Math.round(m.y * hgt), m.r * 1.6, m.r * 1.6);
      }
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
