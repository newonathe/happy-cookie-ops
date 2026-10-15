'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { useCountUp } from './motion';

export interface StatPart {
  label: string;
  value: string;
}

export interface StatTileProps {
  label: string;
  /** A number counts up the first time it shows; text is drawn as given; null or undefined is "pending" ("—"). */
  value: number | string | null | undefined;
  /** How a counted number is written (`peso` for centavos). Default: grouped digits. */
  format?: (n: number) => string;
  unit?: string;
  detail?: ReactNode;
  tone?: 'ok' | 'warn' | 'danger';
  /** The figures that make up the headline. With parts the tile is a button that opens them. */
  parts?: StatPart[];
  /** Called with the new open state when the tile is tapped. */
  onOpen?: (open: boolean) => void;
}

const TONE = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;
const group = (n: number) => n.toLocaleString('en-PH');

function Numeral({ value, format }: { value: number; format: (n: number) => string }) {
  const counted = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">{format(counted)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/** One headline figure with its label, and its parts a tap away (spec rule 3). */
export function StatTile({
  label,
  value,
  format = group,
  unit,
  detail,
  tone,
  parts,
  onOpen
}: StatTileProps) {
  const [open, setOpen] = useState(false);
  const partsId = useId();
  const pending = value === null || value === undefined;
  const hasParts = Boolean(parts && parts.length > 0);
  // The display numeral is 40 px. A figure with two decimals ("₱280.00", "₱1,640.00") is wider than a half-width phone
  // tile (about 136 px of room), so a long one steps down rather than wrapping or running out of the tile.
  const written = pending ? '—' : typeof value === 'number' ? format(value) : value;
  const size =
    written.length <= 5
      ? 'text-display'
      : written.length <= 8
        ? 'text-[30px] leading-none font-bold tracking-tight'
        : written.length <= 10
          ? 'text-[24px] leading-none font-bold tracking-tight'
          : 'text-[20px] leading-none font-bold tracking-tight';
  const head = (
    <>
      <span className={cx('text-caption font-semibold text-ink-soft', hasParts && 'pr-5')}>
        {label}
      </span>
      <span className={cx('flex items-baseline gap-1.5 text-ink tabular-nums', size)}>
        {pending ? (
          <span aria-label="Not known yet">—</span>
        ) : typeof value === 'number' ? (
          <Numeral value={value} format={format} />
        ) : (
          value
        )}
        {unit ? <span className="text-body font-semibold text-ink-soft">{unit}</span> : null}
      </span>
      {detail ? (
        <span className={cx('text-caption font-semibold', tone ? TONE[tone] : 'text-ink-mute')}>
          {detail}
        </span>
      ) : null}
    </>
  );
  return (
    <div
      data-state={pending ? 'pending' : open ? 'open' : 'idle'}
      className="rounded-card border border-line bg-surface"
    >
      {hasParts ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={partsId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            onOpen?.(next);
          }}
          className="motion-press relative flex w-full flex-col items-start gap-1 rounded-card p-4 text-left"
        >
          {head}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={cx(
              'absolute top-4 right-4 size-3 text-ink-mute transition-transform duration-(--dur-base) ease-(--ease-standard)',
              open && 'rotate-180'
            )}
          >
            <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      ) : (
        <div className="flex flex-col items-start gap-1 p-4">{head}</div>
      )}
      {hasParts && open ? (
        <dl
          id={partsId}
          className="motion-rise m-0 flex flex-col gap-1.5 border-t border-divide px-4 py-3"
        >
          {parts?.map((part) => (
            <div key={part.label} className="flex justify-between gap-3 text-caption">
              <dt className="text-ink-soft">{part.label}</dt>
              <dd className="m-0 font-semibold text-ink tabular-nums">{part.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
