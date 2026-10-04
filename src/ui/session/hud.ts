/**
 * Session HUD: the big, clear lab clock (docs/CICLO.md §2.2).
 *
 *  - A pill with a dial (ring = time used) and the minutes "2:41"; before the first seed it waits
 *    ("3:00 · Siembra para empezar").
 *  - Amber and pulsing in the last 30 s; the last 10 s bounce one by one (sound hook every second).
 *  - "¡Último minuto!" banner once, a gold "¡Sprint! ×2" chip during the sprint, a green "+5 s"
 *    chip whenever the clock is extended (new species, Encargo, Spark).
 *  - timesUp(): the "¡Tiempo!" stamp over the dish while it freezes, before the summary.
 *  - preview(): under the clock, "+12 Datos al terminar · Más tiempo: faltan 4" (prestige line:
 *    what this session is worth BEFORE it ends and the next node it reaches); a tap opens the Datos
 *    sum (summary.ts datosExplain in the shared price sheet).
 *
 * Pure DOM, no game imports beyond the session types: the host feeds `update()` from SessionState.
 */
import type { Lang, Text } from '../../core/types';
import * as C from '../../game/cycleBalance';
import type { SessionState } from '../../game/session';
import { SESSION_UI } from '../../game/treeText';
import { fmt, fmtClock } from '../format';
import { treeIcon } from '../tree/icons';
import '../art/art.css';
import './session.css';

export type SessionHudSound = 'tick' | 'warn' | 'lastMinute' | 'timesUp' | 'extend';

export interface SessionHudOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  onSound?(kind: SessionHudSound): void;
  /** Tap on the Datos preview (the host opens the shared price sheet with summary.datosExplain). */
  onPreview?(): void;
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
  /** Green "+5 s" under the clock. */
  extended(seconds: number, reason?: 'species' | 'encargo' | 'golden'): void;
  /** The "¡Último minuto!" banner over `over` (the dish container). */
  lastMinute(over: HTMLElement): void;
  /** The "¡Tiempo!" stamp over `over`; resolves after SESSION_TIMESUP_HOLD. */
  timesUp(over: HTMLElement): Promise<void>;
  /** "+12 Datos al terminar · Más tiempo: faltan 4" under the clock (null hides it). */
  preview(p: SessionPreviewView | null): void;
  dispose(): void;
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
  if (v.remaining <= C.SESSION_COUNTDOWN) return 'count';
  if (v.remaining <= C.SESSION_WARN_SECONDS) return 'warn';
  return 'run';
}

export function createSessionHud(container: HTMLElement, opts: SessionHudOptions): SessionHud {
  const rm = () => !!opts.reduceMotion?.();
  const R = 17;
  const CIRC = 2 * Math.PI * R;
  const wrap = document.createElement('div');
  wrap.className = 'ss-hudwrap ss-root';
  const el = document.createElement('div');
  el.className = 'ss-hud';
  el.setAttribute('role', 'timer');
  el.innerHTML = `<div class="ss-dial"><svg class="ring" viewBox="0 0 40 40" width="46" height="46"><circle class="bg" cx="20" cy="20" r="${R}"/><circle class="fg" cx="20" cy="20" r="${R}" stroke-dasharray="${CIRC.toFixed(
    2,
  )}" stroke-dashoffset="0"/></svg><span class="ic">${treeIcon('clockIcon', 20)}</span></div><div class="ss-time"><b>3:00</b><small></small></div><span class="ss-sprint"></span>`;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'ss-prev';
  prev.hidden = true;
  prev.innerHTML = `${treeIcon('datos', 18)}<span class="d"></span><span class="g"></span>`;
  prev.addEventListener('click', () => opts.onPreview?.());
  wrap.append(el, prev);
  container.appendChild(wrap);
  const prevD = prev.querySelector('.d') as HTMLElement;
  const prevG = prev.querySelector('.g') as HTMLElement;
  let prevKey = '';
  let prevDatos = -1;
  const fg = el.querySelector('.fg') as SVGCircleElement;
  const num = el.querySelector('.ss-time b') as HTMLElement;
  const sub = el.querySelector('.ss-time small') as HTMLElement;
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
        if (!rm()) {
          num.classList.remove('tick');
          void num.offsetWidth;
          num.classList.add('tick');
        }
      }
      lastSec = sec;
      const used = v.total > 0 ? 1 - v.remaining / v.total : 0;
      fg.style.strokeDashoffset = (CIRC * Math.min(1, Math.max(0, used))).toFixed(2);
      sub.textContent = st === 'wait' ? SESSION_UI.waiting[l] : SESSION_UI.session(v.n)[l];
      el.classList.toggle('sprint', !!v.sprint && st !== 'over');
      sprintEl.textContent = v.sprint ? `${SESSION_UI.sprint[l]} ×${String(Math.round(v.sprint * 10) / 10).replace('.', l === 'es' ? ',' : '.')}` : '';
      el.setAttribute('aria-label', `${SESSION_UI.session(v.n)[l]}: ${text}`);
    },
    extended(seconds, reason) {
      if (!(seconds > 0)) return;
      opts.onSound?.('extend');
      const l = opts.lang();
      const chip = document.createElement('span');
      chip.className = 'ss-plus';
      const why = reason === 'species' ? (l === 'es' ? 'especie' : 'species') : reason === 'encargo' ? (l === 'es' ? 'encargo' : 'request') : reason === 'golden' ? (l === 'es' ? 'destello' : 'spark') : '';
      chip.innerHTML = `${SESSION_UI.plusTime(Math.round(seconds))[l]}${why ? `<small>${why}</small>` : ''}`;
      el.appendChild(chip);
      setTimeout(() => chip.remove(), 1700);
    },
    lastMinute(over) {
      opts.onSound?.('lastMinute');
      const b = document.createElement('div');
      b.className = `ss-banner${rm() ? ' rm' : ''}`;
      b.textContent = SESSION_UI.lastMinute[opts.lang()];
      b.setAttribute('role', 'status');
      over.appendChild(b);
      setTimeout(() => b.remove(), rm() ? 1800 : 2300);
    },
    timesUp(over) {
      opts.onSound?.('timesUp');
      const s = document.createElement('div');
      s.className = `ss-stamp${rm() ? ' rm' : ''}`;
      s.textContent = SESSION_UI.timesUp[opts.lang()];
      s.setAttribute('role', 'status');
      over.appendChild(s);
      return new Promise((resolve) =>
        setTimeout(() => {
          s.remove();
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
      prevD.textContent = SESSION_UI.previewDatos(fmt(p.datos, l))[l];
      const g = p.goal;
      prevG.textContent = g ? (g.missing > 0 ? SESSION_UI.previewNext(g.name[l], fmt(g.missing, l))[l] : SESSION_UI.previewReady(g.name[l])[l]) : '';
      prevG.hidden = !g;
      prev.classList.toggle('ready', !!g && g.missing <= 0);
      if (prevDatos >= 0 && p.datos > prevDatos && !rm()) {
        prev.classList.remove('bump');
        void prev.offsetWidth;
        prev.classList.add('bump');
      }
      prevDatos = p.datos;
      prev.setAttribute('aria-label', `${prevD.textContent}${g ? ` · ${prevG.textContent}` : ''}`);
    },
    dispose() {
      wrap.remove();
    },
  };
  return api;
}
