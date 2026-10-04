/**
 * Store icons: 24×24 line icons, 1.5 px stroke, currentColor — same drawing rules as src/ui/icons.ts
 * (kept separate so the store does not depend on files other agents are editing).
 */
const P: Record<string, string> = {
  bag: '<path d="M5.5 8.5h13l-1 11a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  hanger: '<path d="M12 8.2V7.6a1.9 1.9 0 1 0-1.9-1.9"/><path d="M12 8.2l8.2 6.6a1.2 1.2 0 0 1-.8 2.2H4.6a1.2 1.2 0 0 1-.8-2.2z"/>',
  palette:
    '<path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7h2a3.9 3.9 0 0 0 3.9-3.9c0-3.6-3.8-6.6-8.5-6.6z"/><circle cx="7.6" cy="11.4" r="1.1"/><circle cx="10.4" cy="7.8" r="1.1"/><circle cx="14.6" cy="7.8" r="1.1"/>',
  dish: '<ellipse cx="12" cy="12" rx="8.6" ry="8.6"/><ellipse cx="12" cy="12" rx="6.2" ry="6.2"/><circle cx="10.6" cy="11" r="1.6"/><circle cx="14.2" cy="13.8" r=".9"/>',
  sparkle: '<path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z"/><path d="M18.2 15.6c.3 1.6.9 2.2 2.3 2.4-1.4.3-2 .9-2.3 2.4-.3-1.5-.9-2.1-2.3-2.4 1.4-.2 2-.8 2.3-2.4z"/>',
  music: '<path d="M9 17.5V6.2l10-2v11.1"/><circle cx="6.8" cy="17.5" r="2.2"/><circle cx="16.8" cy="15.3" r="2.2"/><path d="M9 9.2l10-2"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.6a7.2 7.2 0 0 1 14.4 0"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2c0 5-7 9.4-7 9.4z"/>',
  check: '<path d="M5.5 12.5l4 4 9-9"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  back: '<path d="M14.5 6.5L9 12l5.5 5.5"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.2v2"/>',
  play: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l9.6-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  restore: '<path d="M4.8 12a7.2 7.2 0 1 0 2.1-5.1"/><path d="M4.5 4.8v3.7h3.7"/>',
  shield: '<path d="M12 3.8l7 2.7v5.3c0 4.2-2.9 7.2-7 8.4-4.1-1.2-7-4.2-7-8.4V6.5z"/><path d="M9 12l2.2 2.2L15.3 10"/>',
  clock: '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.5V12l3 2"/>',
  journal: '<path d="M6.5 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13.5H8a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M6.5 18a1.5 1.5 0 0 1 1.5-1.5h10"/><path d="M10 8.5h5M10 11.5h3.5"/>',
  name: '<path d="M4.5 18.5l4.6-13h1.8l4.6 13"/><path d="M6.6 13.5h7"/><path d="M17 9.5v9"/><path d="M15.2 9.5h3.6"/>',
  crown: '<path d="M4.5 17.5l-1-9 5 3.6L12 5.5l3.5 6.6 5-3.6-1 9z"/><path d="M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  external: '<path d="M13.5 5.5h5v5"/><path d="M18.5 5.5l-7 7"/><path d="M16.5 13.5v4a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V9.5A1.5 1.5 0 0 1 7 8h4"/>',
  halo: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 2.6"/>',
  seed: '<circle cx="12" cy="13.2" r="5.3"/><path d="M12 7.9c0-2.4 1.6-3.9 4.1-4.4"/><circle cx="12" cy="13.2" r="1.6"/>',
  gift: '<rect x="4.5" y="9" width="15" height="10.5" rx="1.5"/><path d="M3.8 9h16.4M12 9v10.5"/><path d="M12 9c-1.8-3.8-5.6-3.6-5.2-1.4.3 1.4 3 1.4 5.2 1.4zM12 9c1.8-3.8 5.6-3.6 5.2-1.4-.3 1.4-3 1.4-5.2 1.4z"/>',
  trophy:
    '<path d="M8 4.5h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 6.2H5.2a2.6 2.6 0 0 0 2.9 3.6M16 6.2h2.8a2.6 2.6 0 0 1-2.9 3.6"/><path d="M12 13v3.5M8.5 19.5h7M9.5 19.5l.5-3h4l.5 3"/>',
};

export function sicon(name: string, size = 24, extraAttrs = ''): string {
  return `<svg class="bst-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extraAttrs}>${P[name] ?? ''}</svg>`;
}

/** An inline SVG from raw inner markup (catalog badge glyphs). */
export function svgInner(inner: string, size = 24): string {
  return `<svg class="bst-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
