import { describe, expect, it } from 'vitest';
import { toastGestureResult } from './toasts';

describe('toasts close when tapped (owner bug B-10.4)', () => {
  it('a tap on a toast without an action closes it', () => {
    expect(toastGestureResult({ dx: 2, dy: 1, onAction: false }, false)).toBe('dismiss');
  });

  it('a tap on an achievement toast closes it; its "Ver" button opens the card', () => {
    expect(toastGestureResult({ dx: 0, dy: 0, onAction: false }, true)).toBe('dismiss');
    expect(toastGestureResult({ dx: 0, dy: 0, onAction: true }, true)).toBe('action');
  });

  it('a swipe up of more than 24 px closes it', () => {
    expect(toastGestureResult({ dx: 4, dy: -30, onAction: false }, false)).toBe('dismiss');
  });

  it('a finger that slides sideways (scrolling, aiming) does nothing', () => {
    expect(toastGestureResult({ dx: 40, dy: 3, onAction: false }, false)).toBe('none');
  });
});
