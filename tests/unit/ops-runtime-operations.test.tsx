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
    const failed = {
      last_run: { status: 'failed', completed_at: new Date().toISOString(), archive_sha256: null },
      last_success: null
    };
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          checked_at: new Date().toISOString(),
          jobs: { backup: failed, restore: missing, retention: missing, keepalive: missing }
        },
        error: null
      })
    } as unknown as OperationsClient;
    await act(async () => void (await runtime.loadOperationsHealth(client)));
    expect(runtime.renderVals().notifications).toHaveLength(4);
    act(() => runtime.renderVals().clearNotifs());
    expect(runtime.renderVals().notifications).toEqual([]);
    const dismissed = runtime.state.notifRead;
    await act(async () => void (await runtime.loadOperationsHealth(null)));
    expect(runtime.state.notifRead).toEqual(dismissed);
    expect(runtime.renderVals().notifications).toEqual([]);
    act(() => runtime.renderVals().restoreNotifs());
    expect(runtime.renderVals().notifications.length).toBeGreaterThan(0);
  });
  it('backups never switched on: facts stay in System health, no alert or badge, and no green claim', async () => {
    const runtime = mount();
    const missing = { last_run: null, last_success: null };
    const answer = (backup: unknown) => ({
      data: {
        checked_at: new Date().toISOString(),
        jobs: { backup, restore: missing, retention: missing, keepalive: missing }
      },
      error: null
    });
    const rpc = vi.fn().mockResolvedValue(answer(missing));
    const client = { rpc } as unknown as OperationsClient;
    const item = (vals: ReturnType<OpsRuntime['renderVals']>, label: string) =>
      vals.toolGroups.flatMap((group) => group.items).find((row) => row.label === label);
    const moreBadge = (vals: ReturnType<OpsRuntime['renderVals']>) =>
      vals.dockNav.find((row) => row.label === 'All tools')?.badge;
    // Before any read the app cannot tell "not set up" from "not reachable": it still alerts.
    expect(runtime.notifs(runtime.state).map((alert) => alert.label)).toContain(
      'Encrypted database backup: Not yet recorded — activation pending'
    );
    expect(moreBadge(runtime.renderVals())).toBe(1);

    await act(async () => void (await runtime.loadOperationsHealth(client)));
    let vals = runtime.renderVals();
    expect(runtime.notifs(runtime.state)).toEqual([]);
    expect(vals.notifications).toEqual([]);
    expect(screen.getAllByText('Not yet recorded — activation pending')).toHaveLength(4);
    expect(screen.getByText('No backup has run yet')).toBeTruthy();
    expect(screen.queryByText('Healthy')).toBeNull();
    expect(vals.healthOk).toBe(false);
    expect(vals.healthRows.some((row) => row.bad)).toBe(false);
    expect(vals.system).toMatchObject({
      ok: false,
      bad: true,
      label: 'No backup has run yet',
      detail: 'A set-up task for Ethan, not for the kitchen.'
    });
    expect(item(vals, 'System health')).toMatchObject({
      sub: 'No backup has run yet',
      badge: null
    });
    expect(runtime.state.backup).toBe('ok');
    expect(moreBadge(vals)).toBe(0);
    const launcher = vals.launcher.flatMap((group) => group.items);
    expect(launcher.find((row) => row.label === 'System health')?.sub).toBe(
      'No backup has run yet'
    );
    expect(launcher.find((row) => row.label === 'Backups & export')?.sub).toBe(
      'Recorded checks and books CSV'
    );
    expect(
      vals.settingsGroups
        .flatMap((group) => group.rows)
        .find((row) => row.label === 'Backups and export')?.value
    ).toBe('No backup has run yet');

    // The first recorded run ends the quiet state: a failure alerts, and so do the jobs still missing.
    rpc.mockResolvedValue(
      answer({
        last_run: {
          status: 'failed',
          completed_at: new Date().toISOString(),
          archive_sha256: null
        },
        last_success: null
      })
    );
    await act(async () => void (await runtime.loadOperationsHealth(null)));
    vals = runtime.renderVals();
    expect(vals.notifications.map((row) => row.label)).toEqual([
      expect.stringMatching(/^Encrypted database backup: Failed /),
      'Restore drill: Not yet recorded — activation pending',
      'Customer data retention: Not yet recorded — activation pending',
      'Keep-alive: Not yet recorded — activation pending'
    ]);
    expect(vals.system).toMatchObject({ bad: true, label: 'Needs attention' });
    expect(item(vals, 'System health')?.badge).toBe(4);
    expect(runtime.state.backup).toBe('failed');
    expect(moreBadge(vals)).toBe(1);

    // A failed read is never the quiet state either.
    rpc.mockResolvedValue({ data: null, error: { code: 'x' } });
    await act(async () => void (await runtime.loadOperationsHealth(null)));
    expect(runtime.notifs(runtime.state).length).toBeGreaterThan(0);
    expect(runtime.state.backup).toBe('failed');
  });
  it('an open page re-reads health before the read goes stale, so the quiet state does not wear off', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const runtime = mount();
      const missing = { last_run: null, last_success: null };
      const rpc = vi.fn(async () => ({
        data: {
          checked_at: new Date().toISOString(),
          jobs: { backup: missing, restore: missing, retention: missing, keepalive: missing }
        },
        error: null
      }));
      const client = { rpc } as unknown as OperationsClient;
      await act(async () => void (await runtime.loadOperationsHealth(client)));
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(runtime.notifs(runtime.state)).toEqual([]);

      // Seven minutes with the page open: re-read at four minutes, so it is still current.
      await act(async () => void (await vi.advanceTimersByTimeAsync(7 * 60_000)));
      expect(rpc).toHaveBeenCalledTimes(2);
      act(() => runtime.setState({}));
      expect(runtime.notifs(runtime.state)).toEqual([]);
      expect(runtime.state.backup).toBe('ok');
      expect(runtime.renderVals().healthTitle).toBe('No backup has run yet');

      // A hidden page does not re-read. Once its last read is older than five minutes the
      // app claims nothing from it: every check alerts again until the next successful read.
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      await act(async () => void (await vi.advanceTimersByTimeAsync(10 * 60_000)));
      expect(rpc).toHaveBeenCalledTimes(2);
      act(() => runtime.setState({}));
      expect(runtime.notifs(runtime.state).map((alert) => alert.label)).toContain(
        'Encrypted database backup: Not yet recorded — activation pending'
      );
      expect(runtime.state.backup).toBe('failed');
      visibility.mockReturnValue('visible');
      await act(async () => void (await runtime.loadOperationsHealth(null)));
      expect(runtime.notifs(runtime.state)).toEqual([]);

      // Leaving the app stops the re-reads.
      cleanup();
      const calls = rpc.mock.calls.length;
      await vi.advanceTimersByTimeAsync(20 * 60_000);
      expect(rpc).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a healthy record clears the engine backup flag, and going offline raises it again', async () => {
    const runtime = mount();
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: wire(), error: null })
    } as unknown as OperationsClient;
    const moreBadge = () =>
      runtime.renderVals().dockNav.find((row) => row.label === 'All tools')?.badge;
    await act(async () => void (await runtime.loadOperationsHealth(client)));
    expect(runtime.state.backup).toBe('ok');
    expect(moreBadge()).toBe(0);
    act(() => runtime.setState({ online: false }));
    expect(runtime.state.backup).toBe('failed');
    act(() => runtime.setState({ online: true, unsynced: 1 }));
    expect(runtime.state.backup).toBe('ok');
    expect(moreBadge()).toBe(1);
  });
  it('demo mode leaves the engine backup flag alone', () => {
    live = false;
    const runtime = mount();
    act(() => runtime.setState({ unsynced: 0 }));
    expect(runtime.state.backup).toBe('failed');
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
