/**
 * Motion (docs/ARTE.md §7): one vocabulary of durations and easings, and the three "juice"
 * gestures every screen shares. All helpers honour Reduce motion (the game setting or the OS):
 * movement is replaced by a short fade, nothing loops, and the end state is always applied.
 *
 *   press      90 ms   scale .96 on pointer-down (buttons, nodes, cards)
 *   pop       320 ms   overshoot scale for a value that just changed (counter, badge, level)
 *   buy       700 ms   pop + ring burst in the route colour + the number counting up
 *   sheet     260 ms   bottom sheets / side panels slide in with `enter`, out with `exit`
 *
 * Never moves: the HUD frame, the tab bar, the dish frame, numbers' widths (tabular-nums), text
 * that is being read. Only loops: creature halos, the "new" dot, VELA's idle, the Spark.
 */
import { DURATION, EASING } from './tokens';

export { DURATION, EASING };

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

export const ease = {
  standard: bezier(0.2, 0, 0, 1),
  enter: bezier(0.05, 0.7, 0.1, 1),
  exit: bezier(0.3, 0, 0.8, 0.15),
  pop: bezier(0.34, 1.56, 0.64, 1),
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

function canAnimate(el: Element): el is HTMLElement {
  return typeof (el as HTMLElement).animate === 'function';
}

/** Pointer-down feedback: a quick press (scale .96). Returns the cleanup. */
export function pressable(el: HTMLElement): () => void {
  const down = () => {
    if (reduceMotion() || !canAnimate(el)) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }], { duration: DURATION.tap, easing: EASING.standard, fill: 'forwards' });
  };
  const up = () => {
    if (!canAnimate(el)) return;
    el.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: DURATION.quick, easing: EASING.pop, fill: 'forwards' });
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', up);
  };
}

/** A value just changed: overshoot pop (or a short highlight fade under Reduce motion). */
export function pop(el: HTMLElement, scale = 1.18): void {
  if (!canAnimate(el)) return;
  if (reduceMotion()) {
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 80, easing: 'linear' });
    return;
  }
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.35 }, { transform: 'scale(1)' }], {
    duration: DURATION.card,
    easing: EASING.pop,
  });
}

/**
 * Count a number up in `el` (text), formatting each frame with `fmt`. Under Reduce motion the
 * final value is written at once. Width stays fixed if the element uses tabular-nums.
 */
export function countUp(el: HTMLElement, from: number, to: number, fmt: (n: number) => string, ms: number = DURATION.celebrate): void {
  if (reduceMotion() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(from + (to - from) * ease.standard(k)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
    boxShadow: `0 0 18px ${color}`,
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
