'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { PANEL_CLASS, PanelHead } from '@/components/ui/owner-kit';
import { Sheet } from '@/components/ui/sheet';
import theme from '../owner-theme.module.css';

/** "8 cookies" */
function cookieCount(v: OpsVals): string {
  const n = Number(v.bzCartCount) || 0;
  return `${n} ${n === 1 ? 'cookie' : 'cookies'}`;
}

/**
 * The same sale at every width: each cookie with its price, how many, and what that comes to, then the total about to be
 * charged. All amounts and actions remain the till's own.
 */
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
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] text-ink-soft">Total</span>
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
        className={`hidden flex-col ${PANEL_CLASS} lg:sticky lg:top-[76px] lg:flex lg:max-h-[calc(100dvh-88px)]`}
      >
        <PanelHead title="Current sale">
          <span className="text-caption text-ink-mute">{cookieCount(v)}</span>
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
