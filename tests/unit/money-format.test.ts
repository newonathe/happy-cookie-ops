import { describe, expect, it } from 'vitest';
import { peso, pesoUnit, roundCentavos } from '@/lib/money/format';
import { dayText } from '@/lib/date/day-text';

describe('peso', () => {
  it('always writes two decimals and groups thousands', () => {
    expect(peso(12500)).toBe('₱125.00');
    expect(peso(12550)).toBe('₱125.50');
    expect(peso(250000)).toBe('₱2,500.00');
    expect(peso(2000000)).toBe('₱20,000.00');
    expect(peso(123456789)).toBe('₱1,234,567.89');
  });

  it('writes zero and puts the minus before the sign', () => {
    expect(peso(0)).toBe('₱0.00');
    expect(peso(-500)).toBe('-₱5.00');
    expect(peso(-123456)).toBe('-₱1,234.56');
    expect(peso(-0)).toBe('₱0.00');
  });

  it('rounds a fraction of a centavo to whole centavos, halves away from zero', () => {
    expect(peso(2875.25)).toBe('₱28.75');
    expect(peso(100.5)).toBe('₱1.01');
    expect(peso(-100.5)).toBe('-₱1.01');
    expect(peso(100.49)).toBe('₱1.00');
  });

  it('refuses a number that is not one', () => {
    expect(() => peso(Number.NaN)).toThrow(TypeError);
    expect(() => peso(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('roundCentavos', () => {
  it('keeps whole centavos and rounds halves away from zero', () => {
    expect(roundCentavos(7)).toBe(7);
    expect(roundCentavos(0.5)).toBe(1);
    expect(roundCentavos(-0.5)).toBe(-1);
    expect(roundCentavos(-0.4)).toBe(0);
  });
});

describe('pesoUnit', () => {
  it('keeps a cost per cookie to the four decimals of a centavo it was typed with, and at least two', () => {
    expect(pesoUnit(1200.5)).toBe('₱12.005');
    expect(pesoUnit(2875.25)).toBe('₱28.7525');
    expect(pesoUnit(1000)).toBe('₱10.00');
    expect(pesoUnit(0)).toBe('₱0.00');
  });

  it('refuses a number that is not one', () => {
    expect(() => pesoUnit(Number.NaN)).toThrow(TypeError);
  });
});

describe('dayText', () => {
  const now = new Date(2026, 9, 15);

  it('writes weekday, day and month, in that order, whatever the locale', () => {
    expect(dayText('2026-10-24', now)).toBe('Sat, 24 Oct');
    expect(dayText('2026-10-14', now)).toBe('Wed, 14 Oct');
    expect(dayText('2026-01-01', now)).toBe('Thu, 1 Jan');
  });

  it('adds the year only when it is not the current one', () => {
    expect(dayText('2026-12-12', now)).toBe('Sat, 12 Dec');
    expect(dayText('2027-01-02', now)).toBe('Sat, 2 Jan 2027');
    expect(dayText('2025-12-31', now)).toBe('Wed, 31 Dec 2025');
  });

  it('hands back anything that is not a real calendar day', () => {
    expect(dayText('', now)).toBe('');
    expect(dayText('10/24/2026', now)).toBe('10/24/2026');
    expect(dayText('2026-02-30', now)).toBe('2026-02-30');
    expect(dayText('2026-13-01', now)).toBe('2026-13-01');
  });
});
