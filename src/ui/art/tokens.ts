/**
 * Bioluma design tokens (docs/ARTE.md §3–§4, §8). One source of truth for colour, type, radius,
 * spacing, elevation, layers and motion; `art.css` is generated from this file (see
 * `tokensCss()`, kept in sync by tokens.test.ts) so integrators can map their module variables
 * (--rt-*, --mo-*, --bl ui.css vars) onto `--bl-*`.
 *
 * Concept: a polar research station at night. Cold blue life in the dish (cyan), warm candlelight
 * from VELA (candle), gold for the Spark, aurora mint for Datos, moon lavender for the Night.
 * GDD §14 values are kept where they exist (bg, surface, text, accent, warn, danger, good, gold).
 */

export type ThemeName = 'dark' | 'light';

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
  /** VELA's candle: guidance, story, Encargos. */
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
    candle: '#ffb86b',
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

/** Fills that are always bright, used as backgrounds of badges / dots / glows (not as text on light). */
export const GLOW = {
  essence: '#5bc0eb',
  datos: '#5ee6c8',
  spark: '#ffd166',
  candle: '#ffb86b',
  candleCore: '#fff3d6',
  night: '#c9d1ff',
  good: '#8ae234',
  danger: '#e4572e',
} as const;

export type RouteId = 'time' | 'dropper' | 'dish' | 'life' | 'discovery' | 'worlds' | 'spark';

/**
 * Route colours of the research tree (docs/CICLO.md §4.1): celeste, turquesa, lavanda, rosa,
 * naranja, violeta, dorado. Dark values are the ones the tree already uses (continuity); light
 * values are deepened to AA on white.
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
    candle: '0 0 0 1px rgb(255 184 107 / .35), 0 0 24px rgb(255 184 107 / .22)',
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
