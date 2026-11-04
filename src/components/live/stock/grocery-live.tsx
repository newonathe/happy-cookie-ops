'use client';

import type { OpsVals } from '@/view-models/vals';
import type { GroceryRowView, LiveStockVals, StockItemView } from '@/lib/stock/live-stock-types';
import { OfflineLine, StatusWord, StockLoading, liveStockOf } from './stock-shared';
import { ReceiveLive } from './stock-entry-live';
import { BakePlanNeeds, BakePlanPage } from './bake-plan-live';
import { Button } from '@/components/ui/button';
import { SectionNavigation } from '@/components/live/section-navigation';
import { useAreaSettings } from '@/components/live/account/settings-areas';
import { FooterActions, PageTitle, Panel, SectionHeading } from '@/components/ui/owner-kit';
import { FactRow, OpenRow } from '@/components/ui/owner-patterns';

const NOTHING_TO_BUY = 'Nothing to buy';

function BuyRow({ row }: { row: GroceryRowView }) {
  const nothing = row.toBuyText === NOTHING_TO_BUY;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
          {row.name} <StatusWord status={row.status} />
        </span>
        <span className="text-caption text-ink-mute">
          {nothing ? (
            <>Have {row.haveText} · not needed for the next bake</>
          ) : (
            <>
              Need {row.neededText} · have {row.haveText} · buy {row.toBuyText}
            </>
          )}
        </span>
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
        <span className="text-[14px] font-semibold text-ink tabular-nums">{row.lineCostText}</span>
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
    <>
      <SectionHeading>{name}</SectionHeading>
      <Panel>
        <ul aria-label={`To buy from ${name}`} className="flex flex-col">
          {rows.map((row) => (
            <BuyRow key={row.itemId} row={row} />
          ))}
        </ul>
        <div className="mt-2">
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
        </div>
      </Panel>
    </>
  );
}

function uncounted(items: StockItemView[]): StockItemView[] {
  return items.filter((item) => item.active && item.counted === false);
}

/** Shopping (client v4): what to buy, grouped by who sells it. It computes nothing itself. */
export function GroceryLive({ v }: { v: OpsVals }) {
  const stock = liveStockOf(v);
  const settings = useAreaSettings(v, 'stock', 'Back to shopping');
  if (!stock) return <StockLoading title="Shopping" label="Shopping" />;
  if (stock.receive) return <ReceiveLive receive={stock.receive} backLabel="Back to shopping" />;
  if (stock.bakePlan?.open) return <BakePlanPage plan={stock.bakePlan} />;
  if (settings.page) return settings.page;
  const { grocery } = stock;
  const bySupplier = new Map<string, GroceryRowView[]>();
  for (const row of grocery.rows)
    bySupplier.set(row.supplier, [...(bySupplier.get(row.supplier) ?? []), row]);
  const toCount = uncounted(stock.items);
  return (
    <section aria-label="Shopping" data-screen-label="Shopping" className="w-full">
      <PageTitle
        title="Shopping"
        subtitle="What is out or low, and what the next bake needs."
        actions={
          <>
            {stock.bakePlan ? (
              <Button variant="secondary" onClick={stock.bakePlan.edit}>
                {stock.bakePlan.cookies ? 'Edit planned bake' : 'Plan a bake'}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={settings.open}>
              Settings
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <SectionNavigation v={v} refined tools={false} />
      </div>
      <OfflineLine online={stock.online} />
      <section aria-label="Totals">
        <Panel>
          {v.bakeTotals?.toBakeNum !== undefined ? (
            <FactRow label="Cookies to bake">{v.bakeTotals.toBakeNum}</FactRow>
          ) : null}
          <FactRow label="Known purchase total">{grocery.totalText}</FactRow>
          {grocery.budgetText !== null ? (
            <FactRow label="Budget" detail={grocery.budgetNoteText}>
              {grocery.budgetText}
            </FactRow>
          ) : null}
        </Panel>
      </section>
      {stock.bakePlan ? <BakePlanNeeds plan={stock.bakePlan} /> : null}
      {grocery.rows.length === 0 ? (
        <Panel>
          <p className="text-caption text-ink-mute">Nothing to buy. Everything is Good.</p>
        </Panel>
      ) : (
        [...bySupplier.entries()].map(([name, rows]) => (
          <SupplierGroup
            key={name}
            name={name}
            rows={rows}
            stock={stock}
            onSupplier={() =>
              v.liveScreen?.tabs?.places.find((place) => place.label === 'Suppliers')?.go()
            }
          />
        ))
      )}
      {toCount.length ? (
        <>
          <SectionHeading>Count before buying</SectionHeading>
          <Panel>
            {toCount.map((item) => (
              <OpenRow
                key={item.id}
                title={item.name}
                detail="Starting quantity not counted yet"
                label="Count"
                onOpen={item.count}
              />
            ))}
          </Panel>
        </>
      ) : null}
    </section>
  );
}
GroceryLive.ownsSectionNavigation = true;
