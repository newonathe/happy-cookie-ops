import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { LiveCheckout } from '@/components/live/live-checkout';
import { PAY_ACCOUNTS, replacePayAccounts } from '@/store/engine/ops-engine';
import type { OrderClient } from '@/lib/data/orders';
import type { PaymentClient, UploadClient } from '@/lib/data/payments';
import { ORDER_COPY } from '@/lib/orders/copy';

/**
 * B4b: boxes, add-ons, the sampler and same-day on the live checkout. The server prices everything; the
 * checkout offers only what the owner offers, sends the picked lines, and refuses a sure failure itself.
 * Each `Mutation:` line names a change one of these tests must catch (each was applied and seen to fail).
 */
const PORTED = PAY_ACCOUNTS.map((m) => ({ ...m }));
const TOKEN = 'c'.repeat(64);
// Monday 5 Oct 2026, 11:00 in Manila: a pickup day, with the rest of the day still ahead.
const NOW = new Date('2026-10-05T03:00:00Z');
const RULES = {
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  unpaid_hold_hours: 24
};
const EXTRAS = (over: Record<string, unknown> = {}) => ({
  same_day: { enabled: false, percent: 40, on_extras: false },
  sampler: { product_id: null, max_qty: 3 },
  boxes: [
    { size: 6, charge_cents: 0 },
    { size: 8, charge_cents: 2500 }
  ],
  add_ons: [
    {
      id: 'sticker',
      name: 'Sticker',
      price_cents: 1500,
      variants: ['1', '2'],
      text_label: null,
      text_max: 150,
      max_qty: 4
    },
    {
      id: 'note-card',
      name: 'Note card',
      price_cents: 1000,
      variants: [],
      text_label: 'Message',
      text_max: 20,
      max_qty: 1
    }
  ],
  ...over
});
const PLACED = {
  order_no: 'HC-1002',
  status_token: TOKEN,
  total_cents: 99000,
  pickup_date: '2026-10-08',
  pickup_window: '10:30',
  replayed: false
};

type Reply = { data: unknown; error: unknown } | Error;
type Handlers = Partial<Record<string, (args: Record<string, unknown>) => Reply | Promise<Reply>>>;

function fakeClient(handlers: Handlers = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ name, args });
    const fallback: Handlers = {
      get_shop_order_rules: () => ({ data: RULES, error: null }),
      get_shop_extras: () => ({ data: EXTRAS(), error: null }),
      get_shop_payment_info: () => ({
        data: {
          methods: [{ id: 'gcash', label: 'GCash', number: '0999', name: 'Owner', qr: '' }],
          texts: {
            registration_badge: '',
            tin_line: '',
            invoice_note: '',
            allergen_note: '',
            updated_at: null
          }
        },
        error: null
      }),
      place_order: () => ({ data: [PLACED], error: null })
    };
    const handler = handlers[name] ?? fallback[name];
    const reply = handler ? await handler(args) : { data: null, error: null };
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const client = { rpc, storage: { from: () => ({ upload: vi.fn() }) } } as unknown as OrderClient &
    PaymentClient &
    UploadClient;
  return { client, rpc, calls };
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

async function mounted(handlers: Handlers = {}, box: Record<string, number> = { dcf: 6 }) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  const fake = fakeClient(handlers);
  await act(async () => {
    await runtime.loadShopPayment(fake.client);
    await runtime.loadShopOrders(fake.client);
  });
  act(() =>
    runtime.setState({ screen: 'checkout', cust: { ...(runtime.state.cust as object), box } })
  );
  return { runtime, ...fake };
}
const live1 = (r: OpsRuntime) => r.renderVals().liveCheckout!;
const custSet = (runtime: OpsRuntime, key: string, value: string) =>
  act(() =>
    (runtime as unknown as { custSet: (k: string, v: string) => void }).custSet(key, value)
  );
const fill = (runtime: OpsRuntime, date = '2026-10-08') => {
  for (const [k, v] of Object.entries({
    name: 'Ana',
    ig: '@ana.bakes',
    mobile: '0917 123 4567',
    pickupDate: date,
    pickupTime: '10:30',
    pay: 'GCash'
  }))
    custSet(runtime, k, v);
};
const submit = async (runtime: OpsRuntime) => {
  await act(async () => {
    runtime.renderVals().cust.submit();
  });
  await flush();
};
const placed = (calls: Array<{ name: string; args: Record<string, unknown> }>) =>
  calls
    .filter((c) => c.name === 'place_order')
    .map((c) => c.args.p_order as Record<string, unknown>);

describe('B4b: boxes, add-ons, the sampler and same-day on the live checkout', () => {
  beforeEach(() => {
    live = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
    window.history.replaceState(null, '', '/');
  });

  it('an order with no extras sends exactly the body it always did', async () => {
    const { runtime, calls } = await mounted();
    fill(runtime);
    await submit(runtime);
    const [body] = placed(calls);
    expect(body).toBeDefined();
    expect(Object.keys(body!).sort()).toEqual([
      'client_id',
      'ig',
      'items',
      'mobile',
      'name',
      'pay_method',
      'pickup_date',
      'pickup_window'
    ]);
    // Mutation: always sending `add_ons: []` and `boxes: []` changes every payload hash and the SQL suite's replay cases.
  });

  it('offers no extras when the owner has none, or when the read failed', async () => {
    const failed = await mounted({
      get_shop_extras: () => ({ data: null, error: { code: '57014' } })
    });
    expect(live1(failed.runtime).extras).toBeNull();
    expect(live1(failed.runtime).totalNote).toBe('');
    cleanup();
    const malformed = await mounted({
      get_shop_extras: () => ({ data: { boxes: 'x' }, error: null })
    });
    expect(live1(malformed.runtime).extras).toBeNull();
    // Mutation: opening the pickers on a malformed answer offers a size or price nobody chose.
  });

  it('boxes appear once the cookies reach the smallest box, and cannot hold more cookies than the order has', async () => {
    const few = await mounted({}, { dcf: 5 });
    expect(live1(few.runtime).extras!.boxes).toEqual([]);
    cleanup();
    const { runtime } = await mounted({}, { dcf: 7 });
    const boxes = () => live1(runtime).extras!.boxes;
    expect(boxes().map((b) => b.label)).toEqual(['Box of 6', 'Box of 8 · ₱25']);
    expect(boxes()[0]).toMatchObject({ qty: 0, max: 1 }); // seven cookies fill one box of six
    expect(boxes()[1]).toMatchObject({ qty: 0, max: 0 }); // and none of eight
    act(() => boxes()[0]!.setQty(1));
    expect(boxes()[0]).toMatchObject({ qty: 1, max: 1 });
    act(() => boxes()[0]!.setQty(0));
    expect(boxes()[0]!.qty).toBe(0);
    // Mutation: a max that ignores the cookies already boxed lets one cookie sit in two boxes; the server refuses (box-fit).
  });

  it('the sampler and other sets do not count toward boxes', async () => {
    const { runtime } = await mounted(
      {
        get_shop_extras: () => ({
          data: EXTRAS({ sampler: { product_id: 'pbm', max_qty: 2 } }),
          error: null
        })
      },
      { dcf: 4, wcb: 1, pbm: 2 }
    );
    expect(live1(runtime).extras!.boxes).toEqual([]);
    // Mutation: counting the sampler as cookies offers a box of six for five cookies and a sampler.
  });

  it('add-ons: a row per design, a message box only for the add-on that has one, limits shared across rows', async () => {
    const { runtime } = await mounted();
    const add = () => live1(runtime).extras!.addOns;
    const sticker = () => add().find((a) => a.id === 'sticker')!;
    expect(sticker().priceText).toBe('₱15');
    expect(sticker().rows.map((r) => r.label)).toEqual(['Sticker 1', 'Sticker 2']);
    act(() => sticker().rows[0]!.setQty(3));
    // four in all: three of design 1 leave one for design 2
    expect(sticker().rows[0]).toMatchObject({ qty: 3, max: 4 });
    expect(sticker().rows[1]).toMatchObject({ qty: 0, max: 1 });
    const note = () => add().find((a) => a.id === 'note-card')!;
    expect(note().textLabel).toBe('Message');
    expect(note().rows).toHaveLength(1);
    expect(note().rows[0]!.max).toBe(1); // one card at a time
    act(() => note().rows[0]!.setQty(1));
    act(() => note().rows[0]!.setText('Happy birthday to you, Mika!'));
    expect(note().rows[0]!.text).toBe('Happy birthday to you,'.slice(0, 20)); // the owner's message length
    // Mutation: a per-row max lets 4 + 4 stickers through; the server counts them together (addon-qty).
  });

  it('sends the picked boxes and add-ons, sorted, and shows them on the placed card', async () => {
    const { runtime, calls } = await mounted({}, { dcf: 7 });
    fill(runtime);
    const x = () => live1(runtime).extras!;
    act(() => x().boxes[0]!.setQty(1));
    act(() =>
      x()
        .addOns.find((a) => a.id === 'sticker')!
        .rows[1]!.setQty(2)
    );
    act(() =>
      x()
        .addOns.find((a) => a.id === 'sticker')!
        .rows[0]!.setQty(1)
    );
    const note = () => x().addOns.find((a) => a.id === 'note-card')!.rows[0]!;
    act(() => note().setQty(1));
    act(() => note().setText('  Happy birthday  '));
    expect(live1(runtime).totalNote).toBe(ORDER_COPY.extras.totalNote);
    await submit(runtime);
    const [body] = placed(calls);
    expect(body!.boxes).toEqual([{ size: 6, qty: 1 }]);
    expect(body!.add_ons).toEqual([
      { id: 'note-card', qty: 1, text: 'Happy birthday' },
      { id: 'sticker', qty: 1, variant: '1' },
      { id: 'sticker', qty: 2, variant: '2' }
    ]);
    const p = live1(runtime).placed!;
    expect(p.extraLines).toEqual([
      'Note card × 1',
      'Sticker 1 × 1',
      'Sticker 2 × 2',
      'Box of 6 × 1'
    ]);
    expect(p.totalText).toBe('₱990'); // the server's total, never one worked out here
    const view = render(<LiveCheckout v={runtime.renderVals()} />);
    expect(view.container.textContent).toContain('With: Note card × 1');
    // Mutation: sending an empty variant string or an untrimmed message is refused by the server (22023).
  });

  it('refuses, without sending, a message-less note card, a missing design, too many sampler boxes and too many boxes', async () => {
    const { runtime, calls } = await mounted(
      {
        get_shop_extras: () => ({
          data: EXTRAS({ sampler: { product_id: 'pbm', max_qty: 2 } }),
          error: null
        })
      },
      { dcf: 6, pbm: 3 }
    );
    fill(runtime);
    await submit(runtime);
    expect(placed(calls)).toEqual([]);
    expect(live1(runtime).errors.extras).toBe(ORDER_COPY.extras.sampler);
    cleanup();
    const b = await mounted({}, { dcf: 6 });
    fill(b.runtime);
    const note = () => live1(b.runtime).extras!.addOns.find((a) => a.id === 'note-card')!.rows[0]!;
    act(() => note().setQty(1));
    await submit(b.runtime);
    expect(placed(b.calls)).toEqual([]);
    expect(live1(b.runtime).errors.extras).toBe(ORDER_COPY.extras.text);
    act(() => note().setText('hi'));
    await submit(b.runtime);
    expect(placed(b.calls)).toHaveLength(1);
    // Mutation: dropping the client checks sends orders the server refuses with a generic "not accepted".
  });

  it('a box size the owner switched off after the page loaded: reloads the choices and drops the pick', async () => {
    let extras = EXTRAS();
    const { runtime, calls } = await mounted(
      {
        get_shop_extras: () => ({ data: extras, error: null }),
        place_order: () => ({ data: null, error: { code: 'ZC007' } })
      },
      { dcf: 6 }
    );
    fill(runtime);
    act(() => live1(runtime).extras!.boxes[0]!.setQty(1));
    extras = EXTRAS({ boxes: [{ size: 8, charge_cents: 2500 }] });
    await submit(runtime);
    expect(live1(runtime).banner?.text).toBe(ORDER_COPY.extras.notOffered);
    expect(calls.filter((c) => c.name === 'get_shop_extras').length).toBeGreaterThanOrEqual(2);
    expect(live1(runtime).extras!.boxes).toEqual([]); // six cookies do not fill a box of eight
    expect((runtime as unknown as { orderFlow: { boxQty: object } }).orderFlow.boxQty).toEqual({}); // and the pick is gone
    // Mutation: not reading the extras again leaves the switched-off size on screen, so the customer is refused again and again.
  });

  it('same-day: offered only when the owner switched it on, with its percent, and only later time slots', async () => {
    const off = await mounted();
    expect(live1(off.runtime).dates.some((d) => d.value === '2026-10-05')).toBe(false);
    cleanup();
    const { runtime, calls } = await mounted({
      get_shop_extras: () => ({
        data: EXTRAS({ same_day: { enabled: true, percent: 40, on_extras: false } }),
        error: null
      })
    });
    const dates = live1(runtime).dates;
    expect(dates[0]).toMatchObject({ value: '2026-10-05' });
    expect(dates[0]!.label).toContain('same-day +40%');
    expect(dates[1]!.value).toBe('2026-10-08');
    expect(live1(runtime).times.some((t) => t.value === '09:00')).toBe(true);
    custSet(runtime, 'pickupDate', '2026-10-05');
    const times = live1(runtime).times.map((t) => t.value);
    expect(times[0]).toBe('11:30'); // it is 11:00: nothing at or before it
    expect(times).toContain('campus');
    expect(live1(runtime).extras!.sameDayNotice).toBe(ORDER_COPY.extras.sameDayNotice(40));
    expect(live1(runtime).totalNote).toBe(ORDER_COPY.extras.totalNote);
    fill(runtime, '2026-10-05');
    custSet(runtime, 'pickupTime', '12:00');
    await submit(runtime);
    expect(placed(calls)[0]!.pickup_date).toBe('2026-10-05');
    // Mutation: offering today with no percent, or every slot, sends a refusal (ZC004) the customer cannot understand.
  });

  it('same-day with no time slot left today says so instead of showing an empty picker', async () => {
    vi.setSystemTime(new Date('2026-10-05T15:45:00Z')); // 23:45 in Manila: past the last half-hour slot and the campus slot
    const { runtime } = await mounted({
      get_shop_extras: () => ({
        data: EXTRAS({ same_day: { enabled: true, percent: 40, on_extras: false } }),
        error: null
      })
    });
    custSet(runtime, 'pickupDate', '2026-10-05');
    expect(live1(runtime).times).toEqual([]);
    expect(live1(runtime).extras!.sameDayNotice).toBe(ORDER_COPY.extras.noSlotsToday);
    // Mutation: showing the percent notice with no times leaves the customer at a picker that never appears.
  });

  it('an unsettled attempt sends the identical body again, whatever is picked meanwhile', async () => {
    let n = 0;
    const { runtime, calls } = await mounted(
      {
        place_order: () => (++n === 1 ? new Error('lost reply') : { data: [PLACED], error: null })
      },
      { dcf: 7 }
    );
    fill(runtime);
    act(() => live1(runtime).extras!.boxes[0]!.setQty(1));
    await submit(runtime);
    expect(live1(runtime).frozen).toBe(true);
    act(() => live1(runtime).extras!.boxes[0]!.setQty(0)); // locked: ignored
    act(() => live1(runtime).extras!.addOns[0]!.rows[0]!.setQty(1)); // locked: ignored
    await submit(runtime);
    const [first, second] = placed(calls);
    expect(second).toEqual(first);
    expect(second!.boxes).toEqual([{ size: 6, qty: 1 }]);
    expect(second!.add_ons).toBeUndefined();
    // Mutation: letting a locked form change the selection resends a different body under the same client id (23505).
  });

  it('a box already picked stays visible and removable when the cookies drop below the smallest box', async () => {
    const { runtime } = await mounted({}, { dcf: 6 });
    act(() => live1(runtime).extras!.boxes[0]!.setQty(1));
    act(() => runtime.setState({ cust: { ...(runtime.state.cust as object), box: { dcf: 4 } } }));
    const boxes = live1(runtime).extras!.boxes;
    expect(boxes[0]).toMatchObject({ qty: 1 });
    act(() => boxes[0]!.setQty(0));
    expect(live1(runtime).extras!.boxes).toEqual([]);
    // Mutation: hiding the card at once leaves a pick nobody can undo, and every submit refused.
  });

  it('a refusal of an order with boxes is worded about the boxes, not the generic "not accepted"', async () => {
    const { runtime } = await mounted(
      { place_order: () => ({ data: null, error: { code: '22023' } }) },
      { dcf: 6 }
    );
    fill(runtime);
    act(() => live1(runtime).extras!.boxes[0]!.setQty(1));
    await submit(runtime);
    expect(live1(runtime).banner?.text).toBe(ORDER_COPY.extras.box);
    // Mutation: the generic sentence tells a customer nothing about the size or the cookies that failed.
  });

  it('a design with a bar in its name still orders as itself', async () => {
    const { runtime, calls } = await mounted({
      get_shop_extras: () => ({
        data: EXTRAS({
          add_ons: [
            {
              id: 'sticker',
              name: 'Sticker',
              price_cents: 1500,
              variants: ['a|b', 'c'],
              text_label: null,
              text_max: 150,
              max_qty: 4
            }
          ]
        }),
        error: null
      })
    });
    fill(runtime);
    act(() => live1(runtime).extras!.addOns[0]!.rows[0]!.setQty(1));
    await submit(runtime);
    expect(placed(calls)[0]!.add_ons).toEqual([{ id: 'sticker', qty: 1, variant: 'a|b' }]);
    // Mutation: splitting the selection key on a bar cuts this design to "a" and the pick is dropped or refused.
  });

  it('a date that became today while the customer filled the form is confirmed before it is sent', async () => {
    // Sunday 4 Oct, 23:59:30 in Manila. Monday is tomorrow, so it shows with no same-day extra.
    vi.setSystemTime(new Date('2026-10-04T15:59:30Z'));
    const { runtime, calls } = await mounted({
      get_shop_extras: () => ({
        data: EXTRAS({ same_day: { enabled: true, percent: 40, on_extras: false } }),
        error: null
      })
    });
    expect(live1(runtime).dates.some((d) => d.sameDay)).toBe(false);
    fill(runtime, '2026-10-05');
    expect(live1(runtime).extras!.sameDayNotice).toBe('');
    // The tap lands on the button the customer saw before midnight, so nothing has re-rendered since.
    const tap = runtime.renderVals().cust.submit;
    vi.setSystemTime(new Date('2026-10-04T16:00:30Z')); // it is Monday now: the date is today, and same-day
    await act(async () => {
      tap();
    });
    await flush();
    expect(placed(calls)).toEqual([]);
    expect(live1(runtime).errors.date).toBe(ORDER_COPY.extras.sameDayNow(40));
    // The page has re-rendered with the extra shown; the next tap goes through.
    expect(live1(runtime).dates[0]).toMatchObject({ value: '2026-10-05', sameDay: true });
    expect(live1(runtime).extras!.sameDayNotice).toBe(ORDER_COPY.extras.sameDayNotice(40));
    custSet(runtime, 'pickupTime', '23:30');
    await submit(runtime);
    expect(placed(calls)).toHaveLength(1);
    // Mutation: without the check the server adds 40% to an order whose form never said so.
  });

  it('the ported "no extra charge" line is replaced in live mode', async () => {
    const { runtime } = await mounted();
    expect(runtime.renderVals().cust.priceNote).toBe(ORDER_COPY.extras.priceNote);
    expect(ORDER_COPY.extras.priceNote).not.toMatch(/no extra/i);
  });

  it('same-day is not offered on a day that is not a pickup day', async () => {
    vi.setSystemTime(new Date('2026-10-06T03:00:00Z')); // a Tuesday
    const { runtime } = await mounted({
      get_shop_extras: () => ({
        data: EXTRAS({ same_day: { enabled: true, percent: 40, on_extras: false } }),
        error: null
      })
    });
    expect(live1(runtime).dates.some((d) => d.value === '2026-10-06')).toBe(false);
  });

  it('what was picked is gone for the next order, and locked while the order is settled', async () => {
    const { runtime } = await mounted({}, { dcf: 7 });
    fill(runtime);
    act(() => live1(runtime).extras!.boxes[0]!.setQty(1));
    await submit(runtime);
    const flow = (
      runtime as unknown as { orderFlow: { boxQty: object; lines: object; placedLines: string[] } }
    ).orderFlow;
    act(() => live1(runtime).extras!.boxes[0]!.setQty(0)); // placed: locked, so this changes nothing
    expect(live1(runtime).placed).not.toBeNull();
    expect(flow.boxQty).toEqual({ 6: 1 });
    act(() => live1(runtime).placed!.orderAgain());
    expect(flow.boxQty).toEqual({});
    expect(flow.lines).toEqual({});
    expect(flow.placedLines).toEqual([]);
    // Mutation: not clearing the selection carries last week's sticker note into the next order.
  });
});
