'use client';

import { useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { PANEL_CLASS, PanelHead } from '@/components/ui/owner-kit';
import { Sheet } from '@/components/ui/sheet';
import theme from '../owner-theme.module.css';

/** "8 in this sale": true for cookies and for anything sold by the piece. */
function saleCount(v: OpsVals): string {
  return `${Number(v.bzCartCount) || 0} in this sale`;
}

/**
 * Freebie asks once (Ethan, 15 November 2026): a slip of the thumb must never give a sale away. The ported handler records
 * it, unchanged.
 */
function FreebieConfirm({ v, give, keep }: { v: OpsVals; give: () => void; keep: () => void }) {
  const n = Number(v.bzCartCount) || 0;
  return (
    <div
      role="group"
      aria-label="Give as a freebie"
      className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5"
    >
      <p className="m-0 text-[15px] font-semibold text-ink">Give these {n} free?</p>
      <p className="m-0 text-caption text-ink-soft">They leave the table and no money is taken.</p>
      <span className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={give}>
          Give {n} free
        </Button>
        <Button variant="secondary" onClick={keep}>
          Keep the sale
        </Button>
      </span>
    </div>
  );
}

/**
 * The same sale at every width: each cookie with its price, how many, and what that comes to, then the total about to be
 * charged. All amounts and actions remain the till's own.
 */
function SaleContents({
  v,
  onCharge,
  onFreebie,
  freebie,
  confirming = false,
  endConfirm
}: {
  v: OpsVals;
  onCharge?: () => void;
  onFreebie?: () => void;
  /** Where Freebie is offered: 'below' Charge behind a divider (phone), or 'none' when the panel's head offers it. */
  freebie: 'below' | 'none';
  /** The panel's head asked: show the confirm here. */
  confirming?: boolean;
  endConfirm?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  // An emptied sale drops a question left open, so the next sale never opens on it.
  const inSale = Number(v.bzCartCount) || 0;
  const [seen, setSeen] = useState(inSale);
  if (seen !== inSale) {
    setSeen(inSale);
    if (!inSale) setAsking(false);
  }
  const rows = (v.bzSell ?? []).filter((row) => (Number(row.inCart) || 0) > 0);
  const lineOf = v.liveTill?.cartLines ?? {};
  const total = v.liveTill?.cartTotalText ?? v.bzCartTotalNum;
  return (
    <div className="flex min-h-0 flex-col">
      {rows.length ? (
        <ul className="flex min-h-0 flex-col overflow-y-auto px-4">
          {rows.map((row) => (
            <li
              key={String(row.name)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-divide py-2.5 last:border-b-0"
            >
              <span className="text-[14px] font-semibold text-ink">{row.name}</span>
              <span className="row-span-2 flex shrink-0 items-center gap-1 rounded-control border border-line px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[18px]! text-ink!"
                  aria-label={`One less ${String(row.name)} in this sale`}
                  onClick={row.minus}
                >
                  −
                </Button>
                <span className="w-5 text-center text-[14px] font-semibold text-ink tabular-nums">
                  {String(row.inCart)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[18px]! text-ink!"
                  aria-label={`One more ${String(row.name)} in this sale`}
                  onClick={row.tap}
                  disabled={!!row.soldOut}
                >
                  +
                </Button>
              </span>
              <span className="text-caption text-ink-mute tabular-nums">
                {row.priceText} each
                {lineOf[String(row.name)] ? (
                  <>
                    {' '}
                    ·{' '}
                    <span className="font-semibold text-ink-soft">{lineOf[String(row.name)]}</span>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-caption text-ink-mute">
          Choose a cookie to start.
        </p>
      )}
      <div className="flex flex-col gap-2.5 border-t border-divide p-4">
        {confirming ? (
          <FreebieConfirm
            v={v}
            give={() => {
              endConfirm?.();
              (onFreebie ?? v.recordFreebie)();
            }}
            keep={() => endConfirm?.()}
          />
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] text-ink-soft">{saleCount(v)}</span>
          <span className="text-title tabular-nums">{total}</span>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={onCharge ?? v.openPay}
          disabled={!Number(v.bzCartCount)}
        >
          Charge {total}
        </Button>
        {freebie === 'below' && Number(v.bzCartCount) ? (
          <div className="mt-1 flex flex-col gap-2 border-t border-dashed border-line-mute pt-3">
            {asking ? (
              <FreebieConfirm
                v={v}
                give={() => {
                  setAsking(false);
                  (onFreebie ?? v.recordFreebie)();
                }}
                keep={() => setAsking(false)}
              />
            ) : (
              <>
                <span className="text-caption text-ink-mute">Not a sale?</span>
                <Button variant="secondary" onClick={() => setAsking(true)}>
                  Freebie…
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CurrentSale({
  v,
  mobileOpen,
  closeMobile
}: {
  v: OpsVals;
  mobileOpen: boolean;
  closeMobile: () => void;
}) {
  // On a wide screen Freebie sits in the panel's head, away from Charge; its confirm shows above the total.
  const [confirming, setConfirming] = useState(false);
  const inSale = Number(v.bzCartCount) || 0;
  const [seen, setSeen] = useState(inSale);
  if (seen !== inSale) {
    setSeen(inSale);
    if (!inSale) setConfirming(false);
  }
  return (
    <>
      <aside
        aria-label="Current sale"
        className={`hidden flex-col ${PANEL_CLASS} lg:sticky lg:top-[76px] lg:flex lg:max-h-[calc(100dvh-88px)]`}
      >
        <PanelHead title="Current sale">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!inSale || confirming}
          >
            Freebie…
          </Button>
        </PanelHead>
        <SaleContents
          v={v}
          freebie="none"
          confirming={confirming && inSale > 0}
          endConfirm={() => setConfirming(false)}
        />
      </aside>
      {mobileOpen ? (
        <Sheet
          title="Current sale"
          className={theme.theme}
          onClose={closeMobile}
          footer={
            <Button variant="secondary" onClick={closeMobile}>
              Back to selling
            </Button>
          }
        >
          <SaleContents
            v={v}
            freebie="below"
            onCharge={() => {
              closeMobile();
              v.openPay();
            }}
            onFreebie={() => {
              closeMobile();
              v.recordFreebie();
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}
