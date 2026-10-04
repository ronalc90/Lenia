/**
 * art-dev.html: the living style sheet of Bioluma (docs/ARTE.md). Shows every token, icon, emblem,
 * character, world card and the matter palette, in both themes.
 *
 * URL params: ?theme=dark|light  ?section=icons,vela,…  ?rm=1 (reduce motion)  ?t=2.5 (freeze the
 * animation clock at 2.5 s, for screenshots)  ?lang=es|en
 */
import './art.css';
import { ICON_GROUPS, ICONS, artIcon } from './icons';
import { BEHAVIOR_TONE, PALETTE, ROUTE_COLOR, TYPE, type ThemeName } from './tokens';
import { contrast } from './color';
import { DEV_CSS } from './devStyle';
import { sections as extraSections } from './devSections';

const qs = new URLSearchParams(location.search);
const theme: ThemeName = qs.get('theme') === 'light' ? 'light' : 'dark';
const only = (qs.get('section') ?? '').split(',').filter(Boolean);
const frozen = qs.has('t') ? Number(qs.get('t')) : null;
const reduceMotion = qs.get('rm') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const lang = qs.get('lang') === 'en' ? 'en' : 'es';

document.documentElement.dataset.theme = theme;
const style = document.createElement('style');
style.textContent = DEV_CSS;
document.head.append(style);

const app = document.getElementById('app')!;

export interface DevCtx {
  theme: ThemeName;
  reduceMotion: boolean;
  lang: 'es' | 'en';
  /** Animation clock (s); frozen when ?t= is set. */
  now(): number;
  /** Register a per-frame callback. */
  onFrame(fn: (t: number, dt: number) => void): void;
}

const frameFns: ((t: number, dt: number) => void)[] = [];
const t0 = performance.now();
const ctx: DevCtx = {
  theme,
  reduceMotion,
  lang,
  now: () => (frozen ?? (performance.now() - t0) / 1000),
  onFrame: (fn) => void frameFns.push(fn),
};

function section(id: string, title: string, sub: string, body: HTMLElement | string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'ad-sec';
  s.id = id;
  s.innerHTML = `<header><h2>${title}</h2><p>${sub}</p></header>`;
  if (typeof body === 'string') s.insertAdjacentHTML('beforeend', body);
  else s.append(body);
  return s;
}

function tokensSection(): HTMLElement {
  const p = PALETTE[theme];
  const sw = (name: string, val: string) => {
    const ratio = contrast(val, p.surface);
    return `<div class="ad-sw"><span style="background:${val}"></span><b>${name}</b><code>${val}</code><small>${ratio.toFixed(1)}:1</small></div>`;
  };
  const roles = Object.entries(p).map(([k, v]) => sw(k, v)).join('');
  const routes = Object.entries(ROUTE_COLOR[theme]).map(([k, v]) => sw(k, v)).join('');
  const beh = Object.entries(BEHAVIOR_TONE[theme]).map(([k, v]) => sw(k, v)).join('');
  const type = Object.entries(TYPE)
    .map(
      ([k, v]) =>
        `<div class="ad-type"><small>${k} · ${v.size}/${v.line}</small><span style="font-size:${v.size}px;line-height:${v.line}px;font-weight:${v.weight}">${
          lang === 'es' ? 'La placa brilla en la noche' : 'The dish glows at night'
        }</span></div>`,
    )
    .join('');
  return section(
    'tokens',
    'Tokens',
    lang === 'es' ? 'Colores por rol (contraste sobre surface), rutas, comportamientos y escala tipográfica.' : 'Colour roles (contrast on surface), routes, behaviours and type scale.',
    `<div class="ad-grid sw">${roles}</div><h3>Rutas</h3><div class="ad-grid sw">${routes}</div><h3>Comportamientos</h3><div class="ad-grid sw">${beh}</div>
     <h3>Tipografía</h3><div class="ad-types">${type}
       <div class="ad-type"><small>display · Fraunces</small><span class="ad-display">Estación Vigilia</span></div>
       <div class="ad-type"><small>species · Fraunces italic</small><span class="ad-latin">Orbium unicaudatus</span></div>
       <div class="ad-type"><small>numbers · Inter tnum</small><span class="ad-num">12.480 · 3:15 · ×1,5</span></div>
       <div class="ad-type"><small>instrument · JetBrains Mono</small><span class="ad-mono">COMITÉ A ESTACIÓN VIGILIA.</span></div>
     </div>`,
  );
}

function iconsSection(): HTMLElement {
  const wrap = document.createElement('div');
  const groups = Object.entries(ICON_GROUPS);
  const routeTone: Record<string, string> = {
    time: 'time',
    dropper: 'dropper',
    dish: 'dish',
    life: 'life',
    discovery: 'discovery',
    worlds: 'worlds',
    spark: 'spark',
  };
  for (const [g, names] of groups) {
    const tone = routeTone[g] ? `style="--tone:var(--bl-route-${routeTone[g]})"` : '';
    wrap.insertAdjacentHTML(
      'beforeend',
      `<h3>${g} <small>${names.length}</small></h3><div class="ad-icons" ${tone}>${names
        .map((nm) => `<figure title="${nm}"><div class="ad-ic">${artIcon(nm, 32)}</div><figcaption>${nm}</figcaption></figure>`)
        .join('')}</div>`,
    );
  }
  // Sizes strip: the same icons at 16, 20, 24, 32, 48.
  const sample = ['essence', 'datos', 'sparkRoute', 'night', 'encargo', 'bestiary', 'tree', 'world', 'settings', 'swimmer'];
  wrap.insertAdjacentHTML(
    'beforeend',
    `<h3>Tamaños 16 · 20 · 24 · 32 · 48</h3><div class="ad-sizes">${[16, 20, 24, 32, 48]
      .map((s) => `<div>${sample.map((nm) => artIcon(nm, s)).join('')}</div>`)
      .join('')}</div>`,
  );
  const total = Object.keys(ICONS).length;
  return section('icons', `Iconos <small>${total}</small>`, lang === 'es' ? 'Rejilla 24, trazo 1,75, uniones redondas, capa dúo al 20 %.' : '24 grid, 1.75 stroke, round joins, 20 % duotone layer.', wrap);
}

/** Every icon at 64 px over its 24-grid, safe margin and keyline circle (inspection only). */
function iconLabSection(): HTMLElement {
  const grid =
    '<svg class="ad-kl" viewBox="0 0 24 24" aria-hidden="true">' +
    Array.from({ length: 25 }, (_, i) => `<path d="M${i} 0V24M0 ${i}H24" />`).join('') +
    '<rect x="2" y="2" width="20" height="20" class="m"/><circle cx="12" cy="12" r="8.75" class="m"/></svg>';
  const names = (qs.get('names') ?? '').split(',').filter(Boolean);
  const list = names.length ? names : Object.keys(ICONS);
  const body = `<div class="ad-lab">${list
    .map((nm) => `<figure><div class="ad-lab-ic">${grid}${artIcon(nm, 64)}</div><figcaption>${nm}</figcaption></figure>`)
    .join('')}</div>`;
  return section('iconlab', 'Icon lab', '64 px, rejilla 24, margen 2, círculo clave r 8,75.', body);
}

const builders: Record<string, () => HTMLElement> = {
  tokens: tokensSection,
  icons: iconsSection,
  ...(only.includes('iconlab') ? { iconlab: iconLabSection } : {}),
  ...Object.fromEntries(Object.entries(extraSections).map(([k, f]) => [k, () => f(ctx)])),
};

const nav = Object.keys(builders)
  .map((k) => `<a href="?theme=${theme}&section=${k}">${k}</a>`)
  .join('');
app.insertAdjacentHTML(
  'beforeend',
  `<header class="ad-top"><h1>Bioluma <em>· Arte</em></h1><nav>${nav}<a class="ad-all" href="?theme=${theme}">all</a><a class="ad-theme" href="?theme=${
    theme === 'dark' ? 'light' : 'dark'
  }${only.length ? '&section=' + only.join(',') : ''}">${theme === 'dark' ? '☀ light' : '☾ dark'}</a></nav></header>`,
);
for (const [k, b] of Object.entries(builders)) if (!only.length || only.includes(k)) app.append(b());

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = ctx.now();
  for (const f of frameFns) f(t, frozen === null ? dt : 0);
  if (frozen === null) requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// With a frozen clock, draw a few frames so canvases settle, then signal readiness.
if (frozen !== null) {
  for (let i = 0; i < 3; i++) for (const f of frameFns) f(frozen, 0);
}
(window as unknown as { __artReady: boolean }).__artReady = true;
