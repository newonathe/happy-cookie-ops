import { describe, expect, it } from 'vitest';
import { renderWithSaleLabels } from '@/lib/display/sale-product-labels';

describe('synchronous sale-name fallback', () => {
  it('keeps known labels and restores every missing entry after rendering', () => {
    const lookup: Record<string, { short: string } | undefined> = { known: { short: 'Chocolate' } };
    const sales = [{ items: { known: 1, retired: 2 } }];
    const before = JSON.stringify(sales);
    const names = renderWithSaleLabels(sales, lookup, () => [
      lookup.known?.short,
      lookup.retired?.short
    ]);
    expect(names).toEqual(['Chocolate', 'Product unavailable']);
    expect(lookup).toEqual({ known: { short: 'Chocolate' } });
    expect(JSON.stringify(sales)).toBe(before);
  });
  it('restores the lookup even when rendering throws', () => {
    const lookup: Record<string, { short: string } | undefined> = {};
    expect(() =>
      renderWithSaleLabels([{ items: { missing: 2 } }], lookup, () => {
        throw new Error('another rendering error');
      })
    ).toThrow('another rendering error');
    expect(Object.keys(lookup)).toEqual([]);
  });
  it('handles inherited property names without changing the object prototype', () => {
    const lookup: Record<string, { short: string } | undefined> = {};
    const items = JSON.parse('{"__proto__":1,"constructor":2}') as Record<string, number>;
    const prototype = Object.getPrototypeOf(lookup);
    renderWithSaleLabels([{ items }], lookup, () => {
      expect(Object.entries(lookup).map(([id, value]) => [id, value?.short])).toEqual([
        ['__proto__', 'Product unavailable'],
        ['constructor', 'Product unavailable']
      ]);
    });
    expect(Object.getPrototypeOf(lookup)).toBe(prototype);
    expect(Object.keys(lookup)).toEqual([]);
  });
});
