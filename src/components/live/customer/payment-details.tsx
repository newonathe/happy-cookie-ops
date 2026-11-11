'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { OpsVals } from '@/view-models/vals';
import { peso } from '@/lib/money/format';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { Button } from '@/components/ui/button';

/** Facts and owner-entered instructions only. Sending money never confirms an order here. */
export function CustomerPaymentDetails({
  payment
}: {
  payment: NonNullable<OpsVals['liveCustomerPayment']>;
}) {
  const { order } = payment;
  const [now, setNow] = useState(Date.now);
  const expiry = Date.parse(order.holdExpiresAt ?? '');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setNow(Date.now());
      const remaining = expiry - Date.now();
      if (remaining > 0) timer = setTimeout(refresh, Math.min(remaining + 1, 2147483647));
    };
    refresh();
    return () => clearTimeout(timer);
  }, [expiry, order.orderNo]);
  const confirmed = order.payState === 'confirmed';
  const paid = typeof order.paidCents === 'number' ? order.paidCents : null;
  // Same approved balance formula as the owner's order projection; refunds remain explicit owner actions.
  const balance = confirmed && paid !== null ? Math.max(0, order.totalCents - paid) : null;
  const unpaid = order.state === 'Payment review' && order.payState === 'unpaid';
  const held = unpaid && Number.isFinite(expiry) && now < expiry;
  const active = order.state !== 'Cancelled' && order.payState !== 'refunded';
  const due =
    active && payment.fresh
      ? confirmed
        ? balance
        : held && order.paidCents !== undefined && (paid === null || paid === 0)
          ? order.totalCents
          : null
      : null;
  const matches = payment.methods?.filter((m) => m.label === order.payMethod) ?? [];
  const method = matches.length === 1 ? matches[0] : undefined;
  const qr = method ? resolveImagePath(method.qr) : '';
  return (
    <article
      aria-label="Payment details"
      className="min-w-0 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold">Payment</h2>
      <dl className="my-4 grid max-w-md grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
        <dt>Order total</dt>
        <dd className="font-semibold tabular-nums">{peso(order.totalCents)}</dd>
        <dt>Recorded payment</dt>
        <dd className="font-semibold tabular-nums">
          {order.paidCents === undefined
            ? 'Unavailable'
            : paid === null
              ? 'Not recorded'
              : peso(paid)}
        </dd>
        {due !== null && due > 0 ? (
          <>
            <dt>{confirmed ? 'Remaining balance' : 'Amount to pay'}</dt>
            <dd className="font-semibold tabular-nums">{peso(due)}</dd>
          </>
        ) : null}
      </dl>
      {!payment.fresh ? (
        <p>Refresh your order status before paying.</p>
      ) : !active ? (
        <p>{order.payState === 'refunded' ? 'Refund recorded.' : 'Order cancelled.'}</p>
      ) : order.paidCents === undefined ? (
        <p>Recorded payment details are unavailable. Check with the shop before paying.</p>
      ) : unpaid && !held ? (
        <p>The payment hold has ended or cannot be checked. Contact the shop before paying.</p>
      ) : confirmed && balance === 0 ? (
        <p>
          {paid !== null && paid > order.totalCents
            ? 'Recorded payment exceeds the current total. Contact the shop about the difference.'
            : 'Payment confirmed by the shop.'}
        </p>
      ) : due !== null && due > 0 ? (
        <div className="flex min-w-0 flex-col gap-3 [overflow-wrap:anywhere]">
          <p>Payment needs verification by the shop.</p>
          <p>Send payment proof to the shop for verification.</p>
          {method && payment.paymentState === 'ready' ? (
            <>
              <p className="font-semibold">{method.label}</p>
              {method.name ? <p>Account name: {method.name}</p> : null}
              {method.number ? (
                <p className="select-text">Account number: {method.number}</p>
              ) : null}
              {qr ? (
                <Image
                  unoptimized
                  src={qr}
                  alt={method.label + ' payment QR'}
                  width={240}
                  height={240}
                  className="h-auto w-full max-w-60 object-contain"
                />
              ) : null}
              <Button
                className="self-start max-w-full"
                onClick={payment.retry}
                disabled={!payment.canRetry}
              >
                Refresh payment details
              </Button>
              {!method.number && !qr ? <p>Contact the shop for payment instructions.</p> : null}
            </>
          ) : (
            <>
              <p>
                {payment.paymentState === 'loading'
                  ? 'Loading payment details…'
                  : 'Payment details are unavailable. Contact the shop or retry.'}
              </p>
              {payment.paymentState !== 'loading' ? (
                <Button
                  className="self-start max-w-full"
                  onClick={payment.retry}
                  disabled={!payment.canRetry}
                >
                  Retry payment details
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <p>Payment needs checking by the shop before you send another payment.</p>
      )}
    </article>
  );
}
