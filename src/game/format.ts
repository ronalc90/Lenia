/** Number formatting for game-generated text (doc §5: thousands separator, then K/M/B/T/Qa/Qi, then 1.23e18). */
import type { Text } from '../core/types';

const SUFFIXES = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 10 && a % 1 !== 0) return sign + a.toFixed(1);
  if (a < 1e6) return sign + Math.floor(a).toLocaleString('en-US').replace(/,/g, ' ');
  if (a >= 1e21) return sign + a.toExponential(2);
  const tier = Math.floor(Math.log10(a) / 3);
  const v = a / Math.pow(1000, tier);
  return sign + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + SUFFIXES[tier - 1];
}

/** "×1,5" in Spanish, "×1.5" in English (two decimals at most, trailing zeros dropped). */
export function multText(x: number): Text {
  const s = (Math.round(x * 100) / 100).toString();
  return { es: `×${s.replace('.', ',')}`, en: `×${s}` };
}

/**
 * A multiplier for the main flow, never with decimals (docs/CLARIDAD2.md §2.13; the same rule as ui/format.ts
 * fmtMult): "+25 %" / "+25%" under ×2 (a bonus a child reads as a percent), "×3" from there, "casi ×3" /
 * "almost ×3" when it rounds UP by more than 0,05, "×1" when it does nothing. Exact factors (multText) only
 * behind «Ver cuentas» and in the tree's before → after.
 */
export function multWords(x: number): Text {
  const SNAP = 0.05;
  if (!Number.isFinite(x) || x <= 0) return { es: '×0', en: '×0' };
  if (Math.abs(x - 1) < 0.005) return { es: '×1', en: '×1' };
  if (x < 1) {
    const p = Math.max(1, Math.round((1 - x) * 100));
    return { es: `−${p} %`, en: `−${p}%` };
  }
  if (x < 2 - SNAP) {
    const p = Math.max(1, Math.round((x - 1) * 100 + 1e-9)); // 1,075 reads +8 %, not a float 7,4999…
    return { es: `+${p} %`, en: `+${p}%` };
  }
  const n = Math.round(x);
  return n - x > SNAP ? { es: `casi ×${n}`, en: `almost ×${n}` } : { es: `×${n}`, en: `×${n}` };
}

/** 0.1 → "10%", 0.025 → "2.5%". */
export function formatPct(x: number): string {
  const p = x * 100;
  return `${Math.abs(p - Math.round(p)) < 1e-6 ? Math.round(p) : p.toFixed(1)}%`;
}

/** Seconds → "1 h 05 min" / "3 min 10 s" / "12 s". */
export function formatDuration(s: number): string {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

/**
 * At most `max` user-perceived characters (grapheme clusters), so an emoji, a flag or a ZWJ family
 * is never cut in half (QA1 #5). Falls back to code points without Intl.Segmenter.
 */
export function clipGraphemes(s: string, max: number): string {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  const parts = Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
  if (parts.length <= max) return s;
  // Without a segmenter, never leave a dangling joiner or variation selector at the end.
  return parts.slice(0, max).join('').replace(/[‍︎️]+$/u, '');
}
