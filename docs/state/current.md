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
- **Baseline (2026-09-30, at D4 close):**
  - `pnpm typecheck` clean; `pnpm verify` 62 files / 1150 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1387 cases per reset, 2 resets, 368 deliberate regressions detected in all; Python guards: 63 OK; migrations: 43; public functions: 69;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 11 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-30 (D4, finish-plan slice D4):** Cine's upcoming bazaars. Two commits (`d5536d9` database, then the app half and the review fix).
  - **Database:** `scheduled_events` (name, first and last day, place, rent in centavos, active, the event it became, `updated_at`; RLS on,
    no API grant). Owner-only `get_scheduled_events()`, `save_scheduled_event(jsonb, stamp)` (exact keys, whole-centavo rent, at most 15
    days, a stale stamp is `P0002`, an identical repeat of a create is answered) and `link_scheduled_event(booking, event)`. Migration
    `20260101004200` (review fix) makes the first link also book the stall rent as that event's "Stall rent" expense (category "Bazaar
    rent") and ledger cost in the same transaction, keyed on the booking, and gives an event at most one booking (unique index).
  - **App (live mode, no protected markup or engine edit):** All tools > "Bazaar events" (owner only) is the form: a row per booking plus a
    blank one, deactivate instead of delete, only changed rows are sent, each with its own stamp. The Bazaar screen's "Start an event"
    list shows her active, unstarted bookings that have not ended (name, "Sat, Oct 24 - Sun, Oct 25 · place"), soonest first, then "Start
    without a booking" (the two prototype events are never shown in live mode). Starting one opens the event under its name and links it;
    the event's expense list and close-out show "Stall rent" (a local, display-only row from the engine's own function: the
    server already booked it, so it is never queued). Unconfirmed links are kept on the phone (`hc-pending-link`, a list, 3 days) and
    retried whenever the list loads; the toast then tells her not to add the rent by hand.
  - **Opus review (before the fix: BLOCKED on one High):** the rent was booked by the phone after the link answered "first", with a random
    client id, so a lost reply, a failed link or a killed tab could book it twice or never, and the old warning ("add it under expenses")
    invited the double. Fixed as above (the database books it; a retry of the link is always harmless). Also fixed: a start whose reply was
    lost is reused by booking id, not by name (two bookings with the same name could share an event); the form remounts after a conflict so
    it shows what is saved; a create whose reply was lost leaves the blank row on a new id. Security side clean (owner check, grants,
    `search_path`, inputs, Manila dates, no personal data).
  - **Evidence:** `pnpm verify` 62 files / 1150 tests; G0 validator passes; port integrity OK (54 files); Python guards OK; SQL role suite
    1387 cases per reset, 2 resets, 368 deliberate regressions detected (for D4: 12 rule tags, the unique index and a table
    grant); `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1
    (OFFLINE-01 WebKit) / 75; `test:live:checkout` 11 steps. Mutations on the new branches: 17 on the first version (16 caught, 1 equivalent) and 8 on the review fix, all caught.
    **Visual QA in the browser pane** (live-mode build, local owner): the form and its saved rows, the Bazaar list, starting a booking
    (event opens under its name, "Stall rent ₱1,800" in Event expenses, one rent expense in the database, the booking linked and gone from
    the list). Not looked at: a test sale and the close-out screen with the rent (needs baked stock; it reads the same local row).
  - **Recorded, not fixed:** (1) the stale check compares to the millisecond, so two saves in the same millisecond are not told apart
    (one owner; theoretical). (2) A booking starts only when the phone is online (the event start is online-only by design). (3) The rent is
    the amount the booking asks at the moment of linking; changing it later does not touch an expense already booked. (4) `docs/DATA.md`
    does not list `scheduled_events` (nor `event_expenses`); documentation debt. (5) A pending link that keeps failing (for example refused with 23505) is retried silently for 3 days, then dropped. (6) Wording is PLACEHOLDER (`SCHEDULED_COPY`,
    `src/lib/orders/staff-copy.ts`). (7) The B4b items below and everything in [current-history.md](current-history.md) still stand.
