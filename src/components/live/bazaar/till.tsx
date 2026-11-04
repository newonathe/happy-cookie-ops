'use client';

import { Component, useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FooterActions,
  PageTitle,
  Panel,
  PANEL_CLASS,
  PanelHead,
  SectionHeading
} from '@/components/ui/owner-kit';
import { FactRow, OpenRow } from '@/components/ui/owner-patterns';
import { saleLines } from '@/lib/bazaar/sale-lines';
import { TillCard } from './till-card';
import { CurrentSale } from './current-sale';
import { TillPanelPage, TillBack } from './till-bar';

type Till = NonNullable<OpsVals['liveTill']>;
type Sale = OpsVals['bzSales'][number];

/** How many sales show before "See all". */
const SALES_SHOWN = 5;

/**
 * The consolidated till (Ethan, 19 October 2026; mockups K5nHQS8GjtBYGseDtYZDnZ). Only the look is new: every control
 * calls the handler the ported Bazaar Mode screen calls, from the same `v`, so selling, the offline queue and the close
 * are unchanged. The ported screen stays one tap away ("Use the classic till") and takes over if this one throws.
 *
 * A tile adds one when tapped; a minus on the tile takes one off. One bar holds the sale, Freebie and Charge. Leaving,
 * adding cookies, fees and the close sit behind the ⋯ menu; a sale is voided from its own sheet, after a confirm.
 */
export function ConsolidatedTill({
  v,
  till,
  panel,
  events
}: {
  events?: (() => void) | null;
  v: OpsVals;
  till: Till;
  panel: TillPanelView | null | undefined;
}) {
  const [menu, setMenu] = useState(false);
  // The open sale, counted from the oldest: the list is newest first, so a sale arriving cannot move it.
  const [saleFromOldest, setSaleFromOldest] = useState<number | null>(null);
  const [allSales, setAllSales] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const sales = v.bzSales ?? [];
  const [reviewSale, setReviewSale] = useState(false);
  const sale = saleFromOldest === null ? undefined : sales[sales.length - 1 - saleFromOldest];
  const closeSale = () => setSaleFromOldest(null);
  const shown = allSales ? sales : sales.slice(0, SALES_SHOWN);
  const pick = (run: () => void) => () => {
    setMenu(false);
    run();
  };
  const menuItems: Array<{ label: string; hint: string; run: () => void }> = [
    ...(till.addCookies
      ? [{ label: 'Add cookies', hint: 'Put more on the table', run: till.addCookies }]
      : []),
    { label: 'Fees and expenses', hint: 'Stall rent, ice, parking', run: v.openEventExpense },
    {
      label: 'Review and close the day',
      hint: 'Count the drawer, settle the leftovers',
      run: v.askClose
    },
    ...(till.home
      ? [{ label: 'Back to Home', hint: 'The day keeps selling', run: till.home }]
      : []),
    {
      label: 'Use the classic till',
      hint: 'The till from before, on this phone',
      run: () => till.setClassic(true)
    }
  ];

  if (panel) return <TillPanelPage panel={panel} />;
  if (sale && voiding)
    return (
      <VoidPage
        sale={sale}
        keep={() => setVoiding(false)}
        confirm={() => {
          setVoiding(false);
          closeSale();
          sale.void();
        }}
      />
    );
  if (sale) return <ReceiptPage sale={sale} toVoid={() => setVoiding(true)} back={closeSale} />;
  if (menu)
    return (
      <TillSettings
        v={v}
        items={menuItems.map((item) => ({ ...item, run: pick(item.run) }))}
        back={() => setMenu(false)}
      />
    );
  return (
    <>
      {/* One grid on a wide screen (tiles left, the sale and sales right); one column on a phone, where the sale bar is
        the section's last child so it can stay pinned to the bottom of the screen the whole way down. */}
      <section
        aria-label="Till"
        data-screen-label="Bazaar Mode"
        data-till="consolidated"
        className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,min(38%,520px))] lg:items-start lg:gap-x-5 lg:gap-y-3"
      >
        <div className="lg:col-span-2">
          {events ? (
            <div className="mb-2">
              <TillBack onBack={events} />
            </div>
          ) : null}
          <PageTitle
            title="Sell at the bazaar"
            subtitle={
              <>
                {v.event?.name}
                {v.event?.date ? ` · ${String(v.event.date)}` : ''}
              </>
            }
            actions={
              <>
                <Button variant="secondary" onClick={v.askClose}>
                  Close day
                </Button>
                <Button variant="secondary" aria-label="Till menu" onClick={() => setMenu(true)}>
                  Settings
                </Button>
              </>
            }
          />
        </div>

        {v.syncBanner ? (
          <div className="lg:col-span-2">
            <SyncNotice v={v} />
          </div>
        ) : null}

        <section
          aria-label="Cookies on the table"
          className={`@container order-1 min-w-0 ${PANEL_CLASS} lg:order-none lg:col-start-1 lg:row-start-3`}
        >
          <PanelHead title="Cookies on the table">
            {till.soldOutCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={till.showSoldOut}
                onClick={till.toggleSoldOut}
              >
                {till.showSoldOut ? 'Hide sold out' : `Show sold out (${till.soldOutCount})`}
              </Button>
            ) : null}
          </PanelHead>
          {till.allGone ? (
            <EmptyState
              title="Everything on the table is sold"
              body={
                till.addCookies
                  ? 'Add more cookies to keep selling.'
                  : 'Tell the owner to add more cookies.'
              }
              action={
                till.addCookies ? { label: 'Add cookies', onPress: till.addCookies } : undefined
              }
            />
          ) : null}
          <div className="-mb-px grid grid-cols-1 @md:grid-cols-2">
            {(v.bzSell ?? []).map((p, i) => {
              const name = String(p.name);
              const count = Number(p.inCart) || 0;
              return (
                <div
                  key={name}
                  data-part="tile"
                  className="relative border-b border-divide @md:odd:border-r"
                >
                  <TillCard
                    name={name}
                    photo={till.photos[i] ?? ''}
                    price={String(p.priceText)}
                    left={p.left}
                    count={count}
                    soldOut={!!p.soldOut && !count}
                    onPress={p.tap}
                  />
                  {count ? (
                    <button
                      type="button"
                      aria-label={`One less ${name}`}
                      onClick={p.minus}
                      className="motion-press absolute top-1/2 right-2.5 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-chip"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-label="Sales today"
          className={`order-3 ${PANEL_CLASS} lg:order-none lg:col-span-2 lg:row-start-4`}
        >
          <PanelHead title="Sales today">
            {sales.length ? null : <span className="text-caption text-ink-mute">No sales yet</span>}
          </PanelHead>
          {sales.length ? (
            <>
              <SalesFigures v={v} sales={sales} />
              <div
                aria-hidden="true"
                className={`hidden gap-x-4 border-b border-divide bg-raise px-4 py-2 text-caption font-semibold text-ink-mute lg:grid ${SALE_COLUMNS}`}
              >
                <span>Sale</span>
                <span>Cookies</span>
                <span>Payment</span>
                <span>Status</span>
                <span className="text-right">Total</span>
                <span />
              </div>
            </>
          ) : null}
          {shown.map((sl, i) => (
            <SaleRow
              key={i}
              sale={sl}
              number={sales.length - i}
              open={() => setSaleFromOldest(sales.length - 1 - i)}
            />
          ))}
          {sales.length > SALES_SHOWN ? (
            <button
              type="button"
              onClick={() => setAllSales(!allSales)}
              className="min-h-11 w-full bg-raise text-caption font-semibold text-ink-soft"
            >
              {allSales ? 'Show fewer' : `See all ${sales.length} sales`}
            </button>
          ) : null}
        </section>

        <CurrentSale v={v} mobileOpen={reviewSale} closeMobile={() => setReviewSale(false)} />

        {Number(v.bzCartCount) ? (
          <div
            data-part="sale-bar"
            style={{ bottom: 'calc(var(--workspace-dock, 0px) + 12px)' }}
            className="order-4 sticky z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface/95 p-3 shadow-lift backdrop-blur lg:hidden"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-caption text-ink-soft">{v.bzCartCount} in this sale</span>
              <span className="text-title tabular-nums">{v.bzCartTotalNum}</span>
            </span>
            <Button variant="secondary" onClick={() => setReviewSale(true)}>
              Review sale
            </Button>
            <Button variant="primary" size="lg" className="col-span-2 w-full" onClick={v.openPay}>
              Charge {v.bzCartTotalNum}
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function SaleFacts({ sale }: { sale: Sale }) {
  return (
    <>
      {saleLines(String(sale.summary ?? '')).map((line, i) => (
        <FactRow key={i} label={`${line.qty}× ${line.name}`}>
          {null}
        </FactRow>
      ))}
      <FactRow label="Total">{sale.totalText}</FactRow>
      <FactRow label="Paid by">
        <SaleMeta sale={sale} />
      </FactRow>
      <FactRow label="Status">{sale.stateText}</FactRow>
    </>
  );
}

/** One sale, and the way to void it. */
function ReceiptPage({ sale, toVoid, back }: { sale: Sale; toVoid: () => void; back: () => void }) {
  return (
    <section aria-label="Receipt" className="flex flex-col gap-3">
      <PageTitle title="Receipt" subtitle="This sale." />
      <Panel>
        <SaleFacts sale={sale} />
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={toVoid}>
                Void this sale
              </Button>
            }
            forward={
              <Button variant="primary" onClick={back}>
                Next customer
              </Button>
            }
          />
        </div>
      </Panel>
    </section>
  );
}

function VoidPage({ sale, keep, confirm }: { sale: Sale; keep: () => void; confirm: () => void }) {
  return (
    <section aria-label="Void this sale" className="flex flex-col gap-3">
      <PageTitle title="Void this sale" subtitle="Only this sale will be changed." />
      <Panel>
        <SaleFacts sale={sale} />
        <p className="mt-3 text-caption text-ink-soft">
          Voiding puts its cookies back on the table.
        </p>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={keep}>
                Keep sale
              </Button>
            }
            forward={
              <Button variant="danger" onClick={confirm}>
                Confirm void
              </Button>
            }
          />
        </div>
      </Panel>
    </section>
  );
}

/** The till's other ways in and out, and what this device holds. */
function TillSettings({
  v,
  items,
  back
}: {
  v: OpsVals;
  items: Array<{ label: string; hint: string; run: () => void }>;
  back: () => void;
}) {
  return (
    <section aria-label="Till settings" className="flex flex-col gap-3">
      <PageTitle
        title="Selling settings"
        subtitle={String(v.event?.name ?? '')}
        actions={
          <Button variant="secondary" onClick={back}>
            Back to selling
          </Button>
        }
      />
      <Panel>
        {items.map((item) => (
          <OpenRow key={item.label} title={item.label} detail={item.hint} onOpen={item.run} />
        ))}
      </Panel>
      <SectionHeading>Selling device</SectionHeading>
      <Panel>
        <FactRow label="This device">Can sell this day</FactRow>
        <FactRow label="Connection">{v.offline ? 'Offline' : 'Online'}</FactRow>
        <FactRow label="Sales">{v.bzSalesCount}</FactRow>
        <FactRow label="Waiting to send">{v.unsynced ? String(v.unsynced) : 'None'}</FactRow>
        {v.unsynced ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-ink-soft">
              Keep this browser open while sales are waiting to send.
            </p>
            <Button variant="secondary" size="sm" onClick={v.syncNow}>
              Sync now
            </Button>
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

/** Selling, the day's count and takings, and the sync line with its "Sync now" (never hidden behind a tap). */
/** Only when sales are waiting, failed or offline: the sale records must never look safer than they are. */
function SyncNotice({ v }: { v: OpsVals }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2.5 rounded-control border border-line bg-surface px-3 py-2.5"
    >
      {v.syncing ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-line-mute border-t-accent"
        />
      ) : null}
      <span
        className={`flex-1 text-caption font-semibold ${v.syncPartial ? 'text-danger' : v.syncDone ? 'text-ok' : 'text-ink'}`}
      >
        {v.syncText}
      </span>
      {v.unsynced ? (
        <Button variant="secondary" size="sm" onClick={v.syncNow}>
          Sync now
        </Button>
      ) : null}
    </div>
  );
}

function SaleMeta({ sale }: { sale: Sale }) {
  return (
    <>
      {sale.pay}
      {sale.refText ? <> · {sale.refText}</> : null}
      {sale.clerk ? <> · {sale.clerk}</> : null}
    </>
  );
}

/** The columns of Sales today, on its header and on every row. */
const SALE_COLUMNS = 'lg:grid-cols-[72px_minmax(0,1fr)_132px_112px_88px_16px]';

/** The day at a glance, evenly across the panel: what came in, how much, and how it was paid. Every peso is the engine's. */
function SalesFigures({ v, sales }: { v: OpsVals; sales: Sale[] }) {
  const cookies = sales.reduce(
    (sum, sale) => sum + saleLines(String(sale.summary ?? '')).reduce((t, line) => t + line.qty, 0),
    0
  );
  const figures = [
    { label: 'Total', value: v.bzRevenue },
    { label: 'Sales', value: sales.length },
    { label: 'Cookies', value: cookies },
    ...(sales.some((sale) => sale.pay === 'Cash')
      ? [{ label: 'Cash', value: v.drawerCashText }]
      : []),
    ...(v.digitalTotals ?? []).map((d) => ({ label: d.pay, value: d.totalText }))
  ];
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-x-4 gap-y-3 border-b border-divide px-4 py-3">
      {figures.map((figure) => (
        <div key={String(figure.label)} className="flex flex-col">
          <dt className="text-caption text-ink-mute">{figure.label}</dt>
          <dd className="text-[16px] font-semibold text-ink tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One sale, one row: which sale and who sold it, its cookies as tags, how it was paid, whether it reached the server,
 * and its total. A problem is the only status that shouts. The row opens its receipt; a sale that could not be sent keeps
 * "Send again" under it.
 */
function SaleRow({ sale, number, open }: { sale: Sale; number: number; open: () => void }) {
  const lines = saleLines(String(sale.summary ?? ''));
  return (
    <div data-part="sale" className="border-b border-divide last:border-b-0">
      <button
        type="button"
        onClick={open}
        className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${SALE_COLUMNS}`}
      >
        <span className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-baseline gap-x-2 lg:col-start-auto lg:row-start-auto lg:flex-col">
          <span className="text-[14px] font-semibold text-ink">Sale {number}</span>
          {sale.clerk ? (
            <>
              {' '}
              <span className="min-w-0 truncate text-caption text-ink-mute">{sale.clerk}</span>
            </>
          ) : null}
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 lg:col-span-1 lg:row-start-auto">
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
            <span className="text-caption text-ink-mute">No cookies</span>
          )}
        </span>
        <span className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-baseline gap-x-2 lg:col-start-auto lg:row-start-auto lg:flex-col">
          <span className="text-[14px] text-ink">{sale.pay}</span>
          {sale.refText ? (
            <>
              {' '}
              <span className="min-w-0 truncate text-caption text-ink-mute">{sale.refText}</span>
            </>
          ) : null}
        </span>
        <span
          className={`col-start-2 row-start-3 flex items-center justify-end gap-1.5 text-caption lg:col-start-auto lg:row-start-auto lg:justify-start ${sale.bad ? 'font-semibold text-danger' : 'text-ink-soft'}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${sale.bad ? 'bg-danger' : sale.ok ? 'bg-ok' : 'bg-warn-dot'}`}
          />
          {sale.stateText}
        </span>
        <span className="col-start-2 row-start-1 text-right text-[15px] font-semibold text-ink tabular-nums lg:col-start-auto lg:row-start-auto">
          {sale.totalText}
        </span>
        <span aria-hidden="true" className="hidden text-ink-faint lg:block">
          ›
        </span>
      </button>
      {sale.bad ? (
        <div className="flex justify-end px-4 pb-3">
          <Button variant="danger" size="sm" onClick={sale.retry}>
            Send again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * If the consolidated till throws, the ported till takes its place at once, so the stall keeps selling. The error is
 * logged; the ported till needs nothing from this one.
 */
export class TillBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[till]', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
