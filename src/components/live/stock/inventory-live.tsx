'use client';

import { StockReadNotice } from './stock-read-notice';
import {
  CatalogueNotice,
  PRODUCTS_NOTICE_COPY,
  useCatalogueHeld
} from '../bazaar/catalogue-notice';

import { useEffect, useId, useRef, useState } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import type {
  LiveStockVals,
  StockItemPage,
  StockItemView,
  StockMovementKind,
  StockMovementView,
  StockStatus
} from '@/lib/stock/live-stock-types';
import { OfflineLine, StatusWord, liveStockOf, manilaStamp } from './stock-shared';
import { CountInventory } from './count-inventory';
import { ItemPrices } from './item-prices';
import { ReceiveLive, StockChangeLive } from './stock-entry-live';
import { PageTitle, Panel } from '@/components/ui/owner-kit';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { OpenRow } from '@/components/ui/owner-patterns';
import { Button } from '@/components/ui/button';
import { SectionNavigation } from '@/components/live/section-navigation';
import { GlassCard, SplitBar } from '@/components/ui/glass';
import type { SplitPart } from '@/components/ui/glass';
import { Notice, SubPage, Tile, stockGlass as G } from './stock-glass';
import styles from './inventory.module.css';

type Filter = 'All' | 'Unknown count' | StockStatus;
const FILTERS: readonly Filter[] = ['All', 'Out', 'Low', 'Good', 'Unknown count'];
const unknown = (item: StockItemView) =>
  item.confidence === 'unknown' || (item.confidence === undefined && item.counted === false);
const known = (item: StockItemView) => !unknown(item) && item.confidence !== 'unavailable';
const MADE_CATEGORIES = ['Dough', 'Baked stock'];

/** Dough and baked cookies by product: read from production, changed only by production and waste. */
function MadeList({
  stock,
  category,
  catalogueHeld
}: {
  stock: LiveStockVals;
  category: string;
  catalogueHeld?: boolean;
}) {
  // HCB-004 a2: these are listed by her own products, which this phone may not have read.
  const catalogue = useCatalogueHeld(catalogueHeld);
  const rows = category === 'Dough' ? stock.made?.dough : stock.made?.baked;
  const read = stock.madeRead;
  if (!catalogue.held && catalogue.started)
    return (
      <CatalogueNotice
        failed={catalogue.failed}
        retry={catalogue.retry}
        copy={PRODUCTS_NOTICE_COPY}
      />
    );
  return (
    <>
      {category === 'Baked stock' && read?.periodText ? (
        <p className={styles.note}>{read.periodText}</p>
      ) : null}
      {read?.state === 'failed' ? (
        <div role="status">
          <p>
            {read.stale
              ? 'Production could not be refreshed. Showing the last read balances.'
              : 'Production balances are unavailable.'}
          </p>
          {read.canRetry !== false ? (
            <Button onClick={read.retry}>Retry production balances</Button>
          ) : (
            <p>Connect to the shop to read production balances.</p>
          )}
        </div>
      ) : read?.state === 'loading' ? (
        <p role="status">Loading production balances…</p>
      ) : null}
      {!rows ? (
        !read ? (
          <p className={styles.empty}>Production has not been read yet.</p>
        ) : null
      ) : !rows.length ? (
        <p>No {category === 'Dough' ? 'dough' : 'baked cookies'} recorded.</p>
      ) : (
        <ul aria-label={category} className={G.rows}>
          {rows.map((row) => (
            <li key={row.id} className={G.plainRow}>
              <strong className="min-w-0 text-label font-semibold [overflow-wrap:anywhere]">
                {row.name}
              </strong>
              <span className="font-mono text-label font-semibold tabular-nums">{row.qtyText}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const KIND_WORD: Record<StockMovementKind, string> = {
  opening: 'Opening',
  receipt: 'Receipt',
  count: 'Count',
  waste: 'Waste',
  adjust: 'Adjustment',
  use: 'Used'
};

/** Her words for the two made-goods lists. */
const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  Dough: 'Dough in the fridge',
  'Baked stock': 'Baked cookies'
};

function ItemRow({ item }: { item: StockItemView }) {
  return (
    <li>
      <button type="button" onClick={item.open}>
        <span className="min-w-0">
          <strong className="block text-label font-semibold [overflow-wrap:anywhere]">
            {item.name}
          </strong>
          <span className="mt-1 block text-caption text-ink-mute [overflow-wrap:anywhere]">
            {item.packText}
            {item.costText.startsWith('Cost pending') ? ` · ${item.costText}` : ''}
          </span>
        </span>
        <span className={G.trail}>
          <span className="max-w-32 text-right">
            <span className="block font-mono text-label font-semibold tabular-nums [overflow-wrap:anywhere]">
              {unknown(item) || item.confidence === 'unavailable' ? '—' : item.qtyText}
            </span>
            <span className="mt-1 block text-caption">
              {unknown(item) ? (
                'Not counted'
              ) : item.confidence === 'unavailable' ? (
                'Unavailable'
              ) : (
                <>
                  <StatusWord status={item.status} />
                  {item.confidence === 'recorded' ? ' · recorded, not counted' : null}
                </>
              )}
            </span>
          </span>
          <span aria-hidden="true" className={G.chev}>
            ›
          </span>
        </span>
      </button>
    </li>
  );
}

function InventoryList({
  stock,
  category,
  filter,
  setCategory,
  setFilter,
  catalogueHeld
}: {
  stock: LiveStockVals;
  category: string;
  filter: Filter;
  setCategory: (category: string) => void;
  setFilter: (filter: Filter) => void;
  catalogueHeld?: boolean;
}) {
  const active = stock.items.filter((item) => item.active);
  const categories = [
    ...new Set(['Ingredients', 'Packaging', ...active.map((item) => item.category)]),
    ...MADE_CATEGORIES
  ];
  const items = active.filter((item) => item.category === category);
  // Never counted is unknown, not out.
  const shown =
    filter === 'All'
      ? items
      : filter === 'Unknown count'
        ? items.filter(unknown)
        : items.filter((item) => item.status === filter && known(item));
  const made = MADE_CATEGORIES.includes(category);
  const counts = {
    out: items.filter((item) => item.status === 'Out' && known(item)).length,
    low: items.filter((item) => item.status === 'Low' && known(item)).length,
    ok: items.filter((item) => item.status === 'Good' && known(item)).length,
    unknown: items.filter(unknown).length
  };
  const parts: SplitPart[] = [
    { id: 'out', label: 'Out', value: counts.out, tone: 'bg-danger' },
    { id: 'low', label: 'Low', value: counts.low, tone: 'bg-warn-dot' },
    { id: 'ok', label: 'In stock', value: counts.ok, tone: 'bg-ok' },
    { id: 'unknown', label: 'Unknown count', value: counts.unknown, tone: 'bg-ink-faint' }
  ];
  return (
    <>
      <div role="group" aria-label="Stock categories" className={G.chips}>
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            className={G.chip}
            onClick={() => setCategory(name)}
          >
            {CATEGORY_WORDS[name] ?? name}
          </button>
        ))}
      </div>
      {made ? (
        <GlassCard title={CATEGORY_WORDS[category] ?? category}>
          <MadeList stock={stock} category={category} catalogueHeld={catalogueHeld} />
        </GlassCard>
      ) : null}
      <div hidden={made} className={G.stack}>
        <GlassCard title="Stock health">
          {items.length ? <SplitBar parts={parts} /> : null}
          <div role="group" aria-label="Stock counts" className="flex flex-col gap-3">
            <span className="text-caption text-ink-mute">
              {items.length === 1 ? '1 item' : `${items.length} items`}
            </span>
            <div className={G.tiles}>
              {parts.map((part) => (
                <Tile key={part.id} label={part.label} tone={part.tone}>
                  {part.value}
                </Tile>
              ))}
            </div>
          </div>
        </GlassCard>
        <GlassCard
          title={CATEGORY_WORDS[category] ?? category}
          action={
            <div className={G.headTools}>
              {stock.startCount && !stock.count && !made ? (
                <Button
                  onClick={() => stock.startCount?.(category)}
                  disabled={!stock.items.some((item) => item.active && item.category === category)}
                  reason={`Add an item to ${category.toLowerCase()} before counting.`}
                >
                  Count stock
                </Button>
              ) : null}
              <label className={styles.filter}>
                Stock status
                <select
                  aria-label="Stock status"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as Filter)}
                >
                  {FILTERS.map((name) => (
                    <option key={name} value={name}>
                      {name === 'All' ? 'All statuses' : name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        >
          {made ? null : active.length === 0 ? (
            <p className={styles.empty}>No items yet</p>
          ) : shown.length === 0 ? (
            <p className={styles.empty}>No items in this view.</p>
          ) : (
            <ul aria-label="Stock items" className={G.rows}>
              {shown.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </>
  );
}

function MovementRow({ move }: { move: StockMovementView }) {
  return (
    <li className={styles.movement}>
      <div className={styles.historyRow}>
        <strong>{KIND_WORD[move.kind]}</strong>
        <strong className={styles.movementAmount}>{move.changeText}</strong>
      </div>
      {move.costText !== null ? <span>{move.costText}</span> : null}
      {move.supplier ? <span className={styles.note}>{move.supplier}</span> : null}
      {move.reason ? <span className={styles.note}>{move.reason}</span> : null}
      <time dateTime={new Date(move.at).toISOString()} className={styles.note}>
        {manilaStamp(move.at)}
      </time>
    </li>
  );
}

function Movements({ page }: { page: StockItemPage }) {
  let body: React.ReactNode;
  if (page.movementsState === 'loading')
    body = (
      <p role="status" aria-live="polite" className={styles.historyState}>
        Loading stock history…
      </p>
    );
  else if (page.movementsState === 'unavailable')
    body = (
      <div className={styles.historyState}>
        <p>Stock history is unavailable.</p>
        {page.retry ? <Button onClick={page.retry}>Retry history</Button> : null}
      </div>
    );
  else if (page.movements.length === 0)
    body = <p className={styles.historyState}>No stock changes recorded yet.</p>;
  else
    body = (
      <ul aria-label="Stock history" className={styles.historyList}>
        {page.movements.map((move) => (
          <MovementRow key={move.id} move={move} />
        ))}
      </ul>
    );
  return (
    <section aria-labelledby="stock-movements" className={styles.history}>
      <h2 id="stock-movements">Stock history</h2>
      {body}
    </section>
  );
}

function ItemPage({ stock, page }: { stock: LiveStockVals; page: StockItemPage }) {
  const pricesButtonId = useId();
  const wasPricesOpen = useRef(false);
  useEffect(() => {
    if (wasPricesOpen.current && !page.pricesOpen) document.getElementById(pricesButtonId)?.focus();
    wasPricesOpen.current = page.pricesOpen === true;
  }, [page.pricesOpen, pricesButtonId]);
  if (page.pricesOpen) return <ItemPrices page={page} />;
  const item = page.item;
  const facts: Array<readonly [string, string]> = [
    ['Pack', item.packText],
    ['Reorder level', item.levelText],
    ['Cost per unit', item.costText],
    ['Supplier', item.supplier]
  ];
  if (item.lastPaidText !== null) facts.push(['Latest purchase', item.lastPaidText]);
  return (
    <>
      <header className={styles.title}>
        <div>
          <h1>{item.name}</h1>
          <p className={styles.subtitle}>{item.category}</p>
        </div>
        <Button onClick={item.edit}>Edit item</Button>
      </header>
      <OfflineLine online={stock.online} />
      {!item.active ? (
        <p className={styles.note} role="status">
          This item is archived. Edit item to make it active again.
        </p>
      ) : null}
      <section aria-label="Item facts" className={styles.itemPanel}>
        <div className={styles.itemSummary}>
          <div>
            {item.active ? (
              unknown(item) ? (
                <span className={styles.note}>Not counted</span>
              ) : item.confidence === 'unavailable' ? (
                <span className={styles.note}>Unavailable</span>
              ) : (
                <>
                  <StatusWord status={item.status} />
                  {item.confidence === 'recorded' ? ' · recorded, not counted' : null}
                </>
              )
            ) : (
              <span className={styles.note}>Archived</span>
            )}
            <p className={styles.balance}>{known(item) ? item.qtyText : '—'}</p>
            <p className={styles.note}>
              {known(item) ? 'Recorded on hand · ' : ''}
              {item.lastCountedText}
            </p>
          </div>
          {item.active ? (
            <div aria-label="Item actions" className={styles.actions}>
              <Button variant="primary" onClick={item.receive}>
                Add to inventory
              </Button>
              <Button onClick={item.count}>Count</Button>
              <Button onClick={item.adjust}>Waste / correction</Button>
            </div>
          ) : null}
        </div>
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {page.openPrices ? (
          <Button id={pricesButtonId} className="self-start" onClick={page.openPrices}>
            Supplier prices & history
          </Button>
        ) : null}
      </section>
      <Movements page={page} />
    </>
  );
}

/** The live owner's inventory: list filters stay mounted while an item or count is open. */
export function InventoryLive({ v }: { v: OpsVals }) {
  const [category, setCategory] = useState('Ingredients');
  const [filter, setFilter] = useState<Filter>('All');
  const stock = liveStockOf(v);
  const settings = useAreaSettings(
    v,
    'stock',
    'Back to inventory',
    stock?.manageItems ? (
      <Panel>
        <OpenRow
          title="Manage inventory items"
          detail="What you keep in stock, its unit and reorder level"
          onOpen={stock.manageItems}
        />
      </Panel>
    ) : null
  );
  if (stock?.count && !stock.count.paused)
    return (
      <SubPage>
        <CountInventory v={v} stock={stock} />
      </SubPage>
    );
  if (stock?.receive)
    return (
      <SubPage>
        <ReceiveLive receive={stock.receive} />
      </SubPage>
    );
  if (stock?.change)
    return (
      <SubPage>
        <StockChangeLive change={stock.change} />
      </SubPage>
    );
  if (settings.page) return <SubPage>{settings.page}</SubPage>;
  const resume = stock?.count?.paused ? (
    <Button onClick={stock.count.resume}>
      {stock.count.pending ? 'Review unconfirmed count' : 'Continue count'}
    </Button>
  ) : null;
  if (stock?.page)
    return (
      <SubPage>
        <section aria-label="Inventory" data-screen-label="Inventory" className={styles.screen}>
          <StockReadNotice read={v.liveStockRead} />
          {resume}
          <ItemPage key={stock.page.item.id} stock={stock} page={stock.page} />
        </section>
      </SubPage>
    );
  return (
    <section aria-label="Inventory" data-screen-label="Inventory" className={G.page}>
      <div>
        <PageTitle
          onGround
          title="Inventory"
          subtitle="Ingredients, packaging, dough and baked cookies."
          actions={
            <>
              {stock?.openReceive ? (
                <Button variant="primary" onClick={() => stock.openReceive?.()}>
                  Add to inventory
                </Button>
              ) : null}
              {stock?.addItem ? <Button onClick={stock.addItem}>New item</Button> : null}
              <Button variant="secondary" onClick={settings.open}>
                Settings
              </Button>
            </>
          }
        />
        <SectionNavigation v={v} refined tools={false} onGround />
      </div>
      <Notice>
        <StockReadNotice read={v.liveStockRead} />
      </Notice>
      {resume ? <Notice>{resume}</Notice> : null}
      {stock ? (
        <>
          <Notice>
            <OfflineLine online={stock.online} />
          </Notice>
          <InventoryList
            stock={stock}
            category={category}
            filter={filter}
            setCategory={setCategory}
            setFilter={setFilter}
            catalogueHeld={v.catalogueHeld}
          />
        </>
      ) : !v.liveStockRead ? (
        <Notice>
          <p role="status">Stock is loading.</p>
        </Notice>
      ) : null}
    </section>
  );
}
InventoryLive.ownsSectionNavigation = true;
