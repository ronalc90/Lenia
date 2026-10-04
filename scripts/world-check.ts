/**
 * World and seed checks with the CPU reference simulation (docs/CICLO.md §4.3, §4.5).
 *
 *   npx vite-node scripts/world-check.ts            every world: do its listed species live at its preset?
 *   npx vite-node scripts/world-check.ts --seeds    measured seed success by Gotero × Estabilizador level
 *                                                   (prints the SEED_SUCCESS table for cycleBalance.ts)
 *   npx vite-node scripts/world-check.ts --yield    what a creature of each world pays on average
 *                                                   (detector complexity × behaviour × rarity): the
 *                                                   worlds open in this order, so a new one never pays less
 *   npx vite-node scripts/world-check.ts --behaviors  how the real detector classifies each species of
 *                                                   each world AT the world's preset (ways of moving
 *                                                   a player can actually find; docs/CLARIDAD.md F-09)
 *   npx vite-node scripts/world-check.ts --features what each world species LOOKS like at its world's preset
 *                                                   (size in R and in cells, holes, bodies, elongation,
 *                                                   polarity; src/species/look.ts) and whether it keeps
 *                                                   the form the game reveals it by. Writes
 *                                                   src/species/looks.json (--write) and the crops for
 *                                                   the contact sheet (--crops=path.json); docs/ESPECIES.md
 *   options: --trials=120 (seeds per cell) --rows=0,1,2,3 (Gotero levels) --steps=700
 *            --world=cold (--seeds: that world's templates and seed help instead of the Clásico's)
 *
 * Worlds: each catalog template is stamped exactly at the world's preset on a 128² torus and run
 * for 700 steps; it "lives" when its mass stays within 0.4–2.5× and it fills < 20 % of the dish
 * (no flood). A listed species that fails makes the script exit with code 1; a dropped species that
 * now lives is reported (it could go back on the card).
 *
 * Seeds: a blob seed of radius R with the game's density range, the tree's bias/noise
 * (tree.ts seedConfig) and one of the Clásico world's templates, 500 steps on a 64² torus; it
 * "takes" when one creature-sized body remains (0.4–2.5× a reference Orbium, < 20 % fill).
 */
import { createDetector } from '../src/detect/detector';
import { runSpecies } from '../src/detect/harness';
import { CpuLenia } from '../src/sim/cpu';
import { applySeedCpu } from '../src/sim/seed';
import { catalogByCode } from '../src/sim/catalog';
import { rotateQuarter, scaledTemplate } from '../src/game/seeding';
import * as B from '../src/game/balance';
import { exactTurns, seedConfig } from '../src/game/tree';
import { WORLDS, WORLD_BY_ID } from '../src/game/worlds';
import { catalogGroup } from '../src/species/identity';
import catalogSigs from '../src/detect/catalogSignatures.json';
import { writeFileSync } from 'node:fs';
import { placeRotated, runSim } from '../src/detect/harness';
import { signatureDistance, SPECIES_MATCH_THRESHOLD } from '../src/detect/signature';
import { averageLooks, measureLook, type Look } from '../src/species/look';
import type { LeniaParams, Pattern } from '../src/core/types';

declare const process: { argv: string[]; exitCode?: number };
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;

function lives(code: string, p: (typeof WORLDS)[number]['params'], steps: number): string {
  const N = 128;
  const t = scaledTemplate(catalogByCode(code)!, p.R);
  const sim = new CpuLenia(N, N, p);
  const ox = (N - t.w) >> 1;
  const oy = (N - t.h) >> 1;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) sim.A[(oy + y) * N + ox + x] = t.data[y * t.w + x];
  const m0 = sim.mass();
  sim.step(steps);
  const m = sim.mass();
  let fill = 0;
  for (const v of sim.A) if (v > 0.1) fill++;
  const r = m / m0;
  return m < 0.05 * m0 ? 'dies' : fill > N * N * 0.2 ? 'floods' : r > 2.5 ? 'grows' : r < 0.4 ? 'shrinks' : 'lives';
}

function checkWorlds(): void {
  const steps = Number(arg('steps', '700'));
  let bad = 0;
  for (const w of WORLDS) {
    const p = w.params;
    const listed = w.species.map((c) => `${c}:${lives(c, p, steps)}`);
    const dropped = w.dropped.map((c) => `${c}:${lives(c, p, steps)}`);
    bad += listed.filter((x) => !x.endsWith('lives')).length;
    console.log(`Mundo ${w.n} ${w.id.padEnd(8)} μ ${p.mu} σ ${p.sigma} R ${p.R} rings ${JSON.stringify(p.rings.map((x) => +x.toFixed(3)))}`);
    console.log(`   listed:  ${listed.join('  ')}`);
    if (dropped.length) console.log(`   dropped: ${dropped.join('  ')}`);
  }
  console.log(bad ? `\n${bad} listed species do NOT live at their world's preset.` : '\nEvery listed species lives at its world.');
  if (bad) process.exitCode = 1;
}

function measureSeeds(): void {
  const trials = Number(arg('trials', '120'));
  const rows = arg('rows', '0,1,2,3').split(',').map(Number);
  const N = 64;
  // --world=cold: that world's templates and seed help (cycleBalance WORLD_SEED_HELP: exact quarter turns).
  const world = arg('world', 'classic') as keyof typeof WORLD_BY_ID;
  const exact = exactTurns(world);
  const P = WORLD_BY_ID[world].params;
  const tpls = WORLD_BY_ID[world].species.map((c) => scaledTemplate(catalogByCode(c)!, P.R));
  const ref = (() => {
    const s = new CpuLenia(N, N, P);
    const t = tpls[0];
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) s.A[(y + 10) * N + x + 10] = t.data[y * t.w + x];
    s.step(300);
    return s.mass();
  })();
  let rng = 4242;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const takes = (bias: number, noise: number): number => {
    let ok = 0;
    for (let t = 0; t < trials; t++) {
      const sim = new CpuLenia(N, N, P);
      const density = B.SEED_DENSITY_MIN + rand() * (B.SEED_DENSITY_MAX - B.SEED_DENSITY_MIN);
      const turn = rand();
      applySeedCpu(sim.A, N, N, {
        x: N / 2,
        y: N / 2,
        radius: P.R * B.SEED_RADIUS,
        density,
        noise,
        shape: 'blob',
        pattern: exact ? rotateQuarter(tpls[t % tpls.length], Math.floor(turn * 4)) : tpls[t % tpls.length],
        bias,
        rotation: exact ? 0 : turn * Math.PI * 2,
        rngSeed: Math.floor(rand() * 2147483647),
      });
      sim.step(500);
      const m = sim.mass();
      let fill = 0;
      for (const v of sim.A) if (v > 0.1) fill++;
      if (m > 0.4 * ref && m < 2.5 * ref && fill < N * N * 0.2) ok++;
    }
    return ok / trials;
  };
  const out: string[] = [];
  for (const d of rows) {
    const cells: number[] = [];
    for (let s = 0; s <= 5; s++) {
      const c = seedConfig({ dropper: d, stabilizer: s, masterDropper: false }, world);
      cells.push(Math.round(takes(c.bias, c.noise) * 100) / 100);
    }
    out.push(`  [${cells.join(', ')}], // Gotero ${d}`);
    console.log(`Gotero ${d}: ${cells.map((x) => `${Math.round(x * 100)} %`).join(' · ')}`);
  }
  const m = seedConfig({ dropper: 0, stabilizer: 0, masterDropper: true });
  console.log(`Gotero maestro (bias ${m.bias}, noise ${m.noise}): ${Math.round(takes(m.bias, m.noise) * 100)} %`);
  console.log(`\nSEED_SUCCESS = [\n${out.join('\n')}\n];`);
}

function worldYield(): void {
  const by = new Map((catalogSigs as { code: string; behavior: keyof typeof B.BEHAVIOR_MULT | null; complexity: number }[]).map((x) => [x.code, x]));
  let prev = 0;
  for (const w of WORLDS) {
    const seen = new Set<string>();
    const parts: string[] = [];
    let sum = 0;
    for (const c of w.species) {
      if (seen.has(catalogGroup(c))) continue;
      seen.add(catalogGroup(c));
      const x = by.get(c)!;
      const rarity = B.RARITY_BY_CODE[c] ?? B.DEFAULT_RARITY;
      const y = Math.min(x.complexity, B.COMPLEXITY_CAP) * B.BEHAVIOR_MULT[x.behavior ?? 'still'] * B.RARITY_MULT[rarity];
      parts.push(`${c} ${y.toFixed(2)}`);
      sum += y;
    }
    const avg = sum / seen.size;
    console.log(`Mundo ${w.n} ${w.id.padEnd(8)} ${avg.toFixed(2)}${avg + 0.05 < prev ? '  ← pays less than the world before!' : ''}   (${parts.join(', ')})`);
    prev = avg;
  }
}

/**
 * Each listed species, stamped at its world's preset on a 128² torus (from 3 rotations), run for
 * --steps (default 1500) with the game's detector: the behaviour of the main stable creature and
 * whether it ever divided. A way of moving found in no world is a goal the player cannot reach.
 */
function worldBehaviors(): void {
  const steps = Number(arg('steps', '1500'));
  const found = new Map<string, string[]>();
  for (const w of WORLDS) {
    const parts: string[] = [];
    for (const code of w.species) {
      const seen: string[] = [];
      for (const rotation of [0, 1.1, 2.3]) {
        let divided = false;
        const r = runSpecies(code, {
          size: 128,
          steps,
          rotation,
          params: w.params,
          pattern: scaledTemplate(catalogByCode(code)!, w.params.R),
          detector: createDetector(),
          onReport: (rep) => void (divided ||= rep.events.some((e) => e.type === 'divided')),
        });
        const stable = r.last.creatures.filter((c) => c.state === 'stable');
        const main = stable.sort((a, b) => b.mass - a.mass)[0];
        const b = main?.behavior ?? (stable.length ? 'unclassified' : 'none');
        seen.push(b + (divided ? '+divided' : '') + (stable.length > 1 ? `×${stable.length}` : ''));
        for (const x of [main?.behavior, divided ? 'divider' : null, ...stable.map((c) => c.behavior)]) {
          if (!x) continue;
          if (!found.has(x)) found.set(x, []);
          if (!found.get(x)!.includes(w.id)) found.get(x)!.push(w.id);
        }
      }
      parts.push(`${code}: ${seen.join(' / ')}`);
    }
    console.log(`Mundo ${w.n} ${w.id.padEnd(8)} ${parts.join('   ')}`);
  }
  console.log('\nWays of moving found (behaviour → worlds):');
  for (const b of ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony']) console.log(`  ${b.padEnd(8)} ${found.get(b)?.join(', ') ?? 'NONE — no world grows it'}`);
}

/** Static part of a signature (shape only: what a young creature is matched on). */
const STATIC = 11;

interface FeatureRow {
  code: string;
  world: string;
  R: number;
  behavior: string | null;
  /** Static signature distance to the catalog reference (the game reveals it below CATALOG_MATCH_FACTOR). */
  formDist: number;
  look: Look;
  /** Crop of the creature at the end of the run (contact sheet). */
  crop: Pattern;
}

/** One creature of `code` at `p`, run `steps` steps with the game's detector; its look averaged over the last 300 steps. */
export function measureSpecies(code: string, p: LeniaParams, steps = 1600, rotation = 0): Omit<FeatureRow, 'world'> | null {
  const N = p.R <= 14 ? 128 : 256;
  const sim = new CpuLenia(N, N, p);
  placeRotated(sim.A, N, N, scaledTemplate(catalogByCode(code)!, p.R), N / 2, N / 2, rotation);
  const looks: Look[] = [];
  let crop: Pattern | null = null;
  const S = Math.ceil(p.R * 6);
  const r = runSim(sim, p, {
    steps,
    detector: createDetector(),
    onReport: (rep, s) => {
      if (s.stepCount < steps - 300 || s.stepCount % 50 !== 0) return;
      const c = rep.creatures.filter((x) => x.state !== 'dead').sort((a, b) => b.mass - a.mass)[0];
      if (!c) return;
      const data = new Float32Array(S * S);
      const x0 = Math.round(c.x - S / 2);
      const y0 = Math.round(c.y - S / 2);
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) data[j * S + i] = s.A[(((y0 + j) % N) + N) % N * N + ((((x0 + i) % N) + N) % N)];
      }
      crop = { w: S, h: S, data };
      looks.push(measureLook(crop, p.R));
    },
  });
  const c = r.last.creatures.filter((x) => x.state !== 'dead').sort((a, b) => b.mass - a.mass)[0];
  if (!c || !looks.length || !crop) return null;
  const ref = (catalogSigs as { code: string; signature: number[] }[]).find((x) => x.code === code)!.signature;
  return {
    code,
    R: p.R,
    behavior: c.behavior,
    formDist: signatureDistance(c.signature.slice(0, STATIC), ref.slice(0, STATIC)),
    look: averageLooks(looks),
    crop,
  };
}

function worldFeatures(): void {
  const steps = Number(arg('steps', '1600'));
  const rows: FeatureRow[] = [];
  let bad = 0;
  for (const w of WORLDS) {
    for (const code of [...w.species, ...(w.variants ?? [])]) {
      const m = measureSpecies(code, w.params, steps);
      const variant = !w.species.includes(code);
      if (!m) {
        console.log(`Mundo ${w.n} ${code.padEnd(6)} DIES${variant ? ' (variant)' : ''}`);
        if (!variant) bad++;
        continue;
      }
      const L = m.look;
      const keeps = m.formDist < SPECIES_MATCH_THRESHOLD * B.CATALOG_MATCH_FACTOR;
      if (!keeps && !variant) bad++;
      rows.push({ ...m, world: w.id });
      console.log(
        `Mundo ${w.n} ${code.padEnd(6)}${variant ? '(var)' : '     '} R${String(w.params.R).padEnd(3)} ${String(m.behavior).padEnd(8)} ` +
          `radius ${L.radiusR.toFixed(2)}R = ${(L.radiusR * w.params.R).toFixed(1)} cells · area ${L.areaR2.toFixed(2)}R² · holes ${L.holes} (${L.holeAreaR2.toFixed(2)}R²) · ` +
          `bodies ${L.bodies} · long ${L.elongation.toFixed(2)} · polar ${L.polarity.toFixed(2)} · points ${L.points} · core ${L.core.toFixed(2)} · form d ${m.formDist.toFixed(2)}${keeps ? '' : '  ← CHANGED FORM'}`,
      );
    }
  }
  if (process.argv.includes('--write')) {
    const out = rows.map((r) => ({
      code: r.code,
      world: r.world,
      R: r.R,
      behavior: r.behavior,
      radiusR: +r.look.radiusR.toFixed(3),
      areaR2: +r.look.areaR2.toFixed(3),
      holes: r.look.holes,
      holeAreaR2: +r.look.holeAreaR2.toFixed(3),
      bodies: r.look.bodies,
      elongation: +r.look.elongation.toFixed(3),
      polarity: +r.look.polarity.toFixed(3),
      points: r.look.points,
      core: +r.look.core.toFixed(3),
      formDist: +r.formDist.toFixed(3),
    }));
    writeFileSync(new URL('../src/species/looks.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
    console.log('wrote src/species/looks.json');
  }
  const crops = arg('crops', '');
  if (crops) {
    writeFileSync(
      crops,
      JSON.stringify(rows.map((r) => ({ code: r.code, world: r.world, R: r.R, w: r.crop.w, h: r.crop.h, d: Array.from(r.crop.data, (v) => Math.round(v * 255)) }))),
    );
  }
  if (bad) {
    console.log(`\n${bad} world species die or change form at their world's preset.`);
    process.exitCode = 1;
  }
}

if (process.argv.includes('--seeds')) measureSeeds();
else if (process.argv.includes('--features')) worldFeatures();
else if (process.argv.includes('--yield')) worldYield();
else if (process.argv.includes('--behaviors')) worldBehaviors();
else checkWorlds();
