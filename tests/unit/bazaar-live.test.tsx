import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { liveScreenFor } from '@/components/live/live-screens';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { BazaarLive } from '@/components/live/bazaar/bazaar-live';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import { dayEventId } from '@/lib/data/bazaar-days';
import { ALLERGENS, PRODUCTS, replaceFlavours, type Role } from '@/store/engine/ops-engine';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import { answerFacts, dayFacts, lineFacts, summaryFacts } from '../fixtures/bazaar-answer';

/**
 * S2: the live Bazaar screen. With no event on the phone it is the owner's event list, an event's page and a day's plan;
 * with an event it is the ported till, unchanged, for the owner, a helper, and a phone with no signal. Each `Mutation:`
 * line names a change one of these tests must catch.
 */
const NOW = new Date('2026-10-20T03:00:00Z');
/**
 * HCB-004: a day is planned and started only from her read catalogue, so the owner here has read one: the same six
 * flavours at the same prices the engine starts with, so every test below still plans with what it always did.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };
const catalogueRows = PORTED.list.map((p, i) => ({
  id: p.id,
  name: p.short,
  short_name: p.short,
  price_cents: p.price * 100,
  kind: p.kind,
  item_type: 'cookie',
  capacity_weight: 1,
  tag: p.tag,
  description: p.desc,
  image_path: p.img,
  allergens: '',
  active: true,
  published: false,
  sort_order: i + 1,
  updated_at: '2026-11-01T01:00:00.000Z'
}));
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';
const DAY1 = 'd5a00000-0000-4000-8000-000000000001';
const STAMP = '2026-10-20T02:00:00.123456+00:00';
const HASH = 'a'.repeat(64);

const booking = {
  id: BOOKING,
  name: 'Katipunan market',
  starts_on: '2026-10-24',
  ends_on: '2026-10-25',
  place: 'Katipunan Ave, QC',
  rent_cents: 250000,
  active: true,
  started: false,
  updated_at: STAMP
};

interface Fake {
  days: Array<Record<string, unknown>>;
  stamps: Array<Record<string, unknown>>;
}
const plannedDay = (over: Record<string, unknown> = {}) => ({
  ...dayFacts(),
  id: DAY1,
  day: '2026-10-24',
  event_id: null,
  float_cents: 50000,
  state: 'planned',
  hash: HASH,
  lines: [
    {
      product_id: 'dcf',
      name: 'Double Chocolate Fudge',
      made: 20,
      carried: 0,
      price_cents: 12500,
      ...lineFacts
    }
  ],
  ...over
});
const summary = (f: Fake) => ({
  summary: {
    booking: {
      id: BOOKING,
      name: booking.name,
      place: booking.place,
      starts_on: booking.starts_on,
      ends_on: booking.ends_on,
      rent_cents: booking.rent_cents,
      active: true
    },
    ...summaryFacts(250000, 'no cost'),
    days: f.days,
    hash: HASH
  },
  ...answerFacts(),
  target_profit_cents: null,
  finalised_at: null,
  stamps: f.stamps
});

function fakeClient(f: Fake) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'get_scheduled_events') return { data: [booking], error: null };
    if (name === 'get_bazaar') return { data: summary(f), error: null };
    if (name === 'save_bazaar_day') {
      const day = args.p_day as { id: string; day: string; float_cents: number };
      f.days = [
        plannedDay({
          id: day.id,
          day: day.day,
          float_cents: day.float_cents,
          lines: (args.p_day as { lines: Array<Record<string, number | string>> }).lines.map(
            (l) => ({
              product_id: l.product_id,
              name: 'Double Chocolate Fudge',
              made: l.made_qty,
              carried: l.carried_qty,
              price_cents: l.price_cents,
              ...lineFacts
            })
          )
        })
      ];
      f.stamps = [{ id: day.id, updated_at: STAMP }];
      return { data: [{ id: day.id, updated_at: STAMP }], error: null };
    }
    if (name === 'start_bazaar_day')
      return {
        data: [
          {
            event_id: args.p_event_id,
            selling_device: 'dev1',
            float_cents: 50000,
            prices: { dcf: 12500 },
            loaded: { dcf: 20 }
          }
        ],
        error: null
      };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const calls = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
async function mount(role: Role, f: Fake = { days: [], stamps: [] }) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  act(() => runtime.setState({ device: 'mobile' }));
  const fake = fakeClient(f);
  (runtime as unknown as { saleClient: unknown }).saleClient = fake.client;
  if (role === 'owner')
    await act(async () => {
      await runtime.loadScheduledEvents(fake.client as never);
      await runtime.loadFlavours({
        rpc: async () => ({ data: catalogueRows, error: null })
      } as never);
    });
  act(() => runtime.go('bazaar'));
  return { runtime, ...fake };
}
const label = (name: string) => document.querySelectorAll(`[data-screen-label="${name}"]`);
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const click = async (name: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
};
/** Types a number into a stepper the way she would: tap the number, type, Enter. */
const setStepper = (group: string, value: string) => {
  fireEvent.click(
    within(screen.getByRole('group', { name: group })).getByRole('button', {
      name: /Tap to type a number/
    })
  );
  const input = within(screen.getByRole('group', { name: group })).getByRole('textbox');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

beforeEach(() => {
  // JSDOM has no layout/scroll implementation; the real viewport is checked with Playwright.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  live = true;
  flavoursRead.reset();
  store.clear();
  localStorage.clear();
  clearBazaar();
  registerLiveBazaarScreens();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
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
});

describe('S2: the live Bazaar registers in the live slot', () => {
  it('registers under bazaar, and registering twice is harmless', () => {
    const first = registerLiveBazaarScreens();
    registerLiveBazaarScreens();
    expect(liveScreenFor('bazaar')).toBe(BazaarLive);
    first();
    expect(liveScreenFor('bazaar')).toBeUndefined();
    registerLiveBazaarScreens();
  });

  it('demo mode never draws it', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(
      <OpsRuntime ref={(r) => void (ref.current = r)}>
        <Frame />
      </OpsRuntime>
    );
    act(() => ref.current!.go('bazaar'));
    expect(ref.current!.renderVals().liveScreen).toBeUndefined();
    expect(label('Bazaar')).toHaveLength(0);
  });
});

describe('S2: with no event on the phone', () => {
  it('the owner sees her bookings, one live screen and none of the ported start list', async () => {
    const { runtime } = await mount('owner');
    expect(runtime.renderVals().liveScreen?.screen).toBe('bazaar');
    expect(runtime.renderVals().screens.bazaar).toBe(false);
    expect(label('Bazaar')).toHaveLength(1);
    expect(label('Bazaar Mode')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Katipunan market/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add an event' })).toBeTruthy();
    expect(screen.queryByText('Start an event')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Katipunan Weekend Market|UP Town Center/);
  });

  it('before her events are read the list says so, and never that there are none', async () => {
    const { runtime } = await mount('owner');
    // A fresh runtime that has read nothing yet.
    cleanup();
    const ref: { current: OpsRuntime | null } = { current: null };
    render(
      <OpsRuntime ref={(r) => void (ref.current = r)}>
        <Frame />
      </OpsRuntime>
    );
    act(() => ref.current!.setRole('owner'));
    act(() => ref.current!.setState({ device: 'mobile' }));
    act(() => ref.current!.go('bazaar'));
    expect(runtime).not.toBe(ref.current);
    expect(screen.getByText('Reading your events…')).toBeTruthy();
    expect(screen.queryByText(/No upcoming events yet/)).toBeNull();
    // The button is there but cannot be pressed until the read is in.
    expect(screen.getByRole('button', { name: 'Add an event' }).hasAttribute('disabled')).toBe(
      true
    );
    act(() => ref.current!.setState({ online: false }));
    expect(screen.getByText(/need signal to load/)).toBeTruthy();
    // Mutation: "No upcoming events yet" before the read lets her add a booking that is already there.
  });

  it('a helper is told a day is started by the owner, and is offered nothing to start', async () => {
    await mount('helper');
    expect(screen.getByText(/started by the owner, with signal/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start this day|Add an event/ })).toBeNull();
  });

  it('plans a day, saves it exactly as typed, then starts it into the till at its own prices', async () => {
    const { runtime, rpc } = await mount('owner');
    await click(/Katipunan market/);
    expect(calls(rpc, 'get_bazaar')[0]![1]).toEqual({ p_booking: BOOKING });
    expect(screen.getByRole('heading', { level: 1, name: 'Katipunan market' })).toBeTruthy();
    expect(screen.getByText('No day is planned yet.')).toBeTruthy();

    await click('Plan Sat, 24 Oct →');
    const form = screen.getByRole('form', { name: /Plan for Sat, 24 Oct/ });
    expect(within(form).queryByRole('group', { name: /carried over/ })).toBeNull(); // day 1 carries nothing
    setStepper('Drawer float', '500');
    setStepper('Double Chocolate Fudge made', '20');
    // The price is the menu's until she changes it.
    fireEvent.click(
      within(form).getByRole('button', { name: 'Change the price of Double Chocolate Fudge' })
    );
    fireEvent.change(within(form).getByLabelText('Double Chocolate Fudge price'), {
      target: { value: '125' }
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the plan →' }));
    await settle();

    const [[, saved]] = calls(rpc, 'save_bazaar_day');
    expect(saved).toEqual({
      p_day: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        scheduled_id: BOOKING,
        day: '2026-10-24',
        float_cents: 50000,
        lines: [{ product_id: 'dcf', made_qty: 20, carried_qty: 0, price_cents: 12500 }]
      },
      p_expected_updated_at: null
    });
    expect(screen.getByText('20 cookies on the table')).toBeTruthy();
    const dayId = (saved!.p_day as { id: string }).id;

    // Start: this day is not today (A2), so it asks first; the server is asked once, for this day, under the event id the day
    // always has.
    await click('Start the day →');
    expect(calls(rpc, 'start_bazaar_day')).toHaveLength(0);
    expect(
      screen.getByText(/This day is Sat, 24 Oct\. Today is Tue, 20 Oct\. Sales will be dated today/)
    ).toBeTruthy();
    await click('Start anyway');
    await waitFor(() => expect(calls(rpc, 'start_bazaar_day')).toHaveLength(1));
    const [[, start]] = calls(rpc, 'start_bazaar_day');
    expect(start).toEqual({ p_day: dayId, p_device: 'dev1', p_event_id: await dayEventId(dayId) });
    expect(runtime.state.event).toMatchObject({ stage: 'selling', dayId });
    // The ported till is drawn, once, and the planning screen has gone.
    expect(label('Bazaar Mode')).toHaveLength(1);
    expect(label('Bazaar')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Start the day →' })).toBeNull();
    // Mutation: starting through the old path would sell at the menu prices with no plan behind them.
  });

  it('says what is wrong with a plan in words, and sends nothing', async () => {
    const { rpc } = await mount('owner');
    await click(/Katipunan market/);
    await click('Plan Sat, 24 Oct →');
    fireEvent.click(screen.getByRole('button', { name: 'Save the plan →' }));
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/at least one cookie/);
    expect(calls(rpc, 'save_bazaar_day')).toHaveLength(0);
  });

  it('with no signal a planned day cannot be started and says why; nothing is asked of the server', async () => {
    const { runtime, rpc } = await mount('owner', {
      days: [plannedDay()],
      stamps: [{ id: DAY1, updated_at: STAMP }]
    });
    await click(/Katipunan market/);
    act(() => runtime.setState({ online: false }));
    const start = screen.getByRole('button', { name: 'Start the day →' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText('Starting a day needs signal. Selling does not.')).toBeTruthy();
    fireEvent.click(start);
    await settle();
    expect(calls(rpc, 'start_bazaar_day')).toHaveLength(0);
  });

  it('a day with no cookies planned cannot be started', async () => {
    await mount('owner', {
      days: [plannedDay({ lines: [] })],
      stamps: [{ id: DAY1, updated_at: STAMP }]
    });
    await click(/Katipunan market/);
    expect(
      (screen.getByRole('button', { name: 'Start the day →' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText('Plan some cookies first')).toBeTruthy();
  });

  it('a day cannot start while another day of the booking is still open', async () => {
    const day2 = plannedDay({ id: 'd5a00000-0000-4000-8000-000000000002', day: '2026-10-25' });
    await mount('owner', {
      days: [plannedDay({ state: 'open', event_id: 'd5e00000-0000-4000-8000-000000000001' }), day2],
      stamps: [
        { id: DAY1, updated_at: STAMP },
        { id: 'd5a00000-0000-4000-8000-000000000002', updated_at: STAMP }
      ]
    });
    await click(/Katipunan market/);
    expect(screen.getByText('Close the day that is still open first')).toBeTruthy();
    // An open day is sold on the phone that started it: no button here takes it over.
    expect(
      screen.getByText(
        'Selling on another of your devices. Tap Sell on this device to sell and close it here.'
      )
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start this day' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Sell on this phone/ })).toBeNull();
  });
});

describe('S2: with an event on the phone, the ported till is drawn unchanged', () => {
  const seedDay = (runtime: OpsRuntime) =>
    act(() =>
      runtime.setState({
        event: {
          id: 'd5e00000-0000-4000-8000-000000000001',
          name: 'Katipunan market',
          date: 'Sat, Oct 24',
          stage: 'selling',
          snapshot: ['dcf'],
          dayId: DAY1,
          scheduledId: BOOKING,
          floatCents: 50000
        } as never,
        eventStock: { dcf: 20 },
        eventPrices: { dcf: 125 }
      })
    );

  for (const role of ['owner', 'helper'] as const) {
    it(`the ${role} sells with no signal and no read of the owner's data`, async () => {
      const { runtime } = await mount(role);
      act(() => runtime.setState({ online: false }));
      seedDay(runtime);
      expect(label('Bazaar Mode')).toHaveLength(1);
      expect(label('Bazaar')).toHaveLength(0);
      expect(document.body.textContent).toContain('Katipunan market');
      // Mutation: deciding the till from the owner's data would show a helper or an offline owner the planning screen.
    });
  }

  for (const classic of [false, true]) {
    it(`opens Events first from the main navigation with a held ${classic ? 'classic' : 'new'} till`, async () => {
      if (classic) localStorage.setItem('hc-live-classic-till', '1');
      const { runtime, rpc } = await mount('owner');
      seedDay(runtime);
      act(() => runtime.setState({ cart: { dcf: 2 } } as never));
      const held = runtime.state.event,
        cart = runtime.state.cart,
        stock = runtime.state.eventStock;
      act(() => runtime.go('today'));
      act(() =>
        runtime
          .renderVals()
          .dockNav.find((item) => item.label === 'Bazaar')!
          .go()
      );
      await settle();
      expect(screen.getByRole('heading', { name: /^Bazaar events$/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^Return to selling$/ })).toBeTruthy();
      expect(runtime.state.event).toBe(held);
      expect(runtime.state.cart).toBe(cart);
      expect(runtime.state.eventStock).toBe(stock);
      await click('Return to selling');
      expect(screen.getByRole('button', { name: /^Back to events$/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Events$/ })).toBeNull();
      expect(rpc.mock.calls.every(([name]) => String(name).startsWith('get_'))).toBe(true);
    });
    it(`browses Events and resumes the same ${classic ? 'classic' : 'new'} till without posting`, async () => {
      if (classic) localStorage.setItem('hc-live-classic-till', '1');
      const { runtime, rpc } = await mount('owner', {
        days: [plannedDay({ state: 'open', event_id: 'd5e00000-0000-4000-8000-000000000001' })],
        stamps: [{ id: DAY1, updated_at: STAMP }]
      });
      seedDay(runtime);
      act(() =>
        runtime.setState({
          cart: { dcf: 2 },
          eventLoaded: { dcf: 20 },
          drawer: { float: 500, counted: '610' }
        } as never)
      );
      const held = runtime.state.event;
      const cart = runtime.state.cart;
      const stock = runtime.state.eventStock;
      const prices = runtime.state.eventPrices;
      const sales = runtime.state.sales;
      const drawer = runtime.state.drawer;
      const before = rpc.mock.calls.length;
      await click('Back to events');
      expect(label('Bazaar Mode')).toHaveLength(0);
      expect(runtime.renderVals().showTopBar).toBe(true);
      expect(screen.getAllByRole('button', { name: 'Return to selling' })).toHaveLength(1);
      await click(/^Past/);
      await click(/Katipunan market/);
      await click('All events');
      expect(document.activeElement?.getAttribute('data-event-id')).toBe(BOOKING);
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
      expect(screen.getByRole('button', { name: /Past/ }).getAttribute('aria-pressed')).toBe(
        'true'
      );
      await click(/Katipunan market/);
      expect(screen.getByText('Selling on this device')).toBeTruthy();
      expect(
        screen.queryByText(
          'Selling on another of your devices. Tap Sell on this device to sell and close it here.'
        )
      ).toBeNull();
      await click('Resume selling');
      expect(label('Bazaar Mode')).toHaveLength(1);
      expect(runtime.state.event).toEqual(held);
      expect(runtime.state.cart).toBe(cart);
      expect(runtime.state.eventStock).toBe(stock);
      expect(runtime.state.eventPrices).toBe(prices);
      expect(runtime.state.sales).toBe(sales);
      expect(runtime.state.drawer).toEqual(drawer);
      expect(
        rpc.mock.calls
          .slice(before)
          .every(([name]) => ['get_bazaar', 'get_scheduled_events'].includes(name))
      ).toBe(true);
    });
  }

  it('an unavailable direct event keeps a truthful error and the held till', async () => {
    const { runtime } = await mount('owner');
    seedDay(runtime);
    const held = runtime.state.event;
    const missing = 'd5b00000-0000-4000-8000-000000000099';
    act(() => runtime.renderVals().liveBazaar!.navigation!.restore(`event:${missing}`));
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('This event could not be read');
    expect(runtime.state.event).toBe(held);
    await click('Return to selling');
    expect(label('Bazaar Mode')).toHaveLength(1);
  });

  it('a late event read cannot reopen browsing after the gate narrows', async () => {
    const { runtime, rpc } = await mount('owner');
    seedDay(runtime);
    const held = runtime.state.event;
    const original = rpc.getMockImplementation()!;
    const finish: Array<() => void> = [];
    rpc.mockImplementation(async (name, args = {}) => {
      const result = await original(name, args);
      if (name === 'get_bazaar') await new Promise<void>((done) => finish.push(done));
      return result;
    });
    act(() => runtime.renderVals().liveBazaar!.navigation!.restore(`event:${BOOKING}`));
    await settle();
    expect(finish.length).toBeGreaterThan(0);
    act(() => runtime.setGateAccess(true));
    await act(async () => {
      finish.forEach((done) => done());
    });
    act(() => runtime.setGateAccess(false));
    expect(runtime.renderVals().liveBazaar!.navigation!.route).toBe('till');
    expect(runtime.renderVals().liveBazaar!.event).toBeNull();
    expect(runtime.state.event).toBe(held);
    expect(label('Bazaar Mode')).toHaveLength(1);
  });

  it('rechecks a saved Events action and hides the directory when access narrows', async () => {
    const { runtime } = await mount('owner');
    seedDay(runtime);
    const events = runtime.renderVals().liveBazaar!.navigation!.events!;
    await click('Back to events');
    act(() => runtime.setGateAccess(true));
    expect(label('Bazaar Mode')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Back to events' })).toBeNull();
    act(() => events());
    expect(label('Bazaar')).toHaveLength(0);
    act(() => runtime.setGateAccess(false));
    expect(label('Bazaar Mode')).toHaveLength(1);
    await click('Back to events');
    act(() => runtime.setState({ online: false }));
    expect(label('Bazaar Mode')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Back to events' })).toBeNull();
    // Signal back mid-sale: the till stays; Events opens again only when the owner chooses it.
    act(() => runtime.setState({ online: true }));
    expect(label('Bazaar Mode')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back to events' })).toBeTruthy();
  });

  it('keeps helper access selling-only even with signal', async () => {
    const { runtime } = await mount('helper');
    seedDay(runtime);
    act(() => runtime.setState({ online: true }));
    expect(screen.queryByRole('button', { name: 'Back to events' })).toBeNull();
    expect(label('Bazaar Mode')).toHaveLength(1);
  });

  it('cannot leave a close review exposed after access narrows', async () => {
    const { runtime } = await mount('owner', {
      days: [plannedDay({ state: 'open', event_id: 'd5e00000-0000-4000-8000-000000000001' })],
      stamps: [{ id: DAY1, updated_at: STAMP }]
    });
    seedDay(runtime);
    act(() => runtime.renderVals().askClose());
    await settle();
    expect(runtime.renderVals().liveBazaar!.reviewing).toBe(true);
    act(() => runtime.setGateAccess(true));
    expect(runtime.renderVals().liveBazaar!.reviewing).toBe(false);
    expect(label('Bazaar Mode')).toHaveLength(1);
  });

  it('the consolidated till has no Leave: it never clears the day from the phone', async () => {
    const { runtime } = await mount('owner');
    seedDay(runtime);
    expect(document.querySelector('[data-till="consolidated"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });

  it('on the classic till, Leave does not close the day, and its stock stays on the table', async () => {
    // The phone chose the classic till (19 October): it is restored on mount.
    localStorage.setItem('hc-live-classic-till', '1');
    const { runtime } = await mount('owner');
    seedDay(runtime);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await settle();
    expect(runtime.state.event).toMatchObject({ dayId: DAY1, stage: 'selling' });
    expect(runtime.state.eventStock).toMatchObject({ dcf: 20 });
    expect(label('Bazaar Mode')).toHaveLength(1);
  });

  it('an event from before the days existed is drawn the same way', async () => {
    const { runtime } = await mount('owner');
    act(() =>
      runtime.setState({
        event: {
          id: 'd5e00000-0000-4000-8000-000000000009',
          name: 'Fair',
          stage: 'selling'
        } as never
      })
    );
    expect(label('Bazaar Mode')).toHaveLength(1);
    await click('Back to events');
    expect(label('Bazaar')).toHaveLength(1);
    await click('Return to selling');
    expect(runtime.state.event).toMatchObject({ name: 'Fair' });
    expect(label('Bazaar Mode')).toHaveLength(1);
  });
});
