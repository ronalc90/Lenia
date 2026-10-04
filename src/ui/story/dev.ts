/**
 * Story dev page (story-dev.html): a fake game screen + the real story engine
 * and UI, to preview every scene, choice, task, hint and ending.
 *
 * URL params (used by tests/e2e/story-shots.mjs):
 *   ?lang=en  ?rm=1  ?menu=0
 *   ?scene=<id>&line=<n>        play a scene and jump to line n (typed out)
 *   ?scene=<id>&to=choice|wait  …or straight to its choice / task
 *   ?ending=<id>&t=<sec>        play an ending cinematic, frozen at t
 *   ?archive=1                  show the Historia archive panel
 *   ?hint=<kind>                trigger an environmental hint
 *   ?gallery=1                  all portraits in all moods
 *   ?freeze=<sec>               freeze the animation clock
 */
// Art tokens (--bl-*) before every module stylesheet (docs/ARTE.md §12).
import '../art/art.css';
import { Bus, type GameEvents } from '../../core/bus';
import type { CreatureView, GameView, Lang } from '../../core/types';
import { createStory } from '../../story/story';
import { createEncargos } from '../../story/encargos';
import { CHAIN, SIDE } from '../../story/encargoScript';
import { createEncargoUI } from './encargoUI';
import { SCENES } from '../../story/script';
import { ENDING_IDS, HINT_KINDS, type EndingId, type HintKind, type Mood, type Speaker } from '../../story/types';
import { Portrait, setVelaWear } from './portraits';
import { SPRITE_CODES, sprite } from './sprites';
import { createStoryUI } from './storyUI';

const q = new URLSearchParams(location.search);
let lang: Lang = q.get('lang') === 'en' ? 'en' : 'es';
let reduce = q.get('rm') === '1';
const GRID_W = 192;
const GRID_H = 240;

// ───────────── fake game screen ─────────────

const app = document.getElementById('app')!;
const css = document.createElement('style');
css.textContent = `
  .dv { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: Inter, system-ui, sans-serif; color: #e6edf3; }
  .dv-hud { height: 56px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: #0b0e12; border-bottom: 1px solid rgba(230,237,243,.08); }
  .dv-ess { display: flex; flex-direction: column; padding: 4px 10px; border-radius: 10px; }
  .dv-ess b { font: 700 20px/1.1 'JetBrains Mono', monospace; color: #5bc0eb; }
  .dv-ess small { font-size: 11px; color: #8b98a5; }
  .dv-cur { font: 600 13px/1 'JetBrains Mono', monospace; color: #8ae234; }
  .dv-objbar { flex: none; padding: 4px 10px 6px; background: #0b0e12; }
  .dv-dish { position: relative; flex: 1 1 55%; min-height: 0; background: radial-gradient(ellipse at 50% 45%, #0e131a 0%, #07090c 70%); }
  .dv-dish canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .dv-obj { position: absolute; left: 10px; right: 10px; top: 8px; font-size: 12px; color: #8b98a5; }
  .dv-tabs { height: 56px; flex: none; display: flex; background: #141a21; border-top: 1px solid rgba(230,237,243,.08); }
  .dv-tab { flex: 1; display: grid; place-items: center; font-size: 12px; color: #8b98a5; border: 0; background: none; }
  .dv-panel { flex: 0 0 34%; background: #141a21; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .dv-up { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 12px; background: #1b232c; }
  .dv-up .n { flex: 1; } .dv-up .n b { display: block; font-size: 14px; } .dv-up .n small { color: #8b98a5; font-size: 12px; }
  .dv-buy { min-width: 76px; height: 44px; border-radius: 10px; border: 0; background: #5bc0eb; color: #062130; font: 700 14px/1 'JetBrains Mono', monospace; }
  .dv-ext { height: 48px; border-radius: 12px; border: 1px solid #b892ff; background: rgba(184,146,255,.12); color: #e6edf3; font-weight: 600; }
  .dv-menu-btn { position: fixed; left: 8px; bottom: 8px; z-index: 100; height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid #2a3440; background: #0b0e12cc; color: #8b98a5; font: 600 12px Inter, sans-serif; }
  .dv-menu { position: fixed; left: 8px; bottom: 52px; z-index: 100; width: 300px; max-height: 70vh; overflow: auto; padding: 10px; border-radius: 12px; background: #0b0e12f2; border: 1px solid #2a3440; font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
  .dv-menu h5 { margin: 6px 0 2px; color: #8b98a5; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
  .dv-menu .row { display: flex; flex-wrap: wrap; gap: 4px; }
  .dv-menu button { padding: 5px 8px; border-radius: 8px; border: 1px solid #2a3440; background: #141a21; color: #e6edf3; font-size: 11px; }
  .dv-arch { position: fixed; inset: 0; z-index: 70; overflow: auto; background: #0b0e12; padding: 16px; }
  .dv-gal { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(auto-fill, 120px); gap: 12px; padding: 12px; overflow: auto; background: #0b0e12; z-index: 90; }
  .dv-gal canvas { width: 120px; height: 120px; border-radius: 12px; border: 1px solid #1b232c; }
`;
document.head.appendChild(css);

const screen = document.createElement('div');
screen.className = 'dv';
screen.innerHTML = `
  <div class="dv-hud"><div class="dv-ess hud-ess"><b>1 284</b><small>12,4 / s</small></div><span class="dv-cur">◆ 7</span><span class="dv-cur" style="color:#b892ff">✦ 12</span></div>
  <div class="dv-objbar"></div>
  <div class="dv-dish"><canvas></canvas><div class="dv-obj"></div></div>
  <div class="dv-tabs"><button class="dv-tab" data-tab="lab">Lab</button><button class="dv-tab" data-tab="bestiary">Bestiario</button><button class="dv-tab" data-tab="calibrate">Calibrar</button><button class="dv-tab" data-tab="genome">Genoma</button></div>
  <div class="dv-panel">
    <div class="dv-up" data-up="dropper"><div class="n"><b>Gotero I</b><small>Esporas más consistentes</small></div><button class="dv-buy buy">15</button></div>
    <div class="dv-up"><div class="n"><b>Cultivo</b><small>+10 % Esencia</small></div><button class="dv-buy" style="background:#222c37;color:#8b98a5">50</button></div>
    <button class="dv-ext ext-btn">Extinguir · +12 Genoma</button>
  </div>`;
app.appendChild(screen);
const dishEl = screen.querySelector<HTMLElement>('.dv-dish')!;
const dishCanvas = dishEl.querySelector('canvas')!;

// ───────────── mock game view ─────────────

const creatures: CreatureView[] = [
  { id: 1, x: 70, y: 90, r: 9, state: 'stable', behavior: 'swimmer', speciesId: 'a', speciesName: 'Orbium', eps: 1.2, age: 900 },
  { id: 2, x: 130, y: 70, r: 9, state: 'stable', behavior: 'spinner', speciesId: 'b', speciesName: 'Gyrorbium', eps: 1.8, age: 900 },
  { id: 3, x: 120, y: 160, r: 11, state: 'stable', behavior: 'still', speciesId: 'c', speciesName: 'Scutium', eps: 1.0, age: 900 },
  { id: 4, x: 55, y: 180, r: 10, state: 'stable', behavior: 'pulsing', speciesId: 'd', speciesName: 'Helicium', eps: 1.3, age: 900 },
  { id: 5, x: 160, y: 205, r: 9, state: 'stable', behavior: 'divider', speciesId: 'e', speciesName: 'Parorbium', eps: 2.2, age: 900 },
];
const speciesNames = ['Orbium unicaudatus', 'Gyrorbium gyrans', 'Scutium solidus', 'Helicium solidus', 'Parorbium dividuus'];
let golden: GameView['golden'] = { x: 100, y: 120, life: 0.9 };

function view(): GameView {
  const t = performance.now() / 1000;
  const g = golden ? { x: golden.x + Math.sin(t * 0.4) * 20, y: golden.y + Math.cos(t * 0.3) * 14, life: golden.life } : null;
  return {
    essence: 1284,
    essencePerSec: 12.4,
    samples: 7,
    genome: 12,
    era: 6,
    seedCost: 4,
    canSeed: true,
    pipette: { active: false, progress: 0 },
    tools: { longPress: true, brush: false, eraser: true, speeds: [1, 2], speed: 1 },
    upgrades: [
      {
        id: 'dropper',
        tab: 'lab',
        name: { es: 'Gotero', en: 'Dropper' },
        desc: { es: '', en: '' },
        effect: { es: '', en: '' },
        level: 0,
        maxLevel: 5,
        cost: 15,
        qty: 1,
        currency: 'essence',
        affordable: true,
        unlocked: true,
        unlockHint: { es: '', en: '' },
        maxed: false,
      },
    ],
    genomeNodes: [],
    species: speciesNames.map((n, i) => ({
      id: String(i),
      name: n,
      catalogName: n,
      rarity: 'common',
      behavior: null,
      mult: 1.1 + i * 0.1,
      timesSeen: 3,
      era: 1,
      portrait: null,
      muRange: [0.15, 0.15],
      sigmaRange: [0.015, 0.015],
      printCost: 1,
      isNew: false,
    })),
    behaviorsSeen: ['still', 'swimmer', 'spinner', 'pulsing', 'divider'],
    calibration: { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 },
    journal: [],
    achievements: [],
    extinction: { available: true, genomeGain: 12, gainIn10Min: 14, requirement: { es: '', en: '' }, progress: 1 },
    golden: g,
    buffs: [],
    creatures: creatures.map((c, i) => ({ ...c, x: c.x + Math.sin(t * 0.3 + i) * 6, y: c.y + Math.cos(t * 0.25 + i) * 6 })),
    objective: null,
    settings: { lang, sfxVolume: 1, musicVolume: 1, muted: false, vibration: true, reduceMotion: reduce, oneTouch: false, quality: 'auto', analytics: false },
    tabs: { lab: true, bestiary: true, calibrate: true, genome: true },
    stats: { playTime: 9000, totalEssence: 1e6, eraEssence: 3e5, seeds: 120, creaturesBorn: 60 },
  };
}

function gridToClient(x: number, y: number): { x: number; y: number } {
  const r = dishEl.getBoundingClientRect();
  const s = Math.min(r.width / GRID_W, r.height / GRID_H);
  const ox = r.left + (r.width - GRID_W * s) / 2;
  const oy = r.top + (r.height - GRID_H * s) / 2;
  return { x: ox + x * s, y: oy + y * s };
}

// Fake dish: real catalog creatures as sprites at the mock positions.
function drawDish(t: number): void {
  const r = dishEl.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (dishCanvas.width !== Math.round(r.width * dpr)) {
    dishCanvas.width = Math.round(r.width * dpr);
    dishCanvas.height = Math.round(r.height * dpr);
  }
  const ctx = dishCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const v = view();
  v.creatures.forEach((c, i) => {
    const p = gridToClient(c.x, c.y);
    const sp = sprite(SPRITE_CODES[[0, 1, 3, 4, 2][i] ?? 0], 96);
    const s = 70;
    ctx.save();
    ctx.translate(p.x - r.left, p.y - r.top);
    ctx.rotate(t * 0.2 + i);
    ctx.drawImage(sp.canvas, -s / 2, -s / 2, s, s);
    ctx.restore();
  });
  if (v.golden) {
    const p = gridToClient(v.golden.x, v.golden.y);
    const g = ctx.createRadialGradient(p.x - r.left, p.y - r.top, 0, p.x - r.left, p.y - r.top, 16);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.3, '#FFD166');
    g.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x - r.left, p.y - r.top, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ───────────── story + UI ─────────────

const bus = new Bus<GameEvents>();
// isBlocked: the dev page drives scenes by hand, the scheduler never starts one.
const story = createStory({ bus, getView: view, storage: null, pollMs: 0, random: () => 0.5, isBlocked: () => true });

function rectOf(sel: string): DOMRect | null {
  const el = document.querySelector(sel);
  return el ? el.getBoundingClientRect() : null;
}

const ui = createStoryUI(app, story, {
  lang: () => lang,
  reduceMotion: () => reduce,
  gridToClient,
  getTargetRect(id) {
    switch (id) {
      case 'dish':
        return dishEl.getBoundingClientRect();
      case 'creature': {
        const p = gridToClient(view().creatures[0].x, view().creatures[0].y);
        return new DOMRect(p.x - 34, p.y - 34, 68, 68);
      }
      case 'golden': {
        const g = view().golden;
        if (!g) return null;
        const p = gridToClient(g.x, g.y);
        return new DOMRect(p.x - 30, p.y - 30, 60, 60);
      }
      case 'hud.essence':
        return rectOf('.hud-ess');
      case 'upgrade.dropper':
        return rectOf('[data-up="dropper"] .buy');
      case 'extinguish':
        return rectOf('.ext-btn');
      default:
        if (id.startsWith('tab.')) return rectOf(`.dv-tab[data-tab="${id.slice(4)}"]`);
        return null;
    }
  },
});

// Encargos: driven by hand in the dev page (no polling).
const encargos = createEncargos({ bus, getView: view, story, storage: null, pollMs: 0, random: () => 0.3 });
const objBar = document.querySelector<HTMLElement>('.dv-objbar')!;
const encUI = createEncargoUI(app, encargos, {
  lang: () => lang,
  reduceMotion: () => reduce,
  busy: () => ui.busy,
  getTargetRect: (id) => (id === 'objective' ? objBar.getBoundingClientRect() : null),
});
encUI.mountBadge(objBar);

// Sample archive state: some scenes seen, two endings found.
story.load({
  v: 1,
  done: SCENES.filter((s) => s.act <= 2 || s.id === 'a3_confession').map((s) => s.id),
  doneAt: Object.fromEntries(SCENES.filter((s) => s.act <= 2 || s.id === 'a3_confession').map((s) => [s.id, Date.now() - 1e6])),
  choices: { lamp: 'lamp', sample: 'refuse', rhythm: 'answer' },
  counters: { seeds: 120, goldenCaught: 14, calib: 30 },
  flags: ['choirNamed'],
  endings: ['memory', 'tide'],
  lastEndingEra: 6,
  journal: [],
  journalRead: [],
  eraStartAt: Date.now(),
  lastEra: 6,
  tutorialSkipped: false,
  enabled: true,
  deferUntil: {},
});

function play(id: string, opts: { line?: number; to?: string } = {}): void {
  // Choir lines read best with a known rhythm.
  for (let i = 0; i < 6; i++) bus.emit('seed', { x: 10, y: 10, cost: 1, manual: true });
  story.play(id);
  const want = opts.to;
  for (let i = 0; i < 30; i++) {
    const cur = story.current();
    if (!cur) break;
    if (want === 'choice' && cur.phase === 'choice') break;
    if (want === 'wait' && cur.phase === 'wait') break;
    if (want === 'wait' && cur.phase === 'choice') {
      const first = cur.options?.[0]?.id;
      if (first) story.choose(first);
      continue;
    }
    if (!want && (opts.line ?? 0) <= (cur.line?.index ?? 0)) break;
    if (cur.phase !== 'lines') break;
    story.advance();
  }
  ui.debug.completeTyping();
}

function ending(id: EndingId, t?: number): void {
  ui.playEnding(id);
  if (t !== undefined) {
    ui.debug.freezeAt(t);
    ui.debug.seekEnding(t);
  }
}

// ───────────── dev menu ─────────────

const menuBtn = document.createElement('button');
menuBtn.className = 'dv-menu-btn';
menuBtn.textContent = '☰ Story dev';
const menu = document.createElement('div');
menu.className = 'dv-menu';
menu.hidden = true;
menuBtn.onclick = () => (menu.hidden = !menu.hidden);
function section(title: string, items: [string, () => void][]): void {
  const h = document.createElement('h5');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    row.appendChild(b);
  }
  menu.append(h, row);
}
section('Settings', [
  ['es / en', () => {
    lang = lang === 'es' ? 'en' : 'es';
    ui.relabel();
  }],
  ['reduce motion', () => (reduce = !reduce)],
  ['golden on/off', () => (golden = golden ? null : { x: 100, y: 120, life: 0.9 })],
  ['archive', () => toggleArchive()],
]);
for (const act of [1, 2, 3, 4]) section(`Act ${act}`, SCENES.filter((s) => s.act === act).map((s) => [s.id, () => play(s.id, {})]));
section('Choices', SCENES.filter((s) => s.choice).map((s) => [`${s.id} ▸ choice`, () => play(s.id, { to: 'choice' })]));
section('Tasks', SCENES.filter((s) => s.wait).map((s) => [`${s.id} ▸ task`, () => play(s.id, { to: 'wait' })]));
section('Endings', ENDING_IDS.map((id) => [id, () => ending(id)]));
section('Hints', HINT_KINDS.map((k) => [k, () => hint(k)]));
section('Encargos · chain', CHAIN.map((e) => [e.id, () => encargos.debug.offer(e.id)]));
section('Encargos · side', SIDE.map((e) => [e.id, () => encargos.debug.offer(e.id)]));
section('Encargos · actions', [
  ['complete current', () => encargos.debug.complete()],
  ['why?', () => encargos.why()],
  ['wear all', () => setVelaWear(['scarf', 'medal', 'flower'])],
  ['wear none', () => setVelaWear([])],
]);
if (q.get('menu') !== '0') document.body.append(menuBtn, menu);

function hint(kind: HintKind): void {
  // Feed it through the story's own bus events where possible; else emit directly.
  story.events.emit('hint', { kind, duration: 9, color: kind === 'tint' ? '#6EE7C8' : undefined, x: 96, y: 120 });
}

let archiveEl: HTMLElement | null = null;
function toggleArchive(): void {
  if (archiveEl) {
    archiveEl.remove();
    archiveEl = null;
    return;
  }
  archiveEl = document.createElement('div');
  archiveEl.className = 'dv-arch';
  document.body.appendChild(archiveEl);
  ui.mountArchive(archiveEl);
}

function gallery(): void {
  const el = document.createElement('div');
  el.className = 'dv-gal';
  document.body.appendChild(el);
  const items: { p: Portrait; talk: boolean }[] = [];
  const combos: [Speaker, Mood, boolean, boolean][] = [
    ['vela', 'neutral', false, false],
    ['vela', 'happy', false, false],
    ['vela', 'worried', false, false],
    ['vela', 'awed', false, false],
    ['vela', 'neutral', true, false],
    ['vela', 'happy', true, false],
    ['albor', 'neutral', true, false],
    ['albor', 'happy', false, true],
    ['committee', 'neutral', true, false],
    ['coro', 'neutral', true, false],
    ['you', 'neutral', true, false],
  ];
  for (const [s, m, talk, live] of combos) {
    const p = new Portrait();
    p.set(s, m, live);
    el.appendChild(p.canvas);
    items.push({ p, talk });
  }
  // VELA's wardrobe (Encargo rewards).
  for (const [m, wear] of [
    ['happy', ['scarf']],
    ['neutral', ['medal']],
    ['awed', ['flower']],
    ['happy', ['scarf', 'medal', 'flower']],
  ] as [Mood, string[]][]) {
    const p = new Portrait();
    p.set('vela', m);
    p.state.wear = wear;
    el.appendChild(p.canvas);
    items.push({ p, talk: false });
  }
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    const t = now / 1000;
    for (const it of items) {
      if (it.p.state.speaker === 'coro' && Math.random() < 0.03) it.p.pulse();
      it.p.state.reduceMotion = reduce;
      it.p.frame(t, dt, it.talk ? 0.5 + 0.5 * Math.abs(Math.sin(t * 11)) : 0, it.talk);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Background loop for the fake dish.
const t0 = performance.now();
function bg(now: number): void {
  drawDish((now - t0) / 1000);
  requestAnimationFrame(bg);
}
requestAnimationFrame(bg);

// ───────────── URL-driven states ─────────────

const freeze = q.get('freeze');
if (freeze !== null) ui.debug.freezeAt(Number(freeze));
if (q.get('gallery') === '1') gallery();
const sc = q.get('scene');
if (sc) setTimeout(() => play(sc, { line: Number(q.get('line') ?? 0), to: q.get('to') ?? undefined }), 50);
const en = q.get('ending') as EndingId | null;
if (en && (ENDING_IDS as readonly string[]).includes(en)) setTimeout(() => ending(en, q.get('t') !== null ? Number(q.get('t')) : undefined), 50);
if (q.get('archive') === '1') toggleArchive();
const wear = q.get('wear');
if (wear !== null) setVelaWear(wear ? wear.split(',') : []);
const encId = q.get('enc');
if (encId) {
  if (q.get('hold') === '1') encUI.debug.hold(true);
  setTimeout(() => {
    encargos.debug.offer(encId);
    if (q.get('done') === '1') setTimeout(() => encargos.debug.complete(), Number(q.get('after') ?? 200));
  }, 80);
}
if (q.get('why')) setTimeout(() => {
  encargos.debug.offer(q.get('why')!);
  setTimeout(() => {
    encargos.why();
    ui.debug.completeTyping();
  }, 50);
}, 80);
const hk = q.get('hint') as HintKind | null;
if (hk) setTimeout(() => hint(hk), 300);

(window as unknown as { __storyDev: unknown }).__storyDev = { story, ui, play, ending, hint, toggleArchive, bus, encargos, encUI };
