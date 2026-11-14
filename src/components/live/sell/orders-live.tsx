'use client';

import { useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { HeadedPanel, PageTitle, Panel } from '@/components/ui/owner-kit';
import { isLiveMode } from '@/lib/config/app-mode';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { orderActionWord, orderStatusWord } from '@/lib/orders/owner-words';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { readAtText } from '@/lib/time/read-at-text';
import { OrderPill, SellSettings, SellTabs, SellTools } from './sell-shared';

type Row = OpsVals['orderList'][number];

/** The reference's groups, work first. Every row still shows its own status word. */
const GROUP_ORDER = [
  'To prepare',
  'Ready for customer pickup',
  'Payments & other orders',
  'Closed'
] as const;
type GroupName = (typeof GROUP_ORDER)[number];

const groupOf = (order: Row): GroupName => {
  const word = String(order.label).toLowerCase();
  if (word.includes('paid') && !word.includes('unpaid')) return 'To prepare';
  if (word.includes('bak') || word.includes('prepar') || word.includes('confirm'))
    return 'To prepare';
  if (word.includes('ready')) return 'Ready for customer pickup';
  if (word.includes('complete') || word.includes('collect') || word.includes('cancel'))
    return 'Closed';
  return 'Payments & other orders';
};

/** One order. The row opens it; a button stays only for a next step that changes the order. */
function OrderRow({ order }: { order: Row }) {
  const next = order.review ? '' : orderActionWord(order.action);
  return (
    <div className="flex flex-wrap items-center gap-x-3 border-b border-divide pr-4 last:border-b-0 hover:bg-raise">
      <button
        type="button"
        onClick={order.go}
        className="flex min-h-16 min-w-0 flex-1 basis-56 flex-col gap-1 py-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-semibold text-ink">{order.name}</span>
          <span className="text-caption text-ink-mute">{order.id}</span>
          <span className="ml-auto text-[15px] font-semibold text-ink tabular-nums">
            {order.totalText}
          </span>
        </span>
        <span className="text-caption text-ink-mute">{order.summary}</span>
        <span className="flex flex-wrap items-center gap-2 text-caption text-ink-mute">
          <OrderPill label={order.label} fg={order.fg} bg={order.bg} br={order.br} />
          <span>
            {order.pickup} · {order.count}
          </span>
        </span>
        {order.warn ? <span className="text-caption text-danger">{order.warn}</span> : null}
      </button>
      {next ? (
        <Button variant="secondary" size="sm" onClick={order.act}>
          {next}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Orders (client v4): what needs doing first, grouped by stage. Filters, search, the drop's
 * flavour tally and the quick next action are the existing engine values, unchanged.
 */
export function OrdersLive({ v }: { v: OpsVals }) {
  const orders = v.orderList ?? [];
  const ordered = GROUP_ORDER.map(
    (name) => [name, orders.filter((order) => groupOf(order) === name)] as const
  ).filter(([, rows]) => rows.length > 0);
  const review = v.orderFilters?.find((filter) => filter.label === 'To review');
  // HCB-002a: what the order read has achieved. Until a read has answered, nothing is listed or
  // counted, so no empty result, zero count or tally is shown for data that was never read.
  const read = useSyncExternalStore(ordersRead.subscribe, ordersRead.get, ordersRead.getServer);
  const notRead =
    read.phase === 'loading' || (read.phase === 'idle' && isLiveMode() && !!v.ownerView);
  const failedFirst = read.phase === 'failed' && !read.everRead;
  const stale = read.phase === 'failed' && read.everRead && read.readAt !== null;
  const retry = read.retry ? { label: 'Try again', onPress: read.retry } : undefined;
  const header = (
    <>
      <PageTitle
        title="Orders"
        subtitle="Pack each order and see what is ready for customer pickup."
        actions={
          <>
            <SellTools v={v} />
            <SellSettings v={v} />
          </>
        }
      />
      <SellTabs v={v} />
    </>
  );
  if (notRead || failedFirst)
    return (
      <div className="w-full">
        {header}
        {failedFirst ? (
          <Banner tone="warn" title={STAFF_COPY.ordersReadFailed} action={retry} />
        ) : (
          <Panel>
            <p role="status" className="text-[15px] text-ink">
              {STAFF_COPY.ordersNotRead}
            </p>
          </Panel>
        )}
      </div>
    );
  return (
    <div className="w-full">
      {header}
      {stale ? (
        <div className="mb-4">
          <Banner
            tone="warn"
            title={STAFF_COPY.ordersStale(readAtText(read.readAt as number))}
            action={retry}
          />
        </div>
      ) : null}
      {read.dropped > 0 ? (
        <div className="mb-4">
          <Banner tone="warn" title={STAFF_COPY.ordersDropped(read.dropped)} />
        </div>
      ) : null}
      {v.reviewHasWork ? (
        <div className="mb-4">
          <Banner
            tone="warn"
            title={v.reviewCountText}
            body={v.reviewDetail}
            action={review ? { label: 'Show them', onPress: () => review.go() } : undefined}
          />
        </div>
      ) : null}
      <div role="group" aria-label="Show orders" className="mb-3 flex flex-wrap gap-2">
        {(v.orderFilters ?? []).map((filter) => (
          <button
            key={String(filter.label)}
            type="button"
            aria-pressed={!!filter.active}
            onClick={filter.go}
            className={cx(
              'min-h-10 rounded-full border px-3.5 text-caption font-semibold transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-brand',
              filter.active
                ? 'border-ink bg-ink text-surface'
                : 'border-line-strong bg-surface text-ink hover:bg-raise'
            )}
          >
            {orderStatusWord(filter.label)} <span className="tabular-nums">{filter.n}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="search"
          value={v.orderQ}
          onChange={v.setOrderQ}
          aria-label="Search orders"
          placeholder="Search name, order number or reference"
          className="h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]"
        />
        {v.hasOrderQ ? (
          <Button variant="ghost" size="sm" onClick={v.clearOrderQ}>
            Clear
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-4">
        {v.orderEmpty && read.dropped === 0 ? (
          <Panel>
            <p className="text-[15px] font-semibold text-ink">No orders match this filter</p>
            <p className="text-caption text-ink-mute">Try another filter, or clear the search.</p>
          </Panel>
        ) : null}
        {ordered.map(([label, rows]) => (
          <HeadedPanel key={label} title={`${label} (${rows.length})`}>
            {rows.map((order) => (
              <OrderRow key={String(order.id)} order={order} />
            ))}
          </HeadedPanel>
        ))}
      </div>

      {v.flavourTally?.length ? (
        <Panel title="Ordered this drop, all customers">
          <p className="mb-2 text-caption text-ink-mute">{v.flavourTallyTotal}</p>
          <ul className="flex flex-wrap gap-2">
            {v.flavourTally.map((flavour, i) => (
              <li
                key={i}
                className="rounded-full border border-line px-3 py-1 text-caption text-ink"
              >
                <span className="font-semibold tabular-nums">{flavour.qtyText}</span> {flavour.name}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
