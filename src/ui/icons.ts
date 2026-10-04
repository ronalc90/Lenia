/**
 * Bioluma icon set: 24×24 line icons, 1.5 px stroke, single colour (currentColor).
 * Drawn by hand for this game (doc §14: no external icon libraries).
 */

function gearPath(): string {
  // 8 rounded teeth between radius 7 and 9.3, centered at 12,12.
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const seq: [number, number][] = [
      [a0 - step * 0.5, 7.1],
      [a0 - step * 0.22, 7.1],
      [a0 - step * 0.14, 9.3],
      [a0 + step * 0.14, 9.3],
      [a0 + step * 0.22, 7.1],
    ];
    for (const [a, r] of seq) pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `<path d="M${pts.join(' L')} Z"/><circle cx="12" cy="12" r="3"/>`;
}

const P: Record<string, string> = {
  essence:
    '<path d="M12 3.2c3.4 4.1 5.8 7.4 5.8 10.5a5.8 5.8 0 0 1-11.6 0c0-3.1 2.4-6.4 5.8-10.5z"/><path d="M9.4 14.3a2.7 2.7 0 0 0 2.3 2.7"/>',
  samples:
    '<path d="M8.5 3.5h7"/><path d="M9.7 3.5v12.8a2.3 2.3 0 0 0 4.6 0V3.5"/><path d="M9.7 11.2h4.6"/>',
  genome:
    '<path d="M8 3c0 4.6 8 4.4 8 9s-8 4.4-8 9"/><path d="M16 3c0 4.6-8 4.4-8 9s8 4.4 8 9"/><path d="M9.2 5h5.6M9.2 19h5.6M8.7 10.6h6.6M8.7 13.4h6.6"/>',
  journal:
    '<path d="M4.5 5.7c2.6-1.1 5-1 7.5.5v13c-2.5-1.5-4.9-1.6-7.5-.5z"/><path d="M19.5 5.7c-2.6-1.1-5-1-7.5.5v13c2.5-1.5 4.9-1.6 7.5-.5z"/>',
  settings: gearPath(),
  sound:
    '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15 9.3a3.6 3.6 0 0 1 0 5.4"/><path d="M17.6 6.8a7.2 7.2 0 0 1 0 10.4"/>',
  mute: '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  pause: '<rect x="7" y="5.5" width="3.4" height="13" rx="1"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1"/>',
  play: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l9.6-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6z"/>',
  speed: '<path d="M4 7v10l7-5zM12.5 7v10l7-5z"/>',
  eraser:
    '<path d="M14.3 4.6l5.1 5.1-8.8 8.8H6.2l-2-2a1.5 1.5 0 0 1 0-2.1z"/><path d="M9.2 9.7l5.1 5.1M11 18.5h8.5"/>',
  lab: '<path d="M9.5 3.5h5M10.5 3.5v5.3l-5 8.8a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3l-5-8.8V3.5"/><path d="M7.6 14.5h8.8"/>',
  bestiary:
    '<circle cx="12" cy="12" r="8.3"/><path d="M8.6 13.2a3.6 3.6 0 1 1 4.6 3.4"/><circle cx="12.4" cy="12.4" r="1.2"/><path d="M15.6 8.4l.01 0M7.4 9.1l.01 0"/>',
  calibrate:
    '<path d="M4.5 7h8M17.5 7h2M4.5 12h2M11.5 12h8M4.5 17h10M18.5 17h1"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="16.5" cy="17" r="2.2"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.2v2"/>',
  check: '<path d="M5.5 12.5l4 4 9-9"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  print:
    '<path d="M9.2 13.5V10a2.8 2.8 0 1 1 5.6 0v3.5"/><rect x="5" y="13.5" width="14" height="4" rx="1.2"/><path d="M6.5 20.5h11"/>',
  pencil: '<path d="M15.2 5.3l3.5 3.5-9.6 9.6-4.4.9.9-4.4z"/><path d="M13.2 7.3l3.5 3.5"/>',
  follow:
    '<circle cx="12" cy="12" r="6.3"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21"/><circle cx="12" cy="12" r="1.3"/>',
  trophy:
    '<path d="M8 4.5h8v5.2a4 4 0 0 1-8 0z"/><path d="M8 6.5H5.5a2.6 2.6 0 0 0 2.8 3.7M16 6.5h2.5a2.6 2.6 0 0 1-2.8 3.7"/><path d="M12 13.7v3M8.5 19.5h7M10 16.7h4"/>',
  moon: '<path d="M18.8 14.6A7.3 7.3 0 0 1 9.4 5.2a7.6 7.6 0 1 0 9.4 9.4z"/><path d="M16.5 4.5v2.5M15.2 5.8h2.6"/>',
  sparkle:
    '<path d="M11 3.5l1.7 5 5 1.7-5 1.7L11 17l-1.7-5.1-5-1.7 5-1.7z"/><path d="M18 15v4.5M15.8 17.2h4.5"/>',
  warning: '<path d="M12 4.2l8.7 15H3.3z"/><path d="M12 10v4.3M12 16.9v.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  chevronUp: '<path d="M6.5 14.5l5.5-5.5 5.5 5.5"/>',
  chevronDown: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
  chevronRight: '<path d="M9.5 6.5l5.5 5.5-5.5 5.5"/>',
  trash: '<path d="M5 7h14M9.5 7V4.8h5V7M6.8 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h5.6a1.5 1.5 0 0 0 1.5-1.3L17.2 7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14"/>',
  camera:
    '<path d="M4.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2.2l1.5-2h4.6l1.5 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.8" r="3.3"/>',
  target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2"/>',
  rebirth:
    '<path d="M19.2 12.5a7.2 7.2 0 1 1-2.2-5.7"/><path d="M19.2 4.5v4h-4"/><circle cx="12" cy="12.5" r="1.8"/>',
  seed: '<circle cx="12" cy="13.2" r="5.3"/><path d="M12 7.9c0-2.4 1.6-3.9 4.1-4.4"/><circle cx="12" cy="13.2" r="1.6"/>',
  stats: '<path d="M5 19.5h14"/><path d="M7.5 16.5v-4M12 16.5V7M16.5 16.5v-7"/>',
  globe:
    '<circle cx="12" cy="12" r="8.3"/><path d="M3.7 12h16.6M12 3.7c2.4 2.4 3.4 5.2 3.4 8.3s-1 5.9-3.4 8.3c-2.4-2.4-3.4-5.2-3.4-8.3s1-5.9 3.4-8.3z"/>',
  vibrate:
    '<rect x="8" y="4.5" width="8" height="15" rx="2"/><path d="M5 9v6M19 9v6M2.8 10.5v3M21.2 10.5v3"/>',
  motion: '<path d="M3.5 12c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0 2.4-2.6 3.8-2.6"/><path d="M3.5 17h5M15.5 7h5"/>',
  hand: '<path d="M9 11.5V5.8a1.5 1.5 0 0 1 3 0v4.7M12 10V4.8a1.5 1.5 0 0 1 3 0V11M15 7.8a1.5 1.5 0 0 1 3 0v6.2a6 6 0 0 1-6 6h-.6a5.4 5.4 0 0 1-4.2-2L4.6 14.8a1.5 1.5 0 0 1 2.3-1.9L9 15"/>',
  layers: '<path d="M12 4.5l8 4-8 4-8-4z"/><path d="M4 12.5l8 4 8-4M4 16.5l8 4 8-4"/>',
  shield: '<path d="M12 3.8l7 2.7v5.3c0 4.2-2.9 7.2-7 8.4-4.1-1.2-7-4.2-7-8.4V6.5z"/><path d="M9 12l2.2 2.2L15.3 10"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2c0 5-7 9.4-7 9.4z"/>',
  contrast: '<circle cx="12" cy="12" r="8.3"/><path d="M12 3.7v16.6a8.3 8.3 0 0 0 0-16.6z" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 3.5l-7 10h5.5l-1 7 7-10H12z"/>',
  // Behaviour glyphs (also used for markers on the dish)
  still: '<circle cx="12" cy="12" r="5"/>',
  pulsing: '<circle cx="12" cy="12" r="3.3"/><circle cx="12" cy="12" r="7.6"/>',
  swimmer: '<path d="M4.5 12h13M13 7.2l5 4.8-5 4.8"/>',
  spinner: '<path d="M12 11.2a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0"/>',
  divider: '<circle cx="7.8" cy="12" r="3.3"/><circle cx="16.2" cy="12" r="3.3"/>',
  colony: '<circle cx="12" cy="7.6" r="3"/><circle cx="7.4" cy="15.6" r="3"/><circle cx="16.6" cy="15.6" r="3"/>',
  unknown: '<path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.6M12 17v.2"/>',
};

export type IconName = keyof typeof P;

/** SVG markup for an icon. */
export function icon(name: string, size = 24, extraClass = ''): string {
  const body = P[name] ?? P.unknown;
  return `<svg class="ic ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

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
