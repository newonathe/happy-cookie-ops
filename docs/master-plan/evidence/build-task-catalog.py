"""Generate planning artifacts only. This does not execute tasks or implement a runner."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
rows = [
('MP-00','Establish source provenance and canonical plan',[], 'focused','P0','G0',
 ['AGENTS.md','CLAUDE.md','MASTER-PLAN.md','.gitignore','docs/state/'],
 'Recover intended history/remotes or document a new baseline; archive fixture/design hashes; add matching agent entry-point navigation; keep working runtime outside OneDrive.',
 ['Original 347-file manifest reconciles with explicitly approved changes','Git history decision and local worktree path recorded; no invented remote','AGENTS and CLAUDE agree; legacy entry points direct agents to this plan'],
 'Hash comparison; git status/history inspection; navigation/link checks', 'Restore only this task\'s documentation/config patch; never delete original source or recovered history', []),
('MP-01','Pin a supported reproducible toolchain',['MP-00'],'standard','P0','G0',
 ['package.json','pnpm-lock.yaml','.nvmrc','Dockerfile','.github/workflows/ci.yml','playwright.config.ts'],
 'Select supported Node/Next/React/tool versions, review advisories/licenses and install scripts, commit lockfile, match Playwright package and visual container.',
 ['Clean install uses frozen lock in local and CI','Node ranges and peer dependencies agree','No paid required tool or unreviewed install script; versions recorded'],
 'Clean install; package advisory/license report; runtime/version assertions', 'Revert pinned dependency set together; preserve prior lock and audit logs', []),
('MP-02','Repair strict typing, lint and production build',['MP-01'],'standard','P0','G0',
 ['src/view-models/vals.ts','src/store/engine/ops-engine.d.ts','src/lib/css.ts','src/lib/observability/scrub.ts','eslint.config.mjs','next.config.ts','tsconfig.json','tests/unit/'],
 'Resolve all 108 observed diagnostics by accurate types/adapters; repair flat ESLint configuration; remove unsupported config; fix scrubber failure in a separately owned slice if needed for verify.',
 ['pnpm verify exits zero with all stages executed','Production build exits zero','No any/ts-ignore/skip-build escape hatch or protected design edit'],
 'pnpm verify; pnpm build; relevant unit regression', 'Revert bounded patch; retain failing-case evidence', []),
('MP-03','Strengthen fidelity and executable test gates',['MP-02'],'deep','P0','G0',
 ['scripts/check-port-integrity.mjs','tests/e2e/','tests/unit/','tests/fixtures/','playwright.config.ts','docs/TESTING.md'],
 'Add structural/value/handler checks and deterministic fixture modes; require route-specific behavior and nonzero offline sale assertions; establish Docker visual baselines without hiding existing failures. Gate-detection tests pass; known product route/offline failures remain explicit release blockers owned by MP-07/18-21, not an artificial dependency cycle.',
 ['Changing a style value/handler/copy causes the intended gate to fail','Tests cannot pass when every route shows Home','Visual package/container match and baseline approval recorded; test IDs trace all 01 states'],
 'Mutation probes of gates in isolated copy; pnpm verify; Docker visual comparison', 'Restore previous tests only with documented reason; never rebaseline a regression away', []),
('MP-04','Prove zero-cost Cloudflare deployment architecture',['MP-02','MP-03'],'deep','P0','G1',
 ['next.config.ts','functions/','src/lib/supabase/','public/_headers','wrangler.jsonc','docs/DEPLOY.md'],
 'Build a thin vertical spike of static route, same-origin session, RPC, private file and bounded sync payload; measure hosted CPU/limits; record accepted architecture or explicit failed alternative decision.',
 ['All exported routes refresh and hydrate at provider preview','Cookies, CSRF, headers, private no-store and safe errors proven','Representative API p99 CPU <=8ms and no cap failures; free account/spend controls verified'],
 'Production export; local emulator; authorized synthetic preview HTTP/CPU probes', 'Remove preview or revert configuration; no production traffic involved', ['DP-08']),
('MP-05','Repair schema bootstrap and generate real types',['MP-02'],'deep','P0','G1',
 ['supabase/migrations/','supabase/config.toml','src/lib/types/database.ts','tests/integration/db/','scripts/'],
 'Inspect any applied migration history; resolve first-migration syntax through approved baseline path; map existing/new entities, constraints and types; keep demo/production seeds separate.',
 ['Empty local reset applies all intended migrations in order','Generated database types contain actual tables/functions and no permissive placeholder','Schema diff/map, grants inventory and production-empty seed proof exist'],
 'Disposable local db reset; SQL compile/constraint checks; generated-type diff', 'Discard disposable DB; deployed history only forward repaired, never silently edited', ['DP-09']),
('MP-06','Implement least-privilege SQL authority',['MP-05'],'deep','P0','G1',
 ['supabase/migrations/','tests/integration/security/','src/contracts/','src/lib/rate-limit.ts'],
 'Revoke public row writes and privileged function execution; implement per-command active-role checks, safe projections, default privileges, maintenance boundaries and DB-side limits.',
 ['SEC-01/02/03 direct anon/helper/support attacks are denied','Function grants/search_path/owner audit complete','Public projection excludes contacts/costs/private settings; audit writes server controlled'],
 'Full role x operation SQL/API denial matrix; privileged RPC regression suite', 'Forward restrictive fix; never rollback to permissive policies to restore convenience', []),
('MP-07','Repair bootstrap, routing and existing device layouts',['MP-03','MP-08'],'deep','P0','G1',
 ['src/components/app/','src/store/ops-runtime.tsx','src/adapters/','src/lib/screens.ts','src/app/*/page.tsx'],
 'Single initialization coordinator hydrates real role/data, routes and selected IDs; preserve drafts and sheet state; select existing mobile/tablet/desktop layouts from viewport; define missing-prerequisite behavior.',
 ['26 direct paths render the correct content after hydration/reload','Back/Forward and selected order/batch identity work without losing draft','No public owner/demo bootstrap; locked layouts preserved; approved exceptions only'],
 'Route interaction E2E; role bootstrap; real viewport screenshots and draft reload tests', 'Revert adapter behind feature flag; never fall back to live demo owner mode', ['DP-00']),
('MP-08','Complete session lifecycle and staff provisioning',['MP-04','MP-06'],'deep','P0','G1',
 ['functions/api/v1/session/','src/app/sign-in/','src/lib/supabase/','src/contracts/','ops/staff/','tests/integration/auth/'],
 'Implement BFF secure sessions, CSRF, refresh/logout, safe return path, active profile, account recovery and manual no-email staff onboarding; disable live demo fallback.',
 ['Expired/revoked session fails closed; no refresh token/service key in browser storage','Helper/support restrictions hold on refresh and role change','Owner-assisted provisioning/recovery and provider MFA/recovery rehearsed'],
 'Auth/API security integration; browser reload/logout/CSRF/open-redirect tests', 'Disable affected sign-in command; owner recovery procedure; never bypass authentication', ['DP-05']),
('MP-09','Persist catalog, settings and reference masters',['MP-05','MP-06','MP-08'],'standard','P0','G2',
 ['src/domain/catalog/','src/adapters/catalog/','functions/api/v1/catalog/','supabase/migrations/','tests/integration/catalog/'],
 'Map all 21 settings plus non-config preferences, product/price/recipe/supplier versions, public projections and effective-date semantics; replace constants only through adapters.',
 ['Owner edits persist across devices/reload','Known-key/range/unit validation and version conflict enforced','Public catalog excludes private cost/config; historic references remain valid'],
 'Master-data CRUD/version/role tests; all-setting round trips; port gate', 'Restore prior published version via command; do not delete history', ['DP-04']),
('MP-10','Implement authoritative customer order and capacity',['MP-07','MP-09'],'deep','P0','G2',
 ['src/domain/orders/','src/contracts/orders.ts','functions/api/v1/orders/','src/adapters/orders/','src/lib/rules/capacity.ts','supabase/migrations/','tests/integration/orders/'],
 'Online checkout with server prices and frozen commercial snapshots; pending claims do not reserve; atomic confirm capacity command prepared for payment workflow; idempotency and stable IDs.',
 ['Repeated create key yields one order; changed payload conflicts','No client price/status/role accepted as authority','Actual status membership matches engine; normal final-unit race permits one, explicit owner overage separately audited'],
 'UAT-01/14 subset; 20-way real DB capacity race; price snapshot and malformed input tests', 'Disable intake; preserve created records and reconcile; no destructive rollback', ['DP-01','DP-02','DP-04']),
('MP-11','Implement real private attachments',['MP-08','MP-10'],'deep','P1','G2',
 ['functions/api/v1/uploads/','src/domain/attachments/','src/adapters/uploads/','supabase/migrations/','tests/integration/uploads/'],
 'Replace simulated attach/done behavior with staged private upload/finalization, magic-byte/dimension/size validation, signed reads, ownership and orphan cleanup.',
 ['Customer proof attaches to only its intended order','HTML/SVG/oversize/wrong-type/foreign access denied','iPhone file/camera path tested or approved actionable fallback; failed upload never says done'],
 'Upload abuse API suite; iPhone proof UAT; quota/orphan retry tests', 'Disable new upload intents, preserve finalized files and metadata', ['DP-00']),
('MP-12','Persist payment review, balances and refunds',['MP-10','MP-11'],'deep','P0','G2',
 ['src/domain/orders/','src/domain/reporting/','src/adapters/orders/','functions/api/v1/orders/','supabase/migrations/','tests/integration/payments/'],
 'Owner-verified payment commands, duplicate-ref warnings, short/overpayments, rejection/reopen, refunds and immutable source-linked posting; UI remains unchanged.',
 ['Proof is not auto-verification; balance and verified receipts reconcile','Refund never exceeds actual refundable amount; pre/post-close recognition no double count','Stale or duplicate command cannot repeat payment/refund'],
 'UAT-02/04; role, concurrency and money boundary tests', 'Suspend payment mutation; source-linked compensating commands, no deletion', ['DP-02','DP-04']),
('MP-13','Complete packing, collection and customer lifecycle',['MP-12','MP-17'],'deep','P0','G2',
 ['src/domain/orders/','src/adapters/orders/','functions/api/v1/orders/','supabase/migrations/','tests/integration/fulfillment/'],
 'Wire prepare/pack/collect/no-show/reopen with exact packaging/baked movements and legal transitions, stable timeline and current selected record.',
 ['Packing posts exact boxes/pouches/stickers/cards once','Collection never deducts stock again','No-show/cancel/return history and food disposition follow signed policy'],
 'UAT-03/04/15; inventory conservation and stale-state tests', 'Disable affected command; reconcile source movements with compensating entries', ['DP-03','DP-07']),
('MP-14','Complete secure status, lookup and customer communications',['MP-10','MP-11','MP-08'],'deep','P0','G2',
 ['src/domain/orders/','functions/api/v1/orders/','src/adapters/customer/','src/lib/messaging/','tests/integration/customer/'],
 'Capability-scoped status and approved recovery; replace fake link/copy/send outcomes with actual user-initiated actions; optional mail only after independently verified free setup.',
 ['No low-entropy identifier exposes orders','Expired/revoked/missing capability has safe approved state','Copy/share is user initiated and accurate; automated channel claims match installed integration'],
 'UAT-01/13; enumeration, referrer/log, token and clipboard/share tests', 'Revoke affected capabilities; safe manual verification channel', ['DP-01','DP-00']),
('MP-15','Implement operational ledger and reproducible reports',['MP-12','MP-16'],'deep','P0','G2',
 ['src/domain/reporting/','src/adapters/reporting/','functions/api/v1/reports/','supabase/migrations/','tests/integration/reporting/'],
 'Source-linked expenses/draws/reversals, drop-close recognition, period boundaries, historical snapshots and exports; separate cash, revenue and cost estimates.',
 ['Every displayed total reconciles to source cents and period','No double expense from receipt plus ingredient consumption','Undo is compensating; categories/history/closed periods and tax assumptions explicit'],
 'UAT-04/09/14/15; report golden ledger and export reconciliation', 'Revert projection version; preserve ledger; correct via linked entries', ['DP-04','DP-06']),
('MP-16','Implement procurement, inventory and stock counts',['MP-09'],'deep','P0','G2',
 ['src/domain/inventory/','src/adapters/inventory/','functions/api/v1/inventory/','supabase/migrations/','tests/integration/inventory/'],
 'Movement ledger, lots/units/latest-paid costs, grocery offer normalization, atomic receipt/expense, waste/adjustment and resumed stock counts.',
 ['No silent overwrite/negative or mixed-unit inventory','Partial receipt and duplicate retry post exactly once','Count conflict preserves intervening movements; old stock expiry not reset by new receipt'],
 'UAT-03/08; unit conversion/property and receipt/count race tests', 'Freeze affected location; recount and compensate, never overwrite history', ['DP-03','DP-07']),
('MP-17','Implement recipe versions, dough and production genealogy',['MP-16','MP-10'],'deep','P0','G2',
 ['src/domain/production/','src/adapters/production/','functions/api/v1/production/','supabase/migrations/','tests/integration/production/'],
 'Versioned recipe drafts and lots, ingredient issue, independent dough rest times, bake output/rejects, costs and traceability; preserve focus/resume experience.',
 ['Demand/baked/dough calculations use allocatable stock and correct statuses','Batch retries cannot double consume or produce','Trace ingredient lot forward and batch backward; hold/expiry policies enforced'],
 'UAT-03/07/08; batch conservation/version/rest/expiry tests', 'Stop new batch command; reconcile WIP and source movements before re-enable', ['DP-07']),
('MP-18','Create one-device allocation and durable offline sale',['MP-17','MP-08'],'deep','P0','G3',
 ['src/lib/offline/','src/store/ops-runtime.tsx','src/adapters/events/','src/domain/events/','supabase/migrations/','tests/integration/offline/'],
 'Online event/device enrollment, baked and packaging allocation/price snapshot, one-writer epoch; move sale/stock/packaging/cash change into one IDB transaction before success; preserve distinct bazaar packaging rules and approved deficit policy.',
 ['IDB abort/quota failure preserves cart and cannot claim recorded','Stable UUID/full client identity survives reload, void and display-ID reuse','Other channels cannot sell offline allocation; preparation and expiry enforced'],
 'UAT-05/10; terminate-before/after-commit, double-tab and baked/packaging allocation tests', 'Disable new event prep; preserve/export pending queue and allocation ledger', ['DP-00','DP-03','DP-05']),
('MP-19','Implement atomic authoritative sale replay',['MP-18','MP-06'],'deep','P0','G3',
 ['functions/api/v1/sync/','src/contracts/sync.ts','src/domain/events/','supabase/migrations/','tests/integration/sync/'],
 'Bounded partial-result intake, event-price recomputation, actor/device/epoch checks, key/hash idempotency and transactional lines/stock/ledger/audit.',
 ['Duplicate/lost-response replay creates one complete sale','Changed hash or unauthorized event is rejected/quarantined','Mixed batch accepts valid independent rows and returns exact matching acknowledgments'],
 'UAT-05/10; SQL races, malicious totals, malformed batch and CPU checks', 'Pause sync writes; never delete queue; retain compatibility/reconciliation path', []),
('MP-20','Reconcile queue, reversals and event closeout',['MP-19','MP-15'],'deep','P0','G3',
 ['src/lib/offline/','src/store/ops-runtime.tsx','src/domain/events/','functions/api/v1/events/','public/sw.js','tests/integration/events/'],
 'Shared versioned page/SW protocol, exact ACK projection, lease/backoff/status IDs, void dependencies, cash/stock closeout and new-epoch reopening.',
 ['Empty/skipped/foreign ACK cannot mark any unacknowledged sale synced','5-of-10 stock example and repeated close/reopen conserve quantities','Expired/revoked device sale facts survive for owner reconciliation'],
 'UAT-05/10/15; concurrent flush, partial ACK, reversal order and closeout tests', 'Stop new closes/reallocations; export queue; replay only verified identities', ['DP-05','DP-07']),
('MP-21','Ship version-safe PWA and Apple offline behavior',['MP-20','MP-07'],'deep','P0','G3',
 ['public/sw.js','public/manifest.webmanifest','src/lib/offline/','src/components/app/','src/app/layout.tsx','tests/e2e/'],
 'Complete versioned asset caching, foreground/resume sync, safe update handshake and old-protocol support; physical Apple installation/storage/logout behavior.',
 ['Airplane-mode reopen executes cached app and recovers real queued sale','New release with pending queue cannot destroy or strand it','No private API/navigation response cached; device zoom/keyboard/safe-area tests pass'],
 'UAT-10/12; cold offline/reload/SW-upgrade/eviction simulation and real iPhone', 'Serve previous compatible assets; retain v1 sync; no blanket cache/IDB clear', ['DP-00']),
('MP-22','Implement privacy lifecycle, safe exports and retention',['MP-11','MP-14','MP-15'],'deep','P0','G4',
 ['src/domain/privacy/','functions/api/v1/operations/','supabase/migrations/','src/lib/observability/scrub.ts','tests/integration/privacy/'],
 'Verified access/correction/erasure workflow, legal holds, contact/attachment/log minimization, tombstones for restores, safe role exports and scrubber fixes.',
 ['Retention command cannot be invoked publicly or with arbitrary unsafe policy','All contact copies/objects/logs covered; retained money reconciles','Canary PII/secrets absent from logs/export roles; backup restore reapplies deletion policy'],
 'SEC-02/10/16 regression; UAT-06/11; privacy inventory and deletion tests', 'Disable automatic purge; preserve legal holds and tombstone ledger; restore only controlled evidence', ['DP-06']),
('MP-23','Build and rehearse independent backups and recovery',['MP-05','MP-22'],'deep','P0','G4',
 ['ops/backup/','ops/restore/','docs/RUNBOOK.md','tests/integration/recovery/'],
 'Encrypted database plus objects/config/version manifests, independent existing storage, key recovery, safe restore and newest-write reconciliation.',
 ['Restore into isolated target reproduces counts/cents/stock/object hashes','Auth and managed-schema exclusions documented and recovered safely','Measured RPO/RTO, failed-backup detection and key access satisfy operator policy'],
 'UAT-11; missing-object/corrupt-export/key-unavailable/restore-tombstone drills', 'Keep previous verified backup tooling and archives; never overwrite production as first test', ['DP-10']),
('MP-24','Replace simulated administration, health and integration claims',['MP-08','MP-23','MP-15'],'standard','P1','G4',
 ['src/adapters/operations/','src/lib/messaging/','functions/api/v1/operations/','src/domain/notifications/','src/domain/form-queue/','tests/integration/operations/'],
 'Real backup/readiness/status projection, notifications/preferences, form queue source/import controls, report-problem/export, staff/retention/storage controls and manual messaging procedures.',
 ['Every settings/health/notification/form action in audit 01 has durable outcome or approved explicit unavailable/manual path','Support projection has no customer/money data','No fake success timer remains reachable in production adapters'],
 'Audit 01 action closure checklist; UAT-06/15; real job failure and preference tests', 'Disable failing integration path; retain local drafts and truthful status', ['DP-00','DP-05']),
('MP-25','Complete performance, accessibility and security release checks',['MP-21','MP-24','MP-03'],'deep','P0','G4',
 ['tests/','scripts/','src/adapters/','src/components/ui/','docs/master-plan/'],
 'Measure representative load/query/bundle/device performance, all-role abuse tests and WCAG/VoiceOver/keyboard; fix behind adapters or obtain narrow protected exceptions.',
 ['Budgets in architecture measured with environment/profile evidence','No unresolved P0/P1 security/data/accessibility blocker','All routes and 33 sheet kinds covered; public/private bundles and headers audited'],
 'verify:release once implemented; k6 staging; physical Apple/axe/visual; ASVS matrix', 'Revert performance-only patch if needed; never loosen security/port gates', ['DP-00','DP-08']),
('MP-26','Owner UAT and mock cutover',['MP-25','MP-13','MP-14','MP-15','MP-17','MP-20','MP-22','MP-23','MP-24'],'deep','P0','G4',
 ['docs/uat/','docs/runbooks/','docs/evidence/','tests/fixtures/'],
 'Execute all 15 acceptance journeys with owner/baker/helper/bookkeeper as relevant; dry-run setup, manual fallback, recovery and timing.',
 ['All UAT cases have exact candidate evidence and accountable signoff','Zero unresolved release-blocking decisions/defects','Mock cutover and rollback handle new writes and unsent offline sales'],
 'UAT-01 through UAT-15; full release verification on exact candidate', 'Remain in staging; correct defects and rerun affected journeys', ['DP-00','DP-01','DP-02','DP-03','DP-04','DP-05','DP-06','DP-07','DP-08','DP-09','DP-10']),
('MP-27','Clean production bootstrap and controlled launch',['MP-26'],'deep','P0','G5',
 ['ops/bootstrap/','docs/releases/','docs/runbooks/'],
 'Load approved configuration/opening balances without demo activity; verify actual QR/account details, privacy/BIR use, operator backups and target host; execute owner-authorized cutover.',
 ['Zero demo orders/ledger/events in production; opening stock/cents reconcile','Exact release/schema and go/no-go approval recorded','Live smoke and controlled transaction verified; rollback and operator contact available'],
 'Production-safe read-only smoke plus explicitly authorized controlled transaction', 'Close ordering; revert compatible app; preserve/reconcile new writes before restore', ['DP-06','DP-07','DP-10']),
('MP-28','Hypercare exit and repeatable maintenance',['MP-27'],'standard','P1','G5',
 ['docs/operations/','docs/state/','docs/master-plan/'],
 'Observe two drops and one bazaar, reconcile and resolve defects, train operator, establish monthly review and reusable learning.',
 ['Two complete drops and one event have no unexplained stock/money variance','Restore/access/quota reviews and support handover complete','No unresolved P0/P1; residual limitations explicitly owned'],
 'Operational reconciliation and measured service/backup evidence', 'Extend hypercare or suspend affected function; preserve records', []),
('AR-00','Specify runner permission and provider adapters', ['MP-00'],'deep','P1','GA',
 ['tools/agent-runner/spec/','docs/master-plan/templates/'],
 'Later phase: approve local runner scope, subscription-only providers, model resolution, CLI event contracts, worktree and external-action policy.',
 ['Exact installed CLI flags and account model entitlement verified','No API billing/extra credits/permission bypass path','User-approved activation boundary and stop control specified'],
 'Contract fixture review and no-spend preflight design', 'Keep runner disabled', []),
('AR-01','Implement durable journal and local retrieval',['AR-00'],'deep','P1','GA',
 ['tools/agent-runner/journal/','tools/agent-runner/index/','tests/runner/'],
 'SQLite authoritative journal/task state, atomic checkpoints, JSONL export and FTS5 dependency/evidence retrieval outside OneDrive.',
 ['Crash/disk-full/partial-write cannot falsely complete task','Secret denylist and source hash invalidation tested','100k-event retrieval and append latency meet targets'],
 'Fake-provider event replay, storage crash and benchmark tests', 'Restore journal backup, rebuild derived index, leave tasks paused', []),
('AR-02','Implement bounded prompt assembly and model selection',['AR-01'],'standard','P1','GA',
 ['tools/agent-runner/prompts/','tools/agent-runner/providers/','tests/runner/'],
 'Use templates/task DAG/context index; record requested/resolved model and effort; schema validate provider outputs and safe command args.',
 ['Correct owned files/constraints/decisions in each packet','Untrusted retrieved text cannot mutate authority','Unsupported/paid model fails closed; terminal results verified'],
 'Golden prompt snapshots, malicious source fixtures, model/CLI compatibility tests', 'Manual prompts remain available; runner paused on unknown adapter output', []),
('AR-03','Implement leases, supervisor and quota waits',['AR-02'],'deep','P1','GA',
 ['tools/agent-runner/supervisor/','tools/agent-runner/scheduler/','tests/runner/'],
 'One writer, process-group lifecycle, fencing leases, supported quota observation and bounded wait/resume on exact session; no account-limit circumvention.',
 ['Duplicate wake/stale PID/live prior process cannot duplicate work','Quota/auth/outage/model errors classified separately','Reset unknown stays explicit; no extra spend; user stop persists'],
 'Fault matrix in 09 with fake provider; clock/sleep/restart/quota simulations', 'Disable scheduled entry, stop owned process safely, preserve journal', []),
('AR-04','Implement Git checkpoint, review and action reconciliation',['AR-03'],'deep','P1','GA',
 ['tools/agent-runner/git/','tools/agent-runner/recovery/','tests/runner/'],
 'Exact branch/diff/evidence checkpoints, pre/post action IDs, worktree ownership and independent review gate; no implicit merge/deploy.',
 ['Crash after external commit queries actual state before retry','User dirty edits and other worktrees preserved','Evidence invalidates on code/schema/plan drift'],
 'Git dirty/conflict/rebase and unknown-outcome simulator tests', 'Pause with recoverable branch/checkpoint; no force reset', []),
('AR-05','Validate runner with harmless end-to-end tasks',['AR-04'],'deep','P1','GA',
 ['tests/runner/','docs/runner-evidence/'],
 'Run simulator matrix then permitted docs-only task across crash/restart and a real quota/eligibility observation; measure usage/memory/retrieval.',
 ['All 09 fault cases have expected durable state','No duplicate mutation/secret leak/extra billing','No unattended permission approval; stop/pause/restart verified'],
 'Full runner suite and harmless local trial; no production credentials', 'Keep disabled and use manual templates', []),
('AR-06','Owner activation and reuse packaging',['AR-05'],'standard','P1','GA',
 ['tools/agent-runner/install/','docs/runner-runbook/','docs/project-profiles/'],
 'Only after explicit later authorization: show concrete schedule/actions, install OS startup job hidden, provide uninstall/stop, export reusable project profile without secrets.',
 ['User approved exact scope and scheduler','New project starts with discovery and simulator, not copied business authority','Quota/reset/maintenance policy and local-machine availability understood'],
 'Startup/sleep/offline/stop/uninstall acceptance in authorized local environment', 'Unregister only owned job; retain code/journal/backups unless separately requested', [])
]

tasks=[]
for id,title,deps,model,priority,gate,files,scope,acceptance,checks,rollback,decisions in rows:
    tasks.append(dict(id=id,title=title,status='planned',depends_on=deps,gate=gate,priority=priority,
      model_class=model,owner='unassigned',owned_paths=files,decision_gates=decisions,scope=scope,
      acceptance=acceptance,verification=checks,rollback=rollback,
      read_first=['MASTER-PLAN.md','docs/master-plan/07-build-backlog.md','docs/master-plan/06-domain-contracts.md'],
      evidence=[],definition_of_ready='Split into <=400-line implementation slices; resolve relevant decisions, file ownership, environment and test oracle first.',
      authorization='Planning record only; product build/runner activation follows current user authorization and project rules.'))
(root/'tasks.json').write_text(json.dumps({'schema_version':1,'baseline_date':'2026-09-07','tasks':tasks},indent=2)+'\n',encoding='utf-8')

header='''# Build backlog and execution protocol

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
'''
parts=[header]
for t in tasks:
    parts.append(f"\n### {t['id']} — {t['title']}\n\n**{t['priority']} · {t['gate']} · {t['model_class']} · planned**\n\nDependencies: {', '.join(t['depends_on']) or 'none'}. Decision gates: {', '.join(t['decision_gates']) or 'none'}.\n\nScope: {t['scope']}\n\nOwned paths (proposed files may not exist yet): "+', '.join('`'+p+'`' for p in t['owned_paths'])+'.\n\nAcceptance:\n\n'+''.join('- '+a+'\n' for a in t['acceptance'])+f"\nVerification: {t['verification']}.\n\nRollback: {t['rollback']}.\n")
(root/'07-build-backlog.md').write_text(''.join(parts),encoding='utf-8')
prompts = root/'prompts'
prompts.mkdir(exist_ok=True)
links=[]
for t in tasks:
    content=f"# {t['id']} — {t['title']}\n\nUse this prompt in the current Happy Cookie workspace when this work is authorized. This is a planned work package, not a claim of completion.\n\nRead MASTER-PLAN.md, applicable AGENTS.md/CLAUDE.md, docs/master-plan/templates/task-prompt.md, docs/master-plan/07-build-backlog.md and record {t['id']} in docs/master-plan/tasks.json. Then read the relevant sections of 06-domain-contracts.md and current source/tests for the owned paths.\n\nObjective: {t['scope']}\n\nPrerequisites: {', '.join(t['depends_on']) or 'none'}. Resolve decisions: {', '.join(t['decision_gates']) or 'none'}. Model class: {t['model_class']}; validate actual subscription entitlement and effort using 09-agent-operating-system.md.\n\nOwned paths: "+', '.join('`'+p+'`' for p in t['owned_paths'])+'.\n\nAcceptance:\n\n'+''.join('- '+a+'\n' for a in t['acceptance'])+f"\nVerification: {t['verification']}. Application changes also require pnpm verify and production build. A missing environment is not a pass.\n\nRollback: {t['rollback']}.\n\nSplit into small suffix slices with exact ownership and tests before coding. You are not alone in the workspace: preserve unrelated changes. The UI/UX is locked and current records are demo fixtures. Launch has one offline sales device. No paid tools/API fallback, production reset/deployment, external messaging or automatic runner activation is implied. Respect pending permission/business decisions. Finish with actual evidence and a checkpoint, not a claim based on intention.\n"
    (prompts/f"{t['id']}.md").write_text(content,encoding='utf-8')
    links.append(f"- [{t['id']} — {t['title']}]({t['id']}.md)\n")
(prompts/'README.md').write_text('# Generated task prompts\n\nGenerated from the canonical work-package catalog. Do not edit these independently; update the catalog generator and regenerate. MP tasks build the product later; AR tasks build the runner only after later authorization.\n\n'+''.join(links),encoding='utf-8')
print(f'Generated {len(tasks)} planned work packages')
