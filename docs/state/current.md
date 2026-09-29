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
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-30, at A3 close):**
  - `pnpm typecheck` clean; `pnpm verify` 64 files / 1222 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1525 cases per reset, 2 resets, 436 deliberate regressions detected in all; Python guards: 63 OK; migrations: 44; public functions: 73;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (A3, finish-plan slice A3):** the owner's stock items, suppliers and supplier prices. Two commits (`3cd8770` database, `7582680` app).
  - **Database:** the tables already existed (`suppliers`, `inventory_items`, `supplier_prices`); migration `20260101004300` adds `active` and
    stamps and four owner-only RPCs: `get_stock_catalogue`, `save_supplier`, `save_stock_item`, `save_supplier_price` (exact keys, bounds,
    case-insensitive unique names, stale stamp `P0002`, replay-safe creates; a changed price pushes the old one onto a three-deep "was" history; an
    item with prices or recipes cannot be renamed; quantity on hand is never written, that is C1). The legacy direct INSERT/UPDATE/DELETE grants on
    the three tables are revoked (as B3 did for orders): every write is validated. `trigger-authority.sql` now proves the inventory timestamp
    trigger as `service_role`; the private-read regression now expects the read failure. New suite `stock-catalogue.sql` (138 cases, 29 rule
    regressions, one table regression).
  - **App (live mode, no protected markup or engine edit):** the owner's items become the inventory rows (state); suppliers, pack sizes and best
    buys reach the ported suppliers, grocery and cost screens by refilling the engine's exported `SUPPLIERS`, `PACK_SIZE` and `BEST_BUY` in place
    (`src/lib/data/engine-catalogue.ts`; `OPTIONS_FOR` reads `SUPPLIERS` when called). Demo mode gets the prototype's own values back; live mode
    starts with none, and an empty supplier list shows one "No suppliers yet" tab because the engine's `adminVals` reads `SUPPLIERS[0]`. Two forms
    under All tools: "Stock items" (list, edit, add) and "Suppliers & prices" (list; a supplier's details and a row per price plus a blank one; the
    supplier is saved first, then each changed price with its own stamp; stops at the first failure). The ported "Add item" and "Remove" go to the
    database (an item is switched off, never deleted); a stock count says it is not kept (C1).
  - **Opus review:** SAFE TO MERGE, nothing critical. Fixed: a price create whose reply was lost could be overwritten by the next save (fresh id),
    quantities changed on the screen were wiped by the reload after a save (kept), a rename and a price create now share one lock order, refusal
    copy. **Recorded, not fixed:** (1) two suppliers selling one item in different pack sizes give a wrong best buy, cost and grocery estimate,
    because a price carries no pack size of its own (the form says so; fix: a `pack_size` on the price, before real data is entered). (2) The
    quantity on hand is 0 for every item until the stock ledger (C1) exists; receiving, waste, bake use and counts still change only the screen
    (a reload after they were entered keeps them, a full page reload loses them). (3) Names stay taken after an item is switched off. (4) A
    demotion without a reload leaves the catalogue in memory (theoretical). (5) The one-time import script is not written: Cine's workbook layout
    is not in the repo, so it belongs with the cutover (finish-plan section 9). (6) A 70-item list is one long scroll: a search box is the next
    step. (7) Only one table grant regression is restored in the SQL harness (RLS blocks the others with the same SQLSTATE).
  - **Evidence:** `pnpm verify` 64 files / 1222 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1525
    cases per reset, 2 resets, 436 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e`
    89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 27 on the first version (26 caught, 1 fixed by a new test) and 3
    on the review fixes, all caught. **Visual QA in the browser pane** (live-mode build, local owner, the seeded demo catalogue as data): the
    inventory, grocery and the ported suppliers screens read the database (a price edit shows "Before: ₱420, ₱438, ₱445"), the Stock items list
    and edit form (low-stock level 300 to 350 saved), the Suppliers & prices list and edit form (butter ₱420 to ₱430 saved, history kept).
    Not looked at: a phone-width pass of the two forms, and the ported "Add stock" sheet end to end.
