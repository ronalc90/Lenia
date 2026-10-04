/** Extra sections of art-dev.html (characters, worlds, matter…), one builder per id. */
import type { DevCtx } from './dev';
import { MATTER_STOPS_V1 } from '../../core/palette';
import { WORLD_TEXT } from '../../game/treeText';
import { catalogPattern } from '../../sim/catalog';
import { rgbToHex } from './color';
import { drawDishReference } from './dishref';
import { EMBLEM_NAMES, emblem } from './emblems';
import { buyBurst, countUp, ease, pop, pressable } from './motion';
import { FAMILY_HUES, MATTER_ART, familyAccent, tintedStops, type Stop } from './matter';
import { renderSpecimen } from './specimen';
import { artIcon, WORLD_ICON } from './icons';
import { ART_MOODS, Portrait, type ArtMood } from './portraits';
import { WORLD_ART_IDS, worldArt, worldColors } from './worlds';

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

function sec(id: string, title: string, sub: string): HTMLElement {
  return el(`<section class="ad-sec" id="${id}"><header><h2>${title}</h2><p>${sub}</p></header></section>`);
}

const MOOD_TEXT: Record<ArtMood, { es: string; en: string }> = {
  neutral: { es: 'Neutral', en: 'Neutral' },
  happy: { es: 'Contenta', en: 'Happy' },
  worried: { es: 'Preocupada', en: 'Worried' },
  awed: { es: 'Asombrada', en: 'Awed' },
  sleepy: { es: 'Con sueño', en: 'Sleepy' },
  proud: { es: 'Orgullosa', en: 'Proud' },
};

/** A portrait card driven by the page clock. */
function portraitCard(
  ctx: DevCtx,
  size: number,
  setup: (p: Portrait) => void,
  label: string,
  note = '',
  opts: { talk?: boolean; night?: boolean; cls?: string } = {},
): HTMLElement {
  const card = el(`<div class="ad-card ${opts.night === false ? '' : 'ad-night'} ${opts.cls ?? ''}"><b>${label}</b>${note ? `<small>${note}</small>` : ''}</div>`);
  const p = new Portrait('ad-cv');
  p.canvas.style.width = `${size}px`;
  p.canvas.style.height = `${size}px`;
  p.state.reduceMotion = ctx.reduceMotion;
  setup(p);
  card.prepend(p.canvas);
  ctx.onFrame((t, dt) => {
    const talking = !!opts.talk;
    const target = talking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 11)) : 0;
    if (talking && dt === 0) {
      p.state.talk = 0.75;
    }
    p.frame(t, dt, target, talking);
  });
  return card;
}

function velaSection(ctx: DevCtx): HTMLElement {
  const s = sec(
    'vela',
    'VELA',
    ctx.lang === 'es'
      ? 'Matraz de vidrio con líquido bioluminoso, corcho y una vela de llama cálida: su humor se ve en la cara, las manos y la llama.'
      : 'A glass flask of bioluminescent liquid, a cork and a warm candle: her mood shows in face, hands and flame.',
  );
  const row = el('<div class="ad-row"></div>');
  const size = Number(new URLSearchParams(location.search).get('size') ?? 200);
  for (const m of ART_MOODS) row.append(portraitCard(ctx, size, (p) => p.set('vela', m), MOOD_TEXT[m][ctx.lang], m));
  s.append(row);
  s.append(el('<h3>Hablando · vestuario · reducir movimiento</h3>'));
  const row2 = el('<div class="ad-row"></div>');
  row2.append(portraitCard(ctx, 160, (p) => p.set('vela', 'happy'), ctx.lang === 'es' ? 'Hablando' : 'Talking', 'talk', { talk: true }));
  row2.append(
    portraitCard(
      ctx,
      160,
      (p) => {
        p.set('vela', 'proud');
        p.state.wear = ['scarf', 'medal', 'flower'];
      },
      ctx.lang === 'es' ? 'Bufanda · medalla · flor' : 'Scarf · medal · flower',
      'wear',
    ),
  );
  row2.append(
    portraitCard(
      ctx,
      160,
      (p) => {
        p.set('vela', 'neutral');
        p.state.reduceMotion = true;
      },
      ctx.lang === 'es' ? 'Reducir movimiento' : 'Reduced motion',
      'rm',
    ),
  );
  row2.append(portraitCard(ctx, 160, (p) => p.set('vela', 'happy'), ctx.lang === 'es' ? 'Sobre panel claro' : 'On a light panel', 'surface', { night: false, cls: 'ad-on-surface' }));
  s.append(row2);
  s.append(el('<h3>Mini (avatar) 28 · 40 · 64</h3>'));
  const row3 = el('<div class="ad-row ad-minis"></div>');
  for (const size of [28, 40, 64]) {
    for (const m of ['neutral', 'happy', 'worried'] as ArtMood[]) {
      const card = el(`<div class="ad-mini"></div>`);
      const p = new Portrait('ad-cv');
      p.canvas.style.width = `${size}px`;
      p.canvas.style.height = `${size}px`;
      p.set('vela', m);
      p.state.reduceMotion = ctx.reduceMotion;
      // Mini mode: draw through drawVela with opts.mini by overriding frame's draw.
      card.append(p.canvas);
      ctx.onFrame((t, dt) => p.frame(t, dt, 0, false));
      row3.append(card);
    }
  }
  s.append(row3);
  return s;
}

function castSection(ctx: DevCtx): HTMLElement {
  const s = sec(
    'cast',
    ctx.lang === 'es' ? 'Reparto' : 'Cast',
    ctx.lang === 'es'
      ? 'La grabadora de la Dra. Albor, el télex del Comité, el ocular del Coro (vida real) y tu cuaderno.'
      : "Dr. Albor's recorder, the Committee's telex, the Choir's eyepiece (real life) and your notebook.",
  );
  const row = el('<div class="ad-row"></div>');
  row.append(portraitCard(ctx, 200, (p) => p.set('albor', 'neutral'), 'Albor · cinta', ctx.lang === 'es' ? 'reproduciendo' : 'playing', { talk: true }));
  row.append(portraitCard(ctx, 200, (p) => p.set('albor', 'neutral'), 'Albor · cinta', ctx.lang === 'es' ? 'en pausa' : 'paused'));
  row.append(portraitCard(ctx, 200, (p) => p.set('albor', 'happy', true), 'Albor · en vivo', ctx.lang === 'es' ? 'epílogo, al alba' : 'epilogue, at dawn'));
  row.append(portraitCard(ctx, 200, (p) => p.set('committee', 'neutral'), 'Comité', ctx.lang === 'es' ? 'télex recibiendo' : 'telex receiving', { talk: true }));
  row.append(
    portraitCard(
      ctx,
      200,
      (p) => {
        p.set('coro', 'awed');
        p.pulse();
      },
      'Coro',
      ctx.lang === 'es' ? 'un Orbium vivo en el ocular' : 'a live Orbium in the eyepiece',
    ),
  );
  row.append(portraitCard(ctx, 200, (p) => p.set('you', 'neutral'), ctx.lang === 'es' ? 'Tú · Bitácora' : 'You · Journal', ctx.lang === 'es' ? 'escribiendo' : 'writing', { talk: true }));
  s.append(row);
  return s;
}

function worldsSection(ctx: DevCtx): HTMLElement {
  const s = sec(
    'worlds',
    ctx.lang === 'es' ? 'Mundos' : 'Worlds',
    ctx.lang === 'es'
      ? 'Una idea visual por mundo: se elige por cómo se ve antes de leer. Arriba a la izquierda queda calma para el título.'
      : 'One visual idea per world: you pick it by its look before reading. The top-left stays calm for the title.',
  );
  const grid = el('<div class="ad-worlds"></div>');
  WORLD_ART_IDS.forEach((id, i) => {
    const t = WORLD_TEXT[id];
    const c = worldColors(id);
    const picked = i === 2;
    const card = el(
      `<button type="button" class="ad-wcard${picked ? ' picked' : ''}" style="--w-ring:${c.ring};--w-glow:${c.glow}">` +
        worldArt(id) +
        `<span class="ad-wtext"><span class="ad-wname">${artIcon(WORLD_ICON[id], 18)}${t.name[ctx.lang]}</span><span class="ad-wdesc">${t.desc[ctx.lang]}</span></span>` +
        (picked ? `<span class="ad-wpick">${artIcon('check', 18)}</span>` : '') +
        (i === 4 ? `<span class="ad-wnew">${ctx.lang === 'es' ? '¡Nuevo!' : 'New!'}</span>` : '') +
        `</button>`,
    );
    grid.append(card);
  });
  s.append(grid);
  s.append(el(`<h3>${ctx.lang === 'es' ? 'Cerrado (aún no abierto)' : 'Locked (not open yet)'}</h3>`));
  const lockedRow = el('<div class="ad-worlds"></div>');
  for (const id of ['legs', 'giants'] as const) {
    lockedRow.append(
      el(
        `<div class="ad-wcard locked">${worldArt(id, { locked: true })}<span class="ad-wtext"><span class="ad-wname">${artIcon('lock', 18)}${WORLD_TEXT[id].name[ctx.lang]}</span><span class="ad-wdesc">${
          ctx.lang === 'es' ? 'Se abre en el Árbol' : 'Opens in the Tree'
        }</span></span></div>`,
      ),
    );
  }
  s.append(lockedRow);
  return s;
}

function specimenCanvas(code: string, cssPx: number, stops: readonly Stop[], bloom = 0.55, rotate = 0): HTMLCanvasElement {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = renderSpecimen(catalogPattern(code), Math.round(cssPx * dpr), stops, { bloom, rotate });
  c.style.width = `${cssPx}px`;
  c.style.height = `${cssPx}px`;
  c.className = 'ad-cv';
  return c;
}

const OLD_STOPS: Stop[] = MATTER_STOPS_V1.map(([v, r, g, b, a]) => [v, r, g, b, a] as const);

function matterSection(ctx: DevCtx): HTMLElement {
  const es = ctx.lang === 'es';
  const s = sec(
    'matter',
    es ? 'Materia' : 'Matter',
    es
      ? 'Paleta del render de la GPU: la de hoy frente a la recomendada (el blanco llega más tarde: se ve la estructura). Tintes por familia con la misma luminosidad.'
      : 'GPU render palette: today vs recommended (white arrives later: the structure shows). Family tints at equal lightness.',
  );
  // Ramp strips.
  const strip = (stops: readonly Stop[], label: string, paper = false) => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 28;
    cv.className = 'ad-ramp';
    const c2 = cv.getContext('2d')!;
    if (!paper) {
      c2.fillStyle = '#0c131b';
      c2.fillRect(0, 0, 512, 28);
    } else {
      c2.fillStyle = '#ffffff';
      c2.fillRect(0, 0, 512, 28);
    }
    for (let i = 0; i < 512; i++) {
      const v = i / 511;
      let k = 1;
      let col = stops[stops.length - 1];
      for (; k < stops.length; k++) if (v <= stops[k][0]) break;
      const a = stops[k - 1];
      const b = stops[Math.min(k, stops.length - 1)];
      const t = (v - a[0]) / (b[0] - a[0] || 1);
      col = [v, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
      c2.fillStyle = `rgba(${col[1] | 0},${col[2] | 0},${col[3] | 0},${col[4]})`;
      c2.fillRect(i, 0, 1, 28);
    }
    const row = el(`<div class="ad-ramprow"><small>${label}</small></div>`);
    row.append(cv);
    return row;
  };
  s.append(strip(OLD_STOPS, es ? 'hoy (core/palette)' : 'today (core/palette)'));
  s.append(strip(MATTER_ART.night, es ? 'recomendada · noche' : 'recommended · night'));
  s.append(strip(MATTER_ART.paper, es ? 'recomendada · papel (retratos en tema claro)' : 'recommended · paper (light-theme portraits)', true));
  s.append(el(`<h3>${es ? 'Hoy → recomendada' : 'Today → recommended'}</h3>`));
  const cmp = el('<div class="ad-row"></div>');
  for (const code of ['O2u', 'S1s', 'OG2g', 'P4cp']) {
    const card = el(`<div class="ad-card ad-night ad-cmp"><b>${code}</b><div class="ad-pair"></div></div>`);
    const pair = card.querySelector('.ad-pair')!;
    pair.append(specimenCanvas(code, 132, OLD_STOPS, 0.45), specimenCanvas(code, 132, MATTER_ART.night));
    cmp.append(card);
  }
  s.append(cmp);
  s.append(el(`<h3>${es ? 'Tintes de especie (12 familias)' : 'Species tints (12 families)'}</h3>`));
  const fam = el('<div class="ad-row ad-fams"></div>');
  for (const f of FAMILY_HUES) {
    const acc = rgbToHex(familyAccent(f.hue, ctx.theme));
    const card = el(`<div class="ad-card ad-night ad-fam"><small style="color:${rgbToHex(familyAccent(f.hue, 'dark'))}">${f.id} · ${f.hue}°</small><span class="ad-acc" style="background:${acc}"></span></div>`);
    card.prepend(specimenCanvas('O2u', 84, tintedStops(f.hue), 0.55, f.hue));
    fam.append(card);
  }
  s.append(fam);
  s.append(el(`<h3>${es ? 'Papel: retratos sobre superficies claras' : 'Paper: portraits on light surfaces'}</h3>`));
  const paper = el('<div class="ad-row"></div>');
  for (const code of ['O2u', 'S1s', 'OG2g', '3GH2n']) {
    const card = el(`<div class="ad-card ad-paper"><b>${code}</b></div>`);
    card.prepend(specimenCanvas(code, 110, MATTER_ART.paper, 0));
    paper.append(card);
  }
  s.append(paper);
  return s;
}

function dishSection(ctx: DevCtx): HTMLElement {
  const es = ctx.lang === 'es';
  const s = sec(
    'dish',
    es ? 'Placa' : 'Dish',
    es
      ? 'Referencia para el shader: mesa de acero en la noche polar, agar azulado, borde de vidrio blanco escarcha (el cian es de la vida), escarcha, reflejo cálido de la vela y anillo de crecimiento.'
      : 'Shader reference: steel bench in the polar night, bluish agar, frost-white glass rim (cyan belongs to life), frost, the candle’s warm glint and the growth ring.',
  );
  const wrap = el('<div class="ad-dishwrap"></div>');
  const cv = document.createElement('canvas');
  const css = Math.min(560, window.innerWidth - 32);
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(css * dpr);
  cv.height = Math.round(css * dpr);
  cv.style.width = `${css}px`;
  cv.style.height = `${css}px`;
  cv.className = 'ad-cv ad-dish';
  const c2 = cv.getContext('2d')!;
  c2.scale(dpr, dpr);
  drawDishReference(c2, css, css, {
    light: ctx.theme === 'light',
    growth: 1.16,
    creatures: [
      { pattern: catalogPattern('O2u'), x: -0.35, y: -0.3, size: 0.3, rotate: 20, hue: 198 },
      { pattern: catalogPattern('S1s'), x: 0.38, y: -0.2, size: 0.26, rotate: 0, hue: 145 },
      { pattern: catalogPattern('OG2g'), x: 0.1, y: 0.4, size: 0.3, rotate: 60, hue: 272 },
      { pattern: catalogPattern('O4i'), x: -0.45, y: 0.3, size: 0.26, rotate: -40, hue: 45 },
    ],
  });
  wrap.append(cv);
  s.append(wrap);
  return s;
}

function emblemsSection(ctx: DevCtx): HTMLElement {
  const es = ctx.lang === 'es';
  const s = sec(
    'emblems',
    es ? 'Emblemas' : 'Emblems',
    es
      ? 'Los conceptos en color, para sustituir los emoji del texto (💧 📊 🌙 ✨ 📋 🎁 🏆 ⏱): mismas siluetas que los iconos, contorno fino para leerse en claro y oscuro.'
      : 'Concepts in colour, replacing the emoji in copy (💧 📊 🌙 ✨ 📋 🎁 🏆 ⏱): same silhouettes as the icons, a fine outline for light and dark.',
  );
  const grid = el('<div class="ad-icons ad-ems"></div>');
  for (const nm of EMBLEM_NAMES) grid.append(el(`<figure><div class="ad-emrow">${[16, 24, 40].map((z) => emblem(nm, z)).join('')}</div><figcaption>${nm}</figcaption></figure>`));
  s.append(grid);
  s.append(el(`<h3>${es ? 'En contexto' : 'In context'}</h3>`));
  s.append(
    el(
      `<div class="ad-row">
        <span class="ad-pill">${emblem('essence', 22)}<b class="ad-num-s">1.240</b><small>+3,2/s</small></span>
        <span class="ad-pill">${emblem('datos', 22)}<b class="ad-num-s">+22</b><small>${es ? 'Datos al terminar' : 'Data at the end'}</small></span>
        <span class="ad-pill">${emblem('night', 22)}<b>${es ? 'Noche 3' : 'Night 3'}</b></span>
        <span class="ad-pill gold">${emblem('spark', 22)}<b>${es ? '¡Destello!' : 'Spark!'}</b></span>
        <span class="ad-pill">${emblem('time', 22)}<b class="ad-num-s">2:41</b></span>
        <span class="ad-pill">${emblem('gift', 22)}<b>${es ? '3 siembras gratis' : '3 free seeds'}</b></span>
      </div>`,
    ),
  );
  return s;
}

function componentsSection(ctx: DevCtx): HTMLElement {
  const es = ctx.lang === 'es';
  const s = sec(
    'components',
    es ? 'Componentes' : 'Components',
    es
      ? 'El sistema aplicado: una sola acción principal por pantalla (cian), secundarias en contorno, estados de nodo del Árbol por color de ruta, aviso y diálogo de VELA.'
      : 'The system applied: one primary action per screen (cyan), outlined secondaries, tree node states in route colour, a toast and VELA’s dialogue.',
  );
  const v = new Portrait('ad-cv');
  v.canvas.style.width = '88px';
  v.canvas.style.height = '88px';
  v.set('vela', 'happy');
  v.state.reduceMotion = ctx.reduceMotion;
  ctx.onFrame((t, dt) => v.frame(t, dt, 0, false));
  const tiles = [
    ['clock', 'time', 'owned', '2/3'],
    ['dropper', 'dropper', 'buy', '12'],
    ['dish', 'dish', 'avail', '27'],
    ['question', 'worlds', 'mystery', ''],
  ]
    .map(
      ([ic, route, st, b]) =>
        `<div class="ad-node ${st}" style="--r:var(--bl-route-${route})"><div class="ad-tile">${artIcon(ic, 30)}</div>${
          st === 'owned' ? `<span class="ad-badge">${b}</span>` : st === 'mystery' ? '' : `<span class="ad-cost">${artIcon('datos', 13)}${b}</span>`
        }<small>${{ owned: es ? 'Tuyo' : 'Owned', buy: es ? 'Comprable' : 'Can buy', avail: es ? 'Faltan Datos' : 'Need Data', mystery: '?' }[st]}</small></div>`,
    )
    .join('');
  const board = el(
    `<div class="ad-comp">
      <div class="ad-btns">
        <button class="ad-btn primary" type="button">${artIcon('play', 22)}${es ? '¡Empezar!' : 'Start!'}</button>
        <button class="ad-btn" type="button">${artIcon('tree', 22)}${es ? 'Ir al Árbol' : 'Go to the Tree'}</button>
        <button class="ad-btn ghost" type="button">${es ? 'Ahora no' : 'Not now'}</button>
        <button class="ad-iconbtn" type="button" aria-label="${es ? 'Ajustes' : 'Settings'}">${artIcon('settings', 24)}</button>
      </div>
      <div class="ad-nodes">${tiles}</div>
      <div class="ad-toast">${artIcon('species', 20)}<span><b>${es ? '¡Especie nueva!' : 'New species!'}</b> <i class="ad-latin-s">Orbium unicaudatus</i></span></div>
      <div class="ad-dialog"><div class="ad-dialog-pic"></div><div><b class="ad-who">VELA</b><p>${
        es ? '¡Tiene borde! ¡Tiene forma! ¡Se queda! Esa es tu primera criatura.' : 'It has an edge! A shape! It stays! That is your first creature.'
      }</p></div><button class="ad-btn small" type="button">${es ? 'Siguiente' : 'Next'}${artIcon('chevronRight', 18)}</button></div>
    </div>`,
  );
  board.querySelector('.ad-dialog-pic')!.append(v.canvas);
  s.append(board);
  return s;
}

function motionSection(ctx: DevCtx): HTMLElement {
  const es = ctx.lang === 'es';
  const s = sec(
    'motion',
    es ? 'Movimiento' : 'Motion',
    es
      ? 'Duraciones y curvas: pulsar 90 ms · aparecer 200 ms · hojas 260 ms · tarjetas 320 ms · celebrar 700 ms. Prueba los botones.'
      : 'Durations and curves: press 90 ms · appear 200 ms · sheets 260 ms · cards 320 ms · celebrate 700 ms. Try the buttons.',
  );
  // Easing curves.
  const cv = document.createElement('canvas');
  const W = Math.min(520, window.innerWidth - 40);
  const H = 180;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  cv.className = 'ad-cv ad-curves';
  const c2 = cv.getContext('2d')!;
  c2.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (n: string) => css.getPropertyValue(n).trim() || '#888';
  c2.strokeStyle = col('--bl-line');
  c2.strokeRect(30.5, 10.5, W - 40, H - 40);
  const curves: [string, (t: number) => number, string][] = [
    ['standard', ease.standard, col('--bl-accent')],
    ['enter', ease.enter, col('--bl-aurora')],
    ['exit', ease.exit, col('--bl-danger')],
    ['pop', ease.pop, col('--bl-gold')],
  ];
  curves.forEach(([name, fn, color], i) => {
    c2.strokeStyle = color;
    c2.lineWidth = 2.5;
    c2.beginPath();
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const x = 30 + t * (W - 40);
      const y = H - 30 - fn(t) * (H - 60);
      if (k) c2.lineTo(x, y);
      else c2.moveTo(x, y);
    }
    c2.stroke();
    c2.fillStyle = color;
    c2.font = '600 12px Inter, sans-serif';
    c2.fillText(name, 40 + i * 90, H - 10);
  });
  s.append(cv);
  // Interactive juice.
  const row = el(`<div class="ad-row ad-juice" style="position:relative">
    <button class="ad-btn primary" type="button" data-j="buy">${artIcon('datos', 20)}${es ? 'Comprar · 12' : 'Buy · 12'}</button>
    <span class="ad-pill"><b class="ad-num-s" data-n>40</b><small>Datos</small></span>
    <button class="ad-btn" type="button" data-j="pop">${es ? 'Saltito' : 'Pop'}</button>
  </div>`);
  const layer = row;
  const num = row.querySelector<HTMLElement>('[data-n]')!;
  let datos = 40;
  row.querySelectorAll<HTMLElement>('.ad-btn').forEach((b) => pressable(b));
  row.querySelector<HTMLElement>('[data-j="buy"]')!.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLElement;
    buyBurst(b, layer, col('--bl-route-time'));
    const from = datos;
    datos = Math.max(0, datos - 12);
    countUp(num, from, datos, (n) => String(n), 420);
    pop(num.parentElement!);
  });
  row.querySelector<HTMLElement>('[data-j="pop"]')!.addEventListener('click', () => pop(num.parentElement!));
  s.append(row);
  return s;
}

export const sections: Record<string, (ctx: DevCtx) => HTMLElement> = {
  emblems: emblemsSection,
  components: componentsSection,
  vela: velaSection,
  cast: castSection,
  worlds: worldsSection,
  matter: matterSection,
  dish: dishSection,
  motion: motionSection,
};
