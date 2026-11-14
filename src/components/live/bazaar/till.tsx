'use client';

import { Component, useCallback, useRef, useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { TillPanelView } from '@/lib/bazaar/live-bazaar-types';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FooterActions, PageTitle, Panel, SectionHeading } from '@/components/ui/owner-kit';
import { FactRow, OpenRow } from '@/components/ui/owner-patterns';
import { saleLines } from '@/lib/bazaar/sale-lines';
import { TillCard } from './till-card';
import { CurrentSale } from './current-sale';
import { TillTakings } from './till-takings';
import { TillPanelPage, TillBack } from './till-bar';

type Till = NonNullable<OpsVals['liveTill']>;
type Sale = OpsVals['bzSales'][number];

/**
 * HCB-005: tells the toast how tall the sale bar is (`--till-sale-bar`), so a message stands above Charge and never on it.
 * Set while the bar is drawn and taking room; removed when it unmounts or is hidden (`lg:hidden`, height 0).
 */
function watchSaleBar(el: HTMLElement): () => void {
  const root = document.documentElement;
  const write = () => {
    const height = Math.ceil(el.getBoundingClientRect().height);
    if (height > 0) root.style.setProperty('--till-sale-bar', `${height}px`);
    else root.style.removeProperty('--till-sale-bar');
  };
  write();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write);
  observer?.observe(el);
  return () => {
    observer?.disconnect();
    root.style.removeProperty('--till-sale-bar');
  };
}

/**
 * The consolidated till (Ethan, 19 October 2026; mockups K5nHQS8GjtBYGseDtYZDnZ). Only the look is new: every control
 * calls the handler the ported Bazaar Mode screen calls, from the same `v`, so selling, the offline queue and the close
 * are unchanged. The ported screen stays one tap away ("Use the classic till") and takes over if this one throws.
 *
 * A card adds one when tapped. The sale sits beside the cards with its steppers, Freebie and Charge (on a phone, behind a
 * bar that stays in view). Under them are the day's trackers and every sale; a sale is voided from its row, after a confirm.
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
  const unwatchSaleBar = useRef<(() => void) | null>(null);
  const saleBarRef = useCallback((el: HTMLDivElement | null) => {
    unwatchSaleBar.current?.();
    unwatchSaleBar.current = el ? watchSaleBar(el) : null;
  }, []);
  const [menu, setMenu] = useState(false);
  // The open sale, counted from the oldest: the list is newest first, so a sale arriving cannot move it.
  const [saleFromOldest, setSaleFromOldest] = useState<number | null>(null);
  const [voiding, setVoiding] = useState(false);
  const sales = v.bzSales ?? [];
  const [reviewSale, setReviewSale] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const sale = saleFromOldest === null ? undefined : sales[sales.length - 1 - saleFromOldest];
  const closeSale = () => setSaleFromOldest(null);
  const pick = (run: () => void) => () => {
    setMenu(false);
    run();
  };
  const menuItems: Array<{ label: string; hint: string; run: () => void }> = [
    {
      label: 'Review and close the day',
      hint: 'Count the drawer, settle the leftovers',
      run: v.askClose
    },
    ...(till.changePrice
      ? [
          {
            label: 'Change a price',
            hint: 'For the rest of this day. Needs signal',
            run: till.changePrice
          }
        ]
      : []),
    ...(till.home
      ? [{ label: 'Back to Home', hint: 'The day keeps selling', run: till.home }]
      : []),
    {
      label: 'Use the classic till',
      hint: 'The till from before, on this phone',
      run: () => till.setClassic(true)
    },
    ...(till.leave && !v.unsynced
      ? [{ label: 'Leave this event', hint: 'An event from before bazaar days', run: till.leave }]
      : [])
  ];

  if (panel) return <TillPanelPage panel={panel} />;
  if (sale && voiding)
    return (
      <VoidPage
        sale={sale}
        keep={() => {
          setVoiding(false);
          closeSale();
        }}
        confirm={() => {
          setVoiding(false);
          closeSale();
          sale.void();
        }}
      />
    );
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
        className="flex flex-col gap-3 lg:gap-3"
      >
        <div>
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
                <Button variant="secondary" onClick={() => setMenu(true)}>
                  Settings
                </Button>
              </>
            }
          />
        </div>

        {v.syncBanner ? (
          <div>
            <SyncNotice v={v} />
          </div>
        ) : null}

        {/* Their own grid, so the sale stays in view beside the cookies and stops where they stop. On a phone the wrapper
          steps aside and the sale bar below stays the section's last child, pinned the whole way down. */}
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
          <section
            aria-label="Cookies on the table"
            className="@container order-1 min-w-0 lg:order-none"
          >
            {till.allGone ? (
              <div className="mb-3">
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
              </div>
            ) : null}
            {(v.bzSell ?? []).length ? (
              <div className="grid grid-cols-2 gap-2.5 @lg:grid-cols-3 @lg:gap-3">
                {(v.bzSell ?? []).map((p, i) => {
                  const name = String(p.name);
                  const count = Number(p.inCart) || 0;
                  return (
                    <TillCard
                      key={name}
                      name={name}
                      photo={till.photos[i] ?? ''}
                      price={String(p.priceText)}
                      left={p.left}
                      count={count}
                      soldOut={!!p.soldOut && !count}
                      onPress={p.tap}
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Nothing is on the table"
                body={
                  till.addCookies
                    ? 'Add cookies to start selling.'
                    : 'Tell the owner to add cookies.'
                }
                action={
                  till.addCookies ? { label: 'Add cookies', onPress: till.addCookies } : undefined
                }
              />
            )}
          </section>

          <CurrentSale v={v} mobileOpen={reviewSale} closeMobile={() => setReviewSale(false)} />
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-3 lg:order-none">
          <TillTakings
            v={v}
            ledger={till.ledger}
            open={summaryOpen}
            setOpen={setSummaryOpen}
            voidSale={(index) => {
              setSaleFromOldest(sales.length - 1 - index);
              setVoiding(true);
            }}
          />
          <div className="flex flex-wrap justify-between gap-2 border-t border-divide pt-3">
            {till.addCookies ? (
              <Button variant="secondary" onClick={till.addCookies}>
                Add cookies
              </Button>
            ) : null}
            <Button variant="secondary" onClick={v.openEventExpense}>
              Fees and expenses
            </Button>
          </div>
        </div>

        {Number(v.bzCartCount) ? (
          <div
            ref={saleBarRef}
            data-part="sale-bar"
            style={{ bottom: 'calc(var(--workspace-dock, 0px) + 12px)' }}
            className="order-4 sticky z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface/95 p-3 shadow-lift backdrop-blur lg:hidden"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-caption text-ink-soft">{v.bzCartCount} in this sale</span>
              <span className="text-title tabular-nums">{till.cartTotalText}</span>
            </span>
            <Button variant="secondary" onClick={() => setReviewSale(true)}>
              Review sale
            </Button>
            <Button variant="primary" size="lg" className="col-span-2 w-full" onClick={v.openPay}>
              Charge {till.cartTotalText}
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
        {/* The engine's line always says "1 sale"; the count here is the real one. */}
        {v.syncPartial && Number(v.unsynced) > 1
          ? `${String(v.unsynced)} sales could not be sent — nothing was lost`
          : v.syncText}
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
