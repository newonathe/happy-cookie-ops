import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = false;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime, type Device } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { CustomersSheet } from '@/components/sheets/customers';
import { BASE_STATE, RAW_ORDERS, STORE_KEY } from '@/store/engine/ops-engine';
import { SCREEN_KEYS, CUSTOMER_SCREENS } from '@/lib/screens';

// Three screens render no [data-screen-label] from `screen` alone, in demo mode too, so
// this is not a live-state quirk — each needs a real selection first, which nothing in
// this matrix makes:
//   'stocktake'  has no screen file — reached by routing to 'inventory' with a hint
//                (AGENTS.md "Known traps"); route-sync does that, this test bypasses it.
//   'order'      OrderDetailScreen renders only once `v.od` resolves an orderId to a
//                real order — `{od ? <div data-screen-label="Order detail">…} : null}`.
//   'batch'      ProductionFocusScreen is the same shape, gated on `v.batch`.
// Real no-throw/no-NaN/no-seeded-name coverage still applies to all three; only the "a
// screen body actually rendered" assertion is skipped for them.
const SCREENS_NEED_A_SELECTION: ReadonlySet<string> = new Set(['stocktake', 'order', 'batch']);
const STAFF_SCREENS = SCREEN_KEYS.filter((key) => !CUSTOMER_SCREENS.includes(key));
const DEVICES: Device[] = ['mobile', 'tablet', 'desktop'];

const demoBase = BASE_STATE() as unknown as {
  queue: Array<{ name: string }>;
  waitlist: Array<{ name: string }>;
};
const SEEDED_NAMES = [
  String(RAW_ORDERS[0]?.name), // shows on orders/order/sales — an order-book name
  demoBase.queue[0]?.name, // shows on formqueue — a Google Form submission name
  demoBase.waitlist[0]?.name // shows only in the Customers & waitlist sheet, not a screen
];

function runtimeFor(
  device: Device,
  screen: (typeof SCREEN_KEYS)[number],
  stateOverrides: Record<string, unknown> = {}
) {
  const runtime = new OpsRuntime({});
  runtime.state = { ...runtime.state, device, screen, ...stateOverrides };
  return runtime;
}

describe('MP-09 a: live data boundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    live = true;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('names three distinct seeded customer names to check against, each one actually shown in demo mode', () => {
    expect(new Set(SEEDED_NAMES).size).toBe(3);
    for (const name of SEEDED_NAMES) expect(typeof name).toBe('string');

    live = false;
    const runtime = runtimeFor('desktop', 'orders');
    const orderScreenText =
      render(<AppFrame v={runtime.renderVals()} />).container.textContent ?? '';
    expect(orderScreenText).toContain(SEEDED_NAMES[0]);
    cleanup();

    const formQueueRuntime = runtimeFor('desktop', 'formqueue');
    const formQueueText =
      render(<AppFrame v={formQueueRuntime.renderVals()} />).container.textContent ?? '';
    expect(formQueueText).toContain(SEEDED_NAMES[1]);
    cleanup();

    const sheetRuntime = runtimeFor('desktop', 'today');
    const sheetText =
      render(<CustomersSheet v={sheetRuntime.renderVals()} />).container.textContent ?? '';
    expect(sheetText).toContain(SEEDED_NAMES[0]); // s.orders, "Ordering now"
    expect(sheetText).toContain(SEEDED_NAMES[2]); // s.waitlist
    cleanup();
  });

  it.each(STAFF_SCREENS.flatMap((screen) => DEVICES.map((device) => [screen, device] as const)))(
    'renders %s on %s from the live state with no throw, no console.error, no NaN/undefined/Infinity and no seeded demo name',
    (screen, device) => {
      const runtime = runtimeFor(device, screen);
      const v = runtime.renderVals();
      const { container, unmount } = render(<AppFrame v={v} />);

      if (!SCREENS_NEED_A_SELECTION.has(screen))
        expect(container.querySelector('[data-screen-label]')).not.toBeNull();
      expect(container.innerHTML).not.toMatch(/undefined/);
      expect(container.innerHTML).not.toMatch(/\bNaN\b/);
      expect(container.innerHTML).not.toMatch(/\bInfinity\b/);
      for (const name of SEEDED_NAMES) expect(container.textContent ?? '').not.toContain(name);
      expect(errorSpy).not.toHaveBeenCalled();

      unmount();
    }
  );

  it('never shows the seeded waitlist/order names in the Customers & waitlist sheet either', () => {
    const runtime = runtimeFor('desktop', 'today');
    const text = render(<CustomersSheet v={runtime.renderVals()} />).container.textContent ?? '';
    for (const name of SEEDED_NAMES) expect(text).not.toContain(name);
  });

  it('drops the fabricated PRIOR_MONTHS trend down to the current month and recomputes its bar from real profit', () => {
    // Empty live books: profit is 0, the reduce's own clamp floor, not NaN — a weak signal
    // on its own, since the unmodified engine's 12,880-peak max would also round 0 to 6.
    const empty = runtimeFor('desktop', 'pnl');
    const emptyTrend = empty.renderVals().plTrend as Array<{
      now: unknown;
      past: unknown;
      v: number;
    }>;
    expect(emptyTrend).toHaveLength(1);
    expect(emptyTrend[0]?.now).toBe(true);
    expect(emptyTrend.some((row) => row.past)).toBe(false);
    expect(emptyTrend[0]?.v).toBe(6);

    // A real profit month is the differentiating case: against the fabricated peak
    // (₱12,880) this would round to ~39%; recomputed against just this row, it is 100%.
    const profitable = runtimeFor('desktop', 'pnl', {
      ledger: [
        {
          id: 'L1',
          kind: 'revenue',
          cat: 'Bazaar',
          label: 'Test sale',
          amount: 5000,
          at: Date.now()
        }
      ]
    });
    const trend = profitable.renderVals().plTrend as Array<{
      now: unknown;
      past: unknown;
      v: number;
    }>;
    expect(trend).toHaveLength(1);
    expect(trend[0]?.v).toBe(100);
  });

  it('in demo mode keeps the full four-month trend, past months included', () => {
    live = false;
    const runtime = runtimeFor('desktop', 'pnl');
    const v = runtime.renderVals();
    const trend = v.plTrend as Array<{ now: unknown; past: unknown }>;
    expect(trend.length).toBeGreaterThan(1);
    expect(trend.some((row) => row.past)).toBe(true);
  });

  it('wires the Settings reset sheet to the live resetData override', () => {
    const runtime = runtimeFor('desktop', 'settings');
    expect(runtime.renderVals().confirmReset).toBe(runtime.resetData);
  });
});

describe('MP-09 a: storage boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('live mode never reads a stale save, removes it from both storages, and keeps hc-device-id', () => {
    live = true;
    const stale = JSON.stringify({ v: 1, data: { orders: [{ id: 'stale-demo-order' }] } });
    window.localStorage.setItem(STORE_KEY, stale);
    window.sessionStorage.setItem(STORE_KEY, stale);
    window.localStorage.setItem('hc-device-id', 'device-abc');

    const ref = createRef<OpsRuntime>();
    render(<OpsRuntime ref={ref} />);

    expect(ref.current?.state.orders).toEqual([]);
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(window.localStorage.getItem('hc-device-id')).toBe('device-abc');
  });

  it('live mode never autosaves, even after the debounce window and a pagehide flush', () => {
    live = true;
    vi.useFakeTimers();
    try {
      render(<OpsRuntime />);
      act(() => {
        vi.advanceTimersByTime(5000);
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
      expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('demo mode still restores an existing save and writes hc-ops-state-v1', () => {
    live = false;
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, data: { dropNo: 999 } }));
    vi.useFakeTimers();
    try {
      const ref = createRef<OpsRuntime>();
      act(() => {
        render(<OpsRuntime ref={ref} />);
      });
      expect(ref.current?.state.dropNo).toBe(999);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(window.localStorage.getItem(STORE_KEY)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the live Settings reset clears storage and loads the empty live state, preserving device/role', () => {
    live = true;
    const ref = createRef<OpsRuntime>();
    render(<OpsRuntime ref={ref} />);
    const runtime = ref.current!;
    act(() => {
      runtime.setState({ role: 'helper', device: 'tablet' });
    });
    window.localStorage.setItem(STORE_KEY, 'residue');

    act(() => {
      runtime.resetData();
    });

    expect(runtime.state.orders).toEqual([]);
    expect(runtime.state.role).toBe('helper');
    expect(runtime.state.device).toBe('tablet');
    expect(runtime.state.screen).toBe('today');
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
  });

  it('cancels the pending reset message when its screen unmounts', () => {
    live = true;
    vi.useFakeTimers();
    try {
      const ref = createRef<OpsRuntime>();
      const view = render(<OpsRuntime ref={ref} />);
      const runtime = ref.current;
      if (!runtime) throw new Error('Runtime did not mount');
      const toast = vi.spyOn(runtime, 'toast');
      act(() => runtime.resetData());
      view.unmount();
      act(() => vi.advanceTimersByTime(80));
      expect(toast).not.toHaveBeenCalled();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('shows one reset acknowledgement after the latest reset while mounted', () => {
    live = true;
    vi.useFakeTimers();
    try {
      const ref = createRef<OpsRuntime>();
      render(<OpsRuntime ref={ref} />);
      const runtime = ref.current;
      if (!runtime) throw new Error('Runtime did not mount');
      const toast = vi.spyOn(runtime, 'toast');
      act(() => runtime.resetData());
      act(() => vi.advanceTimersByTime(40));
      act(() => runtime.resetData());
      act(() => vi.advanceTimersByTime(80));
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Back to empty. Local records on this device were cleared.',
        'warn'
      );
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});
