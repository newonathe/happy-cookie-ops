# Current state — Happy Cookie Ops

Short status, read at the start of every session. Keep it to one screen.

- Every earlier checkpoint, verbatim: [current-history.md](current-history.md).
- Forward plan: [finish-plan.md](finish-plan.md).
- The one executable goal: [next-goal.md](next-goal.md).

## Where things stand (2026-09-28)

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
  - MP-09 c1b (commit `f2d5d2f`): prices save, `publish_flavours`, and the live shop shows only the published menu.
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, bazaar, P&L and the
  waitlist still live only in the browser, so they are empty in live mode. **There is no publish button yet**, so
  the live shop shows no flavours.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-28):**
  - `pnpm verify`: 43 files / 671 tests;
  - SQL role suite: 570 cases per reset × 2;
  - Python guards: 63 OK;
  - G0 validator: 1198 checks, 0 failures;
  - `pnpm test:e2e`: 87 passed / 3 failed (OFFLINE-01, fixed by bazaar slice D1) / 30 skipped;
  - migrations: 32.
- **Known red:** OFFLINE-01 ×3; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Ethan:** decisions F1–F9 and Cine's questions C1–C12 ([finish-plan.md](finish-plan.md) section 11).
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-28:** audited Cine's whole current system against the app.
  - Sources: the workbook (17 tabs), the form, the payment image, the Apps Script, the client guide, and 115
    walkthrough comments.
  - Wrote [finish-plan.md](finish-plan.md): 16 slices to launch, the cut list, how we build, and the decisions.
  - Moved the old status history to [current-history.md](current-history.md).
  - No code change. Next goal: A1 (the flavour editor and publish button), pending F1/F3.
