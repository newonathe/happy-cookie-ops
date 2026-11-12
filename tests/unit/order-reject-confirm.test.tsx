import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { OrderLive } from '@/components/live/sell/order-live';

/**
 * HCB-007: one press on Reject in the payment review used to cancel the order at once. The
 * owner's rule (5 November) asks for explicit confirmation of a consequential change; the form
 * is the OD-03 default, a dialog.
 */
type Row = Record<string, unknown>;
const raw = (id: string, name: string, over: Row = {}): Row => ({
  id,
  name,
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

const ROWS = () => [
  raw('HC-1101', 'Bea Villanueva'),
  raw('HC-1102', 'Miguel Santos', { pay_ref: 'REF-OTHER' })
];

function setup() {
  const rpc = vi.fn(async (name: string, args?: unknown) =>
    name === 'get_staff_orders'
      ? { data: ROWS(), error: null }
      : { data: [{ replayed: false, args }], error: null }
  );
  return { rpc, client: { rpc } as unknown as StaffOrderClient };
}

const rejectCalls = (rpc: ReturnType<typeof setup>['rpc']) =>
  rpc.mock.calls.filter(([name]) => name === 'staff_reject_payment');

async function open(orderId = 'HC-1101') {
  const f = setup();
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadOrders(f.client);
  });
  act(() => runtime.setState({ orderId }));
  const page = render(<OrderLive v={runtime.renderVals()} />);
  const show = (id: string) => {
    act(() => runtime.setState({ orderId: id }));
    page.rerender(<OrderLive v={runtime.renderVals()} />);
  };
  return { ...f, runtime, show };
}

const press = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));

describe('rejecting a payment asks first', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
  });

  it('the first press on Reject sends nothing and shows a dialog naming the customer and order', async () => {
    const { rpc } = await open();
    press('Reject');
    expect(rejectCalls(rpc)).toHaveLength(0);
    const dialog = screen.getByRole('dialog', { name: 'Reject this payment?' });
    expect(dialog.textContent).toContain('Bea Villanueva');
    expect(dialog.textContent).toContain('HC-1101');
  });

  it('Reject and cancel order sends staff_reject_payment once, for that order, and closes', async () => {
    const { rpc } = await open();
    press('Reject');
    press('Reject and cancel order');
    await act(async () => {});
    const calls = rejectCalls(rpc);
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toMatchObject({ p_order_id: 'HC-1101' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Keep order sends nothing and closes', async () => {
    const { rpc } = await open();
    press('Reject');
    press('Keep order');
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejectCalls(rpc)).toHaveLength(0);
  });

  it('the Close button sends nothing and closes', async () => {
    const { rpc } = await open();
    press('Reject');
    press(/^Close Reject this payment/);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejectCalls(rpc)).toHaveLength(0);
  });

  it('Escape sends nothing and closes', async () => {
    const { rpc } = await open();
    press('Reject');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejectCalls(rpc)).toHaveLength(0);
  });

  it('a double press on the confirm button sends once', async () => {
    const { rpc } = await open();
    press('Reject');
    const confirm = screen.getByRole('button', { name: 'Reject and cancel order' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => {});
    expect(rejectCalls(rpc)).toHaveLength(1);
  });

  it('the dialog closes when another order is opened, and does not send for it', async () => {
    const { rpc, show } = await open('HC-1101');
    press('Reject');
    expect(screen.getByRole('dialog')).toBeTruthy();
    show('HC-1102');
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rejectCalls(rpc)).toHaveLength(0);
  });
});
