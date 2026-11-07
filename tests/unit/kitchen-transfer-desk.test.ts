import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { KitchenTransferDesk } from '@/lib/bazaar/kitchen-transfer-desk';
import type { KitchenTransferRequest } from '@/lib/bazaar/kitchen-transfer';
import example from '../fixtures/bazaar-example.json';

function fixture() {
  const wire = structuredClone(example);
  wire.final_hash = null;
  for (const d of wire.summary.days) {
    d.state = 'planned';
    for (const l of d.lines) l.made = 0;
  }
  const day = wire.summary.days[0],
    product = day.lines[0].product_id;
  let active = true,
    count = 0,
    failSources = false,
    unknown = false;
  let sources = [{ product_id: product, source_drop: 3 }];
  const values = new Map<string, string>();
  const rpc = vi.fn(async (name: string, args?: { p_transfer: KitchenTransferRequest }) => {
    if (name === 'get_bazaar') return { data: structuredClone(wire), error: null };
    if (name === 'get_bazaar_kitchen_sources')
      return { data: sources, error: failSources ? { code: 'offline' } : null };
    return {
      data: unknown
        ? null
        : {
            ...args!.p_transfer,
            duplicate: false,
            kitchen_remaining: 2,
            day_total: 4,
            source_records: []
          },
      error: null
    };
  });
  const changed = vi.fn(),
    close = vi.fn(),
    updated = vi.fn(async () => true),
    refreshProduction = vi.fn(async () => true);
  const desk = new KitchenTransferDesk({
    scope: { userId: day.id, business: 'https://synthetic.example' },
    client: { rpc } as unknown as BazaarClient,
    bookingId: wire.summary.booking.id,
    dayId: day.id,
    defaultDrop: 9,
    current: () => active,
    online: () => true,
    now: () => 1794045600000,
    newId: () => `a0820000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
    storage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      }
    },
    lock: async () => vi.fn(() => {}),
    changed,
    close,
    updated,
    refreshProduction
  });
  return {
    desk,
    wire,
    day,
    product,
    rpc,
    changed,
    close,
    updated,
    refreshProduction,
    retire: () => {
      active = false;
    },
    sources: (v: typeof sources) => {
      sources = v;
    },
    fail: () => {
      failSources = true;
    },
    unknown: () => {
      unknown = true;
    }
  };
}
async function ready() {
  const f = fixture();
  await f.desk.open();
  return f;
}
async function reload(f: ReturnType<typeof fixture>) {
  f.desk.vals()!.retry();
  await vi.waitFor(() => expect(f.desk.vals()!.loading).toBe(false));
}
function add(f: ReturnType<typeof fixture>) {
  f.desk.vals()!.add(f.product);
  const row = f.desk.vals()!.rows[0];
  row.edit('4');
  return f.desk.vals()!.rows[0];
}

describe('selected-day kitchen transfers', () => {
  it('reads day before provenance, uses the recorded source, and never writes on opening', async () => {
    const f = await ready();
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_bazaar',
      'get_bazaar_kitchen_sources'
    ]);
    expect(f.desk.vals()!.products[0].source).toBe('From Drop 3');
    await add(f).submit();
    const call = f.rpc.mock.calls.find(([n]) => n === 'transfer_bazaar_stock')!;
    expect(call[1]!.p_transfer).toMatchObject({
      day_id: f.day.id,
      product_id: f.product,
      source_drop: 3,
      qty: 4
    });
    expect(f.updated).toHaveBeenCalledTimes(1);
    expect(f.refreshProduction).toHaveBeenCalledTimes(1);
    expect(f.desk.vals()!.rows[0].confirmed).toBe(true);
    f.updated.mockResolvedValue(false);
    await f.desk.vals()!.rows[0].submit();
    expect(f.desk.vals()!.rows[0].message).toContain('still need checking');
    expect(f.rpc.mock.calls.filter(([name]) => name === 'transfer_bazaar_stock')).toHaveLength(1);
    f.desk.close();
  });
  it('does not turn failed provenance into a legacy source or send a retained new draft', async () => {
    const f = await ready(),
      row = add(f);
    f.fail();
    await reload(f);
    expect(f.desk.vals()!.failed).toBe(true);
    expect(f.desk.vals()!.products).toEqual([]);
    expect(f.desk.vals()!.rows[0].canSubmit).toBe(false);
    await row.submit();
    expect(f.rpc.mock.calls.some(([n]) => n === 'transfer_bazaar_stock')).toBe(false);
    expect(f.desk.vals()!.rows[0].qty).toBe('4');
    f.desk.close();
  });
  it('rechecks changed source before a saved callback can create a new request', async () => {
    const f = await ready(),
      row = add(f);
    f.sources([{ product_id: f.product, source_drop: 8 }]);
    await reload(f);
    await row.submit();
    expect(f.rpc.mock.calls.some(([n]) => n === 'transfer_bazaar_stock')).toBe(false);
    f.desk.close();
  });
  it('keeps exact pending retries available when destination reads fail or the day closes', async () => {
    const f = await ready();
    f.unknown();
    await add(f).submit();
    const before = f.rpc.mock.calls.find(([n]) => n === 'transfer_bazaar_stock')![1]!.p_transfer;
    f.day.state = 'closed';
    f.fail();
    await reload(f);
    const row = f.desk.vals()!.rows[0];
    expect(row.pending).toBe(true);
    expect(row.discard).toBeNull();
    await row.submit();
    expect(
      f.rpc.mock.calls.filter(([n]) => n === 'transfer_bazaar_stock').map(([, a]) => a!.p_transfer)
    ).toEqual([before, before]);
    f.desk.close();
  });
  it('retires old close/read/write callbacks when authority changes', async () => {
    const f = await ready(),
      view = f.desk.vals()!,
      row = add(f),
      changed = f.changed.mock.calls.length;
    f.retire();
    view.close();
    view.retry();
    await row.submit();
    expect(f.close).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenCalledTimes(changed);
    expect(f.desk.vals()).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(2);
    f.desk.close();
  });
});
