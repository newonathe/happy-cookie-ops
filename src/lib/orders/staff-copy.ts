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

/** The upcoming bazaars form and the Bazaar screen's list (D4). PLACEHOLDER, like the rest of this file. */
/** PLACEHOLDER wording (A4): saving a recipe in live mode. */
export const RECIPE_COPY = {
  saved: (version: number) =>
    'Saved as Version ' + version + '. The version before it is kept for anything already baked on it.',
  created: 'Saved as Version 1.',
  unchanged: 'Nothing changed, so there is no new version.',
  conflict: 'Someone else changed this recipe just now. Showing their version.',
  refused:
    'That recipe could not be saved. Check each ingredient has a name and an amount above 0, is measured in g, ml or pcs, is not listed twice, and that an ingredient you stock is measured in its stock unit.'
} as const;

/** PLACEHOLDER wording (A3): the owner's stock catalogue forms. */
export const STOCK_COPY = {
  itemsTitle: 'Stock items',
  itemsSub: 'Ingredients and packaging: unit, low-stock level, pack size, supplier',
  suppliersTitle: 'Suppliers & prices',
  suppliersSub: 'Who you buy from and what each one charges',
  itemsIntro:
    'Your ingredients and packaging. Nothing is deleted: switch an item off instead. How much you have is counted on the Inventory screen once the stock ledger is built.',
  suppliersIntro:
    'Your suppliers and their prices. Nothing is deleted: switch a supplier or a price off instead. The cheapest active price is the best buy.',
  addItem: 'Add an item',
  addSupplier: 'Add a supplier',
  noItems: 'No items yet.',
  noSuppliers: 'No suppliers yet.',
  saved: 'Saved.',
  conflict: 'Someone else changed this just now. Showing their version.',
  refusedItem:
    'That item could not be saved. Check the name is not already used (a switched-off item keeps its name), that an item with prices or recipes is not being renamed, and the unit, level, pack size and use-by days.',
  refusedSupplier:
    'That supplier could not be saved. Check the name is not already used, and each price has an item, a pack label and a price.',
  priceHint:
    'Enter the price for one pack of the size set on the item under Stock items. Two suppliers selling one item in different pack sizes are not supported yet.',
  movementNotSaved:
    'Not confirmed: the connection dropped, so that stock change may or may not have gone through. Check the quantity, then repeat it exactly: the database will not count the same entry twice.',
  ownerOnly: 'Only Cine can change stock.',
  someSaved: (saved: number, total: number) =>
    saved + ' of ' + total + ' counts saved. The rest are still on the count sheet.',
  itemAddedNoOpening:
    'The item was added, but its opening quantity was not recorded. Count it from the inventory screen.',
  movementRefused:
    'That stock change was refused: check the amount, that the item is still in use, and that nothing came in or went out after a count was taken (count again). Stock on screen shows what the database holds.',
  received: (name: string, qty: string, spend: string) =>
    qty + ' of ' + name + ' in stock.' + (spend ? ' ' + spend + ' logged under your costs.' : ''),
  counted: (n: number) =>
    n === 0 ? 'Count matched your records. Nothing to correct.' : (n === 1 ? '1 item' : n + ' items') + ' corrected.',
  adjustReason: 'Adjusted on the Inventory screen',
  openingNote: 'added with its opening quantity.',
  removedNote: 'switched off. Past records keep their history.'
} as const;

/** PLACEHOLDER wording (C2): mixing dough, baking and packing take stock off on the database. */
export const PRODUCTION_COPY = {
  ownerOnly: 'Only Cine can record baking, dough and packing.',
  notSaved:
    'Not confirmed: the connection dropped, so this may or may not have been recorded. Check the stock, then repeat it exactly: the database will not count the same entry twice.',
  refused: 'That could not be recorded. Check the numbers, and that this flavour has a saved recipe.',
  stale:
    'The recipe changed since this screen was opened. The recipes were read again: check the amounts and confirm once more.',
  packNotSaved: 'The packaging could not be recorded, so the order was not marked packed. Try again.',
  discardWhole: 'Enter a whole number of dough balls or cookies.',
  recorded: 'Recorded. The screen you were on had already moved on, so check the stock and the batch list.',
  ranShort: (names: string) => ' Ran short of ' + names + ': logged.'
} as const;

/** PLACEHOLDER wording (E1): the books settings form and what saving changes. */
export const BOOKS_COPY = {
  title: 'Books & costs',
  sub: 'How stock is costed, correct a delivery cost, download the books',
  offline: 'Offline. Changes here will not save until this device is back online.',
  basisTitle: 'When does stock count as a cost?',
  basisNote:
    'Bought: each delivery is a cost the day you buy it. Used: stock is a cost when it goes into a batch, a mix, a pack or a sale, at the price you last paid.',
  bought: 'When bought',
  used: 'When used',
  basisSaved: (b: string) => 'Stock now counts as a cost ' + (b === 'used' ? 'when it is used.' : 'when it is bought.'),
  unpaidTitle: 'Waiting on payment',
  unpaidNone: 'Nobody owes you anything right now.',
  unpaidSummary: (n: number, total: string) => (n === 1 ? '1 order' : n + ' orders') + ' · ' + total + ' still to come in',
  unpaidClaimed: 'says they paid: check it',
  unpaidBalance: 'balance owed',
  unpaidWaiting: 'no payment yet',
  unpaidDays: (d: number) => (d === 0 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago'),
  correctTitle: 'Correct a delivery cost',
  correctNote:
    'A wrong cost is answered with a correcting entry in the books: nothing is edited or deleted. The price you last paid follows the correction.',
  receipt: 'Delivery',
  newCost: 'What it really cost (pesos)',
  correct: 'Correct the cost',
  noReceipts: 'No costed deliveries in the last 90 days.',
  corrected: 'Cost corrected. The books show the difference.',
  downloadTitle: 'Download the books',
  downloadNote: 'Every line of the books for the last 13 months as a spreadsheet (CSV), with how stock is costed.',
  download: 'Download CSV',
  downloaded: 'Downloaded: the books as a spreadsheet. Nothing is locked in here.',
  downloadBlocked: 'This device would not let the file download. Try again from a normal browser tab.',
  notSaved:
    'Not confirmed: the connection dropped, so this may or may not have been recorded. Check the books, then repeat it exactly: the database will not count the same entry twice.',
  refused: 'That could not be recorded. Check the amount, the category and that the delivery was costed.',
  dropClosed: (n: string, next: string) =>
    'Drop ' + n + ' closed. Its paid orders are already in your P&L. Drop ' + next + ' is open for orders.',
  ownerOnly: 'Only Cine can change the books.'
} as const;

export const SCHEDULED_COPY = {
  title: 'Bazaar events',
  saved: 'Bazaar events saved.',
  conflict: 'Someone else changed the bazaar events just now. Showing their version.',
  refused: 'The bazaar events could not be saved. Check the names, dates and rent.',
  intro:
    'Your upcoming bazaars. They appear on the Bazaar screen until they have ended or been started. Nothing is deleted: switch a booking off instead.',
  addTitle: 'New bazaar',
  name: 'Name',
  starts: 'First day',
  ends: 'Last day',
  place: 'Place',
  rent: 'Stall rent (₱)',
  on: 'Show on the Bazaar screen',
  onStarted: 'Show on the Bazaar screen (already started)',
  save: 'Save bazaar events',
  rentLabel: 'Stall rent',
  rentBooked: (amount: string) => amount + ' stall rent booked as an event expense.',
  linkPending:
    'The event started, but this phone could not tell the server which booking it was. Do not add the stall rent by hand: it is booked automatically the next time this phone is online.',
  unbookedTitle: 'Start without a booking',
  unbookedPlace: 'A one-off event'
} as const;
