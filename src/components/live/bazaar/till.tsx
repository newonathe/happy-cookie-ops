'use client';

import { Component, useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FlavourTile } from '@/components/ui/flavour-tile';
import { Sheet } from '@/components/ui/sheet';
import { StatusPill } from '@/components/ui/status-pill';
import { TillPanel } from './till-bar';

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
  panel
}: {
  v: OpsVals;
  till: Till;
  panel: TillPanelView | null | undefined;
}) {
  const [menu, setMenu] = useState(false);
  // The open sale, counted from the oldest: the list is newest first, so a sale arriving cannot move it.
  const [saleFromOldest, setSaleFromOldest] = useState<number | null>(null);
  const [allSales, setAllSales] = useState(false);
  const sales = v.bzSales ?? [];
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
        <div className="flex items-center gap-2.5 lg:col-span-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-bold text-ink">{v.event?.name}</span>
            <span className="text-caption text-ink-mute">{v.event?.date}</span>
          </span>
          <Button variant="secondary" aria-label="Till menu" onClick={() => setMenu(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </Button>
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
                  <FlavourTile
                    name={name}
                    photo=""
                    resolvedPhoto={till.photos[i] ?? ''}
                    price={String(p.priceText)}
                    count={count}
                    state={p.soldOut && !count ? 'soldOut' : count ? 'inCart' : 'idle'}
                    meta={
                      <span className="text-caption text-ink-mute tabular-nums">{p.left} left</span>
                    }
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

        <div className="sticky bottom-3 z-10 flex items-center gap-2.5 rounded-card border border-line bg-surface/95 p-3 pl-4 shadow-lift backdrop-blur lg:top-3 lg:bottom-auto lg:col-start-2 lg:row-start-3">
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

      {menu ? (
        <Sheet title={String(v.event?.name ?? 'Till')} onClose={() => setMenu(false)}>
          <div className="flex flex-col gap-1">
            {menuItems.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={pick(m.run)}
                className="flex min-h-14 items-center gap-3 rounded-control px-1 text-left hover:bg-raise"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-body font-bold text-ink">{m.label}</span>
                  <span className="text-caption text-ink-mute">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}

      {sale ? (
        <Sheet
          title="This sale"
          onClose={closeSale}
          footer={
            <div className="flex flex-col gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  closeSale();
                  sale.void();
                }}
              >
                Void this sale
              </Button>
              <Button variant="ghost" onClick={closeSale}>
                Keep it
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-1">
            <span className="text-body font-bold text-ink">{sale.summary}</span>
            <span className="text-title tabular-nums">{sale.totalText}</span>
            <span className="text-caption text-ink-mute">
              <SaleMeta sale={sale} />
            </span>
            <span className="text-caption text-ink-soft">
              Voiding puts its cookies back on the table.
            </span>
          </div>
        </Sheet>
      ) : null}

      {panel ? <TillPanel panel={panel} /> : null}
    </>
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
