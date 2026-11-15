import { describe, expect, it, vi } from 'vitest';
import { MoneyDesk, type MoneyEngine } from '@/store/money-desk';
import type { OpsEngineState } from '@/store/engine/ops-engine';
import { manilaMidnight } from '@/lib/time/business-clock';
import { manilaToday } from '@/lib/orders/pickup';

/** Home's week bars: income per Manila day for the last seven days, from the same ledger rows Money groups. */
const DAY = 86_400_000;
// 16 Nov 2026, 15:00 in Manila.
const NOW = Date.UTC(2026, 10, 16, 7, 0, 0);

function desk(ledger: Array<{ kind: string; at: number; amount: number }>, read = true) {
  const engine: MoneyEngine & { periodFrom: (s: OpsEngineState) => number } = {
    periodFrom: () => 0,
    ledgerIn(s) {
      const from = this.periodFrom(s);
      return ledger
        .filter((e) => e.at >= from)
        .map((e, i) => ({ id: String(i), cat: 'x', label: 'x', ...e })) as ReturnType<
        MoneyEngine['ledgerIn']
      >;
    },
    pnlTotals: vi.fn() as unknown as MoneyEngine['pnlTotals']
  };
  const money = new MoneyDesk({
    engine: () => engine,
    state: () => ({ now: NOW }) as unknown as OpsEngineState,
    books: () => (read ? { held: [], uncosted: [] } : null),
    recordExpense: vi.fn(),
    takeMoneyOut: vi.fn(),
    exportBooks: vi.fn(),
    openBooks: vi.fn(),
    openCategories: vi.fn(),
    openTaxRules: vi.fn(),
    rerender: vi.fn()
  });
  return { money, engine };
}

describe('MoneyDesk.lastSevenDays', () => {
  const today = manilaMidnight(manilaToday(NOW));

  it('is null until the books are read', () => {
    expect(desk([], false).money.lastSevenDays()).toBeNull();
  });

  it('sums sales less refunds per Manila day, oldest first, today last, ignoring expenses and older rows', () => {
    const { money, engine } = desk([
      { kind: 'revenue', at: today - 7 * DAY + 1000, amount: 999 }, // eight days ago: outside
      { kind: 'revenue', at: today - 6 * DAY + 1000, amount: 100 },
      { kind: 'revenue', at: today - DAY + 5000, amount: 300 },
      { kind: 'refund', at: today - DAY + 6000, amount: 50 },
      { kind: 'expense', at: today - DAY + 7000, amount: 80 },
      { kind: 'revenue', at: today + 1000, amount: 40 }
    ]);
    const week = money.lastSevenDays();
    expect(week).toHaveLength(7);
    expect(week?.map((d) => d.income)).toEqual([100, 0, 0, 0, 0, 250, 40]);
    expect(week?.map((d) => d.today)).toEqual([false, false, false, false, false, false, true]);
    expect(week?.[6].label).toBe('Mon');
    // The engine's own period start is restored after the read.
    expect(engine.periodFrom({} as OpsEngineState)).toBe(0);
  });
});
