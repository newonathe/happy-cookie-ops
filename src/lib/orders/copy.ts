import { DROP_CLOSED_MESSAGE } from '@/lib/rules/capacity';

/**
 * Every sentence the live checkout, lookup, waitlist and status page say that the ported
 * prototype did not. One place, so Cine can sign each one off.
 *
 * SIGNED OFF: `closed` (`DROP_CLOSED_MESSAGE`, verbatim from the prototype) and the ported
 * sentences the status page keeps (they are reused in `status-view.ts`, not copied here).
 *
 * PLACEHOLDER — every other line below needs the owner's wording. Do not delete this comment,
 * and do not present a rewrite as approved, until she has given the sentences (listed in
 * docs/state/current.md). They are plain and short on purpose: a plausible invention nobody
 * reviewed is worse than a stiff line she can see and replace.
 */
export const ORDER_COPY = {
  closed: DROP_CLOSED_MESSAGE,
  /** ZC002: `left` is a count of slots (quantity times weight), not boxes. */
  room: (left: number | null): string =>
    left === null || left <= 0
      ? 'There is no room left for that pickup week. Pick another date, or join the waiting list.'
      : left === 1
        ? 'Only 1 slot is left for that pickup week. Take a cookie off your order, or pick another date.'
        : `Only ${left} slots are left for that pickup week. Take some cookies off your order, or pick another date.`,
  tooManyUnpaid:
    'This number already has unpaid orders. Pay for them, or wait for them to lapse, then order again.',
  pickup: 'That pickup date or time is not available. Pick another.',
  method: 'That payment method is not offered any more. Pick another.',
  waitlistLimit: 'This number is already on the waiting list for several dates.',
  malformed:
    'Something in your order was not accepted. Check your name, Instagram handle and mobile number, and that every cookie is still on the menu.',
  idReused:
    'This order was already used for a different order. Check "Find my order" before you order again.',
  unavailable: 'Ordering is not available right now. Try again later.',
  unknown:
    'We could not confirm your order. Tap "Try again": it sends the same order, and if it already went through you will get its number.',
  waitlistUnknown: 'We could not confirm that. Tap "Try again": sending it twice does no harm.',
  changeWarning:
    'Check "Find my order" first: your last try may have gone through, and a changed order is a new order.',
  rulesUnavailable: 'The pickup days could not be loaded. Check your connection and reload.',
  noMenu: 'Nothing is on the menu yet.',
  lookupMiss:
    'Nothing matches that. Check the number, or message Cine on Instagram and she will look it up.',
  lookupError: 'We could not look that up. Check your connection and try again.',
  statusError: 'We could not load your order. Check your connection and reload.',
  statusMissing:
    'We could not find that order. Use "Find my order" with your order number and mobile number.',
  waitlistDone: 'You are on the waiting list. Cine will message you.',
  needName: 'We need a name for the box.',
  needIg: 'Add your Instagram handle, like @yourhandle.',
  badIg: 'That Instagram handle does not look right.',
  needMobile: 'Add a mobile number we can reach you on, like 09XX XXX XXXX.',
  needDate: 'Choose your pickup date.',
  needTime: 'Choose your pickup time.',
  needMethod: 'Choose how you will pay.',
  needItems: 'Pick at least one cookie.',
  payHelp:
    'Pick how you will pay. You pay after you place the order, to the account you pick; there is nothing to attach here.',
  noMethods: 'No payment method is set up yet. Message Cine on Instagram to order.',
  noDates: 'There are no pickup dates open right now.',
  qrNote: 'Scan this to pay after you place your order.',
  placedTitle: 'Order received',
  placedBody:
    'Keep this order number and the status link: they are how you check on your order. Payment goes to the account you picked.',
  payLater: (hours: number): string =>
    `Your order is held for ${hours} ${hours === 1 ? 'hour' : 'hours'} until it is paid.`
} as const;
