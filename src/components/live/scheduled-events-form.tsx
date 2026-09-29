import type * as React from 'react';
import type { OpsVals, LiveScheduledRow } from '@/view-models/vals';
import { SCHEDULED_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LiveScheduled = NonNullable<OpsVals['liveScheduled']>;

const fieldValue = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
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

/** What the form reads back: every existing row, and the blank new row only when it has a name. */
export function readScheduledForm(
  form: HTMLFormElement,
  before: readonly LiveScheduledRow[],
  newId: string
): LiveScheduledRow[] {
  const rows: LiveScheduledRow[] = [];
  for (let i = 0; i <= before.length; i += 1) {
    const name = fieldValue(form, 'evName' + i).trim();
    if (i === before.length && name === '') continue;
    rows.push({
      id: before[i]?.id ?? newId,
      name,
      startsOn: fieldValue(form, 'evStart' + i),
      endsOn: fieldValue(form, 'evEnd' + i),
      place: fieldValue(form, 'evPlace' + i).trim(),
      rentPesos:
        fieldValue(form, 'evRent' + i).trim() === '' ? 0 : Number(fieldValue(form, 'evRent' + i)),
      active: isChecked(form, 'evOn' + i),
      started: before[i]?.started ?? false
    });
  }
  return rows;
}

/**
 * The owner's upcoming bazaars (D4), on the live form host: a row for each booking and one blank row to add a
 * new one. Nothing is deleted: a booking is switched off. Existing tokens only (form-styles).
 */
export function ScheduledEventsForm({ liveScheduled }: { liveScheduled: LiveScheduled }) {
  const { rows, newId } = liveScheduled;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveScheduled.save(readScheduledForm(event.currentTarget, rows, newId));
  };
  const all = [...rows, null];
  return (
    <form
      key={liveScheduled.version}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {!liveScheduled.online ? (
        <span style={{ fontSize: '12px', color: '#A8231B' }}>
          Offline. Changes here will not save until this device is back online.
        </span>
      ) : null}
      <span style={{ fontSize: '11px', color: '#66524A' }}>{C.intro}</span>
      {all.map((r, i) => (
        <div key={r?.id ?? 'new'} style={rowCard}>
          <label style={labelStyle}>
            <span style={smallLabel}>{r ? C.name : C.addTitle}</span>
            <input
              name={'evName' + i}
              required={r !== null}
              maxLength={80}
              defaultValue={r?.name ?? ''}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>{C.starts}</span>
            <input
              name={'evStart' + i}
              type="date"
              required={r !== null}
              defaultValue={r?.startsOn ?? ''}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>{C.ends}</span>
            <input
              name={'evEnd' + i}
              type="date"
              required={r !== null}
              defaultValue={r?.endsOn ?? ''}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>{C.place}</span>
            <input
              name={'evPlace' + i}
              maxLength={80}
              defaultValue={r?.place ?? ''}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={smallLabel}>{C.rent}</span>
            <input
              name={'evRent' + i}
              type="number"
              inputMode="decimal"
              min={0}
              max={1000000}
              step="any"
              defaultValue={r ? r.rentPesos : ''}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input name={'evOn' + i} type="checkbox" defaultChecked={r?.active ?? true} />
            <span style={smallLabel}>{r?.started ? C.onStarted : C.on}</span>
          </label>
        </div>
      ))}
      <button type="submit" style={primaryButton}>
        {C.save}
      </button>
      <button type="button" onClick={liveScheduled.close} style={secondaryButton}>
        Close
      </button>
    </form>
  );
}
