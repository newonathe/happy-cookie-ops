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
- **Baseline (2026-09-30, after the C2 follow-up):**
  - `pnpm typecheck` clean; `pnpm verify` 70 files / 1375 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1807 cases per reset, 2 resets, 596 deliberate regressions detected in all; Python guards: 63 OK; migrations: 49; public functions: 84;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (C2 follow-up, before E1):** binned dough and binned baked cookies are now recorded on the database. Migration `20260101004800`: owner-only `record_discard`
  (exact keys; dough or baked; a whole number up to what is there, a reason of 1 to 80 characters; idempotent on a client id) and `record_production` and `get_production`
  redefined so the chilled dough and the baked count subtract what was binned. The ported spoilage action for dough and cookies (`logSpoilage` with a flavour and kind) records
  first, then runs the engine's own bookkeeping with its own change to the counts undone, then reads the counts back (once, not twice). This closes the silent under-deduction the
  C2 review left open (mix 6, bin 2, bake 6 used to take no ingredients for the other 2). Evidence: `production.sql` 112 cases; SQL role suite 1807 cases per reset, 2 resets,
  596 regressions detected; unit tests with 8 mutations, all caught. Raw-stock waste was already a `waste` movement (C1). Not looked at on screen: the spoilage sheet.
  **E1 was started and re-scoped:** see the E1 block in `next-goal.md` (three slices, and the owner decisions each needs).

- **2026-09-30 (C2, finish-plan slice C2):** production. Two code commits (`3fd4df2` database, then the app half and review fixes).
  - **Database:** migration `20260101004700`: `production_records` (no API grant), `use` added to the stock movement kinds (only the new functions write
    it; `record_stock_movement` still refuses it), and owner-only `record_production` (a dough mix or a baked batch: exact keys; every recipe line of the
    version it was made on comes off stock in ONE transaction as `use` movements, never more than is there, the shortfall kept on the record; a batch draws
    on chilled dough first; pieces round up, the rest to 0.1, +/- steps of 10 g / 5 ml / 1 pc, multiply-first so 9 pieces of 9 stay 5, not 6; refused if the
    recipe changed since the screen read it; idempotent on a client id), `record_pack` (an order's packaging once per order: the record id is derived from the
    order), `get_production` (batches with their version, the chilled dough, the cookies baked and not yet packed in one drop, the shortfalls), and
    `record_event_sale` redefined to use a stall sale's pouches and bag on its first insert only (a replay, or a sale that arrives already voided, adds nothing).
    New suite `production.sql` (88 cases, 32 rule/text regressions).
  - **App (live mode, no protected markup or engine edit):** `confirmDough` and `confirmBatch` are replaced from `OpsRuntime`: the record is sent first, the
    engine's own bookkeeping (sheet, toast, what ran short) runs against the quantities it showed, then the stock, batches, dough and baked count are read back.
    Packing an order records its packaging first, then sets Ready. A second tap on Confirm is ignored while one is in flight; a lost reply keeps the id so
    repeating it never counts twice. `state.batches`, `variances`, `shortfalls` come from the database, so "baked on this version" and the records screen are
    real; `dough` and `baked` move by what changed on the database, so a change made only on the screen (binned dough or cookies, stall stock) is kept.
  - **Opus review** (database SAFE; the app half was NOT SAFE until fixed): a partial read overwrote the chilled dough and baked counts (binned dough came back,
    a sale flush put the stall's cookies back); a double tap recorded a batch twice (and a Back during the record crashed the engine's confirm); an order for
    another week could not be packed (drop -1); dough pieces could round up one too many. All fixed with tests.
  - **Recorded, not fixed:** (1) Packaging names and the pack rule (full sixes in a box, loose in pouches, a sticker each, a card per box) are the ported defaults, hard-coded
    in the database (DP-03 stays open: real box sizes 6/8/12 from `order_boxes` and per-flavour footprints are not used); a renamed catalogue item is a permanent
    shortfall; if her recipes list the pouch per cookie AND packing takes one, it is taken twice: **question for Ethan: which one owns packaging, the recipe line at bake or the pack rule at packing?** (the seed recipes have no packaging lines, so nothing is doubled today). (2) The stall's stock load and close-out still change only the screen (see the open item above for binned dough): after a reload the server's baked count does not subtract an event's loaded stock.
    (2b) Baked cookies are counted per drop on the server (`drop_no`), but the engine carries leftover baked cookies into the next drop (its drop rollover, `ops-engine.js:1091`, does not reset `baked`): after a rollover the server's view of last week's leftovers is 0. Decide in E1 whether leftovers carry over.
    (3) Packing records a shortfall and goes ahead; the ported engine refused to pack when packaging was short. (4) A count taken after a late `use` (an offline sale synced
    after a count) can double-count it. (5) A sale voided before it syncs deducts nothing on the server but the pouches on screen. (6) A batch of 0 is refused (the engine
    allowed it). (7) The staff RPCs are owner-only, so a helper cannot pack (unchanged). (8) Wording is PLACEHOLDER (`PRODUCTION_COPY`). (9) `bake_batches` (init) stays unused.
  - **Evidence:** `pnpm verify` 70 files / 1375 tests; G0 validator 1217 checks, 0 failures; port integrity OK (54 files); Python guards OK; SQL role suite 1783 cases per
    reset, 2 resets, 572 regressions detected (2 resets x 286); `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75;
    `test:live:checkout` 11 steps. Mutations: 28 on the unit tests (all caught; two survived their first run, m02 and m19, and were strengthened and re-run; one, m18, matched nothing and was re-run by hand and caught). The two new test files and the gate test ran 5 times in a row green; the first pre-commit run of the app-half commit failed a test once and passed on retry with no change (cause not found). **Visual QA in the browser pane** (live-mode
    build, local test owner): mixed 12 dough balls (flour 4200 -> 4000 g in the database, 12 chilled dough), reloaded (still 12), baked 4 with 1 reject (dough went to 8, "1 still
    to bake"), the recipe screen said "1 batch baked on this version", packed a 13-cookie order (Box of 6 9 -> 7, sticker 4 -> 1, pouch 64 -> 63, card 42 -> 40), and after a
    reload the Inventory ingredients, packaging and dough tabs showed those quantities. Not looked at on screen: the Inventory screen before the changes (its "before" quantities come from the dough sheet and database queries), the stall sale's packaging (SQL and unit tests only), a
    shortfall toast, and a phone-width pass.
