import { describe, expect, it } from 'vitest';
import {
  menuFirst,
  planIds,
  planTotals,
  planTotalsText,
  validatePlan,
  type FieldIssue
} from '@/lib/bazaar/plan';
import {
  costFieldError,
  feeCentsOf,
  formIds,
  pesosText,
  validateCostForm,
  validateFeeForm,
  validateLossForm,
  validateTargetForm
} from '@/lib/bazaar/forms';
import {
  costPendingOf,
  nextDate,
  primaryActionOf,
  startPromptOf,
  strandedRowsOf,
  validateFinalise
} from '@/lib/bazaar/event-rules';
import type { PlanFlavour, StrandedRow } from '@/lib/bazaar/live-bazaar-types';
import type { CostLine } from '@/lib/data/bazaar-days';

/**
 * U4: the rules of the event page and the day plan, as pure functions: every problem comes back with the id of the input to
 * point at, the plan's total is whole centavos, and what closing the event asks (stranded cookies, a missing cost) is
 * decided here. Each `Mutation:` line names a change one of these tests must catch.
 */
const flavour = (over: Partial<PlanFlavour> = {}): PlanFlavour => ({
  id: 'dcf',
  name: 'Double Chocolate Fudge',
  made: '',
  carried: '',
  price: '125',
  photo: '',
  onMenu: true,
  menuPrice: '125',
  ...over
});
const fields = (errors: FieldIssue[]) => errors.map((e) => e.field);

describe('validatePlan returns {field, message}[] keyed by the inputs', () => {
  it('a plan with nothing on the table points at the first flavour’s stepper', () => {
    const r = validatePlan({ floatPesos: '500', flavours: [flavour(), flavour({ id: 'hc' })] });
    expect(r).toMatchObject({
      ok: false,
      errors: [
        {
          field: 'plan-made-dcf',
          message: 'Put at least one cookie on the table to plan this day.'
        }
      ]
    });
  });

  it('names every bad field at once, in the form’s order, with the flavour in the words', () => {
    const r = validatePlan({
      floatPesos: '5oo',
      flavours: [
        flavour({ made: 'x' }),
        flavour({ id: 'hc', name: 'Happy Camper', made: '3', price: '' }),
        flavour({ id: 'ns', name: 'Nutella Stuffed', made: '2', price: '0' }),
        flavour({ id: 'oat', name: 'Oat', carried: '2.5' })
      ]
    });
    if (r.ok) throw new Error('should be refused');
    expect(r.errors).toEqual([
      { field: planIds.float, message: 'The drawer float must be an amount like 500 or 500.50.' },
      {
        field: 'plan-made-dcf',
        message: 'Double Chocolate Fudge: cookies made must be a whole number from 0 to 9,999.'
      },
      { field: 'plan-price-hc', message: 'Happy Camper: set a price like 125 or 125.50.' },
      {
        field: 'plan-price-ns',
        message: 'Nutella Stuffed: the price must be more than ₱0. Set a price like 125.'
      },
      {
        field: 'plan-carried-oat',
        message: 'Oat: cookies carried must be a whole number from 0 to 9,999.'
      }
    ]);
    // The first of them is what the store says when it is asked to save.
    expect(r.error).toBe(r.errors[0]!.message);
    // Mutation: stopping at the first problem hides the others until she fixes it.
  });

  it('a price of 0 is refused only when the flavour has cookies', () => {
    expect(
      validatePlan({
        floatPesos: '',
        flavours: [flavour({ made: '2' }), flavour({ id: 'a', price: '0' })]
      }).ok
    ).toBe(true);
    const r = validatePlan({ floatPesos: '', flavours: [flavour({ made: '2', price: '0' })] });
    expect(r.ok).toBe(false);
  });

  it('a valid plan is whole centavos and whole cookies', () => {
    const r = validatePlan({
      floatPesos: '500.50',
      flavours: [flavour({ made: '20', carried: '3', price: '38.44' })]
    });
    expect(r).toEqual({
      ok: true,
      plan: {
        floatCents: 50050,
        lines: [{ productId: 'dcf', made: 20, carried: 3, priceCents: 3844 }]
      }
    });
    // Mutation: price * 100 without rounding makes 38.44 pesos 3843 centavos.
  });
});

describe('plan totals', () => {
  it('counts cookies made and carried, at each flavour’s own price, in whole centavos', () => {
    const list = [
      flavour({ made: '30', carried: '5', price: '125' }),
      flavour({ id: 'hc', made: '15', price: '38.44' }),
      flavour({ id: 'off', made: '', price: '99' })
    ];
    expect(planTotals(list)).toEqual({ cookies: 50, fullSaleCents: 35 * 12500 + 15 * 3844 });
    expect(planTotalsText(list)).toBe('50 cookies · ₱4,951.60 at full sale');
    // Mutation: 38.44 * 15 * 100 in floating point is 57659.99999…, a centavo short.
  });

  it('reads the example in the brief: 50 cookies at full sale', () => {
    const list = [
      flavour({ made: '30', price: '125' }),
      flavour({ id: 'hc', made: '20', price: '115' })
    ];
    expect(planTotalsText(list)).toBe('50 cookies · ₱6,050.00 at full sale');
  });

  it('says so when nothing is on the table, and counts one cookie in the singular', () => {
    expect(planTotalsText([flavour()])).toBe('Nothing on the table yet');
    expect(planTotalsText([flavour({ made: '1' })])).toBe('1 cookie · ₱125.00 at full sale');
  });

  it('leaves a bad count or price out of the total instead of guessing', () => {
    expect(planTotals([flavour({ made: 'x', price: '125' })])).toEqual({
      cookies: 0,
      fullSaleCents: 0
    });
    expect(planTotals([flavour({ made: '2', price: 'abc' })])).toEqual({
      cookies: 2,
      fullSaleCents: 0
    });
  });
});

describe('menu flavours first (B5)', () => {
  it('puts the menu in the grid, the rest under More flavours, and keeps one that already has cookies', () => {
    const list = [
      flavour({ id: 'a' }),
      flavour({ id: 'b', onMenu: false }),
      flavour({ id: 'c', onMenu: false, made: '4' }),
      flavour({ id: 'd', onMenu: false, carried: '2' }),
      flavour({ id: 'e' })
    ];
    expect(menuFirst(list)).toEqual({ main: ['a', 'c', 'd', 'e'], more: ['b'] });
  });
});

describe('the fee, loss, cost and target forms point at their fields', () => {
  it('a fee needs a name and an amount, each on its own field', () => {
    expect(validateFeeForm({ label: ' ', amount: '' })).toEqual([
      { field: formIds.feeLabel, message: 'Say what the fee is for, like "Permit".' },
      { field: formIds.feeAmount, message: 'Enter the amount in pesos, like 250 or 250.50.' }
    ]);
    expect(validateFeeForm({ label: 'Permit', amount: '0' })).toEqual([
      { field: formIds.feeAmount, message: 'The amount must be more than ₱0.' }
    ]);
    expect(validateFeeForm({ label: 'x'.repeat(81), amount: '10' })[0]!.field).toBe(
      formIds.feeLabel
    );
    expect(validateFeeForm({ label: 'Permit', amount: '1,000,001' })[0]!.message).toBe(
      'The amount is at most ₱1,000,000.00.'
    );
    expect(validateFeeForm({ label: 'Permit', amount: '₱2,500.50' })).toEqual([]);
  });

  it('takes thousands commas and a peso sign, and nothing looser', () => {
    expect(pesosText('₱2,500.00')).toBe('2500.00');
    expect(pesosText('2,5')).toBe('2,5');
    expect(feeCentsOf('2,500.50')).toBe(250050);
    expect(feeCentsOf('2,5')).toBeNull();
    expect(feeCentsOf('12.505')).toBeNull();
    // Mutation: stripping every comma turns 1,2,3 into 123.
    expect(feeCentsOf('1,2,3')).toBeNull();
  });

  it('a loss needs a flavour, a whole count and a reason', () => {
    expect(validateLossForm({ productId: '', qty: '0', reason: '' })).toEqual([
      { field: formIds.lossFlavour, message: 'Choose the flavour that was lost.' },
      {
        field: formIds.lossQty,
        message: 'Enter how many were lost, a whole number from 1 to 9,999.'
      },
      { field: formIds.lossReason, message: 'Say what happened, like "Dropped".' }
    ]);
    expect(validateLossForm({ productId: 'dcf', qty: '2', reason: 'Dropped' })).toEqual([]);
  });

  it('a typed cost may be blank, and otherwise has at most four decimals', () => {
    expect(costFieldError('')).toBeNull();
    expect(costFieldError('28.7525')).toBeNull();
    expect(costFieldError('28.75255')).toMatch(/at most four decimals/);
    expect(validateCostForm({ field: formIds.cost('dcf'), pesos: 'abc' })).toEqual([
      {
        field: 'cost-dcf',
        message:
          'Enter the cost per cookie like 12 or 12.50, with at most four decimals, or leave it blank.'
      }
    ]);
  });

  it('a target may be blank, and otherwise is an amount in pesos', () => {
    expect(validateTargetForm({ pesos: '' })).toEqual([]);
    expect(validateTargetForm({ pesos: '5,000' })).toEqual([]);
    expect(validateTargetForm({ pesos: 'lots' })[0]!.field).toBe(formIds.target);
  });
});

describe('A2: starting a day that is not today asks first', () => {
  const now = new Date('2026-10-15T03:00:00Z');
  it('says which day it is, what today is, and what that does to the sales and the rent', () => {
    expect(
      startPromptOf({ dayYmd: '2026-10-19', today: '2026-10-15', now, firstStart: true })
    ).toEqual({
      title: 'Start a day that is not today?',
      body: 'This day is Mon, 19 Oct. Today is Thu, 15 Oct. Sales will be dated today, and the stall rent will be booked on Mon, 19 Oct.'
    });
  });
  it('names the rent only when this start books it, and asks nothing for today', () => {
    expect(
      startPromptOf({ dayYmd: '2026-10-19', today: '2026-10-15', now, firstStart: false })!.body
    ).toBe('This day is Mon, 19 Oct. Today is Thu, 15 Oct. Sales will be dated today.');
    expect(
      startPromptOf({ dayYmd: '2026-10-15', today: '2026-10-15', now, firstStart: true })
    ).toBeNull();
    // A day already past asks as well (the Ateneo day started late).
    expect(
      startPromptOf({ dayYmd: '2026-10-14', today: '2026-10-15', now, firstStart: false })
    ).not.toBeNull();
  });
  it('finds the date after one, across a month end', () => {
    expect(nextDate('2026-10-25')).toBe('2026-10-26');
    expect(nextDate('2026-10-31')).toBe('2026-11-01');
  });
});

describe('closing the event (A1, A5)', () => {
  const rows: StrandedRow[] = [
    { productId: 'a', name: 'A', qty: 5, hasRecipe: true, suggestedToShop: 5 },
    { productId: 'b', name: 'B', qty: 3, hasRecipe: false, suggestedToShop: 0 },
    { productId: 'c', name: 'C', qty: 2, hasRecipe: null, suggestedToShop: null }
  ];
  const none = { toShop: {}, costs: {}, withoutCost: false };

  it('suggests the shop with a recipe, written off without one, and nothing while the recipes are unread', () => {
    const made = strandedRowsOf(
      [
        { productId: 'a', name: 'a', dayId: 'd', qty: 5 },
        { productId: 'b', name: 'b', dayId: 'd', qty: 3 },
        { productId: 'c', name: 'c', dayId: 'd', qty: 2 }
      ],
      (id) => (id === 'a' ? true : id === 'b' ? false : null),
      (id, fallback) => fallback.toUpperCase() || id
    );
    expect(made).toEqual(rows);
  });

  it('splits what was suggested, and always adds up', () => {
    const r = validateFinalise({
      stranded: rows.slice(0, 2),
      costPending: [],
      value: { ...none, toShop: { a: 2 } }
    });
    expect(r).toEqual({
      ok: true,
      split: { a: { toShop: 2, writtenOff: 3 }, b: { toShop: 0, writtenOff: 3 } },
      costs: []
    });
    const kept = validateFinalise({ stranded: rows.slice(0, 2), costPending: [], value: none });
    expect(kept).toMatchObject({ ok: true, split: { a: { toShop: 5, writtenOff: 0 } } });
  });

  it('refuses an unchosen split, too many for the shop, and any for a flavour with no recipe', () => {
    const r = validateFinalise({
      stranded: rows,
      costPending: [],
      value: { ...none, toShop: { a: 6, b: 1 } }
    });
    if (r.ok) throw new Error('should be refused');
    expect(r.errors).toEqual([
      { field: 'final-shop-a', message: 'A: the cookies sent to the shop must be from 0 to 5.' },
      {
        field: 'final-shop-b',
        message: 'B has no recipe, so it cannot go to the shop. Write it off.'
      },
      {
        field: 'final-shop-c',
        message: 'C: choose where the 2 cookies go, to the shop or written off.'
      }
    ]);
  });

  it('wants a cost for each flavour without one, unless she chose to close without', () => {
    const pending = [
      { productId: 'a', name: 'A' },
      { productId: 'b', name: 'B' }
    ];
    const r = validateFinalise({
      stranded: [],
      costPending: pending,
      value: { ...none, costs: { a: '12.5', b: 'x' } }
    });
    if (r.ok) throw new Error('should be refused');
    expect(fields(r.errors)).toEqual(['final-cost-b']);
    expect(
      validateFinalise({
        stranded: [],
        costPending: pending,
        value: { ...none, costs: { a: '12.5', b: '3' } }
      })
    ).toEqual({
      ok: true,
      split: null,
      costs: [
        { productId: 'a', cents: 1250 },
        { productId: 'b', cents: 300 }
      ]
    });
    expect(
      validateFinalise({
        stranded: [],
        costPending: pending,
        value: { ...none, withoutCost: true }
      })
    ).toEqual({ ok: true, split: null, costs: [] });
    expect(validateFinalise({ stranded: [], costPending: pending, value: none }).ok).toBe(false);
    // Mutation: treating a blank cost as ₱0 closes the event with a profit that is not real.
  });

  it('finds the flavours that have cookies and no cost per cookie', () => {
    const line = (over: Partial<CostLine>): CostLine =>
      ({
        productId: 'a',
        name: 'A',
        unitCents: 1200,
        source: 'recipe',
        uncosted: false,
        made: 10,
        sold: 4,
        ...over
      }) as CostLine;
    expect(
      costPendingOf(
        [
          line({}),
          line({ productId: 'b', name: 'B', unitCents: null, uncosted: true, sold: 18 }),
          line({ productId: 'c', name: 'C', unitCents: null, uncosted: false, made: 0 })
        ],
        (_id, fallback) => fallback
      )
    ).toEqual([{ productId: 'b', name: 'B', sold: 18 }]);
  });
});

describe('the one primary action of the event page', () => {
  const day = (
    id: string,
    word: 'Planned' | 'Selling' | 'Closed',
    action: 'start' | 'review' | 'see'
  ) => ({ id, word, action }) as never;
  const closeable = { blocked: null } as never;
  it('reviews a selling day first, then starts the first planned one, then plans, then closes', () => {
    expect(
      primaryActionOf({
        days: [
          day('1', 'Closed', 'see'),
          day('2', 'Selling', 'review'),
          day('3', 'Planned', 'start')
        ],
        unplanned: [],
        finalise: closeable
      })
    ).toEqual({ kind: 'review', dayId: '2' });
    expect(
      primaryActionOf({
        days: [day('1', 'Closed', 'see'), day('3', 'Planned', 'start')],
        unplanned: [{ ymd: '2026-10-26', text: 'x' }],
        finalise: closeable
      })
    ).toEqual({ kind: 'start', dayId: '3' });
    expect(
      primaryActionOf({
        days: [day('1', 'Closed', 'see')],
        unplanned: [{ ymd: '2026-10-26', text: 'x' }],
        finalise: closeable
      })
    ).toEqual({ kind: 'plan', ymd: '2026-10-26' });
    expect(
      primaryActionOf({ days: [day('1', 'Closed', 'see')], unplanned: [], finalise: closeable })
    ).toEqual({ kind: 'close' });
    expect(
      primaryActionOf({ days: [day('1', 'Closed', 'see')], unplanned: [], finalise: null })
    ).toBeNull();
  });
});
