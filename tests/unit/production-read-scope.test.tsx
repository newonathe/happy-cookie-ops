import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import type { ProductionClient } from '@/lib/data/production';
import { bindProductionOwner } from './production-runtime-helpers';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
afterEach(cleanup);
const reply = (balls: number) => ({
  data: { batches: [], shortfalls: [], dough: [{ product_id: 'dcf', balls, at: null }], baked: [] },
  error: null
});
async function mounted() {
  let r!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(value) => {
        if (value) r = value;
      }}
    />
  );
  const scope = await bindProductionOwner(r);
  return { r, scope };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof reply>) => void;
  const rpc = vi.fn(
    () =>
      new Promise<ReturnType<typeof reply>>((done) => {
        resolve = done;
      })
  );
  return {
    client: { rpc } as unknown as ProductionClient,
    rpc,
    answer: (balls: number) => resolve(reply(balls))
  };
}
it('clears balances and retires the client when the verified production identity changes', async () => {
  const { r, scope } = await mounted(),
    f = deferred(),
    observed = vi.fn();
  await act(async () => {
    await r.loadProduction({ rpc: async () => reply(7) } as unknown as ProductionClient);
  });
  expect(r.state.dough).toMatchObject({ dcf: 7 });
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = r.loadProduction(f.client, observed);
  });
  await act(async () => {
    await r.setProductionIdentity({ ...scope, userId: crypto.randomUUID() });
    f.answer(99);
    expect(await pending).toBe(false);
    expect(await r.loadProduction(null)).toBe(false);
  });
  expect(r.state.dough).toEqual({});
  expect(observed).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledTimes(1);
});
it('ignores an old client reply before notifying observers or replacing a newer balance', async () => {
  const { r } = await mounted(),
    old = deferred(),
    observed = vi.fn();
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = r.loadProduction(old.client, observed);
  });
  await act(async () => {
    await r.loadProduction({ rpc: async () => reply(4) } as unknown as ProductionClient);
    old.answer(99);
    expect(await pending).toBe(false);
  });
  expect(r.state.dough).toMatchObject({ dcf: 4 });
  expect(observed).not.toHaveBeenCalled();
});
it('rejects a result for a period that is no longer selected', async () => {
  const { r } = await mounted(),
    f = deferred(),
    observed = vi.fn();
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = r.loadProduction(f.client, observed);
  });
  await act(async () => {
    r.setState({ dropNo: Number(r.state.dropNo) + 1 });
  });
  await act(async () => {
    f.answer(99);
    expect(await pending).toBe(false);
  });
  expect(observed).not.toHaveBeenCalled();
  expect(r.state.dough).not.toMatchObject({ dcf: 99 });
});
