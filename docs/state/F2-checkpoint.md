# F2 / MP-26 technical checkpoint — 3 October 2026

**F2 remains incomplete; the local caption continuation is accepted.** Real-week acceptance
and physical-phone evidence remain pending. F3 is closed; next-goal stays F2. Reuse local
preparation `d34bff9`, [Cine's checklist](F2-owner-trial.md) and verified F1 evidence.
No repository audit or checklist rebuild was performed.

## Earlier checkpoint results (bdd83f6)

- F2-001: the trace/full E2E locate failure after the durable pending sale, at WebKit
  offline reload. Framework-free HTML/cache-first SW controls confirm a controller and
  exact cached routes: Chromium online/offline reload/navigation passes; WebKit online
  passes but offline emulation gives the same internal error. With the origin stopped,
  both return 200 from SW. This strongly isolates Playwright/WebKit offline emulation,
  corroborated by [upstream issue 42775](https://github.com/microsoft/playwright/issues/42775).
  No app/SW/queue/test source changed. Original OFFLINE-01 stays failing; this diagnosis
  does not prove actual Safari/PWA behavior or waive the pilot gate.
- F2-002: a **provisional local source patch** changes only the live caption to `Profit · `
  plus the existing rolling 30-day `pl.periodText`. Demo retains August; styles/layout/
  interactions unchanged. Type declaration, two cross-month/demo tests, exact protected
  reversals and one AST hash accompany it. Independent code/port review passes, but live
  visual QA remains pending. **This slice is not accepted/complete and stays uncommitted.**
  The patch is saved outside Git as `F2-provisional-caption.patch` and in the working tree.
- [Trial setup proposal](F2-trial-setup.md): dedicated isolated Supabase trial database and
  fresh Workers origin, architecture A. Prepared static config at
  `spikes/owner-trial/wrangler.jsonc` has no jobs/bindings/secrets. Begin with rehearsal;
  real-week order use needs approved customer/data/payment scope and shop access. There
  is no owner-side manual order-entry feature.
- Read-only preview inspection: Workers version `2697ca3e-0680-4448-afd5-3c8500ff3461`
  is from September 27; six current public RPC probes return `404/PGRST202`. Signup is
  now disabled, superseding the old observation. Privileged schema inventory and Cine
  access remain unverified; neither preview is established as a current trial target.

## Earlier verification and limits

Pinned Node 24.20.0 / pnpm 9.12.3; headless command-line Playwright only.
New external evidence directory:
`C:/Users/ethan/.codex/visualizations/2026/10/03/01a100c5-8e04-78f1-8839-a28fd619a44e/`.
The [receipt](evidence/F2-trial.json) retains earlier preparation evidence separately.

| Check                                          | Result                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Production build                               | PASS, exit 0; `F2-build.log`                                                                                                        |
| `pnpm.cmd verify`, including provisional patch | PASS, exit 0; 77 files / 1,464 tests, both typechecks/lint/54-file port/engine; `F2-verify.log`                                     |
| Caption regression file                        | PASS, 24 tests; September/October, October/November and unchanged demo literal                                                      |
| G0 reversals/original bytes                    | PASS, 1,219 checks / zero failures; external `F2-g0-validation.json`; generated historical churn restored                           |
| Full E2E                                       | FAIL, exit 1; 89 passed / 1 failed / 75 skipped; unchanged WebKit OFFLINE-01; `F2-e2e.log`, copied trace                            |
| Nine nonzero SQL role/RPC suites               | PASS, 684 assertions per fresh reset × 2; rollback/disposable cleanup; `F2-disposable-workflows.json`, `F2-workflow-bootstrap.json` |
| New demo visuals                               | Two phone 390×844 / desktop 1440×900 captures individually inspected; no overflow; `F2-caption-demo.json`                           |
| Fresh live transactions/CSV/caption visuals    | INCOMPLETE; wrapper failed read-only preflight before checkout or mutations                                                         |

Fresh SQL scenarios verify publication, shop window/override, payment/status transitions,
stock movements, production/packing/waste, expenses/books, replay/void/close-out and health
permissions. They do not prove every browser button or CSV download. F1's accepted
11-step checkout, broad SQL/recovery and earlier F2's 47 inspected captures remain historical
evidence. Windows pixel baselines were not regenerated; no physical device was tested.

## Earlier stop, review and publication

Initial caption verify found the already-produced period absent from `OpsVals`; the bounded
type correction passed verify. Initial date-format expectations were corrected to the
existing formatter. Ambient shared SQL attempts encountered fixture setup differences;
fresh disposable suites supply accepted proof. Shared transactions closed on error.

Luna's external live wrapper encountered an environment-variable/parser problem, then
failed to establish an exact local order-sequence snapshot. It stopped after two repair
attempts before checkout, owner creation or mutation. No further debugging in this run.
Its unaccepted external script is retained; review its preflight **and cleanup** before
execution. No fresh browser transaction/CSV success is claimed.

Independent coordination/review (Sol/high requested) and port-auditor code/reversal review
are in the receipt. Root runtime did not switch; actual delegated runtime model was not
independently verified. A brief peak of three active children during final read-only port
follow-up exceeded the two-worker ceiling; recorded in the receipt. The
implementation/port workers finished and no further delegation occurred.

Only accepted checkpoint/proposal/config documents are committed/pushed after secret scan
and verification hook. Caption source/type/tests/exception/AST/reversals remain local until
live visual acceptance. No merge, deployment, hosted writes/resources/jobs, import,
legal/accounting decision or automatic runner. F1 hosted schedules remain inactive.

## Resume gates

1. Local caption continuation is now accepted with the evidence below. Preserve its results;
   no audit or harness restart is needed. Hosted trial execution remains approval-gated.
2. Ethan approves the concrete hosted setup and exact real-trial data/customer/payment
   scope. Provision secure access and verify release/schema/roles/recovery before use.
   No hosted action is authorized by this checkpoint.
3. Cine records seven actual dates, feedback/acceptance and actual Safari/PWA phone rehearsal.
   By **20 October**, both OFFLINE-01 and phone rehearsal must pass for 24–25 October.
   Otherwise use today's selling/paper process and move the pilot to 12–13 December.
4. Only real-week acceptance can complete F2 and open F3. Paperwork, SQL, headless Chromium
   and AI review cannot satisfy that gate.

## Accepted local continuation from bdd83f6 — 3 October 2026

Private evidence: `C:/Users/ethan/.codex/visualizations/2026/10/03/01a101cc-ce31-7cd1-be5b-65218afaa853`. Fresh pinned verify passes 77 files /
1,464 tests; G0 continuity passes 1,219 checks / zero failures. The exact six
caption files are reused, with no arithmetic/style/interaction change.

The repaired external harness runs fresh customer checkout and owner UI payment,
packing (including stock use), collection and expense controls. Downloaded CSV
contains 2 rows (2 in the rolling period).
Exact period totals in centavos: net revenue 38900,
expenses 1234, profit 37666; CSV and RPC agree,
then both P&L displays agree with the existing whole-peso formatter.
Phone 390×844 and desktop 1440×900 P&L plus the books capture were individually
inspected; independent code/cleanup/financial/visual acceptance is recorded in
`F2-independent-acceptance.md`. No physical Safari evidence is inferred.
Final captures use reducedMotion=reduce and await/recheck the settled profit.
Attempt3 passed transactions but missed the phone caption; attempt4 sampled the
desktop counter mid-animation. Attempt5 passes both captures. An intervening
scratch-file encoding error occurred before execution; reconstructed cleanup was
independently reviewed. Earlier attempt receipts remain private evidence.

Cleanup PASS removes only exact synthetic orders/children, expense, packing
records/movements, audit/rate counters and owner access; touched configuration and
packaging quantities are restored. Twelve trigger-updated timestamps advance;
byte-identical baseline restoration is not claimed. Sequence advancement is retained
to avoid a shared-database rewind race. Earlier harness failures are setup history,
not product fixes. `F2-live-workflows.json` records actual execution and cleanup.

Full E2E89/1/75 and OFFLINE-01 diagnosis/test are reused unchanged. SQL684×2 and
verified F1 evidence are reused for their stated scope; this is targeted browser
acceptance, not an exhaustive new audit. No hosted write/resource/deploy/job, merge,
import or runner. F2 remains in progress and F3 closed pending Cine's real week.

Next: obtain Ethan's approval for the concrete isolated Supabase/Workers setup and
exact customer/data/payment scope in F2-trial-setup.md, establish access and target
verification/recovery, then record all seven actual dates and Cine's acceptance.
Both original OFFLINE-01 and actual-phone rehearsal must PASS by 20 October for
the 24–25 October pilot; otherwise use the current process and December fallback.

## Approved hosted preparation — 4 October 2026

Ethan approved free-plan closed-shop online tests, reuse of the empty existing
trial project and, separately, exactly three 029 output-name quotation corrections.
No third project, upgrade, pause or delete was performed. The old preview is untouched.
The first schema push applied 00000–02800 and stopped on PG17's 029 output-name
syntax. Readback confirmed absent json column, old signatures, enabled touch trigger
and no users/products/orders/settings; a whole-candidate transaction compiled and
rolled back. Independently reviewed resume applies all 52 versions on PG17.6.

94 application function contracts match body/grants/roles; only the three expected
PG17 quoted return-name renderings differ. The existing provider automatic-RLS event
trigger is recorded separately. All 37 public tables have RLS. New 051 removes the
reproduced MAINTAIN leak: zero effective browser grants across 39 public relations,
unchanged service access for 21 preexisting relations, anon/PUBLIC red grants detected,
future postgres-created table safe, transaction/probe cleanup PASS.

One active owner is provisioned with owner-only DPAPI temporary credentials; zero
emails sent. Six exact catalogue/allergen definitions remain unpublished; shop closed,
zero orders, no full seed, stock or payment accounts. Actual hosted owner/password,
refresh, profile, books and anonymous denial PASS. Headless local static Worker UI
connects to that hosted target: phone/desktop P&L and reload PASS; screenshots inspected.
These zero-data target checks are distinct from the accepted nonzero local CSV proof.
First smoke's cleanup oracle looked in localStorage; SSR-cookie correction passes,
earlier setup sessions are revoked, and browser cookies/context are removed.

Pinned verify77/1464 PASS; PG15 roles1922 × 2 and 684 regressions PASS with cleanup.
Build uses only target publishable configuration; actual privileged key bytes and
working payment QR bytes are absent. Fresh Worker version
`12ed8ba6-fb61-47ff-822a-6724f982d91a` is uploaded with no routes, canonical/preview
URLs disabled and both GETs404. OAuth Access403 requires the requested scoped
credential before a private URL can be enabled; no reachable-origin acceptance yet.

Private evidence stays in the continuation directory. Harness preflight/count/scan
and Auth admin-key setup failures are retained separately from product repairs.
Human credential handoff/change, Cine sign-in, real-data/payment/customer/shop-opening
scope, encrypted custody/target recovery, seven actual dates and physical-phone
evidence remain open. Planning device assumptions are not actual Safari proof.
F2 remains incomplete/F3 closed; original OFFLINE-01 is unchanged/failing. Both it
and actual-phone rehearsal must pass by 20 October. Jobs/imports/merge/runner stay off.

Final independent Sol review ACCEPT: authorized SQL/pins/continuity guard, provider
trigger classification, disabled Worker and readiness boundaries. Both final target
P&L screenshots and corrected UTF-8 caption record match. G0: 1221 checks/0 failures.
Initial secret scan PASS for all 14 hosted-preparation files: exact private credentials and owner
identity absent. Publication receipt stays outside Git to avoid self-referential hashes.

The first precommit run passed all 1464 assertions but failed on one unhandled live
reset notice after jsdom teardown. Two added regressions fail on the original code;
one lifecycle repair owns/cancels its 80 ms timer and passes all 74 focused tests.
Independent Sol ACCEPT preserves copy, delay, demo and offline queue. The complete
precommit retry/publication result is recorded externally. The disabled upload still
contains frontend 85f6bc6; rebuild the accepted cleanup before enabling its private URL.

## Scoped Access continuation — 4 October 2026

The user confirmed replacement after token disclosure; DPAPI file changed and token
verification returns200 active. No credential value is recorded. Exact approved-account
Access apps/org/IdPs return401/code10000, token-detail/account-list403/code9109. The
user reports both permission rows correct; direct HttpClient agrees, no whitespace
or malformed-token issue. Organization existence is unknown, not assumed absent.
No speculative Access write or public entry-point enabling occurred.

Independent eligible work completed: fresh exact privileged-key/QR scan, pinned dry
run and conditional Sol ACCEPT precede upload of accepted `be1e115` to the SAME
Worker. New version `3188360e-008e-4772-a3e8-fc3eff5fd5af`; fresh readback remains
false/false/routes[] and canonical/new-version URLs both404. Latest accepted full
precommit77/1466, build and actual-hosted-DB/local-browser phone/desktop proof PASS.
Zero Trust/account-resource inspection is requested to resolve the provider setup
blocker. Cine access/week/physical-phone evidence and F2/F3 boundaries stay open.

Independent review found verify warning10002: token is not usable until 4 October
00:00 UTC / 08:00 Manila despite active200. Fix Start Date (no new secret needed)
or wait until that UTC time, then recheck scoped Access APIs. The user separately
reports an initial Zero Trust setup screen; that is not the proven cause of401. No
Access, paid-plan or billing mutation occurred. Corrected before publication.

User subsequently completed Zero Trust onboarding and supplied its dashboard
screenshot, but past token Start Date is disallowed by UI. User requests pause and
continuation tomorrow (5 October). Keep the saved replacement token; it becomes
valid at08:00 Manila4October. No further Access writes or verification loop today.
Seven updated records remain uncommitted pending final review/scan/full hook.
Resume from external F2-access-pause-20261004.json and current working diff.

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
