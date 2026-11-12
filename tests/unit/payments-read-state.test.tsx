import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { PaymentsLive } from '@/components/live/sell/payments-live';

/**
 * HCB-002d, on the actual Payments page: a failed or unfinished order read is never shown as
 * "Everything matched", "No payment references to check." or a zero total, and "Every reference
 * is accounted for" is never claimed from a list that could not be refreshed. Retry reads again.
 */
type Row = Record<string, unknown>;
const row = (id: string, name: string, ref: string, over: Row = {}): Row => ({
  id,
  name,
  phone: '09171234567',
  ig: '',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: ref,
  total_cents: 26000,
  paid_cents: 26000,
  refund_ref: null,
  pickup_date: '2026-11-11',
  pickup_window: '10:00',
  placed_at: '2026-11-09T01:00:00.000Z',
  updated_at: '2026-11-09T02:00:00.000000+00:00',
  status_token: 'b'.repeat(64),
  holds: true,
  items: [{ product_id: 'dcf', qty: 2, unit_price_cents: 13000, unavailable: false }],
  swaps: [],
  ...over
});

type Answer = { data?: unknown; error?: { code?: string } | null };
function client(answers: Answer[]) {
  const queue = [...answers];
  const rpc = vi.fn(async (name: string) =>
    name === 'get_staff_orders'
      ? (queue.shift() ?? { error: { code: '08006' } })
      : { data: [{ replayed: false }], error: null }
  );
  return { rpc, client: { rpc } as unknown as StaffOrderClient };
}

const FAIL: Answer = { error: { code: '08006' } };
const ALL_MATCHED = 'Everything matched';
const NO_REFS = 'No payment references to check.';
const ACCOUNTED = 'Every reference is accounted for';
const TOTAL = 'Total in the book';

async function owner(c?: StaffOrderClient) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const rt = ref.current!;
  act(() => rt.setRole('owner'));
  act(() => rt.setState({ screen: 'payments' } as never));
  if (c) await act(async () => void (await rt.loadOrders(c)));
  return rt;
}
const page = (rt: OpsRuntime) => render(<PaymentsLive v={rt.renderVals()} />);
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const savedZone = process.env.TZ;

function expectNoFalseAllClear() {
  expect(screen.queryByText(ALL_MATCHED)).toBeNull();
  expect(screen.queryByText(NO_REFS)).toBeNull();
  expect(screen.queryByText(ACCOUNTED)).toBeNull();
  expect(screen.queryByText(TOTAL)).toBeNull();
  expect(screen.queryByText('₱0')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Tick all' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
}

describe('Payments read lifecycle on the actual page (live mode)', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T02:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    ordersRead.reset();
    if (savedZone === undefined) delete process.env.TZ;
    else process.env.TZ = savedZone;
  });

  it('a failed first read warns, offers Try again, and claims nothing about the references', async () => {
    const rt = await owner(client([FAIL]).client);
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersReadFailed)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expectNoFalseAllClear();
  });

  it('Try again with a good read shows the references and the normal content', async () => {
    const f = client([FAIL, { data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }]);
    const rt = await owner(f.client);
    const view = page(rt);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    view.rerender(<PaymentsLive v={rt.renderVals()} />);
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
    expect(screen.getByText('GC-7781')).toBeTruthy();
    expect(screen.getByText(TOTAL)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tick all' })).toBeTruthy();
    expect(screen.queryByText(NO_REFS)).toBeNull();
  });

  it('while the first read is out, it says the orders are not read and shows no all-clear', async () => {
    const rt = await owner();
    let answer: (a: Answer) => void = () => undefined;
    const c = {
      rpc: vi.fn(() => new Promise<Answer>((r) => (answer = r)))
    } as unknown as StaffOrderClient;
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => void (done = rt.loadOrders(c)));
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersNotRead)).toBeTruthy();
    expectNoFalseAllClear();
    await act(async () => {
      answer({ data: [], error: null });
      await done;
    });
  });

  it('a live owner whose orders were never asked for sees "not read", not an all-clear', async () => {
    const rt = await owner();
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersNotRead)).toBeTruthy();
    expectNoFalseAllClear();
  });

  it('a failed reload keeps the last good references, says how old they are, and claims no all-clear', async () => {
    process.env.TZ = 'America/Los_Angeles';
    const f = client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }, FAIL]);
    const rt = await owner(f.client);
    vi.setSystemTime(new Date('2026-11-10T03:30:00Z'));
    await act(async () => void (await rt.reloadOrders()));
    page(rt);
    expect(screen.getByText('GC-7781')).toBeTruthy();
    expect(screen.getByText(STAFF_COPY.ordersStale('10:00 AM'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tick all' })).toBeTruthy();
    expect(screen.queryByText(ACCOUNTED)).toBeNull();
  });

  it('a failed reload after every reference was ticked still does not claim they are accounted for', async () => {
    const f = client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }, FAIL]);
    const rt = await owner(f.client);
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    await act(async () => void (await rt.reloadOrders()));
    page(rt);
    expect(screen.getByText('GC-7781')).toBeTruthy();
    expect(screen.queryByText(ACCOUNTED)).toBeNull();
  });

  it('a good read with every reference ticked still gives the genuine all-clear', async () => {
    const rt = await owner(
      client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }]).client
    );
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    page(rt);
    expect(screen.getByText(ACCOUNTED)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
  });

  it('a good read that had to drop an unreadable order warns and claims no all-clear', async () => {
    const rt = await owner(
      client([
        {
          data: [
            row('HC-1101', 'Bea Villanueva', 'GC-7781'),
            row('HC-1102', 'Miguel Santos', 'GC-7782', { items: [] })
          ],
          error: null
        }
      ]).client
    );
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersDropped(1))).toBeTruthy();
    expect(screen.queryByText(ACCOUNTED)).toBeNull();
  });

  it('dropped rows never sit beside an "Everything matched" hero or a per-method "All matched"', async () => {
    const rt = await owner(
      client([
        {
          data: [
            row('HC-1101', 'Bea Villanueva', 'GC-7781'),
            row('HC-1102', 'Miguel Santos', 'GC-7782', { items: [] })
          ],
          error: null
        }
      ]).client
    );
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    page(rt);
    expect(screen.queryByText(ALL_MATCHED)).toBeNull();
    expect(screen.queryByText(/^All matched/)).toBeNull();
    expect(screen.getByText('Some orders could not be read; check them in Orders.')).toBeTruthy();
  });

  it('a stale list never shows an "Everything matched" hero either', async () => {
    const f = client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }, FAIL]);
    const rt = await owner(f.client);
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    await act(async () => void (await rt.reloadOrders()));
    page(rt);
    expect(screen.queryByText(ALL_MATCHED)).toBeNull();
  });

  it('Tick all ticks the same way but toasts a neutral line on dropped rows or a stale list', async () => {
    const toast = (rt: OpsRuntime) => (rt.state as { toast?: { msg: string } }).toast?.msg;
    const dropped = await owner(
      client([
        {
          data: [
            row('HC-1101', 'Bea Villanueva', 'GC-7781'),
            row('HC-1102', 'Miguel Santos', 'GC-7782', { items: [] })
          ],
          error: null
        }
      ]).client
    );
    act(() => (dropped.renderVals() as { recTickAll: () => void }).recTickAll());
    expect(toast(dropped)).toBe(
      'All shown references ticked. Some orders could not be read, so this list may be incomplete.'
    );
    expect(Object.keys((dropped.state as unknown as { matched: object }).matched)).toEqual([
      'HC-1101'
    ]);
    cleanup();
    ordersRead.reset();
    const f = client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }, FAIL]);
    const stale = await owner(f.client);
    await act(async () => void (await stale.reloadOrders()));
    act(() => (stale.renderVals() as { recTickAll: () => void }).recTickAll());
    expect(toast(stale)).toBe(
      'All shown references ticked. The list could not be refreshed, so it may be incomplete.'
    );
    expect(Object.keys((stale.state as unknown as { matched: object }).matched)).toEqual([
      'HC-1101'
    ]);
  });

  it('Tick all on a good, complete read keeps the engine toast', async () => {
    const rt = await owner(
      client([{ data: [row('HC-1101', 'Bea Villanueva', 'GC-7781')], error: null }]).client
    );
    act(() => (rt.renderVals() as { recTickAll: () => void }).recTickAll());
    expect((rt.state as { toast?: { msg: string } }).toast?.msg).toBe(
      'All references ticked. Your wallet and your books agree.'
    );
  });

  it('a good read with nothing to check says so, with no warning', async () => {
    const rt = await owner(client([{ data: [], error: null }]).client);
    page(rt);
    expect(screen.getByText(NO_REFS)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
    expect(screen.queryByText(STAFF_COPY.ordersNotRead)).toBeNull();
  });
});

describe('demo mode', () => {
  afterEach(() => {
    cleanup();
    ordersRead.reset();
  });
  it('shows the demo references with no read-state message', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setState({ screen: 'payments' } as never));
    render(<PaymentsLive v={ref.current!.renderVals()} />);
    expect(screen.queryByText(STAFF_COPY.ordersNotRead)).toBeNull();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
    expect(screen.getByText(TOTAL)).toBeTruthy();
  });
});
