/**
 * Emblems (docs/ARTE.md §5.4): the game's key concepts as small COLOURED glyphs — the visual
 * replacement for the emoji the copy uses today (💧 📊 🌙 ✨ 📋 🎁 🏆 ⏱). Same silhouettes as the
 * line icons (geometry.ts), filled with a two-stop gradient of the concept colour, a fine dark
 * outline so they read on light and dark surfaces, and one white highlight.
 *
 *   essence  cyan drop           datos   aurora card with bars   spark   gold four-point star
 *   night    lavender crescent   encargo cream clipboard          gift    gold box, coral ribbon
 *   record   gold cup            time    stopwatch                seed    cyan spore with a sprout
 *   species  cyan creature       tree    three linked nodes       world   violet globe
 *
 * Inline SVG strings; gradient ids get a per-call suffix (many emblems can share a page).
 */
import { circlePath, crescent, drop, star4 } from './geometry';

export type EmblemName = 'essence' | 'datos' | 'spark' | 'night' | 'encargo' | 'gift' | 'record' | 'time' | 'seed' | 'species' | 'tree' | 'world';
export const EMBLEM_NAMES: readonly EmblemName[] = ['essence', 'datos', 'spark', 'night', 'encargo', 'gift', 'record', 'time', 'seed', 'species', 'tree', 'world'];

/** [top, bottom] gradient colours and the outline colour of each emblem. */
const TONE: Record<EmblemName, [string, string, string]> = {
  essence: ['#bff0ff', '#2f9fd8', '#0b3a57'],
  datos: ['#b8fbe9', '#22b593', '#0a4a3c'],
  spark: ['#fff3c4', '#f5b93a', '#6b4300'],
  night: ['#eef0ff', '#9aa6f2', '#2c3170'],
  encargo: ['#fff8e6', '#ead7ad', '#5a4426'],
  gift: ['#ffe7a3', '#f2b236', '#6b4300'],
  record: ['#fff0b8', '#e8a925', '#6b4300'],
  time: ['#f3fbff', '#bfe3f5', '#164a66'],
  seed: ['#c6f3ff', '#3aa9dc', '#0b3a57'],
  species: ['#c6f3ff', '#3aa9dc', '#0b3a57'],
  tree: ['#d9f6ff', '#5bc0eb', '#0b3a57'],
  world: ['#ecdcff', '#9a63f0', '#34146b'],
};

let uid = 0;

function body(name: EmblemName, g: string): string {
  const [, , ink] = TONE[name];
  const fill = `fill="url(#${g})" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"`;
  const shine = 'fill="#fff" opacity=".85"';
  switch (name) {
    case 'essence':
      return `<path d="${drop(12, 2.5, 6.6)}" ${fill}/><path d="M8.6 14.6a3.4 3.4 0 0 0 2.6 3.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`;
    case 'datos':
      return `<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.2" ${fill}/><path d="M8 16.6v-3.2M12 16.6v-6.8M16 16.6V7.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'spark':
      return `<path d="${star4(11, 13, 9, 0.24)}" ${fill}/><path d="${star4(19.2, 4.6, 2.6, 0.22)}" fill="url(#${g})" stroke="${ink}" stroke-width=".8"/><circle cx="9" cy="10.6" r="1.4" ${shine}/>`;
    case 'night':
      return `<path d="${crescent(11.25, 12.75, 8.6, 4.4, -3.6, 7.2)}" ${fill}/><path d="${star4(18.8, 4.6, 2.5, 0.22)}" fill="#fff4d0" stroke="${ink}" stroke-width=".7"/><circle cx="6.6" cy="11" r="1.2" ${shine}/>`;
    case 'encargo':
      return `<rect x="4.6" y="4.2" width="14.8" height="17.4" rx="2.6" ${fill}/><rect x="8.6" y="2.4" width="6.8" height="4" rx="1.4" fill="#ffb86b" stroke="${ink}" stroke-width="1"/><path d="M8.4 13.4l2.4 2.4 4.6-4.8" fill="none" stroke="#c0461f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'gift':
      return `<rect x="3.6" y="9" width="16.8" height="12" rx="2" ${fill}/><path d="M12 9v12M3.6 13h16.8" stroke="#e4572e" stroke-width="2.2"/><path d="M12 9c-1.6-3.6-6-3.6-5.6-1.2.3 1.4 3.4 1.2 5.6 1.2zm0 0c1.6-3.6 6-3.6 5.6-1.2-.3 1.4-3.4 1.2-5.6 1.2z" fill="#ff7a5c" stroke="${ink}" stroke-width=".9"/>`;
    case 'record':
      return `<path d="M7.6 3.6h8.8v5.8a4.4 4.4 0 0 1-8.8 0z" ${fill}/><path d="M7.6 5.6H5a2.6 2.6 0 0 0 2.9 3.9M16.4 5.6H19a2.6 2.6 0 0 1-2.9 3.9" fill="none" stroke="${ink}" stroke-width="1.2"/><path d="M10.4 13.6h3.2l.6 3.6h-4.4z" fill="url(#${g})" stroke="${ink}" stroke-width="1"/><rect x="7.6" y="17.2" width="8.8" height="3.6" rx="1" fill="url(#${g})" stroke="${ink}" stroke-width="1"/><circle cx="10" cy="6.4" r="1.1" ${shine}/>`;
    case 'time':
      return `<circle cx="12" cy="13.2" r="8" ${fill}/><rect x="9.8" y="1.8" width="4.4" height="2.6" rx="1" fill="#5bc0eb" stroke="${ink}" stroke-width="1"/><path d="M12 8.6v4.6l3 1.8" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="${'M12 5.2a8 8 0 0 1 7.2 4.6'}" fill="none" stroke="#5bc0eb" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'seed':
      return `<circle cx="12" cy="14.2" r="6.4" ${fill}/><path d="M12 7.8V5.4" stroke="#2b7a3a" stroke-width="1.6" stroke-linecap="round"/><path d="M12 6c.2-2.4 1.8-3.8 4.4-4-.1 2.5-1.7 3.8-4.4 4z" fill="#7fd67a" stroke="#2b5a2a" stroke-width=".9"/><circle cx="12" cy="14.2" r="1.8" fill="#fff" opacity=".9"/>`;
    case 'species':
      return `<path d="M4.6 15a7.4 7.4 0 0 1 14.8 0c-1.6 2.9-4.5 4-7.4 4S6.2 17.9 4.6 15z" ${fill}/><ellipse cx="9" cy="13.4" rx="1.4" ry="2.2" fill="${ink}"/><ellipse cx="15" cy="13.4" rx="1.4" ry="2.2" fill="${ink}"/><circle cx="8.6" cy="12.6" r=".55" fill="#fff"/><circle cx="14.6" cy="12.6" r=".55" fill="#fff"/>`;
    case 'tree':
      return `<path d="M12 9.6V6.4M14.2 13.4l2.8 1.6M9.8 13.4 7 15" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><path d="${circlePath(12, 12, 3.2)}${circlePath(12, 4.4, 2.4)}${circlePath(18.8, 16, 2.4)}${circlePath(5.2, 16, 2.4)}" ${fill}/>`;
    case 'world':
      return `<circle cx="12" cy="12" r="8.8" ${fill}/><ellipse cx="12" cy="12" rx="3.6" ry="8.8" fill="none" stroke="${ink}" stroke-width="1" opacity=".7"/><path d="M3.2 12h17.6" stroke="${ink}" stroke-width="1" opacity=".7"/><circle cx="8.4" cy="7.6" r="1.4" ${shine}/>`;
  }
}

/** Inline SVG of a coloured emblem. */
export function emblem(name: EmblemName, size = 20, cls = ''): string {
  const id = `em${name}${++uid}`;
  const [top, bot] = TONE[name];
  return (
    `<svg class="bl-em${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>` +
    body(name, id) +
    `</svg>`
  );
}

/** Emoji → emblem, for replacing emoji in copy (CICLO.md uses 💧 📊 🌙 ✨ 📋 🎁 🏆 ⏱ 🌱 🌍). */
export const EMOJI_EMBLEM: Record<string, EmblemName> = {
  '💧': 'essence',
  '📊': 'datos',
  '🌙': 'night',
  '✨': 'spark',
  '📋': 'encargo',
  '🎁': 'gift',
  '🏆': 'record',
  '⏱': 'time',
  '🌱': 'seed',
  '🧬': 'species',
  '🌍': 'world',
};
