# Validation, setup, cutover and operations

Nothing in this checklist is recorded as passed unless linked to evidence for the actual candidate. The current build is red. Launch requires real-backend and physical Apple-device tests in addition to the already-completed source/browser audit.

## Environment setup, in order

1. Recover intended Git history/remotes or document that this is an unversioned delivery. Hash/archive the current source and approved design. Use a working checkout outside OneDrive for active Git/database/runner state; keep the supplied folder/reference archive intact. Do not move/delete the user's files implicitly.
2. Pin supported Node, pnpm, exact dependency lock, Supabase CLI, browser packages and Docker image. Run installation with reviewed lifecycle scripts and record versions/license inventory. Verify on both Windows development host and intended Mac development host if both will be maintained. Local Docker usage/license and hardware capacity must be checked; open-source alternatives on existing hardware remain available if Desktop terms are unsuitable.
3. Repair type/lint/build failures without weakening strictness, skipping build errors or changing protected copy/styles. Establish the real test commands before using task acceptance shorthand. Check secret exposure by filenames/patterns and canaries without printing secret values.
4. Start disposable local Supabase. Inspect migration history and fix the unapplied baseline only through the approved MP-05 path. A new later migration cannot repair syntax that prevents the first migration from loading. If any migration has been applied elsewhere, obtain its history and preserve it; create a separate clean bootstrap/baseline route and forward repair for deployed systems. Never mark a failed migration applied merely to pass reset.
5. Create provider accounts/projects only during authorized implementation setup. Owner holds account ownership/MFA/recovery codes. Production and staging have distinct names, refs, secrets and callback URLs. Build scripts require explicit environment/ref allowlists; staging tests reject production refs.
6. Set only required secrets: server Supabase URL/key, staff-session configuration and encryption/CSRF secrets as designed; no browser service credentials. Client public config contains only non-secret public runtime values. Document variable names, purpose, owner, source and rotation; secret values live outside Git, logs, screenshots and agent memory.
7. Prove Cloudflare export/API deployment, origin/cookies/headers, private caching and CPU constraints. Use free provider hostname. Configure build/runtime vars separately. Do not follow old Vercel deployment instructions.
8. Provision demo identities and synthetic edge-case fixtures in staging only. Configure private storage bucket policies, upload limits, default function privileges, schema grants and owner role. Verify default-deny behavior before live credentials can transact.
9. Set spending-stop/usage controls and operator alerts; no auto-upgrade. Configure independent encrypted backup destinations and execute a restore drill. Domain/SMTP are optional; no signup/invitation flow may silently rely on default Supabase mail.

## Verification layers

| Layer | Required evidence | Failure it catches |
|---|---|---|
| Source/port | Existing gates plus AST/style/handler comparison; deliberate protected exceptions recorded; exact Docker screenshot baseline | Accidental redesign or weak count-only checks |
| Types/build/lint | `pnpm verify`, production build, no skipped strict checks | Broken inferred contracts, incompatible versions/config |
| Domain | Golden fixtures and boundary/property tests for money, capacity, snapshots, states, units and conservation | Plausible but wrong bookkeeping/inventory rules |
| SQL integration | Fresh migration + generated types, constraints/functions and denied role matrix against real Postgres/Supabase | Invalid SQL, incorrect grants/RLS, transactional partial writes |
| API | Real session, CSRF, size/rate limits, safe errors, exact idempotent responses and stale-version conflicts | Bypass through direct HTTP/SQL |
| UI | Actual user interaction, state-specific locator assertions, no zero-test branches, correct URL and selected record after reload | Home rendering under every route, blank panels, misleading success |
| Offline | Real service worker + IDB, forced abort/crash/reload, lost ACK, expired auth, replay/void/close | Lost/double sales and stock inflation |
| Security/privacy | Applicable ASVS requirement evidence; role/BOLA/lookup/proof/secret/PII negative cases | Cross-role data exposure and exploit regressions |
| Device/accessibility | Physical iPhone/iPad/Mac Safari; keyboard, VoiceOver, zoom, virtual keyboard and installation | Issues emulation/static screenshots cannot prove |
| Load/recovery | Planned peak tests, quota/timeout fault injection, encrypted restore and reconciliation | Slow/fragile free hosting and useless backups |

Current existing commands are listed in `package.json`. Proposed additions, to implement in MP-03/05/25, are `test:db`, `test:api`, `test:security`, `test:offline` and `verify:release`; they do **not** exist merely because named here. `verify:release` must invoke required existing and new suites with environment guards and fail on unavailable dependencies. No test auto-skips because a button/account/fixture is missing.

Required CI ordering: dependency lock/install → port/engine → type/lint/unit → production build → isolated DB/API/security → critical E2E → visual comparison. Weekly or release candidate: full device/manual matrix, load, restore. Pin actions by reviewed commit SHA, least-privilege job permissions, no untrusted PR secrets, no production DB in CI. Heavy image artifacts are short-lived; preserve hashes and small reports long-term. Use local Linux execution when private Actions quota is insufficient, with equivalent evidence.

## Golden acceptance pack

| ID | Journey and exact outcome | Owner |
|---|---|---|
| UAT-01 | Shopper adds mixed cookies, enters contact/payment claim, uploads actual proof, submits; server returns one order/capability; refresh on another browser sees only that order; repeated submit returns same result | Owner + technical maintainer |
| UAT-02 | Owner checks real receiving-wallet evidence in staging simulation; duplicate/short/overpayment and rejected proof paths; balance correct; illegal transitions denied; capacity overage needs explicit owner confirmation | Owner/bookkeeper |
| UAT-03 | Grocery shortage → partial receipt → updated latest cost → mix → rest → bake with rejects → pack → collect; raw/dough/baked/packaging/source costs reconcile | Owner/baker |
| UAT-04 | Cancel before and after drop close; refund never exceeds verified receipts; no double revenue/refund; food return disposition explicit | Owner/bookkeeper |
| UAT-05 | Prepare one phone with 5 of 10 baked units; airplane mode; two sales, one waste, two return; reload between actions; reconnect with lost response/replay; final central 7, sold 2, waste 1, event 0 | Bazaar operator + maintainer |
| UAT-06 | Helper cannot read P&L/customer books; support cannot read sale amounts, contacts, proof or exports; direct URLs/API/SQL all denied; revoked staff cannot issue new commands | Maintainer |
| UAT-07 | Select an ingredient receipt lot; identify every derived batch/order/event; select finished batch and recover source lots; missing/held/expired lot fails safe; manual recall worksheet is usable | Baker/food-safety owner |
| UAT-08 | Count with simultaneous receipt; resumed count/draft retains values; final variance preserves intervening movement; repeated receipt/production command never doubles stock | Owner |
| UAT-09 | Recipe/price/category/settings change; fulfilled order and closed report keep frozen cents/quantity; current display label and audit history are consistent | Bookkeeper |
| UAT-10 | Partial sync, 401, 429, 503, malformed ACK, IDB quota error, expired allocation and lost device; no unsent row removed; safe manual recovery shown | Maintainer/bazaar operator |
| UAT-11 | Backup database, objects and versions; restore to isolated target; reconcile source totals and object hashes; replay deletion tombstones; prove recovery duration and actual RPO | Maintainer/owner |
| UAT-12 | Fresh iPhone install and Mac browser use; direct links/back/reload; keyboard/zoom/VoiceOver; no clipped controls; upgrade while queue nonempty defers safely | Owner/maintainer |
| UAT-13 | Outage during public checkout preserves draft and never says received; status capability expires safely; recovery cannot enumerate by email/mobile/ref | Maintainer |
| UAT-14 | Day/month/drop/year boundary in Manila; schedule changes, extended/closed/soldout and explicit override; identical report/export date boundaries | Owner/bookkeeper |
| UAT-15 | Form item accepted twice, expense Undo after server commit, repeated drawer close, reopened event, stale edit; one source effect and visible correction history | Owner |

For each test store scenario/data seed ID, code+schema version, OS/browser versions, role, timestamp, expected quantities/cents/status, actual result, sanitized log/screenshot and defect links. Do not attach real proof/contact data to the public repository or AI memory. A screenshot is secondary evidence when the invariant is database state.

## Backups and recovery

Supabase Free requires your own export discipline. Database exports alone do not contain Storage object bytes; back up objects and metadata separately. Auth users, roles/extensions and provider-managed schemas need supported export/restore procedures tested in local Supabase, not blind assumptions that one SQL dump restores a hosted account. Record exactly what the chosen CLI command includes/excludes and separately document staff account re-provisioning/session revocation when necessary. [Supabase backups](https://supabase.com/docs/guides/platform/backups)

Backup manifest: backup ID; UTC start/end; project/environment fingerprint; code/schema/CLI versions; database file hash; object key/size/hash list; covered business-date range; row counts; cents totals by source/period; stock totals by item/location/status; failed objects; encryption key identifier (never key); destination; verification result. Mark success only after every required component finishes and checksums verify. Encrypt before copying to independent existing storage. Keep recovery key off the backed-up device and outside provider accounts. A synchronized copy that propagates deletion is not the only backup.

Default target policy, subject to actual volume/storage: daily full logical export, pre-release and pre/post-event backups; 7 daily +4 weekly +3 month-end copies where existing storage supports it; legal financial retention is separate. Test quarterly restores and after backup/schema changes. Use an existing independent drive/account with space; if unavailable, backup readiness is blocked—do not invent a free unlimited destination.

RPO/RTO targets: hosted records RPO <=24h under daily backup, <=1h around active trading only if the operator actually runs/verifies more frequent exports; RTO <=4h for a rehearsed restore during staffed hours. These are internal targets, not provider SLAs. Offline unsent data has no server RPO guarantee; physical-device loss can lose all unexported sales. Maintain paper receipt/cash tally or periodic verified export/sync and record the residual risk in event readiness.

Restore procedure: stop writes/announce fallback; preserve current state and failing release; identify last verified complete backup; restore to isolated local/staging target; validate grants/migrations/secrets; restore objects; reconcile IDs, cents, stock and attachments; apply deletion tombstones/legal holds; assess newer writes and replay only idempotent validated commands; obtain owner cutover decision; point clients at recovered service; force session refresh; smoke-test both roles and one transaction. Never overwrite the live database first and discover missing objects later.

## Clean bootstrap and cutover

The user confirmed fixtures, so no live-book migration is required. Preserve demo seed for automated tests; live startup requires an explicit `production-empty` configuration that cannot call demo reset/import. Opening inventory/ledger is not copied from fictional constants. Owner supplies counted stock, lots/expiry, costs, approved catalog, recipes, schedule, payment QR account names, staff roster and any genuine opening balances. Record approvals without storing secrets in Git. Verify QR ownership manually; images rendering correctly does not prove their destination is correct.

Cutover rehearsal checklist:

1. Candidate release/code hash, dependency lock, schema version and all G0–G4 evidence fixed.
2. Required DP decisions resolved; privacy notice/contact, intended accounting/BIR use and food SOP recorded; no unsupported compliance claim.
3. Owner, helper and support access tested; recovery keys and manual support route accessible.
4. Clean live project/objects/bootstrap reviewed; zero demo orders/payments/events; opening totals reconciled.
5. Backup/restore complete; pause ordering if any safety gate fails; manual/paper ordering process ready.
6. Publish during a quiet agreed period, then test real domain/provider hostname, HTTPS, secure headers, minimal public catalog and role isolation.
7. Perform a marked controlled transaction with the owner's authorization; reconcile payment/stock/correction so it does not contaminate business totals.
8. Prepare and test the event phone before the first bazaar; keep old app assets compatible while pending queues exist.
9. Owner records go/no-go against exact evidence, then announce availability through their own normal channels. Agents do not send unsolicited customer messages.

Rollback is not `git revert` alone. Prefer previous static/API release while keeping a backward-compatible schema. Use expand/migrate/contract changes; retain v1 sync acceptance until all prepared devices have reconciled. If a release has created business writes, stop new writes and reconcile/replay before any database restore. No destructive down migration as routine rollback. An incompatible offline client remains in a recoverable pending state with a tested export path.

## Daily/weekly/monthly operation

| Cadence | Operator action | Evidence/alert |
|---|---|---|
| Before drop | Check real host/database readiness, menu/schedule/payment details, quota and backup freshness | No paused DB or stale schedule; owner ready |
| Before event | Sync all queues, allocate one device, verify offline reopen/IDB/battery/storage/paper tally | Event preparation receipt and zero unresolved prior commands |
| During event | Watch pending count/oldest age, cash/stock; sync whenever possible; do not clear browser data | Queue/local commit errors prompt manual fallback |
| End event/day | Reconcile receipts/sales/refunds/stock, resolve rejects, close once, verify backup | Zero unexplained cents/quantity mismatch |
| Weekly | Dependency/security advisory review, failed job/queue review, quota trend, staff changes | P0 security/data defect disables affected public mutation until fixed |
| Monthly | Access review, retention/legal hold check, report close, restore spot check, vendor quota/terms review | Signed checklist and source refresh |
| Quarterly / major change | Full restore, incident drill, performance and account recovery test; plan/reuse review | Measured RPO/RTO and updated runbooks |

Health states must derive from actual checks: liveness says process is responding; readiness checks database/required configuration; backup status comes from manifest; sync status comes from ID/hash reconciliation. Monitoring shouldn't create artificial traffic to imply a paused free project has guaranteed uptime. Supabase's inactivity behavior and recovery must be part of pre-opening checks. [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

Incidents: P0 data loss/exposure/wrong-money/unauthorized write → stop affected writes, retain evidence, owner notified, investigate and reconcile; P1 unavailable checkout/sync → manual fallback and bounded recovery; P2 noncritical rendering/report defect → logged fix with workaround. Response times depend on the named person's availability. No unstaffed 24/7 SLA.

Hypercare exits after at least two complete preorder/drop cycles and one reconciled bazaar, no unresolved P0/P1 defect, successful restore, normal quota headroom and owner/helper completion of their SOPs. Measure actual manual corrections, order completion, stock variance, sync lag, transaction failures and support burden; revise the backlog from evidence.
