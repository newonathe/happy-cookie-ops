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
  FlavourSync,
  SHOP_COLUMNS,
  engineCatalogue,
  fetchShopFlavours,
  shopCatalogue,
  type FlavourEdit,
  type FlavourFields,
  type FlavourRow,
  type FlavoursClient,
  type ShopClient,
  type ShopFlavourRow
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

/**
 * Rendering every screen is the heaviest test in the suite; under a loaded machine (the whole suite in
 * parallel, Docker running) it can pass the default 5 s limit. This is a load allowance, not a change to what it checks.
 */
const RENDER_ALL_TIMEOUT = 20_000;

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

  it(
    'renders every screen with a seventh flavour the engine has no recipe for',
    async () => {
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
        // The runtime that loaded the list, not a fresh probe: a customer page that has read
        // no menu yet shows no flavours (MP-09 c1b).
        act(() => runtime.setState({ screen: 'shop', device: 'mobile' }));
        const text = render(<AppFrame v={runtime.renderVals()} />).container.textContent ?? '';
        expect(text).toContain('Nutella Cookie Fries');
        expect(text).toContain('Contains milk, eggs, wheat, soy, tree nuts');
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    },
    RENDER_ALL_TIMEOUT
  );

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
/** MP-09 c1b: prices through `save_flavour`, `publish_flavours`, and the live shop's menu. */
describe('MP-09 c1b: prices, publishing and the shop menu', () => {
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

  const settle = () => new Promise((r) => setTimeout(r, 0));
  const saves = (rpc: Rpc) =>
    rpc.mock.calls
      .filter((c) => c[0] === 'save_flavour')
      .map((c) => c[1] as Record<string, unknown>);

  async function setPrice(runtime: OpsRuntime, id: string, value: string) {
    await act(async () => {
      runtime.setPrice(id, value);
      await settle();
    });
  }

  it('saves a new price as centavos, whole flavour, while placed orders keep theirs', async () => {
    const { runtime, rpc } = await mounted();
    rpc.mockClear();
    await setPrice(runtime, 'wcb', '170');
    expect(runtime.priceOf('wcb')).toBe(170);
    expect(runtime.priceOf('wcb', { wcb: 155 })).toBe(155);
    expect(saves(rpc)).toEqual([
      {
        p_id: 'wcb',
        p_flavour: expect.objectContaining({
          price_cents: 17000,
          active: true
        }),
        p_expected_updated_at: '2026-09-28T01:00:00.000Z'
      }
    ]);
  });

  it('shows the price the database stored when the typed one has fractions of a centavo', async () => {
    const { runtime, rpc } = await mounted();
    rpc.mockClear();
    await setPrice(runtime, 'wcb', '12.346');
    expect(saves(rpc)[0]!.p_flavour).toMatchObject({ price_cents: 1235 });
    expect(runtime.priceOf('wcb')).toBe(12.35);
  });

  it.each([
    ['too large to be a number', '1e400'],
    ['over ₱10,000', '10000.01']
  ])('puts back a price the database would refuse (%s) without sending it', async (_, value) => {
    const { runtime, rpc } = await mounted();
    rpc.mockClear();
    await setPrice(runtime, 'wcb', value);
    expect(saves(rpc)).toEqual([]);
    expect(runtime.priceOf('wcb')).toBe(155);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.rejected);
  });

  it('sends ₱10,000 exactly, the bound', async () => {
    const { runtime, rpc } = await mounted();
    rpc.mockClear();
    await setPrice(runtime, 'wcb', '10000');
    expect(saves(rpc)[0]!.p_flavour).toMatchObject({ price_cents: 1_000_000 });
  });

  it('puts the price back when the database refuses it', async () => {
    const { runtime } = await mounted(() => ({
      data: null,
      error: { code: '22023', message: 'bad' }
    }));
    await setPrice(runtime, 'wcb', '170');
    expect(runtime.priceOf('wcb')).toBe(155);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.rejected);
  });

  it('puts the price back offline, without sending it', async () => {
    const { runtime, rpc } = await mounted();
    act(() => runtime.setState({ online: false }));
    rpc.mockClear();
    await setPrice(runtime, 'wcb', '170');
    expect(saves(rpc)).toEqual([]);
    expect(runtime.priceOf('wcb')).toBe(155);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.offline);
  });

  it('reloads and says so when someone else changed the flavour before the price saved', async () => {
    const { runtime, rpc } = await mounted(() => ({
      data: null,
      error: { code: 'P0002', message: 'stale' }
    }));
    rpc.mockClear();
    await setPrice(runtime, 'wcb', '170');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['save_flavour', 'get_flavours']);
    expect(runtime.priceOf('wcb')).toBe(155);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.conflict);
  });

  it('puts the price back when the list never loaded', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '', message: 'network' }
    }));
    await act(async () => {
      await runtime.loadFlavours({ rpc } as unknown as FlavoursClient);
    });
    const ported = runtime.priceOf('wcb');
    await setPrice(runtime, 'wcb', '170');
    expect(runtime.priceOf('wcb')).toBe(ported);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.offline);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('sends a price changed while the switch was saving after it, switch and price together', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const { runtime, rpc } = await mounted(async (args) => {
      if (first) {
        first = false;
        await gate;
      }
      return saved(args);
    });
    rpc.mockClear();
    await act(async () => {
      runtime.toggleDropProduct('wcb');
      await Promise.resolve();
    });
    await setPrice(runtime, 'wcb', '170');
    expect(saves(rpc)).toHaveLength(1);
    await act(async () => {
      release();
      await settle();
    });
    const sent = saves(rpc);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.p_flavour).toMatchObject({
      active: false,
      price_cents: 17000
    });
    expect(sent[1]!.p_expected_updated_at).toBe('2026-09-28T02:00:00.000Z');
    expect(runtime.priceOf('wcb')).toBe(170);
    expect(onMenu(runtime).wcb).toBe(false);
  });

  function sync(
    publish: () => unknown,
    online = true
  ): { sync: FlavourSync; rpc: Rpc; restored: Array<[string, FlavourEdit]> } {
    const restored: Array<[string, FlavourEdit]> = [];
    const rpc: Rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_flavours') return { data: liveRows(), error: null };
      if (name === 'publish_flavours') return publish();
      return saved(args ?? {});
    });
    const host = {
      apply: vi.fn(),
      edit: vi.fn(),
      restore: (id: string, edit: FlavourEdit) => void restored.push([id, edit]),
      online: () => online,
      toast: vi.fn()
    };
    return {
      sync: new FlavourSync({ rpc } as unknown as FlavoursClient, host),
      rpc,
      restored
    };
  }

  it('publishes every loaded flavour and saves the next change against the new updated_at', async () => {
    const { sync: s, rpc } = sync(() => ({
      data: [{ id: 'wcb', published: true, updated_at: '2026-09-28T03:00:00.000Z' }],
      error: null
    }));
    await s.load();
    expect(await s.publish()).toBe('published');
    expect(rpc).toHaveBeenCalledWith('publish_flavours', {
      p_ids: liveRows().map((r) => r.id)
    });
    expect(s.current().find((r) => r.id === 'wcb')).toMatchObject({
      published: true
    });
    await s.save('wcb', { onMenu: false }, { onMenu: true, price: 155 });
    expect(rpc).toHaveBeenLastCalledWith(
      'save_flavour',
      expect.objectContaining({
        p_expected_updated_at: '2026-09-28T03:00:00.000Z'
      })
    );
  });

  it('reports a refused or unsent publish and changes nothing it holds', async () => {
    const refused = sync(() => ({
      data: null,
      error: { code: '42501', message: 'owner only' }
    }));
    await refused.sync.load();
    expect(await refused.sync.publish(['wcb'])).toBe('rejected');
    const network = sync(() => ({
      data: null,
      error: { code: '', message: 'network' }
    }));
    await network.sync.load();
    expect(await network.sync.publish(['wcb'])).toBe('offline');
    const offline = sync(() => ({ data: [], error: null }), false);
    await offline.sync.load();
    expect(await offline.sync.publish(['wcb'])).toBe('offline');
    expect(offline.rpc.mock.calls.map((c) => c[0])).toEqual(['get_flavours']);
    for (const s of [refused.sync, network.sync, offline.sync])
      expect(s.current().every((r) => !r.published)).toBe(true);
  });

  const shopRow = (row: FlavourRow): ShopFlavourRow => ({
    id: row.id,
    name: row.name,
    short_name: row.short_name,
    price_cents: row.price_cents,
    kind: row.kind,
    tag: row.tag,
    description: row.description,
    image_path: row.image_path,
    sort_order: row.sort_order,
    allergens: row.allergens
  });
  const shopClient = (rows: ShopFlavourRow[] | null) => {
    const from = vi.fn(() => ({
      select: vi.fn(async () =>
        rows ? { data: rows, error: null } : { data: null, error: { code: '503', message: 'down' } }
      )
    }));
    return { client: { from } as unknown as ShopClient, from };
  };
  function customer(): OpsRuntime {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setState({ screen: 'shop', device: 'mobile' }));
    return ref.current!;
  }
  const shopText = (runtime: OpsRuntime) =>
    render(<AppFrame v={runtime.renderVals()} />).container.textContent ?? '';
  const portedNames = PRODUCTS.map((p) => p.short);

  it('shows customers only the published menu, at the published prices', async () => {
    const runtime = customer();
    const wcb = liveRows().find((r) => r.id === 'wcb')!;
    const { client, from } = shopClient([shopRow(OCTOBER), shopRow(wcb)]);
    await act(async () => {
      expect(await runtime.loadShopMenu(client)).toBe(true);
    });
    expect(from).toHaveBeenCalledWith('shop_products');
    const text = shopText(runtime);
    expect(text).toContain('Nutella Cookie Fries');
    expect(text).toContain('White Chocolate Biscoff');
    expect(text).toContain('₱155');
    expect(text).toContain('Contains milk, eggs, wheat, soy, tree nuts');
    for (const name of portedNames.filter((n) => n !== 'White Chocolate Biscoff'))
      expect(text).not.toContain(name);
  });

  it.each([
    ['nothing is published', [] as ShopFlavourRow[]],
    ['the read fails', null]
  ])('shows no flavours, not the demo menu, when %s', async (_, rows) => {
    const runtime = customer();
    await act(async () => {
      expect(await runtime.loadShopMenu(shopClient(rows).client)).toBe(false);
    });
    const text = shopText(runtime);
    for (const name of portedNames) expect(text).not.toContain(name);
  });

  it('shows no flavours before the menu is read, or with no Supabase configured', async () => {
    const runtime = customer();
    for (const name of portedNames) expect(shopText(runtime)).not.toContain(name);
    cleanup();
    const unconfigured = customer();
    await act(async () => {
      expect(await unconfigured.loadShopMenu(null)).toBe(false);
    });
    for (const name of portedNames) expect(shopText(unconfigured)).not.toContain(name);
  });

  it(
    'renders every screen with a one-flavour published menu, and with none',
    async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        for (const rows of [[shopRow(OCTOBER)], []]) {
          const runtime = customer();
          await act(async () => {
            await runtime.loadShopMenu(shopClient(rows).client);
          });
          for (const screen of SCREEN_KEYS) {
            act(() => runtime.setState({ screen, device: 'desktop' }));
            const { container, unmount } = render(<AppFrame v={runtime.renderVals()} />);
            expect(container.innerHTML, screen).not.toMatch(/undefined|\bNaN\b|\bInfinity\b/);
            unmount();
          }
          cleanup();
        }
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    },
    RENDER_ALL_TIMEOUT
  );

  it('keeps the staff list when the shop read lands after it', async () => {
    const { runtime } = await mounted();
    const { client } = shopClient([shopRow(OCTOBER)]);
    await act(async () => {
      expect(await runtime.loadShopMenu(client)).toBe(false);
    });
    expect(PRODUCTS).toHaveLength(7);
    expect(onMenu(runtime).wcb).toBe(true);
  });

  it('puts back an edit made where only the shop menu was read, since nothing can save it', async () => {
    const runtime = customer();
    const wcb = liveRows().find((r) => r.id === 'wcb')!;
    await act(async () => {
      await runtime.loadShopMenu(shopClient([shopRow(wcb)]).client);
    });
    await setPrice(runtime, 'wcb', '170');
    expect(runtime.priceOf('wcb')).toBe(155);
    await act(async () => {
      runtime.toggleDropProduct('wcb');
      await settle();
    });
    expect(onMenu(runtime).wcb).toBe(true);
    expect(toastText(runtime)).toContain(FLAVOUR_TOASTS.offline);
  });

  it('does not read the shop menu outside live mode', async () => {
    live = false;
    const runtime = customer();
    const { client, from } = shopClient([shopRow(OCTOBER)]);
    expect(await runtime.loadShopMenu(client)).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(shopText(runtime)).toContain('White Chocolate Biscoff');
  });

  it('keeps a shop row with a missing required value off the list', () => {
    const { list, onMenu: on } = shopCatalogue(
      [{ ...shopRow(OCTOBER), name: null }],
      PORTED.list,
      PORTED.allergens
    );
    expect(list.map((f) => f.id)).toEqual(PORTED.list.map((p) => p.id));
    expect(Object.values(on).every((v) => v === false)).toBe(true);
  });

  function editorFields(overrides: Partial<FlavourFields> = {}): FlavourFields {
    return {
      name: 'Test Cookie',
      short_name: 'Test',
      price_cents: 15000,
      kind: 'Permanent',
      item_type: 'cookie',
      capacity_weight: 1,
      tag: '',
      description: 'a test cookie',
      image_path: 'assets/test.png',
      allergens: 'milk, eggs, wheat',
      active: true,
      sort_order: 8,
      ...overrides
    };
  }

  function customSync(
    handlers: {
      save?: (args: Record<string, unknown>) => unknown;
      publish?: (args: Record<string, unknown>) => unknown;
    } = {},
    online = true
  ) {
    const restored: Array<[string, FlavourEdit]> = [];
    const editValues = new Map<string, FlavourEdit>();
    const rpc: Rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'get_flavours') return { data: liveRows(), error: null };
      if (name === 'publish_flavours')
        return handlers.publish ? handlers.publish(args ?? {}) : { data: [], error: null };
      return handlers.save ? handlers.save(args ?? {}) : saved(args ?? {});
    });
    const host = {
      apply: vi.fn(),
      edit: (id: string) => editValues.get(id) ?? { onMenu: true, price: 0 },
      restore: (id: string, edit: FlavourEdit) => void restored.push([id, edit]),
      online: () => online,
      toast: vi.fn()
    };
    return {
      sync: new FlavourSync({ rpc } as unknown as FlavoursClient, host),
      rpc,
      restored,
      editValues
    };
  }

  describe('MP-09 c1c: the flavour editor saves whole through save_flavour', () => {
    it('creates a new flavour as an unpublished draft', async () => {
      const { sync: s, rpc } = customSync();
      await s.load();
      rpc.mockClear();
      const fields = editorFields();
      expect(await s.saveWhole('test-cookie', fields, null)).toBe('saved');
      expect(rpc).toHaveBeenCalledWith('save_flavour', {
        p_id: 'test-cookie',
        p_flavour: fields,
        p_expected_updated_at: null
      });
      // Mutation check: without adding the row to the cache, current() would not find it.
      expect(s.current().find((r) => r.id === 'test-cookie')).toMatchObject({
        published: false,
        name: 'Test Cookie'
      });
    });

    it('replaces every field of an existing flavour, not a partial change', async () => {
      const { sync: s, rpc } = customSync();
      await s.load();
      const before = s.current().find((r) => r.id === 'wcb')!;
      rpc.mockClear();
      const fields = editorFields({ name: 'Renamed', price_cents: 20000 });
      expect(await s.saveWhole('wcb', fields, before.updated_at)).toBe('saved');
      expect(rpc).toHaveBeenCalledWith('save_flavour', {
        p_id: 'wcb',
        p_flavour: fields,
        p_expected_updated_at: before.updated_at
      });
      // Mutation check: a partial-payload bug would leave the old name in the cache.
      expect(s.current().find((r) => r.id === 'wcb')).toMatchObject({
        name: 'Renamed',
        price_cents: 20000
      });
    });

    it('reloads and says so on a conflict, without applying the rejected change', async () => {
      const {
        sync: s,
        rpc,
        restored
      } = customSync({
        save: () => ({ data: null, error: { code: 'P0002', message: 'stale' } })
      });
      await s.load();
      expect(await s.saveWhole('wcb', editorFields(), '2000-01-01T00:00:00.000Z')).toBe('conflict');
      expect(rpc.mock.calls.map((c) => c[0])).toEqual([
        'get_flavours',
        'save_flavour',
        'get_flavours'
      ]);
      // Mutation check: skipping the reload would leave the pre-conflict name in the cache.
      expect(s.current().find((r) => r.id === 'wcb')?.name).not.toBe('Test Cookie');
      expect(restored).toHaveLength(0);
    });

    it('reports offline without sending, and refuses invalid fields without a network call', async () => {
      const offline = customSync({}, false);
      await offline.sync.load();
      offline.rpc.mockClear();
      expect(await offline.sync.saveWhole('wcb', editorFields(), '2026-09-28T01:00:00.000Z')).toBe(
        'offline'
      );
      expect(offline.rpc).not.toHaveBeenCalled();

      const invalid = customSync();
      await invalid.sync.load();
      invalid.rpc.mockClear();
      // Mutation check: without the client-side bound, an empty allergens string would be sent.
      expect(
        await invalid.sync.saveWhole(
          'wcb',
          editorFields({ allergens: '' }),
          '2026-09-28T01:00:00.000Z'
        )
      ).toBe('rejected');
      expect(invalid.rpc).not.toHaveBeenCalled();
    });

    it('refuses while a quick edit for the same id is in flight, rather than racing it', async () => {
      let release = () => {};
      const gate = new Promise<void>((r) => (release = r));
      let first = true;
      const { sync: s, rpc } = customSync({
        save: async (args) => {
          if (first) {
            first = false;
            await gate;
          }
          return saved(args);
        }
      });
      await s.load();
      rpc.mockClear();
      const inFlight = s.save('wcb', { onMenu: false, price: 170 }, { onMenu: true, price: 155 });
      expect(await s.saveWhole('wcb', editorFields(), '2026-09-28T01:00:00.000Z')).toBe('rejected');
      // Mutation check: without the inFlight guard, this would be a second save_flavour call.
      expect(rpc).toHaveBeenCalledTimes(1);
      release();
      await inFlight;
    });

    it("does not revert another flavour's in-flight optimistic edit when saveWhole applies", async () => {
      let release = () => {};
      const gate = new Promise<void>((r) => (release = r));
      let first = true;
      const {
        sync: s,
        restored,
        editValues
      } = customSync({
        save: async (args) => {
          if (first) {
            first = false;
            await gate;
          }
          return saved(args);
        }
      });
      await s.load();
      // wcb's own save is in flight; the engine already shows its optimistic value.
      editValues.set('wcb', { onMenu: false, price: 170 });
      const inFlight = s.save('wcb', { onMenu: false, price: 170 }, { onMenu: true, price: 155 });
      expect(
        await s.saveWhole('cookie-fries', editorFields({ name: 'Renamed' }), OCTOBER.updated_at)
      ).toBe('saved');
      // Mutation check: without snapshotting and restoring, host.apply's full rebuild would
      // revert wcb to its stale cached (onMenu: true, price: 155) values here.
      expect(restored.at(-1)).toEqual(['wcb', { onMenu: false, price: 170 }]);
      release();
      await inFlight;
    });

    it('refuses to create a flavour or publish from a cache that was never loaded', async () => {
      const restored: Array<[string, FlavourEdit]> = [];
      const rpc: Rpc = vi.fn(async (name: string) =>
        name === 'get_flavours' ? { data: null, error: { code: '', message: 'down' } } : saved({})
      );
      const host = {
        apply: vi.fn(),
        edit: vi.fn(),
        restore: (id: string, edit: FlavourEdit) => void restored.push([id, edit]),
        online: () => true,
        toast: vi.fn()
      };
      const s = new FlavourSync({ rpc } as unknown as FlavoursClient, host);
      // Mutation check: without the loaded guard, saveWhole would insert this as the only
      // row apply() ever sees, shrinking the engine's whole flavour list to it; publish
      // would call publish_flavours([]) and unpublish every real flavour.
      expect(await s.saveWhole('new-one', editorFields(), null)).toBe('rejected');
      expect(await s.publish()).toBe('offline');
      expect(
        rpc.mock.calls.some((c) => c[0] === 'save_flavour' || c[0] === 'publish_flavours')
      ).toBe(false);
      expect(host.apply).not.toHaveBeenCalled();
    });

    it('publish reloads first when the cache was never loaded, then publishes the fresh list', async () => {
      const { sync: s, rpc } = customSync({ publish: () => ({ data: [], error: null }) });
      expect(await s.publish()).toBe('published');
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['get_flavours', 'publish_flavours']);
      expect(rpc).toHaveBeenLastCalledWith('publish_flavours', {
        p_ids: liveRows().map((r) => r.id)
      });
    });
  });
});
