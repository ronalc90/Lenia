import { describe, expect, it } from 'vitest';
import { isFullMoon, moonInfo } from './moon';

// Instants of syzygy taken from eclipses (exact by definition) and published phase tables (UTC).
const FULL = ['2018-01-31T13:27:00Z', '2022-11-08T11:02:00Z', '2025-03-14T06:55:00Z', '2026-03-03T11:38:00Z', '2024-01-25T17:54:00Z'];
const NEW = ['2017-08-21T18:30:00Z', '2024-04-08T18:21:00Z', '2023-04-20T04:13:00Z'];
const FIRST_QUARTER = ['2024-01-18T03:53:00Z'];
const LAST_QUARTER = ['2024-02-02T23:18:00Z'];

describe('moon phase', () => {
  it('known full moons are fully lit', () => {
    for (const d of FULL) {
      const m = moonInfo(new Date(d));
      expect(m.illumination, d).toBeGreaterThan(0.995);
      expect(Math.abs(m.phase - 0.5), d).toBeLessThan(0.02);
      expect(m.name).toBe('full');
      expect(isFullMoon(new Date(d))).toBe(true);
    }
  });

  it('known new moons are dark', () => {
    for (const d of NEW) {
      const m = moonInfo(new Date(d));
      expect(m.illumination, d).toBeLessThan(0.005);
      expect(m.name).toBe('new');
      expect(isFullMoon(new Date(d))).toBe(false);
    }
  });

  it('quarters are half lit, waxing then waning', () => {
    for (const d of FIRST_QUARTER) {
      const m = moonInfo(new Date(d));
      expect(Math.abs(m.illumination - 0.5), d).toBeLessThan(0.03);
      expect(m.waxing).toBe(true);
      expect(m.name).toBe('firstQuarter');
    }
    for (const d of LAST_QUARTER) {
      const m = moonInfo(new Date(d));
      expect(Math.abs(m.illumination - 0.5), d).toBeLessThan(0.03);
      expect(m.waxing).toBe(false);
      expect(m.name).toBe('lastQuarter');
    }
  });

  it('the full-moon window lasts about two and a half days', () => {
    const full = new Date('2025-03-14T06:55:00Z').getTime();
    const H = 3600_000;
    expect(isFullMoon(new Date(full + 24 * H))).toBe(true);
    expect(isFullMoon(new Date(full - 24 * H))).toBe(true);
    expect(isFullMoon(new Date(full + 48 * H))).toBe(false);
    expect(isFullMoon(new Date(full - 48 * H))).toBe(false);
  });

  it('age grows through the month and wraps', () => {
    const t0 = new Date('2024-04-08T18:21:00Z').getTime();
    let prev = -1;
    for (let d = 1; d < 29; d++) {
      const age = moonInfo(new Date(t0 + d * 86400_000)).ageDays;
      expect(age).toBeGreaterThan(prev);
      prev = age;
    }
    expect(moonInfo(new Date(t0 + 30 * 86400_000)).ageDays).toBeLessThan(2);
  });
});
