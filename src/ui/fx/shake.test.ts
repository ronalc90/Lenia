import { describe, expect, it } from 'vitest';
import { Shake, SHAKE } from './shake';

/** A-9 acceptance: the camera model never passes 4 px, settles fast, and is still with Reduce motion. */
describe('living camera (trauma shake)', () => {
  it('never moves more than 4 px, even at trauma 1', () => {
    const s = new Shake();
    s.add(1);
    let worst = 0;
    for (let f = 0; f < 600; f++) {
      if (f % 30 === 0) s.add(1);
      s.update(1 / 60, false);
      worst = Math.max(worst, Math.abs(s.x), Math.abs(s.y));
    }
    expect(worst).toBeLessThanOrEqual(SHAKE.maxPx);
    expect(worst).toBeGreaterThan(1); // and it does move
  });

  it('a Spark (+0,35) is back to rest in at most 0,2 s', () => {
    const s = new Shake();
    s.add(SHAKE.spark);
    let t = 0;
    while (s.trauma > 0 && t < 1) {
      s.update(1 / 60, false);
      t += 1 / 60;
    }
    expect(t).toBeLessThanOrEqual(0.2 + 1e-9);
    s.update(1 / 60, false);
    expect(Math.abs(s.x)).toBe(0);
    expect(Math.abs(s.y)).toBe(0);
  });

  it('is always still with Reduce motion (or under a finger)', () => {
    const s = new Shake();
    for (let f = 0; f < 120; f++) {
      s.add(0.5);
      s.punch();
      s.update(1 / 60, true);
      expect(s.x).toBe(0);
      expect(s.y).toBe(0);
      expect(s.zoom).toBe(1);
      expect(s.breathX).toBe(0);
    }
  });

  it('small events barely show (trauma²): a birth moves under 0,1 px', () => {
    const s = new Shake();
    s.add(SHAKE.born);
    let worst = 0;
    for (let f = 0; f < 30; f++) {
      s.update(1 / 60, false);
      worst = Math.max(worst, Math.abs(s.x), Math.abs(s.y));
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('a birth punches the zoom to +1,2 % and back within 300 ms', () => {
    const s = new Shake();
    s.punch();
    let peak = 1;
    for (let t = 0; t < 0.3; t += 1 / 240) {
      s.update(1 / 240, false);
      peak = Math.max(peak, s.zoom);
    }
    expect(peak).toBeGreaterThan(1.011);
    expect(peak).toBeLessThan(1.013);
    expect(Math.abs(s.zoom - 1)).toBeLessThan(0.0005);
  });
});
