// QA #2 harness: serves a prebuilt e2e dist, opens it on a 390x844 touch device, records
// screenshots + visible strings + touch-target sizes with timestamps.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

export const OUT = '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';

export function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found');
}

export async function serve(dist, port) {
  const server = spawn('node', ['node_modules/.bin/vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], {
    cwd: '/home/user/Lenia',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview did not start')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(t);
        res();
      }
    });
  });
  return server;
}

export async function launch({ port, dist = process.env.QA_DIST || '/tmp/qa2/dist', locale = 'es-CO', colorScheme = 'dark', size = { width: 390, height: 844 }, mobile = true, dsf = 1 }) {
  const server = await serve(dist, port);
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: dsf,
    isMobile: mobile,
    hasTouch: mobile,
    locale,
    colorScheme,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text() + (m.location()?.url ?? ''))) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { server, browser, ctx, page, errors, close: async () => { await browser.close(); server.kill(); setTimeout(() => process.exit(0), 200); } };
}

export class Diary {
  constructor(page, persona) {
    this.page = page;
    this.persona = persona;
    this.t0 = Date.now();
    this.entries = [];
    this.n = 0;
  }
  now() {
    return +((Date.now() - this.t0) / 1000).toFixed(1);
  }
  reset() {
    this.t0 = Date.now();
  }
  async state() {
    return this.page.evaluate(() => {
      const b = window.bioluma;
      if (!b) return null;
      const v = b.game.view();
      return {
        step: b.sim.stepCount,
        play: +v.stats.playTime.toFixed(1),
        essence: Math.floor(v.essence),
        eps: +v.essencePerSec.toFixed(2),
        seeds: v.stats.seeds,
        creatures: v.creatures.map((c) => c.state),
        species: v.species.length,
        tabs: v.tabs,
        objective: v.objective ? { id: v.objective.id, cur: v.objective.current, tgt: v.objective.target } : null,
        golden: !!v.golden,
        lang: v.settings.lang,
        tut: (() => { try { return localStorage.getItem('bioluma.tutorial'); } catch { return null; } })(),
        sheet: document.querySelector('.bl-tabs .tab.on, .bl-tabs .tab[aria-selected=true]')?.getAttribute('data-tab') ?? null,
      };
    });
  }
  /** Visible leaf strings with font size/colour and rect. */
  async texts() {
    return this.page.evaluate(() => {
      const out = [];
      const root = document.querySelector('.bl') || document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const s = n.textContent.trim();
        if (!s) continue;
        const el = n.parentElement;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
        // skip elements inside hidden ancestors
        let a = el, hidden = false;
        while (a && a !== document.body) {
          if (a.hidden || getComputedStyle(a).display === 'none') { hidden = true; break; }
          a = a.parentElement;
        }
        if (hidden) continue;
        out.push({ s, fs: parseFloat(cs.fontSize), color: cs.color, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
      }
      return out;
    });
  }
  async targets() {
    return this.page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role=button], .tab, input, [data-up] .buy')) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
        let a = el, hidden = false;
        while (a && a !== document.body) { if (a.hidden || getComputedStyle(a).display === 'none' || getComputedStyle(a).visibility === 'hidden') { hidden = true; break; } a = a.parentElement; }
        if (hidden) continue;
        out.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 40), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
      }
      return out;
    });
  }
  async shot(name, note = '') {
    this.n++;
    const file = `${OUT}/qa-qa2-${this.persona}-${String(this.n).padStart(2, '0')}-${name}.png`;
    await this.page.screenshot({ path: file });
    const e = { t: this.now(), file, name, note, state: await this.state(), texts: (await this.texts()).map((x) => `${x.s} [${x.fs}px]`), small: (await this.targets()).filter((x) => x.w < 44 || x.h < 44) };
    this.entries.push(e);
    console.log(`[${e.t}s] ${name} ${note} | ess=${e.state?.essence} eps=${e.state?.eps} cre=${JSON.stringify(e.state?.creatures)} sp=${e.state?.species} step=${e.state?.step}`);
    return e;
  }
  save() {
    writeFileSync(`${OUT}/qa-qa2-${this.persona}-diary.json`, JSON.stringify(this.entries, null, 1));
  }
}

export async function tapAt(page, x, y) {
  await page.touchscreen.tap(x, y);
}
export async function dishBox(page) {
  return page.locator('canvas.gl-dish').boundingBox();
}

/** Subscribe to every bus event inside the page; entries get wall ms since install + sim step. */
export async function installEventLog(page) {
  await page.evaluate(() => {
    const b = window.bioluma;
    window.__ev = [];
    const t0 = performance.now();
    const names = ['seed','seedDenied','creatureBorn','creatureStable','creatureDied','creatureExploded','creatureDivided','speciesNew','behaviorNew','upgradeBought','journalNew','achievement','goldenSpawn','goldenCollected','goldenMissed','calibrationChanged','toast','extinctionStart','extinctionDone','offlineReturn','dishOvergrown'];
    for (const n of names) {
      b.bus.on(n, (p) => {
        const e = { t: +((performance.now() - t0) / 1000).toFixed(1), n, step: b.sim.stepCount };
        if (n === 'toast') e.txt = p.text.es + ' / ' + p.text.en;
        if (n === 'journalNew' || n === 'achievement') e.id = p.id;
        if (n === 'upgradeBought') e.id = p.id + '@' + p.level;
        if (n === 'speciesNew') e.id = p.name;
        if (n === 'seed') e.id = (p.manual ? 'manual ' : 'auto ') + p.cost;
        if (n === 'seedDenied') e.id = 'cost ' + p.cost;
        if (n === 'dishOvergrown') e.id = p.on ? 'on' : 'off';
        window.__ev.push(e);
      });
    }
  });
}
export async function eventLog(page) {
  return page.evaluate(() => window.__ev);
}
export async function coach(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.coach');
    if (!c || c.hidden) return null;
    const title = c.querySelector('.coach-title')?.textContent;
    const text = c.querySelector('.coach-text')?.textContent;
    const btn = c.querySelector('.coach-next');
    const r = btn && !btn.hidden ? btn.getBoundingClientRect() : null;
    return { title, text, next: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, label: btn.textContent } : null };
  });
}

/** WCAG contrast of every visible text (computed-style compositing; gradients/backdrops ignored). */
export async function contrastReport(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top, bot) => {
      const a = top[3] + bot[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat([a]);
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const out = [];
    const root = document.querySelector('.bl') || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    const seen = new Set();
    while ((n = walker.nextNode())) {
      const s = n.textContent.trim();
      const el = n.parentElement;
      if (!s || !el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
      let hidden = false, a = el, op = 1;
      const chain = [];
      while (a) { const cs = getComputedStyle(a); if (a.hidden || cs.display === 'none' || cs.visibility === 'hidden') hidden = true; op *= +cs.opacity; chain.push(cs); a = a.parentElement; }
      if (hidden || op < 0.3) continue;
      let bg = [255, 255, 255, 1];
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      bg = parse(getComputedStyle(document.body).backgroundColor);
      if (bg[3] === 0) bg = [255, 255, 255, 1];
      for (let i = chain.length - 1; i >= 0; i--) bg = over(parse(chain[i].backgroundColor), bg);
      const fg0 = parse(getComputedStyle(el).color);
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const key = s + '|' + Math.round(r.top);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ s: s.slice(0, 50), ratio: +ratio.toFixed(2), fs: parseFloat(getComputedStyle(el).fontSize), fg: fg.slice(0, 3).map(Math.round).join(','), bg: bg.slice(0, 3).map(Math.round).join(',') });
    }
    return out;
  });
}
