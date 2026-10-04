/**
 * Secrets & easter eggs: shared types (pure data, no DOM).
 * Spoilers and the hint ladder of every secret: docs/SECRETS.md.
 */
import type { Text } from '../core/types';

export type SecretCategory = 'species' | 'homage' | 'gesture' | 'touch' | 'patience' | 'sky' | 'meta';

export const SECRET_CATEGORIES: readonly SecretCategory[] = ['species', 'homage', 'gesture', 'touch', 'patience', 'sky', 'meta'];

export type SecretId =
  // hidden species
  | 'ignis'
  | 'phantasma'
  | 'cryptid'
  // homages
  | 'chan'
  | 'conway'
  | 'answer'
  | 'maximizer'
  | 'goldenStreak'
  // gestures drawn on the dish
  | 'spiral'
  | 'heart'
  | 'halo'
  | 'infinity'
  // touches / keys / sensors
  | 'konami'
  | 'logo'
  | 'patience'
  | 'shake'
  // patience / behaviour
  | 'oldFriend'
  | 'seven'
  | 'silence'
  | 'sterile'
  | 'palindrome'
  | 'afk'
  // sky / calendar / rare visuals
  | 'fullMoon'
  | 'birthday'
  | 'aurora'
  | 'orion'
  // meta
  | 'basement';

/** Cosmetic dish colormaps (free; never affect the simulation or the economy). */
export type CosmeticId = 'ember' | 'phantom' | 'selene' | 'phosphor' | 'aurora' | 'abyss' | 'gilded';

/** Glyph drawn in the reveal seal and the basement list (see src/ui/secrets/glyphs.ts). */
export type GlyphId =
  | 'orb'
  | 'flame'
  | 'ghost'
  | 'eye'
  | 'heartGlyph'
  | 'spiralGlyph'
  | 'circleGlyph'
  | 'infinityGlyph'
  | 'gliderGlyph'
  | 'arrows'
  | 'taps'
  | 'hold'
  | 'wave'
  | 'hourglass'
  | 'seven'
  | 'void'
  | 'flask'
  | 'mirror'
  | 'pause'
  | 'moon'
  | 'cake'
  | 'aurora'
  | 'belt'
  | 'door'
  | 'thanks'
  | 'answer'
  | 'burst'
  | 'sparks'
  | 'keyhole';

/** [cryptic, clearer, explicit]. */
export type HintLadder = readonly [Text, Text, Text];

export interface SecretDef {
  id: SecretId;
  category: SecretCategory;
  name: Text;
  /** One cryptic line shown under the name in the reveal and in the basement. */
  flavor: Text;
  /** Journal (Bitácora) entry granted when found: terse first person, GDD §3 tone. */
  journal: Text;
  /** Short reaction for the companion (VELA) the story system may voice. ≤ 12 words. */
  companion: Text;
  hints: HintLadder;
  glyph: GlyphId;
  /** Cosmetic unlocked by this secret, if any. */
  cosmetic?: CosmeticId;
  /** Latin catalog name, for hidden species (shown in italics in the reveal). */
  latin?: string;
  /** Catalog code, for hidden species (the reveal draws its portrait). */
  code?: string;
  /** Intentionally easy (may be found in a normal first session). */
  easy?: boolean;
}

/** What the UI lists (basement panel, settings badge). */
export interface SecretView {
  id: SecretId;
  category: SecretCategory;
  name: Text;
  flavor: Text;
  /** Highest hint revealed so far (tier `hintLevel`). */
  hint: Text;
  /** Every hint revealed so far, tier 0..hintLevel. */
  hints: Text[];
  /** 0..2. */
  hintLevel: number;
  hintCount: number;
  found: boolean;
  /** Epoch ms, null while hidden. */
  foundAt: number | null;
  glyph: GlyphId;
  cosmetic: CosmeticId | null;
  latin: string | null;
  code: string | null;
  easy: boolean;
}

export interface GridPt {
  x: number;
  y: number;
}

export interface TimedPt extends GridPt {
  /** ms (any epoch); optional. */
  t?: number;
}

export type MoteHue = 'gold' | 'cyan' | 'green' | 'violet' | 'pink' | 'silver' | 'ember';

/**
 * Overlay effects. Positions are grid cells (the UI maps them with the shared Camera).
 * They decorate the dish; they never change the simulation (pillar 1).
 */
export type SecretEffect =
  | { kind: 'aurora'; duration: number }
  | { kind: 'constellation'; points: GridPt[]; label: Text | null; duration: number; closed: boolean }
  | { kind: 'motes'; count: number; hue: MoteHue; duration: number; from: 'top' | 'bottom' | 'center' | 'swirl' }
  | { kind: 'trace'; points: GridPt[]; color: MoteHue; duration: number }
  | { kind: 'halo'; x: number; y: number; r: number; color: MoteHue; duration: number }
  | { kind: 'glider'; x: number; y: number; duration: number }
  | { kind: 'moon'; illumination: number; waxing: boolean; duration: number }
  | { kind: 'pulse'; color: MoteHue; beats: number; duration: number }
  | { kind: 'whisper'; text: Text; duration: number }
  | { kind: 'ripple'; x: number | null; y: number | null; duration: number }
  /** Ask the HUD to animate the Bioluma logo (Orbium wakes up). UI-only. */
  | { kind: 'logoWake'; duration: number };

export type EffectKind = SecretEffect['kind'];

/** Colormap stops in the same format as core/palette MATTER_STOPS: [value, r, g, b, alpha]. */
export type ColormapStops = [number, number, number, number, number][];

export interface Colormap {
  id: CosmeticId;
  name: Text;
  stops: ColormapStops;
}

/** Events of the secrets emitter (subscribe with `secrets.on(type, fn)`). */
export interface SecretEvents {
  /** A secret was found. `index` is 1-based (how many found now). */
  found: { secret: SecretView; def: SecretDef; index: number; total: number; cue: string; companion: Text };
  effect: SecretEffect;
  unlockCosmetic: { id: CosmeticId; colormap: Colormap };
  /** Add this entry to the journal (Bitácora). `id` is unique per secret ("secret.<id>"). */
  grantJournal: { id: string; text: Text };
  /** Every secret found (fires once per save). Hook for the story's secret ending. */
  allFound: { total: number };
  /** Found count / basement availability changed (settings badge). */
  progress: { found: number; total: number; basementUnlocked: boolean; bonus: number };
  /** The player picked a dish colormap in the basement (null = default). */
  colormap: { id: CosmeticId | null; colormap: Colormap | null };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Persisted state (JSON). Fold into the main save with serialize()/load(). */
export interface SecretsSave {
  v: 1;
  /** id → epoch ms found. */
  found: Partial<Record<SecretId, number>>;
  /** id → hint tier revealed (0..2). */
  hints: Partial<Record<SecretId, number>>;
  cosmetics: CosmeticId[];
  colormap: CosmeticId | null;
  /** Manual seeds counted by the secrets module (for "answer"). */
  manualSeeds: number;
  goldenStreak: number;
  /** A stable creature has been seen at least once (for "silence"). */
  hadLife: boolean;
  allFoundEmitted: boolean;
}
