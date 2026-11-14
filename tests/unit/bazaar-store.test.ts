import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BazaarDays, type BazaarDaysDeps } from '@/store/bazaar-days';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import example from '../fixtures/bazaar-example.json';

/**
 * S3: the owner's bazaar store (`BazaarDays`) after selling: the review, the close, losses, stock, the event's page and
 * the close of the event, against a fake database that answers with the hand-worked example. What is pinned here is
 * money: the close is given back exactly the hash of the read she was shown, a changed day is never closed on its own,
 * nothing is closed over sales still on the phone, and a repeat after a lost reply is the same change.
 */
const BOOKING = example.summary.booking.id;
// S3.1 (L2): a change's id outlives the store in localStorage, so each case starts from an empty one.
beforeEach(() => localStorage.clear());
const DAY2 = example.summary.days[1]!.id;

type Wire = ReturnType<typeof clone>;
const clone = () => JSON.parse(JSON.stringify(example)) as typeof example & Record<string, unknown>;
/** The example with day 2 still selling: no count, no close, and the event not counted yet. */
function day2Open(hash = '2'.repeat(64)): Wire {
  const w = clone();
  const d = w.summary.days[1] as Record<string, unknown>;
  Object.assign(d, {
    state: 'open',
    count: null,
    closed_at: null,
    counted_cents: null,
    over_cents: null,
    short_cents: null,
    hash
  });
  w.summary.counted = false;
  return w;
}

type Reply = { data?: unknown; error?: { code?: string } | null } | 'throw';

function harness(first: Wire) {
  let answer: Wire = first;
  const replies = new Map<string, Reply[]>();
  const rpc = vi.fn(async (...call: [name: string, args?: Record<string, unknown>]) => {
    const [name] = call;
    if (name === 'get_bazaar') return { data: answer, error: null };
    const next = replies.get(name)?.shift() ?? { data: {} };
    if (next === 'throw') throw new Error('network');
    return { data: next.data ?? null, error: next.error ?? null };
  });
  let clock = 1_792_900_000_000;
  let ids = 0;
  const state = {
    held: null as ReturnType<BazaarDaysDeps['held']>,
    /** What the phone's queue holds unsent; null when it cannot be read. */
    queue: 0 as number | null,
    /** The till's own figures for the held day. */
    till: { salesCount: 0, cashCents: 0 },
    online: true
  };
  const deps = {
    client: () => ({ rpc }) as unknown as BazaarClient,
    eventActor: () => 1,
    online: () => state.online,
    bookings: () => [
      {
        id: BOOKING,
        name: 'Fixture fair',
        startsOn: '2026-10-24',
        endsOn: '2026-10-25',
        place: 'Hall',
        rentCents: 50000,
        active: true,
        started: true,
        updatedAt: '2026-10-20T00:00:00Z'
      }
    ],
    bookingsRead: () => true,
    flavours: () =>
      ['a', 'b', 'c', 'd'].map((x) => ({
        id: 'mp0s-' + x,
        name: x.toUpperCase(),
        priceCents: 10000
      })),
    holdsEvent: () => state.held !== null,
    held: () => state.held,
    begin: vi.fn(async () => 'started' as const),
    dayClosed: vi.fn(),
    tillFigures: async () => (state.queue === null ? null : { unsent: state.queue, ...state.till }),
    closeInDoubt: vi.fn(),
    lossSaved: vi.fn(),
    lossVoided: vi.fn(),
    stockAdded: vi.fn(),
    dropNo: () => 32,
    finalised: vi.fn(),
    rerender: () => {},
    toast: vi.fn(),
    today: () => '2026-10-24',
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    openAdd: () => {},
    refreshBookings: vi.fn(async () => true)
  } satisfies BazaarDaysDeps;
  const store = new BazaarDays(deps);
  const calls = (name: string) =>
    rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>);
  return {
    store,
    deps,
    state,
    rpc,
    calls,
    reply: (name: string, ...r: Reply[]) => replies.set(name, r),
    answer: (w: Wire) => void (answer = w),
    tick: (ms: number) => void (clock += ms)
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const fullCount = {
  countedPesos: '780',
  rows: [
    { productId: 'mp0s-a', left: '15', carryNext: '', toShop: '10', writtenOff: '5' },
    { productId: 'mp0s-b', left: '2', carryNext: '', toShop: '', writtenOff: '2' },
    { productId: 'mp0s-c', left: '2', carryNext: '', toShop: '2', writtenOff: '' }
  ]
};

async function reviewing(h: ReturnType<typeof harness>, from: 'till' | 'event' = 'till') {
  h.store.openReview(BOOKING, DAY2, from);
  await settle();
  const review = h.store.vals().review;
  if (!review) throw new Error('the review was not drawn');
  return review;
}

const NO_CHOICES = { toShop: {}, costs: {}, withoutCost: false };

describe('the review is drawn from a read made when it opens', () => {
  it('reads get_bazaar once and draws nothing before the answer', async () => {
    const h = harness(day2Open());
    h.store.openReview(BOOKING, DAY2, 'till');
    expect(h.store.vals().reviewing).toBe(true);
    expect(h.store.vals().review).toBeNull();
    await settle();
    expect(h.calls('get_bazaar')).toEqual([{ p_booking: BOOKING }]);
    expect(h.store.vals().review).toMatchObject({ dayId: DAY2, state: 'open' });
  });
});

describe('the review carries what the pre-filled close needs (U5)', () => {
  it('gives the cash expected in centavos and as the pesos the field takes', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h);
    expect(review.close!.cashExpectedCents).toBeGreaterThan(0);
    expect(review.close!.cashExpectedPesos).toBe(
      (review.close!.cashExpectedCents / 100).toFixed(2)
    );
    expect(review.report).toBeNull();
  });

  it('asks the runtime whether each flavour has a recipe, and says unknown when it cannot tell', async () => {
    const h = harness(day2Open());
    expect((await reviewing(h)).stock.every((s) => s.hasRecipe === null)).toBe(true);
    const known = harness(day2Open());
    const store = new BazaarDays({ ...known.deps, hasRecipe: (id) => id === 'mp0s-a' });
    store.openReview(BOOKING, DAY2, 'till');
    await settle();
    const stock = store.vals().review!.stock;
    expect(stock.find((s) => s.productId === 'mp0s-a')?.hasRecipe).toBe(true);
    expect(stock.find((s) => s.productId === 'mp0s-b')?.hasRecipe).toBe(false);
  });

  it('a closed day carries its Z-report, with the database totals', async () => {
    const h = harness(clone());
    const review = await reviewing(h, 'event');
    const drawer = review.report!.tables.find((t) => t.caption === 'Drawer')!;
    expect(drawer.lines.reduce((n, l) => n + l.cents, 0)).toBe(drawer.totalCents);
  });
});

describe('closing a day', () => {
  it('sends the hash and the flavours of the read she was shown, with her count', async () => {
    const h = harness(day2Open('4'.repeat(64)));
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.state.till = { salesCount: 3, cashCents: 48000 };
    const review = await reviewing(h);
    expect(review.close!.lastDay).toBe(true);
    expect(await review.close!.submit(fullCount)).toBeNull();
    const sent = h.calls('close_bazaar_day');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      p_close: {
        day_id: DAY2,
        at: 1_792_900_000_000,
        counted_cents: 78000,
        lines: {
          'mp0s-a': { left: 15, carry_next: 0, to_shop: 10, written_off: 5 },
          'mp0s-b': { left: 2, carry_next: 0, to_shop: 0, written_off: 2 },
          'mp0s-c': { left: 2, carry_next: 0, to_shop: 2, written_off: 0 }
        },
        expected: '4'.repeat(64),
        // Nothing waits on this phone, so the server holds all its sales: its own figures are not sent (14 November 2026,
        // a day sold on two of her devices could never match one phone's count, and the close was refused for good).
        sales_count: null,
        cash_cents: null
      }
    });
    expect(h.deps.dayClosed).toHaveBeenCalledWith(DAY2);
    expect(h.calls('get_bazaar')).toHaveLength(2);
    // Mutation: sending the hash of a later read, or the whole summary's hash, fails the exact body.
  });

  it('a day that changed is read again and never closed on its own; her next tap sends the new hash', async () => {
    const h = harness(day2Open('4'.repeat(64)));
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    const review = await reviewing(h);
    h.reply('close_bazaar_day', { error: { code: '40001' } });
    h.answer(day2Open('5'.repeat(64)));
    const words = await review.close!.submit(fullCount);
    expect(words).toMatch(/changed since you looked/);
    expect(h.calls('close_bazaar_day')).toHaveLength(1);
    expect(h.calls('get_bazaar')).toHaveLength(2);
    const again = h.store.vals().review!;
    expect(again.notices.join(' ')).toMatch(/changed since you looked/);
    expect(await again.close!.submit(fullCount)).toBeNull();
    const sent = h.calls('close_bazaar_day');
    expect(sent).toHaveLength(2);
    expect((sent[1]!.p_close as { expected: string }).expected).toBe('5'.repeat(64));
    // Mutation: resending with the new hash at once would close over a sale she has not seen.
  });

  it('is not sent while this phone still holds changes for the day', async () => {
    const h = harness(day2Open());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 2, refused: 0, stock: {} };
    h.state.queue = 2;
    const review = await reviewing(h);
    expect(review.close!.blocked).toMatch(/2 changes are still on this phone/);
    expect(await review.close!.submit(fullCount)).toMatch(/still on this phone/);
    expect(h.calls('close_bazaar_day')).toHaveLength(0);
  });

  it('a lost reply is repeated as the same close: the same time and the same body', async () => {
    const h = harness(day2Open());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    const review = await reviewing(h);
    h.reply('close_bazaar_day', 'throw');
    expect(await review.close!.submit(fullCount)).toMatch(/may already be closed/);
    // Selling pauses while it may have landed; the read that follows settles it (still open here).
    // (Every read of the held day settles it: the one that opened the review, then the one after the lost reply.)
    expect(h.deps.closeInDoubt.mock.calls).toEqual([[null], [DAY2], [null]]);
    expect(h.calls('get_bazaar')).toHaveLength(2);
    h.tick(60_000);
    expect(await review.close!.submit(fullCount)).toBeNull();
    const sent = h.calls('close_bazaar_day');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    // Mutation: a new time on the retry is a different body, refused (23505) if the first one had landed.
  });

  it('a count it cannot be is refused in words before anything is sent', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h);
    const carry = {
      ...fullCount,
      rows: fullCount.rows.map((r, i) => (i === 0 ? { ...r, carryNext: '1', writtenOff: '4' } : r))
    };
    expect(await review.close!.submit(carry)).toMatch(/Nothing carries over from the last day/);
    expect(h.calls('close_bazaar_day')).toHaveLength(0);
  });

  it('a day sold on another phone warns that its unsent sales are not in the figures, and still closes', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h, 'event');
    expect(review.notices.join(' ')).toMatch(/another phone/);
    expect(review.backText).toBe('Back to the event');
    expect(review.close!.blocked).toBeNull();
    expect(await review.close!.submit(fullCount)).toBeNull();
  });

  it('a closed day offers no close, no loss and no stock', async () => {
    const h = harness(clone());
    const review = await reviewing(h, 'event');
    expect(review).toMatchObject({ state: 'closed', close: null, addLoss: null, addStock: null });
  });
});

describe('the queue decides', () => {
  it('a read that finds the held day closed pauses selling and asks the phone to let go of it', async () => {
    const h = harness(clone());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    await reviewing(h, 'event');
    expect(h.deps.closeInDoubt).toHaveBeenLastCalledWith(DAY2);
    expect(h.deps.dayClosed).toHaveBeenCalledWith(DAY2);
    // Mutation: clearing the pause on a closed day lets the till ring up sales the database refuses.
  });

  it('a queue that cannot be read closes nothing', async () => {
    const h = harness(day2Open());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.state.queue = null;
    const review = await reviewing(h);
    expect(await review.close!.submit(fullCount)).toMatch(/could not check/);
    expect(h.calls('close_bazaar_day')).toHaveLength(0);
    // Mutation: reading an unknown queue as empty closes the day over a void or an expense still on the phone.
  });

  it('a void still in the queue blocks the close even when the screen counts no sale', async () => {
    const h = harness(day2Open());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.state.queue = 1;
    const review = await reviewing(h);
    expect(await review.close!.submit(fullCount)).toMatch(/1 change is still on this phone/);
    expect(h.calls('close_bazaar_day')).toHaveLength(0);
  });
});

describe('losses and more stock on an open day', () => {
  it('a loss larger than the table on this phone is refused here; a loss saved lowers the till', async () => {
    const h = harness(day2Open());
    h.state.held = {
      dayId: DAY2,
      scheduledId: BOOKING,
      unsent: 0,
      refused: 0,
      stock: { 'mp0s-a': 3 }
    };
    const review = await reviewing(h);
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '4', reason: 'Dropped' })).toMatch(
      /Only 3 left/
    );
    expect(h.calls('save_bazaar_loss')).toHaveLength(0);
    h.reply('save_bazaar_loss', { error: { code: '08006' } }, { data: [{ duplicate: false }] });
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' })).toMatch(
      /needs signal/
    );
    h.tick(5_000);
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' })).toBeNull();
    const [first, second] = h.calls('save_bazaar_loss');
    expect((first!.p_loss as { client_id: string }).client_id).toMatch(/^loss:/);
    expect(second).toEqual(first);
    expect(h.deps.lossSaved).toHaveBeenCalledWith(DAY2, 'mp0s-a', 1);
  });

  it('a loss the database already had (its answer was lost) is applied once on the phone and said so', async () => {
    const h = harness(day2Open());
    h.state.held = {
      dayId: DAY2,
      scheduledId: BOOKING,
      unsent: 0,
      refused: 0,
      stock: { 'mp0s-a': 3 }
    };
    const review = await reviewing(h);
    h.reply('save_bazaar_loss', { data: [{ duplicate: true }] });
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' })).toBeNull();
    expect(h.deps.lossSaved).toHaveBeenCalledTimes(1);
    expect(h.deps.toast).toHaveBeenCalledWith(expect.stringMatching(/already recorded/));
  });

  it('a loss corrected after a lost reply and a local error is still the same change', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h);
    h.reply('save_bazaar_loss', { error: { code: '08006' } });
    await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' });
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: '   ' })).toMatch(
      /Say what happened/
    );
    await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' });
    const [first, second] = h.calls('save_bazaar_loss');
    expect((second!.p_loss as { client_id: string }).client_id).toBe(
      (first!.p_loss as { client_id: string }).client_id
    );
  });

  it('a loss changed after a lost reply keeps its id, so it is refused rather than booked twice', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h);
    h.reply('save_bazaar_loss', { error: { code: '08006' } }, { error: { code: '23505' } });
    await review.addLoss!({ productId: 'mp0s-a', qty: '1', reason: 'Dropped' });
    expect(await review.addLoss!({ productId: 'mp0s-a', qty: '2', reason: 'Dropped' })).toMatch(
      /could not be recorded/
    );
    const [first, second] = h.calls('save_bazaar_loss');
    const id = (x: Record<string, unknown> | undefined) =>
      (x!.p_loss as { client_id: string }).client_id;
    expect(id(second)).toBe(id(first));
    expect(h.deps.lossSaved).not.toHaveBeenCalled();
  });

  it('stock added follows the database: the till gains it and the day holds what the reply says', async () => {
    const h = harness(day2Open());
    const review = await reviewing(h);
    expect(review.canAddCarried).toBe(true);
    h.reply('add_bazaar_day_stock', { data: [{ loaded: 22 }] });
    expect(await review.addStock!({ productId: 'mp0s-a', qty: '2', kind: 'made' })).toBeNull();
    expect(h.deps.stockAdded).toHaveBeenCalledWith(DAY2, 'mp0s-a', 2, 22);
  });
});

describe("the event's page", () => {
  const page = async (w: Wire) => {
    const h = harness(w);
    h.store.open(BOOKING);
    await settle();
    const event = h.store.vals().event;
    if (!event) throw new Error('the event page was not drawn');
    return { h, event };
  };

  it('shows the fees, the target and each cost per cookie in words, an unknown one as pending', async () => {
    const { event } = await page(clone());
    expect(event.feesTotalText).toBe('₱800.00');
    expect(event.fees.map((f) => f.amountText)).toEqual(['₱500.00', '₱250.00', '₱50.00']);
    expect(event.targetText).toBe('₱500.00');
    // Cine, 14 November 2026: one cost per flavour, set in Make; the event no longer takes its own.
    expect(event.costs.every((c) => c.save === null)).toBe(true);
    expect(event.costs.map((c) => c.text)).toEqual([
      '₱12.01 per cookie · from the recipe',
      '₱28.75 per cookie · typed by you',
      '₱10.00 per cookie · typed by you',
      'Cost pending'
    ]);
    expect(event.figures.map((f) => f.key)).toEqual([
      'revenue',
      'sold-cost',
      'sold-kept',
      'fees',
      'cookie-cost',
      'profit',
      'target'
    ]);
    expect(event.days.map((d) => d.action)).toEqual(['see', 'see']);
  });

  it('closes the event with the hash she was shown and the drop for the shop cookies', async () => {
    const { h, event } = await page(clone());
    expect(event.finalise!.blocked).toBeNull();
    expect(await event.finalise!.run(NO_CHOICES)).toBeNull();
    expect(h.calls('finalise_bazaar')).toEqual([
      {
        p_booking: BOOKING,
        p_expected: example.summary.hash,
        p_drop: 32,
        p_till: null,
        p_final: null
      }
    ]);
    expect(h.deps.finalised).toHaveBeenCalledTimes(1);
  });

  it('a changed event is read again and not closed; an open day blocks the close', async () => {
    const { h, event } = await page(clone());
    h.reply('finalise_bazaar', { error: { code: '40001' } });
    expect(await event.finalise!.run(NO_CHOICES)).toMatch(/changed since you looked/);
    expect(h.deps.finalised).not.toHaveBeenCalled();
    const open = await page(day2Open());
    expect(open.event.finalise!.blocked).toMatch(/still selling/);
    expect(await open.event.finalise!.run(NO_CHOICES)).toMatch(/still selling/);
    expect(open.h.calls('finalise_bazaar')).toHaveLength(0);
    expect(open.event.days[1]!.action).toBe('review');
  });

  it('a closed event offers nothing to change and says it is closed', async () => {
    const w = clone();
    Object.assign(w, {
      finalised_at: '2026-10-26T01:00:00+00:00',
      final_hash: w.summary.hash,
      final_summary: w.summary
    });
    const { event } = await page(w);
    expect(event).toMatchObject({ finalise: null, addFee: null, saveTarget: null });
    expect(event.notices.join(' ')).toMatch(/This event is closed/);
  });

  it("day 2's plan starts from what day 1 set aside", async () => {
    const w = clone();
    const d2 = w.summary.days[1] as Record<string, unknown>;
    Object.assign(d2, {
      state: 'planned',
      event_id: null,
      count: null,
      closed_at: null,
      counted_cents: null,
      over_cents: null,
      short_cents: null
    });
    const { h, event } = await page(w);
    event.days[1]!.edit!();
    expect(h.store.vals().editor!.carryIn).toEqual({
      dateText: event.days[0]!.dateText,
      byFlavour: { 'mp0s-a': 8, 'mp0s-b': 5, 'mp0s-c': 5 }
    });
  });
});

describe('S3.1: refused sales, till figures, taking back, and ids that outlive a reload', () => {
  it('a close from another phone sends no till figures; a refused sale on this phone is shown, not blocking', async () => {
    const other = harness(day2Open('4'.repeat(64)));
    expect(await (await reviewing(other, 'event')).close!.submit(fullCount)).toBeNull();
    const body = other.calls('close_bazaar_day')[0]!.p_close as Record<string, unknown>;
    expect([body.sales_count, body.cash_cents]).toEqual([null, null]);

    const h = harness(day2Open('4'.repeat(64)));
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 2, stock: {} };
    const review = await reviewing(h);
    expect(review.notices.join(' ')).toMatch(/2 sales on this phone were refused by the server/);
    expect(review.close!.blocked).toBeNull();
  });

  it('a queue that cannot be read refuses the close here, and sends nothing', async () => {
    const h = harness(day2Open('4'.repeat(64)));
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.state.queue = null;
    expect(await (await reviewing(h)).close!.submit(fullCount)).toMatch(/could not check/);
    expect(h.calls('close_bazaar_day')).toHaveLength(0);
  });

  it('finalising from the phone that still holds a closed day sends that day and its till figures', async () => {
    const h = harness(clone());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 1, refused: 0, stock: {} };
    h.state.queue = 1;
    h.state.till = { salesCount: 3, cashCents: 48000 };
    h.store.open(BOOKING);
    await settle();
    expect(await h.store.vals().event!.finalise!.run(NO_CHOICES)).toBeNull();
    expect(h.calls('finalise_bazaar')[0]!.p_till).toEqual({
      day_id: DAY2,
      sales_count: 3,
      cash_cents: 48000
    });
  });

  it('finalising from a device with nothing waiting sends no till figures (more than one device sold the day)', async () => {
    const h = harness(clone());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.state.queue = 0;
    h.state.till = { salesCount: 1, cashCents: 10000 };
    h.store.open(BOOKING);
    await settle();
    expect(await h.store.vals().event!.finalise!.run(NO_CHOICES)).toBeNull();
    expect(h.calls('finalise_bazaar')[0]!.p_till ?? null).toBeNull();
  });

  it('an open day another of her devices sells offers Sell on this device, which moves the selling here', async () => {
    const h = harness(day2Open());
    h.store.open(BOOKING);
    await settle();
    const row = h.store.vals().event!.days.find((d) => d.id === DAY2)!;
    expect(row.action).toBe('review');
    expect(typeof row.takeOver).toBe('function');
    row.takeOver!();
    await settle();
    expect(h.deps.begin).toHaveBeenCalledWith(
      { id: BOOKING, name: 'Fixture fair' },
      expect.objectContaining({ id: DAY2 })
    );
    h.state.online = false;
    h.store.open(BOOKING);
    await settle();
    expect(h.store.vals().event!.days.find((d) => d.id === DAY2)!.takeOver ?? null).toBeNull();
  });

  it('a loss taken back on the selling phone gives the till its cookies back once; a repeat adds nothing', async () => {
    const h = harness(day2Open());
    h.state.held = {
      dayId: DAY2,
      scheduledId: BOOKING,
      unsent: 0,
      refused: 0,
      stock: { 'mp0s-c': 1 }
    };
    const review = await reviewing(h);
    const loss = review.losses.find((l) => l.id === 'loss:22222222-2222-4222-8222-222222222222')!;
    h.reply('void_bazaar_loss', 'throw', { data: {} });
    expect(await loss.remove!()).toMatch(/needs signal/);
    expect(h.deps.lossVoided).not.toHaveBeenCalled();
    expect(await loss.remove!()).toBeNull();
    expect(h.calls('void_bazaar_loss')).toEqual([
      { p_client_id: 'loss:22222222-2222-4222-8222-222222222222' },
      { p_client_id: 'loss:22222222-2222-4222-8222-222222222222' }
    ]);
    expect(h.deps.lossVoided).toHaveBeenCalledTimes(1);
    expect(h.deps.lossVoided).toHaveBeenCalledWith(DAY2, 'mp0s-c', 1);
  });

  it('a fee can be taken back until the event is closed; the rent and a till expense cannot', async () => {
    const h = harness(clone());
    h.store.open(BOOKING);
    await settle();
    const fees = h.store.vals().event!.fees;
    expect(fees.find((f) => f.id.startsWith('rent:'))!.remove).toBeNull();
    const fee = fees.find((f) => f.remove)!;
    h.reply('void_bazaar_fee', { data: {} });
    expect(await fee.remove!()).toBeNull();
    expect(h.calls('void_bazaar_fee')).toEqual([{ p_client_id: fee.id }]);
  });

  it('a stock change whose answer was lost keeps its id and body across a reload, and is sent again as it was', async () => {
    const h = harness(day2Open());
    h.reply('add_bazaar_day_stock', 'throw');
    const first = await reviewing(h);
    expect(await first.addStock!({ productId: 'mp0s-a', qty: '2', kind: 'made' })).toMatch(
      /needs signal/
    );
    const sent = h.calls('add_bazaar_day_stock')[0]!;
    expect(localStorage.getItem('hc-bazaar-pending')).toContain(sent.p_client_id as string);

    // The app is reloaded: a new store, the same storage. She types a different amount.
    const again = new BazaarDays(h.deps);
    again.openReview(BOOKING, DAY2, 'till');
    await settle();
    h.reply('add_bazaar_day_stock', { data: [{ loaded: 22, duplicate: true }] });
    const words = await again.vals().review!.addStock!({
      productId: 'mp0s-a',
      qty: '5',
      kind: 'made'
    });
    expect(words).toMatch(/earlier stock change/);
    const resent = h.calls('add_bazaar_day_stock')[1]!;
    expect(resent).toEqual(sent);
    // The phone applies what the database holds under that id: 2, not the 5 now on the form.
    expect(h.deps.stockAdded).toHaveBeenCalledWith(DAY2, 'mp0s-a', 2, 22);
    expect(localStorage.getItem('hc-bazaar-pending')).toBeNull();
  });

  it('storage that throws leaves the ids in memory: a repeat in the same session is still the same change', async () => {
    const h = harness(day2Open());
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    try {
      h.reply('add_bazaar_day_stock', 'throw', { data: [{ loaded: 22 }] });
      const review = await reviewing(h);
      expect(await review.addStock!({ productId: 'mp0s-a', qty: '2', kind: 'made' })).toMatch(
        /needs signal/
      );
      expect(await review.addStock!({ productId: 'mp0s-a', qty: '2', kind: 'made' })).toBeNull();
      const [a, b] = h.calls('add_bazaar_day_stock');
      expect(b!.p_client_id).toBe(a!.p_client_id);
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });
});

describe('U2: the till adds cookies and fees without a review open', () => {
  const heldDay2 = () => ({ dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} });
  const input = { productId: 'mp0s-a', qty: '2', kind: 'made' as const };

  it('reads the held day itself and adds under the same stock key as the review', async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    h.reply('add_bazaar_day_stock', { data: [{ loaded: 22 }] });
    expect(await h.store.addHeldStock(input)).toBeNull();
    expect(h.calls('get_bazaar')).toHaveLength(1);
    expect(h.calls('add_bazaar_day_stock')[0]).toMatchObject({
      p_day: DAY2,
      p_product: 'mp0s-a',
      p_qty: 2,
      p_kind: 'made'
    });
    expect(h.deps.stockAdded).toHaveBeenCalledWith(DAY2, 'mp0s-a', 2, 22);
    expect(localStorage.getItem('hc-bazaar-pending')).toBeNull();
    // It leaves no booking open behind it: the list is what she sees once the day is gone.
    expect(h.store.vals().event).toBeNull();
  });

  it("a lost reply is sent again as the same change, and the key is the review's", async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    h.reply('add_bazaar_day_stock', 'throw', { data: [{ loaded: 22, duplicate: true }] });
    expect(await h.store.addHeldStock(input)).toMatch(/needs signal/);
    const first = h.calls('add_bazaar_day_stock')[0]!;
    expect(localStorage.getItem('hc-bazaar-pending')).toContain('stock:' + DAY2);
    // A different amount typed after the lost reply is still the first change.
    const words = await h.store.addHeldStock({ ...input, qty: '9' });
    expect(words).toMatch(/earlier stock change/);
    expect(h.calls('add_bazaar_day_stock')[1]).toEqual(first);
    expect(h.deps.stockAdded).toHaveBeenCalledWith(DAY2, 'mp0s-a', 2, 22);
    // Mutation: a fresh key per call books the cookies twice.
  });

  it('sends nothing when this phone holds no day, or the flavour is not on the day', async () => {
    const h = harness(day2Open());
    expect(await h.store.addHeldStock(input)).toMatch(/day/i);
    h.state.held = heldDay2();
    expect(await h.store.addHeldStock({ ...input, productId: 'mp0s-zzz' })).toBe(
      'Choose the flavour.'
    );
    expect(h.calls('add_bazaar_day_stock')).toHaveLength(0);
  });

  it("the fee panel is the event's own fee form, read for the held day, and closing it leaves nothing open", async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    expect(h.store.vals().tillPanel).toBeNull();
    h.store.openTillPanel('fees');
    expect(h.store.vals().tillPanel).toMatchObject({ kind: 'fees', status: 'loading' });
    await settle();
    const panel = h.store.vals().tillPanel!;
    expect(panel).toMatchObject({ kind: 'fees', status: 'loaded' });
    expect(panel.event!.addFee).not.toBeNull();
    expect(panel.event!.feeFor.map((o) => o.dayId)).toContain(DAY2);
    h.store.closeTillPanel();
    expect(h.store.vals().tillPanel).toBeNull();
    expect(h.store.vals().event).toBeNull();
  });

  it('the cookies panel offers the flavours of the held day, and its add is addHeldStock', async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    h.store.openTillPanel('cookies');
    await settle();
    const stockForm = h.store.vals().tillPanel!.stock!;
    expect(stockForm.flavours.map((f) => f.id)).toEqual(['mp0s-a', 'mp0s-b', 'mp0s-c']);
    expect(stockForm.canAddCarried).toBe(true);
    h.reply('add_bazaar_day_stock', { data: [{ loaded: 22 }] });
    expect(await stockForm.addStock(input)).toBeNull();
    expect(h.calls('add_bazaar_day_stock')[0]).toMatchObject({ p_day: DAY2 });
  });

  it('draws the fee form from the day read itself when the bookings list was never read', async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    const store = new BazaarDays({ ...h.deps, bookings: () => [], bookingsRead: () => false });
    store.openTillPanel('fees');
    await settle();
    const panel = store.vals().tillPanel!;
    expect(panel.status).toBe('loaded');
    expect(panel.event).toMatchObject({ id: BOOKING, name: 'Fixture fair' });
    // Mutation: building the event from the bookings list leaves "could not be read" with no way out.
  });

  it('opens nothing when this phone holds no day or has no signal', async () => {
    const h = harness(day2Open());
    h.store.openTillPanel('fees');
    expect(h.store.vals().tillPanel).toBeNull();
    h.state.held = heldDay2();
    h.state.online = false;
    h.store.openTillPanel('fees');
    expect(h.store.vals().tillPanel).toBeNull();
    expect(h.calls('get_bazaar')).toHaveLength(0);
  });

  it('a day closed from another phone closes the panel and lets the phone go', async () => {
    const h = harness(clone());
    h.state.held = heldDay2();
    h.store.openTillPanel('fees');
    await settle();
    expect(h.deps.dayClosed).toHaveBeenCalledWith(DAY2);
    expect(h.store.vals().tillPanel).toBeNull();
    expect(h.store.vals().event).toBeNull();
  });

  it('a review opened over the panel replaces it', async () => {
    const h = harness(day2Open());
    h.state.held = heldDay2();
    h.store.openTillPanel('cookies');
    await settle();
    h.store.openReview(BOOKING, DAY2, 'till');
    expect(h.store.vals().tillPanel).toBeNull();
    await settle();
    expect(h.store.vals().review).not.toBeNull();
  });
});

describe('U4: the event page asks what the books need before it closes, and starts only a day she meant', () => {
  const open = async (w: Wire, recipe: (id: string) => boolean | null = () => null) => {
    const h = harness(w);
    (h.deps as unknown as BazaarDaysDeps).hasRecipe = recipe;
    h.store.open(BOOKING);
    await settle();
    const event = h.store.vals().event;
    if (!event) throw new Error('the event page was not drawn');
    return { h, event };
  };
  /** The example's last day set aside 4 of A to carry to a day that never ran. */
  const stranded = (): Wire => {
    const w = clone();
    (w.summary as Record<string, unknown>).stranded = [
      { product_id: 'mp0s-a', name: 'Fixture A', day_id: DAY2, qty: 4 }
    ];
    return w;
  };
  /** B has cookies and no cost per cookie, so the event has no profit. */
  const costPending = (): Wire => {
    const w = clone();
    const lines = w.summary.cookie_cost.lines as Array<Record<string, unknown>>;
    const b = lines.find((l) => l.product_id === 'mp0s-b')!;
    Object.assign(b, {
      unit_cents: null,
      source: null,
      uncosted: true,
      made_cents: null,
      to_shop_cents: null,
      sold_cents: null,
      given_cents: null,
      lost_cents: null,
      written_off_cents: null,
      not_accounted_cents: null,
      cost_cents: null,
      rounding_cents: null
    });
    return w;
  };
  const planned = (w: Wire, index: number): Wire => {
    Object.assign(w.summary.days[index] as Record<string, unknown>, {
      state: 'planned',
      event_id: null,
      count: null,
      closed_at: null,
      counted_cents: null,
      over_cents: null,
      short_cents: null
    });
    return w;
  };

  it('A1: names the stranded cookies, suggests the shop only for a flavour with a recipe, and sends the split', async () => {
    const { h, event } = await open(stranded(), (id) => id === 'mp0s-a');
    expect(event.finalise!.stranded).toEqual([
      { productId: 'mp0s-a', name: 'A', qty: 4, hasRecipe: true, suggestedToShop: 4 }
    ]);
    expect(event.finalise!.strandedFor).toBe('Mon, 26 Oct');
    // The recipes unread: nothing is suggested, so nothing is sent.
    const unread = await open(stranded());
    expect(unread.event.finalise!.stranded[0]!.suggestedToShop).toBeNull();
    expect(await unread.event.finalise!.run(NO_CHOICES)).toMatch(/choose where the 4 cookies go/);
    expect(unread.h.calls('finalise_bazaar')).toHaveLength(0);
    // The suggestion is sent as it stands; a changed split is sent as changed.
    expect(await event.finalise!.run(NO_CHOICES)).toBeNull();
    expect(h.calls('finalise_bazaar')[0]!.p_final).toEqual({
      'mp0s-a': { to_shop: 4, written_off: 0 }
    });
    const again = await open(stranded(), () => true);
    expect(await again.event.finalise!.run({ ...NO_CHOICES, toShop: { 'mp0s-a': 3 } })).toBeNull();
    expect(again.h.calls('finalise_bazaar')[0]!.p_final).toEqual({
      'mp0s-a': { to_shop: 3, written_off: 1 }
    });
    // Mutation: sending no split with stranded cookies is refused by the database (migration 70).
  });

  it('A1: refuses cookies sent to the shop for a flavour with no recipe, in words, before it asks the database', async () => {
    const { h, event } = await open(stranded(), () => false);
    expect(event.finalise!.stranded[0]).toMatchObject({ hasRecipe: false, suggestedToShop: 0 });
    expect(await event.finalise!.run({ ...NO_CHOICES, toShop: { 'mp0s-a': 2 } })).toMatch(
      /has no recipe, so it cannot go to the shop/
    );
    expect(h.calls('finalise_bazaar')).toHaveLength(0);
    expect(await event.finalise!.run(NO_CHOICES)).toBeNull();
    expect(h.calls('finalise_bazaar')[0]!.p_final).toEqual({
      'mp0s-a': { to_shop: 0, written_off: 4 }
    });
  });

  it('A5: wants the cost of a flavour without one, saves it for the flavour, reads the event again, and closes against the fresh hash', async () => {
    const { h, event } = await open(costPending());
    expect(event.finalise!.costPending).toEqual([{ productId: 'mp0s-b', name: 'B', sold: 3 }]);
    expect(await event.finalise!.run(NO_CHOICES)).toMatch(/B has no cost yet/);
    expect(h.calls('save_flavour_cost')).toHaveLength(0);
    expect(h.calls('finalise_bazaar')).toHaveLength(0);
    // The cost changes the summary: the database answers the next read with a new hash, and the close is given that one.
    const fresh = clone();
    fresh.summary.hash = 'f'.repeat(64);
    h.answer(fresh);
    const reads = h.calls('get_bazaar').length;
    expect(await event.finalise!.run({ ...NO_CHOICES, costs: { 'mp0s-b': '12.5' } })).toBeNull();
    expect(h.calls('save_flavour_cost')).toEqual([{ p_product: 'mp0s-b', p_cents: 1250 }]);
    expect(h.calls('get_bazaar').length).toBeGreaterThan(reads);
    expect(h.calls('finalise_bazaar')[0]!.p_expected).toBe('f'.repeat(64));
  });

  it('A5: stops when a saved cost is still missing from the fresh summary, and closes nothing', async () => {
    const { h, event } = await open(costPending());
    // The fresh read still has no cost for B: the event must not close with a profit she asked to give.
    const fresh = costPending();
    fresh.summary.hash = 'e'.repeat(64);
    h.answer(fresh);
    expect(await event.finalise!.run({ ...NO_CHOICES, costs: { 'mp0s-b': '12.5' } })).toMatch(
      /still has no cost for B/
    );
    expect(h.calls('save_flavour_cost')).toHaveLength(1);
    expect(h.calls('finalise_bazaar')).toHaveLength(0);
  });

  it('A5: stops when something other than the cost changed between the page and the re-read', async () => {
    const { h, event } = await open(costPending());
    const fresh = clone();
    fresh.summary.hash = 'd'.repeat(64);
    fresh.summary.revenue.revenue_cents += 5000; // a late sale
    h.answer(fresh);
    expect(await event.finalise!.run({ ...NO_CHOICES, costs: { 'mp0s-b': '12.5' } })).toMatch(
      /changed since you looked/
    );
    expect(h.calls('finalise_bazaar')).toHaveLength(0);
  });

  it('A2: a day drawn before midnight and tapped after it still asks', async () => {
    const w = planned(planned(clone(), 1), 0);
    const { h, event } = await open(w);
    const day = event.days[0]!;
    expect(day.startPrompt).toBeNull();
    // The clock moves on to the next day after the page was drawn.
    (h.deps as unknown as { today: () => string }).today = () => '2026-10-25';
    day.start(false);
    await settle();
    expect(h.deps.begin).not.toHaveBeenCalled();
  });

  it('A5: closing without cost saves nothing', async () => {
    const { h, event } = await open(costPending());
    expect(await event.finalise!.run({ ...NO_CHOICES, withoutCost: true })).toBeNull();
    expect(h.calls('save_flavour_cost')).toHaveLength(0);
    expect(h.calls('finalise_bazaar')).toHaveLength(1);
  });

  it('A5: a cost that is refused stops the close', async () => {
    const { h, event } = await open(costPending());
    h.reply('save_flavour_cost', { error: { code: '42501' } });
    expect(await event.finalise!.run({ ...NO_CHOICES, costs: { 'mp0s-b': '12.5' } })).toMatch(
      /could not be saved/
    );
    expect(h.calls('finalise_bazaar')).toHaveLength(0);
  });

  it('B4: a closed day says what happened, from the summary: sold, revenue, left, carried, drawer', async () => {
    const { event } = await open(clone());
    expect(event.days[0]!.outcome).toEqual({
      soldText: '7 sold',
      revenueText: '₱880.00',
      leftText: '26 left',
      carriedText: '18 carried over',
      drawerText: '₱5.00 short'
    });
    expect(event.days[1]!.outcome).toMatchObject({ revenueText: '₱870.00', drawerText: 'Matches' });
    // Mutation: showing the plan instead (the old cookiesText line) hides the outcome.
  });

  it('A2: a day that is not today asks first, and is not started until she confirms; today asks nothing', async () => {
    const { h, event } = await open(planned(clone(), 1));
    const day = event.days[1]!;
    // The booking runs 24 to 25 Oct and the harness' today is the 24th.
    expect(day.startPrompt).toEqual({
      title: 'Start a day that is not today?',
      body: 'This day is Sun, 25 Oct. Today is Sat, 24 Oct. Sales will be dated today.'
    });
    day.start(false);
    day.run();
    await settle();
    expect(h.deps.begin).not.toHaveBeenCalled();
    day.start(true);
    await settle();
    expect(h.deps.begin).toHaveBeenCalledTimes(1);
    // Day 1 is today's.
    const w = planned(planned(clone(), 1), 0);
    const today = await open(w);
    expect(today.event.days[0]!.startPrompt).toBeNull();
    today.event.days[0]!.start(false);
    await settle();
    expect(today.h.deps.begin).toHaveBeenCalledTimes(1);
  });

  it('A2: the rent is named only when this start books it (no day of the event started yet)', async () => {
    const started = await open(planned(clone(), 1));
    expect(started.event.days[1]!.startPrompt!.body).not.toMatch(/rent/);
    const fresh = await open(planned(planned(clone(), 1), 0));
    expect(fresh.event.days[1]!.startPrompt!.body).toMatch(
      /the stall rent will be booked on Sun, 25 Oct\.$/
    );
  });

  it('HCB-004: without her catalogue a plan is not saved and a day is not started, and each says why; held or absent changes nothing', async () => {
    const { h, event } = await open(planned(clone(), 1));
    const day = event.days[1]!;
    day.edit!();
    const editor = h.store.vals().editor!;
    const input = {
      floatPesos: '0',
      flavours: editor.flavours.map((f, i) => ({ ...f, made: i === 0 ? '5' : '', carried: '' }))
    };
    const deps = h.deps as unknown as BazaarDaysDeps;
    deps.catalogueHeld = () => false;
    expect(await editor.save(input)).toBe(STAFF_COPY.bazaarCatalogueNotRead);
    expect(h.calls('save_bazaar_day')).toHaveLength(0);
    day.start(true);
    await settle();
    expect(h.deps.begin).not.toHaveBeenCalled();
    expect(h.deps.toast).toHaveBeenCalledWith(STAFF_COPY.bazaarCatalogueNotRead, 'warn');
    // Held: both go through as before.
    deps.catalogueHeld = () => true;
    h.reply('save_bazaar_day', { data: [{ id: DAY2, updated_at: '2026-10-24T01:00:00Z' }] });
    expect(await editor.save(input)).toBeNull();
    expect(h.calls('save_bazaar_day')).toHaveLength(1);
    day.start(true);
    await settle();
    expect(h.deps.begin).toHaveBeenCalledTimes(1);
    // Absent (the dependency every older caller leaves out): held.
    delete deps.catalogueHeld;
    day.start(true);
    await settle();
    expect(h.deps.begin).toHaveBeenCalledTimes(2);
  });

  it('the plan is read with its event, the menu flavours and the flavour photos', async () => {
    const { h, event } = await open(planned(clone(), 1));
    event.days[1]!.edit!();
    const editor = h.store.vals().editor!;
    expect(editor.eventName).toBe('Fixture fair');
    expect(editor.flavours[0]).toMatchObject({ photo: '', onMenu: true, menuPrice: '100' });
  });
});

describe('explicit kitchen transfer entry points', () => {
  it('offers the held day and review transfer without a legacy stock write and retires panel selection', async () => {
    const h = harness(day2Open()),
      transfer = vi.fn(),
      factory = vi.fn(() => transfer);
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    const store = new BazaarDays({ ...h.deps, kitchenTransfer: factory });
    const previous = store.selectionEpoch();
    store.openTillPanel('cookies');
    await settle();
    expect(store.selectionEpoch()).toBeGreaterThan(previous);
    store.vals().tillPanel!.stock!.kitchenTransfer!();
    expect(factory).toHaveBeenCalledWith(BOOKING, DAY2);
    expect(transfer).toHaveBeenCalledTimes(1);
    store.openReview(BOOKING, DAY2, 'till');
    await settle();
    store.vals().review!.kitchenTransfer!();
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(h.calls('add_bazaar_day_stock')).toHaveLength(0);
  });
});

describe('End event: delete an event that never sold', () => {
  /** The example with every day closed and no sale. */
  const unsold = (): Wire => {
    const w = clone();
    (w.summary.revenue as Record<string, unknown>).sales = 0;
    return w;
  };

  it('is offered only while the event has no sale, and never once it has one', async () => {
    const sold = harness(clone());
    sold.store.open(BOOKING);
    await settle();
    expect(sold.store.vals().event!.deleteEvent).toBeNull();
    const h = harness(unsold());
    h.store.open(BOOKING);
    await settle();
    expect(h.store.vals().event!.deleteEvent).not.toBeNull();
    expect(h.store.vals().event!.deleteEvent!.blocked).toBeNull();
  });

  it('refuses while a selling day is still open, sending nothing', async () => {
    const w = day2Open();
    (w.summary.revenue as Record<string, unknown>).sales = 0;
    const h = harness(w);
    h.store.open(BOOKING);
    await settle();
    const remove = h.store.vals().event!.deleteEvent!;
    expect(remove.blocked).toMatch(/still selling/);
    expect(await remove.run('Fixture fair')).toMatch(/still selling/);
    expect(h.calls('delete_bazaar_booking')).toHaveLength(0);
  });

  it('refuses while this phone holds a sale for the event that the server has not taken, sending nothing', async () => {
    const h = harness(unsold());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 1, refused: 1, stock: {} };
    h.store.open(BOOKING);
    await settle();
    const remove = h.store.vals().event!.deleteEvent!;
    expect(remove.blocked).toMatch(/still has 2 sales for this event/);
    expect(await remove.run('Fixture fair')).toMatch(/still has 2 sales/);
    expect(h.calls('delete_bazaar_booking')).toHaveLength(0);
  });

  it('sends the exact name, lets go of the held day, reads the list again and leaves the event', async () => {
    const h = harness(unsold());
    h.state.held = { dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} };
    h.store.open(BOOKING);
    await settle();
    expect(await h.store.vals().event!.deleteEvent!.run('fixture fair')).toMatch(/exactly/);
    expect(h.calls('delete_bazaar_booking')).toHaveLength(0);
    h.reply('delete_bazaar_booking', { data: { deleted_at: 1_792_900_000_000 } });
    expect(await h.store.vals().event!.deleteEvent!.run('Fixture fair')).toBeNull();
    expect(h.calls('delete_bazaar_booking')).toEqual([
      { p_booking: BOOKING, p_confirm_name: 'Fixture fair' }
    ]);
    expect(h.deps.dayClosed).toHaveBeenCalledWith(DAY2);
    expect(h.deps.refreshBookings).toHaveBeenCalled();
    expect(h.store.vals().event).toBeFalsy();
  });

  it('says why the server refused, and does not leave the event', async () => {
    const h = harness(unsold());
    h.store.open(BOOKING);
    await settle();
    h.reply('delete_bazaar_booking', {
      error: {
        code: '55000',
        message: 'that event has sales: end it and keep or scratch them instead'
      }
    } as Reply);
    expect(await h.store.vals().event!.deleteEvent!.run('Fixture fair')).toMatch(/has sales/);
    expect(h.deps.dayClosed).not.toHaveBeenCalled();
    expect(h.store.vals().event).toBeTruthy();
  });
});

describe('more than one of her devices (14 November 2026)', () => {
  it('a quiet refresh reads the event again with no loading state, and never while a save is out or offline', async () => {
    const h = harness(day2Open());
    h.store.open(BOOKING);
    await settle();
    const reads = () => h.calls('get_bazaar').length;
    const before = reads();
    const refresh = h.store.vals().refresh!;
    expect(h.store.vals().refresh).toBe(refresh);
    refresh();
    expect(h.store.vals().event).toBeTruthy();
    await settle();
    expect(reads()).toBe(before + 1);
    h.state.online = false;
    refresh();
    await settle();
    expect(reads()).toBe(before + 1);
  });
});

describe('Sell on this device guards (review, 14 November 2026)', () => {
  it('is not offered while this phone sells another event', async () => {
    const h = harness(day2Open());
    h.state.held = {
      dayId: 'another-day',
      scheduledId: 'another-booking',
      unsent: 0,
      refused: 0,
      stock: {}
    };
    h.store.open(BOOKING);
    await settle();
    expect(h.store.vals().event!.days.find((d) => d.id === DAY2)!.takeOver ?? null).toBeNull();
  });
});

describe('D3: a price changed on a started day', () => {
  const EVENT2 = 'b0d0e000-0000-4000-8000-000000000012';
  const heldDay2 = () => ({ dayId: DAY2, scheduledId: BOOKING, unsent: 0, refused: 0, stock: {} });
  const opened = async (w: Wire) => {
    const h = harness(w);
    const pricesChanged = vi.fn();
    Object.assign(h.deps, { pricesChanged });
    h.store.open(BOOKING);
    await settle();
    const row = h.store.vals().event!.days.find((d) => d.id === DAY2)!;
    return { h, row, pricesChanged };
  };
  const saved = {
    data: { version: 1, latest: 1, prices: { 'mp0s-a': 13000, 'mp0s-b': 15000 }, duplicate: false }
  };

  it('the selling day offers it with each flavour at its price; a planned or closed day does not', async () => {
    const { row } = await opened(day2Open());
    expect(row.prices?.flavours[0]).toEqual({
      id: 'mp0s-a',
      name: 'A',
      priceText: '₱120.00',
      pricePesos: '120'
    });
    expect(row.prices?.blocked).toBeNull();
    const closed = await opened(clone());
    expect(closed.row.prices).toBeNull();
  });

  it('sends the day, the flavour and whole centavos; the till changes only once the server says yes', async () => {
    const { h, row, pricesChanged } = await opened(day2Open());
    h.reply('set_bazaar_day_price', saved);
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '130' })).toBeNull();
    const [sent] = h.calls('set_bazaar_day_price');
    expect(sent).toEqual({
      p_change: {
        requestId: expect.stringMatching(/^0{8}-0{4}-4000-8000-\d{12}$/),
        eventId: EVENT2,
        productId: 'mp0s-a',
        priceCents: 13000
      }
    });
    expect(pricesChanged).toHaveBeenCalledWith(EVENT2, {
      version: 1,
      prices: { 'mp0s-a': 13000, 'mp0s-b': 15000 }
    });
    expect(h.deps.toast).toHaveBeenCalledWith('A is ₱130.00 from now.');
    expect(localStorage.getItem('hc-bazaar-pending')).toBeNull();
  });

  it('needs signal, and says so without sending or changing the till', async () => {
    const { h, row, pricesChanged } = await opened(day2Open());
    h.state.online = false;
    const offline = h.store.vals().event!.days.find((d) => d.id === DAY2)!;
    expect(offline.prices?.blocked).toMatch(/needs signal/);
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '130' })).toMatch(/needs signal/);
    expect(h.calls('set_bazaar_day_price')).toHaveLength(0);
    expect(pricesChanged).not.toHaveBeenCalled();
  });

  it('refuses a bad price, the same price and a flavour not on the day before sending', async () => {
    const { h, row } = await opened(day2Open());
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '0' })).toMatch(/more than ₱0/);
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '12.345' })).toMatch(/like 125/);
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '120' })).toBe(
      'That is already the price.'
    );
    expect(await row.prices!.change({ productId: 'mp0s-zzz', price: '130' })).toBe(
      'Choose the flavour.'
    );
    expect(h.calls('set_bazaar_day_price')).toHaveLength(0);
  });

  it('a lost answer keeps the id and price: trying again is the same change, even after a reload', async () => {
    const { h, row, pricesChanged } = await opened(day2Open());
    h.reply('set_bazaar_day_price', 'throw');
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '130' })).toMatch(/needs signal/);
    const first = h.calls('set_bazaar_day_price')[0]!;
    expect(pricesChanged).not.toHaveBeenCalled();
    expect(localStorage.getItem('hc-bazaar-pending')).toContain('price:' + DAY2 + ':mp0s-a');

    // Reloaded, and she types another price: the earlier change is settled first, as it was, and she is told.
    const again = new BazaarDays(h.deps);
    again.open(BOOKING);
    await settle();
    h.reply('set_bazaar_day_price', { data: { ...saved.data, duplicate: true } });
    const words = await again
      .vals()
      .event!.days.find((d) => d.id === DAY2)!
      .prices!.change({ productId: 'mp0s-a', price: '140' });
    expect(words).toMatch(/earlier change to A .* is ₱130\.00 now/);
    expect(h.calls('set_bazaar_day_price')[1]).toEqual(first);
    expect(pricesChanged).toHaveBeenCalledWith(EVENT2, expect.objectContaining({ version: 1 }));
    expect(localStorage.getItem('hc-bazaar-pending')).toBeNull();
    // Mutation: a fresh id per call would make the retry a second change at a price she no longer wants.
  });

  it('a lost answer is sent again even when she types the price the day still shows (review, 15 November 2026)', async () => {
    const { h, row } = await opened(day2Open());
    const shown = row
      .prices!.flavours.find((f) => f.id === 'mp0s-a')!
      .priceText.replace(/[^0-9.]/g, '');
    h.reply('set_bazaar_day_price', 'throw');
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '130' })).toMatch(/needs signal/);
    const first = h.calls('set_bazaar_day_price')[0]!;
    h.reply('set_bazaar_day_price', { data: { ...saved.data, duplicate: true } });
    // Retyping the old price must not stop at "already the price": the waiting change is settled first.
    const words = await row.prices!.change({ productId: 'mp0s-a', price: shown });
    expect(words).not.toMatch(/already the price/);
    expect(h.calls('set_bazaar_day_price')[1]).toEqual(first);
  });

  it.each([
    [{ code: '55000', message: 'that day is closed: its prices cannot change' }, /day is closed/],
    [{ code: '22023', message: 'that is already the price' }, /already the price/],
    [{ code: '23505', message: 'request id was already used' }, /could not be saved/],
    [{ code: '42501', message: 'only the owner may change a price' }, /could not be saved/]
  ])('a refusal (%o) changes nothing on the till and lets the id go', async (error, words) => {
    const { h, row, pricesChanged } = await opened(day2Open());
    h.reply('set_bazaar_day_price', { error });
    expect(await row.prices!.change({ productId: 'mp0s-a', price: '130' })).toMatch(words);
    expect(pricesChanged).not.toHaveBeenCalled();
    expect(localStorage.getItem('hc-bazaar-pending')).toBeNull();
  });

  it('the till panel reads the held day and offers the same change', async () => {
    const h = harness(day2Open());
    const pricesChanged = vi.fn();
    Object.assign(h.deps, { pricesChanged });
    h.state.held = heldDay2();
    h.store.openTillPanel('prices');
    expect(h.store.vals().tillPanel).toMatchObject({ kind: 'prices', status: 'loading' });
    await settle();
    const panel = h.store.vals().tillPanel!;
    expect(panel.status).toBe('loaded');
    expect(panel.prices?.flavours.map((f) => f.id)).toContain('mp0s-a');
    h.reply('set_bazaar_day_price', saved);
    expect(await panel.prices!.change({ productId: 'mp0s-a', price: '130' })).toBeNull();
    expect(pricesChanged).toHaveBeenCalledWith(EVENT2, expect.objectContaining({ version: 1 }));
  });
});
