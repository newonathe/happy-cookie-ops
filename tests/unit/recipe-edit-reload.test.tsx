import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { PRODUCTS } from '@/store/engine/ops-engine';
import { flavoursRead } from '@/lib/data/flavours-read-state';

/**
 * HCB-038: does reloading the recipe editor discard an unsaved recipe edit?
 * A recipe edit lives only in the runtime's memory (and its per-identity memory map). Nothing is written to
 * localStorage or the offline store, so a reload loses it. These tests pin that finding: if a draft-persistence
 * feature is ever built, this file is the one to change.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const saved = {
  product_id: 'dcf',
  yield: 12,
  version: 3,
  updated_at: STAMP,
  lines: [
    { name: 'Unsalted butter', qty: 320, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ],
  history: []
};
const client = {
  rpc: vi.fn(async (name: string) => ({
    data: name === 'get_recipes' ? [saved] : null,
    error: null
  }))
};
interface Actions {
  recipeEdit: (pid: string, i: number, field: string, v: string) => void;
}
type S = {
  recipes: Record<string, { ing: Array<[string, unknown, string]> }>;
  recipeDirty: Record<string, boolean>;
  liveRecipeTarget?: string | null;
  recipeOpen?: string;
};
const st = (r: OpsRuntime) => r.state as unknown as S;

async function mount() {
  const ref: { current: OpsRuntime | null } = { current: null };
  const view = render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  await act(async () => {
    await runtime.loadRecipes(client as never);
  });
  return { runtime, view };
}

describe('HCB-038: an unsaved recipe edit across a reload', () => {
  afterEach(() => {
    cleanup();
    store.clear();
    window.localStorage.clear();
  });
  it('is lost: the reloaded kitchen shows the saved recipe, clean, with nothing kept in the browser', async () => {
    const first = await mount();
    const product =
      first.runtime.renderVals().productRows[PRODUCTS.findIndex((p) => p.id === 'dcf')]!;
    act(() => product.goRecipe());
    expect(st(first.runtime).liveRecipeTarget).toBe('dcf');
    act(() => (first.runtime as unknown as Actions).recipeEdit('dcf', 0, 'qty', '999'));
    expect(st(first.runtime).recipes.dcf!.ing[0]![1]).toBe(999);
    expect(st(first.runtime).recipeDirty.dcf).toBe(true);
    // Nothing is persisted for the edit.
    const kept = JSON.stringify([Object.entries(window.localStorage), [...store.values()]]);
    expect(kept).not.toContain('999');

    // Reload: unmount, then a fresh runtime over the same localStorage and offline store.
    first.view.unmount();
    const second = await mount();
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(320);
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
    expect(st(second.runtime).liveRecipeTarget ?? null).toBeNull();
  });
});

describe('HCB-013: the runtime opens the recipe an address names', () => {
  afterEach(() => {
    cleanup();
    flavoursRead.reset();
    store.clear();
    window.localStorage.clear();
  });
  const nav = (r: OpsRuntime) => r.renderVals().liveRecipeNavigation!;
  const book = (r: OpsRuntime) => r.renderVals().liveRecipes;

  it('opens the recipe page of a held flavour, and names it in the route', async () => {
    const { runtime } = await mount();
    act(() => runtime.go('recipes'));
    expect(nav(runtime).route).toBeUndefined();
    let shown: string | undefined;
    act(() => void (shown = nav(runtime).restore('recipe=dcf')));
    expect(shown).toBe('recipe=dcf');
    expect(st(runtime).liveRecipeTarget).toBe('dcf');
    expect(book(runtime)?.recipePage?.id).toBe('dcf');
    expect(nav(runtime).route).toBe('recipe=dcf');
    expect(book(runtime)?.editor?.restore).toBeNull();
  });
  it('an unknown id opens nothing: the Recipe book', async () => {
    const { runtime } = await mount();
    act(() => runtime.go('recipes'));
    let shown: string | undefined = 'x';
    act(() => void (shown = nav(runtime).restore('recipe=nope')));
    expect(shown).toBeUndefined();
    expect(st(runtime).liveRecipeTarget ?? null).toBeNull();
    expect(book(runtime)?.recipePage).toBeUndefined();
    expect(nav(runtime).route).toBeUndefined();
  });
  it('asks for the editor too, until the editor reports it is open', async () => {
    const { runtime } = await mount();
    act(() => runtime.go('recipes'));
    act(() => void nav(runtime).restore('recipe=dcf&edit=1'));
    expect(st(runtime).recipeOpen).toBe('dcf');
    expect(book(runtime)?.editor?.restore).toBe('dcf');
    expect(nav(runtime).route).toBe('recipe=dcf&edit=1');
    act(() => book(runtime)!.editor!.report('dcf'));
    expect(book(runtime)?.editor?.restore).toBeNull();
    expect(nav(runtime).route).toBe('recipe=dcf&edit=1');
    act(() => book(runtime)!.editor!.report(null));
    expect(nav(runtime).route).toBe('recipe=dcf');
  });
  it('waits for the catalogue while it is being read, then opens the flavour', async () => {
    const { runtime } = await mount();
    act(() => runtime.go('recipes'));
    flavoursRead.expect();
    let shown: string | undefined;
    act(() => void (shown = nav(runtime).restore('recipe=dcf')));
    expect(shown).toBe('recipe=dcf');
    expect(st(runtime).liveRecipeTarget ?? null).toBeNull();
    flavoursRead.reset();
    act(() => runtime.setState({}));
    expect(st(runtime).liveRecipeTarget).toBe('dcf');
  });
  it('is the owner’s alone, and only on the Recipes screen', async () => {
    const { runtime } = await mount();
    expect(nav(runtime).route).toBeUndefined();
    act(() => runtime.go('recipes'));
    act(() => void nav(runtime).restore('recipe=dcf'));
    act(() => runtime.go('products'));
    expect(nav(runtime).route).toBeUndefined();
    act(() => runtime.setRole('helper'));
    expect(runtime.renderVals().liveRecipeNavigation ?? null).toBeNull();
  });
});
