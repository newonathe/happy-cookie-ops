'use client';

import { useState } from 'react';
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
import {
  Facts,
  OfflineLine,
  StatusWord,
  buttonBase,
  cardStyle,
  h1Style,
  h2Style,
  INK,
  listStyle,
  liveStockOf,
  manilaStamp,
  mutedStyle,
  screenStyle,
  textStyle,
  wrapRow
} from './stock-shared';
import { CountInventory } from './count-inventory';
import { Button } from '@/components/ui/button';
import { SectionTools } from '@/components/live/section-tools';
import { SectionNavigation } from '@/components/live/section-navigation';
import styles from './inventory.module.css';

type Filter = 'All' | StockStatus;
const FILTERS: readonly Filter[] = ['All', 'Out', 'Low', 'Good'];

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
  return <p style={{ ...mutedStyle, color: INK }}>About counts: {text}</p>;
}

function ItemRow({ item }: { item: StockItemView }) {
  return (
    <li>
      <button type="button" onClick={item.open} className={styles.row}>
        <span>
          <strong className={styles.name}>{item.name}</strong>
          <span className={styles.detail}>{item.packText}</span>
          <span className={styles.detail}>
            {item.lastCountedText} · {item.costText}
          </span>
        </span>
        <span className={styles.amount}>
          {item.qtyText}
          <span className={styles.status}>
            <StatusWord status={item.status} />
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
    ...new Set(['Ingredients', 'Packaging', ...active.map((item) => item.category)])
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
      <div className={styles.toolbar}>
        <div role="group" aria-label="Stock counts" className={styles.counts}>
          <span>{items.length === 1 ? '1 item' : `${items.length} items`}</span>
          <span>{items.filter((item) => item.status === 'Out').length} Out</span>
          <span>{items.filter((item) => item.status === 'Low').length} Low</span>
        </div>
        <label className={styles.filter}>
          Stock status
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            {FILTERS.map((name) => (
              <option key={name} value={name}>
                {name === 'All' ? 'All statuses' : name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CountNote text={stock.countNote} />
      {active.length === 0 ? (
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
    <li style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ ...wrapRow, justifyContent: 'space-between' }}>
        <span style={{ ...textStyle, fontWeight: 700 }}>{KIND_WORD[move.kind]}</span>
        <span style={{ ...textStyle, fontWeight: 600 }}>{move.changeText}</span>
      </span>
      {move.costText !== null ? <span style={textStyle}>{move.costText}</span> : null}
      {move.supplier ? <span style={mutedStyle}>{move.supplier}</span> : null}
      {move.reason ? <span style={mutedStyle}>{move.reason}</span> : null}
      <time dateTime={new Date(move.at).toISOString()} style={mutedStyle}>
        {manilaStamp(move.at)}
      </time>
    </li>
  );
}

function Movements({ page }: { page: StockItemPage }) {
  let body: React.ReactNode;
  if (page.movementsState === 'loading')
    body = (
      <p aria-live="polite" style={mutedStyle}>
        Loading movements…
      </p>
    );
  else if (page.movementsState === 'unavailable')
    body = <p style={mutedStyle}>Movements are not available yet.</p>;
  else if (page.movements.length === 0) body = <p style={mutedStyle}>No movements yet.</p>;
  else
    body = (
      <ul aria-label="Movements" style={listStyle}>
        {page.movements.map((m) => (
          <MovementRow key={m.id} move={m} />
        ))}
      </ul>
    );
  return (
    <section aria-labelledby="stock-movements" style={{ ...screenStyle, gap: '8px' }}>
      <h2 id="stock-movements" style={h2Style}>
        Movements
      </h2>
      {body}
    </section>
  );
}

function ItemPage({ stock, page }: { stock: LiveStockVals; page: StockItemPage }) {
  const item = page.item;
  const facts: Array<readonly [string, string]> = [
    ['On hand', item.qtyText],
    ['Level', item.levelText],
    ['Last counted', item.lastCountedText],
    ['Cost', item.costText],
    ['Supplier', item.supplier]
  ];
  if (item.lastPaidText !== null) facts.push(['Last paid', item.lastPaidText]);
  const actions: Array<readonly [string, () => void]> = [
    ['Receive', item.receive],
    ['Count', item.count],
    ['Waste', item.waste],
    ['Adjust', item.adjust],
    ['Edit', item.edit]
  ];
  return (
    <>
      <button
        type="button"
        onClick={page.close}
        style={{ ...buttonBase, alignSelf: 'flex-start', minHeight: '44px' }}
      >
        <span aria-hidden="true">← </span>Back to all items
      </button>
      <h1 style={h1Style}>{item.name}</h1>
      <OfflineLine online={stock.online} />
      <section aria-label="Item facts" style={cardStyle}>
        <p style={{ margin: '0 0 8px' }}>
          <span style={{ ...textStyle, marginRight: '8px' }}>Status</span>
          <StatusWord status={item.status} />
        </p>
        <Facts rows={facts} />
      </section>
      <CountNote text={stock.countNote} />
      <section
        aria-label="Item actions"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}
      >
        {actions.map(([label, run]) => (
          <button key={label} type="button" onClick={run} style={buttonBase}>
            {label}
          </button>
        ))}
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
  if (stock?.count && !stock.count.paused) return <CountInventory v={v} stock={stock} />;
  return (
    <section aria-label="Inventory" data-screen-label="Inventory" className={styles.screen}>
      {stock?.count?.paused ? (
        <Button onClick={stock.count.resume}>
          {stock.count.pending ? 'Review unconfirmed count' : 'Continue count'}
        </Button>
      ) : null}
      {stock?.page ? (
        <ItemPage stock={stock} page={stock.page} />
      ) : (
        <>
          <header className={styles.title}>
            <div>
              <h1>Inventory</h1>
              <p className={styles.subtitle}>Ingredients and packaging.</p>
            </div>
            <div className={styles.actions}>
              {stock?.addItem ? (
                <Button variant="primary" size="sm" onClick={stock.addItem}>
                  Add to inventory
                </Button>
              ) : null}
              {stock?.manageItems ? (
                <SectionTools
                  label="Inventory settings"
                  items={[
                    {
                      id: 'manage-items',
                      label: 'Manage inventory items',
                      active: false,
                      badge: null,
                      go: stock.manageItems
                    }
                  ]}
                />
              ) : null}
            </div>
          </header>
          <SectionNavigation v={v} refined />
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
            <p style={mutedStyle} role="status">
              Stock is loading.
            </p>
          )}
        </>
      )}
    </section>
  );
}
InventoryLive.ownsSectionNavigation = true;
