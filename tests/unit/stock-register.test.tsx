import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { liveScreenFor } from '@/components/live/live-screens';
import { registerLiveStockScreens } from '@/components/live/stock/register';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { GroceryLive } from '@/components/live/stock/grocery-live';

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mount() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ device: 'mobile' }));
  return runtime;
}
const ported = (label: string) => document.querySelector(`[data-screen-label="${label}"]`);

afterEach(() => {
  cleanup();
  live = true;
});

describe('B5: the New Stock screens register in the live slot', () => {
  it('registers inventory and grocery, and registering twice is harmless', () => {
    const first = registerLiveStockScreens();
    const second = registerLiveStockScreens();
    expect(liveScreenFor('inventory')).toBe(InventoryLive);
    expect(liveScreenFor('grocery')).toBe(GroceryLive);
    expect(typeof first).toBe('function');
    // Registering again leaves the same two components in place.
    expect(liveScreenFor('inventory')).toBe(InventoryLive);
    second();
  });

  it('live mode draws the registered inventory in place of the ported screen', () => {
    registerLiveStockScreens();
    const runtime = mount();
    act(() => runtime.go('inventory'));
    expect(runtime.renderVals().liveScreen?.screen).toBe('inventory');
    expect(runtime.renderVals().screens.inventory).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toBeTruthy();
    // With no live stock yet the screen says so, plainly.
    expect(screen.getByText('Stock is loading.')).toBeTruthy();
    // The one screen under that label is the new one, not the ported Inventory.
    expect(document.querySelectorAll('[data-screen-label="Inventory"]')).toHaveLength(1);
    expect(ported('Inventory')?.textContent).toContain('Stock is loading.');
    act(() => runtime.go('grocery'));
    expect(screen.getByRole('heading', { level: 1, name: 'Grocery list' })).toBeTruthy();
  });

  it('demo mode never draws them', () => {
    live = false;
    registerLiveStockScreens();
    const runtime = mount();
    act(() => runtime.go('inventory'));
    expect(runtime.renderVals().liveScreen).toBeUndefined();
    expect(screen.queryByText('Stock is loading.')).toBeNull();
    expect(ported('Inventory')).toBeTruthy();
  });
});
