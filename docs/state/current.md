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
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at D2 close):**
  - `pnpm typecheck` clean; `pnpm verify` 46 files / 736 tests; port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - SQL role suite: 737 cases per reset, 2 resets; Python guards: 63 OK; migrations: 34;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 30 skipped.
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (D2, finish-plan slice D2 — bazaar close-out):**
  - **Database (migration `20260101003300_bazaar_closeout.sql`):** four owner-only RPCs, `search_path ''`, EXECUTE
    for `authenticated`. `load_event_stock` sets the table stock and the drawer float once (only flavours in the
    event's price snapshot; the float has its own column so `start_event`'s retry still matches). `add_event_expense`
    is idempotent on a client id plus a body hash and posts a negative cost to the ledger. `close_event` sets
    `closed_at`, stores the count and the unsold stock, books a short drawer as a cost and an over drawer as
    takings, and returns `event_summary`. `event_summary` is recomputed from rows every time: voided sales never
    count; profit is takings minus expenses plus the drawer variance, and leaves out ingredient cost (needs C2).
  - **Close safety (from the Opus review, both P1s):** the close carries the phone's `floatCents` and `cashCents`.
    The server closes only when its own float and non-voided Cash total match; otherwise it refuses with `40001`,
    which the phone treats as "try again later". So a close that overtakes a sale, a void or the stock load is
    retried instead of being booked as a drawer variance. A close dated before an already-recorded sale is refused.
  - **Phone:** stock load, each expense and the close are queued like sales (`open:<event>`, `expense:<uuid>`,
    `close:<event>` rows, frozen bodies, sent in the order sales, voids, stock, expenses, close). `OpsRuntime`
    wraps `setEventStock` (a flavour off the event menu cannot be put on the table: closes D1 carry-over 1),
    `openSelling`, `addEventExpense` (positive amounts only), `closeEvent` (queued only if the engine actually
    closed) and `reopenEvent` (a closed event stays closed in live mode). Refusals (22023, 23505, 42501, 55000,
    P0002) are now told apart from a lost connection, and the sync toast says so (closes D1 carry-over 2).
  - **Evidence:** `pnpm verify` and `pnpm test:e2e` numbers in the baseline above; SQL role suite 737 cases per
    reset (2 resets, 84 deliberate regressions detected), `bazaar-closeout.sql` 80 cases; 17 deliberate
    mutations of the new SQL and 12 of the phone code, each caught by a test; Python guards 63 OK (function count
    40); G0 validator 1201 checks, 0 failures. Opus review of the SQL: two P1s and four P2s, all fixed or
    recorded; a second look at the fixes found no new P0/P1.
  - **Recorded, not fixed:** (1) **The close can retry forever** if the phone counts money the server will
    never hold: a sale the server permanently refused, Cash sales from a former phone after `set_event_device`, or
    a stock load that was refused. The phone should build `cashCents`/`floatCents` only from rows the server has
    acknowledged, and an audited owner override after N tries; do this before a two-phone event. (2) A Cash sale
    that arrives from a former device after the close changes the summary's expected cash but not the stored
    variance. (3) The variance ledger row is linked to its event only by its memo. (4) An expense's date is not
    bounded by the event. (5) A close with no count cannot be given one later. (6) A close dated before a sale
    (clock corrected backwards) is refused as permanent. (7) The lock around `record_event_sale` still needs a
    two-connection test. (8) E1's revenue must use `event_summary` or skip rows with `voided_at`. (9) Helper
    access to selling and closing waits for DP-18.
  - **Still not run:** the physical-phone test for the 20-Oct gate; WebKit OFFLINE-01 (Playwright).
