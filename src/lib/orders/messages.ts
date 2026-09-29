/**
 * The texts Cine copies to a customer from the owner's message sheet (B3). Nothing is sent from
 * here: the app has no email or Instagram channel, and proof of payment stays in the DMs (F5).
 * The wording is PLACEHOLDER, like `staff-copy.ts`; the status link is the customer's only
 * credential, so it is built from the token the owner list carries and never logged or stored.
 */
import type { StaffOrder } from '@/lib/data/staff-orders';
import { extraDetails } from '@/lib/orders/extras-view';

export type MessageKind = 'unpaid' | 'paid' | 'ready' | 'swap';

export interface OrderMessage {
  key: string;
  kind: MessageKind;
  label: string;
  text: string;
}

const KIND_LABEL: Record<MessageKind, string> = {
  unpaid: 'Payment reminder',
  paid: 'Payment received',
  ready: 'Ready for pickup',
  swap: 'Flavour swap'
};

/** The customer's status page for one order, or null when the order has no token (an erased one). */
export function statusLink(origin: string, token: string | null): string | null {
  return token && /^[0-9a-f]{64}$/.test(token) ? `${origin}/status#t=${token}` : null;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || 'there';

/** ₱1,234 or ₱1,234.50, from centavos: the customer needs the exact amount to pay. */
const pesos = (cents: number): string => {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return '₱' + whole.toLocaleString('en-US') + (rest ? '.' + String(rest).padStart(2, '0') : '');
};

/** The pickup, as the customer's form worded it: a date, and a time or the campus slot. */
function pickupText(order: StaffOrder): string {
  if (!order.pickupDate) return '';
  const when =
    order.pickupWindow === 'campus'
      ? 'at the campus pickup'
      : order.pickupWindow
        ? `at ${order.pickupWindow}`
        : '';
  return `${order.pickupDate}${when ? ' ' + when : ''}`;
}

function body(kind: MessageKind, order: StaffOrder, link: string | null, flavour: string): string {
  const hi = `Hi ${firstName(order.name)}!`;
  const ref = order.id;
  const tail = link ? `\nYou can check your order here: ${link}` : '';
  const pickup = pickupText(order);
  // The add-ons, boxes and same-day extra the total already carries, so the customer can check the sum.
  const extras = extraDetails(order);
  const withExtras = extras.length ? `\nIncludes: ${extras.join('; ')}.` : '';
  switch (kind) {
    case 'unpaid':
      return `${hi} Your order ${ref} is waiting for payment. The total is ${pesos(order.totalCents)}. Please send it and reply with the reference.${withExtras}${tail}`;
    case 'paid':
      return `${hi} We got your payment for order ${ref}. Thank you!${pickup ? ' Pickup: ' + pickup + '.' : ''}${withExtras}${tail}`;
    case 'ready':
      return `${hi} Your order ${ref} is ready for pickup${pickup ? ' (' + pickup + ')' : ''}.${tail}`;
    case 'swap':
      return `${hi} We ran out of ${flavour} for order ${ref}. Would you like a different flavour instead? Tell us which one.${tail}`;
  }
}

/**
 * What the owner may copy for one order: the message that fits its state, and, while a flavour is
 * flagged unavailable, the swap question. Closed orders (collected, cancelled, no-show) have none.
 */
export function messagesFor(
  order: StaffOrder,
  origin: string,
  flavourName: (productId: string) => string
): OrderMessage[] {
  const link = statusLink(origin, order.statusToken);
  const out: OrderMessage[] = [];
  const primary: MessageKind | null =
    order.state === 'Payment review'
      ? 'unpaid'
      : order.state === 'Confirmed' || order.state === 'Preparing'
        ? 'paid'
        : order.state === 'Ready'
          ? 'ready'
          : null;
  if (primary) {
    out.push({
      key: `${order.id}:${primary}`,
      kind: primary,
      label: KIND_LABEL[primary],
      text: body(primary, order, link, '')
    });
  }
  if (primary && primary !== 'ready') {
    const flagged = order.items.filter((i) => i.unavailable).map((i) => flavourName(i.productId));
    if (flagged.length) {
      out.push({
        key: `${order.id}:swap`,
        kind: 'swap',
        label: KIND_LABEL.swap,
        text: body('swap', order, link, flagged.join(' and '))
      });
    }
  }
  return out;
}
