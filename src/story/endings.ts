/**
 * Endings and playstyle leanings (pure functions; see docs/STORY.md §5).
 *
 * Four main endings, one per leaning, plus a secret one. The final question
 * ("what are we to you?") offers the player's TOP TWO leanings as the two
 * buttons, so both playstyle and an explicit last choice decide the ending.
 * If the secret conditions hold, the first button becomes "answer in their
 * language" (secret ending) and the second is the top leaning.
 */
import type { Behavior, GameView, Text } from '../core/types';
import { SEED_SPECIES } from './script';
import type { CounterKey, EndingDef, EndingId, Leaning, Leanings } from './types';
import { LEANINGS } from './types';

const t = (es: string, en: string): Text => ({ es, en });

export const LEANING_NAMES: Record<Leaning, Text> = {
  harvest: t('Cosecha', 'Harvest'),
  law: t('Ley', 'Law'),
  memory: t('Memoria', 'Memory'),
  tide: t('Marea', 'Tide'),
};

export const ENDINGS: Record<EndingId, EndingDef> = {
  harvest: {
    id: 'harvest',
    title: t('Final: Cosecha', 'Ending: Harvest'),
    option: t('Mi trabajo.', 'My work.'),
    cards: [
      t('Copié a la mejor. Luego copié la copia.', 'I copied the best one. Then I copied the copy.'),
      t('La placa se llenó de una sola forma, hasta el borde.', 'The dish filled with one single shape, to the rim.'),
      t('Al amanecer llegó el avión del Comité. Traían una medalla.', 'At dawn the Committee\'s plane arrived. They brought a medal.'),
    ],
    closing: t('La placa ya no canta. Pero rinde.', 'The dish no longer sings. But it yields.'),
    color: '#F2A541',
    epilogue: 'ep_harvest',
  },
  law: {
    id: 'law',
    title: t('Final: Ley perfecta', 'Ending: Perfect Law'),
    option: t('Un mundo que ordenar.', 'A world to put in order.'),
    cards: [
      t('Ajusté las reglas hasta el último decimal.', 'I tuned the rules to the last decimal.'),
      t('Cada criatura encontró su órbita exacta. Nada nace por error.', 'Every creature found its exact orbit. Nothing is born by mistake.'),
      t('Albor volvió al amanecer. Miró mucho rato. «Es precioso. ¿Aún te sorprende?»', 'Albor came back at dawn. She looked for a long time. "It\'s beautiful. Does it still surprise you?"'),
    ],
    closing: t('Escribí un mundo sin errores. Ya nada me sorprende.', 'I wrote a world without mistakes. Nothing surprises me anymore.'),
    color: '#B892FF',
    epilogue: 'ep_law',
  },
  memory: {
    id: 'memory',
    title: t('Final: Archivo', 'Ending: Archive'),
    option: t('Algo que no quiero perder.', 'Something I don\'t want to lose.'),
    cards: [
      t('Guardé a cada una: su forma, su nombre, su noche.', 'I kept every one: its shape, its name, its night.'),
      t('Subieron como farolillos y se quedaron en el cielo, hechas estrellas.', 'They rose like lanterns and stayed in the sky as stars.'),
      t('Albor volvió al amanecer. Le enseñé el Bestiario. Lloró en la página del Orbium.', 'Albor came back at dawn. I showed her the Bestiary. She cried at the Orbium page.'),
    ],
    closing: t('Nada se perdió del todo. Recordar también es estar vivo.', 'Nothing was ever fully lost. Remembering is a way of being alive.'),
    color: '#FFD166',
    epilogue: 'ep_memory',
  },
  tide: {
    id: 'tide',
    title: t('Final: Marea', 'Ending: Tide'),
    option: t('Algo que debo dejar ir.', 'Something I must let go.'),
    cards: [
      t('Dejé de calibrar. Dejé de elegir. Solo miré.', 'I stopped calibrating. I stopped choosing. I just watched.'),
      t('Cambiaron, se juntaron y cruzaron el borde como una marea de luz.', 'They changed, gathered, and crossed the rim like a tide of light.'),
      t('Al amanecer apagamos el microscopio. Albor llegó a tiempo de verlo.', 'At dawn we switched off the microscope. Albor arrived in time to see it.'),
    ],
    closing: t('Siguen brillando sin mí. Ya no me necesitan.', 'They keep glowing without me. They don\'t need me anymore.'),
    color: '#6EE7C8',
    epilogue: 'ep_tide',
  },
  albor: {
    id: 'albor',
    title: t('Final secreto: Primera luz', 'Secret ending: First Light'),
    option: t('·  ·  ·   contestar en su idioma', '·  ·  ·   answer in their language'),
    cards: [
      t('Toqué tres veces. Contestaron todas a la vez.', 'I tapped three times. They all answered at once.'),
      t('El Destello salió de la placa y se fue a buscar el sol.', 'The Spark left the dish and went to find the sun.'),
      t('Albor entró con la primera luz. Nadie habló. La placa cantaba.', 'Albor walked in with the first light. Nobody spoke. The dish was singing.'),
      t('Desde muy arriba, las luces de la estación dibujaban una forma pequeña. Alguien también nos miraba.', 'From high above, the station lights drew a small shape. Someone was watching us too.'),
    ],
    closing: t('Ya no sé quién descubrió a quién. Nos descubrimos.', 'I don\'t know who discovered whom. We discovered each other.'),
    color: '#FFE9C7',
    epilogue: 'ep_albor',
    secret: true,
  },
};

/** Tie-break order (first wins on equal scores). Gentle endings first. */
const TIE_ORDER: readonly Leaning[] = ['memory', 'tide', 'law', 'harvest'];
const ALL_BEHAVIORS: readonly Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

export interface LeaningInput {
  choices: Readonly<Record<string, string>>;
  counters: Readonly<Partial<Record<CounterKey, number>>>;
  view: GameView;
}

/** Prints from the game view when it exposes them (optional field), else the story's own count. */
function printsOf(input: LeaningInput): number {
  const stats = input.view.stats as unknown as { prints?: unknown };
  const fromView = typeof stats.prints === 'number' ? stats.prints : 0;
  return Math.max(fromView, input.counters.prints ?? 0);
}

/**
 * Playstyle → leaning scores. Each term is small, legible and capped so no
 * single habit decides alone; the explicit choices weigh the most.
 *
 *  harvest  "sent the sample" +3, "followed protocol" +1, prints ×0.2 (≤ 4)
 *  law      Genome "rules" nodes ×2, calibrations ×0.05 (≤ 3), "recalibrated" +3
 *  memory   Genome "heritage" nodes ×2, "left the lamp on" +2, "said no" +1, species ×0.05 (≤ 2)
 *  tide     Genome "fauna" nodes ×2, behaviours seen ×0.4, "answered" +3, "said no" +1, Sparks caught ×0.05 (≤ 2)
 */
export function computeLeanings(input: LeaningInput): Leanings {
  const { choices: ch, counters: n, view: v } = input;
  const owned = (branch: 'rules' | 'heritage' | 'fauna') => v.genomeNodes.filter((g) => g.branch === branch && g.owned).length;
  const cap = (x: number, max: number) => Math.min(max, x);
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    harvest: r((ch.sample === 'send' ? 3 : 0) + (ch.lamp === 'protocol' ? 1 : 0) + cap(printsOf(input) * 0.2, 4)),
    law: r(owned('rules') * 2 + cap((n.calib ?? 0) * 0.05, 3) + (ch.rhythm === 'recalibrate' ? 3 : 0)),
    memory: r(owned('heritage') * 2 + (ch.lamp === 'lamp' ? 2 : 0) + (ch.sample === 'refuse' ? 1 : 0) + cap(v.species.length * 0.05, 2)),
    tide: r(
      owned('fauna') * 2 +
        v.behaviorsSeen.length * 0.4 +
        (ch.rhythm === 'answer' ? 3 : 0) +
        (ch.sample === 'refuse' ? 1 : 0) +
        cap((n.goldenCaught ?? 0) * 0.05, 2),
    ),
  };
}

/** Leanings sorted by score (desc), ties by TIE_ORDER. */
export function rankLeanings(l: Leanings): Leaning[] {
  return [...LEANINGS].sort((a, b) => l[b] - l[a] || TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b));
}

/**
 * Secret ending ("First Light"): every seed species registered, all six
 * behaviours seen, and the player answered the Choir.
 */
export function secretUnlocked(choices: Readonly<Record<string, string>>, v: GameView): boolean {
  if (choices.rhythm !== 'answer') return false;
  const names = v.species.map((s) => s.catalogName ?? '').filter(Boolean);
  const allSpecies = SEED_SPECIES.every((n) => names.some((x) => x === n || x.startsWith(n)));
  const allBehaviors = ALL_BEHAVIORS.every((b) => v.behaviorsSeen.includes(b));
  return allSpecies && allBehaviors;
}

/** The two endings offered by the final question. */
export function finalOptions(l: Leanings, secret: boolean): [EndingId, EndingId] {
  const ranked = rankLeanings(l);
  return secret ? ['albor', ranked[0]] : [ranked[0], ranked[1]];
}

/** Missing pieces of the secret ending (for a gentle hint in the archive). */
export function secretProgress(choices: Readonly<Record<string, string>>, v: GameView): { species: number; speciesTotal: number; behaviors: number; behaviorsTotal: number; answered: boolean } {
  const names = v.species.map((s) => s.catalogName ?? '').filter(Boolean);
  return {
    species: SEED_SPECIES.filter((n) => names.some((x) => x === n || x.startsWith(n))).length,
    speciesTotal: SEED_SPECIES.length,
    behaviors: ALL_BEHAVIORS.filter((b) => v.behaviorsSeen.includes(b)).length,
    behaviorsTotal: ALL_BEHAVIORS.length,
    answered: choices.rhythm === 'answer',
  };
}
