import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { answerFacts, dayFacts, lineFacts, summaryFacts } from '../fixtures/bazaar-answer';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
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
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));

import { OpsRuntime } from '@/store/ops-runtime';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import type { OpsVals } from '@/view-models/vals';
import type { LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';

/**
 * S3 in the runtime: "Close out" on a started day opens its review (never the old close-out), a closed day leaves the
 * phone without moving its leftovers into the shop's baked stock, nothing is closed over sales still on the phone, the
 * drawer float survives a reload, and the books say when a bazaar is held back.
 */
const DAY = 'd5a00000-0000-4000-8000-000000000001';
const BOOKING = 'd5b00000-0000-4000-8000-000000000001';
const STAMP = '2026-10-20T02:00:00.123456+00:00';

function mounted() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  return ref.current!;
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
const vals = (runtime: OpsRuntime) => runtime.renderVals() as OpsVals;
const liveBazaar = (runtime: OpsRuntime) =>
  (vals(runtime) as OpsVals & { liveBazaar?: LiveBazaarVals | null }).liveBazaar ?? null;

/** `get_bazaar` for one booking whose one day is open, or closed with her count. */
function bazaarAnswer(state: 'open' | 'closed') {
  const lines = [
    {
      product_id: 'dcf',
      name: 'Double Chocolate Fudge',
      made: 20,
      carried: 0,
      price_cents: 12500,
      ...lineFacts
    },
    { product_id: 'wcb', name: 'White Choc', made: 5, carried: 0, price_cents: 9000, ...lineFacts }
  ];
  return {
    summary: {
      booking: {
        id: BOOKING,
        name: 'Katipunan market',
        place: 'Hall',
        starts_on: '2026-10-24',
        ends_on: '2026-10-25',
        rent_cents: 0,
        active: true
      },
      ...summaryFacts(0),
      counted: state === 'closed',
      days: [
        {
          ...dayFacts(),
          id: DAY,
          day: '2026-10-24',
          event_id: 'd5e00000-0000-4000-8000-000000000001',
          float_cents: 50000,
          cash_expected_cents: 50000,
          lines,
          state,
          hash: 'e'.repeat(64),
          ...(state === 'closed'
            ? {
                closed_at: 1_792_846_800_000,
                counted_cents: 50000,
                over_cents: 0,
                short_cents: 0,
                count: lines.map((l) => ({
                  product_id: l.product_id,
                  left: l.made,
                  carry_next: l.made,
                  to_shop: 0,
                  written_off: 0,
                  not_accounted: 0
                }))
              }
            : {})
        }
      ],
      hash: 'f'.repeat(64)
    },
    ...answerFacts(),
    target_profit_cents: null,
    updated_at: STAMP,
    finalised_at: null,
    stamps: [{ id: DAY, day: '2026-10-24', updated_at: STAMP }]
  };
}

function fakeDatabase() {
  let closed = false;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'start_bazaar_day')
      return {
        data: [
          {
            event_id: args.p_event_id,
            selling_device: 'dev1',
            float_cents: 50000,
            prices: { dcf: 12500, wcb: 9000 },
            loaded: { dcf: 20, wcb: 5 }
          }
        ],
        error: null
      };
    if (name === 'get_bazaar')
      return { data: bazaarAnswer(closed ? 'closed' : 'open'), error: null };
    if (name === 'close_bazaar_day') {
      closed = true;
      return { data: { hash: 'f'.repeat(64) }, error: null };
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}

async function startedDay() {
  const runtime = mounted();
  const db = fakeDatabase();
  (runtime as unknown as { saleClient: unknown }).saleClient = db.client;
  act(() => runtime.setState({ role: 'owner', online: true, baked: { dcf: 3, wcb: 4 } } as never));
  await act(async () => {
    await (
      runtime as unknown as {
        beginBazaarDay: (
          b: { id: string; name: string },
          d: { id: string; day: string }
        ) => Promise<string>;
      }
    ).beginBazaarDay({ id: BOOKING, name: 'Katipunan market' }, { id: DAY, day: '2026-10-24' });
  });
  return { runtime, db };
}
const count = {
  countedPesos: '500',
  rows: [
    { productId: 'dcf', left: '20', carryNext: '20', toShop: '', writtenOff: '' },
    { productId: 'wcb', left: '5', carryNext: '5', toShop: '', writtenOff: '' }
  ]
};

beforeEach(() => {
  store.clear();
  localStorage.clear();
  clearBazaar();
});
afterEach(() => cleanup());

describe('"Close out" on a started day', () => {
  it('opens the day review, read from the database, and never the old close-out', async () => {
    const { runtime, db } = await startedDay();
    act(() => vals(runtime).askClose());
    await settle();
    expect((runtime.state.sheet as { kind?: string } | null)?.kind).not.toBe('closeout');
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'get_bazaar')).toEqual([
      ['get_bazaar', { p_booking: BOOKING }]
    ]);
    expect(liveBazaar(runtime)?.reviewing).toBe(true);
    expect(liveBazaar(runtime)?.review?.dayId).toBe(DAY);
    // Mutation: leaving the engine's askClose in place opens the close-out the database refuses.
  });

  it('with no signal asks nothing and says so; selling carries on', async () => {
    const { runtime, db } = await startedDay();
    act(() => runtime.setState({ online: false } as never));
    act(() => vals(runtime).askClose());
    await settle();
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'get_bazaar')).toHaveLength(0);
    expect(JSON.stringify(runtime.state.toast)).toMatch(/needs signal/);
    expect((runtime.state.event as { stage?: string }).stage).toBe('selling');
  });
});

describe('after the day is closed', () => {
  it("the phone lets go of the day, and the leftovers do not go into the shop's baked stock", async () => {
    const { runtime } = await startedDay();
    act(() => vals(runtime).askClose());
    await settle();
    let words: string | null = 'not sent';
    await act(async () => {
      words = await liveBazaar(runtime)!.review!.close!.submit(count);
    });
    await settle();
    expect(words).toBeNull();
    expect(runtime.state.event).toBeNull();
    expect(runtime.state.eventStock).toEqual({});
    expect(runtime.state.baked).toEqual({ dcf: 3, wcb: 4 });
    expect(localStorage.getItem('hc-live-bazaar')).toBeNull();
    // Mutation: clearing the phone through the engine's resetEvent puts 25 cookies into baked stock.
  });

  it('is not closed while a sale is still on the phone, and the phone keeps the day', async () => {
    const { runtime, db } = await startedDay();
    act(() => vals(runtime).askClose());
    await settle();
    act(() => runtime.setState({ unsynced: 1 } as never));
    store.set('void-1', { clientId: 'void-1', state: 'pending', at: 1 });
    const review = liveBazaar(runtime)!.review!;
    expect(review.close!.blocked).toMatch(/still on this phone/);
    let words: string | null = null;
    await act(async () => {
      words = await review.close!.submit(count);
    });
    expect(words).toMatch(/still on this phone/);
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'close_bazaar_day')).toHaveLength(0);
    expect((runtime.state.event as { dayId?: string }).dayId).toBe(DAY);
  });
});

describe('a close whose answer was lost', () => {
  it('pauses selling the day on this phone, also after a reload', async () => {
    const { runtime } = await startedDay();
    localStorage.setItem('hc-close-in-doubt', DAY);
    const before = (runtime.state.sales as unknown[]).length;
    act(() => (runtime as unknown as { recordSale: (pay: string) => void }).recordSale('Cash'));
    expect(JSON.stringify(runtime.state.toast)).toMatch(/may already be closed/);
    expect((runtime.state.sales as unknown[]).length).toBe(before);
    // Mutation: selling on would ring up sales the database refuses after the close.
  });
});

describe('a reload at the stall', () => {
  it('brings the drawer float back with the day, with no signal', async () => {
    const { runtime } = await startedDay();
    act(() => runtime.persist(true));
    cleanup();
    const again = mounted();
    await settle();
    expect((again.state.event as { dayId?: string }).dayId).toBe(DAY);
    expect((again.state.drawer as { float?: number }).float).toBe(500);
    // Mutation: dropping floatCents from the saved event leaves the drawer empty after a reload.
  });
});

describe("the books' hold", () => {
  const books = (held: unknown[]) => ({
    rpc: vi.fn(async () => ({
      data: { basis: 'bought', lines: [], uncosted: [], receipts: [], held },
      error: null
    }))
  });

  it('says a bazaar is in progress, with what is held back, and the ledger leaves it out', async () => {
    const runtime = mounted();
    act(() => runtime.setState({ role: 'owner' } as never));
    await act(async () => {
      await runtime.loadBooks(
        books([
          {
            scheduled_id: BOOKING,
            name: 'Fixture fair',
            count: 5,
            revenue_cents: 88000,
            expense_cents: 1500
          }
        ]) as never
      );
    });
    act(() => runtime.setState({ sheet: { kind: 'books' } } as never));
    expect(runtime.state.ledger).toEqual([]);
    expect(vals(runtime).liveBooks?.held).toEqual([
      {
        id: BOOKING,
        name: 'Fixture fair',
        detail: '5 records · ₱880 taken · ₱15 spent at the till'
      }
    ]);
  });

  it('says nothing when no bazaar is held back', async () => {
    const runtime = mounted();
    act(() => runtime.setState({ role: 'owner' } as never));
    await act(async () => void (await runtime.loadBooks(books([]) as never)));
    act(() => runtime.setState({ sheet: { kind: 'books' } } as never));
    expect(vals(runtime).liveBooks?.held).toEqual([]);
  });
});
