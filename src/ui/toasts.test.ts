import { describe, expect, it } from 'vitest';
import { TOAST_CALM_MS, toastGestureResult, toastMayEnter, toastYieldAction, toastYields } from './toasts';

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

describe('a toast never sits on VELA\'s line', () => {
  it('an info toast on screen steps aside when something starts talking', () => {
    expect(toastYields('info', true)).toBe(true);
    expect(toastYields('good', true)).toBe(true);
  });

  it('nothing talking: it stays; a warning always stays', () => {
    expect(toastYields('info', false)).toBe(false);
    expect(toastYields('warn', true)).toBe(false);
    expect(toastYields('bad', true)).toBe(false);
  });
});

describe('toasts never bounce in and out (owner: «los mensajes rebotan y no paran de rebotar»)', () => {
  it('a toast steps aside for VELA once; asked a second time it is dropped, never shown again', () => {
    expect(toastYieldAction('info', true, false)).toBe('wait');
    expect(toastYieldAction('info', true, true)).toBe('drop');
    expect(toastYieldAction('good', false, true)).toBe('stay');
  });

  it('warnings never step aside', () => {
    expect(toastYieldAction('warn', true, false)).toBe('stay');
    expect(toastYieldAction('bad', true, true)).toBe('stay');
  });

  it('a waiting toast enters only after the screen was calm for a while (a flickering «talking» cannot ping-pong it)', () => {
    expect(toastMayEnter(false, 1000, 1000 - TOAST_CALM_MS + 1)).toBe(false);
    expect(toastMayEnter(false, 1000, 1000 - TOAST_CALM_MS)).toBe(true);
    expect(toastMayEnter(true, 1000, 999)).toBe(true);
  });
});
