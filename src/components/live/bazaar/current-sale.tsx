'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { PANEL_CLASS, PanelHead } from '@/components/ui/owner-kit';
import { Sheet } from '@/components/ui/sheet';
import theme from '../owner-theme.module.css';

/** The same editable sale at every width; all amounts and actions remain the till's own. */
function SaleContents({
  v,
  onCharge,
  onFreebie
}: {
  v: OpsVals;
  onCharge?: () => void;
  onFreebie?: () => void;
}) {
  const rows = (v.bzSell ?? []).filter((row) => (Number(row.inCart) || 0) > 0);
  return (
    <div>
      {rows.length ? (
        <ul className="flex flex-col px-4">
          {rows.map((row) => (
            <li
              key={String(row.name)}
              className="flex items-center justify-between gap-3 border-b border-divide py-2.5 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold text-ink">{row.name}</span>
                <span className="text-caption text-ink-mute tabular-nums">
                  {row.priceText} each
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-control border border-line px-1">
                <Button
                  variant="ghost"
                  size="sm"
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
                  aria-label={`One more ${String(row.name)} in this sale`}
                  onClick={row.tap}
                  disabled={!!row.soldOut}
                >
                  +
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-caption text-ink-mute">
          Tap a cookie to start a sale.
        </p>
      )}
      <div className="flex flex-col gap-2.5 border-t border-divide p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] text-ink-soft">Total</span>
          <span className="text-title tabular-nums">{v.bzCartTotalNum}</span>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={onCharge ?? v.openPay}
          disabled={!Number(v.bzCartCount)}
        >
          Charge {v.bzCartTotalNum}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={onFreebie ?? v.recordFreebie}
          disabled={!Number(v.bzCartCount)}
        >
          Freebie
        </Button>
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
  return (
    <>
      <aside
        aria-label="Current sale"
        className={`hidden flex-col ${PANEL_CLASS} lg:sticky lg:top-3 lg:col-start-2 lg:row-start-3 lg:flex`}
      >
        <PanelHead title="Current sale">
          {Number(v.bzCartCount) ? (
            <span className="text-caption text-ink-mute">{v.bzCartCount} in this sale</span>
          ) : null}
        </PanelHead>
        <SaleContents v={v} />
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
