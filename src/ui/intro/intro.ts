/**
 * The opening intro (docs/STORY.md §11): a skippable, ~35 s picture book shown once on the first
 * launch (after the title screen, before VELA's first scene t_intro) and replayable from Settings.
 *
 * Ten panels, each an animated Canvas 2D illustration (scenes.ts) above / beside one or two short
 * lines (src/story/introScript.ts, ≤ 12 words each, es + en). Every panel has "Siguiente" (the
 * primary action) and a "Saltar intro" link; the third panel lets the player pick their doctor.
 * Tapping the picture also advances. Keyboard: → / Enter / Space next, ← back, Esc skip.
 *
 * The illustrations are always night (the dish, GDD §14); the text card follows the theme (paper
 * in light, night in dark). Reduce motion: no loops, no slides; each picture shows its finished
 * state and the text appears at once.
 */
import './intro.css';
import type { Lang, Text } from '../../core/types';
import { INTRO_PANELS, INTRO_UI, type IntroLine, type IntroPanel } from '../../story/introScript';
import { drawDoctorBust, getPlayerLook, PLAYER_LOOK_IDS, PLAYER_LOOK_NAMES, playerSpec, setPlayerLook, type PlayerLookId } from '../art/characters';
import { Portrait } from '../art/portraits';
import { featherEdges } from '../art/vela';
import { paintScene } from './scenes';

export const INTRO_STORAGE_KEY = 'bioluma.intro';

/** The intro was watched or skipped on this device. */
export function introSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(INTRO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    globalThis.localStorage?.setItem(INTRO_STORAGE_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

export type IntroSound = 'next' | 'back' | 'pick' | 'done';

export interface IntroResult {
  /** Closed with "Saltar intro" / Esc before the last panel. */
  skipped: boolean;
  look: PlayerLookId;
  /** Index of the panel it closed on. */
  panel: number;
}

export interface IntroOptions {
  lang: () => Lang;
  reduceMotion: () => boolean;
  onDone?(r: IntroResult): void;
  onSound?(k: IntroSound): void;
  /** First panel (dev). */
  startAt?: number;
  /** Freeze every animation clock at t seconds (dev / screenshots). */
  freezeAt?: number | null;
  /** Don't write the "seen" mark (dev pages). */
  dryRun?: boolean;
}

export interface Intro {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  readonly index: number;
  goto(i: number): void;
  next(): void;
  back(): void;
  skip(): void;
  /** Re-render the text in the current language. */
  relabel(): void;
  dispose(): void;
}

const tr = (t: Text, l: Lang) => (l === 'en' ? t.en : t.es);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Mount the intro over `root` (fixed, z = cinematic). It removes itself when done. */
export function createIntro(root: HTMLElement, opts: IntroOptions): Intro {
  const L = () => opts.lang();
  const rm = () => opts.reduceMotion();
  const panels = INTRO_PANELS;
  let index = Math.max(0, Math.min(panels.length - 1, opts.startAt ?? 0));
  let open = true;
  let look: PlayerLookId = getPlayerLook();

  const overlay = el('div', 'bl-intro');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = -1;
  overlay.dataset.testid = 'intro';

  const art = el('div', 'bl-intro-art art-force-dark');
  const canvas = el('canvas', 'bl-intro-cv');
  canvas.setAttribute('aria-hidden', 'true');
  art.append(canvas);

  const top = el('div', 'bl-intro-top');
  const dots = el('div', 'bl-intro-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < panels.length; i++) dots.append(el('span'));
  const skipBtn = el('button', 'bl-intro-skip');
  skipBtn.type = 'button';
  skipBtn.dataset.testid = 'intro-skip';
  top.append(dots, skipBtn);

  const copy = el('div', 'bl-intro-copy');
  const kicker = el('p', 'bl-intro-kicker');
  const lines = el('div', 'bl-intro-lines');
  lines.setAttribute('aria-live', 'polite');
  const picker = el('div', 'bl-intro-picker');
  picker.setAttribute('role', 'radiogroup');
  const nav = el('div', 'bl-intro-nav');
  const backBtn = el('button', 'bl-intro-back');
  backBtn.type = 'button';
  backBtn.textContent = '‹';
  const nextBtn = el('button', 'bl-intro-next');
  nextBtn.type = 'button';
  nextBtn.dataset.testid = 'intro-next';
  nav.append(backBtn, nextBtn);
  copy.append(kicker, lines, picker, nav);
  overlay.append(art, copy, top);
  root.append(overlay);

  // ── look picker ──
  const lookBtns: { id: PlayerLookId; btn: HTMLButtonElement; cv: HTMLCanvasElement }[] = PLAYER_LOOK_IDS.map((id) => {
    const btn = el('button', 'bl-intro-look');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    const cv = el('canvas');
    cv.setAttribute('aria-hidden', 'true');
    btn.append(cv);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      look = id;
      setPlayerLook(id);
      opts.onSound?.('pick');
      syncPicker();
    });
    picker.append(btn);
    return { id, btn, cv };
  });
  function syncPicker(): void {
    for (const b of lookBtns) {
      b.btn.setAttribute('aria-checked', String(b.id === look));
      b.btn.classList.toggle('on', b.id === look);
      b.btn.setAttribute('aria-label', tr(PLAYER_LOOK_NAMES[b.id], L()));
      b.btn.title = tr(PLAYER_LOOK_NAMES[b.id], L());
    }
  }
  picker.setAttribute('aria-label', tr(INTRO_UI.pickLook, L()));

  // ── text ──
  let portraits: { p: Portrait; line: IntroLine }[] = [];
  let shownAt = 0;

  function renderPanel(p: IntroPanel): void {
    const l = L();
    kicker.textContent = p.kicker ? tr(p.kicker, l) : '';
    kicker.hidden = !p.kicker;
    lines.innerHTML = '';
    portraits = [];
    p.lines.forEach((line, i) => {
      const row = el('div', `bl-intro-ln ${line.who === 'narrator' ? 'narr' : `say who-${line.who}`}`);
      row.style.setProperty('--d', `${0.15 + i * 0.9}s`);
      if (line.who === 'narrator') {
        row.append(el('p', '', tr(line.text, l)));
      } else {
        const pt = new Portrait('bl-intro-face');
        pt.state.reduceMotion = rm();
        pt.set(line.who, line.mood ?? 'neutral', false);
        portraits.push({ p: pt, line });
        const body = el('div', 'bl-intro-say');
        body.append(el('b', '', tr(INTRO_UI.names[line.who], l)), el('p', '', tr(line.text, l)));
        row.append(pt.canvas, body);
      }
      lines.append(row);
    });
    picker.hidden = !p.picker;
    syncPicker();
    const last = index === panels.length - 1;
    nextBtn.textContent = last ? tr(INTRO_UI.start, l) : `${tr(INTRO_UI.next, l)}  ›`;
    nextBtn.classList.toggle('go', last);
    backBtn.hidden = index === 0;
    backBtn.setAttribute('aria-label', tr(INTRO_UI.back, l));
    skipBtn.textContent = `${tr(INTRO_UI.skipAll, l)} ›`;
    skipBtn.hidden = last;
    overlay.setAttribute('aria-label', `${tr(INTRO_UI.label, l)} · ${tr(INTRO_UI.panel(index + 1, panels.length), l)}`);
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('on', i === index);
      d.classList.toggle('past', i < index);
    });
    overlay.dataset.panel = p.id;
  }

  function show(i: number, dir: 1 | -1 = 1): void {
    index = Math.max(0, Math.min(panels.length - 1, i));
    shownAt = clock;
    overlay.classList.toggle('rm', rm());
    renderPanel(panels[index]);
    if (!rm()) {
      overlay.classList.remove('swap', 'swap-back');
      void overlay.offsetWidth;
      overlay.classList.add(dir === 1 ? 'swap' : 'swap-back');
    }
    // Keyboard focus moves with the panels; the first one focuses the dialog itself (no ring on Next).
    try {
      (shownOnce ? nextBtn : overlay).focus({ preventScroll: true });
    } catch {
      /* not focusable yet */
    }
    shownOnce = true;
  }
  let shownOnce = false;

  function finish(skipped: boolean): void {
    if (!open) return;
    open = false;
    if (!opts.dryRun) markIntroSeen();
    opts.onSound?.('done');
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.add('out');
    const r: IntroResult = { skipped, look, panel: index };
    setTimeout(() => overlay.remove(), rm() ? 0 : 260);
    opts.onDone?.(r);
  }

  const api: Intro = {
    el: overlay,
    get isOpen() {
      return open;
    },
    get index() {
      return index;
    },
    goto: (i) => show(i),
    next() {
      if (!open) return;
      if (index >= panels.length - 1) return finish(false);
      opts.onSound?.('next');
      show(index + 1, 1);
    },
    back() {
      if (!open || index === 0) return;
      opts.onSound?.('back');
      show(index - 1, -1);
    },
    skip: () => finish(true),
    relabel: () => renderPanel(panels[index]),
    dispose() {
      open = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
    },
  };

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    api.next();
  });
  backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    api.back();
  });
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    api.skip();
  });
  art.addEventListener('click', () => api.next());
  function onKey(e: KeyboardEvent): void {
    if (!open) return;
    const k = e.key;
    if (k === 'Escape') api.skip();
    else if (k === 'ArrowRight' || ((k === 'Enter' || k === ' ') && !(e.target instanceof HTMLButtonElement))) api.next();
    else if (k === 'ArrowLeft') api.back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);

  // ── animation loop ──
  const ctx = canvas.getContext('2d');
  let raf = 0;
  let clock = 0;
  let last = 0;
  let cw = 0;
  let ch = 0;
  let dpr = 1;
  function fit(): void {
    const r = art.getBoundingClientRect();
    const d = Math.min(2, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== cw || h !== ch || d !== dpr) {
      cw = w;
      ch = h;
      dpr = d;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
    }
  }
  function drawLooks(t: number): void {
    if (picker.hidden) return;
    for (const b of lookBtns) {
      const size = b.cv.clientWidth || 56;
      const d = dpr;
      if (b.cv.width !== Math.round(size * d)) {
        b.cv.width = Math.round(size * d);
        b.cv.height = Math.round(size * d);
      }
      const c = b.cv.getContext('2d');
      if (!c) continue;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, b.cv.width, b.cv.height);
      const k = (size * d) / 100;
      c.setTransform(k, 0, 0, k, 0, 0);
      c.translate(50, 50);
      c.scale(1.18, 1.18);
      c.translate(-50, -46);
      const on = b.id === look;
      drawDoctorBust(c, playerSpec(b.id), { mood: on ? 'happy' : 'neutral', moodAge: 10, talk: 0, talking: false, blink: 0, reduceMotion: rm(), gesture: 'rest' }, t);
      c.setTransform(k, 0, 0, k, 0, 0);
      featherEdges(c, 3);
    }
  }
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    const frozen = opts.freezeAt ?? null;
    const t = frozen ?? clock - shownAt;
    fit();
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      paintScene(ctx, panels[index].id, { w: cw, h: ch, t, rm: rm(), look });
    }
    const pt = frozen ?? clock;
    portraits.forEach(({ p }, i) => {
      // The speaker "talks" for a moment as their line appears.
      const start = 0.15 + i * 0.9;
      const lt = (frozen ?? clock - shownAt) - start;
      const talking = !rm() && lt > 0 && lt < 1.4;
      p.state.reduceMotion = rm();
      p.frame(pt, frozen !== null ? 0 : dt, talking ? 0.3 + 0.7 * Math.abs(Math.sin(pt * 12)) : 0, talking);
    });
    drawLooks(pt);
  }
  show(index);
  raf = requestAnimationFrame(frame);
  return api;
}

/**
 * A Settings row: "Ver la introducción" with a short hint. `onOpen` should call createIntro (and
 * close Settings first if it prefers). Returns a disposer.
 */
export function mountIntroEntry(container: HTMLElement, opts: { lang: () => Lang; onOpen: () => void }): { dispose(): void; relabel(): void } {
  const row = el('div', 'bl-intro-entry');
  const txt = el('div');
  const title = el('b');
  const hint = el('small');
  txt.append(title, hint);
  const btn = el('button', 'bl-intro-entry-btn');
  btn.type = 'button';
  btn.dataset.testid = 'intro-replay';
  btn.addEventListener('click', () => opts.onOpen());
  row.append(txt, btn);
  const relabel = () => {
    const l = opts.lang();
    title.textContent = tr(INTRO_UI.label, l);
    hint.textContent = tr(INTRO_UI.replayHint, l);
    btn.textContent = tr(INTRO_UI.replay, l);
  };
  relabel();
  container.append(row);
  return { dispose: () => row.remove(), relabel };
}
