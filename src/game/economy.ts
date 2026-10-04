/**
 * Essence production (doc §5 with brief corrections 5–6). Pure: no state, no time.
 *
 *   P = M_global · Σ_stable  min(complexity, cap)·nutrient · m_comp(behaviour)·affinity · m_esp(species)
 *                            · 0.85^k (k-th of its species) · symbiosis
 */
import type { Behavior, Creature } from '../core/types';
import * as B from './balance';

export interface ProductionCtx {
  /** Species id and its m_esp for a creature, or null if unregistered. */
  speciesOf(creatureId: number): { id: string; mult: number } | null;
  /** m_comp × affinity for a behaviour (null = not yet classified). */
  behaviorMult(b: Behavior | null): number;
  /** Nutriente multiplier on measured complexity (applied after the cap). */
  complexityMult: number;
  globalMult: number;
  symbiosis: boolean;
  R: number;
  gridW: number;
  gridH: number;
}

/** Why a creature pays what it pays (all multipliers; their product × global = eps). */
export interface YieldDetail {
  /** Measured complexity after the cap, × Nutriente (× BORN_PAY while still forming). */
  complexity: number;
  /** m_comp × affinity of its behaviour (unclassified pays as still). */
  behaviorMult: number;
  /** m_esp: rarity × Catalogación (1 while unregistered). */
  speciesMult: number;
  /** 0.85^k: the k-th creature of the same species pays less. */
  diminishing: number;
  /** ×1.5 in a symbiotic pair, else 1. */
  symbiosis: number;
}

export interface ProductionResult {
  /** Essence per second (before timed buffs). */
  total: number;
  /** Essence per second of each paying creature. */
  per: Map<number, number>;
  /** Creatures currently in a symbiotic pair. */
  symbiotic: number;
  /** The factors behind `per`, by creature. */
  detail: Map<number, YieldDetail>;
}

/** Toroidal distance between two grid points. */
export function wrapDist(ax: number, ay: number, bx: number, by: number, w: number, h: number): number {
  let dx = Math.abs(ax - bx) % w;
  let dy = Math.abs(ay - by) % h;
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return Math.hypot(dx, dy);
}

export function computeProduction(creatures: readonly Creature[], ctx: ProductionCtx): ProductionResult {
  const per = new Map<number, number>();
  const detail = new Map<number, YieldDetail>();
  const items: { c: Creature; group: string; yield: number; sym: boolean; d: YieldDetail }[] = [];
  for (const c of creatures) {
    // Exploded / dead pay 0. A forming ('born') creature pays BORN_PAY once it held together for
    // BORN_PAY_MIN_AGE steps (0 = off: the hard gate "only stable creatures pay", see balance.ts).
    let share = 1;
    if (c.state === 'born') {
      if (!(B.BORN_PAY > 0) || !(c.age >= B.BORN_PAY_MIN_AGE)) continue;
      share = B.BORN_PAY;
    } else if (c.state !== 'stable') continue;
    const comp = Math.min(Math.max(0, Number.isFinite(c.complexity) ? c.complexity : 0), B.COMPLEXITY_CAP) * ctx.complexityMult * share;
    const sp = c.state === 'stable' ? ctx.speciesOf(c.id) : null;
    const bm = ctx.behaviorMult(c.state === 'stable' ? c.behavior : null);
    const sm = sp ? sp.mult : 1;
    const d: YieldDetail = { complexity: comp, behaviorMult: bm, speciesMult: sm, diminishing: 1, symbiosis: 1 };
    items.push({ c, group: sp ? sp.id : `#${c.id}`, yield: comp * bm * sm, sym: false, d });
  }
  // Diminishing returns: within a species the best creature pays full, the next ×0.85, …
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    let g = groups.get(it.group);
    if (!g) groups.set(it.group, (g = []));
    g.push(it);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => b.yield - a.yield);
    g.forEach((it, k) => {
      it.d.diminishing = Math.pow(B.SAME_SPECIES_DECAY, k);
      it.yield *= it.d.diminishing;
    });
  }
  let symbiotic = 0;
  if (ctx.symbiosis) {
    const d2 = B.SYMBIOSIS_DIST * ctx.R;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.group === b.group || a.group.startsWith('#') || b.group.startsWith('#')) continue;
        if (wrapDist(a.c.x, a.c.y, b.c.x, b.c.y, ctx.gridW, ctx.gridH) <= d2) a.sym = b.sym = true;
      }
    }
  }
  let total = 0;
  for (const it of items) {
    if (it.sym) symbiotic++;
    it.d.symbiosis = it.sym ? B.SYMBIOSIS_MULT : 1;
    const v = it.yield * it.d.symbiosis * ctx.globalMult;
    per.set(it.c.id, v);
    detail.set(it.c.id, it.d);
    total += v;
  }
  return { total, per, symbiotic, detail };
}
