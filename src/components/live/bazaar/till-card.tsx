'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';

/**
 * A cookie on the till, as one short row: a small photo, its name, its price and what is left. Many
 * fit on one screen. With cookies in the sale, room is left on the right for the minus button the
 * till draws over it.
 */
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
        'motion-press flex min-h-[76px] w-full items-center gap-3 rounded-card border bg-surface p-2.5 text-left focus-visible:outline-2 focus-visible:outline-brand',
        count ? 'border-brand pr-14' : 'border-line hover:border-line-strong',
        soldOut ? 'opacity-55' : null
      )}
    >
      <span
        aria-hidden="true"
        data-photo={photo ? 'yes' : 'none'}
        className="size-14 shrink-0 rounded-control bg-raise bg-contain bg-center bg-no-repeat"
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] leading-snug font-semibold text-ink">{name}</span>
        <span className="text-caption text-ink-mute tabular-nums">
          <span className="font-semibold text-ink">{price}</span>
          {' · '}
          {soldOut ? 'Sold out' : <>{left} left</>}
        </span>
      </span>
      {count || !soldOut ? (
        <span
          data-part="count"
          className={cx(
            'shrink-0 rounded-tag px-2 py-0.5 text-caption font-semibold tabular-nums',
            count ? 'bg-brand text-surface' : 'bg-chip text-ink-soft'
          )}
        >
          {count ? count : '+ Add'}
        </span>
      ) : null}
    </button>
  );
}
