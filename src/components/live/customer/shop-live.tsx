'use client';

import { useId } from 'react';
import Image from 'next/image';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { ORDER_COPY } from '@/lib/orders/copy';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import { LiveShopFooter } from '@/components/live/live-shop-footer';

/** Fluid public menu; the existing scoped actions remain the authority for every cart change. */
export function CustomerShopLive({ v }: { v: OpsVals }) {
  const prefix = useId();
  const checkout = (className: string) => (
    <Button
      className={className}
      variant="primary"
      onClick={v.custToCheckout}
      disabled={!v.boxReady}
    >
      {v.boxCta}
    </Button>
  );
  return (
    <section
      data-screen-label="Customer shop"
      aria-label="The Happy Cookie shop"
      className="flex min-h-dvh w-full min-w-0 flex-col gap-5 bg-raise p-4 text-ink sm:p-6 xl:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Image
            unoptimized
            src="/assets/logo-full.png"
            alt="The Happy Cookie"
            width="190"
            height="56"
            className="mb-3 h-14 w-auto"
          />
          <h1 className="m-0 text-3xl font-bold tracking-tight">This week&apos;s drop</h1>
          {v.shopTagline ? <p className="mt-2 max-w-prose text-ink-soft">{v.shopTagline}</p> : null}
        </div>
        <Button onClick={v.openLookup}>Find my order</Button>
      </header>
      <Banner tone="info" title={v.dropBannerTitle} body={v.dropBannerSub} />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div
          aria-label="Cookies"
          className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4"
        >
          {v.shopFlavours.map((flavour, index) => {
            const heading = prefix + '-' + index;
            const allergens = typeof flavour.allergens === 'string' ? flavour.allergens.trim() : '';
            const hasAllergens =
              allergens && !/^(?:contains\s*:?|allergens\s*:?)$/i.test(allergens);
            return (
              <article
                key={index}
                aria-labelledby={heading}
                className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface"
              >
                <span
                  aria-hidden="true"
                  style={{
                    ...s(flavour.imgStyle),
                    width: '100%',
                    height: 'clamp(12rem,25vw,18rem)',
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    borderRadius: 0,
                    backgroundColor: 'var(--color-inset)'
                  }}
                />
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2
                      id={heading}
                      className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]"
                    >
                      {flavour.name}
                    </h2>
                    <strong className="whitespace-nowrap">{flavour.priceText}</strong>
                  </div>
                  {flavour.kind ? (
                    <span className="text-sm text-ink-soft">{flavour.kind}</span>
                  ) : null}
                  {flavour.desc ? (
                    <p className="text-sm text-ink-soft [overflow-wrap:anywhere]">{flavour.desc}</p>
                  ) : null}
                  {hasAllergens ? <p className="text-sm text-ink-soft">{allergens}</p> : null}
                  {flavour.available ? (
                    <div className="mt-auto flex items-center gap-3 pt-2">
                      <Button
                        variant="icon"
                        aria-label="Remove one"
                        aria-describedby={heading}
                        disabled={typeof flavour.qty === 'number' && flavour.qty <= 0}
                        onClick={flavour.minus}
                      >
                        −
                      </Button>
                      <span aria-live="polite" className="min-w-6 text-center font-semibold">
                        {flavour.qty}
                      </span>
                      <Button
                        variant="icon"
                        aria-label="Add one"
                        aria-describedby={heading}
                        onClick={flavour.plus}
                      >
                        +
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-auto text-sm font-semibold">
                      {flavour.soldOut ? 'Sold out this drop' : 'Ordering unavailable'}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <aside
          aria-label="Your cookies"
          className="min-w-0 rounded-card border border-line bg-surface p-4 lg:sticky lg:top-4"
        >
          <h2 className="text-xl font-semibold">{v.boxTitle}</h2>
          <p className="mt-2 text-sm text-ink-soft">{v.boxCountText}</p>
          <ul className="my-4 grid gap-3">
            {v.pickedItems.map((item, index) => (
              <li key={index} className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {item.qty} {item.name}
                </span>
                <Button variant="icon" onClick={item.remove} aria-label={'Remove one ' + item.name}>
                  −
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">{v.boxProgressText}</p>
          <p className="my-3 text-2xl font-bold">{v.boxTotalText}</p>
          <p className="mb-4 text-sm text-ink-soft">{ORDER_COPY.extras.priceNote}</p>
          <div className="hidden lg:block">{checkout('w-full')}</div>
        </aside>
      </div>
      <div className="mt-auto pt-3">
        <LiveShopFooter v={v} />
      </div>
      <div
        aria-label="Continue your order"
        className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 lg:hidden"
      >
        <span className="min-w-0">
          <strong className="block">{v.boxTotalText}</strong>
          <span className="text-sm text-ink-soft">{v.boxCountText}</span>
        </span>
        {checkout('min-w-0')}
      </div>
    </section>
  );
}
