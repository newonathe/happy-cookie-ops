/** What the customer pages read from one order. */
export interface CustomerOrder {
  id: string;
  name: string;
  mobile: string;
  ig: string;
  email: string;
  status: string;
  items: Record<string, number>;
  placedAt: number;
}

export interface CustomerOrderRow {
  id: string;
  statusText: string;
  cookiesText: string;
  whenText: string;
  open: () => void;
}

export interface CustomerRow {
  /** The grouping key: the normalised mobile, or the name when there is no mobile. */
  key: string;
  name: string;
  mobile: string;
  /** Instagram or email, when one was given. */
  contactText: string;
  orderCountText: string;
  lastOrderText: string;
  orders: CustomerOrderRow[];
  /** A CSV of this customer's contact details and orders. */
  recordCsv: string;
}

/**
 * `removed`: gone from the orders read back. `nothing`: the server matched no order. `partial`: some
 * orders still carry the number, because they were stored in another form. `unconfirmed`: the server
 * answered but the orders could not be read back. `failed`: not done.
 */
export type RemoveOutcome = 'removed' | 'nothing' | 'partial' | 'unconfirmed' | 'failed';

export interface LiveCustomers {
  rows: CustomerRow[];
  /** Null until the orders are read: no list is not the same as no customers. */
  loaded: boolean;
  /** Removes one customer's contact details on the server. Null without a mobile to act on. */
  removeContact: (row: CustomerRow) => Promise<RemoveOutcome>;
  online: boolean;
}

export interface CustomerDeskDeps {
  orders: () => readonly CustomerOrder[] | null;
  openOrder: (id: string) => void;
  dateText: (at: number) => string;
  online: () => boolean;
  /** The owner-only server function. It reports how many orders it changed, or throws. */
  anonymise: (phone: string) => Promise<number>;
  /** Reads the orders again, so the page shows what the server now holds. False when it could not. */
  refresh: () => Promise<boolean | undefined>;
}

/** Digits only, in the local form the server uses, so one person's numbers group together. */
export function normaliseMobile(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.startsWith('63')) return '0' + digits.slice(2);
  if (/^9\d{9}$/.test(digits)) return '0' + digits;
  return digits;
}

/** A spreadsheet must not read a customer's text as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

const count = (items: Record<string, number>): number =>
  Object.values(items).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Customers, from the orders they placed: who they are, what they ordered, and removing their details. */
export class CustomerDesk {
  constructor(private readonly deps: CustomerDeskDeps) {}

  private rows(orders: readonly CustomerOrder[]): CustomerRow[] {
    const groups = new Map<string, CustomerOrder[]>();
    for (const order of orders) {
      const key = normaliseMobile(order.mobile) || 'name:' + order.name.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return [...groups.entries()]
      .map(([key, group]) => {
        const sorted = [...group].sort((a, b) => b.placedAt - a.placedAt);
        const latest = sorted[0]!;
        const rows = sorted.map((order) => ({
          id: order.id,
          statusText: order.status,
          cookiesText: plural(count(order.items), 'cookie', 'cookies'),
          whenText: this.deps.dateText(order.placedAt),
          open: () => this.deps.openOrder(order.id)
        }));
        const header = [
          'Order',
          'Date',
          'Status',
          'Cookies',
          'Name',
          'Mobile',
          'Instagram',
          'Email'
        ];
        const lines = sorted.map((order, i) =>
          [
            order.id,
            rows[i]!.whenText,
            order.status,
            String(count(order.items)),
            order.name,
            order.mobile,
            order.ig,
            order.email
          ]
            .map(csvCell)
            .join(',')
        );
        return {
          key,
          name: latest.name,
          mobile: latest.mobile,
          contactText: [latest.ig, latest.email].filter(Boolean).join(' · '),
          orderCountText: plural(sorted.length, 'order', 'orders'),
          lastOrderText: 'Last order ' + rows[0]!.whenText,
          orders: rows,
          recordCsv: [header.map(csvCell).join(','), ...lines].join('\r\n')
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The server decides; what is on screen changes only when the orders have been read again. */
  private async removeContact(row: CustomerRow): Promise<RemoveOutcome> {
    if (!row.mobile || !this.deps.online()) return 'failed';
    let changed: number;
    try {
      changed = await this.deps.anonymise(row.mobile);
    } catch {
      return 'failed';
    }
    if (changed === 0) return 'nothing';
    const read = await Promise.resolve(this.deps.refresh()).then(
      (answer) => answer !== false,
      () => false
    );
    if (!read) return 'unconfirmed';
    const orders = this.deps.orders();
    if (!orders) return 'unconfirmed';
    return this.rows(orders).some((other) => other.key === row.key) ? 'partial' : 'removed';
  }

  vals(): LiveCustomers {
    const orders = this.deps.orders();
    return {
      rows: orders ? this.rows(orders) : [],
      loaded: orders !== null,
      online: this.deps.online(),
      removeContact: (row) => this.removeContact(row)
    };
  }
}
