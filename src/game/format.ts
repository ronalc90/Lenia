/** Number formatting for game-generated text (doc §5: thousands separator, then K/M/B/T/Qa/Qi, then 1.23e18). */
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
