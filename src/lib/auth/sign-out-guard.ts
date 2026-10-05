import { allSales, clientIdFor } from '@/lib/offline/queue';
import { idb } from '@/lib/offline/idb';

/** How long the count may take before it counts as unreadable (a stuck IndexedDB must not stall the control). */
export const COUNT_TIMEOUT_MS = 3_000;

/** The part of an engine sale the count needs: what the screen shows as recorded on this phone. */
export interface LocalSale {
  id: string;
  at: number;
  synced?: boolean;
}

/**
 * How much the phone still holds that the server has not acknowledged, counted before a
 * deliberate sign-out so the person can send it first (N3): the queue rows that are not `sent`
 * (the same rule as `pendingSales`: sales, voids and event changes), plus any sale on screen
 * that never reached the queue and is not synced (the write failed: the phone's only copy).
 *
 * A read only: nothing here marks, fails, prunes or enqueues a row, and a sign-out never needs
 * it to succeed. `null` means it could not be known (no IndexedDB in this browser, a read that
 * threw or took longer than `COUNT_TIMEOUT_MS`): the caller warns without a number and still
 * lets the person sign out. Never zero by default: zero is only an answer.
 */
export async function queuedBeforeSignOut(
  local: readonly LocalSale[] = []
): Promise<number | null> {
  try {
    if (!idb.supported()) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), COUNT_TIMEOUT_MS);
    });
    const rows = await Promise.race([allSales(), slow]).finally(() => clearTimeout(timer));
    if (!rows) return null;
    const known = new Set(rows.map((row) => row.clientId));
    const held = rows.filter((row) => row.state !== 'sent').length;
    const unqueued = local.filter(
      (sale) => !sale.synced && !known.has(clientIdFor({ saleId: sale.id, at: sale.at }))
    ).length;
    return held + unqueued;
  } catch {
    return null;
  }
}
