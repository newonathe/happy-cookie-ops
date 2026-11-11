import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { freezeKitchenTransfer, sendKitchenTransfer } from '@/lib/bazaar/kitchen-transfer';

const body = {
  id: 'a0790000-0000-4000-8000-000000000001',
  day_id: 'a0790000-0000-4000-8000-000000000002',
  product_id: 'cookie',
  source_drop: 5,
  qty: 4,
  at: 1794045600000
};
const receipt = {
  ...body,
  duplicate: false,
  kitchen_remaining: 2,
  day_total: 4,
  source_records: ['a0790000-0000-4000-8000-000000000003']
};
const clientOf = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as BazaarClient;

describe('kitchen transfer protocol', () => {
  it('freezes a separate exact request before the form changes', () => {
    const form = { ...body };
    const frozen = freezeKitchenTransfer(form);
    form.qty = 9;
    expect(frozen).toEqual(body);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('retains a lost committed acknowledgement for one exact retry, with no legacy call', async () => {
    let writes = 0;
    const seen = new Map<string, string>();
    const rpc = vi.fn(async (name: string, args: { p_transfer: typeof body }) => {
      expect(name).toBe('transfer_bazaar_stock');
      const serialized = JSON.stringify(args.p_transfer);
      const prior = seen.get(args.p_transfer.id);
      if (prior) {
        expect(serialized).toBe(prior);
        return { data: { ...receipt, duplicate: true }, error: null };
      }
      seen.set(args.p_transfer.id, serialized);
      writes++;
      throw new Error('committed, acknowledgement lost');
    });
    const client = clientOf(rpc);
    expect(await sendKitchenTransfer(client, body)).toEqual({ outcome: 'unknown' });
    const retry = await sendKitchenTransfer(client, body);
    expect(retry).toEqual({ outcome: 'saved', receipt: { ...receipt, duplicate: true } });
    expect(writes).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => args.p_transfer)).toEqual([body, body]);
    if (retry.outcome === 'saved') expect(Object.isFrozen(retry.receipt.source_records)).toBe(true);
  });

  it.each([
    ['ZB001', 'shortage'],
    ['ZB002', 'source'],
    ['ZB003', 'chronology'],
    ['23505', 'conflict'],
    ['55000', 'closed'],
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['P0002', 'invalid'],
    ['42883', 'unavailable'],
    ['PGRST202', 'unavailable']
  ])('treats %s as a definite refusal', async (code, reason) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
    expect(await sendKitchenTransfer(clientOf(rpc), body)).toEqual({ outcome: 'refused', reason });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    { ...receipt, id: 'a0790000-0000-4000-8000-000000000004' },
    { ...receipt, day_id: 'a0790000-0000-4000-8000-000000000004' },
    { ...receipt, product_id: 'other' },
    { ...receipt, source_drop: 6 },
    { ...receipt, qty: 3 },
    { ...receipt, at: body.at + 1 },
    { ...receipt, kitchen_remaining: -1 },
    { ...receipt, day_total: 3 },
    { ...receipt, duplicate: 'true' },
    { ...receipt, source_records: ['not-a-record-id'] }
  ])('never confirms malformed or mismatched acknowledgements %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await sendKitchenTransfer(clientOf(rpc), body)).toEqual({ outcome: 'unknown' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['XX000', 'toString', '__proto__', 'constructor'])(
    'keeps unknown database code %s uncertain',
    async (code) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
      expect(await sendKitchenTransfer(clientOf(rpc), body)).toEqual({ outcome: 'unknown' });
    }
  );

  it('refuses invalid local quantities before sending', async () => {
    const rpc = vi.fn();
    expect(await sendKitchenTransfer(clientOf(rpc), { ...body, qty: 1.5 })).toEqual({
      outcome: 'refused',
      reason: 'invalid'
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
