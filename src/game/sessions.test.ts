import { describe, expect, it } from 'vitest';
import * as B from './balance';
import * as C from './cycleBalance';
import { createGame } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, run, seededRng } from './testUtil';
import { WORLD_BY_ID } from './worlds';
import { TREE_BY_ID } from './tree';
import { scaledTemplate } from './seeding';
import { catalogByCode } from '../sim/catalog';

/** A sessions game (the integrated loop of docs/CICLO.md). */
function sessionsGame(seed = 1, save?: string) {
  const rec = recordingBus();
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions' }, save);
  return { g, ...rec };
}
const st = (g: { state: Readonly<GameState> }) => g.state as GameState;
const stable = (n: number, from = 1) => Array.from({ length: n }, (_, i) => creature({ id: from + i, x: 20 + 30 * i, y: 40 }));

describe('sessions cycle: the clock and the wallet', () => {
  it('a new game waits for the first seed with the start wallet and the tree instead of the Lab', () => {
    const { g } = sessionsGame();
    const v = g.view();
    expect(v.cycle).toBe('sessions');
    expect(v.session).toMatchObject({ n: 1, phase: 'ready', limit: C.SESSION_BASE_SECONDS, remaining: C.SESSION_BASE_SECONDS });
    expect(v.essence).toBe(C.SESSION_START_ESSENCE);
    expect(v.charges).toEqual({ free: B.START_FREE_SEEDS, guaranteed: C.FIRST_SESSION_SURE_SEEDS });
    expect(v.era).toBe(1);
    expect(v.tabs).toMatchObject({ lab: false, calibrate: false, genome: false });
    expect(v.genomeNodes).toEqual([]);
    expect(v.upgrades.find((u) => u.id === 'clock')).toMatchObject({ level: 0, cost: C.TREE_RING_START[1], currency: 'genome' });
    expect(v.extinction.available).toBe(false);
    expect(v.research).toMatchObject({ datos: 0, night: 1, sessions: 0, world: 'classic', capacity: C.DISH_CAPACITY[0] });
  });

  it('the first seed starts the clock; Esencia only comes in while it runs', () => {
    const { g, count } = sessionsGame();
    const rep = report(stable(2));
    run(g, 5, rep, 0.5);
    expect(g.view().essence).toBe(C.SESSION_START_ESSENCE); // creatures before the clock pay nothing
    expect(g.view().drops).toEqual([]);
    expect(g.actions.seedAt(150, 200)).not.toBeNull();
    expect(count('sessionClock')).toBe(1);
    expect(g.view().session!.phase).toBe('running');
    run(g, 10, rep, 0.5);
    // ADR-030: the light waits in the drops until it is collected; then the wallet holds all it earned.
    for (const d of g.view().drops!) g.actions.collect!(d.id);
    const v = g.view();
    expect(v.essence).toBeGreaterThan(C.SESSION_START_ESSENCE);
    expect(v.session!.essence).toBeCloseTo(v.essence - C.SESSION_START_ESSENCE, 6);
    // Objectives done and a new species add seconds ("+5 s"): the clock reads limit + bonus − elapsed.
    expect(v.session!.bonus).toBeGreaterThan(0);
    expect(v.session!.remaining).toBeCloseTo(C.SESSION_BASE_SECONDS + v.session!.bonus - 10, 6);
  });

  it('time up banks the Datos, freezes the dish and the next session starts from a fresh wallet', () => {
    const { g, log } = sessionsGame();
    const rep = report(stable(3));
    g.actions.seedAt(150, 200);
    for (let i = 0; i < 2000 && g.view().session!.phase !== 'over'; i++) g.tick(0.5, rep);
    const end = log.get('sessionEnd')![0] as { n: number; datos: number };
    expect(end.n).toBe(1);
    expect(end.datos).toBeGreaterThanOrEqual(C.DATOS_MIN);
    expect(g.view().research!.datos).toBe(end.datos);
    expect(g.lastSummary!.datos.total).toBe(end.datos);
    expect(g.view().session!.phase).toBe('over');
    expect(g.speed).toBe(0);
    expect(g.actions.seedAt(10, 10)).toBeNull();
    expect(g.actions.startSession!()).toBe(true);
    const v = g.view();
    expect(v.session).toMatchObject({ n: 2, phase: 'ready' });
    expect(v.essence).toBe(C.SESSION_START_ESSENCE);
    expect(v.charges).toEqual({ free: C.SESSION_BASE_FREE_SEEDS, guaranteed: C.SESSION_SURE_SEEDS });
    expect(g.speed).toBe(C.SESSION_SIM_PACE); // the time-lapse (ADR-027)
  });

  it('"Terminar ahora" pays what was earned, without the minimum', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    run(g, 3, report([]), 0.5);
    expect(g.actions.endSessionNow!()).toBe(true);
    const d = g.lastSummary!.datos;
    expect(d.minimum).toBe(0);
    expect(d.fromEssence).toBe(0);
    expect(g.view().research!.datos).toBe(d.sub + d.book); // only the Encargo of the first seed
    expect(d.total).toBeLessThan(C.DATOS_MIN);
    expect(g.actions.endSessionNow!()).toBe(false);
  });
});

describe('sessions cycle: never punish growth', () => {
  it('the seed price ignores the living and only steps gently per seed bought', () => {
    const { g } = sessionsGame();
    const s = st(g);
    s.charges = { free: 0, guaranteed: 0 };
    s.essence = 1000;
    expect(g.view().seedCost).toBe(C.SESSION_SEED_PRICE);
    // 1 alive + the starter creature (docs/RITMO.md §4.2) leave room for one more seed in the base
    // dish (Ø128 holds 3, docs/ESPECIES.md §5).
    run(g, 1, report(stable(1)), 0.5);
    expect(g.view().seedCost).toBe(C.SESSION_SEED_PRICE); // a creature alive: same price
    expect(g.view().seedPrice).toMatchObject({ crowdMult: 1, satMult: 1, stepMult: 1, capacity: C.DISH_CAPACITY[0] });
    for (const x of [30, 90, 150]) {
      g.actions.seedAt(x, 200);
      run(g, 3, report([]), 0.5); // the seeds melt: room again
    }
    expect(g.view().seedPrice!.bought).toBe(3);
    expect(g.view().seedCost).toBe(Math.round(C.SESSION_SEED_PRICE * C.SEED_PRICE_STEP ** 3));
  });

  it('a full dish refuses the tap for free and says why', () => {
    const { g, log } = sessionsGame();
    const s = st(g);
    s.charges = { free: 0, guaranteed: 0 };
    s.essence = 1000;
    run(g, 1, report(stable(C.DISH_CAPACITY[0])), 0.5);
    expect(g.view().seedPrice!.full).toBe(true);
    expect(g.actions.seedAt(100, 220)).toBeNull();
    expect((log.get('seedBlocked')![0] as { reason: string }).reason).toBe('full');
    expect(g.view().essence).toBe(1000);
  });

  it('Placa más grande gives room, not a lower price', () => {
    const { g } = sessionsGame();
    st(g).research!.datos = 100;
    expect(g.buyNode('dish').ok).toBe(true);
    expect(g.view().research!.capacity).toBe(C.DISH_CAPACITY[1]);
    expect(g.view().seedPrice!.capacity).toBe(C.DISH_CAPACITY[1]);
  });
});

describe('sessions cycle: gifts and boosts are proportional', () => {
  it('session 1 has no Spark and no Datos pill; from session 2 on they are there', () => {
    const { g, count } = sessionsGame(3);
    const rep = report(stable(3));
    g.actions.seedAt(150, 200);
    expect(g.view().session!.first).toBe(true);
    expect(g.view().sessionPreview).toBeNull();
    g.actions.endSessionNow!();
    for (let i = 0; i < 400 && g.view().session!.phase !== 'over'; i++) g.tick(0.25, rep);
    expect(count('goldenSpawn')).toBe(0);
    g.actions.startSession!();
    g.actions.seedAt(150, 200);
    expect(g.view().session!.first).toBe(false);
    expect(g.view().sessionPreview).not.toBeNull();
  });

  it('the Spark gives SPARK_GIFT_SECONDS of your Esencia (and a sure seed), and says so', () => {
    const { g, log } = sessionsGame(3);
    const rep = report(stable(3));
    // Sessions before SPARK_FROM_SESSION have no Spark (docs/RITMO.md §4.4).
    for (let n = 1; n < C.SPARK_FROM_SESSION; n++) {
      g.actions.seedAt(150, 200);
      g.actions.endSessionNow!();
      g.actions.startSession!();
    }
    g.actions.seedAt(150, 200);
    for (let i = 0; i < 400 && !g.view().golden; i++) g.tick(0.25, rep);
    expect(g.view().golden).not.toBeNull();
    const before = g.view();
    g.actions.collectGolden();
    const after = g.view();
    const gift = Math.max(C.SPARK_GIFT_MIN, Math.round(C.SPARK_GIFT_SECONDS * before.essencePerSec));
    expect(after.essence - before.essence).toBeCloseTo(gift, 6);
    expect(after.charges!.guaranteed).toBe(before.charges!.guaranteed + C.SPARK_SURE_SEEDS);
    const reward = (log.get('goldenCollected')![0] as { reward: { es: string } }).reward.es;
    expect(reward).toContain(`¡Destello! +${gift} luz`); // short enough for 360 px (QA-CLARIDAD #31)
    expect(g.session!.goldens).toBe(1);
  });

  it('Settings can turn on «Recoger la luz sola» (ADR-030 §2.2.2): a free level-1 Pipeta from session 1', () => {
    const { g } = sessionsGame();
    expect(g.view().pipettes ?? []).toHaveLength(0);
    g.actions.setSetting('autoCollect', true);
    expect(g.state.settings.autoCollect).toBe(true);
    g.tick(0.25, report(stable(3)));
    expect(g.view().pipettes ?? []).toHaveLength(1);
    g.actions.setSetting('autoCollect', false);
    expect(g.state.settings.autoCollect).toBe(false);
  });

  it('the Spark VELA points at can be caught while only her line holds the dish, never in another pause', () => {
    const { g } = sessionsGame(3);
    const rep = report(stable(3));
    for (let n = 1; n < C.SPARK_FROM_SESSION; n++) {
      g.actions.seedAt(150, 200);
      g.actions.endSessionNow!();
      g.actions.startSession!();
    }
    g.actions.seedAt(150, 200);
    for (let i = 0; i < 400 && !g.view().golden; i++) g.tick(0.25, rep);
    expect(g.view().golden).not.toBeNull();
    // Any pause (the user's, a card): QA1 #9, no aiming at a frozen spark.
    g.isPaused = true;
    g.actions.collectGolden();
    expect(g.view().golden).not.toBeNull();
    // VELA's «¡Ahí! ¡Un Destello! ¡Tócalo!» holds the dish (main.ts: the 'story' source alone).
    g.catchWhilePaused = true;
    g.actions.collectGolden();
    expect(g.view().golden).toBeNull();
    expect(g.session!.goldens).toBe(1);
  });

  it('QA-CLARIDAD-2 C11: buying Nutrientes says what the next one costs (10, 12, 24, 49… went unexplained)', () => {
    const { g, log } = sessionsGame();
    const rep = report(stable(3));
    g.actions.seedAt(150, 200);
    g.actions.endSessionNow!();
    g.actions.startSession!();
    g.actions.seedAt(150, 200);
    run(g, 2 + C.BOOST_FROM_SECONDS, rep, 0.5);
    st(g).essence = 1e6;
    expect(g.actions.buyBoost!()).toBe(true);
    const next = g.view().boost!.cost;
    const toasts = (log.get('toast') ?? []) as { text: { es: string; en: string } }[];
    const t = toasts.find((x) => /Nutrientes/.test(x.text.es))!;
    expect(t.text.es).toMatch(/el doble/);
    expect(t.text.es).toContain(String(next));
    expect(t.text.en).toContain(String(next));
  });

  it('Abono costs 20 s of production, doubles each time, and raises production ×1,25', () => {
    const { g, count } = sessionsGame();
    const rep = report(stable(3));
    g.actions.seedAt(150, 200);
    g.actions.endSessionNow!(); // Nutrientes from session 2 (ADR-030)
    g.actions.startSession!();
    g.actions.seedAt(150, 200);
    run(g, 2, rep, 0.5);
    st(g).essence = 1e6;
    expect(g.actions.buyBoost!()).toBe(false); // on sale after BOOST_FROM_SECONDS of clock
    expect(g.view().boost!.wait).toBeGreaterThan(0);
    run(g, C.BOOST_FROM_SECONDS, rep, 0.5);
    const eps0 = g.view().essencePerSec;
    const cost0 = g.view().boost!.cost;
    expect(cost0).toBe(Math.round(Math.max(C.BOOST_MIN_COST, C.BOOST_SECONDS * eps0)));
    expect(g.actions.buyBoost!()).toBe(true);
    expect(count('boostBought')).toBe(1);
    run(g, 1, rep, 0.5);
    expect(g.view().essencePerSec).toBeCloseTo(eps0 * C.BOOST_MULT, 6);
    expect(g.view().boost).toMatchObject({ count: 1, mult: C.BOOST_MULT });
    // Frozen when it went on sale (ADR-030): the next one is the double, whatever the dish makes now.
    expect(g.view().boost!.cost).toBe(Math.round(Math.max(C.BOOST_MIN_COST, C.BOOST_SECONDS * eps0) * C.BOOST_GROWTH));
    // Spent Esencia never lowers the Datos: they count Esencia earned.
    expect(g.session!.essence).toBeGreaterThan(0);
    expect(g.session!.spent).toBeGreaterThanOrEqual(cost0);
  });
});

describe('sessions cycle: the tree, worlds and nights', () => {
  it('a tree node spends Datos and changes the next session', () => {
    const { g, count } = sessionsGame();
    st(g).research!.datos = 10;
    expect(g.actions.buyNode!('clock')).toBe(true);
    expect(count('nodeBought')).toBe(1);
    expect(g.view().research!.datos).toBe(10 - C.TREE_RING_START[1]);
    expect(g.view().upgrades.find((u) => u.id === 'clock')!.level).toBe(1);
    // The waiting session is set up again with the new clock.
    expect(g.view().session!.limit).toBe(C.SESSION_BASE_SECONDS + C.TIME_CLOCK);
    expect(g.actions.buyNode!('clockXL')).toBe(false);
  });

  it('opening a world picks it: the dish gets its rules, no knobs', () => {
    const { g, count } = sessionsGame();
    st(g).research!.datos = 100;
    expect(g.buyNode('worldCold').ok).toBe(true);
    const cold = WORLD_BY_ID.cold.params;
    expect(g.view().session!.world).toBe('cold');
    expect(g.simParams).toMatchObject({ mu: cold.mu, sigma: cold.sigma, R: cold.R });
    expect(count('calibrationChanged')).toBeGreaterThanOrEqual(1);
    expect(g.actions.pickWorld!('classic')).toBe(true);
    expect(g.simParams.mu).toBe(WORLD_BY_ID.classic.params.mu);
    expect(g.actions.pickWorld!('giants')).toBe(false); // not open
    // Calibrar is gone: the rules are the World's (no action changes them).
    expect('setCalibration' in g.actions).toBe(false);
  });

  it('seeds take a free angle in every world (no world needs exact quarter turns since the Anillo)', () => {
    const { g } = sessionsGame(3);
    st(g).charges = { free: 5, guaranteed: 0 };
    expect(g.actions.seedAt(150, 200)!.rotation).not.toBe(0);
    st(g).research!.datos = 100;
    g.actions.endSessionNow!();
    expect(g.buyNode('worldCold').ok).toBe(true);
    g.actions.startSession!();
    expect(g.view().session!.world).toBe('cold');
    st(g).charges = { free: 5, guaranteed: 0 };
    const b = g.actions.seedAt(150, 200)!;
    expect(b.pattern).toBe(scaledTemplate(catalogByCode('C0v')!, 13));
    expect(C.WORLD_SEED_HELP.cold).toBeUndefined();
  });

  it('the night replaces the Extinction: ready after its sessions, free at the centre', () => {
    const { g, count } = sessionsGame();
    const r = st(g).research!;
    r.sessions = C.NIGHT_GATES[0].sessions + C.NIGHT_GATE_FALLBACK;
    expect(g.view().research!.nightReady).toBe(true);
    expect(g.view().extinction.available).toBe(false);
    expect(g.actions.extinguish()).toBe(false);
    expect(g.actions.buyNode!('lab')).toBe(true);
    expect(count('nightStart')).toBe(1);
    expect(g.view().era).toBe(2);
  });

  it('Encargos add time and Datos in a session, and wait for the next one between sessions', () => {
    const { g } = sessionsGame();
    // Session 1's Encargos are silent and do not stretch its 15 s (docs/RITMO.md §3.3).
    g.actions.seedAt(150, 200);
    const b1 = g.session!.bonus;
    g.grantEncargo({ essence: 5, samples: 0 });
    expect(g.session!.bonus).toBe(b1);
    g.actions.endSessionNow!();
    g.actions.startSession!();
    g.actions.seedAt(150, 200);
    const n0 = g.session!.encargos;
    const bonus0 = g.session!.bonus;
    const e0 = g.session!.essence;
    g.grantEncargo({ essence: 50, samples: 0 });
    expect(g.session!.encargos).toBe(n0 + 1);
    expect(g.session!.bonus).toBe(bonus0 + C.SESSION_TIME_PER_ENCARGO);
    expect(g.session!.essence).toBe(e0 + 50); // earned: it becomes Datos too
    g.actions.endSessionNow!();
    g.grantEncargo({ essence: 40, samples: 0 });
    g.actions.startSession!();
    expect(g.view().essence).toBe(C.SESSION_START_ESSENCE + 40);
    expect(g.session!.encargos).toBe(1);
    // Met before the clock runs: it counts (Datos) but adds no time — only what the player does in the
    // run stretches it (bot: the night's first run was an outlier the next could not beat).
    expect(g.session!.bonus).toBe(0);
  });
});

describe('sessions cycle: saves', () => {
  it('a running session survives a save and a load', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    run(g, 5, report(stable(2)), 0.5);
    const save = g.serialize();
    expect(JSON.parse(save).v).toBe(B.SAVE_VERSION);
    const { g: h } = sessionsGame(2, save);
    expect(h.session).toMatchObject({ n: 1, phase: 'running' });
    expect(h.session!.elapsed).toBeCloseTo(g.session!.elapsed, 6);
    // ADR-030: the drops waiting on the saved dish are swept into the wallet on load.
    const waiting = g.view().drops!.reduce((a, d) => a + d.amount, 0);
    expect(waiting).toBeGreaterThan(0);
    expect(h.view().essence).toBeCloseTo(g.view().essence + waiting, 6);
    expect(h.view().session!.essence).toBeCloseTo(g.view().session!.essence, 6);
  });

  it('a classic save opened in the sessions cycle is migrated generously', () => {
    const bus = recordingBus().bus;
    const classic = createGame({ cycle: 'classic', bus, rng: seededRng(5) });
    classic.actions.seedAt(50, 50);
    run(classic, 5, report(stable(2)), 0.5);
    const s = classic.state as GameState;
    s.era = 3;
    s.genome = 4;
    const { g } = sessionsGame(1, classic.serialize());
    expect(g.migration).not.toBeNull();
    expect(g.view().era).toBe(3);
    expect(g.view().research!.datos).toBeGreaterThan(0);
    expect(g.view().session!.phase).toBe('ready');
  });

  it('a v1 save still loads in the classic cycle', async () => {
    const { checksum } = await import('./state');
    const g = createGame({ cycle: 'classic', bus: recordingBus().bus, rng: seededRng(1) });
    g.actions.seedAt(50, 50);
    const data = JSON.parse(g.serialize()).data;
    const s = JSON.stringify(data);
    const h = createGame({ cycle: 'classic', bus: recordingBus().bus }, `{"v":1,"sum":"${checksum(s)}","data":${s}}`);
    expect(h.state.stats.seeds).toBe(1);
    expect(h.cycle).toBe('classic');
    expect(h.research).toBeNull();
  });
});

describe('sessions cycle: a dish that cannot be restored (RF-05)', () => {
  it('a waiting session loaded without its dish gets its starter back on the next tick', () => {
    const a = sessionsGame();
    a.g.tick(0.1, null);
    const saved = a.g.serialize();
    // Loaded with its dish (main.ts restored it): nothing is planted again.
    const kept = sessionsGame(1, saved);
    kept.g.tick(0.1, null);
    expect(kept.count('dishSeed')).toBe(0);
    // Loaded without it (no dish saved, or a Quality change resized the grid): the starter comes back.
    const lost = sessionsGame(1, saved);
    lost.g.dishLost();
    lost.g.tick(0.1, null);
    expect(lost.count('dishClear')).toBe(1);
    expect(lost.count('dishSeed')).toBe(1);
    const specs = (lost.log.get('dishSeed')![0] as { specs: unknown[] }).specs;
    expect(specs.length).toBeGreaterThanOrEqual(C.STARTER_CREATURES);
    expect(lost.g.session?.phase).toBe('ready');
  });

  it('a running session loaded without its dish keeps its clock and is not left empty', () => {
    const a = sessionsGame();
    a.g.tick(0.1, null);
    a.g.actions.seedAt(80, 80);
    run(a.g, 3, report(stable(1)), 0.5);
    expect(a.g.session?.phase).toBe('running');
    const elapsed = a.g.session!.elapsed;
    const lost = sessionsGame(1, a.g.serialize());
    lost.g.dishLost();
    lost.g.tick(0.1, null);
    expect(lost.count('dishSeed')).toBe(1);
    expect(lost.g.session?.phase).toBe('running');
    expect(lost.g.session!.elapsed).toBeGreaterThanOrEqual(elapsed);
  });

  it('dishLost does nothing between sessions (the end card freezes an empty dish anyway)', () => {
    const { g } = sessionsGame();
    expect(() => g.dishLost()).not.toThrow();
  });
});

describe('sessions cycle: the device caps the dish (RF-04)', () => {
  it('on a low-quality device the room is the room of the dish it shows', () => {
    const { g } = sessionsGame();
    st(g).research!.levels = { lab: 1, dish: 2 };
    try {
      g.setDeviceDish(160); // low quality: Ø160 at most
      expect(g.view().research!.capacity).toBe(C.DISH_CAPACITY[1]);
      g.setDeviceDish(224);
      expect(g.view().research!.capacity).toBe(C.DISH_CAPACITY[2]);
    } finally {
      g.setDeviceDish(Infinity);
    }
  });
});

describe('sessions cycle: a low-quality device never gives the big dish away (RF-12)', () => {
  it("the reviewer's sequence: Placa gigante on Low with 5 Datos, then the same save on Medium", () => {
    const { g } = sessionsGame();
    try {
      g.setDeviceDish(160);
      const r = g.research as unknown as { datos: number; sessions: number; levels: Record<string, number> };
      r.datos = 5;
      r.sessions = 500;
      const lv: Record<string, number> = {};
      for (const id of Object.keys(TREE_BY_ID)) if (id !== 'dishXL' && id !== 'eternalLife') lv[id] = TREE_BY_ID[id].maxLevel;
      lv.dish = 1; // what a Low device could buy
      r.levels = lv;
      expect(g.buyNode('dishXL').ok).toBe(false);
      expect(g.buyNode('dish').ok).toBe(false);
      expect(g.research!.datos).toBe(5);
      const { g: g2 } = sessionsGame(1, g.serialize());
      g2.setDeviceDish(224);
      expect(g2.research!.levels.dishXL ?? 0).toBe(0);
      expect(g2.effects!.dishLevel).toBe(1);
      // On Medium the next Placa level is on sale at its real price.
      const r2 = g2.research as unknown as { datos: number };
      r2.datos = 5;
      expect(g2.buyNode('dish').ok).toBe(false);
      r2.datos = 1e6;
      const before = r2.datos;
      expect(g2.buyNode('dish').ok).toBe(true);
      expect(g2.research!.datos).toBeLessThan(before);
    } finally {
      g.setDeviceDish(Infinity);
    }
  });
});


describe('session 1 tutorial: the player sows the first creature, the clock waits for VELA (ADR-030)', () => {
  it('QA#4/#7 the first-ever session starts empty and the player\'s first tap plants the sure creature without starting the clock', () => {
    const { g, log, count } = sessionsGame();
    log.delete('dishSeed'); // what boot announced before the dish existed; the first tick plants it
    g.setTutorial(true);
    g.tick(0, null);
    const planted = () => ((log.get('dishSeed') ?? []) as { specs: { x: number; y: number; shape: string; bias?: number }[] }[]).flatMap((e) => e.specs);
    expect(planted()).toEqual([]); // no starter: the dish waits for the player's tap
    expect(g.actions.seedAt(100, 120)).toBeNull(); // planted through dishSeed, so the dish incubates it unlit
    expect(planted()).toHaveLength(1);
    expect(planted()[0]).toMatchObject({ x: 100, y: 120, shape: 'pattern', bias: 1 });
    expect(g.view().session).toMatchObject({ phase: 'ready', tutorialHold: true });
    expect(count('sessionClock')).toBe(0);
    expect(g.view().charges).toEqual({ free: B.START_FREE_SEEDS, guaranteed: C.FIRST_SESSION_SURE_SEEDS }); // the first creature is a gift
    // While VELA talks, a second tap is refused for free.
    expect(g.actions.seedAt(40, 60)).toBeNull();
    expect((log.get('seedBlocked')!.at(-1) as { reason: string }).reason).toBe('growing');
  });

  it('startClock starts the clock once', () => {
    const { g, count } = sessionsGame();
    g.setTutorial(true);
    g.tick(0, null);
    g.actions.seedAt(100, 120);
    g.actions.startClock!();
    g.actions.startClock!();
    expect(count('sessionClock')).toBe(1);
    expect(g.view().session).toMatchObject({ phase: 'running', tutorialHold: false });
    expect(g.actions.seedAt(40, 60)).not.toBeNull(); // free play now
  });

  it('a tutorial that never closes still starts the clock (fail-safe)', () => {
    const { g } = sessionsGame();
    g.setTutorial(true);
    g.tick(0, null);
    g.actions.seedAt(100, 120);
    run(g, C.TUTORIAL_HOLD_MAX_S + 1, null, 0.5);
    expect(g.view().session!.phase).toBe('running');
  });

  it('without the tutorial, session 1 keeps its starter and the first tap starts the clock', () => {
    const { g, log } = sessionsGame();
    log.delete('dishSeed');
    g.tick(0, null);
    expect(((log.get('dishSeed') ?? []) as { specs: unknown[] }[]).flatMap((e) => e.specs)).toHaveLength(C.STARTER_CREATURES);
    expect(g.actions.seedAt(100, 120)).not.toBeNull();
    expect(g.view().session!.phase).toBe('running');
  });
});

describe('clear prices (ADR-030, docs/CLARIDAD2.md §2.7, §2.11)', () => {
  /** A game in session `n` (earlier ones ended at once), its clock running. */
  function inSession(n: number, seed = 2) {
    const x = sessionsGame(seed);
    for (let k = 1; k < n; k++) {
      x.g.actions.seedAt(150, 200);
      x.g.actions.endSessionNow!();
      x.g.actions.startSession!();
    }
    x.g.actions.seedAt(150, 200);
    return x;
  }

  it('QA#21 the seed price never changes within a session', () => {
    const { g } = inSession(1);
    const s = st(g);
    s.charges = { free: 0, guaranteed: 0 };
    s.essence = 1000;
    const prices = [g.view().seedCost];
    g.actions.seedAt(30, 200);
    prices.push(g.view().seedCost);
    expect(g.view().seedPrice!.bought).toBe(1);
    s.session!.bought = 12; // a busy run: the twelfth seed costs what the first did
    prices.push(g.view().seedCost);
    expect(new Set(prices)).toEqual(new Set([C.SESSION_SEED_PRICE]));
    expect(g.view().seedPrice!.stepMult).toBe(1);
  });

  it('QA#5 no Nutrientes in session 1', () => {
    const { g } = inSession(1);
    st(g).essence = 1e6;
    run(g, C.BOOST_FROM_SECONDS + 1, report(stable(2)), 0.5);
    expect(g.view().boost).toBeNull();
    expect(g.actions.buyBoost!()).toBe(false);
  });

  it('QA#22 the Nutrientes price does not rise while nothing is bought', () => {
    const { g } = inSession(C.BOOST_FROM_SESSION);
    st(g).essence = 1e6;
    run(g, C.BOOST_FROM_SECONDS + 1, report(stable(1)), 0.5);
    const b0 = g.view().boost!;
    expect(b0.affordable).toBe(true);
    const eps0 = g.view().essencePerSec;
    expect(b0.cost).toBe(Math.round(Math.max(C.BOOST_MIN_COST, C.BOOST_SECONDS * eps0)));
    expect(b0.nextCost).toBe(Math.round(b0.cost * C.BOOST_GROWTH));
    run(g, 2, report(stable(3)), 0.5); // the dish makes three times the light: the price stays
    expect(g.view().essencePerSec).toBeGreaterThan(eps0 * 2);
    expect(g.view().boost!.cost).toBe(b0.cost);
    expect(g.actions.buyBoost!()).toBe(true);
    expect(g.view().boost!.cost).toBe(b0.nextCost);
  });

  it('QA#8 no Nutrientes in the last 3 s', () => {
    const { g } = inSession(C.BOOST_FROM_SESSION);
    st(g).essence = 1e6;
    const rep = report(stable(1));
    for (let i = 0; i < 400 && g.view().session!.remaining > C.BOOST_UNTIL_REMAINING; i++) g.tick(0.25, rep);
    const b = g.view().boost!;
    expect(b).toMatchObject({ noTime: true, affordable: false });
    expect(g.actions.buyBoost!()).toBe(false);
  });

  it('QA#13 Destello frecuente brings the first Spark sooner', () => {
    const plain = inSession(C.SPARK_FROM_SESSION, 5);
    const fast = sessionsGame(5);
    for (let k = 1; k < C.SPARK_FROM_SESSION; k++) {
      if (k > 1) fast.g.actions.startSession!();
      fast.g.actions.seedAt(150, 200);
      fast.g.actions.endSessionNow!();
    }
    st(fast.g).research!.datos = 1e4;
    expect(fast.g.buyNode('pulse').ok).toBe(true); // ADR-031: ✦ Pulso opens the route
    for (let k = 0; k < 3; k++) expect(fast.g.buyNode('spark').ok).toBe(true);
    fast.g.actions.startSession!();
    fast.g.actions.seedAt(150, 200);
    const f = Math.pow(C.GOLDEN_INTERVAL_FACTOR, 3);
    expect(st(plain.g).goldenTimer).toBeGreaterThanOrEqual(C.SESSION_GOLDEN_FIRST_DELAY[0]);
    expect(st(fast.g).goldenTimer).toBeLessThanOrEqual(C.SESSION_GOLDEN_FIRST_DELAY[1] * f + 1e-9);
    expect(st(fast.g).goldenTimer).toBeGreaterThanOrEqual(C.SESSION_GOLDEN_FIRST_DELAY[0] * f - 1e-9);
  });
});

describe('screen data of the run and its report (ADR-030)', () => {
  it('QA#26 the start view says where every Luz of the wallet comes from', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    g.actions.endSessionNow!();
    g.grantEncargo({ essence: 30, samples: 0, name: { es: 'Ten 3 criaturas', en: 'Have 3 creatures' } }); // done in the Tree
    g.actions.startSession!();
    const start = g.sessionStart!;
    expect(start.carry).toBe(30);
    expect(start.startEssence + start.carry!).toBe(g.view().essence);
  });

  it('QA#36 the next session defaults to a world with species to find', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    run(g, 6, report(stable(2)), 0.5); // the Classic world's one species enters the Bestiary
    expect(g.state.species.some((x) => x.catalogCode === 'O2u')).toBe(true);
    g.actions.endSessionNow!();
    st(g).research!.datos = 1e3;
    expect(g.buyNode('worldCold').ok).toBe(true);
    expect(g.view().research!.world).toBe('cold');
    // The player goes back to the Classic world, already complete, for one run (picked on the start card)…
    g.actions.startSession!();
    g.actions.pickWorld!('classic');
    expect(g.view().session!.world).toBe('classic'); // their pick is kept
    g.actions.seedAt(150, 200);
    g.actions.endSessionNow!();
    g.actions.startSession!();
    // …so the next run opens where a species still waits.
    expect(g.view().session!.world).toBe('cold');
    expect(g.sessionStart!.worldsLeft).toMatchObject({ classic: 0, cold: 1 });
  });

  it('QA#36 a summary with fewer Datos than the one before says why', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    run(g, 6, report(stable(2)), 0.5); // a first run that finds its species
    g.actions.endSessionNow!();
    const first = g.lastSummary!;
    g.actions.startSession!();
    g.actions.seedAt(150, 200);
    g.actions.endSessionNow!();
    const second = g.lastSummary!;
    expect(second.datos.total).toBeLessThan(first.datos.total);
    expect(second.lessReason).toMatchObject({ before: first.fromLight, now: second.fromLight });
    expect(second.lessReason!.prize).toBe(first.discovery);
    expect(first.lessReason ?? null).toBeNull();
  });

  it('QA#24/#9 the summary names every Encargo, record and first step it pays for', () => {
    const { g } = sessionsGame();
    g.actions.seedAt(150, 200);
    run(g, 3, report(stable(2)), 0.5);
    g.grantEncargo({ essence: 5, samples: 0, name: { es: 'Siembra 2 criaturas', en: 'Sow 2 creatures' } });
    g.actions.endSessionNow!();
    const sum = g.lastSummary!;
    const steps = sum.goals.filter((x) => x.kind === 'step').map((x) => x.name.es);
    expect(steps).toContain('sembrar');
    expect(steps).toContain('primera criatura');
    expect(sum.goals.filter((x) => x.kind === 'encargo').map((x) => x.name.es)).toEqual(['Siembra 2 criaturas']);
    const paid = sum.datos.terms.find((t) => t.kind === 'encargos');
    expect(sum.goals.reduce((a, x) => a + x.datos, 0)).toBe(paid?.value ?? 0);
    for (const r of sum.records) expect(r.name.es.length).toBeGreaterThan(0);
    expect(sum.collection).toMatchObject({ have: g.state.species.length, total: 7 });
  });
});
