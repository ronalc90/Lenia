/**
 * Session HUD: the big, clear lab clock (docs/CICLO.md §2.2).
 *
 *  - A pill with a STOPWATCH face (docs/ARTE-REALISTA.md §6.8): 60 hair ticks, 12 major ones, a needle that
 *    moves like an instrument's (second order, ζ 0,8, ωn 19: ~99 % in 300 ms, 1,5 % overshoot; reduce motion:
 *    it jumps) and points at the time used; in the last seconds it steps a whole second at a time (a detent).
 *    The minutes "2:41" beside it; before the first seed it waits ("3:00 · Siembra para empezar").
 *  - setPaused(true): "⏸ En pausa" while VELA talks or a sheet is open (ADR-030: the clock waits).
 *  - Amber in the last 30 s (colour and ring, no endless pulse); the last 10 s tick one by one, growing
 *    away from the dial (scale 1.12 from the left, B-7; sound hook every second).
 *  - "¡Último minuto!" banner once (slides down 300 ms, stays 1.6 s, leaves in 200 ms), a gold
 *    "¡Sprint! ×2" chip during the sprint, a green "+5 s" chip whenever the clock is extended (new
 *    species, Encargo, Spark): it rises into the clock in 450 ms and melts there.
 *  - timesUp(): the "¡Tiempo!" stamp over the dish while it freezes, before the summary: it lands with
 *    anticipation (1.6 → 0.94 → 1, fast spring, −8°) over a ripple.
 *  - preview(): under the clock, "+12 Datos al terminar · Más tiempo: faltan 4" (prestige line:
 *    what this session is worth BEFORE it ends and the next node it reaches); a tap opens the Datos
 *    sum (summary.ts datosExplain in the shared price sheet).
 *
 * Pure DOM, no game imports beyond the session types: the host feeds `update()` from SessionState.
 */
import type { Lang, Text } from '../../core/types';
import * as C from '../../game/cycleBalance';
import { countdownSeconds, warnSeconds, type SessionState } from '../../game/session';
import { SESSION_UI } from '../../game/treeText';
import { fmt, fmtClock } from '../format';
import { treeIcon } from '../tree/icons';
import { DURATION, EASING, SPRING, pop, springEasing } from '../art/motion';
import '../art/art.css';
import './session.css';

export type SessionHudSound = 'tick' | 'warn' | 'lastMinute' | 'timesUp' | 'extend';

/** How long «+3 s · especie nueva» stays docked on the clock before it melts into the digits, ms. */
const EXTEND_HOLD_MS = 2000;

export interface SessionHudOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  onSound?(kind: SessionHudSound): void;
  /** Tap on the Datos preview (the host opens the shared price sheet with summary.datosExplain). */
  onPreview?(): void;
  /** Where the Datos preview pill goes (default: under the clock). The game's dock passes its slot. */
  previewHost?: HTMLElement;
}

/** What the preview pill shows (session.ts sessionPreview + the goal's name). */
export interface SessionPreviewView {
  datos: number;
  goal: { name: Text; missing: number } | null;
}

export interface SessionHudView {
  phase: SessionState['phase'];
  /** Seconds left. */
  remaining: number;
  /** Seconds of the whole session (limit + bonus). */
  total: number;
  n: number;
  /** Production multiplier of the sprint while it runs (null = no sprint now). */
  sprint: number | null;
}

export interface SessionHud {
  readonly el: HTMLElement;
  update(v: SessionHudView): void;
  /** Green "+5 s" under the clock; `first`: the first time, in words ("¡Especie nueva: +5 segundos!"). */
  extended(seconds: number, reason?: 'species' | 'encargo' | 'golden', first?: boolean): void;
  /** The "¡Último minuto!" banner over `over` (the dish container). */
  lastMinute(over: HTMLElement): void;
  /** The "¡Tiempo!" stamp over `over`; resolves after SESSION_TIMESUP_HOLD. */
  timesUp(over: HTMLElement): Promise<void>;
  /** "+12 Datos al terminar · Más tiempo: faltan 4" under the clock (null hides it). */
  preview(p: SessionPreviewView | null): void;
  /**
   * (ADR-030, docs/CLARIDAD2.md §8.1) The clock waits for the player (VELA talking, a sheet open, the pause):
   * "⏸ En pausa" under the digits and a dimmed face. PC calls it.
   */
  setPaused?(on: boolean): void;
  dispose(): void;
}

/** The needle's dynamics (docs/ARTE-REALISTA.md §6.4): damping ratio and natural frequency, rad/s. */
export const NEEDLE = { zeta: 0.8, omega: 19 } as const;
/** Integration step of the needle, s (sub-steps keep it stable on a slow frame). */
const NEEDLE_H = 1 / 240;

/** Move the needle (angle x, speed v) towards `target` for dt seconds: x'' = ωn²(target − x) − 2ζωn·x'. */
export function stepNeedle(n: { x: number; v: number }, target: number, dt: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(0, dt) / NEEDLE_H));
  const h = Math.max(0, dt) / steps;
  const w2 = NEEDLE.omega * NEEDLE.omega;
  const c = 2 * NEEDLE.zeta * NEEDLE.omega;
  for (let i = 0; i < steps; i++) {
    n.v += (w2 * (target - n.x) - c * n.v) * h;
    n.x += n.v * h;
  }
}

/** Where the needle points, degrees from 12 o'clock: the share of the session used; whole seconds at the end. */
export function dialTarget(v: SessionHudView): number {
  if (v.phase === 'ready' || !(v.total > 0)) return 0;
  const left = hudState(v) === 'count' ? Math.ceil(v.remaining) : v.remaining;
  return Math.min(1, Math.max(0, 1 - left / v.total)) * 360;
}

/** The small line under the digits: "Sesión 3", or "⏸ En pausa" while the clock waits for the player. */
export function hudSub(v: SessionHudView, paused: boolean, l: Lang): string {
  return paused ? SESSION_UI.paused[l] : SESSION_UI.session(v.n)[l];
}

/** The stopwatch face in a 40-unit box: 60 hair ticks, 12 major ticks, the needle and its cap. */
function dialSvg(): string {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r0 = major ? 13.6 : 15.2;
    const x0 = 20 + Math.sin(a) * r0;
    const y0 = 20 - Math.cos(a) * r0;
    const x1 = 20 + Math.sin(a) * 16.6;
    const y1 = 20 - Math.cos(a) * 16.6;
    ticks += `<line class="${major ? 'mj' : 'mn'}" x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}"/>`;
  }
  return `<svg class="face" viewBox="0 0 40 40" width="46" height="46" aria-hidden="true"><circle class="bezel" cx="20" cy="20" r="18.6"/><circle class="dialbg" cx="20" cy="20" r="17.2"/>${ticks}<line class="needle" x1="20" y1="22.5" x2="20" y2="5.2"/><circle class="cap" cx="20" cy="20" r="1.7"/></svg>`;
}

/** Turn a SessionState into what the HUD shows. */
export function hudViewOf(s: SessionState, sprintMult: number): SessionHudView {
  const total = s.limit + s.bonus;
  return { phase: s.phase, remaining: Math.max(0, total - s.elapsed), total, n: s.n, sprint: sprintMult > 1 ? sprintMult : null };
}

/** Which look the clock has: waiting, running, amber warning, last-10 countdown, over. */
export function hudState(v: SessionHudView): 'wait' | 'run' | 'warn' | 'count' | 'over' {
  if (v.phase === 'ready') return 'wait';
  if (v.phase === 'over' || v.remaining <= 0) return 'over';
  // Proportional to the run (RITMO §3.4): a 15 s run is not amber from its first second.
  if (v.remaining <= countdownSeconds(v.total)) return 'count';
  if (v.remaining <= warnSeconds(v.total)) return 'warn';
  return 'run';
}

export function createSessionHud(container: HTMLElement, opts: SessionHudOptions): SessionHud {
  const rm = () => !!opts.reduceMotion?.();
  const wrap = document.createElement('div');
  wrap.className = 'ss-hudwrap ss-root';
  const el = document.createElement('div');
  el.className = 'ss-hud';
  el.setAttribute('role', 'timer');
  el.innerHTML = `<div class="ss-dial">${dialSvg()}</div><div class="ss-time"><b>3:00</b><small class="s"></small><small class="w"></small></div><span class="ss-sprint"></span>`;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'ss-prev';
  prev.hidden = true;
  prev.innerHTML = `${treeIcon('datos', 18)}<span class="d"></span><span class="g"></span>`;
  prev.addEventListener('click', () => opts.onPreview?.());
  wrap.append(el);
  if (opts.previewHost) {
    prev.classList.add('ss-root', 'docked');
    opts.previewHost.appendChild(prev);
  } else wrap.append(prev);
  container.appendChild(wrap);
  const prevD = prev.querySelector('.d') as HTMLElement;
  const prevG = prev.querySelector('.g') as HTMLElement;
  let prevKey = '';
  let prevDatos = -1;
  const needleEl = el.querySelector('.needle') as SVGLineElement;
  const needle = { x: 0, v: 0 };
  let needleTarget = 0;
  let needleAt = 0;
  let needleRaf = 0;
  let paused = false;
  let lastView: SessionHudView | null = null;
  /** Let the needle settle between updates (rAF only while it moves). */
  const settle = () => {
    cancelAnimationFrame(needleRaf);
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - needleAt) / 1000);
      needleAt = now;
      if (rm()) {
        needle.x = needleTarget;
        needle.v = 0;
      } else stepNeedle(needle, needleTarget, dt);
      needleEl.setAttribute('transform', `rotate(${needle.x.toFixed(2)} 20 20)`);
      const moving = Math.abs(needle.x - needleTarget) > 0.05 || Math.abs(needle.v) > 0.05;
      needleRaf = moving ? requestAnimationFrame(tick) : 0;
    };
    needleAt = performance.now();
    tick();
  };
  const num = el.querySelector('.ss-time b') as HTMLElement;
  const sub = el.querySelector('.ss-time small.s') as HTMLElement;
  const waitSub = el.querySelector('.ss-time small.w') as HTMLElement;
  const sprintEl = el.querySelector('.ss-sprint') as HTMLElement;
  let lastSec = -1;
  let lastState = '';
  let lastText = '';

  const api: SessionHud = {
    el,
    update(v) {
      const l = opts.lang();
      const st = hudState(v);
      if (st !== lastState) {
        el.dataset.state = st;
        if (st === 'warn' && lastState === 'run') opts.onSound?.('warn');
        lastState = st;
      }
      el.classList.toggle('rm', rm());
      const sec = Math.ceil(v.remaining);
      const text = fmtClock(v.remaining);
      if (text !== lastText) {
        num.textContent = text;
        lastText = text;
      }
      if (st === 'count' && sec !== lastSec && lastSec !== -1) {
        opts.onSound?.('tick');
        // One tick per second, from the left edge so the digits never cover the dial (no reflow: WAAPI).
        if (!rm() && typeof num.animate === 'function')
          num.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: DURATION.story, easing: EASING.standard });
      }
      lastSec = sec;
      lastView = v;
      const target = dialTarget(v);
      if (Math.abs(target - needleTarget) > 0.01) {
        needleTarget = target;
        if (!needleRaf) settle();
      }
      // "Sesión 3" always ("⏸ En pausa" while the clock waits); "Siembra para empezar" while waiting (CSS
      // shows one or the other: a narrow HUD keeps the short one).
      sub.textContent = hudSub(v, paused, l);
      waitSub.textContent = SESSION_UI.waiting[l];
      el.classList.toggle('sprint', !!v.sprint && st !== 'over');
      sprintEl.textContent = v.sprint ? `${SESSION_UI.sprint[l]} ×${String(Math.round(v.sprint * 10) / 10).replace('.', l === 'es' ? ',' : '.')}` : '';
      el.setAttribute('aria-label', `${SESSION_UI.session(v.n)[l]}: ${text}`);
    },
    extended(seconds, reason, first) {
      if (!(seconds > 0)) return;
      opts.onSound?.('extend');
      const l = opts.lang();
      const chip = document.createElement('span');
      chip.className = 'ss-plus';
      // «+3 s · especie nueva» (docs/CLARIDAD2.md §5.5): what gave the time, for 2 s; the needle goes back by itself.
      const why =
        reason === 'species' ? (l === 'es' ? 'especie nueva' : 'new species') : reason === 'encargo' ? (l === 'es' ? 'encargo' : 'request') : reason === 'golden' ? (l === 'es' ? 'Destello' : 'Spark') : '';
      // The first new species that lengthens the clock says so in words (CLARIDAD J-170).
      if (first && reason === 'species') {
        chip.classList.add('long');
        chip.textContent = SESSION_UI.newSpeciesTime(Math.round(seconds))[l];
      } else chip.innerHTML = `${SESSION_UI.plusTime(Math.round(seconds))[l]}${why ? `<small>· ${why}</small>` : ''}`;
      el.appendChild(chip);
      // The time travels INTO the clock (B-7): it rises 450 ms `enter` from under the clock and docks on
      // the clock's own lower edge (its place: never over the Datos preview or VELA's task below), holds,
      // then melts up into the digits, which pop.
      const hold = first ? 2400 : EXTEND_HOLD_MS;
      if (rm() || typeof chip.animate !== 'function') {
        window.setTimeout(() => chip.remove(), hold + 600);
        return;
      }
      const docked = 'translate(-50%, calc(-50% - 4px)) scale(1)';
      chip.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 18px) scale(.9)' },
          { opacity: 1, transform: docked },
        ],
        { duration: 450, easing: EASING.enter, fill: 'both' },
      );
      window.setTimeout(() => {
        const out = chip.animate(
          [
            { opacity: 1, transform: docked },
            { opacity: 0, transform: 'translate(-50%, -160%) scale(.7)' },
          ],
          { duration: DURATION.card, easing: EASING.exit, fill: 'forwards' },
        );
        out.onfinish = () => chip.remove();
        pop(num, 1.1);
      }, 450 + hold);
    },
    lastMinute(over) {
      opts.onSound?.('lastMinute');
      const b = document.createElement('div');
      b.className = 'ss-banner';
      b.textContent = SESSION_UI.lastMinute[opts.lang()];
      b.setAttribute('role', 'status');
      over.appendChild(b);
      // In from the top 300 ms `enter`, 1.6 s on screen, out 200 ms `exit`; no loops (B-7).
      const reduce = rm() || typeof b.animate !== 'function';
      const inMs = reduce ? 80 : DURATION.sheet;
      const outMs = reduce ? 80 : DURATION.sheetOut;
      if (typeof b.animate === 'function')
        b.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate(-50%, -160%)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], {
          duration: inMs,
          easing: EASING.enter,
          fill: 'both',
        });
      window.setTimeout(() => {
        if (typeof b.animate !== 'function') return b.remove();
        const a = b.animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -120%)' }], {
          duration: outMs,
          easing: EASING.exit,
          fill: 'forwards',
        });
        a.onfinish = () => b.remove();
      }, inMs + 1600);
    },
    timesUp(over) {
      opts.onSound?.('timesUp');
      const s = document.createElement('div');
      s.className = 'ss-stamp';
      s.textContent = SESSION_UI.timesUp[opts.lang()];
      s.setAttribute('role', 'status');
      const ripple = document.createElement('div');
      ripple.className = 'ss-stamp-ripple';
      over.append(ripple, s);
      if (typeof s.animate === 'function') {
        if (rm()) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, fill: 'both' });
        else {
          // Anticipation (M9): it comes in big and tilted, overshoots a little under, settles.
          s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: EASING.standard, fill: 'both' });
          s.animate(
            [
              { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1.6)' },
              { transform: 'translate(-50%, -50%) rotate(-8deg) scale(.94)', offset: 0.55 },
              { transform: 'translate(-50%, -50%) rotate(-8deg) scale(1)' },
            ],
            { duration: SPRING.fast.ms, easing: springEasing('fast'), fill: 'both' },
          );
          ripple.animate(
            [
              { opacity: 0.55, transform: 'translate(-50%, -50%) scale(0)' },
              { opacity: 0, transform: 'translate(-50%, -50%) scale(1)' },
            ],
            { duration: DURATION.celebrate, delay: 120, easing: EASING.enter, fill: 'both' },
          );
        }
      }
      return new Promise((resolve) =>
        setTimeout(() => {
          s.remove();
          ripple.remove();
          resolve();
        }, C.SESSION_TIMESUP_HOLD * 1000),
      );
    },
    preview(p) {
      if (!p) {
        prev.hidden = true;
        prevKey = '';
        return;
      }
      const l = opts.lang();
      const key = `${p.datos}|${p.goal?.name[l] ?? ''}|${p.goal?.missing ?? ''}|${l}`;
      if (key === prevKey) return;
      prevKey = key;
      prev.hidden = false;
      // In the dock: "+12 Datos" over "al terminar" (narrow cell); under the clock: one line.
      if (opts.previewHost) prevD.innerHTML = `<b>${SESSION_UI.previewShort(fmt(p.datos, l))[l]}</b><small>${SESSION_UI.previewEnd[l]}</small>`;
      else prevD.textContent = SESSION_UI.previewDatos(fmt(p.datos, l))[l];
      const g = p.goal;
      prevG.textContent = g ? (g.missing > 0 ? SESSION_UI.previewNext(g.name[l], fmt(g.missing, l))[l] : SESSION_UI.previewReady(g.name[l])[l]) : '';
      prevG.hidden = !g;
      prev.classList.toggle('ready', !!g && g.missing <= 0);
      if (prevDatos >= 0 && p.datos > prevDatos && !rm()) pop(prev, 1.06);
      prevDatos = p.datos;
      prev.setAttribute('aria-label', `${SESSION_UI.previewDatos(fmt(p.datos, l))[l]}${g ? ` · ${prevG.textContent}` : ''}`);
    },
    setPaused(on) {
      if (on === paused) return;
      paused = on;
      el.classList.toggle('paused', on);
      if (lastView) sub.textContent = hudSub(lastView, on, opts.lang());
    },
    dispose() {
      cancelAnimationFrame(needleRaf);
      wrap.remove();
      prev.remove();
    },
  };
  return api;
}
