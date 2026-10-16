'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { formIds } from '@/lib/bazaar/forms';
import { MARGIN_FLOOR_PERCENT, costFieldChanged, parseCostField } from '@/lib/recipes/book';
import type { RecipeBookItem } from '@/lib/recipes/live-recipes-types';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field } from '@/components/ui/field';
import { ReceiptTable } from '@/components/ui/receipt-table';
import { SectionHeader } from '@/components/ui/section-header';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusPill } from '@/components/ui/status-pill';
import { useIssues } from '@/components/live/bazaar/use-issues';
import { useSave } from '@/components/live/bazaar/use-save';

/** The name the photo carries into a view transition: the tile's photo and this page's hero are the one element. */
export const PHOTO_TRANSITION = 'flavour-photo';

/** The cost per cookie as a field: starts with her cost or the recipe's, and saves only when it has been changed. */
function CostForm({ item }: { item: RecipeBookItem }) {
  const [pesos, setPesos] = useState(item.startingCost);
  const { error, saving, run } = useSave();
  const field = formIds.cost(item.id);
  const issues = useIssues(() => {
    const message = parseCostField(pesos).error;
    return message ? [{ field, message }] : [];
  });
  const changed = costFieldChanged(pesos, item.startingCost);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || item.saveBlocked || !issues.submit()) return;
    await run(() => item.save(pesos));
  };
  const blocked = item.saveBlocked;
  return (
    <form
      {...issues.formProps}
      onSubmit={(e) => void submit(e)}
      aria-label={'Cost per cookie for ' + item.name}
      noValidate
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:max-w-xl"
    >
      <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
      {error ? <Banner tone="danger" title={error} /> : null}
      <Field
        id={field}
        label="Cost per cookie"
        mode="decimal"
        prefix="₱"
        hint={
          item.typed
            ? 'Blank goes back to the recipe’s cost.'
            : 'Starts at the recipe’s cost. Change it to use your own for this flavour.'
        }
        value={pesos}
        autoComplete="off"
        disabled={blocked !== null}
        error={issues.messageOf(field)}
        onChange={(e) => {
          setPesos(e.target.value);
          issues.touch(field);
        }}
        onBlur={() => issues.blur(field)}
      />
      <p className="m-0 text-caption text-ink-mute">
        Every bazaar uses this cost for the flavour, open ones and later ones.
      </p>
      <span className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          busy={saving}
          busyLabel="Saving…"
          disabled={!changed || blocked !== null}
          reason={blocked ?? undefined}
        >
          Save the cost
        </Button>
        {item.typed ? (
          <Button
            variant="ghost"
            disabled={saving || blocked !== null}
            onClick={() => void run(() => item.save(''))}
          >
            Use the recipe’s cost
          </Button>
        ) : null}
      </span>
    </form>
  );
}

/** One flavour: its photo, price, cost per cookie (editable), margin against the floor, and the cost receipt. */
export function FlavourPage({
  item,
  onBack,
  onEditRecipe,
  fade
}: {
  item: RecipeBookItem;
  onBack: () => void;
  onEditRecipe: () => void;
  /** True where there is no view transition: the page fades in instead. */
  fade: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const url = resolveImagePath(item.photo);
  const r = item.receipt;
  const margin = item.tone === 'none' ? undefined : item.tone;
  return (
    <div className={fade ? 'motion-enter flex flex-col gap-4' : 'flex flex-col gap-4'}>
      <Button variant="ghost" onClick={onBack} className="self-start">
        <span aria-hidden="true">← </span>Back to the recipe book
      </Button>
      <Card
        as="section"
        aria-label="Flavour"
        className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:gap-5"
      >
        <span
          aria-hidden="true"
          data-photo={url ? 'yes' : 'none'}
          className="relative grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-control bg-chip bg-cover bg-center md:aspect-[4/3] md:w-72 md:shrink-0"
          style={{
            ...(url ? { backgroundImage: `url(${url})` } : {}),
            viewTransitionName: PHOTO_TRANSITION
          }}
        >
          {!url ? <span className="text-title text-ink-faint">{item.name.slice(0, 1)}</span> : null}
        </span>
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
          <h1 ref={heading} tabIndex={-1} className="m-0 min-w-0 text-title text-ink outline-none">
            {item.name}
          </h1>
          <StatusPill
            status={item.onMenu ? 'good' : 'closed'}
            label={item.onMenu ? 'On the menu' : 'Not on the menu'}
          />
        </div>
      </Card>
      <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3">
        <StatTile label="Menu price" value={item.priceText} />
        <StatTile
          label="Cost per cookie"
          value={item.costText}
          tone={item.costSource === 'pending' ? 'warn' : undefined}
          detail={item.sourceText}
        />
        <div className="col-span-2 md:col-span-1">
          <StatTile
            label="Margin"
            value={item.marginText}
            tone={margin}
            detail={
              item.keptText
                ? `Keeps ${item.keptText} a cookie · floor ${MARGIN_FLOOR_PERCENT}%`
                : 'Needs a cost'
            }
          />
        </div>
      </div>
      <section aria-labelledby="book-cost" className="flex flex-col gap-2">
        <SectionHeader title={<span id="book-cost">Your cost per cookie</span>} />
        <CostForm key={item.startingCost + '|' + item.typed} item={item} />
      </section>
      <section aria-labelledby="book-receipt" className="flex flex-col gap-2">
        <SectionHeader title={<span id="book-receipt">Cost receipt</span>} />
        <p className="m-0 text-body text-ink">
          {item.costSource === 'typed'
            ? `${item.sourceText}: ${item.costText} a cookie.`
            : item.costSource === 'recipe'
              ? 'The cost is the recipe’s.'
              : 'No cost is known for this flavour yet.'}
        </p>
        {r ? (
          <>
            <ReceiptTable
              caption={'Recipe cost per cookie for ' + item.name}
              lines={r.lines.map((l) => ({ label: l.label, value: 0, valueText: l.valueText }))}
              total={0}
              totalText={r.totalText ?? 'Cost pending'}
              totalLabel="Recipe cost per cookie"
              emptyText="No cost line is known yet"
              note={item.receiptNote ?? undefined}
            />
            {r.batchText ? <p className="m-0 text-caption text-ink-mute">{r.batchText}</p> : null}
            {r.missing.length > 0 ? (
              <Banner
                tone="warn"
                title={'The recipe has no cost for ' + r.missing.join(', ') + '.'}
                body="Until it does, the recipe has no whole cost per cookie. Add the cost in Stock."
              />
            ) : null}
          </>
        ) : (
          <p className="m-0 text-caption text-ink-mute">
            The recipe’s cost has not been read, or the flavour has no recipe.
          </p>
        )}
      </section>
      <section aria-labelledby="book-recipe" className="flex flex-col gap-2">
        <SectionHeader title={<span id="book-recipe">The recipe</span>} />
        <p className="m-0 text-caption text-ink-mute md:max-w-xl">
          Recipes are still edited in the older Recipes screen. Look there, but do not save yet:
          saving turns packaging lines into ingredients until that is fixed (B6).
        </p>
        <Button variant="secondary" onClick={onEditRecipe} className="self-start">
          Open the older Recipes screen
        </Button>
      </section>
    </div>
  );
}
