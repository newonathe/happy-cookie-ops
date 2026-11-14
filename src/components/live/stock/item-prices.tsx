'use client';

import { useEffect, useRef } from 'react';
import type { StockItemPage } from '@/lib/stock/live-stock-types';
import { Button } from '@/components/ui/button';
import styles from './inventory.module.css';

/** Saved supplier pack prices stay separate from the item's authoritative inventory unit cost. */
export function ItemPrices({ page }: { page: StockItemPage }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <div className={`${styles.screen} ${styles.childPage}`}>
      <Button className="self-start" onClick={page.closePrices}>
        {page.closePricesLabel ?? 'Back to item'}
      </Button>
      <header className={styles.title}>
        <div>
          <h1 ref={title} tabIndex={-1}>
            {page.item.name} prices
          </h1>
          <p className={styles.subtitle}>Saved supplier prices & history.</p>
        </div>
        <div className={styles.actions}>
          {page.managePrices ? (
            <Button variant="primary" onClick={page.managePrices}>
              Add price
            </Button>
          ) : null}
          {page.chooseSupplier ? (
            <Button onClick={page.chooseSupplier}>Choose supplier</Button>
          ) : null}
        </div>
      </header>
      <section className={styles.itemPanel} aria-label="Current inventory cost">
        <span className={styles.note}>Current cost per unit</span>
        <strong>{page.item.costText}</strong>
      </section>
      {page.priceSources?.length ? (
        <ul className={styles.historyList} aria-label="Supplier prices">
          {page.priceSources.map((source) => (
            <li key={source.id} className={styles.movement}>
              <strong>{source.supplierName}</strong>
              <span>
                {source.packText} · {source.priceText}
              </span>
              <span>{source.historyText}</span>
              {source.lastBought ? <span>Last bought: {source.lastBought}</span> : null}
              <span>{source.stateText}</span>
              {source.edit ? (
                <Button className="self-start" onClick={source.edit}>
                  Edit price
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No saved supplier prices for this item yet.</p>
      )}
    </div>
  );
}
