import { describe, expect, it } from 'vitest';
import {
  PRODUCTS,
  RAW_ORDERS,
  orderCount,
  dropCycle,
  DEFAULT_CFG
} from '@/store/engine/ops-engine';

/**
 * The rules the owner cares about most: what an order costs, how many cookies it is,
 * and which drop it lands in. Ported straight from the prototype, so these tests are
 * the regression net for the port itself.
 */
describe('order maths', () => {
  it('counts every cookie in an order', () => {
    expect(orderCount({ items: { dcf: 6, hc: 6 } })).toBe(12);
    expect(orderCount({ items: {} })).toBe(0);
  });

  it('prices every seeded order to a whole number of centavos', () => {
    const priceOf = new Map(PRODUCTS.map((p) => [p.id, p.price]));
    for (const order of RAW_ORDERS) {
      const items = (order as { items: Record<string, number> }).items;
      const total = Object.entries(items).reduce(
        (sum, [id, qty]) => sum + (priceOf.get(id) ?? 0) * qty,
        0
      );
      expect(Math.round(total * 100) / 100).toBe(total);
    }
  });
});

describe('drop cycle', () => {
  const cycle = dropCycle(Date.now(), DEFAULT_CFG as Record<string, unknown>);

  it('opens before it closes', () => {
    expect(cycle.open).toBeLessThan(cycle.close);
  });

  it('hands boxes over only after ordering has closed', () => {
    expect(cycle.mon).toBeGreaterThan(cycle.close);
  });

  it('picks up on a Monday, the only day boxes are handed over', () => {
    expect(new Date(cycle.mon).getDay()).toBe(1);
  });

  it('puts the next window exactly a week after this one', () => {
    expect(cycle.nextOpen - cycle.open).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('places the weekend windows on Saturday and the Sunday after it', () => {
    expect(new Date(cycle.sat).getDay()).toBe(6);
    expect(new Date(cycle.sun).getDay()).toBe(0);
    expect(cycle.sun).toBeGreaterThan(cycle.sat);
  });
});
