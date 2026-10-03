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
