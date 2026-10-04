import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import type { Behavior, GameView } from '../core/types';
import { DATOS_PER_NEW_SPECIES, SESSION_TIME_PER_SPECIES } from '../game/cycleBalance';
import { MOMENT_BY_ID, MOMENTS } from './catalog';
import { BRIEF_MS, COOLDOWN_MS, MAX_QUEUE_MS, MOMENTS_STORAGE_KEY, RITUAL_BLOCK_MS } from './config';
import { SAMPLE_PAYLOADS, createMoments } from './moments';
import { creature, harness, makeView, memoryStorage, species, type Harness } from './testUtil';
import type { MomentId } from './types';

const LONG = 3000; // longer than any delay in the catalog (settle excluded)

function emit<K extends keyof GameEvents>(h: Harness, type: K, payload: GameEvents[K]): void {
  h.bus.emit(type, payload);
}

function priceView(alive: number, used: number, freeSlots: number, satMult: number): Partial<GameView> {
  const crowdMult = 1 + 0.25 * alive;
  return {
    seedCost: 2 * crowdMult * satMult,
    seedPrice: { base: 2, alive, crowdMult, freeSlots, used, satMult, bigMult: 2.25, freeSeeds: 0 },
  };
}

/** Sessions loop: base 4, ×1,05 per seed bought today (whole Esencia), never crowding. */
function sessionPriceView(bought: number): Partial<GameView> {
  const stepMult = Math.pow(1.05, bought);
  return {
    seedCost: Math.max(1, Math.round(4 * stepMult)),
    seedPrice: { base: 4, alive: 3, crowdMult: 1, freeSlots: 5, used: 3, satMult: 1, bigMult: 2.25, freeSeeds: 0, cheapMult: 1, stepMult, bought, capacity: 5, full: false },
  };
}

/** Make the moment `id` happen in the harness (event or view change). */
function happen(h: Harness, id: MomentId): void {
  const def = MOMENT_BY_ID.get(id)!;
  switch (id) {
    case 'seedPrice':
      Object.assign(h.view, sessionPriceView(4));
      return;
    case 'extinctionReady':
      h.view.extinction = { ...h.view.extinction, available: true, genomeGain: 7 };
      return;
    case 'clock':
      (h.view as { session?: unknown }).session = { n: 1, phase: 'running', remaining: 58 };
      return;
    case 'golden':
      h.view.golden = { x: 50, y: 50, life: 1 };
      emit(h, 'goldenSpawn', { x: 50, y: 50 });
      return;
    case 'autoseed':
      emit(h, 'seed', { x: 1, y: 2, cost: 3, manual: false });
      return;
    case 'secondSpecies':
      h.view.species = [species('sp1'), species('sp2')];
      h.view.creatures = [{ ...creature(1, 'stable', 20, 20), speciesId: 'sp1' }];
      emit(h, 'speciesNew', { speciesId: 'sp2', name: 'Scutium', rarity: 'common', x: 60, y: 60 });
      return;
    default:
      break;
  }
  if (id.startsWith('behavior.')) {
    emit(h, 'behaviorNew', { behavior: id.slice(9) as Behavior, x: 50, y: 50 });
    return;
  }
  if (def.trigger.kind !== 'event') throw new Error(`no recipe for ${id}`);
  const ev = def.trigger.event;
  h.bus.emit(ev, SAMPLE_PAYLOADS[ev] as never);
}

describe('moments: triggers', () => {
  for (const def of MOMENTS) {
    it(`"${def.id}" opens when it first happens`, () => {
      const h = harness();
      if (def.requires) {
        // Explain the prerequisite first, through a real open + dismiss.
        happen(h, def.requires);
        h.advance(LONG);
        expect(h.m.current()?.id).toBe(def.requires);
        h.m.dismiss();
        h.advance(COOLDOWN_MS + 10);
      }
      happen(h, def.id);
      h.advance(100);
      h.advance((def.settleMs ?? 0) + LONG);
      const cur = h.m.current();
      expect(cur?.id).toBe(def.id);
      expect(cur?.mode).toBe(def.forceBrief ? 'brief' : 'full');
      expect(cur?.replay).toBe(false);
      expect(h.m.seen(def.id)).toBe(true);
    });
  }

  it('the first manual seed opens "seed"; an auto-seeder seed opens "autoseed"', () => {
    const h = harness();
    emit(h, 'seed', { x: 1, y: 2, cost: 2, manual: false });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('autoseed');
    expect(h.m.seen('seed')).toBe(false);
  });

  it('focus follows the event position and the creature', () => {
    const h = harness();
    emit(h, 'creatureStable', { id: 7, x: 33, y: 44 });
    h.advance(LONG);
    const f = h.m.current()!.focus;
    expect(f.grid).toEqual({ x: 33, y: 44, id: 7 });
    expect(f.zoom).toBeGreaterThanOrEqual(2);
    expect(f.zoom).toBeLessThanOrEqual(2.5);
  });

  it('a behaviour moment fires only for its own behaviour', () => {
    const h = harness();
    emit(h, 'behaviorNew', { behavior: 'spinner', x: 5, y: 5 });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('behavior.spinner');
    expect(h.m.seen('behavior.swimmer')).toBe(false);
  });

  it('a new species pays what the loop pays: Datos and seconds in sessions, Samples in the classic loop', () => {
    const ses = harness({}, { cycle: 'sessions' });
    emit(ses, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 10, y: 10 });
    ses.advance(LONG);
    const a = ses.m.current()!;
    expect(a.id).toBe('species');
    expect(a.chips.map((c) => c.text.es)).toEqual([`+${DATOS_PER_NEW_SPECIES} Datos`, `+${SESSION_TIME_PER_SPECIES} s`, 'Orbium']);
    expect(a.lines[1].es).toBe(`Cada especie nueva te da ${DATOS_PER_NEW_SPECIES} Datos y ${SESSION_TIME_PER_SPECIES} segundos más.`);
    const classic = harness();
    emit(classic, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 10, y: 10 });
    classic.advance(LONG);
    const b = classic.m.current()!;
    expect(b.chips[0].text.es).toMatch(/Muestra/);
    expect(b.lines[1].es).toMatch(/Muestras/);
  });

  it('notify: an event no bus carries (the runaway watch) opens its card once, then never again', () => {
    const h = harness();
    h.advance(10);
    expect(h.m.notify('explode', { id: -1, x: 30, y: 40 })).toBe(true);
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('explode');
    expect(h.m.current()?.focus.grid).toMatchObject({ x: 30, y: 40 });
    h.m.dismiss();
    h.advance(LONG);
    expect(h.m.notify('explode', { id: -1, x: 1, y: 1 })).toBe(false);
    h.m.setMode('off');
    expect(h.m.notify('stable', { id: 1, x: 1, y: 1 })).toBe(false);
  });

  it('a second species compares both, keeping both creatures in view', () => {
    const h = harness();
    h.m.load({ ...h.m.serialize(), seen: ['species'] });
    h.view.species = [species('sp1')];
    // Only one species so far: nothing to compare.
    emit(h, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 10, y: 10 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    happen(h, 'secondSpecies');
    h.advance(LONG);
    const cur = h.m.current()!;
    expect(cur.id).toBe('secondSpecies');
    expect(cur.data).toMatchObject({ speciesId: 'sp2', otherSpeciesId: 'sp1' });
    expect(cur.focus.grid).toMatchObject({ x: 60, y: 60 });
    expect(cur.focus.others).toEqual([{ x: 20, y: 20, id: 1 }]);
  });

  it('every behaviour card names its production bonus', () => {
    const h = harness();
    emit(h, 'behaviorNew', { behavior: 'swimmer', x: 5, y: 5 });
    h.advance(LONG);
    expect(h.m.current()!.chips[0].text).toEqual({ es: 'Nadadora: ×1,6 Esencia', en: 'Swimmer: ×1.6 Essence' });
  });

  it('the divider behaviour also counts as the first division', () => {
    const h = harness();
    emit(h, 'behaviorNew', { behavior: 'divider', x: 5, y: 5 });
    h.advance(LONG);
    expect(h.m.seen('division')).toBe(true);
  });

  it('dishOvergrown {on:false} does not open; the overgrown card offers "clean the dish"', () => {
    const h = harness();
    emit(h, 'dishOvergrown', { on: false });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    emit(h, 'dishOvergrown', { on: true });
    h.advance(LONG);
    const cur = h.m.current()!;
    expect(cur.id).toBe('overgrown');
    expect(cur.action?.id).toBe('sterilize');
    expect(cur.focus.zoom).toBe(1);
  });

  it('the overgrown card is dropped if the dish was already cleaned', () => {
    const h = harness();
    h.view.overgrown = true;
    emit(h, 'dishOvergrown', { on: true });
    h.view.overgrown = false;
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.seen('overgrown')).toBe(false);
  });

  it('a Spark that already left is not explained (it can be next time)', () => {
    const h = harness();
    emit(h, 'goldenSpawn', { x: 1, y: 1 });
    h.view.golden = null;
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.seen('golden')).toBe(false);
  });

  it('seed price: opens the first time a seed bought today raises the price, never for living creatures', () => {
    const h = harness({}, sessionPriceView(0));
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    Object.assign(h.view, sessionPriceView(2)); // 4 × 1,05² = 4,41 → still 4: nothing rose
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    Object.assign(h.view, sessionPriceView(3)); // 4,63 → 5
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('seedPrice');
    // Crowding (the old rule) never opens it: growing is never punished.
    const h2 = harness({}, priceView(3, 3, 1, 9));
    h2.advance(LONG);
    expect(h2.m.current()?.id).not.toBe('seedPrice');
  });

  it('a death never makes a "cheaper!" label (nothing cheers a death)', () => {
    const h = harness({}, priceView(3, 3, 1, 9));
    h.m.setMode('off');
    h.advance(10);
    h.m.setMode('full');
    Object.assign(h.view, priceView(2, 2, 1, 3));
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.current()?.id).not.toBe('seedCheaper');
  });

  it('moving the rules opens nothing (the calibration card is gone)', () => {
    const h = harness();
    h.advance(10);
    emit(h, 'calibrationChanged', { mu: 0.16, sigma: 0.015, R: 13, dt: 0.1 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
  });

  it('the clock card opens once when a session has one minute left', () => {
    const h = harness();
    (h.view as { session?: unknown }).session = { n: 1, phase: 'running', remaining: 90 };
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    (h.view as { session?: unknown }).session = { n: 1, phase: 'running', remaining: 59 };
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('clock');
    expect(h.m.current()?.focus.target).toEqual(['hud.clock']);
  });
});

describe('moments: deferred (first session)', () => {
  it('a deferred moment shows a brief label but stays unexplained, and comes back as a card later', () => {
    let first = true;
    const h = harness({ defer: (id) => first && (id === 'species' || id.startsWith('behavior.')) });
    emit(h, 'behaviorNew', { behavior: 'swimmer', x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.current()).toMatchObject({ id: 'behavior.swimmer', mode: 'brief' });
    h.advance(LONG);
    expect(h.m.seen('behavior.swimmer')).toBe(false);
    // Session 2: a swimmer on the dish brings the full card back.
    first = false;
    h.view.creatures = [{ ...creature(3, 'stable', 40, 40), behavior: 'swimmer' }];
    h.advance(LONG);
    h.advance(LONG);
    expect(h.m.current()).toMatchObject({ id: 'behavior.swimmer', mode: 'full' });
    expect(h.m.seen('behavior.swimmer')).toBe(true);
  });
});

describe('moments: once only', () => {
  it('a moment is explained once, also across reloads', () => {
    const storage = memoryStorage();
    const h = harness({}, {}, storage);
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('dissolve');
    h.m.dismiss();
    h.advance(COOLDOWN_MS + 100);
    emit(h, 'creatureDied', { id: 2, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(JSON.parse(storage.data.get(MOMENTS_STORAGE_KEY)!).seen).toContain('dissolve');

    const h2 = harness({}, {}, storage);
    expect(h2.m.seen('dissolve')).toBe(true);
    emit(h2, 'creatureDied', { id: 3, x: 1, y: 1 });
    h2.advance(LONG);
    expect(h2.m.current()).toBeNull();
  });

  it('a broken storage never throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const h = harness({ storage: bad });
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    expect(() => h.advance(LONG)).not.toThrow();
    expect(h.m.current()?.id).toBe('dissolve');
  });

  it('corrupt saved data is ignored', () => {
    const storage = memoryStorage();
    storage.setItem(MOMENTS_STORAGE_KEY, '{nope');
    const h = harness({}, {}, storage);
    expect(h.m.seen('seed')).toBe(false);
    expect(h.m.load({ v: 1, seen: ['seed', 'bogus'], mode: 'weird' })).toBe(true);
    expect(h.m.seen('seed')).toBe(true);
    expect(h.m.mode).toBe('full');
  });
});

describe('moments: queue and cooldown', () => {
  it('never shows two at once; queues by priority with a cooldown between', () => {
    const h = harness();
    h.view.creatures = [creature(1)];
    emit(h, 'creatureStable', { id: 1, x: 50, y: 50 });
    emit(h, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 50, y: 50 });
    emit(h, 'income', { id: 1, x: 50, y: 50, amount: 1 });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('stable');
    expect(h.m.isPausing()).toBe(true);
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('stable');
    h.m.dismiss();
    expect(h.m.isPausing()).toBe(false);
    h.advance(COOLDOWN_MS / 2);
    expect(h.m.current()).toBeNull();
    h.advance(COOLDOWN_MS);
    expect(h.m.current()?.id).toBe('income');
    h.m.dismiss();
    h.advance(COOLDOWN_MS + 10);
    expect(h.m.current()?.id).toBe('species');
  });

  it('isBusy covers queued moments so the story waits', () => {
    const h = harness();
    expect(h.m.isBusy()).toBe(false);
    emit(h, 'seed', { x: 1, y: 1, cost: 2, manual: true });
    expect(h.m.isBusy()).toBe(true); // still in its delay
    h.advance(LONG);
    expect(h.m.isBusy()).toBe(true); // open
    h.m.dismiss();
    expect(h.m.isBusy()).toBe(false);
  });

  it('stale dish moments are dropped; UI moments wait as long as needed', () => {
    const h = harness();
    h.blocked.on = true;
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    emit(h, 'offlineReturn', { seconds: 4000, essence: 100 });
    h.advance(MAX_QUEUE_MS + 1000);
    h.blocked.on = false;
    h.advance(10);
    expect(h.m.current()?.id).toBe('offline');
    h.m.dismiss();
    h.advance(COOLDOWN_MS + 10);
    expect(h.m.current()).toBeNull();
    expect(h.m.seen('dissolve')).toBe(false);
  });

  it('a dish clear drops queued dish moments', () => {
    const h = harness();
    emit(h, 'behaviorNew', { behavior: 'swimmer', x: 5, y: 5 });
    emit(h, 'dishClear', {});
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
  });
});

describe('moments: never during the ritual or a cinematic', () => {
  it('waits for the extinction ritual to end', () => {
    const h = harness();
    emit(h, 'extinctionStart', { genome: 9 });
    emit(h, 'dishClear', {});
    emit(h, 'extinctionDone', { era: 2, genome: 9 });
    h.advance(RITUAL_BLOCK_MS - 500);
    expect(h.m.current()).toBeNull();
    h.advance(600);
    const cur = h.m.current()!;
    expect(cur.id).toBe('extinction');
    expect(cur.chips[0].text.es).toBe('+9 Genoma');
    expect(cur.chips[1].text.en).toBe('Era 2');
  });

  it('waits while something else owns the screen (story cinematic, modal, splash)', () => {
    const h = harness();
    h.blocked.on = true;
    emit(h, 'creatureExploded', { id: 1, x: 1, y: 1 });
    h.advance(LONG * 3);
    expect(h.m.current()).toBeNull();
    h.blocked.on = false;
    h.advance(10);
    expect(h.m.current()?.id).toBe('explode');
  });

  it('nothing opens right after boot', () => {
    const h = harness();
    const m = createMoments({ bus: h.bus, getView: () => makeView(), storage: null, now: () => 0, pollMs: 0 });
    h.bus.emit('creatureDied', { id: 1, x: 1, y: 1 });
    m.tick();
    expect(m.current()).toBeNull();
    m.dispose();
  });
});

describe('moments: explain modes', () => {
  it('brief: no pause, a label that closes by itself', () => {
    const h = harness();
    h.m.setMode('brief');
    emit(h, 'creatureStable', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    const cur = h.m.current()!;
    expect(cur.mode).toBe('brief');
    expect(h.m.isPausing()).toBe(false);
    h.advance(BRIEF_MS + 10);
    expect(h.m.current()).toBeNull();
  });

  it('off: nothing at all, and nothing is marked seen', () => {
    const h = harness();
    h.m.setMode('off');
    emit(h, 'creatureStable', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.seen('stable')).toBe(false);
    expect(h.m.wouldShow('stable')).toBe(false);
    h.m.setMode('full');
    expect(h.m.wouldShow('stable')).toBe(true);
  });

  it('"never explain again" switches to brief and persists', () => {
    const storage = memoryStorage();
    const h = harness({}, {}, storage);
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    h.m.neverAgain();
    expect(h.m.current()).toBeNull();
    expect(h.m.mode).toBe('brief');
    expect(harness({}, {}, storage).m.mode).toBe('brief');
  });

  it('the story already told it → brief label (one thing per event)', () => {
    const h = harness({ downgrade: (id) => id === 'stable' });
    emit(h, 'creatureStable', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.current()?.mode).toBe('brief');
  });

  it('status pills on every creature during Era 1 by default, then on tap', () => {
    const h = harness();
    expect(h.m.labelsOnAll(1)).toBe(true);
    expect(h.m.labelsOnAll(2)).toBe(false);
    h.m.setLabels('always');
    expect(h.m.labelsOnAll(5)).toBe(true);
    h.m.setLabels('tap');
    expect(h.m.labelsOnAll(1)).toBe(false);
  });
});

describe('moments: help sheet replay', () => {
  it('replays a seen card without pausing and keeps its numbers', () => {
    const h = harness();
    emit(h, 'seed', { x: 1, y: 1, cost: 7, manual: true });
    h.advance(LONG);
    h.m.dismiss();
    h.advance(COOLDOWN_MS + 10);
    expect(h.m.replay('seed')).toBe(true);
    const cur = h.m.current()!;
    expect(cur.replay).toBe(true);
    expect(h.m.isPausing()).toBe(false);
    expect(cur.focus.grid).toBeNull();
    expect(cur.chips[0].text.en).toBe('−7 Essence');
    h.m.dismiss();
    expect(h.m.help().find((e) => e.id === 'seed')?.seen).toBe(true);
    expect(h.m.help().filter((e) => e.seen)).toHaveLength(1);
  });

  it('a replay never interrupts a real moment', () => {
    const h = harness();
    emit(h, 'creatureDied', { id: 1, x: 1, y: 1 });
    h.advance(LONG);
    expect(h.m.replay('seed')).toBe(false);
  });
});
