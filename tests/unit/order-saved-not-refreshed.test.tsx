import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { OrderLive } from '@/components/live/sell/order-live';

/**
 * HCB-006: a change the database acknowledged must never be offered again because the list read
 * that follows it failed. The page shows the saved state, says the list could not be refreshed,
 * and offers Try again; it must not toast the plain success text.
 */
const SAVED_NOT_REFRESHED = 'Saved. Could not refresh the list.';
const NEW_STAMP = '2026-11-09T03:00:00.000000+00:00';

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

const ack = (state: string, payState: string, over: Row = {}) => ({
  data: [
    {
      order_id: 'HC-1101',
      state,
      pay_state: payState,
      total_cents: 26000,
      paid_cents: payState === 'confirmed' ? 26000 : null,
      updated_at: NEW_STAMP,
      replayed: false,
      ...over
    }
  ],
  error: null
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

const press = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const toast = (r: OpsRuntime) => r.state.toast as { msg: string; tone: string } | null;
const noticeShown = () => screen.queryByText(SAVED_NOT_REFRESHED);

describe('an acknowledged change whose list refresh failed', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    ordersRead.reset();
  });

  it('confirm: no second Confirm payment, the notice and Try again show, the toast is the warning', async () => {
    const f = await open([raw('HC-1101')], {
      staff_confirm_payment: ack('Confirmed', 'confirmed')
    });
    expect(screen.getByRole('button', { name: 'Confirm payment' })).toBeTruthy();
    f.db.readsFail = true;
    press('Confirm payment');
    await act(async () => {});
    f.refresh();
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
    expect(noticeShown()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(toast(f.runtime)).toMatchObject({ msg: SAVED_NOT_REFRESHED, tone: 'warn' });
    expect(toast(f.runtime)?.msg).not.toContain('marked paid');
    expect(f.rpc.mock.calls.filter(([n]) => n === 'staff_confirm_payment')).toHaveLength(1);
  });

  it('Try again with a good read removes the notice and shows the server state', async () => {
    const f = await open([raw('HC-1101')], {
      staff_confirm_payment: ack('Confirmed', 'confirmed')
    });
    f.db.readsFail = true;
    press('Confirm payment');
    await act(async () => {});
    f.refresh();
    expect(noticeShown()).toBeTruthy();
    // The server now holds the order one step further on than the acknowledged row said.
    f.db.list = [
      raw('HC-1101', {
        state: 'Ready',
        pay_state: 'confirmed',
        updated_at: '2026-11-09T04:00:00.000000+00:00'
      })
    ];
    f.db.readsFail = false;
    press('Try again');
    await act(async () => {});
    f.refresh();
    expect(noticeShown()).toBeNull();
    expect(ordersRead.get().savedNotRefreshed).toBeNull();
    expect(screen.getByText('Order HC-1101')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark picked up' })).toBeTruthy();
  });

  it('reject: after the dialog Confirm, neither Reject nor Confirm payment is offered', async () => {
    const f = await open([raw('HC-1101')], {
      staff_reject_payment: ack('Cancelled', 'unpaid')
    });
    f.db.readsFail = true;
    press('Reject');
    press('Reject and cancel order');
    await act(async () => {});
    f.refresh();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm payment' })).toBeNull();
    expect(noticeShown()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(toast(f.runtime)).toMatchObject({ msg: SAVED_NOT_REFRESHED, tone: 'warn' });
  });

  it('a status change (pack) does not offer Mark packed again', async () => {
    const f = await open([raw('HC-1101', { state: 'Confirmed', pay_state: 'confirmed' })], {
      staff_set_status: ack('Ready', 'confirmed')
    });
    expect(screen.getByRole('button', { name: 'Mark packed' })).toBeTruthy();
    f.db.readsFail = true;
    act(() => {
      (f.runtime as unknown as { packOrder: (id: string) => void }).packOrder('HC-1101');
    });
    await act(async () => {});
    f.refresh();
    expect(screen.queryByRole('button', { name: 'Mark packed' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark picked up' })).toBeTruthy();
    expect(noticeShown()).toBeTruthy();
    expect(toast(f.runtime)).toMatchObject({ msg: SAVED_NOT_REFRESHED, tone: 'warn' });
  });

  it('a status change (collect) does not offer Mark picked up again', async () => {
    const f = await open([raw('HC-1101', { state: 'Ready', pay_state: 'confirmed' })], {
      staff_set_status: ack('Completed', 'confirmed')
    });
    expect(screen.getByRole('button', { name: 'Mark picked up' })).toBeTruthy();
    f.db.readsFail = true;
    act(() => {
      (f.runtime as unknown as { collectOrder: (id: string) => void }).collectOrder('HC-1101');
    });
    await act(async () => {});
    f.refresh();
    expect(screen.queryByRole('button', { name: 'Mark picked up' })).toBeNull();
    expect(noticeShown()).toBeTruthy();
  });

  it('an acknowledgement with no readable row invents no state, but still says so', async () => {
    const f = await open([raw('HC-1101')], {
      staff_confirm_payment: { data: [{ replayed: false }], error: null }
    });
    f.db.readsFail = true;
    press('Confirm payment');
    await act(async () => {});
    f.refresh();
    expect(noticeShown()).toBeTruthy();
    expect(ordersRead.get().savedNotRefreshed).toBe('HC-1101');
    // Nothing to patch from: the page still holds the pre-change order; the notice is the warning.
    expect(screen.getByRole('button', { name: 'Confirm payment' })).toBeTruthy();
    expect(toast(f.runtime)).toMatchObject({ msg: SAVED_NOT_REFRESHED, tone: 'warn' });
  });

  it('when the refresh succeeds there is no notice and the success toast is unchanged', async () => {
    const f = await open([raw('HC-1101')], {
      staff_confirm_payment: ack('Confirmed', 'confirmed')
    });
    f.db.list = [
      raw('HC-1101', { state: 'Confirmed', pay_state: 'confirmed', updated_at: NEW_STAMP })
    ];
    press('Confirm payment');
    await act(async () => {});
    f.refresh();
    expect(noticeShown()).toBeNull();
    expect(ordersRead.get().savedNotRefreshed).toBeNull();
    expect(toast(f.runtime)).toMatchObject({ tone: 'ok' });
    expect(toast(f.runtime)?.msg).toContain('marked paid');
  });
});
