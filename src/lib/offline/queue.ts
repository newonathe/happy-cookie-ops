import { idb } from './idb';
import { deviceId } from '@/lib/device';

/**
 * A bazaar sale is money that already happened. It is written here first, on the
 * device, and only then sent. Nothing in this file may throw away a row: a row leaves
 * the queue when the server has acknowledged its client id, and never before.
 */
export type QueuedState = 'pending' | 'sent' | 'failed';

export interface QueuedSale {
  /** Stable across retries and devices — the server's idempotency key. */
  clientId: string;
  kind?: 'sale';
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
  /** S3.1: the server understood and refused this body; sending it again cannot help. Never set for a network failure. */
  refused?: true;
}

/**
 * A void is queued as its own row, never by deleting the sale row: the sale may not have
 * reached the server yet, and the server handles the two arriving in either order.
 */
export interface QueuedVoid {
  clientId: string;
  kind: 'void';
  saleClientId: string;
  at: number;
  state: QueuedState;
  attempts: number;
  lastError: string | null;
  /** S3.1: the server understood and refused this body; sending it again cannot help. Never set for a network failure. */
  refused?: true;
}

/**
 * The rest of the bazaar's commands: stock put on the table, an expense, the close. Each has a
 * stable key (`open:<event>`, `close:<event>`, `expense:<uuid>`), so queueing one twice keeps
 * the first body, and the server acknowledges the key like a sale's.
 */
export type CommandKind = 'open' | 'expense' | 'close';
export interface QueuedCommand {
  clientId: string;
  kind: CommandKind;
  eventId: string;
  /** The exact JSON the RPC takes, in centavos: a retry must send the same body. */
  payload: Record<string, unknown>;
  at: number;
  state: QueuedState;
  attempts: number;
  lastError: string | null;
  /** S3.1: the server understood and refused this body; sending it again cannot help. Never set for a network failure. */
  refused?: true;
}

export type QueueRow = QueuedSale | QueuedVoid | QueuedCommand;
export type SaleInput = Omit<QueuedSale, 'clientId' | 'kind' | 'state' | 'attempts' | 'lastError'>;

export const isVoidRow = (row: QueueRow): row is QueuedVoid => row.kind === 'void';
export const isCommandRow = (row: QueueRow): row is QueuedCommand =>
  row.kind === 'open' || row.kind === 'expense' || row.kind === 'close';
export const commandKey = (kind: CommandKind, id: string) => kind + ':' + id;
/** Keys of rows that are not sales: they lead with the kind, a sale's leads with its device. */
export const isSaleKey = (clientId: string) => !/^(void|open|expense|close):/.test(clientId);
export const voidKey = (saleClientId: string) => 'void:' + saleClientId;

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

export async function enqueueVoid(saleClientId: string, at = Date.now()): Promise<QueuedVoid> {
  const clientId = voidKey(saleClientId);
  const existing = await idb.get<QueuedVoid>(clientId);
  if (existing) return existing;
  const row: QueuedVoid = {
    clientId,
    kind: 'void',
    saleClientId,
    at,
    state: 'pending',
    attempts: 0,
    lastError: null
  };
  await idb.put(row);
  return row;
}

export async function enqueueCommand(
  command: Omit<QueuedCommand, 'state' | 'attempts' | 'lastError'>
): Promise<QueuedCommand> {
  const existing = await idb.get<QueuedCommand>(command.clientId);
  if (existing) return existing;
  const row: QueuedCommand = { ...command, state: 'pending', attempts: 0, lastError: null };
  await idb.put(row);
  return row;
}

export async function allSales(): Promise<QueueRow[]> {
  if (!idb.supported()) return [];
  const rows = await idb.all<QueueRow>();
  return rows.sort((a, b) => a.at - b.at);
}

export async function pendingSales(): Promise<QueueRow[]> {
  return (await allSales()).filter((row) => row.state !== 'sent');
}

export async function pendingCount(): Promise<number> {
  return (await pendingSales()).length;
}

export async function markSent(clientIds: string[]): Promise<void> {
  for (const clientId of clientIds) {
    const row = await idb.get<QueueRow>(clientId);
    if (row) await idb.put({ ...row, state: 'sent' as QueuedState, lastError: null });
  }
}

/**
 * `permanent` is true only when the server refused the body itself (`SendOutcome.permanent`). A row that merely failed to
 * get an answer stays a row to send: it is not marked refused, so it keeps blocking the day's close.
 */
export async function markFailed(
  clientId: string,
  error: string,
  permanent = false
): Promise<void> {
  const row = await idb.get<QueueRow>(clientId);
  if (!row) return;
  const { refused: _was, ...rest } = row;
  void _was;
  await idb.put({
    ...rest,
    state: 'failed' as QueuedState,
    attempts: row.attempts + 1,
    lastError: error,
    ...(permanent ? { refused: true as const } : {})
  } as QueueRow);
}

/**
 * S3.1: what this phone still owes the server for one event. `blocking` is every row of the event not sent and not refused
 * (sales and commands by their event; a void by its sale's event, and a void whose sale row is gone counts, to be safe).
 * `refused` lists the rows the server refused outright: they are kept, never deleted, and shown for review, but they no
 * longer hold the day on the phone (voiding one or sending it again cannot make the server take it).
 */
export async function unsentForEvent(
  eventId: string
): Promise<{ blocking: QueueRow[]; refused: QueueRow[] }> {
  return splitForEvent(await allSales(), eventId);
}

/** `unsentForEvent` over rows already read. */
export function splitForEvent(
  rows: QueueRow[],
  eventId: string
): { blocking: QueueRow[]; refused: QueueRow[] } {
  const byId = new Map(rows.map((row) => [row.clientId, row]));
  const eventOf = (row: QueueRow): string | null | undefined => {
    if (!isVoidRow(row)) return row.eventId;
    const sale = byId.get(row.saleClientId);
    return sale && !isVoidRow(sale) ? sale.eventId : undefined;
  };
  const blocking: QueueRow[] = [];
  const refused: QueueRow[] = [];
  for (const row of rows) {
    if (row.state === 'sent') continue;
    const of = eventOf(row);
    const orphanVoid = isVoidRow(row) && of === undefined;
    if (of !== eventId && !orphanVoid) continue;
    if (row.refused) refused.push(row);
    else blocking.push(row);
  }
  return { blocking, refused };
}

/** Sent rows are kept for a day so a helper can still see what went out. */
export async function pruneSent(olderThanMs = 86_400_000): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  for (const row of await allSales()) {
    if (row.state === 'sent' && row.at < cutoff) await idb.delete(row.clientId);
  }
}
