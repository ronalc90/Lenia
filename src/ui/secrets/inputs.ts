/**
 * Small adapters from DOM input to the secrets hooks, so the integrator wires each with a line:
 *   keyboard → onKey, logo taps → onLogoTap, essence long press → onEssenceLongPress (with a
 *   faint progress ring after 1.2 s), DeviceMotion / mouse jiggle / window jiggle → onDeviceShake,
 *   and a stroke recorder that turns brush/eraser points into finished strokes → onBrushPath.
 */
import { LONG_PRESS_MS } from '../../secrets/data';
import type { Secrets } from '../../secrets/secrets';
import { createJiggleDetector, createShakeDetector } from '../../secrets/shake';
import type { TimedPt } from '../../secrets/types';
import { injectSecretsStyles } from './styles';

export interface SecretInputsOptions {
  /** Where keydown is listened (default window). */
  keyTarget?: Window | HTMLElement;
  /** Logo / wordmark elements (they also get data-secret-logo for the wake animation). */
  logos?: HTMLElement[];
  /** The essence counter element in the HUD. */
  essence?: HTMLElement | null;
  /** The dish element: mouse jiggle over it counts as a shake on desktop. */
  dish?: HTMLElement | null;
  /** Listen to DeviceMotion (default true; on iOS it needs requestMotionPermission() from a tap). */
  motion?: boolean;
  /** Poll window.screenX to detect a shaken window (default true). */
  windowJiggle?: boolean;
}

export interface SecretInputs {
  /** iOS 13+: ask for DeviceMotion permission (must run inside a user gesture). null if not needed. */
  requestMotionPermission: (() => Promise<boolean>) | null;
  dispose(): void;
}

type MotionPermissionAPI = { requestPermission?: () => Promise<'granted' | 'denied'> };

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function attachSecretInputs(secrets: Secrets, o: SecretInputsOptions = {}): SecretInputs {
  injectSecretsStyles();
  const offs: (() => void)[] = [];
  const on = <K extends string>(t: EventTarget, type: K, fn: (e: Event) => void, opt?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, opt);
    offs.push(() => t.removeEventListener(type, fn, opt));
  };

  // Keyboard (Konami).
  on(o.keyTarget ?? window, 'keydown', (e) => {
    const k = e as KeyboardEvent;
    if (k.repeat || isTyping(k.target)) return;
    secrets.onKey(k.key);
  });

  // Logo taps.
  for (const el of o.logos ?? []) {
    el.setAttribute('data-secret-logo', '');
    on(el, 'pointerup', () => secrets.onLogoTap());
  }

  // Essence long press, with a faint ring that fills after a moment (a whisper of a hint).
  if (o.essence) {
    const target = o.essence;
    let t0 = 0;
    let ring: HTMLElement | null = null;
    let raf = 0;
    let fired = false;
    const stop = (fire: boolean) => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (t0 && fire && !fired) secrets.onEssenceLongPress(performance.now() - t0);
      t0 = 0;
      if (ring) {
        const r = ring;
        ring = null;
        r.classList.remove('on');
        setTimeout(() => r.remove(), 400);
      }
    };
    const tickRing = () => {
      if (!t0) return;
      const el = performance.now() - t0;
      if (el > 1200 && !ring) {
        const b = target.getBoundingClientRect();
        const size = Math.max(b.width, b.height) + 18;
        ring = document.createElement('div');
        ring.className = 'bls-hold';
        Object.assign(ring.style, { left: `${b.left + b.width / 2 - size / 2}px`, top: `${b.top + b.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
        document.body.appendChild(ring);
        requestAnimationFrame(() => ring?.classList.add('on'));
      }
      if (ring) {
        const p = Math.min(1, (el - 1200) / (LONG_PRESS_MS - 1200));
        ring.style.background = `conic-gradient(rgba(255,209,102,.55) ${p * 360}deg, rgba(255,209,102,.06) 0)`;
        ring.style.mask = ring.style.webkitMask = 'radial-gradient(circle, transparent 62%, #000 64%, #000 70%, transparent 72%)';
      }
      if (el >= LONG_PRESS_MS && !fired) {
        fired = true;
        secrets.onEssenceLongPress(el);
        ring?.classList.add('done');
        stop(false);
        return;
      }
      raf = requestAnimationFrame(tickRing);
    };
    on(target, 'pointerdown', () => {
      t0 = performance.now();
      fired = false;
      raf = requestAnimationFrame(tickRing);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) on(target, ev, () => stop(true));
  }

  // Shakes.
  const shake = () => secrets.onDeviceShake();
  let requestMotionPermission: (() => Promise<boolean>) | null = null;
  if (o.motion !== false && typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
    const det = createShakeDetector();
    const onMotion = (e: Event) => {
      const a = (e as DeviceMotionEvent).accelerationIncludingGravity;
      if (a && a.x !== null && a.y !== null && a.z !== null && det.feed(a.x, a.y, a.z, performance.now())) shake();
    };
    const api = (window as unknown as { DeviceMotionEvent: MotionPermissionAPI }).DeviceMotionEvent;
    if (typeof api.requestPermission === 'function') {
      requestMotionPermission = async () => {
        try {
          const r = await api.requestPermission!();
          if (r === 'granted') on(window, 'devicemotion', onMotion);
          return r === 'granted';
        } catch {
          return false;
        }
      };
    } else on(window, 'devicemotion', onMotion);
  }
  if (o.dish) {
    const jig = createJiggleDetector({ minLeg: 40, reversals: 7 });
    on(o.dish, 'pointermove', (e) => {
      const p = e as PointerEvent;
      if (p.pointerType !== 'mouse' || p.buttons !== 0) return;
      if (jig.feed(p.clientX, p.timeStamp || performance.now())) shake();
    });
  }
  if (o.windowJiggle !== false && typeof window !== 'undefined') {
    const jig = createJiggleDetector({ minLeg: 24, reversals: 5, windowMs: 1800 });
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (jig.feed(window.screenX, performance.now())) shake();
    }, 90);
    offs.push(() => clearInterval(id));
  }

  return {
    requestMotionPermission,
    dispose() {
      offs.forEach((f) => f());
      offs.length = 0;
    },
  };
}

export interface StrokeRecorder {
  /** A brush/eraser point in GRID cells (call from the onBrush / onErase handlers). */
  point(x: number, y: number): void;
  /** Finish the stroke now (e.g. on pointerup). */
  end(): void;
  cancel(): void;
}

/**
 * Collects brush/eraser points into strokes. A stroke ends on pointerup/pointercancel over
 * `endOn` (the dish element), on end(), or as a fallback `idleMs` after the last point (people
 * pause at the corners of a heart, so this is generous). Points further apart than
 * `breakCells` (and not a toroidal wrap) start a new stroke.
 */
export function createStrokeRecorder(
  secrets: Pick<Secrets, 'onBrushPath'>,
  opts: { idleMs?: number; breakCells?: number; endOn?: HTMLElement | null } = {},
): StrokeRecorder & { dispose(): void } {
  const idle = opts.idleMs ?? 900;
  const brk = opts.breakCells ?? 40;
  let pts: TimedPt[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const p = pts;
    pts = [];
    if (p.length >= 2) secrets.onBrushPath(p);
  };
  const endOn = opts.endOn ?? null;
  const onUp = () => flush();
  endOn?.addEventListener('pointerup', onUp);
  endOn?.addEventListener('pointercancel', onUp);
  return {
    point(x, y) {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(x - last.x, y - last.y) > brk) {
        // Could be a torus wrap (small true distance) — keep it; recognizer unwraps when it knows the grid.
        const wrapped = Math.abs(x - last.x) > 64 || Math.abs(y - last.y) > 64;
        if (!wrapped) flush();
      }
      pts.push({ x, y, t: performance.now() });
      clearTimeout(timer);
      timer = setTimeout(flush, idle);
    },
    end: flush,
    cancel() {
      clearTimeout(timer);
      pts = [];
    },
    dispose() {
      clearTimeout(timer);
      endOn?.removeEventListener('pointerup', onUp);
      endOn?.removeEventListener('pointercancel', onUp);
    },
  };
}
