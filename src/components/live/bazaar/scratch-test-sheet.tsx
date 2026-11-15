'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { BazaarEventView } from '@/lib/bazaar/live-bazaar-types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PageTitle } from '@/components/ui/owner-kit';
import { useSave } from './use-save';

type ScratchTest = NonNullable<BazaarEventView['scratchTest']>;

/**
 * "Scratch this test event" for a closed event that was only a test. It takes the event back out of Money and Stock, so it
 * says what that means, warns that real sales must never be scratched, and asks for the event's name exactly before it
 * sends anything. What the server refused is shown here and the sheet stays open.
 */
export function ScratchTestSheet({
  name,
  scratch,
  onClose
}: {
  name: string;
  scratch: ScratchTest;
  onClose: () => void;
}) {
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const { error, saving, run } = useSave();
  const blocked = scratch.blocked !== null;
  const matches = typed === name;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || !matches) return;
    if (await run(() => scratch.run(typed))) onClose();
  };

  return (
    <section aria-label="Scratch this test event" className="flex flex-col gap-3">
      <PageTitle title="Scratch this test event" subtitle={name} />
      <form
        onSubmit={submit}
        aria-label="Scratch this test event"
        noValidate
        className="flex flex-col gap-4"
      >
        {error ? <Banner tone="danger" title={error} /> : null}
        {scratch.blocked ? <Banner tone="warn" title={scratch.blocked} /> : null}
        <p className="m-0 text-body text-ink">
          This takes the event&apos;s sales, fees and stock use back out of Money and Stock, as if
          it was a test. Real sales must never be scratched. Type the event&apos;s name to confirm.
        </p>
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
            busyLabel="Scratching…"
          >
            Scratch the event
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Keep the event
          </Button>
        </div>
      </form>
    </section>
  );
}
