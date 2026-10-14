import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BazaarDays, type BazaarDaysDeps } from '@/store/bazaar-days';
import type { BazaarClient } from '@/lib/data/bazaar-days';
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
    openAdd: () => {}
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
        // S3.1: the till's own figures, for the server to check against what it holds.
        sales_count: 3,
        cash_cents: 48000
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
    expect(event.feesTotalText).toBe('₱800');
    expect(event.fees.map((f) => f.amountText)).toEqual(['₱500', '₱250', '₱50']);
    expect(event.targetText).toBe('₱500');
    expect(event.costs.map((c) => c.text)).toEqual([
      '₱12.005 per cookie · from the recipe',
      '₱28.7525 per cookie · typed by you',
      '₱10.00 per cookie · typed by you',
      'Cost pending'
    ]);
    expect(event.figures.map((f) => f.key)).toEqual([
      'revenue',
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
    expect(await event.finalise!.run()).toBeNull();
    expect(h.calls('finalise_bazaar')).toEqual([
      { p_booking: BOOKING, p_expected: example.summary.hash, p_drop: 32, p_till: null }
    ]);
    expect(h.deps.finalised).toHaveBeenCalledTimes(1);
  });

  it('a changed event is read again and not closed; an open day blocks the close', async () => {
    const { h, event } = await page(clone());
    h.reply('finalise_bazaar', { error: { code: '40001' } });
    expect(await event.finalise!.run()).toMatch(/changed since you looked/);
    expect(h.deps.finalised).not.toHaveBeenCalled();
    const open = await page(day2Open());
    expect(open.event.finalise!.blocked).toMatch(/still selling/);
    expect(await open.event.finalise!.run()).toMatch(/still selling/);
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
    h.state.till = { salesCount: 3, cashCents: 48000 };
    h.store.open(BOOKING);
    await settle();
    expect(await h.store.vals().event!.finalise!.run()).toBeNull();
    expect(h.calls('finalise_bazaar')[0]!.p_till).toEqual({
      day_id: DAY2,
      sales_count: 3,
      cash_cents: 48000
    });
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
