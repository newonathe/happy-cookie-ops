'use client';

import { useId, useState } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useSave } from '@/components/live/bazaar/use-save';

type Types = NonNullable<NonNullable<OpsVals['liveForm']>['types']>;
type Row = Types['rows'][number];

const BEHAVIOURS: Array<{ value: 'cookie' | 'set' | 'item'; label: string }> = [
  { value: 'item', label: 'Sold by the piece, not a cookie' },
  { value: 'cookie', label: 'Counts as a cookie' },
  { value: 'set', label: 'A set of cookies' }
];

/**
 * Her product types (Cine, 14 November 2026: "cookie, set, stickers, other etc"). Each has her name and a behaviour; Cookie and Set
 * are built in and stay on. A type in use keeps its behaviour, so a new behaviour is a new type.
 */
export function ProductTypesPanel({ types }: { types: Types }) {
  return (
    <section aria-label="Product types" className="flex flex-col gap-3">
      <h3 className="m-0 text-body font-bold text-ink">Product types</h3>
      <p className="m-0 text-caption text-ink-mute">
        Only types that count as a cookie are counted as cookies, in the per-order cookie limit and
        the sampler.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {types.rows.map((row) => (
          <TypeRow key={row.id} row={row} />
        ))}
      </ul>
      <AddType add={types.add} />
    </section>
  );
}

function TypeRow({ row }: { row: Row }) {
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const { error, saving, run } = useSave();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => row.rename(label))) setEditing(false);
  };
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      {error ? <Banner tone="danger" title={error} /> : null}
      {editing ? (
        <form onSubmit={submit} aria-label={'Rename ' + row.label} className="flex flex-col gap-2">
          <Field
            id={fieldId}
            label="Type name"
            value={label}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" busy={saving} busyLabel="Saving…">
              Save name
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-semibold text-ink">{row.label}</span>
            <span className="text-caption text-ink-mute">
              {row.behaviourText}
              {row.builtIn ? ' · built in' : ''}
              {row.active ? '' : ' · switched off'}
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Rename
            </Button>
            {row.toggle ? (
              <Button
                variant="ghost"
                size="sm"
                busy={saving}
                onClick={() => void run(() => row.toggle!())}
              >
                {row.active ? 'Switch off' : 'Switch on'}
              </Button>
            ) : null}
          </span>
        </div>
      )}
    </li>
  );
}

function AddType({ add }: { add: Types['add'] }) {
  const nameId = useId();
  const behaviourId = useId();
  const [label, setLabel] = useState('');
  const [behaves, setBehaves] = useState<'cookie' | 'set' | 'item'>('item');
  const { error, saving, run } = useSave();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => add(label, behaves))) setLabel('');
  };
  return (
    <form
      onSubmit={submit}
      aria-label="Add a product type"
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <Field
        id={nameId}
        label="New type"
        hint="For example Ice cream, Stickers or Drinks."
        value={label}
        autoComplete="off"
        onChange={(e) => setLabel(e.target.value)}
      />
      <label htmlFor={behaviourId} className="text-caption font-semibold text-ink-soft">
        How it counts
      </label>
      <select
        id={behaviourId}
        value={behaves}
        onChange={(e) => setBehaves(e.target.value as 'cookie' | 'set' | 'item')}
        className="min-h-11 rounded-control border border-line bg-surface px-3 text-body"
      >
        {BEHAVIOURS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant="primary"
        busy={saving}
        busyLabel="Adding…"
        disabled={!label.trim()}
      >
        Add type
      </Button>
    </form>
  );
}
