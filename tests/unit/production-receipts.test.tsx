import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductionReceipts } from '@/components/live/production/production-receipts';
import type { LiveProductionReceipt } from '@/lib/production/live-production-types';
import { violations } from './ui-helpers';

const receipt = (over: Partial<LiveProductionReceipt> = {}): LiveProductionReceipt => ({
  id: 'work-a',
  name: 'Double Chocolate Fudge',
  kind: 'batch',
  quantity: 26,
  rejects: 2,
  dropNo: 5,
  version: 3,
  at: Date.parse('2026-11-04T07:00:00Z'),
  usedDough: 12,
  shortfall: [],
  duplicate: false,
  stockState: 'loading',
  inventoryReady: false,
  balance: null,
  checkedAt: null,
  retry: vi.fn(),
  ...over
});

it('labels a recovered acknowledgement without claiming freshly checked stock', () => {
  const row = receipt({ stockState: 'unread', number: 3 });
  render(<ProductionReceipts rows={[row]} />);
  expect(screen.getByText('Saved earlier. Stock has not been checked.')).toBeTruthy();
  expect(screen.queryByText('Ingredient balances could not be refreshed.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Check recorded stock' }));
  expect(row.retry).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /confirm|save batch/i })).toBeNull();
});
afterEach(cleanup);

it('keeps a small acknowledged shortage visible instead of rounding it to zero', () => {
  render(<ProductionReceipts rows={[receipt({ shortfall: [{ name: 'Butter', by: 0.0001, unit: 'g' }] })]} />);
  expect(screen.getByText('Butter: 0.0001 g short')).toBeTruthy();
});

it('identifies an acknowledged replay without implying another batch was recorded', () => {
  render(<ProductionReceipts rows={[receipt({ duplicate: true })]} />);
  expect(screen.getByText('Already recorded. No second entry was added.')).toBeTruthy();
  expect(screen.getAllByText('26 cookies baked')).toHaveLength(1);
});

it('shows acknowledged output while stock is still being checked, without claiming zero', () => {
  render(<ProductionReceipts rows={[receipt()]} />);
  const saved = screen.getByRole('region', { name: 'Recently saved' });
  expect(within(saved).getByText('26 cookies baked')).toBeTruthy();
  expect(within(saved).getByText('24 good · 2 not for sale')).toBeTruthy();
  expect(within(saved).getByText(/Drop 5 · Recipe version 3/)).toBeTruthy();
  expect(within(saved).getByText('Saved. Checking recorded stock…')).toBeTruthy();
  expect(within(saved).queryByText(/Recorded baked stock/)).toBeNull();
});

it('keeps the saved result during refresh failure and offers only a read retry', () => {
  const row = receipt({
    stockState: 'failed',
    shortfall: [{ name: 'Bread flour', by: 20, unit: 'g' }]
  });
  render(<ProductionReceipts rows={[row]} />);
  expect(screen.getByText('Saved. Stock could not be refreshed.')).toBeTruthy();
  expect(screen.getByText('Bread flour: 20 g short')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry stock refresh' }));
  expect(row.retry).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /confirm|save batch/i })).toBeNull();
});

it('distinguishes confirmed zero baked stock from a failed ingredients refresh', async () => {
  const ui = render(
    <ProductionReceipts
      rows={[
        receipt({ stockState: 'read', balance: 0, checkedAt: Date.parse('2026-11-04T07:01:00Z') })
      ]}
    />
  );
  expect(screen.getByText('Recorded baked stock · Drop 5: 0 cookies')).toBeTruthy();
  expect(screen.getByText('Ingredient balances could not be refreshed.')).toBeTruthy();
  expect(await violations(ui.container)).toEqual([]);
});

it('keeps separate dough and cookie receipts with their original drops', () => {
  render(
    <ProductionReceipts
      rows={[
        receipt(),
        receipt({
          id: 'work-b',
          name: 'Happy Camper',
          kind: 'dough',
          quantity: 12,
          rejects: 0,
          dropNo: 6,
          stockState: 'read',
          inventoryReady: true,
          balance: 18,
          checkedAt: Date.parse('2026-11-04T07:01:00Z')
        })
      ]}
    />
  );
  const earlier = screen.getByText('Earlier saved work (1)');
  expect(earlier.closest('details')?.open).toBe(false);
  fireEvent.click(earlier);
  expect(earlier.closest('details')?.open).toBe(true);
  expect(screen.getByText('12 dough portions prepared')).toBeTruthy();
  expect(screen.getByText('Recorded chilled dough: 18 portions')).toBeTruthy();
  expect(screen.getAllByText('Recently saved')).toHaveLength(1);
  expect(screen.getByText(/Drop 6 · Recipe version 3/)).toBeTruthy();
  expect(screen.getByText('26 cookies baked')).toBeTruthy();
});
