'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import {
  eventFieldError,
  validateEventForm,
  type EventFormField,
  type EventFormInput
} from '@/lib/bazaar/event-form';
import { dayText } from '@/lib/date/day-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useSave } from './use-save';

/** The input id of each field: the error summary links to it. */
const ID: Record<EventFormField, string> = {
  name: 'event-name',
  place: 'event-place',
  startsOn: 'event-start',
  endsOn: 'event-end',
  rent: 'event-rent'
};
const ORDER: EventFormField[] = ['name', 'place', 'startsOn', 'endsOn', 'rent'];

type Values = Omit<EventFormInput, 'id'>;
const BLANK: Values = { name: '', place: '', startsOn: '', endsOn: '', rent: '' };

/**
 * U3: one event, never the whole booking list (docs/design/bazaar-v2.md 5.3). Name, place, the days, and the stall rent.
 * Nothing is pre-filled that is a decision. The id is minted when the sheet opens and kept until it closes, so saving
 * again after a lost reply is the same event, never a second. Errors point at the field (rule 7). Editing an event
 * happens on its page.
 */
export function EventForm({
  bazaar,
  open,
  onClose,
  onSaved
}: {
  bazaar: LiveBazaarVals;
  open: boolean;
  onClose: () => void;
  /** Called with the id once the event is saved and listed. */
  onSaved: (id: string) => void;
}) {
  const formId = useId();
  // Minted once per opening: the parent mounts this fresh each time the sheet opens.
  const [id] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<Values>(BLANK);
  const [errors, setErrors] = useState<Partial<Record<EventFormField, string>>>({});
  const [submitted, setSubmitted] = useState<EventFormField[]>([]);
  const [focusKey, setFocusKey] = useState(0);
  const { error, saving, run } = useSave();

  const set = (field: keyof Values, value: string) => setValues((v) => ({ ...v, [field]: value }));
  const check = (field: EventFormField, next: Values = values) =>
    setErrors((e) => ({ ...e, [field]: eventFieldError(field, next) ?? undefined }));

  const onStart = (value: string) => {
    // The end follows the start while it is blank or would come before it.
    const endsOn = values.endsOn === '' || values.endsOn < value ? value : values.endsOn;
    const next = { ...values, startsOn: value, endsOn };
    setValues(next);
    if (errors.startsOn) check('startsOn', next);
    if (errors.endsOn || submitted.includes('endsOn')) check('endsOn', next);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const input: EventFormInput = { id, ...values };
    const result = validateEventForm(input);
    if (!result.ok) {
      const next: Partial<Record<EventFormField, string>> = {};
      for (const e of result.errors) next[e.field] = e.message;
      setErrors(next);
      setSubmitted(result.errors.map((e) => e.field));
      setFocusKey((k) => k + 1);
      return;
    }
    setErrors({});
    setSubmitted([]);
    if (await run(() => bazaar.addEvent(input))) onSaved(id);
  };

  // Still-wrong fields that a submit named, in the form's order.
  const summary = ORDER.filter((f) => submitted.includes(f) && errors[f]).map((f) => ({
    field: ID[f],
    message: errors[f] as string
  }));

  return (
    <Sheet
      title="Add an event"
      open={open}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            busy={saving}
            busyLabel="Saving…"
            disabled={!bazaar.online}
            reason="Adding an event needs signal."
          >
            Save the event
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => void onSubmit(e)}
        noValidate
        className="flex flex-col gap-4"
      >
        <ErrorSummary errors={summary} focusKey={focusKey} />
        {error ? <Banner tone="danger" title={error} /> : null}
        <Field
          id={ID.name}
          label="Name"
          value={values.name}
          maxLength={80}
          autoComplete="off"
          error={errors.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => check('name')}
        />
        <Field
          id={ID.place}
          label="Place"
          hint="Optional"
          value={values.place}
          maxLength={80}
          autoComplete="off"
          error={errors.place}
          onChange={(e) => set('place', e.target.value)}
          onBlur={() => check('place')}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id={ID.startsOn}
            mode="date"
            label="First day"
            hint={values.startsOn ? dayText(values.startsOn) : undefined}
            value={values.startsOn}
            error={errors.startsOn}
            onChange={(e) => onStart(e.target.value)}
            onBlur={() => check('startsOn')}
          />
          <Field
            id={ID.endsOn}
            mode="date"
            label="Last day"
            hint={values.endsOn ? dayText(values.endsOn) : 'Same as the first day for one day'}
            value={values.endsOn}
            min={values.startsOn || undefined}
            error={errors.endsOn}
            onChange={(e) => set('endsOn', e.target.value)}
            onBlur={() => check('endsOn')}
          />
        </div>
        <Field
          id={ID.rent}
          mode="decimal"
          prefix="₱"
          label="Stall rent"
          hint="Optional. Booked as an expense when the first day starts."
          value={values.rent}
          autoComplete="off"
          error={errors.rent}
          onChange={(e) => set('rent', e.target.value)}
          onBlur={() => check('rent')}
        />
      </form>
    </Sheet>
  );
}
