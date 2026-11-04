'use client';

import type { ReactNode } from 'react';
import type { LiveHome, OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { PageTitle, Panel, SectionHeading, SignedMoney, TaskRow } from '@/components/ui/owner-kit';

const STOCK_LOOK: Record<'ok' | 'low' | 'out', { bar: string; label: string }> = {
  ok: { bar: 'bg-ok', label: 'In stock' },
  low: { bar: 'bg-warn', label: 'Low' },
  out: { bar: 'bg-danger', label: 'Out' }
};

function Tile({
  title,
  detail,
  onOpen,
  emphasis
}: {
  title: string;
  detail: ReactNode;
  onOpen: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex min-h-24 flex-col items-start justify-between gap-2 rounded-[16px] border bg-surface p-4 text-left transition-[transform,background-color] duration-[140ms] hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.99] motion-reduce:transform-none',
        emphasis ? 'border-brand' : 'border-line'
      )}
    >
      <span className="text-[15px] font-semibold text-ink">{title}</span>
      <span className="text-caption text-ink-mute">{detail}</span>
    </button>
  );
}

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
      className="flex min-h-20 flex-col gap-1 rounded-[14px] border border-line bg-surface p-3.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span
        className={cx(
          'text-[26px] leading-none font-semibold tabular-nums',
          value === null ? 'text-ink-faint' : warn && value > 0 ? 'text-brand-deep' : 'text-ink'
        )}
      >
        {value === null ? '—' : value}
      </span>
      <span className="text-caption text-ink-mute">{label}</span>
    </button>
  );
}

/** How many ingredients and packaging items are in stock, low, out or never counted. */
function StockBar({ counts }: { counts: NonNullable<LiveHome['stockCounts']> }) {
  const total = counts.ok + counts.low + counts.out;
  if (!total) return <p className="text-caption text-ink-mute">No stock items yet.</p>;
  const parts = (['out', 'low', 'ok'] as const).filter((k) => counts[k] > 0);
  return (
    <div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-chip"
        role="img"
        aria-label={parts
          .map((k) => `${counts[k]} ${STOCK_LOOK[k]!.label.toLowerCase()}`)
          .join(', ')}
      >
        {parts.map((k) => (
          <span
            key={k}
            className={STOCK_LOOK[k]!.bar}
            style={{ width: `${(counts[k] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-mute">
        {(['out', 'low', 'ok'] as const).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('size-2.5 rounded-sm', STOCK_LOOK[k]!.bar)} />
            <span className="font-semibold text-ink tabular-nums">{counts[k]}</span>
            {STOCK_LOOK[k]!.label}
          </li>
        ))}
      </ul>
      {counts.neverCounted ? (
        <p className="mt-2 text-caption text-ink-mute">
          {counts.neverCounted} {counts.neverCounted === 1 ? 'item has' : 'items have'} never been
          counted, so {counts.neverCounted === 1 ? 'its balance is' : 'their balances are'} as
          recorded.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Home (client v4): today's real work first, then direct actions, unfinished work and what needs
 * attention. Every number comes from its own record; a source still loading shows a dash.
 */
export function HomeLive({ v }: { v: OpsVals }) {
  const home = v.liveHome;
  if (!home) return null;
  const { orders, go } = home;
  const toPrepare = orders?.toPrepare ?? null;
  const attention = home.stockAttention;
  return (
    <div className="w-full">
      <PageTitle
        title={home.greeting}
        subtitle={home.dateText}
        actions={
          v.drop ? (
            <Button variant="secondary" size="sm" onClick={v.drop.go}>
              {v.drop.open ? 'Shop open' : 'Shop closed'} · {v.drop.closes}
            </Button>
          ) : null
        }
      />

      <div className="mb-2 grid grid-cols-3 gap-2.5">
        <OrderCount
          label="Payments to check"
          value={orders?.review ?? null}
          onOpen={go.payments}
          warn
        />
        <OrderCount label="Orders to prepare" value={toPrepare} onOpen={go.orders} />
        <OrderCount label="Ready for pickup" value={orders?.ready ?? null} onOpen={go.orders} />
      </div>
      {!orders ? (
        <p className="mb-2 text-caption text-ink-mute">Orders are still loading.</p>
      ) : null}

      <SectionHeading>What would you like to do?</SectionHeading>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Tile
          title="Orders"
          detail={toPrepare === null ? 'Prepare and hand over' : `${toPrepare} to prepare`}
          onOpen={go.orders}
          emphasis={!!orders?.review}
        />
        <Tile
          title="Start production"
          detail={
            Number(v.prep?.n) > 0 ? (
              <>
                {v.prep.num} {v.prep.unit}
              </>
            ) : (
              'Record cookies made'
            )
          }
          onOpen={go.production}
        />
        <Tile title="Receive delivery" detail="Ingredients & packaging" onOpen={go.receive} />
        <Tile title="Count stock" detail="Enter a physical count" onOpen={go.count} />
        <Tile
          title="Products & recipes"
          detail={`${home.flavours} ${home.flavours === 1 ? 'flavour' : 'flavours'}`}
          onOpen={go.products}
        />
        <Tile
          title="Shopping list"
          detail={v.buy?.visible ? <>Buy: {v.buy.names}</> : 'What to buy next'}
          onOpen={go.shopping}
        />
      </div>

      {v.system?.bad ? (
        <>
          <SectionHeading>Needs attention</SectionHeading>
          <Panel>
            <TaskRow
              title={v.system.label}
              detail={v.system.detail}
              action={
                <Button variant="secondary" size="sm" onClick={v.system.go}>
                  Review
                </Button>
              }
            />
          </Panel>
        </>
      ) : null}

      {home.production.length ? (
        <>
          <SectionHeading>Continue unfinished work</SectionHeading>
          <Panel>
            {home.production.map((work) => (
              <TaskRow
                key={work.id}
                title={work.name}
                detail={`${work.detail} · not recorded yet`}
                action={
                  <Button variant="secondary" size="sm" onClick={work.open}>
                    Continue
                  </Button>
                }
              />
            ))}
          </Panel>
        </>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-x-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <SectionHeading
            action={
              <Button variant="ghost" size="sm" onClick={go.stock}>
                Open stock
              </Button>
            }
          >
            Stock
          </SectionHeading>
          <Panel>
            {home.stockCounts ? (
              <StockBar counts={home.stockCounts} />
            ) : (
              <p className="text-caption text-ink-mute">Stock is still loading.</p>
            )}
            {attention.length ? (
              <div className="mt-3 border-t border-line pt-1">
                {attention.map((item) => (
                  <TaskRow
                    key={item.name}
                    title={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {item.name}
                        <span
                          className={cx(
                            'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            item.status === 'Out'
                              ? 'border-danger-line text-danger'
                              : item.status === 'Low'
                                ? 'border-warm-line text-warn'
                                : 'border-line text-ink-mute'
                          )}
                        >
                          {item.status}
                        </span>
                      </span>
                    }
                    detail={item.detail}
                    action={
                      <Button variant="secondary" size="sm" onClick={item.open}>
                        Open item
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : null}
          </Panel>
        </div>
        <div>
          <SectionHeading
            action={
              <Button variant="ghost" size="sm" onClick={go.money}>
                Open Money
              </Button>
            }
          >
            This month
          </SectionHeading>
          <Panel>
            {home.month ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-caption font-semibold text-ink">
                    {home.month.profit < 0 ? 'Loss so far' : 'Profit so far'}
                  </span>
                  <SignedMoney pesos={home.month.profit} className="text-[26px] leading-tight" />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-mute">
                  <span>
                    Income <SignedMoney pesos={home.month.revenue} />
                  </span>
                  <span>
                    Expenses <SignedMoney pesos={-home.month.expenses} />
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-caption text-ink-mute">Your books are still loading.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
