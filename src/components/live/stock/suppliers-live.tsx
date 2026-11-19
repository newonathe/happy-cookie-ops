'use client';

import { StockReadNotice } from './stock-read-notice';

import { useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { SectionNavigation } from '@/components/live/section-navigation';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { peso } from '@/lib/money/format';
import { pesosToCentavos } from '@/lib/money';
import { GlassCard } from '@/components/ui/glass';
import { PageTitle } from '@/components/ui/owner-kit';
import { Notice, SubPage, stockGlass as G } from './stock-glass';
import styles from './inventory.module.css';

/** Supplier browsing is a page; existing acknowledged supplier/price saves remain in their form. */
export function SuppliersLive({ v }: { v: OpsVals }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const settings = useAreaSettings(v, 'stock', 'Back to suppliers');
  const data = v.liveSupplierDirectory;
  const selected = data?.rows.find((row) => row.id === selectedId);
  const rows = data?.rows.filter((row) => showInactive || row.active) ?? [];
  if (settings.page) return <SubPage>{settings.page}</SubPage>;
  const notices = (
    <>
      <Notice>
        <StockReadNotice read={v.liveStockRead} />
      </Notice>
      {!data && !v.liveStockRead ? (
        <Notice>
          <p role="status">Suppliers are loading.</p>
        </Notice>
      ) : null}
    </>
  );
  if (selectedId)
    return (
      <section className={G.page} data-screen-label="Suppliers">
        <SectionNavigation v={v} refined tools={false} onGround />
        {notices}
        <SubPage>
          <div className={styles.screen}>
            <Button className="self-start" onClick={() => setSelectedId(null)}>
              Back to suppliers
            </Button>
            <div className={styles.title}>
              <div>
                <h1>{selected?.name ?? 'Supplier unavailable'}</h1>
                <p className={styles.subtitle}>{selected?.place}</p>
              </div>
              <div className={styles.actions}>
                {data && selected ? (
                  <Button variant="secondary" onClick={() => data.edit(selectedId)}>
                    Edit supplier
                  </Button>
                ) : null}
              </div>
            </div>
            {!data ? null : selected ? (
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
            )}
          </div>
        </SubPage>
      </section>
    );
  return (
    <section className={G.page} data-screen-label="Suppliers">
      <div>
        <PageTitle
          onGround
          title="Suppliers"
          subtitle="Contacts, supplied items and saved prices."
          actions={
            <>
              {data ? (
                <Button variant="primary" onClick={() => data.add()}>
                  Add supplier
                </Button>
              ) : null}
              <Button variant="secondary" onClick={settings.open}>
                Settings
              </Button>
            </>
          }
        />
        <SectionNavigation v={v} refined tools={false} onGround />
      </div>
      {notices}
      {data ? (
        <GlassCard
          title="Directory"
          action={
            <label className={`${styles.filter} min-h-11`}>
              <input
                type="checkbox"
                className="size-6 accent-brand"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive suppliers
            </label>
          }
        >
          {rows.length ? (
            <ul className={G.rows} aria-label="Supplier directory">
              {rows.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => setSelectedId(row.id)}>
                    <span className="min-w-0">
                      <strong className="block text-label font-semibold [overflow-wrap:anywhere]">
                        {row.name}
                      </strong>
                      <span className="mt-1 block text-caption text-ink-mute [overflow-wrap:anywhere]">
                        {[
                          row.place,
                          `${row.priceCount} saved ${row.priceCount === 1 ? 'price' : 'prices'}`,
                          row.active ? '' : 'Inactive'
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span aria-hidden="true" className={G.chev}>
                      ›
                    </span>
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
        </GlassCard>
      ) : null}
    </section>
  );
}
SuppliersLive.ownsSectionNavigation = true;
