/**
 * Pure "shake" detectors (no DOM): the UI feeds them samples.
 *  - createShakeDetector: DeviceMotion accelerationIncludingGravity samples (phones).
 *  - createJiggleDetector: a 1D position (mouse x over the dish, or window.screenX on
 *    desktop) moved back and forth quickly. Desktop players can "shake" too.
 */

export interface ShakeOptions {
  /** Change of acceleration between samples (m/s²) that counts as a jolt. */
  threshold?: number;
  /** Jolts needed within `windowMs`. */
  jolts?: number;
  windowMs?: number;
  /** Quiet time after a detection. */
  cooldownMs?: number;
}

export interface ShakeDetector {
  /** Returns true once when a shake is detected. */
  feed(ax: number, ay: number, az: number, tMs: number): boolean;
  reset(): void;
}

export function createShakeDetector(o: ShakeOptions = {}): ShakeDetector {
  const threshold = o.threshold ?? 14;
  const need = o.jolts ?? 4;
  const windowMs = o.windowMs ?? 1200;
  const cooldown = o.cooldownMs ?? 3000;
  let prev: [number, number, number] | null = null;
  let hits: number[] = [];
  let quietUntil = -Infinity;
  return {
    feed(ax, ay, az, t) {
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return false;
      const p = prev;
      prev = [ax, ay, az];
      if (!p || t < quietUntil) return false;
      const d = Math.max(Math.abs(ax - p[0]), Math.abs(ay - p[1]), Math.abs(az - p[2]));
      if (d < threshold) return false;
      hits.push(t);
      hits = hits.filter((h) => t - h <= windowMs);
      if (hits.length >= need) {
        hits = [];
        quietUntil = t + cooldown;
        return true;
      }
      return false;
    },
    reset() {
      prev = null;
      hits = [];
      quietUntil = -Infinity;
    },
  };
}

export interface JiggleOptions {
  /** Minimum travel (px) of each leg between direction reversals. */
  minLeg?: number;
  /** Reversals needed within `windowMs`. */
  reversals?: number;
  windowMs?: number;
  cooldownMs?: number;
}

export interface JiggleDetector {
  feed(x: number, tMs: number): boolean;
  reset(): void;
}

export function createJiggleDetector(o: JiggleOptions = {}): JiggleDetector {
  const minLeg = o.minLeg ?? 30;
  const need = o.reversals ?? 6;
  const windowMs = o.windowMs ?? 1500;
  const cooldown = o.cooldownMs ?? 3000;
  let anchor: number | null = null; // extreme of the current leg
  let dir = 0; // +1 / -1 / 0 unknown
  let legStart: number | null = null;
  let revs: number[] = [];
  let quietUntil = -Infinity;
  return {
    feed(x, t) {
      if (!Number.isFinite(x)) return false;
      if (t < quietUntil) return false;
      if (anchor === null || legStart === null) {
        anchor = x;
        legStart = x;
        return false;
      }
      const d = x - anchor;
      if (dir === 0) {
        if (Math.abs(d) >= minLeg) {
          dir = Math.sign(d);
          anchor = x;
        }
        return false;
      }
      if (Math.sign(d) === dir || d === 0) {
        // Still going the same way: extend the leg.
        if ((x - anchor) * dir > 0) anchor = x;
        return false;
      }
      if (Math.abs(d) >= minLeg && Math.abs(anchor - legStart) >= minLeg) {
        // Reversal with a long enough previous leg.
        revs.push(t);
        revs = revs.filter((r) => t - r <= windowMs);
        legStart = anchor;
        anchor = x;
        dir = -dir;
        if (revs.length >= need) {
          revs = [];
          quietUntil = t + cooldown;
          anchor = null;
          legStart = null;
          dir = 0;
          return true;
        }
      }
      return false;
    },
    reset() {
      anchor = null;
      legStart = null;
      dir = 0;
      revs = [];
      quietUntil = -Infinity;
    },
  };
}
