import { describe, expect, it } from 'vitest';
import { SLOW_DEVICE_TEXT, SlowDeviceNote } from './slowDevice';
import { toastMs } from './toastQueue';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

// QA-4 N12: «Este aparato va despacio: el reloj cuenta el tiempo de la placa, así tus criaturas no pierden…» came on
// every reload (4 times) and did not fit in its 3 s.
describe('the slow-device note (QA-4 N12)', () => {
  it('QA-4 N12: is said once per game, not once per page load', () => {
    const storage = memory();
    const a = new SlowDeviceNote(storage);
    expect(a.shouldTell()).toBe(true);
    a.told();
    expect(a.shouldTell()).toBe(false);
    expect(new SlowDeviceNote(storage).shouldTell()).toBe(false);
    // Without storage (private window) it still says it once per load.
    const b = new SlowDeviceNote(null);
    expect(b.shouldTell()).toBe(true);
    b.told();
    expect(b.shouldTell()).toBe(false);
  });

  it('QA-4 N12: fits in the time a toast stays', () => {
    for (const s of [SLOW_DEVICE_TEXT.es, SLOW_DEVICE_TEXT.en]) {
      expect(s.length).toBeLessThanOrEqual(64);
      expect(toastMs(s, false)).toBeGreaterThanOrEqual(1500 + 40 * s.length);
    }
  });
});
