import type { DayRead } from '@/lib/data/bazaar-days';

/**
 * S2: a selling day belongs to the account, not to the device. The till rebuilds the day from the server (`get_bazaar_day`) and
 * then lays what this phone has not had acknowledged on top, so a sale rung offline is never dropped and never counted twice.
 * Pure: no clock, no storage. The server's money is converted to pesos by the caller's `toPesos`, in one place.
 *
 * The rules:
 *  - a sale is one client id: the server's copy wins over this phone's copy of the same id (they are the same sale);
 *  - a sale only this phone holds is shown, and its cookies come off the table the server reports;
 *  - a void on either side hides the sale: a server sale this phone voided (the void not yet sent) puts its cookies back;
 *  - the table stock is the server's, less this phone's unsent sales, plus this phone's unsent voids; never below zero.
 */

/** A sale this phone holds (queue row or a sale on screen), in the engine's own units: pesos. */
export interface LocalDaySale {
  clientId: string;
  items: Record<string, number>;
  gross: number;
  discount: number;
  total: number;
  pay: string;
  ref: string;
  clerk: string;
  at: number;
  tendered: number;
  change: number;
  /** `sent`: the server acknowledged it; it may still be missing from a read made just before. */
  state: 'sent' | 'pending' | 'failed';
  ledgerId?: string | null;
}

/** An engine sale (what `EventSale` holds) that also says which sale it is on the server. */
export interface MergedSale {
  id: string;
  clientId: string;
  items: Record<string, number>;
  total: number;
  gross: number;
  discount: number;
  pay: string;
  ref: string;
  clerk: string;
  at: number;
  tendered: number;
  change: number;
  synced: boolean;
  failed: boolean;
  ledgerId: string | null;
}

export interface MergedDay {
  /** Newest first, as the engine keeps them; sales that are voided are left out, as the engine drops them. */
  sales: MergedSale[];
  /** Cookies on the table by flavour, never below zero. */
  stock: Record<string, number>;
  /** What the day holds by flavour, made and carried with what was added. */
  loaded: Record<string, number>;
  /** Sales shown here that the server has not acknowledged. */
  unsynced: number;
}

export interface MergeInput {
  server: DayRead;
  local: readonly LocalDaySale[];
  /** Client ids of sales with a pending or acknowledged local void. */
  localVoids: ReadonlySet<string>;
  toPesos: (centavos: number) => number;
}

const takeOff = (
  stock: Record<string, number>,
  items: Record<string, number>,
  sign: 1 | -1
): void => {
  for (const [pid, qty] of Object.entries(items)) stock[pid] = (stock[pid] ?? 0) + sign * qty;
};

export function mergeDay({ server, local, localVoids, toPesos }: MergeInput): MergedDay {
  const stock: Record<string, number> = { ...server.tableStock };
  const byId = new Map<string, MergedSale & { voided: boolean }>();

  for (const s of server.sales) {
    byId.set(s.clientId, {
      id: '',
      clientId: s.clientId,
      items: { ...s.items },
      total: toPesos(s.totalCents),
      gross: toPesos(s.grossCents),
      discount: toPesos(s.discountCents),
      pay: s.pay,
      ref: s.ref,
      clerk: s.clerk,
      at: s.at,
      tendered: toPesos(s.tenderedCents),
      change: toPesos(s.changeCents),
      synced: true,
      failed: false,
      ledgerId: null,
      voided: s.voided
    });
    // The server's stock already has a sale that is not voided out and a voided one back; only this phone's void is not in it.
    if (!s.voided && localVoids.has(s.clientId)) {
      takeOff(stock, s.items, 1);
      byId.get(s.clientId)!.voided = true;
    }
  }

  for (const l of local) {
    // The same client id is the same sale: the server's copy stands, and its cookies are already off the table.
    if (byId.has(l.clientId)) continue;
    const voided = localVoids.has(l.clientId);
    byId.set(l.clientId, {
      id: '',
      clientId: l.clientId,
      items: { ...l.items },
      total: l.total,
      gross: l.gross,
      discount: l.discount,
      pay: l.pay,
      ref: l.ref,
      clerk: l.clerk,
      at: l.at,
      tendered: l.tendered,
      change: l.change,
      synced: l.state === 'sent',
      failed: l.state === 'failed',
      ledgerId: l.ledgerId ?? null,
      voided
    });
    // A sale only this phone holds is not in the server's stock; a voided one never took anything.
    if (!voided) takeOff(stock, l.items, -1);
  }

  // Labels count every sale of the day, voided ones too, oldest first, so one is not renumbered when another is voided. The
  // number is only what the till calls the sale; the client id is which sale it is.
  const ordered = [...byId.values()].sort(
    (a, b) => a.at - b.at || (a.clientId < b.clientId ? -1 : 1)
  );
  ordered.forEach((sale, i) => {
    sale.id = 'S' + (i + 1);
  });
  const shown = ordered
    .filter((sale) => !sale.voided)
    .reverse()
    .map(({ voided: _voided, ...sale }) => {
      void _voided;
      return sale;
    });

  for (const pid of Object.keys(stock)) stock[pid] = Math.max(0, stock[pid] ?? 0);
  return {
    sales: shown,
    stock,
    loaded: { ...server.loaded },
    unsynced: shown.filter((sale) => !sale.synced).length
  };
}
