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
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at A2 close):**
  - `pnpm typecheck` clean; `pnpm verify` 48 files / 797 tests; port integrity OK, 54 files; G0 validator 1206 checks, 0 failures;
  - SQL role suite: 825 cases per reset, 2 resets; Python guards: 63 OK; migrations: 35;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (A2 app half, finish-plan slice A2):**
  - **Live checkout:** the customer sees only the payment methods `get_shop_payment_info()` returned, each with
    the owner's account number and name and a QR when she uploaded one. A failed or empty read, or a build with no
    Supabase, shows no method, no QR and none of the ported bank/cash note (the Opus review's P1: that note
    named a real-looking number). Demo mode is unchanged.
  - **Shop footer (finding 16):** live mode prints the registration badge, TIN line, invoice note and allergen
    note only when the owner has typed them; empty prints nothing. The order status page and order detail still
    say "Invoice INV-…": that wording waits for F10 ("Order no.").
  - **Owner forms** (in the existing `LiveFormHost`, no further protected markup): All tools, Business: "Payment
    methods" (list, add, edit, show/hide, order, QR upload) and "Shop texts". The flavour editor gained a photo
    upload. Uploads go to the public `shop-media` bucket under a generated name (uuid plus extension); PNG, JPEG or
    WebP up to 2 MB, checked before sending; the bucket and its owner-only policies are the real lock.
  - **One resolver** (`src/lib/media/resolve-image.ts`) turns a stored path into a display URL for flavours and QR:
    `assets/…` stays page-relative, a generated bucket path becomes the Supabase public URL, anything unsafe draws
    nothing. CSP `img-src` gained the Supabase origin (same value as `connect-src`).
  - **Two protected edits**, recorded in [protected-exception.md](protected-exception.md) with exact reversals in
    `scripts/validate-g0.py` and the baselines regenerated in the same commit: `replacePayAccounts` in the engine
    (three lines after `PAY_ACCOUNTS`) and one guarded branch around the footer in `shop.tsx` (`elements` +1).
  - **Evidence:** `pnpm verify` 48 files / 797 tests (new: `payments.test.ts`, `ops-runtime-payments.test.tsx`; the
    live-gate test also checks the payment read); ten deliberate mutations of the new code, each caught; port
    integrity OK; G0 validator 1206 checks, 0 failures; Python guards OK; `pnpm build`, `test:pages:spike`,
    `test:workers:spike` pass; `pnpm test:e2e` 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped. No SQL changed
    in this half, so the SQL role suite stands at the database half's 825 cases per reset. Opus review of the two
    protected edits and the upload path: BLOCKED on the P1 above, fixed and re-tested (see the record).
  - **Recorded, not fixed:** (1) an image is never deleted when the owner cancels or replaces it (orphans stay in
    the bucket); (2) a customer who picked a method the owner then turned off can still submit its label, so B1's
    `place_order` must check the method is offered; (3) the checkout still runs the ported local submit until B2;
    (4) **the D2 carry-over was not built** (the close's `cashCents`/`floatCents` from acknowledged rows): it is
    money/offline work and this slice was already past the size limit, so it stays open ("Recorded, not fixed" 1
    in the D2 checkpoint, [current-history.md](current-history.md)); do it before a two-phone event.
  - **Hosted setup at cutover (F3):** check the `shop-media` bucket on the hosted project (public, 2 MiB, png/jpeg/
    webp); the local config declares it, hosted needs the dashboard or `supabase config push`.
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).
