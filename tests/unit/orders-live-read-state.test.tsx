import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { OrdersLive } from '@/components/live/sell/orders-live';
import type { OpsVals } from '@/view-models/vals';

/**
 * HCB-002a, on the actual Orders page: a failed or unfinished order read is never shown as "no
 * orders", counts are not shown for data that was never read, a failed refresh says how old the
 * list is (on the shop's clock), and Retry reads again. Demo and helper views are unchanged.
 */
type Row = Record<string, unknown>;
const row = (id: string, name: string, over: Row = {}): Row => ({
  id,
  name,
  phone: '09171234567',
  ig: '',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: 'REF',
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
  return { rpc, queue, client: { rpc } as unknown as StaffOrderClient };
}

const FAIL: Answer = { error: { code: '08006' } };
const EMPTY = 'No orders match this filter';

async function owner(c?: StaffOrderClient, role: 'owner' | 'helper' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const rt = ref.current!;
  act(() => rt.setRole(role));
  act(() => rt.setState({ screen: 'orders', orderFilter: 'all' } as never));
  if (c) await act(async () => void (await rt.loadOrders(c)));
  return rt;
}
const page = (rt: OpsRuntime) => render(<OrdersLive v={rt.renderVals()} />);
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const savedZone = process.env.TZ;

describe('Orders read lifecycle on the actual page (live mode)', () => {
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

  it('a failed first read says so, offers Retry, and shows no empty result or counts', async () => {
    const f = client([FAIL]);
    const rt = await owner(f.client);
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersReadFailed)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Show orders' })).toBeNull();
    expect(screen.queryByText('Ordered this drop, all customers')).toBeNull();
  });

  it('Retry reads again; on success the list replaces the warning', async () => {
    const f = client([FAIL, { data: [row('HC-1101', 'Bea Villanueva')], error: null }]);
    const rt = await owner(f.client);
    const view = page(rt);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    view.rerender(<OrdersLive v={rt.renderVals()} />);
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Bea Villanueva')).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
  });

  it('a failed refresh keeps the list and says when it was read, on the shop clock', async () => {
    process.env.TZ = 'America/Los_Angeles';
    const f = client([{ data: [row('HC-1101', 'Bea Villanueva')], error: null }, FAIL]);
    const rt = await owner(f.client);
    vi.setSystemTime(new Date('2026-11-10T03:30:00Z'));
    await act(async () => void (await rt.reloadOrders()));
    page(rt);
    expect(screen.getByText('Bea Villanueva')).toBeTruthy();
    expect(screen.getByText(STAFF_COPY.ordersStale('10:00 AM'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('a genuine empty read still says there are no orders, with no warning', async () => {
    const rt = await owner(client([{ data: [], error: null }]).client);
    page(rt);
    expect(screen.getByText(EMPTY)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
  });

  it('a malformed answer is a failed read, not an empty one', async () => {
    const rt = await owner(client([{ data: { rows: [] }, error: null }]).client);
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersReadFailed)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('unreadable rows are announced and the counts say they leave them out', async () => {
    const rt = await owner(
      client([{ data: [row('HC-1101', 'Bea Villanueva'), { id: 'HC-BAD' }], error: null }]).client
    );
    page(rt);
    expect(screen.getByText('Bea Villanueva')).toBeTruthy();
    expect(screen.getByText(STAFF_COPY.ordersDropped(1))).toBeTruthy();
  });

  it('while the first read is out, the page says it is reading and shows no empty result', async () => {
    const rt = await owner();
    let answer: (a: Answer) => void = () => undefined;
    const c = {
      rpc: vi.fn(() => new Promise<Answer>((r) => (answer = r)))
    } as unknown as StaffOrderClient;
    let done: Promise<boolean> = Promise.resolve(false);
    act(() => void (done = rt.loadOrders(c)));
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersNotRead)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    await act(async () => {
      answer({ data: [], error: null });
      await done;
    });
  });

  it('a live owner whose orders were never asked for sees "not read", not "no orders"', async () => {
    const rt = await owner();
    page(rt);
    expect(screen.getByText(STAFF_COPY.ordersNotRead)).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('a helper (no order read) sees the page exactly as before', async () => {
    const rt = await owner(undefined, 'helper');
    page(rt);
    expect(screen.getByText(EMPTY)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.ordersNotRead)).toBeNull();
  });

  it('renders on the server from the idle snapshot, and React sees stable snapshots', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rt = await owner(client([FAIL]).client);
    const v = rt.renderVals() as OpsVals;
    expect(() => renderToString(<OrdersLive v={v} />)).not.toThrow();
    const view = page(rt);
    view.rerender(<OrdersLive v={rt.renderVals()} />);
    expect(
      errors.mock.calls.some((c) => String(c[0]).includes('getSnapshot should be cached'))
    ).toBe(false);
    errors.mockRestore();
  });
});

describe('demo mode', () => {
  afterEach(() => {
    cleanup();
    ordersRead.reset();
  });
  it('shows the demo orders with no read-state message', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setState({ screen: 'orders', orderFilter: 'all' } as never));
    render(<OrdersLive v={ref.current!.renderVals()} />);
    expect(screen.queryByText(STAFF_COPY.ordersNotRead)).toBeNull();
    expect(screen.queryByText(STAFF_COPY.ordersReadFailed)).toBeNull();
    expect(screen.getByRole('group', { name: 'Show orders' })).toBeTruthy();
  });
});
