/**
 * The night moves on (QA4 F-12): the "prestige" of the sessions cycle used to pass as a changed label.
 * A short celebration over the Tree: the sky darkens, a new moon rises with its number, stars light up
 * one by one and VELA (with her candle) says what it means. ~3 s, or one tap. Reduce motion: the same
 * picture, still, with a fade.
 */
import type { Lang, Text } from '../../core/types';
import { NIGHT_CELEBRATION_MS } from '../../game/cycleBalance';
import { drawVelaArt } from '../art/vela';

export interface NightCelebrationOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  onSound?(kind: 'night' | 'close'): void;
}


const T = {
  title: (n: number): Text => ({ es: `Noche ${n}`, en: `Night ${n}` }),
  line: { es: '¡La noche avanza! Nada se borra: se abren mejoras nuevas y ganas más Datos.', en: 'The night moves on! Nothing is wiped: new upgrades open and you earn more Data.' } as Text,
  tap: { es: 'Toca para seguir', en: 'Tap to go on' } as Text,
};

/** Stars of the sky, deterministic (x, y in 0..1, delay in 0..1). */
const STARS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: a - Math.floor(a), y: (b - Math.floor(b)) * 0.62, d: (i * 0.137) % 1 };
});

/** Show the celebration; resolves when it is gone. */
export function celebrateNight(root: HTMLElement, night: number, o: NightCelebrationOptions): Promise<void> {
  const rm = o.reduceMotion?.() ?? false;
  const l = o.lang();
  const el = document.createElement('div');
  el.className = 'ss-night art-force-dark';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('data-testid', 'night-celebration');
  const cv = document.createElement('canvas');
  cv.className = 'ss-night-sky';
  const box = document.createElement('div');
  box.className = 'ss-night-text';
  const h = document.createElement('h2');
  h.textContent = T.title(night)[l];
  const p = document.createElement('p');
  p.textContent = T.line[l];
  const tap = document.createElement('small');
  tap.textContent = T.tap[l];
  box.append(h, p, tap);
  el.append(cv, box);
  root.appendChild(el);
  o.onSound?.('night');
  const ctx = cv.getContext('2d');
  const t0 = performance.now();
  let raf = 0;
  let done = false;

  const draw = (now: number) => {
    raf = 0;
    if (done || !ctx) return;
    const t = rm ? 3 : (now - t0) / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050913');
    g.addColorStop(1, '#141d33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Stars light up one by one.
    for (const s of STARS) {
      const k = Math.min(1, Math.max(0, (t - 0.2 - s.d * 1.2) / 0.4));
      if (k <= 0) continue;
      const tw = rm ? 1 : 0.75 + 0.25 * Math.sin(t * 3 + s.d * 20);
      ctx.fillStyle = `rgba(230,240,255,${(0.8 * k * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, 1.2 + s.d * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The new moon rises.
    const rise = Math.min(1, t / 1.2);
    const ease = 1 - Math.pow(1 - rise, 3);
    const mx = W * 0.5;
    const my = H * 0.3 + (1 - ease) * H * 0.25;
    const mr = Math.min(W, H) * 0.11;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(255,214,140,0.35)');
    halo.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffe6b0';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1020';
    ctx.beginPath();
    ctx.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.92, 0, Math.PI * 2);
    ctx.fill();
    // VELA, proud, under the moon.
    const vs = Math.min(W, H) / 260;
    ctx.save();
    ctx.translate(W * 0.5 - 50 * vs, H * 0.68 - 60 * vs);
    ctx.scale(vs, vs);
    drawVelaArt(ctx, { mood: 'proud', moodAge: t, talk: 0, talking: false, blink: 0, reduceMotion: rm }, t);
    ctx.restore();
    if (!rm) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  requestAnimationFrame(() => el.classList.add('show'));

  return new Promise((resolve) => {
    const finish = () => {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      o.onSound?.('close');
      el.classList.remove('show');
      window.setTimeout(() => {
        el.remove();
        resolve();
      }, rm ? 0 : 250);
    };
    const timer = window.setTimeout(finish, NIGHT_CELEBRATION_MS);
    el.addEventListener('click', finish);
  });
}
