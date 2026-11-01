import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * Slice A2: the live gate, not the demo build. The real `OpsApp`, `OpsRuntime`, `LiveGate`,
 * `RouteSync` and `OfflineBridge` run in live mode against a faked Supabase client and a faked
 * IndexedDB; only the workspace frame is replaced by a marker that prints the screen it would draw.
 *
 * The first test is the defect: verified online with an event open, then a fresh page load
 * with no signal. Before A2 that load signed out and went to /sign-in.
 */
const net = vi.hoisted(() => ({
  up: true,
  hang: false,
  user: true,
  role: 'owner',
  active: true,
  checks: 0,
  signOuts: 0,
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
        net.checks += 1;
        if (net.hang) await new Promise(() => undefined); // a dead connection: no answer, ever
        if (!net.up) throw new AuthRetryableFetchError('Failed to fetch', 0);
        return { data: { user: net.user ? { id: 'u1' } : null }, error: null };
      },
      signOut: async () => {
        net.signOuts += 1;
        return { error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (!net.up) throw new TypeError('Failed to fetch');
            return { data: { role: net.role, active: net.active }, error: null };
          }
        })
      })
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (!net.up) return { data: null, error: { message: 'Failed to fetch' } };
      net.rpc.push({ name, args });
      if (name === 'start_bazaar_day')
        return {
          data: [
            {
              event_id: args.p_event_id,
              selling_device: 'dev1',
              float_cents: 50000,
              prices: { dcf: 12500 },
              loaded: { dcf: 5 }
            }
          ],
          error: null
        };
      if (name === 'record_event_sale') {
        const sale = args.p_sale as { clientId: string };
        return {
          data: [{ client_id: sale.clientId, duplicate: false, voided: false }],
          error: null
        };
      }
      return { data: [], error: null };
    }
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

interface Till {
  state: Record<string, unknown> & {
    event: { id: string; stage?: string } | null;
    sales: unknown[];
    screen: string;
  };
  setState: (patch: Record<string, unknown>) => void;
  beginBazaarDay: (
    booking: { id: string; name: string },
    day: { id: string; day: string }
  ) => Promise<string>;
  recordSale: (pay: string) => void;
  go: (screen: string) => void;
  sheet: (kind: string) => void;
  flushSales: () => Promise<unknown>;
}
const till = () => net.engine as Till;
const sheetKind = () => (till().state.sheet as { kind?: string } | null)?.kind;

/** Reads from the server that this test does not exercise: each answers "nothing read". */
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

const EVENT = 'd1e0c105-0000-4000-8000-0000000000e1';
const HOUR = 3_600_000;
const realLocation = window.location;
const replace = vi.fn();
let onLine = true;

const tick = (ms = 30) =>
  act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
    else await new Promise((r) => setTimeout(r, ms));
  });
const signal = async (up: boolean) => {
  net.up = up;
  onLine = up;
  act(() => void window.dispatchEvent(new Event(up ? 'online' : 'offline')));
  await tick();
};
const sales = () => net.rpc.filter((c) => c.name === 'record_event_sale');
const queued = (state: string) => [...store.values()].filter((r) => r.state === state);
const seedEvent = (stage = 'selling', id = EVENT) =>
  localStorage.setItem(
    'hc-live-bazaar',
    JSON.stringify({
      event: { id, name: 'Fair', stage },
      eventStock: { dcf: 5 },
      eventPrices: { dcf: 100 },
      eventLoaded: {},
      sales: [],
      unsynced: 0
    })
  );
const seedCheck = (at: number, role = 'owner') =>
  localStorage.setItem('hc-live-check', JSON.stringify({ role, at }));
/** The cookie supabase-js keeps a session in; the faked client never writes one itself. */
const storedSession = (on: boolean) => {
  document.cookie = on
    ? 'sb-local-auth-token=x; path=/'
    : 'sb-local-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
};

beforeEach(() => {
  Object.assign(net, { up: true, user: true, role: 'owner', active: true, checks: 0, signOuts: 0 });
  net.rpc = [];
  net.hang = false;
  net.engine = null;
  onLine = true;
  store.clear();
  localStorage.clear();
  storedSession(true);
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
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('the bazaar phone with no signal (A2)', () => {
  it('verified online with an event open, then a fresh load offline: Bazaar Mode still sells, and each sale arrives once', async () => {
    // Page load 1, with signal: signed in, the server opens the event, one sale goes up.
    const first = render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    const one = till();
    await act(async () => {
      await one.beginBazaarDay(
        { id: 'd5b00000-0000-4000-8000-000000000001', name: 'Katipunan' },
        { id: 'd5a00000-0000-4000-8000-000000000001', day: '2026-10-24' }
      );
    });
    await tick();
    const eventId = one.state.event!.id;
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(one.state.event).toMatchObject({ stage: 'selling' });
    act(() => one.setState({ cart: { dcf: 1 } }));
    act(() => one.recordSale('Cash'));
    await tick();
    expect(sales()).toHaveLength(1);
    first.unmount();

    // Page load 2, no signal, from the Home Screen icon (which opens "/").
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(replace).not.toHaveBeenCalled();
    expect(net.signOuts).toBe(0);
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    const two = till();
    expect(two).not.toBe(one);
    expect(two.state.event!.id).toBe(eventId);
    expect(two.state.sales).toHaveLength(1);

    act(() => two.setState({ cart: { dcf: 1 } }));
    act(() => two.recordSale('Cash'));
    await tick();
    expect(two.state.sales).toHaveLength(2);
    expect(queued('pending')).toHaveLength(1);
    expect(sales()).toHaveLength(1);

    // Books, P&L, orders, stock and settings stay closed until a check passes.
    for (const other of ['pnl', 'orders', 'inventory', 'settings', 'today', 'sales']) {
      act(() => two.go(other));
      expect(screen.queryByTestId('frame')).toBeNull();
      expect(screen.getByText('Only Bazaar Mode works without signal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Back to Bazaar Mode'));
      expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    }
    // So does a sheet that is not Bazaar Mode's own; its own (take payment) opens.
    act(() => two.sheet('rules'));
    expect(screen.queryByTestId('frame')).toBeNull();
    fireEvent.click(screen.getByText('Back to Bazaar Mode'));
    act(() => two.sheet('pay'));
    expect(screen.getByTestId('frame')).toBeInTheDocument();
    act(() => two.setState({ sheet: null }));

    // What the phone remembers of the check: a role and a time, nothing else.
    const remembered = JSON.parse(localStorage.getItem('hc-live-check')!) as object;
    expect(Object.keys(remembered).sort()).toEqual(['at', 'role']);

    // Signal back: the full check runs at once, the queue empties, the whole app opens.
    const checksBefore = net.checks;
    await signal(true);
    await tick();
    expect(net.checks).toBeGreaterThan(checksBefore);
    expect(sales()).toHaveLength(2);
    expect(new Set(sales().map((c) => (c.args.p_sale as { clientId: string }).clientId)).size).toBe(
      2
    );
    expect(queued('pending')).toHaveLength(0);
    act(() => two.go('pnl'));
    expect(screen.getByTestId('frame')).toHaveTextContent('pnl');
    expect(net.signOuts).toBe(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it('a denial on reconnect signs out as before, and the queued sale and the event stay on the phone', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR);
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    const two = till();
    act(() => two.setState({ cart: { dcf: 1 } }));
    act(() => two.recordSale('Cash'));
    await tick();
    expect(queued('pending')).toHaveLength(1);

    net.active = false; // the owner switched this account off
    await signal(true);
    await tick();
    expect(net.signOuts).toBe(1);
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/sign-in\?next=/));
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(localStorage.getItem('hc-live-check')).toBeNull();
    expect(store.size).toBe(1);
    expect(JSON.parse(localStorage.getItem('hc-live-bazaar')!).event.id).toBe(EVENT);

    // And a reload with no signal after that opens nothing.
    cleanup();
    replace.mockClear();
    net.active = true;
    await signal(false);
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(screen.getByText('No signal')).toBeInTheDocument();
  });

  it('signal back on the selling screen: the sale in hand carries on, same screen, same payment sheet', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR);
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    const two = till();
    act(() => two.setState({ cart: { dcf: 1 } }));
    act(() => two.recordSale('Cash'));
    await tick();
    expect(queued('pending')).toHaveLength(1);
    // The next customer: cookies in the cart, the payment sheet open, not paid yet.
    act(() => two.setState({ cart: { dcf: 2 } }));
    act(() => two.sheet('pay'));
    expect(sheetKind()).toBe('pay');

    await signal(true);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(sheetKind()).toBe('pay');
    expect(two.state.cart).toEqual({ dcf: 2 });
    expect(sales()).toHaveLength(1); // the queue was sent
    expect(queued('pending')).toHaveLength(0);
    expect(net.signOuts).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    // And the check did pass: the rest of the app is open again.
    act(() => two.go('pnl'));
    expect(screen.getByTestId('frame')).toHaveTextContent('pnl');
  });

  it('signal back with a different role than the phone remembered: that role is applied from its home, as before', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR, 'helper');
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    const two = till();
    expect(two.state.role).toBe('helper');
    act(() => two.setState({ cart: { dcf: 1 } }));
    act(() => two.sheet('pay'));

    await signal(true); // the server says owner
    await tick();
    expect(two.state.role).toBe('owner');
    expect(screen.getByTestId('frame')).toHaveTextContent('today');
    expect(sheetKind()).toBeUndefined();
    expect(net.signOuts).toBe(0);
  });

  it('signal back while the "Only Bazaar Mode" notice is up: the app opens from Home, as before', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR);
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    act(() => till().go('pnl'));
    expect(screen.getByText('Only Bazaar Mode works without signal')).toBeInTheDocument();

    await signal(true);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('today');
    expect(net.signOuts).toBe(0);
  });

  it('signal back after the event was closed on the phone: nothing is selling, so the app opens from Home, as before', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR);
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    const two = till();
    act(() => two.setState({ event: { ...two.state.event, stage: 'closed' } }));
    await tick();
    expect(JSON.parse(localStorage.getItem('hc-live-bazaar')!).event.stage).toBe('closed');
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');

    await signal(true);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('today');
    expect(net.signOuts).toBe(0);
  });

  it.each([
    ['no event on the phone', () => seedCheck(Date.now() - HOUR)],
    ['an event that is closed', () => (seedEvent('closed'), seedCheck(Date.now() - HOUR))],
    [
      'an event the server never opened',
      () => (seedEvent('selling', 'local-1'), seedCheck(Date.now() - HOUR))
    ],
    ['no check remembered', () => seedEvent()],
    [
      'no session stored on the phone',
      () => (seedEvent(), seedCheck(Date.now() - HOUR), storedSession(false))
    ],
    ['a check older than the hours', () => (seedEvent(), seedCheck(Date.now() - 49 * HOUR))],
    ['a check dated in the future', () => (seedEvent(), seedCheck(Date.now() + HOUR))],
    ['a role that does not exist', () => (seedEvent(), seedCheck(Date.now() - HOUR, 'admin'))]
  ])('stays closed offline with %s: a notice, no sign-out, no redirect', async (_name, seed) => {
    seed();
    await signal(false);
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(screen.getByText('No signal')).toBeInTheDocument();
    expect(net.signOuts).toBe(0);
    expect(replace).not.toHaveBeenCalled();

    // It opens by itself when the server answers.
    await signal(true);
    await tick();
    expect(screen.getByTestId('frame')).toBeInTheDocument();
  });

  it('opens as the remembered role, so a helper offline is still a helper', async () => {
    seedEvent();
    seedCheck(Date.now() - HOUR, 'helper');
    await signal(false);
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(till().state.role).toBe('helper');
  });

  it('signed out with no network: the notice in place, never a redirect loop', async () => {
    net.user = false; // no session on the phone: a definite denial, with no request made
    onLine = false;
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByText('Sign in when you have signal')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    onLine = true;
    act(() => void window.dispatchEvent(new Event('online')));
    expect(replace).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^\/sign-in\?next=/));
  });

  it('the app shell answering for /sign-in does not redirect to /sign-in again', async () => {
    net.user = false;
    (window.location as unknown as { pathname: string }).pathname = '/sign-in';
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByText('Sign in when you have signal')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('idle with an event open and no signal does not sign out; the idle time is still charged, so it signs out when the server answers, after the queue is sent', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByTestId('frame')).toBeInTheDocument();

    await signal(false);
    act(() => till().setState({ cart: { dcf: 1 } }));
    act(() => till().recordSale('Cash'));
    await tick();
    expect(queued('pending')).toHaveLength(1);
    await tick(61 * 60_000); // past the owner's 60 idle minutes
    await tick(61 * 60_000); // and again: still held
    expect(net.signOuts).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    // Still selling, but only Bazaar Mode from here: the rest of the app is closed.
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    act(() => till().go('pnl'));
    expect(screen.queryByTestId('frame')).toBeNull();
    fireEvent.click(screen.getByText('Back to Bazaar Mode'));
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');

    await signal(true);
    await tick();
    expect(sales()).toHaveLength(1); // sent before the session went
    expect(queued('pending')).toHaveLength(0);
    expect(net.signOuts).toBe(1);
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/sign-in\?next=/));
  });

  it('a tap after the idle time ran out does not bring the session back, and neither does a reload', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('pnl');
    await signal(false);
    await tick(61 * 60_000);
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar'); // narrowed, off the P&L
    act(() => void window.dispatchEvent(new Event('pointerdown')));
    await tick(10 * 60_000);
    act(() => till().go('pnl'));
    expect(screen.queryByTestId('frame')).toBeNull();

    cleanup(); // the page is reloaded, still with no signal
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    act(() => void window.dispatchEvent(new Event('pointerdown')));

    await signal(true);
    await tick();
    expect(net.signOuts).toBe(1);
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(localStorage.getItem('hc-live-idle-spent')).toBeNull(); // cleared by the sign-out only
  });

  it('a tap before the idle time runs out is activity, as it always was: she stays signed in when the signal returns', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    await signal(false);
    await tick(50 * 60_000);
    act(() => void window.dispatchEvent(new Event('pointerdown')));
    await tick(20 * 60_000);
    await signal(true);
    await tick();
    expect(net.signOuts).toBe(0);
    act(() => till().go('pnl'));
    expect(screen.getByTestId('frame')).toHaveTextContent('pnl');
    await tick(41 * 60_000); // sixty idle minutes after that tap, with signal
    expect(net.signOuts).toBe(1);
  });

  it('on a dead connection the app narrows the moment the idle time runs out, not when the check gives up', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('pnl');
    net.hang = true; // still "online" as far as the browser knows
    await tick(60 * 60_000 + 1000); // one second past idle; the check has eight to give up
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    act(() => till().go('pnl'));
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(net.signOuts).toBe(0);
    expect(localStorage.getItem('hc-live-idle-spent')).not.toBeNull();
  });

  it('a tap that lands before an overdue idle timer (a phone that was asleep) narrows at once', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    await signal(false);
    vi.setSystemTime(Date.now() + 61 * 60_000); // the clock moved; no timer has fired
    act(() => void window.dispatchEvent(new Event('pointerdown')));
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(net.signOuts).toBe(0);
    await signal(true);
    await tick();
    expect(net.signOuts).toBe(1);
  });

  it('the same tap with no event open signs out at once, as the timer would have', async () => {
    vi.useFakeTimers();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    vi.setSystemTime(Date.now() + 61 * 60_000);
    act(() => void window.dispatchEvent(new Event('pointerdown')));
    await tick();
    expect(net.signOuts).toBe(1);
    expect(screen.queryByTestId('frame')).toBeNull();
  });

  it('while the queue is being sent before an idle sign-out, only Bazaar Mode is on screen', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    till().flushSales = () => new Promise(() => undefined);
    await tick(60 * 60_000 + 1000); // idle with signal: the check answers, the flush hangs
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(net.signOuts).toBe(0);
    await tick(15_000); // the flush limit
    expect(net.signOuts).toBe(1);
  });

  it('a tap on the sign-in notice, long after an idle sign-out, leaves no mark for the next session', async () => {
    vi.useFakeTimers();
    render(<OpsApp initialScreen="today" />);
    await tick();
    await signal(false);
    await tick(61 * 60_000); // idle, no event, no network: signed out, the notice in place
    expect(net.signOuts).toBe(1);
    expect(screen.getByText('Sign in when you have signal')).toBeInTheDocument();
    await tick(3 * HOUR);
    fireEvent.pointerDown(screen.getByText('Go to sign-in'));
    expect(localStorage.getItem('hc-live-idle-spent')).toBeNull();
  });

  it('a phone that wakes past the idle time narrows on waking, before any tap', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="pnl" />);
    await tick();
    await signal(false);
    vi.setSystemTime(Date.now() + 61 * 60_000); // asleep: the clock moved, no timer fired
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(net.signOuts).toBe(0);
  });

  it('idle with no event signs out as before, signal or not', async () => {
    vi.useFakeTimers();
    render(<OpsApp initialScreen="today" />);
    await tick();
    await tick(61 * 60_000);
    expect(net.signOuts).toBe(1);
  });

  it('a held session offline past the hours closes behind the notice, and reconnecting signs it out instead of reopening', async () => {
    vi.useFakeTimers();
    seedEvent();
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    await signal(false);
    await tick(49 * HOUR);
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(screen.getByText('No signal')).toBeInTheDocument();
    expect(net.signOuts).toBe(0);
    fireEvent.pointerDown(screen.getByText('Try again')); // a tap on the notice changes nothing
    fireEvent.click(screen.getByText('Try again'));
    await tick();
    await signal(true);
    await tick();
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(net.signOuts).toBe(1);
  });

  it('Bazaar Mode opened offline and then left untouched past the idle time signs out on reconnect', async () => {
    vi.useFakeTimers();
    seedEvent();
    seedCheck(Date.now() - HOUR);
    await signal(false);
    render(<OpsApp initialScreen="today" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    await tick(61 * 60_000);
    expect(net.signOuts).toBe(0);
    act(() => void window.dispatchEvent(new Event('pointerdown'))); // a tap at minute 62
    await signal(true);
    await tick();
    expect(net.signOuts).toBe(1);
  });
});
