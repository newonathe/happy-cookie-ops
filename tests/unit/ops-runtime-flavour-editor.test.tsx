import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import type { Role } from '@/store/engine/ops-engine';
import { FLAVOUR_TOASTS, type FlavoursClient, type FlavourRow } from '@/lib/data/flavours';

/**
 * MP-09 c1c: the flavour editor's entry points, live owner only, and the form host's
 * content — through the real engine and the `sheet('flavours', …)` mechanism, not a fake.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const WCB = PORTED.list.find((p) => p.id === 'wcb')!;

function rowsFor(active: (id: string) => boolean): FlavourRow[] {
  return PORTED.list.map((p, i) => ({
    id: p.id,
    name: p.name,
    short_name: p.short,
    price_cents: Math.round(p.price * 100),
    kind: p.kind,
    item_type: 'cookie',
    capacity_weight: 1,
    tag: p.tag,
    description: p.desc,
    image_path: p.img,
    allergens: PORTED.allergens[p.id] ?? 'milk, eggs, wheat',
    active: active(p.id),
    published: true,
    sort_order: i,
    updated_at: '2026-09-28T01:00:00.000Z'
  }));
}

function fakeClient(rows: FlavourRow[], save?: (args: Record<string, unknown>) => unknown) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_flavours') return { data: rows, error: null };
    if (name === 'publish_flavours') return { data: [], error: null };
    return save
      ? save(args ?? {})
      : { data: [{ id: args?.p_id, updated_at: '2026-09-28T02:00:00.000Z' }], error: null };
  });
  return { client: { rpc } as unknown as FlavoursClient, rpc };
}

async function mounted(
  role: Role,
  rows: FlavourRow[] = rowsFor((id) => id !== 'nch'),
  save?: (args: Record<string, unknown>) => unknown
) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const { client, rpc } = fakeClient(rows, save);
  await act(async () => {
    await runtime.loadFlavours(client);
  });
  rpc.mockClear();
  return { runtime, rpc };
}

const businessItems = (runtime: OpsRuntime) =>
  runtime.renderVals().toolGroups.find((g) => g.title === 'Business')?.items ?? [];

const toastText = (runtime: OpsRuntime) => JSON.stringify(runtime.state.toast ?? null);

/** `liveForm.publish` fires the async `publishMenu` without a way to await it from a vals
 * field typed `() => void` (the UI never awaits it either); calling the instance method
 * directly, past TypeScript's `private`, is the reliable way to await it in a test. */
function publishMenu(runtime: OpsRuntime): Promise<void> {
  return (runtime as unknown as { publishMenu: () => Promise<void> }).publishMenu();
}

describe('MP-09 c1c: the flavour editor and Publish menu', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    replaceFlavours(
      PORTED.list.map((p) => ({ ...p })),
      PORTED.allergens
    );
  });

  it('adds "Menu & flavours" for the owner only, and opens the list on tap', async () => {
    const { runtime: owner } = await mounted('owner');
    const item = businessItems(owner).find((i) => i.label === 'Menu & flavours');
    expect(item).toBeDefined();
    expect(owner.renderVals().liveForm).toBeNull();
    act(() => item!.go());
    const vals = owner.renderVals();
    expect(vals.sheet?.liveForm).toBe(true);
    expect(vals.sheet?.title).toBe('Menu & flavours');
    expect(vals.liveForm?.rows).toHaveLength(6);
    expect(vals.liveForm?.editing).toBeNull();

    const { runtime: helper } = await mounted('helper');
    expect(businessItems(helper).find((i) => i.label === 'Menu & flavours')).toBeUndefined();
  });

  it("the products screen's Edit price opens the live editor for the owner, not the ported sheet", async () => {
    const { runtime } = await mounted('owner');
    const i = PRODUCTS.findIndex((p) => p.id === 'wcb');
    act(() => runtime.renderVals().productRows[i]!.edit());
    const vals = runtime.renderVals();
    expect(vals.sheet?.liveForm).toBe(true);
    expect(vals.sheet?.title).toBe('Edit ' + WCB.name);
    expect(vals.liveForm?.editing).toMatchObject({ id: 'wcb', name: WCB.name, price: WCB.price });
  });

  it('does not touch demo mode: no liveForm, no Menu & flavours, ported Edit price still opens editPrice', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    act(() => runtime.setRole('owner'));
    const vals = runtime.renderVals();
    expect(vals.liveForm).toBeUndefined();
    expect(
      vals.toolGroups
        .find((g) => g.title === 'Business')
        ?.items.some((i) => i.label === 'Menu & flavours')
    ).toBe(false);
    const i = PRODUCTS.findIndex((p) => p.id === 'wcb');
    act(() => vals.productRows[i]!.edit());
    expect(runtime.renderVals().sheet?.isEditPrice).toBe(true);
  });

  it('adds a new flavour as a draft with a slugified id, then returns to the list', async () => {
    const saves: Array<Record<string, unknown>> = [];
    const { runtime } = await mounted('owner', undefined, (args) => {
      saves.push(args);
      return { data: [{ id: args.p_id, updated_at: '2026-09-28T03:00:00.000Z' }], error: null };
    });
    act(() =>
      businessItems(runtime)
        .find((i) => i.label === 'Menu & flavours')!
        .go()
    );
    act(() => runtime.renderVals().liveForm!.addNew());
    const editing = runtime.renderVals().liveForm!.editing!;
    expect(editing.id).toBeNull();
    expect(editing.active).toBe(true);
    await act(async () => {
      editing.save({
        name: 'Brand New Cookie',
        shortName: 'Brand New',
        description: 'fresh from October',
        imagePath: 'assets/new.png',
        allergens: 'milk, eggs, wheat',
        badge: 'New',
        kind: 'Rotating',
        itemType: 'cookie',
        capacityWeight: 1,
        sortOrder: 9,
        price: 145,
        active: true
      });
      await Promise.resolve();
    });
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      p_id: 'brand-new-cookie',
      p_expected_updated_at: null,
      p_flavour: expect.objectContaining({ name: 'Brand New Cookie', price_cents: 14500 })
    });
    // Mutation check: without navigating back on success, the editor would stay open.
    const after = runtime.renderVals();
    expect(after.sheet?.title).toBe('Menu & flavours');
    expect(after.liveForm?.editing).toBeNull();
  });

  it('names what customers will now see, or says the shop shows nothing', async () => {
    const { runtime: some } = await mounted(
      'owner',
      rowsFor((id) => id !== 'nch')
    );
    await act(async () => {
      await publishMenu(some);
    });
    expect(toastText(some)).toContain('Customers now see 5 flavours');

    const { runtime: none } = await mounted(
      'owner',
      rowsFor(() => false)
    );
    await act(async () => {
      await publishMenu(none);
    });
    expect(toastText(none)).toContain('shows no flavours');
  });

  it('reports when publishing fails, offline or refused', async () => {
    const { runtime } = await mounted('owner');
    act(() => runtime.setState({ online: false }));
    await act(async () => {
      await publishMenu(runtime);
    });
    expect(toastText(runtime)).toContain('Offline');
  });

  it('renders the list and the edit form with no undefined, NaN or console error', async () => {
    const { runtime } = await mounted('owner');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      act(() =>
        businessItems(runtime)
          .find((i) => i.label === 'Menu & flavours')!
          .go()
      );
      const list = render(<AppFrame v={runtime.renderVals()} />);
      expect(list.container.textContent).toContain('Publish menu');
      expect(list.container.innerHTML).not.toMatch(/undefined|\bNaN\b/);
      list.unmount();

      act(() => runtime.renderVals().liveForm!.addNew());
      const add = render(<AppFrame v={runtime.renderVals()} />);
      expect(add.container.textContent).toContain('Save flavour');
      expect(add.container.innerHTML).not.toMatch(/undefined|\bNaN\b/);
      add.unmount();

      const i = PRODUCTS.findIndex((p) => p.id === 'wcb');
      act(() => runtime.renderVals().productRows[i]!.edit());
      const edit = render(<AppFrame v={runtime.renderVals()} />);
      expect(edit.container.textContent).toContain(WCB.name);
      expect(edit.container.innerHTML).not.toMatch(/undefined|\bNaN\b/);
      edit.unmount();

      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('a stale-open editor gets a conflict instead of silently reverting a concurrent quick edit', async () => {
    const db = rowsFor((id) => id !== 'nch');
    const wcb = db.find((r) => r.id === 'wcb')!;
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_flavours') return { data: db.map((r) => ({ ...r })), error: null };
      if (name === 'publish_flavours') return { data: [], error: null };
      const row = db.find((r) => r.id === args?.p_id);
      if (!row) return { data: null, error: { code: '22023', message: 'unknown' } };
      if (args?.p_expected_updated_at !== row.updated_at) {
        return { data: null, error: { code: 'P0002', message: 'stale' } };
      }
      row.updated_at = new Date(Date.parse(row.updated_at) + 3600_000).toISOString();
      row.active = (args!.p_flavour as { active: boolean }).active;
      row.price_cents = (args!.p_flavour as { price_cents: number }).price_cents;
      return { data: [{ id: row.id, updated_at: row.updated_at }], error: null };
    });
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    act(() => runtime.setRole('owner'));
    await act(async () => {
      await runtime.loadFlavours({ rpc } as unknown as FlavoursClient);
    });

    // Open the editor for wcb: freezes its updated_at at whatever it is right now.
    const i = PRODUCTS.findIndex((p) => p.id === 'wcb');
    act(() => runtime.renderVals().productRows[i]!.edit());
    const frozen = runtime.renderVals().liveForm!.editing!;
    expect(frozen.active).toBe(true);

    // A concurrent quick edit lands while the form stays open, moving updated_at forward.
    await act(async () => {
      runtime.toggleDropProduct('wcb');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(wcb.active).toBe(false);

    // Submitting the still-open, now-stale form must not silently turn it back on.
    await act(async () => {
      frozen.save({
        name: frozen.name,
        shortName: frozen.shortName,
        description: frozen.description,
        imagePath: frozen.imagePath,
        allergens: frozen.allergens,
        badge: frozen.badge,
        kind: frozen.kind,
        itemType: frozen.itemType,
        capacityWeight: frozen.capacityWeight,
        sortOrder: frozen.sortOrder,
        price: frozen.price,
        active: frozen.active
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Mutation check: without freezing updated_at at open time, this save would carry a
    // fresh (matching) updated_at alongside the form's stale fields, pass save_flavour's
    // conflict check and silently turn wcb back on to the order form.
    expect(wcb.active).toBe(false);
    expect((runtime.state.dropActive as Record<string, boolean>).wcb).toBe(false);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.conflict);
  });

  it('rejects a blank price instead of silently saving it as ₱0', async () => {
    const { runtime, rpc } = await mounted('owner');
    act(() => runtime.renderVals().productRows[PRODUCTS.findIndex((p) => p.id === 'wcb')]!.edit());
    const editing = runtime.renderVals().liveForm!.editing!;
    await act(async () => {
      editing.save({
        name: editing.name,
        shortName: editing.shortName,
        description: editing.description,
        imagePath: editing.imagePath,
        allergens: editing.allergens,
        badge: editing.badge,
        kind: editing.kind,
        itemType: editing.itemType,
        capacityWeight: editing.capacityWeight,
        sortOrder: editing.sortOrder,
        price: NaN, // what live-form-host.tsx's fieldNumber() sends for a blank field
        active: editing.active
      });
    });
    // Mutation check: without the NaN check, this would send price_cents: 0 to save_flavour.
    expect(rpc).not.toHaveBeenCalled();
    expect(toastText(runtime)).toContain('Price is out of range');
  });
});
