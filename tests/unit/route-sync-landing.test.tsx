import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

const engine = {
  state: {
    screen: 'today',
    role: 'owner',
    inv: [] as { name: string; cat: string }[],
    invTab: 'Ingredients',
    navTick: 0,
    history: [] as string[],
    orderId: null as string | null,
    batch: null as object | null
  },
  go: vi.fn((screen: string) => {
    engine.state.screen = screen;
    engine.state.navTick += 1;
  }),
  setState: vi.fn()
};
vi.mock('@/store/use-ops', () => ({ useOpsEngine: () => engine, useOpsVals: () => ({}) }));

import { RouteSync, landingScreen } from '@/components/app/route-sync';
import type { ScreenKey } from '@/lib/screens';

function visit(path: string, initialScreen: ScreenKey) {
  engine.state.screen = 'today';
  engine.state.navTick = 0;
  engine.go.mockClear();
  window.history.replaceState(null, '', path);
  const entries = window.history.length;
  const view = render(<RouteSync initialScreen={initialScreen} />);
  view.rerender(<RouteSync initialScreen={initialScreen} />);
  return { view, entries };
}

afterEach(() => {
  cleanup();
  live = true;
  engine.state.orderId = null;
  engine.state.batch = null;
  window.history.replaceState(null, '', '/');
});

describe('a direct visit to a screen that needs an open record (UX review, proposal 4)', () => {
  it('live: /order with no open order lands on the orders list, replacing the entry', () => {
    const { entries } = visit('/order', 'order');
    expect(engine.go).toHaveBeenCalledTimes(1);
    expect(engine.go).toHaveBeenCalledWith('orders');
    expect(window.location.pathname).toBe('/orders');
    // Replaced, not pushed: Back never returns to the empty page.
    expect(window.history.length).toBe(entries);
  });
  it('live: /batch with no open batch lands on the bake plan, replacing the entry', () => {
    const { entries } = visit('/batch', 'batch');
    expect(engine.go).toHaveBeenCalledTimes(1);
    expect(engine.go).toHaveBeenCalledWith('bake');
    expect(window.location.pathname).toBe('/bake');
    expect(window.history.length).toBe(entries);
  });
  it('live: an order opened later in the visit keeps its own address', () => {
    const { view } = visit('/order', 'order');
    engine.state.orderId = 'HC-1';
    engine.go('order');
    view.rerender(<RouteSync initialScreen="order" />);
    expect(window.location.pathname).toBe('/order');
    view.rerender(<RouteSync initialScreen="order" />);
    // The landing rule ran once, at the page load; it does not send her back to the list.
    expect(engine.go.mock.calls).toEqual([['orders'], ['order']]);
    expect(window.location.pathname).toBe('/order');
  });
  it('an open order or batch is kept, and other screens are untouched', () => {
    expect(landingScreen('order', { orderId: 'HC-1' })).toBe('order');
    expect(landingScreen('batch', { batch: { pid: 'dcf' } })).toBe('batch');
    expect(landingScreen('orders', {})).toBe('orders');
    expect(landingScreen('bake', {})).toBe('bake');
    expect(landingScreen('stocktake', {})).toBe('inventory');
  });
  it('demo: the direct route is kept, as the route and visual tests rely on', () => {
    live = false;
    expect(landingScreen('order', {})).toBe('order');
    expect(landingScreen('batch', {})).toBe('batch');
    expect(landingScreen('stocktake', {})).toBe('inventory');
    visit('/order', 'order');
    expect(engine.go).toHaveBeenCalledWith('order');
    expect(window.location.pathname).toBe('/order');
    visit('/batch', 'batch');
    expect(engine.go).toHaveBeenCalledWith('batch');
    expect(window.location.pathname).toBe('/batch');
  });
});
