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
- **D1 is done locally:** bazaar events and sales on the database, offline on one phone (checkpoint below).
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales now reach the database; its stock and close-out are D2), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at D1 close):**
  - `pnpm typecheck` clean; `pnpm verify` 46 files / 714 tests; port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - SQL role suite: 657 cases per reset, 2 resets; Python guards: 63 OK; migrations: 33;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (D1, finish-plan slice D1 — bazaar sales, offline on one phone):** committed in two parts, the SQL
  half (`ee6f3be`) and the phone half.
  - **Database (migration `20260101003200_bazaar_events.sql`):** an event holds its price snapshot (taken at
    `start_event`, DP-20) and one selling device (decision 5; `set_event_device` keeps the old phone accepted).
    `record_event_sale` is idempotent on the client id plus a hash of the body: a true repeat is acknowledged once,
    the same id with a different body is refused (23505), a total that disagrees with the snapshot is refused
    (22023), a freebie books no ledger row. `void_event_sale` is a never-clearing marker, so void-before-sale,
    repeat void and a stale retry all end voided. `start_event` takes a client event id so a lost reply cannot open
    a second event. Owner-only (DP-18 open), `search_path ''`, EXECUTE for `authenticated`.
  - **Phone:** `src/lib/offline/sync.ts` now sends one row at a time to those RPCs through the signed-in
    browser client (`src/lib/data/event-sales.ts`, pesos to centavos in one place) and clears a row only when the
    reply names its client id. A void is its own queue row. `OpsRuntime` wraps `startEvent` (live: online only,
    server snapshot prices, event id kept in `hc-event-attempt` for a retry), `voidSale` (queues the void),
    `recordSale` (renames a sale id the engine reused after a void), `setEventPrice` (locked in live) and, in live
    mode, keeps the running event in `hc-live-bazaar` so a reload at the stall carries on with the same event
    (`bazaar-state.ts`). After every flush the on-screen sale flags follow the queue (live only). `OfflineBridge`
    subscribes to sales (this was the OFFLINE-01 root cause), retries a failed IndexedDB write, and stores the
    scripts the page loaded through the service worker so the phone can reload with no signal (`shell.ts`,
    `data-hc-offline-ready`). `public/sw.js` no longer posts anywhere: it wakes open tabs and caches the shell.
    `src/app/api/sync/route.ts` stays as an uncalled 503 only because the G0 validator pins it as a delivery
    file; the middleware carve-out for it is gone.
  - **OFFLINE-01:** passes on desktop and phone (Pixel 7). **WebKit (iPhone 13 profile) still fails** at
    `page.reload()` offline with "WebKit encountered an internal error", before any of our code runs; not
    diagnosed further (Playwright's WebKit with a service worker and `setOffline`). The e2e build has no Supabase
    project, so the acknowledgment comes from a stand-in `saleClient` set on the engine; the server contract is
    proven by the SQL role suite. **The physical-phone test for the 20-Oct gate is not run and still needed.**
  - **Evidence:** `pnpm verify` 46 files / 714 tests, exit 0; `pnpm test:e2e` 89 passed / 1 failed (WebKit
    OFFLINE-01) / 30 skipped; SQL role suite `bazaar-events.sql` 87 cases per reset (657 combined, 2 resets, 76
    deliberate regressions detected); Python guards 63 OK (function count 36); G0 validator 1201 checks, 0 failures.
    Mutation checks: four on the RPCs (SQL), eight on the phone code (reply not checked, every row marked sent,
    void not queued, id collision left, start retry id, unnamed event sent, saved event not read back, flags not
    from the queue) each caught by a test. Two Opus reviews: SQL (no P0/P1; two P2 fixed) and phone (two P1 and
    four P2; the reload-loses-the-event P1 fixed by `hc-live-bazaar`, the void-guard P1 not applicable because
    the engine's `voidSale` only returns early for an unknown id).
  - **Recorded, not fixed:** (1) a flavour that was inactive when the event started is still on the sell grid;
    a sale of it is refused (22023) and stays queued as failed. The start now says how many flavours cannot be sold;
    D2's stock loading should stop offering them. (2) A permanently refused sale (22023/23505/42501) is retried
    on every flush and looks like a network failure; the sync toast counts void rows as sales. (3) Old queue rows
    from before D1 have no server event and stay failed. (4) The advisory lock (void racing its own sale) needs a
    two-connection test. (5) The owner can already write `event_sales`/`events` directly under RLS, so E1's revenue
    query must skip rows with `voided_at`. (6) Helper access to selling waits for DP-18.
