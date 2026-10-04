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

export interface ProductionResult {
  /** Essence per second (before timed buffs). */
  total: number;
  /** Essence per second of each paying creature. */
  per: Map<number, number>;
  /** Creatures currently in a symbiotic pair. */
  symbiotic: number;
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
  const items: { c: Creature; group: string; yield: number; sym: boolean }[] = [];
  for (const c of creatures) {
    if (c.state !== 'stable') continue; // born / exploded / dead pay 0
    const comp = Math.min(Math.max(0, Number.isFinite(c.complexity) ? c.complexity : 0), B.COMPLEXITY_CAP) * ctx.complexityMult;
    const sp = ctx.speciesOf(c.id);
    const y = comp * ctx.behaviorMult(c.behavior) * (sp ? sp.mult : 1);
    items.push({ c, group: sp ? sp.id : `#${c.id}`, yield: y, sym: false });
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
    g.forEach((it, k) => (it.yield *= Math.pow(B.SAME_SPECIES_DECAY, k)));
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
    const v = it.yield * (it.sym ? B.SYMBIOSIS_MULT : 1) * ctx.globalMult;
    per.set(it.c.id, v);
    total += v;
  }
  return { total, per, symbiotic };
}
