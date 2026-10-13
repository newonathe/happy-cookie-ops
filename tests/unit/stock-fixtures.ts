import { vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import type {
  GroceryRowView,
  LiveStockVals,
  StockItemView,
  StockMovementView,
  StockStatus
} from '@/lib/stock/live-stock-types';

/** Seeded `liveStock` objects for the B5 screen tests. The actions are spies so a test can see what a tap called. */
export function item(over: Partial<StockItemView> & { id: string; name: string }): StockItemView {
  return {
    category: 'Ingredients',
    unit: 'g',
    active: true,
    qtyText: '1,250 g',
    status: 'Good',
    levelText: 'Low below 500 g',
    lastCountedText: 'Counted 3 Oct',
    costText: '₱0.09 per g · average',
    supplier: 'Mill & Co',
    lastPaidText: 'Last paid ₱88.25 · 3 Oct',
    open: vi.fn(),
    receive: vi.fn(),
    count: vi.fn(),
    waste: vi.fn(),
    adjust: vi.fn(),
    edit: vi.fn(),
    ...over
  };
}

export const ITEMS: Record<StockStatus, StockItemView> = {
  Out: item({
    id: 'i-out',
    name: 'Brown sugar',
    qtyText: '0 g',
    status: 'Out',
    costText: 'Cost pending',
    lastPaidText: null,
    lastCountedText: 'Opening count pending'
  }),
  Low: item({ id: 'i-low', name: 'Butter', qtyText: '300 g', status: 'Low' }),
  Good: item({ id: 'i-good', name: 'Flour', qtyText: '1,250 g', status: 'Good' })
};

export function movement(over: Partial<StockMovementView> & { id: string }): StockMovementView {
  return {
    kind: 'receipt',
    changeText: '+500 g',
    costText: '₱42.50',
    supplier: 'Mill & Co',
    reason: 'Weekly delivery',
    // 3 Oct 2026, 2:15 PM in Manila (06:15 UTC).
    at: Date.UTC(2026, 9, 3, 6, 15),
    ...over
  };
}

export function row(
  over: Partial<GroceryRowView> & { itemId: string; name: string }
): GroceryRowView {
  return {
    status: 'Low',
    haveText: '300 g',
    neededText: '2,000 g',
    toBuyText: '2 × 1 kg (2 kg)',
    packText: '1 kg bag',
    bestPriceText: '₱0.09 per g',
    supplier: 'Mill & Co',
    lineCostText: '₱176.50',
    bought: vi.fn(),
    ...over
  };
}

export function stock(over: Partial<LiveStockVals> = {}): LiveStockVals {
  const items = [ITEMS.Out, ITEMS.Low, ITEMS.Good];
  return {
    online: true,
    items,
    counts: { total: items.length, out: 1, low: 1 },
    page: null,
    countNote: null,
    grocery: {
      rows: [],
      totalText: '₱0.00',
      budgetText: null,
      budgetNoteText: null,
      overBudget: false
    },
    ...over
  };
}

/** Only `liveStock` is read by the new screens; the rest of OpsVals is not needed. */
export function valsWith(liveStock: LiveStockVals | null): OpsVals {
  return { liveStock } as unknown as OpsVals;
}
