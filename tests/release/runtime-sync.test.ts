import { expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { flushQueue } from '@/lib/offline/sync';
vi.mock('@/lib/offline/queue', () => ({
  pendingSales: vi.fn(async () => []),
  allSales: vi.fn(async () => []),
  isSaleKey: () => true
}));
vi.mock('@/lib/offline/sync', () => ({
  flushQueue: vi.fn(async () => ({ sent: [], failed: [], skipped: true })),
  requestBackgroundSync: vi.fn(async () => undefined)
}));

type Sale = OpsRuntime['state']['sales'][number];
const unsent = (): Sale => ({
  id: 'S1',
  items: { dcf: 1 },
  total: 100,
  gross: 100,
  discount: 0,
  pay: 'Cash',
  ref: '',
  clerk: 'synthetic',
  at: 123,
  tendered: 100,
  change: 0,
  synced: false,
  failed: false,
  ledgerId: null
});

function harness(): OpsRuntime {
  const engine = new OpsRuntime({});
  engine.state = { ...engine.state, online: true, unsynced: 1, sales: [unsent()] };
  vi.spyOn(engine, 'setState').mockImplementation((update) => {
    Object.assign(
      engine.state,
      typeof update === 'function' ? update(engine.state, engine.props) : update
    );
  });
  return engine;
}

it('a sync that finishes after unmount still records its result, without a toast', async () => {
  let release!: (value: Awaited<ReturnType<typeof flushQueue>>) => void;
  vi.mocked(flushQueue).mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  const engine = harness();
  engine.syncNow();
  await vi.waitFor(() => expect(flushQueue).toHaveBeenCalled());
  engine.componentWillUnmount();
  release({ sent: ['device:S1:123'], failed: [], skipped: false });
  await vi.waitFor(() => expect(engine.state.syncState).toBe('synced'));
  expect(engine.state.sales[0].synced).toBe(true);
  expect(engine.state.unsynced).toBe(0);
  expect(engine.state.toast).toBeNull();
});

it('no toast, and no toast timer, starts after unmount', () => {
  vi.useFakeTimers();
  try {
    const engine = harness();
    engine.componentWillUnmount();
    engine.toast('late', 'warn');
    expect(engine.state.toast).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('OFFLINE-ACK-01 MP-20: empty/skipped acknowledgment cannot mark an unsent sale synced', async () => {
  const engine = new OpsRuntime({});
  engine.state = {
    ...engine.state,
    online: true,
    unsynced: 1,
    sales: [
      {
        id: 'S1',
        items: { dcf: 1 },
        total: 100,
        gross: 100,
        discount: 0,
        pay: 'Cash',
        ref: '',
        clerk: 'synthetic',
        at: 123,
        tendered: 100,
        change: 0,
        synced: false,
        failed: false,
        ledgerId: null
      }
    ]
  };
  vi.spyOn(engine, 'setState').mockImplementation((update) => {
    Object.assign(
      engine.state,
      typeof update === 'function' ? update(engine.state, engine.props) : update
    );
  });
  vi.spyOn(engine, 'toast').mockImplementation(() => undefined);
  engine.syncNow();
  await vi.waitFor(() => expect(flushQueue).toHaveBeenCalled());
  expect(engine.state.sales).toHaveLength(1);
  expect(engine.state.sales[0].synced).toBe(false);
  expect(engine.state.unsynced).toBe(1);
});
