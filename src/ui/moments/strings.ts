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
  spSlotsOver: t('{n} de más: ×3 cada una', '{n} too many: ×3 each'),
  spFree: t('{n} siembras gratis', '{n} free seeds'),
  spFree1: t('1 siembra gratis', '1 free seed'),
  spBig: t('Mantén pulsado: semilla grande ×{m}', 'Hold: big seed ×{m}'),
  spHint: t('Mejora la Placa para tener más espacios baratos.', 'Upgrade the Dish for more cheap slots.'),
  spHintRoom: t('Cada criatura viva sube un poco el precio.', 'Each living creature raises the price a little.'),
  spDish: t('Ver Placa', 'See Dish'),
  spWhy: t('¿Por qué?', 'Why?'),
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
