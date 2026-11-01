import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { OwnerWorkspace } from '@/components/live/owner-workspace';

function Frame() {
  const v = useOpsVals();
  const engine = useOpsEngine();
  return (
    <OwnerWorkspace
      v={v}
      screen={engine.state.screen}
      role={engine.state.role}
      onAccount={() => engine.go('settings')}
    />
  );
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
  return runtime;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  live = true;
});

it('shows the approved six destinations and real brand asset, with direct Account', () => {
  const runtime = mount();
  expect(document.querySelector('[data-refined-frame]')).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(
    within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent?.replace(/\d+/g, ''))
  ).toEqual(['Home', 'Bazaar', 'Sell', 'Make', 'Stock', 'Money']);
  expect(document.querySelector('img')?.getAttribute('src')).toBe('/assets/mark.png');
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  expect(runtime.state.screen).toBe('notifications');
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  expect(runtime.state.screen).toBe('settings');
  expect(document.title).toContain('The Happy Cookie');
});

it('keeps demo, helper/denied and customer pages on the existing frame', () => {
  live = false;
  mount();
  expect(document.querySelector('[data-refined-frame]')).toBeNull();
  cleanup();
  live = true;
  const runtime = mount();
  act(() => runtime.setRole('helper'));
  act(() => runtime.go('orders'));
  expect(screen.getByText('Back to what you can do')).toBeTruthy();
  expect(document.title).toBe('The Happy Cookie');
  expect(document.querySelector('[data-refined-frame]')).toBeNull();
  act(() => runtime.setRole('owner'));
  act(() => runtime.go('shop'));
  expect(document.querySelector('[data-refined-frame]')).toBeNull();
});
