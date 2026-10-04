import { describe, expect, it } from 'vitest';
import * as B from './balance';
import * as C from './cycleBalance';
import { createGame } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, run, seededRng } from './testUtil';
import { WORLD_BY_ID } from './worlds';
import { rotateQuarter, scaledTemplate } from './seeding';
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
    expect(g.actions.seedAt(150, 200)).not.toBeNull();
    expect(count('sessionClock')).toBe(1);
    expect(g.view().session!.phase).toBe('running');
    run(g, 10, rep, 0.5);
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
    // 3 alive + the starter creature (docs/RITMO.md §4.2) leave room for one more seed in the base dish.
    run(g, 1, report(stable(3)), 0.5);
    expect(g.view().seedCost).toBe(C.SESSION_SEED_PRICE); // 3 creatures alive: same price
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
    expect(reward).toContain(`${C.SPARK_GIFT_SECONDS} s de tu Esencia`);
    expect(g.session!.goldens).toBe(1);
  });

  it('Abono costs 20 s of production, doubles each time, and raises production ×1,25', () => {
    const { g, count } = sessionsGame();
    const rep = report(stable(3));
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
    expect(g.view().boost!.cost).toBe(Math.round(Math.max(C.BOOST_MIN_COST, C.BOOST_SECONDS * eps0 * C.BOOST_MULT) * C.BOOST_GROWTH));
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

  it('Frío seeds are exact quarter turns of its templates with more template; Clásico keeps the free angle', () => {
    const { g } = sessionsGame(3);
    st(g).charges = { free: 5, guaranteed: 0 };
    const a = g.actions.seedAt(150, 200)!;
    expect(a.rotation).not.toBe(0);
    st(g).research!.datos = 100;
    g.actions.endSessionNow!();
    expect(g.buyNode('worldCold').ok).toBe(true);
    g.actions.startSession!();
    expect(g.view().session!.world).toBe('cold');
    st(g).charges = { free: 5, guaranteed: 0 };
    const b = g.actions.seedAt(150, 200)!;
    expect(b.rotation).toBe(0);
    const turns = WORLD_BY_ID.cold.species.flatMap((c) => [0, 1, 2, 3].map((k) => rotateQuarter(scaledTemplate(catalogByCode(c)!, 13), k)));
    expect(turns).toContain(b.pattern);
    expect(b.bias).toBeCloseTo(C.DROPPER_TREE_BIAS[0] + C.WORLD_SEED_HELP.cold.bias, 6);
    expect(b.noise).toBeCloseTo(C.DROPPER_TREE_NOISE[0] - C.WORLD_SEED_HELP.cold.noise, 6);
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
    expect(g.session!.bonus).toBe(C.SESSION_TIME_PER_ENCARGO);
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
    expect(h.view().essence).toBeCloseTo(g.view().essence, 6);
  });

  it('a classic save opened in the sessions cycle is migrated generously', () => {
    const bus = recordingBus().bus;
    const classic = createGame({ bus, rng: seededRng(5) });
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
    const g = createGame({ bus: recordingBus().bus, rng: seededRng(1) });
    g.actions.seedAt(50, 50);
    const data = JSON.parse(g.serialize()).data;
    const s = JSON.stringify(data);
    const h = createGame({ bus: recordingBus().bus }, `{"v":1,"sum":"${checksum(s)}","data":${s}}`);
    expect(h.state.stats.seeds).toBe(1);
    expect(h.cycle).toBe('classic');
    expect(h.research).toBeNull();
  });
});
