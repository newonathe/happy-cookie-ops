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
- **B4a is done locally (2026-09-29):** boxes, add-ons, the sampler cap and the same-day surcharge on the server-priced order
  (database) and the owner's "Boxes & add-ons" form (live mode). Customers cannot use them yet: B4b puts them on the live checkout
  and the owner's order screens.
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
- **Baseline (2026-09-29, at B4a close):**
  - `pnpm typecheck` clean; `pnpm verify` 57 files / 1052 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1318 cases per reset, 2 resets, 167 deliberate regressions per reset each detected; Python guards: 63 OK; migrations: 41;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 10 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (B4a, finish-plan slice B4 first half):** boxes, add-ons, the sampler cap and same-day, database and owner form.
  Ethan chose the split (B4a database + owner form, B4b checkout + owner screens) because B4 is far over the ~400-line rule.
  - **Database** (migration `20260101004000_order_extras.sql`): `order_extras` (one row, no API grant): same-day (on/off, percent,
    whether it also covers add-ons and box charges), the sampler (a flavour of kind `set` plus a quantity limit), `box_sizes` and
    `add_ons` (jsonb, validated by the save RPC). `get_order_extras`/`save_order_extras` (owner only, exact keys, whole numbers in
    range, stale stamp `P0002`), public `get_shop_extras` (active items only). `place_order` redefined with optional `add_ons` and
    `boxes` and ten new tagged rules (`same-day-off`, `same-day-time`, `sampler-cap`, `box-size`, `box-fit`, `addon-dup`,
    `addon-unknown`, `addon-variant`, `addon-text`, `addon-qty`); every earlier rule tag and mutation target is byte for byte. New
    SQLSTATE `ZC007` = a box size or add-on that is no longer offered (the customer's page is out of date). New tables
    `order_add_ons` (name, price, variant, note frozen at order time) and `order_boxes`; `orders.surcharge_cents`, `orders.same_day`.
    Total = items + add-ons + box charges + surcharge, all server-side; surcharge = `(base x percent + 50) / 100` centavos, half up,
    where base is the items (plus add-ons and box charges when the owner turns that on). Same-day = pickup date is today in
    Asia/Manila (the customer cannot dodge it); it is **off until the owner switches it on** (decision: a surcharge that starts by
    itself on deploy is not a default to ship; Cine's form offers it). `order_status` and `get_staff_orders` carry add-ons, boxes
    and surcharge; `order_status` never carries the note text. `anonymise_customer` and `prune_personal_data` blank the note-card
    message before they blank the phone (D11); an erased unpaid order takes its lines with it.
  - **Sampler = an ordinary flavour of kind `set`** (price, `capacity_weight` = its cookie count), made in Menu & flavours and named
    in Boxes & add-ons; capacity, swap and reopen need no change. **Boxes are chosen by the customer** (`boxes:[{size,qty}]`,
    at most as many cookies as the order holds; sets and the sampler are not boxable; the rest is bags); a box takes no extra
    capacity. **Add-on limits count all lines of one add-on together.**
  - **Owner form** (live mode, All tools > "Boxes & add-ons", no protected-markup edit): box sizes and charges, add-ons (name, price,
    choices such as sticker numbers, an optional message label and length, limit, on/off), the sampler and its limit, the same-day
    extra. Pesos on screen, centavos on the wire; nothing is deleted, an item is switched off.
  - **Evidence:** `pnpm verify` 57 files / 1052 tests (one unrelated teardown flake in `ops-runtime-live-state` seen once, green on two
    reruns); G0 validator 1217 checks, 0 failures; port integrity OK; Python guards 63 OK; SQL role suite 1318 cases per reset, 2
    resets, 167 regressions per reset each detected (new suite `order-extras.sql`, 143 cases, 24 regressions); `pnpm build`,
    `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 10 steps;
    21 unit-test mutations (data layer, runtime, form) each caught. **Opus review** (SQL, money, personal data): no authorization
    bypass, no High. Fixed: the add-on limit was per line (now per add-on, tested and mutation-checked); same-day default on ->
    off; the same-day campus check used the slot's end (now its start, with cases); a test that passed for the wrong reason (sets
    not boxable); duplicate box sizes `6` and `6.0` (compared as text). Recorded, not fixed: **a staff swap does not recalculate the
    surcharge and can swap a cookie into a set or the sampler after the fact** (staff only; the B3 swap keeps the non-item part of the
    total by design); same-day has no minimum-notice setting (a 16:58 order for 16:59 is accepted); the `23:59` test slot fails
    only if the suite starts in the last minute of the Manila day; newlines are refused in the note message.
  - **Customers see no change yet:** the live checkout sends no `add_ons` or `boxes` and offers no same-day date. `parseShopExtras`
    (the customer read of `get_shop_extras`) is not written; B4b writes it.
  - **Wording and prices are placeholders** (`EXTRAS_COPY` in `src/lib/orders/staff-copy.ts`; the September prices in the
    `order_extras` defaults: note card 10, ribbon 10, sticker 15 with numbers 1-4, sticker pack 50 pesos; boxes 6/8/12 free). Cine's
    real box charges and prices (C5) are entered in the app.
  - **Still open from B3/B2:** unchanged (see [current-history.md](current-history.md)): helper pack/collect, lapsed unpaid orders on
    the bake list, the overage sheet's "over by", no pickup code on the status page, the physical-phone test, WebKit OFFLINE-01, a real
    signed-in owner session against the hosted project.
