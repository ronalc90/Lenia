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
      (h.view as { session?: unknown }).session = { n: 1, phase: 'running', limit: 20, bonus: 0, elapsed: 16, remaining: 4 };
      return;
    case 'dissolve':
      h.view.stats = { ...h.view.stats, seeds: 1 };
      h.bus.emit('creatureDied', SAMPLE_PAYLOADS.creatureDied as never);
      return;
    case 'golden':
      h.view.golden = { x: 50, y: 50, life: 1 };
      emit(h, 'goldenSpawn', { x: 50, y: 50 });
      return;
    case 'autoseed':
      emit(h, 'seed', { x: 1, y: 2, cost: 3, manual: false });
      return;
    case 'contact':
      // A running dish (no sessions budget here: the generic trigger test) with two creatures about to touch.
      (h.view as { session?: unknown }).session = { n: 2, phase: 'running', limit: 30, bonus: 0, elapsed: 10, remaining: 20 };
      h.view.creatures = [creature(1, 'stable', 40, 40), creature(2, 'stable', 60, 40)];
      h.view.dangers = [{ a: 1, b: 2, inS: 1.5 }];
      return;
    case 'steer':
      (h.view as { session?: unknown }).session = { n: 2, phase: 'running', limit: 30, bonus: 0, elapsed: 10, remaining: 20 };
      h.view.creatures = [{ ...creature(1, 'stable', 40, 40), behavior: 'swimmer' }];
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
    expect(h.m.current()!.chips[0].text).toEqual({ es: 'Nadadora: ×1,6 luz', en: 'Swimmer: ×1.6 glow' });
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

  it('the clock card opens once when a long session turns amber (30 s of a 2:30 run)', () => {
    const h = harness();
    (h.view as { session?: unknown }).session = { n: 1, phase: 'running', limit: 150, bonus: 0, remaining: 59 };
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    (h.view as { session?: unknown }).session = { n: 1, phase: 'running', limit: 150, bonus: 0, remaining: 29 };
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
    expect(cur.chips[0].text.en).toBe('−7 glow');
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

describe('moments: only what the player did, said with the real clock (QA4 F-07, F-08)', () => {
  it('a creature that fades before the player sowed anything opens no "Se apagó" card', () => {
    const h = harness({}, { stats: { ...makeView().stats, seeds: 0 } });
    emit(h, 'creatureDied', { id: 1, x: 10, y: 10 });
    h.advance(LONG);
    expect(h.m.current()?.id).not.toBe('dissolve');
    expect(h.m.seen('dissolve')).toBe(false);
  });

  it('the clock card never says "one minute" in a short run and comes at the amber point with the real seconds', () => {
    const h = harness();
    const ses = (elapsed: number) => ((h.view as { session?: unknown }).session = { n: 2, phase: 'running', limit: 20, bonus: 0, elapsed, remaining: 20 - elapsed });
    ses(1);
    h.advance(LONG);
    expect(h.m.current()?.id).not.toBe('clock');
    ses(16);
    h.advance(LONG);
    const cur = h.m.current();
    expect(cur?.id).toBe('clock');
    const def = MOMENT_BY_ID.get('clock')!;
    const lines = (cur?.lines ?? def.lines).map((l) => l.es + ' ' + l.en).join(' ');
    expect(lines).not.toMatch(/minuto|minute/i);
    expect(cur?.data.seconds).toBe(4);
    expect(cur?.chips.map((c) => c.text.es).join(' ')).toContain('Quedan 4 s');
  });
});

describe('moments: the new-species card says what the summary will pay (QA4 F-18)', () => {
  it('with the Cuaderno de campo the card says +12 Datos, like the summary', () => {
    const h = harness({}, { cycle: 'sessions' } as Partial<GameView>);
    (h.view as { research?: unknown }).research = { levels: { notebook: 1 }, speciesReward: { datos: 12, seconds: 3 } };
    (h.view as { session?: unknown }).session = { n: 2, phase: 'running', limit: 30, bonus: 0, elapsed: 5, remaining: 25 };
    emit(h, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 50, y: 50 });
    h.advance(LONG);
    const cur = h.m.current();
    expect(cur?.id).toBe('species');
    expect(cur!.chips.map((c) => c.text.es).join(' ')).toContain('+12');
    expect((cur!.lines ?? []).map((l) => l.es).join(' ')).toContain('12 Datos');
    expect(cur!.data.amount).toBe(12);
  });
});

describe('moments: a clock card that waited past its moment is dropped (QA4 F-08, session-play)', () => {
  it('queued at the amber point of run 1, blocked until the next run: it does not open with stale seconds', () => {
    const h = harness();
    h.blocked.on = true;
    (h.view as { session?: unknown }).session = { n: 1, phase: 'running', limit: 15, bonus: 0, elapsed: 11, remaining: 4 };
    h.advance(LONG);
    (h.view as { session?: unknown }).session = { n: 2, phase: 'ready', limit: 20, bonus: 0, elapsed: 0, remaining: 20 };
    h.blocked.on = false;
    h.advance(LONG);
    expect(h.m.current()?.id).not.toBe('clock');
    expect(h.m.seen('clock')).toBe(false);
  });
});

describe('moments: the poll is cheap (perf)', () => {
  it('a poll builds the game view once, however many poll triggers it checks', () => {
    let views = 0;
    const h = harness({
      getView: () => {
        views++;
        return h.view;
      },
    });
    views = 0;
    h.m.tick();
    expect(views).toBe(1);
  });

  it('an event still reads a fresh view (the poll memo does not outlive the poll)', () => {
    const h = harness();
    h.m.tick();
    // The next poll sees a change made between polls.
    h.view = { ...h.view, essence: h.view.essence + 1 };
    let seen = -1;
    const m = createMoments({ bus: h.bus, getView: () => ((seen = h.view.essence), h.view), storage: null, now: () => h.now(), pollMs: 0 });
    m.tick();
    expect(seen).toBe(h.view.essence);
  });
});

// ───────────── the interruption budget (ADR-030, docs/CLARIDAD2.md §2.8) ─────────────

/** A sessions-loop view with a run in the given phase, `elapsed` seconds into its clock. */
function run(h: Harness, n: number, phase: 'ready' | 'running' | 'over', elapsed = 10, first = n === 1): void {
  h.view.cycle = 'sessions';
  h.view.session = {
    n,
    world: 'classic',
    phase,
    limit: 30,
    bonus: 0,
    elapsed,
    remaining: Math.max(0, 30 - elapsed),
    progress: elapsed / 30,
    essence: 0,
    seeds: 1,
    sprint: null,
    newSpecies: 0,
    endedEarly: false,
    first,
  };
}

const fusion = (h: Harness, x = 40, y = 40) => emit(h, 'creatureExploded', { id: 7, x, y, cause: 'touch' });

describe('moments: one pausing card per run, only for a first-time accident (CLARIDAD2 §2.8)', () => {
  it('QA#25: Momentos of a run never open at the start of the next run', () => {
    const h = harness();
    run(h, 3, 'running');
    h.blocked.on = true; // a sheet covers the dish until the clock runs out
    emit(h, 'behaviorNew', { behavior: 'spinner', x: 50, y: 50 });
    h.view.species = [species('sp1'), species('sp2')];
    emit(h, 'speciesNew', { speciesId: 'sp2', name: 'Scutium', rarity: 'common', x: 60, y: 60 });
    h.advance(LONG);
    run(h, 3, 'over');
    h.advance(LONG);
    run(h, 4, 'ready', 0);
    h.blocked.on = false;
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    run(h, 4, 'running', 1);
    h.advance(LONG * 4);
    expect(h.m.current()).toBeNull();
    expect(h.m.isBusy()).toBe(false);
  });

  it('a run shows at most one pausing card, and only for a first-time accident', () => {
    const h = harness();
    run(h, 2, 'running');
    const opened: { id: string; mode: string }[] = [];
    h.m.on('open', ({ moment }) => opened.push({ id: moment.id, mode: moment.mode }));
    // A discovery is a brief label (and a plate in the report), never a pause.
    emit(h, 'behaviorNew', { behavior: 'swimmer', x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.isPausing()).toBe(false);
    h.advance(BRIEF_MS + LONG);
    // The first fusion of the save: the one card of the run.
    fusion(h);
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('explode');
    expect(h.m.isPausing()).toBe(true);
    h.m.dismiss();
    h.advance(COOLDOWN_MS + LONG);
    // Another first-time accident in the same run: a brief label only.
    h.view.overgrown = true;
    emit(h, 'dishOvergrown', { on: true });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('overgrown');
    expect(h.m.current()?.mode).toBe('brief');
    expect(h.m.isPausing()).toBe(false);
    const cards = opened.filter((o) => o.mode === 'full');
    expect(cards.map((c) => c.id)).toEqual(['explode']);
    // It stays unexplained: its card can come in a later run.
    expect(h.m.seen('overgrown')).toBe(false);
  });

  it('a seen accident is a brief label after that, and the budget resets with the next run', () => {
    const h = harness();
    run(h, 2, 'running');
    fusion(h);
    h.advance(LONG);
    expect(h.m.isPausing()).toBe(true);
    h.m.dismiss();
    h.advance(COOLDOWN_MS + LONG);
    run(h, 3, 'running');
    h.view.overgrown = true;
    emit(h, 'dishOvergrown', { on: true });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('overgrown');
    expect(h.m.isPausing()).toBe(true);
  });

  it('no card in the first 5 s of a run', () => {
    const h = harness();
    run(h, 2, 'running', 2);
    fusion(h);
    h.advance(LONG);
    expect(h.m.isPausing()).toBe(false);
    expect(h.m.current()?.mode ?? 'brief').toBe('brief');
    expect(h.m.seen('explode')).toBe(false);
  });

  it('the first session gets its accident card too (the tutorial scenes do not use the budget)', () => {
    const h = harness();
    run(h, 1, 'running', 8);
    fusion(h);
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('explode');
    expect(h.m.isPausing()).toBe(true);
  });

  it('nothing opens while the run waits for its clock or after time is up, and the story is not held by it', () => {
    const h = harness();
    run(h, 2, 'ready', 0);
    h.view.creatures = [creature(1)];
    emit(h, 'creatureStable', { id: 1, x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.isBusy()).toBe(false);
    run(h, 2, 'over');
    emit(h, 'behaviorNew', { behavior: 'still', x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
  });

  it('deferred Momentos are handed to the summary as plates, and the queue is emptied', () => {
    const h = harness();
    run(h, 2, 'running');
    emit(h, 'behaviorNew', { behavior: 'still', x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.current()?.mode).toBe('brief');
    h.advance(BRIEF_MS + LONG);
    h.blocked.on = true;
    h.view.species = [species('sp1')];
    emit(h, 'speciesNew', { speciesId: 'sp1', name: 'Orbium', rarity: 'common', x: 60, y: 60 });
    h.advance(LONG);
    run(h, 2, 'over');
    const plates = h.m.drainForSummary();
    expect(plates.map((p) => p.id).sort()).toEqual(['behavior.still', 'species']);
    for (const p of plates) {
      expect(p.title.es).not.toBe('');
      expect(p.plate).toBeGreaterThan(0);
    }
    expect(h.m.isActive('species')).toBe(false);
    expect(h.m.seen('species')).toBe(true);
    expect(h.m.drainForSummary()).toEqual([]);
  });

  it('the first Spark of a running session is VELA’s (t_golden), never a Momento', () => {
    const h = harness();
    run(h, 4, 'running');
    h.view.golden = { x: 50, y: 50, life: 1 };
    emit(h, 'goldenSpawn', { x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.isActive('golden')).toBe(false);
  });

  it('the classic loop keeps its cards', () => {
    const h = harness();
    emit(h, 'behaviorNew', { behavior: 'swimmer', x: 50, y: 50 });
    h.advance(LONG);
    expect(h.m.isPausing()).toBe(true);
  });

  it('a scene that told a basic marks it explained without opening it', () => {
    const h = harness();
    run(h, 1, 'ready', 0);
    emit(h, 'seed', { x: 1, y: 2, cost: 0, manual: true });
    h.m.markTold(['seed']);
    run(h, 1, 'running', 1);
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
    expect(h.m.seen('seed')).toBe(true);
  });
});

describe('moments: accidents say why, at the spot (CLARIDAD2 §2.5)', () => {
  it('a seed that went dark says why in its label', () => {
    const h = harness();
    run(h, 2, 'running');
    emit(h, 'creatureDied', { id: 3, x: 10, y: 10, cause: 'glass' });
    h.advance(LONG);
    expect(h.m.current()?.id).toBe('dissolve');
    expect(h.m.current()?.brief.es).toBe('Se apagó: muy pegada al cristal');
  });

  it('the warning before a touch is a label, and names the steering when one is a swimmer', () => {
    const h = harness();
    run(h, 2, 'running');
    h.view.creatures = [{ ...creature(1, 'stable', 40, 40), behavior: 'swimmer' }, creature(2, 'stable', 60, 40)];
    h.view.dangers = [{ a: 1, b: 2, inS: 1.2 }];
    h.advance(LONG);
    const cur = h.m.current();
    expect(cur?.id).toBe('contact');
    expect(cur?.mode).toBe('brief');
    expect(cur?.brief.en).toBe('Careful! Drag it to steer it away');
    expect(h.m.isPausing()).toBe(false);
  });

  it('the first fusion of the save is the plate-03 card «¡Se juntaron!», then a label', () => {
    const h = harness();
    run(h, 2, 'running');
    fusion(h);
    h.advance(LONG);
    expect(h.m.current()?.title.es).toBe('¡Se juntaron!');
    expect(MOMENT_BY_ID.get('explode')!.plate).toBe(3);
    h.m.dismiss();
    h.advance(COOLDOWN_MS + LONG);
    expect(h.m.seen('explode')).toBe(true);
    fusion(h, 70, 70);
    h.advance(LONG);
    expect(h.m.current()).toBeNull();
  });
});
