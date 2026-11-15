import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { GroceryLive } from '@/components/live/stock/grocery-live';
import { SuppliersLive } from '@/components/live/stock/suppliers-live';
import type { LiveStockVals } from '@/lib/stock/live-stock-types';
import type { OpsVals } from '@/view-models/vals';
import type { ReceiveDeliveryView, StockChangeView } from '@/store/stock-entries';
import { ITEMS, item, movement, row, stock } from './stock-fixtures';
import { setReducedMotion } from './ui-helpers';

/** Stock on the espresso ground: the summary bar and counts, that no action was lost, and the light sub-pages. */
const vals = (liveStock: LiveStockVals | null, over: Partial<OpsVals> = {}) =>
  ({ liveStock, ...over }) as unknown as OpsVals;
const inSubpage = (el: Element | null) => el?.closest('[class*="subpage"]') != null;

beforeEach(() => setReducedMotion(true));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Inventory, espresso glass', () => {
  it('draws the stock health bar and counts from the rows it lists', () => {
    const unknownItem = item({ id: 'u', name: 'Mystery', counted: false, confidence: 'unknown' });
    const view = render(
      <InventoryLive v={vals(stock({ items: [ITEMS.Out, ITEMS.Low, ITEMS.Good, unknownItem] }))} />
    );
    const bar = view.getByRole('img', { name: '1 Out, 1 Low, 1 In stock, 1 Unknown count' });
    expect(bar.querySelectorAll('[data-segment]')).toHaveLength(4);
    expect(view.getByLabelText('Stock counts').textContent).toContain('4 items');
    expect(view.getByLabelText('Stock counts').textContent).toContain('1 In stock');
    expect(view.getByRole('heading', { level: 1, name: 'Inventory' })).toBeTruthy();
  });

  it('keeps every action reachable', () => {
    const openReceive = vi.fn();
    const addItem = vi.fn();
    const startCount = vi.fn();
    const base = stock({ openReceive, addItem, startCount });
    const view = render(<InventoryLive v={vals(base)} />);
    fireEvent.click(view.getByRole('button', { name: 'Add to inventory' }));
    fireEvent.click(view.getByRole('button', { name: 'New item' }));
    fireEvent.click(view.getByRole('button', { name: 'Count stock' }));
    expect(openReceive).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(startCount).toHaveBeenCalledWith('Ingredients');
    expect(view.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(view.getByLabelText('Stock status')).toBeTruthy();
    expect(view.getByRole('group', { name: 'Stock categories' })).toBeTruthy();
    const open = vi.fn();
    cleanup();
    const again = render(
      <InventoryLive v={vals(stock({ items: [item({ id: 'x', name: 'Salt', open })] }))} />
    );
    fireEvent.click(again.getByRole('button', { name: /Salt/ }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('puts the item page, a delivery and a stock change on one light card', () => {
    const base = stock();
    const page = {
      item: ITEMS.Low,
      movementsState: 'ready' as const,
      movements: [movement({ id: 'm1' })],
      close: vi.fn()
    };
    const itemView = render(<InventoryLive v={vals({ ...base, page })} />);
    expect(inSubpage(itemView.getByRole('heading', { level: 1, name: 'Butter' }))).toBe(true);
    fireEvent.click(itemView.getByRole('button', { name: 'Edit item' }));
    expect(ITEMS.Low.edit).toHaveBeenCalledTimes(1);
    cleanup();
    const receive = {
      fixedItem: null,
      step: 'entry',
      items: [],
      suppliers: [],
      supplier: '',
      setSupplier: vi.fn(),
      lines: [],
      addLine: vi.fn(),
      error: null,
      saving: false,
      totalPaid: null,
      someUnpriced: false,
      review: vi.fn(),
      change: vi.fn(),
      save: vi.fn(),
      close: vi.fn()
    } as ReceiveDeliveryView;
    const receiveView = render(<InventoryLive v={vals({ ...base, receive })} />);
    expect(inSubpage(receiveView.getByRole('heading', { level: 1 }))).toBe(true);
    cleanup();
    const change = {
      step: 'entry',
      itemName: 'Butter',
      unit: 'g',
      reason: '',
      setReason: vi.fn(),
      direction: 'less',
      setDirection: vi.fn(),
      amount: '',
      setAmount: vi.fn(),
      note: '',
      setNote: vi.fn(),
      beforeText: null,
      afterText: null,
      error: null,
      saving: false,
      review: vi.fn(),
      change: vi.fn(),
      save: vi.fn(),
      close: vi.fn()
    } as unknown as StockChangeView;
    const changeView = render(<InventoryLive v={vals({ ...base, change })} />);
    expect(inSubpage(changeView.getByRole('heading', { level: 1 }))).toBe(true);
  });

  it('puts the area settings page on a light card', () => {
    const view = render(<InventoryLive v={vals(stock())} />);
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    expect(view.queryByRole('group', { name: 'Stock categories' })).toBeNull();
    expect(inSubpage(view.getByRole('button', { name: 'Back to inventory' }))).toBe(true);
  });
});

describe('Shopping, espresso glass', () => {
  it('shows the counts the page already has and keeps every action', () => {
    const bought = vi.fn();
    const openReceive = vi.fn();
    const edit = vi.fn();
    const count = vi.fn();
    const base = stock();
    const uncounted = { ...base.items[0]!, active: true, counted: false, count };
    const liveStock: LiveStockVals = {
      ...base,
      openReceive,
      items: [uncounted],
      bakePlan: { cookies: 0, edit, open: false } as unknown as LiveStockVals['bakePlan'],
      grocery: {
        rows: [
          row({ itemId: 'a', name: 'Butter', bought, compare: vi.fn() }),
          row({ itemId: 'b', name: 'Salt', toBuyText: 'Nothing to buy' })
        ],
        totalText: '₱353.00',
        budgetText: '₱2,000.00',
        budgetNoteText: '₱1,647.00 remaining',
        overBudget: false,
        unknownCount: 1
      }
    };
    const view = render(
      <GroceryLive v={vals(liveStock, { bakeTotals: { toBakeNum: 24 } } as Partial<OpsVals>)} />
    );
    const totals = view.getByLabelText('Totals');
    expect(totals.textContent).toContain('Items to buy');
    expect(totals.textContent).toContain('1');
    expect(totals.textContent).toContain('24');
    expect(totals.textContent).toContain('₱353.00');
    expect(totals.textContent).toContain('₱1,647.00 remaining');
    fireEvent.click(view.getByRole('button', { name: 'Add to inventory: Butter' }));
    fireEvent.click(view.getByRole('button', { name: 'Add to inventory' }));
    fireEvent.click(view.getByRole('button', { name: /Compare prices/ }));
    fireEvent.click(view.getByRole('button', { name: 'Plan a bake' }));
    fireEvent.click(view.getByRole('button', { name: `Count ${uncounted.name}` }));
    expect(bought).toHaveBeenCalledTimes(1);
    expect(openReceive).toHaveBeenCalledWith(['Butter', 'Salt']);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'View supplier' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('puts the delivery page on a light card', () => {
    const receive = {
      fixedItem: null,
      step: 'entry',
      items: [],
      suppliers: [],
      supplier: '',
      setSupplier: vi.fn(),
      lines: [],
      addLine: vi.fn(),
      error: null,
      saving: false,
      totalPaid: null,
      someUnpriced: false,
      review: vi.fn(),
      change: vi.fn(),
      save: vi.fn(),
      close: vi.fn()
    } as ReceiveDeliveryView;
    const view = render(<GroceryLive v={vals(stock({ receive }))} />);
    expect(inSubpage(view.getByRole('heading', { level: 1 }))).toBe(true);
  });
});

describe('Suppliers, espresso glass', () => {
  const directory = () => ({
    online: true,
    version: 1,
    editing: null,
    itemNames: [],
    add: vi.fn(),
    edit: vi.fn(),
    save: vi.fn(),
    back: vi.fn(),
    close: vi.fn(),
    rows: [
      {
        id: 'one',
        name: 'Baking shop',
        place: 'Market',
        priceCount: 2,
        active: true,
        phone: '0917',
        notes: '',
        prices: []
      }
    ]
  });

  it('lists suppliers on a card and keeps add, open, edit and settings', () => {
    const data = directory();
    const view = render(
      <SuppliersLive
        v={vals(stock(), { liveSupplierDirectory: data } as unknown as Partial<OpsVals>)}
      />
    );
    fireEvent.click(view.getByRole('button', { name: 'Add supplier' }));
    expect(data.add).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(view.getByLabelText('Show inactive suppliers')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: /Baking shop/ }));
    expect(inSubpage(view.getByRole('heading', { level: 1, name: 'Baking shop' }))).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Edit supplier' }));
    expect(data.edit).toHaveBeenCalledWith('one');
    fireEvent.click(view.getByRole('button', { name: 'Back to suppliers' }));
    expect(view.getByRole('list', { name: 'Supplier directory' })).toBeTruthy();
  });
});
