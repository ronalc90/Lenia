/**
 * Bioluma icon set v2 (docs/ARTE.md §5): ONE grid, ONE stroke, ONE family for every concept the game
 * shows — currencies, the 7 routes and their 54 tree nodes, the 6 behaviours, the 7 Mundos, the
 * Momentos, the HUD, settings and store.
 *
 * Rules (tested in icons.test.ts):
 *  - 24 × 24 grid, 2-unit safe margin (artwork inside 2..22), keylines: circle r 8.75, square 16.5.
 *  - stroke 1.75, round caps and joins, `currentColor`.
 *  - Duotone: an optional `.f` layer of currentColor at --bl-ic-fill (20 % dark / 14 % light) gives
 *    each icon a silhouette; meaning never depends on it.
 *  - Shared motifs come from geometry.ts (drop, star, moon, clock) so they are identical everywhere.
 *  - Node icons = their route motif + one modifier (top-right "+", a badge bottom-right).
 *
 * Drop-in APIs with the same signatures as the old modules (see the compat section at the end):
 *   icon()     ← src/ui/icons.ts         treeIcon()/hasTreeIcon() ← src/ui/tree/icons.ts
 *   moIcon()   ← src/ui/moments/icons.ts  sicon()/svgInner()        ← src/ui/store/icons.ts
 * Hand-drawn in code for this game; no icon library, no AI art (CLAUDE.md rule 10).
 */
import { arc, arcArrow, circlePath, crescent, drop, dropShine, ellipsePath, gear, head, infinity, n, polar, spiral, star4 } from './geometry';

export interface IconDef {
  /** Stroke layer (and solid accent dots, which carry their own fill). */
  s: string;
  /** Duotone fill layer (shapes only, no styling). */
  f?: string;
}

export const STROKE = 1.75;

// ───────────────────────────── tiny markup helpers ─────────────────────────────

const P = (d: string, extra = ''): string => `<path d="${d}"${extra}/>`;
const C = (cx: number, cy: number, r: number, extra = ''): string => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, extra = ''): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${extra}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, extra = ''): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}"${extra}/>`;
/** Solid accent (full currentColor, no stroke). */
const SOLID = ' fill="currentColor" stroke="none"';
const D = (cx: number, cy: number, r = 1.1): string => C(cx, cy, r, SOLID);
const SP = (d: string): string => P(d, SOLID);
const DASH = (a = 2.1, b = 2.1): string => ` stroke-dasharray="${a} ${b}"`;

// ───────────────────────────── shared motifs ─────────────────────────────

const PLUS_TR = P('M18.75 2.75v5M16.25 5.25h5');
const flaskBody = 'M8.75 3.25h6.5M10 3.25v5.6L5.2 17.3a2.2 2.2 0 0 0 1.9 3.45h9.8a2.2 2.2 0 0 0 1.9-3.45L14 8.85V3.25';
const flaskLiquid = 'M6.93 14.25L5.2 17.3a2.2 2.2 0 0 0 1.9 3.45h9.8a2.2 2.2 0 0 0 1.9-3.45L17.07 14.25Z';
const bow = (x: number, y: number): string =>
  `M${n(x)} ${n(y)}c-1.5-3.25-4.75-3.25-4.75-1.25s2.5 1.25 4.75 1.25zm0 0c1.5-3.25 4.75-3.25 4.75-1.25s-2.5 1.25-4.75 1.25z`;
const hourglass = (x: number, y: number, w: number, h: number): string => {
  const hw = w / 2;
  const cx = x + hw;
  const cy = y + h / 2;
  return (
    `M${n(x)} ${n(y)}h${n(w)}M${n(x)} ${n(y + h)}h${n(w)}` +
    `M${n(x + w * 0.12)} ${n(y)}C${n(x + w * 0.12)} ${n(y + h * 0.32)} ${n(cx)} ${n(cy - h * 0.12)} ${n(cx)} ${n(cy)}S${n(x + w * 0.12)} ${n(y + h * 0.68)} ${n(x + w * 0.12)} ${n(y + h)}` +
    `M${n(x + w * 0.88)} ${n(y)}C${n(x + w * 0.88)} ${n(y + h * 0.32)} ${n(cx)} ${n(cy - h * 0.12)} ${n(cx)} ${n(cy)}S${n(x + w * 0.88)} ${n(y + h * 0.68)} ${n(x + w * 0.88)} ${n(y + h)}`
  );
};
/** Clock face with hands, used as a badge. */
const clockBadge = (cx: number, cy: number, r: number): string =>
  C(cx, cy, r) + P(`M${n(cx)} ${n(cy - r * 0.55)}V${n(cy)}l${n(r * 0.36)} ${n(r * 0.24)}`);

/** Pipette along the diagonal: bulb top-right, tip bottom-left; dx/dy shift. */
function pipette(dx = 0, dy = 0): { s: string; f: string } {
  const tube = `M${n(14.87 + dx)} ${n(7.37 + dy)}L${n(7.62 + dx)} ${n(14.62 + dy)}L${n(6.25 + dx)} ${n(17.75 + dy)}L${n(9.38 + dx)} ${n(16.38 + dy)}L${n(16.63 + dx)} ${n(9.13 + dy)}`;
  const bulb = `M${n(14.1 + dx)} ${n(6.6 + dy)}l${n(1.9)} -${n(1.9)}a2.9 2.9 0 0 1 4.1 4.1l-1.9 1.9`;
  const collar = `M${n(13.35 + dx)} ${n(5.85 + dy)}l4.8 4.8`;
  return { s: P(tube) + P(bulb) + P(collar), f: tube + 'Z' };
}

function snowflake(cx: number, cy: number, r: number, branch: number): string {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = -90 + k * 60;
    const [x1, y1] = polar(cx, cy, r, a);
    const [x0, y0] = polar(cx, cy, r, a + 180);
    if (k < 3) d += `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
    const [bx, by] = polar(cx, cy, r * 0.62, a);
    const [l1x, l1y] = polar(bx, by, branch, a + 45);
    const [l2x, l2y] = polar(bx, by, branch, a - 45);
    d += `M${n(l1x)} ${n(l1y)}L${n(bx)} ${n(by)}L${n(l2x)} ${n(l2y)}`;
  }
  return d;
}

function petals(cx: number, cy: number, dist: number, rx: number, ry: number, count: number): string {
  let out = '';
  for (let k = 0; k < count; k++) out += E(cx, cy - dist, rx, ry, ` transform="rotate(${n((360 / count) * k)} ${n(cx)} ${n(cy)})"`);
  return out;
}

function petalPaths(cx: number, cy: number, dist: number, rx: number, ry: number, count: number): string {
  let d = '';
  for (let k = 0; k < count; k++) {
    const deg = (360 / count) * k - 90;
    const [px, py] = polar(cx, cy, dist, deg);
    d += ellipsePath(px, py, ry, rx, deg);
  }
  return d;
}

function spikes(cx: number, cy: number, r0: number, r1: number, count: number, offset = 0): string {
  let d = '';
  for (let k = 0; k < count; k++) {
    const a = offset + (360 / count) * k;
    const [x0, y0] = polar(cx, cy, r0, a);
    const [x1, y1] = polar(cx, cy, r1, a);
    d += `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
  }
  return d;
}

const dropper = pipette(1, -1);
const swimmerGlyph = (dx = 0, dy = 0, s = 1): string =>
  C(7.5 * s + dx, 12 * s + dy, 3.25 * s) + P(`M${n(11.75 * s + dx)} ${n(12 * s + dy)}h${n(8 * s)}`) + P(head(20 * s + dx, 12 * s + dy, 0, 3.6 * s));

// ───────────────────────────── the set ─────────────────────────────

export const ICONS: Record<string, IconDef> = {
  // ══════════ concepts & currencies ══════════
  essence: { f: drop(12, 3.25, 6), s: P(drop(12, 3.25, 6)) + P(dropShine(12, 3.25, 6)) },
  datos: { f: 'M7.25 3.75h9.5a3.5 3.5 0 0 1 3.5 3.5v9.5a3.5 3.5 0 0 1-3.5 3.5h-9.5a3.5 3.5 0 0 1-3.5-3.5v-9.5a3.5 3.5 0 0 1 3.5-3.5z', s: R(3.75, 3.75, 16.5, 16.5, 3.5) + P('M8 16.25v-3M12 16.25v-6.5M16 16.25V7.75') },
  spark: { f: star4(10, 13.75, 7.25), s: P(star4(10, 13.75, 7.25)) + SP(star4(18.75, 5.75, 2.75)) + SP(star4(13.9, 3.6, 1.45)) },
  sparkRoute: { f: star4(11, 12.75, 8.25), s: P(star4(11, 12.75, 8.25)) + SP(star4(19.25, 4.5, 2.5)) },
  night: { f: crescent(11.25, 12.75, 8, 4.25, -3.5, 6.75), s: P(crescent(11.25, 12.75, 8, 4.25, -3.5, 6.75)) + SP(star4(18.5, 4.75, 2.3, 0.2)) },
  encargo: { f: 'M7.5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v11.5a2.5 2.5 0 0 1-2.5 2.5h-9a2.5 2.5 0 0 1-2.5-2.5V7a2.5 2.5 0 0 1 2.5-2.5z', s: R(5, 4.5, 14, 16.5, 2.5) + R(9, 2.75, 6, 3.5, 1.25) + P('M8.75 13.25l2.25 2.25 4.25-4.5') },
  bestiary: { f: 'M7 3.25h10a2.5 2.5 0 0 1 2.5 2.5v12.5a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5V5.75A2.5 2.5 0 0 1 7 3.25z', s: R(4.5, 3.25, 15, 17.5, 2.5) + P('M8.25 3.25v17.5') + C(14, 12, 3.4) + D(14.9, 11.15, 1.05) },
  tree: { f: circlePath(12, 12, 2.75), s: C(12, 12, 2.75) + C(12, 4.25, 2) + C(18.75, 15.9, 2) + C(5.25, 15.9, 2) + P('M12 9.25V6.25M14.38 13.38l2.64 1.52M9.62 13.38l-2.64 1.52') },
  lab: { f: flaskLiquid, s: P(flaskBody) + P('M6.93 14.25h10.14') + D(10.4, 17.5, 0.95) + D(13.7, 16.75, 0.7) },
  seed: { f: circlePath(12, 14.25, 5.5), s: C(12, 14.25, 5.5) + D(12, 14.25, 1.5) + P('M12 8.75V6.25') + P('M12 6.75c.15-2.2 1.55-3.45 4-3.6-.1 2.3-1.5 3.5-4 3.6z') },
  sow: { f: drop(12, 2.75, 3.6), s: P(drop(12, 2.75, 3.6)) + E(12, 18.5, 8.25, 2.75) + E(12, 18.5, 3.5, 0.9, SOLID) },
  world: { f: circlePath(12, 12, 8.75), s: C(12, 12, 8.75) + E(12, 12, 3.6, 8.75) + P('M3.25 12h17.5') },
  time: { f: circlePath(12, 13.25, 7.5), s: C(12, 13.25, 7.5) + P('M10 2.75h4M12 2.75v3M17.65 6.85l1.4-1.4M12 9.5v3.75l2.5 1.5') },
  life: { f: 'M12 14c-4.75.25-7.25-2.25-7.25-6.75 4.5-.25 7.25 2.25 7.25 6.75zM12 12c.25-4.5 2.75-7 7.25-7 0 4.5-2.75 7-7.25 7z', s: P('M12 20.75V12.5M7.75 20.75h8.5') + P('M12 14c-4.75.25-7.25-2.25-7.25-6.75 4.5-.25 7.25 2.25 7.25 6.75zM12 12c.25-4.5 2.75-7 7.25-7 0 4.5-2.75 7-7.25 7z') },
  discovery: { f: circlePath(10.5, 10.5, 6.5), s: C(10.5, 10.5, 6.5) + P('M15.25 15.25l5.5 5.5') + SP(star4(10.5, 10.5, 3, 0.22)) },
  dishRoute: { f: 'M3.25 11a8.75 4.25 0 1 0 17.5 0a8.75 4.25 0 1 0-17.5 0', s: E(12, 11, 8.75, 4.25) + P('M3.25 11v2.75c0 2.35 3.9 4.25 8.75 4.25s8.75-1.9 8.75-4.25V11') + E(10.75, 10.75, 2.4, 1.2, SOLID) + D(15, 11.75, 0.75) },
  samples: { f: 'M9.75 11.25h4.5v5.25a2.25 2.25 0 0 1-4.5 0z', s: P('M8.5 3.25h7M9.75 3.25v13.25a2.25 2.25 0 0 0 4.5 0V3.25M9.75 11.25h4.5') },
  genome: { s: P('M8 3c0 4.6 8 4.4 8 9s-8 4.4-8 9M16 3c0 4.6-8 4.4-8 9s8 4.4 8 9') + P('M9.2 5h5.6M9.2 19h5.6M8.75 10.6h6.5M8.75 13.4h6.5') },
  species: { f: circlePath(12, 12, 7.25), s: C(12, 12, 7.25) + P('M9 13.5c1.6 1.9 4.4 1.9 6 0') + D(9.6, 10.25, 1.05) + D(14.4, 10.25, 1.05) },
  creatures: { f: circlePath(8.25, 9.5, 4) + circlePath(16, 10.5, 3.25) + circlePath(12, 17, 3), s: C(8.25, 9.5, 4) + C(16, 10.5, 3.25) + C(12, 17, 3) },

  // ══════════ behaviours (GDD §14: circle, double circle, arrow, spiral, two dots, cluster) ══════════
  still: { f: circlePath(12, 12, 5.75), s: C(12, 12, 5.75) },
  pulsing: { f: circlePath(12, 12, 3.5), s: C(12, 12, 3.5) + C(12, 12, 8.25) },
  swimmer: { f: circlePath(7.5, 12, 3.25), s: swimmerGlyph() },
  spinner: { s: P(spiral(12, 12, 0.6, 8.5, 1.85, 180)) + D(12, 12, 1.2) },
  divider: { f: circlePath(7.25, 12, 3.75) + circlePath(16.75, 12, 3.75), s: C(7.25, 12, 3.75) + C(16.75, 12, 3.75) },
  colony: { f: circlePath(12, 7.5, 3.1) + circlePath(7.25, 15.75, 3.1) + circlePath(16.75, 15.75, 3.1), s: C(12, 7.5, 3.1) + C(7.25, 15.75, 3.1) + C(16.75, 15.75, 3.1) },
  behavior: { f: circlePath(7.25, 15.75, 3.5), s: C(7.25, 15.75, 3.5) + P('M10.25 12.75c2.4-3.4 5.4-5.25 9.5-5.5') + P(head(19.75, 7.25, -5, 3.2)) + P('M3.5 9.75c.9-1.9 2.2-3.2 3.9-4') },

  // ══════════ ⏱ Reloj ══════════
  clock: { f: circlePath(11, 13, 7.25), s: clockBadge(11, 13, 7.25) + PLUS_TR },
  clock2: { f: circlePath(12, 12, 5.75), s: C(12, 12, 8.75) + C(12, 12, 5.75) + P('M12 8.75V12l2 1.25') + P('M12 3.25v1.25M20.75 12H19.5M12 20.75V19.5M3.25 12H4.5') },
  fridge: { f: 'M8.25 2.75h7.5A2.25 2.25 0 0 1 18 5v14a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 6 19V5a2.25 2.25 0 0 1 2.25-2.25z', s: R(6, 2.75, 12, 18.5, 2.25) + P('M6 9.25h12M9 5.5v1.75M9 12v2.5') + P(snowflake(14, 15.5, 2.6, 0)) },
  sprint: { f: 'M13.5 2.75 6.5 13.25h5.25l-1 8 7.25-10.75H12.5z', s: P('M13.5 2.75 6.5 13.25h5.25l-1 8 7.25-10.75H12.5z') + P('M2.75 8.25h2.5M2.25 12.25h2.5M2.75 16.25h2.5') },
  encTime: { f: 'M5.5 4.5h5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z' + circlePath(17.25, 16.5, 4.5), s: R(3.5, 4.5, 9, 15.5, 2) + R(5.75, 2.75, 4.5, 3.25, 1.1) + P('M6.25 10h3.5M6.25 13h2.25') + clockBadge(17.25, 16.5, 4.5) },
  clock3: { f: 'M7.5 3.25C7.5 8 12 9.15 12 12s-4.5 4-4.5 8.75h9C16.5 16 12 14.85 12 12s4.5-4 4.5-8.75z', s: P(hourglass(6.5, 3.25, 11, 17.5)) + SP('M9.4 19.1c.85-1.4 1.7-2.1 2.6-2.4.9.3 1.75 1 2.6 2.4z') },
  clock4: { f: circlePath(12, 12, 5.5), s: clockBadge(12, 12, 5.5) + P(arcArrow(12, 12, 8.75, -140, 160, 2.6)) },

  // ══════════ 💧 Gotero ══════════
  dropper: { f: dropper.f, s: dropper.s + SP(drop(5.25, 17.75, 1.45)) },
  startEssence: { f: 'M7.75 9.5C4.75 11.5 4.75 20.5 12 20.5S19.25 11.5 16.25 9.5Z', s: P('M7.75 9.5C4.75 11.5 4.75 20.5 12 20.5S19.25 11.5 16.25 9.5') + P('M8.25 9.5 6.5 5.25c1.85.85 3.65-.5 5.5-.5s3.65 1.35 5.5.5L15.75 9.5M7 9.5h10') + SP(drop(12, 11.75, 2.45)) },
  freeSeeds: { f: 'M5.25 10.25h10a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5v-6.75a1.5 1.5 0 0 1 1.5-1.5z', s: R(3.75, 10.25, 13, 9.75, 1.5) + P('M3 10.25h14.5M10.25 10.25V20') + P(bow(10.25, 10.25)) + P(drop(19.25, 2.75, 2.15)) },
  stabilizer: { f: drop(12, 7.75, 2.6), s: C(12, 12, 8.75) + C(12, 12, 5.75, DASH(2.2, 2.05)) + P(drop(12, 7.75, 2.6)) },
  bigSeed: { f: drop(9.75, 3.25, 6.25), s: P(drop(9.75, 3.25, 6.25)) + P(dropShine(9.75, 3.25, 6.25)) + SP(drop(19.25, 11.25, 2.25)) },
  autoSeeder: { f: 'M8 8.5h8a3.25 3.25 0 0 1 3.25 3.25v4a3.25 3.25 0 0 1-3.25 3.25H8a3.25 3.25 0 0 1-3.25-3.25v-4A3.25 3.25 0 0 1 8 8.5z', s: R(4.75, 8.5, 14.5, 10.5, 3.25) + D(9.5, 13.25, 1.3) + D(14.5, 13.25, 1.3) + P('M12 8.5V6.75M2.75 12.5v2.5M21.25 12.5v2.5M10.5 16.25h3') + SP(drop(12, 1.75, 1.7)) },
  cheapSeeds: { f: drop(9.25, 3.25, 5.5), s: P(drop(9.25, 3.25, 5.5)) + P('M18.75 9.5v10.25') + P(head(18.75, 19.75, 90, 3.1)) },
  dropperMax: { f: dropper.f, s: dropper.s + SP(star4(5.25, 18.5, 3.4, 0.2)) },

  // ══════════ 🧫 Placa ══════════
  dish: { f: 'M4.25 13.25a7.75 3.75 0 1 0 15.5 0a7.75 3.75 0 1 0-15.5 0', s: E(12, 13.25, 7.75, 3.75) + P('M4.25 13.25v2.25c0 2.07 3.47 3.75 7.75 3.75s7.75-1.68 7.75-3.75v-2.25') + P('M3 7.25V3h4.25M3 3l4 4M21 7.25V3h-4.25M21 3l-4 4') },
  slots: { f: circlePath(6.25, 14.5, 2.75) + circlePath(13, 14.5, 2.75), s: C(6.25, 14.5, 2.75) + C(13, 14.5, 2.75) + C(19.5, 14.5, 2.25, DASH(1.6, 1.5)) + P('M13 3.75v5M10.5 6.25h5') },
  crowdCost: { f: circlePath(12, 12, 3.25), s: C(12, 12, 3.25) + P('M12 7.25V2.75M9.75 5 12 2.75 14.25 5M12 16.75v4.5M9.75 19 12 21.25 14.25 19M7.25 12H2.75M5 9.75 2.75 12 5 14.25M16.75 12h4.5M19 9.75l2.25 2.25L19 14.25') },
  nursery: { f: 'M3.75 11.5h16.5a8.25 8.25 0 0 1-16.5 0z', s: P('M3.75 11.5h16.5a8.25 8.25 0 0 1-16.5 0z') + C(9.25, 8.25, 2.4) + C(14.75, 8.25, 2.4) + D(9.25, 8.25, 0.7) + D(14.75, 8.25, 0.7) },
  incubator: { f: 'M12 7.25c-3.25 0-5.75 4.75-5.75 8a5.75 5.75 0 0 0 11.5 0c0-3.25-2.5-8-5.75-8z', s: P('M12 7.25c-3.25 0-5.75 4.75-5.75 8a5.75 5.75 0 0 0 11.5 0c0-3.25-2.5-8-5.75-8z') + P('M8.75 4.5c-.6-.75.6-1.5 0-2.25M12 4.5c-.6-.75.6-1.5 0-2.25M15.25 4.5c-.6-.75.6-1.5 0-2.25') + P('M9.5 14.25l1.5 1.25 1.5-1.5 1.25 1.25') },
  dishXL: { f: circlePath(12, 12, 5.75), s: C(12, 12, 5.75) + D(10.75, 11.25, 1.3) + P('M3.25 7.5V3.25H7.5M3.25 3.25l3.5 3.5M20.75 7.5V3.25H16.5M20.75 3.25l-3.5 3.5M20.75 16.5v4.25H16.5M20.75 20.75l-3.5-3.5M3.25 16.5v4.25H7.5M3.25 20.75l3.5-3.5') },
  ecosystem: { f: circlePath(12, 5.75, 2.75) + 'M4.75 15h3a1.25 1.25 0 0 1 1.25 1.25v3a1.25 1.25 0 0 1-1.25 1.25h-3a1.25 1.25 0 0 1-1.25-1.25v-3A1.25 1.25 0 0 1 4.75 15zM18 14.75l3.25 5.75h-6.5z', s: C(12, 5.75, 2.75) + R(3.5, 15, 5.5, 5.5, 1.25) + P('M18 14.75l3.25 5.75h-6.5z') + P('M10.6 8.25 7.25 14.25M13.4 8.25l3.3 6M10 17.75h4.25', DASH(1.5, 1.6)) },

  // ══════════ 🌱 Vida ══════════
  culture: { f: 'M12 12.25c-3.6.2-5.5-1.7-5.5-5.1 3.4-.2 5.5 1.7 5.5 5.1zM12 10.75c.2-3.4 2.1-5.25 5.5-5.25 0 3.4-2.1 5.25-5.5 5.25z', s: E(12, 17.5, 8, 2.75) + P('M4 17.5v.75c0 1.52 3.58 2.75 8 2.75s8-1.23 8-2.75v-.75') + P('M12 17.25V10.5') + P('M12 12.25c-3.6.2-5.5-1.7-5.5-5.1 3.4-.2 5.5 1.7 5.5 5.1zM12 10.75c.2-3.4 2.1-5.25 5.5-5.25 0 3.4-2.1 5.25-5.5 5.25z') },
  nutrient: { f: 'M7.25 11v6.75a3 3 0 0 0 3 3h3.5a3 3 0 0 0 3-3V11z', s: P('M6 3.25h12M7.25 3.25v14.5a3 3 0 0 0 3 3h3.5a3 3 0 0 0 3-3V3.25M7.25 11h9.5') + P('M12 18.5v-3.75') + SP('M12 16c-2 .1-3-.95-3-2.85 1.9-.1 3 .95 3 2.85zM12 15c.1-1.9 1.15-2.9 3-2.9 0 1.9-1.1 2.9-3 2.9z') },
  culture2: { f: 'M3.5 12h17a8.5 7.5 0 0 1-17 0z', s: P('M3.5 12h17a8.5 7.5 0 0 1-17 0z') + P('M8.5 9.25c-1-1.4 1-2.4 0-3.8M12 9.25c-1-1.6 1-2.8 0-4.6M15.5 9.25c-1-1.4 1-2.4 0-3.8M8.5 21.25h7') + SP(star4(12, 14.75, 2.5, 0.22)) },
  swimAffinity: { f: circlePath(6.25, 14.25, 3), s: C(6.25, 14.25, 3) + P('M10.25 14.25h7.75') + P(head(18.25, 14.25, 0, 3.3)) + PLUS_TR },
  sessileAffinity: { f: circlePath(9.5, 14, 5), s: C(9.5, 14, 5) + P(arc(9.5, 14, 7.75, 200, 340), ' opacity=".55"') + PLUS_TR },
  colonyAffinity: { f: circlePath(9.75, 9.75, 2.75) + circlePath(5.5, 16.75, 2.75) + circlePath(14, 16.75, 2.75), s: C(9.75, 9.75, 2.75) + C(5.5, 16.75, 2.75) + C(14, 16.75, 2.75) + PLUS_TR },
  symbiosis: { f: circlePath(9, 12, 5.5) + circlePath(15, 12, 5.5), s: C(9, 12, 5.5) + C(15, 12, 5.5) + SP('M12 15.1s-1.75-1.1-1.75-2.45a1 1 0 0 1 1.75-.65 1 1 0 0 1 1.75.65c0 1.35-1.75 2.45-1.75 2.45z') },
  abundance: { f: petalPaths(12, 12, 5.25, 2.35, 3.5, 6), s: petals(12, 12, 5.25, 2.35, 3.5, 6) + C(12, 12, 2.2, SOLID) },
  eternalLife: { f: infinity(12, 14.5, 8.5, 4.25), s: P(infinity(12, 14.5, 8.5, 4.25)) + P('M12 14.5V9.25') + SP('M12 10c.2-2.7 1.85-4.25 4.75-4.5-.1 2.8-1.8 4.35-4.75 4.5z') },

  // ══════════ 🔬 Descubrir ══════════
  notebook: { f: 'M7 3.25h10a2 2 0 0 1 2 2v13.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.25a2 2 0 0 1 2-2z', s: R(5, 3.25, 14, 17.5, 2) + P('M8.75 3.25v17.5M11.5 8h4.5M11.5 11h4.5') + SP(star4(14.6, 16, 2.4, 0.22)) },
  print: { f: 'M5.5 7.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', s: R(3.5, 7.5, 11, 11, 2) + P('M9.5 7.5V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4') + C(9, 13, 2.5) + D(9.75, 12.25, 0.8) },
  cataloguing: { f: 'M3.5 11.25V4.5a1 1 0 0 1 1-1h6.75l9.25 9.25-8 8z', s: P('M3.5 11.25V4.5a1 1 0 0 1 1-1h6.75l9.25 9.25-8 8z') + C(7.75, 7.75, 1.6) + SP(star4(13.25, 13.25, 2.6, 0.22)) },
  archive: { f: 'M4.5 4h15a1.25 1.25 0 0 1 1.25 1.25v2.5A1.25 1.25 0 0 1 19.5 9h-15a1.25 1.25 0 0 1-1.25-1.25v-2.5A1.25 1.25 0 0 1 4.5 4z', s: R(3.25, 4, 17.5, 5, 1.25) + P('M4.75 9v9.5a1.75 1.75 0 0 0 1.75 1.75h11a1.75 1.75 0 0 0 1.75-1.75V9') + P('M10 12.75h4') },
  microscope: { f: 'M9.75 3.25l3.25 1.9-3.6 6.2-3.25-1.9z', s: P('M9.75 3.25l3.25 1.9-3.6 6.2-3.25-1.9z') + P('M11.4 4.2l1.3-2.2M7.8 10.75l-1.1 1.9') + P('M14.5 8.25a6.25 6.25 0 0 1-3.5 11.25M4.75 20.75h14.5M8.5 17.25h5.5') },
  discoBonus: { f: circlePath(12, 15, 5.25), s: C(12, 15, 5.25) + P('M8.75 10.75 6.25 3.25h4l1.75 4.25 1.75-4.25h4l-2.5 7.5') + SP(star4(12, 15, 2.6, 0.22)) },
  rareSpores: { f: circlePath(10, 13.75, 3.75), s: C(10, 13.75, 3.75) + P(spikes(10, 13.75, 5.25, 7, 8, 22.5)) + SP(star4(19, 4.75, 2.75, 0.22)) },
  mutations: { s: P('M7 3c0 4.5 7 4.5 7 9s-7 4.5-7 9M14 3c0 4.5-7 4.5-7 9s7 4.5 7 9') + P('M8.1 6.25h4.8M8.1 17.75h4.8') + SP(star4(19.25, 9.5, 2.75, 0.22)) },
  encyclopedia: { f: 'M5.25 14h13.5a1.25 1.25 0 0 1 1.25 1.25v3.75a1.25 1.25 0 0 1-1.25 1.25H5.25A1.25 1.25 0 0 1 4 19v-3.75A1.25 1.25 0 0 1 5.25 14z', s: R(4, 14, 16, 6.25, 1.25) + R(5.5, 8.25, 13, 5.75, 1.25) + R(7, 3.25, 10, 5, 1.25) + P('M7.5 17.25h3M9 11.25h2.5M10.5 5.75h2') },

  // ══════════ 🌍 Mundos ══════════
  worldClassic: { f: 'M4.75 16.25a7.25 7.25 0 0 1 14.5 0c-1.6 2.75-4.35 3.75-7.25 3.75s-5.65-1-7.25-3.75z', s: P('M4.75 16.25a7.25 7.25 0 0 1 14.5 0c-1.6 2.75-4.35 3.75-7.25 3.75s-5.65-1-7.25-3.75z') + E(8.9, 13.25, 1.35, 2.35) + E(15.1, 13.25, 1.35, 2.35) + E(12, 14.75, 1.25, 2.6, SOLID) + P('M9.5 5.25c1.6-.9 3.4-.9 5 0', ' opacity=".6"') },
  worldCold: { f: circlePath(12, 12, 2), s: P(snowflake(12, 12, 8.75, 2.6)) + C(12, 12, 2) },
  worldGyro: { s: P(spiral(12, 12, 0.5, 8.5, 2.25, -90)) + D(12, 12, 1.2) },
  worldShields: { f: 'M12 3.25 19 6v5.6c0 4.3-2.9 7.6-7 9.15-4.1-1.55-7-4.85-7-9.15V6z', s: P('M12 3.25 19 6v5.6c0 4.3-2.9 7.6-7 9.15-4.1-1.55-7-4.85-7-9.15V6z') + C(12, 11.5, 3) + D(12, 11.5, 1.1) },
  worldHelix: { f: 'M12 12.5l4.5 7.75h-9z', s: C(7.25, 8, 3.5, SOLID) + C(16.75, 8, 3.25) + P('M12 12.5l4.5 7.75h-9z') },
  worldLegs: { f: 'M6.25 10.5a5.75 4.25 0 1 0 11.5 0a5.75 4.25 0 1 0-11.5 0', s: E(12, 10.5, 5.75, 4.25) + P('M8 13.9 5.75 18.75M10.6 14.7l-.8 5.3M13.4 14.7l.8 5.3M16 13.9l2.25 4.85') + D(10.1, 9.6, 1) + D(13.9, 9.6, 1) },
  worldGiants: { f: circlePath(14, 11.5, 7.25), s: C(14, 11.5, 7.25) + C(14, 11.5, 3.9) + E(13, 10.6, 1.25, 1.75, SOLID) + C(4.75, 18.75, 1.9, SOLID) },

  // ══════════ ✨ Destello ══════════
  sparkLife: { f: star4(9.5, 10, 6.75), s: P(star4(9.5, 10, 6.75)) + P(hourglass(15, 13.75, 6, 7.25)) },
  sparkTime: { f: star4(9.25, 9.75, 6.5), s: P(star4(9.25, 9.75, 6.5)) + clockBadge(17, 16.75, 4.5) },
  sparkFirst: { f: star4(10, 11, 7.5), s: P(star4(10, 11, 7.5)) + P('M14.75 15.5l2.75 2.75-2.75 2.75M18.5 15.5l2.75 2.75-2.75 2.75') },
  sparkGift: { f: 'M5 11h10.5a1.5 1.5 0 0 1 1.5 1.5v6.25a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V12.5A1.5 1.5 0 0 1 5 11z', s: R(3.5, 11, 13.5, 9.25, 1.5) + P('M2.75 11h15M10.25 11v9.25') + P(bow(10.25, 11)) + SP(star4(19.25, 4.75, 3, 0.22)) },
  sparkDatos: { f: star4(8.5, 8.5, 5.75), s: P(star4(8.5, 8.5, 5.75)) + R(12.25, 12.25, 8.5, 8.5, 2.25) + P('M14.75 18.5v-1.5M16.5 18.5v-3M18.25 18.5V14.5') },
  sparkMutagen: { f: flaskLiquid, s: P(flaskBody) + P('M6.93 14.25h10.14') + SP(star4(12, 17.25, 2.6, 0.22)) },

  // ══════════ HUD & settings ══════════
  settings: { f: gear(12, 12, 6.6, 9, 8), s: P(gear(12, 12, 6.6, 9, 8)) + C(12, 12, 2.75) },
  sound: { f: 'M4.25 9.5h3.25l4.5-4v13l-4.5-4H4.25z', s: P('M4.25 9.5h3.25l4.5-4v13l-4.5-4H4.25z') + P('M15.25 9.25a3.75 3.75 0 0 1 0 5.5M17.9 6.6a7.5 7.5 0 0 1 0 10.8') },
  mute: { f: 'M4.25 9.5h3.25l4.5-4v13l-4.5-4H4.25z', s: P('M4.25 9.5h3.25l4.5-4v13l-4.5-4H4.25z') + P('M15.5 9.5l5 5M20.5 9.5l-5 5') },
  music: { f: circlePath(6.75, 17.5, 2.25) + circlePath(16.75, 15.25, 2.25), s: P('M9 17.5V6.25l10-2v11') + C(6.75, 17.5, 2.25) + C(16.75, 15.25, 2.25) + P('M9 9.25l10-2') },
  vibrate: { f: 'M10 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z', s: R(8, 4.5, 8, 15, 2) + P('M5 9v6M19 9v6M2.75 10.5v3M21.25 10.5v3') },
  motion: { s: P('M3.5 12c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0 2.4-2.6 3.8-2.6') + P('M3.5 17.25h5M15.5 6.75h5') },
  contrast: { s: C(12, 12, 8.75) + SP('M12 3.25v17.5a8.75 8.75 0 0 0 0-17.5z') },
  textsize: { s: P('M3.5 18.5l5-13 5 13M5.4 13.8h6.2M14.5 18.5l3.25-8 3.25 8M15.6 16h4.3') },
  pause: { f: 'M8 5.25h1.25a1.25 1.25 0 0 1 1.25 1.25v11a1.25 1.25 0 0 1-1.25 1.25H8a1.25 1.25 0 0 1-1.25-1.25v-11A1.25 1.25 0 0 1 8 5.25zM14.75 5.25H16a1.25 1.25 0 0 1 1.25 1.25v11A1.25 1.25 0 0 1 16 18.75h-1.25a1.25 1.25 0 0 1-1.25-1.25v-11a1.25 1.25 0 0 1 1.25-1.25z', s: R(6.75, 5.25, 3.75, 13.5, 1.25) + R(13.5, 5.25, 3.75, 13.5, 1.25) },
  play: { s: SP('M8 5.6v12.8a.8.8 0 0 0 1.2.7l9.6-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6z') },
  speed: { f: 'M4 7v10l7-5zM12.5 7v10l7-5z', s: P('M4 7v10l7-5zM12.5 7v10l7-5z') },
  stop: { f: 'M8.5 6.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', s: R(6.5, 6.5, 11, 11, 2) },
  journal: { f: 'M12 6.25c-2.25-1.5-5-1.9-8.25-1.25v13c3.25-.65 6-.25 8.25 1.25 2.25-1.5 5-1.9 8.25-1.25v-13C17 4.35 14.25 4.75 12 6.25z', s: P('M12 6.25c-2.25-1.5-5-1.9-8.25-1.25v13c3.25-.65 6-.25 8.25 1.25 2.25-1.5 5-1.9 8.25-1.25v-13C17 4.35 14.25 4.75 12 6.25zM12 6.25v13') },
  trophy: { f: 'M8 4.25h8v5.25a4 4 0 0 1-8 0z', s: P('M8 4.25h8v5.25a4 4 0 0 1-8 0zM8 6.25H5.5a2.6 2.6 0 0 0 2.8 3.75M16 6.25h2.5a2.6 2.6 0 0 1-2.8 3.75M12 13.5v3.25M8.5 20.25h7M9.6 16.75h4.8l.55 3.5h-5.9z') },
  question: { s: P('M9 9.25a3 3 0 1 1 4.2 2.75c-.8.4-1.2 1-1.2 1.9v.6') + D(12, 17.75, 1.15) },
  help: { f: circlePath(12, 12, 8.75), s: C(12, 12, 8.75) + P('M9.6 9.6a2.45 2.45 0 1 1 3.4 2.25c-.65.3-1 .8-1 1.5v.4') + D(12, 16.5, 1.05) },
  info: { f: circlePath(12, 12, 8.75), s: C(12, 12, 8.75) + P('M12 11v5.5') + D(12, 7.9, 1.1) },
  warning: { f: 'M12 3.75l9 15.5H3z', s: P('M12 3.75l9 15.5H3z') + P('M12 9.75v4.5') + D(12, 16.75, 1.1) },
  close: { s: P('M6.5 6.5l11 11M17.5 6.5l-11 11') },
  back: { s: P('M14.5 6l-6 6 6 6') },
  chevronUp: { s: P('M6.5 14.5 12 9l5.5 5.5') },
  chevronDown: { s: P('M6.5 9.5 12 15l5.5-5.5') },
  chevronRight: { s: P('M9.5 6.5 15 12l-5.5 5.5') },
  chevronLeft: { s: P('M14.5 6.5 9 12l5.5 5.5') },
  check: { s: P('M5.5 12.5l4 4 9-9') },
  plus: { s: P('M12 5.5v13M5.5 12h13') },
  minus: { s: P('M5.5 12h13') },
  up: { s: P('M12 19V5.5M6.5 11 12 5.5l5.5 5.5') },
  down: { s: P('M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5') },
  centre: { f: circlePath(12, 12, 7), s: C(12, 12, 7) + D(12, 12, 2) + P('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3') },
  follow: { s: C(12, 12, 6.25) + P('M12 2.75v3.5M12 17.75v3.5M2.75 12h3.5M17.75 12h3.5') + C(12, 12, 2.25, SOLID) },
  target: { f: circlePath(12, 12, 4.75), s: C(12, 12, 8.5) + C(12, 12, 4.75) + D(12, 12, 1.4) },
  eraser: { f: 'M14.3 4.6l5.1 5.1-8.8 8.8H6.2l-2-2a1.5 1.5 0 0 1 0-2.1z', s: P('M14.3 4.6l5.1 5.1-8.8 8.8H6.2l-2-2a1.5 1.5 0 0 1 0-2.1zM9.2 9.7l5.1 5.1M11 18.5h8.5') },
  broom: { f: 'M12.5 11.5c-2.6-.6-5 .7-6 3.2l-1.6 4.4 4.4-1.6c2.5-1 3.8-3.4 3.2-6z', s: P('M19.5 4.5l-7 7M12.5 11.5c-2.6-.6-5 .7-6 3.2l-1.6 4.4 4.4-1.6c2.5-1 3.8-3.4 3.2-6zM7.4 16.6l2.1-2.1') },
  pencil: { f: 'M15.2 5.3l3.5 3.5-9.6 9.6-4.4.9.9-4.4z', s: P('M15.2 5.3l3.5 3.5-9.6 9.6-4.4.9.9-4.4zM13.2 7.3l3.5 3.5') },
  brush: { f: 'M9.25 14.75c-2.5-.25-4.5 1.5-4.5 4.5l-.5 1.5 1.5-.5c3 0 4.75-2 4.5-4.5z', s: P('M20 4 11.25 13.5M9.25 14.75c-2.5-.25-4.5 1.5-4.5 4.5l-.5 1.5 1.5-.5c3 0 4.75-2 4.5-4.5zM10.5 12.25l1.25 1.25') },
  trash: { f: 'M6.8 7h10.4l-.9 12.2a1.5 1.5 0 0 1-1.5 1.3H9.2a1.5 1.5 0 0 1-1.5-1.3z', s: P('M5 7h14M9.5 7V4.75h5V7M6.8 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h5.6a1.5 1.5 0 0 0 1.5-1.3L17.2 7M10.25 10.5v6.5M13.75 10.5v6.5') },
  copy: { f: 'M10.5 8.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', s: R(8.5, 8.5, 11, 11, 2) + P('M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2') },
  download: { s: P('M12 4.25v10.5M7.5 10.25l4.5 4.5 4.5-4.5M5 19.75h14') },
  upload: { s: P('M12 15.25V4.75M7.5 9.25 12 4.75l4.5 4.5M5 19.75h14') },
  camera: { f: 'M4.5 8.5A1.5 1.5 0 0 1 6 7h2.2l1.5-2h4.6l1.5 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z', s: P('M4.5 8.5A1.5 1.5 0 0 1 6 7h2.2l1.5-2h4.6l1.5 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z') + C(12, 12.75, 3.25) },
  external: { s: P('M13.5 4.75h5.75v5.75M19.25 4.75l-7.75 7.75M17 14v4a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18V9a1.5 1.5 0 0 1 1.5-1.5h4') },
  lock: { f: 'M8 10.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z', s: R(6, 10.5, 12, 9, 2) + P('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.25v2') },
  unlock: { f: 'M8 10.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z', s: R(6, 10.5, 12, 9, 2) + P('M8.5 10.5V8a3.5 3.5 0 0 1 6.75-1.3M12 14.25v2') },
  user: { f: circlePath(12, 8.5, 3.6), s: C(12, 8.5, 3.6) + P('M4.75 19.75a7.25 7.25 0 0 1 14.5 0') },
  crown: { f: 'M4.5 17.5l-1-9 5 3.6L12 5.5l3.5 6.6 5-3.6-1 9z', s: P('M4.5 17.5l-1-9 5 3.6L12 5.5l3.5 6.6 5-3.6-1 9zM5 20.25h14') },
  heart: { f: 'M12 19.25s-7.25-4.5-7.25-9.75A4 4 0 0 1 12 7.25a4 4 0 0 1 7.25 2.25c0 5.25-7.25 9.75-7.25 9.75z', s: P('M12 19.25s-7.25-4.5-7.25-9.75A4 4 0 0 1 12 7.25a4 4 0 0 1 7.25 2.25c0 5.25-7.25 9.75-7.25 9.75z') },
  shield: { f: 'M12 3.75l7 2.75v5.3c0 4.2-2.9 7.2-7 8.45-4.1-1.25-7-4.25-7-8.45V6.5z', s: P('M12 3.75l7 2.75v5.3c0 4.2-2.9 7.2-7 8.45-4.1-1.25-7-4.25-7-8.45V6.5zM9 12l2.2 2.2L15.3 10') },
  bolt: { f: 'M13 3.5l-7 10h5.5l-1 7 7-10H12z', s: P('M13 3.5l-7 10h5.5l-1 7 7-10H12z') },
  layers: { f: 'M12 4.5l8 4-8 4-8-4z', s: P('M12 4.5l8 4-8 4-8-4zM4 12.5l8 4 8-4M4 16.5l8 4 8-4') },
  hand: { s: P('M9 11.5V5.8a1.5 1.5 0 0 1 3 0v4.7M12 10V4.8a1.5 1.5 0 0 1 3 0V11M15 7.8a1.5 1.5 0 0 1 3 0v6.2a6 6 0 0 1-6 6h-.6a5.4 5.4 0 0 1-4.2-2L4.6 14.8a1.5 1.5 0 0 1 2.3-1.9L9 15') },
  eye: { f: circlePath(12, 12, 3), s: P('M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z') + C(12, 12, 3) },
  tag: { f: 'M3.5 11.25V4.5a1 1 0 0 1 1-1h6.75l9.25 9.25-8 8z', s: P('M3.5 11.25V4.5a1 1 0 0 1 1-1h6.75l9.25 9.25-8 8z') + C(7.75, 7.75, 1.6) },
  gift: { f: 'M5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9z', s: R(4, 9, 16, 11, 1.5) + P('M3 9h18M12 9v11') + P(bow(12, 9)) },
  star: { f: 'M12 3.5l2.55 5.2 5.7.8-4.1 4 1 5.65L12 16.45l-5.1 2.7 1-5.65-4.15-4 5.75-.8z', s: P('M12 3.5l2.55 5.2 5.7.8-4.1 4 1 5.65L12 16.45l-5.1 2.7 1-5.65-4.15-4 5.75-.8z') },
  sparkles: { f: star4(10.5, 11, 7), s: P(star4(10.5, 11, 7)) + SP(star4(18.5, 17.5, 2.75, 0.22)) },
  sliders: { s: P('M4.5 7h8M17.5 7h2M4.5 12h2M11.5 12h8M4.5 17h10M18.5 17h1') + C(15, 7, 2.25) + C(9, 12, 2.25) + C(16.5, 17, 2.25) },
  stamp: { f: 'M6.25 13.5h11.5a1.25 1.25 0 0 1 1.25 1.25v1.5a1.25 1.25 0 0 1-1.25 1.25H6.25A1.25 1.25 0 0 1 5 16.25v-1.5a1.25 1.25 0 0 1 1.25-1.25z', s: P('M9.25 13.5V10a2.75 2.75 0 1 1 5.5 0v3.5') + R(5, 13.5, 14, 4, 1.25) + P('M6.5 20.5h11') },
  rebirth: { s: P(arcArrow(12, 12.25, 7.25, 140, 400, 2.6)) + D(12, 12.25, 1.9) },
  restore: { s: P('M4.75 12a7.25 7.25 0 1 0 2.1-5.1M4.5 4.75v3.75h3.75') },
  stats: { s: P('M4.5 19.75h15M7.5 16.5v-4M12 16.5V7M16.5 16.5v-7') },
  vibrateOff: { s: R(8, 4.5, 8, 15, 2) + P('M4 4l16 16') },
  globe: { f: circlePath(12, 12, 8.75), s: C(12, 12, 8.75) + P('M3.25 12h17.5M12 3.25c2.4 2.4 3.5 5.4 3.5 8.75s-1.1 6.35-3.5 8.75c-2.4-2.4-3.5-5.4-3.5-8.75s1.1-6.35 3.5-8.75z') },
  menu: { s: P('M4.5 7h15M4.5 12h15M4.5 17h15') },
  share: { s: C(17.5, 5.75, 2.5) + C(6.5, 12, 2.5) + C(17.5, 18.25, 2.5) + P('M8.7 10.75l6.6-3.75M8.7 13.25l6.6 3.75') },
  leaderboard: { f: 'M9.25 8.5h5.5V20h-5.5zM3.5 12.5h5.75V20H3.5zM14.75 14.5h5.75V20h-5.75z', s: P('M9.25 20V8.5h5.5V20M3.5 20v-7.5h5.75M14.75 14.5h5.75V20M2.75 20h18.5') + SP(star4(12, 4.5, 2.25, 0.22)) },

  // ══════════ Momentos ══════════
  fade: { s: C(12, 12, 7.5, DASH(2.4, 2.6)) + P('M8.75 12h6.5') },
  burst: { f: circlePath(12, 12, 3.25), s: C(12, 12, 3.25) + P(spikes(12, 12, 5.75, 9, 8, 0)) },
  split: { f: circlePath(7.25, 12, 4) + circlePath(16.75, 12, 4), s: C(7.25, 12, 4) + C(16.75, 12, 4) + P('M12 3.75v16.5', DASH(1.8, 1.8)) },
  upgrade: { f: flaskLiquid, s: P(flaskBody) + P('M12 18.75v-5M9.75 15.75 12 13.5l2.25 2.25') },
  robot: { f: 'M8 8.5h8a3.25 3.25 0 0 1 3.25 3.25v4a3.25 3.25 0 0 1-3.25 3.25H8a3.25 3.25 0 0 1-3.25-3.25v-4A3.25 3.25 0 0 1 8 8.5z', s: R(4.75, 8.5, 14.5, 10.5, 3.25) + D(9.5, 13.25, 1.3) + D(14.5, 13.25, 1.3) + P('M12 8.5V5.25M2.75 12.5v2.5M21.25 12.5v2.5M10.5 16.25h3') + D(12, 4.5, 1.25) },
  slot: { f: circlePath(6, 12, 2.75) + circlePath(12, 12, 2.75), s: C(6, 12, 2.75) + C(12, 12, 2.75) + C(18.25, 12, 2.5, DASH(1.6, 1.5)) },
  halo: { f: circlePath(12, 12, 4), s: C(12, 12, 4) + C(12, 12, 8.25, DASH(2, 2.6)) },
  palette: { s: P('M12 3.75a8.25 8.25 0 1 0 0 16.5c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7h2a3.9 3.9 0 0 0 3.9-3.9c0-3.6-3.8-6.7-8.5-6.7z') + D(7.6, 11.4, 1.15) + D(10.4, 7.8, 1.15) + D(14.6, 7.8, 1.15) },
  hanger: { s: P('M12 8.25v-.6a1.9 1.9 0 1 0-1.9-1.9M12 8.25l8.2 6.6a1.2 1.2 0 0 1-.8 2.15H4.6a1.2 1.2 0 0 1-.8-2.15z') },
  bag: { f: 'M5.5 8.5h13l-1 11a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4z', s: P('M5.5 8.5h13l-1 11a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4zM9 10.5V7a3 3 0 0 1 6 0v3.5') },
  name: { s: P('M4.5 18.5l4.6-13h1.8l4.6 13M6.6 13.5h7M17.75 9.5v9M16 9.5h3.5M16 18.5h3.5') },
};

/** Old names → v2 names, per legacy module. Every name the old APIs accepted still resolves. */
export const ALIAS: Record<string, string> = {
  // shared
  drop: 'essence',
  moon: 'night',
  sample: 'samples',
  clockIcon: 'time',
  snow: 'worldCold',
  sprintIcon: 'sprint',
  calibrate: 'sliders',
  sparkle: 'sparkles',
  unknown: 'question',
  warn: 'warning',
  x: 'close',
  book: 'bestiary',
  big: 'bigSeed',
  dishTop: 'dishRoute',
  clockSmall: 'time',
};

/** Per-API overrides where the old modules used the same name for different pictures. */
const LEGACY: Record<'ui' | 'tree' | 'mo' | 'store', Record<string, string>> = {
  ui: { print: 'stamp', clock: 'time', dish: 'dishRoute', lab: 'lab', seed: 'seed' },
  tree: { print: 'print' },
  mo: { drop: 'sow', clock: 'time', book: 'bestiary', moon: 'night', spark: 'sparkRoute' },
  store: { dish: 'dishRoute', clock: 'time', sparkle: 'sparkles' },
};

/** Resolve any accepted name to a v2 definition name (unknown → 'question'). */
export function resolveIcon(name: string, api?: keyof typeof LEGACY): string {
  const legacy = api ? LEGACY[api][name] : undefined;
  if (legacy && legacy in ICONS) return legacy;
  if (name in ICONS) return name;
  const a = ALIAS[name];
  return a && a in ICONS ? a : 'question';
}

export function hasIcon(name: string): boolean {
  return name in ICONS || (name in ALIAS && ALIAS[name] in ICONS);
}

function svg(def: IconDef, size: number, cls: string, extra = ''): string {
  const fill = def.f ? `<path class="f" d="${def.f}" fill="currentColor" stroke="none" opacity=".2"/>` : '';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${fill}${def.s}</svg>`;
}

/** Inline SVG of a v2 icon. `cls` is appended to the base class `bl-ic`. */
export function artIcon(name: string, size = 24, cls = ''): string {
  return svg(ICONS[resolveIcon(name)], size, `bl-ic${cls ? ' ' + cls : ''}`);
}

// ───────────────────────────── drop-in compat APIs ─────────────────────────────

/** Same signature and class as src/ui/icons.ts `icon()`. */
export function icon(name: string, size = 24, extraClass = ''): string {
  return svg(ICONS[resolveIcon(name, 'ui')], size, `bl-ic ic ${extraClass}`.trim());
}

/** Same signature and class as src/ui/tree/icons.ts `treeIcon()`. */
export function treeIcon(name: string, size = 24, cls = ''): string {
  return svg(ICONS[resolveIcon(name, 'tree')], size, `bl-ic rt-ic${cls ? ' ' + cls : ''}`);
}

/** Same as src/ui/tree/icons.ts `hasTreeIcon()`. */
export function hasTreeIcon(name: string): boolean {
  return hasIcon(name);
}

/** Same signature and class as src/ui/moments/icons.ts `moIcon()`. */
export function moIcon(name: string, size = 20, cls = ''): string {
  return svg(ICONS[resolveIcon(name, 'mo')], size, `bl-ic mo-ic ${cls}`.trim());
}

/** Same signature and class as src/ui/store/icons.ts `sicon()`. */
export function sicon(name: string, size = 24, extraAttrs = ''): string {
  return svg(ICONS[resolveIcon(name, 'store')], size, 'bl-ic bst-ic', extraAttrs ? ' ' + extraAttrs : '');
}

/** Same as src/ui/store/icons.ts `svgInner()` (raw inner markup, v2 stroke). */
export function svgInner(inner: string, size = 24): string {
  return `<svg class="bl-ic bst-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Route → icon (tree chips, route labels). */
export const ROUTE_ICON = {
  time: 'time',
  dropper: 'dropper',
  dish: 'dishRoute',
  life: 'life',
  discovery: 'discovery',
  worlds: 'world',
  spark: 'sparkRoute',
} as const;

/** World → icon (start card, node, Bestiary filters). */
export const WORLD_ICON = {
  classic: 'worldClassic',
  cold: 'worldCold',
  gyro: 'worldGyro',
  shields: 'worldShields',
  helix: 'worldHelix',
  legs: 'worldLegs',
  giants: 'worldGiants',
} as const;

/** Groups for the dev sheet and the bible. */
export const ICON_GROUPS: Record<string, string[]> = {
  concepts: ['essence', 'datos', 'sparkRoute', 'night', 'encargo', 'bestiary', 'tree', 'lab', 'seed', 'sow', 'world', 'species', 'creatures', 'samples', 'genome'],
  routes: ['time', 'dropper', 'dishRoute', 'life', 'discovery', 'world', 'sparkRoute'],
  time: ['clock', 'clock2', 'fridge', 'sprint', 'encTime', 'clock3', 'clock4'],
  dropper: ['dropper', 'startEssence', 'freeSeeds', 'stabilizer', 'bigSeed', 'autoSeeder', 'cheapSeeds', 'dropperMax'],
  dish: ['dish', 'slots', 'crowdCost', 'nursery', 'incubator', 'dishXL', 'ecosystem'],
  life: ['culture', 'nutrient', 'culture2', 'swimAffinity', 'sessileAffinity', 'colonyAffinity', 'symbiosis', 'abundance', 'eternalLife'],
  discovery: ['notebook', 'print', 'cataloguing', 'archive', 'microscope', 'discoBonus', 'rareSpores', 'mutations', 'encyclopedia'],
  worlds: ['worldClassic', 'worldCold', 'worldGyro', 'worldShields', 'worldHelix', 'worldLegs', 'worldGiants'],
  spark: ['spark', 'sparkLife', 'sparkTime', 'sparkFirst', 'sparkGift', 'sparkDatos', 'sparkMutagen'],
  behaviours: ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony', 'behavior'],
  moments: ['sow', 'fade', 'burst', 'split', 'upgrade', 'robot', 'sliders', 'tag', 'slot', 'gift', 'eye', 'up', 'down'],
  hud: ['settings', 'sound', 'mute', 'music', 'vibrate', 'motion', 'contrast', 'textsize', 'globe', 'pause', 'play', 'speed', 'stop', 'journal', 'trophy', 'leaderboard', 'help', 'info', 'warning', 'question', 'menu', 'share'],
  actions: ['close', 'back', 'check', 'plus', 'minus', 'chevronUp', 'chevronDown', 'chevronLeft', 'chevronRight', 'centre', 'follow', 'target', 'eraser', 'broom', 'pencil', 'brush', 'trash', 'copy', 'download', 'upload', 'camera', 'external', 'lock', 'unlock', 'stamp', 'rebirth', 'restore', 'stats'],
  store: ['bag', 'hanger', 'palette', 'halo', 'name', 'crown', 'user', 'heart', 'shield', 'bolt', 'layers', 'hand', 'star', 'sparkles'],
};
