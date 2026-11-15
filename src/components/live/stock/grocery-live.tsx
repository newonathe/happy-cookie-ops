'use client';

import { StockReadNotice } from './stock-read-notice';

import type { OpsVals } from '@/view-models/vals';
import type { GroceryRowView, LiveStockVals, StockItemView } from '@/lib/stock/live-stock-types';
import { OfflineLine, StatusWord, liveStockOf } from './stock-shared';
import { Notice, SubPage, Tile, stockGlass as G } from './stock-glass';
import { GlassCard, glassStyles } from '@/components/ui/glass';
import { ReceiveLive } from './stock-entry-live';
import { BAKE_PLAN_CATALOGUE_COPY, BakePlanNeeds, BakePlanPage } from './bake-plan-live';
import { CatalogueNotice, useCatalogueHeld } from '@/components/live/bazaar/catalogue-notice';
import { Button } from '@/components/ui/button';
import { SectionNavigation } from '@/components/live/section-navigation';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { FooterActions, PageTitle } from '@/components/ui/owner-kit';
import { OpenRow } from '@/components/ui/owner-patterns';

const NOTHING_TO_BUY = 'Nothing to buy';

function BuyRow({ row }: { row: GroceryRowView }) {
  const nothing = row.toBuyText === NOTHING_TO_BUY;
  return (
    <li className={`${G.buyRow} flex flex-wrap items-start justify-between gap-3`}>
      <span className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
          {row.name} <StatusWord status={row.status} />
        </span>
        <span className="text-caption text-ink-mute">
          {nothing ? (
            <>Have {row.haveText} recorded · not needed for the next bake</>
          ) : (
            <>
              Need {row.neededText} · have {row.haveText} recorded · buy {row.toBuyText}
            </>
          )}
        </span>
        {row.counted === false ? (
          <span className="text-caption text-ink-mute">
            Recorded balance has not been physically counted.
          </span>
        ) : null}
        <span className="text-caption text-ink-mute">
          {row.packText} · {row.bestPriceText}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {row.compare ? (
            <Button variant="ghost" size="sm" onClick={row.compare}>
              Compare prices<span className="sr-only"> for {row.name}</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={row.bought}
            aria-label={`Add to inventory: ${row.name}`}
          >
            Add to inventory
          </Button>
        </span>
      </span>
      {nothing ? null : (
        <span className="font-mono text-label font-semibold tabular-nums text-ink">
          {row.lineCostText}
        </span>
      )}
    </li>
  );
}

function SupplierGroup({
  name,
  rows,
  stock,
  onSupplier
}: {
  name: string;
  rows: GroceryRowView[];
  stock: LiveStockVals;
  onSupplier: () => void;
}) {
  return (
    <GlassCard title={name}>
      <ul aria-label={`To buy from ${name}`} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <BuyRow key={row.itemId} row={row} />
        ))}
      </ul>
      <FooterActions
        back={
          <Button variant="secondary" onClick={onSupplier}>
            View supplier
          </Button>
        }
        forward={
          stock.openReceive ? (
            <Button
              variant="primary"
              onClick={() => stock.openReceive?.(rows.map((row) => row.name))}
            >
              Add to inventory
            </Button>
          ) : null
        }
      />
    </GlassCard>
  );
}

function uncounted(items: StockItemView[]): StockItemView[] {
  return items.filter(
    (item) =>
      item.active &&
      (item.confidence === 'unknown' || (item.confidence === undefined && item.counted === false))
  );
}

/** Shopping (client v4): what to buy, grouped by who sells it. It computes nothing itself. */
export function GroceryLive({ v }: { v: OpsVals }) {
  const stock = liveStockOf(v);
  const settings = useAreaSettings(v, 'stock', 'Back to shopping');
  // HCB-004: a bake is planned from her own products, which this phone may not have read.
  const catalogue = useCatalogueHeld(v.catalogueHeld);
  if (!stock)
    return (
      <section aria-label="Shopping" data-screen-label="Shopping" className={G.page}>
        <PageTitle onGround title="Shopping" />
        <Notice>
          <StockReadNotice read={v.liveStockRead} />
        </Notice>
        {v.liveStockRead ? null : (
          <Notice>
            <p aria-live="polite">Stock is loading.</p>
          </Notice>
        )}
      </section>
    );
  if (stock.receive)
    return (
      <SubPage>
        <ReceiveLive receive={stock.receive} backLabel="Back to shopping" />
      </SubPage>
    );
  if (stock.bakePlan?.open)
    return (
      <SubPage>
        <BakePlanPage
          plan={stock.bakePlan}
          unread={catalogue.held ? undefined : { failed: catalogue.failed, retry: catalogue.retry }}
        />
      </SubPage>
    );
  if (settings.page) return <SubPage>{settings.page}</SubPage>;
  const { grocery } = stock;
  const bySupplier = new Map<string, GroceryRowView[]>();
  for (const row of grocery.rows)
    bySupplier.set(row.supplier, [...(bySupplier.get(row.supplier) ?? []), row]);
  const toCount = uncounted(stock.items);
  const toBuy = grocery.rows.filter((row) => row.toBuyText !== NOTHING_TO_BUY).length;
  return (
    <section aria-label="Shopping" data-screen-label="Shopping" className={G.page}>
      <div>
        <PageTitle
          onGround
          title="Shopping"
          subtitle="What is out or low, and what the next bake needs."
          actions={
            <>
              {stock.bakePlan ? (
                <Button
                  variant="secondary"
                  onClick={stock.bakePlan.edit}
                  disabled={!catalogue.held}
                >
                  {stock.bakePlan.cookies ? 'Edit planned bake' : 'Plan a bake'}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={settings.open}>
                Settings
              </Button>
            </>
          }
        />
        <SectionNavigation v={v} refined tools={false} onGround />
      </div>
      <Notice>
        <StockReadNotice read={v.liveStockRead} />
      </Notice>
      {catalogue.held ? null : (
        <Notice>
          <CatalogueNotice
            failed={catalogue.failed}
            retry={catalogue.retry}
            copy={BAKE_PLAN_CATALOGUE_COPY}
          />
        </Notice>
      )}
      <Notice>
        <OfflineLine online={stock.online} />
      </Notice>
      <GlassCard title="Totals">
        <div className={G.tilesAuto}>
          {v.bakeTotals?.toBakeNum !== undefined ? (
            <Tile labelFirst label="Cookies to bake">
              {v.bakeTotals.toBakeNum}
            </Tile>
          ) : null}
          <Tile labelFirst label="Items to buy">
            {toBuy}
          </Tile>
          <Tile labelFirst label="Need a count">
            {toCount.length}
          </Tile>
          <Tile labelFirst textual label="Known purchase total">
            {grocery.totalText}
          </Tile>
          {grocery.budgetText !== null ? (
            <Tile labelFirst textual label="Budget">
              {grocery.budgetText}
              {grocery.budgetNoteText ? (
                <span className={`${G.tileNote} block font-sans font-normal`}>
                  {grocery.budgetNoteText}
                </span>
              ) : null}
            </Tile>
          ) : null}
        </div>
        {grocery.unknownCount ? (
          <p className="text-caption text-ink-mute">
            Count {grocery.unknownCount} unknown {grocery.unknownCount === 1 ? 'item' : 'items'}{' '}
            before the shopping total can be complete.
          </p>
        ) : null}
      </GlassCard>
      {stock.bakePlan?.cookies || stock.bakePlan?.retention ? (
        <GlassCard title="Planned bake needs">
          <BakePlanNeeds plan={stock.bakePlan} />
        </GlassCard>
      ) : null}
      {grocery.rows.length === 0 ? (
        <GlassCard title="To buy">
          <p className="text-caption text-ink-mute">
            {grocery.unknownCount
              ? 'Count the unknown items before working out what to buy.'
              : 'No recorded shortages to buy for.'}
          </p>
        </GlassCard>
      ) : (
        <div className={G.groups}>
          {[...bySupplier.entries()].map(([name, rows]) => (
            <SupplierGroup
              key={name}
              name={name}
              rows={rows}
              stock={stock}
              onSupplier={() =>
                v.liveScreen?.tabs?.places.find((place) => place.label === 'Suppliers')?.go()
              }
            />
          ))}
        </div>
      )}
      {toCount.length ? (
        <GlassCard title="Count before buying">
          <div className={`${glassStyles.glassRows} ${G.taskRows}`}>
            {toCount.map((item) => (
              <OpenRow
                key={item.id}
                title={item.name}
                detail="Starting quantity not counted yet"
                label="Count"
                onOpen={item.count}
              />
            ))}
          </div>
        </GlassCard>
      ) : null}
    </section>
  );
}
GroceryLive.ownsSectionNavigation = true;
