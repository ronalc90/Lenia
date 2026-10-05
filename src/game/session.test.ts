import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import {
  applySummary,
  beginSession,
  computeDatos,
  endSession,
  freshResearch,
  nightReady,
  noteBehavior,
  noteBest,
  noteEncargo,
  noteEssence,
  noteGolden,
  noteKeep,
  noteProduction,
  noteSeed,
  noteSpecies,
  pityDue,
  recentDatos,
  researchBuy,
  researchNight,
  researchPickWorld,
  sessionPreview,
  unlockedWorlds,
  sessionProdMult,
  sessionProgress,
  sessionRemaining,
  summarize,
  tickSession,
  countdownSeconds,
  sprintSeconds,
  warnSeconds,
  validateResearch,
  validateSession,
  type ResearchState,
  type SessionEvent,
  type SessionState,
} from './session';
import { TREE_BY_ID, treeEffects } from './tree';

const types = (ev: SessionEvent[]) => ev.map((e) => e.type);

function run(s: SessionState, seconds: number, fx = treeEffects({}), dt = 0.25): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(...tickSession(s, dt, fx));
  return out;
}

function playOne(r: ResearchState, essence: number, extra: (s: SessionState) => void = () => {}) {
  const fx = treeEffects(r.levels);
  const b = beginSession(r, fx);
  noteSeed(b.session);
  noteEssence(b.session, essence);
  extra(b.session);
  run(b.session, b.session.limit + b.session.bonus + 1, fx);
  const sum = summarize(b.session, b.research, fx, 5);
  return { sum, research: applySummary(b.research, b.session, sum, fx), session: b.session };
}

describe('session clock', () => {
  it('a new save gets a 15 s session whose clock waits for the first seed', () => {
    const fx = treeEffects({});
    const { session, start } = beginSession(freshResearch(), fx);
    expect(session.n).toBe(1);
    expect(start.seconds).toBe(C.SESSION_BASE_SECONDS);
    expect(session.phase).toBe('ready');
    expect(run(session, 30)).toEqual([]);
    expect(session.elapsed).toBe(0);
    expect(types(noteSeed(session))).toEqual(['clockStart']);
    expect(types(noteSeed(session))).toEqual([]); // only the first seed starts it
    expect(sessionRemaining(session)).toBe(C.SESSION_BASE_SECONDS);
  });

  it('a 15 s run warns in its last 4 s, counts its last 5 and ends exactly once (no "último minuto")', () => {
    const { session } = beginSession(freshResearch(), treeEffects({}));
    noteSeed(session);
    expect(session.limit).toBe(15);
    const ev: SessionEvent[] = [];
    let warnAt = -1;
    for (let k = 0; k < (C.SESSION_BASE_SECONDS + 5) * 4; k++) {
      const e = tickSession(session, 0.25, treeEffects({}));
      if (e.some((x) => x.type === 'warn')) warnAt = sessionRemaining(session);
      ev.push(...e);
    }
    const t = types(ev);
    expect(t).not.toContain('lastMinute');
    expect(t.filter((x) => x === 'warn')).toHaveLength(1);
    expect(warnAt).toBeCloseTo(warnSeconds(15), 6);
    expect(warnSeconds(15)).toBe(C.SESSION_WARN_MIN);
    expect(ev.filter((e) => e.type === 'countdown').map((e) => (e as { seconds: number }).seconds)).toEqual([5, 4, 3, 2, 1]);
    expect(t.filter((x) => x === 'timesUp')).toHaveLength(1);
    expect(t[t.length - 1]).toBe('timesUp');
    expect(session.phase).toBe('over');
  });

  it('a long run warns at one minute and 30 s and counts the last 10 seconds', () => {
    const fx = treeEffects({ clock: 6, clock2: 3, clock3: 3, clock4: 3 });
    const { session } = beginSession(freshResearch(), fx);
    noteSeed(session);
    const ev = run(session, fx.sessionSeconds + 5, fx);
    const t = types(ev);
    expect(t.filter((x) => x === 'lastMinute')).toHaveLength(1);
    expect(t.filter((x) => x === 'warn')).toHaveLength(1);
    expect(t.indexOf('lastMinute')).toBeLessThan(t.indexOf('warn'));
    expect(warnSeconds(fx.sessionSeconds)).toBe(C.SESSION_WARN_SECONDS);
    expect(ev.filter((e) => e.type === 'countdown').map((e) => (e as { seconds: number }).seconds)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(t.filter((x) => x === 'timesUp')).toHaveLength(1);
    expect(t[t.length - 1]).toBe('timesUp');
    expect(session.phase).toBe('over');
    expect(sessionRemaining(session)).toBe(0);
    expect(sessionProgress(session)).toBe(1);
  });

  it('stops while paused (explainers, dialogues, the player)', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteSeed(session);
    tickSession(session, 1, fx, { paused: true });
    expect(session.elapsed).toBe(0);
    tickSession(session, 1, fx);
    expect(session.elapsed).toBe(1);
  });

  it('the tree makes it longer and new species, Encargos and Sparks extend it', () => {
    const fx = treeEffects({ clock: 2, sparkTime: 1 });
    const { session } = beginSession({ ...freshResearch(), sessions: 1 }, fx);
    expect(session.limit).toBe(C.SESSION_BASE_SECONDS + 2 * C.TIME_CLOCK);
    noteSeed(session);
    // Base rule: a species new to the Bestiary adds seconds; one already known does not.
    expect(noteSpecies(session, fx, 'sp1', true)).toEqual([{ type: 'extended', seconds: C.SESSION_TIME_PER_SPECIES, reason: 'species' }]);
    expect(noteSpecies(session, fx, 'sp2', false)).toEqual([]);
    expect(noteSpecies(session, fx, 'sp1', true)).toEqual([]); // the same new species again: nothing
    expect(session.species).toEqual(['sp1', 'sp2']);
    expect(noteEncargo(session, fx)).toEqual([{ type: 'extended', seconds: C.SESSION_TIME_PER_ENCARGO, reason: 'encargo' }]);
    expect(noteGolden(session, fx)).toEqual([{ type: 'extended', seconds: C.TIME_PER_GOLDEN, reason: 'golden' }]);
    expect(sessionRemaining(session)).toBe(session.limit + C.SESSION_TIME_PER_SPECIES + C.SESSION_TIME_PER_ENCARGO + C.TIME_PER_GOLDEN);
  });

  it('session 1 counts its silent Encargos but they do not stretch the 15 s run', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteSeed(session);
    expect(session.n).toBe(1);
    expect(noteEncargo(session, fx)).toEqual([]);
    expect(session.encargos).toBe(1);
    expect(sessionRemaining(session)).toBe(C.SESSION_BASE_SECONDS);
  });

  it('extending out of the countdown restarts it', () => {
    const fx = treeEffects({ encTime: 2 });
    expect(fx.timePerEncargo).toBeGreaterThan(countdownSeconds(fx.sessionSeconds));
    const { session } = beginSession({ ...freshResearch(), sessions: 1 }, fx);
    noteSeed(session);
    run(session, fx.sessionSeconds - 3, fx);
    expect(session.countdown).toBe(3);
    noteEncargo(session, fx);
    run(session, 1, fx);
    expect(session.countdown).toBe(0);
  });

  it('sprints in the last seconds only with the Sprint final node', () => {
    const plain = treeEffects({});
    const { session: a } = beginSession(freshResearch(), plain);
    noteSeed(a);
    run(a, C.SESSION_BASE_SECONDS - 5, plain);
    expect(sessionProdMult(a, plain)).toBe(1);
    const fx = treeEffects({ sprint: 2 });
    const { session: b } = beginSession(freshResearch(), fx);
    noteSeed(b);
    expect(sprintSeconds(C.SESSION_BASE_SECONDS)).toBeCloseTo(C.SESSION_BASE_SECONDS * C.SPRINT_SHARE, 9);
    expect(sprintSeconds(600)).toBe(C.SPRINT_SECONDS);
    const ev = run(b, C.SESSION_BASE_SECONDS - sprintSeconds(C.SESSION_BASE_SECONDS) - 1, fx);
    expect(sessionProdMult(b, fx)).toBe(1);
    expect(types(ev)).not.toContain('sprint');
    expect(types(run(b, 2, fx))).toContain('sprint');
    expect(sessionProdMult(b, fx)).toBe(1 + 2 * C.SPRINT_PER_LEVEL);
  });

  it('owes a pity seed when nothing lived after a while', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteSeed(session);
    run(session, C.SESSION_PITY_AFTER - 1, fx);
    expect(pityDue(session)).toBe(false);
    run(session, 2, fx);
    expect(pityDue(session)).toBe(true);
    noteProduction(session, 1, 1);
    expect(pityDue(session)).toBe(false);
  });

  it('can be ended early and then ignores the clock and the notes', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteSeed(session);
    expect(types(endSession(session))).toEqual(['timesUp']);
    expect(endSession(session)).toEqual([]);
    expect(run(session, 10, fx)).toEqual([]);
    noteEssence(session, 100);
    expect(session.essence).toBe(0);
    expect(noteEncargo(session, fx)).toEqual([]);
  });
});

describe('Esencia → Datos', () => {
  it('converts Esencia by a plain division and adds the discoveries (visual equation adds up)', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 12.4 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'a', true);
    noteSpecies(session, fx, 'b', true);
    noteSpecies(session, fx, 'c', false);
    noteBehavior(session, 'swimmer', true);
    noteEncargo(session, fx);
    const d = computeDatos(session, fx, 0);
    expect(d.base).toBe(12);
    expect(d.fromEssence).toBe(12);
    expect(d.terms).toEqual([
      { kind: 'species', count: 2, each: C.DATOS_PER_NEW_SPECIES, value: 2 * C.DATOS_PER_NEW_SPECIES },
      { kind: 'behaviors', count: 1, each: C.DATOS_PER_NEW_BEHAVIOR, value: C.DATOS_PER_NEW_BEHAVIOR },
      { kind: 'encargos', count: 1, each: C.DATOS_PER_ENCARGO, value: C.DATOS_PER_ENCARGO },
    ]);
    expect(d.minimum).toBe(0);
    expect(d.total).toBe(d.fromEssence + d.terms.reduce((a, t) => a + t.value, 0));
  });

  it('never pays less than the minimum (no session with zero gain)', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    const d = computeDatos(session, fx, 0);
    expect(d.total).toBe(C.DATOS_MIN);
    expect(d.minimum).toBe(C.DATOS_MIN);
  });

  it('nights multiply the Esencia part, the encyclopedia every Dato (each step visible)', () => {
    const fx = treeEffects({ lab: 3, encyclopedia: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 10 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'x', true);
    const d = computeDatos(session, fx, 0);
    expect(d.nightMult).toBeCloseTo(1.2, 9);
    expect(d.fromEssence).toBe(12);
    expect(d.terms[0].value).toBe(C.DATOS_PER_NEW_SPECIES);
    expect(d.sub).toBe(12 + C.DATOS_PER_NEW_SPECIES);
    expect(d.bookMult).toBeCloseTo(1 + C.ENCYCLOPEDIA_BONUS, 9);
    expect(d.book).toBe(Math.floor(d.sub * (1 + C.ENCYCLOPEDIA_BONUS)) - d.sub);
    expect(d.total).toBe(d.sub + d.book);
  });

  it('Destello sabio pays per Spark caught', () => {
    const fx = treeEffects({ sparkDatos: 2 });
    const { session } = beginSession(freshResearch(), fx);
    noteGolden(session, fx);
    noteGolden(session, fx);
    expect(computeDatos(session, fx, 0).terms).toEqual([{ kind: 'goldens', count: 2, each: 2 * C.GOLDEN_DATOS, value: 4 * C.GOLDEN_DATOS }]);
  });
});

describe('summary and banking', () => {
  it('the first session pays, counts, and sets records silently', () => {
    const { sum, research } = playOne(freshResearch(), 4.5 * C.DATOS_ESSENCE_DIV, (s) => {
      noteSpecies(s, treeEffects({}), 'sp1', true);
      noteProduction(s, 3.2, 2);
      noteBest(s, 'sp1', 1.8);
    });
    expect(sum.n).toBe(1);
    expect(sum.vela).toBe('first');
    expect(sum.records).toEqual([]);
    expect(sum.datos.total).toBe(4 + C.DATOS_PER_NEW_SPECIES);
    expect(sum.species).toEqual([{ id: 'sp1', isNew: true }]);
    expect(sum.best).toEqual({ speciesId: 'sp1', eps: 1.8 });
    expect(research.sessions).toBe(1);
    expect(research.datos).toBe(sum.datos.total);
    expect(research.records).toEqual({ essence: 4.5 * C.DATOS_ESSENCE_DIV, eps: 3.2, creatures: 2, species: 1 });
    expect(research.history).toHaveLength(1);
    expect(recentDatos(research)).toEqual([sum.datos.total]);
  });

  it('beating a record shows it and pays a Dato', () => {
    const first = playOne(freshResearch(), 450, (s) => noteProduction(s, 3, 2)).research;
    const { sum } = playOne(first, 900, (s) => noteProduction(s, 2, 4));
    expect(sum.records.map((r) => r.kind).sort()).toEqual(['creatures', 'essence']);
    expect(sum.datos.terms).toContainEqual({ kind: 'records', count: 2, each: C.DATOS_PER_RECORD, value: 2 * C.DATOS_PER_RECORD });
    expect(sum.vela).toBe('record');
  });

  it('keeps the best creature for the starter slot, and more with the Nevera node', () => {
    const none = playOne(freshResearch(), 300, (s) => noteKeep(s, ['a', 'b', 'a']));
    expect(none.sum.keep).toEqual(['a'].slice(0, C.STARTER_CREATURES));
    expect(none.research.fridge).toEqual(['a'].slice(0, C.STARTER_CREATURES));
    const r = { ...freshResearch(), levels: { lab: 1, fridge: 2 } };
    const two = playOne(r, 300, (s) => noteKeep(s, ['a', 'b', 'c', 'd']));
    expect(two.research.fridge).toEqual(['a', 'b', 'c', 'd'].slice(0, C.STARTER_CREATURES + 2));
    const next = beginSession(two.research, treeEffects(two.research.levels));
    expect(next.start.fridge).toEqual(['a', 'b', 'c', 'd'].slice(0, C.STARTER_CREATURES + 2));
    expect(next.start.fridgeSlots).toBe(C.STARTER_CREATURES + 2);
    expect(next.session.n).toBe(2);
  });

  it('a summary never touches the state it was computed from (pure)', () => {
    const r = freshResearch();
    const fx = treeEffects({});
    const { session, research } = beginSession(r, fx);
    noteEssence(session, 500);
    const snapshot = JSON.stringify(research);
    summarize(session, research, fx, 1);
    expect(JSON.stringify(research)).toBe(snapshot);
  });

  it('tells when the session made a new night ready', () => {
    const gate = C.NIGHT_GATES[0];
    let r = freshResearch();
    for (let i = 0; i < gate.sessions - 1; i++) r = playOne(r, 200).research;
    expect(nightReady(r, gate.species)).toBe(false);
    const fx = treeEffects(r.levels);
    const b = beginSession(r, fx);
    noteSeed(b.session);
    endSession(b.session);
    const sum = summarize(b.session, b.research, fx, gate.species);
    expect(sum.nightReady).toBe(true);
    expect(sum.vela).toBe('night');
  });
});

describe('research purchases', () => {
  it('buys a node, remembers it as new for the start card, and refuses what it cannot pay', () => {
    let r: ResearchState = { ...freshResearch(), datos: C.TREE_RING_START[1] + 2 };
    const a = researchBuy(r, 'clock', 0);
    expect(a.result.ok).toBe(true);
    expect(a.state.datos).toBe(2);
    expect(a.state.levels.clock).toBe(1);
    expect(a.state.fresh).toEqual(['clock']);
    const b = researchBuy(a.state, 'clock', 0);
    expect(b.result.ok).toBe(false);
    expect(b.result.block).toBe('datos');
    expect(b.state).toBe(a.state);
    r = a.state;
    const { start, research } = beginSession(r, treeEffects(r.levels));
    expect(start.fresh).toEqual(['clock']);
    expect(research.fresh).toEqual([]);
  });

  it('buying the centre starts a new night and resets its Esencia', () => {
    const gate = C.NIGHT_GATES[0];
    const r: ResearchState = { ...freshResearch(), datos: 1000, sessions: gate.sessions, nightEssence: 12345 };
    expect(nightReady(r, gate.species)).toBe(true);
    expect(researchNight(r)).toBe(1);
    const { state, result } = researchBuy(r, 'lab', gate.species);
    expect(result.ok).toBe(true);
    expect(researchNight(state)).toBe(2);
    expect(state.nightEssence).toBe(0);
  });
});

describe('persistence', () => {
  it('round-trips through JSON', () => {
    const { research, session } = playOne(freshResearch(), 777, (s) => noteSpecies(s, treeEffects({}), 'sp1', true));
    expect(validateResearch(JSON.parse(JSON.stringify(research)))).toEqual(research);
    expect(validateSession(JSON.parse(JSON.stringify(session)))).toEqual(session);
  });

  it('repairs damaged fields instead of failing, and drops unknown nodes', () => {
    const r = validateResearch({ v: 1, datos: -5, levels: { clock: 2, ghost: 3, dish: 'x' }, sessions: 'many', history: [{ n: 1, datos: 7 }, 'bad'] }, (id) => !!TREE_BY_ID[id]);
    expect(r).not.toBeNull();
    expect(r!.datos).toBe(0);
    expect(r!.levels).toEqual({ lab: 1, clock: 2 });
    expect(r!.sessions).toBe(0);
    expect(r!.history).toEqual([{ n: 1, seconds: 0, essence: 0, datos: 7, species: 0 }]);
    expect(validateResearch(null)).toBeNull();
    expect(validateResearch({ v: 2 })).toBeNull();
    expect(validateSession({ v: 1, n: 0 })).toBeNull();
    expect(validateSession({ v: 1, n: 3, phase: 'weird', newBehaviors: ['swimmer', 'flying'] })!.newBehaviors).toEqual(['swimmer']);
  });
});

describe('worlds (no Calibrar: the start card picks one)', () => {
  it('starts in the first world; opening a world picks it for the next session', () => {
    let r = freshResearch();
    expect(r.world).toBe('classic');
    expect(unlockedWorlds(r)).toEqual(['classic']);
    r = { ...r, datos: 100 };
    r = researchBuy(r, 'worldCold', 0).state;
    expect(r.world).toBe('cold');
    expect(unlockedWorlds(r)).toEqual(['classic', 'cold']);
    const { session, start } = beginSession(r, treeEffects(r.levels));
    expect(session.world).toBe('cold');
    expect(start.worlds).toEqual(['classic', 'cold']);
  });

  it('the picker only accepts open worlds and the save survives a bad world', () => {
    const r = researchBuy({ ...freshResearch(), datos: 100 }, 'worldCold', 0).state;
    expect(researchPickWorld(r, 'classic').world).toBe('classic');
    expect(researchPickWorld(r, 'giants').world).toBe('cold');
    expect(validateResearch({ ...JSON.parse(JSON.stringify(r)), world: 'mars' })!.world).toBe('classic');
    // A world that is not open (damaged save) falls back to the first one when the session starts.
    expect(beginSession({ ...freshResearch(), world: 'helix' }, treeEffects({})).session.world).toBe('classic');
  });
});

describe('Datos preview before the clock runs out', () => {
  it('shows the Datos so far and how far the next node is, counting them', () => {
    const r = { ...freshResearch(), datos: 1 };
    const fx = treeEffects(r.levels);
    const { session } = beginSession(r, fx);
    noteSeed(session);
    let p = sessionPreview(r, session, fx, 0);
    expect(p.datos).toBe(C.DATOS_MIN);
    expect(p.goal).toMatchObject({ cost: C.TREE_RING_START[1], missing: 0 });
    noteEssence(session, 9.5 * C.DATOS_ESSENCE_DIV);
    p = sessionPreview(r, session, fx, 0);
    expect(p.datos).toBe(9);
    const rich = { ...r, levels: { lab: 1, clock: C.TIME_CLOCK_LEVELS, dropper: 3, dish: 3, culture: 5, notebook: 3, worldCold: 1, spark: 3 } };
    p = sessionPreview(rich, session, fx, 0);
    expect(p.goal!.cost).toBe(C.TREE_RING_START[2]);
    expect(p.goal!.missing).toBe(Math.max(0, C.TREE_RING_START[2] - 1 - 9));
  });
});

describe('Abono price: one rule, never jumping down (QA4 F-17)', () => {
  it('costs BOOST_SECONDS of the run’s best Esencia/s, ×BOOST_GROWTH per Abono bought: a dip never makes it cheaper', async () => {
    const { boostCost } = await import('./session');
    const b = beginSession(freshResearch(), treeEffects({}));
    const s = b.session;
    s.peakEps = 5;
    expect(boostCost(s, 2)).toBe(Math.round(C.BOOST_SECONDS * 5));
    expect(boostCost(s, 6)).toBe(Math.round(C.BOOST_SECONDS * 6));
    s.boosts = 1;
    expect(boostCost(s, 2)).toBe(Math.round(C.BOOST_SECONDS * 5 * C.BOOST_GROWTH));
  });
});
