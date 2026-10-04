/**
 * World card art (docs/ARTE.md §9): one code-drawn backdrop per Mundo, so a child can pick a world
 * by its look before reading a word. Each world has ONE big silhouette idea:
 *
 *   classic  Clásico    calm blue water, three little bell-shaped Orbium gliding, ripples
 *   cold     Frío       frost ferns growing from the corners, snowflakes, one slow ghost creature
 *   gyro     Remolinos  a turquoise whirlpool with creatures riding its arms
 *   shields  Escudos    an amber honeycomb of armour and round shield-creatures
 *   helix    Discos     pink rings, discs and triangles floating like records and tokens
 *   legs     Patas      green ground, little creatures walking on legs, footprints
 *   giants   Gigantes   one enormous violet creature beside a tiny one (scale!)
 *
 * SVG strings (no DOM needed), viewBox 320×200, `preserveAspectRatio="xMidYMid slice"` so the art
 * fills any card. The top-left third stays calm (a scrim) for the card's title. Deterministic: the
 * same id always draws the same picture. Gradient/filter ids get a per-call suffix.
 */
import { oklch, rgbToHex, type RGB } from './color';

export type WorldArtId = 'classic' | 'cold' | 'gyro' | 'shields' | 'helix' | 'legs' | 'giants';
export const WORLD_ART_IDS: readonly WorldArtId[] = ['classic', 'cold', 'gyro', 'shields', 'helix', 'legs', 'giants'];

/** World hue (degrees) — matches src/game/worlds.ts `hue`. */
export const WORLD_HUE: Record<WorldArtId, number> = { classic: 198, cold: 222, gyro: 172, shields: 45, helix: 325, legs: 112, giants: 272 };

export interface WorldColors {
  /** Deep background (top-left). */
  deep: string;
  /** Background toward the motif. */
  mid: string;
  /** Main glow colour of the creatures / motif. */
  glow: string;
  /** Light accent (highlights, frost). */
  light: string;
  /** Card border / selected ring colour (AA on dark surfaces). */
  ring: string;
}

const hex = (c: RGB): string => rgbToHex(c);

/** The world's colour set, derived in OKLCH so every world has the same lightness steps. */
export function worldColors(id: WorldArtId): WorldColors {
  const h = WORLD_HUE[id];
  // Amber carries more chroma at the same lightness; tame it. Low-lightness greens turn olive, so
  // the dark tones of Patas lean towards emerald.
  const c = id === 'shields' ? 0.8 : 1;
  const hd = id === 'legs' ? h + 30 : h;
  return {
    deep: hex(oklch(0.17, 0.035 * c, hd)),
    mid: hex(oklch(0.27, 0.07 * c, hd)),
    glow: hex(oklch(0.8, 0.14 * c, hd === h ? h : h + 18)),
    light: hex(oklch(0.94, 0.06 * c, h)),
    ring: hex(oklch(0.78, 0.13 * c, hd === h ? h : h + 18)),
  };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (v: number): string => (Math.round(v * 10) / 10).toString();
let uidCounter = 0;

/** A little bell-shaped creature (the Orbium silhouette of the icon set), centred at 0,0, ~16 wide. */
const BELL = 'M-8 3a8 8 0 0 1 16 0c-1.8 3-4.8 4.2-8 4.2S-6.2 6-8 3z';

function stars(r: () => number, n: number, color: string, area: [number, number, number, number]): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = area[0] + r() * area[2];
    const y = area[1] + r() * area[3];
    const s = 0.5 + r() * 1.3;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${color}" opacity="${f(0.25 + r() * 0.6)}"/>`;
  }
  return out;
}

function bell(x: number, y: number, s: number, rot: number, fill: string, core: string, eye = true): string {
  return (
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})">` +
    `<path d="${BELL}" fill="${fill}"/>` +
    (eye ? `<ellipse cx="-2.9" cy="1.6" rx="1.3" ry="2.1" fill="${core}" opacity=".55"/><ellipse cx="2.9" cy="1.6" rx="1.3" ry="2.1" fill="${core}" opacity=".55"/>` : '') +
    `<ellipse cx="0" cy="3" rx="1.4" ry="2.6" fill="#fff" opacity=".9"/></g>`
  );
}

type Painter = (k: { c: WorldColors; u: string; r: () => number }) => string;

const PAINT: Record<WorldArtId, Painter> = {
  classic: ({ c, u, r }) => {
    let s = '';
    for (let i = 0; i < 6; i++) s += `<circle cx="236" cy="128" r="${18 + i * 22}" fill="none" stroke="${c.glow}" stroke-opacity="${f(0.22 - i * 0.03)}" stroke-width="1.2"/>`;
    s += stars(r, 26, c.light, [120, 10, 200, 190]);
    s += `<g filter="url(#b${u})" opacity=".85">${bell(236, 128, 3.2, -18, c.glow, c.deep, false)}${bell(150, 162, 1.8, 12, c.glow, c.deep, false)}${bell(286, 52, 1.5, -40, c.glow, c.deep, false)}</g>`;
    s += bell(236, 128, 3.2, -18, c.glow, c.deep) + bell(150, 162, 1.8, 12, c.glow, c.deep) + bell(286, 52, 1.5, -40, c.glow, c.deep);
    // Wakes behind the swimmers.
    s += `<path d="M196 152c-14 8-30 12-46 10" fill="none" stroke="${c.light}" stroke-opacity=".35" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 6"/>`;
    return s;
  },
  cold: ({ c, u, r }) => {
    // Frost ferns: recursive branches from the bottom-right and top-right corners.
    const fern = (x: number, y: number, ang: number, len: number, depth: number): string => {
      if (depth === 0 || len < 4) return '';
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      let out = `<path d="M${f(x)} ${f(y)}L${f(x2)} ${f(y2)}"/>`;
      const steps = 3;
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        const bx = x + (x2 - x) * t;
        const by = y + (y2 - y) * t;
        out += fern(bx, by, ang - 1.05, len * 0.42, depth - 1) + fern(bx, by, ang + 1.05, len * 0.42, depth - 1);
      }
      return out + fern(x2, y2, ang + (r() - 0.5) * 0.3, len * 0.6, depth - 1);
    };
    let s = `<g stroke="${c.light}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".75">${fern(330, 210, -2.35, 70, 3)}${fern(330, -6, 2.4, 52, 3)}${fern(200, 214, -1.75, 40, 3)}</g>`;
    s += `<g stroke="${c.glow}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".25" filter="url(#b${u})">${fern(330, 210, -2.35, 70, 2)}</g>`;
    // Snowflakes.
    for (let i = 0; i < 9; i++) {
      const x = 175 + r() * 135;
      const y = 15 + r() * 170;
      const sz = 2 + r() * 4;
      let d = '';
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        d += `M${f(x - Math.cos(a) * sz)} ${f(y - Math.sin(a) * sz)}L${f(x + Math.cos(a) * sz)} ${f(y + Math.sin(a) * sz)}`;
      }
      s += `<path d="${d}" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="${f(0.4 + r() * 0.5)}"/>`;
    }
    s += `<g opacity=".5">${bell(206, 112, 2.4, 10, c.glow, c.deep)}</g>`;
    return s;
  },
  gyro: ({ c, u }) => {
    const cx = 236;
    const cy = 112;
    let arms = '';
    for (let k = 0; k < 4; k++) {
      let d = '';
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = k * (Math.PI / 2) + t * 4.4;
        const rr = 6 + t * 120;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.78;
        d += (i ? 'L' : 'M') + f(x) + ' ' + f(y);
      }
      arms += `<path d="${d}"/>`;
    }
    let s = `<g fill="none" stroke="${c.glow}" stroke-width="7" opacity=".22" filter="url(#b${u})">${arms}</g>`;
    s += `<g fill="none" stroke="${c.light}" stroke-width="1.6" stroke-linecap="round" opacity=".7">${arms}</g>`;
    s += `<circle cx="${cx}" cy="${cy}" r="10" fill="${c.light}" opacity=".85" filter="url(#b${u})"/>`;
    // Creatures riding the arms (spinning discs).
    for (const [a, rr, sc] of [
      [1.2, 52, 1.5],
      [3.6, 84, 1.9],
      [5.3, 40, 1.2],
    ] as const) {
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.78;
      s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f((a * 180) / Math.PI + 90)}) scale(${sc})"><circle r="7" fill="${c.glow}"/><path d="M-4 -1a5 5 0 0 1 8 0" stroke="${c.deep}" stroke-width="2" fill="none" stroke-linecap="round"/><circle r="2" cy="2" fill="#fff"/></g>`;
    }
    return s;
  },
  shields: ({ c, u }) => {
    // Honeycomb armour.
    let hex6 = '';
    const R6 = 15;
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 12; col++) {
        const x = 100 + col * R6 * 1.74 + (row % 2) * R6 * 0.87;
        const y = row * R6 * 1.5 - 6;
        let d = '';
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          d += (k ? 'L' : 'M') + f(x + Math.cos(a) * (R6 - 1.5)) + ' ' + f(y + Math.sin(a) * (R6 - 1.5));
        }
        const dist = Math.hypot(x - 240, y - 110) / 140;
        hex6 += `<path d="${d}Z" opacity="${f(Math.max(0.05, 0.42 - dist * 0.36))}"/>`;
      }
    let s = `<g fill="none" stroke="${c.glow}" stroke-width="1.2">${hex6}</g>`;
    // Shield creatures: solid discs with a thick rim and a bright core.
    for (const [x, y, rr] of [
      [238, 112, 30],
      [292, 168, 16],
      [170, 160, 12],
    ] as const) {
      s += `<circle cx="${x}" cy="${y}" r="${rr * 1.3}" fill="${c.glow}" opacity=".35" filter="url(#b${u})"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c.mid}" stroke="${c.glow}" stroke-width="${f(rr * 0.22)}"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${f(rr * 0.42)}" fill="${c.light}"/>`;
      s += `<path d="M${f(x - rr * 0.55)} ${f(y - rr * 0.35)}a${f(rr * 0.7)} ${f(rr * 0.7)} 0 0 1 ${f(rr * 0.6)} -${f(rr * 0.35)}" stroke="#fff" stroke-opacity=".7" stroke-width="${f(rr * 0.1)}" fill="none" stroke-linecap="round"/>`;
    }
    return s;
  },
  helix: ({ c, u, r }) => {
    let s = '';
    // A big record-like ring set.
    for (let i = 0; i < 7; i++) s += `<circle cx="246" cy="104" r="${30 + i * 9}" fill="none" stroke="${c.glow}" stroke-opacity="${f(0.5 - i * 0.06)}" stroke-width="${i === 0 ? 3 : 1.2}"/>`;
    s += `<circle cx="246" cy="104" r="26" fill="${c.glow}" opacity=".4" filter="url(#b${u})"/>`;
    s += `<circle cx="246" cy="104" r="14" fill="${c.light}"/><circle cx="246" cy="104" r="4" fill="${c.deep}"/>`;
    // Floating discs, rings and triangles (Discutium, Circium, Triscutium).
    const tri = (x: number, y: number, sz: number, rot: number) =>
      `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" d="M0 ${f(-sz)}L${f(sz * 0.87)} ${f(sz * 0.5)}L${f(-sz * 0.87)} ${f(sz * 0.5)}Z" fill="${c.glow}" stroke="${c.light}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<circle cx="150" cy="150" r="13" fill="${c.glow}"/><circle cx="150" cy="150" r="5" fill="${c.light}"/>`;
    s += `<circle cx="304" cy="176" r="11" fill="none" stroke="${c.light}" stroke-width="4"/>`;
    s += tri(176, 64, 13, 14) + tri(296, 30, 9, -20);
    s += stars(r, 18, c.light, [120, 10, 200, 180]);
    return s;
  },
  legs: ({ c, u }) => {
    let s = `<path d="M0 170C70 158 140 160 200 166S290 176 320 168V200H0Z" fill="${c.mid}"/>`;
    s += `<path d="M0 170C70 158 140 160 200 166S290 176 320 168" fill="none" stroke="${c.glow}" stroke-opacity=".6" stroke-width="1.5"/>`;
    // Footprint trail.
    for (let i = 0; i < 8; i++) s += `<ellipse cx="${f(120 + i * 16)}" cy="${f(176 + (i % 2) * 6)}" rx="3" ry="1.6" fill="${c.light}" opacity="${f(0.15 + i * 0.06)}"/>`;
    const walker = (x: number, y: number, sc: number, step: number) =>
      `<g transform="translate(${f(x)} ${f(y)}) scale(${sc})">` +
      `<ellipse cx="0" cy="0" rx="14" ry="10" fill="${c.glow}" opacity=".45" filter="url(#b${u})"/>` +
      `<g stroke="${c.light}" stroke-width="2.4" stroke-linecap="round"><path d="M-9 6l${f(-4 + step)} 11M-3 9l${f(-1 - step)} 10M3 9l${f(1 + step)} 10M9 6l${f(4 - step)} 11"/></g>` +
      `<ellipse cx="0" cy="0" rx="13" ry="9.5" fill="${c.glow}"/>` +
      `<circle cx="-4" cy="-1.5" r="2.2" fill="${c.deep}"/><circle cx="4" cy="-1.5" r="2.2" fill="${c.deep}"/>` +
      `<circle cx="-3.4" cy="-2.2" r=".8" fill="#fff"/><circle cx="4.6" cy="-2.2" r=".8" fill="#fff"/></g>`;
    s += walker(252, 128, 2.2, 2) + walker(176, 140, 1.3, -2);
    return s;
  },
  giants: ({ c, u, r }) => {
    let s = stars(r, 30, c.light, [100, 0, 220, 200]);
    // One enormous creature: triple-ring body (Hydrogeminium's kernel hint), half out of frame.
    s += `<circle cx="268" cy="130" r="98" fill="${c.glow}" opacity=".28" filter="url(#b${u})"/>`;
    s += `<circle cx="268" cy="130" r="82" fill="${c.mid}" stroke="${c.glow}" stroke-width="5"/>`;
    s += `<circle cx="268" cy="130" r="58" fill="none" stroke="${c.glow}" stroke-opacity=".6" stroke-width="3"/>`;
    s += `<circle cx="268" cy="130" r="34" fill="none" stroke="${c.light}" stroke-opacity=".7" stroke-width="2.5"/>`;
    s += `<ellipse cx="252" cy="124" rx="13" ry="18" fill="${c.light}"/>`;
    s += `<ellipse cx="284" cy="138" rx="9" ry="12" fill="${c.light}" opacity=".8"/>`;
    // …beside a tiny one, for scale.
    s += `<circle cx="134" cy="170" r="16" fill="${c.glow}" opacity=".45" filter="url(#b${u})"/>`;
    s += `<g transform="translate(134 166)">${bell(0, 0, 1.5, 0, c.light, c.deep)}</g>`;
    s += `<path d="M150 154q16-22 40-26" fill="none" stroke="${c.light}" stroke-opacity=".55" stroke-dasharray="2 4" stroke-linecap="round"/>`;
    return s;
  },
};

export interface WorldArtOptions {
  /** Extra class on the <svg>. */
  cls?: string;
  /** Not open yet: desaturated and dimmed. */
  locked?: boolean;
  /** Accessible label; when omitted the art is decorative (aria-hidden). */
  label?: string;
}

/** SVG markup of a world's card art. */
export function worldArt(id: WorldArtId, opts: WorldArtOptions = {}): string {
  const c = worldColors(id);
  const u = `w${id}${++uidCounter}`;
  const r = rng(0x5eed ^ (WORLD_HUE[id] * 2654435761));
  const body = PAINT[id]({ c, u, r });
  const a11y = opts.label ? `role="img" aria-label="${opts.label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return (
    `<svg class="bl-world${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" ${a11y}>` +
    `<defs>` +
    `<linearGradient id="g${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.deep}"/><stop offset=".6" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient>` +
    `<radialGradient id="v${u}" cx=".72" cy=".55" r=".75"><stop offset="0" stop-color="${c.glow}" stop-opacity=".22"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="s${u}" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${c.deep}" stop-opacity=".92"/><stop offset=".45" stop-color="${c.deep}" stop-opacity=".55"/><stop offset=".8" stop-color="${c.deep}" stop-opacity="0"/></linearGradient>` +
    `<filter id="b${u}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>` +
    (opts.locked ? `<filter id="l${u}"><feColorMatrix type="saturate" values=".15"/></filter>` : '') +
    `</defs>` +
    `<g${opts.locked ? ` filter="url(#l${u})" opacity=".55"` : ''}>` +
    `<rect width="320" height="200" fill="url(#g${u})"/><rect width="320" height="200" fill="url(#v${u})"/>` +
    body +
    `<rect width="320" height="200" fill="url(#s${u})"/>` +
    // Glass sheen across the card.
    `<path d="M0 0h120L40 200H0Z" fill="#fff" opacity=".035"/>` +
    `</g></svg>`
  );
}

/** Put a world's art into an element (as its first child, behind the card text). */
export function mountWorldArt(el: HTMLElement, id: WorldArtId, opts: WorldArtOptions = {}): void {
  el.querySelector(':scope > svg.bl-world')?.remove();
  el.insertAdjacentHTML('afterbegin', worldArt(id, opts));
}
