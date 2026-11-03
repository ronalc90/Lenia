/**
 * Motion (docs/ARTE.md §7, docs/ARTE-PULIDO.md B-2…B-6): one vocabulary of durations, easings and
 * springs, and the gestures every screen shares. All helpers honour Reduce motion (the game setting or
 * the OS): movement becomes a short fade, nothing loops, and the end state is always applied.
 *
 *   press        90 ms   scale .96 (buttons, nodes) / .98 (cards, wide rows) on pointer-down, a light
 *                        veil at 8 %; back with the fast spring (400 ms) on release
 *   pop         400 ms   fast spring overshoot for a value that just changed (counter, badge, level)
 *   buy         700 ms   pop + ring burst in the route colour + the number counting
 *   sheet   300 / 200 ms bottom sheets / side panels slide in with `enter`, out with `exit`
 *
 * Only `transform`, `scale` and `opacity` are animated (web.dev "High-performance CSS animations"); one
 * delegated listener serves every pressable element (installPressFeedback).
 *
 * Never moves: the HUD frame, the tab bar, the dish frame, numbers' widths (tabular-nums), text
 * that is being read. Only loops: creature halos, the "new" dot, VELA's idle, the Spark.
 */
import { DURATION, EASING, SPRING, STAGGER } from './tokens';

export { DURATION, EASING, SPRING, STAGGER };

/** cubic-bezier → JS easing function (for canvas animations). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    t = Math.min(1, Math.max(0, t));
    return sy(t);
  };
}

/** The CSS `linear(p0, p1, …)` easing as a JS function (evenly spaced points, linear in between). */
export function linearEasing(points: readonly number[]): (t: number) => number {
  const n = points.length - 1;
  return (t: number) => {
    if (t <= 0) return points[0];
    if (t >= 1) return points[n];
    const x = t * n;
    const i = Math.floor(x);
    return points[i] + (points[i + 1] - points[i]) * (x - i);
  };
}

export const ease = {
  standard: bezier(0.2, 0, 0, 1),
  enter: bezier(0.05, 0.7, 0.1, 1),
  exit: bezier(0.3, 0, 0.8, 0.15),
  pop: bezier(0.34, 1.56, 0.64, 1),
  /** easeOutCubic: counters that settle (the summary's Datos, the Tree's Datos). */
  outCubic: (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3),
  /** The three springs, as the same curves CSS uses (for canvas and WAAPI). */
  springFast: linearEasing(SPRING.fast.points),
  springDefault: linearEasing(SPRING.default.points),
  springSlow: linearEasing(SPRING.slow.points),
} as const;

let forced: boolean | null = null;
/** The game's own Reduce motion setting (overrides the OS when set). */
export function setReduceMotion(on: boolean | null): void {
  forced = on;
}
export function reduceMotion(): boolean {
  if (forced !== null) return forced;
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** WAAPI easing string of a spring, with the bezier fallback where `linear()` is not supported. */
let linearOk: boolean | null = null;
export function springEasing(kind: keyof typeof SPRING): string {
  if (linearOk === null) {
    try {
      linearOk = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)');
    } catch {
      linearOk = false;
    }
  }
  return linearOk ? SPRING[kind].css : SPRING[kind].fallback;
}

function canAnimate(el: Element): el is HTMLElement {
  return typeof (el as HTMLElement).animate === 'function';
}

// ───────────── press: one delegated gesture (B-4) ─────────────

/** What presses: every button, node and card. `data-press="off"` opts out (e.g. a drag surface). */
export const PRESS_SELECTOR = 'button, [role=button], summary, label.switch, a.btn';
/** Cards and wide rows press less (.98): a big surface that sinks 4 % feels like a jump. */
const PRESS_WIDE_SELECTOR = '.ss-world, button.sp, .bst-card, .rt-pricebox, [data-press="card"]';
const PRESS_WIDE_PX = 200;
/** A finger that slides farther than this is scrolling or dragging: the press lets go. */
export const PRESS_CANCEL_PX = 10;

/** Press depth for an element of this width (pure: tested). */
export function pressScale(width: number, card: boolean): number {
  return card || width > PRESS_WIDE_PX ? 0.98 : 0.96;
}

/** Whether an element takes the press gesture (disabled controls do not move: they are not buttons now). */
export function canPress(el: Element | null): el is HTMLElement {
  if (!el || !(el as HTMLElement).isConnected) return false;
  const h = el as HTMLElement & { disabled?: boolean };
  if (h.disabled || h.getAttribute('aria-disabled') === 'true' || h.dataset?.press === 'off') return false;
  return true;
}

interface Pressing {
  el: HTMLElement;
  scale: number;
  x: number;
  y: number;
  id: number;
  anim: Animation | null;
}

let veil: HTMLElement | null = null;
let veilAnim: Animation | null = null;

/**
 * One veil element for every press (a light layer over the pressed control, opacity 0 → 8 % white in
 * the dark / 6 % black in the light): no ::after per button, no paint per frame.
 */
function showVeil(el: HTMLElement, scale: number, rm: boolean): void {
  if (typeof document === 'undefined') return;
  if (!veil) {
    veil = document.createElement('div');
    veil.className = 'bl-press-veil';
    veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(veil);
  } else if (!veil.isConnected) document.body.appendChild(veil);
  // Read first (one rect, one style), then write (P3: no layout thrash).
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const dark = !/light/.test(cs.colorScheme || '') || !!el.closest('.art-force-dark');
  const v = veil;
  // Inline, so the veil never eats a tap even on a page without ui.css (dev pages).
  v.style.cssText = `position:fixed;pointer-events:none;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius || '12px'};background:${
    dark ? '#fff' : '#000'
  }`;
  veilAnim?.cancel();
  const to = dark ? 0.08 : 0.06;
  veilAnim = v.animate(
    rm ? [{ opacity: 0 }, { opacity: to }] : [{ opacity: 0, transform: 'scale(1)' }, { opacity: to, transform: `scale(${scale})` }],
    { duration: DURATION.tap, easing: EASING.standard, fill: 'forwards' },
  );
}

function hideVeil(rm: boolean, scale: number): void {
  if (!veil) return;
  const v = veil;
  veilAnim?.cancel();
  veilAnim = v.animate(
    rm ? [{ opacity: 0.07 }, { opacity: 0 }] : [{ opacity: 0.07, transform: `scale(${scale})` }, { opacity: 0, transform: 'scale(1)' }],
    { duration: rm ? 80 : DURATION.quick, easing: EASING.standard, fill: 'forwards' },
  );
}

/**
 * The press gesture for a whole subtree with ONE delegated listener (docs/ARTE-PULIDO.md B-4): on
 * pointer-down the control sinks to .96 (.98 for cards) in 90 ms `standard`; on release or cancel it
 * comes back with the fast spring (400 ms). It animates the individual `scale` property, so a control
 * placed with its own `transform` keeps it. A finger that slides more than 10 px cancels. Under Reduce
 * motion only the veil fades. Returns the cleanup.
 */
export function installPressFeedback(root: Document | HTMLElement = document): () => void {
  let cur: Pressing | null = null;
  const release = () => {
    const p = cur;
    if (!p) return;
    cur = null;
    const rm = reduceMotion();
    hideVeil(rm, p.scale);
    p.anim?.cancel();
    if (!rm && canAnimate(p.el) && p.el.isConnected) {
      const back = p.el.animate([{ scale: String(p.scale) }, { scale: '1' }], { duration: SPRING.fast.ms, easing: springEasing('fast') });
      back.onfinish = () => back.cancel();
    }
  };
  const down = (e: Event) => {
    const pe = e as PointerEvent;
    if (pe.pointerType === 'mouse' && pe.button !== 0) return;
    const t = pe.target as Element | null;
    const el = t && typeof t.closest === 'function' ? t.closest(PRESS_SELECTOR) : null;
    if (!canPress(el)) return;
    release();
    const rm = reduceMotion();
    const w = el.offsetWidth;
    const scale = pressScale(w, el.matches(PRESS_WIDE_SELECTOR));
    let anim: Animation | null = null;
    if (!rm && canAnimate(el)) anim = el.animate([{ scale: '1' }, { scale: String(scale) }], { duration: DURATION.tap, easing: EASING.standard, fill: 'forwards' });
    showVeil(el, rm ? 1 : scale, rm);
    cur = { el, scale, x: pe.clientX, y: pe.clientY, id: pe.pointerId, anim };
  };
  const move = (e: Event) => {
    const pe = e as PointerEvent;
    if (!cur || pe.pointerId !== cur.id) return;
    if (Math.hypot(pe.clientX - cur.x, pe.clientY - cur.y) > PRESS_CANCEL_PX) release();
  };
  const up = (e: Event) => {
    if (cur && (e as PointerEvent).pointerId === cur.id) release();
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  root.addEventListener('pointerdown', down, opts);
  root.addEventListener('pointermove', move, opts);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) root.addEventListener(ev, up, opts);
  const blur = () => release();
  if (typeof window !== 'undefined') window.addEventListener('blur', blur);
  return () => {
    root.removeEventListener('pointerdown', down, opts);
    root.removeEventListener('pointermove', move, opts);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) root.removeEventListener(ev, up, opts);
    if (typeof window !== 'undefined') window.removeEventListener('blur', blur);
    release();
  };
}

/** The press gesture on one element only (dev pages, elements outside a root with installPressFeedback). */
export function pressable(el: HTMLElement): () => void {
  return installPressFeedback(el);
}

/**
 * Restart a one-shot CSS animation class without forcing a layout (P3): taking the class off and
 * flushing style alone (getAnimations) ends the running animation; putting it back starts it again.
 */
export function restartClass(el: Element, cls: string): void {
  el.classList.remove(cls);
  if (typeof (el as HTMLElement).getAnimations === 'function') (el as HTMLElement).getAnimations();
  el.classList.add(cls);
}

/** A value just changed: fast-spring overshoot (or a short highlight fade under Reduce motion). */
export function pop(el: HTMLElement, scale = 1.08, ms: number = SPRING.fast.ms): void {
  if (!canAnimate(el)) return;
  if (reduceMotion()) {
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 80, easing: 'linear' });
    return;
  }
  // A pulse up and back: the spring carries the return (its overshoot is the "settle").
  el.animate([{ scale: '1' }, { scale: String(scale), offset: 0.3 }, { scale: '1' }], { duration: ms, easing: EASING.standard });
}

/**
 * Count a number in `el` (text), formatting each frame with `fmt`. Under Reduce motion the final value
 * is written at once. Width stays fixed if the element uses tabular-nums. Returns a cancel function.
 */
export function countUp(
  el: HTMLElement,
  from: number,
  to: number,
  fmt: (n: number) => string,
  ms: number = DURATION.celebrate,
  curve: (t: number) => number = ease.outCubic,
): () => void {
  if (reduceMotion() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
    el.textContent = fmt(to);
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  let last = '';
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const s = fmt(Math.round(from + (to - from) * curve(k)));
    if (s !== last) el.textContent = last = s;
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = fmt(to);
  };
}

/** Delay of the i-th item of a staggered list (ms): 40 ms apart, the 7th and later enter with the 6th. */
export function staggerDelay(i: number, base = 0): number {
  return base + Math.min(Math.max(0, i), STAGGER.max - 1) * STAGGER.step;
}

/**
 * Orchestrated entrance of a sheet's blocks (docs/ARTE-PULIDO.md B-5): after `delay`, each block rises
 * 12 px and fades in over 240 ms `enter`, 40 ms apart (at most 6 waits). Under Reduce motion: nothing
 * (the sheet's own 80-ms fade carries them).
 */
export function staggerIn(blocks: Iterable<Element>, delay = 80, rise = 12, ms = 240): void {
  if (reduceMotion()) return;
  let i = 0;
  for (const b of blocks) {
    if (!canAnimate(b)) continue;
    b.animate(
      [
        { opacity: 0, transform: `translateY(${rise}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: ms, delay: staggerDelay(i++, delay), easing: EASING.enter, fill: 'backwards' },
    );
  }
}

/**
 * The purchase gesture: the bought element pops, a ring of `color` bursts out of it, then the
 * caller's counter counts. Rings are absolutely positioned in `layer` (pointer-events: none).
 */
export function buyBurst(target: HTMLElement, layer: HTMLElement, color: string): void {
  pop(target, 1.12);
  if (reduceMotion() || typeof document === 'undefined') return;
  const r = target.getBoundingClientRect();
  const lr = layer.getBoundingClientRect();
  const ring = document.createElement('span');
  const size = Math.max(r.width, r.height);
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${r.left - lr.left + r.width / 2 - size / 2}px`,
    top: `${r.top - lr.top + r.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    border: `3px solid ${color}`,
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  layer.append(ring);
  const a = ring.animate(
    [
      { transform: 'scale(.6)', opacity: 0.95 },
      { transform: 'scale(1.9)', opacity: 0 },
    ],
    { duration: DURATION.celebrate, easing: EASING.enter },
  );
  a.onfinish = () => ring.remove();
}
