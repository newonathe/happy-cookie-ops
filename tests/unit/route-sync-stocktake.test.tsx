import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const engine = {
  state: {
    screen: 'today',
    role: 'owner',
    inv: [] as { name: string; cat: string }[],
    invTab: 'Ingredients',
    navTick: 0,
    history: [],
    stocktake: null as object | null
  },
  go: vi.fn((screen: string) => {
    engine.state.screen = screen;
    engine.state.navTick += 1;
  }),
  setState: vi.fn(),
  startStocktake: vi.fn(() => {
    engine.state.stocktake = { counts: {} };
  })
};
vi.mock('@/store/use-ops', () => ({ useOpsEngine: () => engine, useOpsVals: () => ({}) }));

import { RouteSync } from '@/components/app/route-sync';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('direct stocktake route', () => {
  it('waits for owner inventory, starts once and keeps the count URL after rerenders or cancellation', () => {
    engine.state.screen = 'today';
    engine.state.role = 'owner';
    engine.state.inv = [];
    engine.state.navTick = 0;
    engine.state.stocktake = null;
    engine.go.mockClear();
    engine.startStocktake.mockClear();
    window.history.replaceState(null, '', '/stocktake');
    const { rerender } = render(<RouteSync initialScreen="stocktake" />);
    expect(engine.go).toHaveBeenCalledWith('inventory');
    rerender(<RouteSync initialScreen="stocktake" />);
    expect(engine.startStocktake).not.toHaveBeenCalled();
    engine.state.inv = [{ name: 'Flour', cat: 'Ingredients' }];
    rerender(<RouteSync initialScreen="stocktake" />);
    expect(engine.startStocktake).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/stocktake');
    engine.state.stocktake = null;
    rerender(<RouteSync initialScreen="stocktake" />);
    expect(engine.startStocktake).toHaveBeenCalledTimes(1);
  });
});
