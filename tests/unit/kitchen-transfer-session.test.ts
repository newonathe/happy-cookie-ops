import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { KitchenTransferSession } from '@/lib/bazaar/kitchen-transfer-session';
import {
  readKitchenTransferRecovery,
  writeKitchenTransferRecovery,
  type KitchenTransferRecovery
} from '@/lib/bazaar/kitchen-transfer-recovery';

const scope = {
  userId: 'a0820000-0000-4000-8000-000000000001',
  business: 'https://synthetic.example'
};
const target = {
  day_id: 'a0821000-0000-4000-8000-000000000001',
  product_id: 'cookie',
  source_drop: 5
};
function fixture() {
  const values = new Map<string, string>();
  let current = true,
    available = true,
    counter = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!available) throw Error('quota');
      values.set(key, value);
    }
  };
  const rpc = vi.fn(),
    release = vi.fn();
  const ports = {
    scope,
    client: { rpc } as unknown as BazaarClient,
    storage,
    current: () => current,
    online: () => true,
    changed: vi.fn(),
    now: () => 1794045600000,
    newId: () => 'a0822000-0000-4000-8000-' + String(++counter).padStart(12, '0'),
    refresh: vi.fn(async () => false),
    lock: async () => release
  };
  return {
    values,
    storage,
    rpc,
    release,
    ports,
    session: () => new KitchenTransferSession(ports),
    authority: (ok: boolean) => {
      current = ok;
    },
    quota: (ok: boolean) => {
      available = ok;
    }
  };
}

describe('kitchen transfer workspace', () => {
  it('retains independent source-period drafts without submitting on reopen', async () => {
    const f = fixture(),
      session = f.session();
    await session.open();
    const a = session.add(target),
      b = session.add({ ...target, source_drop: 6 });
    if (!a || !b) throw Error('drafts missing');
    expect(session.edit(a, 'not a number')).toBe(true);
    expect(session.edit(b, '3')).toBe(true);
    session.close();
    const restored = f.session();
    await restored.open();
    expect(restored.snapshot().map((row) => [row.source_drop, row.qty_text])).toEqual([
      [5, 'not a number'],
      [6, '3']
    ]);
    expect(f.rpc).not.toHaveBeenCalled();
    restored.close();
  });

  it('locks unanswered work while allowing explicit dismissal of a retained confirmation', async () => {
    const f = fixture();
    const body = {
      ...target,
      id: 'a0823000-0000-4000-8000-000000000001',
      qty: 4,
      at: 1794045600000
    };
    const value: KitchenTransferRecovery = {
      version: 1,
      scope,
      works: [
        {
          ...target,
          work_id: 'a0824000-0000-4000-8000-000000000001',
          qty_text: '4',
          submitted: body
        }
      ]
    };
    expect(writeKitchenTransferRecovery(scope, value, [], f.storage)).toBe(true);
    const pending = f.session();
    await pending.open();
    const id = value.works[0].work_id;
    expect(pending.edit(id, '9')).toBe(false);
    expect(pending.discard(id)).toBe(false);
    pending.close();
    value.works[0].receipt = {
      ...body,
      duplicate: false,
      kitchen_remaining: 2,
      day_total: 4,
      source_records: []
    };
    expect(writeKitchenTransferRecovery(scope, value, [], f.storage)).toBe(true);
    const known = f.session();
    await known.open();
    expect(known.edit(id, '9')).toBe(false);
    expect(known.discard(id)).toBe(true);
    expect(readKitchenTransferRecovery(scope, f.storage).value?.works).toEqual([]);
    expect(f.rpc).not.toHaveBeenCalled();
    known.close();
  });

  it('retains in-memory edits when storage fails and retries persistence before new work', async () => {
    const f = fixture(),
      session = f.session();
    await session.open();
    const id = session.add(target);
    if (!id) throw Error('draft missing');
    f.quota(false);
    expect(session.edit(id, '7')).toBe(true);
    expect(session.phase).toBe('unavailable');
    expect(session.snapshot()[0].qty_text).toBe('7');
    expect(session.add(target)).toBeNull();
    f.quota(true);
    await session.open();
    expect(session.phase).toBe('ready');
    expect(readKitchenTransferRecovery(scope, f.storage).value?.works[0].qty_text).toBe('7');
    f.authority(false);
    expect(session.edit(id, '9')).toBe(false);
    expect(session.snapshot()).toEqual([]);
    session.close();
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid', 'unavailable', 'locked'] as const)(
    'keeps %s recovery read-only without overwriting it',
    async (mode) => {
      const f = fixture(),
        initial = f.session();
      await initial.open();
      initial.add(target);
      initial.close();
      const key = [...f.values.keys()][0];
      f.values.set(key, 'unreadable');
      const session = new KitchenTransferSession({
        ...f.ports,
        storage:
          mode === 'unavailable'
            ? {
                getItem: () => {
                  throw Error('blocked');
                },
                setItem: vi.fn()
              }
            : f.storage,
        lock: mode === 'locked' ? async () => null : f.ports.lock
      });
      await session.open();
      expect(session.phase).toBe(mode);
      expect(session.add(target)).toBeNull();
      expect(f.values.get(key)).toBe('unreadable');
      expect(f.rpc).not.toHaveBeenCalled();
      session.close();
    }
  );

  it('releases a lock that arrives after the workspace closes', async () => {
    const f = fixture(),
      release = vi.fn();
    let resolve: (value: (() => void) | null) => void = () => {};
    const lock = new Promise<(() => void) | null>((yes) => {
      resolve = yes;
    });
    const session = new KitchenTransferSession({ ...f.ports, lock: () => lock });
    const opening = session.open();
    session.close();
    resolve(release);
    await opening;
    expect(release).toHaveBeenCalledTimes(1);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
