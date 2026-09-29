'use client';

import { useEffect, useRef, useState } from 'react';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { clientIdFor, enqueueSale } from '@/lib/offline/queue';
import { flushQueue, requestBackgroundSync } from '@/lib/offline/sync';
import { warmOfflineShell } from '@/lib/offline/shell';
import type { EventSalesClient } from '@/lib/data/event-sales';
import type { EventSale } from '@/store/engine/ops-engine';

/**
 * Durability for bazaar sales, and the real online/offline signal.
 *
 * Four jobs, none of which the engine should know about:
 *   1. every sale the engine records is mirrored into IndexedDB before anything else,
 *      so closing the tab or a dead battery cannot lose it;
 *   2. the browser's own connectivity drives the engine's online flag (the prototype's
 *      manual toggle still works, and still wins, for demoing);
 *   3. opening the app, coming back online, or a wake-up from the service worker flushes
 *      the queue;
 *   4. once the service worker is ready, the phone stores its own scripts so it can
 *      reload with no signal (`data-hc-offline-ready` says when).
 */
export function OfflineBridge() {
  // The subscription: without reading the render values this component never re-renders,
  // so a sale recorded after mount would never reach the queue.
  useOpsVals();
  const engine = useOpsEngine();
  const mirrored = useRef<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const sales = engine.state.sales;
  const salesClient = () =>
    (engine as unknown as { saleClient?: EventSalesClient | null }).saleClient ?? null;
  // The runtime flushes and then makes the sale rows on screen say what the queue says.
  const flush = () => {
    const runtime = engine as unknown as { flushSales?: () => Promise<unknown> };
    return runtime.flushSales ? runtime.flushSales() : flushQueue(salesClient());
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => warmOfflineShell())
      .then((ready) => {
        if (ready) document.documentElement.dataset.hcOfflineReady = 'true';
      })
      .catch(() => {
        /* the app still works without it; only reload-offline and background retry are lost */
      });
    const wake = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'hc-flush') void flush();
    };
    navigator.serviceWorker.addEventListener('message', wake);
    if (navigator.onLine) void flush();
    return () => navigator.serviceWorker.removeEventListener('message', wake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const event = engine.state.event;
    const eventId = (event && event.id) || null;
    const keyOf = (sale: EventSale) => clientIdFor({ saleId: sale.id, at: sale.at });
    const fresh = sales.filter((sale: EventSale) => !mirrored.current.has(keyOf(sale)));
    if (!fresh.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let unsaved = 0;
      for (const sale of fresh) {
        try {
          await enqueueSale({
            saleId: sale.id,
            eventId,
            items: sale.items,
            gross: sale.gross,
            discount: sale.discount,
            total: sale.total,
            pay: sale.pay,
            ref: sale.ref,
            clerk: sale.clerk,
            at: sale.at,
            tendered: sale.tendered,
            change: sale.change
          });
          mirrored.current.add(keyOf(sale));
        } catch {
          unsaved += 1;
        }
      }
      if (unsaved) {
        engine.toast('A sale could not be saved on this phone yet. Keep the app open.', 'warn');
        timer = setTimeout(() => setRetry((n) => n + 1), 3000);
        return;
      }
      if (navigator.onLine) await flush();
      else await requestBackgroundSync();
    })();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, engine, retry]);

  useEffect(() => {
    const sync = () => {
      if (!engine.state.online) engine.toggleOnline();
      void flush();
    };
    const drop = () => {
      if (engine.state.online) engine.toggleOnline();
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', drop);
    if (!navigator.onLine && engine.state.online) drop();
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return null;
}
