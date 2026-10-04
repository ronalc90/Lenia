/**
 * Detector calibration. Run with:  npx vite-node scripts/calibrate-detector.ts
 *
 * 1. Measures the reference Orbium gradient sum (complexity normalization constant,
 *    hardcode it as ORBIUM_GRAD_SUM in src/detect/detector.ts; the rest of this run
 *    already uses the measured value).
 * 2. Runs every catalog species with its own params in CpuLenia (64×64, or 128×128
 *    for R > 13 / large templates), feeding scale-2 snapshots every 10 steps to the
 *    detector, and checks viability (one stable, non-exploded creature at the end).
 * 3. Writes src/detect/catalogSignatures.json:
 *      [{ code, name, viable, signature, behavior, complexity, mu, sigma, R }]
 *    Signatures of a few placements (random position + rotation) are averaged.
 * 4. Reports self-recognition (random placements matched against all references)
 *    and the mutual distances of the 7 seed species.
 *
 * Options (env): STEPS (default 1500), EXTRA (extra placements averaged into each
 * reference, default 2), TRIALS (recognition trials per species, default 3),
 * ONLY=code,code (subset, does not write the JSON). Takes ~4 minutes.
 * Placements where a fragile species dies or changes form under the rotated
 * (resampled) template are reported separately, not counted as misses.
 */
import { writeFileSync } from 'node:fs';
import { CATALOG, catalogPattern, type CatalogEntry } from '../src/sim/catalog';
import { runSpecies } from '../src/detect/harness';
import { ORBIUM_GRAD_SUM, createDetector } from '../src/detect/detector';
import { SIG_LENGTH, SIG_UNKNOWN, matchSignature, signatureDistance } from '../src/detect/signature';
import type { Behavior, Creature } from '../src/core/types';

const STEPS = Number(process.env.STEPS ?? 1500);
const TRIALS = Number(process.env.TRIALS ?? 3);
const EXTRA = Number(process.env.EXTRA ?? 2);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SEEDS = ['O2u', 'OG2g', 'O4d', 'S1s', 'H3s', '3GH2n', 'K4d'];

let rng = 12345;
const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);

function sizeFor(e: CatalogEntry): number {
  const p = catalogPattern(e.code);
  return e.R > 13 || Math.max(p.w, p.h) > 36 ? 128 : 64;
}

interface Trial {
  creatures: Creature[];
  main: Creature | null;
  exploded: boolean;
  divided: boolean;
}

function trial(e: CatalogEntry, rotation: number, x?: number, y?: number, steps = STEPS): Trial {
  const size = sizeFor(e);
  let everExploded = false;
  const r = runSpecies(e.code, {
    size,
    steps,
    rotation,
    x,
    y,
    detector: createDetector({ orbiumGradSum: orbiumGrad }),
    onReport: (rep) => {
      if (rep.events.some((ev) => ev.type === 'exploded')) everExploded = true;
    },
  });
  const creatures = r.last.creatures;
  const main = creatures.filter((c) => c.state === 'stable').sort((a, b) => b.mass - a.mass)[0] ?? null;
  return {
    creatures,
    main,
    exploded: everExploded || creatures.some((c) => c.state === 'exploded'),
    divided: r.events.some((ev) => ev.type === 'divided'),
  };
}

/** Same attractor: mass within 25 % (a broken or merged creature is something else). */
function sameForm(a: Creature, b: Creature): boolean {
  return Math.abs(a.mass / b.mass - 1) < 0.25;
}

/** Feature-wise mean of signatures (unknown stays unknown unless known somewhere). */
function meanSig(sigs: number[][]): number[] {
  const out = new Array<number>(SIG_LENGTH).fill(SIG_UNKNOWN);
  for (let i = 0; i < SIG_LENGTH; i++) {
    const vals = sigs.map((s) => s[i]).filter((v) => v >= 0);
    if (vals.length) out[i] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

const t0 = performance.now();

// ── 1. complexity reference ──
let orbiumGrad = ORBIUM_GRAD_SUM;
{
  const det = createDetector({ orbiumGradSum: 1 });
  let sum = 0;
  let n = 0;
  runSpecies('O2u', {
    size: 64,
    steps: 1500,
    detector: det,
    onReport: (rep) => {
      if (rep.step >= 400 && rep.creatures.length === 1) {
        sum += rep.creatures[0].complexity;
        n++;
      }
    },
  });
  orbiumGrad = sum / n;
  const off = Math.abs(orbiumGrad / ORBIUM_GRAD_SUM - 1);
  console.log(
    `Orbium gradient sum (scale 2, 64x64, steps 400-1500): ${orbiumGrad.toFixed(2)}  [ORBIUM_GRAD_SUM = ${ORBIUM_GRAD_SUM}` +
      (off > 0.01 ? ' -> UPDATE the constant in src/detect/detector.ts]' : ', ok]'),
  );
}

// ── 2. references ──
interface Ref {
  code: string;
  name: string;
  viable: boolean;
  signature: number[];
  behavior: Behavior | null;
  complexity: number;
  mu: number;
  sigma: number;
  R: number;
}
const refs: Ref[] = [];
const entries = CATALOG.filter((e) => !ONLY || ONLY.includes(e.code));
for (const e of entries) {
  const ts = performance.now();
  const base = trial(e, 0, undefined, undefined, Math.max(STEPS, 2000));
  const sigs: number[][] = [];
  const behaviors: (Behavior | null)[] = [];
  let complexity = 0;
  const viable = !!base.main && !base.exploded && base.creatures.every((c) => c.state !== 'exploded');
  if (base.main) {
    sigs.push(base.main.signature);
    behaviors.push(base.main.behavior);
    complexity = base.main.complexity;
  }
  for (let k = 0; k < EXTRA && viable; k++) {
    const size = sizeFor(e);
    const tr = trial(e, rand() * Math.PI * 2, rand() * size, rand() * size);
    // Fragile species can break or die when the template is rotated (bilinear
    // resampling perturbs it); only placements that kept the same form count.
    if (tr.main && sameForm(tr.main, base.main!)) {
      sigs.push(tr.main.signature);
      behaviors.push(tr.main.behavior);
    }
  }
  const behavior = behaviors.filter((b) => b).sort(
    (a, b) => behaviors.filter((x) => x === b).length - behaviors.filter((x) => x === a).length,
  )[0] ?? null;
  const ref: Ref = {
    code: e.code,
    name: e.name,
    viable,
    signature: sigs.length ? meanSig(sigs).map((v) => +v.toFixed(4)) : new Array(SIG_LENGTH).fill(SIG_UNKNOWN),
    behavior,
    complexity: +complexity.toFixed(3),
    mu: e.m,
    sigma: e.s,
    R: e.R,
  };
  refs.push(ref);
  console.log(
    `${e.code.padEnd(6)} ${e.name.padEnd(28)} viable=${viable ? 'yes' : 'NO '} behavior=${String(behavior).padEnd(8)} ` +
      `cx=${ref.complexity.toFixed(2).padStart(5)} n=${base.creatures.length} div=${base.divided ? 'y' : 'n'} ` +
      `sig=[${ref.signature.map((v) => v.toFixed(2)).join(' ')}] (${((performance.now() - ts) / 1000).toFixed(1)}s)`,
  );
}

// ── 3. self-recognition ──
const viableRefs = refs.filter((r) => r.viable);
const refSigs = viableRefs.map((r) => r.signature);
let ok = 0;
let tot = 0;
let broken = 0;
for (const r of viableRefs) {
  const e = CATALOG.find((c) => c.code === r.code)!;
  let hits = 0;
  let valid = 0;
  const misses: string[] = [];
  for (let k = 0; k < TRIALS; k++) {
    const size = sizeFor(e);
    const tr = trial(e, rand() * Math.PI * 2, rand() * size, rand() * size);
    if (!tr.main || Math.abs(tr.main.mass / (r.signature[0] * r.R * r.R) - 1) > 0.25) {
      misses.push(tr.main ? `changed form (mass ${tr.main.mass.toFixed(0)})` : 'did not survive the placement');
      broken++;
      continue;
    }
    valid++;
    const m = matchSignature(tr.main.signature, refSigs);
    if (m >= 0 && viableRefs[m].code === r.code) hits++;
    else {
      const ds = refSigs.map((s) => signatureDistance(tr.main!.signature, s));
      const best = ds.indexOf(Math.min(...ds));
      misses.push(`${m >= 0 ? viableRefs[m].code : '-'}(self ${signatureDistance(tr.main.signature, r.signature).toFixed(2)}, nearest ${viableRefs[best].code} ${ds[best].toFixed(2)})`);
    }
  }
  ok += hits;
  tot += valid;
  console.log(`recognize ${r.code.padEnd(6)} ${hits}/${valid} ${misses.join(' ')}`);
}
console.log(`self-recognition: ${ok}/${tot} (plus ${broken} placements where the creature died or changed form)`);

// ── 4. seed species separation ──
const seedRefs = refs.filter((r) => SEEDS.includes(r.code));
let minD = Infinity;
for (let i = 0; i < seedRefs.length; i++) {
  const row: string[] = [];
  for (let j = 0; j < seedRefs.length; j++) {
    const d = signatureDistance(seedRefs[i].signature, seedRefs[j].signature);
    if (i !== j) minD = Math.min(minD, d);
    row.push(d.toFixed(2).padStart(6));
  }
  console.log(`${seedRefs[i].code.padEnd(6)} ${row.join('')}`);
}
console.log(`min seed-species distance: ${minD.toFixed(2)}`);
// nearest other catalog species for every reference
for (const r of viableRefs) {
  let best = '';
  let bd = Infinity;
  for (const q of viableRefs) {
    if (q === r) continue;
    const d = signatureDistance(r.signature, q.signature);
    if (d < bd) {
      bd = d;
      best = q.code;
    }
  }
  console.log(`nearest ${r.code.padEnd(6)} -> ${best.padEnd(6)} ${bd.toFixed(2)}`);
}

if (!ONLY) {
  writeFileSync(new URL('../src/detect/catalogSignatures.json', import.meta.url), JSON.stringify(refs, null, 1) + '\n');
  console.log('wrote src/detect/catalogSignatures.json');
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(0)}s`);
