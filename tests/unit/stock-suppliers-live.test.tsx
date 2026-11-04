import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, expect, it, vi } from 'vitest';
import { SuppliersLive } from '@/components/live/stock/suppliers-live';
import { stock, valsWith } from './stock-fixtures';
import type { OpsVals } from '@/view-models/vals';

afterEach(cleanup);
type Suppliers = NonNullable<OpsVals['liveStockSuppliers']>;
const data = (): Suppliers => ({
  online: true,
  version: 1,
  editing: null,
  itemNames: ['Butter'],
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
      priceCount: 1,
      active: true,
      phone: 'Fixture contact',
      notes: 'Delivery mornings',
      prices: [
        {
          id: 'p1',
          itemName: 'Butter',
          packLabel: '1 kg block',
          pricePesos: 420.5,
          lastBought: '2 Oct',
          previousText: 'Before: ₱438',
          preferred: true,
          active: true
        }
      ]
    },
    { id: 'off', name: 'Old supplier', place: '', priceCount: 0, active: false, prices: [] }
  ]
});
const draw = (suppliers: Suppliers | null) => (
  <SuppliersLive v={{ ...valsWith(stock()), liveSupplierDirectory: suppliers }} />
);

it('makes Add supplier direct even with an empty directory', () => {
  const suppliers = { ...data(), rows: [] };
  render(draw(suppliers));
  expect(screen.getByText('No suppliers yet. Add your first supplier here.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add supplier' }));
  expect(suppliers.add).toHaveBeenCalledTimes(1);
  expect(suppliers.save).not.toHaveBeenCalled();
});

it('opens the exact supplier with prices and history, and retains the directory filter on Back', () => {
  const suppliers = data();
  render(draw(suppliers));
  expect(
    within(screen.getByRole('list', { name: 'Supplier directory' })).getAllByRole('listitem')
  ).toHaveLength(1);
  fireEvent.click(screen.getByLabelText('Show inactive suppliers'));
  fireEvent.click(screen.getByRole('button', { name: /Baking shop/ }));
  expect(screen.getByText('Fixture contact')).toBeTruthy();
  expect(screen.getByText('1 kg block · ₱420.50')).toBeTruthy();
  expect(screen.getByText('Before: ₱438')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit supplier' }));
  expect(suppliers.edit).toHaveBeenCalledWith('one');
  fireEvent.click(screen.getByRole('button', { name: 'Back to suppliers' }));
  expect(screen.getByLabelText('Show inactive suppliers')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: /Old supplier/ }));
  expect(screen.getByText(/Inactive supplier · History is kept/)).toBeTruthy();
  expect(screen.getByText('No saved prices yet.')).toBeTruthy();
  expect(suppliers.save).not.toHaveBeenCalled();
});

it('keeps an unavailable selected supplier explicit instead of displaying another supplier', () => {
  const suppliers = data();
  const ui = render(draw(suppliers));
  fireEvent.click(screen.getByRole('button', { name: /Baking shop/ }));
  ui.rerender(draw({ ...suppliers, rows: suppliers.rows.filter((r) => r.id !== 'one') }));
  expect(screen.getByRole('heading', { name: 'Supplier unavailable' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit supplier' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back to suppliers' }));
  expect(screen.getByRole('heading', { name: 'Suppliers' })).toBeTruthy();
});

it('has accessible directory and detail controls', async () => {
  const { container } = render(draw(data()));
  expect(
    (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
  ).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Baking shop/ }));
  expect(
    (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations
  ).toEqual([]);
});
