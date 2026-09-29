import { describe, expect, it } from 'vitest';
import { extrasSelectionError, parseShopExtras, type ShopExtras } from '@/lib/data/order-extras';
import { buildOrderBody, isDefiniteCode, refusalMessage } from '@/lib/data/orders';
import { manilaMinutes, pickupDates, pickupTimes, type ShopOrderRules } from '@/lib/orders/pickup';
import { ORDER_COPY } from '@/lib/orders/copy';

/**
 * B4b: the customer's side of boxes, add-ons and same-day, as pure functions. Each `Mutation:` line names
 * a change one of these tests must catch (each was applied and seen to fail).
 */
const wire = (over: Record<string, unknown> = {}) => ({
  same_day: { enabled: true, percent: 40, on_extras: false },
  sampler: { product_id: 'pbm', max_qty: 2 },
  boxes: [
    { size: 8, charge_cents: 2500 },
    { size: 6, charge_cents: 0 }
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
      text_max: 10,
      max_qty: 1
    }
  ],
  ...over
});

describe('parseShopExtras', () => {
  it('reads the public answer, boxes smallest first', () => {
    const x = parseShopExtras(wire())!;
    expect(x.sameDay).toEqual({ enabled: true, percent: 40, onExtras: false });
    expect(x.sampler).toEqual({ productId: 'pbm', maxQty: 2 });
    expect(x.boxes).toEqual([
      { size: 6, chargeCents: 0 },
      { size: 8, chargeCents: 2500 }
    ]);
    expect(x.addOns[1]).toMatchObject({ id: 'note-card', textLabel: 'Message', textMax: 10 });
    expect(
      parseShopExtras(wire({ sampler: { product_id: null, max_qty: 3 } }))!.sampler.productId
    ).toBeNull();
    // Mutation: not sorting shows a box of 8 before a box of 6, and the "smallest box" test reads the wrong one.
  });

  it('refuses anything unexpected, so no picker opens on a guess', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      wire({ same_day: null }),
      wire({ same_day: { enabled: 'y', percent: 40, on_extras: false } }),
      wire({ same_day: { enabled: true, percent: 101, on_extras: false } }),
      wire({ same_day: { enabled: true, percent: 40 } }),
      wire({ sampler: { product_id: 3, max_qty: 2 } }),
      wire({ sampler: { product_id: null, max_qty: 0 } }),
      wire({ boxes: {} }),
      wire({ boxes: [{ size: 1, charge_cents: 0 }] }),
      wire({ boxes: [{ size: 6, charge_cents: -1 }] }),
      wire({ add_ons: 'no' }),
      wire({ add_ons: [{ ...wire().add_ons[0], id: 'Bad Id' }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], variants: [1] }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], text_label: 5 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], price_cents: 1.5 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], max_qty: 0 }] }),
      wire({ add_ons: [{ ...wire().add_ons[0], text_max: 301 }] })
    ];
    for (const b of bad) expect(parseShopExtras(b)).toBeNull();
  });
});

const X = parseShopExtras(wire()) as ShopExtras;
const WORDS = {
  box: 'BOX',
  addOn: 'ADDON',
  variant: 'VARIANT',
  text: 'TEXT',
  textLong: 'LONG',
  qty: 'QTY',
  sampler: 'SAMPLER'
};
const check = (
  addOns: Array<{ id: string; variant?: string; qty: number; text?: string }>,
  boxes: Array<{ size: number; qty: number }> = [],
  cart = { cookieQty: 12, samplerQty: 0 }
) =>
  extrasSelectionError(
    X,
    { addOns: addOns.map((a) => ({ variant: '', text: '', ...a })), boxes },
    cart,
    WORDS
  );

describe('extrasSelectionError mirrors the checks place_order makes', () => {
  it('accepts a sound pick', () => {
    expect(
      check(
        [
          { id: 'sticker', variant: '1', qty: 2 },
          { id: 'sticker', variant: '2', qty: 2 },
          { id: 'note-card', qty: 1, text: 'Hi Mika' }
        ],
        [
          { size: 6, qty: 1 },
          { size: 8, qty: 0 }
        ].filter((b) => b.qty > 0)
      )
    ).toBeNull();
    expect(check([])).toBeNull();
  });

  it.each([
    ['a box size that is not offered', () => check([], [{ size: 7, qty: 1 }]), 'BOX'],
    [
      'a box size listed twice',
      () =>
        check(
          [],
          [
            { size: 6, qty: 1 },
            { size: 6, qty: 1 }
          ]
        ),
      'BOX'
    ],
    [
      'more cookies boxed than ordered',
      () => check([], [{ size: 8, qty: 1 }], { cookieQty: 7, samplerQty: 0 }),
      'BOX'
    ],
    ['too many sampler boxes', () => check([], [], { cookieQty: 6, samplerQty: 3 }), 'SAMPLER'],
    ['an add-on that is not offered', () => check([{ id: 'gold', qty: 1 }]), 'ADDON'],
    [
      'the same add-on line twice',
      () =>
        check([
          { id: 'sticker', variant: '1', qty: 1 },
          { id: 'sticker', variant: '1', qty: 1 }
        ]),
      'ADDON'
    ],
    ['a design missing', () => check([{ id: 'sticker', qty: 1 }]), 'VARIANT'],
    [
      'a design that does not exist',
      () => check([{ id: 'sticker', variant: '9', qty: 1 }]),
      'VARIANT'
    ],
    [
      'a design on an add-on with none',
      () => check([{ id: 'note-card', variant: '1', qty: 1, text: 'x' }]),
      'VARIANT'
    ],
    ['no message on a note card', () => check([{ id: 'note-card', qty: 1 }]), 'TEXT'],
    ['a blank message', () => check([{ id: 'note-card', qty: 1, text: '   ' }]), 'TEXT'],
    ['two cards on one message', () => check([{ id: 'note-card', qty: 2, text: 'x' }]), 'TEXT'],
    [
      'a message on an add-on that has no message',
      () => check([{ id: 'sticker', variant: '1', qty: 1, text: 'x' }]),
      'TEXT'
    ],
    [
      'a message that is too long',
      () => check([{ id: 'note-card', qty: 1, text: '12345678901' }]),
      'LONG'
    ],
    [
      'more of one add-on than the limit, across designs',
      () =>
        check([
          { id: 'sticker', variant: '1', qty: 3 },
          { id: 'sticker', variant: '2', qty: 2 }
        ]),
      'QTY'
    ]
  ])('refuses %s', (_name, run, words) => {
    expect(run()).toBe(words);
    // Mutation: dropping any one of these checks sends what the server refuses; each row fails without its check.
  });

  it('boxes without a sampler configured do not trip the sampler check', () => {
    const none = { ...X, sampler: { productId: null, maxQty: 1 } };
    expect(
      extrasSelectionError(none, { addOns: [], boxes: [] }, { cookieQty: 6, samplerQty: 5 }, WORDS)
    ).toBeNull();
  });
});

describe('the order body carries extras only when there are some', () => {
  const base = {
    name: ' Ana ',
    ig: '@ana',
    mobile: '0917 123 4567',
    method: 'GCash',
    pickupDate: '2026-10-08',
    pickupWindow: '10:30',
    ref: '',
    items: { dcf: 2 }
  };
  it('leaves add_ons and boxes out when empty or zero', () => {
    for (const f of [
      base,
      { ...base, addOns: [], boxes: [] },
      { ...base, boxes: [{ size: 6, qty: 0 }] }
    ])
      expect(Object.keys(buildOrderBody('id', f)).sort()).toEqual([
        'client_id',
        'ig',
        'items',
        'mobile',
        'name',
        'pay_method',
        'pickup_date',
        'pickup_window'
      ]);
  });

  it('sends only what the customer chose: no price, a design only where there is one, a trimmed message', () => {
    const body = buildOrderBody('id', {
      ...base,
      addOns: [
        { id: 'sticker', variant: '2', qty: 2, text: '' },
        { id: 'note-card', variant: '', qty: 1, text: ' Hi Mika ' },
        { id: 'ribbon', variant: '', qty: 0, text: '' }
      ],
      boxes: [
        { size: 8, qty: 1 },
        { size: 6, qty: 2 }
      ]
    });
    expect(body.add_ons).toEqual([
      { id: 'sticker', qty: 2, variant: '2' },
      { id: 'note-card', qty: 1, text: 'Hi Mika' }
    ]);
    expect(body.boxes).toEqual([
      { size: 6, qty: 2 },
      { size: 8, qty: 1 }
    ]);
    expect(JSON.stringify(body)).not.toMatch(/price|total|charge|surcharge/);
    // Mutation: sending a blank variant or a zero-quantity line is refused (22023) by place_order.
  });

  it('ZC007 is a definite refusal with its own words', () => {
    expect(isDefiniteCode('ZC007')).toBe(true);
    expect(refusalMessage('ZC007')).toBe(ORDER_COPY.extras.notOffered);
    // Mutation: leaving it out makes the reply "unknown": the same body is resent under the same id and refused forever.
  });
});

describe('same-day dates and times', () => {
  const rules: ShopOrderRules = {
    pickupDays: [1, 4],
    leadMinDays: 1,
    leadMaxDays: 14,
    pickupFromHour: 9,
    pickupCutoffHour: 17,
    campusFrom: '14:00',
    campusTo: '15:30',
    unpaidHoldHours: 24
  };
  const MONDAY_11 = new Date('2026-10-05T03:00:00Z'); // 11:00 in Manila

  it('offers today, first and labelled, only when same-day is on and today is a pickup day', () => {
    expect(pickupDates(rules, MONDAY_11).map((d) => d.value)).toEqual([
      '2026-10-08',
      '2026-10-12',
      '2026-10-15',
      '2026-10-19'
    ]);
    const on = pickupDates(rules, MONDAY_11, 40);
    expect(on[0]).toMatchObject({ value: '2026-10-05', sameDay: true });
    expect(on[0]!.label).toBe('Today, Oct 5 · same-day +40%');
    expect(on.slice(1).every((d) => !d.sameDay)).toBe(true);
    const tuesday = new Date('2026-10-06T03:00:00Z');
    expect(pickupDates(rules, tuesday, 40).some((d) => d.sameDay)).toBe(false);
    // The Manila date, not the device's or UTC's: 00:30 in Manila on Monday is still Sunday in UTC.
    const early = new Date('2026-10-04T16:30:00Z');
    expect(pickupDates(rules, early, 40)[0]).toMatchObject({ value: '2026-10-05', sameDay: true });
    // Mutation: using the UTC date offers Sunday, which is not a pickup day, and hides Monday.
  });

  it('offers only slots that start later than now on a same-day pickup', () => {
    expect(manilaMinutes(MONDAY_11)).toBe(11 * 60);
    const all = pickupTimes(rules).map((t) => t.value);
    expect(all[0]).toBe('09:00');
    expect(all).toContain('campus');
    const later = pickupTimes(rules, manilaMinutes(MONDAY_11)).map((t) => t.value);
    expect(later[0]).toBe('11:30');
    expect(later).toContain('campus');
    const evening = pickupTimes(rules, 14 * 60 + 10).map((t) => t.value); // the campus slot began at 14:00
    expect(evening).not.toContain('campus');
    expect(evening[0]).toBe('14:30');
    // Mutation: `<` instead of `<=` offers the slot that starts this minute, which place_order refuses.
  });
});
