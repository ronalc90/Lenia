/**
 * «Elige tu bata», literally (ADR-029, docs/ARTE-REALISTA.md §5.5): three real lab coats hanging on a
 * wall rack, each with its PVC ID card on a lanyard. Drawn in vector, in the 8 layers of §3.2: off-white
 * cotton (#eef0ee → #cfd5d8), folds as stacked soft ellipses (§3.5-1), seams at `detail` weight, the
 * cyan bounce of the dish at the hem, the warm rim of VELA's lamp on the right, a 1.25-px contour.
 *
 * Coat box: 100 × 150 units, the rack hook at (50, 6), the hem near y = 143. The save ids are the old
 * looks' (`curls` = classic coat, `beanie` = polar parka over the coat, `bun` = mandarin collar), so
 * existing saves keep their choice.
 */
import type { Lang, Text } from '../../../core/types';
import { cylinderRamp, grainPattern, kelvin } from '../vector';
import { BOUNCE, LINE } from '../tokens';
import { edgeBand, hash, metal, metrics, pageLang, parsePath, rgbOf, rrect, spot, sprite, trace, trackedText, type Ctx2D, type Shape, TAU } from './kit';

export type CoatId = 'curls' | 'beanie' | 'bun';
export const COAT_IDS: readonly CoatId[] = ['curls', 'beanie', 'bun'];

/** The fabric label of each coat (§5.5, Mono caption). */
export const BATA_FICHA: Record<CoatId, Text> = {
  curls: { es: '65 % POLIÉSTER · 35 % ALGODÓN', en: '65 % POLYESTER · 35 % COTTON' },
  beanie: { es: 'PLUMÓN · −40 °C', en: 'DOWN · −40 °C' },
  bun: { es: 'PUÑO ELÁSTICO · NIVEL 2', en: 'KNIT CUFFS · LEVEL 2' },
};

/** What the ID card says (§5.5). */
export const BATA_CARD_TEXT = {
  station: { es: 'ESTACIÓN VIGILIA', en: 'VIGIL STATION' } as Text,
  shift: { es: 'TURNO DE NOCHE', en: 'NIGHT SHIFT' } as Text,
  noPhoto: { es: 'SIN FOTO', en: 'NO PHOTO' } as Text,
};

const BOUNCE_RGB = rgbOf(BOUNCE.dish);
const RIM_RGB = kelvin(3000).join(',');
const INK = 'rgba(12,16,22,0.85)';

/** Toward the key light (window, upper left) and the lamp (right), screen space. */
const KX = -0.55;
const KY = -0.835;

const COTTON_LOCAL = ['#f4f6f4', '#e6eaea', '#d6dcdf', '#c9d0d4'] as const;
const PARKA_LOCAL = ['#d83a3c', '#bf262e', '#a61c24', '#8d141c'] as const;

// ── Shapes (coat box) ─────────────────────────────────────────────────────────────────────────────────

interface CoatShapes {
  /** Everything that is the coat (body + sleeves), for the contour and the clip of the light. */
  body: Shape;
  sleeves: readonly Shape[];
  /** The coat's inside seen through the neck (darker). */
  inside: Shape;
  /** Lapels / collar pieces drawn over the body. */
  collar: readonly Shape[];
  /** Interior lines (seams, pocket edges, placket), at `detail` weight. */
  seams: readonly Shape[];
  /** Stitch lines (dashed, `fine`). */
  stitches: readonly Shape[];
  /** Pocket mouths: a dark slit with a lit lip. */
  pockets: readonly (readonly [number, number, number, number])[];
  buttons: readonly (readonly [number, number])[];
  /** Vertical drape folds: [x, y, half length, lean]. */
  folds: readonly (readonly [number, number, number, number])[];
}

const CLASSIC: CoatShapes = {
  body: parsePath(
    'M40.5 21.2C44 22.4 56 22.4 59.5 21.2L80.6 28.4C83.4 29.6 84.4 32 84.6 35.4L85.2 104.6L73.6 106.2L73.2 52' +
      'L76.8 141.6C66 143.6 34 143.6 23.2 141.6L26.8 52L26.4 106.2L14.8 104.6L15.4 35.4C15.6 32 16.6 29.6 19.4 28.4Z',
  ),
  sleeves: [
    parsePath('M19.4 28.4C16.6 29.6 15.6 32 15.4 35.4L14.8 104.6C17.4 106.4 23.6 106.8 26.4 106.2L27.4 48C26 38 23.6 31.6 19.4 28.4Z'),
    parsePath('M80.6 28.4C83.4 29.6 84.4 32 84.6 35.4L85.2 104.6C82.6 106.4 76.4 106.8 73.6 106.2L72.6 48C74 38 76.4 31.6 80.6 28.4Z'),
  ],
  inside: parsePath('M40.5 21.2C44 22.4 56 22.4 59.5 21.2L57.6 33.4L50 56L42.4 33.4Z'),
  collar: [
    // Left lapel (viewer's left) with its notch, and the right one.
    parsePath('M40.5 21.2C39.6 24.4 38.8 28.4 38.6 31.4L35.4 33.2L37.6 36.4L49.4 57.4L50.6 55.6L44.6 36.8C43.6 31.4 43.8 26 44.6 22Z'),
    parsePath('M59.5 21.2C60.4 24.4 61.2 28.4 61.4 31.4L64.6 33.2L62.4 36.4L50.8 57.6L49.4 55.6L55.4 36.8C56.4 31.4 56.2 26 55.4 22Z'),
  ],
  seams: [
    parsePath('M50.6 56.6L51.8 142.6'),
    parsePath('M19.4 28.4C23.6 31.6 26 38 27.4 48'),
    parsePath('M80.6 28.4C76.4 31.6 74 38 72.6 48'),
    parsePath('M15.2 96.8C18.4 98 23.6 98.2 26.6 97.6'),
    parsePath('M85 96.8C81.8 98 76.6 98.2 73.4 97.6'),
  ],
  stitches: [
    parsePath('M51.6 58L52.8 142.2'),
    parsePath('M29.6 99.6L45 99.4L45.4 117.4L30 117.8Z'),
    parsePath('M55 99.4L70.4 99.6L70 117.8L54.6 117.4Z'),
    parsePath('M58.6 51.4L69.6 51.2L69.8 64.2L58.8 64.4Z'),
  ],
  pockets: [
    [29.4, 98.6, 45.4, 98.4],
    [54.6, 98.4, 70.6, 98.6],
    [58.4, 50.6, 69.8, 50.4],
  ],
  buttons: [
    [51.2, 64],
    [51.6, 84],
    [52, 104],
    [52.3, 124],
  ],
  folds: [
    [34, 92, 44, 0.02],
    [43.6, 104, 36, -0.01],
    [61, 98, 40, 0.0],
    [68.6, 110, 30, -0.02],
    [20.4, 72, 30, 0.0],
    [79.6, 72, 30, 0.0],
  ],
};

const PARKA: CoatShapes = {
  body: parsePath(
    'M38.8 20.4C44 23.6 56 23.6 61.2 20.4L82.6 28C86.4 29.6 87.6 33.4 87.8 37L88.4 101.6L76.4 104.2L76.2 60' +
      'L79.6 118.6C66 121.6 34 121.6 20.4 118.6L23.8 60L23.6 104.2L11.6 101.6L12.2 37C12.4 33.4 13.6 29.6 17.4 28Z',
  ),
  sleeves: [
    parsePath('M17.4 28C13.6 29.6 12.4 33.4 12.2 37L11.6 101.6C15 103.8 21 104.6 23.6 104.2L24.8 50C23.6 40 21.8 31.6 17.4 28Z'),
    parsePath('M82.6 28C86.4 29.6 87.6 33.4 87.8 37L88.4 101.6C85 103.8 79 104.6 76.4 104.2L75.2 50C76.4 40 78.2 31.6 82.6 28Z'),
  ],
  inside: parsePath('M40 21.4C44 23.8 56 23.8 60 21.4L56.6 30.2C53 31.6 47 31.6 43.4 30.2Z'),
  collar: [],
  seams: [
    parsePath('M17.4 28C21.8 31.6 23.6 40 24.8 50'),
    parsePath('M82.6 28C78.2 31.6 76.4 40 75.2 50'),
    // Quilting baffles across the body and the sleeves.
    parsePath('M24.6 46C36 48.2 64 48.2 75.4 46'),
    parsePath('M24.2 63C36 65.2 64 65.2 75.8 63'),
    parsePath('M24 80C36 82.2 64 82.2 76 80'),
    parsePath('M23.8 97C36 99.2 64 99.2 76.2 97'),
    parsePath('M12.2 52C15.6 53.2 20.6 53.4 24.4 52.6'),
    parsePath('M12 70C15.6 71.2 20.6 71.4 24.2 70.6'),
    parsePath('M11.8 88C15.6 89.2 20.6 89.4 24 88.6'),
    parsePath('M87.8 52C84.4 53.2 79.4 53.4 75.6 52.6'),
    parsePath('M88 70C84.4 71.2 79.4 71.4 75.8 70.6'),
    parsePath('M88.2 88C84.4 89.2 79.4 89.4 76 88.6'),
    // Storm flap over the zip.
    parsePath('M47.6 31L47.4 120.2'),
    parsePath('M53.2 31L53.6 120.2'),
  ],
  stitches: [parsePath('M30 84L44 84.4L44.2 100.6L30.4 101Z'), parsePath('M56 84.4L70 84L69.6 101L55.8 100.6Z')],
  pockets: [
    [29.6, 83.2, 44.4, 83.6],
    [55.6, 83.6, 70.4, 83.2],
  ],
  buttons: [
    [50.4, 40],
    [50.4, 58],
    [50.4, 76],
    [50.4, 94],
    [50.4, 112],
  ],
  folds: [
    [34, 56, 8, 0],
    [66, 56, 8, 0],
    [36, 90, 10, 0],
    [64, 90, 10, 0],
  ],
};

const MAO: CoatShapes = {
  body: parsePath(
    'M42.2 18.6C46 19.6 54 19.6 57.8 18.6L80.4 28.4C83.2 29.6 84.2 32 84.4 35.4L85 104.6L73.6 106.2L73.2 52' +
      'L76.8 141.6C66 143.6 34 143.6 23.2 141.6L26.8 52L26.4 106.2L15 104.6L15.6 35.4C15.8 32 16.8 29.6 19.6 28.4Z',
  ),
  sleeves: [
    parsePath('M19.6 28.4C16.8 29.6 15.8 32 15.6 35.4L15 98.4C17.6 100 23.4 100.4 26.4 99.8L27.4 48C26 38 23.8 31.6 19.6 28.4Z'),
    parsePath('M80.4 28.4C83.2 29.6 84.2 32 84.4 35.4L85 98.4C82.4 100 76.6 100.4 73.6 99.8L72.6 48C74 38 76.2 31.6 80.4 28.4Z'),
  ],
  inside: parsePath('M43.2 19.4C46.4 20.2 53.6 20.2 56.8 19.4L56.4 20.6C53 21.4 47 21.4 43.6 20.6Z'),
  collar: [
    // The stand collar: a band all round the neck, closed at the side.
    parsePath('M41.6 13.6C46 15 54 15 58.4 13.6L59.2 21.4C54.6 23 45.4 23 40.8 21.4Z'),
  ],
  seams: [
    parsePath('M19.6 28.4C23.8 31.6 26 38 27.4 48'),
    parsePath('M80.4 28.4C76.2 31.6 74 38 72.6 48'),
    // Side closure: from the collar, across the chest, down the right side.
    parsePath('M52 22.6C58 27 63.8 33.4 66.6 40.4L67.6 142.4'),
  ],
  stitches: [parsePath('M53.4 23.6C59.2 28 64.8 34.2 67.8 41L68.8 142.2'), parsePath('M30 99.6L45 99.4L45.4 117.4L30.4 117.8Z'), parsePath('M31.4 48.6L42.2 48.4L42.4 60.6L31.6 60.8Z')],
  pockets: [
    [29.6, 98.6, 45.4, 98.4],
    [31.2, 47.8, 42.4, 47.6],
  ],
  buttons: [
    [56.4, 27],
    [62.8, 33.4],
    [66.6, 46],
    [67, 66],
    [67.4, 86],
    [67.6, 106],
    [67.9, 126],
  ],
  folds: [
    [35, 96, 42, 0.02],
    [46, 104, 36, -0.01],
    [58, 98, 40, 0.0],
    [72, 112, 26, -0.02],
    [20.6, 70, 26, 0.0],
    [79.4, 70, 26, 0.0],
  ],
};

/** The white coat's lower part under the parka (the parka is worn over it). */
const UNDER_COAT = parsePath('M25.6 112C36 114 64 114 74.4 112L76.8 141.6C66 143.6 34 143.6 23.2 141.6Z');

/** Wooden hanger seen inside the neck + its chrome hook up to the rack. */
const HANGER_HOOK = parsePath('M50 21.6C50 18 50 15 50.4 12.4C50.8 9.6 52.8 8 54.4 8.4C56 8.8 56.4 10.6 55.6 12');

// ── Painting a coat (static, cached) ──────────────────────────────────────────────────────────────────

function fillLocal(c: Ctx2D, s: Shape, stops: readonly string[], y0: number, y1: number): void {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.25, stops[1]);
  g.addColorStop(0.7, stops[2]);
  g.addColorStop(1, stops[3]);
  trace(c, s);
  c.fillStyle = g;
  c.fill();
}

/** Layers 3–7 over a fabric silhouette (call with the clip set to it). */
function fabricLight(c: Ctx2D, s: Shape, css: number, parka: boolean): void {
  // 3 · Form shadow: key light upper left, falling off to the right and down (multiply).
  c.globalCompositeOperation = 'multiply';
  const fs = c.createLinearGradient(14, 20, 88, 140);
  fs.addColorStop(0, '#ffffff');
  fs.addColorStop(0.45, '#f1f3f4');
  fs.addColorStop(1, parka ? '#b7a9ab' : '#b4bec5');
  c.fillStyle = fs;
  c.fillRect(0, 0, 100, 150);
  c.globalCompositeOperation = 'source-over';
  // 4 · Reflected light: the dish's cyan, from below (screen).
  const bl = c.createLinearGradient(0, 146, 0, 112);
  bl.addColorStop(0, `rgba(${BOUNCE_RGB},0.2)`);
  bl.addColorStop(1, `rgba(${BOUNCE_RGB},0)`);
  c.globalCompositeOperation = 'screen';
  c.fillStyle = bl;
  c.fillRect(0, 108, 100, 42);
  c.globalCompositeOperation = 'source-over';
  // 6 · Rim: VELA's lamp grazing the right edges.
  edgeBand(c, s, 1, -0.1, (0.6 * 2) / css, `rgb(${RIM_RGB})`, parka ? 0.5 : 0.42);
  edgeBand(c, s, 1, -0.1, 3.2, `rgb(${RIM_RGB})`, 0.08, 'screen');
  // 7 · Texture: cotton/nylon grain, soft-light.
  const p = grainPattern(c);
  if (p) {
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = parka ? 0.05 : 0.07;
    c.scale(0.25, 0.25);
    c.fillStyle = p;
    c.fillRect(0, 0, 400, 600);
    c.restore();
  }
}

function drawFolds(c: Ctx2D, folds: CoatShapes['folds'], deep: string): void {
  for (const [x, y, l, lean] of folds) {
    // A fold is a soft valley (dark, multiply) with a lit ridge toward the window just left of it.
    spot(c, x + 1.4, y, 2.2, l, lean, deep, 0.2, 'multiply');
    spot(c, x - 1.6, y - 2, 1.6, l * 0.86, lean, '255,255,255', 0.22);
  }
}

function drawSeams(c: Ctx2D, sh: CoatShapes, css: number, parka: boolean): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const s of sh.seams) {
    // A seam is a crease (dark) with the fabric's lit lip beside it, offset toward the window.
    c.strokeStyle = parka ? 'rgba(60,6,10,0.55)' : 'rgba(84,96,108,0.5)';
    c.lineWidth = LINE.detail / css;
    trace(c, s);
    c.stroke();
    c.strokeStyle = parka ? 'rgba(255,170,160,0.22)' : 'rgba(255,255,255,0.5)';
    c.lineWidth = LINE.fine / css;
    trace(c, s, KX * 0.45, KY * 0.45);
    c.stroke();
  }
  c.setLineDash([0.9, 0.7]);
  for (const s of sh.stitches) {
    c.strokeStyle = parka ? 'rgba(70,8,12,0.5)' : 'rgba(100,110,120,0.45)';
    c.lineWidth = LINE.fine / css;
    trace(c, s);
    c.stroke();
  }
  c.setLineDash([]);
  for (const [x0, y0, x1, y1] of sh.pockets) {
    // Pocket mouth: the shadow of the opening under its hem, and the lit hem above.
    spot(c, (x0 + x1) / 2, (y0 + y1) / 2 + 1.1, (x1 - x0) / 2, 1.2, 0, parka ? '50,4,8' : '70,82,94', 0.4, 'multiply');
    c.strokeStyle = parka ? 'rgba(50,4,8,0.7)' : 'rgba(70,82,94,0.65)';
    c.lineWidth = LINE.detail / css;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.strokeStyle = parka ? 'rgba(255,190,180,0.3)' : 'rgba(255,255,255,0.75)';
    c.lineWidth = LINE.fine / css;
    c.beginPath();
    c.moveTo(x0, y0 - 0.7);
    c.lineTo(x1, y1 - 0.7);
    c.stroke();
  }
}

function drawButtons(c: Ctx2D, sh: CoatShapes, css: number, style: 'button' | 'snap'): void {
  for (const [x, y] of sh.buttons) {
    if (style === 'snap') {
      // Press stud: a small domed nickel cap (conic metal) with its shadow.
      spot(c, x + 0.5, y + 0.7, 1.6, 1.3, 0, '40,50,60', 0.35, 'multiply');
      c.beginPath();
      c.arc(x, y, 1.15, 0, TAU);
      c.fillStyle = metal(c, x, y, -2.2, '#f4f4f1', '#7b7f83', 4, 1.15);
      c.fill();
      c.strokeStyle = 'rgba(20,24,28,0.6)';
      c.lineWidth = LINE.fine / css;
      c.stroke();
      continue;
    }
    // A four-hole shirt button: off-white plastic, lit top-left, its thread holes.
    spot(c, x + 0.5, y + 0.8, 1.9, 1.5, 0, '60,70,80', 0.3, 'multiply');
    const g = c.createRadialGradient(x - 0.5, y - 0.6, 0.1, x, y, 1.6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c2c9ce');
    c.beginPath();
    c.arc(x, y, 1.45, 0, TAU);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(40,48,56,0.55)';
    c.lineWidth = LINE.fine / css;
    c.stroke();
    c.fillStyle = 'rgba(70,78,86,0.7)';
    for (const [dx, dy] of [
      [-0.42, -0.42],
      [0.42, -0.42],
      [-0.42, 0.42],
      [0.42, 0.42],
    ])
      c.fillRect(x + dx - 0.16, y + dy - 0.16, 0.32, 0.32);
  }
}

/** Synthetic fur ruff around the parka's hood: hundreds of short tapered strands (deterministic). */
function drawFurRuff(c: Ctx2D, css: number): void {
  // The hood itself (red), lying behind the neck.
  const hood = parsePath('M32 26C30 16 38 8.6 50 8.6C62 8.6 70 16 68 26C62 22.6 38 22.6 32 26Z');
  fillLocal(c, hood, PARKA_LOCAL, 8, 26);
  c.save();
  trace(c, hood);
  c.clip();
  spot(c, 46, 14, 14, 5, 0, '255,255,255', 0.18);
  c.restore();
  // The ruff: an elliptical ring of strands.
  c.lineCap = 'round';
  const n = 260;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.94 + 1.12 * (i / n));
    const rr = 1 + (hash(i, 31) - 0.5) * 0.08;
    const cx = 50 + Math.cos(a) * 16.4 * rr;
    const cy = 24 + Math.sin(a) * 12.4 * rr;
    const out = 2.4 + hash(i, 32) * 2.6;
    const ex = cx + Math.cos(a + (hash(i, 33) - 0.5) * 0.6) * out;
    const ey = cy + Math.sin(a + (hash(i, 33) - 0.5) * 0.6) * out;
    const lit = Math.max(0, -(Math.cos(a) * KX + Math.sin(a) * KY) * -1);
    const v = Math.round(150 + 80 * lit + 30 * hash(i, 34));
    c.strokeStyle = `rgba(${v},${v - 8},${v - 22},${0.55 + 0.4 * hash(i, 35)})`;
    c.lineWidth = (0.35 + 0.5 * hash(i, 36)) / Math.max(0.6, css * 0.5);
    c.beginPath();
    c.moveTo(cx, cy);
    c.quadraticCurveTo((cx + ex) / 2 + (hash(i, 37) - 0.5) * 1.2, (cy + ey) / 2, ex, ey);
    c.stroke();
  }
  // Dark roots where the ruff meets the hood opening.
  c.strokeStyle = 'rgba(40,30,26,0.6)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(50, 24, 16.4, 12.4, 0, Math.PI * 0.94, Math.PI * 2.06);
  c.stroke();
}

/** One coat in its 100 × 150 box (static). `theme` only changes the contour against the wall. */
function paintCoat(c: Ctx2D, id: CoatId, css: number, theme: 'dark' | 'light'): void {
  const sh = id === 'beanie' ? PARKA : id === 'bun' ? MAO : CLASSIC;
  const parka = id === 'beanie';
  const line = theme === 'light' ? 'rgba(40,48,58,0.8)' : INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // The hanger's hook, behind the coat.
  c.strokeStyle = cylinderRamp(c, 48.8, 0, 51.2, 0, ['#3a3d40', '#f7f7f5', '#a4a8ab', '#c9dbe4', '#2e3134'], [0, 0.28, 0.5, 0.82, 1]);
  c.lineWidth = 1.1;
  trace(c, HANGER_HOOK);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = LINE.fine / css;
  trace(c, HANGER_HOOK, 0.55, 0);
  c.stroke();
  if (parka) {
    // The white coat under the parka: only its hem shows.
    c.strokeStyle = line;
    c.lineWidth = (LINE.contour * 2) / css;
    trace(c, UNDER_COAT);
    c.stroke();
    fillLocal(c, UNDER_COAT, COTTON_LOCAL, 112, 143);
    c.save();
    trace(c, UNDER_COAT);
    c.clip();
    fabricLight(c, UNDER_COAT, css, false);
    spot(c, 50, 113, 30, 3.2, 0, '20,26,32', 0.45, 'multiply');
    c.strokeStyle = 'rgba(84,96,108,0.5)';
    c.lineWidth = LINE.detail / css;
    trace(c, parsePath('M50.6 112L51.6 142.4'));
    c.stroke();
    c.restore();
    drawFurRuff(c, css);
  }
  // 8 · Contour first, at twice the weight (the fill covers its inner half: silhouette only).
  c.strokeStyle = line;
  c.lineWidth = (LINE.contour * 2) / css;
  trace(c, sh.body);
  c.stroke();
  for (const s of sh.collar) {
    trace(c, s);
    c.stroke();
  }
  // 1–2 · Base and local colour.
  const local = parka ? PARKA_LOCAL : id === 'bun' ? (['#f2f5f6', '#e3e9ec', '#d3dbe0', '#c6cfd5'] as const) : COTTON_LOCAL;
  fillLocal(c, sh.body, local, 18, 143);
  c.save();
  trace(c, sh.body);
  c.clip();
  // The inside of the coat (its back panel) through the neck, and the wooden hanger bar.
  fillLocal(c, sh.inside, parka ? ['#3a0e12', '#2c0a0e', '#22080b', '#1a0608'] : ['#a7b0b6', '#959fa6', '#87929a', '#7b868e'], 20, 56);
  if (!parka && id !== 'bun') {
    c.save();
    trace(c, sh.inside);
    c.clip();
    c.fillStyle = cylinderRamp(c, 0, 22.4, 0, 26.4, ['#3b2414', '#d8a46c', '#9a6436', '#a8794e', '#2c190c'], [0, 0.3, 0.55, 0.85, 1]);
    c.fillRect(30, 22.4, 40, 4);
    // The maker's label at the back of the neck (blank woven tag).
    c.fillStyle = '#e9e4d6';
    c.fillRect(47.6, 27.4, 4.8, 2.6);
    c.fillStyle = 'rgba(90,80,60,0.4)';
    c.fillRect(48.2, 28.4, 3.6, 0.3);
    spot(c, 50, 30, 8, 10, 0, '20,26,32', 0.4, 'multiply');
    c.restore();
  }
  // Sleeves: a cylinder each (they hang in front of the body's sides).
  for (const s of sh.sleeves) {
    c.save();
    trace(c, s);
    c.clip();
    c.globalCompositeOperation = 'multiply';
    const left = s === sh.sleeves[0];
    const sx0 = left ? 12 : 72;
    const sx1 = left ? 28 : 89;
    c.fillStyle = cylinderRamp(c, sx0, 60, sx1, 60, ['#9aa4ab', '#ffffff', '#eef1f2', '#e2eaee', '#8f99a1'], [0, 0.3, 0.55, 0.82, 1]);
    c.fillRect(sx0 - 2, 20, sx1 - sx0 + 4, 92);
    c.globalCompositeOperation = 'source-over';
    // The sleeve's own shadow on the body, just inside it.
    c.restore();
    c.save();
    trace(c, sh.body);
    c.clip();
    spot(c, left ? 29 : 71, 76, 2.6, 30, 0, parka ? '40,4,8' : '50,60,70', 0.22, 'multiply');
    c.restore();
  }
  if (parka) {
    // Baffles: each quilted band puffs out between its seams (lit top, shaded bottom).
    for (let y = 30; y < 118; y += 17) {
      spot(c, 46, y + 6, 26, 4.2, 0, '255,255,255', 0.16);
      spot(c, 50, y + 14.4, 28, 2.2, 0, '40,4,8', 0.26, 'multiply');
    }
    for (const sx of [18, 82])
      for (let y = 38; y < 100; y += 18) {
        spot(c, sx - 1, y + 4, 4.6, 4.4, 0, '255,255,255', 0.14);
        spot(c, sx, y + 12, 5.4, 1.8, 0, '40,4,8', 0.24, 'multiply');
      }
    // Storm flap: a raised band down the front.
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(47.6, 31, 2.2, 89);
    spot(c, 54.4, 76, 1.2, 44, 0, '40,4,8', 0.28, 'multiply');
  }
  drawFolds(c, sh.folds, parka ? '60,6,10' : '58,70,82');
  fabricLight(c, sh.body, css, parka);
  c.restore();
  // Collar pieces over the body, with their own light.
  for (const s of sh.collar) {
    fillLocal(c, s, local, 14, 58);
    c.save();
    trace(c, s);
    c.clip();
    c.globalCompositeOperation = 'multiply';
    const g = c.createLinearGradient(36, 20, 62, 50);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c3ccd2');
    c.fillStyle = g;
    c.fillRect(30, 10, 40, 50);
    c.globalCompositeOperation = 'source-over';
    edgeBand(c, s, 1, -0.1, (0.6 * 2) / css, `rgb(${RIM_RGB})`, 0.35);
    // The lapel rolls: a lit roll line near its outer edge.
    edgeBand(c, s, KX, KY, 1.4, '#ffffff', 0.45);
    c.restore();
    c.strokeStyle = 'rgba(70,82,94,0.55)';
    c.lineWidth = LINE.detail / css;
    trace(c, s);
    c.stroke();
  }
  drawSeams(c, sh, css, parka);
  drawButtons(c, sh, css, id === 'curls' ? 'button' : 'snap');
  if (id === 'curls') drawPocketPen(c, css);
  if (parka) drawZipPull(c, css);
  if (id === 'bun') drawKnitCuffs(c, css);
  // 5 · Specular: matte cotton has none worth a band; nylon has a broad sheen on the left shoulder.
  if (parka) spot(c, 27, 36, 8, 4, -0.5, '255,236,236', 0.24);
}

function drawPocketPen(c: Ctx2D, css: number): void {
  // A ballpoint clipped in the chest pocket: its cap and steel clip peek out.
  c.fillStyle = cylinderRamp(c, 61.2, 0, 63.6, 0, ['#05070b', '#5a6476', '#1b2230', '#2b3a4c', '#04060a'], [0, 0.26, 0.5, 0.82, 1]);
  c.beginPath();
  rrect(c, 61.2, 44.6, 2.4, 7.4, 1.1);
  c.fill();
  c.strokeStyle = cylinderRamp(c, 63.4, 0, 64.4, 0, ['#5a5e62', '#ffffff', '#b8bcbf', '#d8e2e8', '#4a4e52'], [0, 0.3, 0.5, 0.8, 1]);
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(63.4, 45.6);
  c.lineTo(63.6, 54.2);
  c.stroke();
  c.strokeStyle = INK;
  c.lineWidth = LINE.fine / css;
  c.beginPath();
  rrect(c, 61.2, 44.6, 2.4, 7.4, 1.1);
  c.stroke();
}

function drawZipPull(c: Ctx2D, css: number): void {
  c.fillStyle = metal(c, 50.4, 29.4, -2, '#f4f4f1', '#6c6f72', 4, 1.4);
  c.beginPath();
  rrect(c, 49.4, 27.4, 2, 4.6, 0.8);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = LINE.fine / css;
  c.stroke();
}

function drawKnitCuffs(c: Ctx2D, css: number): void {
  for (const [x0, x1] of [
    [15, 26.4],
    [73.6, 85],
  ]) {
    const s = parsePath(`M${x0} 98.4C${x0 + 3} 100 ${x1 - 3} 100.4 ${x1} 99.8L${x1 - 0.4} 108.4C${x1 - 3} 109.2 ${x0 + 3} 109 ${x0 + 0.4} 107.8Z`);
    c.strokeStyle = INK;
    c.lineWidth = (LINE.contour * 2) / css;
    trace(c, s);
    c.stroke();
    c.fillStyle = cylinderRamp(c, x0, 0, x1, 0, ['#3d4247', '#b9bfc4', '#80878d', '#8f9ba3', '#33373b'], [0, 0.3, 0.55, 0.82, 1]);
    c.fill();
    c.save();
    trace(c, s);
    c.clip();
    for (let x = x0; x <= x1; x += 0.9) {
      c.fillStyle = 'rgba(20,22,26,0.32)';
      c.fillRect(x, 98, 0.26, 11);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(x + 0.34, 98, 0.26, 11);
    }
    edgeBand(c, s, 1, -0.1, (0.6 * 2) / css, `rgb(${RIM_RGB})`, 0.4);
    c.restore();
  }
}

/**
 * One coat on its hanger, in the coat box (100 × 150 units, the hook at (50, 6)), without the rack,
 * the wall or the ID card. Static and cached.
 */
export function drawCoat(ctx: Ctx2D, id: CoatId, theme: 'dark' | 'light' = 'dark'): void {
  sprite(ctx, `coat|${id}|${theme}`, 0, 0, 100, 150, (c, css) => paintCoat(c, id, css, theme));
}

// ── The rack, the wall and the ID card ────────────────────────────────────────────────────────────────

function paintWall(c: Ctx2D, w: number, h: number, theme: 'dark' | 'light'): void {
  const g = c.createLinearGradient(0, 0, w, h);
  if (theme === 'light') {
    g.addColorStop(0, '#e4e8ec');
    g.addColorStop(1, '#c9d0d6');
  } else {
    g.addColorStop(0, '#1a222b');
    g.addColorStop(0.6, '#10161d');
    g.addColorStop(1, '#0b1015');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // Window light pooling from the upper left; the lamp's warmth from the right edge.
  spot(c, w * 0.1, h * 0.08, w * 0.9, h * 0.7, 0, theme === 'light' ? '255,255,255' : '150,180,210', theme === 'light' ? 0.35 : 0.12);
  spot(c, w * 1.05, h * 0.55, w * 0.5, h * 0.6, 0, RIM_RGB, theme === 'light' ? 0.12 : 0.08);
  const p = grainPattern(c);
  if (p) {
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.06;
    c.fillStyle = p;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
}

function paintRail(c: Ctx2D, w: number, y: number, hgt: number, css: number): void {
  // Brushed aluminium rail across the tile, two screws, the chrome hook knob at the centre.
  const g = c.createLinearGradient(0, y, 0, y + hgt);
  g.addColorStop(0, '#e8eaeb');
  g.addColorStop(0.45, '#c9ccce');
  g.addColorStop(0.55, '#b1b5b8');
  g.addColorStop(1, '#7d8286');
  c.fillStyle = g;
  c.fillRect(0, y, w, hgt);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.fillRect(0, y, w, Math.max(0.5 / css, hgt * 0.08));
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, y + hgt, w, Math.max(1 / css, hgt * 0.12));
  // Brushing: fine horizontal striations.
  for (let i = 0; i < 10; i++) {
    c.fillStyle = hash(i, 51) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    c.fillRect(0, y + (i + 0.5) * (hgt / 10), w, Math.max(0.3 / css, hgt * 0.03));
  }
  // The rail's shadow on the wall.
  const sg = c.createLinearGradient(0, y + hgt, 0, y + hgt * 2.6);
  sg.addColorStop(0, 'rgba(0,0,0,0.35)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg;
  c.fillRect(0, y + hgt, w, hgt * 1.6);
}

function paintKnob(c: Ctx2D, x: number, y: number, r: number, css: number): void {
  spot(c, x + r * 0.4, y + r * 0.6, r * 1.7, r * 1.4, 0, '0,0,0', 0.45);
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = metal(c, x, y, -2.3, '#f4f4f1', '#6c6f72', 6, r);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = LINE.detail / css;
  c.stroke();
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, TAU);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fill();
}

/** Text the card prints at a given language. */
function cardStrings(id: CoatId, lang: Lang): [string, string, string] {
  return [BATA_CARD_TEXT.station[lang], BATA_CARD_TEXT.shift[lang], BATA_FICHA[id][lang]];
}

/** Card number per coat: printed, not meaningful. */
const CARD_NO: Record<CoatId, string> = { curls: 'N.º 0452', beanie: 'N.º 0453', bun: 'N.º 0454' };

/**
 * The PVC ID card (1.6 × the real CR80 card, for legibility), hanging from its clip at (0, 0),
 * 11 × 17.5 units below. Below `minTextPx` CSS px of card height the print becomes ruled lines.
 */
function paintCard(c: Ctx2D, id: CoatId, css: number, lang: Lang): void {
  const W = 11;
  const H = 17.4;
  const x = -W / 2;
  const y = 2.2;
  // Clip: a clear strap with a nickel snap.
  c.fillStyle = 'rgba(210,225,235,0.55)';
  c.beginPath();
  rrect(c, -1.1, -0.6, 2.2, 4, 0.6);
  c.fill();
  c.strokeStyle = 'rgba(20,28,36,0.6)';
  c.lineWidth = LINE.fine / css;
  c.stroke();
  c.beginPath();
  c.arc(0, 0.4, 0.75, 0, TAU);
  c.fillStyle = metal(c, 0, 0.4, -2, '#f4f4f1', '#6c6f72', 4, 0.75);
  c.fill();
  // Card body: white PVC with rounded corners, a slot, a soft shadow on the coat.
  spot(c, 0.9, y + H / 2 + 1, W * 0.62, H * 0.58, 0, '30,40,50', 0.35, 'multiply');
  c.beginPath();
  rrect(c, x, y, W, H, 0.9);
  const g = c.createLinearGradient(x, y, x + W, y + H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#dfe4e7');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = LINE.detail / css;
  c.stroke();
  c.save();
  c.beginPath();
  rrect(c, x, y, W, H, 0.9);
  c.clip();
  // Header band (the station's teal) and the slot punched through it.
  c.fillStyle = '#1f5f66';
  c.fillRect(x, y, W, 3.4);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(x, y, W, 0.5);
  c.fillStyle = '#0b1014';
  c.beginPath();
  rrect(c, -1.6, y + 0.7, 3.2, 0.7, 0.35);
  c.fill();
  // The photo box: a grey "no photo" silhouette (a placeholder, not a person).
  const px = x + 1;
  const py = y + 4.4;
  c.fillStyle = '#e7ebee';
  c.fillRect(px, py, 4.6, 5.8);
  c.fillStyle = '#b9c1c7';
  c.beginPath();
  c.arc(px + 2.3, py + 2.2, 1.15, 0, TAU);
  c.moveTo(px + 0.5, py + 5.8);
  c.quadraticCurveTo(px + 0.6, py + 3.6, px + 2.3, py + 3.6);
  c.quadraticCurveTo(px + 4, py + 3.6, px + 4.1, py + 5.8);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(90,100,110,0.6)';
  c.lineWidth = LINE.fine / css;
  c.strokeRect(px, py, 4.6, 5.8);
  // Print: real text when the card is big enough to read, ruled lines otherwise.
  const [station, shift, ficha] = cardStrings(id, lang);
  const cardPx = H * css;
  if (cardPx >= 64) {
    c.fillStyle = '#ffffff';
    c.font = `700 1.05px "JetBrains Mono", ui-monospace, monospace`;
    c.textBaseline = 'middle';
    trackedText(c, station, x + 0.8, y + 1.85, 1.05, 0.06);
    c.fillStyle = '#1d232a';
    c.font = `700 0.95px "JetBrains Mono", ui-monospace, monospace`;
    trackedText(c, shift, px + 5.2, py + 0.9, 0.95, 0.04);
    c.fillStyle = '#55606b';
    c.font = `500 0.8px "JetBrains Mono", ui-monospace, monospace`;
    trackedText(c, CARD_NO[id], px + 5.2, py + 2.3, 0.8, 0.04);
    c.font = `500 0.62px "JetBrains Mono", ui-monospace, monospace`;
    trackedText(c, ficha, x + 0.9, y + H - 4.6, 0.62, 0.02);
    c.fillStyle = 'rgba(29,35,42,0.85)';
    c.font = `500 0.7px "JetBrains Mono", ui-monospace, monospace`;
    trackedText(c, BATA_CARD_TEXT.noPhoto[lang], px + 0.4, py + 6.6, 0.7, 0.02);
  } else {
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(x + 0.9, y + 1.5, 6.4, 0.7);
    c.fillStyle = 'rgba(29,35,42,0.75)';
    c.fillRect(px + 5.3, py + 0.6, 3.8, 0.75);
    c.fillStyle = 'rgba(85,96,107,0.6)';
    c.fillRect(px + 5.3, py + 2.0, 2.8, 0.55);
    c.fillRect(x + 0.9, y + H - 4.9, 8.6, 0.45);
  }
  // A barcode along the bottom.
  for (let i = 0; i < 30; i++) {
    if (hash(i, 61 + id.length) < 0.45) continue;
    c.fillStyle = '#1d232a';
    c.fillRect(x + 1 + i * 0.3, y + H - 3.2, hash(i, 62) > 0.6 ? 0.2 : 0.11, 2.2);
  }
  // PVC gloss: one band from the window (specular), and the lamp's warm rim on the right edge.
  const sp = c.createLinearGradient(x, y, x + W * 0.7, y + H * 0.5);
  sp.addColorStop(0, 'rgba(255,255,255,0)');
  sp.addColorStop(0.42, 'rgba(255,255,255,0)');
  sp.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  sp.addColorStop(0.6, 'rgba(255,255,255,0)');
  c.fillStyle = sp;
  c.fillRect(x, y, W, H);
  c.restore();
  c.strokeStyle = `rgba(${RIM_RGB},0.5)`;
  c.lineWidth = LINE.fine / css;
  c.beginPath();
  c.moveTo(x + W - 0.2, y + 1.2);
  c.lineTo(x + W - 0.2, y + H - 1.2);
  c.stroke();
}

/** The lanyard: two strands from the hook down to the card clip at (cx, cy). Dynamic (it swings). */
function drawLanyard(ctx: Ctx2D, hx: number, hy: number, cx: number, cy: number, css: number): void {
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const mx = (hx + cx) / 2 + side * 6.4;
    const my = (hy + cy) / 2 + 2;
    ctx.strokeStyle = '#1c2a44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx + side * 0.6, hy + 0.8);
    ctx.quadraticCurveTo(mx, my, cx + side * 0.5, cy);
    ctx.stroke();
    // A lit edge on the woven strap (toward the window on the left strand, the lamp on the right one).
    ctx.strokeStyle = side < 0 ? 'rgba(170,190,220,0.5)' : `rgba(${RIM_RGB},0.4)`;
    ctx.lineWidth = LINE.fine / css;
    ctx.beginPath();
    ctx.moveTo(hx + side * 0.6 - 0.5, hy + 0.8);
    ctx.quadraticCurveTo(mx - 0.6, my, cx + side * 0.5 - 0.5, cy);
    ctx.stroke();
  }
}

/** Extra controls for `drawBataCard`. */
export interface BataCardOpts {
  /** Language of the card's print (default: the page's `<html lang>`). */
  lang?: Lang;
  /** Seconds since this coat was picked: the ID card swings as a damped pendulum (ζ 0.15, 1.5 Hz). */
  age?: number;
  /** 'dark' (default) or 'light' wall. */
  theme?: 'dark' | 'light';
  /** Paint the wall behind the rack (default true). */
  wall?: boolean;
  /** Draw the 2-px focus ring when selected (default true). */
  ring?: boolean;
}

/** The focus ring's colour (`--bl-accent` of each theme). */
const ACCENT = { dark: '#5bc0eb', light: '#0a72a6' } as const;

/**
 * A coat on the wall rack, with its ID card, filling a `w` × `h` CSS-px tile at (0, 0) of the current
 * transform (the picker's button canvas, §5.5).
 *
 *  - `id`: `curls` (classic coat) · `beanie` (polar parka) · `bun` (mandarin collar).
 *  - `t`, `rm`: time in seconds and Reduce motion (no lift, no swing: only the ring changes).
 *  - `selected`: false/0 hanging; true/1 taken off the hook (lifted 6 px and forward, ring on). A number
 *    between eases the lift: drive it with the 220-ms drawer of §6.4 for the transition.
 *  - `opts.age`: seconds since it was picked (the card's pendulum); `opts.lang`, `opts.theme`.
 *
 * The coat, the rack and the wall are cached per id × size × DPR × theme; per frame it blits them and
 * draws the lanyard and the card.
 */
export function drawBataCard(ctx: Ctx2D, id: CoatId, w: number, h: number, t: number, rm: boolean, selected: boolean | number, opts: BataCardOpts = {}): void {
  const theme = opts.theme ?? 'dark';
  const lang = opts.lang ?? pageLang();
  const sel = typeof selected === 'number' ? Math.max(0, Math.min(1, selected)) : selected ? 1 : 0;
  const lift = rm ? 0 : sel;
  // Layout: the coat box (100 × 150) fitted under a rail at the top of the tile.
  const railY = Math.max(3, h * 0.035);
  const railH = Math.max(3, h * 0.03);
  const k = Math.min((w * 0.94) / 100, (h - railY - railH * 0.2) / 152);
  const ox = (w - 100 * k) / 2;
  const oy = railY + railH * 0.5 - 6 * k;
  if (opts.wall !== false) {
    sprite(ctx, `rack|${theme}|${Math.round(w)}x${Math.round(h)}`, 0, 0, w, h, (c, css) => {
      paintWall(c, w, h, theme);
      paintRail(c, w, railY, railH, css);
    });
  }
  // The coat's shadow on the wall: a soft offset copy of its mass, further when it comes forward.
  const sh = 1 + lift * 0.6;
  spot(ctx, ox + 54 * k + 3 * sh, oy + 80 * k + 4 * sh, 40 * k, 66 * k, 0, '0,0,0', theme === 'light' ? 0.18 : 0.32);
  ctx.save();
  // Lifted off the hook: up 6 px and forward (scaled about the hook) — no bounce.
  const ease = 1 - (1 - lift) * (1 - lift) * (1 - lift);
  const s = 1 + 0.03 * ease;
  ctx.translate(ox + 50 * k, oy + 6 * k - 6 * ease);
  ctx.scale(k * s, k * s);
  ctx.translate(-50, -6);
  drawCoat(ctx, id, theme);
  // Lanyard and card (dynamic: the card swings after a pick).
  const age = opts.age ?? Infinity;
  // A faint draft from the open door keeps the card turning a little (still under Reduce motion).
  let swing = rm ? 0 : 0.018 * Math.sin(t * 2.1 + id.length) + 0.008 * Math.sin(t * 3.7);
  if (!rm && Number.isFinite(age) && age >= 0 && age < 1.6) {
    const wn = TAU * 1.5;
    const z = 0.15;
    swing += 0.16 * Math.exp(-z * wn * age) * Math.sin(wn * Math.sqrt(1 - z * z) * age);
  }
  const cx = 50 + Math.sin(swing) * 26;
  const cy = 6 + Math.cos(swing) * 26;
  const { css } = metrics(ctx);
  drawLanyard(ctx, 50, 6.4, cx, cy, css);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(swing * 0.6);
  sprite(ctx, `card|${id}|${lang}`, -6, -1, 12, 21, (c, cs) => paintCard(c, id, cs, lang));
  ctx.restore();
  // The hook knob in front of the hanger's wire.
  paintKnob(ctx, 50, 6.2, 2.1, css);
  ctx.restore();
  if (sel > 0 && opts.ring !== false) {
    // 2-px focus ring (`emph`), inset by half its width.
    ctx.strokeStyle = ACCENT[theme];
    ctx.lineWidth = LINE.emph;
    ctx.beginPath();
    rrect(ctx, 1, 1, w - 2, h - 2, Math.min(12, w * 0.08));
    ctx.globalAlpha = Math.min(1, sel * 1.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
