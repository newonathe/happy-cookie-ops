'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { eventFieldError, rentCentsOf, type EventFormField } from '@/lib/bazaar/event-form';
import { dayText } from '@/lib/date/day-text';
import { formatPesos } from '@/lib/stock/stock-status';
import type { EventEntryVals } from '@/store/event-entry';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field } from '@/components/ui/field';
import { FooterActions, PageTitle, Panel } from '@/components/ui/owner-kit';
import { FactRow, ReviewPanel } from '@/components/ui/owner-patterns';

/** The input id of each field: the error summary links to it. */
const ID: Record<EventFormField, string> = {
  name: 'event-name',
  place: 'event-place',
  startsOn: 'event-start',
  endsOn: 'event-end',
  rent: 'event-rent'
};
const ORDER: EventFormField[] = ['name', 'place', 'startsOn', 'endsOn', 'rent'];

/** Why the device copy is in the way, and the one thing to do about it. */
function Blocked({ entry }: { entry: EventEntryVals }) {
  const text = {
    closed: { title: 'Reading your account…', action: null },
    locked: {
      title: 'Adding an event is open in another tab. Close it, then try again.',
      action: { label: 'Try again', onPress: () => void entry.retryStorage() }
    },
    invalid: {
      title:
        'The event you started on this device cannot be read. If you had saved it, look for it in your events before adding it again.',
      action: { label: 'Keep a copy and start over', onPress: entry.setAside }
    },
    unavailable: {
      title: entry.saved
        ? 'The event was saved, but this device could not update its recovery copy. Try again before adding another.'
        : entry.pending
          ? 'This device could not update the event recovery copy. The sent entry is still kept; check it before adding another.'
          : 'This device could not keep what you typed. Nothing new has been sent.',
      action: { label: 'Try again', onPress: () => void entry.retryStorage() }
    },
    ready: { title: '', action: null }
  }[entry.phase];
  return (
    <Banner
      tone={entry.phase === 'closed' ? 'info' : 'warn'}
      title={text.title}
      action={text.action ?? undefined}
    />
  );
}

/**
 * Add event (client v4), as a page. Name, place, days and stall rent; nothing is pre-filled that is
 * a decision. What was typed is kept by `EventEntry`, so leaving or reloading loses nothing. Errors
 * point at the field. Editing an event happens on its page.
 */
export function EventEntryPage({ entry }: { entry: EventEntryVals }) {
  const [blurred, setBlurred] = useState<Partial<Record<EventFormField, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.querySelector('h1')?.focus();
  }, [entry.step]);
  const draft = entry.draft;
  const title = (
    <div ref={heading}>
      <PageTitle
        title={entry.step === 'review' ? 'Review event' : 'Add event'}
        subtitle={
          entry.step === 'review'
            ? 'Check it, then save.'
            : 'Dates, place and stall rent. Closing a day is a separate action.'
        }
      />
    </div>
  );
  if (entry.phase !== 'ready' || !draft)
    return (
      <div className="w-full">
        {title}
        <div className="mb-3">
          <Blocked entry={entry} />
        </div>
        <Button variant="secondary" onClick={entry.leave}>
          Back to events
        </Button>
      </div>
    );

  if (entry.step === 'review') {
    const rent = rentCentsOf(draft.rent);
    return (
      <div className="w-full">
        {title}
        {entry.pending && entry.unconfirmed ? (
          <div className="mb-3">
            <Banner
              tone="warn"
              title="This event has not been confirmed yet."
              body="Check for the saved event, or retry the same entry. Retrying cannot make a second event."
              action={{ label: 'Check saved event', onPress: () => void entry.abandon() }}
            />
          </div>
        ) : null}
        {entry.offline ? (
          <div className="mb-3">
            <Banner tone="warn" title="Saving an event needs signal. It is kept on this device." />
          </div>
        ) : null}
        <ReviewPanel
          backLabel={entry.pending ? 'Back to events' : 'Change event'}
          onBack={entry.pending ? entry.leave : entry.change}
          saveLabel={entry.pending ? 'Send again' : 'Save event'}
          onSave={() => void entry.save()}
          saving={entry.saving}
        >
          <FactRow label="Event name">{draft.name.trim()}</FactRow>
          <FactRow label="Place">{draft.place.trim() || 'Not set'}</FactRow>
          <FactRow label="First day">{dayText(draft.startsOn)}</FactRow>
          <FactRow label="Last day">{dayText(draft.endsOn)}</FactRow>
          <FactRow label="Stall rent" detail="Booked as an expense when the first day starts.">
            {rent ? formatPesos(rent / 100) : 'None'}
          </FactRow>
        </ReviewPanel>
      </div>
    );
  }

  const errors: Partial<Record<EventFormField, string>> = { ...blurred };
  for (const error of entry.errors) errors[error.field] = error.message;
  const check = (field: EventFormField) =>
    setBlurred((now) => ({ ...now, [field]: eventFieldError(field, draft) ?? undefined }));
  const set = (field: EventFormField, value: string) => {
    setBlurred((now) => ({ ...now, [field]: undefined }));
    entry.set(field, value);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttempt((n) => n + 1);
    entry.review();
  };
  const summary = ORDER.flatMap((field) => {
    const message = entry.errors.find((error) => error.field === field)?.message;
    return message ? [{ field: ID[field], message }] : [];
  });
  const started = ORDER.some((field) => draft[field] !== '');

  return (
    <div className="w-full">
      {title}
      <Panel>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <ErrorSummary errors={summary} focusKey={attempt} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id={ID.name}
              label="Name"
              value={draft.name}
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
              value={draft.place}
              maxLength={80}
              autoComplete="off"
              error={errors.place}
              onChange={(e) => set('place', e.target.value)}
              onBlur={() => check('place')}
            />
            <Field
              id={ID.startsOn}
              mode="date"
              label="First day"
              hint={draft.startsOn ? dayText(draft.startsOn) : undefined}
              value={draft.startsOn}
              error={errors.startsOn}
              onChange={(e) => set('startsOn', e.target.value)}
              onBlur={() => check('startsOn')}
            />
            <Field
              id={ID.endsOn}
              mode="date"
              label="Last day"
              hint={draft.endsOn ? dayText(draft.endsOn) : 'Same as the first day for one day'}
              value={draft.endsOn}
              min={draft.startsOn || undefined}
              error={errors.endsOn}
              onChange={(e) => set('endsOn', e.target.value)}
              onBlur={() => check('endsOn')}
            />
            <Field
              id={ID.rent}
              mode="decimal"
              prefix="₱"
              label="Stall rent"
              hint="Optional. Booked as an expense when the first day starts."
              value={draft.rent}
              autoComplete="off"
              error={errors.rent}
              onChange={(e) => set('rent', e.target.value)}
              onBlur={() => check('rent')}
            />
          </div>
          <FooterActions
            back={
              <Button variant="secondary" onClick={entry.leave}>
                Back to events
              </Button>
            }
            forward={
              <>
                {started ? (
                  <Button variant="ghost" onClick={entry.discard}>
                    Clear
                  </Button>
                ) : null}
                <Button variant="primary" type="submit">
                  Review event
                </Button>
              </>
            }
          />
        </form>
      </Panel>
    </div>
  );
}
