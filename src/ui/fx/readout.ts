/**
 * The Luz counter as an instrument readout (docs/ARTE-REALISTA.md §6.4, §6.8): it updates at 8 Hz in
 * whole steps, the last digits "typing", and reaches a new value in at most 600 ms; no scale, no bounce.
 * Spending shows at once (the price is paid now); Reduce motion shows the final value directly.
 *
 * Light on its way to the counter (the motes of a collection, src/ui/fx/fly.ts) is held back until it
 * lands, so the number rises when the light arrives, not before it leaves the dish.
 */
import { fmt } from '../format';

export const READOUT = {
  /** Updates per second. */
  hz: 8,
  /** A new value is reached within this many ms. */
  countMs: 600,
  /** Light in flight at once that the readout keeps track of (more simply counts at once). */
  maxFlights: 16,
} as const;

export class Readout {
  private shown = -1;
  private at = -Infinity;
  private ticksLeft = 0;
  private goal = 0;
  private readonly flightAmt = new Float64Array(READOUT.maxFlights);
  private readonly flightUntil = new Float64Array(READOUT.maxFlights);
  /** The wallet that already includes the flight (the view may report the collection a frame later). */
  private readonly flightMin = new Float64Array(READOUT.maxFlights);
  private flightHead = 0;
  private lastTarget = 0;

  /** The value on display (whole units), -1 before the first tick. */
  get value(): number {
    return this.shown;
  }

  /** `amount` is flying to the counter and lands at `until` (ms, same clock as `tick`). */
  hold(amount: number, until: number): void {
    if (!(amount > 0)) return;
    const i = this.flightHead;
    this.flightHead = (i + 1) % READOUT.maxFlights;
    this.flightAmt[i] = amount;
    this.flightUntil[i] = until;
    this.flightMin[i] = this.lastTarget + amount - 1e-6;
  }

  /** Light still in the air at `now` that a wallet of `target` already counts. */
  inFlight(now: number, target = Infinity): number {
    let s = 0;
    for (let i = 0; i < READOUT.maxFlights; i++) if (this.flightUntil[i] > now && target >= this.flightMin[i]) s += this.flightAmt[i];
    return s;
  }

  /**
   * The whole number to show at `now` (ms) for a wallet of `target`. Returns the same number between
   * ticks; call it every frame.
   */
  tick(target: number, now: number, reduceMotion: boolean): number {
    this.lastTarget = target;
    const aim = Math.max(0, Math.floor(target - (reduceMotion ? 0 : this.inFlight(now, target)) + 1e-9));
    if (this.shown < 0 || reduceMotion || aim < this.shown) {
      this.shown = aim;
      this.goal = aim;
      this.ticksLeft = 0;
      this.at = now;
      return this.shown;
    }
    if (aim !== this.goal) {
      this.goal = aim;
      this.ticksLeft = Math.max(1, Math.floor((READOUT.countMs * READOUT.hz) / 1000) - 1);
    }
    if (this.shown === aim || now - this.at < 1000 / READOUT.hz) return this.shown;
    this.at = now;
    const d = aim - this.shown;
    this.shown += Math.max(1, Math.ceil(d / Math.max(1, this.ticksLeft)));
    if (this.shown > aim) this.shown = aim;
    this.ticksLeft = Math.max(1, this.ticksLeft - 1);
    return this.shown;
  }
}

/** "+12" for a rate in whole numbers from 1 (below 1, one decimal: "0,5"); 0 is "0". */
export function wholeRate(v: number, lang: 'es' | 'en'): string {
  if (!(v > 0)) return '0';
  if (v >= 1) return fmt(Math.round(v), lang);
  const r = Math.max(0.1, Math.round(v * 10) / 10);
  return r >= 1 ? '1' : String(r).replace('.', lang === 'es' ? ',' : '.');
}
