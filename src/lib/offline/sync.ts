import { markFailed, markSent, pendingSales, pruneSent, isCommandRow, isVoidRow } from './queue';
import type { QueuedCommand, QueuedSale, QueueRow } from './queue';
import { isEventUuid, sendCommand, sendSale, sendVoid, type EventSalesClient } from '@/lib/data/event-sales';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseConfig } from '@/lib/supabase/config';

export interface FlushResult {
  sent: string[];
  failed: Array<{ clientId: string; error: string; permanent: boolean }>;
  skipped: boolean;
}

/** The signed-in browser client, or null when no backend is configured (demo builds). */
export function defaultSalesClient(): EventSalesClient | null {
  if (!hasSupabaseConfig()) return null;
  try {
    return createClient();
  } catch {
    return null;
  }
}

let running: Promise<FlushResult> | null = null;
let again = false;

/**
 * Sends everything the device is holding, one row at a time, and clears only the row the
 * server names in its reply. A row that is not acknowledged stays queued — a lost sale is
 * worse than a repeated request, and both RPCs are idempotent on the client id. Calls that
 * overlap share one run; rows queued while it runs are picked up by a second pass.
 */
export function flushQueue(client?: EventSalesClient | null): Promise<FlushResult> {
  if (running) {
    again = true;
    return running;
  }
  const run = (async () => {
    const total: FlushResult = { sent: [], failed: [], skipped: true };
    do {
      again = false;
      const part = await flushOnce(client ?? null);
      if (!part.skipped) total.skipped = false;
      total.sent.push(...part.sent);
      total.failed.push(...part.failed);
    } while (again);
    return total;
  })().finally(() => {
    running = null;
  });
  running = run;
  return run;
}

async function flushOnce(client: EventSalesClient | null): Promise<FlushResult> {
  const pending = await pendingSales();
  if (!pending.length) return { sent: [], failed: [], skipped: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return { sent: [], failed: [], skipped: true };
  const target = client ?? defaultSalesClient();
  if (!target) return { sent: [], failed: [], skipped: true };

  const sent: string[] = [];
  const failed: FlushResult['failed'] = [];
  // Sales first, then voids, stock, expenses, and the close last: whatever is still on the phone
  // reaches the server before the event is closed on it.
  const rank = (row: QueueRow) => (isVoidRow(row) ? 1 : isCommandRow(row) ? { open: 2, expense: 3, close: 4 }[row.kind] : 0);
  const ordered: QueueRow[] = [...pending].sort((a, b) => rank(a) - rank(b) || a.at - b.at);
  for (const row of ordered) {
    const outcome = isVoidRow(row)
      ? await sendVoid(target, row.saleClientId, row.at)
      : isCommandRow(row)
        ? await sendOneCommand(target, row)
        : await sendOneSale(target, row);
    if (outcome.ok) {
      await markSent([row.clientId]);
      sent.push(row.clientId);
    } else {
      await markFailed(row.clientId, outcome.error);
      failed.push({ clientId: row.clientId, error: outcome.error, permanent: outcome.permanent === true });
    }
  }
  await pruneSent();
  return { sent, failed, skipped: false };
}

const NO_EVENT = { ok: false as const, error: 'no server event: start the event while online', permanent: false };

async function sendOneSale(target: EventSalesClient, row: QueuedSale) {
  if (!isEventUuid(row.eventId)) return NO_EVENT;
  return sendSale(target, row);
}

async function sendOneCommand(target: EventSalesClient, row: QueuedCommand) {
  if (!isEventUuid(row.eventId)) return NO_EVENT;
  return sendCommand(target, row);
}

/** Asks the service worker to wake the open app once the radio comes back. */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }
    ).sync;
    if (sync) await sync.register('hc-sale-sync');
  } catch {
    /* background sync is a bonus; the online listener covers the rest */
  }
}
