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
- **Screen by screen:** orders, payments, bake/dough, inventory, grocery, suppliers, recipes, bazaar, P&L and the
  waitlist still live only in the browser, so they are empty in live mode. **The owner can now edit, add and
  publish flavours**; every other screen is still A2 onward.
- **Cine's inputs arrived 2026-09-28** and were analysed in [finish-plan.md](finish-plan.md) sections 2 and 4 and
  [apps-script-audit.md](apps-script-audit.md): the workbook, the September form, the payment image, the October
  menu, recipes and packaging, and the Apps Script. The files stay outside the repo; `Appscript/` is git-ignored.
- **Baseline (2026-09-28, at A1/MP-09 c1c close):**
  - `pnpm typecheck`: clean; `pnpm exec vitest run`: 44 files / 688 tests;
  - SQL role suite: unchanged (570 cases per reset × 2 — no migration this slice);
  - Python guards: unchanged (63 OK — not re-run this slice, no Python-relevant change);
  - port integrity: OK, 54 files; G0 validator: 1201 checks, 0 failures;
  - `pnpm test:e2e`: unchanged (87 passed / 3 failed OFFLINE-01 / 30 skipped — not re-run this slice);
  - migrations: 32 (unchanged — no SQL this slice).
- **Known red:** OFFLINE-01 ×3; `format:check` and E2E on CI `main`. No merge to `main` until they are green.

## Waiting on

- **Cine:** her answers to C1–C12 ([finish-plan.md](finish-plan.md) section 11). The build uses each default until
  she answers. Ethan approved F1–F10 on 2026-09-28.
- **Pilot gate:** Bazaar Mode for 24–25 Oct only if OFFLINE-01 and the offline test on her phone pass by 20 Oct.
- **Hosted updates:** Ethan runs `supabase login` before the next hosted update.

## Latest checkpoint (replace each slice; move the old one to current-history.md)

- **2026-09-28 (MP-09 c1c, F3, slice A1 — the flavour editor and "Publish menu"):**
  - The owner can now add, edit and publish flavours in live mode: name, short name, description, photo path,
    allergens, badge, Permanent/Rotating, cookie/set, capacity weight, sort order and price, saved whole through
    `FlavourSync.saveWhole`/`save_flavour`. A new flavour is a draft (unpublished) until the next publish, with
    an id slugged from its name. "Publish menu" calls `FlavourSync.publish()` and says how many flavours
    customers will now see. Entry points: "Menu & flavours" in `toolGroups` (Business group) and the products
    screen's "Edit price", both owner-only in live mode; every other role still gets the ported edit-price
    sheet. No SQL migration: `save_flavour`/`publish_flavours` already covered every field.
  - **F3 applied for the first time:** one live-only form host, reached through the engine's own unrecognised
    `sheet('flavours', …)` kind (already rendered as empty before this slice — confirmed by reading the engine,
    not assumed). `app-frame.tsx` (protected) gained exactly one import and one `bareFrame`-guarded render line;
    inserted by script, not the Edit tool, so it was never reformatted. Exact record: `protected-exception.md`
    "MP-09 c1c"; exact reversals: `scripts/validate-g0.py`; `port-baseline.json`/`port-structure-baseline.json`
    regenerated in the same commit.
  - **Independent review (Opus) first BLOCKED**, on one P0 (an unloaded flavour cache let "Publish menu"
    unpublish every real flavour, or a new-flavour save shrink the engine's whole list to one row) and two P1s
    (a form left open across a concurrent quick edit could silently revert it, since its own fields are
    uncontrolled; a cleared price field saved as ₱0). All three fixed, regression-tested and re-verified: **SAFE
    TO MERGE.** One P2 (a same-flavour quick edit mid-whole-form-save is dropped, not resent) accepted, not
    fixed — narrow, no worse than pre-c1c behaviour for that overlap. Independent port audit (Opus): PASS on
    every point; also caught and fixed a formatter's CRLF→LF rewrite of `vals.ts` (content-only diff restored)
    and reverted evidence-file churn left by its own validator run.
  - Evidence: `pnpm typecheck` clean; 688 tests / 44 files (17 new, each locally mutation-checked); port
    integrity OK; G0 validator 1201 checks / 0 failures (evidence churn reverted). No SQL role suite run (no
    migration). No deploy.
  - Next goal: D1 (bazaar sales, offline on one phone), then D2, gated on the OFFLINE-01/phone test by 20 Oct.
