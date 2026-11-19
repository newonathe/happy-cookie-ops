'use client';

import { useEffect, useRef, useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { KeptRecipeEditView, LiveRecipesVals } from '@/lib/recipes/live-recipes-types';
import { batchStock, scaleQty, type BatchStockRow } from '@/lib/recipes/batch';
import { formatQuantity } from '@/lib/stock/stock-status';
import { cookiePicture } from '@/lib/media/cookie-art';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { OwnerField, Panel, TaskRow } from '@/components/ui/owner-kit';
import { KeptEditBanner } from './kept-edit-banner';
import { RecipeLines } from './recipe-editor';
import styles from './recipe-reader.module.css';

type Page = NonNullable<LiveRecipesVals['recipePage']>;
type Line = Page['rows'][number];

const STOCK_WORDS: Record<BatchStockRow['state'], string> = {
  enough: 'Enough in stock',
  short: 'Short',
  notCounted: 'Not counted',
  notTracked: 'Not in stock list',
  unavailable: 'Recorded stock unavailable'
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
export function RecipeReader({
  page,
  onCosts,
  onCreate,
  kept,
  inline
}: {
  page: Page;
  /** The owner's way to edit the lines on this page: the engine's open recipe, and how to open it. */
  inline?: { recipe: OpsVals['recipe']; begin: () => void; dirtyHere: boolean };
  onCosts: () => void;
  onCreate?: () => void;
  /** HCB-038: an unsaved edit kept across a reload, offered back or explained. */
  kept?: KeptRecipeEditView | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [cookies, setCookies] = useState(page.savedYield ? String(page.savedYield) : '');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const asked = useRef(false);
  const open = !!inline && (editing || inline.dirtyHere);
  const dirty = !!inline?.recipe.dirty;
  useEffect(() => {
    if (asked.current && !dirty) {
      asked.current = false;
      setEditing(false);
    }
  }, [dirty]);
  const photo = cookiePicture(resolveImagePath(page.photo), page.name);
  const batch = Number(cookies);
  const scalable = page.savedYield > 0 && Number.isSafeInteger(batch) && batch > 0;
  const amount = (line: Line) => {
    const scaled = scaleQty(line.qty, page.savedYield, batch);
    return scaled === null ? line.amountText : formatQuantity(scaled, line.unit);
  };
  const rows = scalable ? batchStock(page.rows, page.stock, page.savedYield, batch) : [];
  const attention = rows.filter((row) => row.state !== 'enough');
  const stockRow = (row: (typeof attention)[number]) => {
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
  };
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
      <KeptEditBanner kept={kept} />
      <div className={styles.tools}>
        {inline && page.state === 'read' && page.rows.length && !open ? (
          <Button
            variant="secondary"
            onClick={() => {
              // Quantities are edited at the saved batch size, never a scaled one.
              setCookies(String(page.savedYield));
              setProblem(null);
              inline.begin();
              setEditing(true);
            }}
          >
            Edit recipe
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onCosts}>
          Cost, history &amp; edit
        </Button>
      </div>
      {page.state !== 'read' ? (
        <Banner
          tone={page.state === 'failed' ? 'warn' : 'info'}
          title={
            page.state === 'failed'
              ? page.rows.length
                ? 'The recipe could not be refreshed.'
                : 'The recipe could not be read.'
              : 'Reading the recipe…'
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
              {open && inline ? (
                <>
                  <div className={styles.batch}>
                    <h2>Edit recipe</h2>
                    <span>
                      Makes {inline.recipe.yieldNum} cookies
                      <Button
                        variant="secondary"
                        onClick={inline.recipe.yieldDown}
                        aria-label="Lower yield"
                      >
                        −
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={inline.recipe.yieldUp}
                        aria-label="Raise yield"
                      >
                        +
                      </Button>
                    </span>
                  </div>
                  <p className={styles.note}>
                    Amounts are for one saved batch. Saving makes a new version; anything already
                    baked keeps its old one.
                  </p>
                  {problem ? <Banner tone="warn" title={problem} /> : null}
                  <RecipeLines recipe={inline.recipe} />
                </>
              ) : (
                <>
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
                </>
              )}
              <div className={styles.foot}>
                <span>Saved yield: {page.savedYield} cookies</span>
                {open && inline ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        page.discardEdit?.();
                        setProblem(null);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!dirty}
                      reason="Change something first."
                      onClick={() => {
                        const rows = inline.recipe.rows ?? [];
                        if (rows.some((row) => !String(row.name).trim()))
                          return setProblem('Give every line a name, or remove it.');
                        if (rows.some((row) => row.kind === null))
                          return setProblem('Choose ingredient or packaging for each line.');
                        setProblem(null);
                        asked.current = true;
                        inline.recipe.save();
                      }}
                    >
                      Save new version
                    </Button>
                  </>
                ) : page.startProduction ? (
                  <Button
                    variant="primary"
                    disabled={
                      !scalable ||
                      !Number.isInteger(batch) ||
                      batch > 10000 ||
                      page.state !== 'read'
                    }
                    reason="Choose 1 to 10,000 whole cookies and read the saved recipe before starting."
                    onClick={() => page.startProduction?.(scalable ? batch : undefined)}
                  >
                    Start production
                  </Button>
                ) : null}
              </div>
            </section>
          </Panel>
          <Panel title="Do you have enough?">
            {!scalable ? (
              <p className={styles.note}>Enter how many cookies to make.</p>
            ) : !page.stock ? (
              <p className={styles.note}>Inventory has not been read yet, so this is unknown.</p>
            ) : attention.length === 0 ? (
              <p className={styles.note}>Yes, your records cover this batch.</p>
            ) : (
              <>
                {attention.filter((row) => row.state === 'short').map(stockRow)}
                {attention.some((row) => row.state !== 'short') ? (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-caption font-semibold text-ink-soft">
                      {attention.filter((row) => row.state !== 'short').length} not counted yet
                    </summary>
                    {attention.filter((row) => row.state !== 'short').map(stockRow)}
                  </details>
                ) : null}
              </>
            )}
          </Panel>
        </div>
      ) : page.state === 'read' ? (
        <div className={styles.empty}>
          <p>No saved recipe quantities yet.</p>
          {page.createRecipe && onCreate ? (
            <Button variant="primary" onClick={onCreate}>
              Create recipe
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
