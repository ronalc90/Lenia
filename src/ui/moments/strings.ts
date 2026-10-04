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
  stBorn: t('Naciendo', 'Forming'),
  stStable: t('Estable', 'Stable'),
  stExploded: t('Explotó', 'Exploded'),
  stDead: t('Se disuelve…', 'Fading…'),
  // Seed price sheet.
  spTitle: t('¿Cuánto cuesta sembrar?', 'What does a seed cost?'),
  spBase: t('siembra básica', 'basic seed'),
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
  spRule: t(
    'Sembrar cuesta más cuantas más criaturas viven. Cuando la placa se llena, cada criatura extra lo encarece mucho. Mejora la Placa para tener más espacios baratos.',
    'Sowing costs more the more creatures live. When the dish is full, each extra creature makes it much pricier. Upgrade the Dish for more cheap slots.',
  ),
  // Why the price just changed (chip next to the price, ~2 s).
  rsAlive1: t('+1 criatura viva → ×{m}', '+1 living creature → ×{m}'),
  rsAliveN: t('+{n} criaturas vivas → ×{m}', '+{n} living creatures → ×{m}'),
  rsFull: t('Placa llena: {used} de {free} espacios → ×{s}', 'Dish full: {used} of {free} slots → ×{s}'),
  rsRoom: t('Hay sitio otra vez → más barato', 'Room again → cheaper'),
  rsDied1: t('Murió una criatura → más barato', 'A creature died → cheaper'),
  rsDiedN: t('Murieron {n} criaturas → más barato', '{n} creatures died → cheaper'),
  rsSlots: t('Placa mejorada: {n} espacios baratos', 'Dish upgraded: {n} cheap slots'),
  rsFree: t('¡Gratis! (lluvia de esporas)', 'Free! (spore shower)'),
  rsBig: t('Semilla grande ×{m}', 'Big seed ×{m}'),
  rsBase: t('Nuevo precio base: {b}', 'New base price: {b}'),
  rsOther: t('El precio cambió', 'The price changed'),
  spFree: t('{n} siembras gratis', '{n} free seeds'),
  spFree1: t('1 siembra gratis', '1 free seed'),
  spBig: t('Mantén pulsado: semilla grande ×{m}', 'Hold: big seed ×{m}'),
  spHint: t('Mejora la Placa para tener más espacios baratos.', 'Upgrade the Dish for more cheap slots.'),
  spHintRoom: t('Cada criatura viva sube un poco el precio.', 'Each living creature raises the price a little.'),
  spDish: t('Ver Placa', 'See Dish'),
  spWhy: t('¿Por qué?', 'Why?'),
  // Behaviour guide.
  bhGuide: t('Guía de comportamientos', 'Behaviour guide'),
  bhIntro: t('Cómo se mueve cada criatura, qué gana y cómo conseguir más.', 'How each creature moves, what it earns and how to get more.'),
  bhSeen: t('{n} de {total} vistos', '{n} of {total} seen'),
  bhWhat: t('Qué es', 'What it is'),
  bhChange: t('Qué cambia', 'What changes'),
  bhGet: t('Cómo conseguir más', 'How to get more'),
  bhBoost: t('Cómo mejorarla', 'How to boost it'),
  bhRisk: t('Ojo', 'Careful'),
  bhRule: t('La regla', 'The rule'),
  bhBase: t('es la base: las demás se comparan con ella', 'the baseline: the others compare to it'),
  bhLevel: t('nivel {n}', 'level {n}'),
  bhLocked: t('Se desbloquea: {hint}', 'Unlocks: {hint}'),
  bhExample: t('Ejemplo', 'Example'),
  bhUnseen: t('Aún no la has visto', 'Not seen yet'),
  bhOpen: t('Guía de comportamientos', 'Behaviour guide'),
  bhOpenShort: t('Guía completa', 'Full guide'),
  cmpTitle: t('¿Por qué esta rinde más?', 'Why does this one earn more?'),
  cmpMore: t('rinde más', 'earns more'),
  see: t('Ver', 'See'),
  cheaper: t('más barato', 'cheaper'),
  pricier: t('más caro', 'pricier'),
} as const;

export function tr(text: Text, lang: Lang, vars?: Record<string, string | number>): string {
  let s = text[lang] ?? text.es;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
