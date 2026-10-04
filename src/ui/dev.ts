/**
 * ui-dev.html entry: mounts the UI with the mock game and a fake "GL" canvas
 * (a static dark dish plus creature sprites drawn through the shared Camera,
 * so overlay alignment can be checked by eye).
 *
 * URL params: ?scene=mid|early|fresh  &lang=es|en  &offline=1  &unsupported=1  &rm=1
 *             &splash=0 (skip title)  &tutorial=1 (force tutorial; on by default for fresh)
 *             &lb=error|none (leaderboard failure / no leaderboard)
 */
// Art tokens (--bl-*) before every module stylesheet (docs/ARTE.md §12).
import './art/art.css';
import { bus } from '../core/bus';
import { Camera } from '../core/camera';
import type { CreatureView } from '../core/types';
import { MOCK_STEPS_PER_SEC, MockGame, MockLeaderboard } from './mock';
import { renderPattern } from './portrait';
import { createUI } from './ui';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'mid';
const game = new MockGame(scene);
if (params.get('lang') === 'en') game.settings.lang = 'en';
if (params.get('rm') === '1') game.settings.reduceMotion = true;
const themeParam = params.get('theme');
if (themeParam === 'light' || themeParam === 'dark' || themeParam === 'auto') game.settings.theme = themeParam;

const camera = new Camera(game.gridW, game.gridH);

/** Fake dish renderer standing in for the WebGL simulation. */
class FakeDish {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private sprites = new Map<string, HTMLCanvasElement>();

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  private sprite(c: CreatureView): HTMLCanvasElement {
    const key = c.speciesId ?? 'none';
    let s = this.sprites.get(key);
    if (!s) {
      s = renderPattern(game.patternOf(c), 96, 1);
      this.sprites.set(key, s);
    }
    return s;
  }

  draw(view: ReturnType<MockGame['view']>, time: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const s = camera.scale;
    const dw = camera.gridW * s;
    const dh = camera.gridH * s;
    const x0 = camera.zoom > 1.001 ? 0 : (this.w - dw) / 2;
    const y0 = camera.zoom > 1.001 ? 0 : (this.h - dh) / 2;
    const w = camera.zoom > 1.001 ? this.w : dw;
    const h = camera.zoom > 1.001 ? this.h : dh;
    // Dish background: very dark with a faint indigo haze (like low matter).
    const g = ctx.createRadialGradient(x0 + w / 2, y0 + h / 2, 0, x0 + w / 2, y0 + h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#0d1220');
    g.addColorStop(1, '#090c12');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    for (const c of view.creatures) {
      const p = camera.gridToScreen(c.x, c.y);
      const sp = this.sprite(c);
      const size = 22 * s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(game.headingOf(c.id) + Math.PI / 2);
      if (c.state === 'born') ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 6);
      if (c.state === 'exploded') {
        ctx.globalAlpha = 0.8;
        ctx.scale(1.6, 1.6);
      }
      ctx.drawImage(sp, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }
}

const dish = new FakeDish();
let paused = false;

const root = document.getElementById('app')!;
const ui = createUI(root, {
  actions: game,
  camera,
  glCanvas: dish.canvas,
  onDishResize: (w, h, dpr) => dish.resize(w, h, dpr),
  onDishTap: (x, y, o) => void game.seedAt(x, y, o),
  onErase: (x, y) => game.erase(x, y),
  onBrush: (x, y) => void game.brushAt(x, y),
  onPrint: (id, x, y) => void game.printAt(id, x, y),
  onExtinguish: () => void game.extinguish(),
  onPauseToggle: () => {
    paused = !paused;
    ui.setPaused(paused);
  },
  exportSave: () => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, essence: game.essence, era: game.era })))),
  importSave: (s) => {
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (typeof o.essence !== 'number') return false;
      game.essence = o.essence;
      return true;
    } catch {
      return false;
    }
  },
  resetSave: () => location.reload(),
  onUserGesture: () => {},
  onScreenshot: () => bus.emit('toast', { text: { es: 'Captura guardada', en: 'Screenshot saved' }, kind: 'good' }),
  onRitualWhite: () => game.clearDish(),
  leaderboard: params.get('lb') === 'none' ? undefined : new MockLeaderboard(game, params.get('lb') === 'error' ? 'error' : 'ok'),
  splash: params.get('splash') !== '0',
  tutorial: params.get('tutorial') === '1' || (scene === 'fresh' && params.get('tutorial') !== '0'),
});

if (params.get('unsupported') === '1') ui.showUnsupported('WebGL2 context creation failed (getContext returned null)');

let last = performance.now();
let lastUpdate = 0;
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) game.tick(dt);
  const view = game.view();
  if (now - lastUpdate > 100) {
    lastUpdate = now;
    ui.setSimRate(MOCK_STEPS_PER_SEC * game.speed);
    ui.update(view);
  }
  dish.draw(view, now / 1000);
  ui.frame(now / 1000, dt);
  requestAnimationFrame(loop);
}
ui.update(game.view());
requestAnimationFrame(loop);

if (params.get('offline') === '1') setTimeout(() => ui.showOfflineCard(3 * 3600 + 600, 12_400), 300);

// Handles for the screenshot script / console tinkering.
Object.assign(window as unknown as Record<string, unknown>, { __ui: ui, __game: game, __bus: bus, __camera: camera });
