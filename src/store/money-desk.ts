import type { LiveMoney, MoneyPeriod } from '@/view-models/vals';
import type { OpsEngineState } from '@/store/engine/ops-engine';
import { centavosToPesos } from '@/lib/money';
import { formatManila, manilaMidnight, monthStart } from '@/lib/time/business-clock';
import { manilaToday } from '@/lib/orders/pickup';

interface LedgerRow {
  id?: string;
  kind: LiveMoney['transactions'][number]['kind'];
  at: number;
  cat: string;
  label: string;
  amount: number;
}

interface PeriodTotals {
  revenue: number;
  totalExp: number;
  profit: number;
  draw: number;
  refunded: number;
  taxSetAside: number;
  taxRate: number;
  merged: Array<{ cat: string; amount: number; n: number }>;
}

/** The engine methods the page's figures come from. `periodFrom` is swapped for the length of one read. */
export interface MoneyEngine {
  ledgerIn: (s: OpsEngineState) => LedgerRow[];
  pnlTotals: (s: OpsEngineState) => PeriodTotals;
  periodFrom: (s: OpsEngineState) => number;
}

export interface MoneyDeskDeps {
  read?: () => LiveMoney['read'];
  engine: () => MoneyEngine;
  state: () => OpsEngineState;
  books: () => {
    held: ReadonlyArray<{ name: string; revenueCents: number; expenseCents: number }>;
    uncosted: ReadonlyArray<{ at: number }>;
  } | null;
  recordExpense: () => void;
  takeMoneyOut: () => void;
  exportBooks: (from?: number) => void;
  openBooks: () => void;
  openCategories: () => void;
  openTaxRules: () => void;
  rerender: () => void;
}

/** The Money page: one period for every figure, chart and list. Every figure is the engine's own; this only groups them. */
export class MoneyDesk {
  private period: MoneyPeriod = 'days30';

  constructor(private readonly deps: MoneyDeskDeps) {}

  /** The start of the selected period. Every option lies inside the 35 days the books read covers. */
  private periodFrom(s: OpsEngineState): number {
    const now = Number(s.now);
    if (this.period === 'week') return manilaMidnight(manilaToday(now)) - 6 * 86_400_000;
    if (this.period === 'month') return manilaMidnight(monthStart(manilaToday(now)));
    return now - 30 * 86_400_000;
  }

  /** Runs the engine's own period sums with the selected period start, as `monthTotals` does. */
  private inPeriod<T>(s: OpsEngineState, run: () => T): T {
    const engine = this.deps.engine();
    const ported = engine.periodFrom;
    const from = this.periodFrom(s);
    engine.periodFrom = () => from;
    try {
      return run();
    } finally {
      engine.periodFrom = ported;
    }
  }

  vals(): LiveMoney {
    const s = this.deps.state();
    const engine = this.deps.engine();
    const books = this.deps.books();
    const { totals, rows } = this.inPeriod(s, () => ({
      totals: engine.pnlTotals(s),
      rows: engine.ledgerIn(s)
    }));
    const now = Number(s.now);
    const from = this.periodFrom(s);
    const day = 86_400_000;
    const step = this.period === 'week' ? day : 7 * day;
    const date = (at: number) =>
      formatManila(at, { day: 'numeric' }) + ' ' + formatManila(at, { month: 'short' });
    // Presentation only: the same ledger rows the totals sum, grouped by day or week.
    const buckets: LiveMoney['buckets'] = [];
    for (let start = from; start < now; start += step) {
      const end = start + step;
      const inside = rows.filter((r) => r.at >= start && (r.at < end || end > now));
      const sum = (kind: string) =>
        inside.filter((r) => r.kind === kind).reduce((t, r) => t + (Number(r.amount) || 0), 0);
      buckets.push({
        label: this.period === 'week' ? formatManila(start, { weekday: 'short' }) : date(start),
        income: sum('revenue') - sum('refund'),
        expenses: sum('expense')
      });
      if (end > now) break;
    }
    const label = { week: 'Last 7 days', days30: 'Last 30 days', month: 'This month' }[this.period];
    return {
      period: this.period,
      periodText: label + ' · ' + date(from) + ' to ' + date(now),
      setPeriod: (period) => {
        this.period = period;
        this.deps.rerender();
      },
      loaded: !!books,
      read: this.deps.read?.(),
      revenue: totals.revenue,
      expenses: totals.totalExp,
      profit: totals.profit,
      draw: totals.draw,
      refunded: totals.refunded,
      taxSetAside: totals.taxSetAside,
      taxRate: totals.taxRate,
      buckets,
      categories: totals.merged.map((c) => ({ cat: c.cat, amount: c.amount, n: c.n })),
      transactions: rows
        .slice()
        .sort((a, b) => b.at - a.at)
        .map((r, i) => ({
          id: r.id ?? String(i),
          label: r.label,
          cat: r.cat,
          when: date(r.at),
          kind: r.kind,
          signed: r.kind === 'revenue' ? r.amount : -r.amount
        })),
      held: (books?.held ?? []).map((h) => ({
        name: h.name,
        revenue: centavosToPesos(h.revenueCents),
        expenses: centavosToPesos(h.expenseCents)
      })),
      uncosted: (books?.uncosted ?? []).filter((u) => u.at >= from && u.at <= now).length,
      recordExpense: this.deps.recordExpense,
      takeMoneyOut: this.deps.takeMoneyOut,
      exportPeriod: () => this.deps.exportBooks(from),
      exportAll: () => this.deps.exportBooks(),
      openBooks: this.deps.openBooks,
      openCategories: this.deps.openCategories,
      openTaxRules: this.deps.openTaxRules
    };
  }
}
