'use client';

import { useState } from 'react';
import type * as React from 'react';
import type { DayPlanEditor, PlanFlavour } from '@/lib/bazaar/live-bazaar-types';
import {
  menuFirst,
  planIds,
  planTotalsText,
  validatePlan,
  type FieldIssue
} from '@/lib/bazaar/plan';
import { pesosToCentavos } from '@/lib/money';
import { peso } from '@/lib/money/format';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field } from '@/components/ui/field';
import { FlavourTile } from '@/components/ui/flavour-tile';
import { SectionHeader } from '@/components/ui/section-header';
import { Stepper } from '@/components/ui/stepper';
import { useIssues } from './use-issues';

const COUNT = /^[0-9]{1,4}$/;
const MONEY = /^[0-9]{1,7}(\.[0-9]{1,2})?$/;
const num = (text: string): number => (COUNT.test(text.trim()) ? Number(text) : 0);
const pesosNum = (text: string): number => (MONEY.test(text.trim()) ? Number(text) : 0);
const priceText = (text: string): string =>
  MONEY.test(text.trim())
    ? peso(pesosToCentavos(Number(text)))
    : text.trim() === ''
      ? 'Set a price'
      : `₱${text.trim()}`;

/** What an earlier day set aside for a flavour, as the text of the Carried over field; blank for none. */
function carriedText(carryIn: NonNullable<DayPlanEditor['carryIn']>, id: string): string {
  const n = carryIn.byFlavour[id];
  return n === undefined ? '' : String(n);
}

/**
 * One day's plan (U4, docs/design/bazaar-v2.md 5.5): the drawer float as a stepper in ₱100 steps, then the flavours as photo
 * tiles, the menu's first (finding B5), each with a stepper for how many are on the table, its price (the menu's, pre-filled,
 * editable) and what was carried over. The footer stays on screen with the total and the one action. It is a form of text:
 * the runtime turns it into centavos and whole cookies when it is saved, and `validatePlan` says what is wrong on the field.
 */
export function DayPlan({ editor, online }: { editor: DayPlanEditor; online: boolean }) {
  const [floatPesos, setFloat] = useState(editor.floatPesos);
  const { carryIn } = editor;
  // A new day starts with what the earlier day set aside, unless she has typed otherwise (a saved plan is left as it is).
  const [flavours, setFlavours] = useState<PlanFlavour[]>(() =>
    carryIn && editor.isNew
      ? editor.flavours.map((f) =>
          f.carried === '' && carryIn.byFlavour[f.id] !== undefined
            ? { ...f, carried: carriedText(carryIn, f.id) }
            : f
        )
      : editor.flavours
  );
  // Which flavours are tiles and which wait under "More flavours" is decided once, so a tile never jumps while she counts.
  const [{ main, more }] = useState(() => menuFirst(flavours));
  const [moreOpen, setMoreOpen] = useState(false);
  const [pricing, setPricing] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const issues = useIssues((): FieldIssue[] => {
    const r = validatePlan({ floatPesos, flavours });
    return r.ok ? [] : r.errors;
  });

  const change = (id: string, patch: Partial<PlanFlavour>) =>
    setFlavours((all) => all.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const copyDayBefore = () => {
    if (!editor.copy) return;
    setFloat(editor.copy.floatPesos);
    // The day before's made and prices: what was carried over depends on how that day closed, so it starts at none,
    // or at what the closed day set aside when there is one.
    setFlavours((all) =>
      all.map((f) => {
        const from = editor.copy?.flavours.find((c) => c.id === f.id);
        return from ? { ...f, ...from, carried: carryIn ? carriedText(carryIn, f.id) : '' } : f;
      })
    );
    issues.clear();
    setServerError(null);
  };
  const fillCarriedOver = () => {
    if (!carryIn) return;
    setFlavours((all) => all.map((f) => ({ ...f, carried: carriedText(carryIn, f.id) })));
    issues.clear();
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setServerError(null);
    if (!issues.submit()) return;
    setSaving(true);
    try {
      setServerError(await editor.save({ floatPesos, flavours }));
    } finally {
      setSaving(false);
    }
  };

  const byId = new Map(flavours.map((f) => [f.id, f]));
  const tile = (id: string) => {
    const f = byId.get(id);
    if (!f) return null;
    const made = num(f.made);
    const carried = num(f.carried);
    const total = made + carried;
    const priceError = issues.messageOf(planIds.price(id));
    const canCarry = editor.showCarried && (carryIn?.byFlavour[id] !== undefined || carried > 0);
    const pricingOpen = pricing.includes(id) || Boolean(priceError);
    const edited = f.price.trim() !== f.menuPrice;
    return (
      <li key={id} className="min-w-0">
        <FlavourTile
          name={f.name}
          photo={f.photo}
          price={priceText(f.price)}
          count={total}
          badge={carried > 0 ? `Carried: ${carried}` : undefined}
          state={total > 0 ? 'inCart' : f.onMenu ? 'idle' : 'offMenu'}
          stepper={
            <div className="flex w-full flex-col items-center gap-2">
              <span className="text-caption font-semibold text-ink-soft">Made</span>
              <Stepper
                size="sm"
                id={planIds.made(id)}
                label={`${f.name} made`}
                value={made}
                min={0}
                max={9999}
                error={issues.messageOf(planIds.made(id))}
                onChange={(n) => {
                  change(id, { made: String(n) });
                  issues.touch(planIds.made(id));
                }}
              />
              {canCarry ? (
                <>
                  <span className="text-caption font-semibold text-ink-soft">Carried over</span>
                  <Stepper
                    size="sm"
                    id={planIds.carried(id)}
                    label={`${f.name} carried over`}
                    value={carried}
                    min={0}
                    max={carryIn?.byFlavour[id] ?? 9999}
                    error={issues.messageOf(planIds.carried(id))}
                    onChange={(n) => {
                      change(id, { carried: String(n) });
                      issues.touch(planIds.carried(id));
                    }}
                  />
                </>
              ) : null}
              {pricingOpen ? (
                <div className="w-full">
                  <Field
                    id={planIds.price(id)}
                    label={`${f.name} price`}
                    mode="decimal"
                    prefix="₱"
                    autoComplete="off"
                    value={f.price}
                    hint={edited ? `Menu price ${priceText(f.menuPrice)}` : undefined}
                    error={priceError}
                    onChange={(e) => {
                      change(id, { price: e.target.value });
                      issues.touch(planIds.price(id));
                    }}
                    onBlur={() => issues.blur(planIds.price(id))}
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Change the price of ${f.name}`}
                  onClick={() => setPricing((all) => [...all, id])}
                >
                  {edited ? `Price ${priceText(f.price)}` : 'Change price'}
                </Button>
              )}
              {carryIn?.byFlavour[id] !== undefined ? (
                <span className="text-center text-caption text-ink-mute">
                  {carryIn.byFlavour[id]} set aside on {carryIn.dateText}
                </span>
              ) : null}
            </div>
          }
        />
      </li>
    );
  };
  const grid = 'm-0 grid list-none grid-cols-2 items-start gap-3 p-0 md:grid-cols-3 lg:grid-cols-4';
  const moreHasError = more.some(
    (id) =>
      issues.messageOf(planIds.made(id)) ||
      issues.messageOf(planIds.carried(id)) ||
      issues.messageOf(planIds.price(id))
  );
  const showMore = moreOpen || moreHasError;
  const floatError = issues.messageOf(planIds.float);

  return (
    <form
      {...issues.formProps}
      onSubmit={(e) => void submit(e)}
      aria-label={'Plan for ' + editor.dateText}
      data-screen-label="Bazaar day plan"
      noValidate
      className="flex flex-col gap-4"
    >
      <Button variant="ghost" onClick={editor.back} className="self-start">
        <span aria-hidden="true">← </span>Back to the event
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-title text-ink">
          {editor.isNew ? 'Plan ' : 'Change '}
          {editor.dateText}
        </h1>
        <span className="text-body text-ink-soft">{editor.eventName}</span>
      </div>
      <ErrorSummary errors={issues.summary} focusKey={issues.focusKey} />
      {serverError ? <Banner tone="danger" title={serverError} /> : null}
      {editor.copy || carryIn ? (
        <div className="flex flex-wrap gap-2">
          {editor.copy ? (
            <Button variant="secondary" size="sm" onClick={copyDayBefore}>
              Copy the day before ({editor.copy.dateText})
            </Button>
          ) : null}
          {carryIn ? (
            <Button variant="secondary" size="sm" onClick={fillCarriedOver}>
              Use what was carried over from {carryIn.dateText}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Card as="section" aria-label="Drawer float" className="flex flex-col gap-2">
        <span className="text-body font-bold text-ink">Drawer float</span>
        <Stepper
          id={planIds.float}
          label="Drawer float"
          value={pesosNum(floatPesos)}
          min={0}
          max={1_000_000}
          step={100}
          format={(n) => peso(n * 100)}
          error={floatError}
          onChange={(n) => {
            setFloat(String(n));
            issues.touch(planIds.float);
          }}
        />
        <span className="text-caption text-ink-mute">
          The cash in the drawer before the first sale. In ₱100 steps; tap the number to type it.
        </span>
      </Card>
      <section aria-labelledby="plan-flavours" className="flex flex-col gap-3">
        <SectionHeader
          title={<span id="plan-flavours">Cookies on the table</span>}
          count={main.length}
        />
        <ul aria-label="Flavours" className={grid}>
          {main.map(tile)}
        </ul>
        {more.length > 0 ? (
          <>
            <Button
              variant="secondary"
              aria-expanded={showMore}
              onClick={() => setMoreOpen((open) => !open)}
              className="self-start"
            >
              {showMore ? 'Hide' : 'More flavours'} ({more.length})
            </Button>
            {showMore ? (
              <ul aria-label="More flavours" className={grid}>
                {more.map(tile)}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
      <p className="m-0 text-caption text-ink-mute">
        Leave a flavour at 0 to leave it off the table. The price you set is this day&apos;s price,
        whatever the menu says.
      </p>
      <div
        data-part="plan-footer"
        // On a phone the dock (and the floating add button above it) take the bottom 84 px and the right 78 px: the footer
        // stands above the dock and stops short of the button. The runtime lifts the toast above it (`liveToastVals`).
        className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 max-md:bottom-[84px] max-md:flex-col max-md:items-stretch max-md:pr-[78px]"
      >
        <span aria-live="polite" className="text-body font-bold text-ink tabular-nums">
          {planTotalsText(flavours)}
        </span>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          busy={saving}
          busyLabel="Saving…"
          disabled={!online}
          reason="Saving a plan needs signal."
        >
          Save the plan →
        </Button>
      </div>
    </form>
  );
}
