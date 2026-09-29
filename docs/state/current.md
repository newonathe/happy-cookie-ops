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
- **Baseline (2026-09-30, at A4 close):**
  - `pnpm typecheck` clean; `pnpm verify` 66 files / 1259 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1608 cases per reset, 2 resets, 470 deliberate regressions detected in all; Python guards: 63 OK; migrations: 46; public functions: 75;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (A4, finish-plan slice A4):** the owner's recipes with versions. Three commits (`9432dda` database, `1ff31fb` app and review fixes; the docs are the third).
  - **Database:** `recipes` gets a version and stamp, `recipe_ingredients` an order, and `recipe_versions` keeps what each save replaced. Owner-only
    `get_recipes` and `save_recipe` (exact keys; a yield of 1 to 10000; up to 80 lines, each a name, an exact quantity of 0.001 to 999,999 with at most
    3 decimals, and g, ml or pcs; no ingredient twice; a line for a stock item must be in that item's unit, names compared ignoring case; stale stamp
    `P0002`; a create is replay-safe; a save with nothing new answers without a new version). Legacy direct writes on the recipe tables are revoked.
    Migration `20260101004500` redefines `save_stock_item` so an item a recipe uses keeps its unit (found by the review: a unit change would have
    locked the recipe and put the cost out by the ratio). New suite `recipes.sql` (80 cases, 13 rule regressions), `stock-catalogue.sql` +3.
  - **App (live mode, no protected markup or engine edit; the recipes are state-based, so no engine constant needed refilling):** the owner's recipes fill
    `state.recipes`, `recipeBase`, `recipeVer` and `recipeHistory` for each flavour on the menu; a flavour with no recipe gets an empty one, never the
    prototype's six (also at start-up, after a reset, and for a helper). The ported "Save as new version" calls `save_recipe`; the screen then shows
    the version the database made, the versions it replaced, and the cost per cookie from the A3 prices. The blank-name warning, the local checks and
    the wording of a refusal, a lost connection and a conflict are new PLACEHOLDER copy (`RECIPE_COPY`).
  - **Opus review** (database SAFE; the app half was BLOCKED until fixed): an edit was saved against the newest stamp read, not the one it started on, so
    a newer version made elsewhere could be overwritten with no warning; typed text before the first read landed on an empty placeholder and took the
    real stamp; a reset with no recipes read brought the prototype's six back; a save's answer was thrown away, so a failed read-back could make the
    next save a false conflict that discarded the edit; overlapping reads could bring back an older stamp. All fixed with tests; a conflict shows the
    other version (the replaced lines stay in `recipe_versions`).
  - **Recorded, not fixed:** (1) the history list shows counts, not the old lines, and there is no restore, although the database keeps every version.
    (2) Batch counts ("baked on this version") read nothing until batches are loaded (C2). (3) The seeded demo recipe lines all sit at position 0, so
    their order is arbitrary until first saved. (4) Item units are free text (A3) but a recipe unit is g, ml or pcs: an ingredient in kg cannot be
    recipe-measured (the form's hint says g, ml, pcs). (5) The import for her current menu is not written: her workbook layout belongs with the cutover
    (finish-plan section 9). (6) A conflict discards the local edit (their version shows). (7) Wording is PLACEHOLDER.
  - **Evidence:** `pnpm verify` 66 files / 1259 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite 1608 cases per
    reset, 2 resets, 470 deliberate regressions detected; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01
    WebKit) / 75; `test:live:checkout` 11 steps. Mutations: 18 on the app, all caught bar two equivalent ones, and 9 more on the review fixes, all caught.
    **Visual QA in the browser pane** (live-mode build, local owner, the seeded recipes as data): the recipes screen from the database (White
    Chocolate Biscoff, 24 cookies, ₱32.58 per cookie from the A3 prices), an edit and "Save as new version", then "Version 2 - current" with Version 1
    below it, and the database holding version 2 with version 1's ten lines kept. Not looked at: a phone-width pass, and a recipe for a flavour with none saved.
