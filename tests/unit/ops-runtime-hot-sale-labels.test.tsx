import { describe, expect, it, vi } from 'vitest';

const hot = vi.hoisted(() => ({ replacement: undefined as Record<string, unknown> | undefined }));
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/store/engine/ops-engine', async (original) => {
  const engine = await original<Record<string, unknown>>();
  // A retained base class still closes over its original P after the module export changes.
  return {
    ...engine,
    get P() {
      return hot.replacement ?? engine.P;
    }
  };
});
import { OpsRuntime } from '@/store/ops-runtime';

describe('a retained runtime during an engine hot update', () => {
  it('guards the catalogue belonging to its base renderer, not a newer module export', () => {
    hot.replacement = {};
    try {
      const runtime = new OpsRuntime({});
      const sale = {
        id: 'S1',
        at: 1793670000000,
        items: { 'retired-cookie': 2 },
        total: 260,
        pay: 'Cash'
      };
      runtime.state = { ...runtime.state, role: 'owner', sales: [sale] } as never;
      expect(runtime.renderVals().salesLog.rows[0]?.what).toBe('2 Product unavailable');
      expect(runtime.state.sales).toEqual([sale]);
      expect(hot.replacement).toEqual({});
    } finally {
      hot.replacement = undefined;
    }
  });
});
