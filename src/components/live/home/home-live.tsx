'use client';

import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { StockReadNotice } from '@/components/live/stock/stock-read-notice';
import { STAFF_COPY, STOCK_COPY } from '@/lib/orders/staff-copy';
import type { LiveHome, OpsVals } from '@/view-models/vals';
import { NextEventCard, SellingCard } from '@/components/live/bazaar/home-card';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { CountMoney, GlassCard, GoalRing, SplitBar, glassStyles } from '@/components/ui/glass';
import type { SplitPart } from '@/components/ui/glass';
import { ListRow, PanelLink } from '@/components/ui/owner-patterns';
import styles from './home-live.module.css';

const WORK_SHOWN = 3;
const weekPeso = (pesos: number) =>
  `${pesos < 0 ? '−' : ''}₱${Math.abs(pesos).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Sales this week: income on each of the last seven days as bars, today last and solid. One series, so no legend; the
 * busiest day and today carry their figure, every bar names its day and figure on hover, and a screen reader gets the
 * seven exact figures as a list. Refund-heavy days extend below the zero line.
 */
function WeekBars({ week }: { week: NonNullable<LiveHome['week']> }) {
  const totalCents = week.reduce((sum, day) => sum + Math.round(day.income * 100), 0);
  const max = Math.max(0, ...week.map((day) => Math.abs(day.income)));
  const refunds = week.some((day) => day.income < 0);
  const best = max > 0 ? week.findIndex((day) => Math.abs(day.income) === max) : -1;
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[26px] leading-none font-semibold text-ink tabular-nums md:text-[32px]">
          <CountMoney pesos={Math.abs(totalCents) / 100} sign={totalCents < 0 ? '−' : ''} />
        </span>
        <span className="text-caption text-ink-mute">taken in the last 7 days, less refunds</span>
      </div>
      <ul className="sr-only">
        {week.map((day, i) => (
          <li key={i}>
            {day.today ? 'Today' : day.label}: {weekPeso(day.income)}
          </li>
        ))}
      </ul>
      <div className={styles.weekChart} aria-hidden="true">
        {week.map((day, i) => {
          const pct = max > 0 ? (Math.abs(day.income) / max) * (refunds ? 0.5 : 1) : 0;
          // The busiest day's figure is left out beside today's, where the two would touch.
          const labelled =
            day.income !== 0 && (day.today || (i === best && best < week.length - 2));
          return (
            <div
              key={i}
              className={styles.weekCol}
              title={`${day.today ? 'Today' : day.label}: ${weekPeso(day.income)}`}
            >
              <div className={cx(styles.weekPlot, refunds && styles.weekSigned)}>
                {labelled ? (
                  <span
                    className={styles.weekValue}
                    style={
                      day.income < 0
                        ? { top: `calc(50% + ${pct * 100}% + 2px)` }
                        : { bottom: `calc(${(refunds ? 50 : 0) + pct * 100}% + 6px)` }
                    }
                  >
                    {Math.abs(day.income) < 10000
                      ? weekPeso(day.income)
                      : `${day.income < 0 ? '−' : ''}₱${Math.abs(day.income).toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })}`}
                  </span>
                ) : null}
                {pct > 0 ? (
                  <span
                    data-net-cents={Math.round(day.income * 100)}
                    className={cx(
                      styles.weekBar,
                      day.income < 0 ? styles.weekRefund : day.today ? 'bg-ok' : 'bg-ok/45'
                    )}
                    style={{ height: `${pct * 100}%`, '--i': i } as CSSProperties}
                  />
                ) : null}
              </div>
              <span className={cx(styles.weekDay, day.today && 'font-semibold text-ink')}>
                {day.today ? 'Today' : day.label}
              </span>
            </div>
          );
        })}
      </div>
      {refunds ? (
        <p className="text-caption text-ink-mute">Below the line: refunds exceed sales.</p>
      ) : null}
    </>
  );
}

/** HCB-010: a helper's Home, until the owner decides more (OD-04): the two places a helper may open, and no money. */
function HelperHome({ go }: { go: { bazaar: () => void; sales: () => void } }) {
  return (
    <div data-screen-label="Home" className={styles.home}>
      <header className={styles.span12}>
        <h1
          tabIndex={-1}
          className="font-sans text-page font-semibold tracking-tight text-on-ground outline-none md:text-page-lg"
        >
          Where would you like to work?
        </h1>
      </header>
      <GlassCard title="Your places" className={styles.span12}>
        <div className={glassStyles.glassRows}>
          <ListRow title="Bazaar" detail="Sell at the stall" onOpen={go.bazaar} />
          <ListRow title="Sales log" detail="Sales recorded on this phone" onOpen={go.sales} />
        </div>
      </GlassCard>
    </div>
  );
}

const ATTENTION_SHOWN = 3;
const ICON = {
  production: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  receive: (
    <>
      <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12M16 17h6M19 14v6" />
    </>
  ),
  count: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 2h6v4H9zM9 14l2 2 4-4" />
    </>
  ),
  products: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  shopping: (
    <>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </>
  )
} as const;

/** One quick action: an icon, what it does, one line of detail. The whole tile is the button. */
function ActionTile({
  icon,
  title,
  detail,
  onOpen
}: {
  icon: keyof typeof ICON;
  title: string;
  detail: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className={styles.tile}>
      <span aria-hidden="true" className={styles.tileIcon}>
        <svg viewBox="0 0 24 24">{ICON[icon]}</svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label font-semibold text-ink">{title}</span>
        <span className="text-caption text-ink-mute">{detail}</span>
      </span>
    </button>
  );
}

const STATUS_ICON: Record<LiveHome['stockAttention'][number]['status'], ReactNode> = {
  Out: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  Low: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  'Not counted': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </>
  )
};

/** Why a stock item is on Home, marked by an icon and a word, never by colour alone. */
function StockTag({ status }: { status: LiveHome['stockAttention'][number]['status'] }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-caption font-semibold',
        status === 'Out'
          ? 'border-danger-line text-danger'
          : status === 'Low'
            ? 'border-warm-line text-warn'
            : 'border-line text-ink-mute'
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.chipIcon}>
        {STATUS_ICON[status]}
      </svg>
      {status}
    </span>
  );
}

/** One count of the day's orders, with its colour in the bar. A source still loading shows a dash, never a zero. */
function OrderCount({
  label,
  value,
  tone,
  onOpen,
  warn
}: {
  label: string;
  value: number | null;
  tone: string;
  onOpen: () => void;
  warn?: boolean;
}) {
  return (
    <button type="button" onClick={onOpen} className={glassStyles.stat}>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cx(glassStyles.dot, tone)} />
        <span
          className={cx(
            'font-mono text-[26px] leading-none font-semibold tabular-nums md:text-[32px]',
            value === null ? 'text-ink-faint' : warn && value > 0 ? 'text-brand-deep' : 'text-ink'
          )}
        >
          {value === null ? '—' : value}
        </span>
      </span>
      <span className={glassStyles.statLabel}>{label}</span>
    </button>
  );
}

/** How many ingredients and packaging items are in stock, low or out, and how far to trust those numbers. */
function StockSummary({ counts }: { counts: NonNullable<LiveHome['stockCounts']> }) {
  if (!counts.ok && !counts.low && !counts.out && !counts.unknown)
    return <p className="text-caption text-ink-mute">No stock items yet.</p>;
  const parts: SplitPart[] = [
    { id: 'out', label: 'Out', value: counts.out, tone: 'bg-danger' },
    { id: 'low', label: 'Low', value: counts.low, tone: 'bg-warn-dot' },
    { id: 'ok', label: 'In stock', value: counts.ok, tone: 'bg-ok' },
    { id: 'unknown', label: 'Unknown count', value: counts.unknown ?? 0, tone: 'bg-ink-faint' }
  ];
  return (
    <>
      <SplitBar parts={parts} />
      <ul className={styles.legend}>
        {parts.map((part) => (
          <li key={part.id} className={glassStyles.stat} style={{ minHeight: 64 }}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={cx(glassStyles.dot, part.tone)} />
              <span className="font-mono text-[26px] leading-none font-semibold tabular-nums md:text-[32px]">
                {part.value}
              </span>
            </span>
            <span className={glassStyles.statLabel}>{part.label}</span>
          </li>
        ))}
      </ul>
      {counts.neverCounted ? (
        <p className="text-caption text-ink-mute">
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
  const [allWork, setAllWork] = useState(false);
  const [allAttention, setAllAttention] = useState(false);
  const home = v.liveHome;
  // HCB-002i: a first read that failed is not "still loading".
  const read = useSyncExternalStore(ordersRead.subscribe, ordersRead.get, ordersRead.getServer);
  if (!home) return v.liveHelperHome ? <HelperHome go={v.liveHelperHome.go} /> : null;
  const { orders, go } = home;
  const till = v.liveScreen?.till;
  const next = v.liveScreen?.next;
  const shopping = v.liveStock?.grocery;
  const shortages =
    shopping?.rows.filter((row) => row.toBuyText !== STOCK_COPY.nothingToBuy).length ?? 0;
  const unknown = shopping?.unknownCount ?? 0;
  const shoppingDetail = !shopping
    ? 'Open Stock to check'
    : [
        shortages ? `${shortages} ${shortages === 1 ? 'item' : 'items'} short` : null,
        unknown ? `${unknown} ${unknown === 1 ? 'item needs' : 'items need'} a count` : null
      ]
        .filter(Boolean)
        .join(' · ') || 'No recorded shortages';
  const actions: Array<{
    icon: keyof typeof ICON;
    title: string;
    detail: ReactNode;
    onOpen: () => void;
  }> = [
    {
      icon: 'production',
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
    {
      icon: 'receive',
      title: 'Add to inventory',
      detail: 'Ingredients & packaging',
      onOpen: go.receive
    },
    {
      icon: 'count',
      title: 'Count stock',
      detail: 'Enter a physical count',
      onOpen: go.count
    },
    {
      icon: 'products',
      title: 'Products & recipes',
      // HCB-004: a count of the built-in six is not hers; until her products are read it says so.
      detail:
        home.flavours === null ? STAFF_COPY.homeProductsNotRead : `${home.flavours} on the menu`,
      onOpen: go.products
    },
    {
      icon: 'shopping',
      title: 'Shopping list',
      detail: shoppingDetail,
      onOpen: go.shopping
    }
  ];
  const goal = v.profitGoal;
  const goalPct =
    goal && goal.profit !== null
      ? Math.max(0, Math.min(100, Math.round((goal.profit / goal.goal) * 100)))
      : null;
  const attention = allAttention
    ? home.stockAttention
    : home.stockAttention.slice(0, ATTENTION_SHOWN);
  const needsCount =
    (orders && orders.review > 0 ? 1 : 0) + (v.system?.bad ? 1 : 0) + home.stockAttention.length;
  const orderParts = orders
    ? [
        { id: 'review', label: 'Payments to check', value: orders.review, tone: 'bg-warn-dot' },
        { id: 'prepare', label: 'Orders to prepare', value: orders.toPrepare, tone: 'bg-accent' },
        { id: 'ready', label: 'Ready for pickup', value: orders.ready, tone: 'bg-ok' }
      ]
    : null;
  const month = home.month;
  // Of every ₱100 that came in this month, how much was kept: shown only while income covers the costs.
  const kept =
    month && month.revenue > 0 && month.profit >= 0
      ? Math.min(100, Math.round((month.profit / month.revenue) * 100))
      : null;
  return (
    <div data-screen-label="Home" className={styles.home}>
      <header className={cx(styles.span12, 'flex flex-wrap items-start justify-between gap-3.5')}>
        <div className="min-w-0">
          <h1
            tabIndex={-1}
            className="font-sans text-page font-semibold tracking-tight text-on-ground outline-none md:text-page-lg"
          >
            {home.greeting}
          </h1>
          <p className="mt-1 font-mono text-caption tracking-[0.06em] text-on-ground uppercase">
            {home.dateText}
          </p>
        </div>
        {v.drop ? (
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
        ) : null}
      </header>

      {till ? (
        <div className={cx(styles.span12, glassStyles.glassSlot)}>
          <SellingCard till={till} />
        </div>
      ) : null}
      {next ? (
        <div className={cx(styles.span12, glassStyles.glassSlot)}>
          <NextEventCard next={next} />
        </div>
      ) : null}

      <GlassCard
        title="This month"
        className={styles.spanHero}
        action={<PanelLink onOpen={go.money}>Open Money</PanelLink>}
      >
        {month && home.booksReadState === 'failed' ? (
          <p role="status" className="text-caption text-ink-mute">
            Books could not be refreshed. Showing the last successful read.
          </p>
        ) : month && home.booksReadState === 'loading' ? (
          <p role="status" className="text-caption text-ink-mute">
            Updating books. Showing the last successful read.
          </p>
        ) : null}
        {month ? (
          <>
            <div className={glassStyles.heroFigure}>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-label font-medium text-ink-soft">
                  {month.profit < 0 ? 'Loss this month' : 'Profit this month'}
                </span>
                <span
                  className={cx(
                    'font-mono text-[length:clamp(28px,9vw,40px)] leading-none font-semibold tabular-nums md:text-[56px]',
                    month.profit < 0 ? 'text-danger' : 'text-ink'
                  )}
                >
                  <CountMoney pesos={month.profit} sign={month.profit < 0 ? '−' : ''} />
                </span>
                {goal && goalPct !== null ? (
                  <span className="text-caption text-ink-mute">
                    of ₱{Math.round(goal.goal).toLocaleString('en-PH')} goal
                  </span>
                ) : null}
              </div>
              {goalPct !== null ? <GoalRing pct={goalPct} /> : null}
            </div>
            {kept !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-label font-medium text-ink-soft">Where income went</span>
                  <span className="text-caption text-ink-mute">₱{kept} kept of every ₱100</span>
                </div>
                <SplitBar
                  label={`${100 - kept}% spent, ${kept}% kept`}
                  parts={[
                    { id: 'spent', label: 'Spent', value: month.expenses, tone: 'bg-danger' },
                    { id: 'kept', label: 'Kept', value: month.profit, tone: 'bg-ok' }
                  ]}
                />
              </div>
            ) : null}
            <dl className={glassStyles.moneyWells}>
              <div className={glassStyles.glassWell}>
                <dt>Income</dt>
                <dd className="text-ok">
                  <CountMoney pesos={month.revenue} sign={month.revenue > 0 ? '+' : ''} />
                </dd>
              </div>
              <div className={glassStyles.glassWell}>
                <dt>Expenses</dt>
                <dd className="text-danger">
                  <CountMoney pesos={month.expenses} sign={month.expenses > 0 ? '−' : ''} />
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-caption text-ink-mute">
            {home.booksReadState === 'failed'
              ? 'Your books could not be read. Open Money to retry.'
              : 'Your books are still loading.'}
          </p>
        )}
      </GlassCard>

      <GlassCard
        title="Needs you"
        className={styles.spanSide}
        action={needsCount ? <span className={glassStyles.badge}>{needsCount}</span> : undefined}
      >
        {needsCount ? (
          <>
            <div className={glassStyles.glassRows}>
              {orders && orders.review > 0 ? (
                <ListRow
                  title="Payments to check"
                  detail={`${orders.review} ${orders.review === 1 ? 'order is' : 'orders are'} waiting`}
                  trailing={<span className="text-label font-semibold text-brand">Review</span>}
                  onOpen={go.payments}
                />
              ) : null}
              {v.system?.bad ? (
                <ListRow
                  title={v.system.label}
                  detail={v.system.detail}
                  trailing={<span className="text-label font-semibold text-brand">Review</span>}
                  onOpen={v.system.go}
                />
              ) : null}
              {attention.map((item) => (
                <ListRow
                  key={item.name}
                  title={item.name}
                  detail={item.detail}
                  trailing={<StockTag status={item.status} />}
                  onOpen={item.open}
                />
              ))}
            </div>
            {home.stockAttention.length > ATTENTION_SHOWN ? (
              <button
                type="button"
                onClick={() => setAllAttention(!allAttention)}
                className="min-h-11 w-full rounded-[14px] bg-chip text-caption font-semibold text-ink-soft"
              >
                {allAttention ? 'Show fewer' : `Show all ${home.stockAttention.length}`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-caption text-ink-mute">
            {orders && home.stockCounts
              ? 'Nothing needs you right now.'
              : 'Checking your orders and stock…'}
          </p>
        )}
      </GlassCard>

      {home.week !== undefined ? (
        <GlassCard title="Sales this week" className={styles.spanTwoThirds}>
          {home.week ? (
            <WeekBars week={home.week} />
          ) : (
            <p className="text-caption text-ink-mute">
              {home.booksReadState === 'failed'
                ? 'Sales could not be read yet.'
                : 'Sales are still loading.'}
            </p>
          )}
        </GlassCard>
      ) : null}

      <GlassCard
        title="Orders"
        className={styles.spanHalf}
        action={<PanelLink onOpen={go.orders}>Open orders</PanelLink>}
      >
        {orderParts && orderParts.some((part) => part.value > 0) ? (
          <SplitBar parts={orderParts} />
        ) : (
          <div className={glassStyles.splitBar} aria-hidden="true" />
        )}
        <div className={styles.orderTiles}>
          <OrderCount
            label="Payments to check"
            value={orders?.review ?? null}
            tone="bg-warn-dot"
            onOpen={go.payments}
            warn
          />
          <OrderCount
            label="Orders to prepare"
            value={orders?.toPrepare ?? null}
            tone="bg-accent"
            onOpen={go.orders}
          />
          <OrderCount
            label="Ready for pickup"
            value={orders?.ready ?? null}
            tone="bg-ok"
            onOpen={go.orders}
          />
        </div>
        {!orders ? (
          <p className="text-caption text-ink-mute">
            {read.phase === 'failed' && !read.everRead
              ? 'Your orders could not be read. Open Orders to retry.'
              : 'Orders are still loading.'}
          </p>
        ) : null}
      </GlassCard>

      <GlassCard
        title="Stock"
        className={styles.spanHalf}
        action={<PanelLink onOpen={go.stock}>Open stock</PanelLink>}
      >
        {v.liveStockRead?.state === 'failed' || v.liveStockRead?.stale ? (
          <StockReadNotice read={v.liveStockRead} />
        ) : null}
        {home.stockCounts ? (
          <StockSummary counts={home.stockCounts} />
        ) : v.liveStockRead?.state === 'failed' ? null : (
          <p className="text-caption text-ink-mute">Stock is still loading.</p>
        )}
      </GlassCard>

      <GlassCard
        title="What would you like to do?"
        className={home.production.length ? styles.spanTwoThirds : styles.span12}
      >
        <div className={styles.tiles}>
          {actions.map((action) => (
            <ActionTile key={action.title} {...action} />
          ))}
        </div>
      </GlassCard>

      {home.production.length ? (
        <GlassCard title="Continue unfinished work" className={styles.spanThird}>
          <div className={glassStyles.glassRows}>
            {(allWork ? home.production : home.production.slice(0, WORK_SHOWN)).map((work) => (
              <ListRow
                key={work.id}
                title={work.name}
                detail={`${work.detail} · not recorded yet`}
                trailing={<span className="text-label font-semibold text-brand">Continue</span>}
                onOpen={work.open}
              />
            ))}
          </div>
          {home.production.length > WORK_SHOWN ? (
            <button
              type="button"
              onClick={() => setAllWork(!allWork)}
              className="min-h-11 w-full rounded-[14px] bg-chip text-caption font-semibold text-ink-soft"
            >
              {allWork ? 'Show fewer' : `Show all ${home.production.length}`}
            </button>
          ) : null}
        </GlassCard>
      ) : null}
    </div>
  );
}
