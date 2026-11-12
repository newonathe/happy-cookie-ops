import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));
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

import { OpsRuntime } from '@/store/ops-runtime';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import { registerAllLiveScreens } from '@/components/live/register-all';
import { saveStallCopy } from '@/lib/offline/stall-copy';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import type { FlavourRow, FlavoursClient } from '@/lib/data/flavours';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import { bindProductionOwner } from './production-runtime-helpers';

/**
 * HCB-004 finding a2, every other owner view that can show a product. When the catalogue read failed, or has not
 * answered, and this phone holds no kept copy, the engine still holds its six built-in demo flavours. None of their
 * names, prices or counts may be shown as hers, and a view that would show "none" or a number says the catalogue is
 * not read instead. A read that succeeded, or the copy the phone kept, shows her own products. Demo mode keeps the
 * built-in list. Every test reads what she sees: text, options, buttons.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const BUILT_IN = PORTED.list.flatMap((p) => [String(p.short), String(p.name)]);

const flavour = (id: string, name: string, cents: number, sort: number): FlavourRow => ({
  id,
  name,
  short_name: name,
  price_cents: cents,
  kind: 'Regular',
  item_type: 'cookie',
  capacity_weight: 1,
  tag: '',
  description: 'A test cookie.',
  image_path: '/assets/qa.png',
  allergens: 'milk',
  active: true,
  published: true,
  sort_order: sort,
  updated_at: '2026-11-01T01:00:00.000Z'
});
const GOOD = [flavour('qa-one', 'QA Alpha', 17500, 1), flavour('qa-two', 'QA Beta', 21000, 2)];

type Answer = { data: unknown; error: unknown };
const ok = (rows: FlavourRow[]): Answer => ({ data: rows, error: null });
const down: Answer = { data: null, error: { code: '', message: 'network' } };

/** A catalogue client whose read waits for the test to answer it. */
function catalogue() {
  const waiting: Array<(a: Answer) => void> = [];
  const rpc = vi.fn((name: string) =>
    name === 'get_flavours'
      ? new Promise<Answer>((resolve) => void waiting.push(resolve))
      : Promise.resolve(down)
  );
  return {
    client: { rpc } as unknown as FlavoursClient,
    answer: (a: Answer) => {
      const next = waiting.shift();
      if (!next) throw Error('no catalogue read is waiting');
      next(a);
    }
  };
}

const STAMP = '2026-11-08T00:00:00Z';
const flour = {
  id: 'flour',
  name: 'Bread flour',
  category: 'Ingredients',
  unit: 'g',
  on_hand: 4000,
  par_level: 3000,
  pack_size: 1000,
  pack_label: '1 kg',
  supplier_id: null,
  use_by_days: null,
  last_counted: STAMP,
  active: true,
  updated_at: STAMP
};
/** The built-in ids her saved production, recipes and drafts can still name. */
const BUILT_IN_ID = String(PORTED.list[0]!.id);
/** Her saved production, which names a product by id: a built-in id while nothing of hers is read. */
const production = (pid: string) => ({
  batches: [
    {
      product_id: pid,
      qty: 24,
      target: 24,
      rejects: 1,
      version: 1,
      at: Date.parse('2026-11-10T02:00:00Z')
    }
  ],
  dough: [{ product_id: pid, balls: 18, at: Date.parse('2026-11-10T02:00:00Z') }],
  baked: [{ product_id: pid, qty: 22 }],
  shortfalls: []
});
/** One client for every read the owner views make; the catalogue read has its own. */
const ownerRpc = (pid: string) => async (name: string) => {
  const data: Record<string, unknown> = {
    get_stock_catalogue: { suppliers: [], prices: [], items: [flour] },
    get_recipes: [],
    get_recipe_drafts: [],
    get_flavour_costs: [],
    get_production: production(pid),
    get_staff_orders: [],
    get_last_paid: []
  };
  return name in data ? { data: data[name], error: null } : { data: [], error: null };
};

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const text = () => document.body.textContent ?? '';
const leaks = () => BUILT_IN.filter((name) => text().includes(name));
const tryAgain = () => screen.queryByRole('button', { name: /try again/i });
/** The catalogue's own words (not a typed-cost or production note): the sentence, or Home's short form. */
const SAYS_UNREAD =
  /Your products( and prices)? (have not been read|could not be read)|Not read yet/i;
const NO_BUILT_IN_FACTS = [
  /₱\s?(130|140|145|150|200)\b/,
  /(?<!\d)6 flavours/i,
  /(?<!\d)6 on the menu/i,
  /\d+ permanent, \d+ rotating/i,
  /No flavours yet/i,
  /None yet/i,
  /Product no longer listed/i,
  // Unknown is not zero: no count of cookies to bake, and no "nothing to bake", from products that are not hers.
  /Cookies to bake\s*\d/,
  /\d\s*cookies to bake/i,
  /No orders need baking|No orders to bake/i
];

async function mount() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ device: 'mobile' }));
  return runtime;
}
/** Every owner read the view needs, bound before she opens it. */
async function bindReads(runtime: OpsRuntime, pid: string, drop = 5) {
  const ownerClient = { rpc: ownerRpc(pid) } as never;
  act(() => runtime.setState({ dropNo: drop }));
  const scope = await bindProductionOwner(runtime);
  await act(async () => {
    await runtime.loadStockCatalogue(ownerClient);
    await runtime.loadRecipes(ownerClient, undefined, undefined, scope);
    await runtime.loadOrders(ownerClient);
    await runtime.loadProduction(ownerClient);
  });
}
const press = async (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
};

interface View {
  key: string;
  label: string;
  /** Opens the view; the catalogue has not answered yet. */
  prepare: (runtime: OpsRuntime, pid: string) => Promise<void>;
  /** Brings the view to what she reads (after the catalogue answered). */
  open?: () => Promise<void>;
  /** What she reads when her own products are in hand. */
  herText: RegExp;
  /** Views whose unknown shows as a number or "none": they must say it is not read. */
  saysUnread: boolean;
  /** The page body keeps its own read notice, which is not what this view tests. */
  bodyMayNotice?: boolean;
  /** With only the kept copy, the page behind this view still says one thing is not read (test j). */
  keptCopyMayNotice?: boolean;
  /** Values of a view no screen draws (read through `renderVals`), as text. */
  extra?: (runtime: OpsRuntime) => string;
}

const VIEWS: View[] = [
  {
    key: 'recipes',
    label: 'Make > Recipes (the recipe book)',
    prepare: async (runtime, pid) => {
      await bindReads(runtime, pid);
      act(() => runtime.go('recipes'));
      await settle();
    },
    herText: /QA Alpha/,
    saysUnread: true
  },
  {
    key: 'drafts',
    label: 'Make > Recipe drafts (the sheet)',
    prepare: async (runtime, pid) => {
      await bindReads(runtime, pid);
      act(() => runtime.setState({ screen: 'more' }));
      const tool = runtime
        .renderVals()
        .toolGroups.flatMap((group) => group.items)
        .find((item) => item.label === 'Recipe drafts');
      await act(async () => {
        tool?.go();
        await new Promise((r) => setTimeout(r, 0));
      });
      await settle();
    },
    herText: /QA Alpha · No draft yet/,
    saysUnread: true,
    // The sheet stands over All tools, whose "Menu & flavours" line counts only what a read brought in.
    keptCopyMayNotice: true
  },
  {
    key: 'production',
    label: 'Production (completed flavours, saved batches, cookies to bake)',
    prepare: async (runtime, pid) => {
      await bindReads(runtime, pid);
      act(() => runtime.go('bake'));
      await settle();
    },
    herText: /Completed flavours \(1\)QA Beta/,
    saysUnread: true
  },
  {
    key: 'inventory',
    label: 'Inventory > Dough and Baked stock (made rows)',
    prepare: async (runtime, pid) => {
      await bindReads(runtime, pid);
      act(() => runtime.setState({ invTab: 'Dough' }));
      act(() => runtime.go('inventory'));
      await settle();
    },
    open: async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Dough/ }));
      await settle();
    },
    herText: /QA Alpha/,
    saysUnread: true
  },
  {
    key: 'settings',
    label: 'Make settings (Recipes and versions) and the tools list (launcher subtitles)',
    prepare: async (runtime) => {
      act(() => runtime.go('products'));
      await settle();
      await press(/^Settings$/);
    },
    herText: /Products and prices2 on the menu.*Recipes and versionsUp to v\d/,
    saysUnread: true
  },
  {
    key: 'launcher',
    label: 'The Products and Recipes launcher subtitles',
    prepare: async (runtime) => {
      act(() => runtime.go('today'));
      await settle();
    },
    herText: /Products: (\d permanent, \d rotating)/,
    extra: (runtime) =>
      runtime
        .renderVals()
        .launcher.flatMap((group) => group.items)
        .filter((item) => item.label === 'Products' || item.label === 'Recipes')
        .map((item) => `${item.label}: ${String(item.sub)}`)
        .join(' | '),
    saysUnread: true
  },
  {
    key: 'products-sub',
    label: 'Products page subtitle',
    prepare: async (runtime) => {
      act(() => runtime.go('products'));
      await settle();
    },
    herText: /2 flavours · 2 on menu/,
    saysUnread: false,
    // The page's own body has its own read state (HCB-003); this view is the subtitle only.
    bodyMayNotice: true
  },
  {
    key: 'pricing',
    label: 'Pricing rule (the worked example)',
    prepare: async (runtime) => {
      act(() => runtime.setState({ sheet: { kind: 'pricing' } } as never));
      await settle();
    },
    herText: /2 QA Alpha · 2 QA Beta/,
    saysUnread: true
  },
  {
    key: 'shopping',
    label: 'Shopping > Cookies to bake',
    prepare: async (runtime, pid) => {
      await bindReads(runtime, pid);
      act(() => runtime.go('grocery'));
      await settle();
    },
    // A count once her products are in hand (none ordered here), never the unread words.
    herText: /Cookies to bake\d/,
    saysUnread: true
  }
];

async function readCatalogue(runtime: OpsRuntime, answer: Answer | 'pending') {
  const c = catalogue();
  let read!: Promise<boolean>;
  act(() => void (read = runtime.loadFlavours(c.client)));
  if (answer !== 'pending')
    await act(async () => {
      c.answer(answer);
      await read;
    });
  // A failed or unanswered read changes no engine state, and the page draws from the last render.
  act(() => runtime.setState({ now: Date.now() }));
  await settle();
  return c;
}

beforeAll(() => registerAllLiveScreens());
beforeEach(() => {
  live = true;
  store.clear();
  localStorage.clear();
  flavoursRead.reset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T07:42:00Z'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  flavoursRead.reset();
  replaceFlavours(
    PORTED.list.map((p) => ({ ...p })),
    PORTED.allergens
  );
  localStorage.clear();
});

/** What she reads, plus the values of a view no screen draws in the browser test (the launcher). */
const pageText = (view: View, runtime: OpsRuntime) => text() + (view.extra?.(runtime) ?? '');

function expectNothingBuiltIn(view: View, runtime: OpsRuntime) {
  const page = pageText(view, runtime);
  expect(
    BUILT_IN.filter((name) => page.includes(name)),
    `${view.label}: a built-in name is on the page`
  ).toEqual([]);
  for (const fact of NO_BUILT_IN_FACTS) expect(page, String(fact)).not.toMatch(fact);
}

describe.each(VIEWS)('HCB-004 a2: $label', (view) => {
  it('a. a failed first read with nothing kept shows no built-in product, price or count', async () => {
    const runtime = await mount();
    await readCatalogue(runtime, down);
    await view.prepare(runtime, BUILT_IN_ID);
    await view.open?.();
    expectNothingBuiltIn(view, runtime);
    if (view.saysUnread) expect(pageText(view, runtime)).toMatch(SAYS_UNREAD);
  });

  it('b. a read that has not answered yet shows no built-in product, price or count', async () => {
    const runtime = await mount();
    await readCatalogue(runtime, 'pending');
    await view.prepare(runtime, BUILT_IN_ID);
    await view.open?.();
    expectNothingBuiltIn(view, runtime);
    if (view.saysUnread) expect(pageText(view, runtime)).toMatch(SAYS_UNREAD);
  });

  it('c. a read that succeeded shows her own products', async () => {
    const runtime = await mount();
    await readCatalogue(runtime, ok(GOOD));
    await view.prepare(runtime, 'qa-one');
    await view.open?.();
    const page = pageText(view, runtime);
    expect(BUILT_IN.filter((name) => page.includes(name))).toEqual([]);
    if (!view.bodyMayNotice) expect(page).not.toMatch(SAYS_UNREAD);
    expect(page).toMatch(view.herText);
  });

  it('d. a failed read with the copy the phone kept (offline open) shows the kept products', async () => {
    saveStallCopy(
      {},
      GOOD.map((f) => ({ ...f }))
    );
    const runtime = await mount();
    act(() => runtime.setState({ online: false }));
    act(() => runtime.restoreStallCopy());
    await readCatalogue(runtime, down);
    await view.prepare(runtime, 'qa-one');
    await view.open?.();
    const page = pageText(view, runtime);
    expect(BUILT_IN.filter((name) => page.includes(name))).toEqual([]);
    if (!view.bodyMayNotice && !view.keptCopyMayNotice) expect(page).not.toMatch(SAYS_UNREAD);
    expect(page).toMatch(view.herText);
  });
});

describe('HCB-004 a2: demo mode and the four views already fixed', () => {
  it('h. demo mode (not live) keeps the built-in list: the pricing example and the Products page', async () => {
    live = false;
    const runtime = await mount();
    act(() => runtime.setState({ screen: 'products' }));
    await settle();
    const preview = runtime.renderVals().priceModePreview;
    expect(PORTED.list.some((p) => String(preview.items).includes(String(p.short)))).toBe(true);
    expect(text()).toContain(String(PORTED.list[0]!.short));
    expect(text()).not.toMatch(SAYS_UNREAD);
    expect(
      runtime
        .renderVals()
        .launcher.flatMap((group) => group.items)
        .find((item) => item.label === 'Products')?.sub
    ).toBe('4 permanent, 2 rotating');
  });

  it('j. All tools, "Menu & flavours": no count of flavours until her own are read', async () => {
    const sub = (runtime: OpsRuntime) =>
      String(
        runtime
          .renderVals()
          .toolGroups.flatMap((group) => group.items)
          .find((item) => item.label === 'Menu & flavours')?.sub
      );
    const tools = async (prepare?: (runtime: OpsRuntime) => void) => {
      cleanup();
      flavoursRead.reset();
      const runtime = await mount();
      prepare?.(runtime);
      act(() => runtime.setState({ screen: 'more' }));
      return runtime;
    };
    // Unknown is not zero: a failed or unanswered read is not "0 flavours".
    for (const answer of [down, 'pending'] as const) {
      const runtime = await tools();
      await readCatalogue(runtime, answer);
      expect(sub(runtime)).toBe('Not read yet');
    }
    // The list the editor opens is the read's own, so the kept copy alone is still not a count.
    saveStallCopy(
      {},
      GOOD.map((f) => ({ ...f }))
    );
    const kept = await tools((runtime) => {
      act(() => runtime.setState({ online: false }));
      act(() => runtime.restoreStallCopy());
    });
    await readCatalogue(kept, down);
    expect(sub(kept)).toBe('Not read yet');
    const read = await tools();
    await readCatalogue(read, ok(GOOD));
    expect(sub(read)).toBe('2 flavours · add, edit and publish');
    // An answered, empty menu is a count: none.
    const empty = await tools();
    await readCatalogue(empty, ok([]));
    expect(sub(empty)).toBe('0 flavours · add, edit and publish');
  });

  it.each([
    ['recipes', /QA Alpha/],
    ['grocery', /Cookies to bake\d/]
  ] as const)(
    'k. %s: Try again that succeeds shows her products with no reload and no other render',
    async (screenKey, hers) => {
      const runtime = await mount();
      const c = catalogue();
      let read!: Promise<boolean>;
      act(() => void (read = runtime.loadFlavours(c.client)));
      await act(async () => {
        c.answer(down);
        await read;
      });
      // The saved batch is of a product her menu shares an id with the built-in list for (the menu was first seeded
      // from it), so the engine can draw the batch both before and after the read.
      await bindReads(runtime, BUILT_IN_ID);
      act(() => runtime.go(screenKey));
      await settle();
      expect(text()).toMatch(SAYS_UNREAD);
      expect(leaks()).toEqual([]);
      await act(async () => void fireEvent.click(tryAgain()!));
      await act(async () => c.answer(ok([...GOOD, flavour(BUILT_IN_ID, 'QA Gamma', 19000, 3)])));
      // Nothing else is rendered here: the answer itself must bring the page up to date.
      await settle();
      expect(text()).not.toMatch(SAYS_UNREAD);
      expect(tryAgain()).toBeNull();
      expect(text()).toMatch(hers);
      expect(leaks()).toEqual([]);
    }
  );

  it('i. a failed read with nothing kept: Bake plan, Home, the shop preview and the drop menu hold no built-in', async () => {
    for (const screenKey of ['grocery', 'today', 'shop', 'drops'] as const) {
      cleanup();
      flavoursRead.reset();
      const runtime = await mount();
      await readCatalogue(runtime, down);
      if (screenKey === 'grocery') await bindReads(runtime, BUILT_IN_ID);
      act(() => runtime.go(screenKey));
      await settle();
      if (screenKey === 'drops') {
        const schedule = screen.queryByRole('button', { name: /Opening schedule/ });
        if (schedule) fireEvent.click(schedule);
        await settle();
      }
      expect(leaks(), screenKey).toEqual([]);
      expect(text(), screenKey).not.toMatch(/₱\s?(130|140|145|150|200)\b/);
      expect(text(), screenKey).not.toMatch(/(?<!\d)6 on the menu/);
      expect(text(), screenKey).toMatch(SAYS_UNREAD);
      if (screenKey !== 'today') expect(tryAgain(), screenKey).toBeTruthy();
    }
  });
});
