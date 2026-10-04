import { beforeEach, describe, expect, it } from 'vitest';
import { clearBazaar, readBazaar, saveBazaar } from '@/lib/offline/bazaar-state';

const KEY = 'hc-live-bazaar';
const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';

beforeEach(() => {
  localStorage.clear();
  clearBazaar();
});

describe('saved bazaar', () => {
  it('round-trips only the bazaar keys', () => {
    saveBazaar({
      event: { id: EVENT, name: 'Fair' },
      sales: [],
      eventPrices: { dcf: 125 },
      orders: [{ name: 'a customer' }]
    });
    const saved = readBazaar();
    expect(saved).toMatchObject({ event: { id: EVENT }, eventPrices: { dcf: 125 } });
    expect(saved).not.toHaveProperty('orders');
  });

  it('never saves the empty start, so it cannot overwrite a saved event', () => {
    saveBazaar({ event: { id: EVENT, name: 'Fair' }, sales: [] });
    saveBazaar({ event: null, sales: [] });
    expect(readBazaar()).toMatchObject({ event: { id: EVENT } });
  });

  it.each([
    ['not JSON', '{oops'],
    ['no event id', JSON.stringify({ event: { name: 'x' }, sales: [] })],
    ['sales not a list', JSON.stringify({ event: { id: EVENT }, sales: {} })],
    ['null', 'null']
  ])('reads nothing from a bad record: %s', (_name, text) => {
    localStorage.setItem(KEY, text);
    expect(readBazaar()).toBeNull();
  });
});
