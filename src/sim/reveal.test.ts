import { describe, expect, it } from 'vitest';
import { INCUBATE_MAX_S } from '../game/cycleBalance';
import { CultureReveal, REVEAL } from './reveal';

/**
 * Owner bug (docs/ARTE-PULIDO.md §3.17, A-6): "la criatura inicial corre a toda velocidad al empezar".
 * main.ts pre-incubated the starter up to 40 steps a frame with the dish on screen, also under a
 * Momento's pause card. These tests pin the fix: the culture is not lit while it incubates, the
 * incubation never runs under a paused Momento, and the first visible second starts from rest.
 */
const ready = { ready: true, momentPaused: false, hidden: false, stepping: true };

describe('culture reveal (calm start)', () => {
  it('keeps the starter invisible while it incubates', () => {
    const r = new CultureReveal();
    r.incubate(1250);
    for (let f = 0; f < 200 && r.incubating; f++) {
      const fr = r.frame(1 / 60, ready);
      expect(fr.fade).toBe(0);
      r.ran(Math.min(fr.incubateBudget, r.left));
    }
    expect(r.incubating).toBe(false);
  });

  it('never incubates under a Momento that paused the dish', () => {
    const r = new CultureReveal();
    r.incubate(1250);
    const fr = r.frame(1 / 60, { ...ready, momentPaused: true });
    expect(fr.incubateBudget).toBe(0);
    expect(fr.fade).toBe(0);
  });

  it('a first seed during the incubation does not cut it short: the starter gets every step (ADR-027 v0.020)', () => {
    // A slow GPU, or a player who sows at once: the run starts with the starter still incubating. It
    // used to be lit there with what it had (the World 1 swimmer then missed the Bestiary, QA4 F-04).
    const r = new CultureReveal();
    r.incubate(1250);
    let fr = r.frame(1 / 60, ready);
    r.ran(100);
    const running = { ...ready, ready: false, running: true };
    let steps = 100;
    for (let f = 0; f < 400 && r.incubating; f++) {
      fr = r.frame(1 / 60, running);
      expect(fr.fade).toBe(0);
      const k = Math.min(fr.incubateBudget, r.left);
      r.ran(k);
      steps += k;
    }
    expect(steps).toBe(1250);
    fr = r.frame(1 / 60, running);
    expect(fr.lit).toBe(true);
  });

  it('stops incubating (and lights the culture) when the run ends', () => {
    const r = new CultureReveal();
    r.incubate(1250);
    r.frame(1 / 60, ready);
    const fr = r.frame(1 / 60, { ...ready, ready: false, running: false });
    expect(fr.incubateBudget).toBe(0);
    expect(r.incubating).toBe(false);
    expect(fr.lit).toBe(true);
  });

  it('lights the culture once, then fades it in over the reveal time', () => {
    const r = new CultureReveal();
    r.incubate(20);
    let lit = 0;
    let t = 0;
    let fade = 0;
    for (let f = 0; f < 120; f++) {
      const fr = r.frame(1 / 60, ready);
      r.ran(Math.min(fr.incubateBudget, r.left));
      if (fr.lit) lit++;
      if (lit && fade < 1) t += 1 / 60;
      expect(fr.fade).toBeGreaterThanOrEqual(fade - 1e-9); // never flickers back
      fade = fr.fade;
    }
    expect(lit).toBe(1);
    expect(fade).toBe(1);
    expect(t).toBeGreaterThan(REVEAL.fadeMs / 1000 - 0.05);
    expect(t).toBeLessThan(REVEAL.fadeMs / 1000 + 0.1);
  });

  it('the first visible second starts from rest and never exceeds the normal pace', () => {
    const r = new CultureReveal();
    r.incubate(10);
    let fr = r.frame(1 / 60, ready);
    r.ran(fr.incubateBudget);
    // From the first frame the culture is lit, the dish runs no extra incubation steps and its pace
    // climbs from 0 to 1 (×SESSION_SIM_PACE) over the ramp.
    fr = r.frame(1 / 60, ready);
    expect(fr.incubateBudget).toBe(0);
    expect(fr.pace).toBeLessThan(0.1);
    let prev = fr.pace;
    // The light-up (0.7 s, the dish still) and the ramp (1 s).
    for (let f = 0; f < 120; f++) {
      fr = r.frame(1 / 60, ready);
      expect(fr.pace).toBeLessThanOrEqual(1);
      expect(fr.pace).toBeGreaterThanOrEqual(prev);
      prev = fr.pace;
    }
    expect(fr.pace).toBe(1);
  });

  it('the dish holds still while the culture lights, so the first visible second runs under a quarter of a normal one', () => {
    // A-6 acceptance: no creature travels more than 0.5 R in its first visible second. The World 1
    // starter swims ~0.6 cells a step (measured in the real game), so ≤ 11 of the 45 steps of a full
    // second (≈ 6.5 cells = 0.5 R at R 13).
    const r = new CultureReveal();
    r.incubate(10);
    r.ran(r.frame(1 / 60, ready).incubateBudget);
    let paceSeconds = 0;
    for (let f = 0; f < 60; f++) {
      const fr = r.frame(1 / 60, ready);
      if (fr.fade < 1) expect(fr.pace).toBe(0);
      paceSeconds += fr.pace / 60;
    }
    expect(paceSeconds).toBeLessThan(0.25);
    for (let f = 0; f < 120; f++) r.frame(1 / 60, ready);
    expect(r.frame(1 / 60, ready).pace).toBe(1);
  });

  it('the pace ramp waits while the dish is paused (a start card), so the dish never starts at full speed', () => {
    const r = new CultureReveal();
    r.incubate(10);
    r.ran(r.frame(1 / 60, ready).incubateBudget);
    for (let f = 0; f < 120; f++) r.frame(1 / 60, { ...ready, stepping: false });
    expect(r.frame(1 / 60, ready).pace).toBeLessThan(0.1);
  });

  it('a restored dish (nothing to incubate) is lit at once', () => {
    const r = new CultureReveal();
    const fr = r.frame(1 / 60, ready);
    expect(fr.fade).toBe(1);
    expect(fr.pace).toBe(1);
  });

  it('the tutorial’s first seed shows within the cap on a slow device, even once the failsafe started the clock (QA-CLARIDAD-2 B2)', () => {
    // Session 1: the tap plants the sure creature while the run is 'ready'; at ~5 fps the pacer runs 2 steps a
    // frame. The 30 s failsafe then started the clock, but the clock counts dish time and the regular steps wait
    // for the hidden incubation, so the dish stayed dark and the clock stood still.
    const r = new CultureReveal({ maxS: INCUBATE_MAX_S });
    r.incubate(1250);
    let t = 0;
    let fr = r.frame(0.2, { ...ready, wallDt: 0.2 });
    for (let f = 0; f < 2000 && !r.lit; f++) {
      const ctx = t < 2 ? { ...ready, wallDt: 0.2 } : { ...ready, ready: false, running: true, wallDt: 0.2 };
      fr = r.frame(0.2, ctx);
      r.ran(Math.min(2, fr.incubateBudget));
      t += 0.2;
    }
    expect(r.lit).toBe(true);
    expect(r.capped).toBe(true);
    expect(t).toBeLessThanOrEqual(INCUBATE_MAX_S + REVEAL.fadeMs / 1000 + 0.2);
  });
});
