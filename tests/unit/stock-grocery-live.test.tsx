import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroceryLive } from '@/components/live/stock/grocery-live';
import { row, stock, valsWith } from './stock-fixtures';
import type { LiveStockVals } from '@/lib/stock/live-stock-types';

afterEach(cleanup);
const draw = (liveStock: LiveStockVals | null) => render(<GroceryLive v={valsWith(liveStock)} />);
const grocery = (over: Partial<LiveStockVals['grocery']>): LiveStockVals =>
  stock({
    grocery: {
      rows: [],
      totalText: '₱0.00',
      budgetText: null,
      budgetNoteText: null,
      overBudget: false,
      ...over
    }
  });

describe('B5 Grocery', () => {
  it('shows "Stock is loading." and does not crash when liveStock is null', () => {
    draw(null);
    expect(screen.getByRole('heading', { level: 1, name: 'Grocery list' })).toBeTruthy();
    expect(screen.getByText('Stock is loading.')).toBeTruthy();
  });

  it('an empty list says everything is Good', () => {
    draw(grocery({}));
    expect(screen.getByText('Nothing to buy. Everything is Good.')).toBeTruthy();
  });

  it('draws every field of a row, with the status as a word', () => {
    const out = row({ itemId: 'a', name: 'Brown sugar', status: 'Out', haveText: '0 g' });
    const low = row({ itemId: 'b', name: 'Butter', status: 'Low' });
    draw(grocery({ rows: [out, low], totalText: '₱353.00' }));
    const items = within(screen.getByRole('list', { name: 'Things to buy' })).getAllByRole(
      'listitem'
    );
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Out')).toBeTruthy();
    expect(within(items[1]!).getByText('Low')).toBeTruthy();
    const text = items[1]!.textContent ?? '';
    for (const part of [
      'Butter',
      'Have',
      '300 g',
      'Needed',
      '2,000 g',
      'To buy',
      '2 × 1 kg (2 kg)',
      '1 kg bag',
      '₱0.09 per g',
      'Mill & Co',
      '₱176.50'
    ])
      expect(text).toContain(part);
  });

  it('"I bought these" calls bought for that row only', () => {
    const a = row({ itemId: 'a', name: 'Brown sugar', status: 'Out' });
    const b = row({ itemId: 'b', name: 'Butter' });
    draw(grocery({ rows: [a, b] }));
    const buttons = screen.getAllByRole('button', { name: /I bought these/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(b.bought).toHaveBeenCalledTimes(1);
    expect(a.bought).not.toHaveBeenCalled();
  });

  it('shows Cost pending verbatim', () => {
    const r = row({
      itemId: 'a',
      name: 'Salt',
      bestPriceText: 'Cost pending',
      lineCostText: 'Cost pending'
    });
    draw(grocery({ rows: [r], totalText: 'Cost pending' }));
    expect(screen.getAllByText('Cost pending').length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent).not.toMatch(/₱0(\.00)?(?!\.\d)/);
  });

  it('without a budget: a running total and nothing about a budget', () => {
    draw(grocery({ rows: [row({ itemId: 'a', name: 'Butter' })], totalText: '₱1,234.50' }));
    const totals = screen.getByLabelText('Totals');
    expect(totals.textContent).toContain('Running total');
    expect(totals.textContent).toContain('₱1,234.50');
    expect(document.body.textContent).not.toMatch(/budget/i);
    expect(document.body.textContent).not.toMatch(/\b(over|left)\b/i);
  });

  it('with a budget: the budget and its note, with the word in the text', () => {
    draw(
      grocery({
        rows: [row({ itemId: 'a', name: 'Butter' })],
        totalText: '₱1,234.50',
        budgetText: '₱2,000.00',
        budgetNoteText: '₱765.50 left'
      })
    );
    const totals = screen.getByLabelText('Totals');
    expect(totals.textContent).toContain('Budget');
    expect(totals.textContent).toContain('₱2,000.00');
    expect(totals.textContent).toContain('₱765.50 left');
    cleanup();
    draw(
      grocery({
        rows: [row({ itemId: 'a', name: 'Butter' })],
        totalText: '₱2,120.00',
        budgetText: '₱2,000.00',
        budgetNoteText: '₱120 over',
        overBudget: true
      })
    );
    expect(screen.getByLabelText('Totals').textContent).toContain('₱120 over');
  });

  it('says Offline when offline', () => {
    draw(stock({ online: false }));
    expect(screen.getByText(/Offline/)).toBeTruthy();
  });
});
