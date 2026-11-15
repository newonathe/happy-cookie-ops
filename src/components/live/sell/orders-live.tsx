'use client';

import { useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { PANEL_CLASS, PageTitle, Panel } from '@/components/ui/owner-kit';
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

/** The status dot of a pipeline column (wide screens only). */
const GROUP_DOT: Record<GroupName, string> = {
  'To prepare': 'bg-warn-dot',
  'Ready for customer pickup': 'bg-ok',
  'Payments & other orders': 'bg-brand',
  Closed: 'bg-ink-mute'
};

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

/**
 * One order. The row opens it; a button stays only for a next step that changes the order.
 * Below `lg` it is a list row; from `lg` the same markup is an inset card in a pipeline column.
 */
function OrderRow({ order }: { order: Row }) {
  const next = order.review ? '' : orderActionWord(order.action);
  return (
    <div className="flex flex-wrap items-center gap-x-3 border-b border-divide pr-4 last:border-b-0 hover:bg-raise lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-x-0 lg:rounded-2xl lg:border lg:border-owner-line lg:bg-owner-raise lg:p-3.5 lg:last:border-b">
      <button
        type="button"
        onClick={order.go}
        className="flex min-h-16 min-w-0 flex-1 basis-56 flex-col gap-1 py-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand lg:flex-none lg:basis-auto lg:p-0"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-body font-semibold text-ink">{order.name}</span>
          <span className="text-caption text-ink-mute">{order.id}</span>
          <span className="ml-auto text-body font-semibold text-ink">{order.totalText}</span>
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
        <Button
          variant="secondary"
          size="sm"
          onClick={order.act}
          className="lg:mt-2 lg:self-end lg:whitespace-nowrap"
        >
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
  // Every group is kept: an empty one is hidden on a phone and stays a column from `lg`.
  const ordered = GROUP_ORDER.map(
    (name) => [name, orders.filter((order) => groupOf(order) === name)] as const
  );
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
            <p role="status" className="text-body text-ink">
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
              'min-h-11 rounded-full border px-3.5 text-caption font-semibold transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-brand',
              filter.active
                ? 'border-ink bg-ink text-surface'
                : 'border-line-strong bg-surface text-ink hover:bg-raise'
            )}
          >
            {orderStatusWord(filter.label)} <span>{filter.n}</span>
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
          className="h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-label"
        />
        {v.hasOrderQ ? (
          <Button variant="ghost" size="sm" onClick={v.clearOrderQ}>
            Clear
          </Button>
        ) : null}
      </div>

      {v.orderEmpty && read.dropped === 0 ? (
        <div className="mb-4">
          <Panel>
            <p className="text-body font-semibold text-ink">No orders match this filter</p>
            <p className="text-caption text-ink-mute">Try another filter, or clear the search.</p>
          </Panel>
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-4 lg:grid lg:auto-cols-[minmax(250px,1fr)] lg:grid-flow-col lg:items-start lg:gap-6 lg:overflow-x-auto">
        {ordered.map(([label, rows]) => (
          <section
            key={label}
            aria-label={`${label} (${rows.length})`}
            className={cx(
              PANEL_CLASS,
              'min-w-0',
              rows.length === 0 && 'hidden lg:block',
              'lg:overflow-visible lg:rounded-[24px] lg:border-owner-line lg:bg-owner-glass lg:p-4 lg:shadow-owner-glass'
            )}
          >
            <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 border-b border-divide px-4 py-1 lg:min-h-0 lg:flex-nowrap lg:gap-x-2 lg:border-b-0 lg:px-1 lg:pt-0 lg:pb-3">
              <span
                aria-hidden="true"
                className={cx('hidden size-2 shrink-0 rounded-full lg:block', GROUP_DOT[label])}
              />
              <h2 className="text-body font-semibold text-ink lg:text-heading">
                {`${label} (${rows.length})`}
              </h2>
            </div>
            <div className="lg:flex lg:flex-col lg:gap-3">
              {rows.length === 0 ? (
                <p className="px-1 py-2 text-caption text-ink-mute">Nothing here</p>
              ) : (
                rows.map((order) => <OrderRow key={String(order.id)} order={order} />)
              )}
            </div>
          </section>
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
                <span className="font-semibold">{flavour.qtyText}</span> {flavour.name}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
