/**
 * Builds the complete Steam achievement + stat plan for Bioluma:
 *   platforms/steam/achievements.json   (source of truth for Steamworks and for the desktop bridge)
 *   platforms/steam/achievements.csv    (one row per achievement, to type into Steamworks)
 *
 *   npx vite-node platforms/steam/scripts/gen-achievements.ts           # write
 *   npx vite-node platforms/steam/scripts/gen-achievements.ts --check   # CI: fail if stale
 *
 * The 34 "game" achievements come straight from src/game/balance.ts (ids, metric, target) and
 * src/game/content.ts (es/en texts), so they never drift. Story endings come from src/story
 * (ENDING_IDS + ENDINGS titles) and secrets from the SecretId union in src/secrets/types.ts, so new
 * endings/secrets appear here on the next run. The rest of the "planned" ones are proposals for the
 * integrator: until the game emits them they simply never unlock (hidden ones stay invisible).
 *
 * Game ids for the bridge: ending<Id> ("endingHarvest") and secret<Id> ("secretFullMoon"); see
 * endingAchievementId() / secretAchievementId() in platforms/shared/platform.ts.
 *
 * Steam API names come from steamApiName() in platforms/desktop/steam.cjs (one rule, one place).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENTS, GENOME_COSTS } from '../../../src/game/balance';
import { ACHIEVEMENT_TEXT } from '../../../src/game/content';
import catalog from '../../../src/sim/catalog.json';
import { ENDINGS } from '../../../src/story/endings';
import { ENDING_IDS } from '../../../src/story/types';

type Text = { es: string; en: string };
type Category =
  | 'start' | 'bestiary' | 'behaviour' | 'economy' | 'golden' | 'prestige'
  | 'tools' | 'story' | 'secret' | 'speed' | 'idle';
type Glyph =
  | 'drop' | 'orbium' | 'swimmer' | 'spinner' | 'pulsing' | 'divider' | 'colony' | 'hexdots'
  | 'cell' | 'diamond' | 'jewel' | 'helix' | 'rings' | 'chevrons' | 'orb' | 'spark' | 'dots'
  | 'stamp' | 'slider' | 'archive' | 'sunset' | 'sunrise' | 'moon' | 'hourglass' | 'bolt'
  | 'book' | 'bookstar' | 'eye' | 'hand';

interface Unlock {
  /** game = already emitted by the game's achievement system (bus 'achievement'). */
  kind: 'game' | 'metric' | 'event';
  metric?: string;
  target?: number;
  /** For kind 'event': who calls platform.unlockAchievement(gameId), and when. */
  event?: string;
  owner?: string;
  /** The metric does not exist yet in src/game/game.ts metric(). */
  newMetric?: boolean;
}
interface Entry {
  gameId: string;
  steamApiName: string;
  source: 'game' | 'planned';
  category: Category;
  name: Text;
  desc: Text;
  hidden: boolean;
  unlock: Unlock;
  /** Steam progress stat (Steamworks: "Progress Stat", min..max); Steam auto-unlocks at max. */
  progress?: { stat: string; min: number; max: number };
  /** In-game permanent bonus (existing) or a suggestion for the balance owner (planned). */
  bonus: number;
  icon: { glyph: Glyph; label?: string; achieved: string; locked: string };
  placeholder?: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const steamDir = resolve(here, '..');
const require = createRequire(import.meta.url);
const { steamApiName } = require('../../desktop/steam.cjs') as { steamApiName: (id: string) => string };
const t = (es: string, en: string): Text => ({ es, en });

// ───────────────────────────── stats ─────────────────────────────

/** Steam INT stats. The game reports absolute values (platform.reportStats) every autosave. */
const STATS = [
  { name: 'STAT_SEEDS', from: 'stats.seeds (lifetime)', display: t('Siembras', 'Seeds sown') },
  { name: 'STAT_SPECIES', from: 'species.length', display: t('Especies registradas', 'Species registered') },
  { name: 'STAT_CATALOG_SPECIES', from: 'catalog species registered (new metric)', display: t('Especies del catálogo', 'Catalog species') },
  { name: 'STAT_BEHAVIORS', from: 'behaviorsSeen.length', display: t('Comportamientos vistos', 'Behaviours seen') },
  { name: 'STAT_GOLDEN', from: 'stats.golden', display: t('Destellos atrapados', 'Sparks caught') },
  { name: 'STAT_ERA', from: 'stats.extinctions + 1', display: t('Era alcanzada', 'Era reached') },
  { name: 'STAT_GENOME_NODES', from: 'nodes.length', display: t('Nodos del Genoma', 'Genome nodes') },
  { name: 'STAT_STABLE_PEAK', from: 'stats.stablePeak', display: t('Máximo de criaturas estables', 'Most stable creatures') },
  { name: 'STAT_EPS_PEAK', from: 'floor(min(stats.epsPeak, 2^31-1))', display: t('Récord de Esencia/s', 'Peak Essence/s') },
  { name: 'STAT_ESSENCE_LOG10', from: 'floor(log10(max(1, stats.totalEssence)))', display: t('Orden de magnitud de la Esencia total', 'Total Essence order of magnitude') },
  { name: 'STAT_PLAY_MINUTES', from: 'floor(stats.playTime / 60)', display: t('Minutos jugados', 'Minutes played') },
] as const;
type StatName = (typeof STATS)[number]['name'];

/** Progress stat for tiered game metrics (target-1 achievements get no progress bar). */
function progressFor(metric: string, target: number): Entry['progress'] {
  const map: Record<string, [StatName, (v: number) => number]> = {
    seeds: ['STAT_SEEDS', (v) => v],
    species: ['STAT_SPECIES', (v) => v],
    catalogSpecies: ['STAT_CATALOG_SPECIES', (v) => v],
    behaviors: ['STAT_BEHAVIORS', (v) => v],
    golden: ['STAT_GOLDEN', (v) => v],
    era: ['STAT_ERA', (v) => v],
    extinctions: ['STAT_ERA', (v) => v + 1],
    genomeNodes: ['STAT_GENOME_NODES', (v) => v],
    stablePeak: ['STAT_STABLE_PEAK', (v) => v],
    epsPeak: ['STAT_EPS_PEAK', (v) => v],
    totalEssence: ['STAT_ESSENCE_LOG10', (v) => Math.round(Math.log10(v))],
    playTime: ['STAT_PLAY_MINUTES', (v) => Math.round(v / 60)],
  };
  const m = map[metric];
  if (!m || target <= 1) return undefined;
  return { stat: m[0], min: 0, max: m[1](target) };
}

// ───────────────────────────── icon style per category ─────────────────────────────

const HUE: Record<Category, string> = {
  start: '#5BC0EB',
  bestiary: '#4FE3B0',
  behaviour: '#6FA8FF',
  economy: '#9BE36D',
  golden: '#FFD166',
  prestige: '#B794F6',
  tools: '#7FD8F7',
  story: '#FF8FB1',
  secret: '#E879F9',
  speed: '#FFA552',
  idle: '#8EA2FF',
};

const short = (n: number) => (n >= 1e9 ? `${n / 1e9}B` : n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : `${n}`);

/** Category, glyph and tier label for the 34 existing achievements. */
const GAME_STYLE: Record<string, [Category, Glyph, string?]> = {
  firstSeed: ['start', 'drop'],
  firstLife: ['start', 'orbium'],
  seeds100: ['start', 'drop', '100'],
  seeds1000: ['start', 'drop', '1K'],
  species3: ['bestiary', 'cell', '3'],
  species10: ['bestiary', 'cell', '10'],
  species20: ['bestiary', 'cell', '20'],
  swimmer: ['behaviour', 'swimmer'],
  spinner: ['behaviour', 'spinner'],
  pulsing: ['behaviour', 'pulsing'],
  divider: ['behaviour', 'divider'],
  colony: ['behaviour', 'colony'],
  allBehaviors: ['behaviour', 'hexdots', '6'],
  eps10: ['economy', 'chevrons', '10/s'],
  eps100: ['economy', 'chevrons', '100/s'],
  eps1000: ['economy', 'chevrons', '1K/s'],
  essence1e4: ['economy', 'orb', '10K'],
  essence1e6: ['economy', 'orb', '1M'],
  golden1: ['golden', 'spark'],
  golden10: ['golden', 'spark', '10'],
  golden50: ['golden', 'spark', '50'],
  rare: ['bestiary', 'diamond'],
  veryRare: ['bestiary', 'jewel'],
  crowd5: ['start', 'dots', '5'],
  crowd10: ['start', 'dots', '10'],
  printer: ['tools', 'stamp'],
  tinkerer: ['tools', 'slider'],
  regime: ['tools', 'archive'],
  extinction: ['prestige', 'sunset'],
  heritage: ['prestige', 'helix'],
  variant: ['bestiary', 'helix'],
  symbiosis: ['bestiary', 'rings'],
  returned: ['idle', 'moon'],
  hour: ['idle', 'hourglass', '1h'],
};

// ───────────────────────────── planned additions ─────────────────────────────

const CATALOG_SIZE = (catalog as unknown[]).length;
const GENOME_SIZE = Object.keys(GENOME_COSTS).length;

type Planned = Omit<Entry, 'steamApiName' | 'source' | 'icon' | 'progress'> & { glyph: Glyph; label?: string };
const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Story endings (src/story): all hidden, the secret one with its own glyph. */
const ENDING_ACHIEVEMENTS: Planned[] = ENDING_IDS.map((id) => {
  const secretEnding = /secret/i.test(ENDINGS[id].title.en);
  return {
    gameId: `ending${cap(id)}`,
    category: 'story' as const,
    name: ENDINGS[id].title,
    desc: secretEnding
      ? t('Descubre el final secreto de la historia.', 'Discover the secret ending of the story.')
      : t(`Llega a este final de la historia.`, `Reach this ending of the story.`),
    hidden: true,
    unlock: { kind: 'event' as const, event: `story ending "${id}" shown`, owner: 'src/story' },
    bonus: 0,
    glyph: secretEnding ? ('bookstar' as const) : ('book' as const),
  };
});
const MAIN_ENDINGS = ENDING_ACHIEVEMENTS.filter((e) => e.glyph === 'book').length;

/** Secrets (src/secrets/types.ts SecretId union, parsed so it never imports in-progress code). */
const SECRET_GROUP_GLYPH: [RegExp, Glyph][] = [
  [/species/i, 'jewel'], [/homage/i, 'bookstar'], [/gesture/i, 'spinner'], [/touch|key|sensor/i, 'hand'],
  [/patience|behaviou?r/i, 'hourglass'], [/sky|calendar|visual/i, 'moon'], [/meta/i, 'eye'],
];
/** Provisional display names; the secrets owner replaces them with the real reveal titles. */
const SECRET_NAMES: Record<string, Text> = {
  ignis: t('Ignis', 'Ignis'), phantasma: t('Phantasma', 'Phantasma'), cryptid: t('Críptido', 'Cryptid'),
  chan: t('Gracias, Bert', 'Thank you, Bert'), conway: t('Homenaje a Conway', 'Homage to Conway'),
  answer: t('La respuesta', 'The answer'), maximizer: t('Maximizadora', 'Maximizer'),
  goldenStreak: t('Racha dorada', 'Golden streak'), spiral: t('Espiral', 'Spiral'), heart: t('Corazón', 'Heart'),
  halo: t('Halo', 'Halo'), infinity: t('Infinito', 'Infinity'), konami: t('Código antiguo', 'Old code'),
  logo: t('El logo', 'The logo'), patience: t('Toque paciente', 'Patient touch'), shake: t('Sacudida', 'Shake'),
  oldFriend: t('Vieja amiga', 'Old friend'), seven: t('Siete', 'Seven'), silence: t('Silencio', 'Silence'),
  sterile: t('Placa estéril', 'Sterile dish'), palindrome: t('Palíndromo', 'Palindrome'), afk: t('Ausente', 'Away'),
  fullMoon: t('Luna llena', 'Full moon'), birthday: t('Cumpleaños', 'Birthday'), aurora: t('Aurora', 'Aurora'),
  orion: t('Orión', 'Orion'), basement: t('El sótano', 'The basement'),
};
function parseSecretIds(): { id: string; group: string }[] {
  const src = readFileSync(resolve(here, '../../../src/secrets/types.ts'), 'utf8');
  const block = src.match(/export type SecretId =([\s\S]*?);/)?.[1] ?? '';
  let group = '';
  const out: { id: string; group: string }[] = [];
  for (const line of block.split('\n')) {
    const comment = line.match(/\/\/\s*(.+)$/);
    if (comment) group = comment[1];
    const id = line.match(/'([A-Za-z0-9]+)'/)?.[1];
    if (id) out.push({ id, group });
  }
  return out;
}
const SECRET_IDS = parseSecretIds();
const SECRET_ACHIEVEMENTS: Planned[] = SECRET_IDS.map(({ id, group }) => {
  const name = SECRET_NAMES[id] ?? t(cap(id), cap(id));
  return {
    gameId: `secret${cap(id)}`,
    category: 'secret' as const,
    name,
    desc: t(`Descubre el secreto «${name.es}».`, `Discover the secret "${name.en}".`),
    hidden: true,
    unlock: { kind: 'event' as const, event: `secret "${id}" revealed (${group || 'secret'})`, owner: 'src/secrets' },
    bonus: 0,
    glyph: SECRET_GROUP_GLYPH.find(([re]) => re.test(group))?.[1] ?? 'eye',
    placeholder: !SECRET_NAMES[id],
  };
});

const PLANNED: Planned[] = [
  {
    gameId: 'species25', category: 'bestiary', name: t('Herbario', 'Herbarium'),
    desc: t('Registra 25 especies.', 'Register 25 species.'), hidden: false,
    unlock: { kind: 'metric', metric: 'species', target: 25 }, bonus: 0.05, glyph: 'cell', label: '25',
  },
  {
    gameId: 'speciesCatalog', category: 'bestiary', name: t('El catálogo de Chan', "Chan's catalogue"),
    desc: t(`Registra las ${CATALOG_SIZE} especies del catálogo.`, `Register all ${CATALOG_SIZE} catalogue species.`), hidden: false,
    unlock: { kind: 'metric', metric: 'catalogSpecies', target: CATALOG_SIZE, newMetric: true }, bonus: 0.08, glyph: 'book', label: String(CATALOG_SIZE),
  },
  {
    gameId: 'golden100', category: 'golden', name: t('Enjambre de luz', 'Swarm of light'),
    desc: t('Atrapa 100 Destellos.', 'Catch 100 Sparks.'), hidden: false,
    unlock: { kind: 'metric', metric: 'golden', target: 100 }, bonus: 0.05, glyph: 'spark', label: '100',
  },
  {
    gameId: 'era5', category: 'prestige', name: t('Quinta placa', 'Fifth dish'),
    desc: t('Llega a la era 5.', 'Reach era 5.'), hidden: false,
    unlock: { kind: 'metric', metric: 'era', target: 5, newMetric: true }, bonus: 0.03, glyph: 'sunrise', label: '5',
  },
  {
    gameId: 'era10', category: 'prestige', name: t('Linaje', 'Lineage'),
    desc: t('Llega a la era 10.', 'Reach era 10.'), hidden: false,
    unlock: { kind: 'metric', metric: 'era', target: 10, newMetric: true }, bonus: 0.04, glyph: 'sunrise', label: '10',
  },
  {
    gameId: 'era25', category: 'prestige', name: t('Tiempo profundo', 'Deep time'),
    desc: t('Llega a la era 25.', 'Reach era 25.'), hidden: false,
    unlock: { kind: 'metric', metric: 'era', target: 25, newMetric: true }, bonus: 0.05, glyph: 'sunrise', label: '25',
  },
  {
    gameId: 'genomeComplete', category: 'prestige', name: t('Genoma completo', 'Complete genome'),
    desc: t(`Compra los ${GENOME_SIZE} nodos del Genoma.`, `Buy all ${GENOME_SIZE} Genome nodes.`), hidden: false,
    unlock: { kind: 'metric', metric: 'genomeNodes', target: GENOME_SIZE }, bonus: 0.05, glyph: 'helix', label: 'ALL',
  },
  {
    gameId: 'eps1e4', category: 'economy', name: t('Biosfera', 'Biosphere'),
    desc: t('Alcanza 10 000 Esencia/s.', 'Reach 10,000 Essence/s.'), hidden: false,
    unlock: { kind: 'metric', metric: 'epsPeak', target: 1e4 }, bonus: 0.05, glyph: 'chevrons', label: '10K/s',
  },
  {
    gameId: 'essence1e9', category: 'economy', name: t('Mil millones', 'A billion'),
    desc: t('Gana 1 000 000 000 de Esencia en total.', 'Earn 1,000,000,000 Essence in total.'), hidden: false,
    unlock: { kind: 'metric', metric: 'totalEssence', target: 1e9 }, bonus: 0.05, glyph: 'orb', label: '1B',
  },
  ...ENDING_ACHIEVEMENTS,
  {
    gameId: 'allEndings', category: 'story', name: t('Todas las voces', 'Every voice'),
    desc: t(`Ve los ${MAIN_ENDINGS} finales principales.`, `See all ${MAIN_ENDINGS} main endings.`), hidden: false,
    unlock: { kind: 'event', event: 'story.endings() contains every main ending', owner: 'src/story' }, bonus: 0.03, glyph: 'book', label: String(MAIN_ENDINGS),
  },
  ...SECRET_ACHIEVEMENTS,
  {
    gameId: 'secretsAll', category: 'secret', name: t('Nada más que esconder', 'Nothing left to hide'),
    desc: t(`Descubre los ${SECRET_IDS.length} secretos.`, `Discover all ${SECRET_IDS.length} secrets.`), hidden: false,
    unlock: { kind: 'event', event: 'every SecretId revealed', owner: 'src/secrets' }, bonus: 0.05, glyph: 'eye', label: 'ALL',
  },
  {
    gameId: 'speedExtinction', category: 'speed', name: t('Prisa evolutiva', 'Evolutionary rush'),
    desc: t('Provoca tu primera Extinción con menos de 45 minutos de juego.', 'Trigger your first Extinction with under 45 minutes played.'), hidden: false,
    unlock: { kind: 'event', event: 'extinctionDone with stats.extinctions === 1 && stats.playTime < 2700', owner: 'src/game' }, bonus: 0.03, glyph: 'bolt',
  },
  {
    gameId: 'speedSpecies', category: 'speed', name: t('Ojo rápido', 'Quick eye'),
    desc: t('Registra 10 especies en tus primeros 30 minutos de juego.', 'Register 10 species within your first 30 minutes of play.'), hidden: false,
    unlock: { kind: 'event', event: 'speciesNew with species.length >= 10 && stats.playTime < 1800', owner: 'src/game' }, bonus: 0.03, glyph: 'bolt', label: '10',
  },
  {
    gameId: 'speedEra', category: 'speed', name: t('Era relámpago', 'Lightning era'),
    desc: t('Completa una era, de la primera siembra a la Extinción, en menos de 10 minutos.', 'Complete an era, from first seed to Extinction, in under 10 minutes.'), hidden: false,
    unlock: { kind: 'event', event: 'extinctionDone with era play time < 600 s (new: track era start time)', owner: 'src/game', newMetric: true }, bonus: 0.03, glyph: 'bolt', label: '10m',
  },
  {
    gameId: 'awayNight', category: 'idle', name: t('Dormir sobre ello', 'Sleep on it'),
    desc: t('Vuelve tras 8 horas o más fuera.', 'Come back after 8 hours or more away.'), hidden: false,
    unlock: { kind: 'event', event: "bus 'offlineReturn' with seconds >= 28800", owner: 'src/main.ts' }, bonus: 0.02, glyph: 'moon', label: '8h',
  },
  {
    gameId: 'offlineHarvest', category: 'idle', name: t('Cosecha nocturna', 'Night harvest'),
    desc: t('Recoge 1 000 000 de Esencia en un solo regreso.', 'Collect 1,000,000 Essence in a single return.'), hidden: false,
    unlock: { kind: 'event', event: "bus 'offlineReturn' with essence >= 1e6", owner: 'src/main.ts' }, bonus: 0.03, glyph: 'moon', label: '1M',
  },
  {
    gameId: 'handsOff', category: 'idle', name: t('Manos quietas', 'Hands off'),
    desc: t('Deja la placa 15 minutos sin tocarla mientras sigue produciendo.', 'Leave the dish untouched for 15 minutes while it keeps producing.'), hidden: false,
    unlock: { kind: 'event', event: 'no pointer/key input for 900 s while essencePerSec > 0 and the tab is visible', owner: 'src/main.ts' }, bonus: 0.02, glyph: 'hand',
  },
  {
    gameId: 'play10h', category: 'idle', name: t('Cultivo largo', 'Long culture'),
    desc: t('Juega 10 horas.', 'Play for 10 hours.'), hidden: false,
    unlock: { kind: 'metric', metric: 'playTime', target: 36000 }, bonus: 0.03, glyph: 'hourglass', label: '10h',
  },
];

// ───────────────────────────── assemble ─────────────────────────────

const icon = (apiName: string, glyph: Glyph, label?: string) => ({
  glyph,
  ...(label ? { label } : {}),
  achieved: `achievement-icons/${apiName}.jpg`,
  locked: `achievement-icons/${apiName}_locked.jpg`,
});

const entries: Entry[] = [];
for (const a of ACHIEVEMENTS) {
  const text = ACHIEVEMENT_TEXT[a.id];
  const style = GAME_STYLE[a.id];
  if (!text) throw new Error(`content.ts has no text for achievement "${a.id}"`);
  if (!style) throw new Error(`gen-achievements.ts: add an icon style for new game achievement "${a.id}"`);
  const api = steamApiName(a.id);
  const progress = progressFor(a.metric, a.target);
  entries.push({
    gameId: a.id,
    steamApiName: api,
    source: 'game',
    category: style[0],
    name: text.name,
    desc: text.desc,
    hidden: false,
    unlock: { kind: 'game', metric: a.metric, target: a.target },
    ...(progress ? { progress } : {}),
    bonus: a.bonus,
    icon: icon(api, style[1], style[2]),
  });
}
for (const p of PLANNED) {
  const { glyph, label, ...rest } = p;
  const api = steamApiName(p.gameId);
  const progress = p.unlock.kind === 'metric' ? progressFor(p.unlock.metric!, p.unlock.target!) : undefined;
  entries.push({ ...rest, steamApiName: api, source: 'planned', ...(progress ? { progress } : {}), icon: icon(api, glyph, label) });
}

// Validation: Steam API names are [A-Z0-9_], unique; ids unique; default Steam limit is 100.
const seen = new Set<string>();
for (const e of entries) {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(e.steamApiName)) throw new Error(`bad API name ${e.steamApiName}`);
  if (seen.has(e.steamApiName) || seen.has(e.gameId)) throw new Error(`duplicate ${e.gameId}/${e.steamApiName}`);
  seen.add(e.steamApiName);
  seen.add(e.gameId);
}
if (entries.length > 100) throw new Error(`${entries.length} achievements: Steam allows 100 until Profile Features`);

const doc = {
  $comment:
    'GENERATED by platforms/steam/scripts/gen-achievements.ts from src/game/balance.ts + content.ts. Edit the script, not this file.',
  rules: {
    steamLimit: 'Steam allows 100 achievements until the app reaches the Profile Features threshold; we use ' + entries.length + '.',
    icons: '256x256 JPG per achievement: achieved (colour) + unachieved (greyscale). Steam still accepts the legacy 64x64.',
    hidden: 'Hidden achievements (story endings, secrets) do not appear on the Community page until earned: no spoilers.',
    secrets: 'Secret names marked placeholder are provisional: the secrets owner should replace them with the reveal titles.',
    progress: 'Achievements with a progress stat show a bar in Steam and auto-unlock when the stat reaches max.',
    languages: 'Fill English + Spanish (Spain) + Spanish (Latin America) with the es text.',
  },
  bridgeMap: Object.fromEntries(entries.map((e) => [e.gameId, e.steamApiName])),
  stats: STATS.map((s) => ({ ...s, type: 'INT', defaultValue: 0, minValue: 0, incrementOnly: true, setByGame: true })),
  achievements: entries,
};

const json = JSON.stringify(doc, null, 2) + '\n';
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv =
  [
    ['api_name', 'game_id', 'source', 'category', 'hidden', 'name_en', 'desc_en', 'name_es', 'desc_es', 'progress_stat', 'progress_min', 'progress_max', 'icon_achieved', 'icon_locked', 'unlock'],
    ...entries.map((e) => [
      e.steamApiName, e.gameId, e.source, e.category, e.hidden ? 1 : 0, e.name.en, e.desc.en, e.name.es, e.desc.es,
      e.progress?.stat, e.progress?.min, e.progress?.max, e.icon.achieved, e.icon.locked,
      e.unlock.kind === 'event' ? `${e.unlock.owner}: ${e.unlock.event}` : `${e.unlock.metric} >= ${e.unlock.target}${e.unlock.newMetric ? ' (new metric)' : ''}`,
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\n') + '\n';

const files: [string, string][] = [
  [join(steamDir, 'achievements.json'), json],
  [join(steamDir, 'achievements.csv'), csv],
];
if (process.argv.includes('--check')) {
  const stale = files.filter(([f, c]) => {
    try {
      return readFileSync(f, 'utf8') !== c;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(`stale: ${stale.map(([f]) => f).join(', ')}. Run: npx vite-node platforms/steam/scripts/gen-achievements.ts`);
    process.exit(1);
  }
  console.log(`achievements up to date (${entries.length})`);
} else {
  for (const [f, c] of files) writeFileSync(f, c);
  const planned = entries.filter((e) => e.source === 'planned').length;
  console.log(`wrote ${entries.length} achievements (${entries.length - planned} in game, ${planned} planned), ${STATS.length} stats`);
}
