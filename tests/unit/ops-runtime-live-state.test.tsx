import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = false;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime, type Device } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { BASE_STATE, RAW_ORDERS, STORE_KEY } from '@/store/engine/ops-engine';
import { SCREEN_KEYS, CUSTOMER_SCREENS } from '@/lib/screens';

const STAFF_SCREENS = SCREEN_KEYS.filter((key) => !CUSTOMER_SCREENS.includes(key));
const DEVICES: Device[] = ['mobile', 'tablet', 'desktop'];

const demoBase = BASE_STATE() as unknown as {
  queue: Array<{ name: string }>;
  waitlist: Array<{ name: string }>;
};
const SEEDED_NAMES = [
  String(RAW_ORDERS[0]?.name),
  demoBase.queue[0]?.name,
  demoBase.waitlist[0]?.name
];

function runtimeFor(device: Device, screen: (typeof SCREEN_KEYS)[number]) {
  const runtime = new OpsRuntime({});
  runtime.state = { ...runtime.state, device, screen };
  return runtime;
}

describe('MP-09 a: live data boundary', () => {
  beforeEach(() => {
    live = true;
  });

  it('names three distinct seeded customer names to check against', () => {
    expect(new Set(SEEDED_NAMES).size).toBe(3);
    for (const name of SEEDED_NAMES) expect(typeof name).toBe('string');
  });

  it.each(STAFF_SCREENS.flatMap((screen) => DEVICES.map((device) => [screen, device] as const)))(
    'renders %s on %s from the live state with no throw, no NaN/undefined/Infinity and no seeded demo name',
    (screen, device) => {
      const runtime = runtimeFor(device, screen);
      const v = runtime.renderVals();
      const { container, unmount } = render(<AppFrame v={v} />);

      expect(container.innerHTML).not.toMatch(/undefined/);
      expect(container.innerHTML).not.toMatch(/\bNaN\b/);
      expect(container.innerHTML).not.toMatch(/\bInfinity\b/);
      for (const name of SEEDED_NAMES) expect(container.textContent ?? '').not.toContain(name);

      unmount();
    }
  );

  it('drops the fabricated PRIOR_MONTHS trend down to the current month and recomputes its bar', () => {
    const runtime = runtimeFor('desktop', 'pnl');
    const v = runtime.renderVals();
    const trend = v.plTrend as Array<{ now: unknown; past: unknown; v: number }>;

    expect(trend).toHaveLength(1);
    expect(trend[0]?.now).toBe(true);
    expect(trend.some((row) => row.past)).toBe(false);
    // Empty live books mean zero profit, which is the reduce's clamp floor, not NaN.
    expect(trend[0]?.v).toBe(6);
  });

  it('in demo mode keeps the full four-month trend, past months included', () => {
    live = false;
    const runtime = runtimeFor('desktop', 'pnl');
    const v = runtime.renderVals();
    const trend = v.plTrend as Array<{ now: unknown; past: unknown }>;
    expect(trend.length).toBeGreaterThan(1);
    expect(trend.some((row) => row.past)).toBe(true);
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
      vi.advanceTimersByTime(5000);
      window.dispatchEvent(new Event('pagehide'));
      expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
      expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('demo mode still restores and writes hc-ops-state-v1', () => {
    live = false;
    vi.useFakeTimers();
    try {
      render(<OpsRuntime />);
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
});
