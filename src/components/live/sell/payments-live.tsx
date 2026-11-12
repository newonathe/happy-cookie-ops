'use client';

import { useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { PageTitle, Panel } from '@/components/ui/owner-kit';
import { isLiveMode } from '@/lib/config/app-mode';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { readAtText } from '@/lib/time/read-at-text';
import { SellSettings, SellTabs } from './sell-shared';

/**
 * Payments (client v4): tick each reference you can see in your wallet app. A tick is the owner's
 * own check against the wallet; it never confirms an order or moves money.
 */
export function PaymentsLive({ v }: { v: OpsVals }) {
  // HCB-002d: the references come from the order read. Until it has answered, nothing is matched,
  // totalled or called empty, and a list that could not be refreshed is never called complete.
  // Mirrors the Orders page (orders-live.tsx); demo mode has no reader and is unchanged.
  const read = useSyncExternalStore(ordersRead.subscribe, ordersRead.get, ordersRead.getServer);
  const notRead =
    read.phase === 'loading' || (read.phase === 'idle' && isLiveMode() && !!v.ownerView);
  const failedFirst = read.phase === 'failed' && !read.everRead;
  const stale = read.phase === 'failed' && read.everRead && read.readAt !== null;
  const retry = read.retry ? { label: 'Try again', onPress: read.retry } : undefined;
  const header = (
    <>
      <PageTitle
        title="Payments"
        subtitle="Open your wallet activity, then tick each reference you can see landing."
        actions={<SellSettings v={v} />}
      />
      <SellTabs v={v} />
    </>
  );
  if (notRead || failedFirst)
    return (
      <div className="w-full">
        {header}
        {failedFirst ? (
          <Banner tone="warn" title={STAFF_COPY.ordersReadFailed} action={retry} />
        ) : (
          <Panel>
            <p role="status" className="text-[15px] text-ink">
              {STAFF_COPY.ordersNotRead}
            </p>
          </Panel>
        )}
      </div>
    );
  return (
    <div className="w-full">
      {header}
      {stale ? (
        <div className="mb-4">
          <Banner
            tone="warn"
            title={STAFF_COPY.ordersStale(readAtText(read.readAt as number))}
            action={retry}
          />
        </div>
      ) : null}
      {read.dropped > 0 ? (
        // As on Orders: a good read that had to leave an unreadable order out says so (review note, HCB-002d).
        <div className="mb-4">
          <Banner tone="warn" title={STAFF_COPY.ordersDropped(read.dropped)} />
        </div>
      ) : null}

      <Panel tone="hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-semibold text-ink">{v.recLeftText}</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={v.recTickAll}>
              Tick all
            </Button>
            <Button variant="ghost" size="sm" onClick={v.recClear}>
              Start over
            </Button>
          </span>
        </div>
        {(v.recMethods ?? []).length ? (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-3">
            {(v.recMethods ?? []).map((method, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-caption text-ink-mute">{method.pay}</span>
                <span className="text-[17px] font-semibold text-ink tabular-nums">
                  {method.totalText}
                </span>
                {method.done ? (
                  <span className="text-caption font-semibold text-ok">
                    All matched · {method.n}
                  </span>
                ) : null}
                {method.leftText ? (
                  <span className="text-caption text-ink-mute">{method.leftText} unticked</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="References">
        {(v.recRows ?? []).length === 0 ? (
          <p className="text-caption text-ink-mute">No payment references to check.</p>
        ) : (
          <ul className="flex flex-col">
            {(v.recRows ?? []).map((row, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={!!row.ticked}
                  onChange={row.toggle}
                  aria-label={`Tick ${String(row.ref)}`}
                  className="size-6 shrink-0 accent-[var(--color-brand)]"
                />
                <button
                  type="button"
                  onClick={row.open}
                  className="flex min-w-0 flex-1 basis-40 flex-col text-left focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span className="text-[14px] font-semibold break-all text-ink">{row.ref}</span>
                  <span className="text-caption text-ink-mute">
                    {row.id} · {row.name} · {row.pay}
                  </span>
                </button>
                {row.pending ? (
                  <span className="text-caption font-semibold text-warn">Not confirmed</span>
                ) : null}
                {row.flagged ? (
                  <span className="text-caption font-semibold text-danger">{row.flagText}</span>
                ) : null}
                <span className="text-[14px] font-semibold text-ink tabular-nums">
                  {row.amountText}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[14px] font-semibold text-ink">Total in the book</span>
          <span className="text-[17px] font-semibold text-ink tabular-nums">{v.recTotalText}</span>
        </div>
      </Panel>

      {v.recAllDone && !stale && !(read.dropped > 0) ? (
        <Banner
          tone="info"
          title="Every reference is accounted for"
          body="Do this the same day: GCash only keeps the last 15 transactions on screen."
        />
      ) : null}
    </div>
  );
}
