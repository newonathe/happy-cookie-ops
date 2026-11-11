'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { cookiePicture } from '@/lib/media/cookie-art';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { ProductsScreen } from '@/components/screens/products';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { PageTitle, Panel } from '@/components/ui/owner-kit';
import { ChipRow } from '@/components/ui/owner-patterns';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { isLiveMode } from '@/lib/config/app-mode';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { readAtText } from '@/lib/time/read-at-text';
import { MakeTabs, MakeTitleActions } from './make-shared';
import styles from './products-live.module.css';

type Row = OpsVals['productRows'][number];
type Filter = 'menu' | 'all' | 'recipe';

function ProductCard({ row }: { row: Row }) {
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
      <div className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied photo paths, as elsewhere in the live app */}
        <img src={cookiePicture(resolveImagePath(row.photo ?? ''), String(row.name))} alt="" />
        {row.tag ? <span className={styles.label}>{row.tag}</span> : null}
      </div>
      <div className={styles.body}>
        <h2 id={titleId}>{row.name}</h2>
        <div className={styles.prices}>
          <strong>{row.priceText}</strong>
          <span>{row.costText}</span>
        </div>
        <p className={styles.stock}>{row.bakedText ?? 'Baked stock not read yet'}</p>
        <p className={styles.state}>
          {[
            row.offForm ? 'Off the order form' : 'On the order form',
            row.rotating ? 'Rotating' : null,
            row.soldOut ? 'Sold out' : null,
            row.hasRecipe === false ? 'Needs a recipe' : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" data-recipe-link onClick={row.goRecipe}>
          Recipe<span className="sr-only"> for {row.name}</span>
        </Button>
        <Button variant="ghost" size="sm" data-product-edit onClick={row.edit}>
          Edit product<span className="sr-only"> {row.name}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={styles.visibilityAction}
          onClick={row.toggleOnForm}
          aria-label={row.formLabel}
        >
          {row.offForm ? 'Show' : 'Hide'}
        </Button>
      </div>
    </article>
  );
}

/** Products (client v4): photo cards, three to a row on a wide screen. Definitions, recipe links and order-form changes stay with the runtime. */
export function ProductsLive({ v }: { v: OpsVals }) {
  const [filter, setFilter] = useState<Filter>('menu');
  // HCB-003: what the catalogue read has achieved. Until it has answered, or after it failed
  // with nothing read, no built-in product or price is shown as hers; a failed refresh keeps the
  // last good list, labelled with when it was read.
  const read = useSyncExternalStore(
    flavoursRead.subscribe,
    flavoursRead.get,
    flavoursRead.getServer
  );
  const settings = useAreaSettings(v, 'make', 'Back to products');
  if (v.liveScreen?.tabs?.label !== 'Make') return <ProductsScreen v={v} />;
  if (settings.page) return settings.page;
  const all = v.productRows ?? [];
  const rows = all.filter((row) =>
    filter === 'menu' ? !row.offForm : filter === 'recipe' ? row.hasRecipe === false : true
  );
  const make = v.liveMake;
  const notRead =
    read.phase === 'loading' || (read.phase === 'idle' && isLiveMode() && !!v.ownerView);
  const failedFirst = read.phase === 'failed' && !read.everRead;
  const stale = read.phase === 'failed' && read.everRead && read.readAt !== null;
  const retry = read.retry ? { label: 'Try again', onPress: read.retry } : undefined;
  if (notRead || failedFirst)
    return (
      <section data-screen-label="Products" aria-label="Product library">
        <PageTitle
          title="Products"
          subtitle="Recipes and cookies made, together."
          actions={<MakeTitleActions v={v} onSettings={settings.open} />}
        />
        <MakeTabs v={v} />
        {failedFirst ? (
          <Banner tone="warn" title={STAFF_COPY.productsReadFailed} action={retry} />
        ) : (
          <Panel>
            <p role="status" className="text-[15px] text-ink">
              {STAFF_COPY.productsNotRead}
            </p>
          </Panel>
        )}
      </section>
    );
  return (
    <section data-screen-label="Products" aria-label="Product library">
      <PageTitle
        title="Products"
        subtitle="Recipes and cookies made, together."
        actions={<MakeTitleActions v={v} onSettings={settings.open} />}
      />
      <MakeTabs v={v} />
      {stale ? (
        <div className={styles.readNotice}>
          <Banner
            tone="warn"
            title={STAFF_COPY.productsStale(readAtText(read.readAt as number))}
            action={retry}
          />
        </div>
      ) : null}
      <div className={styles.filters}>
        <ChipRow
          label="Show products"
          options={[
            {
              id: 'menu',
              label: 'Menu',
              active: filter === 'menu',
              onSelect: () => setFilter('menu')
            },
            {
              id: 'all',
              label: 'All products',
              active: filter === 'all',
              onSelect: () => setFilter('all')
            },
            {
              id: 'recipe',
              label: 'Needs recipe',
              active: filter === 'recipe',
              onSelect: () => setFilter('recipe')
            }
          ]}
        />
        {make ? (
          <span className={styles.tools}>
            <Button variant="secondary" size="sm" onClick={make.openDrafts}>
              Recipe drafts
            </Button>
            <Button variant="secondary" size="sm" onClick={make.addProduct}>
              Add product
            </Button>
          </span>
        ) : null}
      </div>
      <p className={styles.note}>New prices apply to new orders only.</p>
      {rows.length && !read.empty ? (
        <div className={styles.grid}>
          {rows.map((row) => (
            <ProductCard key={String(row.name)} row={row} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          {read.empty
            ? STAFF_COPY.productsEmpty
            : all.length
              ? filter === 'recipe'
                ? 'Every product has a recipe.'
                : 'No products on the menu. Choose All products to see the rest.'
              : 'No products loaded yet.'}
        </p>
      )}
    </section>
  );
}
ProductsLive.ownsSectionNavigation = true;
