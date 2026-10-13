import { cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { GroceryLive } from '@/components/live/stock/grocery-live';
import { ITEMS, item, movement, row, stock, valsWith } from './stock-fixtures';
import type { LiveStockVals } from '@/lib/stock/live-stock-types';

afterEach(cleanup);

/**
 * axe on the rendered DOM. `color-contrast` is switched off because jsdom has no layout or computed
 * colours to measure; real contrast is checked in a browser (scripts/test-live-smoke.mjs, on the laptop).
 */
async function violations(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } }
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

const pageStock = (movementsState: 'loading' | 'ready' | 'unavailable'): LiveStockVals => {
  const mine = item({ id: 'p', name: 'Butter', status: 'Low', qtyText: '300 g' });
  return stock({
    countNote: 'A count that finds less is booked as an expense.',
    page: {
      item: mine,
      movementsState,
      movements: [
        movement({ id: 'm1' }),
        movement({ id: 'm2', kind: 'waste', changeText: '−120 g', costText: null })
      ],
      close: vi.fn()
    }
  });
};
const groceryStock = (budget: boolean): LiveStockVals =>
  stock({
    grocery: {
      rows: [
        row({ itemId: 'a', name: 'Brown sugar', status: 'Out', lineCostText: 'Cost pending' }),
        row({ itemId: 'b', name: 'Butter' })
      ],
      totalText: '₱176.50',
      budgetText: budget ? '₱2,000.00' : null,
      budgetNoteText: budget ? '₱1,823.50 left' : null,
      overBudget: false
    }
  });

describe('B5 accessibility (axe, no violations)', () => {
  it('inventory list', async () => {
    const { container } = render(<InventoryLive v={valsWith(stock({ online: false }))} />);
    expect(await violations(container)).toEqual([]);
  });
  it('inventory list, empty and filtered', async () => {
    const { container } = render(
      <InventoryLive
        v={valsWith(stock({ items: [ITEMS.Good], counts: { total: 1, out: 0, low: 0 } }))}
      />
    );
    expect(await violations(container)).toEqual([]);
  });
  it.each(['ready', 'loading', 'unavailable'] as const)(
    'item page, movements %s',
    async (state) => {
      const { container } = render(<InventoryLive v={valsWith(pageStock(state))} />);
      expect(await violations(container)).toEqual([]);
    }
  );
  it('grocery with a budget', async () => {
    const { container } = render(<GroceryLive v={valsWith(groceryStock(true))} />);
    expect(await violations(container)).toEqual([]);
  });
  it('grocery without a budget', async () => {
    const { container } = render(<GroceryLive v={valsWith(groceryStock(false))} />);
    expect(await violations(container)).toEqual([]);
  });
  it('grocery, empty', async () => {
    const { container } = render(<GroceryLive v={valsWith(stock())} />);
    expect(await violations(container)).toEqual([]);
  });
  it('the loading state of both screens', async () => {
    const a = render(<InventoryLive v={valsWith(null)} />);
    expect(await violations(a.container)).toEqual([]);
    const b = render(<GroceryLive v={valsWith(null)} />);
    expect(await violations(b.container)).toEqual([]);
  });
});
