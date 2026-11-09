import { describe, expect, it, vi } from 'vitest';
import { OrderFlow } from '@/lib/data/order-flow';
import { OrderRecovery } from '@/lib/orders/order-recovery';
import type { OrderClient, OrderFields } from '@/lib/data/orders';

const id = '123e4567-e89b-42d3-a456-426614174000';
const backend = 'https://shop.example';
const fields: OrderFields = {
  name: 'A Customer',
  ig: '@customer',
  mobile: '09123456789',
  method: 'Cash',
  pickupDate: '2026-11-12',
  pickupWindow: '12:00',
  ref: '',
  items: { cookie: 2 }
};
const rules = {
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  unpaid_hold_hours: 24
};
const ack = {
  order_no: 'HC-1234',
  status_token: 'a'.repeat(64),
  total_cents: 2500,
  pickup_date: fields.pickupDate,
  pickup_window: fields.pickupWindow,
  replayed: false
};
type Reply = { data: unknown; error: unknown };
function setup(reply: (body: unknown) => Promise<Reply> | Reply, current = () => true) {
  const values = new Map<string, string>();
  let denied = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (denied) throw Error('Quota');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
  const recovery = new OrderRecovery(backend, () => storage);
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) =>
    name === 'place_order'
      ? reply(args.p_order)
      : { data: name === 'get_shop_order_rules' ? rules : null, error: null }
  );
  const client = { rpc } as unknown as OrderClient;
  const flow = new OrderFlow(client, { changed: vi.fn(), mintId: () => id, current }, recovery);
  return {
    flow,
    recovery,
    rpc,
    storage,
    values,
    deny: (value: boolean) => {
      denied = value;
    }
  };
}
const writes = (rpc: ReturnType<typeof setup>['rpc']) =>
  rpc.mock.calls.filter(([name]) => name === 'place_order');

describe('OrderFlow durable request protocol', () => {
  it('does not send before recovery has been checked', async () => {
    const s = setup(() => ({ data: [ack], error: null }));
    await s.flow.loadRules();
    await s.flow.submit(fields);
    expect(writes(s.rpc)).toEqual([]);
  });
  it('blocks a new request without replacing an unreadable saved copy', async () => {
    const s = setup(() => ({ data: [ack], error: null }));
    const key = 'hc-order-recovery-v1:https%3A%2F%2Fshop.example';
    s.storage.setItem(key, '{broken');
    expect(s.flow.restoreRecovery()).toBeNull();
    await s.flow.loadRules();
    await s.flow.submit(fields);
    expect(writes(s.rpc)).toEqual([]);
    expect(s.storage.getItem(key)).toBe('{broken');
  });
  it('does not send when the frozen request cannot be retained', async () => {
    const s = setup(() => ({ data: [ack], error: null }));
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    s.deny(true);
    await s.flow.submit(fields);
    expect(writes(s.rpc)).toEqual([]);
    expect(s.flow.attempt?.body.name).toBe(fields.name);
    expect(s.flow.recoveryState).toBe('unavailable');
  });
  it('keeps the exact request before send and restores it without an automatic retry', async () => {
    let requests = 0;
    const s = setup((body) => {
      expect(s.recovery.read().value?.attempt.body).toEqual(body);
      return ++requests === 1
        ? { data: null, error: { message: 'Lost reply' } }
        : { data: [{ ...ack, replayed: true }], error: null };
    });
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    await s.flow.submit(fields);
    const original = writes(s.rpc)[0]?.[1]?.p_order;
    const reloaded = new OrderFlow(
      { rpc: s.rpc } as unknown as OrderClient,
      { changed: vi.fn(), mintId: () => '223e4567-e89b-42d3-a456-426614174000' },
      s.recovery
    );
    expect(reloaded.restoreRecovery()).toEqual(original);
    expect(writes(s.rpc)).toHaveLength(1);
    await reloaded.submit({ ...fields, name: 'Changed after reload', items: { cookie: 99 } });
    expect(writes(s.rpc)[1]?.[1]?.p_order).toEqual(original);
    expect(reloaded.placed?.orderNo).toBe(ack.order_no);
    expect(s.recovery.read().value?.placed?.orderNo).toBe(ack.order_no);
  });
  it('keeps a frozen box choice when newer options remove that size', async () => {
    const s = setup(() => ({ data: null, error: { message: 'Lost reply' } }));
    let boxes = [{ size: 6, charge_cents: 0 }];
    const normal = s.rpc.getMockImplementation()!;
    s.rpc.mockImplementation(async (name, args = {}) =>
      name === 'get_shop_extras'
        ? {
            data: {
              same_day: { enabled: false, percent: 40, on_extras: false },
              sampler: { product_id: null, max_qty: 3 },
              boxes,
              add_ons: []
            },
            error: null
          }
        : normal(name, args)
    );
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    await s.flow.loadExtras();
    s.flow.setBox(6, 1);
    await s.flow.submit({ ...fields, items: { cookie: 6 } });
    boxes = [];
    await s.flow.loadExtras();
    expect(s.flow.selection().boxes).toEqual([{ size: 6, qty: 1 }]);
    expect(s.recovery.read().value?.attempt.body.boxes).toEqual([{ size: 6, qty: 1 }]);
  });
  it('keeps a received acknowledgement when saving its receipt fails, then retries storage without sending', async () => {
    const s = setup(() => {
      s.deny(true);
      return { data: [ack], error: null };
    });
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    await s.flow.submit(fields);
    expect(s.flow.placed?.orderNo).toBe(ack.order_no);
    expect(s.flow.recoveryState).toBe('unavailable');
    s.flow.restoreRecovery();
    expect(s.flow.placed?.orderNo).toBe(ack.order_no);
    s.deny(false);
    s.flow.retryRecovery();
    expect(s.recovery.read().value?.placed?.orderNo).toBe(ack.order_no);
    expect(writes(s.rpc)).toHaveLength(1);
  });
  it('does not clear another pending request after a definite refusal', async () => {
    let release!: (reply: Reply) => void;
    const s = setup(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    const pending = s.flow.submit(fields),
      original = s.flow.attempt!;
    expect(s.flow.changeOrder()).toBe(false);
    expect(s.flow.resetCheckout()).toBe(false);
    expect(s.flow.sending).toBe(true);
    const otherId = '223e4567-e89b-42d3-a456-426614174000';
    const other = {
      id: otherId,
      body: { ...original.body, client_id: otherId, name: 'Other request' }
    };
    expect(s.recovery.clear(original)).toBe(true);
    expect(s.recovery.write({ attempt: other })).toBe(true);
    release({ data: null, error: { code: 'ZC003', message: 'Closed' } });
    await pending;
    expect(s.recovery.read().value?.attempt).toEqual(other);
    expect(s.flow.attempt).toBeNull();
    expect(s.flow.recoveryState).toBe('unavailable');
  });
  it('refuses a retired caller but retains an acknowledgement already in flight', async () => {
    let active = true,
      release!: (reply: Reply) => void;
    const s = setup(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      () => active
    );
    s.flow.restoreRecovery();
    await s.flow.loadRules();
    active = false;
    await s.flow.submit(fields);
    expect(writes(s.rpc)).toEqual([]);
    active = true;
    const pending = s.flow.submit(fields);
    active = false;
    release({ data: [ack], error: null });
    await pending;
    expect(s.recovery.read().value?.placed?.orderNo).toBe(ack.order_no);
    expect(writes(s.rpc)).toHaveLength(1);
    expect(s.flow.resetCheckout()).toBe(false);
    active = true;
    expect(s.flow.resetCheckout()).toBe(true);
    expect(s.recovery.read().phase).toBe('empty');
  });
});
