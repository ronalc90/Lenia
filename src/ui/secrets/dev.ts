/**
 * secrets-dev.html: a stand-alone playground for the secrets module. A fake dish with drifting
 * catalog creatures (drawn through the shared Camera), a tiny HUD (logo + essence) and a dev
 * drawer to trigger every secret and effect. Draw on the dish with the mouse/finger: strokes go
 * to the real recognizer.
 *
 * URL params: ?lang=en  &rm=1  &panel=0 (hide drawer)  &found=N (pre-found N secrets)
 *   &date=<ISO>|now (clock; default a neutral afternoon: no moon, no birthday)
 *   &reveal=<secretId>  &effect=<kind>  &basement=1  &hints=1 (climb some hint ladders)
 *   &colormap=<cosmeticId> (paint the fake dish with a palette)
 */
import { Bus, type GameEvents } from '../../core/bus';
import { Camera } from '../../core/camera';
import { MATTER_STOPS } from '../../core/palette';
import type { CreatureView, GameView, Lang } from '../../core/types';
import { COLORMAPS, colormapColor, SECRET_IDS } from '../../secrets/data';
import { createSecrets } from '../../secrets/secrets';
import type { ColormapStops, CosmeticId, SecretEffect, SecretId } from '../../secrets/types';
import { catalogPattern } from '../../sim/catalog';
import { attachSecretInputs, createStrokeRecorder } from './inputs';
import { createSecretsUI } from './secrets-ui';

const q = new URLSearchParams(location.search);
let lang: Lang = q.get('lang') === 'en' ? 'en' : 'es';
let rm = q.get('rm') === '1';
const GW = 192;
const GH = 240;

// ───────────── fake world ─────────────

interface Fake {
  id: number;
  code: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  sp: string;
}

const creatures: Fake[] = [
  { id: 1, code: 'O2u', x: 46, y: 64, vx: 1.2, vy: 0.55, rot: 0.4, vr: 0, sp: 's1' },
  { id: 2, code: 'OG2g', x: 96, y: 88, vx: 0.4, vy: -0.6, rot: 0, vr: 0.5, sp: 's2' },
  { id: 3, code: 'S1s', x: 150, y: 112, vx: -0.2, vy: 0.3, rot: 2, vr: 0, sp: 's3' },
  { id: 4, code: 'O4d', x: 60, y: 176, vx: 0.8, vy: -0.2, rot: 1, vr: 0, sp: 's4' },
  { id: 5, code: 'H3s', x: 140, y: 196, vx: -0.3, vy: -0.5, rot: 0, vr: -0.4, sp: 's5' },
];

let essence = 123_320.4;
const bus = new Bus<GameEvents>();
const view = (): GameView =>
  ({
    essence,
    essencePerSec: 42,
    samples: 3,
    genome: 0,
    era: 1,
    seedCost: 12,
    canSeed: true,
    pipette: { active: false, progress: 0 },
    tools: { longPress: true, brush: true, eraser: true, speeds: [1, 2], speed: 1 },
    upgrades: [],
    genomeNodes: [],
    species: [],
    behaviorsSeen: [],
    calibration: { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, muRange: null, sigmaRange: null, RRange: null, dtRange: null, regimes: [], maxRegimes: 0 },
    journal: [],
    achievements: [],
    extinction: { available: false, genomeGain: 0, gainIn10Min: 0, requirement: { es: '', en: '' } },
    golden: null,
    buffs: [],
    creatures: creatures.map((c): CreatureView => ({ id: c.id, x: c.x, y: c.y, r: 7, state: 'stable', behavior: 'swimmer', speciesId: c.sp, speciesName: null, eps: 1, age: 900 })),
    objective: null,
    settings: { lang, sfxVolume: 1, musicVolume: 1, muted: false, vibration: true, reduceMotion: rm, oneTouch: false, quality: 'auto', analytics: false },
    tabs: { lab: true, bestiary: true, calibrate: true, genome: false },
    stats: { playTime: 3600, totalEssence: essence, eraEssence: essence, seeds: 40, creaturesBorn: 30 },
  }) as GameView;

const memory: Record<string, string> = {};
// ?date=2026-03-03T22:00 pins the clock (moon / birthday / night); default: a neutral day.
const dateQ = q.get('date');
const clockOffset = dateQ === 'now' ? 0 : new Date(dateQ ?? '2026-06-17T16:20:00').getTime() - Date.now();
const secrets = createSecrets({
  bus,
  getView: view,
  now: () => new Date(Date.now() + clockOffset),
  storage: q.get('persist') === '1' ? undefined : { getItem: (k) => memory[k] ?? null, setItem: (k, v) => void (memory[k] = v) },
  grid: { w: GW, h: GH },
});

// ───────────── layout ─────────────

const app = document.getElementById('app')!;
const css = document.createElement('style');
css.textContent = `
.hud{flex:none;height:56px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#141a21;border-bottom:1px solid rgba(230,237,243,.08)}
.logo{font-weight:800;letter-spacing:.2em;font-size:15px;color:#c8f1ff;cursor:pointer;padding:12px 4px;text-shadow:0 0 12px rgba(91,192,235,.5)}
.ess{margin-left:auto;font:700 20px 'JetBrains Mono',monospace;color:#5bc0eb;cursor:pointer;padding:8px 10px;border-radius:10px}
.ess small{color:#8b98a5;font-size:12px;margin-left:6px}
.dish{position:relative;flex:1;min-height:0;touch-action:none}
.dish canvas.bg{position:absolute;inset:0;width:100%;height:100%}
.drawer{flex:none;max-height:36%;overflow:auto;background:#0e1318;border-top:1px solid rgba(230,237,243,.08);padding:10px 12px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start}
.drawer button{font:500 12px Inter,sans-serif;color:#e6edf3;background:#1b232c;border:1px solid rgba(230,237,243,.1);border-radius:8px;padding:7px 9px;cursor:pointer}
.drawer button.fx{color:#5bc0eb}
.drawer button.ui{color:#ffd166}
.drawer .sep{flex-basis:100%;height:0}
.sheet{position:fixed;inset:0;z-index:40;overflow:auto;background:#0b0e12}
.sheet .close{position:sticky;top:0;display:flex;justify-content:flex-end;padding:8px;background:linear-gradient(#0b0e12,rgba(11,14,18,0))}
.sheet .close button{min-width:48px;min-height:40px;border-radius:10px;border:1px solid rgba(230,237,243,.12);background:#141a21;color:#e6edf3;cursor:pointer}
`;
document.head.appendChild(css);

const hud = document.createElement('div');
hud.className = 'hud';
const logo = document.createElement('div');
logo.className = 'logo';
logo.textContent = 'BIOLUMA';
const ess = document.createElement('div');
ess.className = 'ess';
hud.append(logo, ess);

const dish = document.createElement('div');
dish.className = 'dish';
const bg = document.createElement('canvas');
bg.className = 'bg';
dish.appendChild(bg);

const drawer = document.createElement('div');
drawer.className = 'drawer';
app.append(hud, dish);
if (q.get('panel') !== '0') app.appendChild(drawer);

const camera = new Camera(GW, GH);

// ───────────── fake dish renderer ─────────────

let stops: ColormapStops = (q.get('colormap') && COLORMAPS[q.get('colormap') as CosmeticId]?.stops) || (MATTER_STOPS as ColormapStops);
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(code: string): HTMLCanvasElement {
  let s = sprites.get(code);
  if (s) return s;
  const p = catalogPattern(code);
  const size = 128;
  s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d')!;
  const img = g.createImageData(size, size);
  const k = Math.max(p.w, p.h) / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Bilinear sample (the real dish is smooth too).
      const fx = p.w / 2 + (x + 0.5 - size / 2) * k - 0.5;
      const fy = p.h / 2 + (y + 0.5 - size / 2) * k - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= p.w || yy >= p.h ? 0 : p.data[yy * p.w + xx]);
      const v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      const [r, gg, b, a] = colormapColor(stops, v);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = a * 255;
    }
  g.putImageData(img, 0, 0);
  sprites.set(code, s);
  return s;
}

let W = 1;
let H = 1;
let dpr = 1;
function resize(): void {
  const r = dish.getBoundingClientRect();
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  dpr = Math.min(2, devicePixelRatio || 1);
  bg.width = Math.round(W * dpr);
  bg.height = Math.round(H * dpr);
  camera.setView(W, H);
  sui?.resize();
}

function drawDish(): void {
  const g = bg.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const s = camera.scale;
  const dw = GW * s;
  const dh = GH * s;
  const x0 = (W - dw) / 2;
  const y0 = (H - dh) / 2;
  const grad = g.createRadialGradient(x0 + dw / 2, y0 + dh / 2, 0, x0 + dw / 2, y0 + dh / 2, Math.max(dw, dh) * 0.7);
  grad.addColorStop(0, '#0e1322');
  grad.addColorStop(1, '#080b11');
  g.fillStyle = grad;
  g.fillRect(x0, y0, dw, dh);
  g.save();
  g.beginPath();
  g.rect(x0, y0, dw, dh);
  g.clip();
  for (const c of creatures) {
    const p = camera.gridToScreen(c.x, c.y);
    const size = 30 * s;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(c.rot + Math.atan2(c.vy, c.vx) + Math.PI / 2);
    g.drawImage(sprite(c.code), -size / 2, -size / 2, size, size);
    g.restore();
  }
  g.restore();
}

// ───────────── secrets UI ─────────────

const inputs = attachSecretInputs(secrets, { logos: [logo], essence: ess, dish });
const sui = createSecretsUI(dish, secrets, {
  camera,
  lang: () => lang,
  reduceMotion: () => rm,
  requestMotion: inputs.requestMotionPermission,
  onSound: (kind, s) => console.info('[secrets] jingle', kind, s?.id ?? ''),
});
resize();
new ResizeObserver(resize).observe(dish);

secrets.on('colormap', (c) => {
  stops = (c.colormap?.stops ?? MATTER_STOPS) as ColormapStops;
  sprites.clear();
});
secrets.on('grantJournal', (j) => console.info('[journal]', j.text[lang]));

// Drawing on the dish → stroke recorder (grid coordinates), with a faint live trail.
const rec = createStrokeRecorder(secrets, { endOn: dish });
let drawing = false;
const trail: { x: number; y: number }[] = [];
dish.addEventListener('pointerdown', (e) => {
  drawing = true;
  dish.setPointerCapture(e.pointerId);
  trail.length = 0;
});
dish.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const r = dish.getBoundingClientRect();
  const g = camera.screenToGrid(e.clientX - r.left, e.clientY - r.top);
  rec.point(g.x, g.y);
  trail.push({ x: e.clientX - r.left, y: e.clientY - r.top });
});
const up = () => {
  drawing = false;
  rec.end();
  trail.length = 0;
};
dish.addEventListener('pointerup', up);
dish.addEventListener('pointercancel', up);

// ───────────── loop ─────────────

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!rm && q.get('freeze') !== '1') {
    for (const c of creatures) {
      c.x = (c.x + c.vx * dt * 3 + GW) % GW;
      c.y = (c.y + c.vy * dt * 3 + GH) % GH;
      c.rot += c.vr * dt;
    }
  }
  essence += 42 * dt;
  ess.innerHTML = `${Math.floor(essence).toLocaleString(lang)}<small>+42/s</small>`;
  drawDish();
  if (trail.length > 1) {
    const g = bg.getContext('2d')!;
    g.strokeStyle = 'rgba(91,192,235,.35)';
    g.lineWidth = 2;
    g.beginPath();
    trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ───────────── dev drawer ─────────────

function btn(label: string, cls: string, fn: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = cls;
  b.addEventListener('click', fn);
  drawer.appendChild(b);
}
const sep = () => drawer.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));

let sheet: HTMLElement | null = null;
function openBasement(): void {
  if (sheet) return;
  const panel = sui.createBasement();
  sheet = document.createElement('div');
  sheet.className = 'sheet';
  const close = document.createElement('div');
  close.className = 'close';
  const cb = document.createElement('button');
  cb.textContent = '✕';
  cb.addEventListener('click', () => {
    panel.dispose();
    sheet?.remove();
    sheet = null;
  });
  close.appendChild(cb);
  sheet.append(close, panel.el);
  document.body.appendChild(sheet);
  secrets.onBasementOpened();
}

const center = () => ({ x: GW / 2, y: GH / 2 });
const EFFECTS: Record<string, () => SecretEffect> = {
  aurora: () => ({ kind: 'aurora', duration: 14 }),
  orion: () => ({ kind: 'constellation', points: [creatures[0], creatures[1], creatures[2]].map((c) => ({ x: c.x, y: c.y })), label: { es: 'Cinturón de Orión', en: 'Orion’s Belt' }, duration: 9, closed: false }),
  seven: () => {
    const pts = creatures.map((c) => ({ x: c.x, y: c.y }));
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    return { kind: 'constellation', points: pts, label: { es: 'Siete de siete', en: 'Seven of seven' }, duration: 9, closed: true };
  },
  motes: () => ({ kind: 'motes', count: 90, hue: 'gold', duration: 7, from: 'top' }),
  swirl: () => ({ kind: 'motes', count: 60, hue: 'violet', duration: 6, from: 'swirl' }),
  trace: () => ({ kind: 'trace', points: Array.from({ length: 80 }, (_, i) => { const t = (i / 79) * Math.PI * 2; return { x: 96 + 32 * 16 * Math.sin(t) ** 3 / 17, y: 110 - 32 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 }; }), color: 'pink', duration: 3 }),
  halo: () => ({ kind: 'halo', x: creatures[2].x, y: creatures[2].y, r: 18, color: 'gold', duration: 6 }),
  glider: () => ({ kind: 'glider', ...center(), duration: 9 }),
  moon: () => ({ kind: 'moon', illumination: 0.995, waxing: true, duration: 12 }),
  pulse: () => ({ kind: 'pulse', color: 'pink', beats: 3, duration: 3.2 }),
  whisper: () => ({ kind: 'whisper', text: { es: '¿Sigues ahí?', en: 'Still there?' }, duration: 6 }),
  ripple: () => ({ kind: 'ripple', x: null, y: null, duration: 3 }),
};

for (const id of SECRET_IDS) btn(id, '', () => secrets.forceFind(id));
sep();
for (const k of Object.keys(EFFECTS)) btn(`fx:${k}`, 'fx', () => sui.play(EFFECTS[k]()));
sep();
btn('basement', 'ui', openBasement);
btn('lang', 'ui', () => {
  lang = lang === 'es' ? 'en' : 'es';
});
btn('reduceMotion', 'ui', () => {
  rm = !rm;
});
btn('reset', 'ui', () => secrets.reset());

// Expose for Playwright.
(window as unknown as Record<string, unknown>).__secrets = secrets;
(window as unknown as Record<string, unknown>).__sui = sui;
(window as unknown as Record<string, unknown>).__fx = (k: string) => sui.play(EFFECTS[k]());
(window as unknown as Record<string, unknown>).__basement = openBasement;
(window as unknown as Record<string, unknown>).__creatures = creatures;
(window as unknown as Record<string, unknown>).__camera = camera;

// ───────────── URL presets ─────────────

const preFound = Number(q.get('found') ?? 0);
if (preFound > 0) {
  const found: Partial<Record<SecretId, number>> = {};
  const order: SecretId[] = ['logo', 'answer', 'ignis', 'heart', 'konami', 'spiral', 'chan', 'fullMoon', 'seven', 'conway', 'aurora', 'orion', 'phantasma', 'patience', 'silence', 'shake', 'palindrome', 'cryptid', 'halo', 'infinity', 'birthday', 'oldFriend', 'maximizer', 'goldenStreak', 'sterile', 'afk', 'basement'];
  order.slice(0, preFound).forEach((id, i) => (found[id] = Date.UTC(2026, 9, 4) + i * 86400000 * 3));
  const hints: Partial<Record<SecretId, number>> = q.get('hints') === '1' ? { cryptid: 2, infinity: 1, oldFriend: 1, sterile: 2 } : {};
  secrets.load({ v: 1, found, hints, cosmetics: [], colormap: (q.get('colormap') as CosmeticId) ?? null, manualSeeds: 0, goldenStreak: 0, hadLife: true, allFoundEmitted: false });
}
if (q.get('basement') === '1') openBasement();
const rv = q.get('reveal') as SecretId | null;
if (rv) setTimeout(() => secrets.forceFind(rv), 300);
const fxq = q.get('effect');
if (fxq && EFFECTS[fxq]) setTimeout(() => sui.play(EFFECTS[fxq]()), 300);
