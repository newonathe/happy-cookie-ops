'use client';

import { useEffect, useRef } from 'react';
import { useOpsEngine, useOpsVals } from '@/store/use-ops';
import { enqueueSale } from '@/lib/offline/queue';
import { flushQueue, requestBackgroundSync } from '@/lib/offline/sync';
import type { EventSale } from '@/store/engine/ops-engine';

/**
 * Durability for bazaar sales, and the real online/offline signal.
 *
 * Three jobs, none of which the engine should know about:
 *   1. every sale the engine records is mirrored into IndexedDB before anything else,
 *      so closing the tab or a dead battery cannot lose it;
 *   2. the browser's own connectivity drives the engine's online flag (the prototype's
 *      manual toggle still works, and still wins, for demoing);
 *   3. coming back online flushes the queue and asks for background sync.
 */
export function OfflineBridge() {
  useOpsVals();
  const engine = useOpsEngine();
  const mirrored = useRef<Set<string>>(new Set());
  const sales = engine.state.sales;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app still works without it; only background retry is lost */
    });
  }, []);

  useEffect(() => {
    const event = engine.state.event;
    const eventId = (event && event.id) || null;
    const fresh = sales.filter((sale: EventSale) => !mirrored.current.has(sale.id));
    if (!fresh.length) return;
    void (async () => {
      for (const sale of fresh) {
        mirrored.current.add(sale.id);
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
      }
      if (navigator.onLine) await flushQueue();
      else await requestBackgroundSync();
    })();
  }, [sales, engine]);

  useEffect(() => {
    const sync = () => {
      if (!engine.state.online) engine.toggleOnline();
      void flushQueue();
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
  }, [engine]);

  return null;
}
