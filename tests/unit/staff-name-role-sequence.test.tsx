import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { readStaffName } from '@/lib/auth/staff-name';

/**
 * Cycles C4/C11: can the signed-in person's name be wrong or stale after the verified role
 * changes A → B → A? The real `OpsApp`, `OpsRuntime` and `LiveGate` run in live mode against a
 * faked Supabase client whose `profiles` name read (the one `loadStaffName` makes) is held open
 * until the test answers it, so the order of the replies is the test's to choose.
 */
const net = vi.hoisted(() => ({
  role: 'owner',
  userId: 'u1',
  reads: [] as Array<{ resolve: (value: unknown) => void; started: number }>,
  checks: 0,
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
      getUser: async () => {
        net.checks += 1;
        return { data: { user: { id: net.userId } }, error: null };
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: (listener: NonNullable<typeof net.authEvent>) => {
        net.authEvent = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }
    },
    from: () => ({
      select: (columns: string) => {
        // The gate's role check: `.eq().maybeSingle()`, answered at once with the current role.
        if (columns === 'role, active')
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { role: net.role, active: true },
                error: null
              })
            })
          };
        // `loadStaffName`'s read of `profiles`: held until the test answers it.
        return new Promise((resolve) => {
          net.reads.push({ resolve, started: net.checks });
        });
      }
    }),
    rpc: async () => ({ data: [], error: null })
  };
  return { createClient: () => client };
});

vi.mock('@/components/live/owner-workspace', async () => {
  const { useOpsEngine } = await import('@/store/use-ops');
  return {
    OwnerWorkspace: () => {
      const engine = useOpsEngine();
      net.engine = engine;
      return <div data-testid="frame">{String(engine.state.screen)}</div>;
    }
  };
});

import { OpsApp } from '@/components/app/ops-app';
import { OpsRuntime } from '@/store/ops-runtime';

type RoleName = 'owner' | 'helper' | 'support';
const SCOPE = { userId: 'u1', business: 'https://configured.example' };
const runtime = () => net.engine as OpsRuntime;
const clerk = () => String(runtime().renderVals().clerkName);
const state = () => runtime().state as unknown as { role: RoleName };

/** Reads the other loaders make that this test does not exercise: each answers "nothing read". */
const LOADERS = [
  'loadShopPayment',
  'loadShopIdentity',
  'loadShopOrders',
  'loadShopStatus',
  'loadShopMenu',
  'loadSettings',
  'loadFlavours',
  'loadScheduledEvents',
  'loadStockCatalogue',
  'loadProduction',
  'loadBooks',
  'loadOperationsHealth',
  'loadOrders',
  'loadRecipes',
  'reloadOrders',
  'reloadShopStatus'
];

const tick = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const microtasks = async (n = 30) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
/** The row `loadStaffName` finds for the signed-in person when the read is answered. */
const answer = (read: number, role: RoleName, name: string) =>
  act(async () => {
    net.reads[read]!.resolve({
      data: [{ id: 'u1', display_name: name, role, active: true }],
      error: null
    });
    await new Promise((r) => setTimeout(r, 10));
  });
/** The verified role changes and the gate checks again (a token refresh), awaited to rest. */
const changeRole = async (role: RoleName) => {
  net.role = role;
  await act(async () => {
    net.authEvent?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
    await new Promise((r) => setTimeout(r, 30));
  });
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://configured.example');
  Object.assign(net, { role: 'owner', userId: 'u1', checks: 0, engine: null });
  net.reads = [];
  localStorage.clear();
  document.cookie = 'sb-local-auth-token=x; path=/';
  const proto = OpsRuntime.prototype as unknown as Record<string, () => Promise<boolean>>;
  for (const name of LOADERS)
    if (typeof proto[name] === 'function') vi.spyOn(proto, name).mockResolvedValue(false);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, pathname: '/', replace: vi.fn(), assign: vi.fn() }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function open() {
  render(<OpsApp initialScreen="today" />);
  await tick();
}

describe('the signed-in name across a verified role sequence A → B → A (C4/C11)', () => {
  // A is the owner (the role a page opens as), B a helper, C support.
  it('names the person for the final role when the replies arrive in order', async () => {
    await open();
    expect(state().role).toBe('owner');
    expect(net.reads).toHaveLength(1);
    await answer(0, 'owner', 'Ana first');
    expect(clerk()).toBe('Ana first');

    await changeRole('helper');
    expect(state().role).toBe('helper');
    expect(net.reads).toHaveLength(2);
    await answer(1, 'helper', 'Ana as helper');
    expect(clerk()).toBe('Ana as helper');

    await changeRole('owner');
    expect(state().role).toBe('owner');
    expect(net.reads).toHaveLength(3);
    await answer(2, 'owner', 'Ana second');
    expect(clerk()).toBe('Ana second');
    expect(readStaffName(SCOPE)).toEqual({ role: 'owner', name: 'Ana second' });
  });

  it('lets a retired first A reply that answers last write nothing', async () => {
    await open();
    expect(net.reads).toHaveLength(1);
    await changeRole('helper');
    await changeRole('owner');
    expect(state().role).toBe('owner');
    expect(net.reads).toHaveLength(3);
    // Answered out of order: B, then the second A, then the first A last.
    await answer(1, 'helper', 'Ana as helper');
    await answer(2, 'owner', 'Ana second');
    expect(clerk()).toBe('Ana second');
    await answer(0, 'owner', 'Ana first');
    expect(clerk()).toBe('Ana second');
    expect(readStaffName(SCOPE)).toEqual({ role: 'owner', name: 'Ana second' });
  });

  it('never shows or caches the middle role name once the person is back on A', async () => {
    await open();
    await answer(0, 'owner', 'Ana first');
    await changeRole('helper');
    await changeRole('owner');
    expect(state().role).toBe('owner');
    // A's name is already known, so only B's read is open. It answers after the switch back.
    expect(net.reads).toHaveLength(2);
    await answer(1, 'helper', 'Ana as helper');
    expect(clerk()).toBe('Ana first');
    expect(readStaffName(SCOPE)).toEqual({ role: 'owner', name: 'Ana first' });
  });

  /** Two verified checks apply their roles before React commits either (one batch). */
  const batch = (first: RoleName, second: RoleName) =>
    act(async () => {
      net.role = first;
      net.authEvent?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
      await microtasks();
      net.role = second;
      net.authEvent?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
      await microtasks();
    });

  it('starts one read, after the commit, for the role a batch of two changes lands on', async () => {
    await open();
    await answer(0, 'owner', 'Ana first');
    // Owner → helper → support in one batch: only support is ever committed.
    await batch('helper', 'support');
    await tick();
    expect(state().role).toBe('support');
    expect(net.reads).toHaveLength(2);
    await answer(1, 'support', 'Ana as support');
    expect(clerk()).toBe('Ana as support');
    expect(readStaffName(SCOPE)).toEqual({ role: 'support', name: 'Ana as support' });
  });

  it('keeps the remembered name bound to the current account and backend through the sequence', async () => {
    await open();
    await answer(0, 'owner', 'Ana first');
    await changeRole('helper');
    await answer(1, 'helper', 'Ana as helper');
    expect(readStaffName(SCOPE)).toEqual({ role: 'helper', name: 'Ana as helper' });
    await changeRole('owner');
    await answer(2, 'owner', 'Ana second');
    const raw = JSON.parse(localStorage.getItem('hc-live-staff-name') ?? 'null') as Record<
      string,
      unknown
    >;
    expect(raw).toMatchObject({
      userId: 'u1',
      business: 'https://configured.example',
      role: 'owner',
      name: 'Ana second'
    });
    // Another account on the same phone finds nothing of it.
    expect(readStaffName({ userId: 'u2', business: SCOPE.business })).toBeNull();
    expect(readStaffName({ userId: 'u1', business: 'https://other.example' })).toBeNull();
  });
});

describe('the engine ends on the last verified role when checks land in one batch (C11)', () => {
  /** Verified checks answered in turn, each applied before React commits any of them. */
  const batchOf = (...roles: RoleName[]) =>
    act(async () => {
      for (const role of roles) {
        net.role = role;
        net.authEvent?.('TOKEN_REFRESHED', { user: { id: 'u1' } });
        await microtasks();
      }
    });
  const openAs = async (role: RoleName) => {
    net.role = role;
    await open();
    expect(state().role).toBe(role);
  };

  it('leaves a helper on the helper role after a batch owner, helper', async () => {
    await openAs('helper');
    await batchOf('owner', 'helper');
    await tick();
    expect(state().role).toBe('helper');
  });

  it('leaves an owner on the owner role after a batch helper, owner', async () => {
    await openAs('owner');
    await batchOf('helper', 'owner');
    await tick();
    expect(state().role).toBe('owner');
  });

  it('ends on the last of three roles in one batch', async () => {
    await openAs('support');
    await batchOf('owner', 'helper', 'support');
    await tick();
    expect(state().role).toBe('support');
  });

  it('ends on A after unbatched A → B → A, and a repeat check of A does nothing', async () => {
    await openAs('owner');
    await changeRole('helper');
    await changeRole('owner');
    expect(state().role).toBe('owner');
    const setRole = vi.spyOn(runtime(), 'setRole');
    const go = vi.spyOn(runtime(), 'go');
    await changeRole('owner');
    await changeRole('owner');
    expect(net.checks).toBeGreaterThan(0);
    expect(setRole).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(state().role).toBe('owner');
  });

  it('does not repeat setRole for a same-role check inside a batch', async () => {
    await openAs('helper');
    const setRole = vi.spyOn(runtime(), 'setRole');
    await batchOf('helper', 'helper');
    await tick();
    expect(setRole).not.toHaveBeenCalled();
  });

  it('shows the helper UI, not the owner one, after the batch owner, helper', async () => {
    await openAs('helper');
    await batchOf('owner', 'helper');
    await tick();
    const engine = runtime() as unknown as {
      canSee: (key: string) => boolean;
      money: () => boolean;
    };
    expect(engine.canSee('inventory')).toBe(false);
    expect(engine.canSee('money')).toBe(false);
    expect(engine.canSee('today')).toBe(true);
    expect(engine.money()).toBe(false);
  });
});
