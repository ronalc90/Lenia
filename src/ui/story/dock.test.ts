import { describe, expect, it } from 'vitest';
import { sceneShowing, storyLook } from './dock';

describe('VELA docks over a sheet without dimming it (owner bug B-10.2)', () => {
  it('docked: no dim, no scrim, no spotlight behind the sheet', () => {
    expect(storyLook('dock', false, false)).toEqual({ dim: 0, scrim: false, spotlight: false });
    expect(storyLook('dock', true, false)).toEqual({ dim: 0, scrim: false, spotlight: false });
    expect(storyLook('dock', false, true)).toEqual({ dim: 0, scrim: false, spotlight: false });
  });

  it('on the dish: lines dim the screen around their target, a task dims less, a choice gets its scrim', () => {
    expect(storyLook(null, false, false)).toEqual({ dim: 0.6, scrim: false, spotlight: true });
    expect(storyLook(null, true, false)).toEqual({ dim: 0.42, scrim: false, spotlight: true });
    expect(storyLook(null, false, true).scrim).toBe(true);
  });
});

describe('VELA never vanishes while her box changes side (integrator review of v0.019)', () => {
  it('a box hidden only to re-enter on the other side still counts as showing', () => {
    // The box leaves this frame and comes back on the next: the loop must run that next frame and the
    // host's hold (dock) must not drop meanwhile, or the line is never seen and the scene soft-locks.
    expect(sceneShowing({ box: false, reenter: true, task: false, choice: false })).toBe(true);
  });

  it('nothing shown and nothing waiting: the scene is not showing', () => {
    expect(sceneShowing({ box: false, reenter: false, task: false, choice: false })).toBe(false);
    expect(sceneShowing({ box: true, reenter: false, task: false, choice: false })).toBe(true);
    expect(sceneShowing({ box: false, reenter: false, task: true, choice: false })).toBe(true);
    expect(sceneShowing({ box: false, reenter: false, task: false, choice: true })).toBe(true);
  });
});
