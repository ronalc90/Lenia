/**
 * Research tree + session UI dev page (tree-dev.html), with a mocked research state.
 *
 * URL params (used by tests/e2e/tree-shots.mjs):
 *   ?view=tree|summary|start|hud|flow   what to show (default tree)
 *   &preset=new|s1|early|mid|late|all    tree levels / Datos / sessions / species
 *   &datos=N &sessions=N &species=N      override the preset
 *   &sel=<nodeId>&why=1                  open a node's sheet (and its "¿Por qué cuesta esto?" sheet)
 *   &add=id:level,…                      levels on top of the preset
 *   &world=<worldId>&fresh=a,b           start card: picked world, nodes bought since last time
 *   &buy=<nodeId>&at=<ms>                buy it after load (purchase animation), freeze at `at`
 *   &zoom=<z>&focus=<nodeId>             camera
 *   &sum=first|rich|poor|night           summary variant;  &instant=1 no staged tally
 *   &t=<s>&total=<s>&phase=ready|running|over&sprint=2&ext=5&banner=1&stamp=1   HUD
 *   &essence=N&newsp=0&why=1             HUD Datos preview (Esencia so far, a new species, open its sum)
 *   &lang=en &theme=light &rm=1 &menu=0
 */
import type { Lang, Pattern } from '../../core/types';
import * as C from '../../game/cycleBalance';
import {
  beginSession,
  freshResearch,
  noteBehavior,
  noteBest,
  noteEncargo,
  noteEssence,
  noteGolden,
  noteKeep,
  noteProduction,
  noteSeed,
  noteSpecies,
  recentDatos,
  researchBuy,
  summarize,
  applySummary,
  tickSession,
  sessionProdMult,
  type ResearchState,
  type SessionState,
} from '../../game/session';
import { affordableNodes, nextGoal, nodeText, treeEffects, TREE_NODES } from '../../game/tree';
import { TOTAL_WORLD_SPECIES, WORLD_BY_ID, WORLDS, type WorldId } from '../../game/worlds';
import { catalogGroup, catalogPortrait } from '../../species';
import { createPriceSheet } from '../moments/price';
import { computeDatos, researchPickWorld, sessionPreview, unlockedWorlds } from '../../game/session';
import { createSessionHud, createSessionStart, createSessionSummary, datosExplain, hudViewOf } from '../session';
import { createTreeView } from './treeView';
import '../art/art.css';

const q = new URLSearchParams(location.search);
const lang: Lang = q.get('lang') === 'en' ? 'en' : 'es';
const reduce = q.get('rm') === '1';
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.lang = lang;
const app = document.getElementById('app')!;

// ───────────── mock species (catalog portraits) ─────────────
const SPECIES: Record<string, { code: string; name: { es: string; en: string }; hue: number }> = {
  sp1: { code: 'O2u', name: { es: 'Nadadora celeste', en: 'Sky swimmer' }, hue: 195 },
  sp2: { code: 'OG2g', name: { es: 'Bailarina violeta', en: 'Violet dancer' }, hue: 275 },
  sp3: { code: 'S1s', name: { es: 'Escudo verde', en: 'Green shield' }, hue: 140 },
  sp4: { code: 'H3s', name: { es: 'Hélice rosa', en: 'Pink helix' }, hue: 330 },
  sp5: { code: 'O4d', name: { es: 'Gemela azul', en: 'Blue twin' }, hue: 220 },
  sp6: { code: 'C0v', name: { es: 'Anillo lila', en: 'Lilac ring' }, hue: 300 },
};
const portraitCache = new Map<string, Pattern | null>();
function speciesInfo(id: string) {
  const s = SPECIES[id];
  if (!s) return null;
  if (!portraitCache.has(id)) portraitCache.set(id, catalogPortrait(s.code));
  return { name: s.name[lang], portrait: portraitCache.get(id) ?? null, hue: s.hue };
}

// ───────────── presets (shaped like the planner bot's run, docs/CICLO.md §11) ─────────────
type Preset = { levels: Record<string, number>; datos: number; sessions: number; species: number; history: number[]; found: string[] };
const PRESETS: Record<string, Preset> = {
  new: { levels: { lab: 1 }, datos: 0, sessions: 0, species: 0, history: [], found: [] },
  s1: { levels: { lab: 1 }, datos: 28, sessions: 1, species: 1, history: [28], found: ['O2u'] },
  early: {
    levels: { lab: 1, clock: 2, dropper: 1, culture: 2, dish: 1, notebook: 1, spark: 1, worldCold: 1 },
    datos: 16,
    sessions: 3,
    species: 3,
    history: [28, 39, 48],
    found: ['O2u', 'O4i', 'O2ui'],
  },
  mid: {
    levels: {
      lab: 2, clock: 3, clock2: 2, fridge: 1, dropper: 3, startEssence: 2, dish: 2, slots: 2, culture: 5, nutrient: 2,
      notebook: 2, print: 1, worldCold: 1, worldGyro: 1, spark: 2, sparkLife: 1, sparkTime: 1,
    },
    datos: 140,
    sessions: 7,
    species: 6,
    history: [121, 186, 217],
    found: ['O2u', 'O4i', 'O2ui', 'O4s', 'O2p', 'OG2g'],
  },
  late: {
    levels: {
      lab: 4, clock: 3, clock2: 2, fridge: 3, sprint: 3, encTime: 2, clock3: 1, dropper: 3, startEssence: 4, freeSeeds: 3,
      stabilizer: 5, bigSeed: 1, autoSeeder: 6, cheapSeeds: 1, dish: 3, slots: 3, crowdCost: 2, nursery: 1, incubator: 2, dishXL: 1,
      culture: 5, nutrient: 3, culture2: 3, swimAffinity: 3, stillAffinity: 2, colonyAffinity: 1, notebook: 3, print: 1, cataloguing: 5,
      archive: 2, microscope: 2, discoBonus: 1, worldCold: 1, worldGyro: 1, worldShields: 1, worldHelix: 1, worldLegs: 1, spark: 3,
      sparkLife: 2, sparkTime: 2, sparkFirst: 1, sparkGift: 3, sparkDatos: 2,
    },
    datos: 9300,
    sessions: 16,
    species: 13,
    history: [10949, 12418, 14940],
    found: ['O2u', 'O4i', 'O2ui', 'O4s', 'O2p', 'S1v', 'S1s', 'PG1a', 'P4cp', 'OG2g', 'O4d', 'S2s', 'S3s'],
  },
};
PRESETS.all = {
  levels: Object.fromEntries(TREE_NODES.map((n) => [n.id, n.maxLevel >= 99 ? 6 : n.id === 'lab' ? 7 : n.maxLevel])),
  datos: 52000,
  sessions: 28,
  species: TOTAL_WORLD_SPECIES,
  history: [40000, 49000, 65000],
  found: WORLDS.flatMap((w) => w.species),
};

const preset = PRESETS[q.get('preset') ?? 'mid'] ?? PRESETS.mid;
/** &add=clock2:1,fridge:1 adds levels on top of the preset (sheets of specific states). */
const added = Object.fromEntries((q.get('add') ?? '').split(',').filter(Boolean).map((kv) => [kv.split(':')[0], Number(kv.split(':')[1] ?? 1)]));
let research: ResearchState = {
  ...freshResearch(),
  levels: { ...preset.levels, ...added },
  datos: Number(q.get('datos') ?? preset.datos),
  sessions: Number(q.get('sessions') ?? preset.sessions),
  history: preset.history.map((d, i) => ({ n: i + 1, seconds: 200, essence: d * 100, datos: d, species: 2 })),
};
let species = Number(q.get('species') ?? preset.species);
const found = new Set(preset.found);
const codePortraits = new Map<string, Pattern | null>();
const codePortrait = (code: string): Pattern | null => {
  if (!codePortraits.has(code)) codePortraits.set(code, catalogPortrait(code));
  return codePortraits.get(code) ?? null;
};
/** A world's species for the tree sheet and the start card (catalog portraits, found = in the preset). */
function worldSpecies(w: WorldId) {
  const seen = new Set<string>();
  return WORLD_BY_ID[w].species
    .filter((c) => !seen.has(catalogGroup(c)) && seen.add(catalogGroup(c)))
    .map((code) => ({ code, name: code, portrait: codePortrait(code), found: found.has(code) }));
}

// ───────────── fake game screen behind the cards / HUD ─────────────
const css = document.createElement('style');
css.textContent = `
  .dv { position:absolute; inset:0; display:grid; grid-template-rows: auto 1fr; background: radial-gradient(ellipse at 50% 55%, #0e131a 0%, #06080b 75%); }
  html[data-theme='light'] .dv { background: radial-gradient(ellipse at 50% 55%, #f7f9fb 0%, #dde4ec 80%); }
  .dv-top { display:flex; align-items:center; justify-content:center; padding: 8px 10px 0; position: relative; z-index: 2; }
  .dv-dish { position: relative; overflow: hidden; }
  .dv-dish::before { content:''; position:absolute; left:50%; top:46%; width:min(86vw, 70vh); aspect-ratio:1; transform:translate(-50%,-50%);
    border-radius:50%; background: radial-gradient(circle at 50% 45%, #0f1a24 0%, #070a0e 70%); box-shadow: 0 0 0 3px rgba(150,190,220,.18), 0 0 60px rgba(91,192,235,.12) inset; }
  .dv-blob { position:absolute; width:46px; height:46px; border-radius:50%; background: radial-gradient(circle at 40% 40%, #fff 0%, #7fe3ff 30%, #2a6fd6 62%, transparent 72%); filter: blur(.4px); }
  .dv-menu { position:fixed; left:8px; bottom:8px; z-index:100; display:flex; flex-wrap:wrap; gap:4px; max-width: 360px; font: 600 11px Inter, sans-serif; }
  .dv-menu button { padding: 6px 8px; border-radius: 8px; border: 1px solid #39424d; background: #1b232c; color: #e6edf3; cursor: pointer; }
`;
document.head.appendChild(css);
const screen = document.createElement('div');
screen.className = 'dv';
screen.innerHTML = '<div class="dv-top"></div><div class="dv-dish"></div>';
app.appendChild(screen);
const top = screen.querySelector('.dv-top') as HTMLElement;
const dish = screen.querySelector('.dv-dish') as HTMLElement;
for (const [x, y] of [
  [40, 38],
  [58, 52],
  [47, 63],
  [33, 55],
]) {
  const b = document.createElement('div');
  b.className = 'dv-blob';
  b.style.left = `${x}%`;
  b.style.top = `${y}%`;
  dish.appendChild(b);
}

// ───────────── views ─────────────
const sound = (k: string) => (window as unknown as { __sounds?: string[] }).__sounds?.push(k);
(window as unknown as { __sounds: string[] }).__sounds = [];

const tree = createTreeView(app, {
  lang: () => lang,
  reduceMotion: () => reduce,
  onBuy: (id) => {
    const r = researchBuy(research, id, species);
    if (r.result.ok) {
      research = r.state;
      queueMicrotask(() => tree.update(treeData()));
    }
    return r.result;
  },
  onNewSession: () => {
    tree.close();
    showStart();
  },
  onSound: sound,
  worldSpecies,
});
const treeData = () => ({ levels: research.levels, datos: research.datos, sessions: research.sessions, species, recentDatos: recentDatos(research) });

const priceSheet = createPriceSheet(app, { reduceMotion: () => reduce });
const hud = createSessionHud(top, {
  lang: () => lang,
  reduceMotion: () => reduce,
  onSound: sound,
  onPreview: () => {
    if (!session) return;
    const fx = treeEffects(research.levels);
    const p = sessionPreview(research, session, fx, species);
    priceSheet.open(datosExplain(computeDatos(session, fx, 0), lang, fx.night, p.goal ? { name: nodeText(p.goal.id).name, missing: p.goal.missing } : null));
  },
});
/** Feed the HUD's "+N Datos al terminar · next node" pill. */
function showPreview(s: SessionState): void {
  const p = sessionPreview(research, s, treeEffects(research.levels), species);
  hud.preview({ datos: p.datos, goal: p.goal ? { name: nodeText(p.goal.id).name, missing: p.goal.missing } : null });
}
const startCard = createSessionStart(app, {
  lang: () => lang,
  reduceMotion: () => reduce,
  speciesInfo,
  worldSpecies,
  onPickWorld: (w) => {
    research = researchPickWorld(research, w);
    if (session) session.world = research.world;
  },
  onGo: () => {
    startCard.hide();
    runSession();
  },
});
const summary = createSessionSummary(app, {
  lang: () => lang,
  reduceMotion: () => reduce,
  speciesInfo,
  instant: q.get('instant') === '1',
  onTree: () => {
    summary.hide();
    tree.update(treeData());
    tree.open();
  },
  onNext: () => {
    summary.hide();
    showStart();
  },
  onSound: sound,
});

// ───────────── a fake session (flow view) ─────────────
let session: SessionState | null = null;
function showStart(): void {
  const fx = treeEffects(research.levels);
  const b = beginSession(research, fx);
  research = b.research;
  session = b.session;
  hud.update(hudViewOf(session, 1));
  startCard.show(b.start, { encargo: { es: 'Ten 3 criaturas estables a la vez.', en: 'Have 3 stable creatures at once.' } });
}
function runSession(): void {
  if (!session) return;
  const s = session;
  const fx = treeEffects(research.levels);
  noteSeed(s);
  let last = performance.now();
  const speedUp = Number(q.get('speedup') ?? 12);
  const loop = () => {
    const now = performance.now();
    const dt = ((now - last) / 1000) * speedUp;
    last = now;
    noteEssence(s, dt * 6 * (1 + s.elapsed / 60) * sessionProdMult(s, fx));
    noteProduction(s, 3 + s.elapsed / 30, Math.min(6, 1 + Math.floor(s.elapsed / 25)));
    if (s.elapsed > 20 && !s.species.includes('sp1')) noteSpecies(s, fx, 'sp1', false);
    if (s.elapsed > 60 && !s.species.includes('sp3')) for (const e of noteSpecies(s, fx, 'sp3', true)) if (e.type === 'extended') hud.extended(e.seconds, e.reason);
    noteBest(s, 'sp1', 2 + s.elapsed / 40);
    for (const e of tickSession(s, dt, fx)) {
      if (e.type === 'lastMinute') hud.lastMinute(dish);
      if (e.type === 'timesUp') {
        hud.update(hudViewOf(s, 1));
        noteKeep(s, ['sp1', 'sp3']);
        void hud.timesUp(dish).then(() => finish(s));
        return;
      }
    }
    hud.update(hudViewOf(s, sessionProdMult(s, fx)));
    showPreview(s);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function finish(s: SessionState): void {
  const fx = treeEffects(research.levels);
  const sum = summarize(s, research, fx, species);
  research = applySummary(research, s, sum, fx);
  species = Math.max(species, 2);
  showSummary(sum);
}
function showSummary(sum: ReturnType<typeof summarize>): void {
  const ctx = { levels: research.levels, datos: research.datos, sessions: research.sessions, species };
  const goal = nextGoal(ctx);
  summary.show(sum, {
    affordable: affordableNodes(ctx).filter((id) => id !== 'lab').length,
    nextGoal: goal && goal.missingDatos > 0 ? { name: nodeText(goal.id).name, missing: goal.missingDatos, sessions: null } : null,
  });
}

/** A ready-made summary for screenshots. */
function mockSummary(kind: string): void {
  const r0: ResearchState =
    kind === 'first'
      ? freshResearch()
      : { ...research, records: { essence: 3000, eps: 25, creatures: 5, species: 2 }, sessions: Math.max(research.sessions, 3) };
  const levels = kind === 'first' ? { lab: 1 } : kind === 'rich' ? { ...research.levels, lab: 3, encyclopedia: 1 } : research.levels;
  const fx = treeEffects(levels);
  const b = beginSession({ ...r0, levels }, fx);
  const s = b.session;
  noteSeed(s);
  if (kind === 'poor') {
    noteEssence(s, 80);
  } else if (kind === 'first') {
    noteEssence(s, 952);
    noteSpecies(s, fx, 'sp1', true);
    noteBehavior(s, 'swimmer', true);
    noteEncargo(s, fx);
    noteEncargo(s, fx);
    noteProduction(s, 4.2, 3);
    noteBest(s, 'sp1', 1.9);
  } else {
    noteEssence(s, kind === 'rich' ? 124000 : 1240);
    noteSpecies(s, fx, 'sp1', false);
    noteSpecies(s, fx, 'sp4', true);
    noteSpecies(s, fx, 'sp2', true);
    noteSpecies(s, fx, 'sp3', false);
    noteBehavior(s, 'spinner', true);
    noteEncargo(s, fx);
    noteGolden(s, fx);
    noteProduction(s, kind === 'rich' ? 380 : 31, 7);
    noteBest(s, 'sp4', kind === 'rich' ? 96 : 6.4);
  }
  s.elapsed = kind === 'first' ? 195 : kind === 'rich' ? 412 : 270;
  s.phase = 'over';
  const sum = summarize(s, { ...b.research, levels }, fx, species);
  if (kind === 'night') sum.vela = 'night';
  research = applySummary({ ...b.research, levels }, s, sum, fx);
  showSummary(sum);
}

// ───────────── route ─────────────
const view = q.get('view') ?? 'tree';
tree.update(treeData());
if (view === 'tree') {
  tree.open();
  const sel = q.get('sel');
  const z = q.get('zoom');
  const focus = q.get('focus');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (focus) tree.focus(focus, z ? Number(z) : undefined);
      if (sel) tree.select(sel);
      if (sel && q.get('why') === '1') setTimeout(() => (tree.el.querySelector('.rt-pricebox') as HTMLElement | null)?.click(), 450);
      const buy = q.get('buy');
      if (buy) setTimeout(() => (tree.el.querySelector(`.rt-node[data-id="${buy}"]`) as HTMLElement)?.click(), 100);
      if (buy) setTimeout(() => (tree.el.querySelector(`.rt-buy[data-buy="${buy}"]`) as HTMLElement | null)?.click(), 600);
    }),
  );
} else if (view === 'summary') mockSummary(q.get('sum') ?? 'rich');
else if (view === 'start') {
  const fresh = (q.get('fresh') ?? 'clock,startEssence,fridge,worldGyro').split(',');
  research = { ...research, fresh, fridge: ['sp1', 'sp3'] };
  // The newest open world is picked, as after buying it (session.researchBuy); &world= overrides.
  research = researchPickWorld(research, (q.get('world') as WorldId | null) ?? unlockedWorlds(research).at(-1)!);
  showStart();
} else if (view === 'hud' || view === 'flow') {
  const fx = treeEffects(research.levels);
  const b = beginSession(research, fx);
  research = b.research;
  session = b.session;
  if (view === 'flow') showStart();
  else {
    const phase = (q.get('phase') ?? 'running') as SessionState['phase'];
    const total = Number(q.get('total') ?? 210);
    const t = Number(q.get('t') ?? 154);
    session.phase = phase;
    session.limit = total;
    session.elapsed = phase === 'ready' ? 0 : total - t;
    const sprint = Number(q.get('sprint') ?? 0);
    hud.update(hudViewOf(session, sprint));
    if (phase !== 'ready') {
      noteEssence(session, Number(q.get('essence') ?? 1240));
      if (q.get('newsp') !== '0') noteSpecies(session, treeEffects(research.levels), 'sp4', true);
      showPreview(session);
      if (q.get('why') === '1') setTimeout(() => (top.querySelector('.ss-prev') as HTMLElement | null)?.click(), 50);
    }
    if (q.get('ext')) hud.extended(Number(q.get('ext')), 'species');
    if (q.get('banner') === '1') hud.lastMinute(dish);
    if (q.get('stamp') === '1') void hud.timesUp(dish);
  }
}

// ───────────── dev menu ─────────────
if (q.get('menu') !== '0') {
  const menu = document.createElement('div');
  menu.className = 'dv-menu';
  const add = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    menu.appendChild(b);
  };
  const go = (p: Record<string, string>) => {
    const u = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(p)) u.set(k, v);
    location.search = u.toString();
  };
  add('tree', () => go({ view: 'tree' }));
  add('flow', () => go({ view: 'flow' }));
  add('summary', () => go({ view: 'summary' }));
  add('start', () => go({ view: 'start' }));
  add('hud', () => go({ view: 'hud' }));
  for (const p of Object.keys(PRESETS)) add(p, () => go({ preset: p }));
  add('+100 Datos', () => {
    research = { ...research, datos: research.datos + 100 };
    tree.update(treeData());
  });
  add(lang === 'es' ? 'EN' : 'ES', () => go({ lang: lang === 'es' ? 'en' : 'es' }));
  add(theme === 'dark' ? 'light' : 'dark', () => go({ theme: theme === 'dark' ? 'light' : 'dark' }));
  document.body.appendChild(menu);
}

void C;
(window as unknown as { __tree: unknown }).__tree = { ready: true, tree, research: () => research };

