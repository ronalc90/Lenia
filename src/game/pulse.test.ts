import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import {
  addBonusHits,
  catchMote,
  freshPulse,
  pulseBase,
  pulseFxOf,
  registerHit,
  settleMotes,
  streakMult,
  streakView,
  tickStreak,
  type PulseFx,
} from './pulse';

const FX: PulseFx = pulseFxOf({}, 2);
const at = { x: 50, y: 50, owner: 1 as number | null };

/** n hits 200 ms apart, from t0 (ms); returns the Luz each paid. */
function tap(st = freshPulse(), n: number, P = 100, fx = FX, t0 = 0, gap = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(registerHit(st, { kind: 'pulse', P, fx, nowMs: t0 + i * gap, at, R: 13 })?.amount ?? 0);
  return out;
}

describe('the pulse: a tap on a creature (ADR-031, docs/MECANICAS.md §5.1)', () => {
  it('with only uniform soup a thousand taps yield zero light', () => {
    const st = freshPulse();
    const paid = tap(st, 1000, 0);
    expect(paid.reduce((a, b) => a + b, 0)).toBe(0);
    expect(st.hits).toBe(0);
    expect(pulseBase(0, FX)).toBe(0);
  });

  it('a tap scales with the dish\'s light and never falls below one', () => {
    expect(pulseBase(4, FX)).toBe(C.PULSE_MIN);
    expect(pulseBase(1000, FX)).toBeCloseTo(1000 * C.PULSE_SECONDS);
    expect(pulseBase(1000, pulseFxOf({ pulse: 3 }, 2))).toBeCloseTo(1000 * C.PULSE_SECONDS * C.PULSE_MULT_BY_LEVEL[3]);
    expect(pulseBase(4, pulseFxOf({ pulse: 1 }, 2))).toBeCloseTo(C.PULSE_MIN * C.PULSE_MULT_BY_LEVEL[1]);
  });

  it('every hit in a row raises the streak, up to its cap', () => {
    const st = freshPulse();
    tap(st, 3);
    expect(st.hits).toBe(3);
    expect(streakMult(st)).toBeCloseTo(1 + 3 * C.STREAK_STEP);
    tap(st, 40, 100, FX, 1000);
    expect(st.hits).toBe(C.STREAK_HITS_BY_LEVEL[0]);
    expect(streakMult(st)).toBeCloseTo(1 + C.STREAK_HITS_BY_LEVEL[0] * C.STREAK_STEP);
    const long = freshPulse();
    tap(long, 60, 100, pulseFxOf({ streakLong: 2 }, 2));
    expect(long.hits).toBe(C.STREAK_HITS_BY_LEVEL[2]);
  });

  it('the tenth hit of a streak is a Chispazo worth five pulses', () => {
    const st = freshPulse();
    const paid = tap(st, 10, 1000);
    const base = pulseBase(1000, FX);
    // Hit k pays one pulse × the streak before it; the 10th pays CHISPAZO_MULT of them.
    expect(paid[0]).toBeCloseTo(base);
    expect(paid[8]).toBeCloseTo(base * (1 + 8 * C.STREAK_STEP));
    expect(paid[9]).toBeCloseTo(base * (1 + 9 * C.STREAK_STEP) * C.CHISPAZO_MULT);
    expect(st.chispazos).toBe(1);
    expect(streakView(st, FX).toChispazo).toBe(C.CHISPAZO_EVERY_BY_LEVEL[0]);
    // Chispazo seguido: every 6th.
    const often = freshPulse();
    tap(often, 12, 1000, pulseFxOf({ chispazoOften: 2 }, 2));
    expect(often.chispazos).toBe(2);
  });

  it('a Chispazo throws glimmers from session 2 only', () => {
    const s1 = freshPulse();
    tap(s1, 10, 100, pulseFxOf({}, 1));
    expect(s1.motes).toHaveLength(0);
    const s2 = freshPulse();
    tap(s2, 10, 100, FX);
    expect(s2.motes).toHaveLength(C.CHISPAZO_MOTES);
    for (const m of s2.motes) {
      const d = Math.hypot(m.x - at.x, m.y - at.y);
      expect(d).toBeGreaterThanOrEqual(C.MOTE_SPREAD_R[0] * 13 - 1e-9);
      expect(d).toBeLessThanOrEqual(C.MOTE_SPREAD_R[1] * 13 + 1e-9);
    }
  });

  it('a pause in tapping drains the streak, never resets it at once', () => {
    const st = freshPulse();
    tap(st, 10);
    tickStreak(st, C.STREAK_GRACE_S * 0.9);
    expect(st.hits).toBe(10);
    tickStreak(st, C.STREAK_GRACE_S * 0.1 + 0.25);
    expect(st.hits).toBe(10 - Math.floor(0.25 * C.STREAK_DRAIN_PER_S));
    expect(st.hits).toBeGreaterThan(0);
    expect(streakView(st, FX).draining).toBe(true);
    tickStreak(st, 10);
    expect(st.hits).toBe(0);
    // A new streak counts its Chispazo from zero again.
    expect(st.k).toBe(0);
  });

  it('the streak is frozen while the dish is paused', () => {
    const st = freshPulse();
    tap(st, 8);
    tickStreak(st, 30, true);
    expect(st.hits).toBe(8);
    expect(streakView(st, FX).draining).toBe(false);
  });

  it('hits above ten a second pay nothing', () => {
    const st = freshPulse();
    const paid = tap(st, 30, 100, FX, 0, 20); // 50 taps a second for 0.6 s
    expect(paid.filter((x) => x > 0)).toHaveLength(C.TAP_HITS_MAX_PER_S);
    expect(st.taps).toBe(C.TAP_HITS_MAX_PER_S);
    // A second later the window has room again.
    expect(tap(st, 1, 100, FX, 1700)[0]).toBeGreaterThan(0);
  });

  it('a caught glimmer is one pulse × the streak and one more hit; an uncaught one settles for one pulse', () => {
    const st = freshPulse();
    const long = pulseFxOf({ streakLong: 1 }, 2); // room above 10 hits
    tap(st, 10, 1000, long);
    const base = pulseBase(1000, long);
    const [m0, m1] = st.motes;
    const hits = st.hits;
    const got = catchMote(st, m0.id, 3000, long);
    expect(got?.amount).toBeCloseTo(base * (1 + hits * C.STREAK_STEP));
    expect(st.hits).toBe(hits + 1);
    expect(catchMote(st, m0.id, 3000, long)).toBeNull();
    const settled = settleMotes(st, C.MOTE_LIFE_S + 0.1);
    expect(settled.map((m) => m.id)).toContain(m1.id);
    expect(settled.every((m) => Math.abs(m.amount - base * C.MOTE_SETTLE_SHARE) < 1e-9)).toBe(true);
    expect(st.motes).toHaveLength(0);
  });

  it('bonus hits (Spark, a saved swimmer) raise the streak but do not count towards the Chispazo', () => {
    const st = freshPulse();
    tap(st, 2);
    addBonusHits(st, C.SPARK_STREAK_HITS, FX);
    expect(st.hits).toBe(2 + C.SPARK_STREAK_HITS);
    expect(st.k).toBe(2);
  });
});
