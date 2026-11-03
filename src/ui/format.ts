/**
 * Number and time formatting for the UI.
 *
 * Rules (doc §13/§14 + brief):
 *  - Currency amounts: full digits with thousands separators up to 999,999,
 *    then 3 significant digits + suffix: M, B, T, Qa, Qi, and scientific
 *    notation (1.23e21) beyond the last suffix.
 *  - Compact contexts (buttons, floating numbers) use K too.
 *  - Values are FLOORED, never rounded up: the UI must never show more than
 *    the player actually has.
 *
 * Locale: English uses "," for thousands and "." for decimals; Spanish uses
 * "." for thousands and "," for decimals ("12.400", "1,23M"). A thin space
 * would be the RAE choice, but it renders full-width in monospace fonts.
 */
import type { Lang } from '../core/types';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

interface Sep {
  thousands: string;
  decimal: string;
}

function seps(lang: Lang): Sep {
  return lang === 'es' ? { thousands: '.', decimal: ',' } : { thousands: ',', decimal: '.' };
}

/** Floor with a small epsilon so 0.29*100 does not become 28. */
function floorEps(x: number): number {
  return Math.floor(x + 1e-10 * Math.max(1, Math.abs(x)));
}

function groupInt(n: number, sep: string): string {
  const s = Math.floor(Math.abs(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += sep;
    out += s[i];
  }
  return out;
}

/** n ≥ 1000: 3 significant digits + suffix (or scientific beyond Qi). */
function suffixed(n: number, minTier: number, sp: Sep): string {
  const tier = Math.floor(Math.log10(n) / 3 + 1e-12);
  if (tier >= SUFFIXES.length) return scientific(n, sp);
  const t = Math.max(minTier, tier);
  const scaled = n / Math.pow(1000, t);
  // 3 significant digits, floored.
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const f = Math.pow(10, digits);
  const v = floorEps(scaled * f) / f;
  // Floor may carry 999.99 → 999 (fine); never round up into the next tier. No trailing zeros:
  // "5K", "1.2M", not "5.00K" (QA3 F15).
  const body = digits > 0 ? v.toFixed(digits).replace(/\.?0+$/, '') : v.toFixed(0);
  return body.replace('.', sp.decimal) + SUFFIXES[t];
}

function scientific(n: number, sp: Sep): string {
  const e = Math.floor(Math.log10(n) + 1e-12);
  let m = n / Math.pow(10, e);
  m = floorEps(m * 100) / 100;
  if (m >= 10) return scientific(10 * Math.pow(10, e), sp);
  return m.toFixed(2).replace('.', sp.decimal) + 'e' + e;
}

function signed(n: number, body: (a: number) => string): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : '0';
  if (n < 0) return '-' + body(-n);
  return body(n);
}

/**
 * Currency amount: "999,999" then "1.23M", "45.6B", ... "1.23e21".
 * Fractions below 1,000,000 are floored to an integer, except tiny values
 * (< 10) which keep one decimal when non-integer ("2.5").
 */
export function fmt(n: number, lang: Lang = 'en'): string {
  const sp = seps(lang);
  return signed(n, (a) => {
    if (a < 10 && a !== Math.floor(a)) {
      const v = floorEps(a * 10) / 10;
      return v === Math.floor(v) ? String(v) : v.toFixed(1).replace('.', sp.decimal);
    }
    if (a < 1e6) return groupInt(floorEps(a), sp.thousands);
    return suffixed(a, 2, sp);
  });
}

/** Compact amount for tight spaces: "950", "1.23K", "12.3M". */
export function fmtShort(n: number, lang: Lang = 'en'): string {
  const sp = seps(lang);
  return signed(n, (a) => {
    if (a < 10 && a !== Math.floor(a)) {
      const v = floorEps(a * 10) / 10;
      return v === Math.floor(v) ? String(v) : v.toFixed(1).replace('.', sp.decimal);
    }
    if (a < 1000) return String(floorEps(a));
    return suffixed(a, 1, sp);
  });
}

/**
 * Rate per second, legacy precision ("0.35", "1.2", "45.6", "999", "1.23K"). Kept for the call sites of
 * other packages until they move to fmtPerSec (their tests pin this format); new code uses fmtPerSec.
 */
export function fmtRate(n: number, lang: Lang = 'en'): string {
  const sp = seps(lang);
  return signed(n, (a) => {
    if (a === 0) return '0';
    if (a < 1) return (floorEps(a * 100) / 100).toFixed(2).replace('.', sp.decimal);
    if (a < 100) return (floorEps(a * 10) / 10).toFixed(1).replace('.', sp.decimal);
    if (a < 1000) return String(floorEps(a));
    return suffixed(a, 1, sp);
  });
}

/**
 * Rate per second (docs/CLARIDAD2.md §2.13): whole numbers from 1 ("+12/s"), one decimal below it
 * ("0,3"), "1.23K" from 1000. Floored like every amount; a rate above 0 never reads "0" (a living
 * creature that "da +0/s" was QA-CLARIDAD #200), so the smallest one shows 0,1.
 */
export function fmtPerSec(n: number, lang: Lang = 'en'): string {
  const sp = seps(lang);
  return signed(n, (a) => {
    if (a === 0) return '0';
    if (a < 1) return Math.max(0.1, floorEps(a * 10) / 10).toFixed(1).replace('.', sp.decimal);
    if (a < 1000) return String(floorEps(a));
    return suffixed(a, 1, sp);
  });
}

/** A multiplier this close to a whole number reads as that number (×2,97 → ×3, ×1,002 → ×1). */
const MULT_SNAP = 0.05;
/** From here a multiplier reads ×N; below it, a bonus reads as a percentage (+25 %, +60 %). */
const MULT_WHOLE_FROM = 2 - MULT_SNAP;

/**
 * A multiplier for the main flow, never with decimals (docs/CLARIDAD2.md §2.13): "×3"; "casi ×3" /
 * "almost ×3" when it rounds UP by more than 0,05 (×2,91), so it never promises more than it gives;
 * "+25 %" / "−15 %" under ×2 (a small bonus or a discount: ×1,25 read "×1" would say "nothing");
 * "×1" when it does nothing. The exact factor lives behind «Ver cuentas» (fmtFactor).
 */
export function fmtMult(x: number, lang: Lang = 'en'): string {
  if (!Number.isFinite(x) || x <= 0) return '×0';
  const pct = (p: number) => (lang === 'es' ? `${p} %` : `${p}%`);
  if (Math.abs(x - 1) < 0.005) return '×1';
  if (x < 1) return `−${pct(Math.max(1, Math.round((1 - x) * 100)))}`;
  if (x < MULT_WHOLE_FROM) return `+${pct(Math.max(1, Math.round((x - 1) * 100)))}`;
  const n = Math.round(x);
  if (n - x > MULT_SNAP) return lang === 'es' ? `casi ×${fmt(n, lang)}` : `almost ×${fmt(n, lang)}`;
  return `×${fmt(n, lang)}`;
}

/** The exact factor for «Ver cuentas» / "Show the maths": at most 2 decimals, no trailing zeros ("×2,25", "×3"). */
export function fmtFactor(x: number, lang: Lang = 'en'): string {
  const v = Math.round(x * 100) / 100;
  return `×${v >= 1000 ? fmt(Math.round(v), lang) : String(v).replace('.', seps(lang).decimal)}`;
}

/** Fixed decimals with the locale decimal mark (multipliers "×1.30"). */
export function fmtFixed(n: number, digits: number, lang: Lang = 'en'): string {
  return n.toFixed(digits).replace('.', seps(lang).decimal);
}

/** Human duration: "45 s", "12 min", "3 h 10 min", "2 d 5 h". */
export function fmtDuration(seconds: number, lang: Lang = 'en'): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const dd = lang === 'es' ? 'd' : 'd';
  if (d > 0) return h > 0 ? `${d} ${dd} ${h} h` : `${d} ${dd}`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** Countdown clock: "0:07", "2:30", "1:05:00". */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (v: number) => (v < 10 ? '0' + v : String(v));
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** Simulation parameter with a fixed number of decimals, always "." (scientific notation). */
export function fmtParam(v: number, step: number): string {
  const digits = Math.max(0, Math.min(5, Math.ceil(-Math.log10(step) - 1e-9)));
  return v.toFixed(digits);
}

// ───────────── words that agree with their number (docs/ARTE-PULIDO.md B-16) ─────────────

/** "1 vez" / "3 veces", "once" / "3 times" (the species sheet's "La viste N veces"). */
export function timesText(n: number, lang: Lang): string {
  if (lang === 'es') return n === 1 ? '1 vez' : `${fmt(n, lang)} veces`;
  return n === 1 ? 'once' : `${fmt(n, lang)} times`;
}

/** "Te falta 1 Dato" / "Te faltan 12 Datos — unas 2 sesiones" (the Tree's have/need line). */
export function datosMissingText(n: number, lang: Lang, sessions: string | null = null): string {
  const base = lang === 'es' ? (n === 1 ? 'Te falta 1 Dato' : `Te faltan ${fmt(n, lang)} Datos`) : `You need ${fmt(n, lang)} more Data`;
  return sessions ? `${base} — ${sessions}` : base;
}

/**
 * A gate counter that never overflows (owner bug, docs/ARTE-PULIDO.md B-10.3): "Sesiones 4/4 ✓", not
 * "5/4"; the bar stops at 100 %.
 */
export function gateCount(have: number, need: number): { text: string; done: boolean; frac: number } {
  const done = have >= need;
  const shown = Math.max(0, Math.min(have, need));
  return { text: done ? `${need}/${need} ✓` : `${shown}/${need}`, done, frac: need > 0 ? Math.min(1, Math.max(0, have / need)) : 1 };
}
