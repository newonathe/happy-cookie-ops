import type * as React from 'react';
import type { OpsVals, LiveOrderExtrasFields } from '@/view-models/vals';
import { EXTRAS_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LiveOrderExtras = NonNullable<OpsVals['liveOrderExtras']>;

const fieldValue = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
const isChecked = (form: HTMLFormElement, name: string): boolean =>
  (form.elements.namedItem(name) as HTMLInputElement | null)?.checked === true;

const rowCard = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  border: '1px solid #E7E1DC',
  borderRadius: '12px',
  padding: '11px'
};
const hint = { fontSize: '11px', color: '#66524A' };

/** What the form reads back: blank new rows are left out, existing rows always count. */
export function readExtrasForm(
  form: HTMLFormElement,
  before: LiveOrderExtrasFields
): LiveOrderExtrasFields {
  const num = (name: string) => Number(fieldValue(form, name));
  const boxSizes: LiveOrderExtrasFields['boxSizes'] = [];
  for (let i = 0; i <= before.boxSizes.length; i += 1) {
    const size = fieldValue(form, 'boxSize' + i).trim();
    if (i === before.boxSizes.length && size === '') continue;
    boxSizes.push({
      size: size === '' ? Number.NaN : Number(size),
      chargePesos: fieldValue(form, 'boxCharge' + i).trim() === '' ? 0 : num('boxCharge' + i),
      active: isChecked(form, 'boxOn' + i)
    });
  }
  const addOns: LiveOrderExtrasFields['addOns'] = [];
  for (let i = 0; i <= before.addOns.length; i += 1) {
    const name = fieldValue(form, 'aoName' + i).trim();
    if (i === before.addOns.length && name === '') continue;
    addOns.push({
      id: before.addOns[i]?.id ?? '',
      name,
      pricePesos: fieldValue(form, 'aoPrice' + i).trim() === '' ? Number.NaN : num('aoPrice' + i),
      active: isChecked(form, 'aoOn' + i),
      variants: fieldValue(form, 'aoVariants' + i)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
      textLabel: fieldValue(form, 'aoLabel' + i).trim(),
      textMax: num('aoTextMax' + i),
      maxQty: num('aoMax' + i)
    });
  }
  return {
    sameDayEnabled: isChecked(form, 'sameDayEnabled'),
    sameDayPercent: num('sameDayPercent'),
    sameDayOnExtras: isChecked(form, 'sameDayOnExtras'),
    samplerProductId: fieldValue(form, 'samplerProductId'),
    samplerMaxQty: num('samplerMaxQty'),
    boxSizes,
    addOns
  };
}

/**
 * The owner's boxes and add-ons (B4), on the live form host: the same fields the database enforces.
 * Existing tokens only (form-styles); the sheet chrome is the ported one. Nothing is deleted: an item
 * is switched off, so an old order keeps the name and price it was placed at.
 */
export function OrderExtrasForm({ liveOrderExtras }: { liveOrderExtras: LiveOrderExtras }) {
  const { extras, sets } = liveOrderExtras;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveOrderExtras.save(readExtrasForm(event.currentTarget, extras));
  };
  const number = (
    name: string,
    label: string,
    value: number | string,
    min: number,
    max: number,
    opts: { step?: number | 'any'; required?: boolean } = {}
  ) => (
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <input
        name={name}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={opts.step ?? 1}
        required={opts.required ?? true}
        defaultValue={value}
        style={inputStyle}
      />
    </label>
  );
  const toggle = (name: string, label: string, on: boolean) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input name={name} type="checkbox" defaultChecked={on} />
      <span style={smallLabel}>{label}</span>
    </label>
  );
  const boxRows = [...extras.boxSizes, null];
  const addOnRows = [...extras.addOns, null];
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!liveOrderExtras.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <span style={hint}>{C.intro}</span>

      <fieldset style={{ ...rowCard, margin: '0' }}>
        <legend style={smallLabel}>{C.sameDay}</legend>
        {toggle('sameDayEnabled', C.sameDayOn, extras.sameDayEnabled)}
        {number('sameDayPercent', C.sameDayPercent, extras.sameDayPercent, 0, 100)}
        {toggle('sameDayOnExtras', C.sameDayExtras, extras.sameDayOnExtras)}
      </fieldset>

      <fieldset style={{ ...rowCard, margin: '0' }}>
        <legend style={smallLabel}>{C.sampler}</legend>
        <label style={labelStyle}>
          <span style={smallLabel}>{C.samplerPick}</span>
          <select name="samplerProductId" defaultValue={extras.samplerProductId} style={inputStyle}>
            <option value="">{C.samplerNone}</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {number('samplerMaxQty', C.samplerMax, extras.samplerMaxQty, 1, 20)}
      </fieldset>

      <fieldset style={{ border: '0', padding: '0', margin: '0' }}>
        <legend style={smallLabel}>{C.boxes}</legend>
        <span style={hint}>{C.boxesHelp}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          {boxRows.map((b, i) => (
            <div key={i} style={rowCard}>
              {number('boxSize' + i, b ? C.boxSize : C.addBox, b?.size ?? '', 2, 48, {
                required: b !== null
              })}
              {number('boxCharge' + i, C.boxCharge, b?.chargePesos ?? 0, 0, 1000, {
                step: 'any',
                required: false
              })}
              {toggle('boxOn' + i, C.on, b?.active ?? true)}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: '0', padding: '0', margin: '0' }}>
        <legend style={smallLabel}>{C.addOns}</legend>
        <span style={hint}>{C.addOnsHelp}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          {addOnRows.map((a, i) => (
            <div key={a?.id ?? 'new'} style={rowCard}>
              <label style={labelStyle}>
                <span style={smallLabel}>{a ? C.addOnName : C.addAddOn}</span>
                <input
                  name={'aoName' + i}
                  required={a !== null}
                  maxLength={40}
                  defaultValue={a?.name ?? ''}
                  style={inputStyle}
                />
              </label>
              {number('aoPrice' + i, C.addOnPrice, a?.pricePesos ?? '', 0, 10000, {
                step: 'any',
                required: a !== null
              })}
              {number('aoMax' + i, C.addOnMax, a?.maxQty ?? 10, 1, 50)}
              <label style={labelStyle}>
                <span style={smallLabel}>{C.addOnChoices}</span>
                <input
                  name={'aoVariants' + i}
                  defaultValue={a?.variants.join(', ') ?? ''}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                <span style={smallLabel}>{C.addOnMessage}</span>
                <input
                  name={'aoLabel' + i}
                  maxLength={30}
                  defaultValue={a?.textLabel ?? ''}
                  style={inputStyle}
                />
              </label>
              {number('aoTextMax' + i, C.addOnMessageMax, a?.textMax ?? 150, 1, 300)}
              {toggle('aoOn' + i, C.on, a?.active ?? true)}
            </div>
          ))}
        </div>
      </fieldset>

      <button type="submit" style={primaryButton}>
        {C.save}
      </button>
      <button type="button" onClick={liveOrderExtras.close} style={secondaryButton}>
        Close
      </button>
    </form>
  );
}
