'use client';

import Image from 'next/image';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { CustomerPaymentDetails } from './payment-details';

/** Private status data and scoped actions still come from the existing order controller. */
export function CustomerStatusLive({ v }: { v: OpsVals }) {
  const { cust } = v;
  const known = !!cust.orderNo && cust.orderNo !== '—';
  return (
    <section
      aria-label="Customer order status"
      data-screen-label="Customer order status"
      className="flex min-h-dvh w-full min-w-0 flex-col gap-6 bg-raise p-4 text-ink sm:p-6 xl:p-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Image
          unoptimized
          src="/assets/logo-full.png"
          alt="The Happy Cookie"
          width={160}
          height={64}
          className="h-auto w-40"
        />
        <div className="flex flex-wrap gap-3">
          {known &&
          v.liveStatusRead &&
          (v.liveStatusRead.state === 'loaded' || v.liveStatusRead.state === 'loading') ? (
            <Button
              variant="primary"
              onClick={v.liveStatusRead.retry}
              disabled={!v.liveStatusRead.online}
              busy={v.liveStatusRead.state === 'loading'}
              busyLabel="Checking status…"
            >
              Check order status
            </Button>
          ) : null}
          <Button onClick={v.backToShop}>Back to cookies</Button>
        </div>
      </header>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div
          className={
            'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6 ' + (!known ? 'lg:col-span-2' : '')
          }
        >
          <div className="order-1 min-w-0 rounded-card border border-line bg-surface p-5 sm:p-6">
            {known ? (
              <p className="mb-3 text-sm font-semibold tabular-nums">Order {cust.orderNo}</p>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">
              {cust.heroTitle}
            </h1>
            {cust.heroBody ? (
              <p className="mt-3 max-w-prose text-ink-soft">{cust.heroBody}</p>
            ) : null}
            {!known && v.liveStatusRead?.state !== 'loading' ? (
              <Button className="mt-4" onClick={v.openLookup}>
                Find my order
              </Button>
            ) : null}
          </div>
          {known && cust.timeline?.length ? (
            <article
              aria-label="Order progress"
              className="order-3 min-w-0 rounded-card border border-line bg-surface p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold">Order progress</h2>
              <ol className="mt-5 grid gap-5">
                {cust.timeline.map((step, index) => (
                  <li
                    key={index}
                    aria-current={step.now ? 'step' : undefined}
                    className="flex min-w-0 items-start gap-3"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        'mt-1 size-3 shrink-0 rounded-full ' +
                        (step.done ? 'bg-ok' : step.now ? 'bg-brand' : 'bg-line-strong')
                      }
                    />
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="font-semibold">{step.what}</p>
                      <p className="mt-1 text-sm text-ink-soft">{step.sub}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
        </div>
        {known ? (
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            {v.liveCustomerPayment ? (
              <div className="order-2 min-w-0">
                <CustomerPaymentDetails payment={v.liveCustomerPayment} />
              </div>
            ) : null}
            <aside
              aria-label="Pickup details"
              className="order-4 flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold">Pickup</h2>
              <p className="[overflow-wrap:anywhere]">
                {cust.windowText || 'Pickup details are unavailable.'}
              </p>
              {cust.showCode ? (
                <p>
                  Pickup code: <strong>{cust.pickupCode}</strong>
                </p>
              ) : null}
              {cust.showRetry ? <Button onClick={cust.restart}>Send payment again</Button> : null}
              <Button onClick={cust.reorder}>Order this cookie again</Button>
            </aside>{' '}
          </div>
        ) : null}
      </div>
      {cust.allergenNote ? (
        <p className="max-w-prose text-sm text-ink-soft">{cust.allergenNote}</p>
      ) : null}
    </section>
  );
}
