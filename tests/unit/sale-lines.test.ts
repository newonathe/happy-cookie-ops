import { describe, expect, it } from 'vitest';
import { saleLines } from '@/lib/bazaar/sale-lines';

describe('saleLines', () => {
  it('gives each cookie its own line', () => {
    expect(saleLines('3× Happy Camper, 2× PB & Miso')).toEqual([
      { qty: 3, name: 'Happy Camper' },
      { qty: 2, name: 'PB & Miso' }
    ]);
  });

  it('leaves out cookies that were taken off again', () => {
    expect(saleLines('0× Happy Camper, 0× PB & Miso, 1× Oat')).toEqual([{ qty: 1, name: 'Oat' }]);
  });

  it('keeps a comma inside a name', () => {
    expect(saleLines('1× Salt, Honey & Oat, 2× Plain')).toEqual([
      { qty: 1, name: 'Salt, Honey & Oat' },
      { qty: 2, name: 'Plain' }
    ]);
  });

  it('has no lines for an empty sale', () => {
    expect(saleLines('')).toEqual([]);
    expect(saleLines('0× Oat')).toEqual([]);
  });
});
