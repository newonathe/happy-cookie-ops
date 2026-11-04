'use client';

import type { BakePlanNeed, LiveBakePlan } from '@/store/bake-plan';
import { formatPesos, formatQuantity } from '@/lib/stock/stock-status';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  FooterActions,
  OwnerField,
  PageTitle,
  Panel,
  SectionHeading
} from '@/components/ui/owner-kit';
import { FactRow } from '@/components/ui/owner-patterns';

const selectClass =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]';

/** Planned bake: how many cookies of what. Shopping works out the rest. */
export function BakePlanPage({ plan }: { plan: LiveBakePlan }) {
  return (
    <div className="w-full">
      <PageTitle
        title="Planned bake"
        subtitle="Enter what you plan to make. This records nothing: it only works out what to buy."
      />
      {plan.error ? (
        <div className="mb-3">
          <Banner tone="warn" title={plan.error} />
        </div>
      ) : null}
      <Panel>
        {plan.rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-1 items-end gap-3 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
          >
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-caption font-semibold text-ink-soft">Product</span>
              <select
                value={row.productId}
                onChange={(event) => plan.setProduct(row.key, event.target.value)}
                className={selectClass}
              >
                {plan.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <OwnerField
              label="Cookies planned"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={row.cookies}
              onChange={(event) => plan.setCookies(row.key, event.target.value)}
            />
            <Button variant="ghost" onClick={() => plan.removeRow(row.key)}>
              Remove
            </Button>
          </div>
        ))}
        <div className="mt-3">
          <Button variant="secondary" onClick={plan.addRow}>
            Add product
          </Button>
        </div>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={plan.close}>
                Back to shopping
              </Button>
            }
            forward={
              <Button variant="primary" onClick={plan.use}>
                Use this plan
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function NeedRow({ need }: { need: BakePlanNeed }) {
  const needed = formatQuantity(need.needed, need.unit);
  const detail =
    need.state === 'short'
      ? `Need ${needed} · have ${formatQuantity(need.have ?? 0, need.unit)} · buy ${
          need.packs !== null
            ? `${need.packs} × ${need.packLabel || 'pack'}`
            : formatQuantity(need.short, need.unit)
        }`
      : need.state === 'notCounted'
        ? `Need ${needed} · not counted yet`
        : need.state === 'notTracked'
          ? `Need ${needed} · not in your stock list`
          : `Need ${needed} · recorded stock covers it`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-ink">{need.name}</span>
        <span className="text-caption text-ink-mute">
          {detail}
          {need.supplier && need.state === 'short' ? ` · ${need.supplier}` : ''}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {need.state === 'short' ? (
          <span className="text-[14px] font-semibold text-ink tabular-nums">
            {need.costPesos === null ? 'Cost pending' : formatPesos(need.costPesos)}
          </span>
        ) : null}
        {need.state === 'short' && need.compare ? (
          <Button variant="ghost" size="sm" onClick={need.compare}>
            Compare prices<span className="sr-only"> for {need.name}</span>
          </Button>
        ) : null}
        {need.state === 'notCounted' && need.count ? (
          <Button variant="secondary" size="sm" onClick={need.count}>
            Count<span className="sr-only"> {need.name}</span>
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/** What the planned bake needs, against what stock records. */
export function BakePlanNeeds({ plan }: { plan: LiveBakePlan }) {
  if (!plan.cookies) return null;
  const order = { short: 0, notCounted: 1, notTracked: 2, enough: 3 } as const;
  const needs = [...plan.needs].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <>
      <SectionHeading>For your planned bake</SectionHeading>
      <Panel>
        <FactRow label="Cookies planned">{plan.cookies}</FactRow>
        <FactRow label="Known cost of what is short">
          {formatPesos(plan.knownPesos)}
          {plan.somePending ? ' · some cost pending' : ''}
        </FactRow>
        {plan.noRecipe.length ? (
          <p className="mt-2 text-caption text-ink-soft">
            No saved recipe, so not worked out: {plan.noRecipe.join(', ')}.
          </p>
        ) : null}
        <ul aria-label="What the planned bake needs" className="mt-2 flex flex-col">
          {needs.map((need) => (
            <NeedRow key={need.name + need.unit} need={need} />
          ))}
        </ul>
      </Panel>
    </>
  );
}
