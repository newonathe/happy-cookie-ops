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
  StockLoading,
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

const rowButton: React.CSSProperties = {
  ...cardStyle,
  width: '100%',
  minHeight: '44px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  color: INK
};

function CountNote({ text }: { text: string | null }) {
  if (text === null) return null;
  return <p style={{ ...mutedStyle, color: INK }}>About counts: {text}</p>;
}

function ItemRow({ item }: { item: StockItemView }) {
  return (
    <li>
      <button type="button" onClick={item.open} style={rowButton}>
        <span style={{ ...wrapRow, justifyContent: 'space-between' }}>
          <span style={{ ...textStyle, fontWeight: 700 }}>{item.name}</span>
          <StatusWord status={item.status} />
        </span>
        <span style={{ ...wrapRow }}>
          <span style={textStyle}>{item.qtyText}</span>
          <span style={mutedStyle}>{item.levelText}</span>
        </span>
        <span style={{ ...wrapRow }}>
          <span style={mutedStyle}>{item.lastCountedText}</span>
          <span style={mutedStyle}>{item.costText}</span>
        </span>
      </button>
    </li>
  );
}

function InventoryList({ stock }: { stock: LiveStockVals }) {
  const [filter, setFilter] = useState<Filter>('All');
  const shown = filter === 'All' ? stock.items : stock.items.filter((i) => i.status === filter);
  const { total, out, low } = stock.counts;
  return (
    <>
      <div
        role="group"
        aria-label="Stock counts"
        style={{ ...wrapRow, fontSize: '0.875rem', fontWeight: 600, color: INK }}
      >
        <span>{total === 1 ? '1 item' : `${total} items`}</span>
        <span>{out} Out</span>
        <span>{low} Low</span>
      </div>
      <CountNote text={stock.countNote} />
      <div
        role="group"
        aria-label="Show items"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
      >
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
            style={{
              ...buttonBase,
              minHeight: '44px',
              ...(filter === name
                ? { background: INK, color: '#FFFFFF', border: `1px solid ${INK}` }
                : {})
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {stock.items.length === 0 ? (
        <p style={mutedStyle}>No items yet</p>
      ) : shown.length === 0 ? (
        <p style={mutedStyle}>No items in this view.</p>
      ) : (
        <ul aria-label="Stock items" style={listStyle}>
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

/** The live owner's Inventory (B5): the list with filter chips, and one item's page. It draws what the runtime gives it. */
export function InventoryLive({ v }: { v: OpsVals }) {
  const stock = liveStockOf(v);
  if (!stock) return <StockLoading title="Inventory" label="Inventory" />;
  if (stock.count && !stock.count.paused) return <CountInventory v={v} stock={stock} />;
  return (
    <section aria-label="Inventory" data-screen-label="Inventory" style={screenStyle}>
      {stock.count?.paused ? (
        <Button onClick={stock.count.resume}>
          {stock.count.pending ? 'Review unconfirmed count' : 'Continue count'}
        </Button>
      ) : null}
      {stock.page ? (
        <ItemPage stock={stock} page={stock.page} />
      ) : (
        <>
          <h1 style={h1Style}>Inventory</h1>
          <OfflineLine online={stock.online} />
          <InventoryList stock={stock} />
        </>
      )}
    </section>
  );
}
