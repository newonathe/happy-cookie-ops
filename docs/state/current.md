# Current state — Happy Cookie Ops

Read this at the start of a session. History: [current-history.md](current-history.md). Approved forward plan: [finish-plan.md](finish-plan.md). One executable package: [next-goal.md](next-goal.md).

## Where things stand — 2026-10-03

- **F2 technical work is checkpointed; readiness and real-week acceptance remain incomplete.** [Trial setup proposal](F2-trial-setup.md), [fix list](F2-fix-list.md), [checkpoint](F2-checkpoint.md) and [receipt](evidence/F2-trial.json) separate verified work from remaining browser/owner evidence. MP-26 stays in progress, next-goal stays F2 and F3 is closed.
- **F1 remains accepted locally, committed and pushed.** Encrypted database dumps and isolated recovery, fixed one-year retention, operational receipts, live health/alerts and the shop privacy notice are implemented; hosted jobs stay inactive.
- Product slices through **E1** are complete locally: menu/settings, checkout and owner orders, bazaars/offline close-out, stock/recipes/production, books/P&L and CSV. The detailed checkpoints remain in history.
- G0 is done; G1 passed locally and its synthetic hosted preview was published earlier. F1 made no hosted database change or deployment.
- Protected screens/sheets/shell/engine, applied migrations and port baselines are unchanged in F1. The privacy exception uses the existing live-only footer.

## Latest checkpoint — F2 technical renewal (2026-10-03)

- Fresh pinned `pnpm verify` passes: 77 files / 1,464 tests. The live rolling-period caption now has fresh nonzero UI/CSV and inspected phone/desktop evidence plus independent acceptance; publication authority is the continuation receipt and Git.
- Full E2E from bdd83f6 reused unchanged: **89 passed / 1 failed / 75 skipped**, exit 1; WebKit OFFLINE-01 fails at offline reload with an internal WebKit error. The suite is **not green**.
- Minimal cached/controlled SW reproduces WebKit's offline-emulation error; Chromium passes and both return 200 from SW when the origin is stopped. Strong evidence of a Playwright/WebKit emulation defect; original OFFLINE-01 stays unchanged/failing. No application/offline fix is justified.
- Live P&L caption patch uses the actual rolling period and retains demo styles/literal. Unit/port review and 1,219 G0 checks pass. Two new demo phone/desktop captures inspected; prior 47 captures reused. Fresh live phone/desktop P&L and books captures are inspected and accepted in the continuation.
- Nine nonzero SQL workflow suites pass twice on disposable databases: 684 assertions per run, rollback/cleanup pass. Continuation repairs the external harness preflight and exact cleanup. Fresh customer/owner UI workflows and CSV-to-RPC/P&L reconciliation pass; touched settings and packing stock restore, synthetic data is removed, and monotonic sequence advancement is retained. Earlier failed setup attempts remain in the receipt.
- Read-only preview probes show an older September 27 release and six missing current RPCs; signup is now disabled but Cine access is unverified. Dedicated Supabase + fresh Workers trial origin proposed; static config prepared locally. Hosted setup and real-trial data/customer/payment scope need approval.
- Independent coordinator review (Sol/high requested) and port reviews cover their stated scope; root model was not changed. The earlier checkpoint's three-child overlap is preserved in the receipt; this continuation used at most two workers. No hosted writes, jobs, deployment, merge or runner. F1 evidence and the checklist are reused.

## Previous accepted checkpoint — F1

- `pnpm verify`: **77 files / 1,462 tests**, exit 0; both typechecks and lint pass. Port integrity: 54 files. Engine contract: 49 exports / 21 setting keys / 38 documented engine tables.
- Final-schema recovery: **61 tables / 236 rows**, counts and deterministic hashes match; **55 FKs** match, validate and have zero orphans. Auth migration history is included. Atomic rollback and exact owned cleanup pass.
- SQL role suite: **1,922 cases/reset × 2**, matching matrices, **684 regressions detected**. Current SQL/authority/pin/type hashes match the proof. **20 unit mutations** detected, sources restored exactly.
- Python guards: **63 pass**. G0 continuity: **1,217 checks, zero failures**; unknown task IDs still rejected. Normal/live builds, Pages/Workers emulator checks and **11 live-checkout steps** pass.
- Headless Chromium visual QA: **11 screenshots inspected**, phone 390×844 and desktop 1440×900; missing/success/failed health, alert navigation at both widths and privacy. Synthetic success records test rendering only; cleanup passed.
- Full E2E remains **89 passed / 1 failed / 75 skipped**, exit 1: known WebKit **OFFLINE-01**. Its unchanged demo/offline evidence is reused; the suite is not called green. Physical-phone QA is still pending.
- Evidence: [acceptance](evidence/F1-acceptance.json), [restore](evidence/F1-backup-20261003.json), [SQL](evidence/F1-operations-sql.json), [checkpoint](F1-checkpoint.md), [operator guide](F1-operations.md). Each code commit's verification hook passed; credential-pattern scan passed before publication.

## Waiting on

- **Hosted operations:** no timer, keep-alive, retention job or backup-health write is activated. Ethan must approve the target, secret custody, off-device destination, archive expiry and failure delivery. Inactive schedule metadata is prepared; local recovery does not establish off-device protection.
- **F2:** Cine's actual real-week checklist and feedback on an explicitly approved target. Prepared checklists or synthetic tests do not complete that trial.
- **Existing carry-overs:** hosted signed-in/session probes need Ethan's test account; local Postgres 17 and reviewed `MAINTAIN` hardening remain separate. `format:check` and WebKit E2E on main are known red; no merge while required checks fail.
- **Bazaar pilot:** 24–25 October requires OFFLINE-01 and the physical-phone test to pass by **20 October**. Phone-sized Chromium is separate evidence.
- Cine's C1–C12 answers remain open; Ethan approved the finish-plan defaults on 2026-09-28. No automatic runner, production cutover, hosted resource or deployment is authorized by F1.
