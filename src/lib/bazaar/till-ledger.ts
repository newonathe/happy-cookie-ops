import { pesosToCentavos } from '@/lib/money';
import { peso } from '@/lib/money/format';
import type { EventSale } from '@/store/engine/ops-engine';

/**
 * What the till's bottom half shows: the day's trackers and one row per sale, read from the sales this phone holds.
 * Money is added in centavos. "In the drawer" is the same sum the server closes the day with (float + cash sales), so the
 * till and the close always agree. Fees are not taken off, because that sum does not take them off.
 *
 * An amount that was never recorded stays unrecorded: a cash sale with nothing typed in "Cash received" is the pay sheet's
 * "Leave blank if exact", so it reads "Exact" and never "₱0.00 given".
 */
export interface TillLedgerRow {
  /** "2:14 PM" */
  whenText: string;
  /** "₱470.00", or "Free". */
  totalText: string;
  lines: Array<{ qty: number; name: string; unitText: string | null; lineText: string | null }>;
  /** Before any discount; null when there was none, because the total already says it. */
  subtotalText: string | null;
  discountText: string | null;
  /** Cash only: the amount handed over, "Exact", or null for any other payment. */
  cashGivenText: string | null;
  /** Cash only, when an amount was typed. */
  changeText: string | null;
  /** Why this sale has not reached the server, in her words; null when nothing has gone wrong. */
  problemText: string | null;
}

export interface TillLedger {
  /** False for a helper the owner has not allowed to see totals: `totals` and `target` are then null. */
  totals: {
    totalText: string;
    averageText: string | null;
    methods: Array<{ label: string; count: number; totalText: string }>;
    discountsText: string | null;
  } | null;
  drawer: {
    expectedText: string;
    /** Null when this phone holds no starting cash for the day. */
    floatText: string | null;
    cashSalesText: string;
    /** Null until a sale takes cash. */
    receivedText: string | null;
    changeGivenText: string | null;
  };
  /** What everything on the table is worth at its price; null when nothing is on the table. */
  target: {
    amountText: string;
    /** Whole percent reached, never over 100. */
    percent: number;
    reachedCents: number;
    amountCents: number;
    toGoText: string;
  } | null;
  cookies: { sold: number; left: number; freebies: number };
  rows: TillLedgerRow[];
}

const METHODS = ['Cash', 'GCash', 'Maya', 'GoTyme'] as const;

const cents = (pesos: unknown) => pesosToCentavos(Number(pesos) || 0);
const count = (items: Record<string, number>) =>
  Object.values(items).reduce((sum, n) => sum + (Number(n) || 0), 0);

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function rowOf(
  sale: EventSale,
  names: Record<string, string>,
  prices: Record<string, number>,
  problem: string | null
): TillLedgerRow {
  const isCash = sale.pay === 'Cash';
  const given = Number(sale.tendered) || 0;
  const discount = cents(sale.discount);
  return {
    whenText: timeOf(sale.at),
    totalText: cents(sale.total) === 0 ? 'Free' : peso(cents(sale.total)),
    lines: Object.entries(sale.items)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([pid, qty]) => {
        const unit = prices[pid];
        const known = typeof unit === 'number' && Number.isFinite(unit);
        return {
          qty,
          name: names[pid] ?? pid,
          unitText: known ? peso(cents(unit)) : null,
          lineText: known ? peso(cents(unit) * qty) : null
        };
      }),
    subtotalText: discount > 0 ? peso(cents(sale.gross)) : null,
    discountText: discount > 0 ? peso(discount) : null,
    cashGivenText: !isCash ? null : given > 0 ? peso(cents(given)) : 'Exact',
    changeText: isCash && given > 0 ? peso(cents(sale.change)) : null,
    problemText: problem
  };
}

export function buildTillLedger(input: {
  sales: EventSale[];
  floatPesos: number | null;
  loaded: Record<string, number>;
  left: Record<string, number>;
  prices: Record<string, number>;
  names: Record<string, string>;
  seesTotals: boolean;
  problemOf?: (sale: EventSale) => string | null;
}): TillLedger {
  const { sales, floatPesos, loaded, left, prices, names, seesTotals, problemOf } = input;
  const totalCents = sales.reduce((sum, sale) => sum + cents(sale.total), 0);
  const paying = sales.filter((sale) => sale.pay !== 'Freebie');
  const cash = sales.filter((sale) => sale.pay === 'Cash');
  const cashCents = cash.reduce((sum, sale) => sum + cents(sale.total), 0);
  const floatCents = floatPesos === null ? 0 : cents(floatPesos);
  // Cash handed over: the typed amount, or the sale's total when it was exact. Handed over less change is the cash sales.
  const receivedCents = cash.reduce(
    (sum, sale) => sum + (Number(sale.tendered) > 0 ? cents(sale.tendered) : cents(sale.total)),
    0
  );
  const changeCents = cash.reduce(
    (sum, sale) => sum + (Number(sale.tendered) > 0 ? cents(sale.change) : 0),
    0
  );
  const discountCents = sales.reduce(
    (sum, sale) => sum + (sale.pay === 'Freebie' ? 0 : cents(sale.discount)),
    0
  );
  const amountCents = Object.entries(loaded).reduce(
    (sum, [pid, qty]) => sum + cents(prices[pid]) * (Number(qty) || 0),
    0
  );

  return {
    totals: seesTotals
      ? {
          totalText: peso(totalCents),
          averageText: paying.length ? peso(totalCents / paying.length) : null,
          methods: METHODS.map((label) => {
            const paid = sales.filter((sale) => sale.pay === label);
            return {
              label,
              count: paid.length,
              totalText: peso(paid.reduce((sum, sale) => sum + cents(sale.total), 0))
            };
          }).filter((method) => method.count > 0),
          discountsText: discountCents > 0 ? peso(discountCents) : null
        }
      : null,
    drawer: {
      expectedText: peso(floatCents + cashCents),
      floatText: floatPesos === null ? null : peso(floatCents),
      cashSalesText: peso(cashCents),
      receivedText: cash.length ? peso(receivedCents) : null,
      changeGivenText: cash.length ? peso(changeCents) : null
    },
    target:
      seesTotals && amountCents > 0
        ? {
            amountText: peso(amountCents),
            percent: Math.min(100, Math.floor((totalCents / amountCents) * 100)),
            reachedCents: totalCents,
            amountCents,
            toGoText: peso(Math.max(0, amountCents - totalCents))
          }
        : null,
    cookies: {
      sold: sales.reduce((sum, sale) => sum + count(sale.items), 0),
      left: Object.values(left).reduce((sum, n) => sum + (Number(n) || 0), 0),
      freebies: sales
        .filter((sale) => sale.pay === 'Freebie')
        .reduce((sum, sale) => sum + count(sale.items), 0)
    },
    rows: sales.map((sale) => rowOf(sale, names, prices, problemOf?.(sale) ?? null))
  };
}
