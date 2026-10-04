/**
 * A plain-words description of a species' body ("disco con cola", "anillo", "media luna"…) so the
 * bestiary can say WHY two species are different, not only show it. Read from the portrait (the
 * catalog pattern or the best capture) plus the rotation-invariant harmonics of the signature.
 *
 * Calibrated on the 26 catalog patterns (scripts/species-audit.ts era): Orbium → disc with a tail,
 * Gyrorbium/Gyropteron cavus → crescent, Scutium → solid shield, Circium/Helicium cavus/Kronium →
 * ring, Synorbium/Parorbium dividuus → bound pair, Triscutium/Discutium → trefoil, Paraptera/
 * Pentahelicium/Hydrogeminium → four lobes, Helicium solidus/Synptera → spindle.
 */
import type { Pattern, Text } from '../core/types';
import { SIG } from '../detect/signature';

export type ShapeKind = 'pair' | 'ring' | 'trefoil' | 'lobes' | 'spindle' | 'tailed' | 'shield' | 'crescent' | 'cloud' | 'disc';

export const SHAPE_LABELS: Record<ShapeKind, Text> = {
  pair: { es: 'pareja unida', en: 'bound pair' },
  ring: { es: 'anillo', en: 'ring' },
  trefoil: { es: 'trébol', en: 'trefoil' },
  lobes: { es: 'cuatro lóbulos', en: 'four lobes' },
  spindle: { es: 'huso alargado', en: 'long spindle' },
  tailed: { es: 'disco con cola', en: 'disc with a tail' },
  shield: { es: 'escudo macizo', en: 'solid shield' },
  crescent: { es: 'media luna', en: 'crescent' },
  cloud: { es: 'nube difusa', en: 'soft cloud' },
  disc: { es: 'disco', en: 'disc' },
};

export interface ShapeImageFeatures {
  /** 0 round … 1 a line (second moments). */
  aniso: number;
  /** Mean matter in the inner 30 % of the radius over the 30–80 % band (< 0.35 = hollow ring). */
  core: number;
  /** Separate bodies (≥ 0.1, at least 4 cells). */
  pieces: number;
}

export function shapeImageFeatures(p: Pattern): ShapeImageFeatures {
  const { w, h, data } = p;
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      m += v;
      sx += v * (x + 0.5);
      sy += v * (y + 0.5);
    }
  }
  if (!(m > 0)) return { aniso: 0, core: 1, pieces: 0 };
  const cx = sx / m;
  const cy = sy / m;
  let rmax = 0;
  let a = 0;
  let b = 0;
  let c = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (v > 0.05) rmax = Math.max(rmax, Math.hypot(dx, dy));
      a += v * dx * dx;
      b += v * dy * dy;
      c += v * dx * dy;
    }
  }
  const aniso = a + b > 0 ? Math.hypot(a - b, 2 * c) / (a + b) : 0;
  let inner = 0;
  let nIn = 0;
  let outer = 0;
  let nOut = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Math.max(1e-9, rmax);
      const v = data[y * w + x];
      if (r < 0.3) {
        inner += v;
        nIn++;
      } else if (r < 0.8) {
        outer += v;
        nOut++;
      }
    }
  }
  const core = nIn && nOut && outer > 0 ? inner / nIn / (outer / nOut) : 1;
  // Bodies: 8-connected components of matter ≥ 0.1 with at least 4 cells.
  const lab = new Uint8Array(w * h);
  const stack: number[] = [];
  let pieces = 0;
  for (let i = 0; i < w * h; i++) {
    if (lab[i] || data[i] < 0.1) continue;
    let size = 0;
    lab[i] = 1;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % w;
      const y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!lab[q] && data[q] >= 0.1) {
            lab[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (size >= 4) pieces++;
  }
  return { aniso, core, pieces };
}

/** What kind of body this is (first matching rule wins). `sig` = species signature (may be short). */
export function shapeKind(p: Pattern | null, sig: readonly number[]): ShapeKind {
  const g = (i: number, d = 0): number => (sig[i] !== undefined && sig[i] >= 0 ? sig[i] : d);
  if (!p) return shapeKindFromSignature(sig);
  const f = shapeImageFeatures(p);
  if (f.pieces >= 2 || g(SIG.PARTS, 1) >= 1.15 || (f.aniso >= 0.5 && f.core < 0.2)) return 'pair';
  if (f.core < 0.35) return 'ring';
  if (g(SIG.H3) >= 0.2) return 'trefoil';
  if (f.aniso >= 0.45 && g(SIG.H4) >= 0.3) return 'lobes';
  if (f.aniso >= 0.45) return 'spindle';
  if (g(SIG.H1) >= 0.07 && f.core > 2.5) return 'tailed';
  if (g(SIG.DENSITY, 0.6) >= 0.72 && f.aniso < 0.2) return 'shield';
  if (g(SIG.H1) >= 0.07) return 'crescent';
  if (g(SIG.DENSITY, 0.6) < 0.48) return 'cloud';
  return 'disc';
}

/**
 * Without a picture (a discovery named at registration, before its first capture) rings and
 * crescents cannot be told from the harmonics alone: polar bodies count as "tailed", whose name
 * then says what they do (Nadadora, Remolino, Medusa).
 */
function shapeKindFromSignature(sig: readonly number[]): ShapeKind {
  const g = (i: number, d = 0): number => (sig[i] !== undefined && sig[i] >= 0 ? sig[i] : d);
  const aniso = Math.min(1, g(SIG.H2) * 1.1);
  if (g(SIG.PARTS, 1) >= 1.15) return 'pair';
  if (g(SIG.H3) >= 0.2) return 'trefoil';
  if (aniso >= 0.45 && g(SIG.H4) >= 0.3) return 'lobes';
  if (aniso >= 0.45) return 'spindle';
  if (g(SIG.H1) >= 0.07) return 'tailed';
  if (g(SIG.DENSITY, 0.6) >= 0.72 && aniso < 0.2) return 'shield';
  if (g(SIG.DENSITY, 0.6) < 0.48) return 'cloud';
  return 'disc';
}

/** Plain-words body description, es/en. */
export function shapeLabel(p: Pattern | null, sig: readonly number[]): Text {
  return SHAPE_LABELS[shapeKind(p, sig)];
}
