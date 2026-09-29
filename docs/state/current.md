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
- **A2 is done locally (2026-09-29):** payment methods, QR and photo upload, and the shop footer texts, on the database and on screen (live mode).
- **B2 is half done (2026-09-29): the database half** (customer-readable pickup rules, lookup by order number and
  phone) is done; **the app half (the live checkout screens) is not started**.
- **B1 is done locally (2026-09-29):** the order command on the database (`place_order`, `order_status`,
  `join_waitlist`, the owner's order rules); the live checkout that calls it is B2.
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders (the database can now take them; the checkout and the owner screens are B2/B3), payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at B1 close):**
  - `pnpm typecheck` clean; `pnpm verify` 48 files / 814 tests; port integrity OK, 54 files; G0 validator 1206 checks, 0 failures;
  - SQL role suite: 1024 cases per reset, 2 resets, 182 deliberate regressions each detected; Python guards: 63 OK; migrations: 37;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (B2, database half only; the app half was not started):** migration
  `20260101003600_order_lookup.sql`.
  - **`get_shop_order_rules()`** (anon may execute): the eight pickup values a customer's date picker needs (pickup
    days, lead min and max, pickup hours, campus slot, unpaid hold hours) and nothing else. `get_order_rules()` stays
    owner-only because it also holds the anti-abuse numbers.
  - **`find_order(order_no, phone)`** (anon): the status token for an order number and the phone it was placed with,
    or null. Every miss is the same null: malformed input, unknown number, wrong phone, erased order, too many tries.
    The phone is normalised exactly as in `place_order` and `anonymise_customer` (including `+63…` and `9XXXXXXXXX`).
    Throttled per order number, ten tries per fifteen minutes, and only on orders that exist (so no counter row is
    created for a made-up number); the price is that a stranger can use up someone's tries for a while.
  - **Fixture:** the parity case `committed = 2.9` is marked `"sql": false` (TypeScript only) in
    `capacity-cases.json`, and the SQL half of the parity spec skips it, with a note: `capacity_allows()` takes integers
    and the server's committed count is always an integer sum. With that, the spec passes in full against a live stack.
  - **Evidence:** SQL role suite 1024 cases per reset (`order-lookup.sql` 24), 2 resets, 182 regressions detected
    (5 new per reset: throttle, phone check, both phone forms, and a rules leak); function manifest 52; types
    regenerated.
  - **The app half is still to do** and is written in [next-goal.md](next-goal.md): the guarded slot in `checkout.tsx`,
    the `custSubmit` override, the status page from `order_status`, the lookup screen and the waitlist. Decisions
    already made for it (advisor review, 2026-09-29): keep the status token in the URL fragment (`#t=`), not the query
    string; keep one client id per attempt and resend the identical frozen body after a network error; mint a new id
    after a definite refusal or a success; check that a customer page can open the live sheet host before adding a
    second protected edit (the lookup screen's ported copy promises email lookup, which is false in live mode); run
    `pnpm db:reset` before any E2E run (the long-running dev stack was hand-migrated and its grants are stale); the E2E
    fixture must set its own world through the service role (a published flavour, an active method, an open ordering
    window computed in Asia/Manila).
  - **Still not run:** everything in the B2 goal that is app work, `pnpm test:e2e`, the physical-phone test for the
    20-Oct gate, WebKit OFFLINE-01.
