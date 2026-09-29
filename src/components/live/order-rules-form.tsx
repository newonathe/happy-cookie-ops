import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { RULES_COPY } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

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
 * The owner's order rules (B3), on the live form host: the same fields the database enforces.
 * Existing tokens only (form-styles); the sheet chrome is the ported one.
 */
export function OrderRulesForm({ liveOrderRules }: { liveOrderRules: LiveOrderRules }) {
  const { rules } = liveOrderRules;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const num = (name: string) => Number(fieldValue(form, name));
    liveOrderRules.save({
      unpaidHoldHours: num('unpaidHoldHours'),
      maxUnpaidPerPhone: num('maxUnpaidPerPhone'),
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
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        required
        defaultValue={value}
        style={inputStyle}
      />
    </label>
  );
  const text = (name: string, label: string, value: string) => (
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <input name={name} required defaultValue={value} maxLength={5} style={inputStyle} />
    </label>
  );
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {!liveOrderRules.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <span style={{ fontSize: '11px', color: '#66524A' }}>{RULES_COPY.intro}</span>
      <fieldset style={{ border: '0', padding: '0', margin: '0' }}>
        <legend style={smallLabel}>{RULES_COPY.days}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
          {DAYS.map(([d, label]) => (
            <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                name={'day' + d}
                type="checkbox"
                defaultChecked={rules.pickupDays.includes(d)}
              />
              <span style={smallLabel}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {number('unpaidHoldHours', RULES_COPY.holdHours, rules.unpaidHoldHours, 1, 168)}
      {number('maxUnpaidPerPhone', RULES_COPY.maxUnpaid, rules.maxUnpaidPerPhone, 1, 20)}
      {number('leadMinDays', RULES_COPY.leadMin, rules.leadMinDays, 1, 30)}
      {number('leadMaxDays', RULES_COPY.leadMax, rules.leadMaxDays, 1, 60)}
      {number('pickupFromHour', RULES_COPY.fromHour, rules.pickupFromHour, 0, 23)}
      {number('pickupCutoffHour', RULES_COPY.cutoffHour, rules.pickupCutoffHour, 1, 24)}
      {text('campusFrom', RULES_COPY.campusFrom, rules.campusFrom)}
      {text('campusTo', RULES_COPY.campusTo, rules.campusTo)}
      <button type="submit" style={primaryButton}>
        {RULES_COPY.save}
      </button>
      <button type="button" onClick={liveOrderRules.close} style={secondaryButton}>
        Close
      </button>
    </form>
  );
}
