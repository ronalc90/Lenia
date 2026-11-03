/**
 * intro-dev.html: the people of scientific realism (ADR-029, docs/ARTE-REALISTA.md §5): your gloved
 * hand in its four poses with each coat's cuff, the coat rack («Elige tu bata»), Albor's Polaroid,
 * Albor in profile at dawn in every mood, the dialogue portraits next to VELA, the recorder, telex and
 * eyepiece; and the full intro.
 *
 * URL params: ?view=gallery|intro (default gallery)  ?panel=N (intro start)  ?theme=dark|light
 * ?lang=es|en  ?rm=1 (reduce motion)  ?t=2.5 (freeze clocks)  ?look=curls|beanie|bun
 * ?only=hands|coats|albor|dialogue|objects (one section)
 */
import '../art/art.css';
import type { Lang } from '../../core/types';
import {
  BATA_FICHA,
  COAT_IDS,
  DOCTOR_MOODS,
  HAND_POSES,
  PLAYER_LOOK_IDS,
  PLAYER_LOOK_NAMES,
  drawAlborBack,
  drawAlborPolaroid,
  drawAlborProfile,
  drawBataCard,
  drawCassette,
  drawGlovedHand,
  drawLantern,
  setPlayerLook,
  type CoatId,
  type DoctorMood,
  type HandPose,
  type PlayerLookId,
} from '../art/characters';
import { peekPhoto } from '../art/photos';
import { Portrait } from '../art/portraits';
import { createIntro } from './intro';

const qs = new URLSearchParams(location.search);
const view = qs.get('view') ?? 'gallery';
const theme = qs.get('theme') === 'light' ? 'light' : 'dark';
const lang: Lang = qs.get('lang') === 'en' ? 'en' : 'es';
const rm = qs.get('rm') === '1';
const frozen = qs.has('t') ? Number(qs.get('t')) : null;
const only = qs.get('only');
const lookQ = qs.get('look') as PlayerLookId | null;
if (lookQ && (PLAYER_LOOK_IDS as readonly string[]).includes(lookQ)) setPlayerLook(lookQ);
document.documentElement.dataset.theme = theme;
document.documentElement.lang = lang;

const app = document.getElementById('app')!;
const css = document.createElement('style');
css.textContent = `
html, body { margin: 0; background: var(--bl-bg); color: var(--bl-text); font-family: var(--bl-font-ui); -webkit-font-smoothing: antialiased; }
body { padding: 0 16px 48px; }
#app { max-width: 1320px; margin: 0 auto; }
h1 { font: 700 26px/32px var(--bl-font-display); margin: 18px 0 4px; }
h1 em { color: var(--bl-candle); }
h2 { font: 700 13px/18px var(--bl-font-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--bl-text2); margin: 26px 0 10px; }
p.sub { color: var(--bl-text2); margin: 0 0 8px; max-width: 760px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; }
.card { display: grid; justify-items: center; gap: 4px; padding: 8px 8px 10px; border-radius: 16px; background: #0d1422;
  border: 1px solid rgba(207,232,245,.1); color: #e6edf3; max-width: 100%; box-sizing: border-box; }
[data-theme='light'] .card { background: #ffffff; color: #0f1720; border-color: #e1e7ed; }
.card b { font: 700 13px/16px var(--bl-font-ui); } .card small { font: 500 11px/14px var(--bl-font-mono); color: #a7b3bf; }
[data-theme='light'] .card small { color: #44505d; }
.card canvas { display: block; max-width: 100%; }
.nav { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; }
.nav a { color: var(--bl-text2); border: 1px solid var(--bl-line); padding: 6px 10px; border-radius: 999px; text-decoration: none; font: 600 13px var(--bl-font-ui); }
.nav a.on { color: var(--bl-accent); border-color: var(--bl-accent); }
`;
document.head.append(css);

const L = (es: string, en: string): string => (lang === 'es' ? es : en);

const MOOD_TEXT: Record<DoctorMood, [string, string]> = {
  neutral: ['Neutral', 'Neutral'],
  happy: ['Contenta', 'Happy'],
  surprised: ['Sorpresa', 'Surprised'],
  worried: ['Preocupada', 'Worried'],
  thinking: ['Pensando', 'Thinking'],
  proud: ['Orgullosa', 'Proud'],
  sleepy: ['Con sueño', 'Sleepy'],
};

const POSE_TEXT: Record<HandPose, [string, string]> = {
  reach: ['Alcanza', 'Reaches'],
  point: ['Señala', 'Points'],
  pipette: ['Pipetea', 'Pipettes'],
  pen: ['Escribe', 'Writes'],
};

const frames: ((t: number, dt: number) => void)[] = [];
const t0 = performance.now();
let last = t0;
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = frozen ?? (now - t0) / 1000;
  for (const f of frames) f(t, frozen !== null ? 0 : dt);
  requestAnimationFrame(loop);
}

/** A card with a canvas at the real DPR (up to 3, like the portraits), redrawn every frame. */
function canvasCard(w: number, h: number, label: string, note: string, draw: (c: CanvasRenderingContext2D, t: number) => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  const cv = document.createElement('canvas');
  const d = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(w * d);
  cv.height = Math.round(h * d);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  card.append(cv);
  card.insertAdjacentHTML('beforeend', `<b>${label}</b>${note ? `<small>${note}</small>` : ''}`);
  const c = cv.getContext('2d')!;
  frames.push((t) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    draw(c, t);
  });
  return card;
}

/** The night lab bench behind the hands: dark epoxy, the window's cold light, the lamp from the right. */
function bench(c: CanvasRenderingContext2D, w: number, h: number): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0c1118');
  g.addColorStop(1, '#151a1e');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const r = c.createRadialGradient(w * 1.05, h * 0.5, 0, w, h * 0.5, w * 0.9);
  r.addColorStop(0, 'rgba(255,167,87,0.12)');
  r.addColorStop(1, 'rgba(255,167,87,0)');
  c.fillStyle = r;
  c.fillRect(0, 0, w, h);
}

function section(title: string, sub = ''): HTMLElement {
  app.insertAdjacentHTML('beforeend', `<h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`);
  const row = document.createElement('div');
  row.className = 'row';
  app.append(row);
  return row;
}

function nav(): HTMLElement {
  const n = document.createElement('div');
  n.className = 'nav';
  const link = (label: string, p: Record<string, string>, on: boolean) => {
    const u = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(p)) u.set(k, v);
    return `<a class="${on ? 'on' : ''}" href="?${u}">${label}</a>`;
  };
  n.innerHTML =
    link(L('Galería', 'Gallery'), { view: 'gallery' }, view === 'gallery') +
    link('Intro', { view: 'intro' }, view === 'intro') +
    link(theme === 'dark' ? L('☀ claro', '☀ light') : L('☾ oscuro', '☾ dark'), { theme: theme === 'dark' ? 'light' : 'dark' }, false) +
    link(lang === 'es' ? 'EN' : 'ES', { lang: lang === 'es' ? 'en' : 'es' }, false) +
    link(rm ? L('movimiento', 'motion') : L('reducir mov.', 'reduce motion'), { rm: rm ? '0' : '1' }, false);
  return n;
}

const want = (s: string) => !only || only === s;

function handsBig(): void {
  const id = (lookQ ?? 'curls') as CoatId;
  const row = section(L('Tu mano, grande', 'Your hand, large'));
  for (const pose of HAND_POSES) {
    const W = 300;
    const H = 360;
    row.append(
      canvasCard(W, H, POSE_TEXT[pose][lang === 'es' ? 0 : 1], `${pose} · ${id}`, (c) => {
        bench(c, W, H);
        const k = pose === 'pipette' ? 2.5 : 3.1;
        const [x, y] = pose === 'pipette' ? [W * 0.52, H * 0.6] : pose === 'pen' ? [W * 0.72, H * 0.82] : [W * 0.6, H * 0.86];
        drawGlovedHand(c, pose, x, y, k, id);
      }),
    );
  }
}

function hands(): void {
  if (qs.has('big')) return handsBig();
  const row = section(L('Tu mano', 'Your hand'), L('Primera persona: guante de nitrilo y el puño de tu bata. Luz de ventana arriba a la izquierda, lámpara de VELA a la derecha, rebote cian de la placa abajo.', 'First person: a nitrile glove and the cuff of your coat. Window light upper left, VELA’s lamp on the right, cyan bounce from the dish below.'));
  for (const id of COAT_IDS)
    for (const pose of HAND_POSES) {
      const W = 170;
      const H = 210;
      row.append(
        canvasCard(W, H, `${POSE_TEXT[pose][lang === 'es' ? 0 : 1]} · ${PLAYER_LOOK_NAMES[id][lang]}`, `${pose} · ${id}`, (c) => {
          bench(c, W, H);
          const k = pose === 'pipette' ? 1.45 : 1.75;
          const [x, y] = pose === 'pipette' ? [W * 0.52, H * 0.62] : pose === 'pen' ? [W * 0.72, H * 0.8] : [W * 0.6, H * 0.84];
          drawGlovedHand(c, pose, x, y, k, id);
        }),
      );
    }
  // Large: to judge the material up close.
  const big = section(L('De cerca', 'Up close'));
  for (const id of ['curls', 'bun'] as CoatId[]) {
    const W = 360;
    const H = 420;
    big.append(
      canvasCard(W, H, `${POSE_TEXT.reach[lang === 'es' ? 0 : 1]} · ${PLAYER_LOOK_NAMES[id][lang]}`, 'reach · 360 px', (c) => {
        bench(c, W, H);
        drawGlovedHand(c, 'reach', W * 0.62, H * 0.86, 3.9, id);
      }),
    );
  }
}

function coats(t0: number): void {
  const row = section(L('Elige tu bata', 'Pick your lab coat'), L('Tres batas reales en el perchero, cada una con su tarjeta. Al elegir, se descuelga y la tarjeta oscila.', 'Three real coats on the rack, each with its ID card. Picking one lifts it off the hook and swings the card.'));
  let picked: CoatId = 'beanie';
  let pickedAt = t0;
  for (const id of COAT_IDS) {
    const W = 150;
    const H = 240;
    const card = canvasCard(W, H, PLAYER_LOOK_NAMES[id][lang], BATA_FICHA[id][lang], (c, t) => {
      const age = t - pickedAt;
      const lift = id === picked ? (rm ? 1 : Math.min(1, Math.max(0, age / 0.22))) : 0;
      drawBataCard(c, id, W, H, t, rm, lift, { lang, theme, age: id === picked ? age : undefined });
    });
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      picked = id;
      pickedAt = (performance.now() - t0) / 1000;
    });
    row.append(card);
  }
  const big = section(L('La tarjeta, de cerca', 'The ID card, up close'));
  for (const id of COAT_IDS) {
    const W = 300;
    const H = 470;
    big.append(canvasCard(W, H, PLAYER_LOOK_NAMES[id][lang], `${W}×${H}`, (c, t) => drawBataCard(c, id, W, H, t, rm, id === 'curls', { lang, theme })));
  }
}

function albor(): void {
  const row = section('Albor', L('Nunca de frente: de espaldas en su Polaroid, a contraluz en perfil al alba. El vaho sale al hablar.', 'Never face on: from behind in her Polaroid, backlit in profile at dawn. Her breath steams when she speaks.'));
  row.append(
    canvasCard(220, 290, 'Polaroid', L('ventana dibujada', 'drawn window'), (c, t) => {
      c.fillStyle = '#6b4a2e';
      c.fillRect(0, 0, 220, 290);
      drawAlborPolaroid(c, 30, 26, 160, t, rm, null, { lang });
    }),
    canvasCard(220, 290, 'Polaroid', L('foto NOAA en la ventana', 'NOAA photo in the window'), (c, t) => {
      c.fillStyle = '#6b4a2e';
      c.fillRect(0, 0, 220, 290);
      drawAlborPolaroid(c, 30, 26, 160, t, rm, peekPhoto('estacion-aurora-noaa'), { lang, tilt: 0.04 });
    }),
    canvasCard(220, 290, L('De espaldas', 'From behind'), 'drawAlborBack · full', (c, t) => {
      const g = c.createLinearGradient(0, 0, 0, 290);
      g.addColorStop(0, '#0b1a22');
      g.addColorStop(1, '#05080b');
      c.fillStyle = g;
      c.fillRect(0, 0, 220, 290);
      drawAlborBack(c, 110, 280, 260, { mood: 'neutral', talk: 0, talking: false, reduceMotion: rm }, t, { full: true });
    }),
  );
  const moods = section(L('Albor en vivo, al alba', 'Albor live, at dawn'));
  for (const m of DOCTOR_MOODS)
    moods.append(
      canvasCard(150, 150, MOOD_TEXT[m][lang === 'es' ? 0 : 1], m, (c, t) => {
        c.scale(1.5, 1.5);
        drawAlborProfile(c, 0, 0, 100, { mood: m, talk: 0, talking: false, reduceMotion: rm, moodAge: 10 }, t);
      }),
    );
  moods.append(
    canvasCard(150, 150, L('Hablando', 'Talking'), L('vaho', 'breath'), (c, t) => {
      c.scale(1.5, 1.5);
      const talk = rm ? 0.8 : 0.4 + 0.5 * Math.abs(Math.sin(t * 3));
      drawAlborProfile(c, 0, 0, 100, { mood: 'happy', talk, talking: true, reduceMotion: rm, moodAge: 10 }, t);
    }),
    canvasCard(320, 320, L('De cerca', 'Up close'), '320 px', (c, t) => {
      c.scale(3.2, 3.2);
      drawAlborProfile(c, 0, 0, 100, { mood: 'neutral', talk: rm ? 0.8 : 0.5 + 0.4 * Math.sin(t * 2.4), talking: true, reduceMotion: rm, moodAge: 10 }, t);
    }),
  );
}

function dialogue(): void {
  const row = section(L('En el diálogo (con VELA)', 'In the dialogue (with VELA)'));
  const portrait = (label: string, note: string, setup: (p: Portrait) => void, talk = false, size = 132) => {
    const card = document.createElement('div');
    card.className = 'card';
    const p = new Portrait('pv');
    p.canvas.style.width = `${size}px`;
    p.canvas.style.height = `${size}px`;
    p.state.reduceMotion = rm;
    setup(p);
    card.append(p.canvas);
    card.insertAdjacentHTML('beforeend', `<b>${label}</b><small>${note}</small>`);
    frames.push((t, dt) => p.frame(t, dt, talk && !rm ? 0.3 + 0.7 * Math.abs(Math.sin(t * 11)) : talk ? 0.7 : 0, talk));
    row.append(card);
  };
  portrait('VELA', 'vela · happy', (p) => p.set('vela', 'happy'));
  portrait(L('Albor · cinta', 'Albor · tape'), 'albor · talking', (p) => p.set('albor', 'neutral'), true);
  portrait(L('Albor · en vivo', 'Albor · live'), 'albor · live · talking', (p) => p.set('albor', 'happy', true), true);
  portrait(L('Tú · Bitácora', 'You · Journal'), 'you · writing', (p) => p.set('you', 'neutral'), true);
  portrait(L('Tú', 'You'), 'you · thinking', (p) => p.set('you', 'thinking'));
  portrait(L('Tú', 'You'), 'you · proud', (p) => p.set('you', 'proud'));
  portrait(L('Comité', 'Committee'), 'telex · talking', (p) => p.set('committee', 'neutral'), true);
  portrait(L('Coro', 'Choir'), 'eyepiece', (p) => p.set('coro', 'neutral'));
  portrait('VELA', 'mini 48 px', (p) => p.set('vela', 'happy'), false, 48);
  portrait('Albor', 'mini 48 px', (p) => p.set('albor', 'happy'), false, 48);
  portrait('Albor', L('vivo · mini', 'live · mini'), (p) => p.set('albor', 'happy', true), false, 48);
  portrait(L('Tú', 'You'), 'mini 48 px', (p) => p.set('you', 'happy'), false, 48);
  const big = section(L('Retratos grandes', 'Large portraits'));
  for (const [sp, live, m] of [
    ['albor', false, 'neutral'],
    ['you', false, 'neutral'],
  ] as const) {
    const card = document.createElement('div');
    card.className = 'card';
    const p = new Portrait('pv');
    p.canvas.style.width = '280px';
    p.canvas.style.height = '280px';
    p.state.reduceMotion = rm;
    p.set(sp, m, live);
    card.append(p.canvas);
    card.insertAdjacentHTML('beforeend', `<b>${sp}</b><small>280 px</small>`);
    frames.push((t, dt) => p.frame(t, dt, rm ? 0.7 : 0.3 + 0.7 * Math.abs(Math.sin(t * 11)), true));
    big.append(card);
  }
}

function objects(): void {
  const row = section(L('Objetos', 'Objects'));
  row.append(
    canvasCard(220, 150, L('Casete', 'Cassette'), 'drawCassette', (c, t) => {
      c.fillStyle = '#1a1512';
      c.fillRect(0, 0, 220, 150);
      drawCassette(c, 110, 75, 180, t, true, rm);
    }),
    canvasCard(150, 150, L('Farol', 'Lantern'), 'drawLantern', (c, t) => {
      c.fillStyle = '#0d1218';
      c.fillRect(0, 0, 150, 150);
      drawLantern(c, 75, 78, 4.2, t, rm);
    }),
  );
}

function gallery(): void {
  app.insertAdjacentHTML('beforeend', `<h1>${L('La gente de la', 'The people of')} <em>${L('Estación Vigilia', 'Vigil Station')}</em></h1>`);
  app.append(nav());
  app.insertAdjacentHTML(
    'beforeend',
    `<p class="sub">${L('Realismo científico (ADR-029): sin caras. Vector escrito a mano en Canvas 2D, 8 capas de luz y material, capas estáticas en caché.', 'Scientific realism (ADR-029): no faces. Hand-written vector in Canvas 2D, 8 layers of light and material, static layers cached.')}</p>`,
  );
  const start = (performance.now() - t0) / 1000;
  if (want('hands')) hands();
  if (want('coats')) coats(start);
  if (want('albor')) albor();
  if (want('dialogue')) dialogue();
  if (want('objects')) objects();
  requestAnimationFrame(loop);
}

function intro(): void {
  document.body.style.padding = '0';
  const start = Number(qs.get('panel') ?? 0);
  const again = document.createElement('button');
  again.textContent = 'Replay intro';
  again.style.cssText = 'position:fixed;left:16px;bottom:16px;min-height:48px;padding:0 16px;border-radius:12px;';
  again.hidden = true;
  document.body.append(again);
  const open = () => {
    again.hidden = true;
    const it = createIntro(document.body, {
      lang: () => lang,
      reduceMotion: () => rm,
      startAt: start,
      freezeAt: frozen,
      dryRun: true,
      onDone: (r) => {
        console.info('intro done', r);
        again.hidden = false;
      },
    });
    (window as unknown as { __intro: typeof it }).__intro = it;
  };
  again.addEventListener('click', open);
  open();
}

if (view === 'intro') intro();
else gallery();
