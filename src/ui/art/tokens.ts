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

/** Corner radii (px). Icons use 2 (outer) and 1 (inner) on their 24 grid. */
export const RADIUS = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

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
  sheet: 30,
  toast: 40,
  dialogue: 50,
  modal: 60,
  celebration: 70,
  cinematic: 80,
} as const;

/** Elevation shadows per theme. */
export const SHADOW: Record<ThemeName, { sm: string; md: string; lg: string; glow: string }> = {
  dark: {
    sm: '0 1px 2px rgba(0,0,0,.5)',
    md: '0 6px 18px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.5)',
    lg: '0 18px 48px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.5)',
    glow: '0 0 0 1px rgba(91,192,235,.35), 0 0 24px rgba(91,192,235,.25)',
  },
  light: {
    sm: '0 1px 2px rgba(24,36,52,.12)',
    md: '0 6px 18px rgba(24,36,52,.12), 0 1px 2px rgba(24,36,52,.1)',
    lg: '0 18px 48px rgba(24,36,52,.16), 0 2px 6px rgba(24,36,52,.1)',
    glow: '0 0 0 1px rgba(10,114,166,.35), 0 0 18px rgba(10,114,166,.18)',
  },
};

/** Motion durations (ms) and easings (docs/ARTE.md §7). Mirrored by motion.ts. */
export const DURATION = { tap: 90, quick: 140, base: 200, sheet: 260, card: 320, story: 480, celebrate: 700 } as const;
export const EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
} as const;

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

function themeVars(theme: ThemeName): string[] {
  const p = PALETTE[theme];
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) out.push(`--bl-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(ROUTE_COLOR[theme])) out.push(`--bl-route-${k}: ${v};`);
  for (const [k, v] of Object.entries(BEHAVIOR_TONE[theme])) out.push(`--bl-beh-${k}: ${v};`);
  for (const [k, v] of Object.entries(SHADOW[theme])) out.push(`--bl-shadow-${k}: ${v};`);
  out.push(`--bl-ic-fill: ${theme === 'dark' ? 0.2 : 0.14};`);
  return out;
}

/** The generated stylesheet (art.css). */
export function tokensCss(): string {
  const shared: string[] = [];
  for (const [k, v] of Object.entries(GLOW)) shared.push(`--bl-glow-${kebab(k)}: ${v};`);
  shared.push(`--bl-font-display: ${FONT.display};`);
  shared.push(`--bl-font-ui: ${FONT.ui};`);
  shared.push(`--bl-font-mono: ${FONT.mono};`);
  for (const [k, v] of Object.entries(TYPE)) {
    shared.push(`--bl-fs-${k}: ${v.size}px;`);
    shared.push(`--bl-lh-${k}: ${v.line}px;`);
    shared.push(`--bl-fw-${k}: ${v.weight};`);
  }
  for (const [k, v] of Object.entries(RADIUS)) shared.push(`--bl-r-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(SPACE)) shared.push(`--bl-s-${k}: ${v}px;`);
  shared.push(`--bl-touch: ${TOUCH}px;`);
  for (const [k, v] of Object.entries(LAYER)) shared.push(`--bl-z-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(DURATION)) shared.push(`--bl-t-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(EASING)) shared.push(`--bl-ease-${k}: ${v};`);
  const block = (sel: string, lines: string[]) => `${sel} {\n${lines.map((l) => '  ' + l).join('\n')}\n}\n`;
  return [
    '/* GENERATED from src/ui/art/tokens.ts by tokensCss(); edit the TS file, then run\n' +
      '   `node --experimental-strip-types --no-warnings src/ui/art/write-css.mjs` (tokens.test.ts fails while they differ). */\n',
    block(':root', [...shared, ...themeVars('dark'), 'color-scheme: dark;']),
    block(":root[data-theme='light'],\n[data-theme='light']", [...themeVars('light'), 'color-scheme: light;']),
    '/* Surfaces that are always night (the dish, the title screen, cinematics). */\n',
    block(".art-force-dark,\n[data-theme='light'] .art-force-dark", [...themeVars('dark'), 'color-scheme: dark;']),
    '/* Icons: duotone fill layer (docs/ARTE.md §5). */\n',
    block('.bl-ic .f', ['fill: currentColor;', 'stroke: none;', 'opacity: var(--bl-ic-fill);']),
    block('@media (prefers-reduced-motion: reduce)', [':root { --bl-t-quick: 1ms; --bl-t-base: 1ms; --bl-t-sheet: 80ms; --bl-t-card: 80ms; --bl-t-story: 80ms; --bl-t-celebrate: 1ms; }']),
  ].join('\n');
}
