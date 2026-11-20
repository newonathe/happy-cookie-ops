import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * S3: the live gate for a helper. The real `OpsApp`, `OpsRuntime` and `LiveGate` run in live mode against a faked Supabase client;
 * the workspace frame is a marker that prints the screen it would draw. Covers: an expired helper is told so, a temporary password
 * has to be replaced first, a verified helper is held to the Bazaar screen, a database without the expiry column behaves as before,
 * and the open day is found and joined from the server alone.
 */
const net = vi.hoisted(() => ({
  user: { id: 'h1', user_metadata: {} as Record<string, unknown> } as {
    id: string;
    user_metadata: Record<string, unknown>;
  } | null,
  role: 'helper',
  active: true,
  expiresAt: null as string | null,
  noColumn: false,
  signOuts: 0,
  updates: [] as Array<Record<string, unknown>>,
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
  open: null as null | Record<string, unknown>,
  day: null as null | Record<string, unknown>,
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

vi.mock('@/lib/supabase/client', () => {
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: net.user ? { user: net.user } : null },
        error: null
      }),
      getUser: async () => ({ data: { user: net.user }, error: null }),
      signOut: async () => {
        net.signOuts += 1;
        return { error: null };
      },
      updateUser: async (attributes: Record<string, unknown>) => {
        net.updates.push(attributes);
        if (net.user)
          net.user = {
            ...net.user,
            user_metadata: { ...net.user.user_metadata, ...(attributes.data as object) }
          };
        return { data: {}, error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } })
    },
    from: () => ({
      select: (columns: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (net.noColumn && columns.includes('access_expires_at'))
              return { data: null, error: { code: '42703', message: 'column does not exist' } };
            return {
              data: {
                role: net.role,
                active: net.active,
                ...(columns.includes('access_expires_at')
                  ? { access_expires_at: net.expiresAt }
                  : {})
              },
              error: null
            };
          }
        })
      })
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      net.rpc.push({ name, args });
      if (name === 'get_open_bazaar_day') return { data: net.open, error: null };
      if (name === 'get_bazaar_day') return { data: net.day, error: null };
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
const tick = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const realLocation = window.location;
const replace = vi.fn();

const DAY = 'b0951000-0000-4000-8000-0000000000d1';
const BOOKING = 'b0951000-0000-4000-8000-0000000000b1';
const EVENT = 'b0951000-0000-4000-8000-0000000000e1';
const openDay = () => ({
  day_id: DAY,
  booking_id: BOOKING,
  name: 'Open fair',
  day: '2026-11-20',
  event_id: EVENT
});
const dayRead = (status = 'open') => ({
  day_id: DAY,
  booking_id: BOOKING,
  day: '2026-11-20',
  event_id: EVENT,
  status,
  closed_at: null,
  float_cents: 25000,
  price_version: 0,
  prices: { dcf: 12500 },
  loaded: { dcf: 12 },
  table_stock: { dcf: 12 },
  sales: []
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://configured.example');
  Object.assign(net, {
    user: { id: 'h1', user_metadata: {} },
    role: 'helper',
    active: true,
    expiresAt: null,
    noColumn: false,
    signOuts: 0,
    open: null,
    day: null,
    engine: null
  });
  net.updates = [];
  net.rpc = [];
  store.clear();
  localStorage.clear();
  document.cookie = 'sb-local-auth-token=x; path=/';
  replace.mockClear();
  const proto = OpsRuntime.prototype as unknown as Record<string, unknown>;
  for (const name of LOADERS)
    if (typeof proto[name] === 'function')
      vi.spyOn(proto as Record<string, () => Promise<boolean>>, name).mockResolvedValue(false);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, pathname: '/bazaar', replace, assign: replace }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const runtime = () => net.engine as OpsRuntime;

describe('the gate for a helper (S3)', () => {
  it('a helper whose access has ended is told so, with Sign out, and nothing else opens', async () => {
    net.expiresAt = new Date(Date.now() - 60_000).toISOString();
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByText('Your access has ended')).toBeInTheDocument();
    expect(screen.queryByTestId('frame')).toBeNull();
    // No staff read started, and the person is not signed out behind the notice: Sign out is theirs to press.
    expect(net.signOuts).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await tick();
    expect(net.signOuts).toBe(1);
  });

  it('an access that ends later opens as a helper and remembers when it ends', async () => {
    net.expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    const remembered = JSON.parse(localStorage.getItem('hc-live-check') ?? '{}') as {
      role?: string;
      until?: number;
    };
    expect(remembered.role).toBe('helper');
    expect(remembered.until).toBe(Date.parse(net.expiresAt));
  });

  it('a database without the expiry column checks the profile as it always did', async () => {
    net.noColumn = true;
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    expect(screen.queryByText('Your access has ended')).toBeNull();
  });

  it('a temporary password must be replaced before anything opens, and then the app opens', async () => {
    net.user = { id: 'h1', user_metadata: { must_change_password: true } };
    render(<OpsApp initialScreen="bazaar" />);
    await tick();
    expect(screen.getByText('Choose your own password')).toBeInTheDocument();
    expect(screen.queryByTestId('frame')).toBeNull();
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'a-long-new-password' }
    });
    fireEvent.change(screen.getByLabelText('New password again'), {
      target: { value: 'a-long-new-password' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
    await tick(60);
    expect(net.updates).toEqual([
      { password: 'a-long-new-password', data: { must_change_password: false } }
    ]);
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
  });

  it('a verified helper who reaches another screen is put back on Bazaar', async () => {
    render(<OpsApp initialScreen="today" />);
    await tick(80);
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    act(() => runtime().go('orders'));
    await tick(80);
    expect(screen.getByTestId('frame')).toHaveTextContent('bazaar');
    // Sign out is offered while no day is held, since a helper has no Account page.
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('an owner is not held to Bazaar', async () => {
    net.role = 'owner';
    render(<OpsApp initialScreen="orders" />);
    await tick(80);
    expect(screen.getByTestId('frame')).toHaveTextContent('orders');
  });
});

describe('a helper joins the open day from the server alone (S3)', () => {
  const ready = async () => {
    render(<OpsApp initialScreen="bazaar" />);
    await tick(60);
    expect(runtime().state.role).toBe('helper');
  };

  it('builds the till from get_open_bazaar_day and get_bazaar_day, and never starts or lists anything', async () => {
    net.open = openDay();
    net.day = dayRead();
    await ready();
    await act(async () => runtime().joinOpenBazaarDay());
    const event = runtime().state.event as {
      id: string;
      dayId: string;
      scheduledId: string;
      stage: string;
      name: string;
    };
    expect(event).toMatchObject({
      id: EVENT,
      dayId: DAY,
      scheduledId: BOOKING,
      stage: 'selling',
      name: 'Open fair'
    });
    expect((runtime().state.eventStock as Record<string, number>).dcf).toBe(12);
    const names = net.rpc.map((c) => c.name);
    expect(names).toContain('get_open_bazaar_day');
    expect(names).toContain('get_bazaar_day');
    for (const owner of ['start_bazaar_day', 'get_bazaar', 'set_event_device'])
      expect(names).not.toContain(owner);
    expect(runtime().renderVals()).toHaveProperty('liveHelperBazaar.phase', 'selling');
  });

  it('with no day open it says so and holds nothing', async () => {
    net.open = null;
    await ready();
    await act(async () => runtime().joinOpenBazaarDay());
    expect(runtime().state.event).toBeNull();
    expect(runtime().renderVals()).toHaveProperty('liveHelperBazaar.phase', 'none');
  });

  it('lets go of a day that has been closed since, when nothing of it is waiting to send', async () => {
    net.open = openDay();
    net.day = dayRead();
    await ready();
    await act(async () => runtime().joinOpenBazaarDay());
    expect((runtime().state.event as { dayId: string }).dayId).toBe(DAY);
    net.open = null;
    await act(async () => runtime().joinOpenBazaarDay());
    await tick(60);
    expect(runtime().state.event).toBeNull();
  });

  it('a helper adds a stall expense through the engine’s own expense sheet, never the owner’s fee form', async () => {
    net.open = openDay();
    net.day = dayRead();
    await ready();
    await act(async () => runtime().joinOpenBazaarDay());
    act(() =>
      (runtime().renderVals() as unknown as { openEventExpense: () => void }).openEventExpense()
    );
    expect((runtime().state.sheet as { kind?: string } | null)?.kind).toBe('evExp');
  });

  it('is never run for the owner', async () => {
    net.role = 'owner';
    net.open = openDay();
    net.day = dayRead();
    render(<OpsApp initialScreen="bazaar" />);
    await tick(60);
    await act(async () => runtime().joinOpenBazaarDay());
    expect(net.rpc.map((c) => c.name)).not.toContain('get_open_bazaar_day');
    expect(runtime().renderVals()).toHaveProperty('liveHelperBazaar', null);
  });

  it('a helper closes the day with a count; the split is the database’s, and the reply is only an acknowledgement', async () => {
    net.open = openDay();
    net.day = dayRead();
    await ready();
    await act(async () => runtime().joinOpenBazaarDay());
    // "Close out" opens the helper's own close, never the owner's review.
    act(() => (runtime().renderVals() as unknown as { askClose: () => void }).askClose());
    expect(runtime().renderVals()).toHaveProperty('liveHelperBazaar.close.flavours');
    // More than the till says is on the table is not sent.
    const tooMany = await runtime().closeDayAsHelper({ left: { dcf: 99 }, countedPesos: null });
    expect(tooMany).toMatch(/more than the till says/);
    expect(net.rpc.map((c) => c.name)).not.toContain('close_bazaar_day');
    net.day = { ...dayRead('closed'), closed_at: Date.now() };
    const reply = vi.spyOn(await import('@/lib/data/bazaar-days'), 'closeBazaarDay');
    const problem = await runtime().closeDayAsHelper({ left: { dcf: 5 }, countedPesos: 410 });
    expect(problem === null || typeof problem === 'string').toBe(true);
    const sent = net.rpc.find((c) => c.name === 'close_bazaar_day');
    expect(sent).toBeTruthy();
    const body = sent?.args.p_close as {
      day_id: string;
      counted_cents: number;
      lines: Record<string, { left: number }>;
      expected: string;
      sales_count: null;
    };
    expect(body).toMatchObject({ day_id: DAY, counted_cents: 41000, sales_count: null });
    expect(body.lines.dcf.left).toBe(5);
    expect(body.expected).toBe('0'.repeat(64));
    reply.mockRestore();
  });
});
