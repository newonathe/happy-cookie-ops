'use client';

import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { PageTitle, Panel } from '@/components/ui/owner-kit';
import { OrderPill, SellSettings, SellTabs, SellTools } from './sell-shared';

type Row = OpsVals['orderList'][number];

/** The reference's groups, work first. Every row still shows its own status word. */
const GROUP_ORDER = [
  'To prepare',
  'Ready for pickup',
  'Payments & other orders',
  'Closed'
] as const;
type GroupName = (typeof GROUP_ORDER)[number];

const groupOf = (order: Row): GroupName => {
  const word = String(order.label).toLowerCase();
  if (word.includes('paid') && !word.includes('unpaid')) return 'To prepare';
  if (word.includes('bak') || word.includes('prepar') || word.includes('confirm'))
    return 'To prepare';
  if (word.includes('ready')) return 'Ready for pickup';
  if (word.includes('complete') || word.includes('collect') || word.includes('cancel'))
    return 'Closed';
  return 'Payments & other orders';
};

const SEGMENT: Record<string, string> = {
  'To review': 'bg-warn',
  Paid: 'bg-accent',
  Ready: 'bg-ok',
  Closed: 'bg-line-strong'
};

/** How the orders split across the stages: the same counts as the filters beside it. */
function Workload({ filters }: { filters: OpsVals['orderFilters'] }) {
  const parts = filters
    .filter((filter) => filter.label !== 'All')
    .map((filter) => ({ label: String(filter.label), n: Number(filter.n) || 0 }));
  const total = parts.reduce((sum, part) => sum + part.n, 0);
  if (!total) return null;
  return (
    <div
      role="img"
      aria-label={parts.map((part) => `${part.n} ${part.label}`).join(', ')}
      className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-chip"
    >
      {parts
        .filter((part) => part.n > 0)
        .map((part) => (
          <span
            key={part.label}
            className={SEGMENT[part.label] ?? 'bg-line-strong'}
            style={{ width: `${(part.n / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

function OrderRow({ order }: { order: Row }) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0',
        order.selected ? 'bg-raise' : null
      )}
    >
      <button
        type="button"
        onClick={order.select}
        aria-current={order.selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-left focus-visible:outline-2 focus-visible:outline-brand"
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
      {order.action ? (
        <Button variant="secondary" size="sm" onClick={order.act}>
          {order.action}
        </Button>
      ) : null}
    </div>
  );
}

function SelectedOrder({ od }: { od: NonNullable<OpsVals['od']> }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[16px] font-semibold text-ink">{od.name}</span>
          <span className="text-caption text-ink-mute">
            {(od.metaBits ?? [])
              .filter((bit) => bit.text)
              .map((bit, i) => (
                <span key={i}>
                  {i ? ' · ' : ''}
                  {bit.text}
                </span>
              ))}
          </span>
        </span>
        <OrderPill label={od.label} fg={od.fg} bg={od.bg} br={od.br} />
      </div>
      <ul className="mt-3 flex flex-col">
        {(od.lines ?? []).map((line, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 border-b border-line py-2 text-[14px] last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-ink">{line.name}</span>
            <span className="text-caption text-ink-mute">{line.qty}</span>
            <span className="font-semibold text-ink tabular-nums">{line.line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-caption text-ink-mute">Order total</span>
        <span className="text-[16px] font-semibold text-ink tabular-nums">{od.totalText}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {od.needsReview ? (
          <Button variant="primary" onClick={od.confirm}>
            Confirm payment
          </Button>
        ) : null}
        <Button variant="secondary" onClick={od.go}>
          Open full order
        </Button>
      </div>
    </Panel>
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
  return (
    <div className="w-full">
      <PageTitle
        title="Orders"
        subtitle="Prepare and hand over customer orders."
        actions={
          <>
            <SellTools v={v} />
            <SellSettings v={v} />
          </>
        }
      />
      <SellTabs v={v} />
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
      <Workload filters={v.orderFilters ?? []} />
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
            {filter.label} <span className="tabular-nums">{filter.n}</span>
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

      <div
        className={cx(
          'grid grid-cols-1 items-start gap-4',
          v.split && v.od ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : null
        )}
      >
        <div className="min-w-0">
          {v.orderEmpty ? (
            <Panel>
              <p className="text-[15px] font-semibold text-ink">No orders match this filter</p>
              <p className="text-caption text-ink-mute">Try another filter, or clear the search.</p>
            </Panel>
          ) : null}
          {ordered.map(([label, rows]) => (
            <Panel key={label} title={`${label} (${rows.length})`}>
              {rows.map((order) => (
                <OrderRow key={String(order.id)} order={order} />
              ))}
            </Panel>
          ))}
        </div>
        {v.split && v.od ? <SelectedOrder od={v.od} /> : null}
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
