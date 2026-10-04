import { CpuLenia } from '../src/sim/cpu';
import { CATALOG, paramsOf } from '../src/sim/catalog';
const code = process.argv[2] ?? 'O2u';
const e = CATALOG.find((c) => c.code === code)!;
const P = paramsOf(e);
let rng = 999;
const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
for (const G of [4, 8, 16]) for (const rf of [1.0, 1.5]) for (const dens of [0.6, 1.0]) {
  const out = { dead: 0, alive: 0, exploded: 0 };
  for (let t = 0; t < 20; t++) {
    const sim = new CpuLenia(64, 64, P);
    const r = P.R * rf;
    const coarse: number[] = []; for (let i = 0; i < (G + 1) * (G + 1); i++) coarse.push(rand());
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      const d = Math.hypot(x, y) / r; if (d > 1) continue;
      const u = ((x / r) * 0.5 + 0.5) * G, v = ((y / r) * 0.5 + 0.5) * G;
      const i0 = Math.min(G - 1, Math.floor(u)), j0 = Math.min(G - 1, Math.floor(v)), fu = u - i0, fv = v - j0;
      const c = (i: number, j: number) => coarse[j * (G + 1) + i];
      const n = c(i0, j0) * (1 - fu) * (1 - fv) + c(i0 + 1, j0) * fu * (1 - fv) + c(i0, j0 + 1) * (1 - fu) * fv + c(i0 + 1, j0 + 1) * fu * fv;
      sim.A[((32 + y) & 63) * 64 + ((32 + x) & 63)] = n * dens * Math.min(1, (1 - d) * 4);
    }
    sim.step(800);
    const m = sim.mass(); let fill = 0; for (const v of sim.A) if (v > 0.1) fill++;
    if (m < 1) out.dead++; else if (fill > 64 * 64 * 0.35) out.exploded++; else out.alive++;
  }
  console.log(code, 'G', G, 'r', rf, 'dens', dens, out);
}
