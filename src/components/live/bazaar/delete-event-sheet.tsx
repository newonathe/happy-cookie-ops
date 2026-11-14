'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { BazaarEventView } from '@/lib/bazaar/live-bazaar-types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PageTitle } from '@/components/ui/owner-kit';
import { useSave } from './use-save';

type DeleteEvent = NonNullable<BazaarEventView['deleteEvent']>;

/**
 * End event, first part (Ethan, 14 November 2026): "Delete this event" for an event that never sold. It cannot be undone, so
 * it says what goes and what does not change, and asks for the event's name exactly before it sends anything. What the
 * server refused is shown here and the sheet stays open.
 */
export function DeleteEventSheet({
  name,
  remove,
  onClose
}: {
  name: string;
  remove: DeleteEvent;
  onClose: () => void;
}) {
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const { error, saving, run } = useSave();
  const blocked = remove.blocked !== null;
  const matches = typed === name;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || !matches) return;
    if (await run(() => remove.run(typed))) onClose();
  };

  return (
    <section aria-label="Delete this event" className="flex flex-col gap-3">
      <PageTitle title="Delete this event" subtitle={name} />
      <form
        onSubmit={submit}
        aria-label="Delete this event"
        noValidate
        className="flex flex-col gap-4"
      >
        {error ? <Banner tone="danger" title={error} /> : null}
        {remove.blocked ? <Banner tone="warn" title={remove.blocked} /> : null}
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
          <li>Removes the booking, its day plans, typed costs and fees.</li>
          <li>Stock does not change: planned cookies were never in stock.</li>
          <li>Money does not change: the event has no sales.</li>
          <li>It cannot be undone. A record that it was deleted is kept.</li>
        </ul>
        <Field
          id={fieldId}
          label="Type the event name to confirm"
          hint={`Type ${name} exactly.`}
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="danger"
            disabled={blocked || !matches}
            busy={saving}
            busyLabel="Deleting…"
          >
            Delete event
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Keep the event
          </Button>
        </div>
      </form>
    </section>
  );
}
