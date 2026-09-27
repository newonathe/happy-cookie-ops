import type { ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';

/**
 * What a non-owner sees of the money on the screens they can reach (today, sales,
 * bazaar and the sheets opened from them), in live mode. MP-09 b4.
 *
 * Cine's rule (decision register, 2026-09-28): helpers never see costs, expenses or
 * profit; they may see sale totals when the owner switches `helperSeesSales` on (off by
 * default). The ported screens show some of these to every role: the bazaar's running
 * "N sales · ₱total" line, the event-expense amounts, and after a close-out the revenue,
 * cookie cost, expenses and profit (`bzCloseout`, not gated by `showEventMoney`). The
 * sales log also lists past drop totals from the books next to each sale.
 *
 * Kept whatever the switch says: menu prices, the cart total and each sale's own amount
 * (a helper needs them to charge and to void), and the cash-box line at close-out
 * (helpers may cash up, `ROLES.helper.cashup`). Hidden values show as a dash in the
 * ported markup, which is unchanged. This is a display rule, not a boundary: someone who
 * adds up every visible sale line by hand still gets the total.
 */
export const HIDDEN_AMOUNT = '—';

export function helperMoneyView(
  vals: OpsVals,
  options: { seesTotals: boolean; liveSales: number; count: (n: number) => ReactNode }
): Partial<OpsVals> {
  const { seesTotals, liveSales, count } = options;
  const total = (value: ReactNode) => (seesTotals ? value : HIDDEN_AMOUNT);

  const salesLog = vals.salesLog;
  // The log lists this event's sales first, then past revenue rows from the books (drop
  // totals). A single sale's amount stays; the book totals follow the switch.
  const rows = seesTotals ? salesLog.rows : salesLog.rows.slice(0, liveSales);

  return {
    showEventMoney: false,
    bzRevenue: total(vals.bzRevenue),
    bzCloseout: {
      ...vals.bzCloseout,
      revenue: total(vals.bzCloseout.revenue),
      cogs: HIDDEN_AMOUNT,
      expenses: HIDDEN_AMOUNT,
      profit: HIDDEN_AMOUNT,
      profitOk: false
    },
    eventExpenses: vals.eventExpenses.map((row) => ({ ...row, amountText: HIDDEN_AMOUNT })),
    // The close-out sheet's per-app totals (GCash, Maya, GoTyme) plus the cash sales add up
    // to the event's revenue, so they follow the switch too. The cash-box line stays: a
    // helper cashing up counts that cash by hand anyway.
    digitalTotals: vals.digitalTotals.map((row) => ({ ...row, totalText: total(row.totalText) })),
    salesLog: seesTotals
      ? salesLog
      : {
          rows,
          empty: rows.length === 0,
          countNum: count(rows.length),
          unit: rows.length === 1 ? 'sale recorded' : 'sales recorded'
        }
  };
}
