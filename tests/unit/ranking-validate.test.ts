import { describe, expect, it } from 'vitest';
import * as B from '../../src/game/balance';
import { createGame } from '../../src/game/game';
import { creature, GYRO_SIG, ORBIUM_SIG, recordingBus, report, SCUTIUM_SIG, seededRng } from '../../src/game/testUtil';
import { runStatsOf } from '../../src/net/integrity';
import {
  essenceReachable,
  LIMITS,
  maxBaseEps,
  maxEssenceGain,
  validateSubmission,
  type Baseline,
  type RunStats,
} from '../../server/validate';

const NOW = Date.UTC(2026, 9, 10, 12);
const H = 3600;

/** A modest, plausible first-hour save. */
function run(over: Partial<RunStats> = {}): RunStats {
  return {
    lifetimeEssence: 20_000,
    eraEssence: 20_000,
    genome: 0,
    speciesCount: 4,
    behaviorsCount: 2,
    era: 1,
    playTimeSec: H,
    seeds: 120,
    createdAt: NOW - 2 * H * 1000,
    epsPeak: 40,
    ...over,
  };
}

function baseline(s: RunStats, at: number, clientTime = at): Baseline {
  return { ...s, at, clientTime };
}

describe('absolute rules (first submission)', () => {
  it('accepts a plausible first-hour save', () => {
    expect(validateSubmission(null, run(), NOW)).toEqual({ verdict: 'accept', hard: [], soft: [] });
  });

  it('accepts a brand-new save with nothing in it', () => {
    const s = run({ lifetimeEssence: 0, eraEssence: 0, speciesCount: 0, behaviorsCount: 0, playTimeSec: 5, seeds: 0, createdAt: NOW - 10_000, epsPeak: 0 });
    expect(validateSubmission(null, s, NOW).verdict).toBe('accept');
  });

  it.each<[string, Partial<RunStats>, string]>([
    ['save older than the game', { createdAt: LIMITS.GAME_EPOCH_MS - 1 }, 'created_epoch'],
    ['save from the future', { createdAt: NOW + 3 * H * 1000 }, 'created_future'],
    ['more play time than the save has existed', { playTimeSec: 5 * H }, 'playtime_wall'],
    ['era essence above lifetime essence', { eraEssence: 30_000 }, 'era_essence'],
    ['seven behaviours (only six exist)', { behaviorsCount: 7 }, 'behaviors_max'],
    ['300+ species', { speciesCount: 301, playTimeSec: 1.9 * H }, 'species_max'],
    ['era 2 without the 250k essence an extinction needs', { era: 2, lifetimeEssence: 200_000, eraEssence: 1000, genome: 5 }, 'era_requirement'],
    ['era 3 with too little genome', { era: 3, lifetimeEssence: 900_000, eraEssence: 1000, genome: 9 }, 'genome_min'],
    ['more genome than the prestige formula can pay', { era: 2, lifetimeEssence: 400_000, eraEssence: 100, genome: 40 }, 'genome_max'],
    ['four eras in 5 minutes', { era: 5, lifetimeEssence: 1_200_000, genome: 20, playTimeSec: 300, createdAt: NOW - 1000_000 }, 'era_rate'],
    ['70 000 seeds in an hour', { seeds: 100_000 }, 'seeds_rate'],
    ['80 species in one hour', { speciesCount: 80 }, 'species_rate'],
    ['1e30 essence in one hour', { lifetimeEssence: 1e30, eraEssence: 1e30, epsPeak: 1e27 }, 'essence_rate'],
    ['a peak production no dish can reach', { epsPeak: 1e12 }, 'eps_peak'],
  ])('rejects %s', (_label, over, reason) => {
    const r = validateSubmission(null, run(over), NOW);
    expect(r.verdict).toBe('reject');
    expect(r.hard).toContain(reason);
  });

  it('flags (but keeps) 30 species after one hour', () => {
    const r = validateSubmission(null, run({ speciesCount: 30 }), NOW);
    expect(r).toEqual({ verdict: 'flag', hard: [], soft: ['species_rate'] });
  });

  it('genome consistent with the era count is accepted', () => {
    // 2 extinctions, each ≥ 250k E_era and ≥ 5 genome.
    const s = run({ era: 3, lifetimeEssence: 2_000_000, eraEssence: 100_000, genome: 22, speciesCount: 8, behaviorsCount: 4, playTimeSec: 6 * H, createdAt: NOW - 10 * H * 1000, epsPeak: 400 });
    expect(validateSubmission(null, s, NOW).verdict).toBe('accept');
  });

  it('essence ceilings: accept below the soft bound, flag between, reject above the hard bound', () => {
    // Bounds depend on the essence itself (upgrade budget), so search for the crossing points.
    // epsPeak scales with the claim, so only the physics ceiling (and the peak's own ceiling) can bite.
    const verdictAt = (e: number) => validateSubmission(null, run({ lifetimeEssence: e, eraEssence: e, epsPeak: e / 2000 }), NOW);
    const firstWhere = (pred: (e: number) => boolean) => {
      let lo = 1e3;
      let hi = 1e40;
      for (let i = 0; i < 200; i++) {
        const mid = Math.sqrt(lo * hi);
        if (pred(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    const soft = firstWhere((e) => verdictAt(e).verdict !== 'accept');
    const hard = firstWhere((e) => verdictAt(e).verdict === 'reject');
    expect(soft).toBeGreaterThan(1e5); // a plausible hour is far below the ceiling…
    expect(hard).toBeGreaterThan(soft * 3); // …and there is a wide "flag" band before rejection
    expect(verdictAt(soft * 0.9).verdict).toBe('accept');
    const flagged = verdictAt(soft * 1.1);
    expect(flagged.verdict).toBe('flag');
    expect(flagged.soft.length).toBeGreaterThan(0);
    for (const r of flagged.soft) expect(['essence_rate', 'eps_peak']).toContain(r);
    expect(verdictAt(hard * 1.1).hard.some((r) => r === 'essence_rate' || r === 'eps_peak')).toBe(true);
  });

  it('essence must be consistent with the run\'s own peak production (editing essence alone is flagged)', () => {
    // 40/s peak for one hour of play + one hour away cannot make 5 million.
    const r = validateSubmission(null, run({ lifetimeEssence: 5_000_000, eraEssence: 5_000_000 }), NOW);
    expect(r).toEqual({ verdict: 'flag', hard: [], soft: ['essence_peak'] });
  });

  it('client integrity reports flag the submission', () => {
    const r = validateSubmission(null, run(), NOW, { speedHack: true, clockRollback: true, tampered: true, debug: true });
    expect(r.verdict).toBe('flag');
    expect(r.soft).toEqual(['integrity_speed', 'integrity_clock', 'integrity_tamper', 'integrity_debug']);
  });
});

describe('incremental rules (against the last accepted submission)', () => {
  const prevStats = run();
  const prevAt = NOW - 5 * 60_000;
  const prev = baseline(prevStats, prevAt);
  /** Five more minutes of play, five minutes later. */
  const next = (over: Partial<RunStats> = {}): RunStats =>
    ({ ...prevStats, playTimeSec: prevStats.playTimeSec + 300, lifetimeEssence: 26_000, eraEssence: 26_000, seeds: 130, ...over });

  it('accepts normal progress', () => {
    expect(validateSubmission(prev, next(), NOW).verdict).toBe('accept');
  });

  it.each<[keyof RunStats, number]>([
    ['lifetimeEssence', 19_000],
    ['speciesCount', 3],
    ['behaviorsCount', 1],
    ['playTimeSec', H - 10],
    ['seeds', 100],
    ['epsPeak', 10],
  ])('rejects %s going backwards', (k, v) => {
    const r = validateSubmission(prev, next({ [k]: v }), NOW);
    expect(r.verdict).toBe('reject');
    expect(r.hard).toContain(`regress_${k}`);
  });

  it('rejects play time running faster than real time (speed hack)', () => {
    // 5 real minutes but 20 minutes of play.
    const r = validateSubmission(prev, next({ playTimeSec: prevStats.playTimeSec + 1200 }), NOW);
    expect(r.hard).toContain('playtime_speed');
  });

  it('tolerates small clock jitter in play time', () => {
    expect(validateSubmission(prev, next({ playTimeSec: prevStats.playTimeSec + 300 + 90 }), NOW).verdict).toBe('accept');
  });

  it('rejects four eras in five minutes', () => {
    const r = validateSubmission(prev, next({ era: 5, lifetimeEssence: 1_100_000, genome: 20 }), NOW);
    expect(r.hard).toContain('era_rate');
  });

  it('species growth: +20 in 5 min rejected, +8 flagged, +3 fine', () => {
    expect(validateSubmission(prev, next({ speciesCount: 24 }), NOW).hard).toContain('species_rate');
    expect(validateSubmission(prev, next({ speciesCount: 12 }), NOW)).toMatchObject({ verdict: 'flag', soft: ['species_rate'] });
    expect(validateSubmission(prev, next({ speciesCount: 7 }), NOW).verdict).toBe('accept');
  });

  it('rejects an essence jump far beyond production in the interval', () => {
    const r = validateSubmission(prev, next({ lifetimeEssence: 1e12, eraEssence: 1e12 }), NOW);
    expect(r.hard).toContain('essence_rate');
  });

  it('offline time counts at OFFLINE_RATE: a long absence allows proportionally more essence', () => {
    const e0 = prevStats.lifetimeEssence;
    const end = next({ playTimeSec: prevStats.playTimeSec + 60 });
    const ceiling = (wallSec: number) => essenceReachable(end, e0, maxEssenceGain(1, 60, wallSec), 'soft') - e0;
    const minute = ceiling(60);
    const tenHours = ceiling(10 * H);
    expect(tenHours).toBeGreaterThan(10 * minute);
    const gain = Math.sqrt(minute * tenHours); // more than a minute allows, less than ten hours away do
    // A peak production consistent with earning that while away.
    const s = { ...end, lifetimeEssence: e0 + gain, eraEssence: e0 + gain, epsPeak: gain / (B.OFFLINE_RATE * 9 * H) };
    expect(validateSubmission(baseline(prevStats, NOW - 10 * H * 1000), s, NOW).verdict).toBe('accept');
    expect(validateSubmission(baseline(prevStats, NOW - 60_000), s, NOW).verdict).not.toBe('accept');
  });

  it('the "clock forward" offline trick is flagged: offline essence beyond the real time away', () => {
    // Five real minutes, one of play, but a full day of offline income (50 % of the 40/s peak).
    const fake = prevStats.lifetimeEssence + 0.5 * 40 * 24 * H;
    const s = next({ playTimeSec: prevStats.playTimeSec + 60, lifetimeEssence: fake, eraEssence: fake });
    expect(validateSubmission(prev, s, NOW)).toMatchObject({ verdict: 'flag', soft: ['essence_peak'] });
    // The same income after really being away a day is fine.
    expect(validateSubmission(baseline(prevStats, NOW - 24 * H * 1000), s, NOW).verdict).toBe('accept');
  });

  it('inside one Era the tighter per-Era upgrade budget applies', () => {
    const s = next({ lifetimeEssence: 10_000_000, eraEssence: 10_000_000 });
    const tau = maxEssenceGain(1, 300, 300);
    const lifetimeBudget = essenceReachable(s, 20_000, tau, 'soft');
    const eraBudget = essenceReachable(s, 20_000, tau, 'soft', Infinity, (e) => 1000 + (e - 20_000));
    expect(eraBudget).toBeLessThan(lifetimeBudget);
  });

  it('a game reset (newer createdAt, lower numbers) starts a new run without errors', () => {
    const fresh = run({ createdAt: NOW - 60_000, lifetimeEssence: 30, eraEssence: 30, speciesCount: 0, behaviorsCount: 0, playTimeSec: 50, seeds: 3, epsPeak: 1 });
    expect(validateSubmission(prev, fresh, NOW).verdict).toBe('accept');
  });

  it('importing an OLDER save over the current one is flagged', () => {
    const older = run({ createdAt: prevStats.createdAt - 24 * H * 1000 });
    expect(validateSubmission(prev, older, NOW)).toMatchObject({ verdict: 'flag', soft: ['run_older'] });
  });
});

describe('bounds helpers', () => {
  it('maxBaseEps is monotonic in every reported total', () => {
    const s = run();
    const b = maxBaseEps(s, 'hard');
    for (const over of [{ lifetimeEssence: 1e6 }, { speciesCount: 10 }, { behaviorsCount: 6 }, { genome: 30 }]) {
      expect(maxBaseEps({ ...s, ...over }, 'hard')).toBeGreaterThanOrEqual(b);
    }
    expect(maxBaseEps(s, 'soft')).toBeLessThan(b);
  });

  it('maxEssenceGain counts goldens and offline time', () => {
    expect(maxEssenceGain(0, 100, 100)).toBeGreaterThan(0); // LUMP_MIN rewards
    const active = maxEssenceGain(10, 600, 600);
    expect(active).toBeGreaterThan(10 * 600);
    expect(maxEssenceGain(10, 600, 600 + 3600)).toBeCloseTo(active + B.OFFLINE_RATE * 10 * 3600, 6);
  });
});

describe('no false positives on a real (very strong) game run', () => {
  it('a greedy two-hour session with maxed creatures, upgrades and every golden spark is always accepted', () => {
    let clock = NOW - 3 * H * 1000;
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(7), now: () => clock });
    // Twelve top-complexity creatures across three species, best behaviours.
    const sigs = [ORBIUM_SIG, SCUTIUM_SIG, GYRO_SIG];
    const behaviors = ['colony', 'divider', 'spinner'] as const;
    const cs = Array.from({ length: 12 }, (_, i) =>
      creature({ id: i + 1, x: 15 + (i % 4) * 45, y: 20 + Math.floor(i / 4) * 70, complexity: 3, signature: sigs[i % 3], behavior: behaviors[i % 3] }),
    );
    const rep = report(cs);
    const lab = ['culture', 'dish', 'swimAffinity', 'sessileAffinity', 'colonyAffinity', 'nutrient', 'reserve', 'dropper', 'stabilizer'];
    const dt = 0.25;
    let prev: Baseline | null = null;
    let maxRatio = 0;
    let goldens = 0;
    let regrowUntil = -1;
    const empty = report([]);
    for (let t = 0, step = 0; t < 2 * H; t += dt, step++) {
      clock += dt * 1000;
      // After an extinction the dish is cleared: give creatures a (short) minute to come back.
      g.tick(dt, t < regrowUntil ? empty : rep);
      if (step % 20 === 0) {
        for (const id of lab) g.actions.buyUpgrade(id, 'max');
        if (g.view().golden) {
          g.actions.collectGolden();
          goldens++;
        }
        if (g.view().extinction.available && g.actions.extinguish()) regrowUntil = t + 60;
      }
      if (step % (300 / dt) === 0 && t > 0) {
        const s = runStatsOf(g.state);
        const serverNow = clock + 800; // network latency
        const r = validateSubmission(prev, s, serverNow);
        expect(r, `at ${t}s: ${JSON.stringify(r)}`).toEqual({ verdict: 'accept', hard: [], soft: [] });
        if (prev) {
          const tau = maxEssenceGain(1, s.playTimeSec - prev.playTimeSec, (serverNow - prev.at) / 1000);
          const bound = essenceReachable(s, prev.lifetimeEssence, tau, 'soft') - prev.lifetimeEssence;
          maxRatio = Math.max(maxRatio, (s.lifetimeEssence - prev.lifetimeEssence) / bound);
        }
        prev = baseline(s, serverNow, clock);
      }
    }
    expect(goldens).toBeGreaterThan(5);
    expect(g.state.era).toBeGreaterThan(1);
    expect(g.state.stats.totalEssence).toBeGreaterThan(1e5);
    // The strongest legit play stays well inside the soft ceiling.
    console.info(`strong run: peak gain / soft ceiling = ${maxRatio.toFixed(4)}`);
    expect(maxRatio).toBeLessThan(0.5);
  });
});
