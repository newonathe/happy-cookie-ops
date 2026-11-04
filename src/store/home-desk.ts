import type { LiveHome } from '@/view-models/vals';
import type { StockItem } from '@/lib/data/stock-catalogue';
import { stockStatus } from '@/lib/stock/stock-status';

export interface HomeDeskDeps {
  /** Orders with their saved status; null until they are read. */
  orders: () => ReadonlyArray<{ status?: string }> | null;
  /** The stock catalogue's items; null until it is read. */
  stockItems: () => readonly StockItem[] | null;
  /** This month's books; null until they are read. */
  month: () => { revenue: number; totalExp: number; profit: number } | null;
  /** Unconfirmed production work on this device. */
  production: () => LiveHome['production'];
  flavourCount: () => number;
  greeting: () => string;
  dateText: () => string;
  openStockItem: (id: string) => void;
  go: LiveHome['go'];
}

/** Home's facts. Each comes from the record that owns it, and each is null until that record has been read. */
export class HomeDesk {
  constructor(private readonly deps: HomeDeskDeps) {}

  private orderCounts(): LiveHome['orders'] {
    const all = this.deps.orders();
    if (!all) return null;
    const count = (status: string) => all.filter((order) => order.status === status).length;
    return {
      review: count('Payment review'),
      toPrepare: count('Confirmed') + count('Preparing'),
      ready: count('Ready')
    };
  }

  private stock(): { counts: LiveHome['stockCounts']; attention: LiveHome['stockAttention'] } {
    const all = this.deps.stockItems();
    if (!all) return { counts: null, attention: [] };
    const items = all.filter(
      (item) => item.active && (item.category === 'Ingredients' || item.category === 'Packaging')
    );
    // The Stock page's own rule, so the two pages never disagree about an item.
    const rows = items.map((item) => ({ item, status: stockStatus(item.onHand, item.parLevel) }));
    const count = (status: string) => rows.filter((row) => row.status === status).length;
    const order = ['Out', 'Low'];
    return {
      counts: {
        ok: count('Good'),
        low: count('Low'),
        out: count('Out'),
        neverCounted: items.filter((item) => item.lastCounted === null).length
      },
      attention: rows
        .filter((row) => row.status !== 'Good')
        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
        .slice(0, 4)
        .map((row) => ({
          name: row.item.name,
          status: row.status as 'Out' | 'Low',
          detail:
            `${row.item.onHand} ${row.item.unit} recorded · reorder at ${row.item.parLevel} ${row.item.unit}` +
            (row.item.lastCounted === null ? ' · never counted' : ''),
          open: () => this.deps.openStockItem(row.item.id)
        }))
    };
  }

  vals(): LiveHome {
    const stock = this.stock();
    const month = this.deps.month();
    return {
      greeting: this.deps.greeting(),
      dateText: this.deps.dateText(),
      orders: this.orderCounts(),
      stockCounts: stock.counts,
      stockAttention: stock.attention,
      production: this.deps.production(),
      month: month
        ? { revenue: month.revenue, expenses: month.totalExp, profit: month.profit }
        : null,
      flavours: this.deps.flavourCount(),
      go: this.deps.go
    };
  }
}
