/** Player-facing strings of the Momentos UI (es + en). */
import type { Lang, Text } from '../../core/types';

const t = (es: string, en: string): Text => ({ es, en });

export const MS = {
  gotIt: t('¡Entendido!', 'Got it!'),
  gotItPlain: t('Entendido', 'Got it'),
  close: t('Cerrar', 'Close'),
  never: t('No volver a explicar', "Don't explain again"),
  paused: t('Pausa: mira qué pasó', 'Paused: see what happened'),
  vela: t('VELA', 'VELA'),
  skipTyping: t('Toca para ver todo', 'Tap to see it all'),
  // Help sheet.
  helpTitle: t('¿Qué pasó?', 'What happened?'),
  helpIntro: t('Todo lo que la placa te enseñó. Toca uno para verlo otra vez.', 'Everything the dish taught you. Tap one to see it again.'),
  helpWatch: t('Ver', 'Watch'),
  helpLocked: t('Todavía no ha pasado', 'Not yet'),
  helpCount: t('{n} de {total} vistos', '{n} of {total} seen'),
  explainLabel: t('Explicaciones', 'Explanations'),
  explainFull: t('Con pausa', 'With pause'),
  explainBrief: t('Breves', 'Brief'),
  explainOff: t('Ninguna', 'None'),
  labelsLabel: t('Etiquetas sobre las criaturas', 'Labels on creatures'),
  labelsAuto: t('Al principio', 'At first'),
  labelsAlways: t('Siempre', 'Always'),
  labelsTap: t('Al tocar', 'On tap'),
  // Status pills.
  stBorn: t('Naciendo', 'Hatching'),
  stStable: t('Viva', 'Alive'),
  stExploded: t('Sin forma', 'Shapeless'),
  stDead: t('Se apaga…', 'Fading…'),
  // Seed price sheet.
  spTitle: t('¿Cuánto cuesta sembrar?', 'What does a seed cost?'),
  spBase: t('semilla básica', 'basic seed'),
  spAlive: t('{n} vivas', '{n} alive'),
  spAlive1: t('1 viva', '1 alive'),
  spAlive0: t('ninguna viva', 'none alive'),
  spFull: t('placa llena: {over} de más', 'dish full: {over} too many'),
  spRoom: t('{n} espacios libres', '{n} free slots'),
  spRoom1: t('1 espacio libre', '1 free slot'),
  spRoom0: t('placa justa', 'dish just full'),
  spTotal: t('precio', 'price'),
  spSlots: t('Espacios baratos', 'Cheap slots'),
  spSlotsFree: t('{n} libres', '{n} free'),
  spSlotsOver: t('{n} de más: ×{s} cada una', '{n} too many: ×{s} each'),
  // Why the price just changed (chip next to the price, ~2 s).
  rsAlive1: t('+1 criatura viva → ×{m}', '+1 living creature → ×{m}'),
  rsAliveN: t('+{n} criaturas vivas → ×{m}', '+{n} living creatures → ×{m}'),
  rsFull: t('Placa llena: {used} de {free} espacios → ×{s}', 'Dish full: {used} of {free} slots → ×{s}'),
  rsRoom: t('Hay sitio otra vez → más barato', 'Room again → cheaper'),
  rsLess: t('Hay sitio otra vez → más barato', 'Room again → cheaper'),
  rsSlots: t('Placa mejorada: {n} espacios baratos', 'Dish upgraded: {n} cheap slots'),
  rsFree: t('¡Gratis! (lluvia de semillas)', 'Free! (seed shower)'),
  rsBig: t('Semilla grande ×{m}', 'Big seed ×{m}'),
  rsBase: t('Nuevo precio base: {b}', 'New base price: {b}'),
  rsOther: t('El precio cambió', 'The price changed'),
  spWhy: t('¿Por qué?', 'Why?'),
  // Behaviour guide.
  bhGuide: t('Maneras de moverse', 'Ways of moving'),
  bhIntro: t('Cómo se mueve cada criatura, qué gana y cómo conseguir más.', 'How each creature moves, what it earns and how to get more.'),
  bhSeen: t('{n} de {total} vistos', '{n} of {total} seen'),
  bhWhat: t('Qué es', 'What it is'),
  bhChange: t('Cuánta Esencia da', 'How much Essence'),
  bhGet: t('Dónde encontrarla', 'Where to find it'),
  bhBoost: t('Cómo mejorarla', 'How to boost it'),
  bhRisk: t('Ojo', 'Careful'),
  bhRule: t('La regla', 'The rule'),
  bhBase: t('es la base: las demás se comparan con ella', 'the baseline: the others compare to it'),
  bhLevel: t('nivel {n}', 'level {n}'),
  bhLocked: t('Se desbloquea: {hint}', 'Unlocks: {hint}'),
  bhExample: t('Ejemplo', 'Example'),
  bhUnseen: t('Aún no la has visto', 'Not seen yet'),
  bhOpen: t('Guía: cómo se mueve cada una', 'Guide: how each one moves'),
  bhOpenShort: t('Guía completa', 'Full guide'),
  cmpTitle: t('¿Por qué esta da más Esencia?', 'Why does this one give more Essence?'),
  cmpMore: t('da más Esencia', 'gives more Essence'),
  see: t('Ver', 'See'),
  cheaper: t('más barato', 'cheaper'),
  pricier: t('más caro', 'pricier'),
} as const;

export function tr(text: Text, lang: Lang, vars?: Record<string, string | number>): string {
  let s = text[lang] ?? text.es;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
