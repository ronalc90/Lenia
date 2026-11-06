import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../../core/bus';
import { createGame } from '../../game/game';
import { START_WAKE_MAX_S } from '../../game/cycleBalance';
import { clockPauses, shouldStartClock, startGo, TUTORIAL_CLOCK_FAILSAFE_MS, TUTORIAL_CLOCK_HARD_MS, TutorialHold } from './clockGate';

describe('the clock waits for the player (ADR-030, CLARIDAD2 §2.3, §2.4)', () => {
  it('session 1: the first creature does not start the clock; VELA’s line does', () => {
    const held = { phase: 'ready' as const, tutorialHold: true };
    expect(shouldStartClock(held, true, 5000)).toBe(false);
    expect(shouldStartClock(held, false, 5000)).toBe(true);
  });

  it('with the story off or the tutorial skipped, the first seed starts it at once', () => {
    expect(shouldStartClock({ phase: 'ready', tutorialHold: true }, false, 0)).toBe(true);
  });

  it('a session never waits forever for the tutorial', () => {
    expect(shouldStartClock({ phase: 'ready', tutorialHold: true }, true, TUTORIAL_CLOCK_FAILSAFE_MS + 1)).toBe(true);
  });

  it('nothing to start when the clock already runs or no seed is held', () => {
    expect(shouldStartClock({ phase: 'running', tutorialHold: true }, false, 0)).toBe(false);
    expect(shouldStartClock({ phase: 'ready' }, false, 0)).toBe(false);
    expect(shouldStartClock(null, false, 0)).toBe(false);
  });

  it('VELA stops a running clock only; a sheet stops it in any phase', () => {
    expect(clockPauses({ talking: true, phase: 'running', sheet: false })).toEqual({ story: true, sheet: false });
    expect(clockPauses({ talking: true, phase: 'ready', sheet: false })).toEqual({ story: false, sheet: false });
    expect(clockPauses({ talking: false, phase: 'running', sheet: true })).toEqual({ story: false, sheet: true });
  });

  it('QA#19/#40: the clock does not move while a sheet is open, so a session cannot end behind it', () => {
    const bus = new Bus<GameEvents>();
    const game = createGame({ bus, cycle: 'sessions' });
    game.setGridSize(128, 128);
    const se = () => game.view().session!;
    // Start the clock the way the game does (the first seed, or the tutorial's startClock).
    if (game.actions.startClock) game.actions.startClock();
    else game.actions.seedAt(64, 64);
    for (let i = 0; i < 10; i++) game.tick(0.1, null);
    const running = se();
    expect(running.phase).toBe('running');
    const left = running.remaining;
    // The Bestiary opens: main.ts sets the 'sheet' pause, the game is paused.
    game.isPaused = clockPauses({ talking: false, phase: running.phase, sheet: true }).sheet;
    for (let i = 0; i < 600; i++) game.tick(0.1, null);
    expect(se().remaining).toBe(left);
    expect(se().phase).toBe('running');
    game.isPaused = false;
    for (let i = 0; i < 10; i++) game.tick(0.1, null);
    expect(se().remaining).toBeLessThan(left);
  });
});

describe('the start card never hangs on «La criatura se está despertando…» (QA-CLARIDAD-2 B1)', () => {
  it('«¡Empezar!» waits for the lit culture, counting down the seconds on the button', () => {
    expect(startGo(false, 0)).toEqual({ ready: false, secondsLeft: START_WAKE_MAX_S });
    expect(startGo(false, 1200).secondsLeft).toBe(START_WAKE_MAX_S - 1);
    expect(startGo(true, 300)).toEqual({ ready: true, secondsLeft: 0 });
  });

  it('is enabled after the short maximum wait even when the culture never lights (a stalled device)', () => {
    expect(startGo(false, START_WAKE_MAX_S * 1000 - 1).ready).toBe(false);
    expect(startGo(false, START_WAKE_MAX_S * 1000)).toEqual({ ready: true, secondsLeft: 0 });
    expect(startGo(false, 120_000).ready).toBe(true);
    expect(START_WAKE_MAX_S).toBeLessThanOrEqual(6);
  });
});

// QA-3 N4 (v0.026, shots 168–175): on a phone at 4–5 fps the first creature incubated in the dark for ~30 s, the
// 30-s failsafe started the clock, and VELA never said «Tócala»: both players ended session 1 with 0–1 taps.
describe('the session-1 failsafe counts only the time VELA could talk (QA-3 N4)', () => {
  const s = { phase: 'ready' as const, tutorialHold: true };

  it('QA-3: 31 s of dark incubation on a slow phone never starts the clock before the tutorial', () => {
    const h = new TutorialHold();
    let start = false;
    for (let t = 0; t <= 31_000; t += 250) start ||= h.step(s, t, false, true);
    expect(start).toBe(false);
  });

  it('once the dish is lit, the failsafe runs as before', () => {
    const h = new TutorialHold();
    let at = -1;
    for (let t = 0; t <= 80_000 && at < 0; t += 250) if (h.step(s, t, t >= 20_000, true)) at = t;
    expect(at).toBeGreaterThan(20_000 + TUTORIAL_CLOCK_FAILSAFE_MS - 500);
    expect(at).toBeLessThan(20_000 + TUTORIAL_CLOCK_FAILSAFE_MS + 500);
  });

  it('a dish that never lights still never holds the session forever', () => {
    const h = new TutorialHold();
    let at = -1;
    for (let t = 0; t <= 200_000 && at < 0; t += 250) if (h.step(s, t, false, true)) at = t;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(TUTORIAL_CLOCK_HARD_MS + 250);
  });

  it('the tutorial done: at once; not held: never', () => {
    expect(new TutorialHold().step(s, 0, false, false)).toBe(true);
    expect(new TutorialHold().step({ phase: 'running', tutorialHold: true }, 0, true, false)).toBe(false);
  });
});
