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
- **B2 is done locally (2026-09-29):** the live checkout on the database and on screen (customer pages, live mode): the
  order form, the order number and status link, the status page, Find my order and the waiting list. Two cutover
  blockers found and recorded below (the shop's open state is not read from the server; `/lookup` URL).
- **B1 is done locally (2026-09-29):** the order command on the database (`place_order`, `order_status`,
  `join_waitlist`, the owner's order rules).
- **D1 and D2 are done locally:** bazaar events, offline sales and the close-out (stock, expenses, cash count, event profit) on the database (checkpoint below).
- **Screen by screen:** orders (customers can now place them, live; the owner screens do not see them until B3), payments, bake/dough, inventory, grocery, suppliers, recipes, P&L and the
  waitlist still live only in the browser (bazaar sales, stock, expenses and close-out now reach the database), so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-29, at B2 close):**
  - `pnpm typecheck` clean; `pnpm verify` 51 files / 898 tests; port integrity OK, 54 files; G0 validator 1211 checks, 0 failures;
  - SQL role suite: 1024 cases per reset, 2 resets, 182 deliberate regressions each detected; Python guards: 63 OK; migrations: 37;
  - `pnpm test:e2e`: 89 passed / 1 failed (WebKit OFFLINE-01) / 75 skipped, run with no Supabase variables (the capacity-parity specs skip without a local stack, so the skipped count is higher than the 30 recorded earlier; passed and failed are unchanged). Passing the local-stack variables at run time to `next start` makes its middleware send staff routes to sign-in, so do not.
  - `pnpm test:live:checkout`: 8 steps pass (needs `pnpm db:reset` and the local stack keys in the environment).
- **Known red:** OFFLINE-01 on WebKit only; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct. OFFLINE-01 passes on desktop and Android-sized phone in Playwright; WebKit fails in the test runner and the physical-phone test (her phone model) has not been run.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-29 (B2 app half, finish-plan slice B2):** the live checkout on the customer pages, live mode only.
  - **One guarded slot in `checkout.tsx`** (D4): `{bareFrame ? <LiveCheckout v={v} /> : (…ported, verbatim…)}` from "About
    you" to the footnote. Exact reversals in `scripts/validate-g0.py` (`CHECKOUT_REVERSALS`), baselines regenerated,
    recorded with the ported lines that are false in live mode in [protected-exception.md](protected-exception.md).
    `order-status.tsx`, `find-my-order.tsx` and `shop.tsx` are not touched by this slice.
  - **What a customer does:** name, Instagram, contact number, pickup date (the owner's pickup days inside the lead
    window, counted on the Manila clock, from `get_shop_order_rules()`), pickup time (half hours, or the campus slot),
    payment method and QR, an optional reference. No email, address, amount or screenshot. `place_order` is called under one
    client id per attempt; the form and box are locked while it is sending, unsettled or placed, so "Try again" always
    resends the identical frozen body; definite refusals (ZC001 to ZC006, 22023, 23505, 42501, 55000) are worded, anything
    else is an unknown outcome. The order number and the status link (`/status#t=…`, fragment only) show on success.
  - **Status page:** fed from `order_status(token)` through `cust.*` (no invoice, no "payment proof", no pickup code); a
    link opens it on a direct load or pasted into the tab. **Find my order** (number + phone) and the **waiting list**
    open as sheets from the shop footer, on customer screens only (gated on the screen, because an anonymous visitor's
    engine role is `'owner'`).
  - **Evidence:** `pnpm verify` 51 files / 898 tests; G0 validator 1211 checks, 0 failures; port integrity OK, 54 files;
    Python guards 63 OK; `pnpm build`, `test:pages:spike`, `test:workers:spike` pass; **`pnpm test:live:checkout`** (new,
    headless Chromium against the live static export and the local stack after `pnpm db:reset`): shop, order, database
    row, status link and reload, lookup, waiting list, no CSP violation, no foreign origin, token in no URL. 43
    deliberate mutations, each caught. Port audit (Sonnet) PASS; Opus review: no Critical, one High (the sent order
    could differ from the screen), fixed with the Mediums and most Lows. `pnpm test:e2e`: see the line under Baseline.
  - **Customer wording is placeholder.** Every new sentence is in `src/lib/orders/copy.ts` (marked PLACEHOLDER; the
    closed-drop sentence is the signed-off one). Cine still needs to word: not enough room (in slots), too many unpaid
    orders, pickup not available, payment method not offered, waiting-list limit, malformed order, order id reused,
    ordering unavailable, the lost-reply and "Change the order" lines, the pay-help line, the unpaid, lapsed, cancelled and
    ready lines on the status page, and the lookup and waiting-list lines.
  - **Cutover blockers found here (not built):**
    1. **The shop's open state must come from the server.** An anonymous customer's engine decides open or closed from the
       default schedule (Monday 9:00 to Thursday 21:00), not the owner's settings: outside it the shop shows "Orders are
       closed" with no add buttons even if the server would take the order, and inside it the banner can say open while
       `place_order` refuses (ZC001). The owner's "close now" (`shopOverride`) is not on the server either, so it stops
       nothing. Needs a public read of the ordering window and the override, and a migration that redefines `place_order`.
    2. The direct URL `/lookup` still shows the ported page (its copy promises email lookup); the shop footer opens the live
       sheet. A second guarded slot in `find-my-order.tsx` fixes it; **Ethan approved it on 2026-09-29, it lands in B3**.
    3. The ported status line "Book your Grab or Lalamove for that window. We send the exact address that morning." is
       protected and false for the campus slot.
  - **Also open:** the owner's form for the order rules (`get_order_rules`/`save_order_rules`) is B3; the two heaviest
    render-every-screen tests in `flavours.test.tsx` got an explicit 20 s timeout (they exceeded 5 s under load at HEAD too).
  - **Still not run:** the physical-phone test for the 20-Oct gate, WebKit OFFLINE-01.
