import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { classifySaveError, type SaveOutcome } from '@/lib/data/payments';

/**
 * Bazaar days (S2; `get_bazaar` / `save_bazaar_day` / `start_bazaar_day`, migration 20260101006700). A booking is the
 * event; each day of it is planned (flavours, how many, prices, the drawer float) and then started as one event the
 * till sells on. Money stays in centavos here, as the database holds it: a caller converts to pesos through
 * `src/lib/money.ts`, in one place. The database enforces every bound; the parsers are strict, so a screen never shows
 * half of what the database holds.
 */
export type BazaarClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type DayState = 'planned' | 'open' | 'closed';

export interface DayLine {
  productId: string;
  name: string;
  made: number;
  carried: number;
  priceCents: number;
  /** From the sales that are not voided: paid for, and given away (a sale with a zero total). */
  sold: number;
  given: number;
  /** From the losses recorded on the day. */
  lost: number;
}

/** Her count of one flavour when the day closed. `notAccounted` is the database's, and below zero if a sale arrived late. */
export interface DayCount {
  productId: string;
  left: number;
  carryNext: number;
  toShop: number;
  writtenOff: number;
  notAccounted: number;
}

export interface BazaarDay {
  id: string;
  /** YYYY-MM-DD */
  day: string;
  /** The event the day became when it started; null while it is only a plan. */
  eventId: string | null;
  floatCents: number;
  state: DayState;
  /** The day's hash from the summary, which closing a day is given back as `expected`. */
  hash: string;
  /** The stamp `save_bazaar_day` is given to change the plan. */
  updatedAt: string;
  lines: DayLine[];
  revenueCents: number;
  grossCents: number;
  discountCents: number;
  /** Freebies at their price. */
  freebieCents: number;
  /** Takings by how paid (sales that were paid for). */
  byPay: Record<string, number>;
  sales: number;
  voided: number;
  cashSalesCents: number;
  /** The float plus the cash sales. */
  cashExpectedCents: number;
  /** The day's own fees, an expense added at the till included. */
  feesCents: number;
  /** Null until the day is closed. */
  count: DayCount[] | null;
  /** Epoch milliseconds; null while the day is planned or open. */
  closedAt: number | null;
  /** Null while open, and for a day closed with no cash count. */
  countedCents: number | null;
  overCents: number | null;
  shortCents: number | null;
  /** A sale, a void, a loss or a fee reached the day after she closed it. */
  changedAfterClose: boolean;
}

/** One part of a figure, so the screen can open it. A null amount is a cost that is not known: never 0. */
export interface FigurePart {
  label: string;
  quantity: number | null;
  amountCents: number | null;
}

export interface FeePart {
  clientId: string;
  label: string;
  category: string;
  /** Null for a fee of the whole event. */
  dayId: string | null;
  paidOn: string;
  amountCents: number;
  /** An expense added at the till on the day (`add_event_expense`). */
  atTheTill: boolean;
}

/** One flavour's cookie cost for the event. Every `…Cents` is null while the flavour has cookies and no cost per cookie. */
export interface CostLine {
  productId: string;
  name: string;
  /** Centavos with up to four decimals; null when there is none. */
  unitCents: number | null;
  source: 'typed' | 'recipe' | null;
  uncosted: boolean;
  made: number;
  toShop: number;
  sold: number;
  given: number;
  lost: number;
  writtenOff: number;
  notAccounted: number;
  madeCents: number | null;
  toShopCents: number | null;
  soldCents: number | null;
  givenCents: number | null;
  lostCents: number | null;
  writtenOffCents: number | null;
  notAccountedCents: number | null;
  /** Made less sent to the shop. */
  costCents: number | null;
  roundingCents: number | null;
}

/** `bazaar_summary` as the database works it out: the one computation. Nothing here is worked out again in the app. */
export interface BazaarSummary {
  booking: {
    id: string;
    name: string;
    place: string;
    startsOn: string;
    endsOn: string;
    rentCents: number;
    active: boolean;
  };
  /** False while a started day is open: "not accounted" then still includes what is on the table. */
  counted: boolean;
  days: BazaarDay[];
  revenue: {
    revenueCents: number;
    grossCents: number;
    discountCents: number;
    freebieCents: number;
    byPay: Record<string, number>;
    sales: number;
    voided: number;
  };
  cash: { overCents: number; shortCents: number };
  fees: { totalCents: number; eventCents: number; parts: FeePart[] };
  cookieCost: {
    cents: number | null;
    why: string | null;
    made: number;
    toShop: number;
    madeCents: number | null;
    toShopCents: number | null;
    parts: FigurePart[];
    lines: CostLine[];
  };
  /** `cents` is null, with its why, while a flavour that has cookies has no cost per cookie: never 0. */
  profit: { cents: number | null; why: string | null; parts: FigurePart[] };
  target: {
    cents: number | null;
    againstCents: number | null;
    revenueNeededCents: number | null;
  };
  /** The whole summary's hash: what closing the event is given back as `expected`. */
  hash: string;
}

export interface BazaarLoss {
  clientId: string;
  dayId: string;
  productId: string;
  qty: number;
  reason: string;
  at: number;
}

export interface Bazaar extends BazaarSummary {
  targetCents: number | null;
  finalised: boolean;
  /** Fees including the stall rent (`fees.totalCents`). */
  feesCents: number;
  /** Each flavour's cost per cookie as stored: the recipe's (read at its first day) and hers, if she typed one. */
  costs: Array<{ productId: string; recipeCents: number | null; typedCents: number | null }>;
  losses: BazaarLoss[];
  /** What was booked when the event was closed; null until then. */
  finalSummary: BazaarSummary | null;
}

export interface BazaarPlan {
  id: string;
  scheduledId: string;
  day: string;
  floatCents: number;
  lines: { productId: string; made: number; carried: number; priceCents: number }[];
}

export interface StartedDay {
  eventId: string;
  sellingDevice: string;
  /** Centavos, by flavour: this day's prices. */
  prices: Record<string, number>;
  /** What was put on the table, by flavour. */
  loaded: Record<string, number>;
  floatCents: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const HASH = /^[0-9a-f]{64}$/;
const DEVICE = /^[A-Za-z0-9_-]{1,64}$/;
const PRODUCT = /^[a-z0-9][a-z0-9-]{0,31}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

function realDate(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/** A whole number of centavos, either sign (a part of profit is negative; a rounding part can be). */
const int = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && Math.abs(v) <= 1_000_000_000_000;
const intOrNull = (v: unknown): v is number | null => v === null || int(v);
/** Centavos with decimals (a cost per cookie), 0 or more. */
const decimalOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000_000);
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** Takings by how paid: each a whole number of centavos, 0 or more. */
function parsePay(v: unknown): Record<string, number> | null {
  if (!isObj(v)) return null;
  const out: Record<string, number> = {};
  for (const [method, cents] of Object.entries(v)) {
    if (method.length < 1 || method.length > 40 || !whole(cents, 0, 1_000_000_000_000)) return null;
    out[method] = cents;
  }
  return out;
}

/** A figure's parts. `quantity` is absent on the parts of profit. */
function parseParts(v: unknown): FigurePart[] | null {
  if (!Array.isArray(v)) return null;
  const out: FigurePart[] = [];
  for (const p of v) {
    if (!isObj(p) || !str(p.label, 80) || !intOrNull(p.amount_cents)) return null;
    const quantity = p.quantity === undefined ? null : p.quantity;
    if (!intOrNull(quantity)) return null;
    out.push({ label: p.label, quantity, amountCents: p.amount_cents });
  }
  return out;
}

function parseDay(d: unknown, updatedAt: string | undefined): BazaarDay | null {
  if (
    !isObj(d) ||
    typeof d.id !== 'string' ||
    !UUID.test(d.id) ||
    typeof d.day !== 'string' ||
    !realDate(d.day) ||
    !(d.event_id === null || (typeof d.event_id === 'string' && UUID.test(d.event_id))) ||
    !whole(d.float_cents, 0, 100_000_000) ||
    (d.state !== 'planned' && d.state !== 'open' && d.state !== 'closed') ||
    typeof d.hash !== 'string' ||
    !HASH.test(d.hash) ||
    !Array.isArray(d.lines) ||
    updatedAt === undefined ||
    !int(d.revenue_cents) ||
    !int(d.gross_cents) ||
    !int(d.discount_cents) ||
    !int(d.freebie_cents) ||
    !whole(d.sales, 0, 1_000_000) ||
    !whole(d.voided, 0, 1_000_000) ||
    !int(d.cash_sales_cents) ||
    !int(d.cash_expected_cents) ||
    !int(d.fees_cents) ||
    // Epoch milliseconds, which are past the bound a sum of money is held to.
    !(d.closed_at === null || whole(d.closed_at, 0, 99_999_999_999_999)) ||
    !intOrNull(d.counted_cents) ||
    !intOrNull(d.over_cents) ||
    !intOrNull(d.short_cents) ||
    typeof d.changed_after_close !== 'boolean' ||
    !(d.count === null || Array.isArray(d.count))
  )
    return null;
  const byPay = parsePay(d.by_pay);
  if (!byPay) return null;
  const lines: DayLine[] = [];
  for (const l of d.lines) {
    if (
      !isObj(l) ||
      typeof l.product_id !== 'string' ||
      !PRODUCT.test(l.product_id) ||
      !str(l.name, 120) ||
      !whole(l.made, 0, 9999) ||
      !whole(l.carried, 0, 9999) ||
      !whole(l.price_cents, 0, 100_000_000) ||
      !whole(l.sold, 0, 1_000_000) ||
      !whole(l.given, 0, 1_000_000) ||
      !whole(l.lost, 0, 1_000_000)
    )
      return null;
    lines.push({
      productId: l.product_id,
      name: l.name,
      made: l.made,
      carried: l.carried,
      priceCents: l.price_cents,
      sold: l.sold,
      given: l.given,
      lost: l.lost
    });
  }
  // Her count exists only for a closed day, and then for every flavour of the day.
  let count: DayCount[] | null = null;
  if (d.state === 'closed') {
    if (!Array.isArray(d.count) || d.count.length !== lines.length) return null;
    count = [];
    for (const c of d.count) {
      if (
        !isObj(c) ||
        typeof c.product_id !== 'string' ||
        !lines.some((l) => l.productId === c.product_id) ||
        !whole(c.left, 0, 99_999) ||
        !whole(c.carry_next, 0, 99_999) ||
        !whole(c.to_shop, 0, 99_999) ||
        !whole(c.written_off, 0, 99_999) ||
        !int(c.not_accounted)
      )
        return null;
      count.push({
        productId: c.product_id,
        left: c.left,
        carryNext: c.carry_next,
        toShop: c.to_shop,
        writtenOff: c.written_off,
        notAccounted: c.not_accounted
      });
    }
  }
  return {
    id: d.id,
    day: d.day,
    eventId: d.event_id as string | null,
    floatCents: d.float_cents,
    state: d.state,
    hash: d.hash,
    updatedAt,
    lines,
    revenueCents: d.revenue_cents,
    grossCents: d.gross_cents,
    discountCents: d.discount_cents,
    freebieCents: d.freebie_cents,
    byPay,
    sales: d.sales,
    voided: d.voided,
    cashSalesCents: d.cash_sales_cents,
    cashExpectedCents: d.cash_expected_cents,
    feesCents: d.fees_cents,
    count,
    closedAt: d.closed_at,
    countedCents: d.counted_cents,
    overCents: d.over_cents,
    shortCents: d.short_cents,
    changedAfterClose: d.changed_after_close
  };
}

function parseCostLine(l: unknown): CostLine | null {
  if (
    !isObj(l) ||
    typeof l.product_id !== 'string' ||
    !PRODUCT.test(l.product_id) ||
    !str(l.name, 120) ||
    !decimalOrNull(l.unit_cents) ||
    !(l.source === null || l.source === 'typed' || l.source === 'recipe') ||
    typeof l.uncosted !== 'boolean' ||
    !whole(l.made, 0, 1_000_000) ||
    !whole(l.to_shop, 0, 1_000_000) ||
    !whole(l.sold, 0, 1_000_000) ||
    !whole(l.given, 0, 1_000_000) ||
    !whole(l.lost, 0, 1_000_000) ||
    !whole(l.written_off, 0, 1_000_000) ||
    !int(l.not_accounted) ||
    !intOrNull(l.made_cents) ||
    !intOrNull(l.to_shop_cents) ||
    !intOrNull(l.sold_cents) ||
    !intOrNull(l.given_cents) ||
    !intOrNull(l.lost_cents) ||
    !intOrNull(l.written_off_cents) ||
    !intOrNull(l.not_accounted_cents) ||
    !intOrNull(l.cost_cents) ||
    !intOrNull(l.rounding_cents)
  )
    return null;
  // A flavour with cookies and no cost has no cost line at all: a zero here would be a cost that was never known.
  if (l.uncosted && (l.cost_cents !== null || l.made_cents !== null)) return null;
  return {
    productId: l.product_id,
    name: l.name,
    unitCents: l.unit_cents,
    source: l.source,
    uncosted: l.uncosted,
    made: l.made,
    toShop: l.to_shop,
    sold: l.sold,
    given: l.given,
    lost: l.lost,
    writtenOff: l.written_off,
    notAccounted: l.not_accounted,
    madeCents: l.made_cents,
    toShopCents: l.to_shop_cents,
    soldCents: l.sold_cents,
    givenCents: l.given_cents,
    lostCents: l.lost_cents,
    writtenOffCents: l.written_off_cents,
    notAccountedCents: l.not_accounted_cents,
    costCents: l.cost_cents,
    roundingCents: l.rounding_cents
  };
}

/**
 * Strict: anything unexpected is no summary at all. `stamps` gives each day its plan stamp; a stored summary (the one
 * kept when the event was closed) is read with `stored`, where a day without a stamp is still read.
 */
export function parseSummary(
  sum: unknown,
  stamps: ReadonlyMap<string, string>,
  stored = false
): BazaarSummary | null {
  if (!isObj(sum)) return null;
  const b = sum.booking;
  if (
    !isObj(b) ||
    typeof b.id !== 'string' ||
    !UUID.test(b.id) ||
    !str(b.name, 80) ||
    !str(b.place, 80) ||
    typeof b.starts_on !== 'string' ||
    !realDate(b.starts_on) ||
    typeof b.ends_on !== 'string' ||
    !realDate(b.ends_on) ||
    !whole(b.rent_cents, 0, 100_000_000) ||
    typeof b.active !== 'boolean'
  )
    return null;
  if (typeof sum.hash !== 'string' || !HASH.test(sum.hash)) return null;
  if (typeof sum.counted !== 'boolean' || !Array.isArray(sum.days)) return null;

  const days: BazaarDay[] = [];
  for (const d of sum.days) {
    const id = isObj(d) && typeof d.id === 'string' ? d.id : '';
    const day = parseDay(d, stamps.get(id) ?? (stored ? '' : undefined));
    if (!day) return null;
    days.push(day);
  }

  const r = sum.revenue;
  if (
    !isObj(r) ||
    !int(r.revenue_cents) ||
    !int(r.gross_cents) ||
    !int(r.discount_cents) ||
    !int(r.freebie_cents) ||
    !whole(r.sales, 0, 1_000_000) ||
    !whole(r.voided, 0, 1_000_000)
  )
    return null;
  const byPay = parsePay(r.by_pay);
  if (!byPay) return null;

  const cash = sum.cash;
  if (
    !isObj(cash) ||
    !whole(cash.over_cents, 0, 1_000_000_000_000) ||
    !whole(cash.short_cents, 0, 1_000_000_000_000)
  )
    return null;

  const fees = sum.fees;
  if (
    !isObj(fees) ||
    !whole(fees.total_cents, 0, 1_000_000_000_000) ||
    !whole(fees.event_cents, 0, 1_000_000_000_000) ||
    !Array.isArray(fees.parts)
  )
    return null;
  const feeParts: FeePart[] = [];
  for (const f of fees.parts) {
    if (
      !isObj(f) ||
      typeof f.client_id !== 'string' ||
      !str(f.label, 80) ||
      !str(f.category, 40) ||
      !(f.day_id === null || (typeof f.day_id === 'string' && UUID.test(f.day_id))) ||
      typeof f.paid_on !== 'string' ||
      !realDate(f.paid_on) ||
      !whole(f.amount_cents, 1, 100_000_000) ||
      !(f.at_the_till === undefined || typeof f.at_the_till === 'boolean')
    )
      return null;
    feeParts.push({
      clientId: f.client_id,
      label: f.label,
      category: f.category,
      dayId: f.day_id as string | null,
      paidOn: f.paid_on,
      amountCents: f.amount_cents,
      atTheTill: f.at_the_till === true
    });
  }

  const cc = sum.cookie_cost;
  if (
    !isObj(cc) ||
    !intOrNull(cc.cents) ||
    !strOrNull(cc.why) ||
    !whole(cc.made, 0, 10_000_000) ||
    !whole(cc.to_shop, 0, 10_000_000) ||
    !intOrNull(cc.made_cents) ||
    !intOrNull(cc.to_shop_cents) ||
    !Array.isArray(cc.lines)
  )
    return null;
  const costParts = parseParts(cc.parts);
  if (!costParts) return null;
  const costLines: CostLine[] = [];
  for (const l of cc.lines) {
    const line = parseCostLine(l);
    if (!line) return null;
    costLines.push(line);
  }
  // An unknown cookie cost always says why, and a known one never carries a why.
  if ((cc.cents === null) !== (typeof cc.why === 'string')) return null;

  const profit = sum.profit;
  if (!isObj(profit) || !intOrNull(profit.cents) || !strOrNull(profit.why)) return null;
  const profitParts = parseParts(profit.parts);
  if (!profitParts) return null;

  const target = sum.target;
  if (
    !isObj(target) ||
    !(target.cents === null || whole(target.cents, 0, 10_000_000_000)) ||
    !intOrNull(target.against_cents) ||
    !intOrNull(target.revenue_needed_cents)
  )
    return null;

  return {
    booking: {
      id: b.id,
      name: b.name,
      place: b.place,
      startsOn: b.starts_on,
      endsOn: b.ends_on,
      rentCents: b.rent_cents,
      active: b.active
    },
    counted: sum.counted,
    days,
    revenue: {
      revenueCents: r.revenue_cents,
      grossCents: r.gross_cents,
      discountCents: r.discount_cents,
      freebieCents: r.freebie_cents,
      byPay,
      sales: r.sales,
      voided: r.voided
    },
    cash: { overCents: cash.over_cents, shortCents: cash.short_cents },
    fees: { totalCents: fees.total_cents, eventCents: fees.event_cents, parts: feeParts },
    cookieCost: {
      cents: cc.cents,
      why: cc.why,
      made: cc.made,
      toShop: cc.to_shop,
      madeCents: cc.made_cents,
      toShopCents: cc.to_shop_cents,
      parts: costParts,
      lines: costLines
    },
    profit: { cents: profit.cents, why: profit.why, parts: profitParts },
    target: {
      cents: target.cents as number | null,
      againstCents: target.against_cents,
      revenueNeededCents: target.revenue_needed_cents
    },
    hash: sum.hash
  };
}

/** Strict: anything unexpected is no answer at all. */
export function parseBazaar(json: Json | null | undefined): Bazaar | null {
  if (!isObj(json) || !Array.isArray(json.stamps)) return null;
  const stamps = new Map<string, string>();
  for (const s of json.stamps) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.updated_at !== 'string') return null;
    stamps.set(s.id, s.updated_at);
  }
  const summary = parseSummary(json.summary, stamps);
  if (!summary) return null;
  const target = json.target_profit_cents;
  if (target !== null && !whole(target, 0, 10_000_000_000)) return null;
  if (json.finalised_at !== null && typeof json.finalised_at !== 'string') return null;
  if (!Array.isArray(json.costs) || !Array.isArray(json.losses)) return null;

  const costs: Bazaar['costs'] = [];
  for (const k of json.costs) {
    if (
      !isObj(k) ||
      typeof k.product_id !== 'string' ||
      !PRODUCT.test(k.product_id) ||
      !decimalOrNull(k.recipe_cents) ||
      !decimalOrNull(k.typed_cents)
    )
      return null;
    costs.push({
      productId: k.product_id,
      recipeCents: k.recipe_cents,
      typedCents: k.typed_cents
    });
  }
  const losses: BazaarLoss[] = [];
  for (const o of json.losses) {
    if (
      !isObj(o) ||
      typeof o.client_id !== 'string' ||
      typeof o.day_id !== 'string' ||
      !UUID.test(o.day_id) ||
      typeof o.product_id !== 'string' ||
      !PRODUCT.test(o.product_id) ||
      !whole(o.qty, 1, 9999) ||
      !str(o.reason, 80) ||
      !whole(o.at, 0, 99_999_999_999_999)
    )
      return null;
    losses.push({
      clientId: o.client_id,
      dayId: o.day_id,
      productId: o.product_id,
      qty: o.qty,
      reason: o.reason,
      at: o.at
    });
  }
  // What was booked when the event was closed. A finalised event always has it: without it the answer is not understood.
  let finalSummary: BazaarSummary | null = null;
  if (json.finalised_at !== null) {
    finalSummary = parseSummary(json.final_summary, stamps, true);
    if (!finalSummary) return null;
  }
  return {
    ...summary,
    targetCents: target as number | null,
    finalised: json.finalised_at !== null,
    feesCents: summary.fees.totalCents,
    costs,
    losses,
    finalSummary
  };
}

/** What `start_bazaar_day` returns: one row, the event with this day's prices and stock. */
export function parseStartedDay(data: Json | null | undefined): StartedDay | null {
  const row = Array.isArray(data) ? data[0] : null;
  if (
    !isObj(row) ||
    typeof row.event_id !== 'string' ||
    !UUID.test(row.event_id) ||
    typeof row.selling_device !== 'string' ||
    !DEVICE.test(row.selling_device) ||
    !whole(row.float_cents, 0, 100_000_000) ||
    !isObj(row.prices) ||
    !isObj(row.loaded)
  )
    return null;
  const prices: Record<string, number> = {};
  for (const [id, cents] of Object.entries(row.prices)) {
    // The database sends a number, or a numeric as text: whole centavos either way.
    const n = typeof cents === 'string' && /^[0-9]{1,9}$/.test(cents) ? Number(cents) : cents;
    if (!PRODUCT.test(id) || !whole(n, 0, 100_000_000)) return null;
    prices[id] = n;
  }
  const loaded: Record<string, number> = {};
  for (const [id, qty] of Object.entries(row.loaded)) {
    if (!PRODUCT.test(id) || !whole(qty, 0, 19_998)) return null;
    loaded[id] = qty;
  }
  return {
    eventId: row.event_id,
    sellingDevice: row.selling_device,
    prices,
    loaded,
    floatCents: row.float_cents
  };
}

/**
 * The event id a day always starts as: the same lowercase uuid for the same day on any phone and from any storage state,
 * so a retry after a lost reply, a cleared tab or a second phone is answered with the one event, never a second.
 */
export async function dayEventId(dayId: string): Promise<string> {
  const bytes = new TextEncoder().encode('bazaar-day:' + dayId);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

export async function fetchBazaar(client: BazaarClient, bookingId: string): Promise<Bazaar> {
  const { data, error } = await client.rpc('get_bazaar', { p_booking: bookingId });
  if (error) throw new Error('bazaar load failed: ' + (error.code || error.message));
  const parsed = parseBazaar(data);
  if (!parsed) throw new Error('bazaar answer was not understood');
  return parsed;
}

/** Creates (no stamp) or changes (the stamp the read returned) one day's plan. */
export async function saveBazaarDay(
  client: BazaarClient,
  plan: BazaarPlan,
  expectedUpdatedAt: string | null
): Promise<{ result: SaveOutcome; updatedAt: string | null }> {
  try {
    const { data, error } = await client.rpc('save_bazaar_day', {
      p_day: {
        id: plan.id,
        scheduled_id: plan.scheduledId,
        day: plan.day,
        float_cents: plan.floatCents,
        lines: plan.lines.map((l) => ({
          product_id: l.productId,
          made_qty: l.made,
          carried_qty: l.carried,
          price_cents: l.priceCents
        }))
      },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    const result = classifySaveError(error);
    const row = Array.isArray(data) ? data[0] : null;
    const updatedAt =
      result === 'saved' && isObj(row) && typeof row.updated_at === 'string'
        ? row.updated_at
        : null;
    return { result: result === 'saved' && !updatedAt ? 'offline' : result, updatedAt };
  } catch {
    return { result: 'offline', updatedAt: null };
  }
}

export type StartOutcome =
  | { ok: true; started: StartedDay }
  | { ok: false; error: 'refused' | 'offline' | 'not acknowledged' };

/** Online only: the server opens the day as one event with the day's own prices and names this phone the selling device. */
export async function startBazaarDay(
  client: BazaarClient,
  dayId: string,
  deviceId: string,
  eventId: string
): Promise<StartOutcome> {
  try {
    const { data, error } = await client.rpc('start_bazaar_day', {
      p_day: dayId,
      p_device: deviceId,
      p_event_id: eventId
    });
    if (error)
      return { ok: false, error: classifySaveError(error) === 'offline' ? 'offline' : 'refused' };
    const started = parseStartedDay(data);
    // Acknowledged only when the reply names the event that was asked for.
    if (!started || started.eventId !== eventId) return { ok: false, error: 'not acknowledged' };
    return { ok: true, started };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/**
 * The engine's state for a day that has just started, exactly as `startEvent` then `openSelling` would leave it for an
 * event with this day's prices and stock, so the till, `saveBazaar` and the offline gate work unchanged. Unlike
 * `openSelling` it does NOT move `baked`: these cookies are the day's own plan, not shop stock. `dayId` and `scheduledId`
 * ride on `event`, which `saveBazaar` already keeps, so a reload with no signal still knows which day is selling.
 * `productIds` are the engine's flavours; `toPesos` converts centavos in one place (`src/lib/money.ts`).
 */
export function engineStateForDay(
  started: StartedDay,
  ctx: { name: string; date: string; dayId: string; scheduledId: string },
  productIds: readonly string[],
  toPesos: (cents: number) => number
) {
  const loaded: Record<string, number> = {};
  for (const id of productIds) loaded[id] = started.loaded[id] ?? 0;
  const prices: Record<string, number> = {};
  for (const [id, cents] of Object.entries(started.prices)) prices[id] = toPesos(cents);
  return {
    event: {
      name: ctx.name,
      date: ctx.date,
      stage: 'selling',
      id: started.eventId,
      snapshot: Object.keys(started.prices),
      dayId: ctx.dayId,
      scheduledId: ctx.scheduledId,
      // S3: the day's float rides here too. The saved copy of the bazaar keeps `event` and not `drawer`, so after a
      // reload the drawer is put back from this.
      floatCents: started.floatCents
    },
    eventStock: { ...loaded },
    eventLoaded: loaded,
    eventPrices: prices,
    drawer: { float: toPesos(started.floatCents), counted: '' },
    sales: [] as never[],
    cart: {} as Record<string, number>,
    unsynced: 0,
    syncState: 'idle',
    syncTried: false
  };
}

// ------------------------------------------------------------------ S3: fees, losses, costs, the close and the finalise

/**
 * `stale`: the day or the event changed since it was shown (40001). The caller reads it again and she looks again; it is
 * never sent again with the new hash on its own. `refused`: the database said no, and saying it again changes nothing.
 */
export type MoneyOutcome = 'saved' | 'stale' | 'refused' | 'offline';

function classifyMoney(error: { code?: string } | null): MoneyOutcome {
  if (!error) return 'saved';
  if (error.code === '40001') return 'stale';
  if (['22023', '23505', '42501', '55000', 'P0002'].includes(error.code ?? '')) return 'refused';
  return 'offline';
}

/**
 * `repeat`: the database already had this change under its id (an earlier reply was lost) and answered it without
 * applying it again. The phone, which never heard the first answer, applies it now.
 */
function withRepeat(result: MoneyOutcome, data: unknown): MoneyOutcome | 'repeat' {
  const row = Array.isArray(data) ? (data[0] as unknown) : null;
  return result === 'saved' && isObj(row) && row.duplicate === true ? 'repeat' : result;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const validAt = (at: number): boolean =>
  Number.isInteger(at) && at >= 100_000_000_000 && at <= 99_999_999_999_999;

export interface FeeFields {
  /** Minted once for the form, so a save whose reply was lost is repeated under the same id. */
  clientId: string;
  scheduledId: string;
  /** Null for a fee of the whole event. */
  dayId: string | null;
  label: string;
  category: string;
  amountCents: number;
  /** YYYY-MM-DD */
  paidOn: string;
}

/** The same bounds `save_bazaar_fee` enforces. Null means the fee is acceptable. */
export function feeError(f: FeeFields): string | null {
  if (f.clientId.length < 1 || f.clientId.length > 150 || f.clientId.startsWith('rent:'))
    return 'This fee has no id yet. Reload and try again.';
  if (!UUID.test(f.scheduledId) || (f.dayId !== null && !UUID.test(f.dayId)))
    return 'This fee has no event yet. Reload and try again.';
  const label = f.label.trim();
  const category = f.category.trim();
  if (
    label.length < 1 ||
    label.length > 80 ||
    category.length < 1 ||
    category.length > 40 ||
    CONTROL.test(f.label + f.category)
  )
    return 'A fee needs a name of 1 to 80 characters.';
  if (!whole(f.amountCents, 1, 100_000_000)) return 'An amount is from ₱0.01 to ₱1,000,000.';
  if (!realDate(f.paidOn)) return 'The day it was paid is not a real date.';
  return null;
}

export async function saveBazaarFee(
  client: BazaarClient,
  f: FeeFields
): Promise<MoneyOutcome | 'repeat'> {
  try {
    const { data, error } = await client.rpc('save_bazaar_fee', {
      p_fee: {
        client_id: f.clientId,
        scheduled_id: f.scheduledId,
        day_id: f.dayId,
        label: f.label.trim(),
        category: f.category.trim(),
        amount_cents: f.amountCents,
        paid_on: f.paidOn
      }
    });
    return withRepeat(classifyMoney(error), data);
  } catch {
    return 'offline';
  }
}

export interface LossFields {
  clientId: string;
  dayId: string;
  productId: string;
  qty: number;
  reason: string;
  /** Epoch milliseconds, kept with the id so a repeat is the same loss. */
  at: number;
}

/** The same bounds `save_bazaar_loss` enforces. Null means the loss is acceptable. */
export function lossError(f: LossFields): string | null {
  if (f.clientId.length < 1 || f.clientId.length > 160 || !UUID.test(f.dayId))
    return 'This loss has no id yet. Reload and try again.';
  if (!PRODUCT.test(f.productId)) return 'Choose the flavour.';
  if (!whole(f.qty, 1, 9999)) return 'How many is a whole number, 1 or more.';
  const reason = f.reason.trim();
  if (reason.length < 1 || reason.length > 80 || CONTROL.test(f.reason))
    return 'Say what happened, in 1 to 80 characters.';
  if (!validAt(f.at)) return 'The time is not valid.';
  return null;
}

export async function saveBazaarLoss(
  client: BazaarClient,
  f: LossFields
): Promise<MoneyOutcome | 'repeat'> {
  try {
    const { data, error } = await client.rpc('save_bazaar_loss', {
      p_loss: {
        client_id: f.clientId,
        day_id: f.dayId,
        product_id: f.productId,
        qty: f.qty,
        reason: f.reason.trim(),
        at: f.at
      }
    });
    return withRepeat(classifyMoney(error), data);
  } catch {
    return 'offline';
  }
}

/** Her typed cost per cookie in centavos (at most four decimals), or null to go back to the recipe's. */
export async function saveBazaarCost(
  client: BazaarClient,
  bookingId: string,
  productId: string,
  typedCents: number | null
): Promise<MoneyOutcome> {
  if (
    typedCents !== null &&
    !(Number.isFinite(typedCents) && typedCents >= 0 && typedCents <= 100_000_000)
  )
    return 'refused';
  try {
    const { error } = await client.rpc('save_bazaar_cost', {
      p_booking: bookingId,
      p_product: productId,
      p_typed_cents: typedCents as number
    });
    return classifyMoney(error);
  } catch {
    return 'offline';
  }
}

/** Her target profit in whole centavos, or null for none. */
export async function saveBazaarTarget(
  client: BazaarClient,
  bookingId: string,
  cents: number | null
): Promise<MoneyOutcome> {
  if (cents !== null && !whole(cents, 0, 10_000_000_000)) return 'refused';
  try {
    const { error } = await client.rpc('save_bazaar_target', {
      p_booking: bookingId,
      p_cents: cents as number
    });
    return classifyMoney(error);
  } catch {
    return 'offline';
  }
}

export interface StockAddFields {
  /** A uuid minted once for the form: the call adds, so a repeat must be told from a second add. */
  clientId: string;
  dayId: string;
  productId: string;
  qty: number;
  kind: 'made' | 'carried';
}

/** More stock on an open day. `loaded` is what the day now holds of the flavour (made and carried), as the database has it. */
export async function addBazaarDayStock(
  client: BazaarClient,
  f: StockAddFields
): Promise<{ result: MoneyOutcome; loaded: number | null; duplicate: boolean }> {
  if (!UUID.test(f.clientId) || !UUID.test(f.dayId) || !whole(f.qty, 1, 9999))
    return { result: 'refused', loaded: null, duplicate: false };
  try {
    const { data, error } = await client.rpc('add_bazaar_day_stock', {
      p_day: f.dayId,
      p_product: f.productId,
      p_qty: f.qty,
      p_kind: f.kind,
      p_client_id: f.clientId
    });
    const result = classifyMoney(error);
    const row = Array.isArray(data) ? data[0] : null;
    const loaded =
      result === 'saved' && isObj(row) && whole(row.loaded, 0, 19_998) ? row.loaded : null;
    // Saved only when the reply says what the day now holds.
    return {
      result: result === 'saved' && loaded === null ? 'offline' : result,
      loaded,
      duplicate: isObj(row) && row.duplicate === true
    };
  } catch {
    return { result: 'offline', loaded: null, duplicate: false };
  }
}

export interface CloseLine {
  left: number;
  carryNext: number;
  toShop: number;
  writtenOff: number;
}

export interface DayClose {
  dayId: string;
  /** Epoch milliseconds. */
  at: number;
  /** Null when the cash was not counted. */
  countedCents: number | null;
  /** Every flavour of the day, and no other. */
  lines: Record<string, CloseLine>;
  /** The day's hash from the read she was shown. */
  expected: string;
  /**
   * S3.1: the selling phone's own count of the day's sales (voided ones out, refused ones out) and their cash, which the
   * server must hold too or it refuses (40001). Null from a phone that is not selling the day: it closes it without the till.
   */
  till: TillFigures | null;
}

/** What the selling phone holds of one day: its sales that are not voided, and the cash among them, in centavos. */
export interface TillFigures {
  salesCount: number;
  cashCents: number;
}

/** The body `close_bazaar_day` is given: exactly these keys, and nothing the screen did not show. */
export function closeBody(c: DayClose) {
  const lines: Record<
    string,
    { left: number; carry_next: number; to_shop: number; written_off: number }
  > = {};
  for (const [pid, l] of Object.entries(c.lines))
    lines[pid] = {
      left: l.left,
      carry_next: l.carryNext,
      to_shop: l.toShop,
      written_off: l.writtenOff
    };
  return {
    day_id: c.dayId,
    at: c.at,
    counted_cents: c.countedCents,
    lines,
    expected: c.expected,
    sales_count: c.till ? c.till.salesCount : null,
    cash_cents: c.till ? c.till.cashCents : null
  };
}

/** Closes a day with her count. Posts nothing to the books. The same close again is answered. */
export async function closeBazaarDay(client: BazaarClient, c: DayClose): Promise<MoneyOutcome> {
  if (!UUID.test(c.dayId) || !HASH.test(c.expected) || !validAt(c.at)) return 'refused';
  if (c.countedCents !== null && !whole(c.countedCents, 0, 999_999_999_999)) return 'refused';
  if (c.till && !tillOk(c.till)) return 'refused';
  try {
    const { data, error } = await client.rpc('close_bazaar_day', { p_close: closeBody(c) });
    const result = classifyMoney(error);
    // Acknowledged only when the reply is the summary.
    return result === 'saved' && !isObj(data) ? 'offline' : result;
  } catch {
    return 'offline';
  }
}

const tillOk = (t: TillFigures): boolean =>
  whole(t.salesCount, 0, 999_999) && whole(t.cashCents, 0, 999_999_999_999);

/**
 * Closes the event, once: only now do its fees, rent, cash differences and stock use reach the books. `expected` is the
 * hash of the summary she was shown; `dropNo` is the drop the cookies sent to the shop are written to as a batch. `till`
 * (S3.1): a closed day this phone still holds, with its own figures for it, which the server must hold too (40001).
 */
export async function finaliseBazaar(
  client: BazaarClient,
  bookingId: string,
  expected: string,
  dropNo: number,
  till: ({ dayId: string } & TillFigures) | null = null
): Promise<MoneyOutcome> {
  if (!UUID.test(bookingId) || !HASH.test(expected) || !whole(dropNo, 0, 100_000)) return 'refused';
  if (till && (!UUID.test(till.dayId) || !tillOk(till))) return 'refused';
  try {
    const { data, error } = await client.rpc('finalise_bazaar', {
      p_booking: bookingId,
      p_expected: expected,
      p_drop: dropNo,
      p_till: (till
        ? { day_id: till.dayId, sales_count: till.salesCount, cash_cents: till.cashCents }
        : null) as Json
    });
    const result = classifyMoney(error);
    return result === 'saved' && !isObj(data) ? 'offline' : result;
  } catch {
    return 'offline';
  }
}

/**
 * S3.1: takes back a fee (`void_bazaar_fee`) or a loss (`void_bazaar_loss`) by its client id. The row stays on the server,
 * flagged, and no figure counts it. The same call again is answered.
 */
export async function voidBazaarEntry(
  client: BazaarClient,
  kind: 'fee' | 'loss',
  clientId: string
): Promise<MoneyOutcome> {
  if (clientId.length < 1 || clientId.length > (kind === 'fee' ? 150 : 160)) return 'refused';
  try {
    const { data, error } = await client.rpc(
      kind === 'fee' ? 'void_bazaar_fee' : 'void_bazaar_loss',
      {
        p_client_id: clientId
      }
    );
    const result = classifyMoney(error);
    return result === 'saved' && !isObj(data) ? 'offline' : result;
  } catch {
    return 'offline';
  }
}
