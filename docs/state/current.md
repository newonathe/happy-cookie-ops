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
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-30, at C1 close):**
  - `pnpm typecheck` clean; `pnpm verify` 68 files / 1303 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1695 cases per reset, 2 resets, 508 deliberate regressions detected in all; Python guards: 63 OK; migrations: 47; public functions: 77;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (C1, finish-plan slice C1):** the stock ledger. Two code commits (`f713738` database, then the app half and review fixes).
  - **Database:** migration `20260101004600`: `stock_movements` (no API grant) and owner-only `record_stock_movement` (exact keys; kinds opening,
    receipt, count, waste, adjust; idempotent on a client id: an identical retry is answered, a different body under the same id is `23505`).
    `on_hand` changes only here. A receipt with a cost also writes the cost to `ledger_entries` (category = the item's kind, negative amount) in the
    same transaction, so a retry can never book it twice. A count is the total counted and the variance comes from what the database held under a
    lock; a count taken before a later movement is refused (it would wipe that movement out); waste and adjustments never take more than is there; an
    opening needs nothing on hand and no earlier movement. `get_last_paid` returns the latest costed receipt per item. New suite `stock-ledger.sql`
    (87 cases, 16 rule regressions).
  - **App (live mode, no protected markup or engine edit):** the engine's actions are replaced from `OpsRuntime`: a count of one item (count movement), add
    and subtract (adjustments with a fixed reason), waste of raw stock (waste; cookies and dough waste stay the engine's own), a delivery (receipt with
    the cost paid and the supplier) from the receive sheet and from the expense sheet's stock purchase, the stocktake (a count per item entered, each
    taken at the moment it was entered) and "Add item" (opening quantity). The record is made first; the engine's own bookkeeping (part deliveries,
    substitutions, the grocery list) then runs and the catalogue is re-read, so the screen always shows what the database holds; no Undo is offered on
    stock toasts. `state.paid` comes from `get_last_paid`, so the cost per unit is what was really last paid. An unconfirmed answer keeps the entry:
    repeating it exactly reuses its id and time and can never count twice.
  - **Opus review** (database SAFE; the app half was BLOCKED until fixed): a receipt was recorded even when the engine refused the expense form (stock
    counted twice on the resend); a lost reply was reported as "nothing changed", inviting a second delivery and cost; a stocktake that failed partway
    threw away the unsaved counts and hid the failure; a paused stocktake could wipe out a later delivery; the engine's delayed toasts could hide a
    refusal and a refused delivery still ticked the grocery list. All fixed with tests, plus an opening only when nothing is on hand and quantities
    rounded to 3 decimals before sending.
  - **Recorded, not fixed:** (1) a mistyped receipt cost cannot be corrected (the books are append-only and undo is gone): a correcting entry belongs with E1.
    (2) Baking, dough mixing and bazaar packaging still change only the screen and are lost on a reload: they need a `use` movement, which is C2.
    (3) Raw-stock waste and live stocktakes add nothing to the engine's local waste record and count log (the records screen). (4) The waste toast shows
    the typed amount even when the server capped it at what was on hand. (5) Two quick movements can briefly show an older quantity (no out-of-order guard on
    the catalogue read). (6) Every movement bumps the item's stamp, so an open item-edit form is refused as stale (correct, costs a retry). (7) Wording
    is PLACEHOLDER (`STOCK_COPY`).
  - **Evidence:** `pnpm verify` 68 files / 1303 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1695 cases per
    reset, 2 resets, 508 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01
    WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 16 on the first version (13 caught, 3 equivalent or fixed by tests) and 8 on the review fixes,
    all caught. **Visual QA in the browser pane** (live-mode build, local owner): the item sheet's count (850 g saved, movement -50 g in the database),
    the receive sheet (2000 g for ₱840 in stock, one receipt and one cost entry of -84000, the grocery list then shorter). Not looked at: waste and the
    stocktake sheets on screen, and a phone-width pass.
