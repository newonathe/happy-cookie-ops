import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { readKitchenAvailability } from '@/lib/bazaar/kitchen-availability';

function fixture(baked: unknown = [{ product_id: 'cookie', qty: 6 }]) {
  const rpc = vi.fn(async () => ({
    data: { batches: [], dough: [], baked, shortfalls: [] },
    error: null
  }));
  return { rpc, client: { rpc } as unknown as BazaarClient };
}
describe('recorded kitchen availability', () => {
  it('reads the exact recorded period and preserves a complete empty pool', async () => {
    const f = fixture();
    const result = await readKitchenAvailability(f.client, 3, () => true);
    expect(f.rpc).toHaveBeenCalledWith('get_production', { p_drop: 3 });
    expect(result.outcome === 'read' && result.balances.get('cookie')).toBe(6);
    const empty = await readKitchenAvailability(fixture([]).client, 3, () => true);
    expect(empty.outcome === 'read' && empty.balances.size).toBe(0);
  });
  it.each([
    null,
    [{ product_id: 'cookie', qty: -1 }],
    [{ product_id: 'cookie', qty: 1.5 }],
    [
      { product_id: 'cookie', qty: 6 },
      { product_id: 'cookie', qty: 2 }
    ],
    [{ product_id: '', qty: 6 }],
    [{ product_id: 'cookie', qty: Number.MAX_SAFE_INTEGER + 1 }]
  ])('keeps malformed quantities unavailable: %j', async (value) => {
    expect(await readKitchenAvailability(fixture(value).client, 3, () => true)).toEqual({
      outcome: 'failed'
    });
  });
  it('refuses retired authority before and after the read and catches transport failures', async () => {
    const f = fixture();
    expect(await readKitchenAvailability(f.client, 3, () => false)).toEqual({
      outcome: 'failed'
    });
    expect(await readKitchenAvailability(f.client, -1, () => true)).toEqual({ outcome: 'failed' });
    expect(f.rpc).not.toHaveBeenCalled();
    let active = true;
    f.rpc.mockImplementationOnce(async () => {
      active = false;
      return {
        data: { batches: [], dough: [], baked: [], shortfalls: [] },
        error: null
      };
    });
    expect(await readKitchenAvailability(f.client, 3, () => active)).toEqual({
      outcome: 'failed'
    });
    f.rpc.mockRejectedValueOnce(Error('offline'));
    expect(await readKitchenAvailability(f.client, 3, () => true)).toEqual({
      outcome: 'failed'
    });
  });
});
