/**
 * Goal ladder (QA-3 N10/N11, docs/RITMO.md): does every player have a reachable next goal every 2–3 sessions?
 * Plays the session bot's policies (scripts/sessionBotCore.ts) and reports, per policy, the median over the runs of:
 *
 *  - Datos earned per session in sessions 5–10 (the stretch QA-3 found flat);
 *  - the longest run of sessions without a new species before the 5th (Worlds 1–5: rings 1–3), the collection standing still;
 *  - sessions from a World opening on the tree (its night) to buying it, for World 4 (Escudos) and World 5;
 *  - the session each World was bought and the session the collection reached 3, 4 and 5 of 7.
 *
 *   npx vite-node scripts/goal-ladder.ts [sessions=24] [runs=7] [--policy=kid]
 */
import { runPolicy, type PolicyName } from './sessionBotCore';
import { WORLDS } from '../src/game/worlds';

declare const process: { argv: string[] };
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const maxSessions = Number(args[0] ?? 24);
const runs = Number(args[1] ?? 7);
const only = process.argv.find((a) => a.startsWith('--policy='))?.slice(9) as PolicyName | undefined;
const policies: PolicyName[] = only ? [only] : ['planner', 'kid', 'idle', 'tapper'];
const med = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '—');

console.log(`goal ladder: ${maxSessions} sessions × ${runs} runs`);
console.log('| policy | Datos/session S5–10 | longest wait for a species (to 5/7) | species 3 · 4 · 5 at S | World 3 · 4 · 5 bought at S |');
console.log('|---|---|---|---|---|');
for (const policy of policies) {
  const perRun = [] as { datos: number; wait: number; at: number[]; world: number[] }[];
  for (let k = 0; k < runs; k++) {
    const bought = new Map<string, number>();
    const r = runPolicy(policy, maxSessions, 1000 + k * 17, {
      onSessionEnd: (g, { n }) => {
        for (const w of WORLDS) if (w.node && (g.research!.levels[w.node] ?? 0) > 0 && !bought.has(w.id)) bought.set(w.id, n);
      },
    });
    const rows = r.rows;
    const s510 = rows.filter((x) => x.n >= 5 && x.n <= 10).map((x) => x.datos);
    let wait = 0;
    let since = 0;
    let lastSp = -1;
    for (const x of rows) {
      if (x.species > lastSp) {
        lastSp = x.species;
        since = 0;
      } else since++;
      if (lastSp < 5) wait = Math.max(wait, since);
    }
    const at = [3, 4, 5].map((n) => rows.find((x) => x.species >= n)?.n ?? NaN);
    const world = ['gyro', 'shields', 'helix'].map((w) => bought.get(w) ?? NaN);
    perRun.push({ datos: s510.reduce((a, b) => a + b, 0) / Math.max(1, s510.length), wait, at, world });
  }
  const m = (f: (x: (typeof perRun)[number]) => number) => med(perRun.map(f));
  console.log(
    `| ${policy} | ${f1(m((x) => x.datos))} | ${f1(m((x) => x.wait))} sessions | ${[0, 1, 2].map((i) => f1(m((x) => x.at[i]))).join(' · ')} | ${[0, 1, 2].map((i) => f1(m((x) => x.world[i]))).join(' · ')} |`,
  );
}
