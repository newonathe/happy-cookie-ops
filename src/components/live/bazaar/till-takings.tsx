'use client';

import { useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { TillLedger, TillLedgerRow } from '@/lib/bazaar/till-ledger';
import { Button } from '@/components/ui/button';
import { PANEL_CLASS, PanelHead } from '@/components/ui/owner-kit';
import { FactRow } from '@/components/ui/owner-patterns';
import { ProgressBar } from '@/components/ui/progress-bar';

type Sale = OpsVals['bzSales'][number];

/** How many sales show before "See all". */
const SALES_SHOWN = 5;

/** A tracker: the one figure it answers, then what makes it up. */
function Tracker({
  title,
  label,
  value,
  children
}: {
  title: string;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-label={title} className={`flex min-w-0 flex-col ${PANEL_CLASS}`}>
      <PanelHead title={title} />
      <div className="flex flex-col gap-0.5 px-4 pt-3">
        <span className="text-caption text-ink-mute">{label}</span>
        <span className="text-title text-ink tabular-nums">{value}</span>
      </div>
      <div className="px-4 pb-1.5">{children}</div>
    </section>
  );
}

/**
 * The day at a glance, each figure once: what came in and how it was paid, what the drawer should hold now, and how far the
 * day is towards selling the whole table. A helper who may not see totals gets the drawer and the cookies only.
 */
function Trackers({ ledger, unsynced }: { ledger: TillLedger; unsynced: number }) {
  const { totals, drawer, target, cookies } = ledger;
  return (
    <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
      {totals ? (
        <Tracker title="Takings" label="Total sales so far" value={totals.totalText}>
          {totals.methods.map((method) => (
            <FactRow key={method.label} label={method.label} detail={plural(method.count, 'sale')}>
              {method.totalText}
            </FactRow>
          ))}
          {totals.averageText ? <FactRow label="Average sale">{totals.averageText}</FactRow> : null}
          {totals.discountsText ? (
            <FactRow label="Discounts given">{totals.discountsText}</FactRow>
          ) : null}
        </Tracker>
      ) : null}
      <Tracker title="Cash drawer" label="Should be in the drawer now" value={drawer.expectedText}>
        <FactRow label="Starting cash">{drawer.floatText ?? 'Not recorded'}</FactRow>
        <FactRow label="Cash sales">{drawer.cashSalesText}</FactRow>
        {drawer.receivedText ? (
          <FactRow label="Cash received">{drawer.receivedText}</FactRow>
        ) : null}
        {drawer.changeGivenText ? (
          <FactRow label="Change given">{drawer.changeGivenText}</FactRow>
        ) : null}
        <p className="py-2 text-caption text-ink-mute">
          Cash taken out for fees is not subtracted here.
        </p>
      </Tracker>
      <Tracker
        title="Target"
        label={target ? 'Target revenue' : 'Cookies sold'}
        value={target ? target.amountText : cookies.sold}
      >
        {target ? (
          <div className="flex flex-col gap-1.5 pt-2 pb-1">
            <ProgressBar
              value={target.reachedCents}
              max={target.amountCents}
              label={`${target.percent}% reached`}
            />
            <span className="text-caption text-ink-mute">
              Target: every cookie on the table sold.
            </span>
          </div>
        ) : null}
        {target ? <FactRow label="Still to sell">{target.toGoText}</FactRow> : null}
        {target ? <FactRow label="Cookies sold">{cookies.sold}</FactRow> : null}
        <FactRow label="Cookies left">{cookies.left}</FactRow>
        {cookies.freebies ? <FactRow label="Freebies given">{cookies.freebies}</FactRow> : null}
        {unsynced ? <FactRow label="Waiting to send">{plural(unsynced, 'sale')}</FactRow> : null}
      </Tracker>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The columns of the sales table, on its header and on every row, once it has the room. */
const COLUMNS =
  '@4xl:grid-cols-[48px_72px_minmax(0,1fr)_68px_84px_78px_66px_82px_104px_14px] @4xl:gap-x-3';

/** An empty table cell. On a phone there is no column to fill, so it is not drawn. */
function Blank({ right }: { right?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`hidden text-ink-faint @4xl:inline ${right ? '@4xl:text-right' : ''}`}
    >
      —
    </span>
  );
}

/**
 * One sale, one row. With room it is a table row; on a phone the same cells stack. Opening it shows every cookie with its
 * amounts, who sold it, and the way to void it. A sale that could not be sent keeps "Send again" in view.
 */
function SaleRow({
  sale,
  row,
  number,
  open,
  toggle,
  toVoid
}: {
  sale: Sale;
  row: TillLedgerRow | undefined;
  number: number;
  open: boolean;
  toggle: () => void;
  toVoid: () => void;
}) {
  const given = row?.cashGivenText ?? null;
  const change = row?.changeText ?? null;
  const reference = sale.refText ? String(sale.refText).replace(/^ref /, '') : null;
  return (
    <div data-part="sale" className="border-b border-divide last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Sale ${number}, ${String(sale.totalText)}, ${String(sale.pay)}`}
        onClick={toggle}
        className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${COLUMNS}`}
      >
        <span className="col-start-1 row-start-1 flex items-baseline gap-2 @4xl:contents">
          <span className="text-[14px] font-semibold text-ink">
            <span className="@4xl:hidden">Sale </span>
            {number}
          </span>
          <span className="text-caption text-ink-mute tabular-nums">{row?.whenText}</span>
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 @4xl:col-span-1 @4xl:row-start-auto">
          {row?.lines.length ? (
            row.lines.map((line, i) => (
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
        <span className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-baseline gap-x-2 text-caption text-ink-soft @4xl:contents">
          <span className="text-[14px] text-ink">{sale.pay}</span>
          {reference ? (
            <span className="min-w-0 truncate tabular-nums">
              <span className="@4xl:hidden">Ref </span>
              {reference}
            </span>
          ) : (
            <Blank />
          )}
          {given ? (
            <span className="tabular-nums @4xl:text-right">
              {given === 'Exact' ? null : <span className="@4xl:hidden">Given </span>}
              {given}
            </span>
          ) : (
            <Blank right />
          )}
          {change ? (
            <span className="tabular-nums @4xl:text-right">
              <span className="@4xl:hidden">Change </span>
              {change}
            </span>
          ) : (
            <Blank right />
          )}
        </span>
        <span className="col-start-2 row-start-1 text-right text-[15px] font-semibold text-ink tabular-nums @4xl:col-start-auto @4xl:row-start-auto">
          {sale.totalText}
        </span>
        <span
          className={`col-start-2 row-start-3 flex items-center justify-end gap-1.5 text-caption @4xl:col-start-auto @4xl:row-start-auto @4xl:justify-start ${sale.bad ? 'font-semibold text-danger' : 'text-ink-soft'}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${sale.bad ? 'bg-danger' : sale.ok ? 'bg-ok' : 'bg-warn-dot'}`}
          />
          {sale.stateText}
        </span>
        <span aria-hidden="true" className="hidden text-ink-faint @4xl:block">
          {open ? '⌄' : '›'}
        </span>
      </button>
      {sale.bad ? (
        <div className="flex justify-end px-4 pb-3">
          <Button variant="danger" size="sm" onClick={sale.retry}>
            Send again
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="grid grid-cols-1 gap-x-8 border-t border-divide bg-raise px-4 py-2 @2xl:grid-cols-2">
          <div>
            {row?.lines.map((line, i) => (
              <FactRow
                key={i}
                label={`${line.qty}× ${line.name}`}
                detail={line.unitText ? `${line.unitText} each` : undefined}
              >
                {line.lineText ?? '—'}
              </FactRow>
            ))}
            {row?.subtotalText ? (
              <FactRow label="Before discount">{row.subtotalText}</FactRow>
            ) : null}
            {row?.discountText ? <FactRow label="Discount">{row.discountText}</FactRow> : null}
            <FactRow label="Total">{sale.totalText}</FactRow>
          </div>
          <div>
            <FactRow label="Paid by">{sale.pay}</FactRow>
            {reference ? <FactRow label="Reference">{reference}</FactRow> : null}
            {given ? <FactRow label="Cash given">{given}</FactRow> : null}
            {change ? <FactRow label="Change">{change}</FactRow> : null}
            {sale.clerk ? <FactRow label="Sold by">{sale.clerk}</FactRow> : null}
            <div className="flex justify-end py-2.5">
              <Button variant="secondary" size="sm" onClick={toVoid}>
                Void this sale
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The bottom of the till: the trackers, then every sale, newest first. */
export function TillTakings({
  v,
  ledger,
  open,
  setOpen,
  voidSale
}: {
  v: OpsVals;
  ledger: TillLedger;
  /** The till holds this, so the summary stays as she left it after voiding a sale or opening a form. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Takes the sale's index in `v.bzSales`. */
  voidSale: (index: number) => void;
}) {
  const sales = v.bzSales ?? [];
  const [all, setAll] = useState(false);
  // The opened row, counted from the oldest: the list is newest first, so a new sale cannot move it.
  const [openFromOldest, setOpenFromOldest] = useState<number | null>(null);
  const shown = all ? sales : sales.slice(0, SALES_SHOWN);
  return (
    <div className="@container flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-raise focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${PANEL_CLASS}`}
      >
        <span className="text-[15px] font-semibold text-ink">{"Today's summary"}</span>
        <span className="flex items-center gap-x-4">
          {/* Retracted, the bar still answers the day's three questions; open, the panels below do. */}
          {open ? null : (
            <span className="flex flex-wrap justify-end gap-x-4 text-caption text-ink-mute tabular-nums">
              <span>{plural(sales.length, 'sale')}</span>
              {ledger.totals ? (
                <span>
                  Total <span className="font-semibold text-ink">{ledger.totals.totalText}</span>
                </span>
              ) : null}
              <span>
                In the drawer{' '}
                <span className="font-semibold text-ink">{ledger.drawer.expectedText}</span>
              </span>
            </span>
          )}
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 text-ink-mute ${open ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? <Trackers ledger={ledger} unsynced={Number(v.unsynced) || 0} /> : null}
      {open ? (
        <section aria-label="Recent sales" className={PANEL_CLASS}>
          <PanelHead title="Recent sales">
            <span className="text-caption text-ink-mute">
              {sales.length ? `${plural(sales.length, 'sale')} today` : 'No sales yet'}
            </span>
          </PanelHead>
          {sales.length ? (
            <div
              aria-hidden="true"
              className={`hidden items-center border-b border-divide bg-raise px-4 py-2 text-caption font-semibold text-ink-mute @4xl:grid ${COLUMNS}`}
            >
              <span>Sale</span>
              <span>Time</span>
              <span>Cookies</span>
              <span>Payment</span>
              <span>Reference</span>
              <span className="text-right">Cash given</span>
              <span className="text-right">Change</span>
              <span className="text-right">Total</span>
              <span>Status</span>
              <span />
            </div>
          ) : null}
          {shown.map((sale, i) => {
            const fromOldest = sales.length - 1 - i;
            return (
              <SaleRow
                key={fromOldest}
                sale={sale}
                row={ledger.rows[i]}
                number={sales.length - i}
                open={openFromOldest === fromOldest}
                toggle={() => setOpenFromOldest(openFromOldest === fromOldest ? null : fromOldest)}
                toVoid={() => voidSale(i)}
              />
            );
          })}
          {sales.length > SALES_SHOWN ? (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll(!all)}
              className="min-h-11 w-full bg-raise text-caption font-semibold text-ink-soft"
            >
              {all ? 'Show fewer' : `See all ${sales.length} sales`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
