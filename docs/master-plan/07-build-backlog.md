# Build backlog and execution protocol

Canonical task data: [tasks.json](tasks.json). This readable catalog is generated from the same planning source in `evidence/build-task-catalog.py`; edit the generator and regenerate both together to prevent drift. The script only writes planning documents; it never runs a task.

## Ready, done and ownership

Each MP/AR record is a work package. Before implementation, split it into suffix slices such as `MP-18.a` (IDB transaction semantics), `.b` (sale command boundary), `.c` (allocation projection) and `.d` (crash tests). Each slice has one owner, exact file list, acceptance oracle and rollback, ideally <=400 changed lines. Do not interpret a broad domain directory as authorization to rewrite every file in it. Protected paths still require the repository's stop/decision rule. State the concrete plan before code as required by AGENTS.

Definition of Ready: dependencies verified; relevant DP decision resolved or the slice explicitly independent; current code inspected; environment known; owned files and permitted operations fixed; test reproduces the defect or exercises the invariant; no overlapping writer. Definition of Done: intended behavior and negative cases pass; pnpm verify/build and change-specific checks recorded for exact code/schema; protected design preserved; no unresolved critical review; docs/contracts updated; checkpoint and evidence indexed. Evidence is invalidated by changes to covered code/schema/config. Package complete means all slices complete.

Default verification includes `pnpm verify` and `pnpm build` for application changes. `test:db`, `test:api`, `test:security`, `test:offline`, `verify:release` are proposed commands to implement, not existing commands to pretend passed. Domain behavior must be tested against real local Supabase where relevant. No production reset, payment send, external message, deployment or paid purchase is implied by a task record.

Select the earliest ready P0 task that unblocks the critical path. One writer by default; independent review/context research can be concurrent only when explicitly authorized and ownership does not conflict. The `model_class` maps to the account-validated choices in 09. Critical work uses an independent reviewer with the deep class; the reviewer reports evidence, not a confidence vote.

Estimate after MP-00–03 and two real domain slices: measure design/build/test/review time and quota consumed, then give a range using remaining similar slices plus uncertainty for auth/offline/Apple/legal decisions. Do not repeat the old board's half-session estimates as verified. A concrete calendar is impossible until account quotas, device access and owner decisions are known; dependencies and acceptance are fixed now.

## Legacy board reconciliation

| Legacy tasks | Replacement / correction |
|---|---|
| T-01, T-01b, T-02, T-03 | MP-00–06; baseline is not currently green |
| T-04, T-05, T-06 | MP-06/08 and MP-18–20; security review required per actual command |
| T-07, T-08, T-09 | MP-03 plus invariant tests in every domain; no weak zero-sale offline pass |
| T-10 | MP-09; all settings/version snapshots included |
| T-11 | MP-10–14; capability lookup replaces unsafe undocumented assumptions |
| T-12 | MP-15; operational accounting/period policy explicit |
| T-13 | MP-16–17; production lots/conservation cannot fit one generic CRUD task |
| T-14 | MP-27 clean bootstrap; live demo-data migration is cancelled by user clarification |
| T-15, T-18, T-18b | MP-03/21/25; existing design lock remains |
| T-16 | Concurrent online staff supported; multi-device offline selling deferred; MP-07–20 invariants |
| T-16b, T-17, T-18c, T-19 | MP-04/22–24; no simulated monitoring/backups or Vercel Hobby business launch |

## Work packages

### MP-00 — Establish source provenance and canonical plan

**P0 · G0 · focused · planned**

Dependencies: none. Decision gates: none.

Scope: Recover intended history/remotes or document a new baseline; archive fixture/design hashes; add matching agent entry-point navigation; keep working runtime outside OneDrive.

Owned paths (proposed files may not exist yet): `AGENTS.md`, `CLAUDE.md`, `MASTER-PLAN.md`, `.gitignore`, `docs/state/`.

Acceptance:

- Original 347-file manifest reconciles with explicitly approved changes
- Git history decision and local worktree path recorded; no invented remote
- AGENTS and CLAUDE agree; legacy entry points direct agents to this plan

Verification: Hash comparison; git status/history inspection; navigation/link checks.

Rollback: Restore only this task's documentation/config patch; never delete original source or recovered history.

### MP-01 — Pin a supported reproducible toolchain

**P0 · G0 · standard · planned**

Dependencies: MP-00. Decision gates: none.

Scope: Select supported Node/Next/React/tool versions, review advisories/licenses and install scripts, commit lockfile, match Playwright package and visual container.

Owned paths (proposed files may not exist yet): `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `Dockerfile`, `.github/workflows/ci.yml`, `playwright.config.ts`.

Acceptance:

- Clean install uses frozen lock in local and CI
- Node ranges and peer dependencies agree
- No paid required tool or unreviewed install script; versions recorded

Verification: Clean install; package advisory/license report; runtime/version assertions.

Rollback: Revert pinned dependency set together; preserve prior lock and audit logs.

### MP-02 — Repair strict typing, lint and production build

**P0 · G0 · standard · planned**

Dependencies: MP-01. Decision gates: none.

Scope: Resolve all 108 observed diagnostics by accurate types/adapters; repair flat ESLint configuration; remove unsupported config; fix scrubber failure in a separately owned slice if needed for verify.

Owned paths (proposed files may not exist yet): `src/view-models/vals.ts`, `src/store/engine/ops-engine.d.ts`, `src/lib/css.ts`, `src/lib/observability/scrub.ts`, `eslint.config.mjs`, `next.config.ts`, `tsconfig.json`, `tests/unit/`.

Acceptance:

- pnpm verify exits zero with all stages executed
- Production build exits zero
- No any/ts-ignore/skip-build escape hatch or protected design edit

Verification: pnpm verify; pnpm build; relevant unit regression.

Rollback: Revert bounded patch; retain failing-case evidence.

### MP-03 — Strengthen fidelity and executable test gates

**P0 · G0 · deep · planned**

Dependencies: MP-02. Decision gates: none.

Scope: Add structural/value/handler checks and deterministic fixture modes; require route-specific behavior and nonzero offline sale assertions; establish Docker visual baselines without hiding existing failures. Gate-detection tests pass; known product route/offline failures remain explicit release blockers owned by MP-07/18-21, not an artificial dependency cycle.

Owned paths (proposed files may not exist yet): `scripts/check-port-integrity.mjs`, `tests/e2e/`, `tests/unit/`, `tests/fixtures/`, `playwright.config.ts`, `docs/TESTING.md`.

Acceptance:

- Changing a style value/handler/copy causes the intended gate to fail
- Tests cannot pass when every route shows Home
- Visual package/container match and baseline approval recorded; test IDs trace all 01 states

Verification: Mutation probes of gates in isolated copy; pnpm verify; Docker visual comparison.

Rollback: Restore previous tests only with documented reason; never rebaseline a regression away.

### MP-04 — Prove zero-cost Cloudflare deployment architecture

**P0 · G1 · deep · planned**

Dependencies: MP-02, MP-03. Decision gates: DP-08.

Scope: Build a thin vertical spike of static route, same-origin session, RPC, private file and bounded sync payload; measure hosted CPU/limits; record accepted architecture or explicit failed alternative decision.

Owned paths (proposed files may not exist yet): `next.config.ts`, `functions/`, `src/lib/supabase/`, `public/_headers`, `wrangler.jsonc`, `docs/DEPLOY.md`.

Acceptance:

- All exported routes refresh and hydrate at provider preview
- Cookies, CSRF, headers, private no-store and safe errors proven
- Representative API p99 CPU <=8ms and no cap failures; free account/spend controls verified

Verification: Production export; local emulator; authorized synthetic preview HTTP/CPU probes.

Rollback: Remove preview or revert configuration; no production traffic involved.

### MP-05 — Repair schema bootstrap and generate real types

**P0 · G1 · deep · planned**

Dependencies: MP-02. Decision gates: DP-09.

Scope: Inspect any applied migration history; resolve first-migration syntax through approved baseline path; map existing/new entities, constraints and types; keep demo/production seeds separate.

Owned paths (proposed files may not exist yet): `supabase/migrations/`, `supabase/config.toml`, `src/lib/types/database.ts`, `tests/integration/db/`, `scripts/`.

Acceptance:

- Empty local reset applies all intended migrations in order
- Generated database types contain actual tables/functions and no permissive placeholder
- Schema diff/map, grants inventory and production-empty seed proof exist

Verification: Disposable local db reset; SQL compile/constraint checks; generated-type diff.

Rollback: Discard disposable DB; deployed history only forward repaired, never silently edited.

### MP-06 — Implement least-privilege SQL authority

**P0 · G1 · deep · planned**

Dependencies: MP-05. Decision gates: none.

Scope: Revoke public row writes and privileged function execution; implement per-command active-role checks, safe projections, default privileges, maintenance boundaries and DB-side limits.

Owned paths (proposed files may not exist yet): `supabase/migrations/`, `tests/integration/security/`, `src/contracts/`, `src/lib/rate-limit.ts`.

Acceptance:

- SEC-01/02/03 direct anon/helper/support attacks are denied
- Function grants/search_path/owner audit complete
- Public projection excludes contacts/costs/private settings; audit writes server controlled

Verification: Full role x operation SQL/API denial matrix; privileged RPC regression suite.

Rollback: Forward restrictive fix; never rollback to permissive policies to restore convenience.

### MP-07 — Repair bootstrap, routing and existing device layouts

**P0 · G1 · deep · planned**

Dependencies: MP-03, MP-08. Decision gates: DP-00.

Scope: Single initialization coordinator hydrates real role/data, routes and selected IDs; preserve drafts and sheet state; select existing mobile/tablet/desktop layouts from viewport; define missing-prerequisite behavior.

Owned paths (proposed files may not exist yet): `src/components/app/`, `src/store/ops-runtime.tsx`, `src/adapters/`, `src/lib/screens.ts`, `src/app/*/page.tsx`.

Acceptance:

- 26 direct paths render the correct content after hydration/reload
- Back/Forward and selected order/batch identity work without losing draft
- No public owner/demo bootstrap; locked layouts preserved; approved exceptions only

Verification: Route interaction E2E; role bootstrap; real viewport screenshots and draft reload tests.

Rollback: Revert adapter behind feature flag; never fall back to live demo owner mode.

### MP-08 — Complete session lifecycle and staff provisioning

**P0 · G1 · deep · planned**

Dependencies: MP-04, MP-06. Decision gates: DP-05.

Scope: Implement BFF secure sessions, CSRF, refresh/logout, safe return path, active profile, account recovery and manual no-email staff onboarding; disable live demo fallback.

Owned paths (proposed files may not exist yet): `functions/api/v1/session/`, `src/app/sign-in/`, `src/lib/supabase/`, `src/contracts/`, `ops/staff/`, `tests/integration/auth/`.

Acceptance:

- Expired/revoked session fails closed; no refresh token/service key in browser storage
- Helper/support restrictions hold on refresh and role change
- Owner-assisted provisioning/recovery and provider MFA/recovery rehearsed

Verification: Auth/API security integration; browser reload/logout/CSRF/open-redirect tests.

Rollback: Disable affected sign-in command; owner recovery procedure; never bypass authentication.

### MP-09 — Persist catalog, settings and reference masters

**P0 · G2 · standard · planned**

Dependencies: MP-05, MP-06, MP-08. Decision gates: DP-04.

Scope: Map all 21 settings plus non-config preferences, product/price/recipe/supplier versions, public projections and effective-date semantics; replace constants only through adapters.

Owned paths (proposed files may not exist yet): `src/domain/catalog/`, `src/adapters/catalog/`, `functions/api/v1/catalog/`, `supabase/migrations/`, `tests/integration/catalog/`.

Acceptance:

- Owner edits persist across devices/reload
- Known-key/range/unit validation and version conflict enforced
- Public catalog excludes private cost/config; historic references remain valid

Verification: Master-data CRUD/version/role tests; all-setting round trips; port gate.

Rollback: Restore prior published version via command; do not delete history.

### MP-10 — Implement authoritative customer order and capacity

**P0 · G2 · deep · planned**

Dependencies: MP-07, MP-09. Decision gates: DP-01, DP-02, DP-04.

Scope: Online checkout with server prices and frozen commercial snapshots; pending claims do not reserve; atomic confirm capacity command prepared for payment workflow; idempotency and stable IDs.

Owned paths (proposed files may not exist yet): `src/domain/orders/`, `src/contracts/orders.ts`, `functions/api/v1/orders/`, `src/adapters/orders/`, `src/lib/rules/capacity.ts`, `supabase/migrations/`, `tests/integration/orders/`.

Acceptance:

- Repeated create key yields one order; changed payload conflicts
- No client price/status/role accepted as authority
- Actual status membership matches engine; normal final-unit race permits one, explicit owner overage separately audited

Verification: UAT-01/14 subset; 20-way real DB capacity race; price snapshot and malformed input tests.

Rollback: Disable intake; preserve created records and reconcile; no destructive rollback.

### MP-11 — Implement real private attachments

**P1 · G2 · deep · planned**

Dependencies: MP-08, MP-10. Decision gates: DP-00.

Scope: Replace simulated attach/done behavior with staged private upload/finalization, magic-byte/dimension/size validation, signed reads, ownership and orphan cleanup.

Owned paths (proposed files may not exist yet): `functions/api/v1/uploads/`, `src/domain/attachments/`, `src/adapters/uploads/`, `supabase/migrations/`, `tests/integration/uploads/`.

Acceptance:

- Customer proof attaches to only its intended order
- HTML/SVG/oversize/wrong-type/foreign access denied
- iPhone file/camera path tested or approved actionable fallback; failed upload never says done

Verification: Upload abuse API suite; iPhone proof UAT; quota/orphan retry tests.

Rollback: Disable new upload intents, preserve finalized files and metadata.

### MP-12 — Persist payment review, balances and refunds

**P0 · G2 · deep · planned**

Dependencies: MP-10, MP-11. Decision gates: DP-02, DP-04.

Scope: Owner-verified payment commands, duplicate-ref warnings, short/overpayments, rejection/reopen, refunds and immutable source-linked posting; UI remains unchanged.

Owned paths (proposed files may not exist yet): `src/domain/orders/`, `src/domain/reporting/`, `src/adapters/orders/`, `functions/api/v1/orders/`, `supabase/migrations/`, `tests/integration/payments/`.

Acceptance:

- Proof is not auto-verification; balance and verified receipts reconcile
- Refund never exceeds actual refundable amount; pre/post-close recognition no double count
- Stale or duplicate command cannot repeat payment/refund

Verification: UAT-02/04; role, concurrency and money boundary tests.

Rollback: Suspend payment mutation; source-linked compensating commands, no deletion.

### MP-13 — Complete packing, collection and customer lifecycle

**P0 · G2 · deep · planned**

Dependencies: MP-12, MP-17. Decision gates: DP-03, DP-07.

Scope: Wire prepare/pack/collect/no-show/reopen with exact packaging/baked movements and legal transitions, stable timeline and current selected record.

Owned paths (proposed files may not exist yet): `src/domain/orders/`, `src/adapters/orders/`, `functions/api/v1/orders/`, `supabase/migrations/`, `tests/integration/fulfillment/`.

Acceptance:

- Packing posts exact boxes/pouches/stickers/cards once
- Collection never deducts stock again
- No-show/cancel/return history and food disposition follow signed policy

Verification: UAT-03/04/15; inventory conservation and stale-state tests.

Rollback: Disable affected command; reconcile source movements with compensating entries.

### MP-14 — Complete secure status, lookup and customer communications

**P0 · G2 · deep · planned**

Dependencies: MP-10, MP-11, MP-08. Decision gates: DP-01, DP-00.

Scope: Capability-scoped status and approved recovery; replace fake link/copy/send outcomes with actual user-initiated actions; optional mail only after independently verified free setup.

Owned paths (proposed files may not exist yet): `src/domain/orders/`, `functions/api/v1/orders/`, `src/adapters/customer/`, `src/lib/messaging/`, `tests/integration/customer/`.

Acceptance:

- No low-entropy identifier exposes orders
- Expired/revoked/missing capability has safe approved state
- Copy/share is user initiated and accurate; automated channel claims match installed integration

Verification: UAT-01/13; enumeration, referrer/log, token and clipboard/share tests.

Rollback: Revoke affected capabilities; safe manual verification channel.

### MP-15 — Implement operational ledger and reproducible reports

**P0 · G2 · deep · planned**

Dependencies: MP-12, MP-16. Decision gates: DP-04, DP-06.

Scope: Source-linked expenses/draws/reversals, drop-close recognition, period boundaries, historical snapshots and exports; separate cash, revenue and cost estimates.

Owned paths (proposed files may not exist yet): `src/domain/reporting/`, `src/adapters/reporting/`, `functions/api/v1/reports/`, `supabase/migrations/`, `tests/integration/reporting/`.

Acceptance:

- Every displayed total reconciles to source cents and period
- No double expense from receipt plus ingredient consumption
- Undo is compensating; categories/history/closed periods and tax assumptions explicit

Verification: UAT-04/09/14/15; report golden ledger and export reconciliation.

Rollback: Revert projection version; preserve ledger; correct via linked entries.

### MP-16 — Implement procurement, inventory and stock counts

**P0 · G2 · deep · planned**

Dependencies: MP-09. Decision gates: DP-03, DP-07.

Scope: Movement ledger, lots/units/latest-paid costs, grocery offer normalization, atomic receipt/expense, waste/adjustment and resumed stock counts.

Owned paths (proposed files may not exist yet): `src/domain/inventory/`, `src/adapters/inventory/`, `functions/api/v1/inventory/`, `supabase/migrations/`, `tests/integration/inventory/`.

Acceptance:

- No silent overwrite/negative or mixed-unit inventory
- Partial receipt and duplicate retry post exactly once
- Count conflict preserves intervening movements; old stock expiry not reset by new receipt

Verification: UAT-03/08; unit conversion/property and receipt/count race tests.

Rollback: Freeze affected location; recount and compensate, never overwrite history.

### MP-17 — Implement recipe versions, dough and production genealogy

**P0 · G2 · deep · planned**

Dependencies: MP-16, MP-10. Decision gates: DP-07.

Scope: Versioned recipe drafts and lots, ingredient issue, independent dough rest times, bake output/rejects, costs and traceability; preserve focus/resume experience.

Owned paths (proposed files may not exist yet): `src/domain/production/`, `src/adapters/production/`, `functions/api/v1/production/`, `supabase/migrations/`, `tests/integration/production/`.

Acceptance:

- Demand/baked/dough calculations use allocatable stock and correct statuses
- Batch retries cannot double consume or produce
- Trace ingredient lot forward and batch backward; hold/expiry policies enforced

Verification: UAT-03/07/08; batch conservation/version/rest/expiry tests.

Rollback: Stop new batch command; reconcile WIP and source movements before re-enable.

### MP-18 — Create one-device allocation and durable offline sale

**P0 · G3 · deep · planned**

Dependencies: MP-17, MP-08. Decision gates: DP-00, DP-03, DP-05.

Scope: Online event/device enrollment, baked and packaging allocation/price snapshot, one-writer epoch; move sale/stock/packaging/cash change into one IDB transaction before success; preserve distinct bazaar packaging rules and approved deficit policy.

Owned paths (proposed files may not exist yet): `src/lib/offline/`, `src/store/ops-runtime.tsx`, `src/adapters/events/`, `src/domain/events/`, `supabase/migrations/`, `tests/integration/offline/`.

Acceptance:

- IDB abort/quota failure preserves cart and cannot claim recorded
- Stable UUID/full client identity survives reload, void and display-ID reuse
- Other channels cannot sell offline allocation; preparation and expiry enforced

Verification: UAT-05/10; terminate-before/after-commit, double-tab and baked/packaging allocation tests.

Rollback: Disable new event prep; preserve/export pending queue and allocation ledger.

### MP-19 — Implement atomic authoritative sale replay

**P0 · G3 · deep · planned**

Dependencies: MP-18, MP-06. Decision gates: none.

Scope: Bounded partial-result intake, event-price recomputation, actor/device/epoch checks, key/hash idempotency and transactional lines/stock/ledger/audit.

Owned paths (proposed files may not exist yet): `functions/api/v1/sync/`, `src/contracts/sync.ts`, `src/domain/events/`, `supabase/migrations/`, `tests/integration/sync/`.

Acceptance:

- Duplicate/lost-response replay creates one complete sale
- Changed hash or unauthorized event is rejected/quarantined
- Mixed batch accepts valid independent rows and returns exact matching acknowledgments

Verification: UAT-05/10; SQL races, malicious totals, malformed batch and CPU checks.

Rollback: Pause sync writes; never delete queue; retain compatibility/reconciliation path.

### MP-20 — Reconcile queue, reversals and event closeout

**P0 · G3 · deep · planned**

Dependencies: MP-19, MP-15. Decision gates: DP-05, DP-07.

Scope: Shared versioned page/SW protocol, exact ACK projection, lease/backoff/status IDs, void dependencies, cash/stock closeout and new-epoch reopening.

Owned paths (proposed files may not exist yet): `src/lib/offline/`, `src/store/ops-runtime.tsx`, `src/domain/events/`, `functions/api/v1/events/`, `public/sw.js`, `tests/integration/events/`.

Acceptance:

- Empty/skipped/foreign ACK cannot mark any unacknowledged sale synced
- 5-of-10 stock example and repeated close/reopen conserve quantities
- Expired/revoked device sale facts survive for owner reconciliation

Verification: UAT-05/10/15; concurrent flush, partial ACK, reversal order and closeout tests.

Rollback: Stop new closes/reallocations; export queue; replay only verified identities.

### MP-21 — Ship version-safe PWA and Apple offline behavior

**P0 · G3 · deep · planned**

Dependencies: MP-20, MP-07. Decision gates: DP-00.

Scope: Complete versioned asset caching, foreground/resume sync, safe update handshake and old-protocol support; physical Apple installation/storage/logout behavior.

Owned paths (proposed files may not exist yet): `public/sw.js`, `public/manifest.webmanifest`, `src/lib/offline/`, `src/components/app/`, `src/app/layout.tsx`, `tests/e2e/`.

Acceptance:

- Airplane-mode reopen executes cached app and recovers real queued sale
- New release with pending queue cannot destroy or strand it
- No private API/navigation response cached; device zoom/keyboard/safe-area tests pass

Verification: UAT-10/12; cold offline/reload/SW-upgrade/eviction simulation and real iPhone.

Rollback: Serve previous compatible assets; retain v1 sync; no blanket cache/IDB clear.

### MP-22 — Implement privacy lifecycle, safe exports and retention

**P0 · G4 · deep · planned**

Dependencies: MP-11, MP-14, MP-15. Decision gates: DP-06.

Scope: Verified access/correction/erasure workflow, legal holds, contact/attachment/log minimization, tombstones for restores, safe role exports and scrubber fixes.

Owned paths (proposed files may not exist yet): `src/domain/privacy/`, `functions/api/v1/operations/`, `supabase/migrations/`, `src/lib/observability/scrub.ts`, `tests/integration/privacy/`.

Acceptance:

- Retention command cannot be invoked publicly or with arbitrary unsafe policy
- All contact copies/objects/logs covered; retained money reconciles
- Canary PII/secrets absent from logs/export roles; backup restore reapplies deletion policy

Verification: SEC-02/10/16 regression; UAT-06/11; privacy inventory and deletion tests.

Rollback: Disable automatic purge; preserve legal holds and tombstone ledger; restore only controlled evidence.

### MP-23 — Build and rehearse independent backups and recovery

**P0 · G4 · deep · planned**

Dependencies: MP-05, MP-22. Decision gates: DP-10.

Scope: Encrypted database plus objects/config/version manifests, independent existing storage, key recovery, safe restore and newest-write reconciliation.

Owned paths (proposed files may not exist yet): `ops/backup/`, `ops/restore/`, `docs/RUNBOOK.md`, `tests/integration/recovery/`.

Acceptance:

- Restore into isolated target reproduces counts/cents/stock/object hashes
- Auth and managed-schema exclusions documented and recovered safely
- Measured RPO/RTO, failed-backup detection and key access satisfy operator policy

Verification: UAT-11; missing-object/corrupt-export/key-unavailable/restore-tombstone drills.

Rollback: Keep previous verified backup tooling and archives; never overwrite production as first test.

### MP-24 — Replace simulated administration, health and integration claims

**P1 · G4 · standard · planned**

Dependencies: MP-08, MP-23, MP-15. Decision gates: DP-00, DP-05.

Scope: Real backup/readiness/status projection, notifications/preferences, form queue source/import controls, report-problem/export, staff/retention/storage controls and manual messaging procedures.

Owned paths (proposed files may not exist yet): `src/adapters/operations/`, `src/lib/messaging/`, `functions/api/v1/operations/`, `src/domain/notifications/`, `src/domain/form-queue/`, `tests/integration/operations/`.

Acceptance:

- Every settings/health/notification/form action in audit 01 has durable outcome or approved explicit unavailable/manual path
- Support projection has no customer/money data
- No fake success timer remains reachable in production adapters

Verification: Audit 01 action closure checklist; UAT-06/15; real job failure and preference tests.

Rollback: Disable failing integration path; retain local drafts and truthful status.

### MP-25 — Complete performance, accessibility and security release checks

**P0 · G4 · deep · planned**

Dependencies: MP-21, MP-24, MP-03. Decision gates: DP-00, DP-08.

Scope: Measure representative load/query/bundle/device performance, all-role abuse tests and WCAG/VoiceOver/keyboard; fix behind adapters or obtain narrow protected exceptions.

Owned paths (proposed files may not exist yet): `tests/`, `scripts/`, `src/adapters/`, `src/components/ui/`, `docs/master-plan/`.

Acceptance:

- Budgets in architecture measured with environment/profile evidence
- No unresolved P0/P1 security/data/accessibility blocker
- All routes and 33 sheet kinds covered; public/private bundles and headers audited

Verification: verify:release once implemented; k6 staging; physical Apple/axe/visual; ASVS matrix.

Rollback: Revert performance-only patch if needed; never loosen security/port gates.

### MP-26 — Owner UAT and mock cutover

**P0 · G4 · deep · planned**

Dependencies: MP-25, MP-13, MP-14, MP-15, MP-17, MP-20, MP-22, MP-23, MP-24. Decision gates: DP-00, DP-01, DP-02, DP-03, DP-04, DP-05, DP-06, DP-07, DP-08, DP-09, DP-10.

Scope: Execute all 15 acceptance journeys with owner/baker/helper/bookkeeper as relevant; dry-run setup, manual fallback, recovery and timing.

Owned paths (proposed files may not exist yet): `docs/uat/`, `docs/runbooks/`, `docs/evidence/`, `tests/fixtures/`.

Acceptance:

- All UAT cases have exact candidate evidence and accountable signoff
- Zero unresolved release-blocking decisions/defects
- Mock cutover and rollback handle new writes and unsent offline sales

Verification: UAT-01 through UAT-15; full release verification on exact candidate.

Rollback: Remain in staging; correct defects and rerun affected journeys.

### MP-27 — Clean production bootstrap and controlled launch

**P0 · G5 · deep · planned**

Dependencies: MP-26. Decision gates: DP-06, DP-07, DP-10.

Scope: Load approved configuration/opening balances without demo activity; verify actual QR/account details, privacy/BIR use, operator backups and target host; execute owner-authorized cutover.

Owned paths (proposed files may not exist yet): `ops/bootstrap/`, `docs/releases/`, `docs/runbooks/`.

Acceptance:

- Zero demo orders/ledger/events in production; opening stock/cents reconcile
- Exact release/schema and go/no-go approval recorded
- Live smoke and controlled transaction verified; rollback and operator contact available

Verification: Production-safe read-only smoke plus explicitly authorized controlled transaction.

Rollback: Close ordering; revert compatible app; preserve/reconcile new writes before restore.

### MP-28 — Hypercare exit and repeatable maintenance

**P1 · G5 · standard · planned**

Dependencies: MP-27. Decision gates: none.

Scope: Observe two drops and one bazaar, reconcile and resolve defects, train operator, establish monthly review and reusable learning.

Owned paths (proposed files may not exist yet): `docs/operations/`, `docs/state/`, `docs/master-plan/`.

Acceptance:

- Two complete drops and one event have no unexplained stock/money variance
- Restore/access/quota reviews and support handover complete
- No unresolved P0/P1; residual limitations explicitly owned

Verification: Operational reconciliation and measured service/backup evidence.

Rollback: Extend hypercare or suspend affected function; preserve records.

### AR-00 — Specify runner permission and provider adapters

**P1 · GA · deep · planned**

Dependencies: MP-00. Decision gates: none.

Scope: Later phase: approve local runner scope, subscription-only providers, model resolution, CLI event contracts, worktree and external-action policy.

Owned paths (proposed files may not exist yet): `tools/agent-runner/spec/`, `docs/master-plan/templates/`.

Acceptance:

- Exact installed CLI flags and account model entitlement verified
- No API billing/extra credits/permission bypass path
- User-approved activation boundary and stop control specified

Verification: Contract fixture review and no-spend preflight design.

Rollback: Keep runner disabled.

### AR-01 — Implement durable journal and local retrieval

**P1 · GA · deep · planned**

Dependencies: AR-00. Decision gates: none.

Scope: SQLite authoritative journal/task state, atomic checkpoints, JSONL export and FTS5 dependency/evidence retrieval outside OneDrive.

Owned paths (proposed files may not exist yet): `tools/agent-runner/journal/`, `tools/agent-runner/index/`, `tests/runner/`.

Acceptance:

- Crash/disk-full/partial-write cannot falsely complete task
- Secret denylist and source hash invalidation tested
- 100k-event retrieval and append latency meet targets

Verification: Fake-provider event replay, storage crash and benchmark tests.

Rollback: Restore journal backup, rebuild derived index, leave tasks paused.

### AR-02 — Implement bounded prompt assembly and model selection

**P1 · GA · standard · planned**

Dependencies: AR-01. Decision gates: none.

Scope: Use templates/task DAG/context index; record requested/resolved model and effort; schema validate provider outputs and safe command args.

Owned paths (proposed files may not exist yet): `tools/agent-runner/prompts/`, `tools/agent-runner/providers/`, `tests/runner/`.

Acceptance:

- Correct owned files/constraints/decisions in each packet
- Untrusted retrieved text cannot mutate authority
- Unsupported/paid model fails closed; terminal results verified

Verification: Golden prompt snapshots, malicious source fixtures, model/CLI compatibility tests.

Rollback: Manual prompts remain available; runner paused on unknown adapter output.

### AR-03 — Implement leases, supervisor and quota waits

**P1 · GA · deep · planned**

Dependencies: AR-02. Decision gates: none.

Scope: One writer, process-group lifecycle, fencing leases, supported quota observation and bounded wait/resume on exact session; no account-limit circumvention.

Owned paths (proposed files may not exist yet): `tools/agent-runner/supervisor/`, `tools/agent-runner/scheduler/`, `tests/runner/`.

Acceptance:

- Duplicate wake/stale PID/live prior process cannot duplicate work
- Quota/auth/outage/model errors classified separately
- Reset unknown stays explicit; no extra spend; user stop persists

Verification: Fault matrix in 09 with fake provider; clock/sleep/restart/quota simulations.

Rollback: Disable scheduled entry, stop owned process safely, preserve journal.

### AR-04 — Implement Git checkpoint, review and action reconciliation

**P1 · GA · deep · planned**

Dependencies: AR-03. Decision gates: none.

Scope: Exact branch/diff/evidence checkpoints, pre/post action IDs, worktree ownership and independent review gate; no implicit merge/deploy.

Owned paths (proposed files may not exist yet): `tools/agent-runner/git/`, `tools/agent-runner/recovery/`, `tests/runner/`.

Acceptance:

- Crash after external commit queries actual state before retry
- User dirty edits and other worktrees preserved
- Evidence invalidates on code/schema/plan drift

Verification: Git dirty/conflict/rebase and unknown-outcome simulator tests.

Rollback: Pause with recoverable branch/checkpoint; no force reset.

### AR-05 — Validate runner with harmless end-to-end tasks

**P1 · GA · deep · planned**

Dependencies: AR-04. Decision gates: none.

Scope: Run simulator matrix then permitted docs-only task across crash/restart and a real quota/eligibility observation; measure usage/memory/retrieval.

Owned paths (proposed files may not exist yet): `tests/runner/`, `docs/runner-evidence/`.

Acceptance:

- All 09 fault cases have expected durable state
- No duplicate mutation/secret leak/extra billing
- No unattended permission approval; stop/pause/restart verified

Verification: Full runner suite and harmless local trial; no production credentials.

Rollback: Keep disabled and use manual templates.

### AR-06 — Owner activation and reuse packaging

**P1 · GA · standard · planned**

Dependencies: AR-05. Decision gates: none.

Scope: Only after explicit later authorization: show concrete schedule/actions, install OS startup job hidden, provide uninstall/stop, export reusable project profile without secrets.

Owned paths (proposed files may not exist yet): `tools/agent-runner/install/`, `docs/runner-runbook/`, `docs/project-profiles/`.

Acceptance:

- User approved exact scope and scheduler
- New project starts with discovery and simulator, not copied business authority
- Quota/reset/maintenance policy and local-machine availability understood

Verification: Startup/sleep/offline/stop/uninstall acceptance in authorized local environment.

Rollback: Unregister only owned job; retain code/journal/backups unless separately requested.
