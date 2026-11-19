'use client';

import { useId, useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Button } from '@/components/ui/button';

type BoxVals = NonNullable<OpsVals['shopBox']>;

/** The cookies picked in the cart, the sampler (a set, not a boxed cookie) left out. */
export function boxPicks(v: OpsVals, box: BoxVals): Array<{ name: string; qty: number }> {
  return (v.shopFlavours ?? []).flatMap((f, i) => {
    const qty = Number(f.qty) || 0;
    return i === box.samplerRow || qty <= 0 ? [] : [{ name: String(f.name), qty }];
  });
}

/**
 * Cine's "Box orders" page: one tab per active box size, the shop's cookie cards (round pictures) and a side
 * panel of what is in the box. It edits the same cart as the shop and ends in the normal checkout, where the box
 * is priced by the existing rule: the cookies at their prices plus the box's charge.
 */
export function BoxOrderView({ v, box, onBack }: { v: OpsVals; box: BoxVals; onBack: () => void }) {
  const prefix = useId();
  const [chosen, setChosen] = useState(box.sizes[0] ?? 0);
  const size = box.sizes.includes(chosen) ? chosen : (box.sizes[0] ?? 0);
  const picks = boxPicks(v, box);
  const n = box.cookies;
  const full = n === size;
  const over = n - size;
  const note =
    over > 0
      ? `A box of ${size} holds ${size}. Remove ${over} to continue.`
      : full
        ? 'The box is full.'
        : `Add ${size - n} more.`;
  const go = (
    <Button className="w-full" variant="primary" disabled={!full} onClick={() => box.pick(size)}>
      Continue
    </Button>
  );
  return (
    <section
      data-screen-label="Box orders"
      aria-label="Box orders"
      className="flex min-h-dvh w-full min-w-0 flex-col gap-5 bg-raise p-4 text-ink sm:p-6 xl:p-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-title font-bold tracking-tight">Box orders</h1>
        <Button onClick={onBack}>Back to the shop</Button>
      </header>
      <div role="tablist" aria-label="Box size" className="flex flex-wrap gap-2">
        {box.sizes.map((sz) => (
          <Button
            key={sz}
            role="tab"
            aria-selected={sz === size}
            variant={sz === size ? 'primary' : 'secondary'}
            onClick={() => setChosen(sz)}
          >
            Box of {sz}
          </Button>
        ))}
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div
          aria-label="Cookies"
          className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-4"
        >
          {v.shopFlavours.map((f, i) => {
            if (i === box.samplerRow) return null;
            const id = prefix + '-' + i;
            return (
              <article
                key={i}
                aria-labelledby={id}
                className="flex min-w-0 flex-col items-center gap-2 rounded-card border border-line bg-surface p-3 text-center"
              >
                <span
                  aria-hidden="true"
                  style={{
                    ...s(f.imgStyle),
                    width: '7rem',
                    height: '7rem',
                    borderRadius: '50%',
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundColor: 'var(--color-cust-bg)'
                  }}
                />
                <h2 id={id} className="text-heading font-semibold [overflow-wrap:anywhere]">
                  {f.name}
                </h2>
                <strong>{f.priceText}</strong>
                {f.available ? (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="icon"
                      aria-label="Remove one"
                      aria-describedby={id}
                      disabled={(Number(f.qty) || 0) <= 0}
                      onClick={f.minus}
                    >
                      −
                    </Button>
                    <span aria-live="polite" className="min-w-6 font-semibold">
                      {f.qty}
                    </span>
                    <Button
                      variant="icon"
                      aria-label="Add one"
                      aria-describedby={id}
                      disabled={n >= size}
                      onClick={f.plus}
                    >
                      +
                    </Button>
                  </div>
                ) : (
                  <p className="text-label font-semibold">
                    {f.soldOut ? 'Sold out this drop' : 'Ordering unavailable'}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <aside
          aria-label="In this box"
          className="min-w-0 rounded-card border border-line bg-surface p-4 lg:sticky lg:top-4"
        >
          <h2 className="text-heading font-semibold">Box of {size}</h2>
          <p className="mt-2 font-semibold">
            {n} of {size} picked
          </p>
          <ul className="my-3 grid gap-1">
            {picks.map((p) => (
              <li key={p.name}>
                {p.qty}× {p.name}
              </li>
            ))}
          </ul>
          <p role="status" className="mb-3 text-label text-ink-soft">
            {note}
          </p>
          <div className="hidden lg:block">{go}</div>
        </aside>
      </div>
      <div
        aria-label="Continue your box"
        className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-auto flex items-center justify-between gap-3 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 lg:hidden"
      >
        <strong>
          {n} of {size}
        </strong>
        <Button variant="primary" disabled={!full} onClick={() => box.pick(size)}>
          Continue
        </Button>
      </div>
    </section>
  );
}
