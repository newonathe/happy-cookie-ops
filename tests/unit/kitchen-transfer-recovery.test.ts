import { describe, expect, it, vi } from 'vitest';
import {
  readKitchenTransferRecovery as read,
  writeKitchenTransferRecovery as write,
  type KitchenTransferRecovery
} from '@/lib/bazaar/kitchen-transfer-recovery';

const scope = {
  userId: 'a0800000-0000-4000-8000-000000000001',
  business: 'https://synthetic.example'
};
const body = {
  id: 'a0801000-0000-4000-8000-000000000001',
  day_id: 'a0802000-0000-4000-8000-000000000001',
  product_id: 'cookie',
  source_drop: 5,
  qty: 4,
  at: 1794045600000
};
const value = (): KitchenTransferRecovery => ({
  version: 1,
  scope,
  works: [
    {
      work_id: 'a0803000-0000-4000-8000-000000000001',
      day_id: body.day_id,
      product_id: body.product_id,
      source_drop: body.source_drop,
      qty_text: '4',
      submitted: { ...body }
    }
  ]
});
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, data: string) => {
      values.set(key, data);
    }
  };
}

describe('scoped kitchen transfer recovery', () => {
  it('restores independent old-period requests and invalid raw drafts without mixing identities', () => {
    const disk = storage(),
      record = value();
    record.works.push({
      ...record.works[0],
      work_id: 'a0803000-0000-4000-8000-000000000002',
      source_drop: 6,
      qty_text: 'not a count',
      submitted: null
    });
    expect(write(scope, record, [], disk)).toBe(true);
    expect(read(scope, disk)).toEqual({ status: 'stored', value: record });
    expect(Object.isFrozen(read(scope, disk).value?.works[0].submitted)).toBe(true);
    expect(read({ ...scope, userId: 'a0800000-0000-4000-8000-000000000002' }, disk).status).toBe(
      'empty'
    );
    expect(read({ ...scope, business: 'https://other.example' }, disk).status).toBe('empty');
  });

  it('preserves unanswered requests until an explicit acknowledgement/refusal resolution', () => {
    const disk = storage(),
      record = value();
    expect(write(scope, record, [], disk)).toBe(true);
    const removed = { ...record, works: [] };
    expect(write(scope, removed, [], disk)).toBe(false);
    const changed = value();
    changed.works[0].qty_text = '3';
    changed.works[0].submitted = { ...body, qty: 3 };
    expect(write(scope, changed, [], disk)).toBe(false);
    expect(read(scope, disk).value).toEqual(record);
    expect(write(scope, removed, [body.id], disk)).toBe(true);
    expect(read(scope, disk).value?.works).toEqual([]);
  });

  it.each(['not JSON', '{"version":2}', '{"version":1,"works":[]}'])(
    'retains unreadable saved bytes: %s',
    (raw) => {
      const disk = storage();
      expect(write(scope, value(), [], disk)).toBe(true);
      const key = [...disk.values.keys()][0];
      disk.values.set(key, raw);
      expect(read(scope, disk)).toEqual({ status: 'invalid', value: null });
      expect(write(scope, value(), [], disk)).toBe(false);
      expect(disk.values.get(key)).toBe(raw);
    }
  );

  it('rejects duplicate work, changed source context and forged stored scope', () => {
    const disk = storage(),
      duplicate = value();
    duplicate.works.push({ ...duplicate.works[0] });
    expect(write(scope, duplicate, [], disk)).toBe(false);
    const changed = value();
    changed.works[0].source_drop = 6;
    expect(write(scope, changed, [], disk)).toBe(false);
    expect(
      write(scope, { ...value(), scope: { ...scope, business: 'https://other.example' } }, [], disk)
    ).toBe(false);
    expect(disk.values.size).toBe(0);
  });

  it('distinguishes read/write failure from a genuine empty record', () => {
    const denied = {
      getItem: vi.fn(() => {
        throw Error('blocked');
      }),
      setItem: vi.fn()
    };
    expect(read(scope, denied)).toEqual({ status: 'unavailable', value: null });
    expect(write(scope, value(), [], denied)).toBe(false);
    expect(denied.setItem).not.toHaveBeenCalled();
    const full = {
      getItem: () => null,
      setItem: () => {
        throw Error('quota');
      }
    };
    expect(write(scope, value(), [], full)).toBe(false);
    expect(read(scope, null).status).toBe('unavailable');
  });

  it('requires matching readback after a storage write', () => {
    const silent = { getItem: () => null, setItem: vi.fn() };
    expect(write(scope, value(), [], silent)).toBe(false);
    expect(silent.setItem).toHaveBeenCalledTimes(1);
  });

  it('retains a matching acknowledgement without treating its balances as a new read', () => {
    const disk = storage(),
      record = value();
    const receipt = {
      ...body,
      duplicate: false,
      kitchen_remaining: 2,
      day_total: 4,
      source_records: ['a0804000-0000-4000-8000-000000000001']
    };
    record.works[0].receipt = receipt;
    expect(write(scope, record, [], disk)).toBe(true);
    const restored = read(scope, disk).value;
    expect(restored?.works[0].receipt).toEqual(receipt);
    expect(Object.isFrozen(restored?.works[0].receipt?.source_records)).toBe(true);
    expect(write(scope, value(), [], disk)).toBe(false);
    record.works[0].receipt = { ...receipt, duplicate: true };
    expect(write(scope, record, [], disk)).toBe(true);
    record.works[0].receipt = receipt;
    expect(write(scope, record, [], disk)).toBe(true);
    expect(read(scope, disk).value?.works[0].receipt).toEqual(receipt);
  });

  it('refuses an acknowledgement for a different request before saving it', () => {
    const disk = storage(),
      record = value();
    record.works[0].receipt = {
      ...body,
      source_drop: 6,
      duplicate: false,
      kitchen_remaining: 2,
      day_total: 4,
      source_records: []
    };
    expect(write(scope, record, [], disk)).toBe(false);
    expect(disk.values.size).toBe(0);
  });
});
