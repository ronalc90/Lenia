import type { DishShape } from '../core/dish';
import type { DetectorReport, FieldSnapshot, LeniaParams } from '../core/types';
import { CATALOG, catalogPattern } from './catalog';

/**
 * Runaway watch: spots matter that is about to become the worm maze (or a budding flood) early
 * enough to dissolve it, on the live toroidal grids (192×240, 128×160) and in the round dish.
 *
 * Why (docs/DISH.md §5): an established maze is a saturated Turing pattern that survives any growth
 * penalty the fauna survives, but its nucleus — the blob left when Orbium merge, or a spore
 * cluster — is fragile and recognisable for ~100 steps. The detector's own `exploded` flag fires
 * only at 12 R² or after a quarter-window ratio exists, by which time the blob has split into
 * Orbium-sized worms. What tells a nucleus from a collision that will resolve (docs/DISH.md §5c,
 * 20 long games at 192×240): a nucleus grows exponentially, ×1.15–1.33 every 10 steps and without a
 * single dip for 100+ steps (169 → 215 → 287 → 339 → 427 → 547 → 707); two Orbium that collide jump
 * ×2 at once, swell for at most 40 steps (149 → 200 → 248 → 277 → 303) and then shed or die. So:
 *
 *  - growth: the component's mass rose at every detector update for the last GROWTH_SPAN steps,
 *    gained ≥ GROWTH_GAIN over them, and is ≥ GROWTH_MIN_K × the reference mass. A merge (a rise
 *    above JUMP per 10 steps) restarts the span: only growth after it counts;
 *  - swarm: the same test on the matter within SWARM_RADIUS_R · R of the component (read from the
 *    snapshot), at ≥ SWARM_MASS_K × reference — buds or worms multiplying around it;
 *  - oversize: a non-stable component ≥ OVERSIZE_K × reference that keeps its bulk (≥ OVERSIZE_HOLD
 *    × its maximum of the last OVERSIZE_SPAN steps) for PERSIST updates — several creatures merged
 *    into one heavy blob.
 *
 * Reference = median over stable creatures of their lightest mass in the window, else the heaviest
 * catalog species that can live at the calibration (spore candidates), else REF_MASS_R2 · R².
 *
 * Output: soft erase discs (WebGLSimulation.erase / seed.ts applyEraseCpu) on the flagged
 * components, plus a `started` event per component (for the player's explanation). Nothing is
 * flagged once the dish is overgrown (fill ≥ OVERGROWN_FILL): that keeps the free sterilise.
 *
 * Allocation-free in steady state (track records and result arrays are pooled); cost is one disc
 * sum over the snapshot per component (≈ 1 200 blocks at R = 13, scale 2).
 */
export const RUNAWAY = {
  /** Steps of uninterrupted growth before a component counts as a runaway (5 detector updates). */
  GROWTH_SPAN: 50,
  /**
   * Mass gain over GROWTH_SPAN. Nuclei: ×1.8–3.2 (first trigger at 382–692 mass, 70–130 steps before
   * fill passes 0.1); the strongest collision transient measured: ×1.64, then it died.
   */
  GROWTH_GAIN: 1.8,
  /** …and mass ≥ this × reference. */
  GROWTH_MIN_K: 1.6,
  /**
   * A rise above this per 10 steps is a merge, not growth: the span restarts after it. Two equal
   * creatures merging jump ×2; a nucleus grows ×1.15–1.33 per 10 steps, a budding spore (σ .021) ×1.44.
   */
  JUMP: 1.6,
  /** Local disc around a component, in R. */
  SWARM_RADIUS_R: 3,
  /** Local matter ≥ this × reference (collision transients peak at 4.4× an Orbium)… */
  SWARM_MASS_K: 5.5,
  /** …that grew this much over GROWTH_SPAN, rising at every update. */
  SWARM_GAIN: 1.5,
  /** Non-stable component ≥ this × reference mass. */
  OVERSIZE_K: 3,
  /** …and still ≥ this × its own maximum over the last OVERSIZE_SPAN steps (not settling). */
  OVERSIZE_HOLD: 0.95,
  OVERSIZE_SPAN: 50,
  /** Updates the oversize signal must hold. */
  PERSIST: 3,
  /** Reference mass per R² when the calibration is unknown (Orbium unicaudatus: 74 at R = 13). */
  REF_MASS_R2: 0.44,
  /**
   * Catalog species count as "living here" within this normalised (μ, σ) distance (scales as
   * game/balance PARAM_MU_SCALE 0.03, PARAM_SIGMA_SCALE 0.006); the heaviest of the nearest three is
   * the reference before anything is stable.
   */
  CATALOG_REACH: 1.5,
  /** Steps of history for the reference (a stable creature's lightest mass in this window). */
  REF_WINDOW: 100,
  /** Erase disc = ERASE_K × radius of gyration + ERASE_PAD_R × R (a disc's edge is at √2 rg, a bar's tip at √3 rg). */
  ERASE_K: 2.2,
  ERASE_PAD_R: 0.5,
  /** Most components dissolved per update. */
  MAX_PER_UPDATE: 8,
  /**
   * A dissolved component's track (the detector may keep its id on a remnant the disc missed) can
   * be flagged again after this many steps — only if it grows again, since the erase restarts the span.
   */
  REFLAG_STEPS: 60,
  /** Above this fill the dish is overgrown: leave it to the free sterilise. Mirrors balance.DISH_OVERGROWN_FILL. */
  OVERGROWN_FILL: 0.25,
  /** Ignore specks lighter than this × R². */
  MIN_MASS_R2: 0.1,
  /**
   * Fresh matter (a just-tapped seed or clump of seeds) is judged only after this many steps of
   * detector age, so the player sees it try to organise first.
   */
  MIN_AGE: 60,
} as const;

export type RunawayReason = 'oversize' | 'growth' | 'swarm';

export interface RunawayErase {
  x: number;
  y: number;
  radius: number;
}

export interface RunawayStart {
  id: number;
  x: number;
  y: number;
  mass: number;
  radius: number;
  reason: RunawayReason;
}

const HIST = 16;
const ascending = (a: number, b: number): number => a - b;

interface Track {
  id: number;
  /** Ring of (step, mass, localMass). */
  step: Float64Array;
  mass: Float64Array;
  local: Float64Array;
  head: number;
  count: number;
  seenAt: number;
  /** Step of the last flag (−Infinity: never). */
  flaggedAt: number;
  /** Consecutive updates the oversize signal held. */
  runOver: number;
}

/** Result of one update (arrays are reused by the next call: copy what you keep). */
export interface RunawayResult {
  erase: RunawayErase[];
  started: RunawayStart[];
  /** Reference mass used this update. */
  refMass: number;
}

export class RunawayWatch {
  private tracks = new Map<number, Track>();
  private pool: Track[] = [];
  private eraseBuf: RunawayErase[] = [];
  private startBuf: RunawayStart[] = [];
  private result: RunawayResult = { erase: [], started: [], refMass: 0 };
  private masses: number[] = [];
  private sweepStep = 0;
  /** Drops a track not seen this update (bound once: no closure per update). */
  private readonly sweep = (t: Track, id: number): void => {
    if (t.seenAt !== this.sweepStep) {
      this.tracks.delete(id);
      this.pool.push(t);
    }
  };

  reset(): void {
    for (const t of this.tracks.values()) this.pool.push(t);
    this.tracks.clear();
  }

  /**
   * @param report the detector report of this update
   * @param snap   the snapshot it was computed from (local mass around components)
   * @param params the simulation's params (R plus μ, σ, rings for the catalog reference), or just R
   * @param dish   round dish, or null/undefined on the torus (wrapped distances); defaults to snap.dish
   */
  update(
    report: DetectorReport,
    snap: FieldSnapshot,
    params: number | Pick<LeniaParams, 'R' | 'mu' | 'sigma' | 'rings'>,
    dish?: DishShape | null,
  ): RunawayResult {
    const R = typeof params === 'number' ? params : params.R;
    const res = this.result;
    res.erase = this.eraseBuf;
    res.started = this.startBuf;
    res.erase.length = 0;
    res.started.length = 0;
    const step = report.step;
    const d = dish ?? (snap as FieldSnapshot & { dish?: DishShape | null }).dish ?? null;

    const overgrown = report.fill >= RUNAWAY.OVERGROWN_FILL;
    const minMass = RUNAWAY.MIN_MASS_R2 * R * R;

    // Pass 1: record every component in its track.
    for (const c of report.creatures) {
      if (c.state === 'dead' || c.mass < minMass) continue;
      let t = this.tracks.get(c.id);
      if (!t) {
        t = this.pool.pop() ?? {
          id: 0,
          step: new Float64Array(HIST),
          mass: new Float64Array(HIST),
          local: new Float64Array(HIST),
          head: 0,
          count: 0,
          seenAt: 0,
          flaggedAt: -Infinity,
          runOver: 0,
        };
        t.id = c.id;
        t.head = 0;
        t.count = 0;
        t.flaggedAt = -Infinity;
        t.runOver = 0;
        this.tracks.set(c.id, t);
      }
      t.seenAt = step;
      t.step[t.head] = step;
      t.mass[t.head] = c.mass;
      t.local[t.head] = localMass(snap, c.x, c.y, RUNAWAY.SWARM_RADIUS_R * R, d);
      t.head = (t.head + 1) % HIST;
      if (t.count < HIST) t.count++;
    }

    // Reference mass: median over stable creatures of their lightest mass in the window (a stable
    // creature that is itself swelling must not raise the bar), else the calibration's catalog mass.
    const ms = this.masses;
    ms.length = 0;
    for (const c of report.creatures) {
      if (c.state !== 'stable') continue;
      const t = this.tracks.get(c.id);
      if (t) ms.push(windowMin(t, step));
    }
    let ref = typeof params === 'number' ? RUNAWAY.REF_MASS_R2 * R * R : catalogReferenceMass(params);
    if (ms.length) {
      ms.sort(ascending);
      ref = ms[ms.length >> 1];
    }
    res.refMass = ref;

    // Pass 2: signals.
    let flaggedNow = 0;
    for (const c of report.creatures) {
      if (c.state === 'dead' || c.mass < minMass) continue;
      const t = this.tracks.get(c.id);
      if (!t || step - t.flaggedAt < RUNAWAY.REFLAG_STEPS) continue;
      // Recent maximum (oversize: is the blob shedding?).
      const cur = (t.head - 1 + HIST) % HIST;
      let maxRecent = 0;
      for (let k = 1; k < t.count; k++) {
        const i = (cur - k + HIST) % HIST;
        if (step - t.step[i] > RUNAWAY.OVERSIZE_SPAN) break;
        if (t.mass[i] > maxRecent) maxRecent = t.mass[i];
      }
      const over = c.state !== 'stable' && c.mass >= RUNAWAY.OVERSIZE_K * ref && c.mass >= RUNAWAY.OVERSIZE_HOLD * maxRecent;
      t.runOver = over ? t.runOver + 1 : 0;
      const grow = c.mass >= RUNAWAY.GROWTH_MIN_K * ref && sustainedGain(t, t.mass, step) >= RUNAWAY.GROWTH_GAIN;
      const swarm = t.local[cur] >= RUNAWAY.SWARM_MASS_K * ref && sustainedGain(t, t.local, step) >= RUNAWAY.SWARM_GAIN;
      if (overgrown || flaggedNow >= RUNAWAY.MAX_PER_UPDATE || c.age < RUNAWAY.MIN_AGE) continue;
      let reason: RunawayReason | null = null;
      if (grow) reason = 'growth';
      else if (swarm) reason = 'swarm';
      else if (t.runOver >= RUNAWAY.PERSIST) reason = 'oversize';
      if (!reason) continue;
      t.flaggedAt = step;
      t.runOver = 0;
      flaggedNow++;
      res.erase.push({ x: c.x, y: c.y, radius: RUNAWAY.ERASE_K * c.radius + RUNAWAY.ERASE_PAD_R * R });
      res.started.push({ id: c.id, x: c.x, y: c.y, mass: c.mass, radius: c.radius, reason });
    }
    // Forget tracks the detector no longer reports.
    this.sweepStep = step;
    this.tracks.forEach(this.sweep);
    return res;
  }
}

/** Lightest mass a track had within the reference window (including now). */
function windowMin(t: Track, step: number): number {
  let m = Infinity;
  for (let k = 0; k < t.count; k++) {
    const i = (t.head - 1 - k + HIST * 2) % HIST;
    if (step - t.step[i] > RUNAWAY.REF_WINDOW) break;
    if (t.mass[i] < m) m = t.mass[i];
  }
  return m;
}

/**
 * Gain of a series (mass or local mass) over the last GROWTH_SPAN steps, provided it rose at every
 * update in between and no rise was a merge jump (> JUMP per 10 steps); 0 otherwise or when the
 * history does not reach that far back.
 */
function sustainedGain(t: Track, v: Float64Array, step: number): number {
  const cur = (t.head - 1 + HIST) % HIST;
  let i = cur;
  for (let k = 1; k < t.count; k++) {
    const j = (cur - k + HIST) % HIST;
    const dt = t.step[i] - t.step[j];
    const r = v[j] > 0 ? v[i] / v[j] : Infinity;
    if (dt <= 0 || r < 1 || r > Math.pow(RUNAWAY.JUMP, dt / 10)) return 0;
    if (step - t.step[j] >= RUNAWAY.GROWTH_SPAN) return v[cur] / v[j];
    i = j;
  }
  return 0;
}

const refCache = new Map<string, number>();

/**
 * Heaviest catalog species that can live at this calibration (the nearest three with the same ring
 * count within CATALOG_REACH), scaled to R: the reference before any creature is stable.
 */
export function catalogReferenceMass(p: Pick<LeniaParams, 'R' | 'mu' | 'sigma' | 'rings'>): number {
  const key = `${p.R}|${p.mu}|${p.sigma}|${p.rings.length}`;
  let m = refCache.get(key);
  if (m !== undefined) return m;
  const near = CATALOG.filter((e) => e.b.length === p.rings.length)
    .map((e) => ({ e, d: Math.hypot((p.mu - e.m) / 0.03, (p.sigma - e.s) / 0.006) }))
    .sort((a, b) => a.d - b.d)
    .filter((x, i) => i === 0 || x.d <= RUNAWAY.CATALOG_REACH)
    .slice(0, 3);
  m = RUNAWAY.REF_MASS_R2 * p.R * p.R;
  if (near.length) {
    m = 0;
    for (const { e } of near) {
      let sum = 0;
      for (const v of catalogPattern(e.code).data) sum += v;
      m = Math.max(m, sum * (p.R / e.R) ** 2);
    }
  }
  if (refCache.size > 64) refCache.clear();
  refCache.set(key, m);
  return m;
}

/** Matter (grid units) within `radius` cells of (x, y), from the snapshot blocks; wraps on the torus. */
export function localMass(snap: FieldSnapshot, x: number, y: number, radius: number, dish: DishShape | null): number {
  const { w, h, scale, value } = snap;
  const rb = radius / scale;
  const bx = x / scale - 0.5;
  const by = y / scale - 0.5;
  const x0 = Math.floor(bx - rb);
  const x1 = Math.ceil(bx + rb);
  const y0 = Math.floor(by - rb);
  const y1 = Math.ceil(by + rb);
  const r2 = rb * rb;
  let m = 0;
  for (let j = y0; j <= y1; j++) {
    const dy = j - by;
    let jj = j;
    if (jj < 0 || jj >= h) {
      if (dish) continue;
      jj = ((jj % h) + h) % h;
    }
    const row = jj * w;
    for (let i = x0; i <= x1; i++) {
      const dx = i - bx;
      if (dx * dx + dy * dy > r2) continue;
      let ii = i;
      if (ii < 0 || ii >= w) {
        if (dish) continue;
        ii = ((ii % w) + w) % w;
      }
      m += value[row + ii];
    }
  }
  return m * scale * scale;
}
