/**
 * Momentos dev page (moments-dev.html): a fake game screen around a REAL
 * CPU-Lenia dish (128×128, Orbium rules) + the real Momentos engine and UI,
 * to preview every moment, the brief labels, the creature status pills, the
 * help sheet and the seed price sheet.
 *
 * URL params (used by tests/e2e/moments-shots.mjs):
 *   ?m=<id>         open a moment (as if it just happened, at a real creature)
 *   &mode=brief     …as a brief label instead of a card
 *   &t=<sec>        freeze the moment's animation at t seconds (screenshots)
 *   ?lang=en  ?theme=light  ?rm=1  ?menu=0
 *   ?help=1         the "¿Qué pasó?" sheet (&seen=all marks everything seen)
 *   ?price=1        the seed price sheet ("2 · ×1,5 · ×3 = 9")
 *   ?status=1       creature status pills on every creature
 *   ?replay=<id>    re-watch a card from the help sheet
 */
// Art tokens (--bl-*) before every module stylesheet (docs/ARTE.md §12).
import { featureChips } from '../../species/looks';
import '../art/art.css';
import { Bus, type GameEvents } from '../../core/bus';
import { Camera } from '../../core/camera';
import { matterLUT } from '../../core/palette';
import type { Behavior, CreatureView, GameView, Lang, SeedPriceView, SpeciesView, UpgradeView } from '../../core/types';
import { createMoments } from '../../moments/moments';
import { MOMENT_BY_ID, MOMENT_IDS } from '../../moments/catalog';
import type { MomentId } from '../../moments/types';
import { CpuLenia } from '../../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../../sim/catalog';
import { applySeedCpu } from '../../sim/seed';
import { moIcon } from './icons';
import { createMomentsUI } from './momentsUI';
import { SlotMeter, bigSeedReason, createSeedPriceSheet } from './seedprice';
import { StatusLayer } from './status';
import { createSpeciesCard, createSpeciesCompare, speciesInputFromView } from './species-card';

const q = new URLSearchParams(location.search);
let lang: Lang = q.get('lang') === 'en' ? 'en' : 'es';
let reduce = q.get('rm') === '1';
let theme: 'dark' | 'light' = q.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.lang = lang;

const N = 128;
const LUT = matterLUT();
/** ?bseen=still,swimmer → behaviours already seen (the guide shows the rest as silhouettes). */
const SEEN_BEHAVIORS = (q.get('bseen') ?? 'still,swimmer,spinner')
  .split(',')
  .filter((b): b is Behavior => ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'].includes(b));

// ───────────── fake game screen ─────────────

const app = document.getElementById('app')!;
const css = document.createElement('style');
css.textContent = `
  .dv { position: absolute; inset: 0; display: grid; grid-template-rows: 56px 1fr 56px 52px auto; font-family: Inter, system-ui, sans-serif;
        --bg:#0b0e12; --sf:#141a21; --sf2:#1b232c; --tx:#e6edf3; --dm:#8b98a5; --ln:rgba(230,237,243,.08); --ac:#5bc0eb; background: var(--bg); color: var(--tx); }
  html[data-theme='light'] .dv { --bg:#edf1f5; --sf:#f8fafc; --sf2:#fff; --tx:#0f1720; --dm:#4e5c6a; --ln:rgba(15,23,32,.1); --ac:#0d79ae; }
  .dv-hud { display: flex; align-items: center; gap: 10px; padding: 0 10px; background: var(--sf); border-bottom: 1px solid var(--ln); }
  .dv-ess { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 12px; background: var(--sf2); }
  .dv-ess b { font: 700 19px/1.05 'JetBrains Mono', monospace; color: var(--ac); display: block; }
  .dv-ess small { font: 600 11px 'JetBrains Mono', monospace; color: var(--dm); }
  .dv-cur { font: 700 13px 'JetBrains Mono', monospace; display: flex; align-items: center; gap: 4px; }
  .dv-cur.s { color: #8ae234; } .dv-cur.g { color: #b892ff; }
  html[data-theme='light'] .dv-cur.s { color: #377a10; } html[data-theme='light'] .dv-cur.g { color: #6b42d4; }
  .dv-sp { flex: 1; }
  .dv-dish { position: relative; min-height: 0; background: radial-gradient(ellipse at 50% 45%, #0e131a 0%, #07090c 70%); overflow: hidden; }
  .dv-dish canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .dv-seedrow { display: flex; align-items: center; gap: 10px; padding: 0 10px; background: var(--sf); border-top: 1px solid var(--ln); }
  .dv-seed { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 14px; border-radius: 12px; border: 0; background: var(--ac); color: #062130; font: 800 15px Inter, sans-serif; }
  html[data-theme='light'] .dv-seed { color: #fff; }
  .dv-seed b { font-family: 'JetBrains Mono', monospace; }
  .dv-i { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--ln); background: transparent; color: var(--dm); display: grid; place-items: center; }
  .dv-tabs { display: flex; background: var(--sf); border-top: 1px solid var(--ln); }
  .dv-tab { flex: 1; display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--dm); border: 0; background: none; }
  .dv-panel { height: 22vh; background: var(--sf); padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .dv-up { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--sf2); border: 1px solid var(--ln); }
  .dv-up .n { flex: 1; } .dv-up b { display: block; font-size: 14px; } .dv-up small { color: var(--dm); font-size: 12px; }
  .dv-buy { min-width: 70px; height: 40px; border-radius: 10px; border: 0; background: var(--ac); color: #062130; font: 700 14px 'JetBrains Mono', monospace; }
  .dv-ext { height: 44px; border-radius: 12px; border: 1px solid #b892ff; background: rgba(184,146,255,.12); color: var(--tx); font-weight: 700; }
  @media (min-width: 900px) and (min-aspect-ratio: 1/1) {
    .dv { grid-template-columns: 1fr 400px; grid-template-rows: 56px 56px 52px 1fr; }
    .dv-hud { grid-column: 1 / 3; }
    .dv-dish { grid-column: 1; grid-row: 2 / 5; }
    .dv-seedrow { grid-column: 2; grid-row: 2; border-left: 1px solid var(--ln); }
    .dv-tabs { grid-column: 2; grid-row: 3; border-left: 1px solid var(--ln); }
    .dv-panel { grid-column: 2; grid-row: 4; height: auto; border-left: 1px solid var(--ln); }
  }
  .dv-menu-btn { position: fixed; left: 8px; bottom: 8px; z-index: 100; height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid #2a3440; background: #0b0e12cc; color: #8b98a5; font: 600 12px Inter, sans-serif; }
  .dv-menu { position: fixed; left: 8px; bottom: 52px; z-index: 100; width: 320px; max-height: 70vh; overflow: auto; padding: 10px; border-radius: 12px; background: #0b0e12f2; border: 1px solid #2a3440; font-size: 12px; display: flex; flex-direction: column; gap: 6px; color: #e6edf3; }
  .dv-menu[hidden] { display: none; }
  .dv-menu h5 { margin: 6px 0 2px; color: #8b98a5; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
  .dv-menu .row { display: flex; flex-wrap: wrap; gap: 4px; }
  .dv-menu button { padding: 5px 8px; border-radius: 8px; border: 1px solid #2a3440; background: #141a21; color: #e6edf3; font-size: 11px; }
  .dv-modal { position: fixed; inset: 0; z-index: 30; background: rgba(3,5,8,.6); display: flex; align-items: flex-end; justify-content: center; }
  .dv-modal-in { width: min(520px, 100%); max-height: 88vh; overflow: auto; padding: 16px; border-radius: 20px 20px 0 0; background: var(--sf, #141a21); }
  html[data-theme='light'] .dv-modal-in { background: #f8fafc; }
`;
document.head.appendChild(css);

const L = (es: string, en: string) => (lang === 'es' ? es : en);
const root = document.createElement('div');
root.className = 'dv';
root.innerHTML = `
  <div class="dv-hud">
    <div class="dv-ess" data-t="hud.essence"><span style="color:var(--ac)">${moIcon('essence', 22)}</span><div><b class="ess">1.240</b><small class="eps">+3,2/s</small></div></div>
    <span class="dv-cur s" data-t="hud.samples">${moIcon('sample', 16)} 4</span>
    <span class="dv-cur g" data-t="hud.genome">${moIcon('genome', 16)} 0</span>
    <span class="dv-sp"></span>
    <button class="dv-i dv-help" aria-label="?">${moIcon('info', 20)}</button>
  </div>
  <div class="dv-dish" data-t="dish"><canvas class="cv-dish"></canvas><canvas class="cv-ov"></canvas></div>
  <div class="dv-seedrow">
    <button class="dv-seed" data-t="seed">${moIcon('drop', 18)}<span>${L('Sembrar', 'Sow')}</span><b class="price">9</b></button>
    <span class="meter-slot"></span>
    <span class="dv-sp"></span>
    <button class="dv-i dv-price" aria-label="i">${moIcon('info', 20)}</button>
  </div>
  <div class="dv-tabs">
    <button class="dv-tab" data-t="tab.lab">${L('Laboratorio', 'Lab')}</button>
    <button class="dv-tab" data-t="tab.bestiary">${L('Bestiario', 'Bestiary')}</button>
    <button class="dv-tab" data-t="tab.calibrate">${L('Calibrar', 'Calibrate')}</button>
    <button class="dv-tab" data-t="tab.genome">${L('Genoma', 'Genome')}</button>
  </div>
  <div class="dv-panel">
    <div class="dv-up"><div class="n"><b>${L('Gotero', 'Dropper')} I</b><small>${L('Tus semillas prenden más', 'Seeds take more often')}</small></div><button class="dv-buy">15</button></div>
    <div class="dv-up"><div class="n"><b>${L('Placa', 'Dish')}</b><small>${L('Más espacios baratos', 'More cheap slots')}</small></div><button class="dv-buy">120</button></div>
    <button class="dv-ext" data-t="extinguish">${L('Extinguir · +7 Genoma', 'Extinguish · +7 Genome')}</button>
  </div>
`;
app.appendChild(root);
const dishEl = root.querySelector('.dv-dish') as HTMLElement;
const dishCv = root.querySelector('.cv-dish') as HTMLCanvasElement;
const ovCv = root.querySelector('.cv-ov') as HTMLCanvasElement;
const dctx = dishCv.getContext('2d')!;
const octx = ovCv.getContext('2d')!;

// ───────────── a real Lenia dish ─────────────

const camera = new Camera(N, N);
const orbium = paramsOf(catalogByCode('O2u')!);
const sim = new CpuLenia(N, N, orbium);
sim.placeCentered(catalogPattern('O2u'), 40, 44);
sim.placeCentered(catalogPattern('O2u'), 92, 90);
applySeedCpu(sim.A, N, N, { x: 96, y: 30, radius: 13, density: 0.7, noise: 0.35, shape: 'blob', pattern: catalogPattern('O2u'), bias: 0.88, rotation: 1.1, rngSeed: 7919 });
const img = document.createElement('canvas');
img.width = N;
img.height = N;
const ictx = img.getContext('2d')!;
const idata = ictx.createImageData(N, N);

function paintSim(): void {
  const d = idata.data;
  for (let i = 0; i < N * N; i++) {
    const li = Math.round(Math.min(1, Math.max(0, sim.A[i])) * 255) * 4;
    d[i * 4] = LUT[li];
    d[i * 4 + 1] = LUT[li + 1];
    d[i * 4 + 2] = LUT[li + 2];
    d[i * 4 + 3] = LUT[li + 3];
  }
  ictx.putImageData(idata, 0, 0);
}

// Tiny tracker: blobs → creatures with stable ids, ages and states.
interface Tracked {
  id: number;
  x: number;
  y: number;
  r: number;
  age: number;
  mass: number;
}
let tracked: Tracked[] = [];
let nextId = 1;
function track(stepsSince: number): void {
  const lab = new Int32Array(N * N);
  const blobs: { x: number; y: number; m: number; n: number }[] = [];
  for (let i = 0; i < N * N; i++) {
    if (sim.A[i] <= 0.1 || lab[i]) continue;
    const ox = i % N;
    const oy = (i / N) | 0;
    let sx = 0;
    let sy = 0;
    let m = 0;
    let n = 0;
    const st = [i];
    lab[i] = 1;
    while (st.length) {
      const k = st.pop()!;
      const x = k % N;
      const y = (k / N) | 0;
      let dx = x - ox;
      let dy = y - oy;
      dx -= Math.round(dx / N) * N;
      dy -= Math.round(dy / N) * N;
      const a = sim.A[k];
      sx += dx * a;
      sy += dy * a;
      m += a;
      n++;
      for (const [ex, ey] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = ((y + ey + N) % N) * N + ((x + ex + N) % N);
        if (sim.A[j] > 0.1 && !lab[j]) {
          lab[j] = 1;
          st.push(j);
        }
      }
    }
    if (n < 12) continue;
    blobs.push({ x: (ox + sx / m + N) % N, y: (oy + sy / m + N) % N, m, n });
  }
  const next: Tracked[] = [];
  for (const b of blobs) {
    let best: Tracked | null = null;
    let bd = 14;
    for (const t of tracked) {
      let dx = Math.abs(t.x - b.x);
      let dy = Math.abs(t.y - b.y);
      dx = Math.min(dx, N - dx);
      dy = Math.min(dy, N - dy);
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    next.push({ id: best ? best.id : nextId++, x: b.x, y: b.y, r: Math.sqrt(b.n / Math.PI), age: (best?.age ?? 0) + stepsSince, mass: b.m });
  }
  tracked = next;
}

let simSteps = 0;
sim.step(30);
track(400); // the two catalog Orbiums count as already stable
tracked.forEach((t, i) => (t.age = i < 2 ? 900 : 120));
paintSim();

// ───────────── fake game view ─────────────

const bus = new Bus<GameEvents>();
let golden: { x: number; y: number } | null = null;
let fakeStates: CreatureView[] | null = null;
const demoPrice: SeedPriceView = { base: 2, alive: 2, crowdMult: 1.5, freeSlots: 1, used: 2, satMult: 3, bigMult: 2.25, freeSeeds: 3 };

/** Two registered species (the dish runs Orbium rules; the second is a demo of a different one). */
const SPECIES: SpeciesView[] = [
  {
    id: 'sp1',
    name: 'Nadadora celeste',
    subtitle: 'Criatura 1',
    catalogName: 'Orbium unicaudatus',
    lookCode: 'O2u',
    chips: featureChips('O2u').map((c) => ({ id: c.id, label: c.label })),
    rarity: 'common',
    behavior: 'swimmer',
    mult: 1.1,
    timesSeen: 3,
    era: 1,
    portrait: catalogPattern('O2u'),
    muRange: [0.15, 0.15],
    sigmaRange: [0.015, 0.015],
    printCost: 1,
    isNew: false,
    hue: 198,
  },
  {
    id: 'sp2',
    name: 'Anillo verde',
    subtitle: 'Criatura 2',
    catalogName: 'Circium ventilans',
    lookCode: 'C0v',
    chips: featureChips('C0v').map((c) => ({ id: c.id, label: c.label })),
    rarity: 'uncommon',
    behavior: 'still',
    mult: 1.3,
    timesSeen: 1,
    era: 1,
    portrait: catalogPattern('C0v'),
    muRange: [0.38, 0.38],
    sigmaRange: [0.07, 0.07],
    printCost: 1,
    isNew: true,
    hue: 112,
  },
];

function upgrade(id: string, es: string, en: string, level: number, effect: [string, string] = ['', '']): UpgradeView {
  return {
    id,
    tab: id === 'cataloguing' ? 'bestiary' : 'lab',
    name: { es, en },
    desc: { es: '', en: '' },
    effect: { es: effect[0], en: effect[1] },
    level,
    maxLevel: 10,
    cost: 15,
    qty: 1,
    currency: id === 'cataloguing' ? 'samples' : 'essence',
    affordable: true,
    unlocked: true,
    unlockHint: { es: '', en: '' },
    maxed: false,
  };
}

function creatureViews(): CreatureView[] {
  if (fakeStates) return fakeStates;
  return tracked.map((t, i) => {
    const s2 = i === 1;
    return {
      id: t.id,
      x: t.x,
      y: t.y,
      r: t.r,
      state: t.age >= 400 ? 'stable' : 'born',
      behavior: t.age >= 400 ? (s2 ? 'still' : 'swimmer') : null,
      speciesId: s2 ? 'sp2' : 'sp1',
      speciesName: s2 ? 'Anillo verde' : 'Nadadora celeste',
      eps: t.age >= 400 ? (s2 ? 1.43 : 1.94) : 0,
      age: t.age,
      hue: SPECIES[s2 ? 1 : 0].hue,
    };
  });
}

function view(): GameView {
  const creatures = creatureViews();
  return {
    essence: 1240,
    essencePerSec: 3.2,
    samples: 4,
    genome: 0,
    era: 1,
    seedCost: 9,
    seedPrice: demoPrice,
    canSeed: true,
    pipette: { active: false, progress: 0 },
    tools: { longPress: true, brush: false, eraser: true, speeds: [1], speed: 1 },
    upgrades: [
      upgrade('swimAffinity', 'Afinidad nadadora', 'Swimmer affinity', 1),
      upgrade('sessileAffinity', 'Afinidad sésil', 'Sessile affinity', 0),
      upgrade('cataloguing', 'Catalogación', 'Cataloguing', 0),
      {
        id: 'dropper',
        tab: 'lab',
        name: { es: 'Gotero', en: 'Dropper' },
        desc: { es: 'Tus semillas prenden más.', en: 'Your seeds take more often.' },
        effect: { es: 'Éxito +4 % → +8 %', en: 'Success +4% → +8%' },
        level: 1,
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
    species: SPECIES,
    behaviorsSeen: SEEN_BEHAVIORS,
    calibration: {
      mu: 0.15,
      sigma: 0.015,
      R: 13,
      dt: 0.1,
    },
    journal: [],
    achievements: [],
    extinction: { available: true, genomeGain: 7, gainIn10Min: 9, requirement: { es: '', en: '' }, progress: 1 },
    golden: golden ? { ...golden, life: 0.8 } : null,
    buffs: [],
    creatures,
    objective: null,
    settings: {
      lang,
      sfxVolume: 1,
      musicVolume: 1,
      muted: true,
      vibration: false,
      reduceMotion: reduce,
      oneTouch: false,
      quality: 'auto',
      analytics: false,
      theme,
    },
    tabs: { lab: true, bestiary: true, calibrate: true, genome: true },
    stats: { playTime: 600, totalEssence: 5000, eraEssence: 5000, seeds: 12, creaturesBorn: 9 },
    overgrown: false,
  };
}

// ───────────── engine + UI ─────────────

const moments = createMoments({ bus, getView: view, storage: null, pollMs: 0 });
let paused = false;
const ui = createMomentsUI(app, moments, {
  camera,
  getDishRect: () => dishCv.getBoundingClientRect(),
  lang: () => lang,
  reduceMotion: () => reduce,
  theme: () => theme,
  onPause: (on) => (paused = on),
  getTargetRect: (id) => (root.querySelector(`[data-t="${id}"]`) as HTMLElement | null)?.getBoundingClientRect() ?? null,
  creaturePos: (id) => {
    const t = tracked.find((c) => c.id === id);
    return t ? { x: t.x, y: t.y } : null;
  },
  speciesPortrait: (id) => SPECIES.find((x) => x.id === id)?.portrait ?? catalogPattern('O2u'),
  speciesInfo: (id) => speciesInputFromView(view(), id),
  onShowUpgrade: () => undefined,
  upgrades: () => view().upgrades,
  seenBehaviors: () => view().behaviorsSeen,
  onAction: (a) => {
    if (a === 'sterilize') sim.A.fill(0);
  },
});

const meter = new SlotMeter(() => lang);
root.querySelector('.meter-slot')!.appendChild(meter.el);
meter.update(view());
const priceSheet = createSeedPriceSheet(app, { lang: () => lang, reduceMotion: () => reduce, onSeeDish: () => undefined });
root.querySelector('.dv-price')!.addEventListener('click', () => priceSheet.open(view()));
// ONE tap on the price opens the explanation.
root.querySelector('.dv-seed')!.addEventListener('click', () => priceSheet.open(view()));

const status = new StatusLayer();
ovCv.addEventListener('click', (e) => {
  const r = ovCv.getBoundingClientRect();
  const hit = status.hitTest(e.clientX - r.left, e.clientY - r.top);
  if (hit?.behavior) ui.openBehaviorGuide(hit.behavior);
});
let statusOn = q.get('status') === '1';

// ───────────── per-moment staging (so the zoomed dish shows the right thing) ─────────────

function mainCreature(): Tracked {
  return [...tracked].sort((a, b) => b.age - a.age)[0] ?? { id: 0, x: 40, y: 44, r: 8, age: 900, mass: 70 };
}

function stage(id: MomentId): unknown {
  const c = mainCreature();
  const free = { x: 30, y: 100 };
  switch (id) {
    case 'seed':
      applySeedCpu(sim.A, N, N, { x: free.x, y: free.y, radius: 13, density: 0.7, noise: 0.35, shape: 'blob', pattern: catalogPattern('O2u'), bias: 0.6, rotation: 0.4, rngSeed: 31 });
      paintSim();
      return { x: free.x, y: free.y, cost: 2, manual: true };
    case 'autoseed':
      applySeedCpu(sim.A, N, N, { x: free.x, y: free.y, radius: 13, density: 0.7, noise: 0.35, shape: 'blob', pattern: catalogPattern('O2u'), bias: 0.6, rotation: 2.4, rngSeed: 77 });
      paintSim();
      return { x: free.x, y: free.y, cost: 3, manual: false };
    case 'dissolve':
      applySeedCpu(sim.A, N, N, { x: free.x, y: free.y, radius: 11, density: 0.16, noise: 0.6, shape: 'blob', bias: 0, rngSeed: 5 });
      paintSim();
      return { id: 99, x: free.x, y: free.y };
    case 'explode':
      applySeedCpu(sim.A, N, N, { x: free.x, y: free.y, radius: 26, density: 0.55, noise: 0.8, shape: 'noise', bias: 0, rngSeed: 9 });
      paintSim();
      return { id: 98, x: free.x, y: free.y };
    case 'overgrown':
      for (let k = 0; k < 9; k++)
        applySeedCpu(sim.A, N, N, { x: (k % 3) * 43 + 20, y: Math.floor(k / 3) * 43 + 20, radius: 24, density: 0.5, noise: 0.8, shape: 'noise', bias: 0, rngSeed: 11 + k });
      paintSim();
      return { on: true };
    case 'golden':
      golden = { x: c.x + 16, y: c.y - 10 };
      return { x: golden.x, y: golden.y };
    case 'stable':
    case 'income':
    case 'division':
      return { id: c.id, x: c.x, y: c.y, amount: 1.2, parentId: c.id };
    case 'species':
      return { speciesId: 'sp1', name: 'Nadadora celeste', rarity: 'common', x: c.x, y: c.y };
    case 'secondSpecies': {
      const other = tracked[1] ?? c;
      return { speciesId: 'sp2', name: 'Anillo verde', rarity: 'uncommon', x: other.x, y: other.y };
    }
    default:
      if (id.startsWith('behavior.')) return { behavior: id.slice(9), x: c.x, y: c.y };
      return undefined;
  }
}

function showMoment(id: MomentId, mode?: 'full' | 'brief'): void {
  const payload = stage(id);
  moments.show(id, { payload, mode });
  if (MOMENT_BY_ID.get(id)?.illustration) ui.debug.prepare();
}

// ───────────── loop ─────────────

function resize(): void {
  const r = dishEl.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [dishCv, ovCv]) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  camera.setView(r.width, r.height);
}
window.addEventListener('resize', resize);
resize();

let acc = 0;
let lastT = performance.now();
const freeze = q.get('t') !== null ? Number(q.get('t')) : null;

function drawDish(): void {
  const w = camera.viewW;
  const h = camera.viewH;
  const dpr = dishCv.width / Math.max(1, w);
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dctx.clearRect(0, 0, w, h);
  const s = camera.scale;
  const W = N * s;
  const ox = w / 2 - camera.cx * s;
  const oy = h / 2 - camera.cy * s;
  dctx.save();
  if (camera.zoom <= 1.001) {
    dctx.beginPath();
    dctx.rect((w - W) / 2, (h - W) / 2, W, W);
    dctx.clip();
    dctx.fillStyle = '#06080b';
    dctx.fillRect((w - W) / 2, (h - W) / 2, W, W);
  }
  dctx.imageSmoothingEnabled = true;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const px = ox + dx * W;
      const py = oy + dy * W;
      if (px > w || py > h || px + W < 0 || py + W < 0) continue;
      dctx.drawImage(img, px, py, W, W);
    }
  dctx.restore();
}

function drawOverlay(t: number, dt: number): void {
  const w = camera.viewW;
  const h = camera.viewH;
  const dpr = ovCv.width / Math.max(1, w);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  const cs = creatureViews();
  // Halos (like the game overlay) so creatures read as creatures.
  for (const c of cs) {
    const p = camera.gridToScreen(c.x, c.y);
    const R = Math.max(7, c.r * 1.9) * camera.scale + 3;
    octx.save();
    if (c.state === 'stable') {
      octx.strokeStyle = 'rgba(91,192,235,0.45)';
      octx.lineWidth = 2;
      octx.beginPath();
      octx.arc(p.x, p.y, R, 0, Math.PI * 2);
      octx.stroke();
    } else if (c.state === 'born') {
      octx.setLineDash([4, 5]);
      octx.strokeStyle = 'rgba(159,184,204,0.55)';
      octx.lineWidth = 1.5;
      octx.beginPath();
      octx.arc(p.x, p.y, R, 0, Math.PI * 2);
      octx.stroke();
    } else if (c.state === 'exploded') {
      const g = octx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.4);
      g.addColorStop(0, 'rgba(242,165,65,0.35)');
      g.addColorStop(1, 'rgba(228,87,46,0)');
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(p.x, p.y, R * 1.4, 0, Math.PI * 2);
      octx.fill();
    }
    octx.restore();
  }
  if (golden) {
    const p = camera.gridToScreen(golden.x, golden.y);
    const g = octx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.4, 'rgba(255,209,102,0.7)');
    g.addColorStop(1, 'rgba(255,209,102,0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    octx.fill();
  }
  // While a card explains something, the pills step aside (the card says it).
  const cur = moments.current();
  if ((statusOn || moments.labelsOnAll(1)) && !(cur && cur.mode === 'full')) {
    status.draw(
      octx,
      cs,
      (c) => {
        const p = camera.gridToScreen(c.x, c.y);
        return { x: p.x, y: p.y, r: Math.max(7, c.r * 1.9) * camera.scale + 3 };
      },
      { lang, time: t, dt: freeze !== null ? 1 : dt, reduceMotion: reduce, onAll: true, selectedId: cs[0]?.id ?? null, view: { w, h } },
    );
  }
}

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const scale = ui.timeScale();
  if (!paused && freeze === null && !q.get('still')) {
    acc += dt * 30 * scale;
    let n = Math.min(3, Math.floor(acc));
    acc -= Math.floor(acc);
    while (n-- > 0) {
      sim.step(1);
      simSteps++;
      if (simSteps % 10 === 0) {
        track(10);
        meter.update(view());
      }
    }
    paintSim();
  }
  drawDish();
  drawOverlay(now / 1000, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ───────────── URL-driven states ─────────────

if (q.get('status') === '1') {
  // Every state at once, at real creatures and two empty spots.
  const live = tracked;
  fakeStates = [
    ...live.map((t, i) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      r: t.r,
      state: (i < 2 ? 'stable' : 'born') as CreatureView['state'],
      behavior: i === 0 ? ('swimmer' as const) : null,
      speciesId: 'sp1',
      speciesName: 'Orbium',
      eps: i === 0 ? 1.9 : i === 1 ? 1.2 : 0,
      age: i < 2 ? 900 : 250,
    })),
    { id: 201, x: 30, y: 100, r: 14, state: 'exploded', behavior: null, speciesId: null, speciesName: null, eps: 0, age: 300 },
    { id: 202, x: 64, y: 70, r: 6, state: 'dead', behavior: null, speciesId: null, speciesName: null, eps: 0, age: 60 },
  ];
  applySeedCpu(sim.A, N, N, { x: 30, y: 100, radius: 22, density: 0.5, noise: 0.8, shape: 'noise', bias: 0, rngSeed: 9 });
  applySeedCpu(sim.A, N, N, { x: 64, y: 70, radius: 8, density: 0.12, noise: 0.6, shape: 'blob', bias: 0, rngSeed: 3 });
  paintSim();
}

const seenAll = q.get('seen') === 'all';
if (seenAll) moments.load({ v: 1, seen: [...MOMENT_IDS], mode: 'full', labels: 'auto' });
const mParam = q.get('m') as MomentId | null;
if (mParam && MOMENT_BY_ID.has(mParam)) {
  showMoment(mParam, q.get('mode') === 'brief' ? 'brief' : undefined);
  if (freeze !== null) ui.debug.freezeAt(freeze);
}
const replay = q.get('replay') as MomentId | null;
if (replay && MOMENT_BY_ID.has(replay)) {
  moments.load({ v: 1, seen: [...MOMENT_IDS], mode: 'full', labels: 'auto' });
  moments.replay(replay);
  ui.debug.prepare();
  if (freeze !== null) ui.debug.freezeAt(freeze);
}
if (q.get('price') === '1') priceSheet.open(view());

function openHelp(): void {
  const modal = document.createElement('div');
  modal.className = 'dv-modal';
  const inner = document.createElement('div');
  inner.className = 'dv-modal-in';
  modal.appendChild(inner);
  app.appendChild(modal);
  const sheet = ui.mountHelp(inner);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      sheet.dispose();
      modal.remove();
    }
  });
}
if (q.get('help') === '1') openHelp();

/** ?card=sp1 → one species card; ?vs=1 → the comparison ("¿Por qué esta rinde más?"). */
function openSpecies(mode: 'card' | 'vs', id = 'sp1'): void {
  const modal = document.createElement('div');
  modal.className = 'dv-modal';
  const inner = document.createElement('div');
  inner.className = 'dv-modal-in';
  modal.appendChild(inner);
  app.appendChild(modal);
  const v = view();
  const lc = { lang: () => lang, reduceMotion: () => reduce, onShowUpgrade: () => undefined, onBehavior: (b: Behavior) => ui.openBehaviorGuide(b) };
  const comp =
    mode === 'card'
      ? createSpeciesCard(inner, speciesInputFromView(v, id)!, lc)
      : createSpeciesCompare(inner, speciesInputFromView(v, 'sp1')!, speciesInputFromView(v, 'sp2')!, lc);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      comp.dispose();
      modal.remove();
    }
  });
}
if (q.get('card')) openSpecies('card', q.get('card')!);
if (q.get('guide') === '1') ui.openBehaviorGuide((q.get('focus') as Behavior | null) ?? null);

/** ?ticker=up|full|down|free|big → the seed price changes and says why (chip above the price). */
const ticker = q.get('ticker');
if (ticker) {
  const before: SeedPriceView = { base: 2, alive: 1, crowdMult: 1.25, freeSlots: 2, used: 1, satMult: 1, bigMult: 2.25, freeSeeds: 0 };
  const after: Record<string, SeedPriceView> = {
    up: { ...before, alive: 2, used: 2, crowdMult: 1.5 },
    full: { ...before, alive: 3, used: 3, crowdMult: 1.75, satMult: 3 },
    down: { ...before, alive: 0, used: 0, crowdMult: 1 },
    free: { ...before, freeSeeds: 5 },
    big: before,
  };
  const costOf = (p: SeedPriceView) => p.base * p.crowdMult * p.satMult;
  const v0 = view();
  meter.update({ ...v0, seedPrice: before, seedCost: costOf(before) });
  const p1 = after[ticker] ?? after.up;
  setTimeout(() => {
    const priceEl = root.querySelector('.dv-seed .price') as HTMLElement;
    priceEl.textContent = String(Math.round(costOf(p1) * 100) / 100).replace('.', lang === 'es' ? ',' : '.');
    meter.update({ ...v0, seedPrice: p1, seedCost: costOf(p1) });
    if (ticker === 'big') meter.flash(bigSeedReason(before, lang));
  }, 300);
}
if (q.get('vs') === '1') openSpecies('vs');
root.querySelector('.dv-help')!.addEventListener('click', openHelp);

// ───────────── menu ─────────────

if (q.get('menu') !== '0') {
  const btn = document.createElement('button');
  btn.className = 'dv-menu-btn';
  btn.textContent = 'Momentos ▾';
  const menu = document.createElement('div');
  menu.className = 'dv-menu';
  menu.hidden = true;
  btn.onclick = () => (menu.hidden = !menu.hidden);
  const section = (title: string, items: [string, () => void][]) => {
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
  };
  section(
    'Card',
    MOMENT_IDS.map((id) => [id, () => showMoment(id)]),
  );
  section(
    'Brief',
    MOMENT_IDS.map((id) => [id, () => showMoment(id, 'brief')]),
  );
  section('Panels', [
    ['help', openHelp],
    ['price sheet', () => priceSheet.open(view())],
    ['status pills', () => (statusOn = !statusOn)],
    ['species card', () => openSpecies('card')],
    ['species vs', () => openSpecies('vs')],
    ['behaviour guide', () => ui.openBehaviorGuide()],
  ]);
  section('Options', [
    [
      'lang',
      () => {
        lang = lang === 'es' ? 'en' : 'es';
        ui.relabel();
      },
    ],
    [
      'theme',
      () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = theme;
        ui.relabel();
      },
    ],
    ['reduce motion', () => (reduce = !reduce)],
    ['forget all', () => moments.forget()],
  ]);
  document.body.append(btn, menu);
}

// For the screenshot script.
(window as unknown as { __moments: unknown }).__moments = { moments, ui, ready: true };

// ───────────── ?clips=1: every real-Lenia clip, five frames each (gallery) ─────────────

if (q.get('clips') === '1') {
  void import('./clips').then(({ CLIP_SPECS, clip, LeniaClip }) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:200;overflow:auto;background:#0b0e12;padding:8px;display:flex;flex-direction:column;gap:6px;font:11px Inter,sans-serif;color:#8b98a5';
    const extra: Record<string, ConstructorParameters<typeof LeniaClip>[0]> = {};
    const exp = q.get('exp');
    if (exp) {
      // ?exp=mu,sigma,shape  e.g. 0.4,0.25,noise
      const [mu, sigma, shape] = exp.split(',');
      extra.exp = {
        key: `exp:${exp}`,
        N: 64,
        params: { R: 13, rings: [1], mu: Number(mu), sigma: Number(sigma), dt: 0.1 },
        init: (s) => applySeedCpu(s.A, 64, 64, { x: 32, y: 32, radius: 13, density: 0.7, noise: 0.6, shape: (shape as 'blob' | 'noise') || 'blob', bias: 0, rngSeed: 2 }),
        frames: 36,
        every: 2,
      };
    }
    const all = [...Object.keys(CLIP_SPECS), ...Object.keys(extra)];
    for (const name of all) {
      const c = name in extra ? new LeniaClip(extra[name]) : clip(name as keyof typeof CLIP_SPECS);
      while (!c.pump(500));
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center';
      row.append(name);
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const cv = document.createElement('canvas');
        cv.width = 64;
        cv.height = 64;
        cv.style.cssText = 'width:96px;height:96px;image-rendering:auto;border:1px solid #1b232c';
        const src = c.paint(f * (c.total - 1));
        if (src) cv.getContext('2d')!.drawImage(src, 0, 0);
        row.appendChild(cv);
      }
      box.appendChild(row);
    }
    document.body.appendChild(box);
  });
}
