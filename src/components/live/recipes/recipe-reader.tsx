'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveRecipesVals } from '@/lib/recipes/live-recipes-types';
import { batchStock, scaleQty, type BatchStockRow } from '@/lib/recipes/batch';
import { formatQuantity } from '@/lib/stock/stock-status';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { OwnerField, Panel, TaskRow } from '@/components/ui/owner-kit';
import styles from './recipe-reader.module.css';

type Page = NonNullable<LiveRecipesVals['recipePage']>;
type Line = Page['rows'][number];

const STOCK_WORDS: Record<BatchStockRow['state'], string> = {
  enough: 'Enough in stock',
  short: 'Short',
  notCounted: 'Not counted',
  notTracked: 'Not in stock list'
};

/** A list to tick off while baking. The ticks stay on this page: they record nothing. */
function Checklist({
  title,
  lines,
  amount
}: {
  title: string;
  lines: Line[];
  amount: (line: Line) => string;
}) {
  if (!lines.length) return null;
  return (
    <>
      <h3 className={styles.listTitle}>{title}</h3>
      <ul className={styles.list}>
        {lines.map((line, index) => (
          <li key={`${line.name}:${index}`}>
            <label className={styles.line}>
              <input type="checkbox" />
              <span>{line.name}</span>
              <strong>{amount(line)}</strong>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

/** One product's saved recipe (client v4): worked out for the batch, with what stock says about it. */
export function RecipeReader({ page, onCosts }: { page: Page; onCosts: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [cookies, setCookies] = useState(page.savedYield ? String(page.savedYield) : '');
  const photo = resolveImagePath(page.photo);
  const batch = Number(cookies);
  const scalable = page.savedYield > 0 && Number.isSafeInteger(batch) && batch > 0;
  const amount = (line: Line) => {
    const scaled = scaleQty(line.qty, page.savedYield, batch);
    return scaled === null ? line.amountText : formatQuantity(scaled, line.unit);
  };
  const rows = scalable ? batchStock(page.rows, page.stock ?? [], page.savedYield, batch) : [];
  const attention = rows.filter((row) => row.state !== 'enough');
  return (
    <section data-screen-label="Recipes" className={styles.page} aria-label="Saved recipe">
      <Button className="self-start" onClick={page.back}>
        Back to Products
      </Button>
      <header className={styles.header}>
        {photo ? (
          <span
            aria-hidden="true"
            className={styles.photo}
            style={{ backgroundImage: `url(${photo})` }}
          />
        ) : null}
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {page.name}
          </h1>
          <p>{[page.versionText, page.yieldText].filter(Boolean).join(' · ') || 'Saved recipe'}</p>
        </div>
      </header>
      <div className={styles.tools}>
        <Button variant="secondary" onClick={onCosts}>
          Cost, history &amp; edit
        </Button>
      </div>
      {page.state !== 'read' ? (
        <Banner
          tone={page.state === 'failed' ? 'warn' : 'info'}
          title={
            page.state === 'failed' ? 'The recipe could not be refreshed.' : 'Reading the recipe…'
          }
          body={page.rows.length ? 'Showing the last saved copy.' : undefined}
          action={
            page.state === 'failed' ? { label: 'Retry recipe', onPress: page.refresh } : undefined
          }
        />
      ) : null}
      {page.rows.length ? (
        <div className={styles.columns}>
          <Panel>
            <section aria-label="Recipe quantities">
              <div className={styles.batch}>
                <h2>Recipe</h2>
                <OwnerField
                  label="Cookies to make"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={cookies}
                  onChange={(event) => setCookies(event.target.value)}
                />
              </div>
              <Checklist
                title="Ingredients"
                lines={page.rows.filter((row) => row.kind !== 'packaging')}
                amount={amount}
              />
              <Checklist
                title="Packaging"
                lines={page.rows.filter((row) => row.kind === 'packaging')}
                amount={amount}
              />
              <div className={styles.foot}>
                <span>Saved yield: {page.savedYield} cookies</span>
                {page.startProduction ? (
                  <Button variant="primary" onClick={page.startProduction}>
                    Start production
                  </Button>
                ) : null}
              </div>
            </section>
          </Panel>
          <Panel title="Stock for this batch">
            {!scalable ? (
              <p className={styles.note}>Enter how many cookies to make.</p>
            ) : !page.stock ? (
              <p className={styles.note}>
                Inventory has not been read yet. Stock for this batch is unknown.
              </p>
            ) : attention.length === 0 ? (
              <p className={styles.note}>Recorded stock covers this batch.</p>
            ) : (
              attention.map((row) => {
                const item = page.stock?.find((entry) => entry.name === row.name);
                return (
                  <TaskRow
                    key={row.name}
                    title={row.name}
                    detail={
                      row.state === 'short'
                        ? `Short by ${formatQuantity(row.short, row.unit)}`
                        : row.state === 'notTracked' && item && item.unit !== row.unit
                          ? 'Stock unit differs from recipe'
                          : STOCK_WORDS[row.state]
                    }
                    action={
                      item?.count ? (
                        <Button variant="secondary" size="sm" onClick={item.count}>
                          Count<span className="sr-only"> {row.name}</span>
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </Panel>
        </div>
      ) : page.state === 'read' ? (
        <p className={styles.empty}>No saved recipe quantities yet.</p>
      ) : null}
    </section>
  );
}
