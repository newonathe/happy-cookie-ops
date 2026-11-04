'use client';

import { Component, useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FooterActions, PageTitle, Panel, SectionHeading } from '@/components/ui/owner-kit';
import { FactRow, OpenRow } from '@/components/ui/owner-patterns';
import { TillCard } from './till-card';
import { StatusPill } from '@/components/ui/status-pill';
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
  const inSale = (v.bzSell ?? []).filter((p) => (Number(p.inCart) || 0) > 0);
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
        className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-x-5 lg:gap-y-3"
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

        <div className="lg:col-span-2">
          <SaleStatus v={v} />
        </div>

        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-3">
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(v.bzSell ?? []).map((p, i) => {
              const name = String(p.name);
              const count = Number(p.inCart) || 0;
              return (
                <div key={name} data-part="tile" className="relative">
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
                      className="motion-press absolute top-1 left-1 grid size-11 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-chip"
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
          {till.soldOutCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              aria-pressed={till.showSoldOut}
              onClick={till.toggleSoldOut}
            >
              {till.showSoldOut ? 'Hide sold out' : `Show sold out (${till.soldOutCount})`}
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-surface lg:col-start-2 lg:row-start-4">
          <div className="flex items-center gap-2 border-b border-divide px-3.5 py-3">
            <span className="flex-1 text-body font-bold">Sales today</span>
            <span className="text-caption text-ink-mute">
              {sales.length ? 'Tap a sale to void it' : 'No sales yet'}
            </span>
          </div>
          {shown.map((sl, i) => (
            <SaleRow key={i} sale={sl} open={() => setSaleFromOldest(sales.length - 1 - i)} />
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
        </div>

        <aside
          aria-label="Current sale"
          className="hidden flex-col gap-3 rounded-card border border-line bg-surface p-5 lg:sticky lg:top-3 lg:col-start-2 lg:row-start-3 lg:flex"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-ink">Current sale</h2>
            <span className="text-caption text-ink-mute">{v.bzCartCount} in this sale</span>
          </div>
          {inSale.length ? (
            <ul className="flex flex-col">
              {inSale.map((p) => (
                <li
                  key={String(p.name)}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-semibold text-ink">{p.name}</span>
                    <span className="text-caption text-ink-mute tabular-nums">
                      {p.priceText} each
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-control border border-line px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`One less ${String(p.name)} in this sale`}
                      onClick={p.minus}
                    >
                      −
                    </Button>
                    <span className="w-5 text-center text-[14px] font-semibold text-ink tabular-nums">
                      {String(p.inCart)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`One more ${String(p.name)} in this sale`}
                      onClick={p.tap}
                      disabled={!!p.soldOut}
                    >
                      +
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-center text-caption text-ink-mute">Choose a cookie to start.</p>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[17px] text-ink">Total</span>
            <span className="text-title tabular-nums">{v.bzCartTotalNum}</span>
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={v.openPay}>
            Charge
          </Button>
          <Button variant="secondary" className="w-full" onClick={v.recordFreebie}>
            Freebie
          </Button>
        </aside>

        <div
          data-part="sale-bar"
          style={{ bottom: 'calc(var(--workspace-dock, 0px) + 12px)' }}
          className="lg:hidden sticky z-10 flex items-center gap-2.5 rounded-card border border-line bg-surface/95 p-3 pl-4 shadow-lift backdrop-blur lg:top-3 lg:bottom-auto lg:col-start-2 lg:row-start-3"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-caption text-ink-soft">{v.bzCartCount} in this sale</span>
            <span className="text-title tabular-nums">{v.bzCartTotalNum}</span>
          </span>
          <Button variant="secondary" onClick={v.recordFreebie}>
            Freebie
          </Button>
          <Button variant="primary" size="lg" onClick={v.openPay}>
            Charge
          </Button>
        </div>
      </section>
    </>
  );
}

function SaleFacts({ sale }: { sale: Sale }) {
  return (
    <>
      <FactRow label={sale.summary}>{sale.totalText}</FactRow>
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
function SaleStatus({ v }: { v: OpsVals }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-control border border-line bg-surface px-3 py-2.5">
      <StatusPill status="selling" />
      <span className="flex-1 text-caption text-ink-soft">
        {v.bzSalesCount} · <span className="font-bold text-ink tabular-nums">{v.bzRevenue}</span>
      </span>
      {v.syncBanner ? (
        <span role="status" className="flex basis-full items-center gap-2.5">
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
        </span>
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

/** One sale: the row opens its sheet; a sale that could not be sent keeps "Send again" on the row itself. */
function SaleRow({ sale, open }: { sale: Sale; open: () => void }) {
  return (
    <div data-part="sale" className="flex items-center gap-2 border-b border-divide pr-2">
      <button
        type="button"
        onClick={open}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 py-2 pl-3.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-ink">{sale.summary}</span>
          <span className="text-caption text-ink-mute">
            <SaleMeta sale={sale} />
          </span>
        </span>
        <span className="text-body font-bold tabular-nums">{sale.totalText}</span>
        {sale.ok ? (
          <span className="text-caption font-semibold text-ok">{sale.stateText}</span>
        ) : null}
      </button>
      {sale.bad ? (
        <Button variant="danger" size="sm" onClick={sale.retry}>
          Send again
        </Button>
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
