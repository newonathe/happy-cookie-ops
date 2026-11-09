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
const called = (rpc: { mock: { calls: readonly (readonly unknown[])[] } }, name: string) =>
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
    (runtime as unknown as { settingsSync: unknown }).settingsSync = {
      dispose: () => undefined,
      isDefault: () => false
    };
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
      .toolGroups.flatMap((g) => g.items)
      .find((i) => i.label === 'Order rules');

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

describe('public opening-times recovery', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it('settles an unconfigured source as unavailable without claiming a default opening status', async () => {
    const r = await mounted('owner', fake(), false);
    act(() => r.go('shop'));
    await act(async () => {
      expect(await r.loadShopStatus(null)).toBe(false);
    });
    expect(r.renderVals().liveShopAvailability).toMatchObject({ state: 'failed', stale: false });
    expect(r.renderVals().dropBannerTitle).toBe('Opening times are unavailable');
  });
  it('retries a first failure and warns while retaining a malformed last-good refresh', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '503' } })
      .mockResolvedValueOnce({ data: status({ override: 'open' }), error: null })
      .mockResolvedValue({ data: { override: 'closed' }, error: null });
    const client = { rpc } as unknown as ShopStatusClient,
      r = await mounted('owner', fake(), false);
    act(() => r.go('shop'));
    await act(async () => {
      await r.loadShopStatus(client);
    });
    expect(r.renderVals().liveShopAvailability).toMatchObject({ state: 'failed', stale: false });
    await act(async () => {
      r.renderVals().liveShopAvailability!.retry!();
      await Promise.resolve();
    });
    expect(r.renderVals().liveShopAvailability).toMatchObject({ state: 'ready', stale: false });
    expect(shop(r).shopState()).toBe('open');
    await act(async () => {
      await r.reloadShopStatus();
    });
    expect(r.renderVals().liveShopAvailability).toMatchObject({ state: 'failed', stale: true });
    expect(shop(r).shopState()).toBe('open');
  });
  it('rejects late answers and old Retry after public source A to B to A', async () => {
    const r = await mounted('owner', fake(), false);
    act(() => r.go('shop'));
    let release!: (value: unknown) => void;
    const rpc = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValue({ data: null, error: { code: '503' } });
    const a = { rpc } as unknown as ShopStatusClient,
      b = fake({ status: status({ override: 'closed' }) });
    let pending!: Promise<boolean>;
    act(() => {
      pending = r.loadShopStatus(a);
    });
    await act(async () => {
      await r.loadShopStatus(b.client);
      release({ data: status({ override: 'open' }), error: null });
      expect(await pending).toBe(false);
    });
    expect(shop(r).shopState()).toBe('closed');
    await act(async () => {
      await r.loadShopStatus(a);
    });
    const retry = r.renderVals().liveShopAvailability!.retry!;
    await act(async () => {
      await r.loadShopStatus(b.client);
      await r.loadShopStatus(a);
    });
    const calls = rpc.mock.calls.length;
    await act(async () => {
      retry();
      await Promise.resolve();
    });
    expect(rpc).toHaveBeenCalledTimes(calls);
  });
});

describe('owner opening-write isolation', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const heldSave = () => {
    let release!: (value: unknown) => void;
    const rpc = vi.fn(async (name: string) =>
      name === 'set_shop_override'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : { data: status({ override: 'open' }), error: null }
    );
    return {
      client: { rpc } as unknown as ShopStatusClient,
      rpc,
      release: () => release({ data: [], error: null })
    };
  };
  it('does not apply a held acknowledgement after an owner role A to B to A change', async () => {
    const r = await mounted('owner', fake(), false),
      f = heldSave();
    await act(async () => {
      await r.loadShopStatus(f.client);
    });
    act(() => shop(r).closeDropEarly());
    act(() => r.setRole('helper'));
    act(() => r.setRole('owner'));
    await act(async () => {
      f.release();
      await Promise.resolve();
    });
    await settle();
    expect(r.state.shopOverride).toBe('open');
    expect(toasts(r)).not.toContain('No new orders can come in');
  });
  it('does not apply a held acknowledgement after source A to B to A', async () => {
    const r = await mounted('owner', fake(), false),
      f = heldSave();
    await act(async () => {
      await r.loadShopStatus(f.client);
    });
    act(() => shop(r).closeDropEarly());
    await act(async () => {
      await r.loadShopStatus(fake({ status: status({ override: 'open' }) }).client);
      await r.loadShopStatus(f.client);
      f.release();
    });
    await settle();
    expect(r.state.shopOverride).toBe('open');
  });
  it('retires an earlier opening read when a write is confirmed', async () => {
    let release!: (value: unknown) => void,
      hold = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'set_shop_override') return { data: [], error: null };
      if (hold) {
        hold = false;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return { data: status({ override: 'open' }), error: null };
    });
    const r = await mounted('owner', fake(), false),
      client = { rpc } as unknown as ShopStatusClient;
    await act(async () => {
      await r.loadShopStatus(client);
    });
    let pending!: Promise<boolean>;
    act(() => {
      hold = true;
      pending = r.reloadShopStatus();
      shop(r).closeDropEarly();
    });
    await settle();
    expect(r.state.shopOverride).toBe('closed');
    await act(async () => {
      release({ data: status({ override: 'open' }), error: null });
      expect(await pending).toBe(false);
    });
    expect(r.state.shopOverride).toBe('closed');
  });
  it('sends a rendered choice through the server and rejects a retired rendered choice', async () => {
    const f = heldSave(),
      r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus(f.client);
    });
    const first = r.renderVals().dropStates.find((row) => row.label === 'Closed')!;
    act(() => first.go());
    expect(called(f.rpc, 'set_shop_override')).toEqual([
      ['set_shop_override', { p_mode: 'closed' }]
    ]);
    expect(r.state.shopOverride).toBe('open');
    await act(async () => {
      f.release();
    });
    await settle();
    const old = r.renderVals().dropStateOptions.find((row) => row.label === 'Open')!;
    act(() => r.setRole('helper'));
    act(() => r.setRole('owner'));
    const count = called(f.rpc, 'set_shop_override').length;
    act(() => old.go());
    await settle();
    expect(called(f.rpc, 'set_shop_override')).toHaveLength(count);
  });
  it.each(['role', 'source', 'period'])(
    'rejects a cached close confirmation after %s retirement',
    async (retirement) => {
      const f = fake({ status: status({ override: 'open' }) }),
        r = await mounted('owner', f);
      const confirm = r.renderVals().closeDropConfirm;
      if (retirement === 'role') {
        act(() => r.setRole('helper'));
        act(() => r.setRole('owner'));
      }
      if (retirement === 'source')
        await act(async () => {
          await r.loadShopStatus(fake().client);
          await r.loadShopStatus(f.client);
        });
      if (retirement === 'period') act(() => r.setState({ dropNo: Number(r.state.dropNo) + 1 }));
      act(() => confirm());
      await settle();
      expect(called(f.rpc, 'set_shop_override')).toEqual([]);
    }
  );

  it('reads server truth after an older save reply without closing a newer sheet', async () => {
    let current: string | null = 'open';
    const releases = new Map<string, () => void>();
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name !== 'set_shop_override') return { data: status({ override: current }), error: null };
      const mode = String(args?.p_mode);
      return new Promise((resolve) =>
        releases.set(mode, () => {
          current = mode;
          resolve({ data: [], error: null });
        })
      );
    });
    const r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus({ rpc } as unknown as ShopStatusClient);
    });
    act(() => {
      shop(r).closeDropEarly();
      shop(r).setDropState('open');
    });
    await act(async () => {
      releases.get('open')!();
    });
    await settle();
    act(() => r.sheet('orderrules', { updatedAt: 'keep-this-sheet' }));
    await act(async () => {
      releases.get('closed')!();
    });
    await settle();
    expect(r.state.shopOverride).toBe('closed');
    expect(r.state.sheet).toMatchObject({ kind: 'orderrules', updatedAt: 'keep-this-sheet' });
    expect(rpc.mock.calls.filter((call) => call[0] === 'get_shop_status').length).toBeGreaterThan(
      1
    );
  });
  it('shows a pending mode before its acknowledgement', async () => {
    const f = heldSave(),
      r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus(f.client);
    });
    act(() => shop(r).closeDropEarly());
    expect(r.renderVals().liveShopOverride).toMatchObject({
      phase: 'sending',
      requested: 'Closed'
    });
    expect(r.state.shopOverride).toBe('open');
    await act(async () => {
      f.release();
    });
    await settle();
    expect(r.renderVals().liveShopOverride).toMatchObject({ phase: 'saved', requested: 'Closed' });
  });
  it('keeps an unknown mode across navigation and checks current state without resending it', async () => {
    let current = 'open';
    const rpc = vi.fn(async (name: string) => {
      if (name === 'set_shop_override') {
        current = 'closed';
        throw TypeError('Committed reply lost');
      }
      return { data: status({ override: current }), error: null };
    });
    const r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus({ rpc } as unknown as ShopStatusClient);
    });
    act(() => shop(r).closeDropEarly());
    await settle();
    act(() => {
      r.go('today');
      r.go('drops');
    });
    expect(r.renderVals().liveShopOverride).toMatchObject({
      phase: 'unknown',
      requested: 'Closed',
      read: 'idle'
    });
    await act(async () => {
      r.renderVals().liveShopOverride!.check();
    });
    await settle();
    expect(r.renderVals().liveShopOverride).toMatchObject({
      phase: 'unknown',
      read: 'ready',
      current: 'Closed'
    });
    expect(called(rpc, 'set_shop_override')).toHaveLength(1);
    const check = r.renderVals().liveShopOverride!.check;
    act(() => r.setRole('helper'));
    act(() => r.setRole('owner'));
    const reads = called(rpc, 'get_shop_status').length;
    act(() => check());
    await settle();
    expect(called(rpc, 'get_shop_status')).toHaveLength(reads);
    expect(r.renderVals().liveShopOverride).toBeNull();
  });
  it('keeps a confirmed save distinct from failed status readback', async () => {
    let fail = false;
    const rpc = vi.fn(async (name: string) =>
      name === 'set_shop_override'
        ? { data: [], error: null }
        : fail
          ? { data: null, error: { code: '503' } }
          : { data: status({ override: 'open' }), error: null }
    );
    const r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus({ rpc } as unknown as ShopStatusClient);
    });
    act(() => shop(r).closeDropEarly());
    await settle();
    fail = true;
    await act(async () => {
      r.renderVals().liveShopOverride!.check();
    });
    await settle();
    expect(r.renderVals().liveShopOverride).toMatchObject({
      phase: 'saved',
      read: 'failed',
      requested: 'Closed'
    });
    expect(called(rpc, 'set_shop_override')).toHaveLength(1);
  });
  it('retains an offline choice without sending it', async () => {
    const f = fake(),
      r = await mounted('owner', f);
    act(() => {
      r.setState({ online: false });
    });
    act(() => shop(r).closeDropEarly());
    await settle();
    expect(r.renderVals().liveShopOverride).toMatchObject({
      phase: 'unsent',
      requested: 'Closed',
      canCheck: false
    });
    expect(called(f.rpc, 'set_shop_override')).toEqual([]);
    act(() => r.renderVals().liveShopOverride!.check());
    await settle();
    expect(called(f.rpc, 'get_shop_status')).toEqual([]);
  });
  it('does not let an old status Cancel close a newer form', async () => {
    const r = await mounted('owner', fake());
    act(() => r.sheet('dropState', {}));
    const close = r.renderVals().closeSheet;
    act(() => r.sheet('orderrules', { updatedAt: 'keep-new-form' }));
    act(() => close());
    expect(r.state.sheet).toMatchObject({ kind: 'orderrules', updatedAt: 'keep-new-form' });
  });
  it('does not replace a newer saved notice with an old refusal', async () => {
    const releases = new Map<string, (reply: unknown) => void>();
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) =>
      name === 'set_shop_override'
        ? new Promise((resolve) => releases.set(String(args?.p_mode), resolve))
        : { data: status(), error: null }
    );
    const r = await mounted('owner', fake(), false);
    await act(async () => {
      await r.loadShopStatus({ rpc } as unknown as ShopStatusClient);
    });
    act(() => {
      shop(r).setDropState('closed');
      shop(r).setDropState('open');
    });
    await act(async () => {
      releases.get('open')!({ data: [], error: null });
    });
    await settle();
    await act(async () => {
      releases.get('closed')!({ data: null, error: { code: '42501' } });
    });
    await settle();
    expect(r.renderVals().liveShopOverride).toMatchObject({ phase: 'saved', requested: 'Open' });
    expect(toasts(r)).not.toContain('could not be saved');
  });
});
