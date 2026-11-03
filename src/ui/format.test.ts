import { describe, expect, it } from 'vitest';
import { datosMissingText, fmt, fmtClock, fmtDuration, fmtFactor, fmtMult, fmtParam, fmtPerSec, fmtRate, fmtShort, gateCount, timesText } from './format';

describe('fmt (currency)', () => {
  it('uses thousands separators up to 999,999', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(7)).toBe('7');
    expect(fmt(999)).toBe('999');
    expect(fmt(1000)).toBe('1,000');
    expect(fmt(12400)).toBe('12,400');
    expect(fmt(999_999)).toBe('999,999');
    expect(fmt(999_999.99)).toBe('999,999');
  });

  it('floors, never rounds up', () => {
    expect(fmt(19.99)).toBe('19');
    expect(fmt(1_239_999)).toBe('1.23M');
    expect(fmt(999_999_999)).toBe('999M');
  });

  it('keeps one decimal for small fractional values', () => {
    expect(fmt(2.56)).toBe('2.5');
    expect(fmt(0.29)).toBe('0.2');
    expect(fmt(3.0)).toBe('3');
  });

  it('switches to M, B, T, Qa, Qi with 3 significant digits', () => {
    expect(fmt(1_000_000)).toBe('1M'); // no trailing zeros (QA3 F15)
    expect(fmt(1_234_567)).toBe('1.23M');
    expect(fmt(12_345_678)).toBe('12.3M');
    expect(fmt(123_456_789)).toBe('123M');
    expect(fmt(1.5e9)).toBe('1.5B');
    expect(fmt(2.25e12)).toBe('2.25T');
    expect(fmt(9.87e15)).toBe('9.87Qa');
    expect(fmt(4.56e18)).toBe('4.56Qi');
    expect(fmt(456e18)).toBe('456Qi');
  });

  it('uses scientific notation beyond Qi', () => {
    expect(fmt(1.23e21)).toBe('1.23e21');
    expect(fmt(9.999e30)).toBe('9.99e30');
  });

  it('handles negatives and non-finite values', () => {
    expect(fmt(-1500)).toBe('-1,500');
    expect(fmt(Infinity)).toBe('∞');
    expect(fmt(NaN)).toBe('0');
  });

  it('uses Spanish separators', () => {
    expect(fmt(12400, 'es')).toBe('12.400');
    expect(fmt(999_999, 'es')).toBe('999.999');
    expect(fmt(1_234_567, 'es')).toBe('1,23M');
    expect(fmt(2.5, 'es')).toBe('2,5');
  });
});

describe('fmtShort', () => {
  it('uses K in compact contexts', () => {
    expect(fmtShort(950)).toBe('950');
    expect(fmtShort(1000)).toBe('1K');
    expect(fmtShort(5000, 'es')).toBe('5K');
    expect(fmtShort(1234)).toBe('1.23K');
    expect(fmtShort(45_600)).toBe('45.6K');
    expect(fmtShort(999_999)).toBe('999K');
    expect(fmtShort(1.2e6)).toBe('1.2M');
    expect(fmtShort(1.2)).toBe('1.2');
  });
});

describe('fmtRate (legacy precision, until PB/PC move to fmtPerSec)', () => {
  it('shows sensible precision per magnitude', () => {
    expect(fmtRate(0)).toBe('0');
    expect(fmtRate(0.354)).toBe('0.35');
    expect(fmtRate(1.25)).toBe('1.2');
    expect(fmtRate(45.67)).toBe('45.6');
    expect(fmtRate(456.7)).toBe('456');
    expect(fmtRate(4567)).toBe('4.56K');
  });
});

describe('fmtPerSec (docs/CLARIDAD2.md §2.13)', () => {
  it('rates ≥ 1 show whole numbers', () => {
    expect(fmtPerSec(1.25)).toBe('1');
    expect(fmtPerSec(12.9)).toBe('12');
    expect(fmtPerSec(45.67, 'es')).toBe('45');
    expect(fmtPerSec(456.7)).toBe('456');
    expect(fmtPerSec(4567)).toBe('4.56K');
  });

  it('rates under 1 keep one decimal and a living one never reads "+0"', () => {
    expect(fmtPerSec(0)).toBe('0');
    expect(fmtPerSec(0.354)).toBe('0.3');
    expect(fmtPerSec(0.354, 'es')).toBe('0,3');
    expect(fmtPerSec(0.04)).toBe('0.1');
  });
});

describe('friendly multipliers (docs/CLARIDAD2.md §2.13: no two-decimal multipliers in the main flow)', () => {
  it('×2,91 reads "casi ×3"', () => {
    expect(fmtMult(2.91, 'es')).toBe('casi ×3');
    expect(fmtMult(2.91, 'en')).toBe('almost ×3');
    expect(fmtMult(2.71, 'es')).toBe('casi ×3');
  });

  it('a whole multiplier, or one that rounds down or up by at most 0.05, reads ×N', () => {
    expect(fmtMult(3, 'es')).toBe('×3');
    expect(fmtMult(2.97, 'es')).toBe('×3');
    expect(fmtMult(2.3, 'es')).toBe('×2');
    expect(fmtMult(12.4, 'en')).toBe('×12');
  });

  it('small bonuses and discounts read as whole percentages, and ×1 as ×1', () => {
    expect(fmtMult(1.25, 'es')).toBe('+25 %');
    expect(fmtMult(1.1, 'en')).toBe('+10%');
    expect(fmtMult(0.85, 'es')).toBe('−15 %');
    expect(fmtMult(1, 'es')).toBe('×1');
    expect(fmtMult(1.002, 'es')).toBe('×1');
  });

  it('never shows two decimals', () => {
    for (const x of [0.5, 0.77, 1.05, 1.333, 1.6, 1.94, 1.96, 2.25, 2.91, 5.55, 17.08])
      for (const l of ['es', 'en'] as const) expect(fmtMult(x, l)).not.toMatch(/\d[.,]\d/);
  });

  it('"Ver cuentas" keeps the exact factor, at most 2 decimals, without trailing zeros', () => {
    expect(fmtFactor(2.25, 'es')).toBe('×2,25');
    expect(fmtFactor(1.5, 'en')).toBe('×1.5');
    expect(fmtFactor(3, 'es')).toBe('×3');
  });
});

describe('durations', () => {
  it('formats human durations', () => {
    expect(fmtDuration(45)).toBe('45 s');
    expect(fmtDuration(12 * 60 + 5)).toBe('12 min');
    expect(fmtDuration(3 * 3600 + 10 * 60)).toBe('3 h 10 min');
    expect(fmtDuration(2 * 3600)).toBe('2 h');
    expect(fmtDuration(2 * 86400 + 5 * 3600)).toBe('2 d 5 h');
  });

  it('formats countdown clocks', () => {
    expect(fmtClock(7)).toBe('0:07');
    expect(fmtClock(150)).toBe('2:30');
    expect(fmtClock(3900)).toBe('1:05:00');
    expect(fmtClock(6.2)).toBe('0:07');
  });

  it('formats parameters by step', () => {
    expect(fmtParam(0.15, 0.001)).toBe('0.150');
    expect(fmtParam(0.0155, 0.0001)).toBe('0.0155');
    expect(fmtParam(13, 1)).toBe('13');
    expect(fmtParam(0.1, 0.01)).toBe('0.10');
  });
});

describe('words that agree with their number (B-16)', () => {
  it('says "1 vez", "3 veces", "once", "3 times"', () => {
    expect(timesText(1, 'es')).toBe('1 vez');
    expect(timesText(3, 'es')).toBe('3 veces');
    expect(timesText(1, 'en')).toBe('once');
    expect(timesText(3, 'en')).toBe('3 times');
  });

  it('says "Te falta 1 Dato" and "Te faltan 12 Datos"', () => {
    expect(datosMissingText(1, 'es')).toBe('Te falta 1 Dato');
    expect(datosMissingText(12, 'es', 'unas 2 sesiones')).toBe('Te faltan 12 Datos — unas 2 sesiones');
    expect(datosMissingText(1, 'en')).toBe('You need 1 more Data');
  });
});

describe('gate counters never overflow (owner bug B-10.3)', () => {
  it('"Sesiones 5/4" reads 4/4 ✓ and its bar stops at 100 %', () => {
    expect(gateCount(5, 4)).toEqual({ text: '4/4 ✓', done: true, frac: 1 });
    expect(gateCount(6, 2)).toEqual({ text: '2/2 ✓', done: true, frac: 1 });
  });

  it('a counter on its way stays a plain fraction', () => {
    expect(gateCount(1, 4)).toEqual({ text: '1/4', done: false, frac: 0.25 });
  });
});
