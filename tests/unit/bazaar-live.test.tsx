import { act } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import type { Role } from '@/store/engine/ops-engine';

/**
 * S2: the live Bazaar screen. With no event on the phone it is the owner's event list, an event's page and a day's plan;
 * with an event it is the ported till, unchanged, for the owner, a helper, and a phone with no signal. Each `Mutation:`
 * line names a change one of these tests must catch.
 */
const NOW = new Date('2026-10-20T03:00:00Z');
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
      price_cents: 12500
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
    days: f.days,
    fees: { total_cents: 250000 },
    profit: { cents: null, why: 'no cost' },
    hash: HASH
  },
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
              price_cents: l.price_cents
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
    await act(async () => void (await runtime.loadScheduledEvents(fake.client as never)));
  act(() => runtime.go('bazaar'));
  return { runtime, ...fake };
}
const label = (name: string) => document.querySelectorAll(`[data-screen-label="${name}"]`);
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const click = async (name: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
};

beforeEach(() => {
  live = true;
  store.clear();
  localStorage.clear();
  clearBazaar();
  registerLiveBazaarScreens();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

    await click(/Sat, Oct 24/);
    const form = screen.getByRole('form', { name: /Plan for Sat, Oct 24/ });
    expect(within(form).queryByLabelText('Carried over')).toBeNull(); // day 1 carries nothing
    fireEvent.change(within(form).getByLabelText('Drawer float (₱)'), { target: { value: '500' } });
    const dcf = within(within(form).getByText('Double Chocolate Fudge').closest('li')!);
    fireEvent.change(dcf.getByLabelText('Made'), { target: { value: '20' } });
    fireEvent.change(dcf.getByLabelText('Price (₱)'), { target: { value: '125' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the plan' }));
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

    // Start: the server is asked once, for this day, under the event id the day always has.
    await click('Start this day');
    const [[, start]] = calls(rpc, 'start_bazaar_day');
    expect(start).toEqual({ p_day: dayId, p_device: 'dev1', p_event_id: await dayEventId(dayId) });
    expect(runtime.state.event).toMatchObject({ stage: 'selling', dayId });
    // The ported till is drawn, once, and the planning screen has gone.
    expect(label('Bazaar Mode')).toHaveLength(1);
    expect(label('Bazaar')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Start this day' })).toBeNull();
    // Mutation: starting through the old path would sell at the menu prices with no plan behind them.
  });

  it('says what is wrong with a plan in words, and sends nothing', async () => {
    const { rpc } = await mount('owner');
    await click(/Katipunan market/);
    await click(/Sat, Oct 24/);
    fireEvent.click(screen.getByRole('button', { name: 'Save the plan' }));
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
    const start = screen.getByRole('button', { name: 'Start this day' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText('Needs signal')).toBeTruthy();
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
      (screen.getByRole('button', { name: 'Start this day' }) as HTMLButtonElement).disabled
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
    const resume = screen.getByRole('button', { name: 'Sell on this phone' }) as HTMLButtonElement;
    expect(resume.disabled).toBe(false);
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
          scheduledId: BOOKING
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

  it('Leave does not close the day, and its stock stays on the table', async () => {
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
  });
});
