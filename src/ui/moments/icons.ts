/**
 * Inline SVG icons of the Momentos cards, chips and the seed-price sheet
 * (24×24, stroke = currentColor, so CSS colours them per theme).
 */
import type { Behavior } from '../../core/types';
import type { ChipIcon, MomentIcon } from '../../moments/types';

const P: Record<MomentIcon | NonNullable<ChipIcon> | 'creatures' | 'info' | 'big' | 'close' | 'pause' | Behavior, string> = {
  drop: '<path d="M12 3c3.5 4.6 6 7.9 6 11a6 6 0 0 1-12 0c0-3.1 2.5-6.4 6-11z"/>',
  fade: '<circle cx="12" cy="12" r="7" stroke-dasharray="2.5 3"/><path d="M9 12h6" />',
  burst:
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M5 19l2.8-2.8M16.2 7.8 19 5"/><circle cx="12" cy="12" r="3.2"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  essence: '<path d="M12 3c3.2 4.2 5.5 7.2 5.5 10.1a5.5 5.5 0 0 1-11 0C6.5 10.2 8.8 7.2 12 3z"/><path d="M9.6 14.2a2.6 2.6 0 0 0 2.4 2.3"/>',
  book: '<path d="M12 6c-2-1.4-4.8-1.8-8-1.2v13c3.2-.6 6-.2 8 1.2 2-1.4 4.8-1.8 8-1.2v-13c-3.2-.6-6-.2-8 1.2z"/><path d="M12 6v13"/>',
  behavior: '<circle cx="12" cy="12" r="3"/><path d="M12 4a8 8 0 0 1 8 8M12 20a8 8 0 0 1-8-8"/><path d="m18 9 2 3 2.4-2.4M6 15l-2-3-2.4 2.4"/>',
  split: '<circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M12 5v14" stroke-dasharray="2 2"/>',
  spark: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/>',
  upgrade: '<path d="M10 3v5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-10V3"/><path d="M8.5 3h7M12 17v-5m-2.5 2.5L12 12l2.5 2.5"/>',
  robot: '<rect x="5" y="7" width="14" height="10" rx="3"/><circle cx="9.5" cy="12" r="1.2"/><circle cx="14.5" cy="12" r="1.2"/><path d="M12 7V4M12 17v3m-2 0h4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.6"/>',
  genome: '<path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9M9 7h6M9 17h6"/>',
  moon: '<path d="M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5z"/>',
  sample: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  down: '<path d="M12 5v14m6-6-6 6-6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/>',
  slot: '<circle cx="6" cy="12" r="2.6"/><circle cx="12" cy="12" r="2.6"/><circle cx="18" cy="12" r="2.6" stroke-dasharray="2 1.6"/>',
  creatures: '<circle cx="8" cy="10" r="3.4"/><circle cx="16" cy="10" r="3.4"/><circle cx="12" cy="16.5" r="3.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
  big: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" />',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  still: '<circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  pulsing: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 2"/>',
  swimmer: '<path d="M4 12h11m-4-5 5 5-5 5"/><circle cx="18.5" cy="12" r="2"/>',
  spinner: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M18 3v4h-4"/>',
  divider: '<circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/>',
  colony: '<circle cx="12" cy="7.5" r="3.2"/><circle cx="7" cy="15.5" r="3.2"/><circle cx="17" cy="15.5" r="3.2"/>',
};

export type MoIconName = keyof typeof P;

/** SVG markup for an icon (stroke icon, currentColor). */
export function moIcon(name: MoIconName, size = 20, cls = ''): string {
  return `<svg class="mo-ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}
