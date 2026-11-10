import { describe, expect, it } from 'vitest';
import type { ToastKind } from './ctx';
import { SESSION_TOAST_MAX_MS } from '../game/cycleBalance';
import { RecentToasts, TOAST_CALM_MS, TOAST_MIN_MS, TOAST_READ_MS, TOAST_REPEAT_MS, ToastQueue, toastMs } from './toastQueue';

interface T {
  text: string;
  kind: ToastKind;
}

/** Frames of 16 ms with `held` from a script; logs every entry and exit with its time. */
function play(q: ToastQueue<T>, from: number, to: number, held: (t: number) => boolean, log: { t: number; what: string; text: string }[], capMs = 3000): void {
  for (let t = from; t <= to; t += 16) {
    const s = q.step(t, held(t), capMs);
    if (s && 'enter' in s) log.push({ t, what: 'in', text: s.enter.text });
    else if (s && 'leave' in s) {
      log.push({ t, what: 'out', text: s.leave.text });
      // Its exit animation (160 ms) frees the slot.
      const end = t + 160;
      for (let u = t + 16; u < end; u += 16) q.step(u, held(u), capMs);
      q.gone();
      t = end;
    }
  }
}

/** How long each entry stayed before it started to leave (ms). */
function shownFor(log: { t: number; what: string; text: string }[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].what !== 'in') continue;
    const o = log.slice(i + 1).find((e) => e.what === 'out' && e.text === log[i].text);
    if (o) out.push(o.t - log[i].t);
  }
  return out;
}

// QA-3 §1a (v0.026): 40 toasts made 70 entries. Copy A entered and left within 0–5 ms, copy B came back with the
// same text and left within 2–15 ms: achievements flashed twice and could not be read.
describe('a toast enters once and stays readable (QA-3 §1a, N12)', () => {
  it('QA-3: an achievement pushed while VELA talks waits for her; it never enters under her line and leaves at once', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    // VELA talks from 0 to 2000 ms; «Logro: Primera semilla» arrives at 100 ms.
    const vela = (t: number) => t < 2000;
    play(q, 0, 50, vela, log);
    q.push({ text: 'Logro: Primera semilla', kind: 'gold' }, 100);
    play(q, 100, 8000, vela, log);
    const ins = log.filter((e) => e.what === 'in');
    expect(ins).toHaveLength(1);
    expect(ins[0].t).toBeGreaterThanOrEqual(2000 + TOAST_CALM_MS - 16);
    for (const ms of shownFor(log)) expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('QA-3: VELA starting right after a toast entered never sends it away and back (one entry, read for at least 1 s)', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    q.push({ text: 'Nueva nota en la Bitácora', kind: 'info' }, 0);
    // The same event starts VELA a few frames later, and she talks in two lines with a short gap.
    const vela = (t: number) => (t >= 40 && t < 1500) || (t >= 1700 && t < 3200);
    play(q, 0, 10000, vela, log);
    expect(log.filter((e) => e.what === 'in')).toHaveLength(1);
    for (const ms of shownFor(log)) expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('a toast already read gives way to VELA for good (it never comes back for a second round)', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    q.push({ text: 'Logro: Nadadora', kind: 'gold' }, 0);
    const vela = (t: number) => t >= 1800 && t < 4000;
    play(q, 0, 10000, vela, log);
    const ins = log.filter((e) => e.what === 'in');
    expect(ins).toHaveLength(1);
    const out = log.find((e) => e.what === 'out')!;
    expect(out.t).toBeGreaterThanOrEqual(ins[0].t + TOAST_READ_MS);
    expect(out.t).toBeLessThan(1800 + 50);
  });

  it('a flickering «talking» never bounces a toast (five lines, each with a gap)', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    const vela = (t: number) => t < 6000 && t % 1200 < 1000;
    for (const [i, text] of ['Logro: Archivista', 'Logro: Rareza', 'Aprendiste: no todas prenden. +2 Datos'].entries()) q.push({ text, kind: 'gold' }, 10 + i);
    play(q, 0, 20000, vela, log);
    const ins = log.filter((e) => e.what === 'in');
    expect(new Set(ins.map((e) => e.text)).size).toBe(ins.length);
    for (const ms of shownFor(log)) expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('a warning still enters while VELA talks (it is about what the finger just did)', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    q.push({ text: 'Este aparato va despacio', kind: 'warn' }, 0);
    play(q, 0, 200, () => true, log);
    expect(log[0]).toMatchObject({ what: 'in', t: 0 });
  });

  it('in a short run (capped at 1.5 s) every toast still shows its full time', () => {
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    q.push({ text: 'Logro: Algo se quedó', kind: 'gold' }, 0);
    play(q, 0, 4000, () => false, log, 1500);
    expect(shownFor(log)).toEqual([expect.any(Number)]);
    expect(shownFor(log)[0]).toBeGreaterThanOrEqual(1500 - 16);
  });
});

// QA-4 N12: «Logro: Nadadora» stayed 1.3 s and «New note in the Journal» 1.4 s (raw/qa-c1-part2, qa-c2-part2), and
// «Aprendiste por qué pasa» came twice. A toast stays at least 2.5 s plus a little per character, and the same
// text never comes back within half a minute.
describe('every toast can be read (QA-4 N12)', () => {
  it('QA-4 N12: a toast stays at least 2.5 s, longer when it is longer', () => {
    expect(TOAST_MIN_MS).toBeGreaterThanOrEqual(2500);
    expect(toastMs('Logro: Nadadora', false)).toBeGreaterThanOrEqual(2500);
    expect(toastMs('Logro: Nadadora', true)).toBeGreaterThanOrEqual(2500);
    expect(toastMs('Ahora 2 luz/s → con Nutrientes 3 luz/s. Hasta el final de la sesión.', false)).toBeGreaterThan(toastMs('Logro: Nadadora', false));
    const q = new ToastQueue<T>();
    const log: { t: number; what: string; text: string }[] = [];
    q.push({ text: '2 notas nuevas', kind: 'info' }, 0);
    q.push({ text: 'Logro: Nadadora', kind: 'gold' }, 0);
    q.push({ text: 'Logro: Archivista', kind: 'gold' }, 0);
    play(q, 0, 20000, () => false, log, Infinity);
    for (const ms of shownFor(log)) expect(ms).toBeGreaterThanOrEqual(2500 - 16);
  });

  it('QA-4 N12: in a run a toast is still readable (the run cap is the 2.5 s floor)', () => {
    expect(SESSION_TOAST_MAX_MS).toBeGreaterThanOrEqual(TOAST_MIN_MS);
  });

  it('QA-4 N12: the same text is not shown again within half a minute; warnings may repeat', () => {
    const r = new RecentToasts();
    expect(r.repeat('Aprendiste por qué pasa', 'good', 0)).toBe(false);
    expect(r.repeat('Aprendiste por qué pasa', 'good', 25_000)).toBe(true);
    expect(r.repeat('Aprendiste por qué pasa', 'good', TOAST_REPEAT_MS + 1)).toBe(false);
    expect(r.repeat('Placa llena', 'warn', 0)).toBe(false);
    expect(r.repeat('Placa llena', 'warn', 100)).toBe(false);
  });
});
