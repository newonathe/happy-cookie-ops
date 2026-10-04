# Current state — Happy Cookie Ops

Read this at the start of a session. History: [current-history.md](current-history.md). Approved forward plan: [finish-plan.md](finish-plan.md). One executable package: [next-goal.md](next-goal.md).

## Where things stand — 2026-10-05 continuation

- **Second bounded formatting run accepted:** `d7e465d`, `3f1b2a1`, `efa89e3`,
  `0f07e87`, `b16d8fe`; each full pinned precommit81/1487 PASS. Thirteen config
  files retain exact parsed values or structural hashes; fourteen JSON reports retain
  exact values/literal tokens. Playwright's240 selected tests have identical before/
  after listings. Fresh local formatting FAIL609 (down27 from636); no check suppressed.
  Protected source/app flows/original OFFLINE-01 unchanged. Private token remains
  unsaved, protected proposal awaits approval and Cine's device/week/count/custody
  evidence remains pending. No imports, hosted mutations or deployment in this run.

- **CI formatting continuation:** first unprotected slice `d637217` passes full
  pinned verify/precommit (81 files / 1,487 tests), secret scan and targeted
  formatter checks. No app, protected source or OFFLINE-01 edit. Full formatting
  remains red; deployment token file and GitHub deployment secret are absent.
  [Specific first protected proposal](F2-format-exception-proposal.md) awaits
  approval. [Count/custody/device preparation](F2-count-custody-device-preparation.md)
  reuses owner controls and the seven-day log. No new imports or hosted mutations.
  Final local formatting remains FAIL636 files. First-slice GitHub run37223588999
  fails638/skips release. Second accepted slice formats flavour/stocktake tests;
  all four changed tests retain their5101724 structural fingerprints. Recipe-draft
  formatting is held after the worker found a fingerprint change; original retained.

- **Historical financial data applied, dummy workbook excluded:** 722 real sales
  and82 stock-purchase costs (804 lines) read back exactly. Blank dates inherit the
  preceding explicit date and repeated lines count as separate sales by Ethan's
  explicit instruction. No stock count/stock-out or operating expenses invented.
  [Current import, P&L and CI evidence](F2-real-data.md#historical-financial-import-and-cicd---5-october-continuation).
- **Human login confirmed:** Ethan reports alternate-mailbox code and existing
  owner app sign-in worked. Admin OTP delivery remains intermittent; Cine sign-in
  and real-week acceptance remain separate.
- **P&L correction published:** frontendc30e3bd/private version772d4a7e; current
  gate/anonymous denial, routes0 and disabled-preview404 PASS. Manual approved
  private update; automatic CI release remains blocked.
- **Private CI/CD approved and prepared:** exact existing-target release guard and
  trusted-branch workflow committed; full gates retained. Current formatting gate
  fails640 files in fresh run37222065820; local inventory identified54 protected paths. Dedicated Workers deployment token
  is not configured; original OFFLINE-01 remains failing. No green CI claim.

- **Editable recipe originals delivered:** [draft editor/evidence](F2-recipe-drafts.md).
  All seven source recipes and batch sizes editable through All tools -> Recipe drafts.
  Existing menu/prices/stocktake controls remain available. Code72d7d17 pushed/private
  versionb29a55bc;53 migrations/38 RLS tables, verify79/1474 and role1945x2 PASS.
  Phone/desktop save/reload/revert and exact cleanup/Access denial PASS. Six measured
  production/cost mappings, opening stock and real-device/week gates remain open.
  Older52/78/1471 and catalogue-only notes below are historical checkpoints.

- **Real catalogue preparation applied:** [owner controls/data evidence](F2-real-data.md).
  72 stock definitions,13 suppliers,eight compatible quotes,26 library products,
  seven confirmed October prices and one exact Apple Pie recipe. All unpublished;
  shop closed; no physical counts imported. Historical financial subset is now applied. Six recipe
  conversions, cost/supplier links and allergens remain open. Older six-draft/no-import
  descriptions below are historical checkpoints. Accepted code73e556e is pushed and
  published on the existing private trial as version4ecc095c; fresh Access/anonymous
  app-assets denial and disabled-preview checks PASS.

- **Approved closed-shop hosted preparation is implemented.** Ethan approved free-plan setup and reuse of the empty existing trial project. All 52 migrations apply on PG17.6; the explicitly approved three-place 029 compatibility fix and new 051 maintenance hardening pass. Automated owner sign-in/refresh, active role and anonymous financial denial pass. The real catalogue above supersedes the initial six drafts; no orders, fake stock or payment accounts were imported.
- **Private trial link works behind owner-only email-code access:** https://happy-cookie-owner-trial.admin-kethai.workers.dev. Fresh configuration, independently accepted activation, phone/desktop login visuals, anonymous app/real-asset denial and disabled-preview404 checks PASS. Frontend73e556e/version4ecc095c, no routes; prior user-confirmed owner mailbox/dashboard sign-in and secure password handoff PASS. Shop remains closed; current recipe/cost completion, real-week, actual-phone and custody decisions remain pending.
- Latest accepted `pnpm verify` and full precommit: **78 files / 1,471 tests PASS**. PG15 SQL role suite reused: **1,922 cases/reset × 2**, 684 regressions detected, rollback/cleanup PASS. Hosted PG17: 94 app function contracts match apart from three expected quoted return-name renderings; all 37 public tables have RLS; browser MAINTAIN is zero across 39 public relations and service authority is preserved. The existing provider RLS event trigger is retained separately. Hosted-target local-browser P&L and current catalogue/stocktake phone/desktop captures are inspected; actual-device acceptance remains separate.

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
- **Existing carry-overs:** target owner/refresh and PG17 maintenance checks pass; private-origin, human/device and broader session scenarios remain open. `format:check` and WebKit E2E on main are known red; no merge while required checks fail.
- **Bazaar pilot:** 24–25 October requires OFFLINE-01 and the physical-phone test to pass by **20 October**. Phone-sized Chromium is separate evidence.
- Cine's C1–C12 answers remain open; Ethan approved the finish-plan defaults on 2026-09-28. No automatic runner, production cutover, hosted resource or deployment is authorized by F1.

Independent review found verify warning10002: token is not usable until 4 October
00:00 UTC / 08:00 Manila despite active200. Fix Start Date (no new secret needed)
or wait until that UTC time, then recheck scoped Access APIs. The user separately
reports an initial Zero Trust setup screen; that is not the proven cause of401. No
Access, paid-plan or billing mutation occurred. Corrected before publication.

## Latest continuation — 4 October, resumed at user request

The scheduled current-chat follow-up was deleted; no automatic product runner is active.
The saved replacement token is now usable: token, scoped Access applications, organization
and identity-provider GETs all return200. The initial future-token warning10002/401
diagnosis is historical and preserved, not a current credential blocker.

An independently reviewed exact-hostname private gate is created: one approved owner
email, one-time PIN only, one reusable Allow policy, eight-hour sessions; no wildcard,
bypass or service-token access. Fresh application/policy/IdP GETs match. The owner
identity and temporary password remain outside Git; a clipboard handoff helper is prepared
privately but has not run. No authentication email was sent.

The Worker remains disabled, including preview URLs: pre-enable browser login did not
reach an email field (initial direct redirect400; relative redirect ends404). A local
null-array check was corrected without duplicate resource creation; installed Playwright
import was corrected. These are verification-harness setup failures, not app repairs.
No Enable stage ran; explicit disabled readback passes after the failed preflight.
Activation, live anonymous/static/owner-route proof and Cine sign-in remain unverified.
No further login repair is attempted in this checkpoint. Reuse accepted be1e115,
caption85f6bc6, uploaded3188360e and all existing local financial/visual evidence.

Next goal: resolve the private-login preflight from its retained HTTP redirect evidence,
obtain independent activation acceptance, then verify the private origin and hand over
owner credentials securely. Real-week/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete, F3 closed; actual-phone rehearsal and the
unchanged failing OFFLINE-01 both must pass by20October. Jobs/imports/merge remain off.

Latest activation details and pending human proof: [checkpoint](F2-checkpoint.md).

User-confirmed owner sign-in and current clipboard cleanup PASS; read-only shopclosed, orders0/published0 checks PASS. Physical-device and real-week gates remain open.
