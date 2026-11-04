import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { LiveMoney } from '@/view-models/vals';
import { MoneyLive } from '@/components/live/money/money-live';

/**
 * The live Money page: one period for every figure, the bars and the list. The bars are the same
 * ledger rows the books sum, grouped; their totals must equal the engine's own `pnlTotals`.
 */
type Wire = Record<string, unknown>;
const DAY = 86_400_000;
const NOW = Date.parse('2026-11-03T04:00:00Z');
const line = (id: string, kind: string, cat: string, pesos: number, daysAgo: number): Wire => ({
  id,
  kind,
  cat,
  label: id,
  amount_cents: pesos * 100,
  at: NOW - daysAgo * DAY
});
const books = {
  basis: 'used',
  lines: [
    line('o1', 'revenue', 'Orders', 8400, 26),
    line('e1', 'expense', 'Ingredients', 5100, 24),
    line('b1', 'revenue', 'Bazaar', 6250, 19),
    line('e2', 'expense', 'Stall rent', 2000, 19),
    line('o2', 'revenue', 'Orders', 3600, 5),
    line('r1', 'refund', 'Refunds', 260, 4),
    line('e3', 'expense', 'Ingredients', 1480, 3),
    line('d1', 'draw', 'Owner draw', 1500, 2)
  ],
  uncosted: [
    { id: 'u1', kind: 'use', item: 'Cream cheese', qty: 225, unit: 'g', at: NOW - 3 * DAY }
  ],
  receipts: [],
  held: [
    {
      scheduled_id: 's1',
      name: 'Holiday pop-up',
      count: 2,
      revenue_cents: 90000,
      expense_cents: 20000
    }
  ]
};
type Rpc = (
  name: string,
  args?: unknown
) => Promise<{ data: unknown; error: { code: string } | null }>;
const rpc = vi.fn<Rpc>(async (name) =>
  name === 'get_books' ? { data: books, error: null } : { data: [], error: null }
);

async function mounted(load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ now: NOW } as never));
  if (load) await act(async () => void (await runtime.loadBooks({ rpc } as never)));
  act(() => runtime.go('pnl'));
  return runtime;
}
const money = (r: OpsRuntime) => r.renderVals().liveMoney as LiveMoney;
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

describe('the live Money page', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('an expense sent again after no answer is the same entry, and closes only when acknowledged', async () => {
    const r = await mounted();
    const posted: Array<{ id: string; at: number }> = [];
    let answer = false;
    rpc.mockImplementation(async (name: string, args?: unknown) => {
      if (name === 'record_expense') {
        posted.push((args as { p_expense: { id: string; at: number } }).p_expense);
        return answer
          ? { data: [{ duplicate: posted.length > 1 }], error: null }
          : { data: null, error: { code: 'XX000' } };
      }
      return name === 'get_books' ? { data: books, error: null } : { data: [], error: null };
    });
    act(() => r.setState({ online: true } as never));
    act(() => money(r).recordExpense());
    act(() => {
      money(r).entry?.setDescription('Parking');
      money(r).entry?.setAmount('50');
      money(r).entry?.review();
    });
    await act(async () => {
      await money(r).entry?.save();
    });
    expect(money(r).entry?.error).toMatch(/not saved/);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 });
    answer = true;
    await act(async () => {
      await money(r).entry?.save();
    });
    expect(posted).toHaveLength(2);
    expect(posted[1]!.id).toBe(posted[0]!.id);
    expect(posted[1]!.at).toBe(posted[0]!.at);
    vi.useRealTimers();
    expect(money(r).entry).toBeNull();
    rpc.mockImplementation(async (name: string) =>
      name === 'get_books' ? { data: books, error: null } : { data: [], error: null }
    );
  });

  it("shows the books' own totals, and the bars add up to them", async () => {
    const r = await mounted();
    const m = money(r);
    expect(m.loaded).toBe(true);
    expect(m.revenue).toBe(8400 + 6250 + 3600 - 260);
    expect(m.expenses).toBe(5100 + 2000 + 1480);
    expect(m.profit).toBe(m.revenue - m.expenses);
    expect(m.draw).toBe(1500);
    expect(sum(m.buckets.map((b) => b.income))).toBe(m.revenue);
    expect(sum(m.buckets.map((b) => b.expenses))).toBe(m.expenses);
    expect(m.held).toEqual([{ name: 'Holiday pop-up', revenue: 900, expenses: 200 }]);
    expect(m.uncosted).toBe(1);
    // Mutation: a chart summing its own way (refunds left in, draws counted as costs) would not match.
  });

  it('one period moves every figure, bar and row together', async () => {
    const r = await mounted();
    act(() => money(r).setPeriod('week'));
    const m = money(r);
    expect(m.period).toBe('week');
    expect(m.revenue).toBe(3600 - 260);
    expect(m.expenses).toBe(1480);
    expect(m.buckets).toHaveLength(7);
    expect(new Set(m.buckets.map((b) => b.label)).size).toBe(7);
    expect(sum(m.buckets.map((b) => b.income))).toBe(m.revenue);
    expect(m.transactions.map((t) => t.id)).toEqual(['d1', 'e3', 'r1', 'o2']);
    expect(m.transactions.find((t) => t.id === 'r1')!.signed).toBe(-260);
    expect(m.transactions.find((t) => t.id === 'o2')!.signed).toBe(3600);
    // The engine's own period is restored for everything else.
    expect(r.renderVals().pl.periodText).toContain('Last 30 days');
  });

  it('before the books are read it says so instead of showing zero', async () => {
    const r = await mounted(false);
    const view = render(<MoneyLive v={r.renderVals()} />);
    expect(view.getByText('Books not loaded yet')).toBeTruthy();
    expect(view.queryByText(/₱0/)).toBeNull();
  });

  it('plots income above zero and spending or refund-heavy income below zero', async () => {
    const r = await mounted();
    await act(async () => {
      await r.loadBooks({
        rpc: async () => ({
          data: {
            ...books,
            lines: [
              line('sale', 'revenue', 'Orders', 100, 2),
              line('refund', 'refund', 'Refunds', 200, 1),
              line('reversal', 'expense', 'Ingredients', -20, 3),
              line('expense', 'expense', 'Ingredients', 50, 1)
            ]
          },
          error: null
        })
      } as never);
    });
    act(() => money(r).setPeriod('week'));
    const ui = render(<MoneyLive v={r.renderVals()} />);
    const refund = ui.container.querySelector<HTMLElement>(
      '[data-money-series="income"][data-value="-200"]'
    )!;
    expect(refund).not.toBeNull();
    expect(parseFloat(refund.style.height)).toBeGreaterThan(0);
    expect(refund.style.top).toBe('50%');
    expect(refund.className).toContain('bg-danger');
    const sale = ui.container.querySelector<HTMLElement>(
      '[data-money-series="income"][data-value="100"]'
    )!;
    expect(sale.style.bottom).toBe('50%');
    expect(parseFloat(sale.style.height)).toBeGreaterThan(0);
    const cost = ui.container.querySelector<HTMLElement>(
      '[data-money-series="expenses"][data-value="50"]'
    )!;
    expect(cost.style.top).toBe('50%');
    expect(parseFloat(cost.style.height)).toBeGreaterThan(0);
    const reversal = ui.container.querySelector<HTMLElement>(
      '[data-money-series="expenses"][data-value="-20"]'
    )!;
    expect(reversal.style.bottom).toBe('50%');
    expect(reversal.className).toContain('bg-ok');
    expect(ui.getByText(/Refunds exceed income/)).toBeTruthy();
    expect(money(r).revenue).toBe(-100);
  });

  it('signs and colours money, and keeps the book settings in Money settings', async () => {
    const r = await mounted();
    const view = render(<MoneyLive v={r.renderVals()} />);
    expect(view.getByText('+₱17,990.00').className).toContain('text-ok');
    expect(view.getByText('−₱8,580.00').className).toContain('text-danger');
    expect(view.getByText(/Holiday pop-up/)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    expect(view.getByText('Books & costs')).toBeTruthy();
    expect(view.getByText('Expense categories')).toBeTruthy();
    expect(view.getByText('Download all books')).toBeTruthy();
  });
});
