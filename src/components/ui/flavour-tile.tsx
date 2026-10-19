'use client';

import type { ReactNode } from 'react';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { cx } from './cx';

export type FlavourTileState = 'idle' | 'inCart' | 'soldOut' | 'offMenu';

export interface FlavourTileProps {
  name: string;
  /** A stored image path (`assets/…` or a bucket path); resolved by `resolveImagePath`. */
  photo: string;
  /**
   * An image URL already resolved by `resolveImagePath` (the engine's flavour image, which the till has instead of the
   * stored path). Used as it is, in place of `photo`: resolving a bucket URL a second time would give no image.
   */
  resolvedPhoto?: string;
  /** Already written: "₱125.00". */
  price: string;
  /** How many are in the cart, or made. Shown as a badge when above 0. */
  count?: number;
  /** A small label on the photo: "Carried: 12". */
  badge?: string;
  state?: FlavourTileState;
  /** Small facts under the price (the recipe book's cost and margin). */
  meta?: ReactNode;
  /** Names the photo for a view transition, so it morphs into the same photo on the next page (the recipe book). */
  photoName?: string;
  /** A stepper (or any control) drawn under the price. A tile with this is not itself pressable. */
  stepper?: ReactNode;
  /** Tapping the tile (the till). Ignored for a sold-out tile. */
  onPress?: () => void;
}

/** A flavour as a photo tile: the same tile on the till, in the day plan and in the recipe book. */
export function FlavourTile({
  name,
  photo,
  resolvedPhoto,
  price,
  count,
  badge,
  meta,
  photoName,
  state = 'idle',
  stepper,
  onPress
}: FlavourTileProps) {
  const url = resolvedPhoto ?? resolveImagePath(photo);
  const soldOut = state === 'soldOut';
  const pressable = Boolean(onPress) && !stepper && !soldOut;
  const body = (
    <>
      <span
        aria-hidden="true"
        data-photo={url ? 'yes' : 'none'}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-control bg-chip bg-cover bg-center"
        style={{
          ...(url ? { backgroundImage: `url(${url})` } : {}),
          ...(photoName ? { viewTransitionName: photoName } : {})
        }}
      >
        {!url ? (
          <span className="grid size-full place-items-center text-title text-ink-faint">
            {name.slice(0, 1)}
          </span>
        ) : null}
        {badge ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-tag bg-surface px-1.5 py-0.5 text-caption font-semibold text-ink shadow-chip">
            {badge}
          </span>
        ) : null}
      </span>
      {count !== undefined && count > 0 ? (
        // Re-keyed on the number, so each change plays the tick (scale 1 → 1.15 → 1).
        <span
          key={count}
          data-part="count"
          className="motion-tick absolute top-1.5 right-1.5 grid min-w-6 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-caption font-bold text-surface tabular-nums"
        >
          {count}
        </span>
      ) : null}
      <span className="flex flex-col items-start gap-0.5 text-left">
        <span className="text-body font-bold text-ink">{name}</span>
        <span className="text-caption font-semibold text-ink-soft tabular-nums">{price}</span>
        {meta}
        {soldOut ? <span className="text-caption font-bold text-danger">Sold out</span> : null}
        {state === 'offMenu' ? (
          <span className="text-caption font-semibold text-ink-mute">Not on the menu</span>
        ) : null}
      </span>
    </>
  );
  const shell = cx(
    'relative flex flex-col gap-2 rounded-card border bg-surface p-2 text-left',
    state === 'inCart' ? 'border-brand ring-2 ring-brand' : 'border-line',
    soldOut && 'opacity-50'
  );
  return (
    <div data-state={state} className="flex flex-col gap-2">
      {pressable ? (
        <button type="button" onClick={onPress} className={cx(shell, 'motion-press w-full')}>
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
      {stepper ? <div className="flex justify-center">{stepper}</div> : null}
    </div>
  );
}
