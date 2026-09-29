import { describe, expect, it, vi } from 'vitest';
import {
  fetchShopStatus,
  parseShopStatus,
  saveShopOverride,
  type ShopStatusClient
} from '@/lib/data/shop-status';
import {
  fetchOrderRules,
  orderRulesError,
  saveOrderRules,
  type OrderRulesClient,
  type OrderRulesFields
} from '@/lib/data/order-rules';

/**
 * B3: the shop's open state and the owner's order rules, as the client reads and writes them.
 * Each rule names the mutation that would break it.
 */
const status = (over: Record<string, unknown> = {}) => ({
  open_dow: 1,
  open_h: 9,
  open_m: 0,
  close_dow: 4,
  close_h: 21,
  close_m: 0,
  extend_h: 0,
  override: null,
  ...over
});

describe('parseShopStatus', () => {
  it('reads the window and an empty switch', () => {
    expect(parseShopStatus(status())).toEqual({
      window: { openDow: 1, openH: 9, openM: 0, closeDow: 4, closeH: 21, closeM: 0, extendH: 0 },
      override: null
    });
  });

  it('reads each of the four switch values', () => {
    for (const override of ['open', 'soon', 'closed', 'soldout'])
      expect(parseShopStatus(status({ override }))?.override).toBe(override);
  });

  it('refuses an unknown switch value rather than guessing open or closed', () => {
    expect(parseShopStatus(status({ override: 'shut' }))).toBeNull();
    expect(parseShopStatus(status({ override: 1 }))).toBeNull();
    // Mutation: accepting any string would let a corrupted row close or open the shop by accident.
  });

  it('refuses a window that is not whole numbers in range, so a bad read never replaces a good one', () => {
    for (const bad of [
      { open_dow: 7 },
      { open_dow: 1.5 },
      { open_h: 25 },
      { open_m: 60 },
      { close_dow: -1 },
      { extend_h: 169 },
      { close_h: '21' },
      { open_h: null }
    ])
      expect(parseShopStatus(status(bad))).toBeNull();
    expect(parseShopStatus(null)).toBeNull();
    expect(parseShopStatus([])).toBeNull();
  });
});

describe('fetchShopStatus / saveShopOverride', () => {
  const client = (result: unknown) =>
    ({ rpc: vi.fn(async () => result) }) as unknown as ShopStatusClient & {
      rpc: ReturnType<typeof vi.fn>;
    };

  it('reads through the one public RPC and throws on an error', async () => {
    const ok = client({ data: status(), error: null });
    expect((await fetchShopStatus(ok))?.override).toBeNull();
    expect(ok.rpc).toHaveBeenCalledWith('get_shop_status');
    await expect(fetchShopStatus(client({ data: null, error: { code: '57014' } }))).rejects.toThrow(
      '57014'
    );
  });

  it('sends the mode, null meaning "follow my schedule"', async () => {
    const c = client({ error: null });
    expect(await saveShopOverride(c, 'closed')).toBe('saved');
    expect(await saveShopOverride(c, null)).toBe('saved');
    expect(c.rpc.mock.calls).toEqual([
      ['set_shop_override', { p_mode: 'closed' }],
      ['set_shop_override', { p_mode: null }]
    ]);
  });

  it('a definite refusal is refused, and a lost reply is offline', async () => {
    expect(await saveShopOverride(client({ error: { code: '42501' } }), 'closed')).toBe('refused');
    expect(await saveShopOverride(client({ error: { code: '22023' } }), 'closed')).toBe('refused');
    expect(await saveShopOverride(client({ error: { code: '' } }), 'closed')).toBe('offline');
    // Mutation: calling an unknown error refused hides a switch that may have landed behind "could not save".
    expect(await saveShopOverride(client({ error: { code: '57014' } }), 'closed')).toBe('offline');
    const thrown = {
      rpc: vi.fn(async () => Promise.reject(new Error('net')))
    } as unknown as ShopStatusClient;
    expect(await saveShopOverride(thrown, 'soldout')).toBe('offline');
  });
});

const rules = (over: Partial<OrderRulesFields> = {}): OrderRulesFields => ({
  unpaid_hold_hours: 24,
  max_unpaid_per_phone: 2,
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  ...over
});

describe('orderRulesError (mirrors save_order_rules)', () => {
  it('accepts the defaults', () => {
    expect(orderRulesError(rules())).toBeNull();
  });

  it.each<[string, Partial<OrderRulesFields>]>([
    ['hold hours below 1', { unpaid_hold_hours: 0 }],
    ['hold hours above 168', { unpaid_hold_hours: 169 }],
    ['fractional hold hours', { unpaid_hold_hours: 1.5 }],
    ['unpaid per number 0', { max_unpaid_per_phone: 0 }],
    ['unpaid per number 21', { max_unpaid_per_phone: 21 }],
    ['no pickup day', { pickup_days: [] }],
    ['a pickup day of 8', { pickup_days: [1, 8] }],
    ['a pickup day of 0', { pickup_days: [0] }],
    ['earliest pickup 0', { lead_min_days: 0 }],
    ['latest pickup 61', { lead_max_days: 61 }],
    ['earliest after latest', { lead_min_days: 10, lead_max_days: 5 }],
    ['pickup start 24', { pickup_from_hour: 24 }],
    ['pickup end 0', { pickup_cutoff_hour: 0 }],
    ['pickup start not before end', { pickup_from_hour: 17, pickup_cutoff_hour: 17 }],
    ['a campus time without a colon', { campus_from: '1400' }],
    ['a campus time of 24:00', { campus_to: '24:00' }],
    ['campus start not before end', { campus_from: '15:30', campus_to: '14:00' }]
  ])('refuses %s', (_name, over) => {
    expect(orderRulesError(rules(over))).not.toBeNull();
    // Mutation: dropping any one bound sends a sure refusal to the server, or worse, lets a bad rule reach a customer.
  });

  it('accepts the edges', () => {
    expect(
      orderRulesError(
        rules({
          unpaid_hold_hours: 168,
          max_unpaid_per_phone: 20,
          pickup_days: [1, 2, 3, 4, 5, 6, 7],
          lead_min_days: 30,
          lead_max_days: 60,
          pickup_from_hour: 0,
          pickup_cutoff_hour: 24,
          campus_from: '00:00',
          campus_to: '23:59'
        })
      )
    ).toBeNull();
  });
});

describe('fetchOrderRules / saveOrderRules', () => {
  const client = (result: unknown) =>
    ({ rpc: vi.fn(async () => result) }) as unknown as OrderRulesClient & {
      rpc: ReturnType<typeof vi.fn>;
    };

  it('reads the one row', async () => {
    const row = { ...rules(), updated_at: '2026-09-29T02:00:00.123456+00:00' };
    expect(await fetchOrderRules(client({ data: [row], error: null }))).toEqual(row);
    expect(await fetchOrderRules(client({ data: [], error: null }))).toBeNull();
    await expect(fetchOrderRules(client({ data: null, error: { code: '42501' } }))).rejects.toThrow(
      '42501'
    );
  });

  it('sends exactly the nine keys and the stamp', async () => {
    const c = client({ error: null });
    expect(await saveOrderRules(c, rules(), 'STAMP')).toBe('saved');
    const [name, args] = c.rpc.mock.calls[0];
    expect(name).toBe('save_order_rules');
    expect(Object.keys(args.p_rules).sort()).toEqual([
      'campus_from',
      'campus_to',
      'lead_max_days',
      'lead_min_days',
      'max_unpaid_per_phone',
      'pickup_cutoff_hour',
      'pickup_days',
      'pickup_from_hour',
      'unpaid_hold_hours'
    ]);
    expect(args.p_expected_updated_at).toBe('STAMP');
  });

  it('classifies the answers like every other owner save', async () => {
    expect(await saveOrderRules(client({ error: { code: 'P0002' } }), rules(), 's')).toBe(
      'conflict'
    );
    expect(await saveOrderRules(client({ error: { code: '22023' } }), rules(), 's')).toBe(
      'refused'
    );
    expect(await saveOrderRules(client({ error: { code: '' } }), rules(), 's')).toBe('offline');
  });
});
