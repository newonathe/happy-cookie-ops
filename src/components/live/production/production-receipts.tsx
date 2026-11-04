'use client';

import type { LiveProductionReceipt } from '@/lib/production/live-production-types';
import { formatManila } from '@/lib/time/business-clock';
import { Button } from '@/components/ui/button';
import styles from './results.module.css';

const n = (value: number) => value.toLocaleString('en-PH', { maximumFractionDigits: 6 });
const when = (at: number) =>
  formatManila(
    at,
    {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    },
    'en-PH'
  );

/** Acknowledgement and later read health are deliberately separate facts. */
export function ProductionReceipts({ rows }: { rows: LiveProductionReceipt[] }) {
  if (!rows.length) return null;
  const cards = (items: LiveProductionReceipt[]) =>
    items.map((row) => (
      <article key={row.id} className={styles.receipt}>
        <h3>{row.name}</h3>
        <p className={styles.receiptMeta}>
          {row.number ? `${row.kind === 'batch' ? 'Batch' : 'Mix'} ${row.number} · ` : ''}
          Drop {row.dropNo} · Recipe version {row.version} · {when(row.at)}
        </p>
        {row.duplicate ? <p>Already recorded. No second entry was added.</p> : null}
        <strong className={styles.receiptQuantity}>
          {n(row.quantity)} {row.kind === 'batch' ? 'cookies baked' : 'dough portions prepared'}
        </strong>
        {row.kind === 'batch' ? (
          <p>
            {n(row.quantity - row.rejects)} good · {n(row.rejects)} not for sale
          </p>
        ) : null}
        {row.kind === 'batch' ? (
          <div
            role="img"
            aria-label={`${n(row.quantity - row.rejects)} good, ${n(row.rejects)} not for sale`}
            className={styles.track}
          >
            <div className={styles.baked}>
              <i
                className={styles.good}
                style={{
                  width: `${row.quantity ? ((row.quantity - row.rejects) / row.quantity) * 100 : 0}%`
                }}
              />
              <i
                className={styles.reject}
                style={{ width: `${row.quantity ? (row.rejects / row.quantity) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {row.usedDough > 0 ? <p>{n(row.usedDough)} dough balls from the fridge used</p> : null}
        {row.shortfall.length ? (
          <div className={styles.receiptWarning}>
            <strong>Not enough recorded stock</strong>
            <ul>
              {row.shortfall.map((short, index) => (
                <li key={index}>
                  {short.name}: {n(short.by)} {short.unit} short
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p role="status">
          {row.stockState === 'loading'
            ? 'Saved. Checking recorded stock…'
            : row.stockState === 'unread'
              ? 'Saved earlier. Stock has not been checked.'
              : row.stockState === 'failed'
                ? 'Saved. Stock could not be refreshed.'
                : 'Saved. Stock checked.'}
        </p>
        {row.stockState === 'read' && row.balance !== null && row.checkedAt !== null ? (
          <>
            <p>
              {row.kind === 'batch'
                ? `Recorded baked stock · Drop ${row.dropNo}: ${n(row.balance)} cookies`
                : `Dough in the fridge: ${n(row.balance)} balls`}
            </p>
            <p className={styles.receiptMeta}>
              Checked {when(row.checkedAt)} · recorded balance, not a physical count.
            </p>
          </>
        ) : null}
        {row.stockState !== 'loading' && row.stockState !== 'unread' && !row.inventoryReady ? (
          <p className={styles.receiptWarning}>Ingredient balances could not be refreshed.</p>
        ) : null}
        {row.stockState === 'unread' ||
        row.stockState === 'failed' ||
        (row.stockState === 'read' && !row.inventoryReady) ? (
          <Button variant="ghost" size="sm" onClick={row.retry}>
            {row.stockState === 'unread' ? 'Check recorded stock' : 'Retry stock refresh'}
          </Button>
        ) : null}
      </article>
    ));
  return (
    <section className={styles.results} aria-label="Recently saved">
      <header className={styles.sectionHeading}>
        <h2>Recently saved</h2>
      </header>
      {cards(rows.slice(0, 1))}
      {rows.length > 1 ? (
        <details className={styles.history}>
          <summary>Earlier saved work ({rows.length - 1})</summary>
          {cards(rows.slice(1))}
        </details>
      ) : null}
    </section>
  );
}
