import { describe, expect, it } from 'vitest';
import { SLIDER_SLOP_PX, sliderGesture, sliderValueAt } from './sliderGesture';

// QA-4 N13 (c1-025 → c1-026): scrolling Settings with a finger that started on «Ambiente» moved it from 50 to 10: the
// native range jumps to where a touch lands. The slider moves only with a horizontal drag, or a tap that stays put.
describe('the volume slider ignores vertical swipes (QA-4 N13)', () => {
  it('QA-4 N13: a vertical swipe is a scroll; a horizontal drag moves the slider', () => {
    expect(sliderGesture(2, 30, 'touch')).toBe('scroll');
    expect(sliderGesture(30, 4, 'touch')).toBe('drag');
    expect(sliderGesture(3, 3, 'touch')).toBe('wait');
    expect(sliderGesture(14, 12, 'touch')).toBe('scroll');
    // A mouse never scrolls the page by dragging: it drags at once.
    expect(sliderGesture(0, 0, 'mouse')).toBe('drag');
    expect(SLIDER_SLOP_PX).toBeGreaterThanOrEqual(6);
  });

  it('a tap or a drag sets the value under the finger, in steps', () => {
    const rect = { left: 0, width: 226 };
    expect(sliderValueAt(13, rect, 26, 0.05)).toBe(0);
    expect(sliderValueAt(213, rect, 26, 0.05)).toBe(1);
    expect(sliderValueAt(113, rect, 26, 0.05)).toBe(0.5);
    expect(sliderValueAt(-50, rect, 26, 0.05)).toBe(0);
  });
});
