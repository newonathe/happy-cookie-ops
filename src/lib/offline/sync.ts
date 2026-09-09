import { markFailed, markSent, pendingSales, pruneSent } from './queue';

export interface FlushResult {
  sent: string[];
  failed: Array<{ clientId: string; error: string }>;
  skipped: boolean;
}

const ENDPOINT = '/api/sync';

/**
 * Sends everything the device is holding, in one request, and only clears the rows the
 * server names in its reply. A sale that is not acknowledged stays queued — a lost sale
 * is worse than a duplicate request, and the endpoint is idempotent on client_id.
 */
export async function flushQueue(): Promise<FlushResult> {
  const pending = await pendingSales();
  if (!pending.length) return { sent: [], failed: [], skipped: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { sent: [], failed: [], skipped: true };

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sales: pending })
    });
    if (!response.ok) {
      const text = await response.text();
      for (const row of pending) await markFailed(row.clientId, response.status + ' ' + text.slice(0, 120));
      return { sent: [], failed: pending.map((r) => ({ clientId: r.clientId, error: String(response.status) })), skipped: false };
    }
    const body = (await response.json()) as { accepted?: string[]; rejected?: Array<{ clientId: string; error: string }> };
    const accepted = body.accepted ?? [];
    await markSent(accepted);
    for (const bad of body.rejected ?? []) await markFailed(bad.clientId, bad.error);
    await pruneSent();
    return { sent: accepted, failed: body.rejected ?? [], skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network';
    for (const row of pending) await markFailed(row.clientId, message);
    return { sent: [], failed: pending.map((r) => ({ clientId: r.clientId, error: message })), skipped: false };
  }
}

/** Asks the service worker to retry in the background once the radio comes back. */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (sync) await sync.register('hc-sale-sync');
  } catch {
    /* background sync is a bonus; the online listener covers the rest */
  }
}
