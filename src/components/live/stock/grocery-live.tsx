'use client';

import type { OpsVals } from '@/view-models/vals';
import type { GroceryRowView, GroceryView } from '@/lib/stock/live-stock-types';
import {
  Facts,
  OfflineLine,
  StatusWord,
  StockLoading,
  cardStyle,
  h1Style,
  h2Style,
  listStyle,
  liveStockOf,
  mutedStyle,
  primaryBase,
  screenStyle,
  textStyle,
  wrapRow
} from './stock-shared';

function GroceryRow({ row }: { row: GroceryRowView }) {
  return (
    <li style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ ...wrapRow, justifyContent: 'space-between' }}>
        <span style={{ ...textStyle, fontWeight: 700 }}>{row.name}</span>
        <StatusWord status={row.status} />
      </span>
      <Facts
        rows={[
          ['Have', row.haveText],
          ['Needed', row.neededText],
          ['To buy', row.toBuyText],
          ['Pack', row.packText],
          ['Best price', row.bestPriceText],
          ['Supplier', row.supplier],
          ['Line cost', row.lineCostText]
        ]}
      />
      <button
        type="button"
        onClick={row.bought}
        aria-label={`I bought these: ${row.name}`}
        style={{ ...primaryBase, alignSelf: 'flex-start' }}
      >
        I bought these
      </button>
    </li>
  );
}

function Totals({ grocery }: { grocery: GroceryView }) {
  const rows: Array<readonly [string, string]> = [['Running total', grocery.totalText]];
  // No budget set: nothing about a budget is drawn (Ethan, 13 October). The word "over" or "left" comes in the text.
  if (grocery.budgetText !== null) {
    rows.push(['Budget', grocery.budgetText]);
    if (grocery.budgetNoteText !== null) rows.push(['Against budget', grocery.budgetNoteText]);
  }
  return (
    <section aria-label="Totals" style={cardStyle}>
      <h2 style={{ ...h2Style, marginBottom: '8px' }}>Totals</h2>
      <Facts rows={rows} />
    </section>
  );
}

/** The live owner's Grocery list (B5): what is Out or Low, what to buy and what it costs. It computes nothing. */
export function GroceryLive({ v }: { v: OpsVals }) {
  const stock = liveStockOf(v);
  if (!stock) return <StockLoading title="Grocery list" label="Grocery list" />;
  const { grocery } = stock;
  return (
    <section aria-label="Grocery list" data-screen-label="Grocery list" style={screenStyle}>
      <h1 style={h1Style}>Grocery list</h1>
      <OfflineLine online={stock.online} />
      {grocery.rows.length === 0 ? (
        <p style={mutedStyle}>Nothing to buy. Everything is Good.</p>
      ) : (
        <ul aria-label="Things to buy" style={listStyle}>
          {grocery.rows.map((row) => (
            <GroceryRow key={row.itemId} row={row} />
          ))}
        </ul>
      )}
      <Totals grocery={grocery} />
    </section>
  );
}
