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
  - SQL role suite: 1000 cases per reset, 2 resets, 172 deliberate regressions each detected; Python guards: 63 OK; migrations: 36;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (B1, finish-plan slice B1, database half):** migration `20260101003500_place_order.sql`.
  - **`place_order(jsonb)`** (anon and signed-in may execute; `SECURITY DEFINER`, `search_path ''`). The body carries
    exactly the customer's fields (`client_id`, `name`, `ig`, `mobile`, `pickup_date`, `pickup_window`, `pay_method`,
    `items`, optional `pay_ref`, `notes`); any other key (a price, total, state, role) is refused. The server prices from
    `products` where published **and** active, snapshots the price and the capacity weight on each line, and returns
    the order number (`HC-<seq>`), a 64-hex status token and whether it was a replay. Rules, in order: idempotent on
    the client id first (a retry returns the same order and token, also while the shop is shut or the phone is at its
    limit; the same id with another body is 23505), the ordering window (the engine's `dropCycle`, Asia/Manila), the
    payment method is one the owner offers now (active, by label), pickup day / lead time / time (Mon and Thu, 1 to 14
    days ahead, 09:00 to before 17:00 or `campus`), the menu, `maxPerOrder`, open unpaid orders per phone, then
    capacity per pickup week (Mon to Sun, so a Monday and a Thursday count together, C1). Same-day is refused until B4.
  - **D1 in two runtimes:** `order_holds_capacity()` and `holdsCapacity()` in `capacity.ts`, 16 `holds` cases in
    `capacity-cases.json`, run by the unit parity test and by `tests/e2e/capacity-parity.spec.ts` on the SQL side.
    `capacity_allows` did **not** change: D1 changes which orders count as committed, not the arithmetic, and
    `place_order` still asks `capacity_allows()` with weighted units (D9). An order holds unless cancelled, a no-show or
    refunded; an unpaid order still in review lets go after the owner's hold hours (default 24).
  - **Owner rules:** one-row `order_rules` (hold hours 24, unpaid per number 2, pickup days Mon/Thu, lead 1 to 14 days,
    pickup hours 9 to 17, campus 14:00 to 15:30) with `get_order_rules` and `save_order_rules` (exact keys, bounds,
    stale stamp gives P0002). No screen edits them yet.
  - **`order_status(token)`** returns the order, its items at the price paid, the unpaid hold expiry; null for an
    unknown or malformed token; no name, phone, handle or notes. **`join_waitlist(jsonb)`**: idempotent, one entry per
    number and date, five open per number.
  - **No IP keying anywhere**; the limits key on the phone number. Refusals a customer can fix carry ZC001 to ZC006.
  - **Erasure and retention** cover the new personal data: `anonymise_customer` and `prune_personal_data` were
    re-created to blank the Instagram handle, the status token and the body hash, and to delete waitlist rows.
    `pay_ref` stays with the financial record (`erasure-authority.sql` asserts it). The 10-digit form `9XXXXXXXXX` is
    normalised to `09…` in all three functions.
  - **Evidence:** SQL role suite 1000 cases per reset (`order-placement.sql` 175), 2 resets, 172 regressions detected
    (36 new per reset: every customer rule neutralised one line at a time, text mutations on price, hold predicate,
    status keys and erasure, ACL and table grants); function manifest 50; types regenerated; `pnpm verify` 48 files /
    814 tests; Python guards 63 OK; G0 validator 1206 checks, 0 failures; port integrity OK. The SQL half of the
    parity spec passes its 16 hold cases against the local stack. Opus review (model opus): no P0 or P1; fixed before
    commit: the 10-digit phone form, a missing rules row now refuses (55000), a share lock on the menu rows while
    pricing, `payload_hash` cleared on erasure, `24.0` accepted as a whole number.
  - **Recorded, not fixed (owner or later-slice decisions):**
    1. **Capacity can be drained by rotating made-up phone numbers** (Opus P2): about 9 anonymous orders of 24 cookies
       with different numbers fill a 200-cookie week until Cine cancels them. No IP limit is possible; options are a
       cap on how much of a week unpaid orders may hold, or a `consume_rate_limit` bucket per pickup week. Same for
       the waitlist. **Decide before the shop opens (B2/F2).**
    2. `pay_ref` (free text, 40 characters) survives erasure by design; a customer could type personal text in it.
    3. Erasing an unpaid order deletes it, so an offline retry with the same client id would recreate it.
    4. The status token is stored in the clear so a retry can return it; the table has no API grant.
    5. `shopOverride` (close early) is not on the database, so `place_order` cannot see it; persist it before B2 ships.
    6. Any code that creates orders later (B3) must set `pickup_date`, take the week lock and use `order_number_seq`.
    7. The parity spec's old fractional case (`committed = 2.9`) fails against a live database: PostgREST cannot pass
       2.9 to an integer parameter. It was skipped in every earlier run (no local keys) and is unrelated to B1.
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright); `pnpm test:e2e`
    was not re-run this slice (no app code changed).
