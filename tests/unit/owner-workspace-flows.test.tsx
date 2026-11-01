import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
import { OpsRuntime } from '@/store/ops-runtime';
import { PRODUCTS } from '@/store/engine/ops-engine';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { OwnerWorkspace } from '@/components/live/owner-workspace';
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
  fireEvent.click(screen.getByRole('button', { name: 'Add to inventory' }));
  expect(runtime.renderVals().liveStockItems?.editing?.isNew).toBe(true);
  expect(document.querySelector('[name="itemName"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
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
