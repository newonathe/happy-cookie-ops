'use client';

import { useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { SectionNavigation } from '@/components/live/section-navigation';
import { peso } from '@/lib/money/format';
import { pesosToCentavos } from '@/lib/money';
import styles from './inventory.module.css';

/** Supplier browsing is a page; existing acknowledged supplier/price saves remain in their form. */
export function SuppliersLive({ v }: { v: OpsVals }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const data = v.liveSupplierDirectory;
  const selected = data?.rows.find((row) => row.id === selectedId);
  const rows = data?.rows.filter((row) => showInactive || row.active) ?? [];
  return (
    <section className={styles.screen} data-screen-label="Suppliers">
      {selectedId ? (
        <Button className="self-start" onClick={() => setSelectedId(null)}>
          Back to suppliers
        </Button>
      ) : null}
      <div className={styles.title}>
        <div>
          <h1>{selectedId ? (selected?.name ?? 'Supplier unavailable') : 'Suppliers'}</h1>
          <p className={styles.subtitle}>
            {selectedId ? selected?.place : 'Contacts, supplied items and saved prices.'}
          </p>
        </div>
        {data && (!selectedId || selected) ? (
          <Button
            variant={selectedId ? 'secondary' : 'primary'}
            onClick={() => (selectedId ? data.edit(selectedId) : data.add())}
          >
            {selectedId ? 'Edit supplier' : 'Add supplier'}
          </Button>
        ) : null}
      </div>
      <SectionNavigation v={v} />
      {!data ? (
        <p role="status">Suppliers are loading.</p>
      ) : selectedId ? (
        selected ? (
          <>
            <section className={styles.itemPanel} aria-label="Supplier details">
              {!selected.active ? (
                <p className={styles.note}>
                  Inactive supplier · History is kept. Edit supplier to reactivate.
                </p>
              ) : null}
              <dl className={styles.facts}>
                <div>
                  <dt>Phone</dt>
                  <dd>{selected.phone || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{selected.notes || 'No notes'}</dd>
                </div>
              </dl>
            </section>
            <section className={styles.history} aria-label="Items and prices">
              <h2>Items & prices</h2>
              {selected.prices?.length ? (
                <ul className={styles.historyList}>
                  {selected.prices.map((price) => (
                    <li key={price.id} className={styles.movement}>
                      <strong>{price.itemName}</strong>
                      <span>
                        {price.packLabel || 'Pack not specified'} ·{' '}
                        {peso(pesosToCentavos(price.pricePesos))}
                      </span>
                      {price.lastBought ? <span>Last bought: {price.lastBought}</span> : null}
                      <span>{price.previousText}</span>
                      <span>
                        {!price.active
                          ? 'Price not in use'
                          : price.preferred
                            ? 'Preferred source'
                            : 'Saved price'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No saved prices yet.</p>
              )}
            </section>
          </>
        ) : (
          <p className={styles.empty}>
            This supplier is unavailable. Return to suppliers to choose another.
          </p>
        )
      ) : (
        <>
          <label className={`${styles.filter} min-h-11`}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive suppliers
          </label>
          {rows.length ? (
            <ul className={styles.panel} aria-label="Supplier directory">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span>
                      <strong className={styles.name}>{row.name}</strong>
                      <span className={styles.detail}>
                        {[
                          row.place,
                          `${row.priceCount} saved ${row.priceCount === 1 ? 'price' : 'prices'}`,
                          row.active ? '' : 'Inactive'
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {data.rows.length
                ? 'No active suppliers. Show inactive suppliers or add one.'
                : 'No suppliers yet. Add your first supplier here.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
SuppliersLive.ownsSectionNavigation = true;
