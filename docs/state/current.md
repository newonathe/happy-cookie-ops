# Current state — Happy Cookie Ops

Short status, read at the start of every session. Keep it to one screen.

- Every earlier checkpoint, verbatim: [current-history.md](current-history.md).
- Forward plan: [finish-plan.md](finish-plan.md).
- The one executable goal: [next-goal.md](next-goal.md).

## Where things stand (2026-09-29)

- **G0 is done.**
- **G1 is done locally, and the hosted preview is live** (https://happy-cookie-preview.admin-kethai.workers.dev,
  synthetic data). Still open:
  - the signed-in probes, which need a test account Ethan creates;
  - the local stack on Postgres 17, plus a reviewed revoke of `MAINTAIN` from the API roles.
- **G2 is in progress:**
  - MP-08 is closed (idle sign-out).
  - MP-09 a: the live data boundary.
  - MP-09 b: settings b1–b4.
  - MP-09 c1: flavours on the database.
  - MP-09 c1b: prices save, `publish_flavours`, and the live shop shows only the published menu.
  - MP-09 c1c (F3, slice A1): the owner's flavour editor and "Publish menu" button, live mode only.
- **B4 is done locally (2026-09-30):** every September form feature on the server-priced order. B4a (2026-09-29): the
  database (boxes, add-ons, the sampler cap, the same-day surcharge) and the owner's "Boxes & add-ons" form. B4b (2026-09-30): the
  live checkout (boxes, add-ons with a design or a note message, the sampler, a same-day pickup), the owner's order screens and
  messages, and a fix for customers being sent to sign-in on returning to the tab.
- **A2 is done locally (2026-09-29):** payment methods, QR and photo upload, and the shop footer texts, on the database and on screen (live mode).
- **B3 is done locally (2026-09-29):** the owner's side of an order on the database and on screen (live mode): the paid
  tick, statuses, flavour swap, pack and collect, refund and balance, customer messages; the shop's open state and
  "close now" from and enforced by the server; the owner form for the order rules; the `/lookup` URL shows the live form.
- **B2 is done locally (2026-09-29):** the live checkout on the database and on screen (customer pages, live mode): the
  order form, the order number and status link, the status page, Find my order and the waiting list. Its two cutover
  blockers (the shop's open state from the server; the `/lookup` URL) were closed by B3.
- **B1 is done locally (2026-09-29):** the order command on the database (`place_order`, `order_status`,
  `join_waitlist`, the owner's order rules).
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders and the bake list (the owner now reads and drives real orders, live), payments (methods, A2), dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-30, at B4b close):**
  - `pnpm typecheck` clean; `pnpm verify` 60 files / 1110 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1318 cases per reset, 2 resets, 167 deliberate regressions per reset each detected; Python guards: 63 OK; migrations: 41;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (B4b, finish-plan slice B4 second half):** the checkout and the owner's screens, two commits plus review fixes.
  - **Customer checkout** (live mode, `live-checkout.tsx`, no protected markup edited): a Boxes card (shown once the cookies reach
    the smallest box the owner offers; the picked boxes stay removable), an Add-ons card (a row per design, a message box only on an
    add-on that has one, limits counted across all rows of one add-on), the same-day date (today, labelled "same-day +N%", only when
    the owner switched it on and today is a pickup day; only time slots later than now, and a message when none are left), and the
    sampler (the ported flavour stepper; its cap is checked before sending). The client sends only ids, quantities, a design and a
    trimmed message; the server prices everything. The placed card shows the server total and "With: ..." lines. A new refusal
    `ZC007` (a size or add-on switched off after the page loaded) reloads the choices. The ported "no extra charge" line is replaced
    in live mode; a PLACEHOLDER line says extras are added to the total.
  - **Owner's ported screens, no markup edit:** `toEngineOrder` puts the part of the total the flavours do not explain into a reserved
    `priced.__extras` key; `OpsRuntime` replaces `boxTotal` (live only, in the constructor) with flavours at their sold prices plus that
    key, so every ported screen shows the server total by construction (the base also applied the demo price mode, packaging fee and
    flat box price, which the server never uses; this also corrects the customer cart total). The order detail gets rows for each
    add-on, box and the same-day extra ("Extra" label, no swap), the messages sheet a "To pack" line with the card message, and the
    payment reminder states the total and what it includes (never the card message: that text is forwarded).
  - **Bug found by visual QA and fixed (`6d7e759`):** the live gate re-checked the staff profile whenever a tab became visible,
    including on customer pages, where it finds no session and sent the anonymous customer to `/sign-in`, losing their checkout (for
    example on returning from paying in a bank app). It predates B4b. Customer screens are now left alone; a verified owner is still
    re-checked. Reproduced in Chromium and covered by tests.
  - **Evidence:** `pnpm verify` 60 files / 1110 tests; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); Python
    guards 63 OK; SQL role suite 1318 cases per reset, 2 resets (SQL unchanged in B4b); `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps (a sticker, a note card
    and a same-day pickup priced by the server and stored; the script takes the next pickup day when no slot is left today, so it
    passes at any hour). 38 mutations on the new branches, each caught. **Visual QA in the browser pane** (live-mode build, local
    owner): the checkout (boxes, add-ons, same-day notice and slots), the placed card, the owner's orders list, order detail (rows add
    up to the server total), the messages sheet and the status page. **Opus review:** the client cannot influence any price; the
    `__extras` key does not leak; no protected markup touched. Fixed: a date that became today while the form was open (midnight)
    is confirmed before the same-day extra is added; a box stuck with no control; boxes refusal wording; a design containing `|`;
    the card message left out of the forwarded text; rows adding up on same-day orders; the owner re-check; the ported price note.
  - **Recorded, not fixed:** (1) the server derives same-day from the date at the moment it runs, so an unsettled retry that
    crosses midnight can still add the extra; a server-side `same_day` flag in the body (refused when it disagrees with the date) would
    close it, and needs a migration. (2) Boxes are offered for any non-sampler item; the server boxes only `cookie` items, so a cart
    with another set can be refused (the refusal is worded about the boxes); the shop view carries no item type. (3) The customer's
    status page does not list add-ons, boxes or the surcharge. (4) The ported "Your order" card total is the flavours only until the
    order is placed (the note under it says so). (5) The bake list shows a sampler as one line, not its flavours. (6) A staff swap
    does not recalculate the surcharge (B4a). (7) Wording is PLACEHOLDER: `ORDER_COPY.extras` (`src/lib/orders/copy.ts`),
    `EXTRAS_COPY` and `MESSAGE_SHEET` (`src/lib/orders/staff-copy.ts`), and the customer texts in `messages.ts`.
  - **Still open from earlier slices:** unchanged (see [current-history.md](current-history.md)). A direct load of a staff URL (for
    example `/orders`) lands on Home after the gate verifies, in live mode; navigate from Home instead (not investigated).
