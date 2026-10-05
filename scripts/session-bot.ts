/**
 * Session bot, command line (docs/RITMO.md §6, docs/CICLO.md §11): plays the integrated sessions cycle
 * with scripts/sessionBotCore.ts and prints the pacing report, session by session.
 *
 *   npx vite-node scripts/session-bot.ts [maxSessions=40] [runs=3] [--verbose] [--policy=planner] [--trace=N] [--runs] [--ext]
 */
import * as C from '../src/game/cycleBalance';
import { BRANCHES, TREE_BY_ID, TREE_NODES } from '../src/game/tree';
import {
  botLog,
  OVERHEAD_MAX,
  runPolicy,
  SECONDS_PER_BUY,
  SUMMARY_SECONDS,
  type PolicyName,
  type RunResult,
  type SessionRow,
} from './sessionBotCore';
// ───────────────────────────── report ──────────────────────────────

declare const process: { argv: string[]; exitCode?: number };

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const only = process.argv.find((a) => a.startsWith('--policy='))?.slice(9) as PolicyName | undefined;
const maxSessions = Number(args[0] ?? 40);
const runs = Number(args[1] ?? 3);
const TRACE_ARG = process.argv.find((a) => a.startsWith('--trace='));
if (TRACE_ARG) botLog.trace = Number(TRACE_ARG.slice(8));
botLog.ext = process.argv.includes('--ext');
const policies: PolicyName[] = only ? [only] : ['planner', 'greedy', 'kid'];

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const checks: string[] = [];
const treeTotal = TREE_NODES.filter((n) => n.id !== 'lab').length;
console.log(`\nBioluma session bot (integrated game, cycle 'sessions') — up to ${maxSessions} sessions, ${runs} run(s) per policy, between runs ${SUMMARY_SECONDS} s + ${SECONDS_PER_BUY} s per buy (≤ ${OVERHEAD_MAX} s); time-lapse ×${C.SESSION_SIM_PACE} (${C.SIM_STEPS_PER_SEC * C.SESSION_SIM_PACE} steps/s)`);
console.log(`Tree: ${treeTotal} buyable nodes on 7 straight routes (+ the centre); 1 Dato per ${C.DATOS_ESSENCE_DIV} Esencia; seed ${C.SESSION_SEED_PRICE} Esencia (×${C.SEED_PRICE_STEP} per seed bought).\n`);
for (const policy of policies) {
  const res: RunResult[] = [];
  for (let k = 0; k < runs; k++) res.push(runPolicy(policy, maxSessions, 1000 + k * 17));
  const r0 = res[0];
  // Median per session over the runs (the table the plan page shows).
  const N = Math.min(...res.map((r) => r.rows.length));
  console.log(`── ${policy}: median of ${runs} run(s) per session ──`);
  console.log('| #  | night | given | played | Esencia | ×prev | Datos | bank | buys | nodes | routes | species | world   | Abono | eps ¼→¼ | total min | bought (run 1)');
  console.log('|----|-------|-------|--------|---------|-------|-------|------|------|-------|--------|---------|---------|-------|-------------|-----------|---------------');
  const medE = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].essence)));
  for (let i = 0; i < N; i++) {
    const at = (f: (r: SessionRow) => number) => med(res.map((r) => f(r.rows[i])));
    const row = r0.rows[i];
    const grow = i > 0 && medE[i - 1] > 0 ? `×${(medE[i] / medE[i - 1]).toFixed(2)}` : '';
    console.log(
      `| ${String(i + 1).padStart(2)} | ${String(at((r) => r.night)).padStart(5)} | ${fmtClock(at((r) => r.limit)).padStart(5)} | ${fmtClock(at((r) => r.seconds)).padStart(6)} | ${fmtN(medE[i]).padStart(7)} | ${grow.padStart(5)} | ${String(at((r) => r.datos)).padStart(5)} | ${String(at((r) => r.bank)).padStart(4)} | ${String(at((r) => r.bought.length)).padStart(4)} | ${String(at((r) => r.nodes)).padStart(5)} | ${String(at((r) => r.branches)).padStart(6)} | ${String(at((r) => r.species)).padStart(7)} | ${row.world.padEnd(7)} | ${String(at((r) => r.boosts)).padStart(5)} | ${`${at((r) => r.epsEarly).toFixed(1)}→${at((r) => r.epsLate).toFixed(1)}`.padStart(11)} | ${at((r) => r.minutes).toFixed(0).padStart(9)} | ${verbose ? row.bought.join(' ') : row.bought.slice(0, 8).join(' ') + (row.bought.length > 8 ? ` +${row.bought.length - 8}` : '')}`,
    );
  }
  if (process.argv.includes('--runs')) {
    for (const r of res) console.log(`  run: ${r.rows.map((x) => `${fmtN(x.essence)}${x.goldens ? `(${x.goldens}✦)` : ''}`).join(' ')}`);
    for (const r of res) console.log(`  base: ${r.rows.map((x) => fmtN(x.base)).join(' ')}`);
  }
  const endM = med(res.map((r) => r.endedAt ?? Infinity));
  const endS = med(res.map((r) => r.endedSession ?? Infinity));
  const s1 = med(res.map((r) => r.rows[0]?.datos ?? 0));
  const s1e = med(res.map((r) => r.rows[0]?.essence ?? 0));
  const s1buys = med(res.map((r) => r.rows[0]?.bought.length ?? 0));
  const br12 = med(res.map((r) => r.rows[Math.min(11, r.rows.length - 1)]?.branches ?? 0));
  const minD = Math.min(...res.map((r) => r.minDatos));
  const fs = med(res.map((r) => r.firstStable ?? Infinity));
  const fb = med(res.map((r) => r.firstBuy ?? Infinity));
  const end = (r: RunResult) => (r.endedSession ?? r.rows.length);
  // Buys after every session until the story ends (median over the runs, session by session).
  const nEnd = Math.min(N, Math.max(1, Math.round(endS)) || N);
  const buysMed = Array.from({ length: nEnd }, (_, i) => med(res.map((r) => r.rows[i].bought.length)));
  const minBuys = Math.min(...buysMed);
  const early = buysMed.slice(0, 3);
  // Dips: a session earning less Esencia than the previous one (median curve and every run).
  const dipsMed = medE.slice(1).filter((e, i) => e < medE[i]).length;
  const dipsRun = res.map((r) => r.rows.slice(1, end(r)).filter((x, i) => x.essence < r.rows[i].essence).length);
  const medB = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].base)));
  const dipsBase = medB.slice(1).map((e, i) => (e < medB[i] ? `S${i + 2} ${((e / medB[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  const dipsList = medE.slice(1).map((e, i) => (e < medE[i] ? `S${i + 2} ${((e / medE[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  // Growth per session in nights 1–2 (geometric mean of the median curve).
  const n12 = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].night))).filter((x) => x <= 2).length;
  const growth12 = n12 >= 2 ? Math.pow(medE[n12 - 1] / medE[0], 1 / (n12 - 1)) : NaN;
  // Production inside a session: best Esencia/s of the last quarter over the first quarter.
  const climb = med(res.flatMap((r) => r.rows.slice(0, end(r)).map((x) => (x.epsEarly > 0 ? x.epsLate / x.epsEarly : 1))));
  console.log(
    `\nmedian: first stable at ${Number.isFinite(fs) ? fs.toFixed(1) + ' s of clock' : '—'} · first purchase ${Number.isFinite(fb) ? fb.toFixed(0) + ' s after the first tap' : '—'} · session 1: ${fmtN(s1e)} Esencia, ${s1} Datos, ${s1buys} buys · buys per visit (median, to the end) min ${minBuys}, first three ${early.join('/')} · Esencia growth per session in nights 1–2 ×${growth12.toFixed(2)} · in-session climb ×${climb.toFixed(1)} · routes with a node by session 12: ${br12}/7 · min Datos/session ${minD} · Esencia dips: median curve ${dipsMed} [${dipsList.join(', ')}], per run ${dipsRun.join('/')}; without Spark gifts ${dipsBase.length} [${dipsBase.join(', ')}] · story ending at session ${Number.isFinite(endS) ? endS : '—'} ≈ ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : '—'}\n`,
  );
  const tag = `[${policy}]`;
  const s1limit = r0.rows[0].limit;
  const s1len = r0.rows[0].seconds;
  checks.push(`${tag} session 1 is ${C.SESSION_BASE_SECONDS} s (+ its "+5 s"): ${s1limit === C.SESSION_BASE_SECONDS && s1len <= C.SESSION_BASE_SECONDS + 15 ? 'OK' : 'FAIL'} (${fmtClock(s1limit)} → ${fmtClock(s1len)})`);
  checks.push(`${tag} first purchase within 45 s of the first tap (~30 s wanted): ${fb <= 45 ? 'OK' : 'FAIL'} (${Number.isFinite(fb) ? fb.toFixed(0) + ' s' : 'never'})`);
  checks.push(`${tag} a creature is stable within 5 s of clock in session 1: ${fs <= 5 ? 'OK' : 'FAIL'} (${Number.isFinite(fs) ? fs.toFixed(1) + ' s' : '—'})`);
  {
    const lim = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].limit)));
    const longest = Math.max(...lim);
    checks.push(`${tag} runs grow 0:15 → 2–3 min and never shrink: ${lim.every((x, i) => i === 0 || x >= lim[i - 1]) && longest >= 120 && longest <= 185 ? 'OK' : 'FAIL'} (${lim.map(fmtClock).filter((x, i, a) => i === 0 || x !== a[i - 1]).join(' → ')})`);
  }
  {
    // QA4 F-04: the first species must enter the Bestiary in session 1 or 2 (planner and kid).
    const firstSp = res.map((r) => {
      const i = r.rows.findIndex((x) => x.species >= 1);
      return i < 0 ? Infinity : i + 1;
    });
    const mfs = med(firstSp);
    checks.push(`${tag} the first species registers in session 1 or 2 (median): ${mfs <= 2 ? 'OK' : 'FAIL'} (median S${Number.isFinite(mfs) ? mfs : '—'}; runs ${firstSp.map((x) => (Number.isFinite(x) ? x : '—')).join('/')})`);
  }
  checks.push(`${tag} never a session below ${C.DATOS_MIN} Datos: ${minD >= C.DATOS_MIN ? 'OK' : 'FAIL'} (${minD})`);
  if (policy !== 'kid') {
    checks.push(`${tag} ≥ 2 buys after every session: ${minBuys >= 2 ? 'OK' : 'FAIL'} (min ${minBuys})`);
    checks.push(`${tag} (info) buys after the first 3 sessions: ${early.join('/')}`);
    const first10 = buysMed.slice(0, 10);
    checks.push(`${tag} ≥ 2 buys after each of the first 10 runs: ${first10.every((b) => b >= 2) ? 'OK' : 'FAIL'} (${first10.join('/')})`);
    checks.push(`${tag} story ending 1:30–2:15 (RITMO §6): ${endM >= 90 && endM <= 135 ? 'OK' : 'FAIL'} (${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : 'not reached'})`);
  }
  if (policy === 'planner') {
    checks.push(`${tag} HARD: the median player never earns less Esencia than in the session before: ${dipsMed === 0 ? 'OK' : 'FAIL'} (${dipsMed} dips)`);
    const allDips = dipsRun.reduce((a, b) => a + b, 0);
    const pairs = res.reduce((a, r) => a + Math.max(0, end(r) - 1), 0);
    checks.push(`${tag} (info) single runs: a session below the one before in ${allDips} of ${pairs} pairs (${((100 * allDips) / Math.max(1, pairs)).toFixed(0)} %: Sparks, seeds and deaths are luck)`);
    checks.push(`${tag} Esencia ×1,5–3 per session in nights 1–2 (RITMO: "numbers that explode"): ${growth12 >= 1.5 && growth12 <= 3.0 ? 'OK' : 'FAIL'} (×${growth12.toFixed(2)})`);
    checks.push(`${tag} production climbs inside a session (×1,5+ from the first quarter to the last): ${climb >= 1.5 ? 'OK' : 'FAIL'} (×${climb.toFixed(1)})`);
    checks.push(`${tag} ≥ 6 of 7 routes by session 12: ${br12 >= 6 ? 'OK' : 'FAIL'} (${br12})`);
    const nightAt = (s: number) => med(res.map((r) => r.rows[Math.min(s - 1, r.rows.length - 1)].night));
    const want = C.NIGHT_GATES.slice(0, 4).map((g) => g.sessions);
    checks.push(`${tag} nights at S${want.join('/S')} = 2/3/4/5: ${want.every((s, i) => nightAt(s) === i + 2) ? 'OK' : 'FAIL'} (${want.map(nightAt).join('/')})`);
  }
  if (policy === 'kid') {
    const s = C.NIGHT_GATES[1].sessions + C.NIGHT_GATE_FALLBACK;
    checks.push(`${tag} a kid still reaches night 3 by session ${s}: ${(r0.rows[Math.min(s - 1, r0.rows.length - 1)]?.night ?? 1) >= 3 ? 'OK' : 'FAIL'} (night ${r0.rows[Math.min(s - 1, r0.rows.length - 1)]?.night})`);
    checks.push(`${tag} story ending (no target, for the record): ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h at session ' + endS : 'not reached'}`);
  }
}
console.log('Pacing targets (docs/RITMO.md §6):');
for (const c of checks) console.log('  ' + c);
void TREE_BY_ID;

