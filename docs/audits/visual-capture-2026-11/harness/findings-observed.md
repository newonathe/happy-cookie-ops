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
