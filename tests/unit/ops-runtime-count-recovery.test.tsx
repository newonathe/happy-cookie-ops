import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
import { OpsRuntime } from '@/store/ops-runtime';
import { readCountRecovery } from '@/lib/stock/count-recovery';

const scope = process.env.NEXT_PUBLIC_SUPABASE_URL || 'unconfigured';
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function server() {
  let quantity = 1000,
    loseReply = true;
  let itemName = 'Flour',
    active = true,
    itemId = 'flour';
  const applied = new Set<string>();
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_stock_catalogue')
      return {
        error: null,
        data: {
          suppliers: [],
          prices: [],
          items: [
            {
              id: itemId,
              name: itemName,
              category: 'Ingredients',
              unit: 'g',
              on_hand: quantity,
              par_level: 100,
              pack_size: 1000,
              pack_label: '1 kg',
              supplier_id: null,
              use_by_days: null,
              last_counted: null,
              active,
              updated_at: '2026-10-01T00:00:00.000Z'
            }
          ]
        }
      };
    if (name === 'record_stock_movement') {
      const f = args!.p_movement as { id: string; qty: number; item_id: string };
      // The identity must already be durable before this simulated server sees it.
      expect(readCountRecovery(scope).value?.pending.some((p) => p.fields.id === f.id)).toBe(true);
      const duplicate = applied.has(f.id);
      if (!duplicate) {
        applied.add(f.id);
        quantity = f.qty;
      }
      if (loseReply) {
        loseReply = false;
        return { data: null, error: { code: '08006' } };
      }
      return { data: [{ item_id: f.item_id, on_hand: quantity, duplicate }], error: null };
    }
    if (name === 'get_last_paid') return { data: [], error: null };
    return { data: null, error: { code: 'PGRST202' }, status: 404 };
  });
  return {
    rpc,
    applied,
    rename: () => {
      itemName = 'Renamed flour';
    },
    deactivate: () => {
      active = false;
    },
    replace: () => {
      itemId = 'replacement-flour';
    }
  };
}
async function mount(s: ReturnType<typeof server>, role: 'owner' | 'helper' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  await act(async () => {
    await runtime.loadStockCatalogue({ rpc: s.rpc } as never);
  });
  return runtime;
}
const actions = (r: OpsRuntime) =>
  r as unknown as {
    startStocktake: () => void;
    countInput: (name: string, value: string) => void;
    reconcile: () => void;
  };
async function sendCount(r: OpsRuntime) {
  act(() => actions(r).startStocktake());
  act(() => actions(r).countInput('Flour', '0'));
  await act(async () => {
    actions(r).reconcile();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

it('keeps the exact count request before sending and after an applied-but-unanswered save', async () => {
  const s = server(),
    runtime = await mount(s);
  await sendCount(runtime);
  const saved = readCountRecovery(scope).value!;
  expect(saved.pending).toHaveLength(1);
  expect(saved.task?.counts.Flour).toBe('0');
  expect(saved.itemIds.Flour).toBe('flour');
  expect(s.applied.size).toBe(1);
});

it('does not send a count when its retry identity cannot be kept on the device', async () => {
  const s = server(),
    runtime = await mount(s);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await sendCount(runtime);
  expect(s.rpc.mock.calls.filter(([name]) => name === 'record_stock_movement')).toHaveLength(0);
  expect((runtime.state.stocktake as { counts: Record<string, string> }).counts.Flour).toBe('0');
});

it('an idle second owner runtime cannot erase another tab’s uncertain count', async () => {
  const s = server(),
    first = await mount(s),
    second = await mount(s);
  await sendCount(first);
  const original = readCountRecovery(scope).value!.pending[0]!.fields;
  act(() => second.setState({ now: Date.now() + 1000 }));
  expect(readCountRecovery(scope).value!.pending[0]!.fields).toEqual(original);
  act(() => actions(second).startStocktake());
  expect(second.state.stocktake).toBeNull();
  expect(s.applied.size).toBe(1);
});

it('does not retarget a physical count when an old name belongs to another inventory ID', async () => {
  const s = server(),
    runtime = await mount(s);
  act(() => actions(runtime).startStocktake());
  act(() => actions(runtime).countInput('Flour', '0'));
  s.replace();
  await act(async () => {
    await runtime.loadStockCatalogue({ rpc: s.rpc } as never);
  });
  await act(async () => {
    actions(runtime).reconcile();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(s.applied.size).toBe(0);
  expect((runtime.state.stocktake as { counts: Record<string, string> }).counts.Flour).toBe('0');
});
