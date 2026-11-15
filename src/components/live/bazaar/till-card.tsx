'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import { cookiePicture } from '@/lib/media/cookie-art';

const FEW_LEFT = 3;

/**
 * A cookie on the till, sized as the approved mockup draws it: its picture on top, then its name, what is left, its price
 * and "+ Add". The whole card is the tap target. Once in the sale it is outlined and shows − and how many: the − takes one
 * off right there (Ethan, 15 November 2026), a button of its own beside the card's, never inside it. A cookie that was planned and has all sold stays, dimmed, marked "Sold out".
 */
export function TillCard({
  name,
  photo,
  price,
  left,
  count,
  soldOut,
  onPress,
  onMinus
}: {
  name: string;
  /** Already resolved by the runtime. */
  photo: string;
  price: string;
  left: ReactNode;
  count: number;
  soldOut: boolean;
  onPress: (event?: unknown) => void;
  /** Takes one off this sale; shown while the cookie is in it. */
  onMinus?: (event?: unknown) => void;
}) {
  const few =
    !soldOut && (typeof left === 'number' || typeof left === 'string') && Number(left) <= FEW_LEFT;
  const minus = count > 0 && onMinus;
  return (
    <div className="relative min-w-0">
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
          <span className="min-h-[35px] text-caption leading-[1.4] font-semibold text-ink @lg:min-h-10 @lg:text-label">
            {name}
          </span>
          <span className={cx('text-caption', few ? 'font-semibold text-warn' : 'text-ink-mute')}>
            {soldOut ? 0 : left} left on the table
          </span>
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-body font-semibold text-ink">{price}</span>
            {minus ? (
              // Room for the − and the count, which sit over this corner as their own button.
              <span aria-hidden="true" className="h-10 w-[74px]" />
            ) : (
              <span
                data-part="count"
                className={cx(
                  'rounded-tag px-2 py-1 text-caption leading-[1.3] font-semibold',
                  count ? 'bg-brand text-surface' : 'bg-owner-soft text-ink-soft'
                )}
              >
                {soldOut ? 'Sold out' : count ? `${count} in sale` : '+ Add'}
              </span>
            )}
          </span>
        </span>
      </button>
      {minus ? (
        <span
          data-part="count"
          className="absolute right-2.5 bottom-2.5 flex items-center rounded-control bg-brand text-surface @lg:right-3 @lg:bottom-3"
        >
          <button
            type="button"
            onClick={onMinus}
            aria-label={`One less ${name} in this sale`}
            className="motion-press grid h-10 w-11 place-items-center rounded-control text-heading leading-none font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            −
          </button>
          <span className="min-w-[22px] pr-2.5 text-center text-label font-semibold">{count}</span>
        </span>
      ) : null}
    </div>
  );
}
