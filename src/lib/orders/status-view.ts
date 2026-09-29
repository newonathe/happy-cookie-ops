import type { OrderStatusView } from '@/lib/data/orders';
import { clockLabel } from '@/lib/orders/pickup';

/**
 * The `cust` values the ported order-status screen reads, built from `order_status()` instead of the
 * engine's local orders (B2). The screen's markup is untouched: only these values change.
 *
 * Sentences the prototype already had and the owner signed off are reused word for word where they
 * are still true. The ported "We have your order and your payment proof" is not true here (an order
 * is placed unpaid and proof stays in the DMs), so the received state says something else. Those
 * new lines are PLACEHOLDERS until Cine words them; see `copy.ts`.
 */
export interface StatusCust {
  heroTitle: string;
  heroBody: string;
  orderNo: string;
  /** Empty: the ported "Invoice INV-…" line is never shown in live mode (F10). */
  invoiceLine: string;
  showRetry: false;
  showCode: false;
  pickupCode: string;
  windowText: string;
  allergenNote: string;
  timeline: Array<{ what: string; sub: string; done: boolean; now: boolean; todo: boolean }>;
}

const PAID_OR_LATER = ['Confirmed', 'Preparing', 'Ready', 'Completed'];

function whenText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function pickupText(order: OrderStatusView): string {
  if (!order.pickupDate) return '';
  const [y, m, d] = order.pickupDate.split('-').map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const w = order.pickupWindow;
  if (!w) return day;
  return day + ' · ' + (w === 'campus' ? 'Campus pickup' : clockLabel(w));
}

function step(what: string, sub: string, done: boolean, now: boolean) {
  return { what, sub, done, now, todo: !done && !now };
}

export function statusCust(order: OrderStatusView, opts: { allergenNote: string }): StatusCust {
  const st = order.state;
  const reached = (rank: number) => PAID_OR_LATER.indexOf(st) >= rank;
  const held = order.holdExpiresAt ? whenText(order.holdExpiresAt) : '';
  let heroTitle: string;
  let heroBody: string;
  if (st === 'Payment review') {
    heroTitle = 'Order received';
    heroBody = held
      ? `We have your order. Send payment with ${order.payMethod}; the order is held until ${held}.`
      : 'We have your order. Cine will confirm your payment.';
  } else if (st === 'Cancelled') {
    heroTitle = 'Order cancelled';
    heroBody = 'This order is cancelled. Message Cine on Instagram if you have any questions.';
  } else if (st === 'No-show') {
    heroTitle = 'You missed your slot';
    heroBody =
      'Nobody collected during your window. Message Cine on Instagram and she will sort out a new slot.';
  } else if (st === 'Ready') {
    heroTitle = 'Your box is ready';
    heroBody = 'Packed and waiting for your pickup window.';
  } else if (st === 'Completed') {
    heroTitle = 'Collected — thank you';
    heroBody = 'Enjoy them. If something was not right, message Cine and she will make it good.';
  } else {
    heroTitle = 'Payment confirmed';
    heroBody = 'Payment verified. Your cookies are in this weekend’s bake.';
  }
  const timeline =
    st === 'Cancelled'
      ? [
          step('Order received', 'We have your order', true, false),
          step('Cancelled', 'This order will not be baked', false, true)
        ]
      : [
          step('Order received', 'We have your order', true, false),
          step(
            reached(0) ? 'Payment confirmed' : 'Payment',
            reached(0) ? 'Confirmed by Cine' : 'Waiting for your payment',
            reached(0),
            !reached(0)
          ),
          step(
            'Baking',
            reached(1) ? 'In the oven this weekend' : 'This weekend',
            reached(1),
            reached(0) && !reached(1)
          ),
          step(
            'Ready for pickup',
            reached(2)
              ? 'Ready for your pickup window'
              : 'We send the exact address the morning of your slot',
            reached(2),
            reached(1) && !reached(2)
          ),
          step(
            st === 'No-show' ? 'Missed collection' : 'Collected',
            st === 'No-show'
              ? 'Message Cine for a new slot'
              : reached(3)
                ? 'Thank you'
                : 'During your window',
            reached(3),
            st === 'No-show'
          )
        ];
  return {
    heroTitle,
    heroBody,
    orderNo: order.orderNo,
    invoiceLine: '',
    showRetry: false,
    showCode: false,
    pickupCode: '',
    windowText: pickupText(order),
    allergenNote: opts.allergenNote,
    timeline
  };
}
