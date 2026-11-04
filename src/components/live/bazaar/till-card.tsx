'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { cookiePicture } from '@/lib/media/cookie-art';

const FEW_LEFT = 3;

/**
 * A cookie on the till's board, as one row: its picture, its name and what is left, and its price lined up with the
 * others. The whole row is the tap target. Once in the sale it is marked and counted on the picture, with room on the
 * right for the minus button the till draws over it.
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
  const few =
    !soldOut && (typeof left === 'number' || typeof left === 'string') && Number(left) <= FEW_LEFT;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={soldOut}
      aria-label={`${name}, ${price}${count ? `, ${count} in this sale` : ''}${soldOut ? ', sold out' : ''}`}
      className={cx(
        'motion-press flex min-h-[72px] w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
        count ? 'bg-raise pr-16 shadow-[inset_3px_0_0_var(--color-brand)]' : 'hover:bg-raise',
        soldOut ? 'opacity-50' : null
      )}
    >
      <span className="relative shrink-0">
        <span
          aria-hidden="true"
          data-photo={photo ? 'yes' : 'art'}
          className="block size-12 rounded-control bg-raise bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${cookiePicture(photo, name)})` }}
        />
        {count ? (
          <span
            data-part="count"
            className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[12px] font-semibold text-surface tabular-nums"
          >
            {count}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] leading-snug font-semibold text-ink">{name}</span>
        <span
          className={cx(
            'text-caption tabular-nums',
            few ? 'font-semibold text-warn' : 'text-ink-mute'
          )}
        >
          {soldOut ? 'Sold out' : <>{left} left</>}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{price}</span>
    </button>
  );
}
