import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { OrdersLive } from '@/components/live/sell/orders-live';
import { OrderLive } from '@/components/live/sell/order-live';

/**
 * Audit visual-capture-2026-11, finding 1: every owner view of an order showed the engine's next
 * default drop window ("Monday 16 Nov · 9 AM – 5 PM") instead of the order's own saved pickup.
 * The clock is Tuesday 10 November 2026, 10:00 in Manila, so the default schedule's pickup is
 * Monday 16 November and matches none of the saved pickups below.
 */
type Row = Record<string, unknown>;
const raw = (id: string, name: string, over: Row = {}): Row => ({
  id,
  name,
  phone: '09171234567',
  ig: '',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: 'REF-1',
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

const DEFAULT_SHORT = 'Mon 16';
const DEFAULT_LONG = 'Monday 16 Nov · 9 AM – 5 PM';

function fake(initial: Row[]) {
  const state = { list: initial };
  const rpc = vi.fn(async (name: string) =>
    name === 'get_staff_orders'
      ? { data: state.list, error: null }
      : { data: [{ replayed: false }], error: null }
  );
  return { state, client: { rpc } as unknown as StaffOrderClient };
}

async function mounted(f: ReturnType<typeof fake>) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadOrders(f.client);
  });
  return runtime;
}

const listPickups = (r: OpsRuntime): Record<string, string> =>
  Object.fromEntries(r.renderVals().orderList.map((o) => [String(o.id), String(o.pickup)]));
const detailPickup = (r: OpsRuntime, orderId: string): string => {
  act(() => r.setState({ orderId }));
  return String(r.renderVals().od?.pickup);
};

const TWO = () => [
  raw('HC-1101', 'Bea Villanueva', { pickup_date: '2026-11-11', pickup_window: '10:00' }),
  raw('HC-1102', 'Miguel Santos', { pickup_date: '2026-11-14', pickup_window: '14:30' })
];

const savedZone = process.env.TZ;

describe('owner order views show the saved pickup, not the next default drop window', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T02:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (savedZone === undefined) delete process.env.TZ;
    else process.env.TZ = savedZone;
  });

  it('two orders with different dates each keep their own date in the list and the detail', async () => {
    const runtime = await mounted(fake(TWO()));
    expect(listPickups(runtime)).toEqual({
      'HC-1101': 'Wed, Nov 11 · 10:00 AM',
      'HC-1102': 'Sat, Nov 14 · 2:30 PM'
    });
    expect(detailPickup(runtime, 'HC-1101')).toBe('Wed, Nov 11 · 10:00 AM');
    expect(detailPickup(runtime, 'HC-1102')).toBe('Sat, Nov 14 · 2:30 PM');
  });

  it('a pickup that does not match the current drop schedule is not replaced by it', async () => {
    const runtime = await mounted(fake(TWO()));
    // The engine still computes Monday 16 November for this clock: that is the value that leaked.
    const engine = runtime as unknown as {
      windowText: (s: unknown, id: string, l?: boolean) => string;
    };
    expect(engine.windowText(runtime.state, 'sat', true)).toBe(DEFAULT_LONG);
    const list = Object.values(listPickups(runtime));
    expect(list).not.toContain(DEFAULT_SHORT);
    expect(detailPickup(runtime, 'HC-1101')).not.toBe(DEFAULT_LONG);
  });

  it('the actual live list and order page render the saved pickup', async () => {
    const runtime = await mounted(fake(TWO()));
    const list = render(<OrdersLive v={runtime.renderVals()} />);
    expect(screen.getByText(/Wed, Nov 11 · 10:00 AM ·/)).toBeTruthy();
    expect(screen.getByText(/Sat, Nov 14 · 2:30 PM ·/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(DEFAULT_SHORT))).toBeNull();
    list.unmount();
    act(() => runtime.setState({ orderId: 'HC-1102' }));
    render(<OrderLive v={runtime.renderVals()} />);
    expect(screen.getAllByText('Sat, Nov 14 · 2:30 PM').length).toBeGreaterThan(0);
    expect(screen.queryByText(DEFAULT_LONG)).toBeNull();
  });

  it('a reload shows what the database now holds, and a fresh mount shows the same', async () => {
    const f = fake(TWO());
    const runtime = await mounted(f);
    f.state.list = [
      raw('HC-1101', 'Bea Villanueva', { pickup_date: '2026-11-18', pickup_window: '11:00' }),
      TWO()[1]!
    ];
    await act(async () => {
      await runtime.reloadOrders();
    });
    expect(listPickups(runtime)['HC-1101']).toBe('Wed, Nov 18 · 11:00 AM');
    expect(detailPickup(runtime, 'HC-1101')).toBe('Wed, Nov 18 · 11:00 AM');
    cleanup();
    const again = await mounted(f);
    expect(listPickups(again)).toEqual({
      'HC-1101': 'Wed, Nov 18 · 11:00 AM',
      'HC-1102': 'Sat, Nov 14 · 2:30 PM'
    });
  });

  it.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])(
    'a device set to %s sees the same saved day and time',
    async (zone) => {
      process.env.TZ = zone;
      const runtime = await mounted(
        fake([
          ...TWO(),
          raw('HC-1103', 'Joanna Reyes', { pickup_date: '2026-11-11', pickup_window: '00:00' }),
          raw('HC-1104', 'Karla Mendoza', { pickup_date: '2026-11-11', pickup_window: '23:30' })
        ])
      );
      expect(listPickups(runtime)).toEqual({
        'HC-1101': 'Wed, Nov 11 · 10:00 AM',
        'HC-1102': 'Sat, Nov 14 · 2:30 PM',
        'HC-1103': 'Wed, Nov 11 · 12:00 AM',
        'HC-1104': 'Wed, Nov 11 · 11:30 PM'
      });
      expect(detailPickup(runtime, 'HC-1104')).toBe('Wed, Nov 11 · 11:30 PM');
    }
  );

  it('missing or invalid saved pickup fields say so, with what to do, and invent nothing', async () => {
    const runtime = await mounted(
      fake([
        raw('HC-1103', 'Joanna Reyes', { pickup_date: null, pickup_window: null }),
        raw('HC-1104', 'Karla Mendoza', { pickup_date: '2026-02-30', pickup_window: '25:99' }),
        raw('HC-1105', 'Paolo Cruz', { pickup_date: '2026-11-11', pickup_window: null }),
        raw('HC-1106', 'Rina Lopez', { pickup_date: '2026-11-11', pickup_window: 'campus' })
      ])
    );
    expect(listPickups(runtime)).toEqual({
      'HC-1103': STAFF_COPY.pickupMissing,
      'HC-1104': STAFF_COPY.pickupMissing,
      'HC-1105': 'Wed, Nov 11 · time not saved',
      'HC-1106': 'Wed, Nov 11 · Campus pickup'
    });
    expect(detailPickup(runtime, 'HC-1103')).toBe(STAFF_COPY.pickupMissingLong);
    expect(detailPickup(runtime, 'HC-1104')).toBe(STAFF_COPY.pickupMissingLong);
    expect(STAFF_COPY.pickupMissingLong).toMatch(/Ask the customer/);
    render(<OrderLive v={runtime.renderVals()} />);
    expect(screen.queryByText(DEFAULT_LONG)).toBeNull();
  });

  it('demo mode keeps the ported engine label unchanged', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const pickups = ref.current!.renderVals().orderList.map((o) => String(o.pickup));
    expect(pickups.length).toBeGreaterThan(0);
    expect(new Set(pickups)).toEqual(new Set([DEFAULT_SHORT]));
  });
});
