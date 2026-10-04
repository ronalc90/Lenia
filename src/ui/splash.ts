/**
 * Title / splash screen: a living Orbium breathing in the dark, drifting motes,
 * the "BIOLUMA" wordmark with a moving glow and "Toca para empezar". The tap
 * (or any key) dismisses it; the UI's first-gesture hook unlocks audio with it.
 */
import { catalogPattern } from '../sim/catalog';
import { h } from './dom';
import { t } from './i18n';
import { renderPattern } from './portrait';

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

export function createSplash(root: HTMLElement, opts: { reduceMotion: () => boolean; onDone: () => void }): Splash {
  const canvas = h('canvas', { class: 'splash-cv', 'aria-hidden': 'true' });
  const word = h('h1', { class: 'splash-word', 'aria-label': 'Bioluma' });
  'BIOLUMA'.split('').forEach((ch, i) => {
    const s = h('span', { class: 'sl', 'aria-hidden': 'true' }, ch);
    s.style.animationDelay = `${0.35 + i * 0.07}s, ${i * 0.18}s`;
    word.appendChild(s);
  });
  const tag = h('p', { class: 'splash-tag' });
  const tap = h('div', { class: 'splash-tap' }, h('span', { class: 'splash-tap-ring' }), h('span', { class: 'splash-tap-t' }));
  const credit = h('div', { class: 'splash-credit' });
  const el = h(
    'div',
    { class: 'splash', role: 'button', tabindex: '0', 'aria-label': 'Bioluma', 'data-testid': 'splash' },
    canvas,
    h('div', { class: 'splash-center' }, word, tag),
    tap,
    credit,
  );
  const relabel = () => {
    tag.textContent = t('splashTagline');
    (tap.lastChild as HTMLElement).textContent = t('splashTap');
    credit.textContent = t('splashCredit');
  };
  relabel();
  root.appendChild(el);

  // ───────────── living background ─────────────
  const ctx = canvas.getContext('2d');
  const sprite = renderPattern(catalogPattern('O2u'), 256, 0.9);
  const motes: Mote[] = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.6,
    vy: 0.004 + Math.random() * 0.012,
    ph: Math.random() * Math.PI * 2,
    hue: Math.random(),
  }));
  let w = 1;
  let hgt = 1;
  let dpr = 1;
  const resize = () => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    hgt = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
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
    const cy = hgt * 0.36;
    const base = Math.min(w, hgt) * 0.42;
    // Nebula glow behind the creature.
    const breathe = rm ? 1 : 1 + 0.05 * Math.sin(time * 1.3);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 1.25 * breathe);
    g.addColorStop(0, 'rgba(64,150,220,0.20)');
    g.addColorStop(0.45, 'rgba(70,40,160,0.12)');
    g.addColorStop(1, 'rgba(11,14,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
    // Motes.
    for (const m of motes) {
      if (!rm) {
        m.y -= m.vy * dt;
        if (m.y < -0.02) {
          m.y = 1.02;
          m.x = Math.random();
        }
      }
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + m.ph));
      const x = m.x * w + (rm ? 0 : Math.sin(time * 0.6 + m.ph) * 8);
      const y = m.y * hgt;
      ctx.fillStyle = m.hue < 0.7 ? `rgba(140,220,255,${0.35 * tw})` : `rgba(190,160,255,${0.3 * tw})`;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // The creature: slow swim-in-place rotation, breathing scale, additive glow.
    const size = base * breathe;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rm ? -0.5 : -0.5 + Math.sin(time * 0.25) * 0.25);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.filter = 'blur(14px)';
    ctx.drawImage(sprite, -size * 0.6, -size * 0.6, size * 1.2, size * 1.2);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
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
