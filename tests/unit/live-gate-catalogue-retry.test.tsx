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
  engine: null as unknown,
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
      getUser: async () => ({ data: { user: { id: net.userId } }, error: null }),
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
    rpc: (name: string) =>
      name === 'get_flavours'
        ? new Promise((resolve) => void net.waiting.push(resolve))
        : Promise.resolve({ data: [], error: null })
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
  Object.assign(net, { userId: 'u1', role: 'owner', engine: null, waiting: [] });
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

  it('e2. an account change between the failure and the retry starts nothing', async () => {
    await open();
    await answer(down);
    net.userId = 'u2';
    await act(async () => {
      net.authEvent?.('SIGNED_IN', { user: { id: 'u2' } });
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
