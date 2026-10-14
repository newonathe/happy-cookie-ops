import { describe, expect, it } from 'vitest';
import { parseBazaar, type Bazaar, type BazaarDay } from '@/lib/data/bazaar-days';
import {
  amountCents,
  closeFromForm,
  dayFiguresOf,
  eventFiguresOf,
  moneyText,
  stockRowsOf,
  typedCostCents,
  unitCostText,
  wholeCount
} from '@/lib/bazaar/review';
import type { CloseInput } from '@/lib/bazaar/live-bazaar-types';
import example from '../fixtures/bazaar-example.json';

/**
 * S3: the review's words. Every figure on screen is `bazaar_summary`'s own number, formatted, and a cost that is not
 * known reads "Cost pending", never ₱0. The fixture is the hand-worked two-day example (both days closed): revenue
 * 1,750.00, fees 800.00, cookie cost 555.62, profit 389.38, 110.62 under a 500.00 target. Each `Mutation:` line names a
 * change one of these tests must catch.
 */
type Wire = {
  summary: {
    counted: boolean;
    hash: string;
    days: Array<Record<string, unknown> & { lines: Array<Record<string, unknown>> }>;
    cookie_cost: Record<string, unknown> & {
      parts: Array<Record<string, unknown>>;
      lines: Array<Record<string, unknown>>;
    };
    profit: Record<string, unknown> & { parts: Array<Record<string, unknown>> };
    target: Record<string, unknown>;
  };
  [key: string]: unknown;
};
const clone = () => JSON.parse(JSON.stringify(example)) as unknown as Wire;
const read = (w: Wire): Bazaar => {
  const b = parseBazaar(w as never);
  if (!b) throw new Error('the variant is not understood by the parser');
  return b;
};

const OPEN = {
  state: 'open',
  count: null,
  closed_at: null,
  counted_cents: null,
  over_cents: null,
  short_cents: null
};
/** Day 1 selling, day 2 only planned: the answer as it is on the first evening. */
function day1Open(): Wire {
  const w = clone();
  Object.assign(w.summary.days[0]!, OPEN);
  Object.assign(w.summary.days[1]!, OPEN, { state: 'planned', event_id: null });
  for (const l of w.summary.days[1]!.lines) Object.assign(l, { sold: 0, given: 0, lost: 0 });
  w.summary.counted = false;
  return w;
}

const names = new Map<string, string>();
const figure = (list: ReturnType<typeof eventFiguresOf>, key: string) => {
  const f = list.find((x) => x.key === key);
  if (!f) throw new Error('no figure ' + key);
  return f;
};

describe('the variants used here are understood by the parser', () => {
  it('the fixture and its open variant both parse', () => {
    expect(parseBazaar(example as never)).not.toBeNull();
    const open = read(day1Open());
    expect(open.days.map((d) => d.state)).toEqual(['open', 'planned']);
  });
});

describe('the event figures, as words', () => {
  const b = read(clone());
  const figures = eventFiguresOf(b);

  it('has the five figures in order', () => {
    expect(figures.map((f) => f.key)).toEqual([
      'revenue',
      'fees',
      'cookie-cost',
      'profit',
      'target'
    ]);
  });

  it('reads the headline of each figure to the centavo', () => {
    expect(figures.map((f) => [f.key, f.valueText])).toEqual([
      ['revenue', '₱1,750.00'],
      ['fees', '₱800.00'],
      ['cookie-cost', '₱555.62'],
      ['profit', '₱389.38'],
      ['target', '₱110.62 under the target']
    ]);
    // Mutation: formatting the cookie cost from the made cost, or dropping the sign of the target, changes a headline.
  });

  it('opens profit into the database parts, a loss as a minus', () => {
    expect(figure(figures, 'profit').parts.map((p) => p.valueText)).toEqual([
      '₱1,750.00',
      '-₱800.00',
      '-₱555.62',
      '₱0.00',
      '-₱5.00'
    ]);
  });

  it('opens the cookie cost into what was sold, given, lost and written off, with the rounding', () => {
    const parts = figure(figures, 'cookie-cost').parts;
    expect(parts.find((p) => p.label === 'Sold')).toEqual({
      label: 'Sold',
      detail: '14 cookies',
      valueText: '₱214.31'
    });
    expect(parts.find((p) => p.label === 'Rounding')).toMatchObject({
      detail: null,
      valueText: '-₱0.02'
    });
  });

  it('shows the recipe cost per cookie on a flavour line, with its source', () => {
    const line = figure(figures, 'cookie-cost').parts.find((p) => p.label === 'Fixture A');
    expect(line?.valueText).toBe('₱228.09');
    expect(line?.detail).toContain('₱12.005');
    expect(line?.detail).toContain('from the recipe');
  });

  it('shows a cost she typed as hers', () => {
    const line = figure(figures, 'cookie-cost').parts.find((p) => p.label === 'Fixture B');
    expect(line?.valueText).toBe('₱287.53');
    expect(line?.detail).toContain('₱28.7525');
    expect(line?.detail).toContain('typed by you');
  });

  it('leaves out a flavour that was never made', () => {
    expect(
      figure(figures, 'cookie-cost').parts.find((p) => p.label === 'Fixture D')
    ).toBeUndefined();
  });

  it('opens the target into the target and what revenue is still needed', () => {
    expect(figure(figures, 'target').parts.map((p) => [p.label, p.valueText])).toEqual([
      ['Target', '₱500.00'],
      ['Revenue still needed', '₱110.62']
    ]);
  });

  it('says over the target when profit is past it', () => {
    const w = clone();
    Object.assign(w.summary.target, { against_cents: 2500, revenue_needed_cents: 0 });
    expect(figure(eventFiguresOf(read(w)), 'target').valueText).toBe('₱25.00 over the target');
  });

  it('says no target set when there is none', () => {
    const w = clone();
    Object.assign(w.summary.target, {
      cents: null,
      against_cents: null,
      revenue_needed_cents: null
    });
    expect(figure(eventFiguresOf(read(w)), 'target').valueText).toBe('No target set');
  });
});

describe("one day's figures", () => {
  const b = read(clone());

  it('reads the revenue of the day', () => {
    const f = dayFiguresOf(b, b.days[0]!);
    expect(f.find((x) => x.key === 'day-revenue')?.valueText).toBe('₱880.00');
  });

  it('reads a closed day that was 5 short as short, with the cash it was worked from', () => {
    const cash = dayFiguresOf(b, b.days[0]!).find((x) => x.key === 'day-cash')!;
    expect(cash.valueText).toBe('₱5.00 short');
    expect(cash.parts.map((p) => [p.label, p.valueText])).toEqual([
      ['Float', '₱500.00'],
      ['Cash sales', '₱500.00'],
      ['Expected', '₱1,000.00'],
      ['Counted', '₱995.00']
    ]);
    // Mutation: calling a short day "Exact", or swapping expected and counted, changes this.
  });

  it('reads a closed day that matched as exact', () => {
    const cash = dayFiguresOf(b, b.days[1]!).find((x) => x.key === 'day-cash')!;
    expect(cash.valueText).toBe('Exact');
  });

  it('reads a closed day with no cash count as not counted, never as zero', () => {
    const w = clone();
    Object.assign(w.summary.days[0]!, { counted_cents: null, over_cents: null, short_cents: null });
    const day = read(w).days[0]!;
    const cash = dayFiguresOf(read(w), day).find((x) => x.key === 'day-cash')!;
    expect(cash.valueText).toBe('Not counted');
    expect(cash.parts.at(-1)?.valueText).toBe('Not counted');
  });

  it('reads an open day as the cash expected in the drawer', () => {
    const open = read(day1Open());
    const cash = dayFiguresOf(open, open.days[0]!).find((x) => x.key === 'day-cash')!;
    expect(cash.label).toBe('Cash expected in the drawer');
    expect(cash.valueText).toBe('₱1,000.00');
  });

  it("lists only the day's own fees", () => {
    const fees = dayFiguresOf(b, b.days[0]!).find((x) => x.key === 'day-fees')!;
    expect(fees.valueText).toBe('₱50.00');
    expect(fees.parts).toEqual([{ label: 'Parking', detail: null, valueText: '₱50.00' }]);
    expect(dayFiguresOf(b, b.days[1]!).find((x) => x.key === 'day-fees')?.parts).toEqual([]);
  });
});

describe('an unknown cost reads "Cost pending" and never ₱0.00', () => {
  /** A flavour with cookies and no cost per cookie: the database answers null for every cost it cannot know. */
  function pending(): Wire {
    const w = clone();
    const why = 'no cost per cookie for: Fixture C';
    Object.assign(w.summary.cookie_cost, {
      cents: null,
      made_cents: null,
      to_shop_cents: null,
      why
    });
    for (const p of w.summary.cookie_cost.parts) p.amount_cents = null;
    const c = w.summary.cookie_cost.lines.find((l) => l.product_id === 'mp0s-c')!;
    Object.assign(c, {
      uncosted: true,
      unit_cents: null,
      source: null,
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
    Object.assign(w.summary.profit, { cents: null, why });
    const cost = w.summary.profit.parts.find((p) => p.label === 'Cookie cost')!;
    cost.amount_cents = null;
    Object.assign(w.summary.target, { against_cents: null, revenue_needed_cents: null });
    return w;
  }
  const figures = eventFiguresOf(read(pending()));

  it('reads the cookie cost, the profit and the target as Cost pending', () => {
    expect(figure(figures, 'cookie-cost').valueText).toBe('Cost pending');
    expect(figure(figures, 'profit').valueText).toBe('Cost pending');
    expect(figure(figures, 'target').valueText).toBe('Cost pending');
  });

  it('never writes ₱0.00 for any of the three, or for the flavour with no cost', () => {
    for (const key of ['cookie-cost', 'profit', 'target']) {
      expect(figure(figures, key).valueText).not.toContain('₱0.00');
    }
    const line = figure(figures, 'cookie-cost').parts.find((p) => p.label === 'Fixture C')!;
    expect(line.valueText).toBe('Cost pending');
    expect(line.valueText).not.toContain('₱0.00');
    expect(line.detail ?? '').not.toContain('₱0.00');
    // Mutation: `cents ?? 0` anywhere in moneyText, the line, the profit or the target would turn these into ₱0.
  });

  it('shows the profit part that is unknown as pending, and the known ones as they were', () => {
    const parts = figure(figures, 'profit').parts;
    expect(parts.find((p) => p.label === 'Cookie cost')?.valueText).toBe('Cost pending');
    expect(parts.find((p) => p.label === 'Revenue')?.valueText).toBe('₱1,750.00');
  });

  it('says what revenue is still needed is pending, not ₱0.00', () => {
    const needed = figure(figures, 'target').parts.find((p) => p.label === 'Revenue still needed');
    expect(needed?.valueText).toBe('Cost pending');
  });

  it('names the flavour that has no cost, and where to type one', () => {
    for (const key of ['cookie-cost', 'profit', 'target']) {
      expect(figure(figures, key).note).toContain('Fixture C');
    }
    expect(figure(figures, 'cookie-cost').note).toContain('Cost per cookie');
  });

  it('a known cost carries no pending note on the profit', () => {
    expect(figure(eventFiguresOf(read(clone())), 'profit').note).toBeNull();
  });
});

describe('the small formatters', () => {
  it('moneyText: pesos with two decimals, a minus before the sign, pending for null', () => {
    expect(moneyText(88000)).toBe('₱880.00');
    expect(moneyText(55562)).toBe('₱555.62');
    expect(moneyText(-500)).toBe('-₱5.00');
    expect(moneyText(0)).toBe('₱0.00');
    expect(moneyText(null)).toBe('Cost pending');
  });

  it('unitCostText: up to four decimals of a centavo, at least two', () => {
    expect(unitCostText(1200.5)).toBe('₱12.005');
    expect(unitCostText(2875.25)).toBe('₱28.7525');
    expect(unitCostText(1000)).toBe('₱10.00');
    expect(unitCostText(null)).toBe('Cost pending');
  });

  it('amountCents: whole centavos from pesos she typed, null for anything else', () => {
    expect(amountCents('250')).toBe(25000);
    expect(amountCents(' 250.50 ')).toBe(25050);
    expect(amountCents('9.999')).toBeNull();
    expect(amountCents('-5')).toBeNull();
    expect(amountCents('')).toBeNull();
    expect(amountCents('1e3')).toBeNull();
  });

  it('wholeCount: 1 to 9,999 or null', () => {
    expect(wholeCount('1')).toBe(1);
    expect(wholeCount('9999')).toBe(9999);
    expect(wholeCount('0')).toBeNull();
    expect(wholeCount('')).toBeNull();
    expect(wholeCount('2.5')).toBeNull();
    expect(wholeCount('10000')).toBeNull();
  });

  it('typedCostCents: up to four decimals, otherwise null', () => {
    expect(typedCostCents('28.7525')).toBe(2875.25);
    expect(typedCostCents('12')).toBe(1200);
    expect(typedCostCents('1.23456')).toBeNull();
    expect(typedCostCents('-1')).toBeNull();
    expect(typedCostCents('abc')).toBeNull();
  });
});

describe("a day's stock rows", () => {
  const b = read(clone());

  it('says what was on the table, where it went and what should be left', () => {
    const a = stockRowsOf(b.days[0]!, names).find((r) => r.productId === 'mp0s-a')!;
    expect(a.onTableText).toBe('20 made');
    expect(a.goneText).toBe('5 sold · 0 given away · 1 lost');
    expect(a.shouldBeLeft).toBe(14);
  });

  it('says her count of a closed day, with what is not accounted for', () => {
    const a = stockRowsOf(b.days[0]!, names).find((r) => r.productId === 'mp0s-a')!;
    expect(a.countText).toBe(
      '13 left: 8 carried over, 3 to the shop, 2 written off · 1 not accounted'
    );
    const open = read(day1Open());
    expect(stockRowsOf(open.days[0]!, names)[0]?.countText).toBeNull();
  });

  it('says what a second day carried over from the first', () => {
    const a = stockRowsOf(b.days[1]!, names).find((r) => r.productId === 'mp0s-a')!;
    expect(a.onTableText).toBe('12 made · 8 carried over');
  });

  it("uses the app's name for a flavour when it has one, the database's otherwise", () => {
    expect(stockRowsOf(b.days[0]!, new Map([['mp0s-a', 'Alpha']]))[0]?.name).toBe('Alpha');
    expect(stockRowsOf(b.days[0]!, names)[0]?.name).toBe('Fixture A');
  });
});

describe('the close, as she types it', () => {
  const open = read(day1Open());
  const day1: BazaarDay = open.days[0]!;
  const blank = { left: '', carryNext: '', toShop: '', writtenOff: '' };
  const rows = (over: Record<string, Partial<typeof blank>> = {}): CloseInput['rows'] => [
    { productId: 'mp0s-a', left: '14', carryNext: '8', toShop: '3', writtenOff: '3', ...over.a },
    { productId: 'mp0s-b', left: '8', carryNext: '8', toShop: '', writtenOff: '', ...over.b },
    { productId: 'mp0s-c', left: '5', carryNext: '5', toShop: '', writtenOff: '', ...over.c },
    { productId: 'mp0s-d', ...blank, ...over.d }
  ];
  const input = (over: Record<string, Partial<typeof blank>> = {}, cash = '995'): CloseInput => ({
    countedPesos: cash,
    rows: rows(over)
  });

  it('a valid count sends every flavour of the day, the one with nothing on the table too', () => {
    const r = closeFromForm(day1, input(), false, names);
    expect(r).toEqual({
      ok: true,
      lines: {
        'mp0s-a': { left: 14, carryNext: 8, toShop: 3, writtenOff: 3 },
        'mp0s-b': { left: 8, carryNext: 8, toShop: 0, writtenOff: 0 },
        'mp0s-c': { left: 5, carryNext: 5, toShop: 0, writtenOff: 0 },
        'mp0s-d': { left: 0, carryNext: 0, toShop: 0, writtenOff: 0 }
      },
      countedCents: 99500
    });
    // Mutation: skipping a flavour with nothing on the table sends fewer lines than the day has, and the database refuses.
  });

  it('refuses a count that leaves out a flavour of the day', () => {
    const short: CloseInput = { countedPesos: '', rows: rows().slice(0, 3) };
    const r = closeFromForm(day1, short, false, names);
    expect(r.ok).toBe(false);
  });

  it('refuses a blank Left for a flavour that has cookies, naming it', () => {
    const r = closeFromForm(day1, input({ a: { left: '' } }), false, names);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain('Fixture A');
  });

  it('takes a blank Left as 0 for a flavour with nothing on the table', () => {
    const r = closeFromForm(day1, input(), false, names);
    expect(r.ok && r.lines['mp0s-d']).toEqual({ left: 0, carryNext: 0, toShop: 0, writtenOff: 0 });
  });

  it('refuses more left than there should be, and says to add that stock first', () => {
    const r = closeFromForm(day1, input({ a: { left: '15', carryNext: '9' } }), false, names);
    expect(r.ok).toBe(false);
    const error = r.ok ? '' : r.error;
    expect(error).toContain('Fixture A');
    expect(error).toContain('add that stock first');
  });

  it('refuses a split that does not add up to what is left, saying the sum', () => {
    const r = closeFromForm(day1, input({ a: { writtenOff: '2' } }), false, names);
    expect(r.ok).toBe(false);
    const error = r.ok ? '' : r.error;
    expect(error).toContain('Fixture A');
    expect(error).toContain('13');
  });

  it('refuses anything carried over on the last day', () => {
    const r = closeFromForm(day1, input(), true, names);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('last day');
  });

  it('accepts a last-day close that carries nothing over', () => {
    const r = closeFromForm(
      day1,
      input({
        a: { left: '14', carryNext: '', toShop: '10', writtenOff: '4' },
        b: { left: '8', carryNext: '', toShop: '', writtenOff: '8' },
        c: { left: '5', carryNext: '', toShop: '5', writtenOff: '' }
      }),
      true,
      names
    );
    expect(r.ok).toBe(true);
  });

  it('a blank cash count is not counted, never 0', () => {
    const r = closeFromForm(day1, input({}, ''), false, names);
    expect(r.ok && r.countedCents).toBeNull();
    // Mutation: turning a blank into 0 would record a count of ₱0.00 and a short of the whole drawer.
  });

  it('turns cash typed in pesos into centavos', () => {
    const r = closeFromForm(day1, input({}, '995'), false, names);
    expect(r.ok && r.countedCents).toBe(99500);
    const c = closeFromForm(day1, input({}, '995.50'), false, names);
    expect(c.ok && c.countedCents).toBe(99550);
  });

  it('refuses cash that is not an amount, and one with a fraction of a centavo', () => {
    for (const bad of ['9.999', 'abc', '-5', '1,000']) {
      const r = closeFromForm(day1, input({}, bad), false, names);
      expect(r.ok, bad).toBe(false);
    }
  });

  it('refuses a count that is not a whole number', () => {
    const r = closeFromForm(day1, input({ a: { left: '14.5' } }), false, names);
    expect(r.ok).toBe(false);
  });
});
