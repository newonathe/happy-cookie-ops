import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * Slice A3 (N3): the deliberate sign-out, inside the real live gate. The real `OpsApp`,
 * `OpsRuntime` and `LiveGate` run in live mode against a faked Supabase client and a faked
 * IndexedDB; only the ported frame is replaced by a marker that prints the screen it would draw
 * (the same harness as tests/unit/live-gate-offline.test.tsx).
 */
const net = vi.hoisted(() => ({
  up: true,
  hangSignOut: false,
  signOuts: 0,
  engine: null as unknown
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
      getUser: async () => {
        if (!net.up) throw new AuthRetryableFetchError('Failed to fetch', 0);
        return { data: { user: { id: 'u1' } }, error: null };
      },
      signOut: async () => {
        net.signOuts += 1;
        if (net.hangSignOut) await new Promise(() => undefined);
        return { error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (!net.up) throw new TypeError('Failed to fetch');
            return { data: { role: 'owner', active: true }, error: null };
          }
        })
      })
    }),
    rpc: async () => ({ data: [], error: null })
  };
  return { createClient: () => client };
});

vi.mock('@/components/shell/app-frame', async () => {
  const { useOpsEngine } = await import('@/store/use-ops');
  return {
    AppFrame: () => {
      const engine = useOpsEngine();
      net.engine = engine;
      return <div data-testid="frame">{String(engine.state.screen)}</div>;
    }
  };
});

import { OpsApp } from '@/components/app/ops-app';
import { OpsRuntime } from '@/store/ops-runtime';
import { SIGN_OUT_COPY } from '@/components/app/sign-out-control';
import { SIGN_OUT_LIMIT_MS } from '@/lib/auth/live-gate';

interface Till {
  state: Record<string, unknown>;
  go: (screen: string) => void;
  setState: (patch: Record<string, unknown>) => void;
  flushSales: () => Promise<unknown>;
}
const till = () => net.engine as Till;

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
  'loadCosts',
  'reloadOrders',
  'reloadShopStatus'
];

const realLocation = window.location;
const replace = vi.fn();
let onLine = true;

const tick = (ms = 30) =>
  act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
    else await new Promise((r) => setTimeout(r, ms));
  });
const pill = () => screen.queryByRole('button', { name: SIGN_OUT_COPY.button });
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const pendingRow = (id: string): Row => ({ clientId: id, state: 'pending' });
const sessionCookie = (on: boolean) => {
  document.cookie = on
    ? 'sb-local-auth-token=x; path=/'
    : 'sb-local-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
};

beforeEach(() => {
  Object.assign(net, { up: true, hangSignOut: false, signOuts: 0, engine: null });
  onLine = true;
  store.clear();
  localStorage.clear();
  sessionCookie(true);
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionCookie(false);
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('the deliberate sign-out in the live gate (A3)', () => {
  it('verified on a staff screen: the control shows; confirming signs out through the gate', async () => {
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('today');
    fireEvent.click(pill()!);
    await tick();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.emptyBody);
    expect(net.signOuts).toBe(0);
    tap(SIGN_OUT_COPY.confirm);
    await tick();
    expect(net.signOuts).toBe(1);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in'));
    // The frame is gone the moment the gate locks out: nothing is left on screen to sell from.
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(pill()).toBeNull();
  });

  it('with rows queued: says how many, and "Sign out anyway" leaves every row where it was', async () => {
    store.set('S1@1', pendingRow('S1@1'));
    store.set('S2@2', pendingRow('S2@2'));
    render(<OpsApp initialScreen="today" />);
    await tick();
    fireEvent.click(pill()!);
    await tick();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2');
    tap(SIGN_OUT_COPY.anyway);
    await tick();
    expect(net.signOuts).toBe(1);
    expect([...store.keys()].sort()).toEqual(['S1@1', 'S2@2']);
    expect([...store.values()].every((row) => row.state === 'pending')).toBe(true);
  });

  it('"Send now" runs the runtime\'s own send, then signs out once nothing is left', async () => {
    store.set('S1@1', pendingRow('S1@1'));
    render(<OpsApp initialScreen="today" />);
    await tick();
    // `flushSales` is an instance property of the runtime, so it is replaced on the live engine.
    const flush = vi.fn(async () => {
      store.set('S1@1', { clientId: 'S1@1', state: 'sent' });
      return { sent: ['S1@1'], failed: [], skipped: false };
    });
    till().flushSales = flush;
    fireEvent.click(pill()!);
    await tick();
    tap(SIGN_OUT_COPY.send);
    await tick();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(net.signOuts).toBe(1);
  });

  it('is not on the Bazaar screen, where a stray tap could end a sale', async () => {
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(pill()).not.toBeNull();
    act(() => till().go('bazaar'));
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(pill()).toBeNull();
  });

  it('is not over an open sheet or the Quick add layer', async () => {
    render(<OpsApp initialScreen="today" />);
    await tick();
    act(() => till().setState({ sheet: { kind: 'pay' } }));
    await tick();
    expect(pill()).toBeNull();
    act(() => till().setState({ sheet: null, quick: true }));
    await tick();
    expect(pill()).toBeNull();
    act(() => till().setState({ quick: false }));
    await tick();
    expect(pill()).not.toBeNull();
  });

  it('is not on a customer page', async () => {
    render(<OpsApp initialScreen="shop" />);
    await tick();
    expect(pill()).toBeNull();
  });

  it('is not there when there is no session to sign out', async () => {
    sessionCookie(false);
    net.up = false;
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByRole('status')).toHaveAttribute('data-hold', 'waiting');
    expect(pill()).toBeNull();
  });

  it('on the "No signal" notice with a stored session: she can still sign out, and is told she cannot sign back in', async () => {
    net.up = false;
    onLine = false;
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByRole('status')).toHaveAttribute('data-hold', 'waiting');
    fireEvent.click(pill()!);
    await tick();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.offline);
    tap(SIGN_OUT_COPY.confirm);
    await tick();
    expect(net.signOuts).toBe(1);
    // No redirect to a sign-in page that may not load: the gate's own notice, in place.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveAttribute('data-hold', 'signin');
  });

  it('with an event open on the phone and the server still answering, says what signing out costs a stall', async () => {
    localStorage.setItem(
      'hc-live-bazaar',
      JSON.stringify({
        event: { id: 'd1e0c105-0000-4000-8000-0000000000e1', name: 'Fair', stage: 'selling' },
        eventStock: {},
        eventPrices: {},
        eventLoaded: {},
        sales: [],
        unsynced: 0
      })
    );
    render(<OpsApp initialScreen="today" />);
    await tick();
    fireEvent.click(pill()!);
    await tick();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(SIGN_OUT_COPY.eventOpen);
  });

  it('with no event open it does not', async () => {
    render(<OpsApp initialScreen="today" />);
    await tick();
    fireEvent.click(pill()!);
    await tick();
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent(SIGN_OUT_COPY.eventOpen);
  });

  it('a logout call that never answers (dead Wi-Fi reports online) still clears the session and leaves', async () => {
    vi.useFakeTimers();
    net.hangSignOut = true;
    render(<OpsApp initialScreen="today" />);
    await tick();
    fireEvent.click(pill()!);
    await tick();
    tap(SIGN_OUT_COPY.confirm);
    await tick();
    // The frame is hidden at once, before the logout call has answered.
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(document.cookie).toContain('sb-local-auth-token');
    expect(replace).not.toHaveBeenCalled();
    await tick(SIGN_OUT_LIMIT_MS + 50);
    expect(document.cookie).not.toContain('sb-local-auth-token');
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in'));
  });
});
