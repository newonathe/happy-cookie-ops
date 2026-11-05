'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { cookiePicture } from '@/lib/media/cookie-art';

const FEW_LEFT = 3;

/**
 * A cookie on the till, sized as the approved mockup draws it: its picture on top, then its name, what is left, its price
 * and "+ Add". The whole card is the tap target. Once in the sale it is outlined and says how many; the sale panel takes
 * one off. A cookie that was planned and has all sold stays, dimmed, marked "Sold out".
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
      data-part="tile"
      onClick={onPress}
      disabled={soldOut}
      aria-label={`${name}, ${price}${count ? `, ${count} in this sale` : ''}${soldOut ? ', sold out' : ''}`}
      className={cx(
        'motion-press flex w-full min-w-0 flex-col overflow-clip rounded-card border bg-surface text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        count ? 'border-brand shadow-[inset_0_0_0_1px_var(--color-brand)]' : 'border-line',
        soldOut ? 'opacity-55' : 'hover:border-line-strong'
      )}
    >
      <span className="flex w-full justify-center bg-photo-well p-2 @lg:p-2.5">
        <span
          aria-hidden="true"
          data-photo={photo ? 'yes' : 'art'}
          className={cx(
            'block size-[102px] bg-contain bg-center bg-no-repeat mix-blend-multiply @lg:size-[118px]',
            soldOut ? 'grayscale' : null
          )}
          style={{ backgroundImage: `url(${cookiePicture(photo, name)})` }}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5 p-2.5 @lg:p-3">
        <span className="min-h-[35px] text-[13px] leading-[1.4] font-semibold text-ink @lg:min-h-10 @lg:text-[14px]">
          {name}
        </span>
        <span
          className={cx(
            'text-caption tabular-nums',
            few ? 'font-semibold text-warn' : 'text-ink-mute'
          )}
        >
          {soldOut ? 0 : left} left on the table
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-ink tabular-nums">{price}</span>
          <span
            data-part="count"
            className={cx(
              'rounded-tag px-2 py-1 text-[11px] leading-[1.3] font-semibold',
              count ? 'bg-brand text-surface' : 'bg-owner-soft text-ink-soft'
            )}
          >
            {soldOut ? 'Sold out' : count ? `${count} in sale` : '+ Add'}
          </span>
        </span>
      </span>
    </button>
  );
}
