import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { MoneyLive } from '@/components/live/money/money-live';
import type { LiveMoney, OpsVals } from '@/view-models/vals';
import { setReducedMotion } from './ui-helpers';

/** Money on the espresso ground: the hero, the goal ring and bars, and that no action or notice was lost. */
type Fns = Pick<
  LiveMoney,
  | 'setPeriod'
  | 'recordExpense'
  | 'takeMoneyOut'
  | 'exportPeriod'
  | 'exportAll'
  | 'openBooks'
  | 'openCategories'
  | 'openTaxRules'
>;

function build(over: Partial<LiveMoney> = {}, goal: OpsVals['profitGoal'] = null) {
  const fns: Fns = {
    setPeriod: vi.fn(),
    recordExpense: vi.fn(),
    takeMoneyOut: vi.fn(),
    exportPeriod: vi.fn(),
    exportAll: vi.fn(),
    openBooks: vi.fn(),
    openCategories: vi.fn(),
    openTaxRules: vi.fn()
  };
  const money: LiveMoney = {
    period: 'month',
    periodText: 'November 2026',
    loaded: true,
    revenue: 12000,
    expenses: 4000,
    profit: 8000,
    draw: 500,
    refunded: 200,
    taxSetAside: 360,
    taxRate: 3,
    buckets: [
      { label: 'Wk 1', income: 5000, expenses: 1000 },
      { label: 'Wk 2', income: 7000, expenses: 3000 }
    ],
    categories: [
      { cat: 'Ingredients', amount: 3000, n: 4 },
      { cat: 'Packaging', amount: 1000, n: 2 }
    ],
    transactions: [
      {
        id: 't1',
        label: 'Butter',
        cat: 'Ingredients',
        when: '3 Nov',
        kind: 'expense',
        signed: -3000
      },
      {
        id: 't2',
        label: 'Pouches',
        cat: 'Packaging',
        when: '4 Nov',
        kind: 'expense',
        signed: -1000
      },
      { id: 't3', label: 'Order 12', cat: 'Sales', when: '5 Nov', kind: 'revenue', signed: 12000 }
    ],
    held: [{ name: 'Ateneo bazaar', revenue: 900, expenses: 100 }],
    uncosted: 2,
    ...fns,
    ...over
  };
  return { fns, money, v: { liveMoney: money, profitGoal: goal } as unknown as OpsVals };
}

describe('Money, espresso glass', () => {
  beforeEach(() => setReducedMotion(true));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('draws the goal ring when the goal and profit are known, and none without a goal', () => {
    const { v } = build({}, { goal: 20000, profit: 8000, set: vi.fn() });
    const view = render(<MoneyLive v={v} />);
    const ring = view.getByRole('img', { name: "40% of this month's profit goal" });
    expect(ring.getAttribute('data-goal-pct')).toBe('40');
    expect(view.getByRole('region', { name: 'Goal this month' })).toBeTruthy();
    view.unmount();
    const none = render(<MoneyLive v={build().v} />);
    expect(none.queryByRole('img', { name: /profit goal/ })).toBeNull();
    expect(none.queryByRole('region', { name: 'Goal this month' })).toBeNull();
  });

  it('shows no ring while the goal profit is unread', () => {
    const { v } = build({}, { goal: 20000, profit: null, set: vi.fn() });
    const view = render(<MoneyLive v={v} />);
    expect(view.queryByRole('img', { name: /profit goal/ })).toBeNull();
    expect(view.getByRole('region', { name: 'Goal this month' })).toBeTruthy();
  });

  it('shows where income went for a profit and omits it for a loss', () => {
    const view = render(<MoneyLive v={build().v} />);
    expect(view.getByText('Where income went')).toBeTruthy();
    expect(view.getByText('₱67 kept of every ₱100')).toBeTruthy();
    expect(view.getByRole('region', { name: 'Profit' })).toBeTruthy();
    view.unmount();
    const loss = render(
      <MoneyLive v={build({ revenue: 1000, expenses: 3000, profit: -2000 }).v} />
    );
    expect(loss.queryByText('Where income went')).toBeNull();
    expect(loss.getByRole('region', { name: 'Loss' })).toBeTruthy();
    expect(loss.getAllByText('−₱2,000.00').length).toBeGreaterThan(0);
  });

  it('keeps the tax, draw and refund lines with their copy', () => {
    const view = render(<MoneyLive v={build().v} />);
    expect(view.getByText(/Set aside for tax \(3%\):/)).toBeTruthy();
    expect(view.getByText(/Taken out by you:/)).toBeTruthy();
    expect(view.getByText(/Refunded:/)).toBeTruthy();
  });

  it('keeps every action reachable', () => {
    const { fns, v } = build();
    const view = render(<MoneyLive v={v} />);
    fireEvent.click(view.getByRole('button', { name: 'Record expense' }));
    expect(fns.recordExpense).toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Last 7 days' }));
    expect(fns.setPeriod).toHaveBeenCalledWith('week');
    fireEvent.click(view.getByRole('button', { name: 'Last 30 days' }));
    expect(fns.setPeriod).toHaveBeenCalledWith('days30');
    expect(view.getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    fireEvent.click(view.getByRole('button', { name: 'Record owner draw' }));
    expect(fns.takeMoneyOut).toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Export this period (CSV)' }));
    expect(fns.exportPeriod).toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    expect(view.getByText('Money settings')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Download' }));
    expect(fns.exportAll).toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Back to Money' }));
    expect(view.getByRole('button', { name: 'Record owner draw' })).toBeTruthy();
  });

  it('filters by category, by kind, and clears the category chip', () => {
    const view = render(<MoneyLive v={build().v} />);
    const tx = within(view.getByRole('region', { name: 'Transactions' }));
    expect(tx.getAllByRole('listitem')).toHaveLength(3);
    const ingredients = within(
      view.getByRole('region', { name: 'Where the money went' })
    ).getByRole('button', { name: /Ingredients/ });
    fireEvent.click(ingredients);
    expect(ingredients.getAttribute('aria-pressed')).toBe('true');
    expect(tx.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(tx.getByRole('button', { name: 'Ingredients ×' }));
    expect(tx.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(tx.getByRole('button', { name: 'Income' }));
    expect(tx.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(tx.getByRole('button', { name: 'Expenses' }));
    expect(tx.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(tx.getByRole('button', { name: 'All' }));
    expect(tx.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(ingredients);
    fireEvent.click(ingredients);
    expect(ingredients.getAttribute('aria-pressed')).toBe('false');
  });

  it('opens a transaction and returns', () => {
    const view = render(<MoneyLive v={build().v} />);
    fireEvent.click(view.getByRole('button', { name: /Butter/ }));
    expect(view.queryByRole('region', { name: 'Transactions' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /^Back/ }));
    expect(view.getByRole('region', { name: 'Transactions' })).toBeTruthy();
  });

  it('keeps the empty states, the held-events and uncosted notices', () => {
    const view = render(<MoneyLive v={build().v} />);
    expect(view.getByText('1 open event is not in these books yet')).toBeTruthy();
    expect(view.getByRole('status').textContent).toContain('2 uses of stock in this period');
    view.unmount();
    const empty = render(
      <MoneyLive v={build({ categories: [], transactions: [], held: [], uncosted: 0 }).v} />
    );
    expect(empty.getByText('No expenses in this period.')).toBeTruthy();
    expect(empty.getByText('Nothing recorded in this period.')).toBeTruthy();
    expect(empty.queryByRole('status')).toBeNull();
  });

  it('says the books are not loaded rather than showing zero', () => {
    const view = render(<MoneyLive v={build({ loaded: false }).v} />);
    expect(view.getByText('Books not loaded yet')).toBeTruthy();
    expect(view.queryByRole('region', { name: 'Transactions' })).toBeNull();
  });
});
