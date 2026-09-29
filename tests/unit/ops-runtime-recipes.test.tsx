import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

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
import type { Role } from '@/store/engine/ops-engine';

/**
 * A4: the owner's recipes. They come from the database into the recipes screen's own state (never the prototype's six), and
 * the ported Save makes the version on the database and then shows what it holds. Each `Mutation:` line names a change one of
 * these tests must catch (each was applied and seen to fail).
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const LATER = '2026-09-30T03:00:00.000000+00:00';

type Wire = Record<string, unknown>;
const dcf = (over: Wire = {}): Wire => ({
  product_id: 'dcf',
  yield: 12,
  version: 3,
  updated_at: STAMP,
  lines: [
    { name: 'Unsalted butter', qty: 320, unit: 'g' },
    { name: 'Eggs', qty: 2, unit: 'pcs' }
  ],
  history: [
    { version: 1, yield: 24, lines: [{ name: 'Unsalted butter', qty: 300, unit: 'g' }] },
    { version: 2, yield: 20, lines: [{ name: 'Unsalted butter', qty: 310, unit: 'g' }] }
  ],
  ...over
});

interface Fake {
  rows: Wire[];
  save: { data: unknown; error: unknown };
  /** What the database holds after a save. */
  after?: (rows: Wire[]) => Wire[];
}
function fakeClient(state: Fake) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_recipes') return { data: state.rows, error: null };
    if (name === 'save_recipe') {
      const result = state.save;
      if (!(result as { error: unknown }).error && state.after)
        state.rows = state.after(state.rows);
      return result;
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toast ?? r.state.toasts ?? '');
const fresh = (over: Partial<Fake> = {}): Fake => ({
  rows: [dcf()],
  save: { data: [{ product_id: 'dcf', version: 4, updated_at: LATER }], error: null },
  ...over
});

interface RecipeActions {
  recipeEdit: (pid: string, i: number, field: string, v: string) => void;
  recipeAdd: (pid: string) => void;
  recipeYield: (pid: string, d: number) => void;
  recipeSave: (pid: string) => void;
  openRecipe: (pid: string) => void;
}
const act$ = (r: OpsRuntime) => r as unknown as RecipeActions;
type S = {
  recipes: Record<string, { yield: number; ing: Array<[string, unknown, string]> }>;
  recipeVer: Record<string, number>;
  recipeDirty: Record<string, boolean>;
  recipeHistory: Record<string, Array<{ version: number }>>;
};
const st = (r: OpsRuntime) => r.state as unknown as S;

async function mounted(role: Role, state: Fake) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const f = fakeClient(state);
  await act(async () => {
    await runtime.loadRecipes(f.client as never);
  });
  f.rpc.mockClear();
  return { runtime, ...f };
}

describe('A4: the recipes reach the ported recipes screen (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('before they are read, no flavour has a prototype recipe', () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const s = st(ref.current!);
    for (const pid of ['wcb', 'hc', 'dcf', 'pbm', 'rvc', 'nch']) {
      expect(s.recipes[pid]).toEqual({ yield: 1, ing: [] });
      expect(s.recipeVer[pid]).toBe(1);
      expect(s.recipeHistory[pid]).toEqual([]);
    }
    // Mutation: leaving the prototype's six recipes in live state shows demo ingredients and a demo cost per cookie.
  });

  it('a saved recipe fills its flavour: yield, lines, version and the versions it replaced; the others stay empty', async () => {
    const { runtime } = await mounted('owner', fresh());
    const s = st(runtime);
    expect(s.recipes.dcf).toEqual({
      yield: 12,
      ing: [
        ['Unsalted butter', 320, 'g'],
        ['Eggs', 2, 'pcs']
      ]
    });
    expect(s.recipeVer.dcf).toBe(3);
    expect(s.recipeHistory.dcf.map((h) => h.version)).toEqual([1, 2]);
    expect(s.recipes.wcb).toEqual({ yield: 1, ing: [] });
    act(() => act$(runtime).openRecipe('dcf'));
    const vals = runtime.renderVals() as unknown as {
      recipe: {
        version: string;
        yieldText: string;
        hasHistory: boolean;
        rows: Array<{ name: string; qty: number }>;
      };
    };
    expect(vals.recipe).toMatchObject({
      version: 'Version 3',
      yieldText: '12 cookies',
      hasHistory: true
    });
    expect(vals.recipe.rows.map((r) => [r.name, r.qty])).toEqual([
      ['Unsalted butter', 320],
      ['Eggs', 2]
    ]);
  });

  it('a failed read leaves what was there; demo mode reads nothing and keeps the prototype’s recipes', async () => {
    const { runtime } = await mounted('owner', fresh());
    const down = { rpc: vi.fn(async () => ({ data: null, error: { code: '57014' } })) };
    expect(await runtime.loadRecipes(down as never)).toBe(false);
    expect(st(runtime).recipes.dcf.yield).toBe(12);
    cleanup();
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const f = fakeClient(fresh());
    expect(await ref.current!.loadRecipes(f.client as never)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(st(ref.current!).recipes.wcb.ing.length).toBeGreaterThan(3);
  });

  it('a reset of the live books puts the owner’s recipes back, not the prototype’s', async () => {
    const { runtime } = await mounted('owner', fresh());
    act(() => runtime.resetData());
    await settle();
    expect(st(runtime).recipes.dcf.yield).toBe(12);
    expect(st(runtime).recipes.wcb).toEqual({ yield: 1, ing: [] });
  });
});

describe('A4: Save on the recipes screen', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('sends the edited recipe against the stamp it read; the screen then shows the new version and is clean', async () => {
    const state = fresh({
      after: () => [
        dcf({
          version: 4,
          updated_at: LATER,
          lines: [
            { name: 'Unsalted butter', qty: 500, unit: 'g' },
            { name: 'Eggs', qty: 2, unit: 'pcs' }
          ]
        })
      ]
    });
    const { runtime, rpc } = await mounted('owner', state);
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '500'));
    expect(st(runtime).recipeDirty.dcf).toBe(true);
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    const [[, args]] = called(rpc, 'save_recipe');
    expect(args.p_expected_updated_at).toBe(STAMP);
    expect(args.p_recipe).toEqual({
      product_id: 'dcf',
      yield: 12,
      lines: [
        { name: 'Unsalted butter', qty: 500, unit: 'g' },
        { name: 'Eggs', qty: 2, unit: 'pcs' }
      ]
    });
    expect(st(runtime).recipeVer.dcf).toBe(4);
    expect(st(runtime).recipeDirty.dcf).toBeUndefined();
    expect(toasts(runtime)).toContain('Saved as Version 4');
    // Mutation: keeping the local edit after a save shows a version the database does not have.
  });

  it('a recipe with none saved yet is created with no stamp, as Version 1', async () => {
    const state = fresh({
      rows: [],
      save: { data: [{ product_id: 'wcb', version: 1, updated_at: STAMP }], error: null },
      after: () => [
        dcf({
          product_id: 'wcb',
          version: 1,
          history: [],
          yield: 24,
          lines: [{ name: 'Eggs', qty: 2, unit: 'pcs' }]
        })
      ]
    });
    const { runtime, rpc } = await mounted('owner', state);
    act(() => act$(runtime).recipeYield('wcb', 23));
    act(() => act$(runtime).recipeAdd('wcb'));
    act(() => act$(runtime).recipeEdit('wcb', 0, 'name', 'Eggs'));
    act(() => act$(runtime).recipeEdit('wcb', 0, 'qty', '2'));
    act(() => act$(runtime).recipeEdit('wcb', 0, 'unit', 'pcs'));
    act(() => act$(runtime).recipeSave('wcb'));
    await settle();
    const [[, args]] = called(rpc, 'save_recipe');
    expect(args.p_expected_updated_at).toBeNull();
    expect(args.p_recipe).toEqual({
      product_id: 'wcb',
      yield: 24,
      lines: [{ name: 'Eggs', qty: 2, unit: 'pcs' }]
    });
    expect(toasts(runtime)).toContain('Saved as Version 1');
  });

  it('a save the database made no new version of says so', async () => {
    const { runtime } = await mounted(
      'owner',
      fresh({ save: { data: [{ product_id: 'dcf', version: 3, updated_at: STAMP }], error: null } })
    );
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '320'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(runtime)).toContain('no new version');
  });

  it('sends nothing for a blank name, an amount of zero or a duplicate, and says why', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => act$(runtime).recipeAdd('dcf'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(runtime)).toContain('no name');
    act(() => act$(runtime).recipeEdit('dcf', 2, 'name', 'Eggs'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(runtime)).toContain('above 0');
    act(() => act$(runtime).recipeEdit('dcf', 2, 'qty', '3'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(runtime)).toContain('listed twice');
    expect(called(rpc, 'save_recipe')).toEqual([]);
    // Mutation: skipping the local check sends each of these and waits for the database to refuse.
  });

  it('a refusal or a lost connection keeps the edit for another try; a change made elsewhere shows their version', async () => {
    for (const [save, words] of [
      [{ data: null, error: { code: '22023' } }, 'could not be saved'],
      [{ data: null, error: { code: '' } }, 'Offline']
    ] as const) {
      const f = await mounted('owner', fresh({ save }));
      act(() => act$(f.runtime).recipeEdit('dcf', 0, 'qty', '500'));
      act(() => act$(f.runtime).recipeSave('dcf'));
      await settle();
      expect(toasts(f.runtime)).toContain(words);
      expect(st(f.runtime).recipes.dcf.ing[0]![1]).toBe(500);
      expect(st(f.runtime).recipeDirty.dcf).toBe(true);
      cleanup();
    }
    const stale = await mounted('owner', fresh({ save: { data: null, error: { code: 'P0002' } } }));
    act(() => act$(stale.runtime).recipeEdit('dcf', 0, 'qty', '500'));
    act(() => act$(stale.runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(stale.runtime)).toContain('Someone else');
    expect(st(stale.runtime).recipes.dcf.ing[0]![1]).toBe(320);
    expect(st(stale.runtime).recipeDirty.dcf).toBeUndefined();
    // Mutation: clearing the edit on a refusal loses what she typed.
  });

  it('an unsaved edit on another flavour survives the reload after a save', async () => {
    const state = fresh({
      rows: [
        dcf(),
        dcf({
          product_id: 'hc',
          yield: 10,
          version: 1,
          history: [],
          lines: [{ name: 'Eggs', qty: 1, unit: 'pcs' }]
        })
      ],
      after: (rows) =>
        rows.map((r) => (r.product_id === 'dcf' ? { ...r, version: 4, updated_at: LATER } : r))
    });
    const { runtime } = await mounted('owner', state);
    act(() => act$(runtime).recipeEdit('hc', 0, 'qty', '9'));
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '500'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(st(runtime).recipes.hc.ing[0]![1]).toBe(9);
    expect(st(runtime).recipeDirty.hc).toBe(true);
    expect(st(runtime).recipeDirty.dcf).toBeUndefined();
    // Mutation: a reload that replaces every recipe throws away an edit she has not saved yet.
  });

  it('an edit is saved against the stamp it was started on, not a newer one read since (the database refuses it)', async () => {
    const state = fresh({
      rows: [
        dcf(),
        dcf({
          product_id: 'hc',
          yield: 10,
          version: 1,
          updated_at: STAMP,
          history: [],
          lines: [{ name: 'Eggs', qty: 1, unit: 'pcs' }]
        })
      ],
      after: (rows) =>
        rows.map((r) => (r.product_id === 'hc' ? { ...r, version: 2, updated_at: LATER } : r))
    });
    const { runtime, rpc } = await mounted('owner', state);
    act(() => act$(runtime).recipeEdit('hc', 0, 'qty', '9'));
    // Another device saves hc; then dcf is saved here, which reloads every recipe.
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '500'));
    state.rows = [state.rows[0]!, { ...state.rows[1]!, version: 2, updated_at: LATER }];
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    rpc.mockClear();
    act(() => act$(runtime).recipeSave('hc'));
    await settle();
    expect(called(rpc, 'save_recipe')[0]![1].p_expected_updated_at).toBe(STAMP);
    // Mutation: sending the newest stamp lets the edit overwrite the other device's version with no warning.
  });

  it('what is typed before the recipes are first read is discarded: it was on an empty placeholder', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    act(() => runtime.setRole('owner'));
    act(() => act$(runtime).recipeAdd('dcf'));
    act(() => act$(runtime).recipeEdit('dcf', 0, 'name', 'Typed early'));
    expect(st(runtime).recipeDirty.dcf).toBe(true);
    const f = fakeClient(fresh());
    await act(async () => {
      await runtime.loadRecipes(f.client as never);
    });
    expect(st(runtime).recipes.dcf.ing.map((i) => i[0])).toEqual(['Unsalted butter', 'Eggs']);
    expect(st(runtime).recipeDirty.dcf).toBeUndefined();
    // Mutation: keeping the early edit hands it the real stamp and saves over the recipe with a few typed lines.
  });

  it('after a save whose read-back failed, the next save uses the stamp the save answered, and no false conflict', async () => {
    const state = fresh();
    const { runtime, rpc } = await mounted('owner', state);
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '500'));
    // The save works, but the read after it does not.
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string) =>
      name === 'get_recipes' ? { data: null, error: { code: '57014' } } : original(name)
    );
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(toasts(runtime)).toContain('Saved as Version 4');
    expect(st(runtime).recipeVer.dcf).toBe(4);
    expect(st(runtime).recipeDirty.dcf).toBeUndefined();
    act(() => act$(runtime).recipeEdit('dcf', 0, 'qty', '510'));
    act(() => act$(runtime).recipeSave('dcf'));
    await settle();
    expect(called(rpc, 'save_recipe')[1]![1].p_expected_updated_at).toBe(LATER);
    // Mutation: the old stamp would be refused as stale and the edit replaced by a false "someone else" conflict.
  });

  it('two reads that overlap: the older answer, arriving last, does not bring back an older recipe', async () => {
    const { runtime } = await mounted('owner', fresh());
    let releaseOld: (v: unknown) => void = () => undefined;
    const old = {
      rpc: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseOld = resolve;
          })
      )
    };
    const newer = fakeClient(fresh({ rows: [dcf({ yield: 30, version: 5, updated_at: LATER })] }));
    let slow: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      slow = runtime.loadRecipes(old as never);
      await runtime.loadRecipes(newer.client as never);
    });
    expect(st(runtime).recipes.dcf.yield).toBe(30);
    await act(async () => {
      releaseOld({ data: [dcf({ yield: 8, version: 2 })], error: null });
      await slow;
    });
    expect(st(runtime).recipes.dcf.yield).toBe(30);
    expect(st(runtime).recipeVer.dcf).toBe(5);
    // Mutation: applying whichever answer arrives last brings back an older stamp, and the next save is refused as stale.
  });

  it('a reset with no recipes read puts empty recipes back, not the prototype’s', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('helper'));
    act(() => ref.current!.resetData());
    await settle();
    for (const pid of ['wcb', 'dcf', 'nch'])
      expect(st(ref.current!).recipes[pid]).toEqual({ yield: 1, ing: [] });
    // Mutation: returning no patch leaves the prototype's six recipes, so bake and dough deductions use demo quantities.
  });

  it('is the owner’s alone, and offline it sends nothing', async () => {
    const helper = await mounted('helper', fresh());
    act(() => act$(helper.runtime).recipeEdit('dcf', 0, 'qty', '500'));
    act(() => act$(helper.runtime).recipeSave('dcf'));
    await settle();
    expect(called(helper.rpc, 'save_recipe')).toEqual([]);
    expect(toasts(helper.runtime)).toContain('Offline');
    cleanup();
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    act(() => act$(ref.current!).recipeAdd('dcf'));
    act(() => act$(ref.current!).recipeEdit('dcf', 0, 'name', 'Eggs'));
    act(() => act$(ref.current!).recipeEdit('dcf', 0, 'qty', '2'));
    act(() => act$(ref.current!).recipeSave('dcf'));
    await settle();
    expect(toasts(ref.current!)).toContain('Offline');
  });
});
