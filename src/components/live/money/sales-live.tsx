'use client';

import type { OpsVals } from '@/view-models/vals';
import { saleLines, saleName } from '@/lib/bazaar/sale-lines';
import { HeadedPanel } from '@/components/ui/owner-kit';
import { BooksNotLoaded, BooksRefreshNotice } from './books-read-notice';

/** One recorded sale: its cookies as tags, never a comma list, and a readable name when it has no cookies to list. */
function SaleLog({ row }: { row: OpsVals['salesLog']['rows'][number] }) {
  const lines = saleLines(String(row.what ?? ''));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-divide px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-wrap gap-1.5">
        {lines.length ? (
          lines.map((line, i) => (
            <span
              key={i}
              className="inline-flex max-w-full items-baseline gap-1 rounded-tag bg-owner-soft px-2 py-0.5 text-caption text-ink"
            >
              <span className="font-semibold tabular-nums">{line.qty}×</span>{' '}
              <span className="min-w-0">{line.name}</span>
            </span>
          ))
        ) : (
          <span className="text-[14px] text-ink">{saleName(row.what)}</span>
        )}
      </span>
      <span className="text-right text-[15px] font-semibold text-ink tabular-nums">
        {row.amount}
      </span>
      <span className="col-span-2 text-caption text-ink-mute">{row.when}</span>
    </li>
  );
}

/** Money's sales: every recorded sale, newest first, the engine's figures unchanged. */
export function SalesLive({ v }: { v: OpsVals }) {
  const log = v.salesLog;
  const books = v.liveBooksRead;
  // Live: the log is the books plus this phone's event sales. Until the books are read, any count
  // or "none yet" would read as the whole log, so say so and list nothing (event sales included).
  if (books && !books.loaded)
    return (
      <div className="w-full">
        <BooksNotLoaded read={books.read} />
      </div>
    );
  return (
    <div className="w-full">
      {books ? <BooksRefreshNotice read={books.read} /> : null}
      <HeadedPanel title={`${(log.rows ?? []).length} ${String(log.unit)}`}>
        {log.empty ? (
          <p className="px-4 py-3 text-caption text-ink-mute">No sales recorded yet.</p>
        ) : (
          <ul>
            {(log.rows ?? []).map((row, i) => (
              <SaleLog key={i} row={row} />
            ))}
          </ul>
        )}
      </HeadedPanel>
    </div>
  );
}
