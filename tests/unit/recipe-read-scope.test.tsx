import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';
import type { RecipeClient } from '@/lib/data/recipes';
import { bindProductionOwner } from './production-runtime-helpers';
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
afterEach(cleanup);
const A = { userId: '11111111-1111-4111-8111-111111111111', business: 'https://recipes-one.test' };
const B = { ...A, business: 'https://recipes-two.test' };
const STAMP = '2026-11-03T00:00:00Z';
const row = (qty: number, updated_at = STAMP) => ({
  product_id: 'dcf',
  yield: 12,
  version: 3,
  updated_at,
  lines: [{ name: 'Flour', qty, unit: 'g', kind: 'ingredient' }],
  history: []
});
const state = (r: OpsRuntime) =>
  r.state as unknown as {
    recipes: Record<string, { yield: number; ing: Array<[string, number, string]> }>;
    recipeDirty: Record<string, boolean>;
  };
const actions = (r: OpsRuntime) =>
  r as unknown as {
    recipeEdit: (id: string, line: number, field: string, value: string) => void;
    recipeSave: (id: string) => void;
  };
async function mount() {
  let r!: OpsRuntime;
  render(
    <OpsRuntime
      ref={(value) => {
        if (value) r = value;
      }}
    />
  );
  act(() => r.setRole('owner'));
  await bindProductionOwner(r, A);
  return r;
}
function client(qty: number, stamp = STAMP) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'get_recipes' ? [row(qty, stamp)] : null,
    error: name === 'save_recipe' ? { code: '40001' } : null
  }));
  return { rpc, client: { rpc } as unknown as RecipeClient };
}
it('retires cached recipe editor actions before another identity opens the same product', async () => {
  const r = await mount(),
    one = client(300),
    two = client(900);
  await act(async () => {
    await r.loadRecipes(one.client, undefined, undefined, A);
  });
  act(() => r.setState({ screen: 'recipes', recipeOpen: 'dcf' } as never));
  const old = r.renderVals().recipe;
  await act(async () => {
    await r.setProductionIdentity(B);
    await r.loadRecipes(two.client, undefined, undefined, B);
  });
  act(() => actions(r).recipeEdit('dcf', 0, 'qty', '920'));
  const before = JSON.stringify(state(r).recipes.dcf);
  two.rpc.mockClear();
  await act(async () => {
    old.save();
    await Promise.resolve();
  });
  expect(two.rpc.mock.calls.filter(([name]) => name === 'save_recipe')).toHaveLength(0);
  for (const change of [
    old.addRow,
    old.yieldUp,
    old.yieldDown,
    () => old.rows[0]!.setName({ target: { value: 'Old flour' } } as never),
    () => old.rows[0]!.setQty({ target: { value: '750' } } as never),
    () => old.rows[0]!.setUnit({ target: { value: 'kg' } } as never),
    () => old.rows[0]!.setKind?.('packaging'),
    old.rows[0]!.remove
  ]) {
    act(change);
    expect(JSON.stringify(state(r).recipes.dcf)).toBe(before);
  }
  act(() => r.renderVals().recipe.rows[0]!.setQty({ target: { value: '950' } } as never));
  expect(state(r).recipes.dcf.ing[0][1]).toBe(950);
});
it('does not revive editor controls after leaving and reopening the same product', async () => {
  const r = await mount(),
    one = client(300);
  await act(async () => {
    await r.loadRecipes(one.client, undefined, undefined, A);
  });
  act(() => r.setState({ screen: 'recipes', recipeOpen: 'dcf' } as never));
  const old = r.renderVals().recipe;
  act(() => r.go('products'));
  act(() => r.go('recipes'));
  act(() => actions(r).recipeEdit('dcf', 0, 'qty', '320'));
  const before = JSON.stringify(state(r).recipes.dcf);
  one.rpc.mockClear();
  await act(async () => {
    old.save();
    await Promise.resolve();
  });
  act(old.addRow);
  expect(one.rpc.mock.calls.filter(([name]) => name === 'save_recipe')).toHaveLength(0);
  expect(JSON.stringify(state(r).recipes.dcf)).toBe(before);
  act(r.renderVals().recipe.addRow);
  expect(state(r).recipes.dcf.ing).toHaveLength(2);
});
it('rejects an old identity read and retires its client before a cached retry', async () => {
  const r = await mount();
  let answer!: (value: { data: ReturnType<typeof row>[]; error: null }) => void;
  const rpc = vi.fn(
    () =>
      new Promise<{ data: ReturnType<typeof row>[]; error: null }>((resolve) => {
        answer = resolve;
      })
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = r.loadRecipes({ rpc } as unknown as RecipeClient, undefined, undefined, A);
  });
  await act(async () => {
    await r.setProductionIdentity(B);
    answer({ data: [row(999)], error: null });
    expect(await pending).toBe(false);
    expect(await r.loadRecipes(null)).toBe(false);
  });
  expect(state(r).recipes.dcf?.ing).toEqual([]);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('restores only the returning identity edit and its original concurrency stamp after a fresh read', async () => {
  const r = await mount(),
    one = client(300),
    two = client(900);
  await act(async () => {
    await r.loadRecipes(one.client, undefined, undefined, A);
  });
  act(() => actions(r).recipeEdit('dcf', 0, 'qty', '380'));
  await act(async () => {
    await r.setProductionIdentity(B);
    await r.loadRecipes(two.client, undefined, undefined, B);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(900);
  await act(async () => {
    await r.setProductionIdentity(A);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(380);
  act(() => actions(r).recipeSave('dcf'));
  expect(one.rpc.mock.calls.filter(([name]) => name === 'save_recipe')).toHaveLength(0);
  const fresh = client(777, '2026-11-04T00:00:00Z');
  await act(async () => {
    await r.loadRecipes(fresh.client, undefined, undefined, A);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(380);
  expect(state(r).recipeDirty.dcf).toBe(true);
  await act(async () => {
    actions(r).recipeSave('dcf');
    await Promise.resolve();
  });
  expect(fresh.rpc).toHaveBeenCalledWith(
    'save_recipe',
    expect.objectContaining({ p_expected_updated_at: STAMP })
  );
});
it('does not adopt an uncommitted A projection during a same-tick A to B to A switch', async () => {
  const r = await mount(),
    one = client(300);
  await act(async () => {
    await r.loadRecipes(one.client, undefined, undefined, A);
  });
  act(() => actions(r).recipeEdit('dcf', 0, 'qty', '380'));
  await act(async () => {
    const b = r.setProductionIdentity(B),
      a = r.setProductionIdentity(A);
    await Promise.all([b, a]);
  });
  await act(async () => {
    await r.loadRecipes(one.client, undefined, undefined, A);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(380);
  await act(async () => {
    await r.setProductionIdentity(B);
    await r.loadRecipes(client(900).client, undefined, undefined, B);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(900);
  expect(state(r).recipeDirty.dcf).not.toBe(true);
});

it('retires cached draft-library actions across owner role loss and restoration', async () => {
  const r = await mount();
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === 'get_recipes'
        ? [row(300)]
        : name === 'get_recipe_drafts'
          ? [{ product_id: 'dcf', yield: 12, source_text: 'Owner draft', updated_at: STAMP }]
          : null,
    error: null
  }));
  await act(async () => {
    await r.loadRecipes({ rpc } as unknown as RecipeClient, undefined, undefined, A);
  });
  act(() => r.go('more'));
  const entry = r
    .renderVals()
    .toolGroups.flatMap((group) => group.items)
    .find((item) => item.label === 'Recipe drafts')!;
  await act(async () => {
    entry.go();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const old = r.renderVals().liveRecipeDrafts!;
  expect(old.loaded).toBe(true);
  act(() => old.open('dcf'));
  expect(r.renderVals().liveRecipeDrafts?.editing?.sourceText).toBe('Owner draft');
  act(() => r.setRole('helper'));
  act(() => r.setRole('owner'));
  act(() => r.setState({ sheet: { kind: 'stockitems' } } as never));
  act(() => {
    old.open('dcf');
    old.save({ productId: 'dcf', yield: 12, sourceText: 'stale', expectedUpdatedAt: STAMP });
    old.back();
    old.close();
  });
  expect(r.renderVals().liveRecipeDrafts).toBeNull();
  expect(r.state.sheet).toMatchObject({ kind: 'stockitems' });
  expect(rpc.mock.calls.filter(([name]) => name === 'save_recipe_draft')).toHaveLength(0);
});

it('rejects stale explicit clients and captured identities before installing them', async () => {
  const r = await mount(),
    old = client(300),
    current = client(900),
    unseen = client(777);
  await act(async () => {
    await r.loadRecipes(old.client, undefined, undefined, A);
  });
  await act(async () => {
    await r.setProductionIdentity(B);
    await r.loadRecipes(current.client, undefined, undefined, B);
  });
  await act(async () => {
    expect(await r.loadRecipes(old.client, undefined, undefined, A)).toBe(false);
    expect(await r.loadRecipes(old.client)).toBe(false);
    expect(await r.loadRecipes(unseen.client)).toBe(false);
    expect(await r.loadRecipes(current.client, undefined, undefined, A)).toBe(false);
  });
  expect(state(r).recipes.dcf.ing[0][1]).toBe(900);
  expect(old.rpc.mock.calls.filter(([name]) => name === 'get_recipes')).toHaveLength(1);
  expect(current.rpc.mock.calls.filter(([name]) => name === 'get_recipes')).toHaveLength(1);
  expect(unseen.rpc).not.toHaveBeenCalled();
});
