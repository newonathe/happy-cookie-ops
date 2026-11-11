import { describe, expect, it } from 'vitest';
import { buildTillLedger } from '@/lib/bazaar/till-ledger';
import type { EventSale } from '@/store/engine/ops-engine';

const sale = (over: Partial<EventSale>): EventSale => ({
  id: 'S1',
  items: { dcf: 2 },
  total: 260,
  gross: 260,
  discount: 0,
  pay: 'Cash',
  ref: '',
  clerk: 'Owner',
  at: Date.UTC(2026, 10, 5, 6, 14),
  tendered: 0,
  change: 0,
  synced: true,
  failed: false,
  ledgerId: null,
  ...over
});

const ledger = (sales: EventSale[], over: Partial<Parameters<typeof buildTillLedger>[0]> = {}) =>
  buildTillLedger({
    sales,
    floatPesos: 500,
    loaded: { dcf: 10, hc: 10 },
    left: { dcf: 7, hc: 10 },
    prices: { dcf: 130, hc: 140 },
    names: { dcf: 'Double Chocolate Fudge', hc: 'Happy Camper' },
    seesTotals: true,
    ...over
  });

describe('the till ledger', () => {
  it('holds float plus cash sales in the drawer, the same sum the server closes the day with', () => {
    const out = ledger([
      sale({ id: 'S3', pay: 'GCash', ref: '1234', total: 130, gross: 130, items: { dcf: 1 } }),
      sale({ id: 'S2', total: 280, gross: 280, items: { hc: 2 }, tendered: 500, change: 220 }),
      sale({ id: 'S1' })
    ]);
    expect(out.drawer).toEqual({
      expectedText: '₱1,040.00',
      floatText: '₱500.00',
      cashSalesText: '₱540.00',
      receivedText: '₱760.00',
      changeGivenText: '₱220.00'
    });
  });

  it('says a blank cash amount was exact, never ₱0, and keeps cash fields off other payments', () => {
    const [digital, typed, exact] = ledger([
      sale({ pay: 'GCash', ref: '1234' }),
      sale({ tendered: 500, change: 240 }),
      sale({})
    ]).rows;
    expect(exact).toMatchObject({ cashGivenText: 'Exact', changeText: null });
    expect(typed).toMatchObject({ cashGivenText: '₱500.00', changeText: '₱240.00' });
    expect(digital).toMatchObject({ cashGivenText: null, changeText: null });
  });

  it('does not guess the starting cash when this phone does not hold it', () => {
    const out = ledger([sale({})], { floatPesos: null });
    expect(out.drawer.floatText).toBeNull();
    expect(out.drawer.expectedText).toBe('₱260.00');
  });

  it('adds each payment method once, leaving out unused ones and freebies', () => {
    const out = ledger([
      sale({ pay: 'Freebie', total: 0, discount: 260 }),
      sale({ pay: 'Maya', ref: '9', total: 130 }),
      sale({})
    ]);
    expect(out.totals?.methods).toEqual([
      { label: 'Cash', count: 1, totalText: '₱260.00' },
      { label: 'Maya', count: 1, totalText: '₱130.00' }
    ]);
    expect(out.totals?.totalText).toBe('₱390.00');
    // A freebie is not a sale to average, and its give-away is not a discount.
    expect(out.totals?.averageText).toBe('₱195.00');
    expect(out.totals?.discountsText).toBeNull();
    expect(out.cookies).toMatchObject({ sold: 6, freebies: 2 });
    expect(out.rows[0]?.totalText).toBe('Free');
  });

  it('shows the amounts a discount changed', () => {
    const [row] = ledger([sale({ total: 240, gross: 260, discount: 20 })]).rows;
    expect(row).toMatchObject({
      subtotalText: '₱260.00',
      discountText: '₱20.00',
      totalText: '₱240.00'
    });
    expect(row?.lines[0]).toEqual({
      qty: 2,
      name: 'Double Chocolate Fudge',
      unitText: '₱130.00',
      lineText: '₱260.00'
    });
  });

  it('measures the target against the whole table, and stops at 100%', () => {
    const out = ledger([sale({})]);
    expect(out.target).toMatchObject({
      amountText: '₱2,700.00',
      percent: 9,
      toGoText: '₱2,440.00'
    });
    const over = ledger([sale({ total: 9000, gross: 9000 })]);
    expect(over.target).toMatchObject({ percent: 100, toGoText: '₱0.00' });
    expect(ledger([], { loaded: {} }).target).toBeNull();
  });

  it('gives a helper without the totals switch no totals and no target, but keeps the drawer', () => {
    const out = ledger([sale({})], { seesTotals: false });
    expect(out.totals).toBeNull();
    expect(out.target).toBeNull();
    expect(out.drawer.expectedText).toBe('₱760.00');
    expect(out.rows).toHaveLength(1);
  });
});
