'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { BazaarEventView, FinaliseInput } from '@/lib/bazaar/live-bazaar-types';
import { validateFinalise } from '@/lib/bazaar/event-rules';
import { formIds } from '@/lib/bazaar/forms';
import { cookiesText } from '@/lib/bazaar/plan';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Stepper } from '@/components/ui/stepper';
import { useIssues } from './use-issues';
import { useSave } from './use-save';

type Finalise = NonNullable<BazaarEventView['finalise']>;

/**
 * "Close the event" (U4). It cannot be undone, so it asks; and before it closes it asks the two things the books need.
 * A1: cookies a day set aside to carry over that no day took (the event ended early) are split between the shop and written
 * off; the suggestion is the shop with a recipe, written off without one, and none while the recipes are unread. A5: a
 * flavour with cookies and no cost per cookie cannot give a profit; its cost is typed here, or the event is closed without
 * it, explicitly. What is shown is what is sent (`validateFinalise` is the store's own check).
 */
export function CloseEventSheet({
  finalise,
  onClose
}: {
  finalise: Finalise;
  onClose: () => void;
}) {
  const formId = useId();
  const [toShop, setToShop] = useState<FinaliseInput['toShop']>(() =>
    Object.fromEntries(finalise.stranded.map((s) => [s.productId, s.suggestedToShop]))
  );
  const [costs, setCosts] = useState<FinaliseInput['costs']>({});
  const [without, setWithout] = useState(false);
  const { error, saving, run } = useSave();
  const pending = finalise.costPending.length > 0;
  const input = (withoutCost: boolean): FinaliseInput => ({ toShop, costs, withoutCost });
  const issues = useIssues(() => {
    const r = validateFinalise({ ...finalise, value: input(without) });
    return r.ok ? [] : r.errors;
  });
  const blocked = finalise.blocked !== null;

  const close = async (withoutCost: boolean) => {
    const r = validateFinalise({ ...finalise, value: input(withoutCost) });
    setWithout(withoutCost);
    if (!r.ok) {
      // Shown through the form's own checks, so the summary and the fields say the same words.
      issues.submitWith(r.errors);
      return;
    }
    issues.clear();
    if (await run(() => finalise.run(input(withoutCost)))) onClose();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blocked) void close(false);
  };

  return (
    <Sheet
      title="Close the event"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="dark"
            type="submit"
            form={formId}
            busy={saving}
            busyLabel="Closing…"
            disabled={blocked}
            reason={finalise.blocked ?? undefined}
          >
            {pending ? 'Save and close' : 'Close the event'}
          </Button>
          {pending ? (
            <Button
              variant="secondary"
              disabled={saving || blocked}
              onClick={() => void close(true)}
            >
              Close without cost
            </Button>
          ) : null}
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Not yet
          </Button>
        </>
      }
    >
      <form
        {...issues.formProps}
        id={formId}
        onSubmit={submit}
        aria-label="Close the event"
        noValidate
        className="flex flex-col gap-4"
      >
        <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
        {error ? <Banner tone="danger" title={error} /> : null}
        <p className="m-0 text-body text-ink">
          Closing the event counts its sales, fees and stock in the books. It cannot be undone.
        </p>

        {finalise.stranded.length > 0 ? (
          <section aria-labelledby="final-stranded" className="flex flex-col gap-3">
            <h3 id="final-stranded" className="m-0 text-body font-bold text-ink">
              {`${cookiesText(finalise.stranded.reduce((n, s) => n + s.qty, 0))} were carried over${
                finalise.strandedFor ? ` for ${finalise.strandedFor}, which has not started` : ''
              }. Where do they go?`}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {finalise.stranded.map((s) => {
                const shop = toShop[s.productId] ?? null;
                const message = issues.messageOf(formIds.finalShop(s.productId));
                return (
                  <li
                    key={s.productId}
                    className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
                  >
                    <span className="text-body font-bold text-ink">
                      {`${s.name} · ${cookiesText(s.qty)}`}
                    </span>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-caption font-semibold text-ink-soft">
                          To the shop
                        </span>
                        <Stepper
                          size="sm"
                          id={formIds.finalShop(s.productId)}
                          label={`${s.name}: to the shop`}
                          value={shop ?? 0}
                          min={0}
                          max={s.hasRecipe === false ? 0 : s.qty}
                          error={message}
                          onChange={(n) => {
                            setToShop((all) => ({ ...all, [s.productId]: n }));
                            issues.touch(formIds.finalShop(s.productId));
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-caption font-semibold text-ink-soft">
                          Written off
                        </span>
                        <Stepper
                          size="sm"
                          label={`${s.name}: written off`}
                          value={shop === null ? 0 : s.qty - shop}
                          min={0}
                          max={s.qty}
                          onChange={(n) => {
                            setToShop((all) => ({ ...all, [s.productId]: s.qty - n }));
                            issues.touch(formIds.finalShop(s.productId));
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-caption text-ink-mute">
                      {s.hasRecipe === null
                        ? 'The recipes have not been read, so nothing is suggested. Choose where they go.'
                        : s.hasRecipe
                          ? 'Suggested: all to the shop, where it has a recipe.'
                          : 'It has no recipe, so it can only be written off.'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {pending ? (
          <section aria-labelledby="final-costs" className="flex flex-col gap-3">
            <h3 id="final-costs" className="m-0 text-body font-bold text-ink">
              No cost per cookie yet
            </h3>
            <p className="m-0 text-caption text-ink-mute">
              Profit cannot be worked out without a cost for each flavour. The cost you type is
              saved for the flavour, and used for it from now on.
            </p>
            {finalise.costPending.map((p) => (
              <div
                key={p.productId}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
              >
                <span className="text-body text-ink">
                  <b>{p.name}</b>{' '}
                  {`has no cost per cookie. It sold ${p.sold.toLocaleString('en-PH')} here.`}
                </span>
                <Field
                  id={formIds.finalCost(p.productId)}
                  label="Cost per cookie"
                  mode="decimal"
                  prefix="₱"
                  autoComplete="off"
                  value={costs[p.productId] ?? ''}
                  error={issues.messageOf(formIds.finalCost(p.productId))}
                  onChange={(e) => {
                    setCosts((all) => ({ ...all, [p.productId]: e.target.value }));
                    issues.touch(formIds.finalCost(p.productId));
                  }}
                  onBlur={() => issues.blur(formIds.finalCost(p.productId))}
                />
              </div>
            ))}
          </section>
        ) : null}
      </form>
    </Sheet>
  );
}
