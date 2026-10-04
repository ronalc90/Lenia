import { describe, expect, it } from 'vitest';
import * as B from '../game/balance';
import { createGame } from '../game/game';
import type { StorageLike } from '../game/save';
import { checksum, utf8ToBase64 } from '../game/state';
import { creature, recordingBus, report, run, seededRng } from '../game/testUtil';
import { createIntegrity } from './integrity';

const T0 = Date.UTC(2026, 9, 10, 12);

function memStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** Two fake clocks: performance.now() and Date.now(). */
function clocks() {
  const c = { perf: 1000, date: T0 };
  return { c, perfNow: () => c.perf, dateNow: () => c.date };
}

/** A real save string of a short honest game. */
function honestSave(): string {
  const now = T0 - 3600_000;
  const g = createGame({ bus: recordingBus().bus, rng: seededRng(5), now: () => now });
  run(g, 120, report([creature({ id: 1 })]), 0.25);
  return g.serialize();
}

/** Re-wrap edited data with a correct checksum (what a careful cheater does). */
function resum(data: unknown): string {
  const d = JSON.stringify(data);
  return `{"v":${B.SAVE_VERSION},"sum":"${checksum(d)}","data":${d}}`;
}

describe('integrity: speed hacks', () => {
  it('stays clean when both clocks advance together (with small jitter)', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    for (let i = 0; i < 200; i++) {
      c.perf += 5000 + (i % 3) * 7;
      c.date += 5000 - (i % 2) * 9;
      it.sample();
    }
    expect(it.report()).toEqual({ speedHack: false, clockRollback: false, tampered: false, debug: false });
  });

  it('flags performance.now() running 2× faster than the wall clock', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    for (let i = 0; i < 60; i++) {
      c.perf += 10_000;
      c.date += 5000;
      it.sample();
    }
    expect(it.report().speedHack).toBe(true);
    expect(it.reasons()).toContain('perf_fast');
  });

  it('flags Date.now() running faster than performance.now()', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    for (let i = 0; i < 60; i++) {
      c.perf += 4000;
      c.date += 8000;
      it.sample();
    }
    expect(it.report().speedHack).toBe(true);
  });

  it('ignores sleeps and background throttling (big gaps between samples)', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    for (let i = 0; i < 40; i++) {
      // Laptop lid closed: Date jumps, performance.now() does not.
      c.date += 30 * 60_000;
      it.sample();
      for (let k = 0; k < 8; k++) {
        c.perf += 5000;
        c.date += 5000;
        it.sample();
      }
    }
    expect(it.report().speedHack).toBe(false);
  });

  it('a single odd window is not enough', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    for (let i = 0; i < 7; i++) {
      c.perf += 10_000;
      c.date += 5000;
      it.sample();
    }
    for (let i = 0; i < 100; i++) {
      c.perf += 5000;
      c.date += 5000;
      it.sample();
    }
    expect(it.report().speedHack).toBe(false);
  });
});

describe('integrity: clock rollback', () => {
  it('flags the clock going back more than 10 minutes (remembered across reloads)', () => {
    const storage = memStorage();
    const { c, perfNow, dateNow } = clocks();
    const a = createIntegrity({ storage, perfNow, dateNow });
    c.date += 24 * 3600_000; // "skip a day" to collect offline essence…
    a.sample();
    const b = createIntegrity({ storage, perfNow, dateNow }); // …reload…
    c.date -= 24 * 3600_000; // …and set the clock back
    b.sample();
    expect(b.report().clockRollback).toBe(true);
    expect(createIntegrity({ storage, perfNow, dateNow }).report().clockRollback).toBe(true); // sticky
  });

  it('small corrections are fine', () => {
    const { c, perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    it.sample();
    c.date -= 3 * 60_000; // NTP fix
    it.sample();
    expect(it.report().clockRollback).toBe(false);
  });

  it('flags a save written in the future (save.ts savedAt)', () => {
    const { perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    it.noteSavedAt(T0 - 3600_000);
    expect(it.report().clockRollback).toBe(false);
    it.noteSavedAt(T0 + 6 * 3600_000);
    expect(it.report().clockRollback).toBe(true);
  });
});

describe('integrity: save tampering', () => {
  it('a stored save edited by hand (checksum mismatch) is flagged; an honest one is not', () => {
    const { perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    const save = honestSave();
    it.checkSave(save);
    it.checkSave(null);
    it.checkSave('{"v":1,"sum":"abc'); // truncated write: corruption, not an edit
    expect(it.report().tampered).toBe(false);
    const storage = memStorage();
    storage.setItem('bioluma.game', save.replace(/"essence":[0-9.e+]+/, '"essence":999999999'));
    const fromStorage = createIntegrity({ storage, perfNow, dateNow });
    fromStorage.checkSave(); // reads the game's own key
    expect(fromStorage.report().tampered).toBe(true);
    it.checkSave(save.replace(/"essence":[0-9.e+]+/, '"essence":999999999'));
    expect(it.report().tampered).toBe(true);
    expect(it.reasons()).toContain('save_checksum');
  });

  it('imports: honest export passes, edited export (bad sum) and edited-and-resummed implausible export are flagged', () => {
    const { perfNow, dateNow } = clocks();
    const save = honestSave();
    const honest = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    honest.noteImport(B.EXPORT_PREFIX + utf8ToBase64(save));
    honest.noteImport('hello, not a save');
    honest.noteImport(B.EXPORT_PREFIX + '%%%garbage');
    expect(honest.report().tampered).toBe(false);

    const badSum = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    badSum.noteImport(B.EXPORT_PREFIX + utf8ToBase64(save.replace(/"era":1/, '"era":9')));
    expect(badSum.report().tampered).toBe(true);
    expect(badSum.reasons()).toContain('import_checksum');

    const data = (JSON.parse(save) as { data: { stats: { totalEssence: number }; eraEssence: number } }).data;
    data.stats.totalEssence = 1e30;
    data.eraEssence = 1e30;
    const resummed = createIntegrity({ storage: memStorage(), perfNow, dateNow });
    resummed.noteImport(B.EXPORT_PREFIX + utf8ToBase64(resum(data)));
    expect(resummed.report().tampered).toBe(true);
    expect(resummed.reasons()).toContain('import_implausible');
  });
});

describe('integrity: debug handle', () => {
  it('reading window.bioluma marks the profile, defining it does not', () => {
    const storage = memStorage();
    const { perfNow, dateNow } = clocks();
    const it = createIntegrity({ storage, perfNow, dateNow });
    const win: Record<string, unknown> = {};
    const handle = { game: 'g' };
    it.guardDebugHandle(win, 'bioluma', handle);
    expect(it.report().debug).toBe(false);
    expect(Object.keys(win)).toEqual([]); // not enumerable
    expect(win.bioluma).toBe(handle);
    expect(it.report().debug).toBe(true);
    expect(createIntegrity({ storage, perfNow, dateNow }).report().debug).toBe(true);
  });

  it('start()/stop() sample on a timer and never throw with broken clocks', () => {
    const it = createIntegrity({
      storage: memStorage(),
      perfNow: () => {
        throw new Error('nope');
      },
      dateNow: () => Number.NaN,
      sampleMs: 10,
    });
    expect(() => {
      it.start();
      it.sample();
      it.stop();
    }).not.toThrow();
  });
});
