import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { fetchRecipeDrafts, saveRecipeDraft } from '@/lib/data/recipe-drafts';
import { RecipeDraftsForm } from '@/components/live/recipe-drafts-form';
import type { RecipeClient } from '@/lib/data/recipes';

const client = (
  rpc: (name: string, args?: object) => Promise<{ data: unknown; error: { code?: string } | null }>
) => ({ rpc }) as unknown as RecipeClient;
const ids = ['dcf', 'wcb'];
const draft = {
  product_id: 'dcf',
  yield: 14,
  source_text: '2 eggs\n1 tsp vanilla',
  updated_at: '2026-10-04T00:00:00Z'
};

describe('original recipe drafts', () => {
  afterEach(cleanup);
  it('loads strictly and saves source text against its frozen stamp; conflicts are preserved', async () => {
    const rpc = vi.fn(async (name: string) =>
      name === 'get_recipe_drafts'
        ? { data: [draft], error: null }
        : { data: null, error: { code: 'P0002' } }
    );
    expect(await fetchRecipeDrafts(client(rpc), ids)).toEqual([
      { productId: 'dcf', yield: 14, sourceText: draft.source_text, updatedAt: draft.updated_at }
    ]);
    const fields = {
      productId: 'dcf',
      yield: 20,
      sourceText: 'Original steps, now edited.',
      expectedUpdatedAt: draft.updated_at
    };
    expect(await saveRecipeDraft(client(rpc), ids, fields)).toMatchObject({ outcome: 'conflict' });
    expect(
      (rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>)[1]?.[1]
    ).toMatchObject({ p_source_text: fields.sourceText, p_expected_updated_at: draft.updated_at });
    expect(
      await saveRecipeDraft(client(rpc), ids, { ...fields, sourceText: 'bad\0text' })
    ).toMatchObject({ outcome: 'refused' });
    expect(rpc).toHaveBeenCalledTimes(2);
    await expect(
      fetchRecipeDrafts(
        client(async () => ({ data: [{ ...draft, product_id: 'unknown' }], error: null })),
        ids
      )
    ).rejects.toThrow();
    await expect(
      fetchRecipeDrafts(
        client(async () => ({ data: [draft, draft], error: null })),
        ids
      )
    ).rejects.toThrow();
    await expect(
      fetchRecipeDrafts(
        client(async () => ({ data: null, error: { code: '42501' } })),
        ids
      )
    ).rejects.toThrow();
    await expect(
      saveRecipeDraft(
        client(async () => ({ data: [{}], error: null })),
        ids,
        fields
      )
    ).resolves.toMatchObject({ outcome: 'offline' });
  });

  it('shows drafts only in the owner live form and keeps the original text editable', async () => {
    let live = true;
    vi.resetModules();
    vi.doMock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
    const { OpsRuntime } = await import('@/store/ops-runtime');
    const ref: { current: InstanceType<typeof OpsRuntime> | null } = { current: null };
    const Runtime = OpsRuntime;
    render(
      <Runtime
        ref={(value) => {
          ref.current = value;
        }}
      />
    );
    const runtime = ref.current!;
    act(() => runtime.setRole('helper'));
    expect(runtime.renderVals().liveRecipeDrafts).toBeNull();
    act(() => runtime.setRole('owner'));
    act(() => runtime.setState({ screen: 'more' }));
    let finishSave!: (result: { data: unknown; error: null }) => void;
    const saving = new Promise<{ data: unknown; error: null }>((resolve) => {
      finishSave = resolve;
    });
    const rpc = vi.fn((name: string) =>
      Promise.resolve(
        name === 'get_recipes'
          ? { data: [], error: null }
          : name === 'get_recipe_drafts'
            ? { data: [draft], error: null }
            : saving
      )
    );
    await act(async () => {
      await runtime.loadRecipes(client(rpc));
    });
    const tool = runtime
      .renderVals()
      .toolGroups.flatMap((group) => group.items)
      .find((item) => item.label === 'Recipe drafts');
    expect(tool).toBeDefined();
    await act(async () => {
      tool?.go();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const values = runtime.renderVals().liveRecipeDrafts;
    expect(values?.rows.find((row) => row.productId === 'dcf')?.name).toBeTruthy();
    act(() => values?.open('wcb'));
    expect(runtime.renderVals().liveRecipeDrafts?.editing).toMatchObject({
      yield: 14,
      sourceText: '',
      expectedUpdatedAt: null
    });
    act(() => values?.open('dcf'));
    render(<RecipeDraftsForm liveDrafts={runtime.renderVals().liveRecipeDrafts!} />);
    expect(screen.getByRole('textbox')).toHaveProperty('value', draft.source_text);
    const fields = {
      productId: 'dcf',
      yield: 20,
      sourceText: draft.source_text,
      expectedUpdatedAt: draft.updated_at
    };
    act(() => {
      values?.save(fields);
      values?.save(fields);
    });
    expect(rpc.mock.calls.filter((call) => call[0] === 'save_recipe_draft')).toHaveLength(1);
    await act(async () => {
      finishSave({ data: [{ updated_at: '2026-10-04T01:00:00Z' }], error: null });
      await saving;
    });
    live = false;
    expect(runtime.renderVals().liveRecipeDrafts).toBeFalsy();
  });

  it('ignores older reads and a save that finishes after close and reopen', async () => {
    let live = true;
    vi.resetModules();
    vi.doMock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
    const { OpsRuntime } = await import('@/store/ops-runtime');
    const ref: { current: InstanceType<typeof OpsRuntime> | null } = { current: null };
    const Runtime = OpsRuntime;
    render(
      <Runtime
        ref={(value) => {
          ref.current = value;
        }}
      />
    );
    const runtime = ref.current!;
    act(() => {
      runtime.setRole('owner');
      runtime.setState({ screen: 'more' });
    });
    let read = 0;
    let finishOld!: (result: { data: unknown; error: null }) => void;
    let finishNewer!: (result: { data: unknown; error: null }) => void;
    let finishSave!: (result: { data: unknown; error: null }) => void;
    const oldRead = new Promise<{ data: unknown; error: null }>((resolve) => {
      finishOld = resolve;
    });
    const newerRead = new Promise<{ data: unknown; error: null }>((resolve) => {
      finishNewer = resolve;
    });
    const saving = new Promise<{ data: unknown; error: null }>((resolve) => {
      finishSave = resolve;
    });
    const rpc = vi.fn((name: string) => {
      if (name === 'get_recipes') return Promise.resolve({ data: [], error: null });
      // The cost reads that follow a recipe read are not draft reads.
      if (name === 'get_item_costs' || name === 'get_recipe_costs')
        return Promise.resolve({ data: null, error: { code: 'PGRST202' } });
      if (name === 'save_recipe_draft') return saving;
      const call = ++read;
      return call === 1
        ? oldRead
        : call === 2
          ? newerRead
          : Promise.resolve({
              data: [{ ...draft, product_id: 'wcb', source_text: 'new session' }],
              error: null
            });
    });
    await act(async () => {
      await runtime.loadRecipes(client(rpc));
    });
    const open = () =>
      runtime
        .renderVals()
        .toolGroups.flatMap((group) => group.items)
        .find((item) => item.label === 'Recipe drafts')
        ?.go();
    await act(async () => {
      open();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const first = runtime.renderVals().liveRecipeDrafts;
    act(() => first?.reload());
    await act(async () => {
      finishNewer({ data: [{ ...draft, source_text: 'newer read' }], error: null });
      await newerRead;
    });
    await act(async () => {
      finishOld({ data: [{ ...draft, source_text: 'older read' }], error: null });
      await oldRead;
    });
    let current = runtime.renderVals().liveRecipeDrafts;
    act(() => current?.open('dcf'));
    expect(runtime.renderVals().liveRecipeDrafts?.editing?.sourceText).toBe('newer read');
    current = runtime.renderVals().liveRecipeDrafts;
    act(() =>
      current?.save({
        productId: 'dcf',
        yield: 20,
        sourceText: 'late save',
        expectedUpdatedAt: draft.updated_at
      })
    );
    act(() => (runtime as unknown as { closeSheet: () => void }).closeSheet());
    await act(async () => {
      open();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      finishSave({ data: [{ updated_at: '2026-10-04T02:00:00Z' }], error: null });
      await saving;
    });
    expect(
      runtime.renderVals().liveRecipeDrafts?.rows.find((row) => row.productId === 'wcb')?.saved
    ).toBe(true);
    expect(
      runtime.renderVals().liveRecipeDrafts?.rows.find((row) => row.productId === 'dcf')?.saved
    ).toBe(false);
    live = false;
  });
});
