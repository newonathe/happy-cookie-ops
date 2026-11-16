'use client';

import { useSyncExternalStore } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { GlassCard, SplitBar, type SplitPart } from '@/components/ui/glass';
import { PageTitle } from '@/components/ui/owner-kit';
import { Notice, Tile, stockGlass } from '@/components/live/stock/stock-glass';
import { isLiveMode } from '@/lib/config/app-mode';
import { ordersRead } from '@/lib/orders/orders-read-state';
import { STAFF_COPY } from '@/lib/orders/staff-copy';
import { readAtText } from '@/lib/time/read-at-text';
import { SellSettings, SellTabs } from './sell-shared';
import sg from './sell-glass.module.css';

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
  // The engine's "Everything matched" only counts the rows it was given, so it is never shown beside a list that is
  // incomplete: a good read that had to drop an order, or a refresh that failed after a good one.
  const partial =
    read.dropped > 0 ? STAFF_COPY.paymentsDropped : stale ? STAFF_COPY.paymentsStale : null;
  const retry = read.retry ? { label: 'Try again', onPress: read.retry } : undefined;
  const header = (
    <div className={sg.head}>
      <PageTitle
        onGround
        title="Payments"
        subtitle="Open your wallet activity, then tick each reference you can see landing."
        actions={<SellSettings v={v} />}
      />
      <SellTabs v={v} onGround />
    </div>
  );
  if (notRead || failedFirst)
    return (
      <div className={sg.page}>
        {header}
        {failedFirst ? (
          <Banner tone="warn" title={STAFF_COPY.ordersReadFailed} action={retry} />
        ) : (
          <Notice>
            <p role="status" className="text-body text-ink">
              {STAFF_COPY.ordersNotRead}
            </p>
          </Notice>
        )}
      </div>
    );
  const rows = v.recRows ?? [];
  const methods = v.recMethods ?? [];
  // Counts of the rows listed below, nothing more. A list that is incomplete shows no bar and no counts.
  const ticked = rows.filter((row) => !!row.ticked).length;
  const parts: SplitPart[] = [
    { id: 'ticked', label: 'Ticked', value: ticked, tone: 'bg-ok' },
    { id: 'unticked', label: 'Not ticked', value: rows.length - ticked, tone: 'bg-warn-dot' }
  ];
  return (
    <div className={sg.page}>
      {header}
      {stale || read.dropped > 0 ? (
        <div className={sg.flow}>
          {stale ? (
            <Banner
              tone="warn"
              title={STAFF_COPY.ordersStale(readAtText(read.readAt as number))}
              action={retry}
            />
          ) : null}
          {read.dropped > 0 ? (
            // As on Orders: a good read that had to leave an unreadable order out says so (review note, HCB-002d).
            <Banner tone="warn" title={STAFF_COPY.ordersDropped(read.dropped)} />
          ) : null}
        </div>
      ) : null}

      <GlassCard
        title="To check"
        action={
          <span className={stockGlass.headTools}>
            <Button variant="secondary" size="sm" onClick={v.recTickAll}>
              Tick all
            </Button>
            <Button variant="secondary" size="sm" onClick={v.recClear}>
              Start over
            </Button>
          </span>
        }
      >
        <p className="text-body font-semibold text-ink">
          {v.recAllDone && partial ? partial : v.recLeftText}
        </p>
        {rows.length && !partial ? <SplitBar parts={parts} /> : null}
        {rows.length && !partial ? (
          <div role="group" aria-label="References at a glance" className={sg.tiles}>
            <Tile label="References" labelFirst>
              {rows.length}
            </Tile>
            <Tile label="Ticked" tone="bg-ok" labelFirst>
              {ticked}
            </Tile>
            <Tile label="Not ticked" tone="bg-warn-dot" labelFirst>
              {rows.length - ticked}
            </Tile>
          </div>
        ) : null}
        {methods.length ? (
          <div className={sg.tiles}>
            {methods.map((method, i) => (
              <Tile key={i} label={String(method.pay)} textual>
                {method.totalText}
                {method.done && !partial ? (
                  <span className={cx(sg.tileNote, sg.ok)}>All matched · {method.n}</span>
                ) : null}
                {method.leftText ? (
                  <span className={sg.tileNote}>{method.leftText} unticked</span>
                ) : null}
              </Tile>
            ))}
          </div>
        ) : null}
      </GlassCard>

      <GlassCard title="References">
        {rows.length === 0 ? (
          <p className={sg.none}>No payment references to check.</p>
        ) : (
          <ul className={sg.list}>
            {rows.map((row, i) => (
              <li key={i} className={sg.item}>
                <label className={sg.tick}>
                  <input
                    type="checkbox"
                    checked={!!row.ticked}
                    onChange={row.toggle}
                    aria-label={`Tick ${String(row.ref)}`}
                    className="size-6 shrink-0 accent-[var(--color-brand)]"
                  />
                </label>
                <button type="button" onClick={row.open} className={sg.itemOpen}>
                  <span className="text-label font-semibold break-all text-ink">{row.ref}</span>
                  <span className="text-caption text-ink-mute">
                    {row.id} · {row.name} · {row.pay}
                  </span>
                </button>
                {row.pending ? (
                  <span className="text-label font-semibold text-warn">Not confirmed</span>
                ) : null}
                {row.flagged ? (
                  <span className="text-label font-semibold text-danger">{row.flagText}</span>
                ) : null}
                <span className={cx(sg.figureText, 'text-ink')}>{row.amountText}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={sg.foot}>
          <span className="text-label font-semibold text-ink">Total in the book</span>
          <span className={cx(sg.figureText, 'text-heading text-ink')}>{v.recTotalText}</span>
        </div>
      </GlassCard>

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
