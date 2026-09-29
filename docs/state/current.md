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
- **Baseline (2026-09-29, at B3 close):**
  - `pnpm typecheck` clean; `pnpm verify` 55 files / 994 tests; port integrity OK, 54 files; G0 validator 1217 checks, 0 failures;
  - SQL role suite: 1175 cases per reset, 2 resets, 143 deliberate regressions per reset each detected; Python guards: 63 OK; migrations: 40;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 10 steps pass (needs `pnpm db:reset`; keys from `pnpm exec supabase status -o env`, the bare `supabase` binary is not on PATH).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (B3, finish-plan slice B3):** the owner's side of an order, four commits plus review fixes.
  - **Database** (migrations `20260101003700`, `…3800`, `…3900`): owner-only, idempotent `staff_*` RPCs with the
    `updated_at` stamp (idempotency is checked before the stamp, so a retry after a lost reply never fails): `get_staff_orders`,
    the paid tick `staff_confirm_payment` (re-checks the week when the unpaid hold lapsed; `force` = "confirm anyway"),
    reject, reopen, `staff_set_status` (baking, packed, collected, undo, no-show; packing is blocked while a flavour is
    flagged), flag and swap a flavour (re-priced from today's menu, idempotent on a client id), refund, settle a balance.
    `UPDATE` on `orders`/`order_items` is revoked from the API roles. `get_shop_status()` (public: the ordering window and
    the switch, nothing else) and `set_shop_override()`; `place_order` honours the switch (closed, sold out, held open).
  - **Screens (live mode, no protected-markup edit except the lookup slot):** the ported orders, order, bake and pack
    screens are fed from the database (status = the database state) and their actions call the RPCs server first; the
    engine's local side effects are not repeated (no packaging-stock check on packing, no local ledger, no invoice).
    **The bake list counts unpaid orders** (28 Sep), for the current pickup week. "Customer messages" in All tools: a status
    link and a text to copy per open order. "Order rules" in All tools (`get_order_rules`/`save_order_rules`).
    Every live page reads the shop status, so the banner and the add buttons say what `place_order` will do; the owner's
    close-now, sold-out, closing-soon, open, extend and follow-my-schedule reach the server first.
  - **Guarded slot in `find-my-order.tsx`** (Ethan approved 2026-09-29): `/lookup` shows the live form. Exact reversals
    `LOOKUP_REVERSALS`, baselines regenerated, record in [protected-exception.md](protected-exception.md), port audit PASS;
    the visual PNGs are unchanged.
  - **Decisions and deviations:** the staff RPCs are **owner only** (helper pack/collect stays an open decision; a helper is
    refused in the role suite). The switch is a `shop_state` table, not a setting (a fourth allowed key would have meant
    redefining three settings functions). The 20260101003900 migration is a review fix, added rather than editing 3700.
  - **Evidence:** `pnpm verify` 55 files / 994 tests; G0 validator 1217 checks, 0 failures; port integrity OK; Python guards
    63 OK; SQL role suite 1175 cases per reset, 2 resets, 143 regressions per reset, each detected; `pnpm build`,
    `test:pages:spike`, `test:workers:spike` pass; `pnpm test:e2e` 89 / 1 (OFFLINE-01 WebKit) / 75; `test:live:checkout` 10
    steps (the shop opens from the server window with no local override, close-now closes the banner, `/lookup` finds an
    order). Unit tests carry a mutation per new branch (about 60 deliberate mutations, each caught). Port audit (Sonnet)
    PASS. **Opus review:** no authorization bypass; one High (reopen could overbook a week), five Medium and six Low; fixed:
    the High, the "this drop" sums (now the current pickup week), the extend-closing switch, a swap refusal with no message,
    the swap total, lost replies, the refund amount, reopen of a refunded order, the list limit.
  - **Left open from the review (not fixed, recorded):** the overage sheet's "over by" mixes cookies and weighted slots (only
    wrong when a flavour's weight is not 1); an owed-back amount after a cheaper swap on a paid order is not shown (the ported
    balance line has no negative form); **lapsed unpaid orders still count on the bake list** until the owner cancels them, which is a
    question for Cine (she said unpaid orders show on her bake list, not whether an order past its 24-hour hold does).
  - **Wording is placeholder** (`src/lib/orders/staff-copy.ts`, `STAFF_COPY`, `MESSAGE_SHEET`, `RULES_COPY`, and the customer
    texts in `src/lib/orders/messages.ts`; the customer sentences in `copy.ts` are still open too): the paid, rejected,
    reopened, packed, collected, no-show, refund, balance, flag and swap toasts; "tick paid before packing"; "a refunded order
    cannot be reopened"; the offline, conflict and unsure lines; the four customer messages (payment reminder, payment
    received, ready for pickup, flavour swap); the order-rules labels and the switch and rules save/refusal lines.
  - **Still open from B2:** the status page has no pickup code in live mode (`showCode` false); the ported status line about
    booking a Grab or Lalamove is false for the campus slot; the ported screens still say Saturday and Sunday for Monday and
    Thursday pickup days (mapped by rank); the invoice wording (F10). **Ported lines false in live mode on the owner screens**
    (kept, not edited): "Emailed when they submitted", the payment-proof sheet and the "Order submitted with proof" timeline line.
  - **Still not run:** the physical-phone test for the 20-Oct gate, WebKit OFFLINE-01, a real signed-in owner session against
    the hosted project (the owner screens are proven against the local stack and unit tests, not a browser sign-in).
