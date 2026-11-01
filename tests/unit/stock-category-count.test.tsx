import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { InventoryLive } from '@/components/live/stock/inventory-live';
import { readCountRecovery } from '@/lib/stock/count-recovery';

const scope = process.env.NEXT_PUBLIC_SUPABASE_URL || 'unconfigured';
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

async function mount(packaging = true) {
  const row = (id: string, name: string, category: string, active = true) => ({
    id,
    name,
    category,
    active,
    unit: category === 'Packaging' ? 'pcs' : 'g',
    on_hand: 1000,
    par_level: 100,
    pack_size: null,
    pack_label: '',
    supplier_id: null,
    use_by_days: null,
    last_counted: null,
    updated_at: '2026-10-01T00:00:00.000Z'
  });
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_stock_catalogue')
      return {
        data: {
          suppliers: [],
          prices: [],
          items: [
            row('flour', 'Flour', 'Ingredients'),
            row('butter', 'Butter', 'Ingredients'),
            ...(packaging ? [row('pouch', 'Cookie pouch', 'Packaging')] : []),
            row('retired', 'Retired flour', 'Ingredients', false)
          ]
        },
        error: null
      };
    if (name === 'get_last_paid') return { data: [], error: null };
    return {
      data: null,
      error: { code: name === 'record_stock_movement' ? '08006' : 'PGRST202' },
      status: 404
    };
  });
  function Frame() {
    return <InventoryLive v={useOpsVals()} />;
  }
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadStockCatalogue({ rpc } as never);
  });
  act(() => runtime.go('inventory'));
  const writes = () => rpc.mock.calls.filter(([name]) => name === 'record_stock_movement');
  return { runtime, writes };
}
const task = (runtime: OpsRuntime) =>
  runtime.state.stocktake as {
    items: string[];
    counts: Record<string, string>;
    i: number;
  } | null;

it('starts only active items in the selected category with blank measured quantities', async () => {
  const { runtime, writes } = await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Packaging' }));
  fireEvent.click(screen.getByRole('button', { name: 'Count stock' }));
  expect(task(runtime)?.items).toEqual(['Cookie pouch']);
  expect(screen.getByLabelText('Counted quantity (pcs)')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Counted quantity (pcs)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));
  expect(screen.getByRole('button', { name: 'Packaging' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.queryByRole('button', { name: 'Count stock' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue count' }));
  expect(screen.getByLabelText('Counted quantity (pcs)')).toHaveValue('0');
  expect(writes()).toHaveLength(0);
});

it('a stale category action resumes the existing task without replacing measured values or item identities', async () => {
  const { runtime, writes } = await mount();
  const start = runtime.renderVals().liveStock!.startCount!;
  fireEvent.click(screen.getByRole('button', { name: 'Count stock' }));
  expect(task(runtime)?.items).toEqual(['Flour', 'Butter']);
  fireEvent.change(screen.getByLabelText('Counted quantity (g)'), { target: { value: '250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Back to inventory' }));
  act(() => start('Packaging'));
  expect(task(runtime)?.items).toEqual(['Flour', 'Butter']);
  expect(screen.getByLabelText('Counted quantity (g)')).toHaveValue('250');
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  expect(screen.getByText('250 g', { exact: true })).toBeTruthy();
  expect(screen.queryByText('Cookie pouch', { exact: true })).toBeNull();
  expect(writes()).toHaveLength(0);
});

it('cannot replace an unconfirmed save or post another movement when a category action is called again', async () => {
  const { runtime, writes } = await mount();
  const start = runtime.renderVals().liveStock!.startCount!;
  fireEvent.click(screen.getByRole('button', { name: 'Count stock' }));
  fireEvent.change(screen.getByLabelText('Counted quantity (g)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review count' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save count' }));
  await waitFor(() => expect(runtime.renderVals().liveStock?.count?.pending).toBe(true));
  const pending = readCountRecovery(scope).value!.pending;
  expect(pending[0]?.fields.itemId).toBe('flour');
  act(() => start('Packaging'));
  expect(readCountRecovery(scope).value!.pending).toEqual(pending);
  expect(task(runtime)?.counts.Flour).toBe('0');
  expect(task(runtime)?.items).toEqual(['Flour', 'Butter']);
  expect(writes()).toHaveLength(1);
});

it('does not start an empty category or accept an owner callback after role loss', async () => {
  const { runtime, writes } = await mount(false);
  const start = runtime.renderVals().liveStock!.startCount!;
  fireEvent.click(screen.getByRole('button', { name: 'Packaging' }));
  expect(screen.getByRole('button', { name: 'Count stock' })).toBeDisabled();
  expect(screen.getByText('Add an item to packaging before counting.')).toBeTruthy();
  act(() => start('Packaging'));
  expect(task(runtime)).toBeNull();
  act(() => runtime.setRole('helper'));
  act(() => start('Ingredients'));
  expect(task(runtime)).toBeNull();
  expect(writes()).toHaveLength(0);
});

it('allows measuring cached inventory offline without sending a movement', async () => {
  const { runtime, writes } = await mount();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => runtime.setState({ online: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Count stock' }));
  fireEvent.change(screen.getByLabelText('Counted quantity (g)'), { target: { value: '120' } });
  expect(task(runtime)?.counts.Flour).toBe('120');
  expect(writes()).toHaveLength(0);
});

it('requires exclusive count ownership when another owner tab is open', async () => {
  await mount();
  const { runtime, writes } = await mount();
  act(() => runtime.renderVals().liveStock!.startCount!('Ingredients'));
  await waitFor(() => expect(runtime.state.toast).toBeTruthy());
  expect(task(runtime)).toBeNull();
  expect(writes()).toHaveLength(0);
});
