'use client';

import { useEffect, useId, useRef } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { ProductsScreen } from '@/components/screens/products';
import { Button } from '@/components/ui/button';
import styles from './products-live.module.css';

function ProductCard({ row }: { row: OpsVals['productRows'][number] }) {
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (row.returnRecipeFocus)
      card.current?.querySelector<HTMLButtonElement>('[data-recipe-link]')?.focus();
    else if (row.returnEditFocus)
      card.current?.querySelector<HTMLButtonElement>('[data-product-edit]')?.focus();
  }, [row.returnRecipeFocus, row.returnEditFocus]);
  return (
    <article ref={card} className={styles.card} aria-labelledby={titleId}>
      <div className={styles.summary}>
        <span aria-hidden="true" style={{ ...s(row.imgStyle), width: 64, height: 64 }} />
        <div className={styles.identity}>
          <h2 id={titleId}>{row.name}</h2>
          <div className={styles.labels}>
            {row.rotating ? <span>Rotating</span> : null}
            {row.tag ? <span>{row.tag}</span> : null}
            {row.soldOut ? <span>Sold out</span> : null}
          </div>
        </div>
      </div>
      <div className={styles.prices}>
        <strong>{row.priceText}</strong>
        <span>{row.costText}</span>
      </div>
      <p className={styles.description}>{row.desc}</p>
      <p className={styles.visibility}>
        {row.offForm ? 'Off the order form' : 'On the order form'}
      </p>
      <div className={styles.actions}>
        <Button data-recipe-link onClick={row.goRecipe}>
          Recipe<span className="sr-only"> for {row.name}</span>
        </Button>
        <Button data-product-edit onClick={row.edit}>
          Edit product<span className="sr-only"> {row.name}</span>
        </Button>
      </div>
      <Button
        variant="ghost"
        className={styles.visibilityAction}
        onClick={row.toggleOnForm}
        aria-label={row.formLabel}
      >
        {row.offForm ? 'Show on order form' : 'Hide from order form'}
      </Button>
    </article>
  );
}

/** Presentation only: product definitions, recipe links and order-form changes remain with their existing runtime. */
export function ProductsLive({ v }: { v: OpsVals }) {
  if (v.liveScreen?.tabs?.label !== 'Make') return <ProductsScreen v={v} />;
  const rows = v.productRows ?? [];
  return (
    <section data-screen-label="Products" className={styles.page} aria-label="Product library">
      <header className={styles.heading}>
        <h1>Products</h1>
        <p>Open a cookie’s recipe or edit its shop details.</p>
      </header>
      <p className={styles.note}>New prices apply to new orders only.</p>
      <details className={styles.help}>
        <summary>About product labels</summary>
        <p>
          A badge is a short label beside a cookie in your shop, such as Popular or Seasonal. Leave
          it blank for no badge.
        </p>
        <p>
          Rotating identifies a changing flavour. Sold out and order-form visibility are separate
          states.
        </p>
      </details>
      {rows.length ? (
        <div className={styles.grid}>
          {rows.map((row, index) => (
            <ProductCard key={index} row={row} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>No products loaded yet.</p>
      )}
    </section>
  );
}
