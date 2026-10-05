import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import type { ScreenKey } from '@/lib/screens';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { OrdersScreen } from '@/components/screens/orders';
import { OrderDetailScreen } from '@/components/screens/order-detail';
import { BakePlanScreen } from '@/components/screens/bake-plan';

/**
 * B3: in live mode the owner's order actions ask the database and the screens are fed from it.
 * Demo mode keeps the engine's own local actions byte for byte.
 */
const TOKEN = 'b'.repeat(64);
const STAMP = '2026-09-29T02:00:00.123456+00:00';

type Row = Record<string, unknown>;
const raw = (over: Row = {}): Row => ({
  id: 'HC-1001',
  name: 'Ana Cruz',
  phone: '09171234567',
  ig: '@ana',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: null,
  total_cents: 20000,
  paid_cents: 20000,
  refund_ref: null,
  pickup_date: '2026-10-05',
  pickup_window: '10:00',
  placed_at: '2026-09-29T01:00:00.000Z',
  updated_at: STAMP,
  status_token: TOKEN,
  holds: true,
  items: [{ product_id: 'wcb', qty: 2, unit_price_cents: 10000, unavailable: false }],
  swaps: [],
  ...over
});
const unpaid = (over: Row = {}) =>
  raw({
    id: 'HC-1002',
    name: 'Ben Diaz',
    state: 'Payment review',
    pay_state: 'unpaid',
    paid_cents: null,
    ...over
  });

function fake(initial: Row[], results: Record<string, unknown> = {}) {
  const state = { list: initial };
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    void args;
    if (name === 'get_staff_orders') return { data: state.list, error: null };
    return (
      (results[name] as { data?: unknown; error?: unknown }) ?? {
        data: [{ replayed: false }],
        error: null
      }
    );
  });
  return { state, rpc, client: { rpc } as unknown as StaffOrderClient };
}

const sent = (rpc: ReturnType<typeof fake>['rpc']) =>
  rpc.mock.calls.filter((c) => c[0] !== 'get_staff_orders') as unknown as Array<
    [string, Record<string, unknown>]
  >;

type Actions = {
  confirmPayment: (id: string, force?: boolean) => void;
  rejectPayment: (id: string) => void;
  refundOrder: (id: string, ref?: string) => void;
  reopenOrder: (id: string) => void;
  packOrder: (id: string) => void;
  collectOrder: (id: string) => void;
  noShow: (id: string) => void;
  flagLine: (id: string, pid: string) => void;
  replaceLine: (id: string, from: string, to: string) => void;
  markBaking: (pid: string, s0?: { orders: unknown[] }) => unknown[];
  demand: (pid: string) => number;
  demandDay: (pid: string, day: string) => number;
};
const actions = (r: OpsRuntime) => r as unknown as Actions;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

async function mounted(role: Role, f: ReturnType<typeof fake>, load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  if (load)
    await act(async () => {
      await runtime.loadOrders(f.client);
    });
  f.rpc.mockClear();
  return runtime;
}

const orderIds = (r: OpsRuntime) => (r.state.orders as Array<{ id: string }>).map((o) => o.id);
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toasts ?? r.state.toast ?? '');

describe('B3: the owner reads and drives real orders (live mode)', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('replaces the engine list with the database orders and shows them on the orders screen', async () => {
    const f = fake([raw(), unpaid()]);
    const runtime = await mounted('owner', f);
    expect(orderIds(runtime).sort()).toEqual(['HC-1001', 'HC-1002']);
    expect(
      runtime
        .renderVals()
        .orderList.map((o) => String(o.name))
        .sort()
    ).toEqual(['Ana Cruz', 'Ben Diaz']);
    // Mutation: leaving the demo orders in state.orders shows HC-1050 and friends beside the real ones.
  });

  it('the paid tick sends the stamp the owner is looking at, then shows the new state', async () => {
    const f = fake([unpaid()]);
    const runtime = await mounted('owner', f);
    f.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_staff_orders') return { data: f.state.list, error: null };
      f.state.list = [unpaid({ state: 'Confirmed', pay_state: 'confirmed', paid_cents: 20000 })];
      return { data: [{ replayed: false }], error: null };
    });
    act(() => actions(runtime).confirmPayment('HC-1002'));
    await settle();
    expect(sent(f.rpc)).toEqual([
      [
        'staff_confirm_payment',
        { p_order_id: 'HC-1002', p_expected_updated_at: STAMP, p_force: false }
      ]
    ]);
    expect((runtime.state.orders as Array<{ status: string }>)[0].status).toBe('Confirmed');
    // Mutation: dropping the constructor override runs the engine's local confirm: no RPC, an invoice number, and the order lost on reload.
  });

  it('packing needs no packaging stock: live mode has none, and the engine would refuse every order', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('owner', f);
    expect((runtime.state.inv as unknown[]).length).toBe(0);
    act(() => actions(runtime).packOrder('HC-1001'));
    await settle();
    expect(sent(f.rpc)).toEqual([
      ['staff_set_status', { p_order_id: 'HC-1001', p_to: 'Ready', p_expected_updated_at: STAMP }]
    ]);
    // Mutation: calling the engine's packOrder toasts "Not enough Box of 6 left" and sends nothing.
  });

  it('an unpaid order is not packed: the tick comes first, and nothing is sent', async () => {
    const f = fake([unpaid()]);
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).packOrder('HC-1002'));
    await settle();
    expect(sent(f.rpc)).toEqual([]);
    expect(toasts(runtime)).toContain(STAFF_COPY.packUnpaid);
  });

  it('an order with an unavailable flavour is not packed until it is settled', async () => {
    const f = fake([
      raw({ items: [{ product_id: 'wcb', qty: 2, unit_price_cents: 10000, unavailable: true }] })
    ]);
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).packOrder('HC-1001'));
    await settle();
    expect(sent(f.rpc)).toEqual([]);
    expect(toasts(runtime)).toContain('unavailable flavour');
  });

  it('collected, no-show, flag and swap each ask the database', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).collectOrder('HC-1001'));
    await settle();
    act(() => actions(runtime).noShow('HC-1001'));
    await settle();
    act(() => actions(runtime).flagLine('HC-1001', 'wcb'));
    await settle();
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    const calls = sent(f.rpc);
    expect(calls.map((c) => c[0])).toEqual([
      'staff_set_status',
      'staff_set_status',
      'staff_flag_item',
      'staff_swap_item'
    ]);
    expect(calls[0][1].p_to).toBe('Completed');
    expect(calls[1][1].p_to).toBe('No-show');
    expect(calls[2][1]).toMatchObject({ p_product_id: 'wcb', p_flagged: true });
    expect(calls[3][1]).toMatchObject({ p_from_product: 'wcb', p_to_product: 'rvc' });
    expect(String(calls[3][1].p_client_id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tapping "Ran out" on a flagged flavour clears the flag; on an unflagged one it sets it', async () => {
    const flagged = fake([
      raw({ items: [{ product_id: 'wcb', qty: 2, unit_price_cents: 10000, unavailable: true }] })
    ]);
    const runtime = await mounted('owner', flagged);
    act(() => actions(runtime).flagLine('HC-1001', 'wcb'));
    await settle();
    expect(sent(flagged.rpc)[0][1]).toMatchObject({ p_product_id: 'wcb', p_flagged: false });
    // Mutation: always sending true makes the flag impossible to clear.
  });

  it('a second tap on the same swap after a lost reply is a replay (same client id); a settled one gets a new id', async () => {
    const f = fake([raw()], { staff_swap_item: { error: { code: '' } } });
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    const ids = sent(f.rpc).map((c) => c[1].p_client_id);
    expect(ids[0]).toBe(ids[1]);
    // Mutation: a fresh id per tap turns a lost reply into a double swap, or a stale-order error for the owner's own change.
    f.rpc.mockImplementation(async (name: string) =>
      name === 'get_staff_orders'
        ? { data: f.state.list, error: null }
        : { data: [{ replayed: false }], error: null }
    );
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    const later = sent(f.rpc).map((c) => c[1].p_client_id);
    expect(later[2]).toBe(ids[0]); // the pending one is finally settled...
    expect(later[3]).not.toBe(later[2]); // ...and the next swap is a new one
  });

  it('a swap the week has no room for says how many slots are left', async () => {
    const f = fake([raw()], { staff_swap_item: { error: { code: 'ZC002', details: '1' } } });
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'rvc'));
    await settle();
    expect(toasts(runtime)).toContain(STAFF_COPY.noRoom(1));
  });

  it('a refund shows what was paid, and a refunded order is not reopened', async () => {
    const f = fake([raw({ total_cents: 30000, paid_cents: 20000 })]);
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).refundOrder('HC-1001', 'GC-1'));
    await settle();
    expect(toasts(runtime)).toContain(STAFF_COPY.refunded('₱200'));
    // Mutation: showing the total tells the owner she refunded ₱300 when only ₱200 was ever paid.
    cleanup();
    const g = fake([raw({ state: 'Cancelled', pay_state: 'refunded' })]);
    const second = await mounted('owner', g);
    act(() => actions(second).reopenOrder('HC-1001'));
    await settle();
    expect(sent(g.rpc)).toEqual([]);
    expect(toasts(second)).toContain(STAFF_COPY.reopenRefunded);
  });

  it('swapping a flavour for itself is refused before anything is sent', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).replaceLine('HC-1001', 'wcb', 'wcb'));
    await settle();
    expect(sent(f.rpc)).toEqual([]);
  });

  it('a payment that no longer fits its pickup week opens the overage sheet, and "confirm anyway" forces it', async () => {
    const f = fake([unpaid()], {
      staff_confirm_payment: { error: { code: 'ZC002', details: '1' } }
    });
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).confirmPayment('HC-1002'));
    await settle();
    expect(runtime.state.sheet).toMatchObject({ kind: 'overage', id: 'HC-1002', left: 1, n: 2 });
    f.rpc.mockClear();
    act(() => actions(runtime).confirmPayment('HC-1002', true));
    await settle();
    expect(sent(f.rpc)[0][1].p_force).toBe(true);
    // Mutation: ignoring the capacity outcome leaves the owner with a paid tick that did nothing and no word why.
  });

  it('a refused change (the order moved on) reloads and says so', async () => {
    const f = fake([raw()], { staff_set_status: { error: { code: '55000' } } });
    const runtime = await mounted('owner', f);
    act(() => actions(runtime).packOrder('HC-1001'));
    await settle();
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual(['staff_set_status', 'get_staff_orders']);
    expect(toasts(runtime)).toContain(STAFF_COPY.refused);
  });

  it('changes nothing until the orders have been read', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('owner', f, false);
    act(() => actions(runtime).packOrder('HC-1001'));
    await settle();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(toasts(runtime)).toContain(STAFF_COPY.notLoaded);
  });
});

describe('B3: the bake list counts unpaid orders (28 Sep)', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('counts paid and unpaid orders, not cancelled or finished ones, per pickup day', async () => {
    const f = fake([
      raw(),
      unpaid(),
      raw({ id: 'HC-1003', state: 'Cancelled', pay_state: 'refunded' }),
      raw({ id: 'HC-1004', state: 'Completed' }),
      raw({ id: 'HC-1005', pickup_date: '2026-10-08' }),
      raw({ id: 'HC-1006', pickup_date: '2026-10-19' }), // the week after next: not baked yet
      // Last week: an unpaid order nobody cancelled must not turn last week into this week.
      unpaid({ id: 'HC-0900', pickup_date: '2026-09-21' })
    ]);
    const runtime = await mounted('owner', f);
    // wcb x2 confirmed (Mon), x2 unpaid (Mon), x2 confirmed (Thu); cancelled and completed do not count.
    expect(actions(runtime).demand('wcb')).toBe(6);
    expect(actions(runtime).demandDay('wcb', 'sat')).toBe(4);
    expect(actions(runtime).demandDay('wcb', 'sun')).toBe(2);
    // Mutation: filtering on ['Confirmed', 'Preparing'] again drops the unpaid order Cine bakes for; dropping the drop test adds HC-1006's 2 wcb.
  });

  it('baking a flavour does not rewrite order statuses locally (live mode has no baking status)', async () => {
    const f = fake([raw(), unpaid()]);
    const runtime = await mounted('owner', f);
    const before = runtime.state.orders as unknown[];
    expect(actions(runtime).markBaking('wcb')).toBe(before);
  });
});

describe('B3: customer messages', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const businessItems = (r: OpsRuntime) =>
    r.renderVals().toolGroups.find((g) => g.title === 'Business')?.items ?? [];
  const entry = (r: OpsRuntime) => businessItems(r).find((i) => i.label === 'Customer messages');

  it('the owner has the entry; opening it lists a status link and text per open order', async () => {
    const f = fake([raw(), unpaid(), raw({ id: 'HC-1009', state: 'Completed' })]);
    const runtime = await mounted('owner', f);
    expect(entry(runtime)).toBeDefined();
    act(() => entry(runtime)!.go());
    await settle();
    const vals = runtime.renderVals();
    expect(vals.sheet).toMatchObject({ liveForm: true, title: 'Customer messages' });
    const rows = vals.liveMessages!.rows;
    expect(rows.map((r: { order: string }) => r.order).sort()).toEqual(['HC-1001', 'HC-1002']);
    expect(rows.every((r: { text: string }) => r.text.includes('/status#t=' + TOKEN))).toBe(true);
  });

  it('a helper has neither the entry nor the sheet, even if the sheet kind is forced open', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('helper', f);
    expect(entry(runtime)).toBeUndefined();
    act(() => runtime.sheet('ordermessages', {}));
    expect(runtime.renderVals().liveMessages ?? null).toBeNull();
    expect(runtime.renderVals().sheet).not.toMatchObject({ title: 'Customer messages' });
  });
});

describe('B3: demo mode is untouched', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reads nothing from the database and keeps the engine’s own local actions', async () => {
    live = false;
    const f = fake([raw()]);
    const runtime = await mounted('owner', f, false);
    expect(await runtime.loadOrders(f.client)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
    const before = (runtime.state.orders as Array<{ id: string; status: string }>).find(
      (o) => o.status === 'Payment review'
    )!;
    act(() => actions(runtime).confirmPayment(before.id, true));
    expect(
      (runtime.state.orders as Array<{ id: string; status: string }>).find(
        (o) => o.id === before.id
      )!.status
    ).toBe('Confirmed');
    expect(f.rpc).not.toHaveBeenCalled();
    expect(runtime.renderVals().liveMessages ?? null).toBeNull();
  });
});

describe('B3: the order detail’s status link and the ported screens fed from the database', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T05:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const openOrder = (runtime: OpsRuntime, id: string) =>
    act(() => runtime.setState({ screen: 'order', orderId: id }));

  it('shows the real status link and really copies it, not the ported made-up address', async () => {
    const f = fake([raw()]);
    const runtime = await mounted('owner', f);
    openOrder(runtime, 'HC-1001');
    const od = runtime.renderVals().od!;
    expect(od.link).toBe(`${window.location.origin}/status#t=${TOKEN}`);
    expect(String(od.link)).not.toContain('happycookie.ph');
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: write }
    });
    await act(async () => od.copyLink());
    expect(write).toHaveBeenCalledWith(od.link);
    // Mutation: leaving the ported values sends Cine a dead link and a toast that copied nothing.
  });

  it('an order with no token (erased) has no link and says so instead of copying nothing', async () => {
    const f = fake([raw({ status_token: null })]);
    const runtime = await mounted('owner', f);
    openOrder(runtime, 'HC-1001');
    const od = runtime.renderVals().od!;
    expect(od.link).toBe('');
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: write }
    });
    await act(async () => od.copyLink());
    expect(write).not.toHaveBeenCalled();
    expect(toasts(runtime)).toContain('no status link');
  });

  it('the orders, order-detail and bake screens render orders from the database, with a swap, a flag, a balance and a refund', async () => {
    const f = fake([
      raw({
        id: 'HC-2001',
        total_cents: 30000,
        paid_cents: 20000, // a balance of 100 pesos after a dearer swap
        items: [
          { product_id: 'wcb', qty: 1, unit_price_cents: 10000, unavailable: true },
          { product_id: 'rvc', qty: 1, unit_price_cents: 20000, unavailable: false }
        ],
        swaps: [
          { from: 'hc', to: 'rvc', qty: 1, delta_cents: 10000, at: '2026-09-29T03:00:00.000Z' }
        ]
      }),
      raw({ id: 'HC-2002', state: 'Cancelled', pay_state: 'refunded', refund_ref: 'GC-9' }),
      unpaid({ id: 'HC-2003' })
    ]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runtime = await mounted('owner', f);
    const views: Array<[string, string]> = [
      ['orders', ''],
      ['order', 'HC-2001'],
      ['order', 'HC-2002'],
      ['order', 'HC-2003'],
      ['bake', '']
    ];
    for (const [screen, id] of views) {
      act(() => runtime.setState({ screen: screen as ScreenKey, orderId: id || null }));
      const v = runtime.renderVals();
      const { container, unmount } = render(
        screen === 'orders' ? (
          <OrdersScreen v={v} />
        ) : screen === 'order' ? (
          <OrderDetailScreen v={v} />
        ) : (
          <BakePlanScreen v={v} />
        )
      );
      expect(container.textContent).not.toMatch(/undefined|NaN|Infinity/);
      if (screen === 'order' && id === 'HC-2001') expect(container.textContent).toContain('100');
      unmount();
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
