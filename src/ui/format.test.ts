import { describe, expect, it } from 'vitest';
import { fmt, fmtClock, fmtDuration, fmtParam, fmtRate, fmtShort, NNBSP } from './format';

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
    expect(fmt(1_000_000)).toBe('1.00M');
    expect(fmt(1_234_567)).toBe('1.23M');
    expect(fmt(12_345_678)).toBe('12.3M');
    expect(fmt(123_456_789)).toBe('123M');
    expect(fmt(1.5e9)).toBe('1.50B');
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
    expect(fmt(12400, 'es')).toBe(`12${NNBSP}400`);
    expect(fmt(1_234_567, 'es')).toBe('1,23M');
    expect(fmt(2.5, 'es')).toBe('2,5');
  });
});

describe('fmtShort', () => {
  it('uses K in compact contexts', () => {
    expect(fmtShort(950)).toBe('950');
    expect(fmtShort(1000)).toBe('1.00K');
    expect(fmtShort(1234)).toBe('1.23K');
    expect(fmtShort(45_600)).toBe('45.6K');
    expect(fmtShort(999_999)).toBe('999K');
    expect(fmtShort(1.2e6)).toBe('1.20M');
    expect(fmtShort(1.2)).toBe('1.2');
  });
});

describe('fmtRate', () => {
  it('shows sensible precision per magnitude', () => {
    expect(fmtRate(0)).toBe('0');
    expect(fmtRate(0.354)).toBe('0.35');
    expect(fmtRate(1.25)).toBe('1.2');
    expect(fmtRate(45.67)).toBe('45.6');
    expect(fmtRate(456.7)).toBe('456');
    expect(fmtRate(4567)).toBe('4.56K');
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
