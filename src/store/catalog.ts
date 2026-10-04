/**
 * Bioluma cosmetic catalog. FAIR PLAY: every item here is purely visual or audible.
 *
 * Nothing in this file (or anywhere in src/store) may touch the economy: no essence, no speed,
 * no samples, no genome, no seeds, no time skips, no extra slots, no odds. A test walks every
 * item's data and fails on gameplay-sounding keys (see catalog.test.ts, FORBIDDEN_KEYS).
 * Cosmetics also never change *state semantics*: the "forming" dashed ring, the red "denied"
 * ripple, the golden spark's size/hit area/lifetime and its off-screen indicator stay identical
 * for every skin, so no skin makes the game easier or harder to read.
 *
 * Pure data + tiny helpers: no DOM, no import.meta, safe to import from the server (api/).
 */
import { MATTER_STOPS } from '../core/palette';
import type { Text } from '../core/types';

// ───────────────────────────── Types ─────────────────────────────

/** Equipment slots. One item per slot is equipped at a time. */
export type Slot = 'palette' | 'dish' | 'halo' | 'trail' | 'spark' | 'music' | 'badge' | 'frame' | 'nameColor';
export const SLOTS: readonly Slot[] = ['palette', 'dish', 'halo', 'trail', 'spark', 'music', 'badge', 'frame', 'nameColor'];

/** Store modal tabs. */
export type StoreTab = 'palettes' | 'dish' | 'effects' | 'music' | 'profile' | 'supporter';
export const STORE_TABS: readonly StoreTab[] = ['palettes', 'dish', 'effects', 'music', 'profile', 'supporter'];

export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'exclusive';

/**
 * Reference prices in USD. Stores localise them (Play/Apple price templates, Lemon Squeezy
 * currency display); the UI prefers a provider's localised label when it has one.
 * Web note: Lemon Squeezy charges 5% + 0.50 USD per order, so nothing on the web costs
 * less than 1.99 USD (a 0.99 item would lose ~55% to fees). See docs/MONETIZACION.md.
 */
export type PriceTier = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'pack' | 'bundle' | 'subMonth' | 'subYear';
export const PRICE_USD: Record<PriceTier, number> = {
  tier1: 1.99,
  tier2: 2.99,
  tier3: 3.99,
  tier4: 4.99,
  pack: 5.99,
  bundle: 9.99,
  subMonth: 2.99,
  subYear: 24.99,
};

/** How an item becomes owned. */
export type Unlock =
  /** Everyone owns it (the starting look of each slot). */
  | { type: 'default' }
  /** Free, unlocked by an in-game achievement id (src/game/content.ts ACHIEVEMENT_TEXT). */
  | { type: 'achievement'; achievement: string }
  /** Bought on its own (it may also be part of bundles). */
  | { type: 'purchase' }
  /** Only obtainable through the bundles that list it in `contains`. */
  | { type: 'bundle' }
  /** Usable while the supporter subscription is active. */
  | { type: 'subscription' }
  /** Supporter palette of the month: claimed while subscribed during `month`, kept forever. */
  | { type: 'rotation'; month: string };

/** Store product identifiers per provider. Unset = convention (see skuFor). */
export interface ProviderSkus {
  /** Lemon Squeezy variant id (numeric string, from the dashboard). Server maps it via env too. */
  lemonsqueezy?: string;
  /** Google Play product id (default: the item id). */
  googleplay?: string;
  /** App Store product id (default: "bioluma." + item id). */
  apple?: string;
  /** Steam DLC app id. */
  steam?: number;
}

/** [value 0..1, r, g, b (0..255), alpha 0..1], same shape as core/palette MATTER_STOPS. */
export type MatterStop = [number, number, number, number, number];

export interface PaletteData {
  stops: MatterStop[];
  /**
   * Shader accents that must follow the palette so an "Ember" creature does not get cyan edges.
   * They replace the constants CYAN (contour + edge sheen), GLOW_CORE, GLOW_WIDE and the shadow
   * tint of src/sim/shaders.ts RENDER (see src/store/apply.ts renderStyleFor).
   */
  contour: string;
  glowCore: string;
  glowWide: string;
  /** Multiplier applied to matter in shadowed relief (default '#6BB3FF' = vec3(.42,.70,1.0)). */
  shadow: string;
}

export interface DishTheme {
  /** Outside the dish. Must stay dark (relative luminance <= 0.02): every palette is designed for it. */
  bg: string;
  /** Agar colour at the centre and at the edge (vignette). */
  agarIn: string;
  agarOut: string;
  rim: string;
  /** 0..0.5, rim line intensity (default 0.22). */
  rimStrength: number;
  rimStyle: 'line' | 'double' | 'glow';
  /** Colour of the floating motes in the overlay. */
  motes: string;
  /** Optional faint lab grid over the agar (colour with alpha), null = none. */
  grid: string | null;
}

/** Halo drawn around STABLE creatures only (born/exploded indicators are never skinned). */
export interface HaloStyle {
  shape: 'ring' | 'double' | 'orbit' | 'petals' | 'hex' | 'gradient';
  color: string;
  /** Travelling shimmer highlight. */
  shimmer: string;
  /** Second colour for 'gradient' / 'double'. */
  color2?: string;
}

/** Successful-seed ripple + particle burst. The red "denied" ripple is never skinned. */
export interface TrailStyle {
  ripple: string;
  rings: 1 | 2 | 3;
  particle: 'dot' | 'star' | 'petal' | 'bubble' | 'spark';
  colors: string[];
  /** Particle gravity in px/s² (negative = rises). */
  gravity: number;
}

/**
 * Golden spark ("Destello") skin. Size, hit area, path, lifetime, sound and the gold off-screen
 * chevron are identical for every skin; the core stays bright (luminance 0.6..1, tested).
 */
export interface SparkSkin {
  shape: 'star' | 'orb' | 'comet' | 'moth' | 'flake';
  core: string;
  glow: string;
  trail: string;
  particles: string[];
}

export type MusicMode = 'dorian' | 'aeolian' | 'lydian' | 'mixolydian' | 'ionian' | 'pentatonicMinor' | 'pentatonicMajor';
export type Timbre = 'warm' | 'glass' | 'choir' | 'reed' | 'bell' | 'pluck' | 'sine';

/**
 * Music ambience preset for src/audio (the integrator maps it onto the engine). The game's
 * adaptive intensity and every SFX cue (spark spawn, new species...) stay identical: an
 * ambience never adds or removes information.
 */
export interface AmbiencePreset {
  /** 56..96. The engine's default is 76 (src/audio/progression.ts BPM). */
  bpm: number;
  mode: MusicMode;
  /** Tonic pitch class 0..11 (2 = D, the engine default). */
  tonic: number;
  pad: Timbre;
  arp: Timbre;
  lead: Timbre;
  bass: Timbre;
  reverb: { rt60: number; brightHz: number; darkHz: number };
  /** 0..1 sends. */
  reverbMix: number;
  delayMix: number;
  percussion: 'soft' | 'brushes' | 'clicks' | 'none';
  /** Multiplier on ornament/sparkle probability (0..2). */
  sparkle: number;
  /** 0..0.3 swing of off-beat eighths. */
  swing: number;
  /** Pad detune in cents (chorus width). */
  detune: number;
}

export interface BadgeData {
  /** SVG inner markup for a 24×24 viewBox, stroked with currentColor (1.5 px). Empty = no badge. */
  svg: string;
  color: string;
  bg: string;
}

export interface FrameData {
  /** CSS colours. 'gradient' uses colors[0..n]. */
  style: 'none' | 'solid' | 'gradient' | 'dotted' | 'vine';
  colors: string[];
  glow: string | null;
}

export interface NameColorData {
  /** Solid colour or a 2-stop gradient; must keep >= 4.5:1 contrast on the ranking surface. */
  color: string;
  gradient?: [string, string];
}

interface ItemBase {
  /** Stable id, lowercase with dots (valid as a Google Play / App Store product id). Never rename. */
  id: string;
  name: Text;
  desc: Text;
  rarity: CosmeticRarity;
  tab: StoreTab;
  /** null when it is not sold on its own. */
  price: PriceTier | null;
  unlock: Unlock;
  skus?: ProviderSkus;
  /** ISO date it entered the catalog (the UI shows "Nuevo" for 30 days). */
  since?: string;
  /** Before this ISO date only supporters can buy it (early access); everyone after. */
  earlyAccessUntil?: string;
}

export interface PaletteItem extends ItemBase { kind: 'cosmetic'; slot: 'palette'; data: PaletteData }
export interface DishItem extends ItemBase { kind: 'cosmetic'; slot: 'dish'; data: DishTheme }
export interface HaloItem extends ItemBase { kind: 'cosmetic'; slot: 'halo'; data: HaloStyle }
export interface TrailItem extends ItemBase { kind: 'cosmetic'; slot: 'trail'; data: TrailStyle }
export interface SparkItem extends ItemBase { kind: 'cosmetic'; slot: 'spark'; data: SparkSkin }
export interface MusicItem extends ItemBase { kind: 'cosmetic'; slot: 'music'; data: AmbiencePreset }
export interface BadgeItem extends ItemBase { kind: 'cosmetic'; slot: 'badge'; data: BadgeData }
export interface FrameItem extends ItemBase { kind: 'cosmetic'; slot: 'frame'; data: FrameData }
export interface NameColorItem extends ItemBase { kind: 'cosmetic'; slot: 'nameColor'; data: NameColorData }

export type CosmeticItem =
  | PaletteItem
  | DishItem
  | HaloItem
  | TrailItem
  | SparkItem
  | MusicItem
  | BadgeItem
  | FrameItem
  | NameColorItem;

export interface BundleItem extends ItemBase {
  kind: 'bundle';
  /** Cosmetic ids granted forever by buying the bundle. */
  contains: string[];
}

export interface SubscriptionItem extends ItemBase {
  kind: 'subscription';
  period: 'month' | 'year';
}

export type StoreItem = CosmeticItem | BundleItem | SubscriptionItem;

/** Data type per slot, for typed lookups (`equippedData('palette')` → PaletteData). */
export interface SlotData {
  palette: PaletteData;
  dish: DishTheme;
  halo: HaloStyle;
  trail: TrailStyle;
  spark: SparkSkin;
  music: AmbiencePreset;
  badge: BadgeData;
  frame: FrameData;
  nameColor: NameColorData;
}

const t = (es: string, en: string): Text => ({ es, en });

// ───────────────────────────── Palettes ─────────────────────────────
// Every palette: v=0 is transparent (the agar shows through), alpha never decreases, and the
// colour composited over the dark dish gets brighter as matter grows (readable bodies on every
// dish theme). catalog.test.ts enforces monotonic luminance and minimum contrast.

const BG0: MatterStop = [0.0, 11, 14, 18, 0];

function palette(
  id: string,
  name: Text,
  desc: Text,
  rarity: CosmeticRarity,
  price: PriceTier | null,
  unlock: Unlock,
  data: PaletteData,
  extra: Partial<ItemBase> = {},
): PaletteItem {
  return { kind: 'cosmetic', slot: 'palette', tab: 'palettes', id, name, desc, rarity, price, unlock, data, ...extra };
}

export const PALETTES: PaletteItem[] = [
  palette(
    'palette.bioluma',
    t('Bioluma', 'Bioluma'),
    t('El brillo original del laboratorio: bordes índigo, cuerpo cian, núcleo blanco.', 'The original lab glow: indigo edges, cyan body, white core.'),
    'common',
    null,
    { type: 'default' },
    {
      stops: MATTER_STOPS.map((s) => [...s] as MatterStop),
      contour: '#66E6FF',
      glowCore: '#73D9FF',
      glowWide: '#475CF2',
      shadow: '#6BB3FF',
    },
  ),
  palette(
    'palette.aurora',
    t('Aurora', 'Aurora'),
    t('Cortinas boreales: velos violeta que se encienden en verde menta.', 'Northern curtains: violet veils igniting into mint green.'),
    'rare',
    'tier2',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 38, 18, 78, 0.55], [0.16, 78, 38, 150, 0.85], [0.4, 40, 220, 160, 1], [0.7, 190, 255, 220, 1], [1.0, 248, 255, 250, 1]],
      contour: '#7DFFC4',
      glowCore: '#5CF0B0',
      glowWide: '#7A4CE0',
      shadow: '#7A6CFF',
    },
  ),
  palette(
    'palette.coral',
    t('Arrecife de coral', 'Coral reef'),
    t('Criaturas de arrecife: ciruela profunda, coral vivo y espuma melocotón.', 'Reef creatures: deep plum, living coral and peach foam.'),
    'rare',
    'tier2',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 32, 22, 62, 0.55], [0.16, 92, 30, 92, 0.85], [0.4, 255, 110, 100, 1], [0.7, 255, 205, 160, 1], [1.0, 255, 250, 240, 1]],
      contour: '#FF9E8A',
      glowCore: '#FF8A7A',
      glowWide: '#3D6FE0',
      shadow: '#BF73B3',
    },
  ),
  palette(
    'palette.ember',
    t('Brasa', 'Ember'),
    t('Vida al rojo vivo: granate en los bordes, ámbar en el pulso.', 'Life running hot: garnet edges, amber pulse.'),
    'rare',
    'tier2',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 42, 14, 14, 0.55], [0.16, 112, 20, 24, 0.85], [0.4, 240, 90, 30, 1], [0.7, 255, 200, 90, 1], [1.0, 255, 250, 225, 1]],
      contour: '#FFB45C',
      glowCore: '#FF9A40',
      glowWide: '#C2283A',
      shadow: '#C25A4A',
    },
  ),
  palette(
    'palette.mono',
    t('Monocromo de laboratorio', 'Monochrome lab'),
    t('Plata sobre negro, como una placa vista al microscopio electrónico.', 'Silver on black, like a dish under an electron microscope.'),
    'common',
    null,
    { type: 'achievement', achievement: 'species10' },
    {
      stops: [BG0, [0.08, 30, 34, 40, 0.55], [0.16, 62, 68, 76, 0.85], [0.4, 150, 158, 168, 1], [0.7, 215, 220, 226, 1], [1.0, 255, 255, 255, 1]],
      contour: '#E8EEF4',
      glowCore: '#C8D2DC',
      glowWide: '#5A6470',
      shadow: '#9AA4B0',
    },
  ),
  palette(
    'palette.glacier',
    t('Glaciar', 'Glacier'),
    t('Hielo azul profundo que se aclara hasta la escarcha.', 'Deep blue ice brightening into frost.'),
    'common',
    null,
    { type: 'achievement', achievement: 'golden10' },
    {
      stops: [BG0, [0.08, 16, 30, 54, 0.55], [0.16, 30, 62, 112, 0.85], [0.4, 110, 180, 240, 1], [0.7, 210, 240, 255, 1], [1.0, 255, 255, 255, 1]],
      contour: '#BFEAFF',
      glowCore: '#9AD8FF',
      glowWide: '#3A6AB8',
      shadow: '#7AA0D0',
    },
  ),
  palette(
    'palette.abyssal',
    t('Abisal', 'Abyssal'),
    t('Bioluminiscencia de fosa: turquesa eléctrico que nace de la oscuridad total.', 'Trench bioluminescence: electric teal born from total darkness.'),
    'epic',
    'tier3',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 6, 30, 42, 0.6], [0.18, 0, 72, 92, 0.9], [0.42, 0, 230, 200, 1], [0.72, 150, 255, 140, 1], [1.0, 240, 255, 225, 1]],
      contour: '#3CFFE0',
      glowCore: '#30F0D0',
      glowWide: '#0A4AA0',
      shadow: '#2A80A0',
    },
  ),
  palette(
    'palette.sakura',
    t('Sakura', 'Sakura'),
    t('Pétalos de cerezo: ciruela, rosa y blanco flor.', 'Cherry petals: plum, pink and blossom white.'),
    'rare',
    'tier2',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 42, 20, 48, 0.55], [0.16, 102, 40, 92, 0.85], [0.4, 240, 120, 170, 1], [0.7, 255, 200, 220, 1], [1.0, 255, 248, 250, 1]],
      contour: '#FFB8D8',
      glowCore: '#FF9EC8',
      glowWide: '#8040A0',
      shadow: '#B070A8',
    },
  ),
  palette(
    'palette.toxic',
    t('Tóxico', 'Toxic'),
    t('Verde ácido de tubo de ensayo olvidado. No lo toques.', 'Acid green from a forgotten test tube. Do not touch.'),
    'common',
    'tier1',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 18, 34, 14, 0.55], [0.16, 40, 82, 20, 0.85], [0.4, 150, 230, 30, 1], [0.7, 230, 255, 120, 1], [1.0, 255, 255, 230, 1]],
      contour: '#C8FF50',
      glowCore: '#A0F030',
      glowWide: '#2E7A1E',
      shadow: '#5A9A40',
    },
  ),
  palette(
    'palette.goldleaf',
    t('Pan de oro', 'Gold leaf'),
    t('Criaturas doradas a la hoja, como un manuscrito iluminado.', 'Creatures gilded like an illuminated manuscript.'),
    'epic',
    'tier3',
    { type: 'purchase' },
    {
      stops: [BG0, [0.08, 36, 24, 14, 0.55], [0.16, 92, 60, 20, 0.85], [0.4, 220, 160, 50, 1], [0.7, 255, 225, 140, 1], [1.0, 255, 252, 235, 1]],
      contour: '#FFD98A',
      glowCore: '#FFC860',
      glowWide: '#8A5A1A',
      shadow: '#A07848',
    },
  ),
  palette(
    'palette.prism',
    t('Prisma', 'Prism'),
    t('Todo el espectro en un cuerpo: cada anillo de materia tiene su color.', 'The whole spectrum in one body: every ring of matter has its own colour.'),
    'legendary',
    'tier4',
    { type: 'purchase' },
    {
      stops: [
        BG0,
        [0.08, 70, 20, 110, 0.55],
        [0.18, 50, 70, 230, 0.9],
        [0.32, 200, 60, 210, 1],
        [0.46, 255, 120, 60, 1],
        [0.62, 170, 235, 70, 1],
        [0.8, 255, 245, 140, 1],
        [1.0, 255, 255, 255, 1],
      ],
      contour: '#E6D8FF',
      glowCore: '#FF80E0',
      glowWide: '#4060FF',
      shadow: '#8070FF',
    },
  ),
];

/**
 * Supporter palettes of the month. A subscriber active during `month` (UTC, YYYY-MM) claims it and
 * keeps it forever. After the last entry the list cycles (supporterPaletteFor), so it never runs out;
 * add new months at the end. Exclusive: never sold.
 */
export const SUPPORTER_PALETTES: PaletteItem[] = [
  palette(
    'palette.mecenas.2026-11',
    t('Nebulosa', 'Nebula'),
    t('Paleta Mecenas de noviembre 2026: polvo estelar magenta.', 'Supporter palette, November 2026: magenta stardust.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2026-11' },
    {
      stops: [BG0, [0.08, 30, 16, 60, 0.55], [0.16, 80, 30, 130, 0.85], [0.4, 230, 80, 200, 1], [0.7, 255, 190, 150, 1], [1.0, 255, 250, 235, 1]],
      contour: '#FFA0E8',
      glowCore: '#F070D0',
      glowWide: '#5030C0',
      shadow: '#9050C0',
    },
  ),
  palette(
    'palette.mecenas.2026-12',
    t('Solsticio', 'Solstice'),
    t('Paleta Mecenas de diciembre 2026: noche larga, vela cálida.', 'Supporter palette, December 2026: long night, warm candle.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2026-12' },
    {
      stops: [BG0, [0.08, 16, 22, 50, 0.55], [0.16, 30, 40, 100, 0.85], [0.4, 120, 150, 220, 1], [0.7, 255, 220, 150, 1], [1.0, 255, 252, 240, 1]],
      contour: '#FFE0A0',
      glowCore: '#FFD080',
      glowWide: '#3050B0',
      shadow: '#6070B0',
    },
  ),
  palette(
    'palette.mecenas.2027-01',
    t('Escarcha', 'Frost'),
    t('Paleta Mecenas de enero 2027: lavanda helada.', 'Supporter palette, January 2027: frozen lavender.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2027-01' },
    {
      stops: [BG0, [0.08, 24, 24, 52, 0.55], [0.16, 60, 56, 112, 0.85], [0.4, 170, 160, 240, 1], [0.7, 225, 235, 255, 1], [1.0, 255, 255, 255, 1]],
      contour: '#D8D0FF',
      glowCore: '#B8B0FF',
      glowWide: '#4A40A0',
      shadow: '#8A84C8',
    },
  ),
  palette(
    'palette.mecenas.2027-02',
    t('Orquídea', 'Orchid'),
    t('Paleta Mecenas de febrero 2027: violeta de invernadero.', 'Supporter palette, February 2027: greenhouse violet.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2027-02' },
    {
      stops: [BG0, [0.08, 36, 14, 40, 0.55], [0.16, 90, 30, 100, 0.85], [0.4, 190, 90, 230, 1], [0.7, 240, 200, 255, 1], [1.0, 255, 250, 255, 1]],
      contour: '#E8B8FF',
      glowCore: '#D090FF',
      glowWide: '#6030A0',
      shadow: '#9A60C0',
    },
  ),
  palette(
    'palette.mecenas.2027-03',
    t('Brote', 'Sprout'),
    t('Paleta Mecenas de marzo 2027: primer verde de la temporada.', 'Supporter palette, March 2027: the first green of the season.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2027-03' },
    {
      stops: [BG0, [0.08, 16, 30, 24, 0.55], [0.16, 30, 72, 50, 0.85], [0.4, 90, 200, 120, 1], [0.7, 220, 245, 170, 1], [1.0, 255, 255, 240, 1]],
      contour: '#B8F0A0',
      glowCore: '#90E890',
      glowWide: '#207050',
      shadow: '#5A9A70',
    },
  ),
  palette(
    'palette.mecenas.2027-04',
    t('Medusa', 'Jellyfish'),
    t('Paleta Mecenas de abril 2027: azul translúcido con corazón rosa.', 'Supporter palette, April 2027: translucent blue with a pink heart.'),
    'exclusive',
    null,
    { type: 'rotation', month: '2027-04' },
    {
      stops: [BG0, [0.08, 20, 24, 60, 0.55], [0.16, 60, 40, 140, 0.85], [0.4, 120, 140, 255, 1], [0.7, 255, 180, 240, 1], [1.0, 255, 248, 255, 1]],
      contour: '#C0C8FF',
      glowCore: '#A0B0FF',
      glowWide: '#4030B0',
      shadow: '#8070D0',
    },
  ),
];

// ───────────────────────────── Dish themes ─────────────────────────────

function dish(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: DishTheme): DishItem {
  return { kind: 'cosmetic', slot: 'dish', tab: 'dish', id, name, desc, rarity, price, unlock, data };
}

export const DISHES: DishItem[] = [
  dish('dish.nightlab', t('Laboratorio nocturno', 'Night lab'), t('Agar azul pizarra y borde de vidrio cian.', 'Slate-blue agar and a cyan glass rim.'), 'common', null, { type: 'default' }, {
    bg: '#0B0E12', agarIn: '#141B22', agarOut: '#0E1319', rim: '#5BC0EB', rimStrength: 0.22, rimStyle: 'line', motes: '#8CD7FF', grid: null,
  }),
  dish('dish.amber', t('Agar ámbar', 'Amber agar'), t('Gel cálido color miel, como una placa recién servida.', 'Warm honey-coloured gel, like a freshly poured dish.'), 'common', 'tier1', { type: 'purchase' }, {
    bg: '#0E0B08', agarIn: '#1F1911', agarOut: '#15110C', rim: '#E8B060', rimStrength: 0.24, rimStyle: 'line', motes: '#FFD8A0', grid: null,
  }),
  dish('dish.deepsea', t('Fosa marina', 'Deep sea'), t('Agua negra y azul de profundidad, con un borde que respira.', 'Black water and abyssal blue, with a breathing rim.'), 'rare', 'tier2', { type: 'purchase' }, {
    bg: '#05090F', agarIn: '#0B1926', agarOut: '#06101A', rim: '#2EA6C8', rimStrength: 0.26, rimStyle: 'glow', motes: '#6FD6F0', grid: null,
  }),
  dish('dish.obsidian', t('Obsidiana', 'Obsidian'), t('Vidrio volcánico pulido con reflejos violeta.', 'Polished volcanic glass with violet glints.'), 'rare', 'tier2', { type: 'purchase' }, {
    bg: '#08080A', agarIn: '#141318', agarOut: '#0C0B0F', rim: '#B892FF', rimStrength: 0.22, rimStyle: 'double', motes: '#CDB8FF', grid: null,
  }),
  dish('dish.blueprint', t('Plano técnico', 'Blueprint'), t('Cuadrícula milimetrada de cuaderno de laboratorio.', 'Graph-paper grid from a lab notebook.'), 'rare', 'tier2', { type: 'purchase' }, {
    bg: '#060B14', agarIn: '#0D1828', agarOut: '#08111E', rim: '#6FA8FF', rimStrength: 0.24, rimStyle: 'line', motes: '#A8C8FF', grid: 'rgba(111,168,255,0.07)',
  }),
  dish('dish.moss', t('Musgo', 'Moss'), t('Un verde de bosque húmedo. Se gana con una placa llena de vida.', 'A damp forest green. Earned with a dish full of life.'), 'common', null, { type: 'achievement', achievement: 'crowd10' }, {
    bg: '#080C09', agarIn: '#131B15', agarOut: '#0C120E', rim: '#8AE234', rimStrength: 0.2, rimStyle: 'line', motes: '#C8F0A0', grid: null,
  }),
  dish('dish.brass', t('Latón del fundador', "Founder's brass"), t('Placa con aro de latón grabado. Solo en el Paquete fundador.', 'A dish with an engraved brass ring. Founder pack only.'), 'exclusive', null, { type: 'bundle' }, {
    bg: '#0D0B08', agarIn: '#1C1813', agarOut: '#13100C', rim: '#FFD166', rimStrength: 0.3, rimStyle: 'double', motes: '#FFE6A8', grid: null,
  }),
];

// ───────────────────────────── Halos ─────────────────────────────

function halo(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: HaloStyle): HaloItem {
  return { kind: 'cosmetic', slot: 'halo', tab: 'effects', id, name, desc, rarity, price, unlock, data };
}

export const HALOS: HaloItem[] = [
  halo('halo.classic', t('Halo clásico', 'Classic halo'), t('El anillo cian que late a medio hercio.', 'The cyan ring pulsing at half a hertz.'), 'common', null, { type: 'default' }, {
    shape: 'ring', color: '#5BC0EB', shimmer: '#D8F4FF',
  }),
  halo('halo.ethologist', t('Doble anillo', 'Double ring'), t('Dos órbitas violeta. Para quien ha visto los seis comportamientos.', 'Two violet orbits. For those who have seen all six behaviours.'), 'rare', null, { type: 'achievement', achievement: 'allBehaviors' }, {
    shape: 'double', color: '#B892FF', shimmer: '#F0E4FF', color2: '#5BC0EB',
  }),
  halo('halo.orbit', t('Satélite', 'Satellite'), t('Una pequeña luna de luz orbita cada criatura estable.', 'A tiny moon of light orbits every stable creature.'), 'common', 'tier1', { type: 'purchase' }, {
    shape: 'orbit', color: '#7FD3F5', shimmer: '#FFFFFF',
  }),
  halo('halo.petals', t('Corola', 'Corolla'), t('Seis pétalos suaves que se abren con el pulso.', 'Six soft petals opening with the pulse.'), 'rare', 'tier2', { type: 'purchase' }, {
    shape: 'petals', color: '#FF9EC8', shimmer: '#FFE4F0',
  }),
  halo('halo.hex', t('Panal', 'Honeycomb'), t('Un hexágono de cera luminosa, preciso como una celda.', 'A hexagon of glowing wax, precise as a cell.'), 'rare', 'tier2', { type: 'purchase' }, {
    shape: 'hex', color: '#F2C14E', shimmer: '#FFF1C4',
  }),
  halo('halo.aurora', t('Corona boreal', 'Aurora crown'), t('Un anillo que barre del verde menta al violeta.', 'A ring sweeping from mint green to violet.'), 'epic', 'tier3', { type: 'purchase' }, {
    shape: 'gradient', color: '#5CF0B0', shimmer: '#FFFFFF', color2: '#9A6CFF',
  }),
];

// ───────────────────────────── Seed trails ─────────────────────────────

function trail(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: TrailStyle): TrailItem {
  return { kind: 'cosmetic', slot: 'trail', tab: 'effects', id, name, desc, rarity, price, unlock, data };
}

export const TRAILS: TrailItem[] = [
  trail('trail.drop', t('Gota', 'Drop'), t('Onda cian y salpicadura fina al sembrar.', 'A cyan ripple and a fine splash when you sow.'), 'common', null, { type: 'default' }, {
    ripple: '#5BC0EB', rings: 2, particle: 'dot', colors: ['#5BC0EB'], gravity: 0,
  }),
  trail('trail.spores', t('Esporas', 'Spores'), t('Una nube de esporas verdes. Se gana sembrando mil veces.', 'A cloud of green spores. Earned by sowing a thousand times.'), 'common', null, { type: 'achievement', achievement: 'seeds1000' }, {
    ripple: '#8AE234', rings: 2, particle: 'dot', colors: ['#8AE234', '#C8F0A0', '#5BC0EB'], gravity: -6,
  }),
  trail('trail.stars', t('Polvo de estrellas', 'Stardust'), t('Destellos de cuatro puntas que caen despacio.', 'Four-pointed glints drifting down slowly.'), 'rare', 'tier1', { type: 'purchase' }, {
    ripple: '#BFD8FF', rings: 2, particle: 'star', colors: ['#FFFFFF', '#BFD8FF', '#FFE9A8'], gravity: 14,
  }),
  trail('trail.bubbles', t('Burbujas', 'Bubbles'), t('Burbujas de aire que suben del agar.', 'Air bubbles rising from the agar.'), 'common', 'tier1', { type: 'purchase' }, {
    ripple: '#6FD6F0', rings: 1, particle: 'bubble', colors: ['#9FE8FF', '#E0FAFF'], gravity: -30,
  }),
  trail('trail.petals', t('Pétalos', 'Petals'), t('Pétalos de cerezo que giran al caer.', 'Cherry petals spinning as they fall.'), 'rare', 'tier2', { type: 'purchase' }, {
    ripple: '#FF9EC8', rings: 2, particle: 'petal', colors: ['#FFB8D8', '#FF8FB8', '#FFE4F0'], gravity: 18,
  }),
  trail('trail.embers', t('Chispas', 'Embers'), t('Brasas que suben y se apagan.', 'Embers that rise and fade.'), 'rare', 'tier2', { type: 'purchase' }, {
    ripple: '#FF9A40', rings: 3, particle: 'spark', colors: ['#FFB45C', '#FF7A3C', '#FFE0A0'], gravity: -24,
  }),
];

// ───────────────────────────── Golden spark skins ─────────────────────────────

function spark(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: SparkSkin): SparkItem {
  return { kind: 'cosmetic', slot: 'spark', tab: 'effects', id, name, desc, rarity, price, unlock, data };
}

export const SPARKS: SparkItem[] = [
  spark('spark.classic', t('Destello', 'Spark'), t('La estrella dorada de siempre.', 'The golden star you know.'), 'common', null, { type: 'default' }, {
    shape: 'star', core: '#FFD166', glow: '#FFD166', trail: '#FFD166', particles: ['#FFD166', '#FFFFFF'],
  }),
  spark('spark.moth', t('Polilla lunar', 'Moon moth'), t('Alas pálidas que aletean. Para quien atrapó cincuenta destellos.', 'Pale fluttering wings. For whoever caught fifty sparks.'), 'rare', null, { type: 'achievement', achievement: 'golden50' }, {
    shape: 'moth', core: '#F0E6FF', glow: '#C0A8FF', trail: '#D8C8FF', particles: ['#E8DEFF', '#FFFFFF'],
  }),
  spark('spark.firefly', t('Luciérnaga', 'Firefly'), t('Una chispa verde limón que parpadea con calma.', 'A lime-green spark blinking calmly.'), 'rare', 'tier2', { type: 'purchase' }, {
    shape: 'orb', core: '#E8FF7A', glow: '#B8F050', trail: '#D0FF70', particles: ['#E8FF7A', '#FFFFFF'],
  }),
  spark('spark.comet', t('Cometa', 'Comet'), t('Núcleo blanco con una cola de hielo azul.', 'A white core with an ice-blue tail.'), 'epic', 'tier2', { type: 'purchase' }, {
    shape: 'comet', core: '#FFFFFF', glow: '#8CD7FF', trail: '#8CD7FF', particles: ['#BFEAFF', '#FFFFFF'],
  }),
  spark('spark.flake', t('Copo', 'Snowflake'), t('Un copo de seis brazos que gira despacio.', 'A six-armed flake turning slowly.'), 'rare', 'tier2', { type: 'purchase' }, {
    shape: 'flake', core: '#DFF4FF', glow: '#9AD8FF', trail: '#CFEFFF', particles: ['#FFFFFF', '#CFEFFF'],
  }),
];

// ───────────────────────────── Music ambiences ─────────────────────────────

function music(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: AmbiencePreset): MusicItem {
  return { kind: 'cosmetic', slot: 'music', tab: 'music', id, name, desc, rarity, price, unlock, data };
}

export const MUSICS: MusicItem[] = [
  music('music.nightlab', t('Laboratorio nocturno', 'Night lab'), t('Re dórico a 76 BPM: pad cálido, arpegio pulsado, campanas de vidrio.', 'D dorian at 76 BPM: warm pad, plucked arpeggio, glass bells.'), 'common', null, { type: 'default' }, {
    bpm: 76, mode: 'dorian', tonic: 2, pad: 'warm', arp: 'pluck', lead: 'glass', bass: 'sine',
    reverb: { rt60: 3.2, brightHz: 5200, darkHz: 900 }, reverbMix: 0.55, delayMix: 0.5, percussion: 'soft', sparkle: 1, swing: 0, detune: 6,
  }),
  music('music.patience', t('Paciencia', 'Patience'), t('Pentatónica lenta y espaciosa. Se gana jugando una hora.', 'Slow, spacious pentatonic. Earned by playing for an hour.'), 'common', null, { type: 'achievement', achievement: 'hour' }, {
    bpm: 60, mode: 'pentatonicMinor', tonic: 2, pad: 'choir', arp: 'sine', lead: 'glass', bass: 'sine',
    reverb: { rt60: 4.5, brightHz: 4200, darkHz: 800 }, reverbMix: 0.7, delayMix: 0.55, percussion: 'none', sparkle: 0.6, swing: 0, detune: 4,
  }),
  music('music.deepsea', t('Corriente abisal', 'Abyssal current'), t('La eólico a 64 BPM: coros profundos y campanas lejanas.', 'A aeolian at 64 BPM: deep choirs and distant bells.'), 'rare', 'tier2', { type: 'purchase' }, {
    bpm: 64, mode: 'aeolian', tonic: 9, pad: 'choir', arp: 'bell', lead: 'sine', bass: 'warm',
    reverb: { rt60: 5.2, brightHz: 3600, darkHz: 600 }, reverbMix: 0.75, delayMix: 0.6, percussion: 'none', sparkle: 0.8, swing: 0, detune: 9,
  }),
  music('music.greenhouse', t('Invernadero', 'Greenhouse'), t('Fa lidio a 84 BPM: lengüetas, escobillas y luz de mañana.', 'F lydian at 84 BPM: reeds, brushes and morning light.'), 'rare', 'tier2', { type: 'purchase' }, {
    bpm: 84, mode: 'lydian', tonic: 5, pad: 'warm', arp: 'pluck', lead: 'reed', bass: 'warm',
    reverb: { rt60: 2.4, brightHz: 6400, darkHz: 1200 }, reverbMix: 0.45, delayMix: 0.35, percussion: 'brushes', sparkle: 1.2, swing: 0.12, detune: 5,
  }),
  music('music.musicbox', t('Caja de música', 'Music box'), t('Do mayor a 72 BPM: un cilindro de púas que da cuerda a la placa.', 'C major at 72 BPM: a pinned cylinder winding up the dish.'), 'common', 'tier1', { type: 'purchase' }, {
    bpm: 72, mode: 'ionian', tonic: 0, pad: 'glass', arp: 'bell', lead: 'bell', bass: 'sine',
    reverb: { rt60: 2.8, brightHz: 7000, darkHz: 1400 }, reverbMix: 0.5, delayMix: 0.3, percussion: 'none', sparkle: 1.4, swing: 0, detune: 3,
  }),
  music('music.lofi', t('Bitácora lo-fi', 'Lo-fi logbook'), t('Re dórico a 70 BPM con swing, chasquidos de vinilo y pad desafinado.', 'D dorian at 70 BPM with swing, vinyl clicks and a detuned pad.'), 'rare', 'tier2', { type: 'purchase' }, {
    bpm: 70, mode: 'dorian', tonic: 2, pad: 'warm', arp: 'pluck', lead: 'sine', bass: 'warm',
    reverb: { rt60: 1.8, brightHz: 3800, darkHz: 900 }, reverbMix: 0.35, delayMix: 0.25, percussion: 'clicks', sparkle: 0.7, swing: 0.2, detune: 14,
  }),
];

// ───────────────────────────── Profile: badges, frames, name colours ─────────────────────────────

function badge(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: BadgeData): BadgeItem {
  return { kind: 'cosmetic', slot: 'badge', tab: 'profile', id, name, desc, rarity, price, unlock, data };
}
function frame(id: string, name: Text, desc: Text, rarity: CosmeticRarity, price: PriceTier | null, unlock: Unlock, data: FrameData): FrameItem {
  return { kind: 'cosmetic', slot: 'frame', tab: 'profile', id, name, desc, rarity, price, unlock, data };
}
function nameColor(id: string, name: Text, desc: Text, data: NameColorData, unlock: Unlock = { type: 'subscription' }): NameColorItem {
  return { kind: 'cosmetic', slot: 'nameColor', tab: 'profile', id, name, desc, rarity: unlock.type === 'default' ? 'common' : 'exclusive', price: null, unlock, data };
}

/** Badge glyphs (24×24, stroke currentColor 1.5 px), drawn for this game. */
export const BADGE_GLYPHS = {
  orbium: '<circle cx="12" cy="12" r="6.5"/><path d="M8.5 9.5c1.6-1.8 5.4-1.8 7 0M8 13.5c2 2 6 2 8 0"/><circle cx="12" cy="11.6" r="1.4"/>',
  spiral: '<path d="M12 11.3a1.4 1.4 0 0 1 2.8 0 2.8 2.8 0 0 1-5.6 0 4.2 4.2 0 0 1 8.4 0 5.6 5.6 0 0 1-11.2 0"/>',
  comet: '<circle cx="15.5" cy="8.5" r="2.6"/><path d="M13.6 10.4L5 19M12.3 8.3L6.2 14.4M15.7 11.7l-6.1 6.1"/>',
  leaf: '<path d="M5.5 18.5C5.5 10 10.5 5.5 18.5 5.5 18.5 13.5 14 18.5 5.5 18.5z"/><path d="M5.5 18.5l8-8"/>',
  seedling: '<path d="M12 20v-8"/><path d="M12 12c0-3.6-2.4-5.8-6-5.8 0 3.6 2.4 5.8 6 5.8zM12 13.5c0-3.2 2.2-5.3 5.6-5.3 0 3.2-2.2 5.3-5.6 5.3z"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2c0 5-7 9.4-7 9.4z"/>',
  crown: '<path d="M4.5 17.5l-1-9 5 3.6L12 5.5l3.5 6.6 5-3.6-1 9z"/><path d="M5 20h14"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.3l-5 8.8a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3l-5-8.8V3.5"/><path d="M7.6 14.5h8.8"/>',
} as const;

export const BADGES: BadgeItem[] = [
  badge('badge.none', t('Sin insignia', 'No badge'), t('Solo tu nombre.', 'Just your name.'), 'common', null, { type: 'default' }, { svg: '', color: '#8B98A5', bg: 'transparent' }),
  badge('badge.naturalist', t('Naturalista', 'Naturalist'), t('Una hoja junto a tu nombre. Se gana registrando 20 especies.', 'A leaf by your name. Earned by registering 20 species.'), 'common', null, { type: 'achievement', achievement: 'species20' }, {
    svg: BADGE_GLYPHS.leaf, color: '#8AE234', bg: 'rgba(138,226,52,0.14)',
  }),
  badge('badge.tabula', t('Tabula rasa', 'Tabula rasa'), t('Un brote nuevo: tu primera noche nueva.', 'A new sprout: your first new night.'), 'common', null, { type: 'achievement', achievement: 'extinction' }, {
    svg: BADGE_GLYPHS.seedling, color: '#5BC0EB', bg: 'rgba(91,192,235,0.14)',
  }),
  badge('badge.orbium', t('Orbium', 'Orbium'), t('El emblema de la criatura más famosa de Lenia.', 'The emblem of the most famous Lenia creature.'), 'common', 'tier1', { type: 'purchase' }, {
    svg: BADGE_GLYPHS.orbium, color: '#7FD3F5', bg: 'rgba(127,211,245,0.14)',
  }),
  badge('badge.spiral', t('Remolino', 'Whirl'), t('Una espiral para quien prefiere a las giratorias.', 'A spiral for fans of the spinners.'), 'common', 'tier1', { type: 'purchase' }, {
    svg: BADGE_GLYPHS.spiral, color: '#B892FF', bg: 'rgba(184,146,255,0.14)',
  }),
  badge('badge.comet', t('Cometa', 'Comet'), t('Para cazadoras de destellos.', 'For spark hunters.'), 'common', 'tier1', { type: 'purchase' }, {
    svg: BADGE_GLYPHS.comet, color: '#8CD7FF', bg: 'rgba(140,215,255,0.14)',
  }),
  badge('badge.founder', t('Fundador', 'Founder'), t('Matraz dorado: apoyaste Bioluma desde el principio. Solo en el Paquete fundador.', 'Golden flask: you backed Bioluma from the start. Founder pack only.'), 'exclusive', null, { type: 'bundle' }, {
    svg: BADGE_GLYPHS.flask, color: '#FFD166', bg: 'rgba(255,209,102,0.16)',
  }),
  badge('badge.mecenas', t('Mecenas', 'Supporter'), t('Corazón dorado en el ranking mientras seas Mecenas.', 'A golden heart in the ranking while you are a supporter.'), 'exclusive', null, { type: 'subscription' }, {
    svg: BADGE_GLYPHS.heart, color: '#FFD166', bg: 'rgba(255,209,102,0.16)',
  }),
];

export const FRAMES: FrameItem[] = [
  frame('frame.none', t('Sin marco', 'No frame'), t('Sencillo y limpio.', 'Plain and clean.'), 'common', null, { type: 'default' }, { style: 'none', colors: [], glow: null }),
  frame('frame.petri', t('Placa de Petri', 'Petri dish'), t('Un aro de vidrio cian. Se gana registrando 3 especies.', 'A cyan glass ring. Earned by registering 3 species.'), 'common', null, { type: 'achievement', achievement: 'species3' }, {
    style: 'solid', colors: ['#5BC0EB'], glow: 'rgba(91,192,235,0.35)',
  }),
  frame('frame.dotted', t('Colonia', 'Colony'), t('Un borde punteado de pequeñas células.', 'A dotted border of tiny cells.'), 'common', 'tier1', { type: 'purchase' }, {
    style: 'dotted', colors: ['#8AE234'], glow: null,
  }),
  frame('frame.vine', t('Enredadera', 'Vine'), t('Brotes verdes que trepan por tu nombre.', 'Green shoots climbing around your name.'), 'rare', 'tier1', { type: 'purchase' }, {
    style: 'vine', colors: ['#8AE234', '#3E8F2A'], glow: 'rgba(138,226,52,0.25)',
  }),
  frame('frame.gilded', t('Dorado', 'Gilded'), t('Marco de pan de oro con brillo suave.', 'A gold-leaf frame with a soft shine.'), 'epic', 'tier2', { type: 'purchase' }, {
    style: 'gradient', colors: ['#FFE7A3', '#FFD166', '#C8962E'], glow: 'rgba(255,209,102,0.35)',
  }),
  frame('frame.mecenas', t('Marco Mecenas', 'Supporter frame'), t('Un aro dorado y cian mientras seas Mecenas.', 'A gold-and-cyan ring while you are a supporter.'), 'exclusive', null, { type: 'subscription' }, {
    style: 'gradient', colors: ['#FFD166', '#5BC0EB', '#FFD166'], glow: 'rgba(255,209,102,0.4)',
  }),
];

export const NAME_COLORS: NameColorItem[] = [
  nameColor('name.default', t('Color estándar', 'Standard colour'), t('El blanco de siempre.', 'The usual white.'), { color: '#E6EDF3' }, { type: 'default' }),
  nameColor('name.mecenas.gold', t('Oro Mecenas', 'Supporter gold'), t('Tu nombre en oro en el ranking.', 'Your name in gold in the ranking.'), { color: '#FFD166', gradient: ['#FFE7A3', '#FFC23D'] }),
  nameColor('name.mecenas.aurora', t('Aurora Mecenas', 'Supporter aurora'), t('Tu nombre en verde menta y violeta.', 'Your name in mint green and violet.'), { color: '#7DFFC4', gradient: ['#7DFFC4', '#B892FF'] }),
  nameColor('name.mecenas.coral', t('Coral Mecenas', 'Supporter coral'), t('Tu nombre en coral y melocotón.', 'Your name in coral and peach.'), { color: '#FF9E8A', gradient: ['#FF9E8A', '#FFD3A8'] }),
];

// ───────────────────────────── Bundles & subscription ─────────────────────────────

export const BUNDLES: BundleItem[] = [
  {
    kind: 'bundle',
    id: 'bundle.founder',
    tab: 'supporter',
    name: t('Paquete fundador', 'Founder pack'),
    desc: t(
      'Pago único. Dos paletas, la placa de latón, la Luciérnaga, la Caja de música, el marco Dorado y la insignia Fundador (exclusivas del paquete). Tuyo para siempre.',
      'One-time purchase. Two palettes, the brass dish, the Firefly, the Music box, the Gilded frame and the Founder badge (pack exclusives). Yours forever.',
    ),
    rarity: 'exclusive',
    price: 'bundle',
    unlock: { type: 'purchase' },
    contains: ['palette.goldleaf', 'palette.prism', 'dish.brass', 'spark.firefly', 'music.musicbox', 'frame.gilded', 'badge.founder'],
  },
  {
    kind: 'bundle',
    id: 'bundle.ocean',
    tab: 'palettes',
    name: t('Pack Océano', 'Ocean pack'),
    desc: t('Arrecife de coral, Abisal, la placa Fosa marina, Burbujas y la Corriente abisal.', 'Coral reef, Abyssal, the Deep sea dish, Bubbles and the Abyssal current.'),
    rarity: 'epic',
    price: 'pack',
    unlock: { type: 'purchase' },
    contains: ['palette.coral', 'palette.abyssal', 'dish.deepsea', 'trail.bubbles', 'music.deepsea'],
  },
];

export const SUBSCRIPTIONS: SubscriptionItem[] = [
  {
    kind: 'subscription',
    id: 'sub.mecenas.month',
    tab: 'supporter',
    period: 'month',
    name: t('Mecenas mensual', 'Monthly supporter'),
    desc: t('Se renueva cada mes. Cancela cuando quieras.', 'Renews monthly. Cancel any time.'),
    rarity: 'exclusive',
    price: 'subMonth',
    unlock: { type: 'purchase' },
  },
  {
    kind: 'subscription',
    id: 'sub.mecenas.year',
    tab: 'supporter',
    period: 'year',
    name: t('Mecenas anual', 'Yearly supporter'),
    desc: t('Se renueva cada año. Cancela cuando quieras.', 'Renews yearly. Cancel any time.'),
    rarity: 'exclusive',
    price: 'subYear',
    unlock: { type: 'purchase' },
  },
];

/** What the subscription gives. All cosmetic; shown verbatim in the store. */
export const SUPPORTER_PERKS: { icon: string; title: Text; desc: Text }[] = [
  {
    icon: 'palette',
    title: t('Una paleta exclusiva cada mes', 'An exclusive palette every month'),
    desc: t('La reclamas al estar activo ese mes y es tuya para siempre.', 'Claim it by being active that month; it is yours forever.'),
  },
  {
    icon: 'heart',
    title: t('Insignia y marco Mecenas', 'Supporter badge and frame'),
    desc: t('Un corazón dorado junto a tu nombre en el ranking.', 'A golden heart next to your name in the ranking.'),
  },
  {
    icon: 'name',
    title: t('Color de nombre', 'Name colour'),
    desc: t('Elige oro, aurora o coral para tu nombre.', 'Pick gold, aurora or coral for your name.'),
  },
  {
    icon: 'journal',
    title: t('Una nota en tu bitácora', 'A note in your journal'),
    desc: t('Una entrada de agradecimiento escrita para ti.', 'A thank-you entry written for you.'),
  },
  {
    icon: 'clock',
    title: t('Acceso anticipado', 'Early access'),
    desc: t('Los cosméticos nuevos, dos semanas antes que nadie.', 'New cosmetics, two weeks before everyone else.'),
  },
];

/** Journal entry the game adds once, the first time a subscription becomes active. */
export const SUPPORTER_JOURNAL = {
  id: 'mecenas.thanks',
  text: t(
    'Alguien financia ahora mis noches en el laboratorio. No cambia lo que crece en la placa, pero sí cómo lo miro: con más luz. Gracias, Mecenas.',
    'Someone now funds my nights in the lab. It does not change what grows in the dish, but it changes how I look at it: with more light. Thank you, supporter.',
  ),
};

/** The promise printed on every purchase surface. */
export const FAIR_PLAY_NOTE: Text = t(
  'Solo cosmético. Nada de esta tienda da Esencia, Datos, semillas ni tiempo extra. Quien no paga juega exactamente el mismo juego.',
  'Cosmetic only. Nothing here gives Essence, Data, seeds or extra time. Players who never pay play exactly the same game.',
);

// ───────────────────────────── Index & helpers ─────────────────────────────

export const COSMETICS: CosmeticItem[] = [
  ...PALETTES,
  ...SUPPORTER_PALETTES,
  ...DISHES,
  ...HALOS,
  ...TRAILS,
  ...SPARKS,
  ...MUSICS,
  ...BADGES,
  ...FRAMES,
  ...NAME_COLORS,
];

export const ALL_ITEMS: StoreItem[] = [...COSMETICS, ...BUNDLES, ...SUBSCRIPTIONS];

const BY_ID = new Map<string, StoreItem>(ALL_ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): StoreItem | undefined {
  return BY_ID.get(id);
}

export function cosmeticById(id: string): CosmeticItem | undefined {
  const it = BY_ID.get(id);
  return it && it.kind === 'cosmetic' ? it : undefined;
}

export function itemsForSlot<S extends Slot>(slot: S): Extract<CosmeticItem, { slot: S }>[] {
  return COSMETICS.filter((i) => i.slot === slot) as Extract<CosmeticItem, { slot: S }>[];
}

export function itemsForTab(tab: StoreTab): StoreItem[] {
  return ALL_ITEMS.filter((i) => i.tab === tab);
}

/** The free starting item of each slot. */
export const DEFAULT_ITEM: Record<Slot, string> = {
  palette: 'palette.bioluma',
  dish: 'dish.nightlab',
  halo: 'halo.classic',
  trail: 'trail.drop',
  spark: 'spark.classic',
  music: 'music.nightlab',
  badge: 'badge.none',
  frame: 'frame.none',
  nameColor: 'name.default',
};

export function defaultItem<S extends Slot>(slot: S): Extract<CosmeticItem, { slot: S }> {
  return cosmeticById(DEFAULT_ITEM[slot]) as Extract<CosmeticItem, { slot: S }>;
}

/** USD price of an item, or null when not sold on its own. */
export function priceUSD(item: StoreItem): number | null {
  return item.price ? PRICE_USD[item.price] : null;
}

/** "US$ 2,99" (es) / "US$2.99" (en): reference price when no store-localised label exists. */
export function formatUSD(usd: number, lang: 'es' | 'en'): string {
  const n = usd.toFixed(2);
  return lang === 'es' ? `US$ ${n.replace('.', ',')}` : `US$${n}`;
}

/** Sum of the individual prices of what a bundle contains (items not sold alone count 0). */
export function bundleValueUSD(b: BundleItem): number {
  let sum = 0;
  for (const id of b.contains) {
    const it = itemById(id);
    if (it?.price) sum += PRICE_USD[it.price];
  }
  return Math.round(sum * 100) / 100;
}

/** Bundles that grant a given cosmetic. */
export function bundlesContaining(id: string): BundleItem[] {
  return BUNDLES.filter((b) => b.contains.includes(id));
}

/** Can it be bought directly (cosmetic, bundle or subscription with a price)? */
export function isForSale(item: StoreItem): boolean {
  return item.price !== null && item.unlock.type === 'purchase';
}

/** "YYYY-MM" (UTC) of a timestamp. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The supporter palette of the month containing `ms`. Before the first entry: the first one.
 * After the last: the list cycles by month so there is always a palette of the month.
 */
export function supporterPaletteFor(ms: number): PaletteItem {
  const key = monthKey(ms);
  const exact = SUPPORTER_PALETTES.find((p) => p.unlock.type === 'rotation' && p.unlock.month === key);
  if (exact) return exact;
  const first = SUPPORTER_PALETTES[0];
  const firstMonth = first.unlock.type === 'rotation' ? first.unlock.month : key;
  if (key < firstMonth) return first;
  const [fy, fm] = firstMonth.split('-').map(Number);
  const [y, m] = key.split('-').map(Number);
  const idx = ((y - fy) * 12 + (m - fm)) % SUPPORTER_PALETTES.length;
  return SUPPORTER_PALETTES[idx];
}

/** Product id of an item at a provider (convention when the catalog has no explicit sku). */
export function skuFor(item: StoreItem, provider: 'lemonsqueezy' | 'googleplay' | 'apple' | 'steam'): string | number | null {
  const s = item.skus?.[provider];
  if (s !== undefined) return s;
  if (provider === 'googleplay') return item.id;
  if (provider === 'apple') return `bioluma.${item.id}`;
  return null;
}

/** Is the item still in its supporters-only early-access window at `ms`? */
export function inEarlyAccess(item: StoreItem, ms: number): boolean {
  return !!item.earlyAccessUntil && ms < Date.parse(item.earlyAccessUntil);
}

/** Rarity accent colours for the UI. */
export const RARITY_COLOR: Record<CosmeticRarity, string> = {
  common: '#8B98A5',
  rare: '#5BC0EB',
  epic: '#B892FF',
  legendary: '#FFD166',
  exclusive: '#FFD166',
};

export const RARITY_NAME: Record<CosmeticRarity, Text> = {
  common: t('Común', 'Common'),
  rare: t('Rara', 'Rare'),
  epic: t('Épica', 'Epic'),
  legendary: t('Legendaria', 'Legendary'),
  exclusive: t('Exclusiva', 'Exclusive'),
};

export const SLOT_NAME: Record<Slot, Text> = {
  palette: t('Paleta de materia', 'Matter palette'),
  dish: t('Placa', 'Dish'),
  halo: t('Halo', 'Halo'),
  trail: t('Rastro de siembra', 'Seed trail'),
  spark: t('Destello', 'Spark'),
  music: t('Ambiente musical', 'Music ambience'),
  badge: t('Insignia', 'Badge'),
  frame: t('Marco', 'Frame'),
  nameColor: t('Color de nombre', 'Name colour'),
};
