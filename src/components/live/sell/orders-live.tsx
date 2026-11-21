'use client';

import { useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { SplitBar, glassStyles, type SplitPart } from '@/components/ui/glass';
import { PageTitle } from '@/components/ui/owner-kit';
import { Notice, Tile, stockGlass } from '@/components/live/stock/stock-glass';
import { isLiveMode } from '@/lib/config/app-mode';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { orderActionWord, orderStatusWord } from '@/lib/orders/owner-words';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { readAtText } from '@/lib/time/read-at-text';
import { OrderPill, SellSettings, SellTabs, SellTools } from './sell-shared';
import sg from './sell-glass.module.css';

type Row = OpsVals['orderList'][number];

/** The reference's groups, work first. Every row still shows its own status word. */
const GROUP_ORDER = [
  'To prepare',
  'Ready for customer pickup',
  'Payments & other orders',
  'Closed'
] as const;
type GroupName = (typeof GROUP_ORDER)[number];

/** The status colour of a stage: its dot on the board and its segment in the summary bar. */
const GROUP_TONE: Record<GroupName, string> = {
  'To prepare': 'bg-warn-dot',
  'Ready for customer pickup': 'bg-ok',
  'Payments & other orders': 'bg-brand',
  Closed: 'bg-ink-faint'
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
 * Below `lg` it is a glass row in its stage card; from `lg` the same markup is a card in a pipeline column.
 */
function OrderRow({ order }: { order: Row }) {
  const next = order.review ? '' : orderActionWord(order.action);
  return (
    <div className={sg.order}>
      <button type="button" onClick={order.go} className={sg.open}>
        <span className={sg.line}>
          <span className="text-body font-semibold text-ink">{order.name}</span>
          <span className="text-caption text-ink-mute">{order.id}</span>
          <span className={cx(sg.total, 'text-body text-ink')}>{order.totalText}</span>
        </span>
        <span className="text-caption text-ink-mute">{order.summary}</span>
        <span className={sg.meta}>
          <OrderPill label={order.label} fg={order.fg} bg={order.bg} br={order.br} />
          <span>
            {order.pickup} · {order.count}
          </span>
        </span>
        {order.warn ? <span className="text-caption text-danger">{order.warn}</span> : null}
      </button>
      {next ? (
        <Button variant="secondary" size="sm" onClick={order.act} className={sg.next}>
          {next}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Orders (client v4, espresso glass): what needs doing first, grouped by stage. Filters, search, the drop's
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
    <div className={sg.head}>
      <PageTitle
        onGround
        title="Orders"
        subtitle="Pack each order and see what is ready for customer pickup."
        actions={
          <>
            <SellTools v={v} />
            <SellSettings v={v} />
          </>
        }
      />
      <SellTabs v={v} onGround />
    </div>
  );
  if (notRead || failedFirst)
    return (
      <div className={sg.page}>
        {header}
        {failedFirst ? (
          <Banner tone="warn" title={STAFF_COPY.ordersReadFailed} action={retry} />
        ) : (
          <Notice>
            <p role="status" className="text-body text-ink">
              {STAFF_COPY.ordersNotRead}
            </p>
          </Notice>
        )}
      </div>
    );
  const parts: SplitPart[] = ordered.map(([label, rows]) => ({
    id: label,
    label,
    value: rows.length,
    tone: GROUP_TONE[label]
  }));
  return (
    <div className={sg.page}>
      {header}
      {stale || read.dropped > 0 || v.reviewHasWork ? (
        <div className={sg.flow}>
          {stale ? (
            <Banner
              tone="warn"
              title={STAFF_COPY.ordersStale(readAtText(read.readAt as number))}
              action={retry}
            />
          ) : null}
          {read.dropped > 0 ? (
            <Banner tone="warn" title={STAFF_COPY.ordersDropped(read.dropped)} />
          ) : null}
          {v.reviewHasWork ? (
            <Banner
              tone="warn"
              title={v.reviewCountText}
              body={v.reviewDetail}
              action={review ? { label: 'Show them', onPress: () => review.go() } : undefined}
            />
          ) : null}
        </div>
      ) : null}

      <div role="group" aria-label="Orders by stage" className={cx(glassStyles.glassCard, sg.card)}>
        <div className={sg.cardHead}>
          <h2 className="text-heading font-semibold text-ink">Orders by stage</h2>
          <span className="text-caption text-ink-mute">
            {orders.length === 1 ? '1 order shown' : `${orders.length} orders shown`}
          </span>
        </div>
        {orders.length ? <SplitBar parts={parts} /> : null}
        <div className={stockGlass.tiles}>
          {parts.map((part) => (
            <Tile key={part.id} label={part.label} tone={part.tone}>
              {part.value}
            </Tile>
          ))}
        </div>
      </div>

      <div className={sg.filters}>
        <div role="group" aria-label="Show orders" className={stockGlass.chips}>
          {(v.orderFilters ?? []).map((filter) => (
            <button
              key={String(filter.label)}
              type="button"
              aria-pressed={!!filter.active}
              onClick={filter.go}
              className={stockGlass.chip}
            >
              {orderStatusWord(filter.label)} <span>{filter.n}</span>
            </button>
          ))}
        </div>
        <div className={sg.search}>
          <input
            type="search"
            value={v.orderQ}
            onChange={v.setOrderQ}
            aria-label="Search orders"
            placeholder="Search name, order number or reference"
            className="h-12 rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-label"
          />
          {v.hasOrderQ ? (
            <Button variant="secondary" size="sm" onClick={v.clearOrderQ}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {v.orderEmpty && read.dropped === 0 ? (
        <Notice>
          <p className="text-body font-semibold text-ink">No orders match this filter</p>
          <p className="text-caption text-ink-mute">Try another filter, or clear the search.</p>
        </Notice>
      ) : null}
      <div className={sg.board}>
        {ordered.map(([label, rows]) => (
          <section
            key={label}
            aria-label={`${label} (${rows.length})`}
            className={cx(
              glassStyles.glassCard,
              sg.stage,
              rows.length === 0 && 'hidden lg:block',
              rows.length === 0 && sg.stageEmpty
            )}
          >
            <div className={sg.stageHead}>
              <span aria-hidden="true" className={cx(glassStyles.dot, GROUP_TONE[label])} />
              <h2 className="text-heading font-semibold text-ink">{`${label} (${rows.length})`}</h2>
            </div>
            <div className={sg.stageRows}>
              {rows.length === 0 ? (
                <p className={sg.none}>Nothing here</p>
              ) : (
                rows.map((order) => <OrderRow key={String(order.id)} order={order} />)
              )}
            </div>
          </section>
        ))}
      </div>

      {v.flavourTally?.length ? (
        <div
          role="group"
          aria-label="Ordered this drop, all customers"
          className={cx(glassStyles.glassCard, sg.card)}
        >
          <div className={sg.cardHead}>
            <h2 className="text-heading font-semibold text-ink">
              Ordered this drop, all customers
            </h2>
          </div>
          <p className="text-caption text-ink-mute">{v.flavourTallyTotal}</p>
          <ul className={sg.tally}>
            {v.flavourTally.map((flavour, i) => (
              <li key={i} className="text-ink">
                <span className="font-semibold">{flavour.qtyText}</span> {flavour.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
