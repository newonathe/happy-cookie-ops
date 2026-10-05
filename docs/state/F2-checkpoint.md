# F2 / MP-26 technical checkpoint — 3 October 2026

## Claude continuation — 5 October 2026 (latest)

Summary and open items: [current.md](current.md), top section. Detail kept here.

**Handover.** Codex's last commit `497c6b7` had passed its hook but was unpushed; it was
pushed first. Three accepted Codex slices after `f88583f` (`186c76c`, `16abdb5`,
`497c6b7`) were not yet in these records. Fresh count at `497c6b7`: 536 failing files.

**Why slices alone could not finish.** Of the 536, 121 sat in byte-locked delivery paths
that `scripts/validate-g0.py` holds to delivered bytes, and 278 were evidence receipts,
index files and script-maintained fixtures (about 489,000 changed lines if reformatted).
Ethan approved excluding both groups from Prettier; `c8a2805` and `90f3a7d`.

**Method for the 135 formatted files.** Slices of at most 400 changed lines; eight single
files larger than that were committed alone (the largest are `src/view-models/vals.ts`
at 3,305 lines and `src/store/ops-runtime.tsx` at 919). Per file, before commit:
TypeScript syntax-tree fingerprint (same shape as `scripts/port-structure.mjs`),
comment list and esbuild minified output for code; value and literal-token equality for
JSON; Prettier's Markdown tree for documents; then `prettier --check`,
`git diff --check`, the existing private secret scan and the pre-commit `pnpm verify`.

**Relaxations that were needed, all benign and named in the commit bodies.**

- Redundant parentheses, quoted-versus-bare property names and regex flag order
  (`/x/gmi` → `/x/gim`) in 21 code files; compiled output identical.
- `ops-runtime.tsx` needed two Prettier passes; Prettier is not idempotent on it.
- Five Markdown files: YAML front-matter quote style (three command skills), layout of
  fenced code in `docs/CONTRACTS.md`, and double spaces collapsed in
  `owner-decision-packet.md`.
- `src/app/globals.css`: hex colours lowercased and `.5` written `0.5`; identical after
  normalising those and whitespace.
- `tests/types/database-contracts.ts`: formatting moved a statement away from its
  `@ts-expect-error` and the hook failed. One `// prettier-ignore` and an explanatory
  comment were added; this is the only non-formatting line change in the run.
- `docs/ENVIRONMENTS.md` trips the secret scan's connection-string pattern. The match is
  the Supabase CLI's published local default on `127.0.0.1:54322`, unchanged; no private
  credential or owner identity is present. Committed alone with that note (`9a02e62`).

**Restore.** `7e1c669` returns 52 receipts to their `5101724` bytes. `F2-trial.json` was
not restored because it carries real checkpoint updates. `G1-evidence-index.json` lists
939 files; 855 match their recorded SHA-256. The 84 that differ are 5 receipts and 79
living source and document files that have changed since G1, including files formatted
in this run. No gate reads that index.

**Deployment token and OFFLINE-01.** See current.md. Probe: image
`happy-cookie-offline-probe:497c6b7` built from `Dockerfile.visual`, Docker 29.8 on
WSL2, Node 24.20.0, Playwright 1.63.0, `bazaar-offline.spec.ts`, projects `webkit` and
`phone`, `--repeat-each=3`, no retries. Two WebKit runs failed at the offline
`page.reload()` with the known internal error; one timed out earlier at the Cash button.

**No new visual or device evidence.** No visible flow changed. Private logs, the
verifier, the slice driver and the two protected candidates are under
`claude-20261005/` in the existing private evidence directory.

## Later bounded formatting continuation — 5 October 2026

Additional accepted/pushed: 9fb139c (six guides,220 raw lines), 199f9c6 (six JSON
reports,350), f88583f (return-path test,55). Each pinned full precommit81/1487,
targeted formatter/diff checks, secret scan and root independent AST/value review
PASS. Root's source-review helper had one Windows ESM path setup failure, corrected
with a file URL; no product repair or assertion change. Fresh full format FAIL556
(F2-format-token-question-checkpoint.log), down53 cumulatively from609.
No new visual/device evidence; no visible app flow changed. Original OFFLINE-01,
protected source,804 imports and release gates unchanged. Fresh GitHub run37228743055
at f88583f independently fails556 formatting files; all downstream jobs including
private release are skipped. Private log: F2-github-format-37228743055.log.
Token absent. Cloudflare official docs verified; separate deployment-token creation
and hidden DPAPI save instructions supplied. All actual F2 acceptance gaps remain.
Private proofs: F2-state-md-preview-qMsvX0, json-large-lines-9fb139c-f2batch1,
F2-format-return-path-proof (2026/10/05), F2-json-independent-9fb139c.json, root
Markdown/source review helpers and three commit logs. Do not reuse the JSON helper's
fixed proof folder: choose a new unique folder for every later batch.
Next: continue small unprotected formatting runs; configure token securely when
saved; prepare any additional protected exceptions specifically before edits.

## Successive bounded formatting runs — 5 October 2026

Authorization: Ethan's human reply, "Continue additional bounded formatting runs."
Resume: 754ef09. Accepted/pushed slices:

- 96c8794: 13 evidence reports, 350 changed lines.
- dc24c9d: five evidence reports, 350 changed lines.
- aeb4301: nine historical prompt documents, 72 changed lines.
- f9938c2: six evidence reports, 349 changed lines.
- 4694e69: two prompts and five historical plans, 288 changed lines.

Each targeted formatter, secret scan and full pinned precommit passed (81 files /
1,487 tests). Exact JSON tokens and parsed values match; Markdown nodes, hierarchy,
text, links and code match, omitting only source positions and loose-list spacing.
Fresh full format check: FAIL569, down40 from609. No failing check weakened.
Private proof folders: json-small-754ef09, json-small-96c8794, json-small-aeb4301,
F2-prompts-preview-KVgMCZ, F2-prompts-mp-preview-GyHLyX; root review helpers and
F2-format-successive-batch.log. Existing visual evidence reused; no new device proof.
Protected files, original OFFLINE-01 and all804 imported records are unchanged.
Deployment token save and its GitHub secret remain absent; instructions supplied.
Cine's actual opening/custody/week/devices and six measured mappings remain open.
F2 incomplete/F3 closed. Continue further bounded unprotected formatting runs;
apply no protected source change without its specific approval.

## Second bounded CI formatting run — 5 October 2026

Ethan explicitly resumed another bounded unprotected-formatting run from95f4522.
Five accepted slices: d7e465d (five JSON configs),3f1b2a1 (six source configs),
efa89e3 (eleven evidence reports),0f07e87 (lint/Playwright configs),b16d8fe (three
failure-cleanup reports). Commit diffs are232,285,329,238 and292 changed lines.
Each full pinned precommit81files/1487tests and targeted formatter/secret scan PASS.

JSON settings/evidence preserve exact parsed values; report string/number/punctuation
tokens are unchanged. Source config ASTs match exactly, including telemetry/privacy,
formatter exclusions, lint rules, release inclusion and browser assertions/projects.
Before/after CLI listings match all240 selected browser/visual tests in7files; this
is test-selection proof, not an E2E execution or a new visual/device acceptance.
No protected/app-flow/OFFLINE-01, applied SQL, baseline, CI workflow or ignore edit.
Reuse the already inspected headless phone/desktop visuals for their stated scope.

Fresh full format check FAIL609files, down27 from636. Checkpoint GitHub37224145704
confirmed636 failures; subsequent config CI also failed formatting. No green release
or CI deployment claimed. Dedicated deploy-token DPAPI file remains absent. Protected
All tools proposal still awaits specific approval. Actual stock opening/as-of facts,
six recipe measures/cost links, custody and real devices/seven dates/Cine acceptance
remain unresolved;804 financial lines and all source assumptions are preserved.

Private proofs: F2-config-format-proof.json, F2-source-config-format-proof.json,
F2-quality-config-format-proof.json, F2-evidence-format-root-review{,2}.json,
F2-quality-test-list-{before,after}.log, F2-ci-format-resume-final.log and five
commit logs. Full formatter and OFFLINE-01 stay required. F2 incomplete/F3 closed;
actual-phone and original OFFLINE-01 both PASS by20October remain required.

## CI formatting continuation — 5 October 2026

Final local formatter: FAIL636 files; first-slice GitHub run37223588999 fails638
and skips downstream release. Four accepted formatted tests have identical structural
fingerprints to5101724, including assertions/values. Second slice is flavour/stocktake
coverage (`1fa65dc`, full precommit81/1487 PASS); recipe-drafts formatting was rejected by the worker's structural comparison
and restored exactly. Root began an intermediate hook before worker selection finished;
the final two-file slice is separately checked and verified. No assertion/check weakened.
Final proof/logs: F2-format-acceptance.json, F2-ci-format-final.log and
F2-ci-format-slice2-final-commit.log in the private evidence directory.

Resume source5101724, clean tree. First unprotected test-formatting sliced637217
passes full pinned precommit81/1487, port54, engine, typechecks/lint, targeted
Prettier and exact-credential/pattern secret scan. No assertion or app change.
The current formatter inventory is retained privately as F2-ci-format-20261005.log;
full check remains red. GitHub CI is retriggered by the accepted branch push.

The dedicated deployment token is not saved at its expected DPAPI location;
GitHub has Access/build secrets but lacks CLOUDFLARE_API_TOKEN. No token was printed
or new resource created. Use the existing private save helper, then configure the
approved existing repository secret only after successful scoped credential checks.

[Protected proposal](F2-format-exception-proposal.md) freezes one exact All tools
formatting candidate:77 changed lines, same structural fingerprint, source unchanged.
Approval, continuity reversal and actual candidate visual checks remain pending.
[Count/custody/device steps](F2-count-custody-device-preparation.md) preserve the
existing editor/checklist. Recipe measures/yields and dated historical opening stock
remain missing; no eligible stock movement can bypass the existing receipt guard.
804 financial rows, source/date/repeat assumptions and dummy exclusion are retained.
Accepted phone/desktop P&L screenshots were reinspected; no new device proof inferred.
OFFLINE-01 unchanged/failing; real-device/week/custody evidence missing. F2 incomplete,
F3 closed; both OFFLINE-01 and actual-phone PASS required by20October.

**4October:** [real-data addition](F2-real-data.md) records accepted72 stock definitions,
13 suppliers/eight quotes,26 library products/seven October prices,one exact recipe
and runtime/auth/stocktake fixes. No physical counts or historical transactions
imported. Recipe conversions/cost links/allergens and Cine acceptance remain pending.
Code73e556e is committed/pushed and published as private Worker version4ecc095c;
verify/precommit78/1471, inspected headless catalogue/count visuals and fresh Access
gate/anonymous assets/disabled-preview probes PASS. Original OFFLINE-01 unchanged.

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
