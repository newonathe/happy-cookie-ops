import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

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
import { SalesLive } from '@/components/live/money/sales-live';

/**
 * Money > Sales reads the same books as the P&L. Until they are read it must say so, never
 * "0 sales recorded". Each `Mutation:` line names a change one of these tests must catch.
 */
const NOW = Date.parse('2026-11-03T04:00:00Z');
const DAY = 86_400_000;
const line = (id: string, kind: string, pesos: number, daysAgo: number) => ({
  id,
  kind,
  cat: kind === 'revenue' ? 'Orders' : 'Ingredients',
  label: id,
  amount_cents: pesos * 100,
  at: NOW - daysAgo * DAY
});
const wire = (lines: unknown[]) => ({
  basis: 'used',
  lines,
  uncosted: [],
  receipts: [],
  held: []
});
const fail = { data: null, error: { code: '08006' } };

async function mounted() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ now: NOW } as never));
  return runtime;
}
const open = (r: OpsRuntime) => act(() => r.go('sales'));

describe('Money > Sales before and after the books are read', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('says the books are not loaded, with Retry, instead of "0 sales recorded"', async () => {
    const r = await mounted();
    await act(async () => void (await r.loadBooks({ rpc: async () => fail } as never)));
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('Books not loaded yet')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Retry reading books' })).toBeTruthy();
    expect(view.queryByText(/0 sales recorded/)).toBeNull();
    expect(view.queryByText('No sales recorded yet.')).toBeNull();
    // Mutation: reading `log.empty` without the books state brings the false empty back.
  });

  it('Retry with a good read shows the sales', async () => {
    const r = await mounted();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(fail)
      .mockResolvedValue({
        data: wire([line('o1', 'revenue', 800, 2), line('o2', 'revenue', 300, 1)]),
        error: null
      });
    await act(async () => void (await r.loadBooks({ rpc } as never)));
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    fireEvent.click(view.getByRole('button', { name: 'Retry reading books' }));
    await waitFor(() => expect(r.renderVals().liveBooksRead?.read?.state).toBe('read'));
    view.rerender(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('2 sales recorded')).toBeTruthy();
    expect(view.queryByText('Books not loaded yet')).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('says "No sales recorded yet" only after a good read with no revenue', async () => {
    const r = await mounted();
    await act(async () => {
      await r.loadBooks({
        rpc: async () => ({ data: wire([line('e1', 'expense', 100, 1)]), error: null })
      } as never);
    });
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('0 sales recorded')).toBeTruthy();
    expect(view.getByText('No sales recorded yet.')).toBeTruthy();
    expect(view.queryByText('Books not loaded yet')).toBeNull();
  });

  it('keeps the list after a failed refresh and says it may be out of date', async () => {
    const r = await mounted();
    let broken = false;
    const client = {
      rpc: async () =>
        broken ? fail : { data: wire([line('o1', 'revenue', 800, 2)]), error: null }
    };
    await act(async () => void (await r.loadBooks(client as never)));
    broken = true;
    await act(async () => void (await r.loadBooks(client as never)));
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('1 sale recorded')).toBeTruthy();
    expect(view.getByText('Books could not be refreshed')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Retry reading books' })).toBeTruthy();
    expect(view.queryByText('Books not loaded yet')).toBeNull();
  });

  const eventSale = (items: Record<string, number>, total = 120) => ({
    id: 'sale-1',
    items,
    total,
    gross: total,
    discount: 0,
    pay: 'cash',
    ref: '',
    clerk: 'Ana',
    at: NOW - 5 * 60_000,
    tendered: total,
    change: 0,
    synced: false,
    failed: false,
    ledgerId: null
  });

  it('books unread, one event sale on this phone: the panel, then that sale under its own heading', async () => {
    const r = await mounted();
    await act(async () => void (await r.loadBooks({ rpc: async () => fail } as never)));
    act(() =>
      r.setState({
        event: { id: 'ev1', name: 'Bazaar Sunday', stage: 'open' },
        sales: [eventSale({ unknown_cookie: 2 }, 150)]
      } as never)
    );
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('Books not loaded yet')).toBeTruthy();
    expect(view.getByText('Recorded on this phone')).toBeTruthy();
    expect(
      view.getByText(
        'Only the sales this phone recorded at the open event are shown; the full log appears once your books load.'
      )
    ).toBeTruthy();
    expect(view.getByText('Product unavailable')).toBeTruthy();
    expect(view.getByText('2×')).toBeTruthy();
    expect(view.getByText('₱150')).toBeTruthy();
    expect(view.getByText(/Bazaar Sunday · 5 min ago · Ana/)).toBeTruthy();
    expect(view.queryByText(/sales? recorded/)).toBeNull();
    expect(view.queryByText('No sales recorded yet.')).toBeNull();
    // Mutation: dropping phoneSales from the not-loaded branch hides this phone's sales again.
  });

  it('books unread, no event sales: the panel only', async () => {
    const r = await mounted();
    await act(async () => void (await r.loadBooks({ rpc: async () => fail } as never)));
    open(r);
    const v = r.renderVals();
    expect(v.phoneSales).toEqual([]);
    const view = render(<SalesLive v={v} />);
    expect(view.getByText('Books not loaded yet')).toBeTruthy();
    expect(view.queryByText('Recorded on this phone')).toBeNull();
    expect(view.queryByText(/sales? recorded/)).toBeNull();
  });

  it('books read: the engine log is unchanged, no phone-only panel', async () => {
    const r = await mounted();
    await act(async () => {
      await r.loadBooks({
        rpc: async () => ({ data: wire([line('o1', 'revenue', 800, 2)]), error: null })
      } as never);
    });
    act(() =>
      r.setState({
        event: { id: 'ev1', name: 'Bazaar Sunday', stage: 'open' },
        sales: [eventSale({}, 0)]
      } as never)
    );
    open(r);
    const view = render(<SalesLive v={r.renderVals()} />);
    expect(view.getByText('2 sales recorded')).toBeTruthy();
    expect(view.queryByText('Recorded on this phone')).toBeNull();
    expect(view.queryByText('Books not loaded yet')).toBeNull();
  });

  it('demo mode is unchanged: no books state, the engine log as before', async () => {
    live = false;
    const r = await mounted();
    open(r);
    const v = r.renderVals();
    expect(v.liveBooksRead ?? null).toBeNull();
    const view = render(<SalesLive v={v} />);
    expect(view.queryByText('Books not loaded yet')).toBeNull();
    expect(view.getByText(/sales? recorded/)).toBeTruthy();
  });
});
