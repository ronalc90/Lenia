/**
 * Bioluma design tokens (docs/ARTE.md §3–§4, §8). One source of truth for colour, type, radius,
 * spacing, elevation, layers and motion; `art.css` is generated from this file (see
 * `tokensCss()`, kept in sync by tokens.test.ts) so integrators can map their module variables
 * (--rt-*, --mo-*, --bl ui.css vars) onto `--bl-*`.
 *
 * Concept: a polar research station at night. Cold blue life in the dish (cyan), the warm light of
 * VELA's pilot lamp (candle), gold for the Spark, aurora mint for Datos, moon lavender for the Night.
 * GDD §14 values are kept where they exist (bg, surface, text, accent, warn, danger, good, gold).
 * Scientific realism (ADR-029, docs/ARTE-REALISTA.md §6.1) adds materials, screen inks, lamp
 * temperatures, the scientific plate (lámina) and the line-weight scale at the end of the colour block.
 */

export type ThemeName = 'dark' | 'light';

/**
 * Filament lamp colours by colour temperature (K → sRGB), Tanner Helland's blackbody fit
 * (docs/ARTE-REALISTA.md §6.1, R5); `kelvin()` in ./vector reproduces them. The same in both themes:
 * a lamp is a light, never ink on a light surface (#ffb87b is 1.6:1 on white).
 */
export const LAMP = {
  1900: '#ff8400',
  2200: '#ff9227',
  2700: '#ffa757',
  3000: '#ffb16e',
  3200: '#ffb87b',
  3600: '#ffc392',
} as const;

export type LampK = keyof typeof LAMP;

/** Semantic colour roles. Every text role is AA (≥ 4.5:1) on bg, surface and surface2. */
export interface Palette {
  /** Deepest night: page edges, behind the dish, scrims. */
  night: string;
  /** App background (GDD §14). */
  bg: string;
  /** Panels and sheets (GDD §14). */
  surface: string;
  /** Raised cards inside panels. */
  surface2: string;
  /** Pressed / selected cards, inputs. */
  surface3: string;
  /** Hairlines (opaque equivalent of 10 % ink on surface). */
  line: string;
  /** Strong lines, outlines of controls. */
  line2: string;
  /** Main text. */
  text: string;
  /** Secondary text (descriptions). */
  text2: string;
  /** Tertiary text: only for non-essential labels (≥ 3:1). */
  text3: string;
  /** Life / interactive accent: links, focus, primary buttons (GDD §14 #5BC0EB). */
  accent: string;
  /** Fill of the primary button (same hue as accent, tuned for the label contrast). */
  accentFill: string;
  /** Label colour on accentFill. */
  accentInk: string;
  /** VELA's lamp (named candle for history): guidance, story, Encargos. Dark: the 3200 K lamp (ADR-029). */
  candle: string;
  /** The Spark and rewards (GDD §14 #FFD166 in dark). */
  gold: string;
  /** Datos (polar aurora). */
  aurora: string;
  /** The Night (prestige, chapters). */
  moon: string;
  /** New / success / "you can buy it now". Never a big fill. */
  good: string;
  warn: string;
  danger: string;
  /** Frost on glass: rims, dividers in "glass" panels. */
  frost: string;
}

export const PALETTE: Record<ThemeName, Palette> = {
  dark: {
    night: '#06090d',
    bg: '#0b0e12',
    surface: '#141a21',
    surface2: '#1b232c',
    surface3: '#24303c',
    line: '#28313b',
    line2: '#3a4652',
    text: '#e6edf3',
    text2: '#a7b3bf',
    text3: '#7d8995',
    accent: '#5bc0eb',
    accentFill: '#5bc0eb',
    accentInk: '#04202e',
    candle: LAMP[3200],
    gold: '#ffd166',
    aurora: '#5ee6c8',
    moon: '#c9d1ff',
    good: '#8ae234',
    warn: '#f2a541',
    danger: '#ff7a5c',
    frost: '#cfe8f5',
  },
  light: {
    night: '#dbe3eb',
    bg: '#eef2f6',
    surface: '#ffffff',
    surface2: '#f5f8fb',
    surface3: '#e8eef4',
    line: '#e1e7ed',
    line2: '#c3ccd5',
    text: '#0f1720',
    text2: '#44505d',
    text3: '#6b7784',
    accent: '#0a72a6',
    accentFill: '#0a72a6',
    accentInk: '#ffffff',
    candle: '#a54f08',
    gold: '#855600',
    aurora: '#08745e',
    moon: '#4a4ea6',
    good: '#2b7210',
    warn: '#8f4d00',
    danger: '#bf3517',
    frost: '#527d97',
  },
};

// ── Scientific realism (ADR-029, docs/ARTE-REALISTA.md §6.1) ─────────────────────────────────────────

/**
 * Instrument materials: gradient stops in the order the bible gives them (top to bottom, or across the
 * shape), with their offsets in MATERIAL_AT. The same in both themes: an object does not change with the
 * UI theme. coat = VELA's warm white powder coat (§4.3) · anod = anodised bezel and frames (§3.6) ·
 * alu = brushed aluminium of engraved plates · chrome = the 5-stop cylinder ramp of handles and tubes
 * (§3.5-2: dark edge · specular · local · reflected light · dark edge) · glass = a screen, always night ·
 * rubber = feet, cables · aluDark = the label-maker tape of price chips (§6.9).
 */
export const MATERIAL = {
  coat: ['#f4f2ed', '#e8e5de', '#d9d5cc', '#c3beb3'],
  anod: ['#3b434a', '#2b3238', '#1f252a', '#161a1e'],
  alu: ['#b9bcbf', '#e8eaeb', '#dcdfe0', '#a9adb1'],
  chrome: ['#3a3d40', '#f7f7f5', '#a4a8ab', '#c9dbe4', '#2e3134'],
  glass: '#03100d',
  rubber: ['#3a3c3e', '#141516'],
  aluDark: '#2a3036',
} as const;

/** Stop offsets (0..1) of each multi-stop MATERIAL, from §4.3, §3.6 and §3.5-2. */
export const MATERIAL_AT = {
  coat: [0, 0.12, 0.6, 1],
  anod: [0, 0.08, 0.55, 1],
  alu: [0, 0.45, 0.55, 1],
  chrome: [0, 0.28, 0.5, 0.82, 1],
  rubber: [0, 1],
} as const;

/**
 * Phosphor inks ON an instrument screen (always the night glass, both themes): body and hot core
 * (§4.3; 505 nm phosphor, L7). teal = default (= aurora) · amber = worried (= warn) · red = alarm ·
 * gold = proud (= the Spark). Off the screen, text uses INK.
 */
export const SCREEN = {
  teal: { body: '#5ee6c8', core: '#dcfff6' },
  amber: { body: '#f2a541', core: '#ffe2b8' },
  red: { body: '#ff5a4a', core: '#ffd0c8' },
  gold: { body: '#ffd166', core: '#fff1c2' },
} as const;

/** The screen inks as text off the screen (labels, legends, readouts on panels): AA on every background. */
export const INK: Record<ThemeName, { teal: string; amber: string; red: string }> = {
  dark: { teal: SCREEN.teal.body, amber: SCREEN.amber.body, red: SCREEN.red.body },
  light: { teal: '#08745e', amber: '#8f4d00', red: '#bf3517' },
};

/**
 * What a number means, by colour (ADR-030, docs/CLARIDAD2.md §2.11), one rule for the whole UI:
 *   cost   amber, with ↑ or the price ("4 luz", "Nutrientes · 16", "Cuesta 30 Datos");
 *   gain   green, with × or + ("+25 %", "+10 Datos"; a discount is a gain: "−15 % ↓");
 *   off    grey ×1, a factor that does nothing now (text3: only for non-essential labels, ≥ 3:1);
 *   danger red !, the collision warning and VELA's alarm.
 * cost / gain / danger are AA text on bg, surface, surface2 and the plate paper (tokens.test.ts). `danger` IS the
 * palette's role (`--bl-danger`, already in use), listed here so the four meanings live together; the CSS gets
 * `--bl-cost`, `--bl-gain` and `--bl-off`.
 */
export const MEANING: Record<ThemeName, { cost: string; gain: string; off: string; danger: string }> = {
  dark: { cost: INK.dark.amber, gain: PALETTE.dark.good, off: PALETTE.dark.text3, danger: PALETTE.dark.danger },
  light: { cost: INK.light.amber, gain: PALETTE.light.good, off: PALETTE.light.text3, danger: PALETTE.light.danger },
};

/** Light the dish bounces onto nearby objects from below (layer 4 of §3.2): rgb(91, 192, 235). */
export const BOUNCE = { dish: '#5bc0eb' } as const;

/**
 * The scientific plate (lámina, §6.5): paper, ink, secondary ink, frame and crop-mark rule. Ink and ink2
 * are AA on the paper (tokens.test.ts); the rule is decorative.
 */
export const PLATE: Record<ThemeName, { paper: string; ink: string; ink2: string; rule: string }> = {
  dark: { paper: '#10161c', ink: '#dfe7ee', ink2: '#9aa6b2', rule: '#2a3540' },
  light: { paper: '#f3efe6', ink: '#1d232a', ink2: '#55606b', rule: '#cfc8b8' },
};

/** Categorical colours for charts inside plates: Wong (Nature Methods 8, 441, 2011; F4), colour-blind safe. Fills, never text. */
export const CHART_WONG = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'] as const;

/**
 * Line weights in CSS px at any DPR (§3.8). `hair` is one device pixel (1 / dpr CSS px), so it is not a
 * constant; see `hairline()` in ./vector. Contour / detail ≈ 1.7 (I1–I2). `leaderDot` is the dot at the
 * end of a plate's leader line; `icon` is ADR-024's stroke on the 24 grid.
 */
export const LINE = { fine: 0.5, detail: 0.75, contour: 1.25, leader: 1, leaderDot: 2.5, icon: 1.75, emph: 2 } as const;

export type LineToken = keyof typeof LINE;

/** Scale of the plates' scale bar (§6.5 rule 4): 1 cell = 0.7 mm, so the Ø128 dish is a 90-mm Petri dish. */
export const PLATE_MM_PER_CELL = 0.7;

/** Fills that are always bright, used as backgrounds of badges / dots / glows (not as text on light). */
export const GLOW = {
  essence: '#5bc0eb',
  datos: '#5ee6c8',
  spark: '#ffd166',
  candle: LAMP[3200],
  candleCore: '#fff3d6',
  night: '#c9d1ff',
  good: '#8ae234',
  danger: '#e4572e',
} as const;

export type RouteId = 'time' | 'dropper' | 'dish' | 'life' | 'discovery' | 'worlds' | 'spark' | 'collect';

/**
 * Route colours of the research tree (docs/CICLO.md §4.1): celeste, turquesa, lavanda, rosa,
 * naranja, violeta, dorado, and the instrument silver of ↓ Recoger (ADR-030: brushed aluminium,
 * between the MATERIAL.alu stops; the pipettes are instruments, never living things). Dark values are
 * the ones the tree already uses (continuity); light values are deepened to AA on white.
 */
export const ROUTE_COLOR: Record<ThemeName, Record<RouteId | 'core', string>> = {
  dark: {
    time: '#5bc0eb',
    dropper: '#36d6c3',
    dish: '#8c9eff',
    life: '#ff7fa8',
    discovery: '#ffa552',
    worlds: '#c792ff',
    spark: '#ffd166',
    collect: '#c3c8cc',
    core: '#e6edf3',
  },
  light: {
    time: '#0a6f9f',
    dropper: '#087567',
    dish: '#3f4fc4',
    life: '#b1235a',
    discovery: '#a14b06',
    worlds: '#7131c0',
    spark: '#855600',
    collect: '#55606b',
    core: '#0f1720',
  },
};

/** Behaviour colours (core/palette BEHAVIOR_COLOR in dark; deepened for light). Shape always carries the meaning too. */
export const BEHAVIOR_TONE: Record<ThemeName, Record<'still' | 'pulsing' | 'swimmer' | 'spinner' | 'divider' | 'colony', string>> = {
  dark: { still: '#5bc0eb', pulsing: '#b892ff', swimmer: '#8ae234', spinner: '#ffd166', divider: '#ff8fab', colony: '#f2a541' },
  light: { still: '#0a6f9f', pulsing: '#6a3fcf', swimmer: '#2b7210', spinner: '#855600', divider: '#b1235a', colony: '#8f4d00' },
};

/** Typefaces (docs/ARTE.md §4). Display = Fraunces (soft serif, OFL), UI = Inter, instruments = JetBrains Mono. */
export const FONT = {
  display: "Fraunces, 'Fraunces Fallback', Georgia, 'Times New Roman', serif",
  ui: "Inter, 'Inter Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
} as const;

/** Google Fonts URL with exactly the weights the bible uses (one request). */
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,500..800,100;1,9..144,500..700,100&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap';

/** Type scale (px, line-height px). Major third (×1.25) from 16, rounded to the 2-px grid. */
export const TYPE = {
  caption: { size: 13, line: 18, weight: 600 },
  small: { size: 14, line: 20, weight: 500 },
  body: { size: 16, line: 24, weight: 500 },
  lead: { size: 18, line: 26, weight: 600 },
  title: { size: 22, line: 28, weight: 700 },
  headline: { size: 28, line: 34, weight: 700 },
  display: { size: 36, line: 40, weight: 700 },
  hero: { size: 48, line: 52, weight: 800 },
} as const;

export type TypeRole = keyof typeof TYPE;

/**
 * Corner radii (px), five and no more (docs/ARTE-PULIDO.md B-2): chips 8, buttons and inner tiles 12,
 * cards and the primary button 16, sheet tops and Momento cards 24, pills 999. A nested radius is the
 * outer one minus the padding (a 16 card with 12 of padding holds 4–8 corners, never 14). Icons use 2
 * (outer) and 1 (inner) on their own 24 grid.
 */
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Spacing (px): a 4-pt grid; screen gutters are `md` (16). */
export const SPACE = { xxs: 2, xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Minimum touch target (px). */
export const TOUCH = 48;

/**
 * Layer order (z-index). Fixes the audit bug where dish toasts and tap ripples drew over modals:
 * everything that belongs to the dish stays below `sheet`.
 */
export const LAYER = {
  dish: 0,
  dishFx: 5,
  dishLabels: 10,
  hud: 20,
  /** Esencia motes flying from the dish to the HUD (ARTE-PULIDO A-5): above the HUD, below sheets. */
  fx: 25,
  sheet: 30,
  toast: 40,
  dialogue: 50,
  modal: 60,
  celebration: 70,
  cinematic: 80,
} as const;

/**
 * Elevation (docs/ARTE-PULIDO.md B-3, after Comeau "Designing beautiful shadows" and Material's dark
 * theme): one light from the top left (the shader's LIGHT), layered shadows tinted with the background's
 * hue (215°), never pure black; higher = larger offset and blur, lower opacity per layer. In the dark
 * the surface lightens with elevation (surface → surface2), so the shadow only has to whisper.
 *   elev1 cards on the page · elev2 sheets, drawer, VELA, toasts · elev3 Momento cards, modals.
 * Glows: a 1-px ring plus a soft halo, only for the spotlight, the Spark and VELA.
 */
export const ELEVATION: Record<ThemeName, { elev0: string; elev1: string; elev2: string; elev3: string }> = {
  dark: {
    elev0: 'none',
    elev1: 'inset 0 1px 0 rgb(207 232 245 / .05), 0 1px 2px hsl(215 50% 2% / .5), 0 2px 6px hsl(215 50% 2% / .3)',
    elev2: 'inset 0 1px 0 rgb(207 232 245 / .06), 0 2px 4px hsl(215 50% 2% / .35), 0 8px 16px hsl(215 50% 2% / .35), 0 16px 32px hsl(215 50% 2% / .3)',
    elev3:
      'inset 0 1px 0 rgb(207 232 245 / .06), 0 2px 4px hsl(215 50% 2% / .35), 0 8px 16px hsl(215 50% 2% / .35), 0 16px 32px hsl(215 50% 2% / .3), 0 32px 64px hsl(215 50% 2% / .35)',
  },
  light: {
    elev0: 'none',
    elev1: 'inset 0 1px 0 rgb(255 255 255 / .7), 0 1px 2px hsl(215 30% 30% / .14), 0 2px 6px hsl(215 30% 30% / .08)',
    elev2: 'inset 0 1px 0 rgb(255 255 255 / .7), 0 2px 4px hsl(215 30% 30% / .1), 0 8px 16px hsl(215 30% 30% / .1), 0 16px 32px hsl(215 30% 30% / .08)',
    elev3:
      'inset 0 1px 0 rgb(255 255 255 / .7), 0 2px 4px hsl(215 30% 30% / .1), 0 8px 16px hsl(215 30% 30% / .1), 0 16px 32px hsl(215 30% 30% / .08), 0 32px 64px hsl(215 30% 30% / .12)',
  },
};

/** The three glows (ring + halo) per theme: the life accent, VELA's candle, the Spark's gold. */
export const GLOW_SHADOW: Record<ThemeName, { accent: string; candle: string; gold: string }> = {
  dark: {
    accent: '0 0 0 1px rgb(91 192 235 / .35), 0 0 24px rgb(91 192 235 / .22)',
    candle: '0 0 0 1px rgb(255 184 123 / .35), 0 0 24px rgb(255 184 123 / .22)',
    gold: '0 0 0 1px rgb(255 209 102 / .35), 0 0 24px rgb(255 209 102 / .22)',
  },
  light: {
    accent: '0 0 0 1px rgb(10 114 166 / .35), 0 0 24px rgb(10 114 166 / .16)',
    candle: '0 0 0 1px rgb(165 79 8 / .35), 0 0 24px rgb(165 79 8 / .14)',
    gold: '0 0 0 1px rgb(133 86 0 / .35), 0 0 24px rgb(133 86 0 / .14)',
  },
};

/** @deprecated names kept while the modules migrate (`--bl-shadow-*` = elevation 1/2/3 and the accent glow). */
export const SHADOW: Record<ThemeName, { sm: string; md: string; lg: string; glow: string }> = {
  dark: { sm: ELEVATION.dark.elev1, md: ELEVATION.dark.elev2, lg: ELEVATION.dark.elev3, glow: GLOW_SHADOW.dark.accent },
  light: { sm: ELEVATION.light.elev1, md: ELEVATION.light.elev2, lg: ELEVATION.light.elev3, glow: GLOW_SHADOW.light.accent },
};

/**
 * Motion durations (ms), the whole vocabulary (docs/ARTE-PULIDO.md B-2, NN/g "Animation duration",
 * Material 3 motion tokens): exits are shorter than entrances, nothing the player sees often lasts long.
 *   tap 90 finger down · quick 140 colour/opacity of a state · base 200 small appear/disappear ·
 *   exit 160 every exit · sheet 300 in / sheetOut 200 out · card 320 a value pops ·
 *   story 480 VELA, banners · celebrate 700 a purchase, Datos, a new species.
 */
export const DURATION = { tap: 90, quick: 140, base: 200, exit: 160, sheet: 300, sheetOut: 200, card: 320, story: 480, celebrate: 700 } as const;
/** Stagger between list items (ms) and the most items that wait their turn (the rest enter with the last). */
export const STAGGER = { step: 40, max: 6 } as const;
export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
} as const;

/**
 * Springs (M3 Expressive spatial springs, mass 1), as CSS `linear()` curves sampled from the simulated
 * spring and the duration they take to settle (docs/ARTE-PULIDO.md B-2):
 *   fast    stiffness 800, damping 0.6: overshoots 9 % (a button let go, a pop, a heartbeat)
 *   default stiffness 380, damping 0.8: overshoots 1.4 % (cards and sheets settling, VELA)
 *   slow    stiffness 200, damping 0.8: same shape, longer (big celebrations, the Night)
 * Movement only: colour and opacity never spring (Comeau). Browsers without `linear()` (Safari < 17.2)
 * fall back to `pop` (fast) and `enter` (default, slow) through @supports in art.css.
 */
const SPRING_FAST_POINTS = [
  0, 0.103, 0.309, 0.546, 0.758, 0.914, 1.02, 1.074, 1.093, 1.087, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 0.992, 0.992, 0.993, 0.995, 0.997, 0.999, 1, 1, 1,
] as const;
const SPRING_DEFAULT_POINTS = [
  0, 0.066, 0.21, 0.374, 0.532, 0.669, 0.781, 0.864, 0.924, 0.965, 0.99, 1.004, 1.012, 1.014, 1.014, 1.012, 1.01, 1.008, 1.005, 1.004, 1.002, 1.001, 1.001, 1, 1,
] as const;
export const SPRING = {
  fast: { ms: 400, points: SPRING_FAST_POINTS, css: `linear(${SPRING_FAST_POINTS.join(', ')})`, fallback: EASING.pop },
  default: { ms: 480, points: SPRING_DEFAULT_POINTS, css: `linear(${SPRING_DEFAULT_POINTS.join(', ')})`, fallback: EASING.enter },
  slow: { ms: 650, points: SPRING_DEFAULT_POINTS, css: `linear(${SPRING_DEFAULT_POINTS.join(', ')})`, fallback: EASING.enter },
} as const;

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

function themeVars(theme: ThemeName): string[] {
  const p = PALETTE[theme];
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) out.push(`--bl-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(ROUTE_COLOR[theme])) out.push(`--bl-route-${k}: ${v};`);
  for (const [k, v] of Object.entries(BEHAVIOR_TONE[theme])) out.push(`--bl-beh-${k}: ${v};`);
  for (const [k, v] of Object.entries(ELEVATION[theme])) out.push(`--bl-elev-${k.slice(4)}: ${v};`);
  for (const [k, v] of Object.entries(GLOW_SHADOW[theme])) out.push(`--bl-glow-${k}: ${v};`);
  for (const [k, v] of Object.entries(INK[theme])) out.push(`--bl-ink-${k}: ${v};`);
  for (const [k, v] of Object.entries(PLATE[theme])) out.push(`--bl-plate-${kebab(k)}: ${v};`);
  // --bl-danger is emitted with the palette above (MEANING.danger is the same value).
  for (const k of ['cost', 'gain', 'off'] as const) out.push(`--bl-${k}: ${MEANING[theme][k]};`);
  for (const k of Object.keys(SHADOW[theme])) out.push(`--bl-shadow-${k}: var(${k === 'glow' ? '--bl-glow-accent' : `--bl-elev-${({ sm: 1, md: 2, lg: 3 } as Record<string, number>)[k]}`});`);
  out.push(`--bl-ic-fill: ${theme === 'dark' ? 0.2 : 0.14};`);
  return out;
}

/** px → rem at the browser default 16 px, so the game's "Large text" (root 112.5 %) scales every size. */
const rem = (px: number): string => `${+(px / 16).toFixed(4)}rem`;

/** The generated stylesheet (art.css). */
export function tokensCss(): string {
  const shared: string[] = [];
  // Always-bright fills (badges, dots): `--bl-lum-*` (the `--bl-glow-*` names are the glow shadows).
  for (const [k, v] of Object.entries(GLOW)) shared.push(`--bl-lum-${kebab(k)}: ${v};`);
  shared.push(`--bl-font-display: ${FONT.display};`);
  shared.push(`--bl-font-ui: ${FONT.ui};`);
  shared.push(`--bl-font-mono: ${FONT.mono};`);
  for (const [k, v] of Object.entries(TYPE)) {
    shared.push(`--bl-fs-${k}: ${rem(v.size)};`);
    shared.push(`--bl-lh-${k}: ${rem(v.line)};`);
    shared.push(`--bl-fw-${k}: ${v.weight};`);
  }
  for (const [k, v] of Object.entries(RADIUS)) shared.push(`--bl-r-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(SPACE)) shared.push(`--bl-s-${k}: ${v}px;`);
  shared.push(`--bl-touch: ${TOUCH}px;`);
  for (const [k, v] of Object.entries(LAYER)) shared.push(`--bl-z-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(DURATION)) shared.push(`--bl-t-${kebab(k)}: ${v}ms;`);
  shared.push(`--bl-stagger: ${STAGGER.step}ms;`);
  for (const [k, v] of Object.entries(EASING)) shared.push(`--bl-ease-${k}: ${v};`);
  for (const [k, v] of Object.entries(SPRING)) {
    shared.push(`--bl-spring-${k}: ${v.css};`);
    shared.push(`--bl-t-spring-${k}: ${v.ms}ms;`);
  }
  // Scientific realism (ADR-029): theme-independent instrument colours; multi-stop materials are numbered.
  for (const [k, v] of Object.entries(MATERIAL)) {
    if (typeof v === 'string') shared.push(`--bl-mat-${kebab(k)}: ${v};`);
    else v.forEach((c, i) => shared.push(`--bl-mat-${kebab(k)}-${i + 1}: ${c};`));
  }
  for (const [k, v] of Object.entries(SCREEN)) {
    shared.push(`--bl-screen-${k}: ${v.body};`);
    shared.push(`--bl-screen-${k}-core: ${v.core};`);
  }
  for (const [k, v] of Object.entries(LAMP)) shared.push(`--bl-lamp-${k}: ${v};`);
  for (const [k, v] of Object.entries(BOUNCE)) shared.push(`--bl-bounce-${k}: ${v};`);
  CHART_WONG.forEach((c, i) => shared.push(`--bl-chart-${i + 1}: ${c};`));
  for (const [k, v] of Object.entries(LINE)) shared.push(`--bl-line-${kebab(k)}: ${v}px;`);
  const block = (sel: string, lines: string[]) => `${sel} {\n${lines.flatMap((l) => l.split('\n')).map((l) => '  ' + l).join('\n')}\n}\n`;
  const springFallback = Object.entries(SPRING).map(([k, v]) => `--bl-spring-${k}: ${v.fallback};`);
  // Reduce motion (the OS or the game's own setting, which puts .bl-rm on <html>): every entrance and
  // exit is an 80-ms fade (docs/ARTE.md §7), springs do not overshoot, lists do not stagger.
  const reduced = [
    ...Object.keys(DURATION).map((k) => `--bl-t-${kebab(k)}: ${k === 'tap' ? 1 : 80}ms;`),
    ...Object.keys(SPRING).map((k) => `--bl-t-spring-${k}: 80ms;`),
    ...Object.keys(SPRING).map((k) => `--bl-spring-${k}: linear;`),
    '--bl-stagger: 0ms;',
  ];
  return [
    '/* GENERATED from src/ui/art/tokens.ts by tokensCss(); edit the TS file, then run\n' +
      '   `node --experimental-strip-types --no-warnings src/ui/art/write-css.mjs` (tokens.test.ts fails while they differ). */\n',
    block(':root', [...shared, ...themeVars('dark'), 'color-scheme: dark;']),
    block(":root[data-theme='light'],\n[data-theme='light']", [...themeVars('light'), 'color-scheme: light;']),
    '/* Surfaces that are always night (the dish, the title screen, cinematics). */\n',
    block(".art-force-dark,\n[data-theme='light'] .art-force-dark", [...themeVars('dark'), 'color-scheme: dark;']),
    '/* Icons: duotone fill layer (docs/ARTE.md §5). */\n',
    block('.bl-ic .f', ['fill: currentColor;', 'stroke: none;', 'opacity: var(--bl-ic-fill);']),
    '/* Springs need linear() (Chrome 113, Firefox 112, Safari 17.2); older engines get the nearest bezier. */\n',
    block('@supports not (animation-timing-function: linear(0, 1))', [block(':root', springFallback).trimEnd()]),
    block('@media (prefers-reduced-motion: reduce)', [block(':root', reduced).trimEnd()]),
    block(':root.bl-rm,\n.bl-rm,\n.rm', reduced),
  ].join('\n');
}
