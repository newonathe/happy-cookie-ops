import { describe, expect, it } from 'vitest';
import { PESO, PESO2, amt, amtExact, plural } from '@/store/engine/ops-engine';

/**
 * Money formatting is customer-visible and appears on the ledger. These are the exact
 * strings the prototype produced; if one of them changes, a receipt changes.
 */
describe('peso formatting', () => {
  it('groups thousands and drops decimals for whole amounts', () => {
    expect(PESO(0)).toBe('₱0');
    expect(PESO(150)).toBe('₱150');
    expect(PESO(1200)).toBe('₱1,200');
    expect(PESO(23_450)).toBe('₱23,450');
  });

  it('keeps two decimals where the books need them', () => {
    expect(PESO2(38.44)).toBe('₱38.44');
    expect(PESO2(1200)).toBe('₱1,200.00');
  });

  it('never renders a negative zero', () => {
    expect(PESO(-0)).toBe('₱0');
  });
});

describe('quantity phrasing', () => {
  it('pluralises against the count', () => {
    expect(plural(1, 'sale', 'sales')).toBe('1 sale');
    expect(plural(0, 'sale', 'sales')).toBe('0 sales');
    expect(plural(4, 'sale', 'sales')).toBe('4 sales');
  });

  it('reads grams over a kilo as kilos, because that is how she shops', () => {
    expect(amt(1346, 'g')).toBe('1.346 kg');
    expect(amt(999, 'g')).toBe('999 g');
  });

  it('keeps three decimals rather than rounding a quantity away', () => {
    expect(amt(1.5, 'kg')).toBe('1.5 kg');
    expect(amtExact(0.125, 'kg')).toBe('0.125 kg');
  });
});
