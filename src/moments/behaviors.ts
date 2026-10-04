/**
 * What each behaviour means, for the player (pure data, no DOM).
 *
 * Owner: "you must explain what 'nadadora' means… what changes?". Every
 * behaviour answers four questions, kid-simple:
 *
 *   Qué es               what you see ("se desliza sin parar")
 *   Qué cambia           the exact bonus, read from src/game/balance.ts BEHAVIOR_MULT
 *                        ("Nadadora: ×1,6 Esencia", compared with "Quieta: ×1")
 *   Cómo conseguir más   which rules/shapes tend to do it; the catalog example is
 *                        the viable species with that behaviour (as the detector
 *                        measures it, src/detect/catalogSignatures.json) nearest
 *                        to the starting rules
 *   Cómo mejorarla       its Afinidad upgrade (src/game/defs.ts) and, later, tree nodes
 *
 * plus an honest note where it matters (dividers can overflow the dish; what
 * "close together" means for a colony) and a hint for the silhouettes of the
 * behaviours not seen yet. Used by the behaviour Momentos, the Behaviour Guide
 * sheet, the species card and the creature status pills.
 */
import type { Behavior, Lang, Text } from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { AFFINITY_BONUS, BASE_CALIBRATION, BEHAVIOR_MULT } from '../game/balance';
import { BEHAVIOR_NAMES } from '../game/content';

const t = (es: string, en: string): Text => ({ es, en });

export const BEHAVIOR_ORDER: readonly Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

export type AffinityId = 'swimAffinity' | 'sessileAffinity' | 'colonyAffinity';

/**
 * Which Afinidad boosts which behaviour. Mirrors src/game/game.ts behaviorMult
 * (swimmer/spinner → swim, divider/colony → colony, still/pulsing/unclassified →
 * sessile); a test checks the upgrades exist and their texts name these behaviours.
 */
export const AFFINITY_OF: Record<Behavior | 'none', AffinityId> = {
  swimmer: 'swimAffinity',
  spinner: 'swimAffinity',
  divider: 'colonyAffinity',
  colony: 'colonyAffinity',
  still: 'sessileAffinity',
  pulsing: 'sessileAffinity',
  none: 'sessileAffinity',
};

/**
 * Colony rule as the detector applies it (src/detect/detector.ts, colony pass):
 * at least COLONY_MIN stable creatures of the same species, each within
 * COLONY_DIST_R × R of another. GDD §9.
 */
export const COLONY_MIN = 3;
export const COLONY_DIST_R = 3;

export interface BehaviorExample {
  code: string;
  name: string;
  mu: number;
  sigma: number;
}

export interface BehaviorGuide {
  behavior: Behavior;
  /** "Nadadora" (capitalised, from the game's behaviour names). */
  name: Text;
  /** Qué es: what you see. ≤ 14 words. */
  what: Text;
  /** Two or three words for small places ("se desliza sin parar"). */
  see: Text;
  /** Cómo conseguir más. ≤ 14 words. */
  how: Text;
  /** A catalog species that does it, nearest to the starting rules (null if none in the catalog). */
  example: BehaviorExample | null;
  /** Honest extra: a risk (divider) or the rule (colony). */
  note: { kind: 'risk' | 'rule'; text: Text } | null;
  /** Silhouette hint while not seen yet ("¿Has visto alguna girar?"). */
  hint: Text;
  affinity: AffinityId;
  /** Production multiplier m_comp (balance.ts). */
  mult: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TEXT: Record<Behavior, Pick<BehaviorGuide, 'what' | 'see' | 'how' | 'hint'> & { note?: BehaviorGuide['note'] }> = {
  still: {
    what: t('No se mueve: se queda siempre en el mismo sitio.', 'It does not move: it always stays in the same spot.'),
    see: t('no se mueve', 'never moves'),
    how: t('Con μ y σ altos salen formas que no se mueven.', 'High μ and σ give shapes that do not move.'),
    hint: t('¿Has visto alguna que no se mueva?', 'Seen one that never moves?'),
  },
  pulsing: {
    what: t('Se hace grande y pequeña una y otra vez, como un corazón.', 'It grows and shrinks again and again, like a heartbeat.'),
    see: t('crece y encoge', 'grows and shrinks'),
    how: t('Formas redondas que respiran: búscalas con μ y σ altos.', 'Round shapes that breathe: look for them with high μ and σ.'),
    hint: t('¿Has visto alguna latir como un corazón?', 'Seen one beat like a heart?'),
  },
  swimmer: {
    what: t('Se desliza por la placa sin parar, siempre hacia delante.', 'It glides across the dish nonstop, always forward.'),
    see: t('se desliza sin parar', 'glides nonstop'),
    how: t('Formas de disco con cola, con las reglas del principio.', 'Disc-with-a-tail shapes, with the starting rules.'),
    hint: t('¿Has visto alguna nadar?', 'Seen one swim?'),
  },
  spinner: {
    what: t('Da vueltas y vueltas en círculo, casi sin salir de su sitio.', 'It goes round and round in circles, almost in place.'),
    see: t('da vueltas', 'goes round'),
    how: t('Sube σ un poquito: algunos discos empiezan a girar.', 'Raise σ a little: some discs start to spin.'),
    hint: t('¿Has visto alguna girar?', 'Seen one spin?'),
  },
  divider: {
    what: t('Se parte en dos, y cada hija vuelve a partirse.', 'It splits in two, and each child splits again.'),
    see: t('se parte en dos', 'splits in two'),
    how: t('Con σ algo alto, algunas crecen y se parten en dos.', 'With a fairly high σ, some grow and split in two.'),
    hint: t('¿Has visto alguna partirse en dos?', 'Seen one split in two?'),
    note: {
      kind: 'risk',
      text: t('Si se dividen demasiado, la placa se desborda y deja de producir.', 'If they split too much, the dish overflows and stops producing.'),
    },
  },
  colony: {
    what: t('Varias iguales viven muy juntas y ganan más en equipo.', 'Several alike live close together and earn more as a team.'),
    see: t('iguales y juntas', 'alike and together'),
    how: t('Siembra o imprime varias de la misma especie muy juntas.', 'Sow or print several of the same species close together.'),
    hint: t('¿Has juntado tres iguales?', 'Put three alike together?'),
    note: {
      kind: 'rule',
      text: t(
        `${COLONY_MIN} o más de la misma especie, a menos de ${COLONY_DIST_R} R entre sí.`,
        `${COLONY_MIN} or more of one species, within ${COLONY_DIST_R} R of each other.`,
      ),
    },
  },
};

/** Viable catalog species the detector classes as `b`, nearest to the starting rules. */
export function behaviorExample(b: Behavior): BehaviorExample | null {
  const base = BASE_CALIBRATION;
  let best: BehaviorExample | null = null;
  let bd = Infinity;
  for (const r of CATALOG_REFS) {
    if (!r.viable || r.behavior !== b) continue;
    // Distance in "slider steps": μ and σ relative to their starting values.
    const d = Math.hypot((r.mu - base.mu) / base.mu, (r.sigma - base.sigma) / base.sigma) + Math.abs(r.R - base.R);
    if (d < bd) {
      bd = d;
      best = { code: r.code, name: r.name, mu: r.mu, sigma: r.sigma };
    }
  }
  return best;
}

const cache = new Map<Behavior, BehaviorGuide>();

export function behaviorGuide(b: Behavior): BehaviorGuide {
  let g = cache.get(b);
  if (!g) {
    const tx = TEXT[b];
    g = {
      behavior: b,
      name: { es: cap(BEHAVIOR_NAMES[b].es), en: cap(BEHAVIOR_NAMES[b].en) },
      what: tx.what,
      see: tx.see,
      how: tx.how,
      example: behaviorExample(b),
      note: tx.note ?? null,
      hint: tx.hint,
      affinity: AFFINITY_OF[b],
      mult: BEHAVIOR_MULT[b],
    };
    cache.set(b, g);
  }
  return g;
}

/** "×1,6" / "×1.6" (one decimal, the locale's mark). */
export function multText(m: number, lang: Lang): string {
  const s = (Math.round(m * 10) / 10).toFixed(1);
  return '×' + (lang === 'es' ? s.replace('.', ',') : s);
}

/** "Nadadora: ×1,6 Esencia". */
export function bonusText(b: Behavior, lang: Lang): string {
  return `${behaviorGuide(b).name[lang]}: ${multText(BEHAVIOR_MULT[b], lang)} ${lang === 'es' ? 'Esencia' : 'Essence'}`;
}

/** "comparada con una quieta ×1" / "compared with a still one ×1". */
export function baselineText(lang: Lang): string {
  const m = multText(BEHAVIOR_MULT.still, lang).replace(/[.,]0$/, '');
  return lang === 'es' ? `comparada con una quieta ${m}` : `compared with a still one ${m}`;
}

/** "+8 % por nivel" / "+8% per level" (Afinidad bonus from balance). */
export function affinityStepText(lang: Lang): string {
  const p = Math.round(AFFINITY_BONUS * 100);
  return lang === 'es' ? `+${p} % por nivel` : `+${p}% per level`;
}

/** "μ 0,15 · σ 0,015" (the slider values to try; trailing zeros trimmed). */
export function exampleParamsText(e: BehaviorExample, lang: Lang): string {
  const f = (v: number, d: number) => {
    const s = v.toFixed(d).replace(/0+$/, '').replace(/\.$/, '');
    return lang === 'es' ? s.replace('.', ',') : s;
  };
  return `μ ${f(e.mu, 3)} · σ ${f(e.sigma, 4)}`;
}
