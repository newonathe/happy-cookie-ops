'use client';

import type { LiveHome, OpsVals } from '@/view-models/vals';
import { NextEventCard, SellingCard } from '@/components/live/bazaar/home-card';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { HeadedPanel, PageTitle, SignedMoney } from '@/components/ui/owner-kit';
import { ListRow, PanelLink, StackedBar } from '@/components/ui/owner-patterns';

/** Why a stock item is on Home, marked by more than colour. */
function StockTag({ status }: { status: string }) {
  return (
    <span
      className={cx(
        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        status === 'Out'
          ? 'border-danger-line text-danger'
          : status === 'Low'
            ? 'border-warm-line text-warn'
            : 'border-line text-ink-mute'
      )}
    >
      {status}
    </span>
  );
}

/** One count of the day's orders. A source still loading shows a dash, never a zero. */
function OrderCount({
  label,
  value,
  onOpen,
  warn
}: {
  label: string;
  value: number | null;
  onOpen: () => void;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-20 min-w-0 flex-col justify-center gap-1 px-4 py-3 text-left hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <span
        className={cx(
          'text-[24px] leading-none font-semibold tabular-nums',
          value === null ? 'text-ink-faint' : warn && value > 0 ? 'text-brand-deep' : 'text-ink'
        )}
      >
        {value === null ? '—' : value}
      </span>
      <span className="text-caption text-ink-mute">{label}</span>
    </button>
  );
}

/** How many ingredients and packaging items are in stock, low or out, and how far to trust those numbers. */
function StockSummary({ counts }: { counts: NonNullable<LiveHome['stockCounts']> }) {
  if (!counts.ok && !counts.low && !counts.out)
    return <p className="text-caption text-ink-mute">No stock items yet.</p>;
  return (
    <>
      <StackedBar
        parts={[
          { id: 'out', label: 'Out', value: counts.out, tone: 'bg-danger' },
          { id: 'low', label: 'Low', value: counts.low, tone: 'bg-warn' },
          { id: 'ok', label: 'In stock', value: counts.ok, tone: 'bg-ok' }
        ]}
      />
      {counts.neverCounted ? (
        <p className="mt-2 text-caption text-ink-mute">
          {counts.neverCounted} {counts.neverCounted === 1 ? 'item has' : 'items have'} never been
          counted, so {counts.neverCounted === 1 ? 'its balance is' : 'their balances are'} as
          recorded.
        </p>
      ) : null}
    </>
  );
}

/**
 * Home (client v4): what is happening now, what needs the owner, then the day's work beside stock and money. Every panel
 * has the same head, so a page of several things still reads as one. Every number comes from its own record; a source
 * still loading says so.
 */
export function HomeLive({ v }: { v: OpsVals }) {
  const home = v.liveHome;
  if (!home) return null;
  const { orders, go } = home;
  const till = v.liveScreen?.till;
  const next = v.liveScreen?.next;
  const actions = [
    {
      title: 'Start production',
      detail:
        Number(v.prep?.n) > 0 ? (
          <>
            {v.prep.num} {v.prep.unit}
          </>
        ) : (
          'Record cookies made'
        ),
      onOpen: go.production
    },
    { title: 'Add to inventory', detail: 'Ingredients & packaging', onOpen: go.receive },
    { title: 'Count stock', detail: 'Enter a physical count', onOpen: go.count },
    {
      title: 'Products & recipes',
      detail: `${home.flavours} ${home.flavours === 1 ? 'flavour' : 'flavours'}`,
      onOpen: go.products
    },
    {
      title: 'Shopping list',
      detail: v.buy?.visible ? (
        <>
          {v.buy.num} {v.buy.unit}
        </>
      ) : (
        'What to buy next'
      ),
      onOpen: go.shopping
    }
  ];
  return (
    <div className="flex w-full flex-col gap-4">
      <PageTitle
        title={home.greeting}
        subtitle={home.dateText}
        actions={
          v.drop ? (
            <Button variant="secondary" size="sm" onClick={v.drop.go}>
              <span
                aria-hidden="true"
                className={cx(
                  'inline-block size-1.5 rounded-full align-middle',
                  v.drop.open ? 'bg-ok' : 'bg-ink-faint'
                )}
              />
              {v.drop.open ? 'Shop open' : 'Shop closed'} · {v.drop.closes}
            </Button>
          ) : null
        }
      />

      {till ? <SellingCard till={till} /> : null}
      {next ? <NextEventCard next={next} /> : null}

      {v.system?.bad ? (
        <HeadedPanel title="Needs attention">
          <ListRow
            title={v.system.label}
            detail={v.system.detail}
            trailing={<span className="text-caption font-semibold text-brand">Review</span>}
            onOpen={v.system.go}
          />
        </HeadedPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2">
        <HeadedPanel title="Orders" action={<PanelLink onOpen={go.orders}>Open orders</PanelLink>}>
          <div className="grid grid-cols-3 divide-x divide-divide">
            <OrderCount
              label="Payments to check"
              value={orders?.review ?? null}
              onOpen={go.payments}
              warn
            />
            <OrderCount
              label="Orders to prepare"
              value={orders?.toPrepare ?? null}
              onOpen={go.orders}
            />
            <OrderCount label="Ready for pickup" value={orders?.ready ?? null} onOpen={go.orders} />
          </div>
          {!orders ? (
            <p className="border-t border-divide px-4 py-2 text-caption text-ink-mute">
              Orders are still loading.
            </p>
          ) : null}
        </HeadedPanel>

        <HeadedPanel
          title="This month"
          className="@container"
          action={<PanelLink onOpen={go.money}>Open Money</PanelLink>}
        >
          {home.month ? (
            <dl className="grid grid-cols-2 gap-y-3 px-4 py-3 @md:grid-cols-3">
              <div className="col-span-2 flex min-w-0 flex-col gap-1 @md:col-span-1">
                <dt className="order-2 text-caption text-ink-mute">
                  {home.month.profit < 0 ? 'Loss so far' : 'Profit so far'}
                </dt>
                <dd className="order-1 text-[20px] leading-tight font-semibold tabular-nums">
                  <SignedMoney pesos={home.month.profit} />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="order-2 text-caption text-ink-mute">Income</dt>
                <dd className="order-1 text-[20px] leading-tight font-semibold tabular-nums">
                  <SignedMoney pesos={home.month.revenue} />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="order-2 text-caption text-ink-mute">Expenses</dt>
                <dd className="order-1 text-[20px] leading-tight font-semibold tabular-nums">
                  <SignedMoney pesos={-home.month.expenses} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className="px-4 py-3 text-caption text-ink-mute">Your books are still loading.</p>
          )}
        </HeadedPanel>

        <div className="flex min-w-0 flex-col gap-4">
          <HeadedPanel title="What would you like to do?" className="flex-1">
            <div className="divide-y divide-divide">
              {actions.map((action) => (
                <ListRow
                  key={action.title}
                  title={action.title}
                  detail={action.detail}
                  onOpen={action.onOpen}
                />
              ))}
            </div>
          </HeadedPanel>
          {home.production.length ? (
            <HeadedPanel title="Continue unfinished work">
              <div className="divide-y divide-divide">
                {home.production.map((work) => (
                  <ListRow
                    key={work.id}
                    title={work.name}
                    detail={`${work.detail} · not recorded yet`}
                    trailing={
                      <span className="text-caption font-semibold text-brand">Continue</span>
                    }
                    onOpen={work.open}
                  />
                ))}
              </div>
            </HeadedPanel>
          ) : null}
        </div>

        <HeadedPanel title="Stock" action={<PanelLink onOpen={go.stock}>Open stock</PanelLink>}>
          <div className="px-4 py-3">
            {home.stockCounts ? (
              <StockSummary counts={home.stockCounts} />
            ) : (
              <p className="text-caption text-ink-mute">Stock is still loading.</p>
            )}
          </div>
          {home.stockAttention.length ? (
            <div className="divide-y divide-divide border-t border-divide">
              {home.stockAttention.map((item) => (
                <ListRow
                  key={item.name}
                  title={item.name}
                  detail={item.detail}
                  trailing={<StockTag status={item.status} />}
                  onOpen={item.open}
                />
              ))}
            </div>
          ) : null}
        </HeadedPanel>
      </div>
    </div>
  );
}
