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
 * HCB-004 finding a, the owner screens after the Bazaar: the Bake plan (Shopping, "Plan a bake"), Home, and the owner's
 * Shop preview (with the Shop page's "This drop's menu"). When the catalogue read failed, or has not answered, and this
 * phone holds no kept copy, the engine still holds its six built-in demo flavours. None of their names, prices or counts
 * may be shown as hers. A read that succeeded, or a copy the phone kept for an offline open, shows her own products.
 * Every test reads what she sees: text, options, buttons.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const BUILT_IN = PRODUCTS.map((p) => p.short);

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
const stockRpc = async (name: string) =>
  name === 'get_stock_catalogue'
    ? {
        data: {
          suppliers: [],
          prices: [],
          items: [
            {
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
            }
          ]
        },
        error: null
      }
    : { data: [], error: null };

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const text = () => document.body.textContent ?? '';
/** Built-in names on the page, in the text or in a select's options. */
const leaks = () => BUILT_IN.filter((name) => text().includes(name));
/** Home says it on its one product row; the others have a notice. */
const saysUnread = (which: ScreenKey) =>
  which === 'home' ? /^Not read yet$/ : /could not be read|have not been read/i;
const tryAgain = () => screen.queryByRole('button', { name: /try again/i });

type ScreenKey = 'bake' | 'home' | 'shop' | 'drops';
async function mount(which: ScreenKey) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  act(() => runtime.setState({ device: 'mobile' }));
  if (which === 'bake') {
    await bindProductionOwner(runtime);
    await act(async () => void (await runtime.loadStockCatalogue({ rpc: stockRpc } as never)));
    act(() => runtime.go('grocery'));
  } else act(() => runtime.go(which === 'drops' ? 'drops' : which === 'home' ? 'today' : 'shop'));
  await settle();
  return runtime;
}
/** What the screen shows once it is open: Planned bake form, Home, the Shop preview, or the drop menu. */
async function open(which: ScreenKey) {
  if (which === 'bake') {
    const plan = screen.queryByRole('button', { name: /Plan a bake|Edit planned bake/ });
    if (plan && !(plan as HTMLButtonElement).disabled) fireEvent.click(plan);
  }
  if (which === 'drops') {
    const schedule = screen.queryByRole('button', { name: /Opening schedule/ });
    if (schedule) fireEvent.click(schedule);
  }
  await settle();
}
async function readCatalogue(runtime: OpsRuntime, answer: Answer | 'pending') {
  const c = catalogue();
  let read!: Promise<boolean>;
  act(() => void (read = runtime.loadFlavours(c.client)));
  if (answer !== 'pending')
    await act(async () => {
      c.answer(answer);
      await read;
    });
  // A failed or unanswered read changes no engine state, and the page draws from the last render: the clock does this
  // every minute in the app, so a render after the read is what she would see.
  act(() => runtime.setState({ now: Date.now() }));
  return c;
}

const SCREENS: Array<[ScreenKey, string]> = [
  ['bake', 'Bake plan'],
  ['home', 'Home'],
  ['shop', "Owner's Shop preview"],
  ['drops', "Shop page: This drop's menu"]
];

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

describe.each(SCREENS)('HCB-004 a: %s', (which, label) => {
  it(`a. ${label}: a failed first read with nothing kept shows no built-in product, price or count, and offers Try again`, async () => {
    const runtime = await mount(which);
    await readCatalogue(runtime, down);
    await open(which);
    expect(leaks()).toEqual([]);
    expect(text()).not.toMatch(/(?<!\d)6 on the menu/);
    expect(text()).not.toMatch(/₱\s?(130|140|145|150|200)\b/);
    expect(screen.getByText(saysUnread(which))).toBeTruthy();
    if (which !== 'home') expect(tryAgain()).toBeTruthy();
  });

  it(`b. ${label}: a read that has not answered yet shows no built-in product, price or count`, async () => {
    const runtime = await mount(which);
    await readCatalogue(runtime, 'pending');
    await open(which);
    expect(leaks()).toEqual([]);
    expect(text()).not.toMatch(/(?<!\d)6 on the menu/);
    expect(text()).not.toMatch(/₱\s?(130|140|145|150|200)\b/);
    expect(screen.getByText(saysUnread(which))).toBeTruthy();
  });

  it(`c. ${label}: a read that succeeded shows her own products`, async () => {
    const runtime = await mount(which);
    await readCatalogue(runtime, ok(GOOD));
    await open(which);
    expect(leaks()).toEqual([]);
    expect(tryAgain()).toBeNull();
    expect(screen.queryByText(saysUnread(which))).toBeNull();
    if (which === 'home') expect(text()).toContain('2 on the menu');
    else expect(text()).toContain('QA Alpha');
  });

  it(`d. ${label}: a failed read with the copy the phone kept (offline open) shows the kept products`, async () => {
    saveStallCopy(
      {},
      GOOD.map((f) => ({ ...f }))
    );
    const runtime = await mount(which);
    act(() => runtime.setState({ online: false }));
    act(() => runtime.restoreStallCopy());
    await readCatalogue(runtime, down);
    await open(which);
    expect(leaks()).toEqual([]);
    expect(screen.queryByText(saysUnread(which))).toBeNull();
    if (which === 'home') expect(text()).toContain('2 on the menu');
    else expect(text()).toContain('QA Alpha');
  });
});

describe.each(SCREENS)('HCB-004 a: %s, Try again', (which, label) => {
  it(`e. ${label}: a failed first read, then Try again that succeeds, shows her products`, async () => {
    const runtime = await mount(which);
    const c = await readCatalogue(runtime, down);
    await open(which);
    expect(leaks()).toEqual([]);
    // Home has no button of its own: its row is the entry to Products, whose Try again is this same reader's.
    await act(async () => {
      if (which === 'home') flavoursRead.get().retry!();
      else fireEvent.click(tryAgain()!);
    });
    await act(async () => c.answer(ok(GOOD)));
    await settle();
    act(() => runtime.setState({ now: Date.now() }));
    await open(which);
    expect(screen.queryByText(saysUnread(which))).toBeNull();
    expect(leaks()).toEqual([]);
    expect(text()).toContain(which === 'home' ? '2 on the menu' : 'QA Alpha');
  });
});

describe('HCB-004 a: the entry points and the public shop', () => {
  it('f. a planned bake cannot be opened from the store while her products are not read', async () => {
    const runtime = await mount('bake');
    await readCatalogue(runtime, down);
    const plan = runtime.renderVals().liveStock!.bakePlan!;
    act(() => plan.edit());
    expect(runtime.renderVals().liveStock!.bakePlan!.open).toBe(false);
    expect(runtime.renderVals().liveStock!.bakePlan!.products).toEqual([]);
  });

  it('g. the public shop is not told about her catalogue and shows no owner notice', async () => {
    // A public visitor's engine role is "owner" too, and the phone never reads her catalogue.
    const runtime = await mount('shop');
    act(() => runtime.setState({ now: Date.now() }));
    expect(runtime.renderVals().catalogueHeld).toBeUndefined();
    expect(screen.queryByText(/products and prices/i)).toBeNull();
    expect(tryAgain()).toBeNull();
    expect(leaks()).toEqual([]);
  });
});
