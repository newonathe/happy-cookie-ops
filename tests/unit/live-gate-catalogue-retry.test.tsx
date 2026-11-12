import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

/**
 * HCB-004 (cycle C4): the owner's Orders and Recipes reads follow the first SUCCESSFUL catalogue
 * read, whichever attempt that is. The real `OpsApp`, `OpsRuntime`, `FlavourSync` and `LiveGate`
 * run in live mode against a faked Supabase client whose `get_flavours` read waits for the test.
 * `loadOrders` and `loadRecipes` are spied so the test can count when each is started.
 */
const net = vi.hoisted(() => ({
  userId: 'u1',
  role: 'owner',
  waiting: [] as Array<(answer: unknown) => void>,
  /** How many `get_flavours` reads were ever started. */
  flavourCalls: 0,
  engine: null as unknown,
  /** While set, the gate's server check (`getUser`) waits for it: a re-check held in flight. */
  hold: null as Promise<void> | null,
  authEvent: null as null | ((event: string, session: { user: { id: string } } | null) => void)
}));

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseConfig: () => true }));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async () => undefined,
    all: async () => [],
    get: async () => undefined,
    delete: async () => undefined,
    supported: () => true
  }
}));

vi.mock('@/lib/supabase/client', () => {
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: net.userId } } }, error: null }),
      getUser: async () => {
        await net.hold;
        return { data: { user: { id: net.userId } }, error: null };
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: (listener: NonNullable<typeof net.authEvent>) => {
        net.authEvent = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: net.role, active: true }, error: null })
        })
      })
    }),
    rpc: (name: string) => {
      if (name !== 'get_flavours') return Promise.resolve({ data: [], error: null });
      net.flavourCalls += 1;
      return new Promise((resolve) => void net.waiting.push(resolve));
    }
  };
  return { createClient: () => client };
});

vi.mock('@/components/live/owner-workspace', async () => {
  const { useOpsEngine } = await import('@/store/use-ops');
  return {
    OwnerWorkspace: () => {
      net.engine = useOpsEngine();
      return <div data-testid="frame" />;
    }
  };
});

import { OpsApp } from '@/components/app/ops-app';
import { OpsRuntime } from '@/store/ops-runtime';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import type { FlavourRow } from '@/lib/data/flavours';

const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const GOOD: FlavourRow[] = [
  {
    id: 'qa-one',
    name: 'QA Alpha',
    short_name: 'QA Alpha',
    price_cents: 17500,
    kind: 'Regular',
    item_type: 'cookie',
    capacity_weight: 1,
    tag: '',
    description: 'A test cookie.',
    image_path: '/assets/qa.png',
    allergens: 'milk',
    active: true,
    published: false,
    sort_order: 1,
    updated_at: '2026-11-01T01:00:00.000Z'
  }
];
const down = { data: null, error: { code: '', message: 'network' } };
const ok = (rows: FlavourRow[]) => ({ data: rows, error: null });

const tick = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const answer = (a: unknown) =>
  act(async () => {
    const next = net.waiting.shift();
    if (!next) throw Error('no catalogue read is waiting');
    next(a);
    await new Promise((r) => setTimeout(r, 30));
  });
const tryAgain = () => act(async () => void flavoursRead.get().retry?.());

let loadOrders: ReturnType<typeof vi.fn>;
let loadRecipes: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://configured.example');
  Object.assign(net, {
    userId: 'u1',
    role: 'owner',
    engine: null,
    waiting: [],
    hold: null,
    flavourCalls: 0
  });
  flavoursRead.reset();
  localStorage.clear();
  document.cookie = 'sb-local-auth-token=x; path=/';
  const proto = OpsRuntime.prototype as unknown as Record<string, () => Promise<boolean>>;
  for (const name of [
    'loadShopPayment',
    'loadShopIdentity',
    'loadShopOrders',
    'loadShopStatus',
    'loadShopMenu',
    'loadSettings',
    'loadScheduledEvents',
    'loadStockCatalogue',
    'loadProduction',
    'loadBooks',
    'loadOperationsHealth',
    'loadStaffName',
    'reloadOrders',
    'reloadShopStatus'
  ])
    if (typeof proto[name] === 'function') vi.spyOn(proto, name).mockResolvedValue(false);
  loadOrders = vi.spyOn(proto, 'loadOrders').mockResolvedValue(true) as never;
  loadRecipes = vi.spyOn(proto, 'loadRecipes').mockResolvedValue(true) as never;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, pathname: '/', replace: vi.fn(), assign: vi.fn() }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  flavoursRead.reset();
  replaceFlavours(
    PORTED.list.map((p) => ({ ...p })),
    PORTED.allergens
  );
});

async function open() {
  const view = render(<OpsApp initialScreen="products" />);
  await tick();
  return view;
}
const started = () => [loadOrders.mock.calls.length, loadRecipes.mock.calls.length];

describe('the owner Orders and Recipes reads follow the first successful catalogue read', () => {
  it('a. a failed first read starts neither Orders nor Recipes', async () => {
    await open();
    expect(net.waiting).toHaveLength(1);
    await answer(down);
    expect(flavoursRead.get().phase).toBe('failed');
    expect(started()).toEqual([0, 0]);
  });

  it('b. Try again that succeeds then starts each exactly once', async () => {
    await open();
    await answer(down);
    await tryAgain();
    await answer(ok(GOOD));
    expect(flavoursRead.get().phase).toBe('read');
    expect(started()).toEqual([1, 1]);
    // A later refresh that also succeeds, and a later failure, start nothing more.
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
  });

  it('c. a successful first read starts each exactly once and a later success adds none', async () => {
    await open();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
    await tryAgain();
    await answer(ok(GOOD));
    await tryAgain();
    await answer(down);
    expect(started()).toEqual([1, 1]);
  });

  it('c2. a first read answered with an empty menu still starts each exactly once', async () => {
    await open();
    await answer(ok([]));
    expect(started()).toEqual([1, 1]);
    await tryAgain();
    await answer(ok([]));
    expect(started()).toEqual([1, 1]);
  });

  it('d. a second failure starts nothing, and a later success starts each once', async () => {
    await open();
    await answer(down);
    await tryAgain();
    await answer(down);
    expect(started()).toEqual([0, 0]);
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
  });

  it('e1. a gate retired between the failure and the retry starts nothing', async () => {
    const view = await open();
    await answer(down);
    const retry = flavoursRead.get().retry;
    view.unmount();
    await act(async () => void retry?.());
    await tick();
    expect(started()).toEqual([0, 0]);
  });

  // supabase-js signs the same person in again whenever the tab comes back to the foreground.
  const signedIn = (id = 'u1') =>
    act(async () => {
      net.authEvent?.('SIGNED_IN', { user: { id } });
      await new Promise((r) => setTimeout(r, 30));
    });

  it('x. the same person signed in again (tab visible) between the failure and the retry still starts each once', async () => {
    await open();
    await answer(down);
    await signedIn();
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
    await signedIn();
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
  });

  it('y. an answer that arrives while a re-check is still out starts each once when the check verifies', async () => {
    await open();
    await answer(down);
    let release!: () => void;
    net.hold = new Promise<void>((resolve) => void (release = resolve));
    await signedIn();
    await tryAgain();
    await answer(ok(GOOD));
    expect(flavoursRead.get().phase).toBe('read');
    // Nothing yet: the check that decides who she is has not answered.
    expect(started()).toEqual([0, 0]);
    net.hold = null;
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(started()).toEqual([1, 1]);
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
  });

  it('z. an answer that arrives during a re-check that then verifies a helper starts nothing', async () => {
    await open();
    await answer(down);
    let release!: () => void;
    net.hold = new Promise<void>((resolve) => void (release = resolve));
    await signedIn();
    await tryAgain();
    await answer(ok(GOOD));
    net.role = 'helper';
    net.hold = null;
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(started()).toEqual([0, 0]);
  });

  it('e2. a different person verified between the failure and the retry starts nothing', async () => {
    await open();
    await answer(down);
    net.userId = 'u2';
    await signedIn('u2');
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([0, 0]);
  });

  it('e2b. a different person whose check is still out when the answer arrives starts nothing', async () => {
    await open();
    await answer(down);
    let release!: () => void;
    net.hold = new Promise<void>((resolve) => void (release = resolve));
    net.userId = 'u2';
    await signedIn('u2');
    await tryAgain();
    await answer(ok(GOOD));
    net.hold = null;
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(started()).toEqual([0, 0]);
  });

  it('e4. a gate locked out by a sign-out between the failure and the retry starts nothing', async () => {
    await open();
    await answer(down);
    await act(async () => {
      net.authEvent?.('SIGNED_OUT', null);
      await new Promise((r) => setTimeout(r, 30));
    });
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([0, 0]);
  });

  it('e3. a role that is no longer owner at the retry starts nothing', async () => {
    await open();
    await answer(down);
    net.role = 'helper';
    await act(async () => {
      net.authEvent?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
      await new Promise((r) => setTimeout(r, 30));
    });
    await tryAgain();
    await answer(ok(GOOD));
    expect(started()).toEqual([0, 0]);
  });
});

/**
 * HCB-004 a3: a check that verifies while she is on the shop starts no staff read (the shop shows
 * what customers see). The catalogue read must start when she then reaches a staff screen, not at
 * the next check up to a minute later: until then the a2 views would show the built-in six.
 */
describe('HCB-004 a3: the owner reaches a staff screen after a check verified on the shop', () => {
  // While the first check is held the gate draws no frame, so the engine is caught as the gate
  // reads the payment methods from it on mount.
  beforeEach(() => {
    const read = OpsRuntime.prototype.loadShopPayment as unknown as ReturnType<typeof vi.fn>;
    read.mockImplementation(function (this: OpsRuntime) {
      net.engine = this;
      return Promise.resolve(false);
    });
  });
  const engineNow = () => net.engine as OpsRuntime;
  const goTo = (screen: string) =>
    act(async () => {
      engineNow().go(screen as never);
    });
  /**
   * Verifies the held check. `stay` keeps her on the shop through it: the protected `setRole` moves
   * a first verified check to Home, which is a staff screen and would start the read by itself.
   */
  const releaseCheck = (release: () => void, stay: boolean) =>
    act(async () => {
      const engine = engineNow();
      const go = engine.go;
      if (stay) engine.go = (() => undefined) as typeof engine.go;
      net.hold = null;
      release();
      await new Promise((r) => setTimeout(r, 30));
      engine.go = go;
    });
  /** Opens on the shop, asks for a staff screen (which starts the first check, held), then back. */
  async function heldOnShop() {
    let release!: () => void;
    net.hold = new Promise<void>((resolve) => void (release = resolve));
    const view = render(<OpsApp initialScreen="shop" />);
    await tick();
    await goTo('recipes');
    await tick();
    await goTo('shop');
    await tick();
    expect(engineNow().state.screen).toBe('shop');
    return { view, release: (stay = true) => releaseCheck(release, stay) };
  }
  const proto = () => OpsRuntime.prototype as unknown as Record<string, ReturnType<typeof vi.fn>>;
  const ownerReads = () =>
    ['loadScheduledEvents', 'loadStockCatalogue', 'loadProduction', 'loadBooks'].map(
      (name) => proto()[name]?.mock.calls.length ?? 0
    );

  it('a3-1. the catalogue read starts in the same act as the move, once, and Orders and Recipes follow it', async () => {
    const { release } = await heldOnShop();
    await release();
    expect(net.flavourCalls).toBe(0);
    expect(flavoursRead.get().phase).toBe('idle');
    await goTo('recipes');
    // No timer, no second check: the read is already out and says "loading", so the staff views
    // say "not read" instead of drawing the engine's built-in list.
    expect(net.flavourCalls).toBe(1);
    expect(flavoursRead.get().phase).toBe('loading');
    expect(started()).toEqual([0, 0]);
    await answer(ok(GOOD));
    expect(flavoursRead.get().phase).toBe('read');
    expect(started()).toEqual([1, 1]);
    // Back to the shop and to a staff screen again starts nothing more.
    await goTo('shop');
    await goTo('today');
    await tick();
    expect(net.flavourCalls).toBe(1);
    expect(started()).toEqual([1, 1]);
  });

  it('a3-1b. a check that verifies on the shop and lands her on Home starts the read at once', async () => {
    const { release } = await heldOnShop();
    // The protected `setRole` goes Home after a first verified check; the screen the check read
    // was still the shop, so nothing started there.
    await release(false);
    expect(engineNow().state.screen).toBe('today');
    expect(net.flavourCalls).toBe(1);
    expect(flavoursRead.get().phase).toBe('loading');
    await answer(ok(GOOD));
    expect(started()).toEqual([1, 1]);
  });

  it('a3-2. a helper reaches the catalogue read too, but starts no owner read', async () => {
    net.role = 'helper';
    const { release } = await heldOnShop();
    await release();
    expect(net.flavourCalls).toBe(0);
    await goTo('today');
    expect(net.flavourCalls).toBe(1);
    expect(flavoursRead.get().phase).toBe('loading');
    await answer(ok(GOOD));
    expect(started()).toEqual([0, 0]);
    expect(ownerReads()).toEqual([0, 0, 0, 0]);
  });

  it('a3-3a. nothing starts on the move while the check is still out', async () => {
    await heldOnShop();
    await goTo('recipes');
    await tick();
    expect(net.flavourCalls).toBe(0);
    expect(flavoursRead.get().phase).toBe('idle');
  });

  it('a3-3b. nothing starts on the move after a sign-out while the check is out', async () => {
    const { release } = await heldOnShop();
    await act(async () => {
      net.authEvent?.('SIGNED_OUT', null);
      await new Promise((r) => setTimeout(r, 30));
    });
    await goTo('recipes');
    await release();
    // The answer to the check that was out when she signed out belongs to the old identity.
    expect(net.flavourCalls).toBe(0);
    expect(started()).toEqual([0, 0]);
    expect(ownerReads()).toEqual([0, 0, 0, 0]);
  });

  it('a3-3c. nothing starts on the move after the gate is torn down', async () => {
    const { view, release } = await heldOnShop();
    await release();
    view.unmount();
    await act(async () => {
      engineNow().go('recipes' as never);
    });
    await tick();
    expect(net.flavourCalls).toBe(0);
    expect(started()).toEqual([0, 0]);
  });
});
