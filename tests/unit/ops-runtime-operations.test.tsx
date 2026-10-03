import { act, createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
let live = true;
let queue: Array<Record<string, unknown>> = [];
let queueReadFails = false;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    supported: () => true,
    all: async () => {
      if (queueReadFails) throw new Error('Local read failed');
      return queue;
    },
    put: async () => undefined,
    get: async () => undefined,
    delete: async () => undefined
  }
}));
import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { SystemHealthScreen } from '@/components/screens/system-health';
import { NotificationsScreen } from '@/components/screens/notifications';
import { LiveShopFooter } from '@/components/live/live-shop-footer';
import type { OperationsClient } from '@/lib/data/operations-health';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import type { StockClient } from '@/lib/data/stock-catalogue';

const wire = () => {
  const item = {
    status: 'success',
    completed_at: new Date().toISOString(),
    archive_sha256: 'a'.repeat(64)
  };
  return {
    checked_at: new Date().toISOString(),
    jobs: Object.fromEntries(
      ['backup', 'restore', 'retention', 'keepalive'].map((job) => [
        job,
        { last_run: item, last_success: item }
      ])
    )
  };
};
function App() {
  const v = useOpsVals();
  return (
    <>
      <SystemHealthScreen v={v} />
      <NotificationsScreen v={v} />
      <LiveShopFooter v={v} />
    </>
  );
}
function mount() {
  const ref = createRef<OpsRuntime>();
  render(
    <OpsRuntime ref={ref}>
      <App />
    </OpsRuntime>
  );
  return ref.current!;
}
afterEach(() => {
  cleanup();
  live = true;
  queue = [];
  queueReadFails = false;
  vi.restoreAllMocks();
});

describe('F1 live health and alerts', () => {
  it('preserves dismissed alerts across successful health refreshes until explicitly restored', async () => {
    const runtime = mount();
    const missing = { last_run: null, last_success: null };
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          checked_at: new Date().toISOString(),
          jobs: { backup: missing, restore: missing, retention: missing, keepalive: missing }
        },
        error: null
      })
    } as unknown as OperationsClient;
    await act(async () => void (await runtime.loadOperationsHealth(client)));
    act(() => runtime.renderVals().clearNotifs());
    expect(runtime.renderVals().notifications).toEqual([]);
    const dismissed = runtime.state.notifRead;
    await act(async () => void (await runtime.loadOperationsHealth(null)));
    expect(runtime.state.notifRead).toEqual(dismissed);
    expect(runtime.renderVals().notifications).toEqual([]);
    act(() => runtime.renderVals().restoreNotifs());
    expect(runtime.renderVals().notifications.length).toBeGreaterThan(0);
  });
  it('still syncs a durably saved command when its health refresh fails, and distinguishes sync failure', async () => {
    const runtime = mount();
    const toast = vi.spyOn(runtime, 'toast');
    const flush = vi
      .spyOn(runtime, 'flushSales')
      .mockResolvedValue({ sent: [], failed: [], skipped: true });
    const command = runtime as unknown as {
      queueCommand: (
        kind: 'expense',
        eventId: string,
        key: string,
        payload: Record<string, unknown>
      ) => Promise<void>;
    };
    queueReadFails = true;
    await act(async () => command.queueCommand('expense', 'event', 'stable-key', {}));
    expect(flush).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
    expect(runtime.renderVals().healthRows.find((row) => row.label === 'Bazaar sync')?.bad).toBe(
      true
    );
    flush.mockRejectedValueOnce(new Error('Sync read failed'));
    await act(async () => command.queueCommand('expense', 'event', 'stable-key', {}));
    expect(toast).toHaveBeenCalledWith('Saved on this phone. Sync is still pending.', 'warn');
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('could not be saved'), 'warn');
  });
  it('renders activation pending instead of the prototype backup claim; never sends a fake support message', () => {
    const runtime = mount();
    expect(screen.getAllByText(/Not yet recorded/).length).toBeGreaterThan(0);
    const toast = vi.spyOn(runtime, 'toast');
    act(() => {
      runtime.renderVals().contactSupport();
    });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Please contact'), 'warn');
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('Message sent'));
    expect(screen.getByText(/Privacy: The Happy Cookie/)).toBeTruthy();
  });
  it('loads real status and a failed subsequent request removes the healthy headline', async () => {
    const runtime = mount();
    const rpc = vi.fn().mockResolvedValue({ data: wire(), error: null });
    const client = { rpc } as unknown as OperationsClient;
    await act(async () => {
      expect(await runtime.loadOperationsHealth(client)).toBe(true);
    });
    expect(screen.getByText('Healthy')).toBeTruthy();
    expect(runtime.renderVals().system.detail).not.toContain('2 days ago');
    act(() => runtime.setState({ unsynced: 1 }));
    expect(runtime.renderVals().healthOk).toBe(false);
    act(() => runtime.setState({ unsynced: 0 }));
    queue = [{ clientId: 'pending-command', kind: 'open', state: 'pending' }];
    await act(async () => void (await runtime.flushSales()));
    expect(runtime.renderVals().healthOk).toBe(false);
    expect(
      runtime.renderVals().healthRows.find((row) => row.label === 'Bazaar sync')?.value
    ).toContain('1 queued');
    queue = [];
    rpc.mockResolvedValue({ data: null, error: { message: 'private provider details' } });
    await act(async () => {
      expect(await runtime.loadOperationsHealth(null)).toBe(false);
    });
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.queryByText(/private provider details/)).toBeNull();
    expect(runtime.renderVals().recordGroups).toEqual([]);
  });
  it('owner alerts use loaded orders and stock, filter completed orders and route to existing screens', async () => {
    const runtime = mount();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const order = {
      id: 'HC-TEST',
      name: 'Test customer',
      phone: '09171234567',
      ig: '',
      state: 'Confirmed',
      pay_state: 'confirmed',
      pay_method: 'GCash',
      pay_ref: null,
      total_cents: 20000,
      paid_cents: 20000,
      refund_ref: null,
      pickup_date: today,
      pickup_window: '10:00',
      placed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_token: 'a'.repeat(64),
      holds: true,
      items: [{ product_id: 'wcb', qty: 2, unit_price_cents: 10000, unavailable: false }],
      swaps: []
    };
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'get_staff_orders'
          ? [order]
          : {
              suppliers: [],
              prices: [],
              items: [
                {
                  id: 'butter',
                  name: 'Unsalted butter',
                  category: 'Ingredients',
                  unit: 'g',
                  on_hand: 10,
                  par_level: 100,
                  pack_size: 1000,
                  pack_label: '1 kg',
                  supplier_id: null,
                  use_by_days: null,
                  last_counted: null,
                  active: true,
                  updated_at: new Date().toISOString()
                }
              ]
            },
      error: null
    }));
    await act(async () => {
      expect(await runtime.loadOrders({ rpc } as unknown as StaffOrderClient)).toBe(true);
      expect(await runtime.loadStockCatalogue({ rpc } as unknown as StockClient)).toBe(true);
    });
    expect(runtime.notifs(runtime.state).map((alert) => alert.label)).toEqual(
      expect.arrayContaining([
        'New order HC-TEST',
        '1 order(s) for pickup today',
        '1 stock item(s) below reorder level'
      ])
    );
    const go = vi.spyOn(runtime, 'go').mockImplementation(() => undefined);
    runtime
      .notifs(runtime.state)
      .find((alert) => alert.k === 'inventory')
      ?.go();
    expect(go).toHaveBeenCalledWith('inventory');
    order.state = 'Completed';
    await act(async () =>
      expect(await runtime.loadOrders({ rpc } as unknown as StaffOrderClient)).toBe(true)
    );
    expect(runtime.notifs(runtime.state).some((alert) => alert.k === 'orders')).toBe(false);
    act(() => runtime.setState({ channels: { 'Low stock': false }, role: 'support' }));
    expect(runtime.notifs(runtime.state).every((alert) => alert.k === 'health')).toBe(true);
  });
  it('honours owner channel switches and support/helper never receive order alerts', () => {
    const runtime = mount();
    act(() => {
      runtime.setState({
        channels: {
          'New order': false,
          'Low stock': false,
          'Grocery shortage': false,
          'Pickup reminder': false,
          'Backup failure': false,
          'System error': false
        }
      });
    });
    expect(runtime.notifs(runtime.state)).toEqual([]);
    act(() => {
      runtime.setState({
        role: 'support',
        channels: { 'System error': true, 'Backup failure': true }
      });
    });
    expect(runtime.notifs(runtime.state).every((alert) => alert.k === 'health')).toBe(true);
    act(() => {
      runtime.setState({ role: 'helper' });
    });
    expect(runtime.notifs(runtime.state)).toEqual([]);
  });
  it('keeps the original demo health values and notifications', () => {
    live = false;
    const runtime = mount();
    expect(runtime.renderVals().healthRows.some((row) => row.label === 'Automatic backup')).toBe(
      true
    );
    expect(
      runtime
        .notifs(runtime.state)
        .some((row) => row.label === 'Automatic backup failed' || row.label === 'Backup completed')
    ).toBe(true);
  });
  it('a late earlier read cannot overwrite the newer failed check', async () => {
    const runtime = mount();
    let resolve: (v: unknown) => void = () => undefined;
    const slow = new Promise((r) => {
      resolve = r;
    });
    const rpc = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce({ data: null, error: { code: 'x' } });
    const client = { rpc } as unknown as OperationsClient;
    let first: Promise<boolean>;
    await act(async () => {
      first = runtime.loadOperationsHealth(client);
      await runtime.loadOperationsHealth(client);
    });
    await act(async () => {
      resolve({ data: wire(), error: null });
      expect(await first).toBe(false);
    });
    expect(runtime.renderVals().healthOk).toBe(false);
  });
});
