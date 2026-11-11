import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { RULES_COPY } from '@/lib/orders/staff-copy';
import { Button } from '@/components/ui/button';
import { FooterActions, InfoTip, OwnerField, Panel } from '@/components/ui/owner-kit';

type LiveOrderRules = NonNullable<OpsVals['liveOrderRules']>;

const DAYS: Array<[number, string]> = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun']
];

const fieldValue = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';

/**
 * The owner's order rules (B3) as a page of the Shop settings: the same fields the database
 * enforces. The per-number unpaid-order limit is an anti-abuse safeguard the owner does not tune
 * (Ethan, 3 November); it is no longer shown and keeps its saved value on every save.
 */
export function OrderRulesForm({ liveOrderRules }: { liveOrderRules: LiveOrderRules }) {
  const { rules } = liveOrderRules;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const num = (name: string) => Number(fieldValue(form, name));
    liveOrderRules.save({
      unpaidHoldHours: num('unpaidHoldHours'),
      maxUnpaidPerPhone: rules.maxUnpaidPerPhone,
      pickupDays: DAYS.filter(
        ([d]) => (form.elements.namedItem('day' + d) as HTMLInputElement | null)?.checked
      ).map(([d]) => d),
      leadMinDays: num('leadMinDays'),
      leadMaxDays: num('leadMaxDays'),
      pickupFromHour: num('pickupFromHour'),
      pickupCutoffHour: num('pickupCutoffHour'),
      campusFrom: fieldValue(form, 'campusFrom'),
      campusTo: fieldValue(form, 'campusTo')
    });
  };
  const number = (name: string, label: string, value: number, min: number, max: number) => (
    <OwnerField
      label={label}
      name={name}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      required
      defaultValue={value}
    />
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      {!liveOrderRules.online ? (
        <p role="status" className="mb-4 rounded-control bg-warm-high p-3 text-caption text-danger">
          Offline. Changes here will not save until this device is back online.
        </p>
      ) : null}
      <Panel title="Pickup days">
        <fieldset className="m-0 border-0 p-0">
          <legend className="sr-only">{RULES_COPY.days}</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {DAYS.map(([d, label]) => (
              <label key={d} className="relative">
                <input
                  name={'day' + d}
                  type="checkbox"
                  defaultChecked={rules.pickupDays.includes(d)}
                  className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
                />
                <span className="flex min-h-11 min-w-14 items-center justify-center rounded-full border border-line-strong bg-surface px-3 text-caption font-semibold text-ink-mute transition-colors duration-[140ms] peer-checked:border-brand peer-checked:bg-warm-high peer-checked:text-brand-deep peer-focus-visible:outline-2 peer-focus-visible:outline-brand">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>
      <Panel title="When customers can pick up">
        <div className="grid gap-3 sm:grid-cols-2">
          {number('leadMinDays', 'Earliest pickup (days after ordering)', rules.leadMinDays, 1, 30)}
          {number('leadMaxDays', 'Latest pickup (days after ordering)', rules.leadMaxDays, 1, 60)}
          {number('pickupFromHour', 'Pickup starts (hour, 0–23)', rules.pickupFromHour, 0, 23)}
          {number('pickupCutoffHour', 'Pickup ends (hour, 1–24)', rules.pickupCutoffHour, 1, 24)}
        </div>
      </Panel>
      <Panel title="Campus pickup">
        <div className="grid gap-3 sm:grid-cols-2">
          <OwnerField
            label="From (like 14:00)"
            name="campusFrom"
            required
            maxLength={5}
            defaultValue={rules.campusFrom}
          />
          <OwnerField
            label="Until (like 15:30)"
            name="campusTo"
            required
            maxLength={5}
            defaultValue={rules.campusTo}
          />
        </div>
      </Panel>
      <Panel
        title="Unpaid orders"
        action={
          <InfoTip label="unpaid orders">
            An order that is not paid keeps its cookies reserved for this long. After that the
            cookies go back on sale.
          </InfoTip>
        }
      >
        {number('unpaidHoldHours', 'Keep unpaid orders for (hours)', rules.unpaidHoldHours, 1, 168)}
      </Panel>
      <p className="mb-2 text-caption text-ink-mute">These apply to new orders only.</p>
      <FooterActions
        back={
          <Button type="button" variant="secondary" onClick={liveOrderRules.close}>
            Cancel
          </Button>
        }
        forward={
          <Button type="submit" variant="primary">
            {RULES_COPY.save}
          </Button>
        }
      />
    </form>
  );
}
