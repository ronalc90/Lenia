import { describe, expect, it } from 'vitest';
import { TOAST_CALM_MS, TOAST_READ_MS, TOAST_SETTLE_MS, toastGestureResult, toastMayEnter, toastYieldAction, toastYields } from './toasts';

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
  it('a toast on screen is never sent away to come back (QA-3): it stays until read, then gives way for good', () => {
    expect(toastYieldAction('info', true, 10)).toBe('stay');
    expect(toastYieldAction('info', true, TOAST_READ_MS)).toBe('leave');
    expect(toastYieldAction('good', false, 5000)).toBe('stay');
  });

  it('warnings never step aside', () => {
    expect(toastYieldAction('warn', true, TOAST_READ_MS)).toBe('stay');
    expect(toastYieldAction('bad', true, 99999)).toBe('stay');
  });

  it('a waiting toast enters only after the screen was calm for a while (a flickering «talking» cannot ping-pong it)', () => {
    expect(toastMayEnter(false, 1000, 1000 - TOAST_CALM_MS + 1)).toBe(false);
    expect(toastMayEnter(false, 1000, 1000 - TOAST_CALM_MS)).toBe(true);
    expect(toastMayEnter(true, 1000, 999)).toBe(true);
  });

  it('a new toast lets the VELA line of the same event speak first (TOAST_SETTLE_MS)', () => {
    expect(toastMayEnter(false, 1000, -Infinity, 1000 - TOAST_SETTLE_MS + 1)).toBe(false);
    expect(toastMayEnter(false, 1000, -Infinity, 1000 - TOAST_SETTLE_MS)).toBe(true);
    expect(toastMayEnter(true, 1000, -Infinity, 1000)).toBe(true);
  });
});
