import { idb } from './idb';
import { deviceId } from '@/lib/device';

/**
 * A bazaar sale is money that already happened. It is written here first, on the
 * device, and only then sent. Nothing in this file may throw away a row: a sale leaves
 * the queue when the server has acknowledged its client id, and never before.
 */
export type QueuedState = 'pending' | 'sent' | 'failed';

export interface QueuedSale {
  /** Stable across retries and devices — the server's idempotency key. */
  clientId: string;
  /** The engine's own sale id (S1, S2 …), kept so the UI can match rows up. */
  saleId: string;
  eventId: string | null;
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
  state: QueuedState;
  attempts: number;
  lastError: string | null;
}

export type SaleInput = Omit<QueuedSale, 'clientId' | 'state' | 'attempts' | 'lastError'>;

/**
 * The prototype numbers sales per device (S1, S2 …), so the id alone is not unique
 * across two phones at the same bazaar. Pairing it with the device id and the timestamp
 * makes a key that is stable on retry and unique across devices.
 */
export function clientIdFor(sale: { saleId: string; at: number }): string {
  return deviceId() + ':' + sale.saleId + ':' + sale.at;
}

export async function enqueueSale(sale: SaleInput): Promise<QueuedSale> {
  const clientId = clientIdFor(sale);
  const existing = await idb.get<QueuedSale>(clientId);
  if (existing) return existing;
  const row: QueuedSale = { ...sale, clientId, state: 'pending', attempts: 0, lastError: null };
  await idb.put(row);
  return row;
}

export async function allSales(): Promise<QueuedSale[]> {
  if (!idb.supported()) return [];
  const rows = await idb.all<QueuedSale>();
  return rows.sort((a, b) => a.at - b.at);
}

export async function pendingSales(): Promise<QueuedSale[]> {
  return (await allSales()).filter((row) => row.state !== 'sent');
}

export async function pendingCount(): Promise<number> {
  return (await pendingSales()).length;
}

export async function markSent(clientIds: string[]): Promise<void> {
  for (const clientId of clientIds) {
    const row = await idb.get<QueuedSale>(clientId);
    if (row) await idb.put({ ...row, state: 'sent' as QueuedState, lastError: null });
  }
}

export async function markFailed(clientId: string, error: string): Promise<void> {
  const row = await idb.get<QueuedSale>(clientId);
  if (!row) return;
  await idb.put({ ...row, state: 'failed' as QueuedState, attempts: row.attempts + 1, lastError: error });
}

/** Sent rows are kept for a day so a helper can still see what went out. */
export async function pruneSent(olderThanMs = 86_400_000): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  for (const row of await allSales()) {
    if (row.state === 'sent' && row.at < cutoff) await idb.delete(row.clientId);
  }
}
