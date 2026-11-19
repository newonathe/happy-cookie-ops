import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
import { OpsRuntime } from '@/store/ops-runtime';
import { PRODUCTS } from '@/store/engine/ops-engine';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { OwnerWorkspace, railIdentity } from '@/components/live/owner-workspace';
import { SIGN_OUT_RAIL_SLOT_ID } from '@/components/app/sign-out-control';
import { registerLiveStockScreens } from '@/components/live/stock/register';

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

it('keeps settings frosted and gives Customers an explicit ground from every origin', () => {
  const runtime = mount();
  for (const page of ['today', 'pnl', 'inventory', 'orders'] as const) {
    act(() => runtime.go(page));
    expect(document.querySelector('main')?.getAttribute('data-screen')).toBe(page);
    for (const form of ['dropState', 'customers']) {
      act(() => runtime.sheet(form));
      expect(document.querySelector('main')?.getAttribute('data-screen')).toBe(
        form === 'customers' ? 'customers' : 'form'
      );
      act(() => runtime.closeSheet());
      expect(document.querySelector('main')?.getAttribute('data-screen')).toBe(page);
    }
  }
  act(() => runtime.go('settings'));
  act(() => runtime.sheet('customers'));
  expect(document.querySelector('main')?.getAttribute('data-screen')).toBe('customers');
});

it('preserves real stock sheets and the count draft when using the new header Back', async () => {
  registerLiveStockScreens();
  const runtime = mount();
  await act(async () => {
    await runtime.loadStockCatalogue({
      rpc: async (name: string) => ({
        data:
          name === 'get_stock_catalogue'
            ? {
                suppliers: [],
                prices: [],
                items: [
                  {
                    id: 'flour',
                    name: 'Flour',
                    unit: 'g',
                    category: 'Ingredients',
                    on_hand: 1000,
                    par_level: 100,
                    pack_size: null,
                    pack_label: '',
                    supplier_id: null,
                    use_by_days: null,
                    last_counted: null,
                    active: true,
                    updated_at: '2026-10-01T00:00:00Z'
                  }
                ]
              }
            : [],
        error: null
      })
    } as never);
  });
  act(() => runtime.go('inventory'));
  fireEvent.click(screen.getByRole('button', { name: 'New item' }));
  expect(runtime.renderVals().liveStockItems?.editing?.isNew).toBe(true);
  expect(document.querySelector('[name="itemName"]')).toBeTruthy();
  // Settings forms are pages now: the header Back closes the form, as the sheet's Close did.
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(runtime.state.sheet).toBeNull();
  await act(async () => {
    runtime.renderVals().liveStock!.items[0]!.open();
  });
  expect(screen.getByRole('heading', { name: 'Flour', level: 1 })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Inventory', level: 1 })).toBeTruthy();
  act(() => runtime.renderVals().liveStock!.items[0]!.count());
  fireEvent.change(screen.getByLabelText('Counted quantity (g)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Flour', level: 1 })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue count' }));
  expect(screen.getByLabelText('Counted quantity (g)')).toHaveProperty('value', '0');
});

it('keeps existing quick actions reachable, selectable and dismissible', async () => {
  const runtime = mount();
  act(() => runtime.go('pnl'));
  fireEvent.click(screen.getByRole('button', { name: 'Quick add' }));
  expect(runtime.renderVals().quickOpen).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(runtime.renderVals().quickOpen).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Quick add' }));
  fireEvent.click(screen.getByRole('button', { name: /Record an expense/ }));
  expect(runtime.renderVals().quickOpen).toBe(false);
  await waitFor(() => expect(runtime.state.sheet).toMatchObject({ kind: 'expense' }));
  expect(runtime.renderVals().sheet?.title).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(runtime.state.sheet).toBeNull();
});

it('keeps an active production focus on its existing frame', () => {
  const runtime = mount();
  act(() =>
    runtime.setState({
      screen: 'batch',
      batch: {
        pid: PRODUCTS[0]!.id,
        target: 1,
        actual: 1,
        step: 1,
        note: '',
        adj: {},
        rejects: 0
      }
    })
  );
  expect(runtime.renderVals().showTopBar).toBe(false);
  expect(document.querySelector('[data-refined-frame]')).toBeNull();
});

it('shows the owner once in the sidebar and keeps a place for Sign out inside its card (19 November 2026)', () => {
  expect(railIdentity('Ethan · owner')).toEqual({ name: 'Ethan', role: 'Owner' });
  expect(railIdentity('Kristian · helper')).toEqual({ name: 'Kristian', role: 'Helper' });
  expect(railIdentity('Owner')).toEqual({ name: 'Owner', role: null });
  mount();
  const slot = document.getElementById(SIGN_OUT_RAIL_SLOT_ID);
  expect(slot).toBeTruthy();
  expect(slot?.closest('aside')).toBeTruthy();
});

it('keeps the Option A glass but no marble ground or colour change (Cine, 19 November 2026)', async () => {
  const { readFileSync } = await import('node:fs');
  const { PANEL_CLASS } = await import('@/components/ui/owner-kit');
  expect(PANEL_CLASS.split(' ')).toContain('hc-surface');
  mount();
  const root = document.querySelector('[data-glass]');
  expect(root?.getAttribute('data-glass')).toBe('on');
  expect(root?.querySelector('[data-marble]')).toBeNull();
  const globals = readFileSync('src/app/globals.css', 'utf8');
  for (const token of [
    '--color-owner-card:',
    '--color-owner-card-line:',
    '--shadow-owner-card:',
    '--blur-owner-card:'
  ])
    expect(globals).toContain(token);
  expect(globals).toMatch(/\[data-glass='on'\] \.hc-surface/);
  expect(globals).not.toContain('--color-marble');
  const workspace = readFileSync('src/components/live/owner-workspace.module.css', 'utf8');
  expect(workspace).not.toMatch(/marble/i);
  expect(workspace).toContain('@keyframes optionRise');
});
