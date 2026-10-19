/**
 * The parts of a `get_bazaar` answer (migration 20260101006700) that the database always sends, at their empty values,
 * so a test can build a whole, valid answer from the few facts it is about. The hand-worked two-day example, with every
 * figure, is `bazaar-example.json` beside this file.
 */
export const lineFacts = { sold: 0, given: 0, lost: 0 } as const;

/** A day's figures before anything is sold: the day's own facts are spread over these. */
export const dayFacts = () => ({
  revenue_cents: 0,
  gross_cents: 0,
  discount_cents: 0,
  freebie_cents: 0,
  by_pay: {},
  sales: 0,
  voided: 0,
  cash_sales_cents: 0,
  cash_expected_cents: 0,
  fees_cents: 0,
  count: null,
  closed_at: null,
  counted_cents: null,
  over_cents: null,
  short_cents: null,
  changed_after_close: false
});

/** The event's figures with nothing sold and no cost known: profit is null with its why, never 0. */
export const summaryFacts = (rentCents: number, why = 'no cost per cookie for: Fixture A') => ({
  counted: true,
  revenue: {
    revenue_cents: 0,
    gross_cents: 0,
    discount_cents: 0,
    freebie_cents: 0,
    by_pay: {},
    sales: 0,
    voided: 0
  },
  cash: { over_cents: 0, short_cents: 0 },
  fees: { total_cents: rentCents, event_cents: rentCents, parts: [] },
  cookie_cost: {
    cents: null,
    why,
    made: 0,
    to_shop: 0,
    made_cents: null,
    to_shop_cents: null,
    parts: [],
    lines: []
  },
  profit: { cents: null, why, parts: [] },
  target: { cents: null, against_cents: null, revenue_needed_cents: null }
});

/** The keys beside `summary`. */
export const answerFacts = () => ({
  final_hash: null,
  final_summary: null,
  costs: [],
  losses: [],
  stock_adds: []
});
