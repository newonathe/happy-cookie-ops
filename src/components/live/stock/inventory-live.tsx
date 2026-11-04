'use client';

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
import styles from './inventory.module.css';

type Filter = 'All' | StockStatus;
const FILTERS: readonly Filter[] = ['All', 'Out', 'Low', 'Good'];
const MADE_CATEGORIES = ['Dough', 'Baked stock'];

/** Dough and baked cookies by product: read from production, changed only by production and waste. */
function MadeList({ stock, category }: { stock: LiveStockVals; category: string }) {
  const rows = category === 'Dough' ? stock.made?.dough : stock.made?.baked;
  if (!rows) return <p className={styles.empty}>Production has not been read yet.</p>;
  return (
    <ul aria-label={category} className={styles.panel}>
      {rows.map((row) => (
        <li key={row.id} className={styles.madeRow}>
          <strong className={styles.name}>{row.name}</strong>
          <span className={styles.amount}>{row.qtyText}</span>
        </li>
      ))}
    </ul>
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

function CountNote({ text }: { text: string | null }) {
  if (text === null) return null;
  return <p className={styles.note}>About counts: {text}</p>;
}

function ItemRow({ item }: { item: StockItemView }) {
  return (
    <li>
      <button type="button" onClick={item.open} className={styles.row}>
        <span>
          <strong className={styles.name}>{item.name}</strong>
          <span className={styles.detail}>
            {item.packText}
            {item.costText.startsWith('Cost pending') ? ` · ${item.costText}` : ''}
          </span>
        </span>
        <span className={styles.amount}>
          {item.qtyText}
          <span className={styles.status}>
            {item.counted === false ? 'Not counted' : <StatusWord status={item.status} />}
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
  setFilter
}: {
  stock: LiveStockVals;
  category: string;
  filter: Filter;
  setCategory: (category: string) => void;
  setFilter: (filter: Filter) => void;
}) {
  const active = stock.items.filter((item) => item.active);
  const categories = [
    ...new Set(['Ingredients', 'Packaging', ...active.map((item) => item.category)]),
    ...MADE_CATEGORIES
  ];
  const items = active.filter((item) => item.category === category);
  const shown = filter === 'All' ? items : items.filter((item) => item.status === filter);
  return (
    <>
      <div role="group" aria-label="Stock categories" className={styles.categories}>
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {MADE_CATEGORIES.includes(category) ? <MadeList stock={stock} category={category} /> : null}
      <div hidden={MADE_CATEGORIES.includes(category)} className={styles.toolbar}>
        <div role="group" aria-label="Stock counts" className={styles.counts}>
          <span>{items.length === 1 ? '1 item' : `${items.length} items`}</span>
          <span>{items.filter((item) => item.status === 'Out').length} Out</span>
          <span>{items.filter((item) => item.status === 'Low').length} Low</span>
        </div>
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
      <CountNote text={stock.countNote} />
      {MADE_CATEGORIES.includes(category) ? null : active.length === 0 ? (
        <p className={styles.empty}>No items yet</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>No items in this view.</p>
      ) : (
        <ul aria-label="Stock items" className={styles.panel}>
          {shown.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
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
      <Button variant="ghost" className="self-start" onClick={page.close}>
        <span aria-hidden="true">←</span>Back to inventory
      </Button>
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
      <CountNote text={stock.countNote} />
      <section aria-label="Item facts" className={styles.itemPanel}>
        <div className={styles.itemSummary}>
          <div>
            {item.active ? (
              <StatusWord status={item.status} />
            ) : (
              <span className={styles.note}>Archived</span>
            )}
            <p className={styles.balance}>{item.qtyText}</p>
            <p className={styles.note}>Recorded on hand · {item.lastCountedText}</p>
          </div>
          {item.active ? (
            <div aria-label="Item actions" className={styles.actions}>
              <Button variant="primary" onClick={item.receive}>
                Receive
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
  if (stock?.count && !stock.count.paused) return <CountInventory v={v} stock={stock} />;
  if (stock?.receive) return <ReceiveLive receive={stock.receive} />;
  if (stock?.change) return <StockChangeLive change={stock.change} />;
  if (settings.page) return settings.page;
  return (
    <section aria-label="Inventory" data-screen-label="Inventory" className={styles.screen}>
      {stock?.count?.paused ? (
        <Button onClick={stock.count.resume}>
          {stock.count.pending ? 'Review unconfirmed count' : 'Continue count'}
        </Button>
      ) : null}
      {stock?.page ? (
        <ItemPage key={stock.page.item.id} stock={stock} page={stock.page} />
      ) : (
        <>
          <PageTitle
            title="Inventory"
            subtitle="Ingredients, packaging, dough and baked cookies."
            actions={
              <>
                {stock?.addItem ? (
                  <Button variant="primary" onClick={stock.addItem}>
                    Add to inventory
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={settings.open}>
                  Settings
                </Button>
              </>
            }
          />
          <SectionNavigation v={v} refined tools={false} />
          {stock ? (
            <div className={styles.actions}>
              {stock.openReceive ? (
                <Button onClick={() => stock.openReceive?.()}>Receive delivery</Button>
              ) : null}
              {stock.startCount && !stock.count ? (
                <Button
                  onClick={() => stock.startCount?.(category)}
                  disabled={!stock.items.some((item) => item.active && item.category === category)}
                  reason={`Add an item to ${category.toLowerCase()} before counting.`}
                >
                  Count stock
                </Button>
              ) : null}
            </div>
          ) : null}
          {stock ? (
            <>
              <OfflineLine online={stock.online} />
              <InventoryList
                stock={stock}
                category={category}
                filter={filter}
                setCategory={setCategory}
                setFilter={setFilter}
              />
            </>
          ) : (
            <p className={styles.note} role="status">
              Stock is loading.
            </p>
          )}
        </>
      )}
    </section>
  );
}
InventoryLive.ownsSectionNavigation = true;
