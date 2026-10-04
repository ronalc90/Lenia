// Monte Carlo: how often does a random noisy blob become a persistent creature?
// Usage: npx vite-node scripts/seed-montecarlo.ts [code] [trials] [bias]
import { CpuLenia } from '../src/sim/cpu';
import { CATALOG, catalogPattern, paramsOf } from '../src/sim/catalog';

const code = process.argv[2] ?? 'O2u';
const trials = Number(process.argv[3] ?? 40);
const bias = Number(process.argv[4] ?? 0);
const e = CATALOG.find((c) => c.code === code)!;
const P = paramsOf(e);
let rng = 12345;
const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const out: Record<string, number> = { dead: 0, alive: 0, exploded: 0 };
for (let t = 0; t < trials; t++) {
  const sim = new CpuLenia(64, 64, P);
  const r = P.R * (0.9 + rand() * 0.4);
  // coarse random grid, upsampled = smoothed asymmetric noise
  const G = 6, coarse: number[] = [];
  for (let i = 0; i < G * G; i++) coarse.push(rand());
  const tpl = catalogPattern(code);
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
    const d = Math.hypot(x, y) / r; if (d > 1) continue;
    const u = ((x / r) * 0.5 + 0.5) * (G - 1), v = ((y / r) * 0.5 + 0.5) * (G - 1);
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const c = (i: number, j: number) => coarse[Math.min(G - 1, j) * G + Math.min(G - 1, i)];
    const n = c(i0, j0) * (1 - fu) * (1 - fv) + c(i0 + 1, j0) * fu * (1 - fv) + c(i0, j0 + 1) * (1 - fu) * fv + c(i0 + 1, j0 + 1) * fu * fv;
    let val = n * (1 - d * d) * 0.9;
    if (bias > 0) {
      const tx = Math.round(x + tpl.w / 2), ty = Math.round(y + tpl.h / 2);
      const tv = tx >= 0 && ty >= 0 && tx < tpl.w && ty < tpl.h ? tpl.data[ty * tpl.w + tx] : 0;
      val = val * (1 - bias) + tv * bias;
    }
    sim.A[((32 + y) & 63) * 64 + ((32 + x) & 63)] = val;
  }
  sim.step(600);
  const m = sim.mass();
  let fill = 0; for (const v of sim.A) if (v > 0.1) fill++;
  if (m < 1) out.dead++; else if (fill > 64 * 64 * 0.35) out.exploded++; else out.alive++;
}
console.log(code, 'bias', bias, out);
