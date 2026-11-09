'use client';

import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Button } from '@/components/ui/button';
import { LiveCheckout } from '@/components/live/live-checkout';

/** The existing checkout and recovery controller, in a fluid public layout beside the locked port. */
export function CustomerCheckoutLive({ v }: { v: OpsVals }) {
  const placed = v.liveCheckout?.placed;
  return (
    <section
      data-screen-label="Customer checkout"
      aria-label="Customer checkout"
      className="flex min-h-dvh w-full min-w-0 flex-col gap-5 bg-raise p-4 text-ink sm:p-6 xl:p-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-3xl font-bold tracking-tight">Your order</h1>
        <Button onClick={v.backToShop}>Back to cookies</Button>
      </header>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <aside
          aria-label="Order summary"
          className="min-w-0 rounded-card border border-line bg-surface p-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4"
        >
          <h2 className="text-xl font-semibold">Order summary</h2>
          <ul className="my-4 grid gap-3">
            {(v.cust.lines ?? []).map((line, index) => (
              <li key={index} className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  style={{ ...s(line.imgStyle), width: 48, height: 48, flexShrink: 0 }}
                />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {line.qty} {line.name}
                </span>
                {!placed ? <strong className="whitespace-nowrap">{line.line}</strong> : null}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">{v.cust.countText}</p>
          <p className="mt-4 text-sm font-semibold">{placed ? 'Order total' : 'Cookie subtotal'}</p>
          <p className="my-2 text-2xl font-bold">{placed?.totalText ?? v.cust.totalText}</p>
          <p className="text-sm text-ink-soft">{v.cust.priceNote}</p>
        </aside>
        <div
          className={
            'min-w-0 gap-4 lg:col-start-1 lg:row-start-1 ' +
            (placed
              ? 'flex flex-col'
              : 'grid items-start xl:grid-cols-2 [&>button]:col-span-full [&>span]:col-span-full [&>[role=status]]:col-span-full [&>[role=alert]]:col-span-full')
          }
        >
          <LiveCheckout v={v} />
        </div>
      </div>
    </section>
  );
}
