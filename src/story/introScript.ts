/**
 * The opening intro (docs/STORY.md §11): ten illustrated panels, ~33 s, before VELA's first scene.
 * Story first (the station, Albor's farewell tape, you arriving, VELA the MC-7 monitor with her pilot
 * lamp, the glowing dish), then "what you do" as four one-line rules (sow, collect the light, the lab
 * clock → Datos, the Árbol and the Mundos), and last the game in one sentence (docs/CLARIDAD2.md §1.1).
 *
 * Owner's rule: a 5-year-old must follow it. Every line ≤ 12 words (tested), es + en, one idea per
 * line, at most two lines per panel. The intro never repeats the station: after it, t_intro only says
 * who VELA is and asks for the tap (script.ts T_INTRO_AFTER_INTRO).
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
      { who: 'albor', mood: 'happy', text: t('Te dejo mi luz y mis criaturas. Cuídalas mucho.', 'I leave you my light and my creatures. Look after them.') },
    ],
  },
  {
    id: 'arrive',
    seconds: 4.5,
    picker: true,
    lines: [
      { who: 'narrator', text: t('Y llegas tú, para cuidar el turno de noche.', 'And here you come, to keep the night shift.') },
      { who: 'narrator', text: t('¿Qué bata te pones? Elige una.', 'Which lab coat do you wear? Pick one.') },
    ],
  },
  {
    id: 'candle',
    seconds: 3.5,
    lines: [
      { who: 'vela', mood: 'awed', text: t('¡Hola! Soy VELA, la ayudante del laboratorio.', 'Hi! I\'m VELA, the lab assistant.') },
      { who: 'vela', mood: 'happy', text: t('Mi lámpara nunca se apaga. ¡Y la placa da luz!', 'My lamp never goes out. And the dish gives light!') },
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
  // How to play: one rule per panel (docs/CLARIDAD2.md §5.3 task 11; Esencia is Luz on screen, ADR-030).
  {
    id: 'sow',
    kicker: how(1),
    seconds: 2.5,
    lines: [{ who: 'narrator', text: t('Toca la placa para poner una semilla de luz.', 'Tap the dish to drop a seed of light.') }],
  },
  {
    id: 'essence',
    kicker: how(2),
    seconds: 2.5,
    lines: [{ who: 'narrator', text: t('Una criatura con forma hace luz. ¡Tócala y recógela!', 'A creature with a shape makes glow. Tap to collect it!') }],
  },
  {
    id: 'clock',
    kicker: how(3),
    seconds: 2.5,
    lines: [{ who: 'narrator', text: t('Mira el reloj: al acabar, tu luz se hace Datos.', 'Watch the clock: when it ends, your glow becomes Data.') }],
  },
  {
    id: 'tree',
    kicker: how(4),
    seconds: 2.5,
    lines: [{ who: 'narrator', text: t('Con Datos, el Árbol te da mejoras y Mundos nuevos.', 'With Data, the Tree gives you upgrades and new Worlds.') }],
  },
  {
    // The game in one sentence (§1.1), in two lines of the 12-word rule.
    id: 'go',
    seconds: 4,
    lines: [
      { who: 'vela', mood: 'happy', text: t('Siembra criaturas de luz y recoge la luz que hacen.', 'Sow creatures of light and collect the glow they make.') },
      { who: 'vela', mood: 'proud', text: t('Úsala para descubrir las 7 especies de la doctora Albor.', 'Use it to discover all 7 of Dr. Albor\'s species.') },
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
  pickLook: t('Elige tu bata', 'Pick your lab coat'),
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
