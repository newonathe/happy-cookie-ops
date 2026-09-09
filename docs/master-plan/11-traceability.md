# Finding-to-delivery traceability

This register maps all **55 prioritized findings** in reports 01–03 to planned work and closure evidence. A mapping is not a pass. Every package in [tasks.json](tasks.json) remains `planned`; no application implementation or runner activation was performed in this phase. Priorities and source locations remain authoritative in the linked audit reports.

Use this together with the complete route/sheet/setting/state matrices in [01](01-feature-and-state-audit.md), contracts in [06](06-domain-contracts.md) and the 15 golden journeys in [08](08-validation-and-operations.md). MP-26 checks every matrix row, including states without a separate prioritized finding. Domain tests must assert database/queue effects; screenshots alone cannot close those findings.

## Feature and state findings

Source: [01-feature-and-state-audit.md](01-feature-and-state-audit.md).

| Finding | Responsible packages | Required closure evidence |
|---|---|---|
| F01 | [MP-07](prompts/MP-07.md), [MP-08](prompts/MP-08.md), [MP-09](prompts/MP-09.md), [MP-24](prompts/MP-24.md) | Public/staff bootstrap contains only authorized server records; cross-device reload persists changes; UAT-06. |
| F02 | [MP-11](prompts/MP-11.md) | Real file selection, upload failure, private ownership and iPhone format tests; UAT-01. |
| F03 | [MP-14](prompts/MP-14.md), [MP-23](prompts/MP-23.md), [MP-24](prompts/MP-24.md) | Clipboard/share, backup and support actions report success only after a verified effect; UAT-11. |
| F04 | [MP-14](prompts/MP-14.md) | Identifier enumeration denied; capability and owner-assisted recovery; UAT-13; DP-01. |
| F05 | [MP-07](prompts/MP-07.md), [MP-14](prompts/MP-14.md) | Actual order link opens scoped record after reload, with expired/missing states; UAT-01/12/13. |
| F06 | [MP-07](prompts/MP-07.md), [MP-21](prompts/MP-21.md), [MP-25](prompts/MP-25.md) | Existing layouts selected from real viewport; physical narrow iPhone/iPad/Mac and safe-area evidence; UAT-12. |
| F07 | [MP-07](prompts/MP-07.md) | Production cannot switch roles/connectivity/shop states through preview controls; approved DP-00 exception only. |
| F08 | [MP-07](prompts/MP-07.md), [MP-16](prompts/MP-16.md) | Direct stocktake route enters approved count flow with preserved draft; UAT-08/12. |
| F09 | [MP-06](prompts/MP-06.md), [MP-22](prompts/MP-22.md), [MP-24](prompts/MP-24.md) | Support/retained-contact payload and export canaries excluded at API/SQL boundary; UAT-06. |
| F10 | [MP-08](prompts/MP-08.md) | Signed capability matrix, temporary expiry/revocation if approved; direct API role negatives; DP-05. |
| F11 | [MP-15](prompts/MP-15.md) | Identical report/export periods and historical cents after settings changes; UAT-09/14; DP-04. |
| F12 | [MP-09](prompts/MP-09.md), [MP-27](prompts/MP-27.md) | Owner verifies actual business/payment facts; no fixture registration/tax claims in live bootstrap; DP-06. |
| F13 | [MP-07](prompts/MP-07.md), [MP-25](prompts/MP-25.md) | Injected screen/submit/storage failure gives truthful recovery and saved-state status; UAT-10/12/13. |
| F14 | [MP-21](prompts/MP-21.md), [MP-25](prompts/MP-25.md) | VoiceOver, focus, Escape, zoom, keyboard and sheet recovery; unchanged approved visual structure; UAT-12. |
| F15 | [MP-03](prompts/MP-03.md), [MP-18](prompts/MP-18.md), [MP-19](prompts/MP-19.md), [MP-20](prompts/MP-20.md) | Mutation probes reject Home-only routes, zero sales and empty ACK; actual durable sale/replay assertions. |
| F16 | [MP-03](prompts/MP-03.md), [MP-21](prompts/MP-21.md), [MP-25](prompts/MP-25.md) | Deterministic accepted reference captures, WebKit plus real Apple device matrix; UAT-12. |
| F17 | [MP-10](prompts/MP-10.md), [MP-14](prompts/MP-14.md) | Effective closed/soldout/scheduled state, nonempty cart, repeated submission, missing-order state; UAT-01/13/14. |
| F18 | [MP-24](prompts/MP-24.md) | Preference round trip; dismissal/resolution/reappearance keyed by stable condition; delivery channel evidence. |
| F19 | [MP-09](prompts/MP-09.md), [MP-17](prompts/MP-17.md) | Recipe edit/publish/history/resume follows actual approved screen; frozen batch recipe; UAT-03/09. |
| F20 | [MP-25](prompts/MP-25.md) | Measured render/query/bundle/cache bounds at target volume; port and performance tests. |
| F21 | [MP-21](prompts/MP-21.md), [MP-22](prompts/MP-22.md), [MP-27](prompts/MP-27.md) | Demo reset never erases pending live queue; sign-out, erasure and clean bootstrap separately tested. |

## Data and offline findings

Source: [02-data-engine-and-offline-audit.md](02-data-engine-and-offline-audit.md).

| Finding | Responsible packages | Required closure evidence |
|---|---|---|
| DATA-01 | [MP-09](prompts/MP-09.md), [MP-10](prompts/MP-10.md), [MP-11](prompts/MP-11.md), [MP-12](prompts/MP-12.md), [MP-13](prompts/MP-13.md), [MP-14](prompts/MP-14.md), [MP-15](prompts/MP-15.md), [MP-16](prompts/MP-16.md), [MP-17](prompts/MP-17.md), [MP-18](prompts/MP-18.md), [MP-19](prompts/MP-19.md), [MP-20](prompts/MP-20.md), [MP-21](prompts/MP-21.md), [MP-22](prompts/MP-22.md), [MP-23](prompts/MP-23.md), [MP-24](prompts/MP-24.md) | Every action in 01 maps to a durable command/read model or approved truthful manual procedure; UAT-01–15. |
| DATA-02 | [MP-05](prompts/MP-05.md) | Reproducible fresh SQL bootstrap plus deployed-history decision; no fake migration success; DP-09. |
| DATA-03 | [MP-05](prompts/MP-05.md) | Generated types match successfully applied schema; no placeholder any and no generated diff. |
| DATA-04 | [MP-19](prompts/MP-19.md) | Real SQL mixed-line batch, unknown product, malformed quantity and per-row transaction tests. |
| DATA-05 | [MP-18](prompts/MP-18.md), [MP-19](prompts/MP-19.md) | Tampered actor/price/discount/total rejected; event snapshot recomputation in cents; UAT-05/10. |
| DATA-06 | [MP-18](prompts/MP-18.md) | Terminate before/after IDB commit; stable UUID independent of display ID; UI never precedes durability. |
| DATA-07 | [MP-18](prompts/MP-18.md) | IDB abort/quota/failed-open/version-change tests wait for transaction completion. |
| DATA-08 | [MP-20](prompts/MP-20.md) | Partial/empty/foreign/hash-mismatched ACK cannot mark unrelated records synchronized; UAT-10. |
| DATA-09 | [MP-20](prompts/MP-20.md) | Page/worker double-flush, timeout/429/backoff, safe bounded replay and accepted-ID reconciliation. |
| DATA-10 | [MP-21](prompts/MP-21.md) | Airplane-mode cold reopen, auth redirect cache negative, version upgrade with pending queue; UAT-12. |
| DATA-11 | [MP-10](prompts/MP-10.md) | Actual recognized status membership and 20-way final-unit SQL race; explicit owner overage tested separately. |
| DATA-12 | [MP-10](prompts/MP-10.md), [MP-15](prompts/MP-15.md) | Historic commercial snapshot remains 168.44 despite later packaging setting change; UAT-09. |
| DATA-13 | [MP-17](prompts/MP-17.md), [MP-18](prompts/MP-18.md), [MP-19](prompts/MP-19.md), [MP-20](prompts/MP-20.md) | Load/close/reset/void conservation and immutable identity regression; UAT-05/15. |
| DATA-14 | [MP-10](prompts/MP-10.md), [MP-18](prompts/MP-18.md) | Canonical positive line list; zero-key removal, empty-cart refusal and schema parity. |
| DATA-15 | [MP-05](prompts/MP-05.md), [MP-09](prompts/MP-09.md), [MP-16](prompts/MP-16.md), [MP-17](prompts/MP-17.md), [MP-24](prompts/MP-24.md) | Existing-to-target entity/column map plus every screen/state persisted or intentionally local draft. |
| DATA-16 | [MP-07](prompts/MP-07.md) | Authenticated bootstrap, selected IDs, deep links, back/reload and draft survival; UAT-12. |
| DATA-17 | [MP-15](prompts/MP-15.md) | Source-linked ledger, no double recognition, signed period/cost/tax policy; UAT-04/09/14. |
| DATA-18 | [MP-27](prompts/MP-27.md) | Production has zero demo orders/payments; opening entries have approved source/lot/cost evidence. |

## Security and operations findings

Source: [03-security-and-operations-audit.md](03-security-and-operations-audit.md).

| Finding | Responsible packages | Required closure evidence |
|---|---|---|
| SEC-01 | [MP-06](prompts/MP-06.md), [MP-10](prompts/MP-10.md) | Direct anonymous order/line writes and guessed foreign keys denied; narrow valid checkout succeeds. |
| SEC-02 | [MP-06](prompts/MP-06.md), [MP-22](prompts/MP-22.md) | Default EXECUTE revoked; unauthorized/negative/zero-day purge denied; legitimate bounded maintenance tested. |
| SEC-03 | [MP-06](prompts/MP-06.md), [MP-08](prompts/MP-08.md) | Every role/function/table/projection tested; helper/support cannot widen capability; UAT-06. |
| SEC-04 | [MP-18](prompts/MP-18.md), [MP-19](prompts/MP-19.md) | Wrong device/event/actor/price, expired/revoked epoch and duplicate replay tests; UAT-10. |
| SEC-05 | [MP-14](prompts/MP-14.md) | Public enumeration/guessing and cross-order proof access denied; UAT-13; DP-01. |
| SEC-06 | [MP-04](prompts/MP-04.md), [MP-08](prompts/MP-08.md), [MP-27](prompts/MP-27.md) | Missing live config fails build/start/auth closed; demo build cannot use production credentials. |
| SEC-07 | [MP-08](prompts/MP-08.md) | Schemes, protocol-relative, encoded and non-allowlisted sign-in return paths rejected. |
| SEC-08 | [MP-04](prompts/MP-04.md), [MP-08](prompts/MP-08.md) | Actual static client config works; no server credential in bundles/maps/logs; environment guard tests. |
| SEC-09 | [MP-19](prompts/MP-19.md), [MP-25](prompts/MP-25.md) | Raw body cap, rate/CPU budget, timeout and safe SQL-error tests; 429 retry policy verified. |
| SEC-10 | [MP-02](prompts/MP-02.md), [MP-22](prompts/MP-22.md) | Failing fixture-name test fixed without broad scrub allowlist; secret/PII canary suite. |
| SEC-11 | [MP-23](prompts/MP-23.md) | Public liveness versus protected readiness return correct status and no financial/PII payload. |
| SEC-12 | [MP-11](prompts/MP-11.md), [MP-14](prompts/MP-14.md), [MP-22](prompts/MP-22.md), [MP-23](prompts/MP-23.md), [MP-24](prompts/MP-24.md) | Actual job/action result drives UI; broken dependency cannot generate success; UAT-11. |
| SEC-13 | [MP-08](prompts/MP-08.md), [MP-21](prompts/MP-21.md), [MP-22](prompts/MP-22.md) | Logout/revocation and cache minimization preserve pending sale facts safely; UAT-06/10/12. |
| SEC-14 | [MP-00](prompts/MP-00.md), [MP-01](prompts/MP-01.md), [MP-23](prompts/MP-23.md), [MP-27](prompts/MP-27.md) | Verified provenance/lock/tool pins, encrypted restore and compatible deployment rollback; UAT-11. |
| SEC-15 | [MP-06](prompts/MP-06.md), [MP-15](prompts/MP-15.md), [MP-22](prompts/MP-22.md) | No direct caller-forged audit insert; transaction creates minimal immutable evidence and correction link. |
| SEC-16 | [MP-22](prompts/MP-22.md) | Identity normalization, keyed correlation, legal hold, attachments and restored-backup tombstones tests. |

## Cross-cutting work beyond individual defects

| Requirement | Packages / decision | Evidence required |
|---|---|---|
| Entire existing design, all controls and states retained | MP-03, MP-07, MP-26; DP-00 | Reference provenance, mutation-resistant checks, real screen/state interaction and reviewed smallest exceptions |
| Zero additional spend; scalable only within measured envelope | MP-01, MP-04, MP-25, MP-28; DP-08 | Current vendor/account limits, actual free-host CPU/load test, budget stop and quota trend |
| Versioned API/data authority, money/quantity/time precision | MP-05, MP-06, MP-09–MP-20 | Generated schema, command fixtures, real DB transactions and one legacy conversion boundary |
| One offline sales writer and concurrent online activity | MP-10, MP-18–MP-21 | Allocation/packaging conservation, final-unit races, fencing, crash/replay/closeout and lost-device SOP |
| Privacy, lawful recordkeeping and food safety | MP-15–MP-17, MP-22, MP-27; DP-04/06/07 | Signed applicability/retention/lot/allergen policies and tested implementation; no certification inferred |
| Backups, outage/manual fallback, clean live start and owner training | MP-23, MP-26–MP-28; DP-10 | Measured restore, opening reconciliation, operator walkthrough and hypercare exit |
| ERP manual relevance and exclusions | MP-00, MP-26 | [05 crosswalk](05-manual-crosswalk.md) considered; unrelated vertical modules are excluded deliberately |
| Codex/Claude reusable task prompts and project profile | AR-00, AR-01; templates supplied now | Validated schema; exact task/file ownership, evidence and explicit project-specific unknowns |
| Durable event memory and efficient retrieval | AR-01, AR-02 | SQLite commit/crash tests, safe journal schema, FTS index rebuild and bounded context freshness |
| Git/process isolation and unknown external outcomes | AR-03 | One writer, fencing/process identity, preserve dirty changes, intent/result reconciliation tests |
| Quota-reset resumption without extra spend or bypass | AR-04, AR-05 | Fake provider tests, actual account entitlement checks and exact session/project recovery |
| Runner activation and cross-project transfer | AR-06, separate later authorization | Owner activation checklist and harmless authorized pilot; disabled policy remains default |

## Closure and change rules

1. A finding moves to fixed only when its implementation slice, code/schema hash, test result and reviewer evidence are linked. If it spans packages, all necessary effects must be covered.
2. “Existing UI lock” is not a reason to conceal false success or grant insecure access. If no existing approved state can express safe behavior, keep the affected release gate blocked at DP-00/01 and prepare a narrow reviewable exception.
3. Environment or business unknowns are assigned in [10](10-decisions-and-sources.md). No invented expiry, tax rate, legal retention, entitlement or backup destination counts as a resolution.
4. A new finding gets a stable identifier, impact, source/reproduction, task owner and oracle. Update this register, task catalog and generated prompts together when scope changes.
5. The document validator verifies complete identifier coverage and valid task references. It does not certify the technical design, prove business correctness or turn planned work into completed work.

Planning package checks and immutable-source comparison are recorded in [12 Plan validation](12-plan-validation.md).

