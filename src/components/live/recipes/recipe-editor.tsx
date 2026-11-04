'use client';

import { useEffect, useRef, useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  FooterActions,
  OwnerField,
  PageTitle,
  Panel,
  SectionHeading
} from '@/components/ui/owner-kit';
import { FactRow, ReviewPanel } from '@/components/ui/owner-patterns';

const selectClass =
  'h-12 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]';

/**
 * Edit recipe (client v4): the engine's own rows and handlers, with a Review before saving. Saving
 * makes a new version, as it always did; what has been baked keeps its version. It leaves Review
 * only when the runtime says the edit is saved: a refused save stays here, with its message.
 */
export function RecipeEditor({
  v,
  backLabel,
  onBack
}: {
  v: OpsVals;
  backLabel: string;
  onBack: () => void;
}) {
  const recipe = v.recipe;
  const [reviewing, setReviewing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const asked = useRef(false);
  const dirty = !!recipe.dirty;
  useEffect(() => {
    if (asked.current && !dirty) {
      asked.current = false;
      setReviewing(false);
    }
  }, [dirty]);
  const rows = recipe.rows ?? [];

  if (reviewing)
    return (
      <div className="w-full">
        <PageTitle title="Review recipe changes" subtitle={recipe.name} />
        <ReviewPanel
          note="Earlier production records keep their saved recipe version."
          backLabel="Change recipe"
          onBack={() => setReviewing(false)}
          saveLabel="Save new version"
          onSave={() => {
            asked.current = true;
            recipe.save();
          }}
        >
          <FactRow label="Replaces">{recipe.version}</FactRow>
          <FactRow label="Batch yield">{recipe.yieldText}</FactRow>
          {rows.map((row, i) => (
            <FactRow
              key={i}
              label={row.name}
              detail={row.kind === 'packaging' ? 'Packaging' : 'Ingredient'}
            >
              {row.qty} {row.unit}
            </FactRow>
          ))}
        </ReviewPanel>
      </div>
    );

  return (
    <div className="w-full">
      <PageTitle
        title={`Edit ${String(recipe.name)}`}
        subtitle="Save changes as a new recipe version."
        actions={
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        }
      />
      {problem ? (
        <div className="mb-3">
          <Banner tone="warn" title={problem} />
        </div>
      ) : null}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold text-ink">Cookies per batch</span>
            <span className="text-caption text-ink-mute">
              {recipe.version} · {recipe.costText}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Button variant="secondary" onClick={recipe.yieldDown} aria-label="Lower yield">
              −
            </Button>
            <span className="w-10 text-center text-[16px] font-semibold text-ink tabular-nums">
              {recipe.yieldNum}
            </span>
            <Button variant="secondary" onClick={recipe.yieldUp} aria-label="Raise yield">
              +
            </Button>
          </span>
        </div>
        <ul aria-label="Recipe lines" className="flex flex-col">
          {rows.map((row, i) => (
            <li key={i} className="border-b border-line py-3 last:border-b-0">
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_140px_120px_100px_auto]">
                <OwnerField
                  className="col-span-2 sm:col-span-1"
                  label="Ingredient"
                  value={row.name}
                  onChange={row.setName}
                />
                {row.setKind ? (
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-caption font-semibold text-ink-soft">Type</span>
                    <select
                      value={row.kind === undefined ? 'ingredient' : (row.kind ?? '')}
                      onChange={(event) =>
                        row.setKind?.(event.target.value as 'ingredient' | 'packaging')
                      }
                      className={selectClass}
                    >
                      {row.kind === null ? <option value="">Choose</option> : null}
                      <option value="ingredient">Ingredient</option>
                      <option value="packaging">Packaging</option>
                    </select>
                  </label>
                ) : null}
                <OwnerField
                  label="Quantity"
                  inputMode="decimal"
                  value={row.qty}
                  onChange={row.setQty}
                />
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption font-semibold text-ink-soft">Unit</span>
                  <select value={row.unit} onChange={row.setUnit} className={selectClass}>
                    {(recipe.units ?? []).map((unit) => (
                      <option key={String(unit)} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="ghost" onClick={row.remove}>
                  Remove<span className="sr-only"> {row.name}</span>
                </Button>
              </div>
              {row.warn ? <p className="mt-1 text-caption text-warn">{row.warn}</p> : null}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <Button variant="secondary" onClick={recipe.addRow}>
            Add ingredient
          </Button>
        </div>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={onBack}>
                {backLabel}
              </Button>
            }
            forward={
              <Button
                variant="primary"
                disabled={!dirty}
                reason="Change something first."
                onClick={() => {
                  const blank = rows.filter((row) => !String(row.name).trim()).length;
                  if (blank) return setProblem('Give every line a name, or remove it.');
                  if (rows.some((row) => row.kind === null))
                    return setProblem('Choose ingredient or packaging for each line.');
                  setProblem(null);
                  setReviewing(true);
                }}
              >
                Review recipe
              </Button>
            }
          />
        </div>
      </Panel>
      <SectionHeading>Versions</SectionHeading>
      <Panel>
        <FactRow label={`${String(recipe.version)} · current`}>{recipe.currentBatches}</FactRow>
        {(recipe.history ?? []).map((version, i) => (
          <FactRow key={i} label={version.label} detail={version.detail}>
            {version.batches}
          </FactRow>
        ))}
        <p className="mt-2 text-caption text-ink-mute">
          Editing creates a new version. Anything already baked keeps its old one.
        </p>
      </Panel>
    </div>
  );
}
