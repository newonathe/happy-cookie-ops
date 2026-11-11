import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
const original = { products: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
afterEach(() => replaceFlavours(original.products, original.allergens));

describe('live restored sales with missing catalogue products', () => {
  it('renders every owner destination without losing a sale or changing its amount', () => {
    const runtime = new OpsRuntime({});
    const sale = {
      id: 'S1',
      at: 1793670000000,
      items: { 'retired-cookie': 2 },
      total: 260,
      pay: 'Cash'
    };
    runtime.state = { ...runtime.state, role: 'owner', sales: [sale] } as never;
    const before = JSON.stringify(runtime.state.sales);
    for (const screen of ['today', 'sales', 'orders', 'bake', 'inventory', 'pnl', 'bazaar']) {
      runtime.state = { ...runtime.state, screen } as never;
      const vals = runtime.renderVals();
      expect(vals.salesLog.rows[0]?.what).toBe('2 Product unavailable');
      expect(vals.salesLog.rows[0]?.amount).toBe('₱260');
      expect(JSON.stringify(runtime.state.sales)).toBe(before);
      expect(PRODUCTS.some((p) => p.id === 'retired-cookie')).toBe(false);
    }
  });
});
