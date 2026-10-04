import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import {
  BRANCHES,
  TREE_BANDS,
  TREE_BY_ID,
  TREE_EDGES,
  TREE_GATES,
  TREE_LAYOUT,
  TREE_NODES,
  affordableNodes,
  baseEffects,
  beforeAfter,
  branchAngle,
  buyNode,
  canBuy,
  costRows,
  effectLine,
  nextGoal,
  nightInfo,
  nodeCost,
  nodeTotalCost,
  niceRound,
  possibleSpecies,
  priceRule,
  routeNodes,
  seedConfig,
  seedSuccess,
  sessionsToAfford,
  treeEffects,
  treeStates,
  type TreeCtx,
} from './tree';
import { BRANCH_TEXT, NODE_TEXT } from './treeText';
import { TOTAL_WORLD_SPECIES, WORLDS } from './worlds';

const ctx = (levels: Record<string, number> = {}, datos = 0, sessions = 0, species = 0): TreeCtx => ({ levels, datos, sessions, species });

/** Own every step before `id` on its route (and `id` itself at level 1). */
function ownPath(id: string, into: Record<string, number> = {}): Record<string, number> {
  const def = TREE_BY_ID[id];
  for (const r of def.requires) if (r !== 'lab') ownPath(r, into);
  into[id] = Math.max(into[id] ?? 0, 1);
  return into;
}

/** The published route plan (owner page "Rutas de mejora de Bioluma"): name, ring, levels, factor. */
const PLAN: Record<string, [string, number, number, number][]> = {
  time: [['clock', 1, 3, 2], ['clock2', 2, 2, 2], ['fridge', 2, 3, 2], ['sprint', 3, 3, 2], ['encTime', 3, 2, 2], ['clock3', 4, 2, 2], ['clock4', 5, 3, 2]],
  dropper: [['dropper', 1, 3, 2], ['startEssence', 2, 4, 2], ['freeSeeds', 3, 3, 2], ['stabilizer', 3, 5, 1.5], ['bigSeed', 3, 1, 2], ['autoSeeder', 3, 6, 1.5], ['cheapSeeds', 4, 3, 2], ['dropperMax', 5, 1, 2]],
  dish: [['dish', 1, 3, 3], ['slots', 2, 3, 2], ['crowdCost', 3, 2, 2], ['nursery', 3, 1, 2], ['incubator', 3, 2, 3], ['dishXL', 4, 1, 2], ['ecosystem', 4, 2, 2]],
  life: [['culture', 1, 5, 1.5], ['nutrient', 2, 3, 2], ['culture2', 3, 3, 2], ['swimAffinity', 3, 3, 2], ['stillAffinity', 3, 3, 2], ['colonyAffinity', 4, 3, 2], ['symbiosis', 4, 1, 2], ['abundance', 4, 1, 2], ['eternalLife', 5, 99, 1.1]],
  discovery: [['notebook', 1, 3, 2], ['print', 2, 1, 2], ['cataloguing', 3, 5, 1.5], ['archive', 3, 2, 2], ['microscope', 3, 2, 2], ['discoBonus', 4, 2, 2], ['rareSpores', 4, 1, 2], ['mutations', 4, 1, 2], ['encyclopedia', 5, 3, 2]],
  // Plan rings and node count; the world order follows the measured yield (docs/CICLO.md §4.3).
  worlds: [['worldCold', 1, 1, 2], ['worldGyro', 2, 1, 2], ['worldShields', 3, 1, 2], ['worldHelix', 3, 1, 2], ['worldLegs', 4, 1, 2], ['worldGiants', 5, 1, 2]],
  spark: [['spark', 1, 3, 2], ['sparkLife', 2, 2, 2], ['sparkTime', 2, 2, 2], ['sparkFirst', 3, 1, 2], ['sparkGift', 3, 3, 2], ['sparkDatos', 3, 2, 2], ['sparkMutagen', 4, 1, 2]],
};

describe('research tree data: 7 straight routes', () => {
  it('matches the published plan node for node (order, ring, levels, price factor)', () => {
    expect(BRANCHES).toEqual(['time', 'dropper', 'dish', 'life', 'discovery', 'worlds', 'spark']);
    for (const b of BRANCHES) {
      const got = routeNodes(b).map((n) => [n.id, n.ring, n.maxLevel, n.growth]);
      expect(got, b).toEqual(PLAN[b]);
    }
    expect(TREE_NODES.length).toBe(1 + Object.values(PLAN).reduce((a, r) => a + r.length, 0));
    expect(new Set(TREE_NODES.map((n) => n.id)).size).toBe(TREE_NODES.length);
  });

  it('every node needs only the step before it on its route (the first needs the centre)', () => {
    for (const b of BRANCHES) {
      const r = routeNodes(b);
      r.forEach((n, i) => {
        expect(n.requires, n.id).toEqual([i === 0 ? 'lab' : r[i - 1].id]);
        expect(n.step).toBe(i + 1);
        if (i > 0) expect(n.ring, n.id).toBeGreaterThanOrEqual(r[i - 1].ring);
      });
    }
    expect(TREE_EDGES.length).toBe(TREE_NODES.length - 1);
  });

  it('every node has kid-simple text in both languages and an icon', () => {
    for (const n of TREE_NODES) {
      const tx = NODE_TEXT[n.id];
      expect(tx, n.id).toBeDefined();
      for (const k of ['es', 'en'] as const) {
        expect(tx.name[k].length).toBeGreaterThan(0);
        expect(tx.name[k].replace(/\s·\s/, ' ').split(/\s+/).length, `${n.id} name`).toBeLessThanOrEqual(4);
        expect(tx.desc[k].split(/\s+/).length, `${n.id} desc ${k}`).toBeLessThanOrEqual(12);
        expect(tx.desc[k], n.id).not.toMatch(/μ|σ|kernel|Calibr/i);
      }
      expect(n.icon.length).toBeGreaterThan(0);
    }
    for (const b of [...BRANCHES, 'core' as const]) expect(BRANCH_TEXT[b].name.es.length).toBeGreaterThan(0);
  });
});

describe('always more: "antes → después"', () => {
  it('every level of every node makes its number strictly better, alone or on a full tree', () => {
    const full: Record<string, number> = {};
    for (const n of TREE_NODES) full[n.id] = Math.min(n.maxLevel, 4);
    for (const n of TREE_NODES) {
      if (n.id === 'lab') continue;
      const top = Math.min(n.maxLevel, 6);
      for (const base of [ownPath(n.id, {}), { ...full }]) {
        for (let l = 0; l < top; l++) {
          const levels = { ...base, [n.id]: l };
          const ba = beforeAfter(levels, n.id);
          if (n.supersededBy && levels[n.supersededBy]) {
            // Gotero maestro / Placa gigante already do its whole job: complete, never a dead buy.
            expect(ba.after).toBeNull();
            expect(treeStates(ctx({ ...levels, [n.id]: Math.max(1, l) }, 1e9, 99, 99)).get(n.id)!.block).toBe('maxed');
            continue;
          }
          expect(ba.after, `${n.id}@${l}`).not.toBeNull();
          expect(ba.better, `${n.id}@${l}: ${ba.before.es} → ${ba.after?.es}`).toBe(true);
          expect(ba.after!.es, `${n.id}@${l}`).not.toBe(ba.before.es);
        }
      }
    }
  });

  it('reads like the plan', () => {
    expect(beforeAfter({}, 'clock')).toMatchObject({ before: { es: 'Sesión 2:00' }, after: { es: 'Sesión 2:15' } });
    expect(beforeAfter({ clock: 3, clock2: 1 }, 'clock2').after!.es).toBe('Sesión 3:15');
    expect(beforeAfter({ culture: 1 }, 'culture')).toMatchObject({ before: { es: 'Esencia ×1,15' }, after: { es: 'Esencia ×1,32', en: 'Essence ×1.32' } });
    expect(beforeAfter({}, 'dish')).toMatchObject({ before: { es: `Sitio para ${C.DISH_CAPACITY[0]} criaturas` }, after: { es: `Sitio para ${C.DISH_CAPACITY[1]} criaturas`, en: `Room for ${C.DISH_CAPACITY[1]} creatures` } });
    expect(beforeAfter({}, 'slots')).toMatchObject({ before: { es: 'Sitio para 5 criaturas' }, after: { es: 'Sitio para 6 criaturas' } });
    expect(beforeAfter({}, 'sparkGift')).toMatchObject({ before: { es: 'Regalo: 30 s de Esencia' } });
    expect(beforeAfter({}, 'sprint').after!.es).toBe('Últimos 30 s: Esencia ×1,5');
    expect(beforeAfter({}, 'cheapSeeds')).toMatchObject({ before: { es: 'Precio normal' }, after: { es: 'Semillas −15 %' } });
    expect(beforeAfter({}, 'autoSeeder')).toMatchObject({ before: { es: 'Nunca' }, after: { es: 'Cada 20 s' } });
    expect(beforeAfter({}, 'spark')).toMatchObject({ before: { es: 'Llega cada 80–100 s' }, after: { es: 'Llega cada 68–85 s' } });
    expect(beforeAfter({}, 'worldCold')).toMatchObject({ before: { es: '2 especies para encontrar' }, after: { es: '5 especies para encontrar' } });
    expect(beforeAfter({ clock: 3 }, 'clock').after).toBeNull();
  });

  it('describes a level as one line, "now → next"', () => {
    expect(effectLine('clock', 0)).toEqual({ es: 'Sesión 2:00 → Sesión 2:15', en: 'Session 2:00 → Session 2:15' });
    expect(effectLine('clock', 3).es).toBe('Sesión 2:45');
  });

  it('the next three levels and their prices feed the bar chart', () => {
    const rows = costRows('clock', 1);
    expect(rows.map((r) => r.level)).toEqual([2, 3]);
    expect(rows.map((r) => r.cost)).toEqual([2 * C.TREE_RING_START[1], 4 * C.TREE_RING_START[1]]);
    expect(rows.map((r) => r.value.es)).toEqual(['Sesión 2:30', 'Sesión 2:45']);
    expect(costRows('clock', 3)).toEqual([]);
  });
});

describe('prices: one rule, nothing hidden', () => {
  it('friendly rounding', () => {
    expect(niceRound(3)).toBe(3);
    expect(niceRound(22.5)).toBe(23);
    expect(niceRound(506)).toBe(510);
    expect(niceRound(1234)).toBe(1200);
  });

  it('is ring start × factor^level', () => {
    for (const n of TREE_NODES) {
      if (n.id === 'lab') continue;
      const r = priceRule(n.id);
      expect(r.start, n.id).toBe(n.id === 'eternalLife' ? C.ETERNAL_LIFE_START : C.TREE_RING_START[n.ring]);
      for (let l = 0; l < Math.min(n.maxLevel, 8); l++) expect(nodeCost(n.id, l), `${n.id}@${l}`).toBe(niceRound(r.start * r.growth ** l));
    }
    expect(nodeCost('clock', 0)).toBe(C.TREE_RING_START[1]);
    expect(nodeCost('clock', 2)).toBe(4 * C.TREE_RING_START[1]);
    expect(nodeCost('clock', 3)).toBe(Infinity);
    expect(nodeCost('dish', 2)).toBe(9 * C.TREE_RING_START[1]);
    expect(nodeCost('stabilizer', 1)).toBe(niceRound(C.TREE_RING_START[3] * 1.5));
  });

  it('every price climbs level after level and the same input gives the same price', () => {
    for (const n of TREE_NODES) {
      if (n.id === 'lab') continue; // nights are free (paced by sessions and species)
      let prev = 0;
      for (let l = 0; l < Math.min(n.maxLevel, 30); l++) {
        const c = nodeCost(n.id, l);
        expect(c, `${n.id}@${l}`).toBeGreaterThan(prev);
        expect(nodeCost(n.id, l)).toBe(c);
        prev = c;
      }
    }
  });

  it('estimates the sessions needed from the recent Datos per session', () => {
    expect(sessionsToAfford(0, [10])).toBe(0);
    expect(sessionsToAfford(25, [])).toBeNull();
    expect(sessionsToAfford(25, [10, 10, 10])).toBe(3);
    expect(sessionsToAfford(40, [1, 1, 1, 20, 20, 20])).toBe(2);
  });

  it('the first night is cheap: everything of rings 1–2 costs a few sessions of a beginner', () => {
    const night1 = TREE_NODES.filter((n) => n.id !== 'lab' && C.TREE_RING_NIGHT[n.ring] === 1).reduce((a, n) => a + nodeTotalCost(n.id), 0);
    expect(night1).toBeLessThan(1000);
  });
});

describe('reveal rules', () => {
  it('a new save sees the centre, the 7 first steps and "?" right behind them', () => {
    const st = treeStates(ctx());
    expect(st.get('lab')!.status).toBe('owned');
    for (const b of BRANCHES) {
      const [a, b2, c] = routeNodes(b);
      expect(st.get(a.id)!.status, a.id).toBe('available');
      expect(st.get(b2.id)!.status, b2.id).toBe('mystery');
      expect(st.get(c.id)!.status, c.id).toBe('hidden');
    }
  });

  it('buying a step reveals the next one and the "?" after it', () => {
    const r = buyNode(ctx({}, 10), 'clock');
    expect(r.ok).toBe(true);
    expect(r.levels.clock).toBe(1);
    expect(r.datos).toBe(10 - C.TREE_RING_START[1]);
    expect(r.revealed).toEqual(expect.arrayContaining(['clock2', 'fridge']));
    const st = treeStates(ctx(r.levels, r.datos));
    expect(st.get('clock2')!.status).toBe('available');
    expect(st.get('fridge')!.status).toBe('mystery');
  });

  it('rings beyond the night show as "?" with the night that opens them', () => {
    const levels = ownPath('fridge');
    const st = treeStates(ctx(levels, 1000));
    expect(st.get('sprint')!.status).toBe('mystery');
    expect(st.get('sprint')!.nightNeeded).toBe(2);
    expect(canBuy(ctx(levels, 1000), 'sprint').block).toBe('night');
    levels.lab = 2;
    expect(treeStates(ctx(levels, 1000)).get('sprint')!.status).toBe('available');
  });

  it('never mutates the levels it is given; refuses with the reason', () => {
    const levels = Object.freeze({ lab: 1 }) as Record<string, number>;
    expect(buyNode(ctx(levels, 100), 'dish').ok).toBe(true);
    expect(levels).toEqual({ lab: 1 });
    expect(canBuy(ctx({ clock: 3 }, 1000), 'clock')).toEqual({ ok: false, block: 'maxed' });
    expect(canBuy(ctx({}, C.TREE_RING_START[1] - 1), 'clock')).toEqual({ ok: false, block: 'datos' });
    expect(canBuy(ctx({}, 1000), 'clock2')).toEqual({ ok: false, block: 'locked' });
    expect(canBuy(ctx({}, 100), 'nope').block).toBe('unknown');
  });

  it('counts what is affordable and the next goal', () => {
    expect(affordableNodes(ctx({}, 0))).toEqual([]);
    expect(affordableNodes(ctx({}, C.TREE_RING_START[1])).sort()).toEqual(BRANCHES.map((b) => routeNodes(b)[0].id).sort());
    expect(nextGoal(ctx({}, 0))!.cost).toBe(C.TREE_RING_START[1]);
  });
});

describe('nights (the centre)', () => {
  it('free, gated by sessions and species, never stuck', () => {
    const gate = C.NIGHT_GATES[0];
    expect(nightInfo(ctx({}, 0, gate.sessions - 1, gate.species)).gateMet).toBe(false);
    expect(nightInfo(ctx({}, 0, gate.sessions, gate.species - 1)).gateMet).toBe(false);
    expect(nightInfo(ctx({}, 0, gate.sessions + C.NIGHT_GATE_FALLBACK, 0)).gateMet).toBe(true);
    const ok = ctx({}, 0, gate.sessions, gate.species);
    expect(nightInfo(ok)).toMatchObject({ night: 1, next: 2, cost: 0, gateMet: true, affordable: true });
    const r = buyNode(ok, 'lab');
    expect(r.ok).toBe(true);
    expect(r.levels.lab).toBe(2);
    expect(r.datos).toBe(0);
  });

  it('opens ring 3 on night 2, ring 4 on night 3 and ring 5 on night 4', () => {
    expect(C.TREE_RING_NIGHT).toEqual({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 });
    expect(TREE_GATES.map((g) => g.night)).toEqual([2, 3, 4]);
  });
});

describe('effects', () => {
  it('a fresh tree gives the base session in the first world', () => {
    expect(treeEffects({})).toEqual(baseEffects());
    expect(baseEffects().sessionSeconds).toBe(C.SESSION_BASE_SECONDS);
    expect(baseEffects().worlds).toEqual(['classic']);
  });

  it('the whole Reloj route gives 5:00', () => {
    const fx = treeEffects({ clock: 3, clock2: 2, clock3: 2, clock4: 3 });
    expect(fx.sessionSeconds).toBe(5 * 60);
  });

  it('aggregates multipliers, flags and levels', () => {
    const fx = treeEffects({ culture: 2, culture2: 1, abundance: 1, dropper: 2, stabilizer: 3, dish: 3, dishXL: 1, slots: 2, spark: 2, autoSeeder: 2, lab: 3, encyclopedia: 2, worldCold: 1, worldGyro: 1 });
    expect(fx.prodMult).toBeCloseTo(C.CULTURE_TREE_MULT ** 2 * C.CULTURE2_MULT * C.ABUNDANCE_MULT, 9);
    expect(fx.dishLevel).toBe(C.DISH_XL_LEVEL);
    expect(fx.extraSlots).toBe(2 * C.SLOTS_PER_LEVEL);
    expect(fx.goldenIntervalMult).toBeCloseTo(C.GOLDEN_INTERVAL_FACTOR ** 2, 9);
    expect(fx.autoSeedInterval).toBeCloseTo(C.AUTOSEED_TREE_INTERVAL * C.AUTOSEED_TREE_DECAY, 9);
    expect(fx.night).toBe(3);
    expect(fx.datosNightMult).toBeCloseTo(1 + 2 * C.DATOS_NIGHT_BONUS, 9);
    expect(fx.datosMult).toBeCloseTo(1 + 2 * C.ENCYCLOPEDIA_BONUS, 9);
    expect(fx.worlds).toEqual(['classic', 'cold', 'gyro']);
    expect(treeEffects({ autoSeeder: 6 }).autoSeedInterval).toBeCloseTo(6.55, 2);
  });

  it('ignores levels above the cap and unknown ids', () => {
    expect(treeEffects({ clock: 99 }).sessionSeconds).toBe(C.SESSION_BASE_SECONDS + 3 * C.TIME_CLOCK);
    expect(treeEffects({ ghost: 5, calibrator: 2 })).toEqual(baseEffects());
  });

  it('seeds: measured success climbs with Gotero and Estabilizador, Gotero maestro always takes', () => {
    let prev = 0;
    for (let d = 0; d <= 3; d++) {
      const s = seedSuccess({ dropper: d, stabilizer: 0, masterDropper: false });
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
    for (let st = 1; st <= 5; st++) expect(seedSuccess({ dropper: 3, stabilizer: st, masterDropper: false })).toBeGreaterThan(seedSuccess({ dropper: 3, stabilizer: st - 1, masterDropper: false }));
    expect(seedSuccess({ dropper: 0, stabilizer: 0, masterDropper: true })).toBe(1);
    expect(seedConfig({ dropper: 0, stabilizer: 0, masterDropper: true })).toEqual({ bias: 1, noise: C.DROPPER_MASTER_NOISE });
    const a = seedConfig({ dropper: 1, stabilizer: 0, masterDropper: false });
    const b = seedConfig({ dropper: 1, stabilizer: 2, masterDropper: false });
    expect(b.bias).toBeGreaterThan(a.bias);
    expect(b.noise).toBeLessThan(a.noise);
  });

  it('every world node adds the species of its world', () => {
    expect(possibleSpecies(treeEffects({}))).toBe(WORLDS[0].species.length > 0 ? possibleSpecies(baseEffects()) : 0);
    const all: Record<string, number> = {};
    for (const w of WORLDS) if (w.node) all[w.node] = 1;
    expect(possibleSpecies(treeEffects(all))).toBe(TOTAL_WORLD_SPECIES);
  });
});

describe('layout: rings are bands, routes are rays', () => {
  it('the centre is at 0, every route on its own ray, distance grows step by step', () => {
    expect(TREE_LAYOUT.get('lab')).toEqual({ x: 0, y: 0 });
    for (const b of BRANCHES) {
      const a = (branchAngle(b) * Math.PI) / 180;
      let prev = 0;
      for (const n of routeNodes(b)) {
        const p = TREE_LAYOUT.get(n.id)!;
        const d = Math.hypot(p.x, p.y);
        expect(d, n.id).toBeGreaterThan(prev + 0.5);
        expect(Math.abs(Math.atan2(p.y, p.x) - Math.atan2(Math.sin(a), Math.cos(a)))).toBeLessThan(1e-9);
        const band = TREE_BANDS.get(n.ring)!;
        expect(d).toBeGreaterThanOrEqual(band.from - 1e-9);
        expect(d).toBeLessThanOrEqual(band.to + 1e-9);
        prev = d;
      }
    }
    expect(TREE_LAYOUT.get('clock')!.y).toBeLessThan(0); // Reloj points up
  });

  it('no two nodes overlap and every night circle lies between two bands', () => {
    const pts = [...TREE_LAYOUT.values()];
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(min).toBeGreaterThanOrEqual(0.9);
    for (const g of TREE_GATES) for (const b of TREE_BANDS.values()) expect(g.r < b.from || g.r > b.to).toBe(true);
  });
});
