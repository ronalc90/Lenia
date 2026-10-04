/**
 * Bioluma icon set: the art direction's single system (src/ui/art/icons.ts, docs/ARTE.md §5): 24-grid line
 * icons, one 1.75 stroke, duotone fill, currentColor. Same signature and class (`ic`, plus `bl-ic`).
 */
export { icon } from './art/icons';

/** Game logo: a round dish holding a stylised Orbium. */
export function logo(size = 64): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="lgBody" cx="40%" cy="42%" r="60%">
      <stop offset="0" stop-color="#fff6e6"/>
      <stop offset=".35" stop-color="#7fe0ff"/>
      <stop offset=".75" stop-color="#2e1e78" stop-opacity=".9"/>
      <stop offset="1" stop-color="#181448" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="29" fill="#0B0E12" stroke="#5BC0EB" stroke-opacity=".55" stroke-width="2"/>
  <circle cx="32" cy="32" r="24.5" fill="none" stroke="#5BC0EB" stroke-opacity=".15" stroke-width="1"/>
  <circle cx="30" cy="31" r="14" fill="url(#lgBody)"/>
  <path d="M38.5 22.5c4.5 3.2 6 9.6 2.6 14.6" fill="none" stroke="#5BC0EB" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
  <circle cx="28" cy="29" r="3.2" fill="#fff" opacity=".85"/>
</svg>`;
}
