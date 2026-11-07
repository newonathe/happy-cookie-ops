import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { readKitchenSources } from '@/lib/bazaar/kitchen-sources';
const booking = 'a0830000-0000-4000-8000-000000000001';
const row = { product_id: 'cookie', source_drop: 5 };
const clientOf = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as BazaarClient;
describe('kitchen source reads', () => {
  it.each([{ sources: [] }, { sources: [row] }])(
    'accepts only a real source list %#',
    async ({ sources }) => {
      const rpc = vi.fn().mockResolvedValue({ data: sources, error: null });
      expect(await readKitchenSources(clientOf(rpc), booking)).toEqual({
        outcome: 'read',
        sources
      });
      expect(rpc).toHaveBeenCalledWith('get_bazaar_kitchen_sources', { p_booking: booking });
    }
  );
  it.each(
    [
      null,
      {},
      [row, row],
      [{ ...row, source_drop: -1 }],
      [{ ...row, source_drop: 1.5 }],
      [{ ...row, source_drop: 100001 }],
      [{ ...row, product_id: '' }],
      [{ ...row, extra: 1 }]
    ].map((data) => ({ data }))
  )('keeps malformed result %# unavailable', async ({ data }) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await readKitchenSources(clientOf(rpc), booking)).toEqual({ outcome: 'failed' });
  });
  it('keeps unsupported, refused and lost reads unavailable', async () => {
    for (const code of ['PGRST202', '42501', 'P0002']) {
      const rpc = vi.fn().mockResolvedValue({ data: [], error: { code } });
      expect(await readKitchenSources(clientOf(rpc), booking)).toEqual({ outcome: 'failed' });
    }
    const rpc = vi.fn().mockRejectedValue(Error('offline'));
    expect(await readKitchenSources(clientOf(rpc), booking)).toEqual({ outcome: 'failed' });
  });
  it('does not send an invalid booking', async () => {
    const rpc = vi.fn();
    expect(await readKitchenSources(clientOf(rpc), 'bad')).toEqual({ outcome: 'failed' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
