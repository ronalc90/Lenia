import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import type { GameView } from '../core/types';
import { computeLeanings, finalOptions, secretUnlocked } from './endings';
import { SCENES, SEED_SPECIES } from './script';
import { STORY_STORAGE_KEY, createStory, type Story } from './story';
import { ALL_BEHAVIORS, creature, makeView, memoryStorage, node, species } from './testUtil';
import type { HintView, StorageLike, StoryEvents } from './types';

interface H {
  bus: Bus<GameEvents>;
  story: Story;
  storage: ReturnType<typeof memoryStorage>;
  v: GameView;
  set(over: Partial<GameView>): void;
  wait(sec: number): void;
  log: { type: keyof StoryEvents; payload: unknown }[];
  hints: HintView[];
  /** Advance through every line of the current scene. */
  playLines(): void;
  id(): string | null;
}

function harness(view: Partial<GameView> = {}, storage = memoryStorage()): H {
  let now = 1_000_000;
  const bus = new Bus<GameEvents>();
  const h = {
    bus,
    storage,
    v: makeView(view),
    log: [] as H['log'],
    hints: [] as HintView[],
  } as H;
  h.story = createStory({ bus, getView: () => h.v, storage, now: () => now, random: () => 0.99, pollMs: 0 });
  for (const type of ['sceneStart', 'line', 'choice', 'chosen', 'sceneWait', 'sceneEnd', 'ending', 'journal'] as const)
    h.story.on(type, (payload) => h.log.push({ type, payload }));
  h.story.on('hint', (p) => h.hints.push(p));
  h.set = (over) => (h.v = { ...h.v, ...over });
  h.wait = (sec) => {
    now += sec * 1000;
    h.story.tick();
  };
  h.playLines = () => {
    for (let i = 0; i < 20 && h.story.current()?.phase === 'lines'; i++) h.story.advance();
  };
  h.id = () => h.story.current()?.scene.id ?? null;
  return h;
}

const seed = (h: H, manual = true) => h.bus.emit('seed', { x: 10, y: 10, cost: 2, manual });

/** A story past the tutorial, as if its save said so. */
function veteran(done: string[], extra: Record<string, unknown> = {}): H {
  const storage = memoryStorage();
  storage.setItem(
    STORY_STORAGE_KEY,
    JSON.stringify({ v: 1, done, doneAt: {}, choices: {}, counters: {}, flags: [], endings: [], tutorialSkipped: true, ...extra }),
  );
  return harness({}, storage);
}

describe('story: tutorial as scenes', () => {
  it('first run opens with VELA and waits for the first seed', () => {
    const h = harness();
    h.story.tick();
    expect(h.id()).toBe('t_intro');
    expect(h.story.current()!.line!.who).toBe('vela');
    h.playLines();
    const cur = h.story.current()!;
    expect(cur.phase).toBe('wait');
    expect(cur.wait!.target).toEqual(['dish']);
    seed(h);
    h.story.tick();
    expect(h.id()).toBeNull();
    expect(h.story.serialize().done).toContain('t_intro');
  });

  it('a seed that dissolves teaches the failure, then waits for another tap', () => {
    const h = harness();
    h.story.tick();
    h.playLines();
    seed(h);
    h.story.tick();
    h.bus.emit('creatureDied', { id: 1, x: 0, y: 0 });
    h.wait(2);
    expect(h.id()).toBe('t_fail');
    h.playLines();
    expect(h.story.current()!.phase).toBe('wait');
    h.bus.emit('seedDenied', { x: 0, y: 0, cost: 2 });
    h.story.tick();
    expect(h.id()).toBeNull();
  });

  it('the first stable creature is celebrated, then the Essence counter is shown', () => {
    const h = harness();
    h.story.tick();
    h.playLines();
    seed(h);
    h.story.tick();
    h.set({ creatures: [creature(1)] });
    h.bus.emit('creatureStable', { id: 1, x: 50, y: 50 });
    h.wait(2);
    expect(h.id()).toBe('t_stable');
    expect(h.story.current()!.line!.target).toEqual(['creature', 'dish']);
    h.playLines();
    h.wait(1);
    expect(h.id()).toBe('t_essence');
    expect(h.story.current()!.line!.target).toEqual(['hud.essence']);
  });

  it('a golden spark interrupts a waiting task, and the task resumes afterwards', () => {
    const h = veteran(['t_intro', 't_stable', 't_essence'], { tutorialSkipped: false });
    const dropper = { ...h.v.upgrades[0], affordable: true };
    h.set({ tabs: { lab: true, bestiary: false, calibrate: false, genome: false }, upgrades: [dropper] });
    h.wait(5);
    expect(h.id()).toBe('t_lab');
    h.playLines();
    expect(h.story.current()!.phase).toBe('wait');

    h.set({ golden: { x: 20, y: 20, life: 0.9 } });
    h.story.tick();
    expect(h.id()).toBe('t_golden');
    h.playLines();
    h.bus.emit('goldenCollected', { x: 20, y: 20, reward: { es: '', en: '' } });
    h.set({ golden: null });
    h.story.tick();
    const cur = h.story.current()!;
    expect(cur.scene.id).toBe('t_lab');
    expect(cur.phase).toBe('wait');

    h.set({ upgrades: [{ ...dropper, level: 1 }] });
    h.story.tick();
    expect(h.id()).toBeNull();
    h.wait(1);
    expect(h.id()).toBe('t_golden_caught');
  });

  it('skipping the tutorial skips every tutorial scene but not the story', () => {
    const h = harness();
    h.story.tick();
    h.story.skipTutorial();
    expect(h.id()).toBeNull();
    const done = h.story.serialize().done;
    for (const s of SCENES.filter((x) => x.tutorial)) expect(done).toContain(s.id);
    expect(done).not.toContain('a1_committee');
  });
});

describe('story: tutorial restart', () => {
  it('restarting the tutorial plays the intro again', () => {
    const h = harness();
    h.story.tick();
    h.story.skipTutorial();
    h.wait(5);
    expect(h.id()).toBeNull();
    h.story.restartTutorial();
    h.set({ stats: { ...h.v.stats, seeds: 0 } });
    h.wait(2);
    expect(h.id()).toBe('t_intro');
  });
});

describe('story: choices', () => {
  it('the lamp choice is recorded, unlocks its journal entry, and lights the extinction', () => {
    const h = veteran(['t_intro', 't_stable']);
    h.set({ extinction: { ...h.v.extinction, available: true } });
    h.wait(30);
    expect(h.id()).toBe('a1_extinction');
    h.playLines();
    const choice = h.log.find((e) => e.type === 'choice')!.payload as StoryEvents['choice'];
    expect(choice.options.map((o) => o.id)).toEqual(['lamp', 'protocol']);
    h.story.choose('lamp');
    expect(h.story.current()!.line!.text.en).toContain('liked');
    h.playLines();
    expect(h.id()).toBeNull();
    const save = h.story.serialize();
    expect(save.choices.lamp).toBe('lamp');
    expect(save.journal).toContain('s_lamp');
    h.bus.emit('extinctionStart', { genome: 10 });
    expect(h.hints.map((x) => x.kind)).toContain('lamp');
  });

  it('skip jumps straight to the choice of a choice scene', () => {
    const h = veteran(['t_intro', 't_stable']);
    h.set({ extinction: { ...h.v.extinction, available: true } });
    h.wait(30);
    h.story.skip();
    expect(h.story.current()!.phase).toBe('choice');
  });

  it('answering the Choir asks for three taps, then they answer back', () => {
    const h = veteran(['a2_memory', 'a2_constellation', 'a2_coro_first']);
    h.set({ era: 5 });
    h.wait(60);
    h.wait(60);
    expect(h.id()).toBe('a2_answer');
    h.playLines();
    h.story.choose('answer');
    expect(h.story.current()!.phase).toBe('wait');
    seed(h);
    seed(h);
    h.story.tick();
    expect(h.story.current()!.phase).toBe('wait');
    seed(h);
    h.story.tick();
    expect(h.id()).toBeNull();
    h.wait(1);
    expect(h.id()).toBe('a2_answered');
    expect(h.story.current()!.line!.who).toBe('coro');
  });

  it('replaying a choice scene shows the picked answer and changes nothing', () => {
    const h = veteran(['t_intro', 't_stable']);
    h.set({ extinction: { ...h.v.extinction, available: true } });
    h.wait(30);
    h.playLines();
    h.story.choose('protocol');
    h.playLines();
    const before = JSON.stringify(h.story.serialize());
    expect(h.story.replay('a1_extinction')).toBe(true);
    expect(h.story.current()!.scene.replay).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 10 && h.story.current(); i++) {
      seen.push(h.story.current()!.line!.text.en);
      h.story.advance();
    }
    expect(seen.at(-1)).toContain('Committee');
    expect(JSON.stringify(h.story.serialize())).toBe(before);
  });
});

describe('story: endings', () => {
  const base = makeView();

  it('playstyle and choices decide the leanings', () => {
    const harvest = computeLeanings({ choices: { sample: 'send', lamp: 'protocol' }, counters: { prints: 40 }, view: base });
    expect(finalOptions(harvest, false)[0]).toBe('harvest');

    const law = computeLeanings({
      choices: { rhythm: 'recalibrate' },
      counters: { calib: 100 },
      view: makeView({ genomeNodes: [node('doubleRings', 'rules', true), node('tripleRings', 'rules', true)] }),
    });
    expect(finalOptions(law, false)[0]).toBe('law');

    const memory = computeLeanings({
      choices: { lamp: 'lamp', sample: 'refuse' },
      counters: {},
      view: makeView({ genomeNodes: [node('dropperMemory', 'heritage', true), node('regimesPersist', 'heritage', true)] }),
    });
    expect(finalOptions(memory, false)[0]).toBe('memory');

    const tide = computeLeanings({
      choices: { rhythm: 'answer' },
      counters: { goldenCaught: 50 },
      view: makeView({ behaviorsSeen: ALL_BEHAVIORS, genomeNodes: [node('mutations', 'fauna', true)] }),
    });
    expect(finalOptions(tide, false)[0]).toBe('tide');
  });

  it('the final question offers the two strongest leanings', () => {
    const l = { harvest: 1, law: 5, memory: 0, tide: 4 };
    expect(finalOptions(l, false)).toEqual(['law', 'tide']);
    expect(finalOptions({ harvest: 0, law: 0, memory: 0, tide: 0 }, false)).toEqual(['memory', 'tide']);
  });

  it('the secret ending needs every seed species, every behaviour and an answer', () => {
    const all = makeView({ species: SEED_SPECIES.map((n) => species(n)), behaviorsSeen: ALL_BEHAVIORS });
    expect(secretUnlocked({ rhythm: 'answer' }, all)).toBe(true);
    expect(secretUnlocked({ rhythm: 'recalibrate' }, all)).toBe(false);
    expect(secretUnlocked({ rhythm: 'answer' }, { ...all, behaviorsSeen: ALL_BEHAVIORS.slice(1) })).toBe(false);
    expect(secretUnlocked({ rhythm: 'answer' }, { ...all, species: all.species.slice(1) })).toBe(false);
    expect(finalOptions({ harvest: 0, law: 9, memory: 0, tide: 0 }, true)).toEqual(['albor', 'law']);
  });

  it('a final answer plays its ending; continuing keeps the game going with an epilogue', () => {
    const h = veteran(['a2_memory', 'a3_confession', 'a3_tape3', 'a3_words', 'a3_dawn'], { choices: { lamp: 'lamp' } });
    h.set({ era: 6, extinction: { ...h.v.extinction, available: true } });
    h.wait(30);
    expect(h.id()).toBe('a3_final');
    h.playLines();
    const cur = h.story.current()!;
    expect(cur.phase).toBe('choice');
    expect(cur.options!.map((o) => o.id)).toEqual(h.story.finalOptions());
    const pick = cur.options![0].id;
    h.story.choose(pick);
    expect(h.log.some((e) => e.type === 'ending' && (e.payload as { id: string }).id === pick)).toBe(true);
    expect(h.story.current()!.phase).toBe('ending');
    expect(h.story.endings()).toEqual([pick]);
    expect(h.story.archive().found).toBe(1);

    h.story.endingDone();
    expect(h.id()).toBeNull();
    h.wait(8);
    expect(h.id()).toBe(`ep_${pick}`);
    h.playLines();
    // The question comes back only in a later era.
    h.wait(60);
    expect(h.id()).toBeNull();
    h.set({ era: 7 });
    h.wait(30);
    expect(h.id()).toBe('a3_final_again');
  });

  it('"not yet" puts the final question away for a while', () => {
    const h = veteran(['a2_memory', 'a3_confession', 'a3_tape3', 'a3_words', 'a3_dawn']);
    h.set({ era: 6, extinction: { ...h.v.extinction, available: true } });
    h.wait(30);
    h.playLines();
    h.story.defer();
    expect(h.id()).toBeNull();
    h.wait(60);
    expect(h.id()).toBeNull();
    h.wait(11 * 60);
    expect(h.id()).toBe('a3_final');
  });
});

describe('story: persistence', () => {
  it('saves under bioluma.story and resumes where it was', () => {
    const storage = memoryStorage();
    const a = harness({}, storage);
    a.story.tick();
    a.playLines();
    seed(a);
    a.story.tick();
    a.story.dispose();
    expect(storage.getItem(STORY_STORAGE_KEY)).toContain('t_intro');

    const b = harness({}, storage);
    b.story.tick();
    expect(b.id()).not.toBe('t_intro');
    expect(b.story.serialize().counters.seeds).toBe(1);
  });

  it('serialize and load round-trip', () => {
    const a = veteran(['t_intro', 'a2_memory'], { choices: { sample: 'refuse' }, endings: ['tide'], lastEndingEra: 6 });
    const data = a.story.serialize();
    const b = harness({}, memoryStorage());
    expect(b.story.load(JSON.parse(JSON.stringify(data)))).toBe(true);
    expect(b.story.serialize()).toEqual(data);
    expect(b.story.load({ v: 2 })).toBe(false);
    expect(b.story.load('nonsense')).toBe(false);
  });

  it('broken or throwing storage never throws', () => {
    const bad = memoryStorage();
    bad.setItem(STORY_STORAGE_KEY, '{not json');
    expect(() => harness({}, bad).story.tick()).not.toThrow();

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const h = harness({}, throwing as ReturnType<typeof memoryStorage>);
    expect(() => {
      h.story.tick();
      h.playLines();
      seed(h);
      h.story.tick();
      h.story.dispose();
    }).not.toThrow();
  });

  it('a veteran save without story data skips the tutorial', () => {
    const h = harness({ stats: { playTime: 9000, totalEssence: 1e6, eraEssence: 1e5, seeds: 300, creaturesBorn: 90 }, era: 3 });
    h.wait(30);
    expect(h.id()).not.toBe('t_intro');
    expect(h.story.serialize().tutorialSkipped).toBe(true);
    expect(h.story.archive().scenes.find((s) => s.id === 't_intro')!.seen).toBe(false);
  });
});

describe('story: pacing and text', () => {
  it('story beats keep a quiet gap between them', () => {
    const h = veteran(['t_intro', 't_stable', 'a1_extinction', 'a1_committee']);
    h.set({ era: 2, creatures: [creature(1)] });
    h.wait(10);
    expect(h.id()).toBe('a2_memory');
    h.playLines();
    // a2_orbit becomes eligible right away, but must wait for the gap.
    h.set({ golden: { x: 1, y: 1, life: 0.9 } });
    h.wait(5);
    expect(h.id()).toBeNull();
    h.wait(20);
    expect(h.id()).toBe('a2_orbit');
    expect(h.hints.map((x) => x.kind)).toContain('orbit');
  });

  it('tokens resolve to the player\'s own species and rhythm', () => {
    const h = veteran(['t_intro', 't_stable', 't_essence'], { tutorialSkipped: false });
    h.set({ species: [{ ...species('Orbium unicaudatus'), name: 'Nadadora celeste' }], tabs: { lab: false, bestiary: true, calibrate: false, genome: false } });
    h.wait(5);
    expect(h.id()).toBe('t_bestiary');
    // The common name, the same one the Bestiary shows (not the Latin).
    expect(h.story.current()!.line!.text.es).toContain('Nadadora celeste');
    expect(h.story.current()!.line!.text.es).not.toContain('Orbium');

    const r = veteran(['a2_constellation']);
    for (let i = 0; i < 5; i++) seed(r);
    r.story.play('a2_coro_first');
    r.story.advance();
    const line = r.story.current()!.line!;
    expect(line.who).toBe('coro');
    expect(line.name.es).toBe('· · ·');
    expect(line.text.es).toMatch(/^·( +·)+$/);
  });

  it('a disabled story starts nothing', () => {
    const h = harness();
    h.story.setEnabled(false);
    h.wait(10);
    expect(h.id()).toBeNull();
  });
});
