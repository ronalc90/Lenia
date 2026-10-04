/**
 * Designed empty / locked states for the panel: a small hand-drawn SVG illustration, a title and one
 * line. Used so the panel never shows a blank or missing area before a feature unlocks (no pop-in).
 */
import { h } from './dom';

export type EmptyArt = 'dish' | 'lock' | 'bestiary' | 'calibrate' | 'genome';

/** Inline illustrations (currentColor + the accent), 96×96, no external assets. */
const ART: Record<EmptyArt, string> = {
  dish: `<circle cx="48" cy="50" r="34" class="e-glass"/><circle cx="48" cy="50" r="27" class="e-agar"/>
    <path class="e-life" d="M40 46c2-6 10-8 14-3 3 4 1 10-4 12-6 2-12-2-10-9z"/>
    <circle class="e-spore" cx="62" cy="60" r="2.6"/><circle class="e-spore" cx="34" cy="60" r="1.8"/><circle class="e-spore" cx="58" cy="36" r="1.5"/>
    <path class="e-drop" d="M48 8c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/>`,
  lock: `<circle cx="48" cy="50" r="34" class="e-glass"/><rect x="34" y="46" width="28" height="22" rx="5" class="e-lock"/>
    <path class="e-lock-arc" d="M39 46v-6a9 9 0 0 1 18 0v6"/><circle cx="48" cy="57" r="2.6" class="e-spore"/>`,
  bestiary: `<rect x="20" y="22" width="56" height="58" rx="8" class="e-glass"/><circle cx="38" cy="42" r="8" class="e-life"/>
    <circle cx="60" cy="42" r="8" class="e-agar"/><circle cx="38" cy="64" r="8" class="e-agar"/><circle cx="60" cy="64" r="8" class="e-agar"/>
    <rect x="34" y="72" width="28" height="18" rx="5" class="e-lock"/>`,
  calibrate: `<circle cx="48" cy="50" r="34" class="e-glass"/><path class="e-life" d="M24 60c8-20 16-20 24 0s16 20 24 0"/>
    <rect x="34" y="70" width="28" height="18" rx="5" class="e-lock"/>`,
  genome: `<circle cx="48" cy="50" r="34" class="e-glass"/><path class="e-life" d="M36 26c24 12-24 36 0 48M60 26c-24 12 24 36 0 48"/>
    <rect x="34" y="70" width="28" height="18" rx="5" class="e-lock"/>`,
};

export function emptyState(art: EmptyArt, title: string, text: string, hint?: string): HTMLElement {
  return h(
    'div',
    { class: `empty-state es-${art}`, role: 'note' },
    h('div', {
      class: 'es-art',
      html: `<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">${ART[art]}</svg>`,
    }),
    h('div', { class: 'es-title' }, title),
    h('p', { class: 'es-text' }, text),
    hint ? h('p', { class: 'es-hint' }, hint) : null,
  );
}
