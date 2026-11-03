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
import { ART_MOODS, Portrait, type ArtMood, type VelaFraming } from './portraits';
import { VELA_PATHS } from './vela';
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
  neutral: { es: 'Reposo', en: 'Idle' },
  happy: { es: 'Contenta', en: 'Happy' },
  worried: { es: 'Preocupada', en: 'Worried' },
  awed: { es: 'Sorprendida', en: 'Surprised' },
  sleepy: { es: 'Dormida', en: 'Sleeping' },
  proud: { es: 'Orgullosa', en: 'Proud' },
  alarm: { es: 'Alarma', en: 'Alarm' },
  thinking: { es: 'Pensando', en: 'Thinking' },
};

/** A line per state for the dialogue mock-ups (what she might say in it). */
const MOOD_LINE: Record<ArtMood, { es: string; en: string }> = {
  neutral: { es: 'Soy VELA. Vigilo la placa toda la noche.', en: 'I am VELA. I watch the dish all night.' },
  happy: { es: '¡Estable! Tu criatura se queda.', en: 'Stable! Your creature is staying.' },
  worried: { es: 'Cuidado: algo no cuadra en la placa.', en: 'Careful: something is off in the dish.' },
  awed: { es: '¡Una especie nueva! Nunca la había visto.', en: 'A new species! I have never seen it.' },
  sleepy: { es: 'Mmm… sigo aquí. Solo ahorro lámpara.', en: 'Mmm… still here. Just saving my lamp.' },
  proud: { es: 'Récord de la noche. Lo dejo registrado.', en: 'Record of the night. Logged.' },
  alarm: { es: '¡Alarma! La placa está llena.', en: 'Alarm! The dish is full.' },
  thinking: { es: 'Déjame analizarlo un momento…', en: 'Let me analyse that for a moment…' },
};

const LETTER = /[\p{L}\p{N}]/u;
const VOWEL = /[aeiouáéíóúAEIOUÁÉÍÓÚ]/;
/** The typewriter of the story UI (28 letters/s, then a pause), as a function of the clock: what is typed and the talk target. */
function typed(text: string, t: number, cycle: number): { n: number; target: number; talking: boolean } {
  const ph = t % cycle;
  const n = Math.min(text.length, Math.floor(ph * 28));
  const talking = n < text.length;
  const ch = n > 0 ? text[n - 1] : ' ';
  const target = talking && LETTER.test(ch) ? (VOWEL.test(ch) ? 1 : 0.5) * (0.75 + 0.25 * Math.sin(t * 30)) : 0;
  return { n, target, talking };
}

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
  // A settled state (a frozen page clock never ages it); ?age= shows a transition instead.
  p.state.moodAge = Number(new URLSearchParams(location.search).get('age') ?? 10);
  card.prepend(p.canvas);
  const line = MOOD_LINE.neutral[ctx.lang];
  ctx.onFrame((t, dt) => {
    if (!opts.talk) return p.frame(t, dt, 0, false);
    const k = typed(line, t + 1.6, 3.2);
    if (k.talking && dt === 0) p.state.talk = 0.75;
    p.frame(t, dt, k.target, k.talking);
  });
  return card;
}

/** Styles of the VELA section's dialogue mock-ups (the story box is P4's; this is a stand-in with its sizes). */
const VELA_CSS = `
.ad-dlg { position: relative; box-sizing: border-box; width: min(560px, 100%); min-height: 120px; padding: 12px 14px 14px 128px;
  border-radius: 16px; border: 1px solid var(--bl-line2); color: var(--bl-text);
  background: radial-gradient(120% 140% at 0% 100%, rgba(255,184,123,.08), transparent 60%), linear-gradient(180deg, var(--bl-surface2), var(--bl-surface));
  box-shadow: var(--bl-elev-3); }
.ad-dlg canvas { position: absolute; left: 6px; bottom: 2px; }
.ad-dlg .ad-dlg-who { font: 700 13px/18px var(--bl-font-mono); letter-spacing: .12em; color: var(--bl-candle); }
.ad-dlg .ad-dlg-who small { margin-left: 8px; font: 600 11px var(--bl-font-ui); letter-spacing: .06em; color: var(--bl-text3); }
.ad-dlg p { margin: 4px 0 0; font: 500 17px/24px var(--bl-font-ui); }
.ad-dlg p .rest { opacity: 0; }
.ad-dlgs { display: grid; gap: 12px; }
.ad-calco { position: relative; width: 240px; height: 240px; border-radius: 12px; overflow: hidden; background: #06090d; }
.ad-calco img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .35; pointer-events: none; user-select: none; }
.ad-calco canvas, .ad-calco svg { position: absolute; inset: 0; width: 240px; height: 240px; }
.ad-calco svg { fill: none; stroke: #5ee6c8; stroke-width: .25; vector-effect: non-scaling-stroke; }
.ad-calco.wire canvas { opacity: 0; }
.ad-calco:not(.wire) svg { display: none; }
.ad-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
.ad-tools label { display: inline-flex; gap: 6px; align-items: center; min-height: 48px; padding: 0 12px; border-radius: 12px;
  border: 1px solid var(--bl-line2); background: var(--bl-surface); font: 600 14px var(--bl-font-ui); }
.ad-tools select { min-height: 40px; font: 500 14px var(--bl-font-ui); }
.ad-mini { display: grid; justify-items: center; gap: 4px; }
.ad-mini small { font: 500 10px var(--bl-font-mono); color: #a7b3bf; }
`;
let velaCssAdded = false;
function addVelaCss(): void {
  if (velaCssAdded) return;
  velaCssAdded = true;
  const st = document.createElement('style');
  st.textContent = VELA_CSS;
  document.head.append(st);
}

/** One dialogue box with VELA in a state (116 px portrait, the story UI's size), typing its line on a loop when `talk`. */
function dialogueMock(ctx: DevCtx, mood: ArtMood, talk: boolean, framing: VelaFraming, size = 116): HTMLElement {
  const es = ctx.lang === 'es';
  const box = el(
    `<div class="ad-dlg" data-mood="${mood}"><div class="ad-dlg-who">VELA · MC-7<small>${MOOD_TEXT[mood][ctx.lang]}${talk ? (es ? ' · hablando' : ' · talking') : ''}</small></div><p><span class="shown"></span><span class="rest"></span></p></div>`,
  );
  box.style.paddingLeft = `${size + 12}px`;
  box.style.minHeight = `${size + 4}px`;
  const p = new Portrait('ad-cv');
  p.canvas.style.width = `${size}px`;
  p.canvas.style.height = `${size}px`;
  p.framing = framing;
  p.set('vela', mood);
  p.state.moodAge = Number(new URLSearchParams(location.search).get('age') ?? 10);
  p.state.reduceMotion = ctx.reduceMotion;
  box.prepend(p.canvas);
  const line = MOOD_LINE[mood][ctx.lang];
  const shown = box.querySelector<HTMLElement>('.shown')!;
  const rest = box.querySelector<HTMLElement>('.rest')!;
  let lastN = -1;
  ctx.onFrame((t, dt) => {
    const k = talk && !ctx.reduceMotion ? typed(line, t + 1.2 + ART_MOODS.indexOf(mood) * 0.37, 4.2) : { n: line.length, target: 0, talking: false };
    if (k.n !== lastN) {
      lastN = k.n;
      shown.textContent = line.slice(0, k.n);
      rest.textContent = line.slice(k.n);
    }
    if (k.talking && dt === 0) p.state.talk = Math.max(0.6, k.target);
    p.frame(t, dt, k.target, k.talking);
  });
  return box;
}

function velaSection(ctx: DevCtx): HTMLElement {
  addVelaCss();
  const es = ctx.lang === 'es';
  const q = new URLSearchParams(location.search);
  const s = sec(
    'vela',
    'VELA · MC-7',
    es
      ? 'Monitor de cultivo de sobremesa: chasis de pintura en polvo, pantalla de fósforo (la traza es su voz), lámpara piloto de filamento, LED de alarma, placa grabada, asa cromada y cable de sonda. Expresa sus nueve estados con la traza, la etiqueta, la lámpara y el LED.'
      : 'A bench-top culture monitor: powder-coat chassis, phosphor screen (the trace is her voice), filament pilot lamp, alarm LED, engraved plate, chrome handle and probe cable. Her nine states show in the trace, the label, the lamp and the LED.',
  );
  const size = Number(q.get('size') ?? 200);
  s.append(el(`<h3>${es ? 'Los nueve estados' : 'The nine states'} <small>${size} px</small></h3>`));
  const row = el('<div class="ad-row" data-shot="states"></div>');
  for (const m of ART_MOODS) row.append(portraitCard(ctx, size, (p) => p.set('vela', m), MOOD_TEXT[m][ctx.lang], m));
  row.append(portraitCard(ctx, size, (p) => p.set('vela', 'neutral'), es ? 'Hablando' : 'Talking', 'talking', { talk: true }));
  s.append(row);

  const framing = (q.get('framing') ?? 'auto') as VelaFraming;
  const talkAll = q.get('talk') === '1';
  s.append(el(`<h3>${es ? 'Caja de diálogo' : 'Dialogue box'} <small>116 px · ${framing}${talkAll ? (es ? ' · hablando' : ' · talking') : ''}</small></h3>`));
  const dl = el('<div class="ad-dlgs" data-shot="dialogue"></div>');
  for (const m of ART_MOODS) dl.append(dialogueMock(ctx, m, talkAll, framing));
  dl.append(dialogueMock(ctx, 'neutral', true, framing));
  s.append(dl);

  s.append(el(`<h3>${es ? 'Encuadres: instrumento entero y primer plano' : 'Framings: whole instrument and close-up'} <small>116 · 140</small></h3>`));
  const fr = el('<div class="ad-row" data-shot="framings"></div>');
  for (const sz of [116, 140])
    for (const f of ['full', 'close'] as const)
      fr.append(
        portraitCard(
          ctx,
          sz,
          (p) => {
            p.framing = f;
            p.set('vela', 'happy');
          },
          `${f} · ${sz}`,
          '',
          { talk: true },
        ),
      );
  s.append(fr);

  s.append(el(`<h3>${es ? 'Vestuario · reducir movimiento · panel claro' : 'Wardrobe · reduced motion · light panel'}</h3>`));
  const row2 = el('<div class="ad-row" data-shot="wear"></div>');
  const wears: [string, string[]][] = [
    [es ? 'Bufanda' : 'Scarf', ['scarf']],
    [es ? 'Medalla' : 'Medal', ['medal']],
    [es ? 'Flor' : 'Flower', ['flower']],
    [es ? 'Las tres' : 'All three', ['scarf', 'medal', 'flower']],
  ];
  for (const [label, wear] of wears)
    row2.append(
      portraitCard(
        ctx,
        200,
        (p) => {
          p.set('vela', 'proud');
          p.state.wear = wear;
        },
        label,
        wear.join(' · '),
      ),
    );
  row2.append(
    portraitCard(
      ctx,
      200,
      (p) => {
        p.set('vela', 'alarm');
        p.state.reduceMotion = true;
      },
      es ? 'Reducir movimiento' : 'Reduced motion',
      'rm · alarm',
    ),
  );
  row2.append(portraitCard(ctx, 200, (p) => p.set('vela', 'happy'), es ? 'Sobre panel claro' : 'On a light panel', 'surface', { night: false, cls: 'ad-on-surface' }));
  s.append(row2);

  if (q.has('bench')) s.append(benchCard(ctx, Number(q.get('bench')) || 116));
  s.append(el(`<h3>Mini (avatar) 28 · 40 · 48</h3>`));
  for (const sz of [28, 40, 48]) {
    const r = el(`<div class="ad-row ad-minis" data-shot="mini-${sz}"></div>`);
    for (const m of ART_MOODS) {
      const card = el(`<div class="ad-mini"><small>${m}</small></div>`);
      const p = new Portrait('ad-cv');
      p.canvas.style.width = `${sz}px`;
      p.canvas.style.height = `${sz}px`;
      p.set('vela', m);
      p.state.moodAge = 10;
      p.state.reduceMotion = ctx.reduceMotion;
      card.prepend(p.canvas);
      ctx.onFrame((t, dt) => p.frame(t, dt, 0, false));
      r.append(card);
    }
    const card = el(`<div class="ad-mini"><small>talking</small></div>`);
    const p = new Portrait('ad-cv');
    p.canvas.style.width = `${sz}px`;
    p.canvas.style.height = `${sz}px`;
    p.set('vela', 'neutral');
    p.state.reduceMotion = ctx.reduceMotion;
    card.prepend(p.canvas);
    const line = MOOD_LINE.neutral[ctx.lang];
    ctx.onFrame((t, dt) => {
      const k = typed(line, t + 1.6, 3.2);
      if (k.talking && dt === 0) p.state.talk = 0.75;
      p.frame(t, dt, k.target, k.talking);
    });
    r.append(card);
    s.append(r);
  }
  return s;
}

/**
 * ?bench=<px>: time VELA's Portrait.frame while she talks (budget §3.9: ≤ 0.5 ms a portrait a frame), after a
 * warm-up that fills the layer cache. The result is on the card and in window.__velaBench (ms per frame).
 */
function benchCard(ctx: DevCtx, size: number): HTMLElement {
  const card = el(`<div class="ad-card ad-night" data-shot="bench"><b>Bench · ${size} px</b><small>…</small></div>`);
  const p = new Portrait('ad-cv');
  p.canvas.style.width = `${size}px`;
  p.canvas.style.height = `${size}px`;
  p.set('vela', 'worried');
  card.prepend(p.canvas);
  const line = MOOD_LINE.worried[ctx.lang];
  requestAnimationFrame(() => {
    let t = 0;
    const step = () => {
      t += 1 / 60;
      const k = typed(line, t, 3);
      p.frame(t, 1 / 60, k.target, k.talking);
    };
    for (let i = 0; i < 60; i++) step();
    const n = 600;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) step();
    const ms = (performance.now() - t0) / n;
    (window as unknown as { __velaBench: number }).__velaBench = ms;
    card.querySelector('small')!.textContent = `${ms.toFixed(3)} ms / frame (DPR ${Math.min(3, devicePixelRatio || 1)})`;
  });
  return card;
}

/** Reference photos of docs/arte-realista/referencias (development only: never bundled, never in the game). */
const CALCO_REFS = [
  'ref-panel-incubadora-co2.jpg',
  'ref-incubadora-co2-binder.jpg',
  'ref-incubadora-guantes-cdc-1978.jpg',
  'ref-guante-nitrilo.jpg',
  'ref-cuaderno-lbnl-1941.jpg',
];

/**
 * «Calco» (docs/ARTE-REALISTA.md §3.3): a reference photo locked at 35 % under the vector, and a switch to see
 * the silhouette as wire (the hand-written path data), the «locked layer» workflow of the vector tutorials.
 */
function calcoSection(ctx: DevCtx): HTMLElement {
  addVelaCss();
  const es = ctx.lang === 'es';
  const s = sec(
    'calco',
    es ? 'Calco' : 'Tracing',
    es
      ? 'Foto de referencia bloqueada al 35 % debajo del vector y la silueta en alambre. Solo en desarrollo: las referencias viven en docs/arte-realista/referencias y nunca se empaquetan.'
      : 'A reference photo locked at 35 % under the vector, and the silhouette as wire. Development only: the references live in docs/arte-realista/referencias and are never bundled.',
  );
  const tools = el(
    `<div class="ad-tools"><select aria-label="${es ? 'Referencia' : 'Reference'}">${CALCO_REFS.map((r) => `<option>${r}</option>`).join('')}</select>` +
      `<label><input type="checkbox" data-k="photo" checked> ${es ? 'Foto' : 'Photo'}</label>` +
      `<label><input type="checkbox" data-k="wire"> ${es ? 'Alambre' : 'Wire'}</label></div>`,
  );
  const wire = Object.values(VELA_PATHS)
    .map((d) => `<path d="${d}"/>`)
    .join('');
  const stage = el(`<div class="ad-calco"><img alt="" draggable="false"><svg viewBox="0 0 100 100" aria-hidden="true">${wire}</svg></div>`);
  const img = stage.querySelector('img')!;
  const setRef = (name: string) => (img.src = `/docs/arte-realista/referencias/${name}`);
  setRef(CALCO_REFS[0]);
  const p = new Portrait('ad-cv');
  p.canvas.style.width = '240px';
  p.canvas.style.height = '240px';
  p.set('vela', 'neutral');
  p.state.reduceMotion = true;
  stage.insertBefore(p.canvas, stage.querySelector('svg'));
  ctx.onFrame((t, dt) => p.frame(t, dt, 0, false));
  tools.querySelector('select')!.addEventListener('change', (e) => setRef((e.target as HTMLSelectElement).value));
  tools.querySelectorAll<HTMLInputElement>('input').forEach((i) =>
    i.addEventListener('change', () => {
      if (i.dataset.k === 'photo') img.hidden = !i.checked;
      else stage.classList.toggle('wire', i.checked);
    }),
  );
  s.append(tools, stage);
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
  calco: calcoSection,
  cast: castSection,
  worlds: worldsSection,
  matter: matterSection,
  dish: dishSection,
  motion: motionSection,
};
