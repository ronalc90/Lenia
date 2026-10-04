/**
 * Line glyphs for secrets (48×48, stroked, single colour = currentColor). Every element carries
 * pathLength="1" so the reveal can "draw" it with stroke-dashoffset. No external assets.
 */
import type { GlyphId } from '../../secrets/types';

const TAU = Math.PI * 2;

function poly(pts: [number, number][]): string {
  return `<polyline points="${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}"/>`;
}

function spiral(): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    const a = u * 2.6 * TAU;
    pts.push([24 + u * 16 * Math.cos(a), 24 + u * 16 * Math.sin(a)]);
  }
  return poly(pts);
}

function lemniscate(): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * TAU;
    const d = 1 + Math.sin(t) ** 2;
    pts.push([24 + (18 * Math.cos(t)) / d, 24 + (18 * Math.sin(t) * Math.cos(t)) / d]);
  }
  return poly(pts);
}

function star4(cx: number, cy: number, r: number): string {
  const k = r * 0.28;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z"/>`;
}

function heptagon(): string {
  const pts: [number, number][] = [];
  let dots = '';
  for (let i = 0; i <= 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * TAU;
    const p: [number, number] = [24 + 15 * Math.cos(a), 24 + 15 * Math.sin(a)];
    pts.push(p);
    if (i < 7) dots += `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="2.4"/>`;
  }
  return poly(pts) + dots;
}

const G: Record<GlyphId, string> = {
  orb: '<circle cx="22" cy="24" r="10"/><circle cx="19" cy="21" r="3"/><path d="M32 24 C37 24 40 21 42 18"/>',
  flame:
    '<path d="M24 6 C31 14 35 20 35 28 A11 11 0 0 1 13 28 C13 21 18 18 19 12 C21 16 23 17 24 17 C26 14 26 10 24 6Z"/><path d="M24 40 A5 5 0 0 1 19 35 C19 31 22 29 24 25 C26 29 29 31 29 35 A5 5 0 0 1 24 40Z"/>',
  ghost:
    '<path d="M13 39 V22 A11 11 0 0 1 35 22 V39 L31 35 L27 39 L24 35.5 L21 39 L17 35 Z"/><circle cx="20" cy="23" r="2"/><circle cx="28" cy="23" r="2"/>',
  eye: '<path d="M5 24 Q24 6 43 24 Q24 42 5 24Z"/><circle cx="24" cy="24" r="7"/><path d="M24 18.5 Q26 24 24 29.5 Q22 24 24 18.5Z"/>',
  heartGlyph: '<path d="M24 39 C12 30 7 24 7 17.5 A8.5 8.5 0 0 1 24 13.5 A8.5 8.5 0 0 1 41 17.5 C41 24 36 30 24 39Z"/>',
  spiralGlyph: spiral(),
  circleGlyph:
    '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="3.2"/><path d="M24 4 V7 M24 41 V44 M4 24 H7 M41 24 H44"/>',
  infinityGlyph: lemniscate(),
  gliderGlyph:
    '<rect x="19" y="7" width="9" height="9" rx="1.5"/><rect x="30" y="18" width="9" height="9" rx="1.5"/><rect x="8" y="29" width="9" height="9" rx="1.5"/><rect x="19" y="29" width="9" height="9" rx="1.5"/><rect x="30" y="29" width="9" height="9" rx="1.5"/>',
  arrows: '<path d="M19 6 H29 V19 H42 V29 H29 V42 H19 V29 H6 V19 H19 Z"/><path d="M24 10 L21 14 H27Z M24 38 L21 34 H27Z M10 24 L14 21 V27Z M38 24 L34 21 V27Z"/>',
  taps: '<circle cx="24" cy="24" r="3.5"/><path d="M15 15 A12.7 12.7 0 0 0 15 33 M33 15 A12.7 12.7 0 0 1 33 33"/><path d="M9 9 A21 21 0 0 0 9 39 M39 9 A21 21 0 0 1 39 39"/>',
  hold: '<circle cx="24" cy="24" r="6"/><path d="M24 9 A15 15 0 1 1 9 24"/><path d="M9 24 A15 15 0 0 1 15 12"/>',
  wave: '<path d="M5 16 Q10 10 15 16 T25 16 T35 16 T45 16"/><path d="M5 24 Q10 18 15 24 T25 24 T35 24 T45 24"/><path d="M5 32 Q10 26 15 32 T25 32 T35 32 T45 32"/>',
  hourglass: '<path d="M13 7 H35 M13 41 H35"/><path d="M16 7 C16 17 32 19 32 24 C32 29 16 31 16 41 M32 7 C32 17 16 19 16 24 C16 29 32 31 32 41"/><path d="M20 38 Q24 33 28 38"/>',
  seven: heptagon(),
  void: '<circle cx="24" cy="24" r="16" stroke-dasharray="0.04 0.035"/><circle cx="24" cy="24" r="1.4"/>',
  flask: '<path d="M19 6 H29 M21 6 V18 L10 37 A3 3 0 0 0 12.6 41.5 H35.4 A3 3 0 0 0 38 37 L27 18 V6"/><path d="M15 31 H33"/>',
  mirror: '<path d="M24 5 V43" stroke-dasharray="0.05 0.04"/><path d="M20 12 Q9 24 20 36"/><path d="M28 12 Q39 24 28 36"/><circle cx="14" cy="24" r="2"/><circle cx="34" cy="24" r="2"/>',
  pause: '<circle cx="24" cy="24" r="17"/><path d="M19 16 V32 M29 16 V32"/>',
  moon: '<circle cx="24" cy="24" r="15"/><circle cx="19" cy="19" r="3"/><circle cx="29" cy="28" r="4"/><circle cx="21" cy="31" r="1.8"/>',
  cake: '<path d="M10 26 H38 V40 H10 Z"/><path d="M10 31 Q14 34 17.5 31 T24 31 T31 31 T38 31"/><path d="M24 26 V17"/><path d="M24 9 C26.5 12 26.5 14.5 24 15.5 C21.5 14.5 21.5 12 24 9Z"/>',
  aurora: '<path d="M5 14 Q14 6 24 13 T43 11"/><path d="M5 22 Q15 14 25 21 T43 19" /><path d="M5 30 Q14 23 24 29 T43 27"/><path d="M8 40 H40"/>',
  belt: `${star4(10, 30, 5)}${star4(24, 24, 5)}${star4(38, 18, 5)}<circle cx="13" cy="9" r="1.2"/><circle cx="36" cy="40" r="1.2"/>`,
  door: '<path d="M14 42 V16 A10 10 0 0 1 34 16 V42 Z"/><circle cx="29" cy="29" r="1.6"/><path d="M8 42 H40 M11 46 H37"/>',
  thanks:
    '<path d="M24 41 C14 36 9 28 10 16"/><path d="M24 41 C34 36 39 28 38 16"/><path d="M12 22 L7 19 M14 29 L9 28 M18 35 L14 36 M36 22 L41 19 M34 29 L39 28 M30 35 L34 36"/><circle cx="24" cy="18" r="4"/>',
  answer:
    '<path d="M9 30 L18 12 V36 M7 30 H21"/><path d="M26 18 A6 6 0 0 1 38 18 C38 24 26 30 26 36 H39"/>',
  burst: '<path d="M24 5 V14 M24 34 V43 M5 24 H14 M34 24 H43 M11 11 L17 17 M31 31 L37 37 M37 11 L31 17 M17 31 L11 37"/><circle cx="24" cy="24" r="5"/>',
  sparks: `${star4(16, 18, 9)}${star4(33, 30, 7)}${star4(34, 12, 4)}`,
  keyhole: '<circle cx="24" cy="24" r="17" stroke-dasharray="0.03 0.03"/><circle cx="24" cy="20" r="4.5"/><path d="M22 24 L20.5 32 H27.5 L26 24"/>',
};

/** SVG markup of a glyph (each element gets class "g" and pathLength 1 for the draw-in). */
export function glyphSVG(id: GlyphId, size = 48, cls = ''): string {
  const inner = (G[id] ?? G.orb).replace(/<(path|circle|rect|polyline|line)\b/g, '<$1 class="g" pathLength="1"');
  return `<svg class="bls-glyph ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Reticle ring around the glyph in the reveal seal. */
export function sealRingSVG(size = 112): string {
  let ticks = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    const r0 = i % 3 === 0 ? 47 : 49;
    ticks += `<line x1="${(56 + r0 * Math.cos(a)).toFixed(2)}" y1="${(56 + r0 * Math.sin(a)).toFixed(2)}" x2="${(56 + 52 * Math.cos(a)).toFixed(2)}" y2="${(56 + 52 * Math.sin(a)).toFixed(2)}"/>`;
  }
  return `<svg class="bls-ring" viewBox="0 0 112 112" width="${size}" height="${size}" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="56" cy="56" r="44" stroke-width="1" opacity=".55"/><circle cx="56" cy="56" r="53.5" stroke-width=".6" opacity=".35" stroke-dasharray="2 5"/><g stroke-width=".9" opacity=".6">${ticks}</g></svg>`;
}
