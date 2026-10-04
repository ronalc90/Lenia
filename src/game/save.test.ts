import { afterEach, describe, expect, it } from 'vitest';
import { createGame } from './game';
import { clearSave, decodeDish, encodeDish, loadSave, setStorage, writeSave, type StorageLike } from './save';
import { deserializeState } from './state';
import { creature, GYRO_SIG, recordingBus, report, seededRng } from './testUtil';

function played() {
  const { bus } = recordingBus();
  const g = createGame({ bus, rng: seededRng(5) });
  g.tick(0.5, report([creature({ id: 1, x: 10 }), creature({ id: 2, x: 120, signature: GYRO_SIG, behavior: 'spinner' })]));
  g.actions.seedAt(5, 5);
  g.setSpeciesPortrait(g.view().species[0].id, { w: 4, h: 3, data: new Float32Array([0, 0.5, 1, 0.25, 0, 0, 0, 1, 0.75, 0.1, 0.2, 0.3]) });
  g.actions.renameSpecies(g.view().species[1].id, 'Remolino ñandú');
  g.actions.setSetting('lang', 'en');
  return g;
}

describe('serialize / import', () => {
  it('roundtrips through serialize and through the export string', () => {
    const g = played();
    const str = g.serialize();
    const { bus } = recordingBus();
    const g2 = createGame({ bus }, str);
    expect(JSON.stringify(g2.state)).toBe(JSON.stringify(g.state));
    const exp = g.exportString();
    expect(exp.startsWith('BIOLUMA1.')).toBe(true);
    const g3 = createGame({ bus: recordingBus().bus });
    expect(g3.importString(exp)).toBe(true);
    expect(JSON.stringify(g3.state)).toBe(JSON.stringify(g.state));
    expect(g3.view().species[1].name).toBe('Remolino ñandú');
    expect(g3.view().species[0].portrait!.w).toBe(4);
    expect(g3.view().settings.lang).toBe('en');
  });

  it('rejects garbage, wrong prefix, bad checksum and out-of-range values', () => {
    const g = played();
    const before = JSON.stringify(g.state);
    const bad = [
      '',
      'hello',
      'BIOLUMA1.',
      'BIOLUMA1.!!!!',
      'BIOLUMA1.' + btoa('{"v":1}'),
      'PETRI1.' + g.exportString().slice(9),
      g.serialize(), // raw JSON is not an export string
    ];
    for (const b of bad) expect(g.importString(b)).toBe(false);
    // Tamper with the payload but keep a valid prefix → checksum mismatch.
    const raw = g.serialize().replace(/"essence":[0-9.e+-]+/, '"essence":1e300');
    expect(g.importString('BIOLUMA1.' + btoa(unescape(encodeURIComponent(raw))))).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('validation rejects negative resources / levels above max even with a correct checksum', async () => {
    const { checksum } = await import('./state');
    const g = played();
    const data = JSON.parse(g.serialize()).data;
    const forge = (patch: (d: Record<string, unknown>) => void) => {
      const d = JSON.parse(JSON.stringify(data));
      patch(d);
      const s = JSON.stringify(d);
      return `{"v":1,"sum":"${checksum(s)}","data":${s}}`;
    };
    expect(deserializeState(forge(() => {}))).not.toBeNull();
    expect(deserializeState(forge((d) => (d.essence = -5)))).toBeNull();
    expect(deserializeState(forge((d) => (d.samples = 'lots')))).toBeNull();
    expect(deserializeState(forge((d) => ((d.upgrades as Record<string, number>).dropper = 99)))).toBeNull();
    expect(deserializeState(forge((d) => (d.nodes = ['flow'])))).toBeNull();
    expect(deserializeState(forge((d) => ((d.calib as Record<string, number>).mu = 7)))).toBeNull();
    expect(deserializeState(forge((d) => (d.era = 0)))).toBeNull();
    // Unknown upgrades from a future version are dropped, not fatal.
    const ok = deserializeState(forge((d) => ((d.upgrades as Record<string, number>).warpDrive = 3)));
    expect(ok).not.toBeNull();
    expect(ok!.upgrades.warpDrive).toBeUndefined();
  });

  it('a corrupt save string passed to createGame starts a fresh game', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus }, '{"v":1,"sum":"00000000","data":{}}');
    expect(g.view().essence).toBe(20);
    expect(g.view().era).toBe(1);
  });
});

describe('save.ts storage helpers', () => {
  afterEach(() => setStorage(undefined));

  it('dish RLE roundtrip', () => {
    const grid = new Uint8Array(1000);
    for (let i = 300; i < 340; i++) grid[i] = (i * 7) % 256 || 1;
    grid[999] = 200;
    const enc = encodeDish(grid);
    expect(enc.length).toBeLessThan(200);
    expect(decodeDish(enc, 1000)).toEqual(grid);
    expect(decodeDish(enc, 999)).toBeNull();
  });

  it('works without any storage (in-memory fallback) and keeps a last good copy', () => {
    setStorage(null);
    expect(loadSave().game).toBeNull();
    const g = played();
    const dish = new Uint8Array(6 * 4).map((_, i) => (i % 3 === 0 ? 128 : 0));
    expect(writeSave(g.serialize(), dish, 6, 4, 1_000_000)).toBe(true);
    const l = loadSave();
    expect(l.game).toBe(g.serialize());
    expect(l.dish).toEqual(dish);
    expect([l.dishW, l.dishH, l.savedAt]).toEqual([6, 4, 1_000_000]);
    clearSave();
    expect(loadSave().game).toBeNull();
  });

  it('falls back to the backup when the main copy is corrupt; survives a throwing storage', () => {
    const map = new Map<string, string>();
    const store: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
    setStorage(store);
    const g = played();
    const first = g.serialize();
    writeSave(first);
    g.actions.renameSpecies(g.view().species[0].id, 'Otra');
    writeSave(g.serialize());
    map.set('bioluma.game', first.slice(0, -5) + 'xx}}'); // corrupt main
    expect(loadSave().game).toBe(first);

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    setStorage(throwing);
    expect(() => loadSave()).not.toThrow();
    expect(writeSave(g.serialize())).toBe(false);
    expect(() => clearSave()).not.toThrow();
  });
});
