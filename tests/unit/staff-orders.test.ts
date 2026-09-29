import { describe, expect, it, vi } from 'vitest';
import {
  StaffOrderSync,
  classify,
  currentWeek,
  dayKey,
  parseStaffOrders,
  toEngineOrder,
  weekKey,
  type StaffOrderClient
} from '@/lib/data/staff-orders';
import { messagesFor, statusLink } from '@/lib/orders/messages';
import { STAFF_COPY } from '@/lib/orders/staff-copy';

/**
 * B3: the owner's order list, its mapping into the engine's order shape, the outcome of each
 * staff RPC, and the texts Cine copies. Each rule names the mutation that would break it.
 */
const TOKEN = 'a'.repeat(64);
const STAMP = '2026-09-29T02:00:00.123456+00:00';

const raw = (over: Record<string, unknown> = {}) => ({
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

describe('parseStaffOrders', () => {
  it('reads a well-formed row', () => {
    const [o] = parseStaffOrders([raw()]);
    expect(o).toMatchObject({
      id: 'HC-1001',
      state: 'Confirmed',
      payState: 'confirmed',
      totalCents: 20000,
      paidCents: 20000
    });
    expect(o.items).toEqual([{ productId: 'wcb', qty: 2, unitCents: 10000, unavailable: false }]);
    // Mutation: keeping the raw string for updated_at parsed as a Date loses the microseconds the RPC compares.
    expect(o.updatedAt).toBe(STAMP);
  });

  it('drops a row that would crash a screen, and keeps the rest', () => {
    const rows = parseStaffOrders([
      raw(),
      raw({ id: 'HC-1002', state: 'Baked' }),
      raw({ id: 'HC-1003', items: [] }),
      raw({
        id: 'HC-1004',
        items: [{ product_id: 'wcb', qty: 0, unit_price_cents: 1, unavailable: false }]
      }),
      raw({ id: 'HC-1005', total_cents: 'x' }),
      raw({ id: 'HC-1006', placed_at: 'yesterday' }),
      'nope',
      null
    ]);
    // Mutation: accepting an unknown state hands the engine a status it has no label or tone for.
    expect(rows.map((r) => r.id)).toEqual(['HC-1001']);
  });

  it('is empty for anything that is not a list', () => {
    expect(parseStaffOrders(null)).toEqual([]);
    expect(parseStaffOrders({ id: 'x' })).toEqual([]);
  });
});

describe('toEngineOrder', () => {
  it('speaks the engine: status is the state, prices are pesos, no email, phone as mobile', () => {
    const e = toEngineOrder(parseStaffOrders([raw()])[0], [1, 4]);
    expect(e).toMatchObject({
      id: 'HC-1001',
      status: 'Confirmed',
      mobile: '09171234567',
      email: '',
      items: { wcb: 2 },
      priced: { wcb: 100 },
      pay: 'GCash',
      paidAmount: 200,
      balance: null,
      needsContact: false
    });
    // Mutation: dividing by 10 or not at all shows every price wrong on every screen.
  });

  it('shows a balance when the total moved after payment, and none while unpaid', () => {
    const owing = toEngineOrder(
      parseStaffOrders([raw({ total_cents: 30000, paid_cents: 20000 })])[0],
      [1, 4]
    );
    expect(owing.balance).toBe(100);
    const unpaid = toEngineOrder(
      parseStaffOrders([
        raw({ state: 'Payment review', pay_state: 'unpaid', paid_cents: null })
      ])[0],
      [1, 4]
    );
    expect(unpaid.balance).toBeNull();
    expect(unpaid.paidAmount).toBeUndefined();
    // Mutation: computing the balance from paid_cents on an unpaid order shows the whole total as owed.
  });

  it('shows no balance on a refunded order, even when the total moved after it was paid', () => {
    const e = toEngineOrder(
      parseStaffOrders([
        raw({ state: 'Cancelled', pay_state: 'refunded', total_cents: 30000, paid_cents: 20000 })
      ])[0],
      [1, 4]
    );
    expect(e.balance).toBeNull();
    expect(e.paidAmount).toBeUndefined();
  });

  it('flags unavailable flavours and marks a swap', () => {
    const e = toEngineOrder(
      parseStaffOrders([
        raw({
          items: [
            { product_id: 'wcb', qty: 1, unit_price_cents: 10000, unavailable: true },
            { product_id: 'rvc', qty: 1, unit_price_cents: 12000, unavailable: false }
          ],
          swaps: [
            { from: 'hc', to: 'rvc', qty: 1, delta_cents: 2000, at: '2026-09-29T03:00:00.000Z' }
          ]
        })
      ])[0],
      [1, 4]
    );
    expect(e.unavailable).toEqual(['wcb']);
    expect(e.needsContact).toBe(true);
    expect(e.replaced).toBe(true);
    expect(e.swaps[0]).toMatchObject({ from: 'hc', to: 'rvc', qty: 1 });
  });

  it('marks a refunded order and keeps its reference', () => {
    const e = toEngineOrder(
      parseStaffOrders([raw({ state: 'Cancelled', pay_state: 'refunded', refund_ref: 'GC-1' })])[0],
      [1, 4]
    );
    expect(e).toMatchObject({ refunded: true, refundRef: 'GC-1', status: 'Cancelled' });
  });
});

describe('the pickup week', () => {
  const order = (over: Record<string, unknown> = {}) => parseStaffOrders([raw(over)])[0];

  it('weekKey is the Monday of the pickup date', () => {
    expect(weekKey('2026-10-05')).toBe('2026-10-05'); // a Monday
    expect(weekKey('2026-10-08')).toBe('2026-10-05'); // the Thursday
    expect(weekKey('2026-10-11')).toBe('2026-10-05'); // the Sunday is still that week
    expect(weekKey('2026-10-12')).toBe('2026-10-12');
    // Mutation: getUTCDay() without the Sunday-as-7 fix puts a Sunday pickup in the next week.
  });

  it('the current week is the earliest week with an open order, ignoring closed ones and undated ones', () => {
    const list = [
      order({ id: 'a', pickup_date: '2026-10-12' }),
      order({ id: 'b', pickup_date: '2026-10-05', state: 'Completed' }),
      order({ id: 'c', pickup_date: '2026-10-19', state: 'Payment review', pay_state: 'unpaid' }),
      order({ id: 'd', pickup_date: null })
    ];
    expect(currentWeek(list)).toBe('2026-10-12');
    expect(currentWeek([])).toBeNull();
  });

  it('an order outside the current week leaves the engine’s per-drop sums (drop -1); the current week and undated ones stay', () => {
    const week = '2026-10-05';
    expect(toEngineOrder(order({ pickup_date: '2026-10-19' }), [1, 4], week).drop).toBe(-1);
    expect(toEngineOrder(order({ pickup_date: '2026-10-08' }), [1, 4], week).drop).toBeUndefined();
    expect(toEngineOrder(order({ pickup_date: null }), [1, 4], week).drop).toBeUndefined();
    expect(toEngineOrder(order({ pickup_date: '2026-10-19' }), [1, 4]).drop).toBeUndefined();
    // Mutation: never setting drop counts 60 days of orders against one week's capacity ("Sold out" all the time).
  });
});

describe('dayKey', () => {
  it('maps the first pickup day of the week to sat and later ones to sun, by rank', () => {
    // 2026-10-05 is a Monday, 2026-10-08 a Thursday.
    expect(dayKey('2026-10-05', [1, 4])).toBe('sat');
    expect(dayKey('2026-10-08', [1, 4])).toBe('sun');
    expect(dayKey('2026-10-08', [4, 1])).toBe('sun');
    // Mutation: comparing to the unsorted list flips the columns when the owner types Thursday first.
    expect(dayKey('2026-10-08', [4])).toBe('sat');
    expect(dayKey(null, [1, 4])).toBe('sat');
  });
});

describe('classify', () => {
  it('reads success and a replay', () => {
    expect(classify({ data: [{ replayed: false }], error: null })).toEqual({
      kind: 'ok',
      replayed: false
    });
    expect(classify({ data: [{ replayed: true }], error: null })).toEqual({
      kind: 'ok',
      replayed: true
    });
  });

  it('separates a conflict, a capacity refusal with the slots left, and a missing order', () => {
    expect(classify({ error: { code: 'P0002' } })).toEqual({ kind: 'conflict' });
    expect(classify({ error: { code: 'ZC002', details: '3' } })).toEqual({
      kind: 'capacity',
      left: 3
    });
    expect(classify({ error: { code: 'ZC002', details: null } })).toEqual({
      kind: 'capacity',
      left: 0
    });
    expect(classify({ error: { code: '02000' } })).toEqual({ kind: 'gone' });
  });

  it('calls definite refusals refused, and an error with no SQLSTATE a lost reply', () => {
    for (const code of ['55000', '22023', '23505', '42501'])
      expect(classify({ error: { code } })).toEqual({ kind: 'refused', code });
    expect(classify({ error: { code: '' } })).toEqual({ kind: 'offline' });
    expect(classify({ error: {} })).toEqual({ kind: 'offline' });
    // Mutation: treating an unknown code as refused would reload and hide a reply that may have landed.
    expect(classify({ error: { code: '57014' } })).toEqual({ kind: 'offline' });
  });
});

function fakeSync(over: { online?: boolean; results?: Record<string, unknown> } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let list: unknown[] = [raw()];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args: args ?? {} });
    if (name === 'get_staff_orders') return { data: list, error: null };
    const result = over.results?.[name];
    return (
      (result as { data?: unknown; error?: unknown }) ?? {
        data: [{ replayed: false }],
        error: null
      }
    );
  });
  const hooks = {
    apply: vi.fn(),
    online: () => over.online ?? true,
    toast: vi.fn(),
    pickupDays: () => [1, 4]
  };
  const sync = new StaffOrderSync({ rpc } as unknown as StaffOrderClient, hooks);
  return { sync, rpc, hooks, calls, setList: (l: unknown[]) => (list = l) };
}

describe('StaffOrderSync', () => {
  it('loads the list into the engine and marks itself loaded', async () => {
    const { sync, hooks } = fakeSync();
    expect(sync.loaded).toBe(false);
    expect(await sync.load()).toBe(true);
    expect(sync.loaded).toBe(true);
    expect(hooks.apply).toHaveBeenCalledOnce();
    expect(hooks.apply.mock.calls[0][0][0]).toMatchObject({ id: 'HC-1001', status: 'Confirmed' });
  });

  it('a failed read keeps the last list and stays unloaded', async () => {
    const { sync, rpc } = fakeSync();
    rpc.mockResolvedValueOnce({ data: null, error: { code: '57014' } } as never);
    expect(await sync.load()).toBe(false);
    expect(sync.loaded).toBe(false);
  });

  it('sends the stamp from the last read, then reads again', async () => {
    const { sync, calls } = fakeSync();
    await sync.load();
    calls.length = 0;
    expect(await sync.confirm('HC-1001')).toEqual({ kind: 'ok', replayed: false });
    expect(calls[0]).toEqual({
      name: 'staff_confirm_payment',
      args: { p_order_id: 'HC-1001', p_expected_updated_at: STAMP, p_force: false }
    });
    // Mutation: sending null instead of the stamp makes every change a "stale" refusal, or worse, skips the check.
    expect(calls[1].name).toBe('get_staff_orders');
  });

  it('sends nothing while offline, and says so', async () => {
    const { sync, calls, hooks } = fakeSync({ online: false });
    await sync.load();
    calls.length = 0;
    expect(await sync.setStatus('HC-1001', 'Ready')).toEqual({ kind: 'offline' });
    expect(calls).toEqual([]);
    expect(hooks.toast).toHaveBeenCalledWith(STAFF_COPY.offline, 'warn');
  });

  it('says the list is not loaded rather than sending a change for an unknown order', async () => {
    const { sync, calls, hooks } = fakeSync();
    expect(await sync.reject('HC-1001')).toEqual({ kind: 'gone' });
    expect(calls).toEqual([]);
    expect(hooks.toast).toHaveBeenCalledWith(STAFF_COPY.notLoaded, 'warn');
  });

  it('a conflict shows the other version: it tells the owner and reloads', async () => {
    const { sync, calls, hooks } = fakeSync({
      results: { staff_reject_payment: { error: { code: 'P0002' } } }
    });
    await sync.load();
    calls.length = 0;
    expect(await sync.reject('HC-1001')).toEqual({ kind: 'conflict' });
    expect(hooks.toast).toHaveBeenCalledWith(STAFF_COPY.conflict, 'warn');
    expect(calls.map((c) => c.name)).toEqual(['staff_reject_payment', 'get_staff_orders']);
  });

  it('a refusal reloads and tells the owner; a lost reply reloads too, and says it is unsure', async () => {
    const refused = fakeSync({ results: { staff_reopen_order: { error: { code: '55000' } } } });
    await refused.sync.load();
    refused.calls.length = 0;
    expect((await refused.sync.reopen('HC-1001')).kind).toBe('refused');
    expect(refused.hooks.toast).toHaveBeenCalledWith(STAFF_COPY.refused, 'warn');
    expect(refused.calls.map((c) => c.name)).toEqual(['staff_reopen_order', 'get_staff_orders']);

    const lost = fakeSync({ results: { staff_refund: { error: { code: '' } } } });
    await lost.sync.load();
    lost.calls.length = 0;
    expect((await lost.sync.refund('HC-1001', 'x')).kind).toBe('offline');
    // The reply may have landed: the list is read again so the screen shows what the database holds.
    expect(lost.calls.map((c) => c.name)).toEqual(['staff_refund', 'get_staff_orders']);
    // Mutation: not reloading after a lost reply leaves the screen showing the old state of a change that went through.
  });

  it('a capacity refusal on the paid tick comes back with the slots left, without reloading', async () => {
    const { sync, calls } = fakeSync({
      results: { staff_confirm_payment: { error: { code: 'ZC002', details: '1' } } }
    });
    await sync.load();
    calls.length = 0;
    expect(await sync.confirm('HC-1001')).toEqual({ kind: 'capacity', left: 1 });
    expect(calls.map((c) => c.name)).toEqual(['staff_confirm_payment']);
    await sync.confirm('HC-1001', true);
    expect(calls[1].args.p_force).toBe(true);
  });

  it('every action sends its own RPC with the order id and the stamp', async () => {
    const { sync, calls } = fakeSync();
    await sync.load();
    calls.length = 0;
    await sync.reopen('HC-1001');
    await sync.setStatus('HC-1001', 'Completed');
    await sync.flag('HC-1001', 'wcb', true);
    await sync.swap('HC-1001', 'wcb', 'rvc', 'b3f00000-0000-4000-8000-000000000001');
    await sync.refund('HC-1001', 'GC-1');
    await sync.settle('HC-1001');
    const sent = calls.filter((c) => c.name !== 'get_staff_orders');
    expect(sent.map((c) => c.name)).toEqual([
      'staff_reopen_order',
      'staff_set_status',
      'staff_flag_item',
      'staff_swap_item',
      'staff_refund',
      'staff_settle_balance'
    ]);
    expect(
      sent.every((c) => c.args.p_order_id === 'HC-1001' && c.args.p_expected_updated_at === STAMP)
    ).toBe(true);
    expect(sent[1].args.p_to).toBe('Completed');
    expect(sent[2].args).toMatchObject({ p_product_id: 'wcb', p_flagged: true });
    expect(sent[3].args).toMatchObject({
      p_from_product: 'wcb',
      p_to_product: 'rvc',
      p_client_id: 'b3f00000-0000-4000-8000-000000000001'
    });
    expect(sent[4].args.p_ref).toBe('GC-1');
  });
});

describe('customer messages', () => {
  const order = (over: Record<string, unknown> = {}) => parseStaffOrders([raw(over)])[0];
  const name = (pid: string) => (pid === 'wcb' ? 'White Choc' : pid);

  it('builds the status link from the token, and nothing for a missing or malformed one', () => {
    expect(statusLink('https://shop.example', TOKEN)).toBe(
      `https://shop.example/status#t=${TOKEN}`
    );
    expect(statusLink('https://shop.example', null)).toBeNull();
    // Mutation: accepting any string as a token would put a customer's other data in a link.
    expect(statusLink('https://shop.example', 'abc')).toBeNull();
    expect(statusLink('https://shop.example', TOKEN.toUpperCase())).toBeNull();
  });

  it('one message that fits the state, and none for a closed order', () => {
    const kinds = (state: string, pay = 'confirmed') =>
      messagesFor(order({ state, pay_state: pay }), 'https://s.example', name).map((m) => m.kind);
    expect(kinds('Payment review', 'unpaid')).toEqual(['unpaid']);
    expect(kinds('Confirmed')).toEqual(['paid']);
    expect(kinds('Preparing')).toEqual(['paid']);
    expect(kinds('Ready')).toEqual(['ready']);
    for (const closed of ['Completed', 'Cancelled', 'No-show']) expect(kinds(closed)).toEqual([]);
  });

  it('adds a swap question naming the flagged flavour, while it is flagged', () => {
    const flagged = order({
      items: [{ product_id: 'wcb', qty: 1, unit_price_cents: 10000, unavailable: true }]
    });
    const out = messagesFor(flagged, 'https://s.example', name);
    expect(out.map((m) => m.kind)).toEqual(['paid', 'swap']);
    expect(out[1].text).toContain('White Choc');
    expect(out[1].text).toContain(`https://s.example/status#t=${TOKEN}`);
    // Mutation: asking the swap question on a Ready order sends the customer a swap for an order already packed.
    expect(
      messagesFor(
        order({
          state: 'Ready',
          items: flagged.items.map((i) => ({
            product_id: i.productId,
            qty: i.qty,
            unit_price_cents: i.unitCents,
            unavailable: true
          }))
        }),
        'https://s.example',
        name
      ).map((m) => m.kind)
    ).toEqual(['ready']);
  });

  it('greets by first name and leaves the link out when the order has no token', () => {
    const [m] = messagesFor(order({ status_token: null }), 'https://s.example', name);
    expect(m.text).toContain('Hi Ana!');
    expect(m.text).not.toContain('status#t=');
  });
});
