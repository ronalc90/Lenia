import { describe, expect, it } from 'vitest';
import { Readout, READOUT, wholeRate } from './readout';

describe('the Luz counter reads like an instrument (ARTE-REALISTA §6.4)', () => {
  it('counts up in whole steps at 8 Hz and reaches the value within 600 ms', () => {
    const r = new Readout();
    expect(r.tick(10, 0, false)).toBe(10);
    const seen: number[] = [];
    let changes = 0;
    let last = 10;
    for (let t = 0; t <= 700; t += 16) {
      const v = r.tick(58, t, false);
      expect(Number.isInteger(v)).toBe(true);
      if (v !== last) {
        changes++;
        last = v;
      }
      seen.push(v);
    }
    expect(r.tick(58, 600, false)).toBe(58);
    // At most 8 changes a second: never faster than the readout's rate.
    expect(changes).toBeLessThanOrEqual(Math.ceil((600 * READOUT.hz) / 1000) + 1);
    // Monotonic: it never overshoots and comes back.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(Math.max(...seen)).toBe(58);
  });

  it('spending shows at once and Reduce motion shows the final value directly', () => {
    const r = new Readout();
    r.tick(100, 0, false);
    expect(r.tick(96, 10, false)).toBe(96);
    expect(r.tick(500, 20, true)).toBe(500);
  });

  it('light on its way to the counter is counted when it lands', () => {
    const r = new Readout();
    r.tick(20, 0, false);
    r.hold(8, 450);
    // The view still says 20 for a frame (the collection is told at the next view): nothing jumps down.
    expect(r.tick(20, 5, false)).toBe(20);
    // The wallet already has 28, but 8 are still flying: the readout stays at 20.
    for (let t = 0; t < 440; t += 16) expect(r.tick(28, t, false)).toBe(20);
    let v = 20;
    for (let t = 450; t <= 1100; t += 16) v = r.tick(28, t, false);
    expect(v).toBe(28);
  });

  it('the rate is whole from 1 (a decimal only below 1)', () => {
    expect(wholeRate(12.4, 'es')).toBe('12');
    expect(wholeRate(2.5, 'en')).toBe('3');
    expect(wholeRate(0.46, 'es')).toBe('0,5');
    expect(wholeRate(0, 'es')).toBe('0');
    expect(wholeRate(1234.2, 'en')).toBe('1,234');
  });
});
