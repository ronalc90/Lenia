/** UI strings of the story layer (es + en). Story lines live in src/story/script.ts. */
import type { Lang, Text } from '../../core/types';

const t = (es: string, en: string): Text => ({ es, en });

export const S = {
  skip: t('Saltar', 'Skip'),
  skipTutorial: t('Saltar tutorial', 'Skip tutorial'),
  skipTutorialSure: t('¿Seguro? Toca otra vez', 'Sure? Tap again'),
  later: t('Todavía no', 'Not yet'),
  continueExp: t('Continuar el experimento', 'Continue the experiment'),
  tapToContinue: t('Toca para seguir', 'Tap to continue'),
  closeTask: t('Cerrar', 'Close'),
  archiveTitle: t('Historia', 'Story'),
  archiveSub: t('La noche polar en la Estación Vigilia', 'The polar night at Vigil Station'),
  endings: t('Finales', 'Endings'),
  secret: t('Final secreto', 'Secret ending'),
  yourNight: t('Hacia dónde va tu noche', 'Where your night is heading'),
  scenes: t('Escenas', 'Scenes'),
  watch: t('Ver otra vez', 'Watch again'),
  notYet: t('Aún no', 'Not yet'),
  storyOff: t('La historia está apagada.', 'The story is turned off.'),
  credits: [
    t('Bioluma', 'Bioluma'),
    t('Una historia de VELA, la doctora Albor, el Coro y tú.', 'A story of VELA, Dr. Albor, the Choir and you.'),
    t('Vida artificial: Lenia, de Bert Chan. Catálogo de especies con licencia MIT.', 'Artificial life: Lenia, by Bert Chan. Species catalogue under the MIT licence.'),
    t('Cada criatura de la placa es real: nace de la simulación.', 'Every creature in the dish is real: it is born from the simulation.'),
    t('Gracias por mirar.', 'Thank you for watching.'),
    t('El experimento continúa.', 'The experiment continues.'),
  ],
};

export function secretHint(lang: Lang, p: { species: number; speciesTotal: number; behaviors: number; behaviorsTotal: number; answered: boolean }): string {
  return lang === 'es'
    ? `Especies de Albor ${p.species}/${p.speciesTotal} · Maneras de moverse ${p.behaviors}/${p.behaviorsTotal}${p.answered ? ' · Contestaste' : ' · ¿Contestaste?'}`
    : `Albor’s species ${p.species}/${p.speciesTotal} · Ways of moving ${p.behaviors}/${p.behaviorsTotal}${p.answered ? ' · You answered' : ' · Did you answer?'}`;
}

export const tr = (text: Text, lang: Lang): string => text[lang] ?? text.es;
