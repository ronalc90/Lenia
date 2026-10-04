/**
 * QA #3 — static economy tables from the real balance/defs (no simulation).
 *   npx vite-node tests/e2e/qa/qa3-econ.ts
 * Prints: seed cost by population and Placa level, upgrade cost ladders, payback of the
 * multiplier upgrades at a given production, Genome income vs. tree size, golden-spark value.
 */
import * as B from '../../../src/game/balance';
import { UPGRADE_BY_ID, levelCost, genomeGain, EXTINCTION_ESSENCE_NEEDED, GENOME_NODES } from '../../../src/game/defs';

const f = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(n < 10 ? 2 : 0));

function seedCost(stable: number, dish: number, young = 0): number {
  const free = B.DISH_FREE_SLOTS[Math.min(dish, B.DISH_FREE_SLOTS.length - 1)];
  const n = stable + young;
  const nSat = stable + Math.max(0, young - B.SEED_NURSERY_FREE);
  return B.SEED_C0 * (1 + B.SEED_CROWD * n) * Math.pow(B.SEED_SATURATION_GROWTH, Math.max(0, nSat - free));
}

console.log('\n## Seed cost by stable creatures (rows) and Placa level (cols), no newborns');
console.log('| stable | ' + [0, 1, 2, 3, 4].map((d) => `Placa ${d}`).join(' | ') + ' |');
for (let n = 0; n <= 12; n++) console.log(`| ${n} | ` + [0, 1, 2, 3, 4].map((d) => f(seedCost(n, d))).join(' | ') + ' |');

console.log('\n## Seed cost with 6 stable at Placa 0 as newborns accumulate (Sembrador in flight)');
for (let y = 0; y <= 5; y++) console.log(`young=${y}: ${f(seedCost(6, 0, y))}`);

console.log('\n## Marginal value of the k-th creature of the SAME species (0.85^k)');
console.log([0, 1, 2, 3, 4, 5, 6, 7].map((k) => `${k + 1}: ×${Math.pow(B.SAME_SPECIES_DECAY, k).toFixed(2)}`).join('  '));

console.log('\n## Cost ladders');
for (const id of ['culture', 'autoSeeder', 'stabilizer', 'swimAffinity', 'nutrient']) {
  const d = UPGRADE_BY_ID[id];
  console.log(`${id}: ` + [0, 1, 2, 4, 6, 8, 10, 12, 15, 20].map((l) => `L${l + 1}=${f(levelCost(d, l))}`).join(' '));
}

console.log('\n## Payback (minutes of current production) of the next level, Culture vs Affinity vs Placa');
for (const [eps, cl, al, dl] of [
  [8, 1, 0, 0],
  [15, 3, 1, 0],
  [25, 6, 3, 0],
  [35, 8, 5, 1],
  [60, 10, 7, 1],
  [150, 14, 9, 2],
] as const) {
  const culture = levelCost(UPGRADE_BY_ID.culture, cl) / (eps * B.CULTURE_BONUS) / 60;
  // Affinity: +8 % of the share of production of its behaviours (assume 80 % swimmers early).
  const aff = levelCost(UPGRADE_BY_ID.swimAffinity, al) / ((eps * 0.8 * B.AFFINITY_BONUS) / (1 + al * B.AFFINITY_BONUS)) / 60;
  const dish = B.DISH_COSTS[dl] / ((eps * B.DISH_BONUS) / (1 + dl * B.DISH_BONUS)) / 60;
  console.log(`eps ${eps}: Culture L${cl + 1} ${culture.toFixed(1)} min · Swim aff. L${al + 1} ${aff.toFixed(1)} min · Placa ${dl + 1} (bonus only) ${dish.toFixed(1)} min`);
}

console.log('\n## Sembrador interval by level');
console.log([1, 2, 4, 8, 12, 16, 20, 25, 28].map((l) => `L${l}=${Math.max(B.AUTOSEED_MIN_INTERVAL, B.AUTOSEED_INTERVAL * Math.pow(B.AUTOSEED_DECAY, l - 1)).toFixed(1)}s`).join(' '));

console.log('\n## Genome: essence term vs E_era, and the size of the purchasable tree');
for (const e of [250e3, 400e3, 1e6, 2.5e6, 1e7]) console.log(`E_era ${f(e)} → essence term ${genomeGain(e, 0, 0)}`);
const buyable = GENOME_NODES.filter((n) => !n.comingSoon).reduce((a, n) => a + n.cost, 0);
console.log(`Extinction needs E_era ≥ ${f(EXTINCTION_ESSENCE_NEEDED)}; purchasable tree total = ${buyable} Genome; full tree (incl. coming soon) = ${GENOME_NODES.reduce((a, n) => a + n.cost, 0)}`);
console.log(`Max M_global from spending the whole purchasable tree: ×${(1 + B.GENOME_SPENT_BONUS * buyable).toFixed(2)}`);
console.log(`First-Era genome, explorer-like (17 species, 5 behaviours, 400K): ${genomeGain(400e3, 17, 5)}`);
console.log(`First-Era genome, greedy-like (2 species, 1 behaviour, 260K): ${genomeGain(260e3, 2, 1)}`);

console.log('\n## Golden spark expected value (seconds of base production) for an attentive player');
const W = B.GOLDEN_WEIGHTS;
const tot = W.bloom + W.lump + W.spores + W.mutagen;
const bloomSec = (B.BLOOM_MULT - 1) * B.BLOOM_TIME;
const ev = (W.bloom * bloomSec + W.lump * B.LUMP_SECONDS) / tot;
const avgInterval = (B.GOLDEN_INTERVAL[0] + B.GOLDEN_INTERVAL[1]) / 2 + B.GOLDEN_LIFE / 2;
console.log(`bloom = +${bloomSec}s, lump = +${B.LUMP_SECONDS}s; EV per spark (essence part only) = ${ev.toFixed(0)}s; mean interval ≈ ${avgInterval.toFixed(0)}s → +${((ev / avgInterval) * 100).toFixed(0)} % production for a player who catches all`);
console.log(`first spark after first stable: ${B.GOLDEN_FIRST_DELAY.join('–')} s (GDD §23.1 says 40–80 s)`);
