import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../../core/bus';
import { createGame } from '../../game/game';
import { clockPauses, shouldStartClock, TUTORIAL_CLOCK_FAILSAFE_MS } from './clockGate';

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
