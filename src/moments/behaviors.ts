/**
 * What each behaviour means, for the player (pure data, no DOM).
 *
 * Owner: "you must explain what 'nadadora' means… what changes?". Every
 * behaviour answers four questions, kid-simple:
 *
 *   Qué es               what you see ("se desliza sin parar")
 *   Qué cambia           the exact bonus, read from src/game/balance.ts BEHAVIOR_MULT
 *                        ("Nadadora: ×1,6 Esencia", compared with "Quieta: ×1")
 *   Dónde encontrarla    which World grows it (src/game/worlds.ts): the example is a
 *                        species that lives in a world and shows that behaviour (no
 *                        rules or numbers: the player picks worlds, not parameters)
 *   Cómo mejorarla       its research-tree node (src/game/tree.ts: Nadadoras,
 *                        Tranquilas, Familias), +15 % per level (cycleBalance.ts)
 *
 * plus an honest note where it matters (dividers can overflow the dish; what
 * "close together" means for a colony) and a hint for the silhouettes of the
 * behaviours not seen yet. Used by the behaviour Momentos, the Behaviour Guide
 * sheet, the species card and the creature status pills.
 */
import type { Behavior, Lang, Text } from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { BEHAVIOR_MULT } from '../game/balance';
import { AFFINITY_TREE_BONUS } from '../game/cycleBalance';
import { BEHAVIOR_NAMES } from '../game/content';
import { WORLD_TEXT } from '../game/treeText';
import { WORLD_BY_ID, type WorldId } from '../game/worlds';

const t = (es: string, en: string): Text => ({ es, en });

export const BEHAVIOR_ORDER: readonly Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

export type AffinityId = 'swimAffinity' | 'stillAffinity' | 'colonyAffinity';

/**
 * Which research-tree node boosts which behaviour (src/game/tree.ts affinity: swim / still / colony;
 * the game's behaviorMult: swimmer/spinner → swim, divider/colony → colony, still/pulsing/unclassified
 * → still). A test checks the nodes exist and their texts name these behaviours.
 */
export const AFFINITY_OF: Record<Behavior | 'none', AffinityId> = {
  swimmer: 'swimAffinity',
  spinner: 'swimAffinity',
  divider: 'colonyAffinity',
  colony: 'colonyAffinity',
  still: 'stillAffinity',
  pulsing: 'stillAffinity',
  none: 'stillAffinity',
};

/** The same booster in the classic Lab (before the research tree): looked up when the tree node is absent. */
export const LEGACY_AFFINITY: Record<AffinityId, string> = {
  swimAffinity: 'swimAffinity',
  stillAffinity: 'sessileAffinity',
  colonyAffinity: 'colonyAffinity',
};

/**
 * Colony rule as the detector applies it (src/detect/detector.ts, colony pass):
 * at least COLONY_MIN stable creatures of the same species, each within
 * COLONY_DIST_R × R of another. GDD §9.
 */
export const COLONY_MIN = 3;
export const COLONY_DIST_R = 3;

export interface BehaviorExample {
  /** Catalog code and Latin name of a species that does it (the Bestiary shows its common name once found). */
  code: string;
  name: string;
  /** The World that grows it. */
  world: WorldId;
}

/**
 * Where to find each behaviour (docs/CLARIDAD.md J-01…J-05): the world named in the "how" line, and a
 * species of that world. Still/pulsing: Circium ventilans (Mundo 5, it breathes in place); spinner:
 * Gyrorbium gyrans (Mundo 3); divider: Parorbium dividuus (Mundo 3); swimmer: Orbium (Mundo 1).
 * Colony is three alike together: any species.
 */
const EXAMPLE_OF: Partial<Record<Behavior, { code: string; world: WorldId }>> = {
  still: { code: 'C0v', world: 'helix' },
  pulsing: { code: 'C0v', world: 'helix' },
  swimmer: { code: 'O2u', world: 'classic' },
  spinner: { code: 'OG2g', world: 'gyro' },
  divider: { code: 'O4d', world: 'gyro' },
};

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
    how: t('En el Mundo 2 · Frío vive un anillo que no se mueve.', 'In World 2 · Cold lives a ring that never moves.'),
    hint: t('¿Has visto alguna que no se mueva?', 'Seen one that never moves?'),
  },
  pulsing: {
    what: t('Se hace grande y pequeña una y otra vez, como un corazón.', 'It grows and shrinks again and again, like a heartbeat.'),
    see: t('crece y encoge', 'grows and shrinks'),
    how: t('El anillo del Mundo 2 · Frío a veces late como un corazón.', 'The ring of World 2 · Cold sometimes beats like a heart.'),
    hint: t('¿Has visto alguna latir como un corazón?', 'Seen one beat like a heart?'),
  },
  swimmer: {
    what: t('Se desliza por la placa sin parar, siempre hacia delante.', 'It glides across the dish nonstop, always forward.'),
    see: t('se desliza sin parar', 'glides nonstop'),
    how: t('Casi todas nadan. Empieza en el Mundo 1 · Clásico.', 'Most of them swim. Start in World 1 · Classic.'),
    hint: t('¿Has visto alguna nadar?', 'Seen one swim?'),
  },
  spinner: {
    what: t('Da vueltas y vueltas en círculo, casi sin salir de su sitio.', 'It goes round and round in circles, almost in place.'),
    see: t('da vueltas', 'goes round'),
    how: t('En el Mundo 3 · Remolinos nace una que gira.', 'In World 3 · Whirls one is born that spins.'),
    hint: t('¿Has visto alguna girar?', 'Seen one spin?'),
  },
  divider: {
    what: t('Se parte en dos, y cada hija vuelve a partirse.', 'It splits in two, and each child splits again.'),
    see: t('se parte en dos', 'splits in two'),
    how: t('En el Mundo 3 · Remolinos vive una que se parte en dos.', 'In World 3 · Whirls lives one that splits in two.'),
    hint: t('¿Has visto alguna partirse en dos?', 'Seen one split in two?'),
    note: {
      kind: 'risk',
      text: t('Si se dividen demasiado, la placa se desborda y deja de dar Esencia.', 'If they split too much, the dish overflows and stops giving Essence.'),
    },
  },
  colony: {
    what: t('Varias iguales viven muy juntas y ganan más en equipo.', 'Several alike live close together and earn more as a team.'),
    see: t('iguales y juntas', 'alike and together'),
    how: t('Siembra o copia tres iguales muy juntas.', 'Sow or copy three alike, close together.'),
    hint: t('¿Has juntado tres iguales?', 'Put three alike together?'),
    note: {
      kind: 'rule',
      // COLONY_DIST_R × R between centres ≈ less than two bodies apart (a body is about 1.5 R wide).
      text: t(`${COLONY_MIN} o más de la misma especie, a menos de dos cuerpos.`, `${COLONY_MIN} or more of one species, less than two bodies apart.`),
    },
  },
};

/** A species that does `b` and the World that grows it (only species some world can grow). */
export function behaviorExample(b: Behavior): BehaviorExample | null {
  const e = EXAMPLE_OF[b];
  if (!e || !WORLD_BY_ID[e.world]?.species.includes(e.code)) return null;
  const r = CATALOG_REFS.find((x) => x.code === e.code);
  return r ? { code: r.code, name: r.name, world: e.world } : null;
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

/** "+15 % por nivel" / "+15% per level" (the research-tree affinity nodes, cycleBalance.ts). */
export function affinityStepText(lang: Lang): string {
  const p = Math.round(AFFINITY_TREE_BONUS * 100);
  return lang === 'es' ? `+${p} % por nivel` : `+${p}% per level`;
}

/** "Mundo 1 · Clásico" / "World 1 · Classic": where the example lives. */
export function exampleWorldText(e: BehaviorExample, lang: Lang): string {
  return WORLD_TEXT[e.world]?.name[lang] ?? '';
}
