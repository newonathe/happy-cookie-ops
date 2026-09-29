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
  reopenRefunded: 'A refunded order cannot be reopened.',
  linkHint: 'The customer’s status page. Send it to them yourself.',
  linkErased: 'This order has no status link any more (its personal data was erased).',
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
  packLine: 'To pack',
  copy: 'Copy text',
  copied: 'Copied.',
  copyFailed: 'Could not copy. Select the text and copy it yourself.'
} as const;

/** The order rules form and the shop switch (B3). PLACEHOLDER, like the rest of this file. */
export const RULES_COPY = {
  saved: 'Order rules saved.',
  conflict: 'Someone else changed the order rules just now. Showing their version.',
  refused: 'The order rules could not be saved. Check the numbers.',
  switchRefused: 'The shop switch could not be saved.',
  intro:
    'These decide what a customer can pick and how long an unpaid order holds its slots. They apply to new orders only.',
  days: 'Pickup days',
  holdHours: 'Unpaid order holds its slots for (hours)',
  maxUnpaid: 'Unpaid orders allowed per mobile number',
  leadMin: 'Earliest pickup (days ahead)',
  leadMax: 'Latest pickup (days ahead)',
  fromHour: 'Pickup starts (hour, 0 to 23)',
  cutoffHour: 'Pickup ends (hour, 1 to 24)',
  campusFrom: 'Campus pickup from (like 14:00)',
  campusTo: 'Campus pickup until (like 15:30)',
  save: 'Save order rules'
} as const;

/** The boxes and add-ons form (B4). PLACEHOLDER, like the rest of this file. */
export const EXTRAS_COPY = {
  title: 'Boxes & add-ons',
  saved: 'Boxes and add-ons saved.',
  conflict: 'Someone else changed the boxes and add-ons just now. Showing their version.',
  refused: 'The boxes and add-ons could not be saved. Check the numbers.',
  intro:
    'Everything the September form offered besides flavours. Prices and limits apply to new orders only. Nothing is deleted: switch an item off instead.',
  sameDay: 'Same-day pickup',
  sameDayOn: 'Offer same-day pickup',
  sameDayPercent: 'Same-day extra (percent of the order)',
  sameDayExtras: 'Also add the extra to add-ons and box charges',
  sampler: 'Sampler box',
  samplerNone: 'No sampler box',
  samplerPick: 'Which item is the sampler (kind set, made under Menu & flavours)',
  samplerMax: 'Most sampler boxes in one order',
  boxes: 'Boxes',
  boxesHelp: 'Cookies that do not fill a box go in bags. A charge of 0 means the box is free.',
  boxSize: 'Holds (cookies)',
  boxCharge: 'Charge per box (₱)',
  addOns: 'Add-ons',
  addOnsHelp:
    'Choices are things like the sticker numbers, separated by commas. Give a message label to let the customer write a message.',
  addOnName: 'Name',
  addOnPrice: 'Price (₱)',
  addOnMax: 'Most per order',
  addOnChoices: 'Choices (comma separated)',
  addOnMessage: 'Message label (blank for none)',
  addOnMessageMax: 'Message length',
  on: 'On',
  addBox: 'New box size',
  addAddOn: 'New add-on',
  extraFlag: 'Extra',
  extraFlagToast:
    'That is an add-on, box or extra, not a flavour: there is nothing to flag or swap.',
  save: 'Save boxes & add-ons'
} as const;
