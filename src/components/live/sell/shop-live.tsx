'use client';

import { useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Button } from '@/components/ui/button';
import { PageTitle, Panel, SectionHeading, TaskRow } from '@/components/ui/owner-kit';
import { OpenRow } from '@/components/ui/owner-patterns';
import { SellTabs } from './sell-shared';
import { ShopOverrideNotice } from '@/components/live/shop-override-notice';
import { CustomerStatusExample } from '@/components/live/customer/status-example';
import { CatalogueNotice, useCatalogueHeld } from '@/components/live/bazaar/catalogue-notice';
import { STAFF_COPY } from '@/lib/orders/staff-copy';

type Entry = NonNullable<NonNullable<OpsVals['liveScreen']>['tabs']>['entries'][number];

/** What each Shop row is called and is for. The action behind it is the existing entry. */
const ROWS: Readonly<Record<string, { title?: string; detail: string }>> = {
  'Order rules': { detail: 'Pickup days and times, and how long unpaid orders hold' },
  'Boxes & add-ons': { detail: 'Sampler flavours, box sizes and extras' },
  'Payment methods': { detail: 'How customers pay, and the details they see' },
  'Shop texts': {
    title: 'Shop details & messages',
    detail: 'Words customers see in your shop'
  }
};
const FIRST = ['Order rules', 'Boxes & add-ons'];
const STATUS = 'Shop status';
const PREVIEWS: ReadonlyArray<readonly [string, string]> = [
  ['Preview shop', 'Preview shop'],
  ['Preview checkout', 'Checkout'],
  ['Preview order status', 'Order status']
];
const KNOWN = new Set([STATUS, ...Object.keys(ROWS), ...PREVIEWS.map(([id]) => id)]);

function entryRow(entry: Entry | undefined) {
  if (!entry) return null;
  const row = ROWS[String(entry.label)];
  return (
    <OpenRow
      key={String(entry.id)}
      title={row?.title ?? entry.label}
      detail={row?.detail}
      onOpen={entry.go}
    />
  );
}

/** This drop: orders against capacity, the cookie limit, what is sold out, and past drops. */
function ScheduleAndDrop({ v, onBack }: { v: OpsVals; onBack: () => void }) {
  const { drop, drop2 } = v;
  // HCB-004: the menu is her products; until they are read the built-in six are not listed as hers.
  const catalogue = useCatalogueHeld(v.catalogueHeld);
  const week = (v.settingsGroups ?? [])
    .flatMap((group) => group.rows ?? [])
    .find((row) => row.label === 'Drop schedule');
  return (
    <div className="w-full">
      <PageTitle title="Opening schedule & drop" subtitle={String(drop2.scheduleLine)} />
      {!v.sheet?.isCloseDrop ? <ShopOverrideNotice value={v.liveShopOverride} /> : null}
      <Panel tone="hero">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-[17px] font-semibold text-ink">{drop2.no}</span>
          <span className="text-caption font-semibold text-ink-soft">
            {drop2.stateText}
            {drop2.extended ? ' · Extended' : ''}
          </span>
        </span>
        <p className="mt-3 text-[15px] text-ink">
          <span className="text-[26px] font-semibold tabular-nums">{drop2.capNum}</span> of{' '}
          {drop2.capValue} cookies confirmed
        </p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-chip" aria-hidden="true">
          <span style={s(drop.barConfirmed)} />
          <span style={s(drop.barPending)} />
        </div>
        <p className="mt-2 text-caption text-ink-mute">
          {drop.pendingText} · {drop.leftText}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <span className="flex items-center gap-2">
            <span className="text-caption font-semibold text-ink-soft">Cookies per drop</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={drop2.capDown}
              aria-label="Lower capacity"
            >
              −
            </Button>
            <input
              value={drop2.capInput}
              onChange={drop2.setCap}
              inputMode="numeric"
              aria-label="Weekly capacity in cookies"
              className="h-11 w-16 rounded-control border border-line-strong bg-surface text-center text-[16px] font-semibold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-brand"
            />
            <Button variant="secondary" size="sm" onClick={drop2.capUp} aria-label="Raise capacity">
              +
            </Button>
          </span>
          <span className="flex flex-wrap gap-2">
            {drop.open ? (
              <Button variant="secondary" size="sm" onClick={drop2.closeEarly}>
                Close ordering
              </Button>
            ) : null}
            {drop2.closed ? (
              <Button variant="primary" size="sm" onClick={drop2.reopen}>
                Open ordering
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={drop2.preview}>
              See the shop
            </Button>
          </span>
        </div>
      </Panel>

      {week ? (
        <Panel>
          <OpenRow title="Ordering week" detail={week.value} onOpen={week.go} />
        </Panel>
      ) : null}

      <SectionHeading>This drop&apos;s menu</SectionHeading>
      {catalogue.held ? (
        <Panel>
          <ul className="flex flex-col">
            {(v.dropProducts ?? []).map((product, i) => (
              <li
                key={i}
                className="flex min-h-14 flex-wrap items-center gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 basis-40 flex-col">
                  <span className="text-[14px] font-semibold text-ink">{product.name}</span>
                  <span className="text-caption text-ink-mute tabular-nums">
                    {product.priceText}
                  </span>
                </span>
                {product.soldOut ? (
                  <span className="text-caption font-semibold text-danger">Sold out</span>
                ) : null}
                <Button variant="secondary" size="sm" onClick={product.toggleSold}>
                  {product.soldLabel}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <CatalogueNotice
          failed={catalogue.failed}
          retry={catalogue.retry}
          copy={{
            notRead: STAFF_COPY.shopMenuCatalogueNotRead,
            failed: STAFF_COPY.shopMenuCatalogueFailed
          }}
        />
      )}

      {(v.pastDrops ?? []).length ? (
        <>
          <SectionHeading>Past drops</SectionHeading>
          <Panel>
            <ul className="flex flex-col">
              {(v.pastDrops ?? []).map((past, i) => (
                <li key={i} className="flex flex-col border-b border-line py-2 last:border-b-0">
                  <span className="text-[14px] font-semibold text-ink">
                    {past.label} <span className="font-normal text-ink-mute">{past.when}</span>
                  </span>
                  <span className="text-caption text-ink-mute">{past.detail}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
      <Button variant="secondary" onClick={onBack}>
        Back to Shop
      </Button>
    </div>
  );
}

/**
 * Shop (client v4): two lists of settings, each with one Open. This drop's numbers sit one step
 * down, on Opening schedule & drop; the sheets and engine values behind every row are unchanged.
 */
export function ShopLive({ v }: { v: OpsVals }) {
  const [schedule, setSchedule] = useState(false);
  const [statusExample, setStatusExample] = useState(false);
  if (statusExample) return <CustomerStatusExample v={v} back={() => setStatusExample(false)} />;
  if (schedule) return <ScheduleAndDrop v={v} onBack={() => setSchedule(false)} />;
  const entries = (v.liveScreen?.tabs?.entries ?? []).filter((entry) => !entry.primary);
  const find = (label: string) => entries.find((entry) => entry.label === label);
  const status = find(STATUS);
  const previews = PREVIEWS.map(([id, label]) => [find(id), label] as const).filter(
    (pair): pair is readonly [Entry, string] => !!pair[0]
  );
  const others = entries.filter((entry) => !KNOWN.has(String(entry.label)));
  return (
    <div className="w-full">
      <PageTitle title="Shop" subtitle="Your customer-facing shop settings." />
      <SellTabs v={v} />
      {!v.sheet?.isCloseDrop ? <ShopOverrideNotice value={v.liveShopOverride} /> : null}
      <Panel>
        {status ? (
          <OpenRow title={status.label} detail={v.drop2.stateText} onOpen={status.go} />
        ) : null}
        {FIRST.map((label) => entryRow(find(label)))}
      </Panel>
      <SectionHeading>Payments, schedule &amp; appearance</SectionHeading>
      <Panel>
        {entryRow(find('Payment methods'))}
        <OpenRow
          title="Opening schedule & drop"
          detail="Open window, capacity and sold-out state"
          onOpen={() => setSchedule(true)}
        />
        {entryRow(find('Shop texts'))}
        {others.map((entry) => entryRow(entry))}
        {previews.length ? (
          <TaskRow
            title="Customer preview"
            detail="Shop, checkout and order status"
            action={
              <span className="flex flex-wrap justify-end gap-2">
                {previews.map(([entry, label]) => (
                  <Button
                    key={String(entry.id)}
                    variant="secondary"
                    onClick={
                      String(entry.label) === 'Preview order status'
                        ? () => setStatusExample(true)
                        : entry.go
                    }
                  >
                    {label}
                  </Button>
                ))}
              </span>
            }
          />
        ) : null}
      </Panel>
    </div>
  );
}

/** Shop status as a page: the same options and the same close-and-roll-over as the sheet it replaces. */
export function ShopStatusLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full">
      <Panel>
        <div role="group" aria-label="Shop status" className="flex flex-col gap-2">
          {(v.dropStateOptions ?? []).map((option, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={!!option.on}
              onClick={option.go}
              className="flex min-h-14 flex-col justify-center rounded-control border border-line-strong p-3 text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand aria-pressed:border-brand aria-pressed:bg-raise"
            >
              <span className="text-[14px] font-semibold text-ink">{option.label}</span>
              <span className="text-caption text-ink-mute">{option.what}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Finish this drop">
        <p className="text-caption text-ink-mute">
          Closing files this drop&apos;s takings into your P&amp;L history and starts the next one.
          Every order has to be finished first.
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={v.closeDropRollover}>
            Close {v.dropNoText} and open the next
          </Button>
        </div>
      </Panel>
      <Button variant="secondary" onClick={v.closeSheet}>
        Back to Shop
      </Button>
    </div>
  );
}
