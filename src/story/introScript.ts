/**
 * The opening intro (docs/STORY.md §11): ten illustrated panels, ~35 s, before VELA's first scene.
 * Story first (the station, Albor's farewell tape, you arriving, VELA lighting her candle, the
 * glowing dish), then "what you do" in four kid-sized steps (sow, shape → Esencia, the lab clock →
 * Datos, the Árbol and the Mundos), then one hook (Albor's secret) and "¡Empezar!".
 *
 * Owner's rule: a 5-year-old must follow it. Every line ≤ 12 words (tested), es + en, one idea per
 * line, at most two lines per panel. The intro never repeats t_intro: after it, t_intro only says
 * "your first seed" and asks for the tap (script.ts T_INTRO_AFTER_INTRO).
 */
import type { Text } from '../core/types';

/** Who says a line: the narrator (storybook voice) or a cast member with a portrait. */
export type IntroVoice = 'narrator' | 'vela' | 'albor' | 'you';

export interface IntroLine {
  who: IntroVoice;
  /** Face of the speaker's portrait. */
  mood?: 'neutral' | 'happy' | 'awed' | 'worried' | 'proud' | 'thinking';
  text: Text;
}

/** Painter ids (src/ui/intro/scenes.ts). */
export type IntroSceneId = 'station' | 'tape' | 'arrive' | 'candle' | 'dish' | 'sow' | 'essence' | 'clock' | 'tree' | 'go';

export interface IntroPanel {
  id: IntroSceneId;
  /** Small kicker above the text ("How to play · 1/4"). */
  kicker?: Text;
  lines: IntroLine[];
  /** Show the look picker (three doctors). */
  picker?: boolean;
  /** Seconds a typical reader needs here (the whole intro aims at 30–45 s). */
  seconds: number;
}

const t = (es: string, en: string): Text => ({ es, en });
const how = (n: number): Text => t(`Cómo se juega · ${n}/4`, `How to play · ${n}/4`);

export const INTRO_MAX_WORDS = 12;

export const INTRO_PANELS: readonly IntroPanel[] = [
  {
    id: 'station',
    seconds: 4,
    lines: [
      { who: 'narrator', text: t('Muy al norte, en una isla de hielo, está la Estación Vigilia.', 'Far up north, on an island of ice, sits Vigil Station.') },
      { who: 'narrator', text: t('Allí la noche dura cuatro meses. El sol no sale.', 'There, the night lasts four months. The sun never rises.') },
    ],
  },
  {
    id: 'tape',
    seconds: 4,
    lines: [
      { who: 'narrator', text: t('La doctora Albor cuidaba el laboratorio. Se fue antes de la noche.', 'Dr. Albor ran the lab. She left before the night came.') },
      { who: 'albor', mood: 'happy', text: t('Te dejo mi luz. Cuídalas mucho, ¿vale?', 'I leave you my light. Take good care of them, okay?') },
    ],
  },
  {
    id: 'arrive',
    seconds: 4.5,
    picker: true,
    lines: [
      { who: 'narrator', text: t('Y llegas tú, para cuidar el turno de noche.', 'And here you come, to keep the night shift.') },
      { who: 'narrator', text: t('¿Cómo eres? Elige tu bata.', 'What do you look like? Pick your look.') },
    ],
  },
  {
    id: 'candle',
    seconds: 3.5,
    lines: [
      { who: 'vela', mood: 'awed', text: t('¡Hola! Soy VELA, la ayudante del laboratorio.', 'Hi! I\'m VELA, the lab assistant.') },
      { who: 'vela', mood: 'happy', text: t('Mi vela da calor. ¡Y la placa da luz!', 'My candle keeps us warm. And the dish gives light!') },
    ],
  },
  {
    id: 'dish',
    seconds: 3.5,
    lines: [
      { who: 'vela', mood: 'awed', text: t('En esta placa crece vida de verdad. ¡Y brilla!', 'Real life grows in this dish. And it glows!') },
      { who: 'vela', mood: 'happy', text: t('Las llamamos criaturas. Las cuidaremos juntos.', 'We call them creatures. We\'ll look after them together.') },
    ],
  },
  {
    id: 'sow',
    kicker: how(1),
    seconds: 3,
    lines: [
      { who: 'narrator', text: t('Toca la placa para sembrar una semilla de vida.', 'Tap the dish to sow a seed of life.') },
      { who: 'narrator', text: t('Algunas se apagan. ¡No pasa nada! Prueba otra vez.', 'Some fade away. That\'s okay! Try again.') },
    ],
  },
  {
    id: 'essence',
    kicker: how(2),
    seconds: 3.5,
    lines: [
      { who: 'narrator', text: t('Si se queda con forma, ¡es una criatura!', 'If it keeps its shape, it\'s a creature!') },
      { who: 'narrator', text: t('Las criaturas te dan Esencia. Las manchas sin forma, no.', 'Creatures give you Essence. Shapeless blobs don\'t.') },
    ],
  },
  {
    id: 'clock',
    kicker: how(3),
    seconds: 3.5,
    lines: [
      { who: 'narrator', text: t('Tu tiempo de laboratorio es corto. ¡Mira el reloj!', 'Your lab time is short. Watch the clock!') },
      { who: 'narrator', text: t('Al terminar, tu Esencia se convierte en Datos.', 'When it ends, your Essence turns into Data.') },
    ],
  },
  {
    id: 'tree',
    kicker: how(4),
    seconds: 3.5,
    lines: [
      { who: 'narrator', text: t('Con Datos, haz crecer el Árbol: mejoras para todo.', 'Spend Data to grow the Tree: upgrades for everything.') },
      { who: 'narrator', text: t('Y abre Mundos nuevos, con otras criaturas.', 'And open new Worlds, with other creatures.') },
    ],
  },
  {
    id: 'go',
    seconds: 3,
    lines: [
      { who: 'vela', mood: 'proud', text: t('Albor dejó un secreto en la placa. ¿Lo buscamos?', 'Albor left a secret in the dish. Shall we find it?') },
      { who: 'you', mood: 'happy', text: t('¡Vamos a sembrar!', 'Let\'s go sow!') },
    ],
  },
];

/** Total reading time (s): the target is 30–45 s. */
export const INTRO_SECONDS = INTRO_PANELS.reduce((s, p) => s + p.seconds, 0);

/** Buttons and labels of the intro UI. */
export const INTRO_UI = {
  next: t('Siguiente', 'Next'),
  back: t('Atrás', 'Back'),
  start: t('¡Empezar!', 'Let\'s start!'),
  skipAll: t('Saltar intro', 'Skip intro'),
  pickLook: t('Elige tu bata', 'Pick your look'),
  label: t('Introducción', 'Introduction'),
  replay: t('Ver la introducción', 'Watch the intro'),
  replayHint: t('La historia y cómo se juega, en 40 segundos.', 'The story and how to play, in 40 seconds.'),
  names: {
    narrator: t('', ''),
    vela: t('VELA', 'VELA'),
    albor: t('Dra. Albor · cinta', 'Dr. Albor · tape'),
    you: t('Tú', 'You'),
  } as Record<IntroVoice, Text>,
  panel: (i: number, n: number): Text => t(`Página ${i} de ${n}`, `Page ${i} of ${n}`),
};
