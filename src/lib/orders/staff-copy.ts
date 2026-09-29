/**
 * Every sentence the owner's order screens say that the ported prototype did not (B3): the
 * toasts for the paid tick, packing, swaps and refunds, and the texts Cine copies to a customer.
 * One place, so she can sign each one off.
 *
 * PLACEHOLDER — every line below needs the owner's wording (listed in docs/state/current.md).
 * Do not delete this comment, and do not present a rewrite as approved until she has given the
 * sentences. They are plain and short on purpose: a plausible invention nobody reviewed is
 * worse than a stiff line she can see and replace.
 */
export const STAFF_COPY = {
  offline: 'Offline. That did not save.',
  conflict: 'Someone else changed this order just now. Showing their version.',
  gone: 'That order is not in the list any more. Reloaded.',
  refused: 'That change is not allowed for this order any more. Reloaded.',
  unknown: 'We could not confirm that. Check the order, then try again.',
  notLoaded: 'The orders are not loaded yet. Try again in a moment.',
  paid: (first: string): string => `${first}’s order is marked paid.`,
  paidPart: (first: string, balance: string): string =>
    `${first}’s order is marked paid. ${balance} is still to collect.`,
  rejected: 'Payment rejected. The order is cancelled and its slots are free again.',
  reopened: 'Back in your review queue.',
  packed: (first: string): string => `${first}’s order is packed and ready.`,
  collected: (first: string): string => `${first}’s order is marked collected.`,
  noShow: (first: string): string => `${first} did not collect. The order stays paid.`,
  refunded: (amount: string): string => `${amount} refund recorded. The order is cancelled.`,
  settled: (first: string): string => `Balance settled. ${first}’s order is fully paid.`,
  flagged: (flavour: string, first: string): string =>
    `${flavour} flagged as unavailable. Message ${first} to agree a swap.`,
  unflagged: (flavour: string): string => `${flavour} is available again for this order.`,
  swapped: (qty: number, from: string, to: string): string => `${qty} × ${from} swapped for ${to}.`,
  swapClash: 'That flavour is already on the order at another price. Pick a different one.',
  cleared: 'Sorted. The order is back to normal.',
  packUnpaid: 'Tick this order paid before packing it.',
  noRoom: (left: number): string =>
    left <= 0
      ? 'There is no room left in that pickup week.'
      : `Only ${left} slots are left in that pickup week.`
} as const;

/** The messages sheet (All tools → Customer messages). */
export const MESSAGE_SHEET = {
  title: 'Customer messages',
  intro:
    'A status link and a text to copy for each open order. Send them from Instagram or Messenger yourself.',
  empty: 'No open orders to message.',
  copy: 'Copy text',
  copied: 'Copied.',
  copyFailed: 'Could not copy. Select the text and copy it yourself.'
} as const;
