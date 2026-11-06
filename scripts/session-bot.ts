/**
 * Session bot, command line (docs/RITMO.md §6, docs/CICLO.md §11): plays the integrated sessions cycle
 * with scripts/sessionBotCore.ts and prints the pacing report, session by session.
 *
 *   npx vite-node scripts/session-bot.ts [maxSessions=40] [runs=3] [--verbose] [--policy=planner] [--trace=N] [--runs] [--ext] [--no-twin]
 *
 * ADR-031 (docs/MECANICAS.md §5.4–5.5): the tapper policy, the finger's columns (tap %, best streak, Chispazos,
 * refunds, living deaths, fusions) and the G-gates G1–G8. For G3 (unless --no-twin) the idle player's runs are
 * played again, session by session, by a tapper on the very same tree: once with the idle tree (no ✦ Pulso route),
 * once with an idle tree that also buys the route (÷twin = the tapper's Luz over the idle player's).
 */
import { readFileSync } from 'node:fs';
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
const policies: PolicyName[] = only ? [only] : ['planner', 'greedy', 'kid', 'idle', 'tapper'];
const twins = !process.argv.includes('--no-twin');

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const checks: string[] = [];
/** Every policy's runs, for the ADR-031 gates at the end. */
const allRes = new Map<PolicyName, RunResult[]>();
const treeTotal = TREE_NODES.filter((n) => n.id !== 'lab').length;
console.log(`\nBioluma session bot (integrated game, cycle 'sessions') — up to ${maxSessions} sessions, ${runs} run(s) per policy, between runs ${SUMMARY_SECONDS} s + ${SECONDS_PER_BUY} s per buy (≤ ${OVERHEAD_MAX} s); time-lapse ×${C.SESSION_SIM_PACE} (${C.SIM_STEPS_PER_SEC * C.SESSION_SIM_PACE} steps/s)`);
console.log(`Tree: ${treeTotal} buyable nodes on ${BRANCHES.length} straight routes (+ the centre); 1 Dato per ${C.DATOS_ESSENCE_DIV} Esencia; seed ${C.SESSION_SEED_PRICE} Esencia (×${C.SEED_PRICE_STEP} per seed bought); a drop holds ${C.LIGHT_CAP_SECONDS} s of light (ADR-030).\n`);
/** Median Esencia per session of each policy (the kid is compared with the planner). */
const medianCurve = new Map<PolicyName, number[]>();
const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);
for (const policy of policies) {
  const res: RunResult[] = [];
  for (let k = 0; k < runs; k++) res.push(runPolicy(policy, maxSessions, 1000 + k * 17));
  allRes.set(policy, res);
  const r0 = res[0];
  // Median per session over the runs (the table the plan page shows).
  const N = Math.min(...res.map((r) => r.rows.length));
  console.log(`── ${policy}: median of ${runs} run(s) per session ──`);
  console.log('| #  | night | given | played | Esencia | ×prev | Datos | bank | buys | nodes | routes | species | world   | Abono | eps ¼→¼ | hand % | pip % | swept % | capped % | tap % | streak | ⚡ | ÷twin | refund | deaths | fused | total min | bought (run 1)');
  console.log('|----|-------|-------|--------|---------|-------|-------|------|------|-------|--------|---------|---------|-------|-------------|--------|-------|---------|----------|-------|--------|----|-------|--------|--------|-------|-----------|---------------');
  const medE = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].essence)));
  /** Median over the runs of this session's Luz ÷ its idle twin's on the same tree (G3). */
  const twinOf = (i: number) => med(res.map((r) => (r.rows[i].twin && r.rows[i].twin! > 0 && r.rows[i].essence > 0 ? r.rows[i].twin! / r.rows[i].essence : NaN)).filter(Number.isFinite));
  const twinRatio = (i: number) => (res[0].rows[i]?.twin === null ? '    —' : `×${twinOf(i).toFixed(2)}`.padStart(5));
  for (let i = 0; i < N; i++) {
    const at = (f: (r: SessionRow) => number) => med(res.map((r) => f(r.rows[i])));
    const row = r0.rows[i];
    const grow = i > 0 && medE[i - 1] > 0 ? `×${(medE[i] / medE[i - 1]).toFixed(2)}` : '';
    console.log(
      `| ${String(i + 1).padStart(2)} | ${String(at((r) => r.night)).padStart(5)} | ${fmtClock(at((r) => r.limit)).padStart(5)} | ${fmtClock(at((r) => r.seconds)).padStart(6)} | ${fmtN(medE[i]).padStart(7)} | ${grow.padStart(5)} | ${String(at((r) => r.datos)).padStart(5)} | ${String(at((r) => r.bank)).padStart(4)} | ${String(at((r) => r.bought.length)).padStart(4)} | ${String(at((r) => r.nodes)).padStart(5)} | ${String(at((r) => r.branches)).padStart(6)} | ${String(at((r) => r.species)).padStart(7)} | ${row.world.padEnd(7)} | ${String(at((r) => r.boosts)).padStart(5)} | ${`${at((r) => r.epsEarly).toFixed(1)}→${at((r) => r.epsLate).toFixed(1)}`.padStart(11)} | ${at((r) => pct(r.hand, r.made)).toFixed(0).padStart(6)} | ${at((r) => pct(r.pipette, r.made)).toFixed(0).padStart(5)} | ${at((r) => pct(r.sweep, r.made)).toFixed(0).padStart(7)} | ${at((r) => pct(r.capped, r.made + r.capped)).toFixed(1).padStart(8)} | ${at((r) => pct(r.finger, r.essence)).toFixed(0).padStart(5)} | ${`×${at((r) => r.bestStreak).toFixed(2)}`.padStart(6)} | ${String(at((r) => r.chispazos)).padStart(2)} | ${twinRatio(i)} | ${fmtN(at((r) => r.refunded)).padStart(6)} | ${String(at((r) => r.deaths)).padStart(6)} | ${String(at((r) => r.fusions)).padStart(5)} | ${at((r) => r.minutes).toFixed(0).padStart(9)} | ${verbose ? row.bought.join(' ') : row.bought.slice(0, 8).join(' ') + (row.bought.length > 8 ? ` +${row.bought.length - 8}` : '')}`,
    );
  }
  if (process.argv.includes('--runs')) {
    for (const r of res) console.log(`  run: ${r.rows.map((x) => `${fmtN(x.essence)}${x.goldens ? `(${x.goldens}✦)` : ''}`).join(' ')}`);
    for (const r of res) console.log(`  base: ${r.rows.map((x) => fmtN(x.base)).join(' ')}`);
    const NF = Math.min(...res.map((r) => r.rows.length));
    console.log(`  fusions (median per session): ${Array.from({ length: NF }, (_, i) => med(res.map((r) => r.rows[i].fusions))).join(' ')}`);
    console.log(`  fusions (mean per session, S1–S10): ${(res.reduce((a, r) => a + r.rows.slice(0, 10).reduce((b, x) => b + x.fusions, 0), 0) / (res.length * 10)).toFixed(2)}; all sessions: ${(res.reduce((a, r) => a + r.rows.reduce((b, x) => b + x.fusions, 0), 0) / res.reduce((a, r) => a + r.rows.length, 0)).toFixed(2)}`);
    console.log(`  seed fusions (mean per session, all sessions): ${(res.reduce((a, r) => a + r.rows.reduce((b, x) => b + x.seedHits, 0), 0) / res.reduce((a, r) => a + r.rows.length, 0)).toFixed(3)}`);
    console.log(`  median Esencia per session: ${medE.map((x) => Math.round(x)).join(' ')}`);
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
    `\nmedian: first stable at ${Number.isFinite(fs) ? fs.toFixed(1) + ' s of clock' : '—'} · first purchase ${Number.isFinite(fb) ? fb.toFixed(0) + ' s after the first tap' : '—'} · session 1: ${fmtN(s1e)} Esencia, ${s1} Datos, ${s1buys} buys · buys per visit (median, to the end) min ${minBuys}, first three ${early.join('/')} · Esencia growth per session in nights 1–2 ×${growth12.toFixed(2)} · in-session climb ×${climb.toFixed(1)} · routes with a node by session 12: ${br12}/${BRANCHES.length} · min Datos/session ${minD} · Esencia dips: median curve ${dipsMed} [${dipsList.join(', ')}], per run ${dipsRun.join('/')}; without Spark gifts ${dipsBase.length} [${dipsBase.join(', ')}] · story ending at session ${Number.isFinite(endS) ? endS : '—'} ≈ ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : '—'}\n`,
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
  if (policy === 'planner' || policy === 'greedy') {
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
    checks.push(`${tag} ≥ ${BRANCHES.length - 1} of ${BRANCHES.length} routes by session 12: ${br12 >= BRANCHES.length - 1 ? 'OK' : 'FAIL'} (${br12})`);
    const nightAt = (s: number) => med(res.map((r) => r.rows[Math.min(s - 1, r.rows.length - 1)].night));
    const want = C.NIGHT_GATES.slice(0, 4).map((g) => g.sessions);
    checks.push(`${tag} nights at S${want.join('/S')} = 2/3/4/5: ${want.every((s, i) => nightAt(s) === i + 2) ? 'OK' : 'FAIL'} (${want.map(nightAt).join('/')})`);
  }
  medianCurve.set(policy, medE);
  // ── ADR-030 gates (docs/CLARIDAD2.md §3.3) ──
  const cappedAt = (i: number) => med(res.map((r) => pct(r.rows[i].capped, r.rows[i].made + r.rows[i].capped)));
  /** First session (1-based) after which a run owns `id` (bought after session k → it plays from k + 1). */
  const ownedFrom = (r: RunResult, id: string) => {
    const k = r.rows.findIndex((x) => x.bought.includes(id));
    return k < 0 ? Infinity : k + 2;
  };
  if (policy === 'planner') {
    const s1rows = res.map((r) => r.rows[0]);
    const s1ok = s1e >= 60 && s1 >= 15 && s1buys >= 3 && fb <= 45;
    checks.push(`${tag} session 1: ≥ 60 light, ≥ 15 Datos, ≥ 3 buys, first buy ≤ 45 s: ${s1ok ? 'OK' : 'FAIL'} (${fmtN(s1e)} · ${s1} · ${s1buys} · ${Number.isFinite(fb) ? fb.toFixed(0) + ' s' : '—'}; runs ${s1rows.map((x) => x.datos).join('/')})`);
    const cap15 = Array.from({ length: Math.min(5, N) }, (_, i) => cappedAt(i));
    checks.push(`${tag} production waiting in full drops ≤ 10 % in S1–S5: ${cap15.every((x) => x <= 10) ? 'OK' : 'FAIL'} (${cap15.map((x) => x.toFixed(1)).join('/')} %)`);
    // A planner that taps every ripe drop never needs Pipetas rápidas: then the gate reads from S6 on.
    const fastFrom0 = med(res.map((r) => ownedFrom(r, 'pipetteFast')));
    const fastFrom = Number.isFinite(fastFrom0) ? fastFrom0 : 6;
    const capFast = Array.from({ length: Math.max(0, Math.min(N, nEnd) - fastFrom + 1) }, (_, i) => cappedAt(fastFrom - 1 + i));
    const worstFast = capFast.length ? Math.max(...capFast) : NaN;
    checks.push(`${tag} ≤ 3 % waiting once it has Pipetas rápidas (from S${fastFrom}${Number.isFinite(fastFrom0) ? '' : ', never bought: it taps'}): ${worstFast <= 3 ? 'OK' : 'FAIL'} (worst ${Number.isFinite(worstFast) ? worstFast.toFixed(1) : '—'} %)`);
    // B3: the first ring-3 purchase after Night 2 opens.
    const ring3 = res.map((r) => {
      const n2 = r.rows.findIndex((x) => x.night >= 2);
      const k = r.rows.findIndex((x, i) => i >= n2 && x.bought.some((id) => TREE_BY_ID[id]?.ring === 3));
      return n2 < 0 || k < 0 ? Infinity : k - n2 + 1;
    });
    checks.push(`${tag} first ring-3 buy ≤ 3 sessions after Night 2 (B3): ${med(ring3) <= 3 ? 'OK' : 'FAIL'} (median ${med(ring3)}; runs ${ring3.join('/')})`);
  }
  if (policy === 'kid') {
    const plan = medianCurve.get('planner');
    if (plan) {
      const ratio = Array.from({ length: Math.min(5, N, plan.length) }, (_, i) => (plan[i] > 0 ? medE[i] / plan[i] : 1));
      checks.push(`${tag} light ≥ 60 % of the planner's in S1–S5: ${ratio.every((x) => x >= 0.6) ? 'OK' : 'FAIL'} (${ratio.map((x) => (100 * x).toFixed(0)).join('/')} %)`);
    }
    const ring3 = res.map((r) => {
      const n2 = r.rows.findIndex((x) => x.night >= 2);
      const k = r.rows.findIndex((x, i) => i >= n2 && x.bought.some((id) => TREE_BY_ID[id]?.ring === 3));
      return n2 < 0 || k < 0 ? Infinity : k - n2 + 1;
    });
    checks.push(`${tag} first ring-3 buy ≤ 3 sessions after Night 2 (B3): ${med(ring3) <= 3 ? 'OK' : 'FAIL'} (median ${med(ring3)}; runs ${ring3.join('/')})`);
  }
  if (policy === 'idle') {
    checks.push(`${tag} never below ${C.DATOS_MIN} Datos: ${minD >= C.DATOS_MIN ? 'OK' : 'FAIL'} (${minD})`);
    const from = med(res.map((r) => ownedFrom(r, 'pipette')));
    const dips = Number.isFinite(from) ? medE.slice(from).filter((e, i) => e < medE[from - 1 + i]).length : NaN;
    checks.push(`${tag} its light never dips (median) from its first Pipeta (S${Number.isFinite(from) ? from : '—'}): ${dips === 0 ? 'OK' : 'FAIL'} (${dips} dips)`);
    const n3 = med(res.map((r) => {
      const i = r.rows.findIndex((x) => x.night >= 3);
      return i < 0 ? Infinity : i + 1;
    }));
    checks.push(`${tag} reaches night 3 before S16: ${n3 < 16 ? 'OK' : 'FAIL'} (S${Number.isFinite(n3) ? n3 : '—'})`);
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
void TREE_NODES;

// ───────────────────────────── ADR-031 gates (docs/MECANICAS.md §5.5) ──────────────

/** G3: the idle player's runs replayed session by session by a tapper on the same tree (plain, and with the ✦ Pulso route). */
const g3 = (withPulse: boolean): RunResult[] | null =>
  twins && (!only || only === 'idle') ? Array.from({ length: runs }, (_, k) => runPolicy('idle', maxSessions, 1000 + k * 17, { twin: 'tapper', withPulse })) : null;
const g3plain = g3(false);
const g3route = g3(true);

/**
 * `--baseline=<report>`: a report of the bot before ADR-031 (same arguments), read for its per-policy median Luz
 * per session and mean fusions per session ("median Esencia per session:", "fusions (mean …)" lines, --runs).
 */
function readBaseline(path: string): Map<string, { light: number[]; fusions: number; seedHits: number }> {
  const out = new Map<string, { light: number[]; fusions: number; seedHits: number }>();
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const part of text.split('── ').slice(1)) {
    const name = part.slice(0, part.indexOf(':'));
    const light = /median Esencia per session: ([^\n]*)/.exec(part)?.[1].trim().split(/\s+/).map(Number) ?? [];
    const fusions = Number(/fusions \(mean per session, S1–S10\): [\d.]+; all sessions: ([\d.]+)/.exec(part)?.[1] ?? NaN);
    const seedHits = Number(/seed fusions \(mean per session, all sessions\): ([\d.]+)/.exec(part)?.[1] ?? NaN);
    out.set(name, { light, fusions, seedHits });
  }
  return out;
}

const BASE_ARG = process.argv.find((a) => a.startsWith('--baseline='))?.slice(11);
const base = BASE_ARG ? readBaseline(BASE_ARG) : new Map<string, { light: number[]; fusions: number; seedHits: number }>();
const gates: string[] = [];
const curve = (p: PolicyName) => {
  const rs = allRes.get(p);
  if (!rs) return null;
  const N = Math.min(...rs.map((r) => r.rows.length));
  return { rs, N, light: Array.from({ length: N }, (_, i) => med(rs.map((r) => r.rows[i].essence))) };
};
const dipsOf = (xs: number[], from = 0) => xs.slice(from + 1).map((e, i) => (e < xs[from + i] ? `S${from + i + 2} ${((e / xs[from + i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
const ok = (b: boolean) => (b ? 'OK' : 'FAIL');
{
  // G1: the hard rule, median curve.
  const parts: string[] = [];
  let all = true;
  for (const p of ['planner', 'tapper', 'greedy', 'idle'] as PolicyName[]) {
    const c = curve(p);
    if (!c) continue;
    let from = 0;
    if (p === 'idle') {
      const k = med(c.rs.map((r) => {
        const i = r.rows.findIndex((x) => x.bought.includes('pipette'));
        return i < 0 ? Infinity : i + 1;
      }));
      from = Number.isFinite(k) ? k : 0;
    }
    const d = dipsOf(c.light, from);
    all &&= d.length === 0;
    parts.push(`${p}${from ? ` (from S${from + 1})` : ''} ${d.length}${d.length ? ` [${d.join(', ')}]` : ''}`);
  }
  gates.push(`G1 hard rule, no median dip: ${ok(all)} (${parts.join(' · ')})`);
}
{
  // G2: the idle player never earns less than before.
  const c = curve('idle');
  const b = base.get('idle')?.light ?? [];
  if (c && b.length) {
    const n = Math.min(c.N, b.length);
    const ratio = Array.from({ length: n }, (_, i) => (b[i] > 0 ? c.light[i] / b[i] : 1));
    const below = ratio.map((x, i) => (x < 1 ? `S${i + 1} ×${x.toFixed(3)}` : '')).filter(Boolean);
    gates.push(`G2 idle ≥ before, every session: ${ok(below.length === 0)} (min ×${Math.min(...ratio).toFixed(3)}, median ×${med(ratio).toFixed(2)}${below.length ? `; below: ${below.join(', ')}` : ''})`);
  } else gates.push('G2 idle ≥ before: — (run with --runs --baseline=<report before ADR-031>)');
}
{
  // G3: tapping pays — the tapper's Luz over the idle player's, session by session on the same tree.
  const ratios = (rs: RunResult[]) => {
    const N = Math.min(...rs.map((r) => r.rows.length));
    const tw = (i: number) => med(rs.map((r) => (r.rows[i].twin && r.rows[i].essence > 0 ? r.rows[i].twin / r.rows[i].essence : NaN)).filter(Number.isFinite));
    const night = (i: number) => med(rs.map((r) => r.rows[i].night));
    return Array.from({ length: N }, (_, i) => ({ s: i + 1, r: tw(i), night: night(i) }));
  };
  if (g3plain) {
    const x = ratios(g3plain);
    const s15 = x.slice(0, 5).map((e) => e.r);
    const late = x.filter((e) => e.night >= 3).map((e) => e.r);
    console.log(`\nG3 tapper ÷ idle on the idle tree, by session: ${x.map((e) => e.r.toFixed(2)).join(' ')}`);
    gates.push(`G3a tapper ÷ idle (same tree) ≥ ×1,8 in S1–S5: ${ok(s15.every((v) => v >= 1.8))} (${s15.map((v) => v.toFixed(2)).join('/')})`);
    gates.push(`G3b tapper ÷ idle (same tree, no ✦ Pulso route) in ×1,3–2 in nights 3+: ${ok(late.every((v) => v >= 1.3 && v <= 2))} (min ×${Math.min(...late).toFixed(2)}, median ×${med(late).toFixed(2)}, max ×${Math.max(...late).toFixed(2)})`);
  }
  if (g3route) {
    const x = ratios(g3route);
    // From the session after the route is complete (Pulso III, Racha larga II, Chispazo seguido II) in the median run.
    const full = med(g3route.map((r) => {
      const k = r.rows.findIndex((row) => ['pulse', 'streakLong', 'chispazoOften'].every((id) => r.rows.slice(0, row.n).flatMap((q) => q.bought).filter((b) => b === id).length >= (id === 'pulse' ? 3 : 2)));
      return k < 0 ? Infinity : k + 2;
    }));
    const after = x.filter((e) => e.s >= full).map((e) => e.r);
    console.log(`G3 tapper ÷ idle on the idle tree with the ✦ Pulso route (complete from S${full}): ${x.map((e) => e.r.toFixed(2)).join(' ')}`);
    gates.push(`G3c tapper ÷ idle (same tree, ✦ Pulso route complete) ≤ ×3,2: ${ok(after.length > 0 && after.every((v) => v <= 3.2))} (from S${full}: max ×${Math.max(...after).toFixed(2)}, median ×${med(after).toFixed(2)})`);
  }
}
{
  // G4: tapping wildly pays.
  const k = curve('kid');
  const p = curve('planner');
  if (k && p) {
    const r = Array.from({ length: Math.min(5, k.N, p.N) }, (_, i) => k.light[i] / p.light[i]);
    const n12 = med(k.rs.map((x) => x.rows[Math.min(11, x.rows.length - 1)].night));
    gates.push(`G4 kid ≥ planner in S1–S5, night 3 by S12: ${ok(r.every((x) => x >= 1) && n12 >= 3)} (${r.map((x) => `×${x.toFixed(2)}`).join('/')}; night ${n12} at S12)`);
  }
}
{
  // G5: the story's pace.
  const end = (p: PolicyName) => {
    const rs = allRes.get(p);
    return rs ? med(rs.map((r) => r.endedAt ?? Infinity)) / 60 : NaN;
  };
  const pl = end('planner');
  const tp = end('tapper');
  gates.push(`G5 story: planner 1,5–2,2 h, tapper ≥ 1,3 h: ${ok(pl >= 1.5 && pl <= 2.2 && (Number.isNaN(tp) || tp >= 1.3))} (planner ${pl.toFixed(2)} h, tapper ${Number.isFinite(tp) ? tp.toFixed(2) + ' h' : '—'})`);
}
{
  // G6: session 1 (planner).
  const rs = allRes.get('planner');
  if (rs) {
    const e = med(rs.map((r) => r.rows[0].essence));
    const d = med(rs.map((r) => r.rows[0].datos));
    const b = med(rs.map((r) => r.rows[0].bought.length));
    const fb = med(rs.map((r) => r.firstBuy ?? Infinity));
    gates.push(`G6 session 1 (planner) ≥ 60 light, ≥ 15 Datos, ≥ 3 buys, first buy ≤ 45 s: ${ok(e >= 60 && d >= 15 && b >= 3 && fb <= 45)} (${fmtN(e)} · ${d} · ${b} · ${fb.toFixed(0)} s)`);
  }
}
{
  // G7: fewer deaths — the fusions sowing causes (a seed stamped onto a body), and every contact kill for the record.
  const mean = (p: PolicyName, f: (x: SessionRow) => number) => {
    const rs = allRes.get(p);
    return rs ? rs.reduce((a, r) => a + r.rows.reduce((b, x) => b + f(x), 0), 0) / rs.reduce((a, r) => a + r.rows.length, 0) : NaN;
  };
  const kb = base.get('kid');
  const pb = base.get('planner');
  const k = mean('kid', (x) => x.seedHits);
  const p = mean('planner', (x) => x.seedHits);
  const kAll = mean('kid', (x) => x.fusions);
  const pAll = mean('planner', (x) => x.fusions);
  // The model's seeds already kept clear of bodies before ADR-031 (seedAt moved or refused a tap next to one: the
  // «Muy cerca» the player read); with 0 before, −50 % cannot be shown here: the real check is the e2e "a child who
  // taps the dish thirty times never sows" (MECANICAS §8.3).
  const verdict = (b: number, a: number) => (b > 0 ? ok(a <= 0.5 * b) : a > 0 ? 'FAIL' : 'n/a (0 before, 0 after)');
  if (kb && Number.isFinite(kb.seedHits))
    gates.push(
      `G7 fusions sowing causes, per session: kid −50 % or more, planner not higher: ${verdict(kb.seedHits, k)}${pb && p > pb.seedHits + 1e-9 ? ' FAIL (planner)' : ''} (kid ${kb.seedHits.toFixed(3)} → ${k.toFixed(3)}, planner ${pb ? pb.seedHits.toFixed(3) : '—'} → ${p.toFixed(3)}; every contact kill, for the record: kid ${kb.fusions.toFixed(2)} → ${kAll.toFixed(2)}, planner ${pb ? pb.fusions.toFixed(2) : '—'} → ${pAll.toFixed(2)})`,
    );
  else gates.push(`G7 fusions sowing causes, per session: kid ${k.toFixed(3)}, planner ${p.toFixed(3)} (run with --baseline=<report before ADR-031> to compare)`);
}
{
  // G8: growth in nights 1–2 (planner).
  const c = curve('planner');
  if (c) {
    const nights = Array.from({ length: c.N }, (_, i) => med(c.rs.map((r) => r.rows[i].night)));
    const n12 = nights.filter((x) => x <= 2).length;
    const g = n12 >= 2 ? Math.pow(c.light[n12 - 1] / c.light[0], 1 / (n12 - 1)) : NaN;
    gates.push(`G8 planner ×1,5–3 per session in nights 1–2: ${ok(g >= 1.5 && g <= 3)} (×${g.toFixed(2)})`);
  }
}
console.log('\nADR-031 gates (docs/MECANICAS.md §5.5):');
for (const g of gates) console.log('  ' + g);

