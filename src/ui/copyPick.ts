/**
 * The «Copiar» button of the seed pill (ADR-030, docs/CLARIDAD2.md §2.12, QA-CLARIDAD #39): a bought
 * Copiadora shows where it is used. The button opens a strip with the species of this world in the
 * collection (the game says what each copy costs now, SpeciesView.copyCost); a tap enters the copy mode
 * («Toca dónde poner la copia»). With none of this world yet, it stays, greyed out, and says why.
 * Pure: ui.ts draws it.
 */
import type { GameView, Text } from '../core/types';

/** The slice of the view the button reads. */
export interface CopyPickView {
  cycle?: GameView['cycle'];
  research?: { levels: Record<string, number> } | null;
  session?: { phase: 'ready' | 'running' | 'over' } | null;
  species: readonly { id: string; name: string; hue?: number; copyCost?: number | null; copyBlocked?: 'noCopier' | 'noSession' | 'otherWorld' | null }[];
}

export interface CopyPick {
  /** The Copiadora is bought and a session is on the dish. */
  show: boolean;
  /** Some species of this world can be copied now. */
  enabled: boolean;
  /** Copyable species, in Bestiary order: `cost` in Luz (0 = the Archivo's free copy). */
  species: { id: string; name: string; hue?: number; cost: number }[];
  /** Why it is greyed out (null when enabled). */
  reason: Text | null;
}

/** «Copiar · ninguna de este mundo todavía» (§2.12). */
export const COPY_NONE: Text = { es: 'Copiar · ninguna de este mundo todavía', en: 'Copy · none from this world yet' };

export function copyPick(v: CopyPickView): CopyPick {
  const owned = v.cycle === 'sessions' && (v.research?.levels.print ?? 0) > 0;
  const live = !!v.session && v.session.phase !== 'over';
  if (!owned || !live) return { show: false, enabled: false, species: [], reason: null };
  const species: CopyPick['species'] = [];
  for (const s of v.species) {
    const cost = s.copyCost;
    if (cost === null || cost === undefined || !Number.isFinite(cost)) continue;
    species.push({ id: s.id, name: s.name, hue: s.hue, cost: Math.max(0, cost) });
  }
  return { show: true, enabled: species.length > 0, species, reason: species.length ? null : COPY_NONE };
}
