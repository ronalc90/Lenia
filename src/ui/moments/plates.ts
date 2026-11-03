/**
 * Momentos as scientific plates (docs/ARTE-REALISTA.md §6.5): a fixed plate number per IllustrationKind
 * ("LÁMINA 07"), so the player collects them in «¿Qué pasó?»; three panels a/b/c in time order (stills of the
 * same real simulation the card animates); a 1-px leader line to the feature; a scale bar (1 cell = 0.7 mm,
 * PLATE_MM_PER_CELL); a colour key where every colour also has a shape. Pure data and pure helpers: the card
 * frame (momentsUI.ts) draws it, the session report names today's plates with it.
 *
 * Numbers 01–24 follow the §6.5 table (golden 14, clock 18, seedPrice 19); `division` (before → after) sits with
 * the other before/after plates at 21. 25 and 26 are kept for the clarity pass's Momentos (collecting the light,
 * steering a swimmer, docs/CLARIDAD2.md §5.5), which PC adds to IllustrationKind.
 */
import type { Lang, Text } from '../../core/types';
import type { IllustrationKind } from '../../moments/types';
import { PLATE_MM_PER_CELL } from '../art/tokens';

const t = (es: string, en: string): Text => ({ es, en });

/** Every kind a plate can have: today's 24, plus the two the clarity pass adds. */
export type PlateKind = IllustrationKind | 'collect' | 'steer';

/** One entry of the colour key: a colour AND a shape, so meaning never hangs on colour alone (F3). */
export type PlateKey = 'alive' | 'forming' | 'shapeless' | 'fading' | 'light' | 'danger' | 'cost' | 'gain' | 'spark';

export interface PlateLeader {
  /** The feature, in the 260 × 140 box of the diagram. */
  x: number;
  y: number;
  /** Where the label sits (box units, its anchor corner) and its words. */
  lx: number;
  ly: number;
  text: Text;
}

export interface PlateDef {
  no: number;
  title: Text;
  /** a / b / c: when each still is taken, as a share of the diagram's loop (time order). */
  panels: readonly number[];
  /** The microscope part of the diagram (box units) the stills show: x, y, w, h. */
  crop: readonly [number, number, number, number];
  /** Pixels of the 260-box per simulation cell in the diagram's microscope panel (for the scale bar). */
  pxPerCell: number;
  key: readonly PlateKey[];
  leader?: PlateLeader;
}

const WHOLE = [0, 0, 260, 140] as const;
/** The outcome diagrams (outcome() in illustrations.ts): one 120-px panel at (12, 10). */
const OUTCOME = [12, 10, 120, 120] as const;
const CENTRE_PANEL = [70, 10, 120, 120] as const;
const WIDE_PANEL = [6, 8, 248, 124] as const;

export const PLATES: Record<PlateKind, PlateDef> = {
  seed: { no: 1, title: t('Siembra', 'Sowing'), panels: [0.08, 0.4, 0.8], crop: [177, 8, 74, 74], pxPerCell: 74 / 40, key: ['forming', 'alive', 'fading'], leader: { x: 214, y: 45, lx: 150, ly: 128, text: t('ruido asimétrico', 'uneven noise') } },
  dissolve: { no: 2, title: t('Disolución', 'Dissolving'), panels: [0.08, 0.45, 0.8], crop: OUTCOME, pxPerCell: 120 / 44, key: ['forming', 'fading'], leader: { x: 72, y: 70, lx: 140, ly: 132, text: t('demasiado poca', 'too little') } },
  explode: { no: 3, title: t('Fusión', 'Merging'), panels: [0.08, 0.45, 0.8], crop: OUTCOME, pxPerCell: 120 / 64, key: ['alive', 'shapeless', 'danger'], leader: { x: 72, y: 70, lx: 140, ly: 132, text: t('sin forma', 'shapeless') } },
  stable: { no: 4, title: t('Criatura estable', 'A stable creature'), panels: [0.08, 0.45, 0.8], crop: OUTCOME, pxPerCell: 120 / 44, key: ['forming', 'alive'], leader: { x: 92, y: 52, lx: 140, ly: 132, text: t('borde', 'edge') } },
  essence: { no: 5, title: t('Luz', 'Glow'), panels: [0.2, 0.6, 0.95], crop: [10, 14, 112, 112], pxPerCell: 112 / 40, key: ['alive', 'light'] },
  species: { no: 6, title: t('Especie nueva', 'New species'), panels: [0.15, 0.4, 0.85], crop: [10, 14, 112, 112], pxPerCell: 112 / 40, key: ['alive', 'gain'] },
  compare: { no: 7, title: t('Dos especies', 'Two species'), panels: [0.25, 0.75], crop: WHOLE, pxPerCell: 78 / 34, key: ['alive', 'gain'] },
  still: { no: 8, title: t('Quieta', 'Still'), panels: [0.2, 0.5, 0.8], crop: CENTRE_PANEL, pxPerCell: 120 / 64, key: ['alive'] },
  pulsing: { no: 9, title: t('Late', 'Beating'), panels: [0.2, 0.5, 0.8], crop: [10, 12, 116, 116], pxPerCell: 116 / 26, key: ['alive'], leader: { x: 68, y: 70, lx: 140, ly: 132, text: t('late como un corazón', 'beats like a heart') } },
  swimmer: { no: 10, title: t('Nada', 'Swims'), panels: [0.1, 0.5, 0.9], crop: [6, 16, 248, 104], pxPerCell: 74 / 34, key: ['alive'] },
  spinner: { no: 11, title: t('Gira', 'Spins'), panels: [0.1, 0.5, 0.9], crop: CENTRE_PANEL, pxPerCell: 120 / 46, key: ['alive'] },
  divider: { no: 12, title: t('Se divide', 'Divides'), panels: [0.08, 0.4, 0.85], crop: [6, 14, 248, 112], pxPerCell: 78 / 34, key: ['alive'] },
  colony: { no: 13, title: t('Colonia', 'Colony'), panels: [0.2, 0.5, 0.8], crop: WIDE_PANEL, pxPerCell: 2, key: ['alive'] },
  golden: { no: 14, title: t('Destello', 'Spark'), panels: [0.2, 0.55, 0.75], crop: WIDE_PANEL, pxPerCell: 44 / 34, key: ['spark', 'gain'] },
  upgrade: { no: 15, title: t('Mejora', 'Upgrade'), panels: [0.2, 0.45, 0.7], crop: WIDE_PANEL, pxPerCell: 2, key: ['alive', 'gain'] },
  autoseed: { no: 16, title: t('Brazo dosificador', 'Dosing arm'), panels: [0.2, 0.5, 0.85], crop: WIDE_PANEL, pxPerCell: 50 / 34, key: ['forming', 'alive'] },
  rules: { no: 17, title: t('Reglas del mundo', 'World rules'), panels: [0.1, 0.5, 0.9], crop: WHOLE, pxPerCell: 96 / 44, key: ['alive', 'fading', 'shapeless'] },
  clock: { no: 18, title: t('Reloj', 'Clock'), panels: [0.05, 0.4, 0.75], crop: [14, 18, 104, 104], pxPerCell: 104 / 44, key: ['alive', 'light'] },
  seedPrice: { no: 19, title: t('Precio de la semilla', 'Seed price'), panels: [0.2, 0.6, 0.85], crop: [10, 18, 132, 100], pxPerCell: 2, key: ['cost', 'gain'] },
  overgrown: { no: 20, title: t('Desbordamiento', 'Overgrowth'), panels: [0.08, 0.45, 0.8], crop: OUTCOME, pxPerCell: 120 / 64, key: ['alive', 'shapeless', 'danger'], leader: { x: 72, y: 70, lx: 140, ly: 132, text: t('demasiadas', 'too many') } },
  division: { no: 21, title: t('División', 'Division'), panels: [0.08, 0.4, 0.85], crop: [6, 14, 248, 112], pxPerCell: 78 / 34, key: ['alive'] },
  extinctionReady: { no: 22, title: t('Noche nueva', 'A new night'), panels: [0.15, 0.45, 0.8], crop: WHOLE, pxPerCell: 2, key: ['alive', 'gain'] },
  keepReset: { no: 23, title: t('Lo que se guarda', 'What is kept'), panels: [0.2, 0.6], crop: WHOLE, pxPerCell: 2, key: ['alive', 'gain'] },
  offline: { no: 24, title: t('Mientras no estabas', 'While you were away'), panels: [0.3, 0.8], crop: WHOLE, pxPerCell: 52 / 34, key: ['alive', 'light'] },
  collect: { no: 25, title: t('Recoger', 'Collecting'), panels: [0.1, 0.5, 0.9], crop: WHOLE, pxPerCell: 2, key: ['alive', 'light'] },
  steer: { no: 26, title: t('Guiar', 'Steering'), panels: [0.1, 0.5, 0.9], crop: WHOLE, pxPerCell: 2, key: ['alive', 'danger'] },
};

/** "LÁMINA 07" / "PLATE 07" (Mono, the instrument's labels). */
export function plateLabel(no: number, lang: Lang): string {
  return `${lang === 'es' ? 'LÁMINA' : 'PLATE'} ${String(no).padStart(2, '0')}`;
}

/** "Fig. 7 · " before VELA's line (the plate's caption). */
export function figPrefix(no: number): string {
  return `Fig. ${no} · `;
}

/** The plate of a kind (null for a kind this table does not know: a new Momento without its plate yet). */
export function plateOf(kind: string): PlateDef | null {
  return (PLATES as Record<string, PlateDef | undefined>)[kind] ?? null;
}

/** Lengths a scale bar may have, mm (a round number the eye reads at once). */
const BAR_MM = [10, 5, 2, 1] as const;
/** The longest bar, in box units (a sixth of the 260-wide diagram). */
const BAR_MAX = 44;

/**
 * The scale bar of a plate: the longest round length (10, 5, 2 or 1 mm) that fits BAR_MAX box units at the
 * diagram's scale. 1 cell = PLATE_MM_PER_CELL mm (Ø128 cells = a 90-mm Petri dish).
 */
export function scaleBar(def: Pick<PlateDef, 'pxPerCell'>): { mm: number; box: number } {
  for (const mm of BAR_MM) {
    const box = (mm / PLATE_MM_PER_CELL) * def.pxPerCell;
    if (box <= BAR_MAX) return { mm, box };
  }
  return { mm: 1, box: (1 / PLATE_MM_PER_CELL) * def.pxPerCell };
}

/** "5 mm". */
export function scaleText(mm: number): string {
  return `${mm} mm`;
}

/** The colour key: each meaning with its swatch shape (● alive, ◌ forming, ■ shapeless, ▲ danger…). */
export const KEY_TEXT: Record<PlateKey, { label: Text; shape: 'dot' | 'ring' | 'square' | 'triangle' | 'drop' | 'arrowUp' | 'plus' | 'star' | 'dash' }> = {
  alive: { label: t('viva', 'alive'), shape: 'dot' },
  forming: { label: t('naciendo', 'forming'), shape: 'ring' },
  shapeless: { label: t('sin forma', 'shapeless'), shape: 'square' },
  fading: { label: t('se apaga', 'fading'), shape: 'dash' },
  light: { label: t('luz', 'glow'), shape: 'drop' },
  danger: { label: t('peligro', 'danger'), shape: 'triangle' },
  cost: { label: t('cuesta', 'costs'), shape: 'arrowUp' },
  gain: { label: t('premio', 'prize'), shape: 'plus' },
  spark: { label: t('Destello', 'Spark'), shape: 'star' },
};
