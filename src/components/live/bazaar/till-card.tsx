'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';

/** A cookie on the till: its photo, what is left on the table, its price, and how many are in this sale. */
export function TillCard({
  name,
  photo,
  price,
  left,
  count,
  soldOut,
  onPress
}: {
  name: string;
  /** Already resolved by the runtime. */
  photo: string;
  price: string;
  left: ReactNode;
  count: number;
  soldOut: boolean;
  onPress: (event?: unknown) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={soldOut}
      aria-label={`${name}, ${price}${count ? `, ${count} in this sale` : ''}${soldOut ? ', sold out' : ''}`}
      className={cx(
        'motion-press flex h-full w-full flex-col overflow-hidden rounded-card border bg-surface text-left focus-visible:outline-2 focus-visible:outline-brand',
        count ? 'border-brand' : 'border-line hover:border-line-strong',
        soldOut ? 'opacity-55' : null
      )}
    >
      <span
        aria-hidden="true"
        data-photo={photo ? 'yes' : 'none'}
        className="block aspect-[4/3] w-full bg-raise bg-contain bg-center bg-no-repeat"
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      />
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-[15px] font-semibold text-ink">{name}</span>
        <span className="text-caption text-ink-mute tabular-nums">
          {soldOut ? 'Sold out' : <>{left} left on the table</>}
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[15px] font-semibold text-ink tabular-nums">{price}</span>
          <span
            data-part="count"
            className={cx(
              'rounded-tag bg-chip px-2 py-0.5 text-caption font-semibold tabular-nums',
              count ? 'text-brand' : 'text-ink-soft'
            )}
          >
            {count ? `${count} in sale` : soldOut ? '' : '+ Add'}
          </span>
        </span>
      </span>
    </button>
  );
}
