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
- **E1 is done locally (2026-10-01):** the P&L, Home profit and expense list show the database's books, with a cost-basis setting, a correction for a wrong delivery cost, draws and a CSV export.
- **C2 is done locally (2026-09-30):** mixing dough, baking a batch and packing an order (and a stall sale) take stock off on the database; batches and dough are
  records that survive a reload and feed the Bake, dough, inventory and recipes screens ("baked on this version").
- **C1 is done locally (2026-09-30):** the quantity of every stock item is a ledger on the database (receipts with their cost, counts, waste,
  adjustments, opening); inventory, receive, stocktake and waste on the ported screens record movements.
- **A4 is done locally (2026-09-30):** Cine's recipes (yield, lines, versions) on the database and on the recipes and cost screens; a save makes a new
  version and keeps the old one.
- **A3 is done locally (2026-09-30):** Cine's stock items, suppliers and supplier prices on the database and on the inventory, grocery and
  suppliers screens, with two owner forms (quantities stay 0 until the stock ledger, C1).
- **D4 is done locally (2026-09-30):** Cine's real bazaar bookings (name, dates, place, rent) in an owner form; the Bazaar screen lists
  them in live mode; starting one opens the event and the database books its stall rent once.
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
  waitlist still live only in the browser (bazaar sales, stock, expenses, close-out, batches, dough and packing now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-10-01, at E1 close):**
  - `pnpm typecheck` clean; `pnpm verify` 72 files / 1432 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1908 cases per reset, 2 resets, 670 deliberate regressions detected in all; Python guards: 63 OK; migrations: 50; public functions: 92;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-10-01 (E1, finish-plan slice E1, done in one goal after all):** the owner's books. Decisions (Ethan, 2026-09-30): the cost rule is **both, with a setting** (default: when bought);
  revenue is dated **when the order was paid**; draws and the drop close-out stay in live mode.
  - **Database:** migration `20260101004900`. `orders.paid_at` / `refunded_at` (stamped by a trigger, so the paid tick, settle and refund RPCs are unchanged; backfilled from `updated_at`
    without bumping it). Owner-only `get_books(from, to)` (revenue: each order at `paid_at`, stall sales; refunds; expenses; draws; the cost basis; the deliveries of the last 90 days that
    can be corrected), `record_expense` (her categories including wages; exact keys; idempotent on a client id; the category "Owner draw" is refused), `record_draw` (kept apart: never an
    expense, profit does not move), `record_cost_correction` (a wrong delivery cost is answered by a correcting entry, nothing is edited; `get_last_paid` and the cost of stock used read the
    corrected cost; the latest correction is the one saved last), `set_cost_basis`. Cost **when used** = stock used or wasted x the price per unit of the latest costed receipt up to that moment
    (0 before any: a later delivery never reprices a reported period); the receipts' own cost lines are then not costs. New tables have no API grant. Suite `books.sql` (101 cases).
  - **App (live mode, no protected-markup or engine edit):** the P&L, Home profit and the expense list read the database's books (`state.ledger` is REPLACED on every read, never added to; the
    engine's own count of the open drop's orders returns 0 so paid orders are not counted twice; closing a drop says its orders are already in the P&L). A plain expense (no stock item named)
    and a draw are recorded first, once (a lost reply keeps the id), then the books are read back. A delivery form with a quantity missing, or an item the catalogue does not have, is left to the
    engine to refuse and books nothing. "Books & costs" under All tools (the live form host): the cost basis, correct a delivery cost, download the CSV. The export (the ported system-health
    control) now writes the database's books for the last 13 months as a CSV. Books are read again after an order moves on, a receipt or expense, a stall sale that reached the server.
  - **Opus review** (database SAFE; the app half was NOT SAFE until fixed): an expense form naming a stock item with no quantity was booked on the database while the engine told her no (the cost
    counted twice when she entered it again); the latest correction was chosen by the phone's clock, not the save order; the drop-close toast claimed revenue was booked at 0; cost when used
    fell back to a LATER delivery's price. All fixed with tests (a SQL case and a mutation for each database fix).
  - **Recorded, not fixed:** (1) money given back through a settle after a cheaper swap lowers `paid_cents`, so the first-paid date's revenue shrinks and no refund line appears; a dearer balance
    lands on the first-paid date (revenue date = when first paid). (2) Under "used", stock counts (shrinkage) and adjustments never become costs, and the part of a use that stock could not cover
    is costed at 0. (3) The retry ids live in memory: a reload loses them, so re-entering an expense whose reply was lost can record it twice; two identical entries while one is unconfirmed merge.
    (4) A stall sale or event expense that exists only on the phone (not synced) is not in the books until it syncs. (5) Renaming an expense category changes only the local ledger. (6) Voids and
    drawer variance are read through `get_books` but not covered by a case. (7) Wording is PLACEHOLDER (`BOOKS_COPY`). (8) The 30-day P&L window is the engine's rolling 30 days over the fetched 35.
  - **Evidence:** `pnpm verify` 72 files / 1432 tests; SQL role suite 1908 cases per reset, 2 resets, 670 regressions detected (books.sql 101 cases, 37 per reset); mutations: 20 on the
    books' unit tests (the ones that survived a first run were strengthened); the closing gates are listed below.
  - **Gates, all exit 0 in this session:** `pnpm verify` 72 files / 1432 tests; Python guards OK; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps; SQL role suite 1908 cases per reset, 2 resets, 670 regressions (the suite's same-day
    order case fails between 23:00 and midnight Manila time: a time-of-day dependence that is not E1's).
  - **Visual QA in the browser pane** (live-mode build, local test owner; a paid order, a refunded order, a stall sale, a costed delivery and 300 g of it used in the database): Home showed
    Profit ₱1,180 (revenue ₱1,600, expenses ₱420); the P&L showed Revenue ₱1,600 (Drops ₱1,300, Bazaar ₱300), Refunded ₱500, Ingredients ₱420; "Record expense" of ₱500 under Helper wages
    (one row in the database) made it Profit ₱680 and survived a reload; the drill-down listed "Week 1 wages ₱500" and "Bread flour · Landers ₱420" (total ₱920); "Books & costs" corrected the
    delivery to ₱400 (a +₱20 adjusting entry, nothing edited); "When used" made the P&L Profit ₱980 (Ingredients ₱120 = 300 g at the corrected ₱0.40/g); the CSV (read in the page) had one row per
    line with the basis. Not looked at on screen: a phone-width pass, the Home card under "used", an offline state.
