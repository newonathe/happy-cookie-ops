# F2 / MP-26 trial checkpoint — 2026-10-03

Status: local preparation accepted by independent Sol/high review; real-week acceptance **incomplete**. F3 remains closed and next-goal stays F2.

## Deliverables and authority

Read the whole next-goal.md; finish-plan.md sections 6 and 10 govern this package.
[Cine checklist](F2-owner-trial.md) provides seven dated daily records, scenario outcomes, reconciliation, feedback and actual-device rehearsal.
[Fix ledger](F2-fix-list.md) records current reproductions, severity, absent Cine feedback and unresolved dispositions. No app fix is claimed.
[Receipt](evidence/F2-trial.json) separates local preparation, automated QA, physical-device proof and owner acceptance.

User delegated technical selection on 2026-10-03 and asked to finish quickly. Codex can prepare and select a proposal; that statement supplies neither Cine's actual operation/feedback nor approval to deploy/create resources. No passwords or keys were requested in chat.

## Existing URLs and trial target

- Existing Workers preview: `https://happy-cookie-preview.admin-kethai.workers.dev`.
- Existing protected Vercel demo: `https://happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app`.
- Read-only HTTP probes returned 200 for both. Response reachability does not prove authenticated app operation. Web fetch could not inspect either; no hosted browser or signed-in test ran.
- Current-history.md records Workers as synthetic/fake catalogue with the historical 28-migration snapshot; Vercel is a manually deployed demo. Neither is established as a current real-data trial target. Do not use real customers/payments there based on this preparation.
- Selected local QA targets: current standalone demo and existing current live static export served on loopback against local Supabase. A short-lived synthetic owner and technical health fixtures were removed after QA. No reset, migration, real transaction or hosted write occurred.
- Before real use, Ethan must approve a suitable target and permitted data scope and arrange Cine's owner-role access. Technical configuration is Codex's responsibility; Cine's completed week and device record must come from her actual use.

## Local evidence

Pinned Node 24.20.0 / pnpm 9.12.3. Evidence directory outside Git:
`C:/Users/ethan/.codex/visualizations/2026/10/03/01a10096-15fb-7a83-99bc-be8b53ce2c03/`.

G0 continuity also passes: 1,217 checks / zero failures, exit 0; MP-26 is an accepted historical task ID. External `F2-g0-validation.json` preserves the run; generated historical receipt churn was restored after preservation.

| Gate                     | Result and file                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build         | PASS, exit 0; `F2-build.log`                                                                                                                                                                         |
| Full `pnpm.cmd verify`   | PASS, exit 0; 77 files / 1,462 tests, both typechecks/lint; port 54 files, engine 49 exports / 21 settings / 38 tables; `F2-verify.log`                                                              |
| Full `pnpm.cmd test:e2e` | **FAIL**, exit 1; 89 passed / 1 failed / 75 skipped; WebKit OFFLINE-01 internal reload error, `F2-e2e.log`; skipped SQL parity cases are not positive SQL evidence                                   |
| Headless live Chromium   | Capture checks PASS, 37 screenshots; 13 owner/public route layouts at both widths plus missing/success/failed health, alert navigation and privacy; `F2-visual.json`, `F2-live-visual-run2.log`      |
| Headless demo Chromium   | Capture checks PASS, 10 screenshots; order/checkout/status/production/bazaar at both widths; `F2-demo-visual.json`, `F2-demo-visual.log`                                                             |
| Human image inspection   | All 47 captures inspected via ten contact sheets. No horizontal page overflow or screen-error fallback observed. P&L caption mismatch logged as F2-002; this is not an unqualified visual acceptance |
| F1 schedule config       | `F1-schedule.example.json` still `enabled:false`, unchanged; no jobs activated                                                                                                                       |

Demo captures use the G0 synthetic fixture and engine-forced navigation; checkout has an empty cart and bazaar shows the event chooser. They prove those visible layouts only. Live captures use existing synthetic local records; they do not prove every action, successful sale, CSV transaction or live checkout. Unchanged F1 source/SQL/recovery/live-checkout proof is reused without claiming a fresh SQL or transaction run. Windows captures are not accepted Docker pixel baselines; none were regenerated.

Physical phone, Safari/PWA, actual-owner access, real-week checklist, feedback and acceptance are **pending**. Headless Chromium at 390×844 is computer proof only. Failure trace stays in ignored `test-results/`; a durable copy is retained in the external evidence directory.

## Reproductions, review and publication

- F2-001 remains the known WebKit blocker. No runtime/SQL/offline or protected-source fix attempted; queue acknowledgment rules are unchanged.
- F2-002 is a reproduced misleading caption in locked markup; an exact approved exception and independent port audit are needed before a patch. No ledger arithmetic defect is asserted.
- First live harness invocation failed before any database mutation because its copied receipt filename said F2-backup. Corrected the external-only path to the existing F1 receipt; second invocation passed and owned cleanup passed. No app repair failed.
- Codex only: requested Sol/high planning and independent local-preparation sign-off; Luna/medium checklist writer, at most two child workers, no grandchildren or paid fallback. Root model was not changed by delegation.
- Stop tracking: current user-triggered goal turn, zero app fix attempts/failed app fixes. Two failed fixes or 25 goal turns requires checkpoint/stop; this does not authorize looping while waiting for owner evidence.
- Independent Sol/high review accepts local preparation only; corrected a stale pending-run sentence and clarified that the app is the operating record, with the old sheet as archive/fallback. No remaining documentation blocker. Credential-pattern secret scan PASS for six changed/new files. Publication authority is the Git commit containing this checkpoint plus external `F2-commit.log`, `F2-push.log` and `F2-publication.json`; no PR, merge, deployment, hosted resource, import, F3 legal/accounting decision or automatic runner occurred.

## Resume and acceptance gate

1. Approve an appropriate real-data target and arrange owner access securely; check that its release/database actually contain the accepted slices before use. Any hosted write/deployment/resource remains a separate explicit approval.
2. Cine completes all seven dates, scenario results, private evidence references and end-week feedback; record sanitized outcomes in the receipt/checklist. Resolve/retest trial defects with applicable review and gates.
3. Before 20 October 2026, obtain both a passing OFFLINE-01 result and actual-phone offline rehearsal. Without both, 24–25 October uses current selling/paper process and 12–13 December becomes the pilot. Any D3 early hosted setup needs Ethan's approval at creation/deployment.
4. Sol/high reviews real-week evidence and required device/issue dispositions; only then mark MP-26 complete and advance next-goal to F3. Prepared paperwork, synthetic QA and AI sign-off cannot satisfy this gate.
