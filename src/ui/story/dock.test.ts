import { describe, expect, it } from 'vitest';
import { endsWithTree, sceneShowing, storyHold, storyLook } from './dock';

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

// QA-3 N6 (v0.026, shots 029, 049, 183): VELA's Tree lines «¡Ese late en verde! Lo puedes comprar. Tócalo.» and «Te lo
// dejo elegido para la próxima sesión.» came back on the dish after the Tree closed, over the Sembrar button.
describe('VELA\'s Tree lines stay in the Tree (QA-3 N6)', () => {
  it('QA-3: a Tree scene never shows over the dish', () => {
    for (const id of ['t_tree', 't_world', 'a1_night']) {
      expect(storyHold(id, { treeOpen: true, cardOpen: false })).toBe('dock');
      expect(storyHold(id, { treeOpen: false, cardOpen: false })).toBe('hide');
    }
  });

  it('QA-3: closing the Tree ends the Tree scene on screen (it does not wait for the next visit)', () => {
    expect(endsWithTree('t_tree', true, false)).toBe(true);
    expect(endsWithTree('t_tree', true, true)).toBe(false);
    expect(endsWithTree('t_intro', true, false)).toBe(false);
    expect(endsWithTree(null, true, false)).toBe(false);
  });

  it('the other scenes: hidden in the Tree and over a card, shown on the dish', () => {
    expect(storyHold('t_intro', { treeOpen: true, cardOpen: false })).toBe('hide');
    expect(storyHold('t_intro', { treeOpen: false, cardOpen: true })).toBe('hide');
    expect(storyHold('t_intro', { treeOpen: false, cardOpen: false })).toBeNull();
    expect(storyHold(null, { treeOpen: false, cardOpen: false })).toBeNull();
  });
});
