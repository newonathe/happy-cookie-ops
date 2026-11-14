import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

const mode = vi.hoisted(() => ({ live: true }));
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => mode.live }));
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
import { bindProductionOwner } from './production-runtime-helpers';

/**
 * HCB-038: an unsaved recipe edit across a reload. It is kept in this browser under the verified owner and business
 * (OD-12 placeholder copy), and offered back after the reload: never applied silently, never applied over a recipe that
 * was saved elsewhere since.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const LATER = '2026-10-02T05:00:00.000000+00:00';
const OWNER = { userId: '11111111-1111-4111-8111-111111111111', business: 'https://kept.test' };
const OTHER = { userId: '22222222-2222-4222-8222-222222222222', business: 'https://kept.test' };
const ELSEWHERE = { ...OWNER, business: 'https://kept-two.test' };
const KEY = (s: { userId: string; business: string }) =>
  'hc-recipe-edits-v1:' + encodeURIComponent(s.business) + ':' + s.userId;
const wire = (updated_at = STAMP, qty = 320) => ({
  product_id: 'dcf',
  yield: 12,
  version: 3,
  updated_at,
  lines: [
    { name: 'Unsalted butter', qty, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ],
  history: []
});
function makeClient(stamp = STAMP) {
  let rows = [wire(stamp)];
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_recipes') return { data: rows, error: null };
    if (name === 'save_recipe') {
      rows = [wire(LATER, 999)];
      return { data: [{ version: 4, updated_at: LATER }], error: null };
    }
    return { data: null, error: null };
  });
  return { rpc } as never;
}
interface Actions {
  recipeEdit: (pid: string, i: number, field: string, v: string) => void;
  recipeSave: (pid: string) => void;
}
type S = {
  recipes: Record<string, { ing: Array<[string, unknown, string]> }>;
  recipeDirty: Record<string, boolean>;
  liveRecipeTarget?: string | null;
  recipeOpen?: string;
};
const st = (r: OpsRuntime) => r.state as unknown as S;
const act$ = (r: OpsRuntime) => r as unknown as Actions;
const kept = (r: OpsRuntime) => {
  if (r.state.screen !== 'recipes') act(() => r.go('recipes'));
  return r.renderVals().liveRecipes!.keptEdit!('dcf');
};
const keptKeys = () =>
  Object.keys(window.localStorage).filter((k) => k.startsWith('hc-recipe-edits'));
const stored = (scope = OWNER) => window.localStorage.getItem(KEY(scope));

async function mount(
  options: {
    scope?: { userId: string; business: string } | null;
    client?: ReturnType<typeof makeClient>;
  } = {}
) {
  const scope = options.scope === undefined ? OWNER : options.scope;
  const ref: { current: OpsRuntime | null } = { current: null };
  const view = render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  if (scope) await bindProductionOwner(runtime, scope);
  await act(async () => {
    await runtime.loadRecipes(
      options.client ?? makeClient(),
      undefined,
      undefined,
      scope ?? undefined
    );
  });
  return { runtime, view };
}
async function typeAndReload(scope = OWNER) {
  const first = await mount({ scope });
  const product =
    first.runtime.renderVals().productRows[PRODUCTS.findIndex((p) => p.id === 'dcf')]!;
  act(() => product.goRecipe());
  expect(st(first.runtime).liveRecipeTarget).toBe('dcf');
  act(() => act$(first.runtime).recipeEdit('dcf', 0, 'qty', '999'));
  expect(st(first.runtime).recipes.dcf!.ing[0]![1]).toBe(999);
  expect(st(first.runtime).recipeDirty.dcf).toBe(true);
  first.view.unmount();
}

describe('HCB-038: an unsaved recipe edit across a reload', () => {
  afterEach(() => {
    cleanup();
    store.clear();
    window.localStorage.clear();
    mode.live = true;
  });
  it('is kept for the verified owner and business, and offered back, never applied silently', async () => {
    await typeAndReload();
    const kept$ = JSON.parse(stored()!) as { edits: Array<Record<string, unknown>> };
    expect(kept$.edits).toHaveLength(1);
    expect(kept$.edits[0]).toMatchObject({ productId: 'dcf', stamp: STAMP });
    expect(JSON.stringify(kept$.edits[0]!.value)).toContain('999');

    const second = await mount();
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(320);
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
    expect(st(second.runtime).liveRecipeTarget ?? null).toBeNull();
    const offer = kept(second.runtime);
    expect(offer?.kind).toBe('offer');
    expect(stored()).not.toBeNull();
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
  });
  it('Restore changes applies it as a dirty edit, exactly as if typed', async () => {
    await typeAndReload();
    const second = await mount();
    const offer = kept(second.runtime)!;
    act(() => offer.restore());
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(999);
    expect(st(second.runtime).recipeDirty.dcf).toBe(true);
    expect(kept(second.runtime)).toBeNull();
    // Still kept until it is saved or discarded.
    expect(JSON.parse(stored()!).edits).toHaveLength(1);
  });
  it('Discard removes it from storage and from the offer', async () => {
    await typeAndReload();
    const second = await mount();
    const offer = kept(second.runtime)!;
    act(() => offer.discard());
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(320);
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
    expect(kept(second.runtime)).toBeNull();
    expect(stored()).toBeNull();
    second.view.unmount();
    const third = await mount();
    expect(kept(third.runtime)).toBeNull();
  });
  it('never applies it over a newer saved recipe: says so once, and clears it', async () => {
    await typeAndReload();
    const second = await mount({ client: makeClient(LATER) });
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(320);
    const notice = kept(second.runtime);
    expect(notice?.kind).toBe('newer');
    expect(stored()).toBeNull();
    act(() => notice!.dismiss());
    expect(kept(second.runtime)).toBeNull();
    expect(stored()).toBeNull();
  });
  it('another owner or business never reads or shows it', async () => {
    await typeAndReload();
    for (const scope of [OTHER, ELSEWHERE]) {
      const other = await mount({ scope });
      expect(kept(other.runtime)).toBeNull();
      expect(st(other.runtime).recipeDirty.dcf).toBeFalsy();
      other.view.unmount();
    }
    expect(JSON.parse(stored(OWNER)!).edits).toHaveLength(1);
    expect(stored(OTHER)).toBeNull();
    expect(stored(ELSEWHERE)).toBeNull();
  });
  it('is never kept for a helper, or without a verified identity', async () => {
    const helper = await mount();
    act(() => helper.runtime.setRole('helper'));
    act(() => act$(helper.runtime).recipeEdit('dcf', 0, 'qty', '999'));
    expect(st(helper.runtime).recipeDirty.dcf).toBe(true);
    expect(keptKeys()).toEqual([]);
    helper.view.unmount();
    const bare = await mount({ scope: null });
    act(() => act$(bare.runtime).recipeEdit('dcf', 0, 'qty', '999'));
    expect(st(bare.runtime).recipeDirty.dcf).toBe(true);
    expect(keptKeys()).toEqual([]);
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain('999');
  });
  it('is never kept in the demo build', async () => {
    mode.live = false;
    const demo = await mount({ scope: null });
    act(() => act$(demo.runtime).recipeEdit('dcf', 0, 'qty', '999'));
    expect(keptKeys()).toEqual([]);
  });
  it('a restored edit, once saved, sends the stamp it was edited from', async () => {
    await typeAndReload();
    const client = makeClient();
    const second = await mount({ client });
    const offer = kept(second.runtime)!;
    act(() => offer.restore());
    await act(async () => {
      act$(second.runtime).recipeSave('dcf');
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const sent = (
      client as unknown as { rpc: { mock: { calls: Array<[string, unknown]> } } }
    ).rpc.mock.calls.filter(([name]) => name === 'save_recipe');
    expect(sent).toHaveLength(1);
    expect((sent[0]![1] as { p_expected_updated_at: string }).p_expected_updated_at).toBe(STAMP);
  });
  it('a recipe saved between the offer and Restore is not overwritten: the notice, and storage cleared', async () => {
    await typeAndReload();
    const second = await mount();
    const offer = kept(second.runtime)!;
    expect(offer.kind).toBe('offer');
    await act(async () => {
      await second.runtime.loadRecipes(makeClient(LATER), undefined, undefined, OWNER);
    });
    act(() => offer.restore());
    expect(st(second.runtime).recipeDirty.dcf).toBeFalsy();
    expect(st(second.runtime).recipes.dcf!.ing[0]![1]).toBe(320);
    expect(kept(second.runtime)?.kind).toBe('newer');
    expect(stored()).toBeNull();
  });
  it('is removed once the save is acknowledged', async () => {
    const first = await mount();
    act(() => first.runtime.go('recipes'));
    act(() => act$(first.runtime).recipeEdit('dcf', 0, 'qty', '999'));
    expect(stored()).not.toBeNull();
    await act(async () => {
      act$(first.runtime).recipeSave('dcf');
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(st(first.runtime).recipeDirty.dcf).toBeFalsy();
    expect(stored()).toBeNull();
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
