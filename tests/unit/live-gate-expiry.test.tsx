import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { reportSessionRejected } from '@/lib/auth/session-rejected';

/**
 * HCB-030: the sign-in runs out while she is working. The real `OpsApp`, `OpsRuntime` and
 * `LiveGate` run in live mode against a faked Supabase client (the harness of
 * live-gate-offline.test.tsx). Her sign-in is verified first; then the server stops accepting it.
 */
const net = vi.hoisted(() => ({
  up: true,
  user: true,
  checks: 0,
  signOuts: 0,
  authEvent: null as null | ((event: string, session: { user: { id: string } } | null) => void)
}));

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseConfig: () => true }));
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

vi.mock('@/lib/supabase/client', async () => {
  const { AuthRetryableFetchError } = await import('@supabase/supabase-js');
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => {
        net.checks += 1;
        if (!net.up) throw new AuthRetryableFetchError('Failed to fetch', 0);
        return { data: { user: net.user ? { id: 'u1' } : null }, error: null };
      },
      signOut: async () => {
        net.signOuts += 1;
        return { error: null };
      },
      onAuthStateChange: (listener: NonNullable<typeof net.authEvent>) => {
        net.authEvent = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'owner', active: true }, error: null })
        })
      })
    }),
    rpc: async () => ({ data: [], error: null })
  };
  return { createClient: () => client };
});

vi.mock('@/components/live/owner-workspace', () => ({
  OwnerWorkspace: () => <div data-testid="frame">frame</div>
}));

import { OpsApp } from '@/components/app/ops-app';
import { OpsRuntime } from '@/store/ops-runtime';

const LOADERS = [
  'loadShopPayment',
  'loadShopIdentity',
  'loadStaffName',
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
const realLocation = window.location;
const replace = vi.fn();
let onLine = true;
const tick = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const QUEUED_SALE: Row = { clientId: 'sale-1', state: 'queued', cents: 12500 };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://configured.example');
  Object.assign(net, { up: true, user: true, checks: 0, signOuts: 0 });
  onLine = true;
  store.clear();
  store.set(QUEUED_SALE.clientId, { ...QUEUED_SALE });
  localStorage.clear();
  document.cookie = 'sb-local-auth-token=x; path=/';
  replace.mockClear();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => onLine);
  const proto = OpsRuntime.prototype as unknown as Record<string, unknown>;
  for (const name of LOADERS)
    if (typeof proto[name] === 'function')
      vi.spyOn(proto as Record<string, () => Promise<boolean>>, name).mockResolvedValue(false);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, pathname: '/', replace, assign: replace }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const verified = async () => {
  render(<OpsApp initialScreen="today" />);
  await tick();
  expect(screen.getByTestId('frame')).toBeInTheDocument();
  expect(net.checks).toBeGreaterThan(0);
};
const rejection = async () => {
  act(() => reportSessionRejected());
  await tick();
};
const queueIntact = () => expect([...store.values()]).toEqual([QUEUED_SALE]);

describe('the sign-in runs out while she is working (HCB-030)', () => {
  it('a save the server turns down for its sign-in ends the session visibly, and keeps the queue', async () => {
    localStorage.setItem('hc-draft-note', 'half-written form'); // a draft the gate does not own
    await verified();
    const before = net.checks;
    net.user = false; // the server no longer knows this sign-in
    await rejection();
    expect(net.checks).toBeGreaterThan(before);
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(document.querySelector('[data-hold="ended"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/signed out/i);
    expect(net.signOuts).toBe(1);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in'));
    queueIntact();
    expect(localStorage.getItem('hc-draft-note')).toBe('half-written form');
  });

  it('the supabase-js SIGNED_OUT event shows the same notice, not a blank page', async () => {
    await verified();
    net.user = false;
    act(() => net.authEvent?.('SIGNED_OUT', null));
    await tick();
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(document.querySelector('[data-hold="ended"]')).not.toBeNull();
    queueIntact();
  });

  it('a rejection when the token is only stale (the server still knows her) changes nothing', async () => {
    await verified();
    await rejection();
    expect(screen.getByTestId('frame')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(net.signOuts).toBe(0);
    queueIntact();
  });

  it('a rejection with no signal does not lock her out: the server cannot be asked', async () => {
    await verified();
    net.up = false;
    onLine = false;
    await rejection();
    expect(screen.getByTestId('frame')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(net.signOuts).toBe(0);
    queueIntact();
  });

  it('a burst of rejections asks the server once while the first answer is out', async () => {
    await verified();
    const before = net.checks;
    act(() => {
      reportSessionRejected();
      reportSessionRejected();
      reportSessionRejected();
    });
    await tick();
    expect(net.checks - before).toBe(1);
  });

  it('a page that was never signed in goes straight to sign-in, with no "signed out" notice', async () => {
    net.user = false;
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in'));
    expect(document.querySelector('[data-hold="ended"]')).toBeNull();
  });
});
