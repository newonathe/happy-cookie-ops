import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { OrderLive } from '@/components/live/sell/order-live';

/** HCB-032: an order that disappears from the read while its page is open shows RecordUnavailable. */
type Row = Record<string, unknown>;
const raw = (id: string, over: Row = {}): Row => ({
  id,
  name: 'Bea Villanueva',
  phone: '09171234567',
  ig: '',
  state: 'Payment review',
  pay_state: 'claimed',
  pay_method: 'GCash',
  pay_ref: 'REF-' + id,
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

/** `list` is what the database holds now; `readsFail` makes get_staff_orders fail. */
function setup(initial: Row[], results: Record<string, unknown>) {
  const db = { list: initial, readsFail: false };
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_staff_orders')
      return db.readsFail
        ? { data: null, error: { code: '57014' } }
        : { data: db.list, error: null };
    return results[name] ?? { data: [{ replayed: false }], error: null };
  });
  return { db, rpc, client: { rpc } as unknown as StaffOrderClient };
}

async function open(initial: Row[], results: Record<string, unknown>, orderId = 'HC-1101') {
  const f = setup(initial, results);
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadOrders(f.client);
  });
  act(() => runtime.setState({ orderId }));
  const page = render(<OrderLive v={runtime.renderVals()} />);
  const refresh = () => page.rerender(<OrderLive v={runtime.renderVals()} />);
  return { ...f, runtime, refresh };
}

describe('an open order that the read stops returning', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    ordersRead.reset();
  });

  it('shows Record unavailable with a way back', async () => {
    const f = await open([raw('HC-1101'), raw('HC-1102')], {});
    expect(screen.getByText('Order HC-1101')).toBeTruthy();
    f.db.list = [raw('HC-1102')];
    await act(async () => {
      await f.runtime.loadOrders(f.client);
    });
    f.refresh();
    expect(screen.queryByText('Order HC-1101')).toBeNull();
    expect(screen.getByText('Record unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to orders' })).toBeTruthy();
  });
});
