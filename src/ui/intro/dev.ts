/**
 * intro-dev.html: every character in every mood (busts and full bodies), the dialogue portraits,
 * and the full intro.
 *
 * URL params: ?view=gallery|intro (default gallery)  ?panel=N (intro start)  ?theme=dark|light
 * ?lang=es|en  ?rm=1 (reduce motion)  ?t=2.5 (freeze clocks)  ?look=curls|beanie|bun
 */
import '../art/art.css';
import type { Lang } from '../../core/types';
import {
  ALBOR,
  DOCTOR_MOODS,
  PLAYER_LOOK_IDS,
  PLAYER_LOOK_NAMES,
  drawDoctorAt,
  drawDoctorBust,
  playerSpec,
  setPlayerLook,
  type DoctorMood,
  type DoctorSpec,
  type Gesture,
  type PlayerLookId,
} from '../art/characters';
import { Portrait } from '../art/portraits';
import { drawVelaArt, featherEdges } from '../art/vela';
import { createIntro } from './intro';

const qs = new URLSearchParams(location.search);
const view = qs.get('view') ?? 'gallery';
const theme = qs.get('theme') === 'light' ? 'light' : 'dark';
const lang: Lang = qs.get('lang') === 'en' ? 'en' : 'es';
const rm = qs.get('rm') === '1';
const frozen = qs.has('t') ? Number(qs.get('t')) : null;
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
  border: 1px solid rgba(207,232,245,.1); color: #e6edf3; }
.card b { font: 700 13px/16px var(--bl-font-ui); } .card small { font: 500 11px/14px var(--bl-font-mono); color: #a7b3bf; }
.card canvas { display: block; }
.nav { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; }
.nav a { color: var(--bl-text2); border: 1px solid var(--bl-line); padding: 6px 10px; border-radius: 999px; text-decoration: none; font: 600 13px var(--bl-font-ui); }
.nav a.on { color: var(--bl-accent); border-color: var(--bl-accent); }
`;
document.head.append(css);

const MOOD_TEXT: Record<DoctorMood, [string, string]> = {
  neutral: ['Neutral', 'Neutral'],
  happy: ['Contenta', 'Happy'],
  surprised: ['Sorpresa', 'Surprised'],
  worried: ['Preocupada', 'Worried'],
  thinking: ['Pensando', 'Thinking'],
  proud: ['Orgullosa', 'Proud'],
  sleepy: ['Con sueño', 'Sleepy'],
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

function canvasCard(w: number, h: number, label: string, note: string, draw: (c: CanvasRenderingContext2D, t: number) => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  const cv = document.createElement('canvas');
  const d = Math.min(2, devicePixelRatio || 1);
  cv.width = w * d;
  cv.height = h * d;
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

function blinkAt(t: number, seed: number): number {
  if (rm) return 0;
  const ph = (t + seed) % 3.9;
  return ph < 0.07 ? ph / 0.07 : ph < 0.14 ? 1 - (ph - 0.07) / 0.07 : 0;
}

function bustCard(spec: DoctorSpec, mood: DoctorMood, size: number, seed: number, talk = false): HTMLElement {
  return canvasCard(size, size, MOOD_TEXT[mood][lang === 'es' ? 0 : 1], mood, (c, t) => {
    c.scale(size / 100, size / 100);
    const talking = talk && !rm;
    drawDoctorBust(c, spec, { mood, moodAge: 10, talk: talking ? 0.3 + 0.7 * Math.abs(Math.sin(t * 11)) : 0, talking, blink: blinkAt(t, seed), reduceMotion: rm }, t);
    featherEdges(c, 4);
  });
}

function bodyCard(spec: DoctorSpec, mood: DoctorMood, gesture: Gesture | undefined, label: string, seed: number): HTMLElement {
  return canvasCard(150, 190, label, gesture ?? mood, (c, t) => {
    const g = c.createRadialGradient(75, 120, 10, 75, 120, 120);
    g.addColorStop(0, '#1a2a44');
    g.addColorStop(1, '#0b111c');
    c.fillStyle = g;
    c.fillRect(0, 0, 150, 190);
    drawDoctorAt(c, spec, { mood, moodAge: 10, talk: 0, talking: false, blink: blinkAt(t, seed), reduceMotion: rm, gesture }, t, 75, 178, 1.75);
  });
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
    link('Galería', { view: 'gallery' }, view === 'gallery') +
    link('Intro', { view: 'intro' }, view === 'intro') +
    link(theme === 'dark' ? '☀ claro' : '☾ oscuro', { theme: theme === 'dark' ? 'light' : 'dark' }, false) +
    link(lang === 'es' ? 'EN' : 'ES', { lang: lang === 'es' ? 'en' : 'es' }, false) +
    link(rm ? 'movimiento' : 'reducir mov.', { rm: rm ? '0' : '1' }, false);
  return n;
}

function gallery(): void {
  app.insertAdjacentHTML('beforeend', `<h1>Los doctores de la <em>Estación Vigilia</em></h1>`);
  app.append(nav());
  app.insertAdjacentHTML(
    'beforeend',
    `<p class="sub">${lang === 'es' ? 'Dibujados en código (Canvas 2D), animados, deterministas. Luz cálida de vela arriba a la derecha, rebote cian de la placa abajo.' : 'Drawn in code (Canvas 2D), animated, deterministic. Warm candle light from the upper right, cyan bounce from the dish below.'}</p>`,
  );
  const people: [string, DoctorSpec][] = [
    [lang === 'es' ? 'Dra. Albor' : 'Dr. Albor', ALBOR],
    ...PLAYER_LOOK_IDS.map((id) => [`${lang === 'es' ? 'Tú' : 'You'} · ${PLAYER_LOOK_NAMES[id][lang]}`, playerSpec(id)] as [string, DoctorSpec]),
  ];
  people.forEach(([name, spec], pi) => {
    app.insertAdjacentHTML('beforeend', `<h2>${name}</h2>`);
    const row = document.createElement('div');
    row.className = 'row';
    DOCTOR_MOODS.forEach((m, i) => row.append(bustCard(spec, m, 150, pi * 7 + i * 0.6)));
    row.append(bustCard(spec, 'happy', 150, pi, true));
    (row.lastChild as HTMLElement).querySelector('b')!.textContent = lang === 'es' ? 'Hablando' : 'Talking';
    app.append(row);
    const row2 = document.createElement('div');
    row2.className = 'row';
    row2.style.marginTop = '10px';
    const gestures: [DoctorMood, Gesture | undefined, string][] = [
      ['neutral', 'rest', lang === 'es' ? 'En reposo' : 'Idle'],
      ['happy', 'wave', lang === 'es' ? 'Saluda' : 'Waves'],
      ['neutral', 'hold', lang === 'es' ? 'Sostiene' : 'Holds'],
      ['thinking', 'chin', lang === 'es' ? 'Piensa' : 'Thinks'],
      ['proud', 'hips', lang === 'es' ? 'Orgullo' : 'Proud'],
      ['neutral', 'walk', lang === 'es' ? 'Camina' : 'Walks'],
      ['neutral', 'write', lang === 'es' ? 'Escribe' : 'Writes'],
    ];
    gestures.forEach(([m, g, l], i) => row2.append(bodyCard(spec, m, g, l, pi * 3 + i)));
    app.append(row2);
  });
  // The dialogue portraits (the same Portrait class the story UI uses), next to VELA.
  app.insertAdjacentHTML('beforeend', `<h2>${lang === 'es' ? 'En el diálogo (con VELA)' : 'In the dialogue (with VELA)'}</h2>`);
  const row = document.createElement('div');
  row.className = 'row';
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
    frames.push((t, dt) => p.frame(t, dt, talk && !rm ? 0.3 + 0.7 * Math.abs(Math.sin(t * 11)) : 0, talk && !rm));
    row.append(card);
  };
  portrait('VELA', 'vela · happy', (p) => p.set('vela', 'happy'));
  portrait(lang === 'es' ? 'Albor · cinta' : 'Albor · tape', 'albor · talking', (p) => p.set('albor', 'neutral'), true);
  portrait(lang === 'es' ? 'Albor · cinta' : 'Albor · tape', 'albor · happy', (p) => p.set('albor', 'happy'));
  portrait(lang === 'es' ? 'Albor · en vivo' : 'Albor · live', 'albor · live', (p) => p.set('albor', 'happy', true), true);
  portrait(lang === 'es' ? 'Tú · Bitácora' : 'You · Journal', 'you · writing', (p) => p.set('you', 'neutral'), true);
  portrait(lang === 'es' ? 'Tú' : 'You', 'you · thinking', (p) => p.set('you', 'thinking'));
  portrait('VELA', 'mini 48 px', (p) => p.set('vela', 'happy'), false, 48);
  portrait(lang === 'es' ? 'Albor' : 'Albor', 'mini 48 px', (p) => p.set('albor', 'happy'), false, 48);
  portrait(lang === 'es' ? 'Tú' : 'You', 'mini 48 px', (p) => p.set('you', 'happy'), false, 48);
  app.append(row);
  // Side by side: the doctors stand next to VELA on the bench.
  app.insertAdjacentHTML('beforeend', `<h2>${lang === 'es' ? 'Juntos' : 'Together'}</h2>`);
  app.append(
    canvasCard(560, 260, lang === 'es' ? 'Albor, VELA y tú' : 'Albor, VELA and you', '', (c, t) => {
      const g = c.createLinearGradient(0, 0, 0, 260);
      g.addColorStop(0, '#0b1222');
      g.addColorStop(1, '#16223a');
      c.fillStyle = g;
      c.fillRect(0, 0, 560, 260);
      c.fillStyle = '#1c263a';
      c.fillRect(0, 200, 560, 60);
      const pose = (mood: DoctorMood, gesture?: Gesture) => ({ mood, moodAge: 10, talk: 0, talking: false, blink: blinkAt(t, 1), reduceMotion: rm, gesture });
      drawDoctorAt(c, ALBOR, pose('happy', 'wave'), t, 120, 248, 2.2);
      c.save();
      c.translate(280 - 50 * 1.5, 205 - 97 * 1.5);
      c.scale(1.5, 1.5);
      drawVelaArt(c, { mood: 'happy', moodAge: 10, talk: 0, talking: false, blink: blinkAt(t, 2), reduceMotion: rm }, t);
      c.restore();
      drawDoctorAt(c, playerSpec(), pose('proud', 'hips'), t, 440, 248, 2.2);
    }),
  );
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
