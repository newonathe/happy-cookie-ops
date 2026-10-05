# F2 fix list — updated 2026-10-04

## OFFLINE-01 on Linux — 5 October

- F2-001 update: OFFLINE-01 was run alone in the CI Playwright 1.63.0 Linux image. WebKit failed 3 of 3
  (two at the offline reload with the known internal error, one timeout at the Cash button); phone
  Chromium passed 3 of 3. Upstream issue 42775 is open and labelled v1.64. The failure is therefore not
  Windows-specific and will fail the CI browser job. Test, app, service worker and queue unchanged; the
  pilot gate is not waived. Receipt: [F2-offline01-linux-probe.json](evidence/F2-offline01-linux-probe.json).
- F2-011, CI configuration defect, fixed in `655c95c`: test-time Supabase variables in the browser,
  visual and release-verification steps made the middleware redirect every staff route to sign-in.
  Reproduced in the CI Linux image (12 browser tests passed with them; 89 passed / 1 failed / 75
  skipped without). Not an app defect; no test or gate removed. GitHub confirmation is pending
  because CI still stops at `format:check`.
- Setup note, not a product defect: the private `configure-cloudflare-deploy.ps1` helper omits
  `TRIAL_ACCESS_EMAIL_SHA256`, so its preflight fails even with a valid token. The token was validated
  and the GitHub secret set with a separate private script that supplies it.

## Real catalogue findings — 4 October

- F2-009: missing/partial recipe prices displayed as zero/final costs and uncounted
  stock used creation time as count age. Runtime pending labels and matched-price
  guard independently accepted; regression includes genuine zero quotes, mismatched
  packs, null/verified counts and unmatched rows. No cost/math/schema change.
- F2-010: direct stocktake did not initiate a count after real catalogue loading;
  same-role profile rechecks cleared entered counts. Wait/start-once route and
  unchanged-role guard fix this; actual role changes still enforced. Focused tests PASS.
- A local Products header regression used the wrong state field; headless verification
  caught it before publication. Corrected to dropActive and covered by a real Products
  screen total/toggle regression. Setup versus product failures retained separately.
- Accepted data scope and still-required recipe weights/yields, complete cost links,
  allergens and physical count: [F2-real-data.md](F2-real-data.md). F2 incomplete/F3 closed.

## Hosted preparation findings — 4 October

- **F2-004, hosted compatibility blocker, resolved:** PG17 rejected the unquoted
  `json_value` output name at migration 029; 29 earlier migrations applied. Ethan
  explicitly approved three output-name quotation changes after independent review
  and a rolled-back PG17 compile test. Resume applies all 52 migrations; function
  bodies/grants/output names remain unchanged, with exact original-byte reversal guard.
- **F2-005, hosted security blocker, resolved:** PG17 provider defaults left effective
  browser MAINTAIN on 18 older public tables. New 051 removes it. Postapply zero across
  39 relations, existing service parity, anon/PUBLIC red-grant detection and future-table
  default probes pass. Probe transactions roll back with no owned table remaining.
- **Hosting access blocker remains:** OAuth Access requests return 403. A scoped
  credential is requested; the new Worker has no routes and both URL types return 404.
  Auth setup's new-secret-key admin probe returned 401; the documented server-only
  legacy admin JWT probe and provisioning pass. These are setup issues, not app defects.
  No Cine feedback or real-week acceptance is inferred from these resolutions.

Factual issue ledger only. Add an app defect from reproducible evidence or explicit Cine feedback; missing access, target approval, participation, or proof is a trial blocker, not an app defect. Keep PII, raw feedback, screenshots and CSVs outside Git. Existing WebKit OFFLINE-01 was reproduced on 2026-10-03: full E2E is 89 passed / 1 failed / 75 skipped, exit 1. OFFLINE-01 remains failing; the caption slice is accepted locally with fresh live phone/desktop and financial proof; F2 remains incomplete pending real-week acceptance.

## Open items and template

| ID/date             | Severity                            | Reproduction; expected → observed                                                                                                                                                                                                                         | Cine feedback         | Owner/status                               | Resolution + regression proof                                                                                                                                                                                                                                       | Independent review                                                                                     |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F2-001 / 2026-10-03 | Oct offline pilot blocker           | Original full E2E unchanged: WebKit internal error at offline reload after durable sale; Chromium phone/desktop pass. Minimal controlled/cached SW reproduces error under WebKit offline emulation; both browsers return 200 from SW with origin stopped. | Pending; no Cine run  | Root / diagnosed, original test still FAIL | Strong evidence of Playwright/WebKit emulation defect; no app, SW, queue or test change justified. Fresh full E2E 89/1/75, exit 1; external F2-sw-isolation.json and [upstream issue](https://github.com/microsoft/playwright/issues/42775). Pilot gate not waived. | Independent coordinator review (Sol/high requested) agrees diagnosis scope; actual-phone proof pending |
| F2-002 / 2026-10-03 | Medium: misleading financial period | Live caption said August while totals used rolling 30 days.                                                                                                                                                                                               | Pending Cine feedback | Root / accepted locally                    | Existing pl.periodText drives live caption; demo/styles/math retained. Verify77/1464, G01219/0, fresh nonzero CSV/RPC reconciliation and live phone/desktop captures PASS.                                                                                          | Independent final code/port/cleanup/financial/visual PASS; external acceptance receipt                 |
| Template / ______   | ______                              | ______                                                                                                                                                                                                                                                    | ______                | ______                                     | ______                                                                                                                                                                                                                                                              | ______                                                                                                 |

Severity: Blocker = data loss or prevents an approved real operation; High = core workflow materially wrong; Medium = workaround impairs the trial; Low = minor. Cite reproduction or Cine feedback.

## Trial blockers, not product defects

| Blocker                                 | Evidence/status                                                                                                                     | Required input                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Approved suitable real-data destination | Dedicated isolated Supabase + fresh Workers trial origin selected; current preview September27 release and six current RPCs missing | Ethan approves hosted setup and exact real-trial data/customer/payment scope; see [proposal](F2-trial-setup.md) |
| Cine account and role                   | Not evidenced here                                                                                                                  | Confirm Cine can sign in with the intended role                                                                 |
| Cine's seven-day participation/feedback | No completed real-week log yet                                                                                                      | Agree dates; record all seven dates, including no-sale days                                                     |
| Actual phone rehearsal for October gate | No actual-device evidence supplied                                                                                                  | Complete and record before 20 Oct 2026                                                                          |

For each fix, record date, repeatable steps, expected/observed behavior, severity, Cine feedback (with consent), owner, change reference, resolution proof, regression evidence, and independent review when required. Keep synthetic/headless, owner real-data, and physical-device evidence distinct. Do not close OFFLINE-01 or a trial blocker based on a checklist or synthetic result alone.

## Earlier F2-003 verification checkpoint (bdd83f6), not an app defect

Fresh live browser transaction/CSV and live-caption visual proof is incomplete. The external
Luna wrapper failed local read-only sequence snapshot preflight after two repair attempts;
no checkout, owner creation or database mutation occurred. Debugging stopped at the goal
boundary. Review the retained external script and its cleanup before any new execution.
Selected nonzero SQL scenarios pass on two disposable resets (684 assertions each), but
SQL proof and historical F1 checkout do not close this browser evidence gap.

Continuation from bdd83f6 resolves F2-003 locally: 11 fresh customer browser steps plus owner UI payment, packing/stock, collection and expense; CSV/RPC exact-cent and rounded P&L comparison pass. Final attempt5 captures pass with reducedMotion=reduce and the settled counter awaited/rechecked. Exact synthetic residuals are zero, business configuration/stock restored. Twelve update-trigger timestamps and monotonic sequence advancement are retained explicitly; original timestamp equality is not claimed. Earlier attempt1–4 receipts and pre-execution scratch-file recovery are preserved privately. No product/offline source repair. Original OFFLINE-01 remains FAIL and actual-phone/real-week evidence is pending.

F2-006: final precommit exposed a pending live-reset toast after unmount (all1464
assertions passed, one unhandled error). Two RED regressions -> one timer-ownership
repair -> PASS74 focused tests; independent ACCEPT. Original OFFLINE-01 untouched.

F2-007 (setup blocker): replaced scoped Cloudflare token verifies200 active, but
exact-account Access apps/org/IdPs return401/code10000. User reports permission rows
correct; direct HttpClient and valid unpadded format agree. Account-resource/Zero
Trust onboarding inspection pending; no absent-org or product-defect inference.
Latest accepted app version is uploaded disabled (3188360e), both URL probes404.

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

## Private-link activation — 4 October

Current private link: https://happy-cookie-owner-trial.admin-kethai.workers.dev

Captured redirects explain the earlier preflight: Access302 returns the exact
canonical root, which was deliberately disabled404. One evidence-led harness repair
asserts disabled-origin denial before activation; it does not pretend a login form
was verified while the origin was off. Fresh gate/policy/OTP GETs and the exact
Worker version3188360e, disabled/previews-false/routes[] checks precede independently
accepted controlled activation. No duplicate resource or new deployment was created.

Post-enable PASS: inspected email-code login at phone390x844/desktop1440x900;
anonymous login, P&L, real emitted JS and SW requests302 to Access; version preview404.
Fresh state: canonical enabled, previews disabled, zero routes, accepted frontendbe1e115.
The rollback wrapper disables both entry points on any API/probe failure; none occurred.
Static config remains disabled-by-default for future uploads. No business/shop-opening
change, import, payment, job, merge or automatic runner occurred.

Private owner-password clipboard instructions were supplied; owner mailbox/Access/app
sign-in is awaiting a human reply. No password, email identity or code is in Git.
No signed-in private-origin acceptance is claimed yet. Existing local financial/visual
proof is reused unchanged. Next: complete owner sign-in/secure password custody, then
separate real-trial scope/recovery decisions, actual seven dates and phone rehearsal.
F2 incomplete/F3 closed; unchanged OFFLINE-01 and physical-phone both PASS by20October
remain required for the October pilot.

## Human owner sign-in confirmed — 4 October

The user replied “signed in” to the explicit mailbox/Access/app owner-dashboard
question after secure password handoff. A short helper resolved a displayed path
that had lost its separator; the password/code was never printed or committed.
Current clipboard password absence is verified. Fresh read-only target checks show
shop overrideclosed, zero orders and zero published products. Human dashboard access
is confirmed; this does not establish Cine actual-week use or physical Safari readiness.

The private-link/access-and-owner-login goal is fulfilled, subject to final record
review, secret scan and full verification/publication. Next: agree Cine password
custody/change, permitted real-trial records/customers/payments/shop opening and
encrypted off-device custody/recovery before real records; record seven actual dates,
feedback and actual-phone rehearsal. F2 remains incomplete/F3 closed; unchanged
OFFLINE-01 and physical-phone dualPASS by20October still govern the October pilot.

## Editable source recipes - 4 October continuation

2026-10-04: saved editable source recipe drafts delivered. All seven October originals retain teaspoons/pinches/components/optional notes; batch14 is editable, six provisional and Apple verified. New052 owner-only table/two RPCs applied to existing private trial;53 migrations/38 RLS tables/browser MAINTAIN0. Verify/full precommit79/1474; role1945x2/684 regressions/cleanupPASS. Independent backend/source-plan ACCEPT and root frontend review; four headless phone/desktop captures inspected, live save/reload/revertPASS and exact production/stock/ledger cleanupPASS. Code61d3e8e/72d7d17 pushed; private versionb29a55bc. Fresh owner gate/anonymous app-assets denial/preview404PASS. F2 incomplete/F3 closed; actual-phone/OFFLINE-01 dualPASS by20October remains.

See [F2-recipe-drafts.md](F2-recipe-drafts.md). Original text and batch sizes are
available for editing now; missing measured quantities concern production/costing.

## Login-code delivery - 4 October

Owner reports the approved admin mailbox received a code at14:38 Manila but none
on subsequent requests, including Spam/Trash search. Correct email/OTP/Allow rule
verified unchanged. Code-entry page is not delivery proof; provider suppression or
mail delivery failure is unconfirmed. Scoped Access audit-log GET403 blocks inspection.
Ethan explicitly approved adding a second exact personal mailbox. The independently
accepted plan was applied only to the existing sole reusable Allow policy, preserving
the admin mailbox, OTP and8h. Fresh policy/app/IdP GETs match exactly two emails;
no wildcard/bypass/new provider/project/account/password/deployment change. Private
guard now reads the exact approval receipt; original single-mailbox helper preserved.
Fresh headless anonymous app/realJS/SW denial and disabled preview404 PASS. App login
still uses the existing owner account/password; no agent-triggered OTP email sent.
New mailbox receipt/sign-in and restoring admin-mail delivery remain human evidence,
not claims from API readback. F2 incomplete/F3 closed; preserve all real-week/device gates.
Private receipts: F2-otp-personal-mailbox-{plan,acceptance,Apply}.json,
F2-otp-personal-anonymous-check.json and F2-otp-delivery-diagnostic.json. Plan hash
3cc7f8968ec2221ebe9e70d42d99a903666eb49cc95059e8bbb5009e55365a77.

## Historical trial continuation - 5 October

Real workbook only; entire DUMMY workbook excluded.804 financial lines applied
(722sales/82stock purchases), independent acceptance and exact rollback/readback PASS.
Ethan approved date carry-forward and genuine repeats;28missing-amount rows and8
incomplete purchases held. No actual operating-expense source or dated opening count
exists per Ethan; operational stock and orders remain unchanged, shop closed.
P&L live-only historical revenue repairc30e3bd has independent money/port acceptance,
actual804-row UI CSV/source/RPC reconciliation and inspected phone/desktop captures.
Current partial books do not establish complete profit or physical-device readiness.
Private manual update772d4a7e passes exact Access/anonymous denial/routes0/preview404.
Six code/record slices pushed through5f74690; local full verify81files/1487tests PASS.
Fresh GitHub run37222065820 failsformat:check (640 files); later jobs/deployment
skipped. Dedicated Workers CI token remains missing; original OFFLINE-01 is unchanged.
[Full evidence/next actions](F2-real-data.md#historical-financial-import-and-cicd---5-october-continuation).
Next goal in next-goal.md: finish CI/source protection, historical stock/recipe links,
actual opening count/custody and Cine's real week/device evidence. F2 incomplete,
F3 closed; actual-phone and OFFLINE-01 both PASS by20October still required.
