import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, expect, it, vi } from 'vitest';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { item, stock, valsWith } from './stock-fixtures';
import type { StockItemPage } from '@/lib/stock/live-stock-types';

afterEach(cleanup);
const page = (): StockItemPage => ({
  item: item({ id: 'butter', name: 'Butter', costText: 'Cost pending' }),
  movements: [],
  movementsState: 'ready',
  close: vi.fn(),
  openPrices: vi.fn(),
  closePrices: vi.fn(),
  pricesOpen: false,
  priceSources: [
    {
      id: 'p1',
      supplierName: 'Supplier A',
      packText: '1 kg block',
      priceText: '₱0.00',
      historyText: 'Before: ₱420.00',
      lastBought: '2 Oct',
      stateText: 'Price not in use'
    }
  ]
});
const view = (p: StockItemPage) => <InventoryLive v={valsWith(stock({ page: p }))} />;

it('opens supplier prices from the item and keeps an unknown unit cost distinct from a saved zero price', () => {
  const p = page(),
    ui = render(view(p));
  fireEvent.click(screen.getByRole('button', { name: 'Supplier prices & history' }));
  expect(p.openPrices).toHaveBeenCalledTimes(1);
  ui.rerender(view({ ...p, pricesOpen: true }));
  expect(screen.getByRole('heading', { name: 'Butter prices' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Butter prices' })).toHaveFocus();
  expect(screen.getByLabelText('Current inventory cost')).toHaveTextContent('Cost pending');
  expect(screen.getByRole('list', { name: 'Supplier prices' })).toHaveTextContent(
    '1 kg block · ₱0.00'
  );
  expect(screen.getByText('Before: ₱420.00')).toBeTruthy();
  expect(screen.getByText('Price not in use')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to item' }));
  expect(p.closePrices).toHaveBeenCalledTimes(1);
  expect(p.close).not.toHaveBeenCalled();
  ui.rerender(view(p));
  expect(screen.getByRole('button', { name: 'Supplier prices & history' })).toHaveFocus();
});

it('has accessible empty and populated price states with Back still available', async () => {
  const p = { ...page(), pricesOpen: true },
    ui = render(view(p));
  const check = async () =>
    expect(
      (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
    ).toEqual([]);
  await check();
  ui.rerender(view({ ...p, priceSources: [] }));
  expect(screen.getByText('No saved supplier prices for this item yet.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back to item' })).toBeTruthy();
  await check();
});
