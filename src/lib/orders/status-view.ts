import type { OrderStatusView } from '@/lib/data/orders';
import { ORDER_COPY } from '@/lib/orders/copy';
import { clockLabel } from '@/lib/orders/pickup';

/**
 * The `cust` values the ported order-status screen reads, built from `order_status()` instead of the
 * engine's local orders (B2). The screen's markup is untouched: only these values change.
 *
 * Sentences the prototype already had and the owner signed off are reused word for word where they
 * are still true (the titles and bodies below that are not in `ORDER_COPY`). The ported "We have your
 * order and your payment proof" is not true here (an order is placed unpaid and proof stays in the
 * DMs), so the received state says something else. Every new line is in `ORDER_COPY.status`, marked
 * PLACEHOLDER until Cine words it.
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

/** How far an order has got: 0 paid, 1 baking, 2 ready, 3 collected. A no-show missed a ready box. */
const RANK: Record<string, number> = {
  Confirmed: 0,
  Preparing: 1,
  Ready: 2,
  'No-show': 2,
  Completed: 3
};

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

/** `2026-10-08` and `10:30` (or `campus`) as `Thu, Oct 8 · 10:30 AM`. */
export function pickupLabel(date: string | null, window: string | null): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  if (!window) return day;
  return day + ' · ' + (window === 'campus' ? 'Campus pickup' : clockLabel(window));
}

export function pickupText(order: OrderStatusView): string {
  return pickupLabel(order.pickupDate, order.pickupWindow);
}

function step(what: string, sub: string, done: boolean, now: boolean) {
  return { what, sub, done, now, todo: !done && !now };
}

export function statusCust(
  order: OrderStatusView,
  opts: { allergenNote: string; now?: number }
): StatusCust {
  const S = ORDER_COPY.status;
  const now = opts.now ?? Date.now();
  const st = order.state;
  const rank = RANK[st] ?? -1;
  const reached = (k: number) => rank >= k;
  const held = order.holdExpiresAt ? whenText(order.holdExpiresAt) : '';
  const lapsed = !!order.holdExpiresAt && new Date(order.holdExpiresAt).getTime() <= now;
  let heroTitle: string;
  let heroBody: string;
  if (st === 'Payment review') {
    heroTitle = 'Order received';
    heroBody = lapsed ? S.lapsed : held ? S.receivedHeld(order.payMethod, held) : S.receivedNoHold;
  } else if (st === 'Cancelled') {
    heroTitle = 'Order cancelled';
    heroBody = S.cancelledBody;
  } else if (st === 'No-show') {
    heroTitle = 'You missed your slot';
    heroBody =
      'Nobody collected during your window. Message Cine on Instagram and she will sort out a new slot.';
  } else if (st === 'Ready') {
    heroTitle = 'Your box is ready';
    heroBody = S.readyBody;
  } else if (st === 'Completed') {
    heroTitle = 'Collected — thank you';
    heroBody = 'Enjoy them. If something was not right, message Cine and she will make it good.';
  } else {
    heroTitle = 'Payment confirmed';
    heroBody = 'Payment verified. Your cookies are in this weekend’s bake.';
  }
  const campus = order.pickupWindow === 'campus';
  const timeline =
    st === 'Cancelled'
      ? [
          step('Order received', S.stepReceived, true, false),
          step('Cancelled', S.stepCancelled, false, true)
        ]
      : [
          step('Order received', S.stepReceived, true, false),
          step(
            reached(0) ? 'Payment confirmed' : 'Payment',
            reached(0) ? 'Confirmed by Cine' : lapsed ? S.stepLapsed : S.stepWaiting,
            reached(0),
            !reached(0) && !lapsed
          ),
          step(
            'Baking',
            reached(1) ? 'In the oven this weekend' : 'This weekend',
            reached(1),
            reached(0) && !reached(1)
          ),
          step(
            'Ready for pickup',
            reached(2) ? S.stepReady : campus ? S.stepCampus : S.stepAddress,
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
