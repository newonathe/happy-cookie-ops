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
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import { saveStallCopy } from '@/lib/offline/stall-copy';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import type { FlavourRow, FlavoursClient } from '@/lib/data/flavours';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import type { Role } from '@/store/engine/ops-engine';
import { answerFacts, dayFacts, lineFacts, summaryFacts } from '../fixtures/bazaar-answer';

/**
 * HCB-004 finding a: the owner's Bazaar after the catalogue read (`get_flavours`) fails. The engine's six
 * built-in flavours (Double Chocolate Fudge at P130) must never be offered as her products and prices to plan a day
 * or start one. Offline selling is untouched: a phone that holds her real catalogue (a read, or the copy kept for
 * an offline open), or a day already selling on it, keeps selling from what it holds. Every test reads what she
 * sees and can do: names, buttons, notices.
 */
const NOW = new Date('2026-10-20T03:00:00Z');
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';
const DAY1 = 'd5a00000-0000-4000-8000-000000000001';
const STAMP = '2026-10-20T02:00:00.123456+00:00';
const HASH = 'a'.repeat(64);
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };

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
  published: false,
  sort_order: sort,
  updated_at: '2026-11-01T01:00:00.000Z'
});
const GOOD = [flavour('qa-one', 'QA Alpha', 17500, 1), flavour('qa-two', 'QA Beta', 21000, 2)];

type Answer = { data: unknown; error: unknown };
const ok = (rows: FlavourRow[]): Answer => ({ data: rows, error: null });
const down: Answer = { data: null, error: { code: '', message: 'network' } };

/** The bookings client the Bazaar uses: one booking, no day yet, and a day it will start at its own prices. */
function bazaarClient(planned: string[] = []) {
  const days: Array<Record<string, unknown>> = planned.map((ymd, i) => ({
    ...dayFacts(),
    id: `d5a00000-0000-4000-8000-00000000000${i + 1}`,
    day: ymd,
    event_id: null,
    float_cents: 50000,
    state: 'planned',
    hash: HASH,
    lines: [
      {
        product_id: 'qa-one',
        name: 'QA Alpha',
        made: 10,
        carried: 0,
        price_cents: 17500,
        ...lineFacts
      }
    ]
  }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'get_scheduled_events') return { data: [booking], error: null };
    if (name === 'get_bazaar')
      return {
        data: {
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
            days,
            hash: HASH
          },
          ...answerFacts(),
          target_profit_cents: null,
          finalised_at: null,
          stamps: days.map((d) => ({ id: d.id, updated_at: STAMP }))
        },
        error: null
      };
    if (name === 'save_bazaar_day') {
      const day = args.p_day as {
        id: string;
        day: string;
        float_cents: number;
        lines: Array<Record<string, number | string>>;
      };
      days.splice(0, days.length, {
        ...dayFacts(),
        id: day.id,
        day: day.day,
        event_id: null,
        float_cents: day.float_cents,
        state: 'planned',
        hash: HASH,
        lines: day.lines.map((l) => ({
          product_id: l.product_id,
          name: String(l.product_id),
          made: l.made_qty,
          carried: l.carried_qty,
          price_cents: l.price_cents,
          ...lineFacts
        }))
      });
      return { data: [{ id: day.id, updated_at: STAMP }], error: null };
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}

/** A catalogue client whose reads wait for the test to answer them. */
function catalogue() {
  const waiting: Array<(a: Answer) => void> = [];
  const rpc = vi.fn((name: string) =>
    name === 'get_flavours'
      ? new Promise<Answer>((resolve) => void waiting.push(resolve))
      : Promise.resolve({ data: null, error: down.error })
  );
  return {
    client: { rpc } as unknown as FlavoursClient,
    answer: (a: Answer) => {
      const next = waiting.shift();
      if (!next) throw Error('no catalogue read is waiting');
      next(a);
    },
    pending: () => waiting.length
  };
}

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const click = async (name: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
};
const tryAgain = () => screen.queryByRole('button', { name: /try again/i });
const pesos = () => screen.queryAllByText(/₱\s?\d/);

async function mount(role: Role = 'owner', planned: string[] = []) {
  const ref: { current: OpsRuntime | null } = { current: null };
  const view = render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  act(() => runtime.setState({ device: 'mobile' }));
  const fake = bazaarClient(planned);
  (runtime as unknown as { saleClient: unknown }).saleClient = fake.client;
  if (role === 'owner')
    await act(async () => void (await runtime.loadScheduledEvents(fake.client as never)));
  act(() => runtime.go('bazaar'));
  return { runtime, view, ...fake };
}
/** Reads the catalogue the way the live gate does, answering as the test says. */
async function readCatalogue(runtime: OpsRuntime, answer: Answer) {
  const c = catalogue();
  let read!: Promise<boolean>;
  act(() => void (read = runtime.loadFlavours(c.client)));
  await act(async () => {
    c.answer(answer);
    await read;
  });
  return c;
}
/** Taps the first day's Plan button, when it can be tapped. */
async function tryPlan() {
  const plan = screen.queryByRole('button', { name: 'Plan Sat, 24 Oct →' });
  if (plan && !(plan as HTMLButtonElement).disabled) await click('Plan Sat, 24 Oct →');
}
/** Opens the booking and then the plan form for its first day. */
async function openPlanForm() {
  await click(/Katipunan market/);
  await click('Plan Sat, 24 Oct →');
}
const seedDay = (
  runtime: OpsRuntime,
  ids: Record<string, number>,
  prices: Record<string, number>
) =>
  act(() =>
    runtime.setState({
      event: {
        id: 'd5e00000-0000-4000-8000-000000000001',
        name: 'Katipunan market',
        date: 'Sat, Oct 24',
        stage: 'selling',
        snapshot: Object.keys(prices),
        dayId: DAY1,
        scheduledId: BOOKING,
        floatCents: 50000
      } as never,
      eventStock: { ...ids },
      eventLoaded: { ...ids },
      eventPrices: { ...prices }
    })
  );

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  live = true;
  store.clear();
  localStorage.clear();
  clearBazaar();
  flavoursRead.reset();
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
  localStorage.clear();
});

describe('HCB-004 a: the Bazaar plan and a failed or unread catalogue read', () => {
  it('A. a read catalogue plans the day with her own products and prices', async () => {
    const { runtime } = await mount();
    await readCatalogue(runtime, ok(GOOD));
    await openPlanForm();
    const form = screen.getByRole('form', { name: /Plan for Sat, 24 Oct/ });
    expect(within(form).getByRole('group', { name: 'QA Alpha made' })).toBeTruthy();
    expect(within(form).getByRole('group', { name: 'QA Beta made' })).toBeTruthy();
    expect(within(form).queryByText('Double Chocolate Fudge')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save the plan →' })).toBeTruthy();
    expect(tryAgain()).toBeNull();
  });

  it('B. a failed first read with nothing on the phone offers no built-in product or price, and says why', async () => {
    const { runtime, rpc } = await mount();
    await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    // The event page: no day can be planned or started on products that are not hers.
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(tryAgain()).toBeTruthy();
    const plan = screen.queryByRole('button', { name: 'Plan Sat, 24 Oct →' });
    expect(plan === null || (plan as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
    expect(pesos().filter((n) => /130/.test(n.textContent ?? ''))).toEqual([]);
    expect(rpc.mock.calls.some((c) => c[0] === 'save_bazaar_day')).toBe(false);
  });

  it('B2. after a failed read, trying to plan a day anyway shows no built-in product and saves nothing', async () => {
    const { runtime, rpc } = await mount();
    await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    await tryPlan();
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
    expect(screen.queryByRole('group', { name: /Double Chocolate Fudge made/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save the plan →' })).toBeNull();
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(rpc.mock.calls.some((c) => c[0] === 'save_bazaar_day')).toBe(false);
  });

  it('B3. before the first read has answered, trying to plan a day offers no built-in product either', async () => {
    const { runtime } = await mount();
    const c = catalogue();
    act(() => void runtime.loadFlavours(c.client)); // the read is out, not answered
    await click(/Katipunan market/);
    await tryPlan();
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
    expect(screen.queryByRole('group', { name: /Double Chocolate Fudge made/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save the plan →' })).toBeNull();
    expect(screen.getByText(/have not been read yet/i)).toBeTruthy();
  });

  it('C. offline with the catalogue the phone kept: the day she is selling carries on, and its flavours are hers', async () => {
    // The copy a passed check keeps for an offline open (A2): her flavours, not the engine's six.
    saveStallCopy(
      {},
      GOOD.map((f) => ({ ...f }))
    );
    const { runtime } = await mount();
    act(() => runtime.setState({ online: false }));
    act(() => runtime.restoreStallCopy());
    seedDay(runtime, { 'qa-one': 12, 'qa-two': 8 }, { 'qa-one': 175, 'qa-two': 210 });
    await settle();
    expect(screen.getByText('QA Alpha')).toBeTruthy();
    expect(screen.getByText('QA Beta')).toBeTruthy();
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /QA Alpha/ }));
    await settle();
    const charges = screen.getAllByRole('button', { name: /^Charge/ });
    expect(charges.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(charges[0]!.textContent).toContain('175');
  });

  it('C2. offline with the phone-kept catalogue, an owner can still look at her booking without a notice that blocks selling', async () => {
    saveStallCopy(
      {},
      GOOD.map((f) => ({ ...f }))
    );
    const { runtime } = await mount();
    act(() => runtime.restoreStallCopy());
    await click(/Katipunan market/);
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    const plan = screen.getByRole('button', { name: 'Plan Sat, 24 Oct →' });
    expect((plan as HTMLButtonElement).disabled).toBe(false);
  });

  it('D. a day already selling on this phone is not interrupted or emptied by a failed catalogue read', async () => {
    const { runtime } = await mount();
    seedDay(runtime, { dcf: 20 }, { dcf: 125 });
    await settle();
    fireEvent.click(screen.getAllByRole('button', { name: /Double Chocolate Fudge/ })[0]!);
    await settle();
    await readCatalogue(runtime, down);
    await settle();
    // Still her day's own tile, price and sale; no notice over the till.
    expect(
      screen.getAllByRole('button', { name: /Double Chocolate Fudge/ }).length
    ).toBeGreaterThan(0);
    const charges = screen.getAllByRole('button', { name: /^Charge/ });
    expect(charges.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(charges[0]!.textContent).toContain('125');
    expect(charges[0]!.textContent).not.toContain('130');
    // Only what her day put on the table is drawn: none of the other built-in flavours.
    expect(screen.queryByText(String(PORTED.list[1]!.short))).toBeNull();
    expect(runtime.state.event).toMatchObject({ stage: 'selling', dayId: DAY1 });
    expect(runtime.state.cart).toMatchObject({ dcf: 1 });
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });

  it('E. a failed first read, then Try again that succeeds: her products and prices appear and planning is enabled', async () => {
    const { runtime } = await mount();
    const first = await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    expect(tryAgain()).toBeTruthy();
    const retry = flavoursRead.get().retry!;
    expect(retry).toBeTruthy();
    act(() => retry());
    await act(async () => {
      first.answer(ok(GOOD));
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    expect(tryAgain()).toBeNull();
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    await click('Plan Sat, 24 Oct →');
    const form = screen.getByRole('form', { name: /Plan for Sat, 24 Oct/ });
    expect(within(form).getByRole('group', { name: 'QA Alpha made' })).toBeTruthy();
    expect(within(form).queryByText('Double Chocolate Fudge')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save the plan →' })).toBeTruthy();
  });

  it('G. every disabled Plan, Start and Change-the-plan button gives the reason as its accessible description', async () => {
    const { runtime } = await mount('owner', ['2026-10-24', '2026-10-25']);
    await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    const buttons = [
      screen.getByRole('button', { name: /^Start the day/ }),
      screen.getByRole('button', { name: 'Start this day' }),
      ...screen.getAllByRole('button', { name: 'Change the plan' })
    ];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b).toHaveAccessibleDescription('Needs your products and prices.');
      // No dangling reference: every id the button points at is on the page.
      for (const id of (b.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean))
        expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('G2. a Plan button on a day not yet planned is described the same way', async () => {
    const { runtime } = await mount();
    await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    for (const b of screen.getAllByRole('button', { name: /^Plan / }))
      expect(b).toHaveAccessibleDescription('Needs your products and prices.');
  });

  it('H. a read that succeeded and a later retry that FAILS keeps her rows, and Plan and Start stay enabled', async () => {
    const { runtime } = await mount('owner', ['2026-10-24']);
    const c = await readCatalogue(runtime, ok(GOOD));
    act(() => flavoursRead.get().retry!());
    await act(async () => {
      c.answer(down);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(flavoursRead.get()).toMatchObject({ phase: 'failed', everRead: true });
    await click(/Katipunan market/);
    expect(screen.queryByText(/products and prices (have not been|could not be) read/i)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /^Start the day/ }) as HTMLButtonElement).disabled
    ).toBe(false);
    await click('Change the plan');
    const form = screen.getByRole('form', { name: /Plan for Sat, 24 Oct/ });
    expect(within(form).getByRole('group', { name: 'QA Alpha made' })).toBeTruthy();
    expect(within(form).queryByText('Double Chocolate Fudge')).toBeNull();
  });

  it('I. the notice clears and buttons enable on the render of a successful Try again, with no engine render after it', async () => {
    const { runtime } = await mount('owner', ['2026-10-24']);
    await readCatalogue(runtime, down);
    await click(/Katipunan market/);
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    // The read state moves on; the runtime is not asked to render (nothing here touches its state).
    const reader = {};
    act(() => {
      flavoursRead.claim(reader);
      flavoursRead.publish(reader, {
        phase: 'read',
        everRead: true,
        empty: false,
        readAt: Date.now(),
        retry: null
      });
    });
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /^Start the day/ }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('F1. a catalogue answer after the page is gone changes nothing', async () => {
    const { runtime, view } = await mount();
    const c = catalogue();
    let read!: Promise<boolean>;
    act(() => void (read = runtime.loadFlavours(c.client)));
    view.unmount();
    await act(async () => {
      c.answer(ok(GOOD));
      await read.catch(() => undefined);
    });
    expect(flavoursRead.get().phase === 'read' && flavoursRead.get().everRead).toBe(false);
  });

  it('F2. a late answer from a retired reader does not make the till look read', async () => {
    const { runtime } = await mount();
    const old = catalogue();
    act(() => void runtime.loadFlavours(old.client));
    await readCatalogue(runtime, down); // a newer reader takes over and fails
    await act(async () => {
      old.answer(ok(GOOD));
      await new Promise((r) => setTimeout(r, 0));
    });
    await click(/Katipunan market/);
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(screen.queryByText('QA Alpha')).toBeNull();
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
  });
});
