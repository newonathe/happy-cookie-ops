import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { liveScreenFor, registerLiveScreen } from '@/components/live/live-screens';
import { SCREEN_KEYS } from '@/lib/screens';

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mount(role: 'owner' | 'helper' | 'support' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  act(() => runtime.setState({ device: 'mobile' }));
  return runtime;
}
/** A stand-in for a redesigned screen. Registered by a test only; shipped code registers none. */
function NewOrders() {
  return <div data-live-test="orders">The redesigned orders screen</div>;
}
const ported = (label: string) => document.querySelector(`[data-screen-label="${label}"]`);
const drawn = () => document.querySelector('[data-live-test]');

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
  cleanup();
  live = true;
});

describe('B1: the guarded, live-only screen slot', () => {
  it('ships with no screen registered', () => {
    // The runtime import above pulls in everything the app registers.
    for (const key of SCREEN_KEYS) expect([key, liveScreenFor(key)]).toEqual([key, undefined]);
  });

  it('draws no screen in live mode until one is registered: the ported screen renders', () => {
    const runtime = mount();
    act(() => runtime.go('orders'));
    // Since part 2c the slot carries the owner's sub-tab strip; it still names no screen.
    expect(runtime.renderVals().liveScreen?.screen).toBeNull();
    expect(runtime.renderVals().screens.orders).toBe(true);
    expect(ported('Orders')).toBeTruthy();
    expect(drawn()).toBeNull();
  });

  it('draws a registered screen in place of the ported one, under the same key', () => {
    unregister = registerLiveScreen('orders', NewOrders);
    const runtime = mount();
    act(() => runtime.go('orders'));
    expect(runtime.state.screen).toBe('orders');
    expect(runtime.renderVals().liveScreen?.screen).toBe('orders');
    expect(runtime.renderVals().screens.orders).toBe(false);
    expect(screen.getByText('The redesigned orders screen')).toBeTruthy();
    expect(ported('Orders')).toBeNull();
    // Only that key is replaced: every other screen is still the ported one.
    act(() => runtime.go('bake'));
    expect(runtime.renderVals().liveScreen?.screen).toBeNull();
    expect(ported('Bake plan')).toBeTruthy();
    expect(drawn()).toBeNull();
    // Unregistering gives the ported screen back.
    unregister();
    act(() => runtime.go('orders'));
    expect(ported('Orders')).toBeTruthy();
    expect(drawn()).toBeNull();
  });

  it('draws nothing for a role the engine denies the screen to', () => {
    unregister = registerLiveScreen('orders', NewOrders);
    const runtime = mount('helper');
    act(() => runtime.go('orders'));
    expect(runtime.renderVals().denied).toBe(true);
    expect(runtime.renderVals().liveScreen).toBeNull();
    expect(drawn()).toBeNull();
    expect(ported('Orders')).toBeNull();
    expect(screen.getByText('Back to what you can do')).toBeTruthy();
  });

  it('demo mode never reaches the slot, registered or not', () => {
    live = false;
    unregister = registerLiveScreen('orders', NewOrders);
    const runtime = mount();
    act(() => runtime.go('orders'));
    const vals = runtime.renderVals();
    expect(vals.bareFrame).toBeUndefined();
    expect(vals.liveScreen).toBeUndefined();
    expect(vals.screens.orders).toBe(true);
    expect(ported('Orders')).toBeTruthy();
    expect(drawn()).toBeNull();
  });
});
