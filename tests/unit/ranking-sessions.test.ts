/**
 * RF-01 (docs/qa/REVISION-FINAL.md): the ranking validator must accept every honest player of the
 * sessions cycle — the loop every player plays — and still reject a tampered one. The honest players
 * are the session bot's real games (scripts/sessionBotCore.ts: the integrated game with a model dish),
 * all three policies, many sessions each, submitted the way the client does (runStatsOf).
 */
import { describe, expect, it } from 'vitest';
import { runPolicy, type PolicyName } from '../../scripts/sessionBotCore';
import type { GameState } from '../../src/game/state';
import { createIntegrity, runStatsOf } from '../../src/net/integrity';
import { validateSubmission, type Baseline, type RunStats } from '../../server/validate';
import { SUBMIT_MIN_INTERVAL_MS } from '../../server/protocol';

const START = Date.UTC(2026, 9, 1, 10);
const LATENCY_MS = 800;

interface Snapshot {
  n: number;
  stats: RunStats;
  serverNow: number;
  exported: string;
}

/** Every session end of one bot run: the stats the client would send and the server clock then. */
function playRun(policy: PolicyName, seed: number, sessions: number): Snapshot[] {
  const out: Snapshot[] = [];
  runPolicy(policy, sessions, seed, {
    startMs: START,
    onSessionEnd: (game, { n, wallSec }) => {
      out.push({ n, stats: runStatsOf(game.state as GameState), serverNow: START + wallSec * 1000 + LATENCY_MS, exported: game.exportString() });
    },
  });
  return out;
}

const RUNS: [PolicyName, number][] = [
  ['planner', 1000],
  ['planner', 1017],
  ['greedy', 1000],
  ['greedy', 1034],
  ['kid', 1000],
  ['kid', 1017],
];
const SESSIONS = 40;
const played = new Map<string, Snapshot[]>();
const runOf = (policy: PolicyName, seed: number): Snapshot[] => {
  const k = `${policy}:${seed}`;
  if (!played.has(k)) played.set(k, playRun(policy, seed, SESSIONS));
  return played.get(k)!;
};

describe('honest sessions-cycle players are never rejected or flagged (RF-01)', () => {
  it.each(RUNS)('%s (seed %i): every session end, as a first submission and against the last accepted one', (policy, seed) => {
    const snaps = runOf(policy, seed);
    expect(snaps.length).toBeGreaterThanOrEqual(30);
    // The run really leaves Night 1 (the reviewer's failure started at Night 2).
    expect(snaps[snaps.length - 1].stats.era).toBeGreaterThanOrEqual(policy === 'kid' ? 3 : 5);
    let prev: Baseline | null = null;
    for (const s of snaps) {
      expect(s.stats.cycle, 'runStatsOf marks the sessions cycle').toBe('sessions');
      const alone = validateSubmission(null, s.stats, s.serverNow);
      expect(alone, `S${s.n} alone: ${JSON.stringify(s.stats)}`).toEqual({ verdict: 'accept', hard: [], soft: [] });
      // The client submits at most once a minute (server SUBMIT_MIN_INTERVAL_MS).
      if (prev && s.serverNow - prev.at < SUBMIT_MIN_INTERVAL_MS) continue;
      const r = validateSubmission(prev, { ...s.stats, clientTime: s.serverNow }, s.serverNow);
      expect(r, `S${s.n} after the last accepted one: ${JSON.stringify(s.stats)}`).toEqual({ verdict: 'accept', hard: [], soft: [] });
      prev = { ...s.stats, at: s.serverNow, clientTime: s.serverNow };
    }
  });

  it('importing your own save on another device at Night 2+ does not mark the player as tampered', () => {
    for (const [policy, seed] of RUNS) {
      const snaps = runOf(policy, seed);
      for (const s of snaps.filter((x) => x.stats.era >= 2).slice(-3)) {
        const store = new Map<string, string>();
        const integrity = createIntegrity({
          storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
          dateNow: () => s.serverNow,
          perfNow: () => 0,
        });
        integrity.noteImport(s.exported);
        expect(integrity.report().tampered, `${policy} S${s.n}: ${integrity.reasons().join(',')}`).toBe(false);
      }
    }
  });
});

describe('tampered sessions-cycle submissions are still caught', () => {
  /** A real late Night of the planner: the base every edit starts from. */
  const late = (): Snapshot => {
    const snaps = runOf('planner', 1000);
    return snaps[snaps.length - 1];
  };
  const judge = (over: Partial<RunStats>, prev: Baseline | null = null) => {
    const s = late();
    return validateSubmission(prev, { ...s.stats, ...over }, s.serverNow);
  };

  it('the untouched late save is accepted', () => {
    expect(judge({}).verdict).toBe('accept');
  });

  it.each<[string, (s: RunStats) => Partial<RunStats>, string]>([
    ['a million times the Esencia (and a peak to match)', (s) => ({ lifetimeEssence: s.lifetimeEssence * 1e6, eraEssence: s.lifetimeEssence * 1e6, epsPeak: s.epsPeak * 1e6 }), 'essence_rate'],
    ['a thousand times the production peak', (s) => ({ epsPeak: s.epsPeak * 1000 }), 'eps_peak'],
    ['Night 6 after three sessions', () => ({ era: 6, sessions: 3 }), 'night_gate'],
    ['a night beyond the last one', () => ({ era: 99 }), 'night_max'],
    ['more sessions than the play time allows', (s) => ({ sessions: s.sessions! + Math.ceil(s.playTimeSec) }), 'sessions_rate'],
    ['a hundred times the Datos the Esencia pays', (s) => ({ datos: (s.datos ?? 0) * 100 + 1e5 }), 'datos_max'],
  ])('rejects %s', (_label, over, reason) => {
    const r = judge(over(late().stats));
    expect(r.verdict, JSON.stringify(r)).toBe('reject');
    expect(r.hard).toContain(reason);
  });

  it('flags Esencia edited alone (beyond what its own peak production earns)', () => {
    const s = late().stats;
    for (const k of [100, 1000]) {
      const r = judge({ lifetimeEssence: s.lifetimeEssence * k, eraEssence: s.lifetimeEssence * k });
      expect(r.verdict, `×${k}`).not.toBe('accept');
      expect([...r.hard, ...r.soft]).toContain('essence_peak');
    }
  });

  it('flags a production peak a hundred times the real one', () => {
    const s = late().stats;
    expect(judge({ epsPeak: s.epsPeak * 100 })).toMatchObject({ verdict: 'flag', soft: ['eps_peak'] });
  });

  it('rejects sessions, Datos or nights going backwards against the last accepted submission', () => {
    const s = late();
    const prev: Baseline = { ...s.stats, at: s.serverNow - 5 * 60_000, clientTime: s.serverNow - 5 * 60_000 };
    expect(judge({ sessions: s.stats.sessions! - 1 }, prev).hard).toContain('regress_sessions');
    expect(judge({ datos: (s.stats.datos ?? 0) - 10 }, prev).hard).toContain('regress_datos');
    expect(judge({ era: s.stats.era - 1 }, prev).hard).toContain('regress_era');
  });

  it('rejects fifty sessions in one real minute', () => {
    const s = late();
    const prev: Baseline = { ...s.stats, sessions: s.stats.sessions! - 50, at: s.serverNow - 60_000, clientTime: s.serverNow - 60_000, playTimeSec: s.stats.playTimeSec - 60 };
    expect(judge({}, prev).hard).toContain('sessions_rate');
  });

  it('a submission without the cycle is judged by the classic rules (a Night-2 sessions save is rejected there)', () => {
    const r = judge({ cycle: undefined, sessions: undefined, datos: undefined });
    expect(r.verdict).toBe('reject');
    expect(r.hard).toContain('genome_min');
  });

  it('a sessions save cannot drop back to the classic rules, nor omit its counters', () => {
    const s = late();
    const prev: Baseline = { ...s.stats, at: s.serverNow - 5 * 60_000, clientTime: s.serverNow - 5 * 60_000 };
    expect(judge({ cycle: undefined }, prev).hard).toContain('cycle_back');
    expect(judge({ datos: undefined }).hard).toContain('sessions_fields');
  });
});
