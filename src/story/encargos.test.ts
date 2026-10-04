import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import type { GameView, Text } from '../core/types';
import { OBJECTIVES } from '../game/balance';
import { CHAIN, ENCARGO_BY_ID, MAX_ASK_WORDS, MAX_THANKS_WORDS, MAX_WHY_WORDS, SIDE } from './encargoScript';
import { ENCARGOS_STORAGE_KEY, createEncargos, gameGrantOf, type EncargoDone, type EncargoReward, type EncargoView } from './encargos';
import { STORY_JOURNAL } from './script';
import { createStory } from './story';
import { creature, makeView, memoryStorage, node, species } from './testUtil';

function words(s: string): number {
  return s
    .replace(/\{[a-z]+\}/g, 'X')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function harness(view: Partial<GameView> = {}, storage = memoryStorage()) {
  let now = 5_000_000;
  const bus = new Bus<GameEvents>();
  const h = {
    bus,
    storage,
    v: makeView(view),
    granted: [] as { reward: EncargoReward; id: string }[],
    offers: [] as EncargoView[],
    done: [] as EncargoDone[],
  };
  const story = createStory({ bus, getView: () => h.v, storage: null, pollMs: 0, now: () => now });
  const enc = createEncargos({
    bus,
    getView: () => h.v,
    storage,
    now: () => now,
    random: () => 0,
    pollMs: 0,
    story,
    grant: (reward, e) => h.granted.push({ reward, id: e.id }),
  });
  enc.on('offer', (p) => h.offers.push(p.encargo));
  enc.on('done', (p) => h.done.push(p));
  const set = (over: Partial<GameView>) => (h.v = { ...h.v, ...over });
  const wait = (sec: number) => {
    now += sec * 1000;
    enc.tick();
  };
  return { ...h, h, enc, story, set, wait, get v() { return h.v; } };
}

const reward = (id: string) => OBJECTIVES.find((o) => o.id === id)!.reward;

describe('encargos: script', () => {
  it('every Encargo is bilingual and kid-short', () => {
    for (const e of [...CHAIN, ...SIDE]) {
      for (const [tx, max] of [
        [e.ask, MAX_ASK_WORDS],
        [e.why, MAX_WHY_WORDS],
        [e.thanks, MAX_THANKS_WORDS],
      ] as [Text, number][]) {
        expect(tx.es.trim(), e.id).not.toBe('');
        expect(tx.en.trim(), e.id).not.toBe('');
        expect(words(tx.es), `${e.id} es: ${tx.es}`).toBeLessThanOrEqual(max);
        expect(words(tx.en), `${e.id} en: ${tx.en}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('the Committee always speaks in capitals and signs off', () => {
    for (const e of [...CHAIN, ...SIDE].filter((x) => x.who === 'committee'))
      for (const tx of [e.ask, e.why, e.thanks]) {
        const bare = tx.es.replace(/\{n\}/g, '');
        expect(bare).toBe(bare.toUpperCase());
        expect(tx.es.endsWith('FIN.'), tx.es).toBe(true);
        expect(tx.en.endsWith('END.'), tx.en).toBe(true);
      }
  });

  it('the Act I chain mirrors the objective chain of balance.ts', () => {
    const act1 = CHAIN.filter((e) => (e.minEra ?? 1) === 1);
    expect(act1.map((e) => e.id)).toEqual(OBJECTIVES.map((o) => o.id));
    for (const e of act1) expect(e.reward.objective).toBe(e.id);
  });

  it('ids are unique and journal rewards exist', () => {
    expect(ENCARGO_BY_ID.size).toBe(CHAIN.length + SIDE.length);
    const journal = new Set(STORY_JOURNAL.map((j) => j.id));
    for (const e of [...CHAIN, ...SIDE]) if (e.reward.journal) expect(journal.has(e.reward.journal), e.reward.journal).toBe(true);
  });
});

describe('encargos: the chain', () => {
  it('offers the first request right away and pays it when done', () => {
    const t = harness();
    t.enc.tick();
    expect(t.enc.current()!.id).toBe('seed');
    expect(t.offers.map((o) => o.id)).toEqual(['seed']);
    expect(t.enc.current()!.who).toBe('vela');
    t.bus.emit('seed', { x: 1, y: 1, cost: 2, manual: true });
    t.enc.tick();
    expect(t.done.map((d) => d.encargo.id)).toEqual(['seed']);
    expect(t.granted[0].reward.essence).toBe(reward('seed'));
    // The next one comes after a short breath (celebration first).
    expect(t.enc.current()).toBeNull();
    t.wait(3);
    expect(t.enc.current()!.id).toBe('stable');
  });

  it('progress reads the live view and shows in the label', () => {
    const t = harness();
    t.enc.debug.offer('two');
    t.set({ creatures: [creature(1)] });
    let cur = t.enc.current()!;
    expect(cur.progress).toMatchObject({ current: 1, target: 3, unit: 'count' });
    expect(cur.label.es).toContain('(1 de 3)');
    expect(cur.why.es).toContain('calefacción');
    const progress: number[] = [];
    t.enc.on('progress', (p) => progress.push(p.encargo.progress.current));
    t.enc.tick();
    t.set({ creatures: [creature(1), creature(2)] });
    t.enc.tick();
    expect(progress).toEqual([2]);
    t.set({ creatures: [creature(1), creature(2), creature(3)] });
    t.enc.tick();
    cur = t.done[0].encargo;
    expect(cur.id).toBe('two');
    expect(t.done[0].reward.cosmetic).toBe('scarf');
    expect(t.enc.cosmetics()).toEqual(['scarf']);
    expect(t.story.journalViews().map((j) => j.id)).toContain('story.e_heat');
    expect(t.done[0].thanks.who).toBe('vela');
  });

  it('a Tree request says "when the session ends" while the clock runs (the Tree is closed then)', () => {
    const session = (phase: 'ready' | 'running') =>
      ({ n: 2, phase, remaining: 90, total: 120, world: 'classic', essence: 0, sprint: null, endedEarly: false }) as unknown as GameView['session'];
    const t = harness({ cycle: 'sessions', session: session('running') });
    t.enc.debug.offer('dropper');
    expect(t.enc.current()!.ask.es).toBe('Al terminar: compra el Gotero en el Árbol.');
    expect(t.enc.current()!.ask.en).toBe('After the session: buy the Dropper in the Tree.');
    t.set({ session: session('ready') });
    expect(t.enc.current()!.ask.es).toBe('Compra el Gotero en el Árbol.');
  });

  it('an objective Encargo is counted once: the game already counted it when the objective was met', () => {
    const r: EncargoReward = { essence: 40, samples: 0, cosmetic: null, journal: null, datos: 2, seconds: 5 };
    // "two" mirrors the game's objective "two": in sessions the game counted it (+time, +Datos) already.
    expect(gameGrantOf('two', r, 'sessions')).toBeNull();
    // A story request is not an objective: the game hears about it (Esencia, +time, +Datos).
    expect(gameGrantOf('genome', r, 'sessions')).toEqual({ essence: 40, samples: 0 });
    // Classic: the objective paid its Esencia; the Encargo adds only what is its own.
    expect(gameGrantOf('two', { ...r, samples: 3 }, 'classic')).toEqual({ essence: 0, samples: 3 });
  });

  it('opening the Bestiary completes "look"', () => {
    const t = harness();
    t.enc.debug.offer('look');
    t.enc.signal('tab:bestiary');
    t.enc.tick();
    expect(t.done.map((d) => d.encargo.id)).toEqual(['look']);
  });

  it('Era-gated steps wait for their night', () => {
    const t = harness({ era: 2 });
    t.enc.tick();
    expect(t.enc.main()!.id).toBe('genome');
    t.enc.debug.offer('report10');
    expect(t.enc.main()).toBeNull();
    t.set({ era: 3 });
    t.enc.tick();
    expect(t.enc.main()!.id).toBe('report10');
  });

  it('keeping a swimmer alive counts real seconds of one creature', () => {
    const t = harness({ era: 2 });
    t.enc.debug.offer('swimmer');
    const swim = { ...creature(7), behavior: 'swimmer' as const };
    t.set({ creatures: [swim] });
    t.wait(1);
    t.wait(60);
    expect(t.enc.current()!.progress.current).toBeGreaterThanOrEqual(60);
    expect(t.enc.current()!.label.en).toContain('(1:00 of 2:00)');
    // It died: the clock starts over with the next one.
    t.set({ creatures: [] });
    t.wait(1);
    t.set({ creatures: [{ ...swim, id: 8 }] });
    t.wait(1);
    t.wait(100);
    expect(t.done).toHaveLength(0);
    t.wait(25);
    expect(t.done.map((d) => d.encargo.id)).toEqual(['swimmer']);
    expect(t.done[0].reward.samples).toBe(2);
  });

  it('"calibrate until something new is born" needs both things after the offer', () => {
    const t = harness({ era: 4, species: [species('A'), species('B')] });
    t.enc.debug.offer('calibNew');
    t.bus.emit('speciesNew', { speciesId: 'c', name: 'C', rarity: 'common', x: 0, y: 0 });
    t.enc.tick();
    expect(t.done).toHaveLength(0);
    t.bus.emit('calibrationChanged', { mu: 0.16, sigma: 0.02, R: 13, dt: 0.1 });
    t.enc.tick();
    expect(t.done.map((d) => d.encargo.id)).toEqual(['calibNew']);
  });

  it('production-scaled rewards grow with Essence per second', () => {
    const t = harness({ era: 2, essencePerSec: 40 });
    t.enc.debug.offer('genome');
    t.set({ genomeNodes: [node('dropperMemory', 'heritage', true)] });
    t.enc.tick();
    expect(t.done[0].reward.essence).toBe(40 * 60);
  });
});

describe('encargos: side requests', () => {
  it('rotate in once Calibrate is open, and come back after a pause', () => {
    const t = harness({ tabs: { lab: true, bestiary: true, calibrate: true, genome: false } });
    t.enc.debug.offer('seeder');
    t.wait(1);
    expect(t.enc.side()).toBeNull();
    t.wait(25);
    const side = t.enc.side()!;
    expect(side.kind).toBe('side');
    expect(['s_dancer', 's_heart', 's_split']).toContain(side.id); // story requests first
    // The objective bar still shows the main chain first.
    expect(t.enc.current()!.kind).toBe('main');
    t.enc.dismissSide();
    expect(t.enc.side()).toBeNull();
    t.wait(70);
    expect(t.enc.side()).not.toBeNull();
  });

  it('dynamic targets are fixed when offered', () => {
    const t = harness({ era: 2, essencePerSec: 12.3, tabs: { lab: true, bestiary: false, calibrate: false, genome: true } });
    t.enc.debug.offer('s_rate');
    const s = t.enc.side()!;
    expect(s.progress.target).toBe(20);
    expect(s.ask.es).toContain('20 POR SEGUNDO');
    t.set({ essencePerSec: 30 });
    expect(t.enc.side()!.progress.target).toBe(20);
    t.enc.tick();
    expect(t.done[0].encargo.id).toBe('s_rate');
    expect(t.done[0].thanks.who).toBe('committee');
  });
});

describe('encargos: persistence and boot', () => {
  it('saves to bioluma.encargos and resumes', () => {
    const storage = memoryStorage();
    const a = harness({}, storage);
    a.enc.debug.offer('two');
    a.set({ creatures: [creature(1), creature(2), creature(3)] });
    a.enc.tick();
    a.enc.dispose();
    expect(storage.getItem(ENCARGOS_STORAGE_KEY)).toContain('"chain":5');

    const b = harness({}, storage);
    expect(b.enc.serialize().chain).toBe(5);
    expect(b.enc.cosmetics()).toEqual(['scarf']);
    b.wait(3);
    expect(b.enc.current()!.id).toBe('eps3');
  });

  it('serialize/load round-trip; junk is refused; storage errors never throw', () => {
    const a = harness();
    a.enc.debug.offer('golden');
    const data = a.enc.serialize();
    const b = harness();
    expect(b.enc.load(JSON.parse(JSON.stringify(data)))).toBe(true);
    expect(b.enc.serialize()).toEqual(data);
    expect(b.enc.load({ v: 9 })).toBe(false);
    const bad = memoryStorage();
    bad.setItem(ENCARGOS_STORAGE_KEY, '{oops');
    expect(() => harness({}, bad).enc.tick()).not.toThrow();
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    expect(() => harness({}, throwing as never).enc.tick()).not.toThrow();
  });

  it('a veteran save skips what is already done, without paying it again', () => {
    const t = harness({
      stats: { playTime: 900, totalEssence: 900, eraEssence: 900, seeds: 40, creaturesBorn: 9 },
      creatures: [creature(1)],
      species: [species('Orbium unicaudatus', 1.1, false)],
    });
    t.enc.tick();
    expect(t.enc.current()!.id).toBe('dropper');
    expect(t.granted).toHaveLength(0);
    const later = harness({ era: 3 });
    later.enc.tick();
    expect(later.enc.current()!.id).toBe('genome');
  });

  it('"Why?" plays the full dialogue through the story', () => {
    const t = harness();
    t.enc.tick();
    expect(t.enc.why()).toBe(true);
    const cur = t.story.current()!;
    expect(cur.scene.replay).toBe(true);
    expect(cur.line!.who).toBe('vela');
    expect(cur.line!.text.es).toContain('Siembra');
    t.story.advance();
    expect(t.story.current()!.line!.text.es).toContain('despierta');
    t.story.advance();
    expect(t.story.current()).toBeNull();
  });
});
