# F2 fix list — updated 2026-10-04

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

| ID/date             | Severity                            | Reproduction; expected → observed                                                                                                                                                                                                                         | Cine feedback        | Owner/status                                   | Resolution + regression proof                                                                                                                                                                                                                                       | Independent review                                                                                                           |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F2-001 / 2026-10-03 | Oct offline pilot blocker           | Original full E2E unchanged: WebKit internal error at offline reload after durable sale; Chromium phone/desktop pass. Minimal controlled/cached SW reproduces error under WebKit offline emulation; both browsers return 200 from SW with origin stopped. | Pending; no Cine run | Root / diagnosed, original test still FAIL     | Strong evidence of Playwright/WebKit emulation defect; no app, SW, queue or test change justified. Fresh full E2E 89/1/75, exit 1; external F2-sw-isolation.json and [upstream issue](https://github.com/microsoft/playwright/issues/42775). Pilot gate not waived. | Independent coordinator review (Sol/high requested) agrees diagnosis scope; actual-phone proof pending                       |
| F2-002 / 2026-10-03 | Medium: misleading financial period | Live caption said August while totals used rolling 30 days. | Pending Cine feedback | Root / accepted locally | Existing pl.periodText drives live caption; demo/styles/math retained. Verify77/1464, G01219/0, fresh nonzero CSV/RPC reconciliation and live phone/desktop captures PASS. | Independent final code/port/cleanup/financial/visual PASS; external acceptance receipt |
| Template / ______   | ______                              | ______                                                                                                                                                                                                                                                    | ______               | ______                                         | ______                                                                                                                                                                                                                                                              | ______                                                                                                                       |

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
