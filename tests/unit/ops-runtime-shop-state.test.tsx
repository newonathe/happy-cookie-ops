import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import type { ShopStatusClient } from '@/lib/data/shop-status';

/**
 * B3: the shop's open state comes from the server, the owner's "close now" reaches it, and the
 * owner edits the order rules. Demo mode keeps the engine's own local switch.
 */
const STAMP = '2026-09-29T02:00:00.123456+00:00';
// A Wednesday, 13:00 in Manila: inside the engine's built-in Monday 9:00 to Thursday 21:00 schedule.
const NOW = new Date('2026-09-30T05:00:00Z');

const status = (over: Record<string, unknown> = {}) => ({
  open_dow: 5,
  open_h: 9,
  open_m: 0,
  close_dow: 0,
  close_h: 9,
  close_m: 15,
  extend_h: 0,
  override: null,
  ...over
});
const rulesRow = (over: Record<string, unknown> = {}) => ({
  unpaid_hold_hours: 24,
  max_unpaid_per_phone: 2,
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  updated_at: STAMP,
  ...over
});

function fake(over: { status?: unknown; set?: unknown; save?: unknown; rules?: unknown } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_shop_status') return { data: over.status ?? status(), error: null };
    if (name === 'set_shop_override')
      return over.set ?? { data: [{ override: null }], error: null };
    if (name === 'get_order_rules') return { data: over.rules ?? [rulesRow()], error: null };
    if (name === 'save_order_rules')
      return over.save ?? { data: [{ updated_at: STAMP }], error: null };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } as unknown as ShopStatusClient };
}

type Shop = {
  shopState: () => string;
  shopOpen: () => boolean;
  setDropState: (st: string) => void;
  closeDropEarly: () => void;
  reopenDrop: () => void;
  extendDrop: () => void;
  closeDrop: () => void;
};
const shop = (r: OpsRuntime) => r as unknown as Shop;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const called = (rpc: ReturnType<typeof fake>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toasts ?? r.state.toast ?? '');

async function mounted(role: Role, f: ReturnType<typeof fake>, load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  if (load)
    await act(async () => {
      await runtime.loadShopStatus(f.client);
    });
  f.rpc.mockClear();
  return runtime;
}

describe('B3: the shop’s open state from the server (live mode)', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('a customer page judges open or closed by the owner’s window, not the built-in default', async () => {
    const before = await mounted('owner', fake(), false);
    expect(shop(before).shopState()).toBe('open'); // the built-in Monday-Thursday schedule
    cleanup();
    const f = fake(); // the owner's window is Friday 9:00 to Sunday 9:15: closed on a Wednesday
    const runtime = await mounted('owner', f);
    expect(shop(runtime).shopState()).toBe('closed');
    expect(shop(runtime).shopOpen()).toBe(false);
    // Mutation: not patching cfg leaves the banner and the add buttons on the default schedule, "open" while the server refuses.
  });

  it('the owner’s hold applies on top: closed, sold out, or held open outside the window', async () => {
    for (const [override, expected] of [
      ['closed', 'closed'],
      ['soldout', 'soldout'],
      ['open', 'open'],
      ['soon', 'soon']
    ] as const) {
      const runtime = await mounted('owner', fake({ status: status({ override }) }));
      expect(shop(runtime).shopState()).toBe(expected);
      cleanup();
    }
    // Mutation: ignoring the override leaves "close now" a local toy that stops no customer.
  });

  it('a signed-in owner’s settings are not overwritten by the public window (an unsaved edit survives)', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    act(() => runtime.setRole('owner'));
    (runtime as unknown as { settingsSync: unknown }).settingsSync = { dispose: () => undefined };
    const f = fake({ status: status({ override: 'closed' }) });
    await act(async () => {
      await runtime.loadShopStatus(f.client);
    });
    expect(shop(runtime).shopState()).toBe('closed'); // the switch still applies
    expect((runtime.state.cfg as Record<string, unknown>).openDow).not.toBe(5); // the window does not
    // Mutation: always patching cfg replaces a debounced, unsaved schedule edit on a visibility reload.
  });

  it('a failed or malformed read keeps what the page had', async () => {
    const runtime = await mounted('owner', fake({ status: status({ open_dow: 9 }) }));
    expect(shop(runtime).shopState()).toBe('open');
    const failing = {
      rpc: vi.fn(async () => ({ data: null, error: { code: '57014' } }))
    } as unknown as ShopStatusClient;
    expect(await runtime.loadShopStatus(failing)).toBe(false);
    expect(await runtime.loadShopStatus(null)).toBe(false);
    expect(shop(runtime).shopState()).toBe('open');
  });

  it('"close now" reaches the server first, and only then changes the screen', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    act(() => shop(runtime).closeDropEarly());
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toEqual([
      ['set_shop_override', { p_mode: 'closed' }]
    ]);
    expect(runtime.state.shopOverride).toBe('closed');
    // Mutation: dropping the constructor override runs the ported local switch: nothing reaches the server.
  });

  it('the shop-status sheet sends each choice, "follow my schedule" as null', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    for (const st of ['soldout', 'soon', 'open', 'closed', 'auto'])
      act(() => shop(runtime).setDropState(st));
    await settle();
    expect(called(f.rpc, 'set_shop_override').map((c) => c[1].p_mode)).toEqual([
      'soldout',
      'soon',
      'open',
      'closed',
      null
    ]);
    expect(runtime.state.shopOverride).toBeNull();
    act(() => shop(runtime).closeDropEarly());
    await settle();
    f.rpc.mockClear();
    act(() => shop(runtime).reopenDrop());
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toEqual([['set_shop_override', { p_mode: null }]]);
    expect(runtime.state.shopOverride).toBeNull();
  });

  it('"Extend closing" hands the shop back to the window on the server too, not only on screen', async () => {
    const f = fake({ status: status({ override: 'closed' }) });
    const runtime = await mounted('owner', f);
    expect(runtime.state.shopOverride).toBe('closed');
    act(() => shop(runtime).extendDrop());
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toEqual([['set_shop_override', { p_mode: null }]]);
    expect(runtime.state.shopOverride).toBeNull();
    // Mutation: without the wrapper the screen says open while place_order keeps refusing with "closed".
  });

  it('closing the drop clears the switch on the server only when the engine lets it close', async () => {
    const f = fake({ status: status({ override: 'open' }) });
    const runtime = await mounted('owner', f);
    act(() =>
      runtime.setState({
        orders: [
          { id: 'x', name: 'A B', status: 'Confirmed', items: { wcb: 1 }, priced: { wcb: 100 } }
        ]
      })
    );
    act(() => shop(runtime).closeDrop()); // refused: an order is unfinished
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toEqual([]);
    expect(runtime.state.shopOverride).toBe('open');
    act(() => runtime.setState({ orders: [] }));
    act(() => shop(runtime).closeDrop());
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toEqual([['set_shop_override', { p_mode: null }]]);
    expect(runtime.state.shopOverride).toBeNull();
    // Mutation: without the wrapper the rollover clears the hold on screen only, and place_order keeps the shop open.
  });

  it('a refused or unsent switch changes nothing on screen and says so', async () => {
    const refused = fake({ set: { error: { code: '42501' } } });
    const runtime = await mounted('owner', refused);
    act(() => shop(runtime).closeDropEarly());
    await settle();
    expect(runtime.state.shopOverride ?? null).toBeNull();
    expect(toasts(runtime)).toContain('could not be saved');
    cleanup();
    const lost = fake({ set: { error: { code: '' } } });
    const second = await mounted('owner', lost);
    act(() => shop(second).closeDropEarly());
    await settle();
    expect(second.state.shopOverride ?? null).toBeNull();
    cleanup();
    const noClient = await mounted('owner', fake(), false);
    act(() => shop(noClient).closeDropEarly());
    await settle();
    expect(noClient.state.shopOverride ?? null).toBeNull();
    expect(toasts(noClient)).toContain('Offline');
    // Mutation: running the ported action regardless shows "Shop held at Closed" while customers still order.
  });

  it('demo mode keeps the engine’s own local switch and calls nothing', async () => {
    live = false;
    const f = fake();
    const runtime = await mounted('owner', f, false);
    expect(await runtime.loadShopStatus(f.client)).toBe(false);
    act(() => shop(runtime).closeDropEarly());
    expect(runtime.state.shopOverride).toBe('closed');
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

describe('B3: the order rules form', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => cleanup());

  const entry = (r: OpsRuntime) =>
    r
      .renderVals()
      .toolGroups.find((g) => g.title === 'Business')
      ?.items.find((i) => i.label === 'Order rules');

  it('opens on the rules as read, and saves the nine keys against the stamp it read', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    await act(async () => entry(runtime)!.go());
    await settle();
    const vals = runtime.renderVals();
    expect(vals.sheet).toMatchObject({ liveForm: true, title: 'Order rules' });
    expect(vals.liveOrderRules!.rules).toMatchObject({
      unpaidHoldHours: 24,
      pickupDays: [1, 4],
      campusFrom: '14:00'
    });
    f.rpc.mockClear();
    act(() =>
      vals.liveOrderRules!.save({
        ...vals.liveOrderRules!.rules,
        pickupDays: [4, 1, 5],
        unpaidHoldHours: 48
      })
    );
    await settle();
    const [[, args]] = called(f.rpc, 'save_order_rules');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_rules).toMatchObject({ pickup_days: [1, 4, 5], unpaid_hold_hours: 48 });
    expect(runtime.renderVals().liveOrderRules ?? null).toBeNull(); // saved: the sheet closes
  });

  it('a value the database would refuse is not sent', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    await act(async () => entry(runtime)!.go());
    await settle();
    f.rpc.mockClear();
    const live1 = runtime.renderVals().liveOrderRules!;
    act(() => live1.save({ ...live1.rules, pickupDays: [] }));
    await settle();
    expect(called(f.rpc, 'save_order_rules')).toEqual([]);
    expect(toasts(runtime)).toContain('pickup day');
  });

  it('a change made elsewhere meanwhile shows their version and keeps the sheet open on it', async () => {
    const f = fake({ save: { error: { code: 'P0002' } } });
    const runtime = await mounted('owner', f);
    await act(async () => entry(runtime)!.go());
    await settle();
    const vals = runtime.renderVals().liveOrderRules!;
    act(() => vals.save({ ...vals.rules, unpaidHoldHours: 72 }));
    await settle();
    expect(toasts(runtime)).toContain('Someone else');
    expect(runtime.renderVals().liveOrderRules).not.toBeNull();
    expect(called(f.rpc, 'get_order_rules').length).toBeGreaterThanOrEqual(2);
  });

  it('is the owner’s alone, even with the rules already read and the sheet open', async () => {
    const f = fake();
    const runtime = await mounted('helper', f);
    expect(entry(runtime)).toBeUndefined();
    act(() => runtime.setRole('owner'));
    await act(async () => entry(runtime)!.go());
    await settle();
    expect(runtime.renderVals().liveOrderRules).not.toBeNull();
    act(() => runtime.setRole('helper'));
    act(() => runtime.sheet('orderrules', {}));
    expect(runtime.renderVals().liveOrderRules ?? null).toBeNull();
    expect(runtime.renderVals().sheet).not.toMatchObject({ title: 'Order rules' });
    // Mutation: dropping the role test shows the form to a helper who opens the sheet kind directly.
  });
});
