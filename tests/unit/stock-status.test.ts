import { describe, expect, it } from 'vitest';
import {
  changeText,
  formatPesos,
  formatQuantity,
  lastCountedText,
  levelText,
  lastPaidText,
  lineCost,
  stockStatus,
  totalText,
  unitCostText
} from '@/lib/stock/stock-status';

/**
 * The words and the status of the live owner's New Stock screens (B5-1, Ethan 13 October). Pure functions. Each `Mutation:` line names a
 * change one of these tests must catch.
 */
describe('stockStatus: Out at 0, Low below the level, Good otherwise', () => {
  it('is Out at zero on hand, with or without a level', () => {
    expect(stockStatus(0, 500)).toBe('Out');
    expect(stockStatus(0, 0)).toBe('Out');
    expect(stockStatus(0, null)).toBe('Out');
    // Mutation: treating 0 with no level as Good would hide an empty shelf.
  });

  it('is Out below zero (a negative quantity is an empty shelf, never a good one)', () => {
    expect(stockStatus(-5, 500)).toBe('Out');
    expect(stockStatus(-0.001, null)).toBe('Out');
  });

  it('is Low strictly below the level', () => {
    expect(stockStatus(499, 500)).toBe('Low');
    expect(stockStatus(499.999, 500)).toBe('Low');
    expect(stockStatus(0.5, 1)).toBe('Low');
    // Mutation: `<=` would call an item at its level Low.
  });

  it('is Good at the level and above it', () => {
    expect(stockStatus(500, 500)).toBe('Good');
    expect(stockStatus(500.001, 500)).toBe('Good');
    expect(stockStatus(10000, 500)).toBe('Good');
  });

  it('an item with no level (null, undefined, 0 or not a number) is Good unless it is at 0', () => {
    expect(stockStatus(3, null)).toBe('Good');
    expect(stockStatus(3, undefined)).toBe('Good');
    expect(stockStatus(3, 0)).toBe('Good');
    expect(stockStatus(0.001, 0)).toBe('Good');
    expect(stockStatus(3, Number.NaN)).toBe('Good');
  });

  it('an unreadable quantity is Out, not Good', () => {
    expect(stockStatus(Number.NaN, 500)).toBe('Out');
  });
});

describe('quantities, levels and changes', () => {
  it('writes a quantity with thousands separators and its unit', () => {
    expect(formatQuantity(1250, 'g')).toBe('1,250 g');
    expect(formatQuantity(0, 'g')).toBe('0 g');
    expect(formatQuantity(12, 'pcs')).toBe('12 pcs');
    expect(formatQuantity(1234567, 'g')).toBe('1,234,567 g');
  });

  it('keeps fractions to three places and no more', () => {
    expect(formatQuantity(0.5, 'kg')).toBe('0.5 kg');
    expect(formatQuantity(2.3333, 'kg')).toBe('2.333 kg');
    expect(formatQuantity(1250.25, 'g')).toBe('1,250.25 g');
    expect(formatQuantity(3.0, 'g')).toBe('3 g');
  });

  it('writes a negative quantity with a true minus, and never negative zero', () => {
    expect(formatQuantity(-30, 'g')).toBe('−30 g');
    expect(formatQuantity(-0, 'g')).toBe('0 g');
    expect(formatQuantity(-0.0001, 'g')).toBe('0 g');
  });

  it('says the level as a sentence, or that there is none', () => {
    expect(levelText(500, 'g')).toBe('Low below 500 g');
    expect(levelText(1250.5, 'g')).toBe('Low below 1,250.5 g');
    expect(levelText(0, 'g')).toBe('No level set');
    expect(levelText(null, 'g')).toBe('No level set');
    expect(levelText(undefined, 'g')).toBe('No level set');
  });

  it('signs the change: plus, true minus, and a plain zero', () => {
    expect(changeText(500, 'g')).toBe('+500 g');
    expect(changeText(-120, 'g')).toBe('−120 g');
    expect(changeText(1250.5, 'g')).toBe('+1,250.5 g');
    expect(changeText(-0.5, 'kg')).toBe('−0.5 kg');
    expect(changeText(0, 'g')).toBe('0 g');
    // Mutation: a hyphen for the minus, or no plus on a gain.
  });
});

describe('last counted', () => {
  it('says the day in the shop’s time zone', () => {
    expect(lastCountedText('2026-10-03T04:00:00.000Z')).toBe('Counted 3 Oct');
    // 23:30 UTC on 3 October is 07:30 on 4 October in Manila.
    expect(lastCountedText('2026-10-03T23:30:00.000Z')).toBe('Counted 4 Oct');
    // Mutation: the device's own time zone would say 3 Oct here.
  });

  it('says the opening count is pending when it was never counted', () => {
    expect(lastCountedText(null)).toBe('Opening count pending');
    expect(lastCountedText(undefined)).toBe('Opening count pending');
    expect(lastCountedText('not a date')).toBe('Opening count pending');
  });
});

describe('last paid', () => {
  it('says what the last delivery cost and the shop’s day', () => {
    expect(lastPaidText(88.25, Date.UTC(2026, 9, 3, 4, 0, 0))).toBe('Last paid ₱88.25 · 3 Oct');
    expect(lastPaidText(1234.5, Date.UTC(2026, 9, 3, 23, 30, 0))).toBe(
      'Last paid ₱1,234.50 · 4 Oct'
    );
  });

  it('is null when nothing was paid, never ₱0.00', () => {
    expect(lastPaidText(null, 1)).toBeNull();
    expect(lastPaidText(undefined, 1)).toBeNull();
    expect(lastPaidText(0, 1)).toBeNull();
    expect(lastPaidText(Number.NaN, 1)).toBeNull();
  });
});

describe('money: an unknown cost is never 0', () => {
  it('writes pesos with separators and centavos', () => {
    expect(formatPesos(1234.5)).toBe('₱1,234.50');
    expect(formatPesos(0)).toBe('₱0.00');
    expect(formatPesos(176.5)).toBe('₱176.50');
    expect(formatPesos(-120)).toBe('−₱120.00');
  });

  it('writes a cost per unit with where it came from', () => {
    expect(unitCostText(0.09, 'g', 'average')).toBe('₱0.09 per g · average');
    expect(unitCostText(0.42, 'g', 'usual')).toBe('₱0.42 per g · usual price');
    expect(unitCostText(1.5, 'pcs', 'supplier')).toBe('₱1.50 per pcs · supplier price');
    expect(unitCostText(42, 'kg', null)).toBe('₱42.00 per kg');
  });

  it('keeps a fraction of a centavo that matters', () => {
    expect(unitCostText(0.0042, 'g', 'average')).toBe('₱0.0042 per g · average');
    expect(unitCostText(0.12345678, 'g', null)).toBe('₱0.1235 per g');
  });

  it('an unknown cost per unit says Cost pending, not ₱0.00', () => {
    expect(unitCostText(null, 'g', null)).toBe('Cost pending');
    expect(unitCostText(Number.NaN, 'g', 'average')).toBe('Cost pending');
    expect(unitCostText(undefined, 'g', null)).toBe('Cost pending');
    // Mutation: `perUnit ?? 0` would print ₱0.00 per g.
  });

  it('a line cost is the quantity times the cost, to the centavo; unknown stays null', () => {
    expect(lineCost(2000, 0.0882)).toBe(176.4);
    expect(lineCost(3, 0.5)).toBe(1.5);
    expect(lineCost(0, 0.5)).toBe(0);
    expect(lineCost(5, null)).toBeNull();
    expect(lineCost(5, Number.NaN)).toBeNull();
    expect(lineCost(Number.NaN, 2)).toBeNull();
  });

  it('a total of known lines is pesos; with unknown lines it says so', () => {
    expect(totalText([176.5, 1000, 58])).toBe('₱1,234.50');
    expect(totalText([])).toBe('₱0.00');
    expect(totalText([100, null])).toBe('₱100.00 · some cost pending');
    expect(totalText([null, null])).toBe('Cost pending');
    expect(totalText([null])).toBe('Cost pending');
    // Mutation: counting an unknown as 0 would print ₱0.00 for a list nobody has priced.
  });

  it('adds centavos without float drift', () => {
    expect(totalText([0.1, 0.2])).toBe('₱0.30');
    expect(totalText([10.1, 20.2, 30.3])).toBe('₱60.60');
  });
});
