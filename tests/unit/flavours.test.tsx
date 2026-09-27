import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import { SCREEN_KEYS } from '@/lib/screens';
import {
  FLAVOUR_TOASTS,
  SHOP_COLUMNS,
  engineCatalogue,
  fetchShopFlavours,
  type FlavourRow,
  type FlavoursClient,
  type ShopClient
} from '@/lib/data/flavours';

/**
 * MP-09 c1: the flavour list comes from `products` through the approved engine exception.
 * The ported constants are the answer key: the seeded rows must map back onto them exactly.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };

/** One SQL tuple `( 'a', 'it''s', 13000, … )` split into its values. */
function tuple(line: string): string[] {
  const body = line
    .trim()
    .replace(/^\(/, '')
    .replace(/\),?;?$/, '');
  const values: string[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === "'") {
      let text = '';
      i++;
      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") {
          text += "'";
          i += 2;
        } else if (body[i] === "'") break;
        else text += body[i++];
      }
      values.push(text);
      i++;
    } else {
      const end = body.indexOf(',', i);
      values.push(body.slice(i, end < 0 ? undefined : end).trim());
      i = end < 0 ? body.length : end;
    }
    while (body[i] === ',' || body[i] === ' ') i++;
  }
  return values;
}

/** The six flavours exactly as `get_flavours()` returns them after `pnpm db:reset`. */
function seededRows(): FlavourRow[] {
  const seed = readFileSync(join(process.cwd(), 'supabase/seed.sql'), 'utf8');
  const products = seed.split('insert into products ')[1]!.split('on conflict')[0]!;
  const allergenBlock = seed.split('-- allergens (MP-09 c1)')[1]!;
  const allergens = new Map(
    allergenBlock
      .split('\n')
      .filter((l) => l.trim().startsWith("('"))
      .map((l) => tuple(l) as [string, string])
  );
  return products
    .split('\n')
    .filter((l) => l.trim().startsWith("('"))
    .map((l) => {
      const [id, name, short_name, price, kind, tag, description, image_path, sort] = tuple(l);
      return {
        id: id!,
        name: name!,
        short_name: short_name!,
        price_cents: Number(price),
        kind: kind!,
        item_type: 'cookie',
        capacity_weight: 1,
        tag: tag!,
        description: description!,
        image_path: image_path!,
        allergens: allergens.get(id!) ?? '',
        active: true,
        published: false,
        sort_order: Number(sort),
        updated_at: '2026-09-28T01:00:00.000Z'
      };
    });
}

const OCTOBER: FlavourRow = {
  id: 'cookie-fries',
  name: 'nutella cookie fries',
  short_name: 'Nutella Cookie Fries',
  price_cents: 26000,
  kind: 'Rotating',
  item_type: 'set',
  capacity_weight: 6,
  tag: 'New',
  description: 'cookie fries with a nutella dip.',
  image_path: '/assets/nutella-churro.png',
  allergens: 'milk, eggs, wheat, soy, tree nuts',
  active: true,
  published: false,
  sort_order: 7,
  updated_at: '2026-09-28T01:00:00.000Z'
};

function liveRows(): FlavourRow[] {
  return [...seededRows().map((r) => (r.id === 'wcb' ? { ...r, price_cents: 15500 } : r)), OCTOBER];
}

type Rpc = ReturnType<typeof vi.fn>;
function fakeClient(save: (args: Record<string, unknown>) => unknown) {
  const rpc: Rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_flavours') return { data: liveRows(), error: null };
    return save(args ?? {});
  });
  return { client: { rpc } as unknown as FlavoursClient, rpc };
}
const saved = (args: Record<string, unknown>) => ({
  data: [{ id: args.p_id, updated_at: '2026-09-28T02:00:00.000Z' }],
  error: null
});

async function mounted(save: (args: Record<string, unknown>) => unknown = saved) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  const { client, rpc } = fakeClient(save);
  let loaded = false;
  await act(async () => {
    loaded = await runtime.loadFlavours(client);
  });
  return { runtime, rpc, loaded };
}

const toastText = (runtime: OpsRuntime) => JSON.stringify(runtime.state.toast ?? null);
const onMenu = (runtime: OpsRuntime) => runtime.state.dropActive as Record<string, boolean>;

describe('MP-09 c1: flavours from the database', () => {
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

  it('maps the seeded rows back onto the ported PRODUCTS and ALLERGENS exactly', () => {
    const rows = seededRows();
    expect(rows).toHaveLength(6);
    expect(engineCatalogue(rows)).toEqual(PORTED);
  });

  it('loads every flavour into the engine on sign-in, prices and on-menu switch included', async () => {
    const { runtime, loaded } = await mounted();
    expect(loaded).toBe(true);
    expect(PRODUCTS.map((p) => p.id)).toEqual([
      'dcf',
      'hc',
      'wcb',
      'pbm',
      'rvc',
      'nch',
      'cookie-fries'
    ]);
    expect(ALLERGENS['cookie-fries']).toBe('milk, eggs, wheat, soy, tree nuts');
    const priceOf = (runtime as unknown as { priceOf: (id: string) => number }).priceOf;
    expect(priceOf('wcb')).toBe(155);
    expect(priceOf('cookie-fries')).toBe(260);
    expect(onMenu(runtime)['cookie-fries']).toBe(true);
    expect((runtime.state.recipes as Record<string, { yield: number }>)['cookie-fries']).toEqual({
      yield: 1,
      ing: []
    });
  });

  it('renders every screen with a seventh flavour the engine has no recipe for', async () => {
    const { runtime } = await mounted();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const screen of SCREEN_KEYS) {
        const probe = new OpsRuntime({});
        probe.state = { ...runtime.state, screen, device: 'desktop' };
        const { container, unmount } = render(<AppFrame v={probe.renderVals()} />);
        expect(container.innerHTML, screen).not.toMatch(/undefined|\bNaN\b|\bInfinity\b/);
        unmount();
      }
      const shop = new OpsRuntime({});
      shop.state = { ...runtime.state, screen: 'shop', device: 'mobile' };
      const text = render(<AppFrame v={shop.renderVals()} />).container.textContent ?? '';
      expect(text).toContain('Nutella Cookie Fries');
      expect(text).toContain('Contains milk, eggs, wheat, soy, tree nuts');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('saves the on-menu switch through the engine action, whole flavour and last updated_at', async () => {
    const { runtime, rpc } = await mounted();
    rpc.mockClear();
    await act(async () => {
      runtime.toggleDropProduct('cookie-fries');
      await Promise.resolve();
    });
    expect(onMenu(runtime)['cookie-fries']).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_flavour', {
      p_id: 'cookie-fries',
      p_flavour: {
        name: 'nutella cookie fries',
        short_name: 'Nutella Cookie Fries',
        price_cents: 26000,
        kind: 'Rotating',
        item_type: 'set',
        capacity_weight: 6,
        tag: 'New',
        description: 'cookie fries with a nutella dip.',
        image_path: '/assets/nutella-churro.png',
        allergens: 'milk, eggs, wheat, soy, tree nuts',
        active: false,
        sort_order: 7
      },
      p_expected_updated_at: '2026-09-28T01:00:00.000Z'
    });
  });

  it('reloads and says so when someone else changed the flavour first', async () => {
    const { runtime, rpc } = await mounted(() => ({
      data: null,
      error: { code: 'P0002', message: 'stale' }
    }));
    rpc.mockClear();
    await act(async () => {
      runtime.toggleDropProduct('cookie-fries');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['save_flavour', 'get_flavours']);
    expect(onMenu(runtime)['cookie-fries']).toBe(true);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.conflict);
  });

  it('puts the switch back when the database refuses the change', async () => {
    const { runtime } = await mounted(() => ({
      data: null,
      error: { code: '22023', message: 'bad' }
    }));
    await act(async () => {
      runtime.toggleDropProduct('cookie-fries');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onMenu(runtime)['cookie-fries']).toBe(true);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.rejected);
  });

  it('puts the switch back when the list never loaded, instead of a change never sent', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    const rpc = vi.fn(async () => ({ data: null, error: { code: '', message: 'network' } }));
    await act(async () => {
      expect(await runtime.loadFlavours({ rpc } as unknown as FlavoursClient)).toBe(false);
    });
    await act(async () => {
      runtime.toggleDropProduct('wcb');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onMenu(runtime).wcb).toBe(true);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.offline);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded flavours state through the live Settings reset', async () => {
    const { runtime } = await mounted();
    act(() => runtime.resetData());
    expect((runtime.state.recipes as Record<string, unknown>)['cookie-fries']).toEqual({
      yield: 1,
      ing: []
    });
    expect(onMenu(runtime)['cookie-fries']).toBe(true);
    const priceOf = (runtime as unknown as { priceOf: (id: string) => number }).priceOf;
    expect(priceOf('wcb')).toBe(155);
  });

  it('does nothing outside live mode', async () => {
    live = false;
    const { rpc, loaded } = await mounted();
    expect(loaded).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(PRODUCTS).toHaveLength(6);
  });

  it('reads the public menu only from shop_products, with no cost, weight or switches', async () => {
    const select = vi.fn(async () => ({
      data: [{ ...OCTOBER, image_path: OCTOBER.image_path }],
      error: null
    }));
    const from = vi.fn(() => ({ select }));
    await fetchShopFlavours({ from } as unknown as ShopClient);
    expect(from).toHaveBeenCalledWith('shop_products');
    expect(select).toHaveBeenCalledWith(SHOP_COLUMNS);
    const columns = SHOP_COLUMNS.split(',').map((c) => c.trim());
    expect(columns.sort()).toEqual(
      [
        'allergens',
        'description',
        'id',
        'image_path',
        'kind',
        'name',
        'price_cents',
        'short_name',
        'sort_order',
        'tag'
      ].sort()
    );
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260101003000_flavours.sql'),
      'utf8'
    );
    expect(migration).toContain(
      'select id, name, short_name, price_cents, kind, tag, description, image_path, sort_order, allergens\nfrom public.products where published and active;'
    );
  });
});
