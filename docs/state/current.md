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
- **A2 database half is done locally (2026-09-29):** payment methods, shop footer texts and the image bucket on the database; the app half is next.
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at A2 database-half close):**
  - `pnpm typecheck` clean; `pnpm verify` 46 files / 736 tests; port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - SQL role suite: 825 cases per reset, 2 resets; Python guards: 63 OK; migrations: 35;
  - `pnpm test:e2e`: not re-run for A2's database half (no app code changed); the D2 figure was 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (A2 database half, finish-plan slice A2 — payment methods, shop texts, image bucket):**
  - **Database (migration `20260101003400_payment_methods_shop_texts.sql`):** `payment_methods` (label the customer
    sees and an order stores, account number and name, `qr_path`, on/off, order; unique label) and a one-row
    `shop_texts` (registration badge, TIN line, invoice note, allergen note; empty means the shop prints nothing).
    Both tables have RLS, no policy and no API grant. Owner RPCs, `search_path ''`, in-function `is_owner()`:
    `get_payment_methods`, `save_payment_method` (exact keys; `qr_path` must be `qr/<name>.png|jpg|jpeg|webp`, so no
    scheme, colon, `..`, leading slash or subfolder; stale `updated_at` gives P0002), `save_shop_texts`. The one
    anonymous read is `get_shop_payment_info()` (active methods, the four texts, nothing else). The migration seeds
    no row: no real number, QR or claim is committed.
  - **Bucket:** `shop-media`, public, 2 MiB, png/jpeg/webp only (no SVG). Four `storage.objects` policies: only the
    active owner selects (upsert needs it), inserts, updates and deletes, and only a generated name under `qr/` or
    `flavours/`; there is no anon SELECT, so the bucket cannot be listed. The bucket row is created by the migration
    when Storage's own columns exist, and otherwise from `supabase/config.toml` (`[storage.buckets.shop-media]`): a
    fresh CLI reset applies migrations before Storage's migrations add `public` and the other columns. Hosted
    projects need one check of the bucket's public flag, size limit and mime list at cutover (F3).
  - **`save_flavour` is unchanged.** Its path rule already accepts `flavours/<generated>.png`; uploads get generated
    names (uuid plus extension), so no widening was needed.
  - **Evidence:** SQL role suite 825 cases per reset (`payment-methods.sql` 88), 2 resets, 100 deliberate
    regressions detected (8 new per reset: three anon-EXECUTE grants, an anon bucket read, a helper bucket write, an
    unchecked object name, a raw table write, and the public read leaking an inactive method); function manifest 44;
    `pnpm typecheck` clean, `pnpm verify` 46 files / 736 tests, port integrity OK 54 files, G0 validator 1201 checks
    0 failures, Python guards OK, `pnpm db:types` regenerated. An Opus review found no P0/P1 in the SQL logic; its two
    P1s (a harness syntax error and a wrong mutation message) were in an intermediate state and are fixed, and its P2
    (direct SELECT/UPDATE/DELETE probes for every actor on both tables) is in the suite.
  - **Not done (the app half, still A2):** the engine `PAY_ACCOUNTS` guarded edit and its records/baselines, the
    stored-path to URL resolver (one for flavours and QR; `RES` in the engine would turn `https://…` into `/https://…`),
    the owner forms for methods, QR/photo upload and shop texts, the guarded footer edit in `shop.tsx` (finding 16),
    CSP `img-src` and the D2 carry-over (the close's `cashCents`/`floatCents` from acknowledged rows). The next goal
    in [next-goal.md](next-goal.md) carries the detail.
  - **Recorded, accepted:** `get_shop_payment_info()` has no rate limit (it returns only what the shop prints, like
    `shop_products`); the bucket's public/size/mime settings are enforced by the Storage API and are not asserted by
    the SQL suite; the storage DELETE policy cannot be exercised over SQL (Storage's own trigger blocks it).
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).
