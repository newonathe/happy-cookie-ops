# Findings: observed in the ACTUAL application

Observations only, from the screenshots and measurements in this folder. Nothing here is a design proposal. Each entry names the fictional fixture and the evidence. The server was simulated, so an entry about what a server answer produces shows the app's response to that answer. It does not show that the real server sends that answer. "Cause" appears only where the source code was read.

## Observed behaviour

### 1. The owner sees a pickup date that differs from the order's date

Fixture order HC-1101 has pickup date 11 November at 10:00. The owner's order detail says "Monday 16 Nov · 9 AM – 5 PM", and the Orders list says "Mon 16" for every order. The customer's status page for the same order says "Wed, Nov 11 · 10:00 AM".

- Evidence: [owner detail](screenshots/sell/order/claimed-payment-review/d1440.webp), [owner list](screenshots/sell/orders/populated/d1440.webp), [customer status](screenshots/shop/customer-status/awaiting-payment-claimed/d1440.webp)
- Cause read in code: the label comes from the engine's computed pickup slot (`src/store/engine/ops-engine.js:69`, with "9 AM – 5 PM" written in the code), not from the order's own date and window.

### 2. Loading and failed reads look the same, and some look like real empty results

With the orders read answering a connection error, Orders says "No orders match this filter". Inventory says "Stock is loading." with no end and no retry. Pixel-identical results for "never answers" and "answers with an error" occur on Orders, Payments, Events, Inventory, Shopping, Suppliers, Money, Sales and the Recipe book.

- Evidence: [Orders](screenshots/sell/orders/loading/d1440.webp), [Inventory](screenshots/stock/inventory/loading/d1440.webp), [Home](screenshots/home/home/loading/d1440.webp), full list under "States pixel-identical" below.
- Order rules and Boxes & add-ons do not open when their read fails: the page falls back to the Shop hub with no message. [Result](screenshots/shop/order-rules/read-failure/d1440.webp)
- Money is the exception that names the problem: [Books not loaded yet](screenshots/money/money/loading/d1440.webp), though it offers no retry.

### 3. When the product read fails, Products shows built-in menu prices as if they were real

With `get_flavours` failing, Products shows the engine's built-in catalogue with its own prices (₱130 for Double Chocolate Fudge; the fixture price is ₱125), plus Edit and Hide controls.

- Evidence: [failed read](screenshots/make/products/loading/d1440.webp), [normal read](screenshots/make/products/populated/d1440.webp)

### 4. The offline message sits on top of the Charge button

When the connection drops with a sale in the cart, the message "Offline. Keep selling..." covers the sale bar at 390 and 768 px. At 768 px `elementFromPoint` at the centre of Charge returned the message, and a click there did not open payment until the message left.

- Evidence: [768](screenshots/bazaar/till/offline-toast-over-charge/t768.webp), [390](screenshots/bazaar/till/offline-toast-over-charge/p390.webp)

The same thing happens with the reference prompt: at 390 px the message "Type the last 4 digits of their GCash reference first" sits over the GCash button. In the journey, GCash pressed straight after typing the reference did nothing, and the same press worked once the message had gone 3 seconds later.

- Evidence: [flow step 10](flows/bazaar-event-to-finalize/10-wallet-needs-reference/p390.webp)

### 5. Saved, but the page still asks for the same action

When the payment confirmation is acknowledged and the refresh then fails, the message says the order is marked paid while the page still shows "Check this payment" and Confirm payment.

- Evidence: [saved, refresh failed](screenshots/sell/order/saved-refresh-failed/d1440.webp)

### 6. Actions that take effect on the first press

- Reject on a payment cancels the order with no question first: [after one press](screenshots/sell/order/rejected-at-once/d1440.webp). Reopen for review is offered afterwards.
- Record refund and cancel sent the request with the reference field empty: [result](screenshots/sell/order-refund/submitted-empty-reference/d1440.webp). The real server's answer to an empty reference was not tested.
- The Cash counted field opens already filled with the expected amount, and the leftover counts with what should be left. Pressing Close the day on the untouched form closed the day and recorded cash as Exact: [form](screenshots/bazaar/close/untouched/d1440.webp), [result](screenshots/bazaar/close/closed-without-cash-typed/d1440.webp).

### 7. The helper's Home is blank

Signed in as a helper (simulated profile row), Home draws the frame and an empty page. The only text is the notice that costs are hidden.

- Evidence: [desktop](screenshots/account/role-helper/home/d1440.webp), [phone](screenshots/account/role-helper/home/p390.webp)

### 8. On phones the Sign out pill floats over page content

The pill is fixed 84 px above the bottom on every owner page at phone width, so content scrolls under it and is hidden by it.

- Evidence: [Recipe book](screenshots/make/recipe-book/populated/p390.webp), [Recipe page](screenshots/make/recipe/default/p390.webp), [Home](screenshots/home/home/populated/p390.webp)
- Source: `src/components/app/sign-out-control.tsx:137`

### 9. Back does not always return to where the owner came from

- From Shopping, Compare prices, then Back lands on Inventory: [flow step 6](flows/stock-suppliers-shopping/06-back-to-shopping/d1440.webp).
- Reloading the recipe editor lands on the Recipe book, not the recipe: [flow step 9](flows/make-recipe/09-reload/d1440.webp).

### 10. Two Back controls on one page, and a control whose name differs from its label

- The till draws a header Back arrow and a page Back link together: [till](screenshots/bazaar/till/empty-cart/d1440.webp).
- The till's visible "Settings" button has the accessible name "Till menu" (see that state's control list in `manifest.json`).

### 11. Words and formats vary

- Dates appear as "Tuesday, 10 Nov" (Home), "Tue, Nov 10" (till), "Mon, 9 Nov" (events) and "Nov 10, 10:00 AM" (Production).
- "1 cookies" appears in the Orders list and in production results: [Orders](screenshots/sell/orders/populated/d1440.webp).
- A Money row labelled "Drops" comes from a book line whose category is Orders in the fixture: [Money](screenshots/money/money/populated/d1440.webp).
- Page chrome uses the neutral theme, while customer pages and the helper and support frames use the older warm look (see section "Old screens").

### 12. A malformed server answer stops the page

An answer in the wrong shape to `get_flavours` left Products with no heading or text, and a page error ("Cannot read properties of undefined (reading 'short')"). The settings read logged "rows is not iterable" but Account still drew.

- Evidence: [Products](screenshots/make/products/malformed-answer/d1440.webp), [Account](screenshots/account/account/populated/d1440.webp)

### 13. A session that expires mid-work did not visibly end in this harness

With the simulated server answering "no user", the page stayed on Orders after the online and visibility re-check events. On a fresh page load the same answer does redirect to sign-in. The cause was not investigated, so this is not reported as a defect, only as something still unverified.

- Evidence: [journey](flows/account-expiry/README.md), [fresh load](screenshots/account/access-gate/session-expired-redirect/d1440.webp)

## Reference views with no page of their own

`plan-review`, `event-tool-review`, `person-edit` and `restore-preview` have no page in the app, as `coverage.md` also records. `record-unavailable` exists as a component, but no path to it was found. In `manifest.json` these are marked `unavailable` and `unverified`, not captured.

## Old screens still drawn

These views are drawn by locked ported screens rather than the refined live interface: customer shop, find my order, checkout and order status (`src/components/screens/`), the classic till, All tools (`/more`), the form queue (`/formqueue`), and the helper and support frames. `coverage.md` lists the customer pages as Partial for this reason. The list is marked per view in `manifest.json` as `drawn_by_old_ported_screen`.

## Not found

No broken images, no failed requests except while deliberately offline, and no page overflow beyond the three listed below.

## Measured layout results

In the list of covered controls, controls behind an open sheet or dialog are expected and are not defects. The sticky bars and the Sign out pill are the entries worth reading.

Generated from `measurements/` by `harness/measure-summary.mjs`.

### Horizontal overflow (page wider than the viewport): 3 of 1006 captures

- [`bazaar/day-plan/change-existing@p390`](screenshots/bazaar/day-plan/change-existing/p390.webp): 2px. Widest: div "52 cookies · ₱6,670.00 at full"
- [`bazaar/day-plan/new-day@p390`](screenshots/bazaar/day-plan/new-day/p390.webp): 2px. Widest: div "8 cookies · ₱990.00 at full sa"
- [`other/all-tools/default@p320`](screenshots/other/all-tools/default/p320.webp): 1px. Widest: button "Drops Drop 32 open", button "Shop status Open · on schedule"

### Elements past the viewport edge without page overflow: 0 captures

### Controls whose centre is covered by another element at the moment of capture: 251 captures

Scrolling can uncover them. Sticky bars are the usual cause.

- "Back" covered by "div": 14 capture(s), e.g. [`bazaar/till/review-sale-sheet@p320`](screenshots/bazaar/till/review-sale-sheet/p320.webp)
- "Sign out" covered by "Offline. Keep selling — every ": 13 capture(s), e.g. [`home/home/offline-after-load@p390`](screenshots/home/home/offline-after-load/p390.webp)
- "Quick add" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@p390`](screenshots/bazaar/day-plan/start-not-today-prompt/p390.webp)
- "Notifications" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@p390`](screenshots/bazaar/day-plan/start-not-today-prompt/p390.webp)
- "Account" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@p390`](screenshots/bazaar/day-plan/start-not-today-prompt/p390.webp)
- "Home 1" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Bazaar" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Sell 2" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Make" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Stock 4" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Money" covered by "div": 11 capture(s), e.g. [`bazaar/day-plan/start-not-today-prompt@d1440`](screenshots/bazaar/day-plan/start-not-today-prompt/d1440.webp)
- "Back" covered by "How did they pay? Due ₱260 No ": 11 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Quick add" covered by "How did they pay? Due ₱260 No ": 11 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Notifications" covered by "How did they pay? Due ₱260 No ": 11 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Account" covered by "How did they pay? Due ₱260 No ": 11 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Production history" covered by "div": 10 capture(s), e.g. [`make/dough-prepare/sheet-untouched@p390`](screenshots/make/dough-prepare/sheet-untouched/p390.webp)
- "Back to events" covered by "How did they pay? Due ₱260 No ": 9 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Product" covered by "Planned and actual cookies": 8 capture(s), e.g. [`make/batch-focus/untouched@p320`](screenshots/make/batch-focus/untouched/p320.webp)
- "14 balls of dough in the fridge" covered by "div": 8 capture(s), e.g. [`make/dough-prepare/sheet-untouched@t768`](screenshots/make/dough-prepare/sheet-untouched/t768.webp)
- "Today's summary" covered by "Phone navigation": 7 capture(s), e.g. [`bazaar/till/one-product@p390`](screenshots/bazaar/till/one-product/p390.webp)
- "Home 1" covered by "How did they pay? Due ₱260 No ": 7 capture(s), e.g. [`bazaar/till/cash-handed-over@t768`](screenshots/bazaar/till/cash-handed-over/t768.webp)
- "Bazaar" covered by "How did they pay? Due ₱260 No ": 7 capture(s), e.g. [`bazaar/till/cash-handed-over@t768`](screenshots/bazaar/till/cash-handed-over/t768.webp)
- "Sell 2" covered by "How did they pay? Due ₱260 No ": 7 capture(s), e.g. [`bazaar/till/cash-handed-over@t768`](screenshots/bazaar/till/cash-handed-over/t768.webp)
- "Make" covered by "How did they pay? Due ₱260 No ": 7 capture(s), e.g. [`bazaar/till/cash-handed-over@t768`](screenshots/bazaar/till/cash-handed-over/t768.webp)
- "Close day" covered by "How did they pay? Due ₱260 No ": 7 capture(s), e.g. [`bazaar/till/cash-handed-over@d1440`](screenshots/bazaar/till/cash-handed-over/d1440.webp)

### Touch targets under 44 px at phone widths (first 15 per capture, 413 phone captures)

- Back (36×36): 290 capture(s), e.g. [`bazaar/events/offline-after-load@p390`](screenshots/bazaar/events/offline-after-load/p390.webp)
- Sign out (73.3×32): 245 capture(s), e.g. [`home/home/populated@p320`](screenshots/home/home/populated/p320.webp)
- on (13×13): 57 capture(s), e.g. [`bazaar/event-edit-list/default@p390`](screenshots/bazaar/event-edit-list/default/p390.webp)
- on (18×18): 31 capture(s), e.g. [`sell/contact-remove/prompt@p390`](screenshots/sell/contact-remove/prompt/p390.webp)
- Dismiss (31.2×44): 19 capture(s), e.g. [`account/notifications/populated@p320`](screenshots/account/notifications/populated/p320.webp)
- on (20×20): 16 capture(s), e.g. [`shop/boxes/default@p390`](screenshots/shop/boxes/default/p390.webp)
- Back (42×42): 16 capture(s), e.g. [`shop/customer-lookup/untouched@p320`](screenshots/shop/customer-lookup/untouched/p320.webp)
- To review 2 (99.2×40): 15 capture(s), e.g. [`sell/orders/populated@p320`](screenshots/sell/orders/populated/p320.webp)
- All 12 (65×40): 14 capture(s), e.g. [`sell/orders/populated@p320`](screenshots/sell/orders/populated/p320.webp)
- Closed 4 (82.5×40): 14 capture(s), e.g. [`sell/orders/populated@p320`](screenshots/sell/orders/populated/p320.webp)
- Paid 5 (67.5×40): 13 capture(s), e.g. [`sell/orders/populated@p320`](screenshots/sell/orders/populated/p320.webp)
- Ready for customer pickup 1 (202.5×40): 13 capture(s), e.g. [`sell/orders/populated@p320`](screenshots/sell/orders/populated/p320.webp)
- Last 7 days (98.1×40): 12 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- Last 30 days (107.7×40): 12 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- This month (95.3×40): 12 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- Notifications (42×42): 12 capture(s), e.g. [`account/role-helper/home@p390`](screenshots/account/role-helper/home/p390.webp)
- Back to the cookies (42×42): 11 capture(s), e.g. [`shop/customer-status/awaiting-payment-claimed@p390`](screenshots/shop/customer-status/awaiting-payment-claimed/p390.webp)
- All (44.7×40): 11 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- Income (73.2×40): 11 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- Expenses (86.9×40): 11 capture(s), e.g. [`money/money/populated@p320`](screenshots/money/money/populated/p320.webp)
- Menu (63×40): 10 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- All products (101.6×40): 10 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- Needs recipe (108.3×40): 10 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- Show amounts (328×40): 10 capture(s), e.g. [`money/money/populated@p390`](screenshots/money/money/populated/p390.webp)
- Close (38×38): 8 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- Tick — (24×24): 8 capture(s), e.g. [`sell/payments/populated@p320`](screenshots/sell/payments/populated/p320.webp)
- input (362×19.5): 7 capture(s), e.g. [`shop/payment-method-edit/add-new@p390`](screenshots/shop/payment-method-edit/add-new/p390.webp)
- Already ordered? Find my order (166.2×38): 7 capture(s), e.g. [`shop/customer-shop/populated@p320`](screenshots/shop/customer-shop/populated/p320.webp)
- Join the waiting list (101.5×38): 7 capture(s), e.g. [`shop/customer-shop/populated@p320`](screenshots/shop/customer-shop/populated/p320.webp)
- Account help (79.1×32): 7 capture(s), e.g. [`account/sign-in/untouched@p320`](screenshots/account/sign-in/untouched/p320.webp)

### Text under WCAG AA contrast, measured against the nearest opaque background

- "›" rgb(133, 138, 148) at 14px: 3.47:1: 807 capture(s), e.g. [`home/home/populated@p320`](screenshots/home/home/populated/p320.webp)
- "Contains milk, eggs, wheat" rgb(169, 138, 95) at 10px: 3.24:1: 105 capture(s), e.g. [`shop/customer-shop/populated@p320`](screenshots/shop/customer-shop/populated/p320.webp)
- "THIS MONTH ONLY" rgb(169, 138, 95) at 10px: 3.24:1: 45 capture(s), e.g. [`shop/customer-shop/populated@p320`](screenshots/shop/customer-shop/populated/p320.webp)
- "BEST SELLER" rgb(169, 138, 95) at 10px: 3.24:1: 30 capture(s), e.g. [`shop/customer-shop/populated@p320`](screenshots/shop/customer-shop/populated/p320.webp)
- "Fictional allergen note: conta" rgb(138, 112, 98) at 11px: 4.25:1: 24 capture(s), e.g. [`shop/customer-status/awaiting-payment-claimed@p390`](screenshots/shop/customer-status/awaiting-payment-claimed/p390.webp)
- "GCash" rgb(155, 133, 121) at 16px: 3.33:1: 15 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "Maya" rgb(155, 133, 121) at 16px: 3.33:1: 15 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "GoTyme" rgb(155, 133, 121) at 16px: 3.33:1: 15 capture(s), e.g. [`bazaar/till/cash-handed-over@p390`](screenshots/bazaar/till/cash-handed-over/p390.webp)
- "›" rgb(133, 138, 148) at 14px: 3.29:1: 7 capture(s), e.g. [`home/home/hover-row@d1440`](screenshots/home/home/hover-row/d1440.webp)
- "—" rgb(133, 138, 148) at 12.5px: 3.47:1: 6 capture(s), e.g. [`bazaar/till/sale-acknowledged@d1440`](screenshots/bazaar/till/sale-acknowledged/d1440.webp)
- "Fictional invoice note. Fictio" rgb(138, 112, 98) at 10px: 4.25:1: 2 capture(s), e.g. [`shop/customer-shop/empty-menu@p390`](screenshots/shop/customer-shop/empty-menu/p390.webp)
- "Privacy: The Happy Cookie uses" rgb(138, 112, 98) at 10px: 4.25:1: 2 capture(s), e.g. [`shop/customer-shop/empty-menu@p390`](screenshots/shop/customer-shop/empty-menu/p390.webp)
- "—" rgb(133, 138, 148) at 12.5px: 3.29:1: 1 capture(s), e.g. [`bazaar/receipt/default@d1440`](screenshots/bazaar/receipt/default/d1440.webp)
- "⌄" rgb(133, 138, 148) at 14px: 3.29:1: 1 capture(s), e.g. [`bazaar/receipt/default@d1440`](screenshots/bazaar/receipt/default/d1440.webp)

### Clipped or truncated text

- "(below the 65% floor)": 65 capture(s), e.g. [`make/recipe-book/populated@p320`](screenshots/make/recipe-book/populated/p320.webp)
- "0": 30 capture(s), e.g. [`bazaar/close/untouched@p390`](screenshots/bazaar/close/untouched/p390.webp)
- "Brown sugar": 25 capture(s), e.g. [`make/recipe/default@p320`](screenshots/make/recipe/default/p320.webp)
- "for Happy Camper": 22 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "52": 21 capture(s), e.g. [`bazaar/event/day-selling-elsewhere@p320`](screenshots/bazaar/event/day-selling-elsewhere/p320.webp)
- "for Double Chocolate Fudge": 21 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for White Chocolate Biscoff": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "White Chocolate Biscoff": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for PB & Miso": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "PB & Miso": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for Red Velvet Cheesecake": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "Red Velvet Cheesecake": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for Nutella Churro": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "Nutella Churro": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for Ube Coconut Crinkle": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "Ube Coconut Crinkle": 20 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "Harbor Street Fair": 19 capture(s), e.g. [`bazaar/events/populated@p320`](screenshots/bazaar/events/populated/p320.webp)
- "Happy Camper": 19 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "Double Chocolate Fudge": 18 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)
- "for Sampler box": 18 capture(s), e.g. [`make/products/populated@p320`](screenshots/make/products/populated/p320.webp)

### Broken images: 0 captures

### Page errors, console errors and failed requests

- Page error: Cannot read properties of undefined (reading 'short'): 2, e.g. `make/products/malformed-answer@p390`
- Console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED: 2, e.g. `make/production/offline-after-load@p390`
- Failed request: http://127.0.0.1:4197/assets/nutella-churro.png: 2, e.g. `make/production/offline-after-load@p390`
- Page error: rows is not iterable: 2, e.g. `account/account/malformed-answer@p390`

### States pixel-identical to another state of the same view

The image is stored once. Either the state does not change what is drawn, or the app cannot express the difference.

- `home/home/loading@p390` = read-failure
- `home/home/loading@d1440` = read-failure
- `home/home/hover-row@d1440` = pressed-row
- `home/home/populated@p390` = reduced-motion
- `home/home/populated@d1440` = reduced-motion, reduced-transparency
- `bazaar/events/loading@p390` = read-failure, malformed-answer
- `bazaar/events/loading@d1440` = read-failure, malformed-answer
- `bazaar/events/populated@p390` = upcoming-open
- `bazaar/till/sale-refused-waiting@p390` = sale-server-error-waiting
- `bazaar/till/sale-refused-waiting@d1440` = sale-server-error-waiting
- `bazaar/till/empty-cart@p390` = reduced-motion
- `bazaar/till/empty-cart@d1440` = reduced-motion, reduced-transparency
- `bazaar/close/closed-without-cash-typed@p390` = closed-short
- `sell/orders/loading@p390` = read-failure, malformed-answer
- `sell/orders/loading@d1440` = read-failure, malformed-answer
- `sell/orders/populated@p390` = mark-packed-pending, reduced-motion, no-order-selected, order-id-unknown, idle-time-spent
- `sell/orders/populated@d1440` = no-order-selected, order-id-unknown, idle-time-spent
- `sell/payments/loading@p390` = read-failure, malformed-answer
- `sell/payments/loading@d1440` = read-failure, malformed-answer
- `shop/shop/populated@p390` = loading, read-failure, malformed-answer
- `shop/shop/populated@d1440` = loading, read-failure, malformed-answer
- `shop/order-rules/read-failure@p390` = read-failure
- `shop/customer-shop/empty-menu@p390` = read-failure
- `shop/customer-shop/empty-menu@d1440` = read-failure
- `shop/customer-status/unknown-link@p390` = no-link
- `shop/customer-status/unknown-link@d1440` = no-link
- `make/products/populated@p390` = long-text
- `make/products/loading@p390` = read-failure
- `make/products/loading@d1440` = read-failure
- `make/recipe-book/loading@p390` = read-failure, malformed-answer
- `make/recipe-book/loading@d1440` = read-failure, malformed-answer
- `make/production/read-failure@p390` = malformed-answer
- `make/production/read-failure@d1440` = malformed-answer
- `make/production/populated@p390` = reduced-motion, direct-no-batch
- `make/production/populated@d1440` = direct-no-batch
- `stock/inventory/loading@p390` = read-failure, malformed-answer
- `stock/inventory/loading@d1440` = read-failure, malformed-answer
- `stock/shopping/populated@p390` = long-text
- `stock/shopping/loading@p390` = read-failure, malformed-answer
- `stock/shopping/loading@d1440` = read-failure, malformed-answer
- `stock/suppliers/loading@p390` = read-failure, malformed-answer
- `stock/suppliers/loading@d1440` = read-failure, malformed-answer
- `money/money/populated@p390` = long-text, last-30-days
- `money/money/populated@d1440` = long-text, last-30-days
- `money/money/loading@p390` = read-failure, malformed-answer
- `money/money/loading@d1440` = read-failure, malformed-answer
- `make/recipe/default@p390` = cost-of-flavour
- `money/sales-log/loading@p390` = read-failure, malformed-answer
- `money/sales-log/loading@d1440` = read-failure, malformed-answer
- `account/account/populated@p390` = loading, read-failure, malformed-answer
- `account/account/populated@d1440` = loading, read-failure, malformed-answer
- `account/people/who-can-see-what@p390` = support-access
- `account/people/who-can-see-what@d1440` = support-access
- `account/health/read-failure@p390` = malformed-answer
- `account/health/read-failure@d1440` = malformed-answer
- `account/sign-in/untouched@p390` = session-expired-redirect, inactive-profile
- `account/sign-in/untouched@d1440` = session-expired-redirect, inactive-profile
- `make/products/malformed-answer@p390` = identity-check-pending
- `make/products/malformed-answer@d1440` = identity-check-pending
- `account/access-gate/no-signal-first-open@p390` = profile-read-failed
- `account/access-gate/no-signal-first-open@d1440` = profile-read-failed
- `account/access-gate/bazaar-only-offline-open@d1440` = other-screen-refused-offline

### Captures with no visible h1: 32 states

`bazaar/classic-till/default`, `shop/customer-checkout/direct-address`, `shop/customer-checkout/from-shop`, `shop/customer-status/awaiting-payment-claimed`, `shop/customer-status/awaiting-payment-unpaid`, `shop/customer-status/confirmed`, `shop/customer-status/preparing`, `shop/customer-status/ready`, `shop/customer-status/completed`, `shop/customer-status/cancelled`, `shop/customer-status/no-show`, `shop/customer-status/unknown-link`, `shop/customer-status/read-failure`, `make/products/malformed-answer`, `money/sales-log/populated`, `money/sales-log/empty`, `money/sales-log/loading`, `money/sales-log/offline-after-load`, `money/sales-log/focus-keyboard`, `account/access-gate/no-signal-first-open`, `account/role-helper/home`, `account/role-helper/orders-denied`, `account/role-helper/money-denied`, `account/role-helper/sales-log`, `account/role-helper/inventory`, `account/role-helper/settings-denied`, `account/role-support/home`, `account/role-support/orders`, `account/role-support/money`, `account/role-support/settings`, `other/all-tools/default`, `other/form-queue/default`
