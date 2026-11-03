import { describe, expect, it } from 'vitest';
import { storyLook } from './dock';

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
