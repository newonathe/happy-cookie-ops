import { describe, expect, it } from 'vitest';
import { parseBazaar, type Bazaar } from '@/lib/data/bazaar-days';
import {
  centsToPesosText,
  closeFromForm,
  closeRowOf,
  dayReportOf,
  drawerCheck,
  moneyText,
  stockRowsOf
} from '@/lib/bazaar/review';
import type { CloseInput, ReviewStockRow } from '@/lib/bazaar/live-bazaar-types';
import example from '../fixtures/bazaar-example.json';

/**
 * U5 (review and close): the pre-filled close, the drawer check (Ateneo A3) and the day's Z-report. Rules live in
 * src/lib/bazaar/review.ts; the screen only draws them. A default is a fact the screen shows and she can change, and the
 * close sends exactly what is shown.
 */
type Wire = {
  summary: {
    counted: boolean;
    days: Array<Record<string, unknown> & { lines: Array<Record<string, unknown>> }>;
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

describe('the close, pre-filled', () => {
  const row = (over: Partial<ReviewStockRow> = {}): ReviewStockRow => ({
    productId: 'p1',
    name: 'Alpha',
    onTableText: '',
    goneText: '',
    shouldBeLeft: 8,
    countText: null,
    hasRecipe: true,
    made: 10,
    carried: 0,
    sold: 2,
    given: 0,
    lost: 0,
    countedLeft: null,
    ...over
  });
  const parts = (r: ReturnType<typeof closeRowOf>) => [r.left, r.carryNext, r.toShop, r.writtenOff];

  it('Left starts as what should be left, and the rest is carried over on a day that is not the last', () => {
    expect(closeRowOf(row(), false)).toEqual({
      productId: 'p1',
      left: '8',
      carryNext: '8',
      toShop: '0',
      writtenOff: '0'
    });
  });

  it('on the last day nothing is carried: the rest goes to the shop when the flavour has a recipe', () => {
    expect(closeRowOf(row({ hasRecipe: true }), true)).toEqual({
      productId: 'p1',
      left: '8',
      carryNext: '',
      toShop: '8',
      writtenOff: '0'
    });
  });

  it('on the last day the rest is written off when the flavour has no recipe', () => {
    expect(parts(closeRowOf(row({ hasRecipe: false }), true))).toEqual(['8', '', '0', '8']);
  });

  it('on the last day, with the recipe not known yet, suggests no split: she picks it', () => {
    expect(parts(closeRowOf(row({ hasRecipe: null }), true))).toEqual(['8', '', '0', '0']);
  });

  it('a flavour with nothing left, or less than nothing (a late sale), starts at 0 everywhere', () => {
    for (const shouldBeLeft of [0, -2]) {
      expect(parts(closeRowOf(row({ shouldBeLeft }), false))).toEqual(['0', '0', '0', '0']);
    }
  });

  it('the rest follows a lower Left she typed', () => {
    expect(parts(closeRowOf(row(), false, { left: '5' }))).toEqual(['5', '5', '0', '0']);
  });

  it('the rest is what is left after the other parts she typed, never below 0', () => {
    expect(parts(closeRowOf(row(), false, { toShop: '3', writtenOff: '1' }))).toEqual([
      '8',
      '4',
      '3',
      '1'
    ]);
    expect(closeRowOf(row(), false, { toShop: '9' }).carryNext).toBe('0');
  });

  it('a part she typed in the receiving field stays as she typed it, and the others stay 0', () => {
    expect(parts(closeRowOf(row(), false, { carryNext: '5' }))).toEqual(['8', '5', '0', '0']);
  });

  it('the default is accepted by the same rules the close is sent through', () => {
    const open = read(day1Open());
    const day = open.days[0]!;
    const stock = stockRowsOf(day, names, () => true);
    const sent: CloseInput = { countedPesos: '', rows: stock.map((s) => closeRowOf(s, false)) };
    const result = closeFromForm(day, sent, false, names);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const s of stock) {
      const line = result.lines[s.productId]!;
      expect(line.left).toBe(Math.max(0, s.shouldBeLeft));
      expect(line.carryNext).toBe(Math.max(0, s.shouldBeLeft));
      expect(line.toShop + line.writtenOff).toBe(0);
    }
  });

  it('the last-day default (recipe to the shop) is accepted too', () => {
    const open = read(day1Open());
    const day = open.days[0]!;
    const stock = stockRowsOf(day, names, () => true);
    const result = closeFromForm(
      day,
      { countedPesos: '', rows: stock.map((s) => closeRowOf(s, true)) },
      true,
      names
    );
    expect(result.ok).toBe(true);
  });
});

describe('the stock rows carry the recipe and the counts', () => {
  const open = read(day1Open());
  it('says whether each flavour has a recipe, and null when that is not known', () => {
    const yes = stockRowsOf(open.days[0]!, names, (id) => id === 'mp0s-a');
    expect(yes.find((r) => r.productId === 'mp0s-a')?.hasRecipe).toBe(true);
    expect(yes.find((r) => r.productId === 'mp0s-b')?.hasRecipe).toBe(false);
    expect(stockRowsOf(open.days[0]!, names)[0]?.hasRecipe).toBeNull();
  });
  it('has the numbers behind the words', () => {
    const a = stockRowsOf(open.days[0]!, names).find((r) => r.productId === 'mp0s-a')!;
    expect([a.made, a.carried, a.sold, a.given, a.lost]).toEqual([20, 0, 5, 0, 1]);
    expect(a.countedLeft).toBeNull();
  });
  it('a closed day gives the count she made', () => {
    const b = read(clone());
    const a = stockRowsOf(b.days[0]!, names).find((r) => r.productId === 'mp0s-a')!;
    expect(a.countedLeft).toBe(13);
  });
});

/** Ateneo A3: day 19 had ₱0.00 expected and ₱1,000.00 typed, and it was booked without a question. */
describe('the drawer check (Ateneo A3)', () => {
  it('writes centavos as the pesos a field takes, exactly', () => {
    expect(centsToPesosText(164000)).toBe('1640.00');
    expect(centsToPesosText(164035)).toBe('1640.35');
    expect(centsToPesosText(5)).toBe('0.05');
    expect(centsToPesosText(0)).toBe('0.00');
  });

  it('"It matches" round-trips to the same centavos', () => {
    for (const cents of [0, 5, 100, 164035, 999999, 1234567]) {
      const check = drawerCheck(cents, centsToPesosText(cents));
      expect(check.countedCents).toBe(cents);
      expect(check.kind).toBe('matches');
      expect(check.recount).toBe(false);
    }
  });

  it('a blank is not a count: no line, no question', () => {
    expect(drawerCheck(100000, '')).toMatchObject({ kind: 'blank', recount: false });
    expect(drawerCheck(100000, '  ')).toMatchObject({ kind: 'blank', recount: false });
  });

  it('text that is not an amount has no line and no question (the close itself refuses it)', () => {
    expect(drawerCheck(100000, 'abc')).toMatchObject({ kind: 'invalid', recount: false });
  });

  it('says over and short in words with the amount', () => {
    const over = drawerCheck(100000, '1020');
    expect([over.kind, over.diffCents, over.text]).toEqual(['over', 2000, 'Over ₱20.00']);
    const short = drawerCheck(100000, '980.50');
    expect([short.kind, short.diffCents, short.text]).toEqual(['short', 1950, 'Short ₱19.50']);
    expect(drawerCheck(100000, '1000').text).toBe('Matches');
  });

  it('asks to count again above the larger of ₱100.00 and 10 % of expected, never at the line', () => {
    // 10 % of ₱500.00 is ₱50.00, so the ₱100.00 floor rules.
    expect(drawerCheck(50000, '600').recount).toBe(false);
    expect(drawerCheck(50000, '600.01').recount).toBe(true);
    expect(drawerCheck(50000, '400').recount).toBe(false);
    expect(drawerCheck(50000, '399.99').recount).toBe(true);
    // 10 % of ₱5,000.00 is ₱500.00, above the floor.
    expect(drawerCheck(500000, '5500').recount).toBe(false);
    expect(drawerCheck(500000, '5500.01').recount).toBe(true);
  });

  it('asks when nothing was expected and ₱1,000.00 is typed (the Ateneo day)', () => {
    const check = drawerCheck(0, '1000');
    expect(check.recount).toBe(true);
    expect(check.text).toBe('Over ₱1,000.00');
  });

  it('rounds 10 % up to the centavo, so a rounding never crosses the line', () => {
    // 10 % of ₱1,000.05 is ₱100.005; the line is ₱100.01, so ₱100.01 over is exactly at it.
    expect(drawerCheck(100005, '1100.06').recount).toBe(false);
    expect(drawerCheck(100005, '1100.07').recount).toBe(true);
  });
});

describe("a closed day's Z-report", () => {
  const closed = read(clone());
  const report = dayReportOf(closed, closed.days[0]!);
  const table = (caption: string) => report.tables.find((t) => t.caption === caption)!;
  const sum = (t: { lines: Array<{ cents: number }> }) => t.lines.reduce((n, l) => n + l.cents, 0);

  it('has takings, how it was paid, fees and the drawer, in that order', () => {
    expect(report.tables.map((t) => t.caption)).toEqual([
      'Takings',
      'How it was paid',
      'Fees',
      'Drawer'
    ]);
  });

  it("each table's lines add up to its total, and the total is the database's own figure", () => {
    const day = closed.days[0]!;
    expect(sum(table('Takings'))).toBe(table('Takings').totalCents);
    expect(table('Takings').totalCents).toBe(day.revenueCents);
    expect(sum(table('How it was paid'))).toBe(table('How it was paid').totalCents);
    expect(table('How it was paid').totalCents).toBe(day.revenueCents);
    expect(sum(table('Fees'))).toBe(table('Fees').totalCents);
    expect(table('Fees').totalCents).toBe(day.feesCents);
    expect(sum(table('Drawer'))).toBe(table('Drawer').totalCents);
    expect(table('Drawer').totalCents).toBe(day.cashExpectedCents);
  });

  it('the second day reconciles too', () => {
    for (const t of dayReportOf(closed, closed.days[1]!).tables) {
      expect(sum(t), t.caption).toBe(t.totalCents);
    }
  });

  it('says what was counted and how far off the drawer was, or that it was not counted', () => {
    const day = closed.days[0]!;
    const note = table('Drawer').note ?? '';
    if (day.countedCents === null) expect(note).toBe('Not counted');
    else expect(note).toContain('Counted ' + moneyText(day.countedCents));
    const w = clone();
    Object.assign(w.summary.days[0]!, { counted_cents: null, over_cents: null, short_cents: null });
    const b = read(w);
    expect(dayReportOf(b, b.days[0]!).tables.find((t) => t.caption === 'Drawer')?.note).toBe(
      'Not counted'
    );
  });
});
