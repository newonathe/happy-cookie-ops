import { expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { flushQueue } from '@/lib/offline/sync';
vi.mock('@/lib/offline/queue', () => ({ pendingSales: vi.fn(async () => []) }));
vi.mock('@/lib/offline/sync', () => ({
  flushQueue: vi.fn(async () => ({ sent: [], failed: [], skipped: true })),
  requestBackgroundSync: vi.fn(async () => undefined)
}));

it('OFFLINE-ACK-01 MP-20: empty/skipped acknowledgment cannot mark an unsent sale synced', async () => {
  const engine = new OpsRuntime({});
  engine.state = { ...engine.state, online: true, unsynced: 1, sales: [{
    id: 'S1', items: { dcf: 1 }, total: 100, gross: 100, discount: 0,
    pay: 'Cash', ref: '', clerk: 'synthetic', at: 123, tendered: 100, change: 0,
    synced: false, failed: false, ledgerId: null
  }] };
  vi.spyOn(engine, 'setState').mockImplementation((update) => {
    Object.assign(engine.state, typeof update === 'function' ? update(engine.state, engine.props) : update);
  });
  vi.spyOn(engine, 'toast').mockImplementation(() => undefined);
  engine.syncNow();
  await vi.waitFor(() => expect(flushQueue).toHaveBeenCalled());
  expect(engine.state.sales).toHaveLength(1);
  expect(engine.state.sales[0].synced).toBe(false);
  expect(engine.state.unsynced).toBe(1);
});
