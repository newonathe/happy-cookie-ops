# The Happy Cookie Ops: full-application remaining-work and acceptance reconciliation

> **Evidence status:** read-only remote-repository audit and analysis, anchored to the immutable Git commits and CI runs below. This is **not** a fresh local execution, hosted-data inspection, physical-device test, owner sign-off, or new implementation. It does not supersede AGENTS.md, CLAUDE.md, docs/state/current.md, docs/state/next-goal.md, docs/state/task-status.json, approved owner decisions, or newer verified evidence. **Calendar-date completion forecasts are deliberately excluded.**
>
> **Privacy:** this repository is public. This document intentionally excludes customer identities, private business inputs, transaction amounts, live retail prices, recipes, credentials, local private archive contents, and operational secrets.

## 1. Purpose, questions and precise evidence limits

This document records, in a single inspectable place, the detailed findings of a remote GitHub re-audit and the questions needed to finish the product:

1. Which code is the actual accepted/deployed product baseline, as opposed to default-branch, documentation, archived PR, and incomplete local work?
2. Which implementation and quality gates are evidenced as passed, and which acceptance claims are **not** supported?
3. How much v4 interface coverage is recorded, and why is that different from a complete business application?
4. What does each of the fourteen engineering cycles already contain? What remains, what depends on another workstream, and what is the exact closure criterion?
5. What are the priority risks, full-system journeys, business decisions, private-data boundaries, operational gates, and test-evidence gaps?
6. What work sequence is likely to reduce rework without rebuilding accepted functions?
7. What does the existing evidence justify saying about remaining effort, without inventing calendar deadlines or percentages?

**Verified by connector:** GitHub branch/commit metadata; recent PR and workflow status; exact accepted project-state files; the structured full-application tracker; v4 coverage register; current repository paths and selected source/test files; accepted prior review evidence recorded in repository. The GitHub Actions run itself—not a direct owner phone measurement—confirms successful guarded deployment.

**Not directly verified in this audit:** the user's local dirty worktree, its nine pending Sell files or stashes; live hosted customer and payment records; live Supabase rows; physical iPhone/PWA/Safari behavior; actual backup restore from privately held bytes; unaided Cine use; every numbered historical audit source; reproducibility of every prior accepted test on an independent clean checkout; every conditional state in the application. Do not silently infer these.

Every conclusion below is **source-reported**, **GitHub-confirmed**, **requires direct validation**, or **planning inference**. A source-reported test remains a recorded test, not an independently rerun test.

## 2. Exact GitHub snapshot and release lineage

| Reference | SHA / identifier | Finding and limitation |
| --- | --- | --- |
| Repository | newonathe/happy-cookie-ops | Public GitHub repository; do not commit private business or customer data |
| Current remote release branch | agent/codex/MP-04-g1-feasibility at d063be4c07a78d2802bb0a95d9ba9cabd7721653 | Latest audited branch head; contains a documentation-only follow-up merge |
| Guarded deployed **application** source | 62392e86e51360908bde9d9cbc7fe48c8dc22bb0 | GitHub release run 43844809470 completed successfully with guarded deploy |
| Follow-up PR | #83, implementation source unchanged | Added/upgraded state and next-work documents only; branch HEAD is not a separate app deployment |
| Accepted visual/financial correction | PR #82, implementation 85e75ebf, merge 62392e86 | Signed weekly net, negative-refund chart behavior, readable existing settings/frosted surfaces |
| Prior baseline | PR #81, merge 1605e589 | Inventory, Shopping and Suppliers owner interface work; prior guarded release accepted |
| Default branch | main at 5734db418c8847b334ba799324433073723a24e8 | Is not the newest accepted product branch |
| Main-to-release divergence | release branch 6 commits ahead, 0 behind main at audited refs | Do not start product continuation blindly from main |
| Latest old Claude branch | claude/dreamy-faraday-74rshc, historical continuation | Not the proper baseline without checking later integrations |
| Recorded source verification | 257 files / 4,169 passing tests / 2 TODO | Accepted local engineering checkpoint for PR #82, not a whole-product acceptance count |
| Hosted schema | 88 migrations, 180 public functions | Recorded compatible release baseline; validate again if a new schema-dependent change is proposed |
| Open GitHub PRs | #50 and #53 | #50 is evidence-only, explicitly not mergeable; #53 is an older stacked Orders read-state PR whose functionality is recorded as integrated in accepted source |

### 2.1 Release proof and why commit identity matters

Run 43844809470 for source 62392e86 shows success in its actual jobs:

- TypeScript/types, lint, formatting and unit tests;
- production build;
- browser flows;
- Storybook build;
- Docker visual regression;
- performance budget;
- release quality;
- release hold handling;
- read-only hosted migration/RPC compatibility;
- guarded Cloudflare Worker release and verification.

The follow-up PR #83 merged documentation files after that release. The comparison from 62392e86 to d063be4 shows only:

- docs/state/current.md;
- docs/state/next-goal.md;
- docs/state/current-history.md;
- docs/state/task-status.json.

**Therefore:** it is accurate to say the accepted application at 62392e86 was deployed successfully by GitHub Actions, and that the branch later received documentation updates. It is inaccurate to describe d063be4 as a separately deployed application binary without another matching deployment record.

GitHub checks are not a substitute for independent observation that a particular device loaded the new assets. Avoid saying the whole product is complete because one release passed.

### 2.2 Recent work already implemented and not to be rebuilt

The accepted ancestry contains successful work on:

- Bazaar event/day and table-stock management, protected sale paths and more usable day close;
- owner-account ownership of an open Bazaar day instead of trapping it in one browser;
- supported product types and plain items that do not consume cookie-slot capacity;
- price changes for an already started day under a controlled server contract;
- accurate centavo-based cookie cost and cost-of-cookies-sold reporting;
- practical event deletion only when the event has no actual sales;
- existing sign-out, owner flow, till redesign and menu changes;
- product image resolution, exact shop-media URL handling and permitted generated fallback artwork;
- touch targets, overflow and clipped text corrections (HCB-020–022);
- expanded order-form vocabulary, Orders board and grouped owner navigation;
- Home and Money chart/interface improvements;
- Inventory, Shopping and Suppliers interface improvements;
- monthly profit-goal setting and related order/menu schema;
- signed weekly net correction, negative refund/chart behavior, preserved settings sheet readability;
- pinned dependencies, CI protection and the accepted database migration sequence.

Concrete PR anchors: #55–#82, with the latest app release #82, documentation follow-up #83. The titles and merges are evidence of source changes and release runs; each remains subject to its stated test boundary.

Do **not** recreate these just because an older historical plan marked them open. Do **not** reapply SQL71–87. Do **not** redeploy the same source to make a progress report look active.

### 2.3 GitHub PRs that should not be treated as fresh work

**PR #50:** historical actual-application visual-capture evidence; intentionally open as evidence-only and not to merge.

**PR #53:** old stacked HCB-002a Orders read-state work. The accepted source/tracker records integration of the underlying functionality through later release/integration ancestry. Reconcile its exact code paths, not its open PR indicator; do not mechanically merge into newer runtime.

**Unaccepted local Sell work:** the current-state document reports a separate local urgent worktree and nine unaccepted Sell-related files. They are **not** established by the remote branch. Preserve and inspect the actual dirty paths locally before editing, copying, rebasing or merging. One source document calls out seven modified tracked files and two new files on a local urgent branch. The accepted owner-glass PR specifically excluded them.

## 3. Migration, schema and private business state

### 3.1 Schema migrations

The audited release tree contains **88 migration files**, ending with:

- 20260101008300_bazaar_delete_unsold.sql;
- 20260101008400_product_types.sql;
- 20260101008500_bazaar_day_prices.sql;
- 20260101008600_items_take_no_slots.sql;
- 20260101008700_profit_goal_and_menu_types.sql.

Earlier SQL71–82 cover preparation, dough-only baking, legacy write retirement, Bazaar source/transfer/settlement, return handling, labels and customer-payment reads. The latest source documents describe the 88-migration/180-public-function hosted baseline and a successful read-only schema check inside the guarded release.

**Not outstanding:** the earlier 70-to-83 cutover; the subsequent migrations ending at 87, subject to fresh hosted confirmation for future work.

**Still outstanding as necessary:** backups and restore custody, recovery drills, period/cost accounting correctness, approved business-data corrections, and any *new* migration genuinely required by remaining functionality.

The historical SQL73 hazard is worth preserving as an invariant: an older application writing fresh production through its legacy path would be incompatible with the retirement of that writer. Do not roll back a deployed frontend or server independently without verifying compatibility.

No applied migration file should be changed; use a new reviewed migration when required. Never make hosted SQL writes just because the source contains a file. A migration must pass local reset/authority/RLS/invariant checks and the specific approval boundary.

### 3.2 Business data are separate from schema

The repository contains preview/apply import contracts in SQL63 for items, prices, recipes, flavours and bookings. They are **not** a license to bulk-import historic transactions.

The standing owner decision was to avoid automatically importing spreadsheet transaction history. Preserve it until explicitly revised.

The public repository must not receive private workbook contents, individual sales, customer details, private costing sheets, actual unpublished formulas or credentials.

A planned quantity is not a physical count; a product catalogue is not proof of the current menu; a wholesale schedule does not establish retail pricing; a filled recipe does not prove a batch was baked. Corrections to actually collected money or already recorded sale prices require original transaction evidence, an approved financial adjustment type and readback reconciliation, not a destructive overwrite.

## 4. How to interpret the completion numbers honestly

### 4.1 Interface coverage: 58 Done / 4 Partial

The v4 reference coverage document contains 62 statused page entries: **58 Done and 4 Partial** (approximately 93.5% Done in that narrow register).

The four explicitly Partial entries are:

| Page / view group | Recorded partial reason | Closure boundary |
| --- | --- | --- |
| Event tools / event-tool review | Entry removal exists but no distinct Review step; owner decision pending | Confirm approved interaction and review consequential event changes |
| Customer Shop / checkout / status | Protected warm-layout customer screens work but intentionally differ from v4 mockup structure | Do not rebuild without owner authorization; verify functional customer journey |
| Cost edit / cost review | Recipe cost has Review; event cost entry lacks one | Determine whether review required; verify error and save/recovery behavior |
| People / person edit | People and access are listed; adding a person needs hosted account provisioning | Confirm supported provisioning/access and actual role authorization |

**Critical caveat:** “Done” in the file means matched on an owner preview with synthetic data. It is not physical-device, live-auth, server-mutating or owner acceptance. Current application changes may postdate individual page evidence. Do not use the fraction as an overall product-complete percentage.

### 4.2 Full engineering cycles: 0 / 14 formally closed

The structured full_application.cycles registry marks **all fourteen full_cycle_accepted flags false**. This is not evidence that all fourteen workstreams need to be built from scratch. Most have accepted local or released functionality but still lack their full-cycle completion boundary.

The older MP package tracker reports **seven complete and five in-progress historical MP packages**. These are a different plan/catalogue and cannot be translated directly into C1–C14 progress.

### 4.3 Historical findings: counts overlap and are not an outstanding backlog

The historical source collection references:

- 127 initial module/audit findings;
- 61 canonical HCB issues;
- 67 acceptance obligations;
- the v4 page/view inventory and the seven v2/fifteen v3 connected-journey obligations.

These are **overlapping registers**. They are not 127 + 61 + 67 independently unresolved bugs, and a historical issue cannot be assumed unfixed because it remains in an archived document.

The published remediation backlog contains 19 explicit HCB headings, not a complete independently validated current closure of all 61 canonical source IDs. The task-status registry specifically warns that the full numbered initial findings/obligations lists were not all located and verified.

Do not invent exact outstanding defect numbers or an overall percentage. Perform an ID-by-ID source/commit/test reconciliation and preserve statuses: confirmed fixed, fixed but missing acceptance, reproducible defect, decision-required, superseded/duplicate, and unverified.

### 4.4 Tests: high volume but incomplete business coverage

Accepted PR #82 reports pinned local verify on **257 files / 4,169 passed / 2 TODO**, plus focused, offline, builds, formatting and synthetic responsive checks. The current guarded deployment run also passed its CI jobs.

The existing full-application tracker separately describes:

- accepted native SQL and connected browser testing of dough/bake/transfer;
- exact retry/lost-ack, idempotency, role, version, concurrency and Web Locks behavior;
- customer order recovery and explicit payment confirmation tests;
- some demo E2E test runs where skips are intentional;
- original v2/v3 connected business journeys still requiring reconciliation and full coverage.

The stale top-level task-status.release_acceptance string contains an older failed E2E snapshot. Because later CI passed, this old string must **not** be described as an active failing latest run. Conversely, later green demo/browser jobs do **not** automatically settle native authenticated, hosted business, financial and iPhone conditions.

For every claim, specify exactly what ran, environment, SHA, fixture, resulting data and what it cannot prove.

## 5. Cycle-by-cycle accepted foundations and remaining work

**Status terms:** “core accepted” means the named foundation has direct source-reported local evidence; “partial” means the full workstream remains open; “formal cycle open” means its full_cycle_accepted flag is false. Current implementation takes precedence over stale per-cycle text. All fourteen full cycles remain formally open.

### C1 — Orders integration and prior PR reconciliation

**Accepted / built:** saved order pickup values; truthful Orders read-state and failures; one scoped read-state source; account/role/source retirement; exact request recovery; no stale retry or accidentally repeated response; integrated historical PR work in release ancestry. Newer Orders board implementation is also deployed.

**Remaining:** confirm original Orders read-state obligations, incomplete wording and original HCB issue mapping; reconcile the old unmerged PR #53 to current source without another cherry-pick; verify the preserved local Sell package does not regress Orders. A previously requested owner wording choice (OD-12) may still need confirmation.

**Acceptance:** one Orders source of truth under success, no orders, failed read, bad response, late response, logout/account change, reload and exact uncertain request replay; correct actual pickup and payment state; no duplicated side effect.

**Dependency:** C5 Sell; C4 data reliability; C13 connected customer journey. Avoid treating “publish old integration” as pending if the currently released source already contains it.

### C2 — Recipe-based dough preparation and dough-only baking

**Accepted / built:** independent recipe quantity and actual dough-ball count; ingredients charged/deducted once at preparation; dough-only subsequent baking; shortage refusal; actual good/reject output; source/version identity; exact replay; concurrency and legacy-writer retirement. Actual local SQL and connected browser tests are recorded.

**Remaining:** only genuine missing integration/edge cases identified through C13 and physical owner/device acceptance; unresolved separate physical dough-count correction rule remains an owner decision.

**Acceptance:** full recipe used once regardless of actual ball count; no double ingredient deduction at Bake; correct remaining dough and baked balances; one and only one financial effect per physical event; retries, version conflicts, shortages, concurrent activity and permission failures.

**Do not do:** rebuild accepted dough architecture or implement a standalone Count Dough policy without authority.

### C3 — Production workspace

**Accepted / built:** independent multi-batch work, retained inputs, explicit recipe edits/handoff, version checks, recovery after reload, real Web Lock ownership and stale session/period guards. Accepted connected source/SQL/browser testing covers representative behavior.

**Remaining:** prove any outstanding original workspace obligations in connected whole-product journeys and real intended device use; ensure later UI work has not removed pending drafts or controls.

**Acceptance:** incomplete work survives permitted navigation/reload; another tab cannot steal ownership; no late role/account callback posts production; accepted production and actual stock remain consistent.

### C4 — Data reliability and failure recovery

**Accepted / built:** multiple source/account/role scoped read guards; distinctions among unknown, zero, empty, failed and stale data; protected retry/uncertain write; customer checkout and payment source recovery; Health and Home state corrections. The HCB-004 primary catalogue-replacement issue is recorded fixed across relevant owner views.

**Remaining:** exhaustive relevant first-read failures, malformed results, return/navigation, stale response, retry, out-of-order callback and uncertain-write cases across remaining screens. HCB-004 low-priority subsections remain to be inspected, not blindly rebuilt.

**Acceptance:** an unverified value is never labelled confirmed zero or success; late work from an old identity cannot mutate the new view; successful writes are not repeated after refresh fails; actionable retry preserves user edits.

**Dependency:** almost every remaining transaction and screen; prioritize representative high-risk flows rather than repeating every previously accepted low-level test.

### C5 — Sell, payments, fulfilment and preserved local package

**Accepted / built:** order source/load correctness, explicit payment confirmation separated from proof or stage, recorded payment facts and one associated financial effect, saved pickups and improved order navigation. A large subsequent Sell UI package reportedly remains local only and unaccepted.

**Remaining engineering:** deliberately reconcile **nine local pending Sell files** against the accepted release SHA; inspect Customers dependencies and existing frosted-sheet behavior; verify packing, pickups, balance/payment status, cancellation, refund, swap, no-show, reopen and operational feed/history/count/export, including stated history constraints (historically 60 days/cap 500). Preserve exact transaction and role semantics.

**Acceptance:** no second pickup or payment post; no refund without appropriate reference; every correction is traceable; stock, source order and Books reconcile; late/failed reads preserve correct owner/customer distinctions.

**First task recommendation:** perform **read-only diff/ownership review of the nine files before editing**. The local worktree has not been inspected in this remote audit and must not be overwritten.

### C6 — Customer-facing public Shop and checkout

**Accepted / built:** responsive public Shop/checkout/status; product images and safe media resolver; post-order instructions; exact retained order identity through lost replies/reload/retry; owner Check for actual payment state; extensive responsive proof.

**Remaining:** verify product/menu availability and capacity boundaries, sampler/box/add-on behavior, actual pickup messages, customer privacy/contact wording, allergens/stickers and failure/retry paths. Confirm public order status does not expose private data by phone/name/order number alone.

**Acceptance:** correct customer quote/product/extra/price snapshots, no duplicate order on uncertain reply, no false settled-payment message, correct private receipt visibility, mobile checkout and independent Money/stock effects.

### C7 — Inventory, counts, receiving, adjustments and Stock

**Accepted / built:** ingredient/dough/baked distinctions; stock confidence and read recovery; contextual inventory screens; Bazaar source-aware transfer, idempotency and return foundations; current glass Inventory/Shopping/Suppliers interface.

**Remaining:** receiving, physical counts, shrinkage/waste, adjustment, count/price source and correction scenarios; source-linked accounting reconciliation; failure states and retained work; preserve the unanswered physical dough-correction decision.

**Acceptance:** no phantom stock; no transfer as production; unknown stock not displayed as confirmed zero; count/waste/use transaction source/cost correctly recorded; exact replay and competing writers do not overdraw balances.

### C8 — Recipes, purchasing, suppliers and production planning

**Accepted / built:** recipe versions and source/typed costs; recipe-to-Shopping and production handoffs; item and supplier price structure; Stock/Shopping/Suppliers UI; saved recipe edit recovery.

**Remaining:** meaningful comparable unit/pack prices, supplier and item editing, grouped shopping, receiving handoff, stock-cost reconciliation, incomplete production plan retention and account/backend scoping.

**Acceptance:** cheapest quote compares compatible units/pack quantities and remains explicit when unknown; revised recipe does not silently alter a previously recorded batch; old drafts cannot bleed between accounts; saved purchasing leads to actual item receipts only when confirmed.

### C9 — Bazaar operational lifecycle

**Accepted / built:** live event/day/till interfaces and release; offline-queue foundation; real account-owned open days; supported started-day price changes; kitchen-to-table transfer/provenance/return; Money labels and source association; various owner usability corrections.

**Remaining:** complete source-reported F07 fees/expenses and cost-effect review; corrections, voids and reversals; realistic daily cash/payment/leftover handling; full offline/reload/reconnect/ack/void/day-close/event-close/Books journey. Distinguish actual business corrections from UI-only adjustments.

**Acceptance:** one sale remains one sale through device failure; table stock and source are consistent; cash, e-wallet and expected drawer logic reconcile; close does not strand queue records or duplicate finalization; expense and reversal results preserve ledger history. Physical device proof remains separate.

**Do not do:** repeat schema upgrades, rebuild established till, or invent financial policy to resolve a missing owner decision.

### C10 — Money, books, cost integrity, exports and backup

**Accepted / built:** source-linked transfer/return Books behavior, readable money figures, period-scoped read recovery, profit goals, current glass Money/Home reporting and signed weekly net correction. Hosted compatibility and source CI gates pass.

**Remaining:** verify all period totals and drilldowns; missing-cost and uncosted-use handling; export correctness; cost per cookie across recipe/transfer/sale; refunds/reversals/partial corrections; append-only ledger; financial permission; genuine backup restore including the hosted PostgreSQL version and off-device custody. Historical notes explicitly mark backup operational custody unresolved.

**Acceptance:** centavo-exact accounting; no false profit from unknown costs; no purchased/use/transfer double accounting; restoration reads back row counts/hashes and constraints; export and displayed numbers match an independently calculated transaction oracle.

### C11 — Account, authentication, session and security

**Accepted / built:** identity-bound staff names and scoped cached status, late-callback retirement, owner/helper/support controls and significant RLS tests.

**Remaining:** real session/account switch and role changes; true offline/idle/sign-out/reconnect; privacy of previously cached owner data; provider MFA/recovery-code rehearsal and owner access acceptance; physical PWA/Safari session behavior. A low theoretical offline role comparison caveat is recorded, not proven exploitable.

**Acceptance:** no inherited owner privilege after helper switch; denied sessions do not sell or see private records; queue survives permitted logout and reopens only under correct identity; no stale cached screen leaks.

### C12 — Home, navigation and cross-screen UX

**Accepted / built:** Manila clock, truthful stock and Home/Books counts, new glass Home/Money/Stock experience, Orders board, revised typography and controls, fixed HCB-020/021/022, signed weekly net and compatible settings surfaces.

**Remaining:** safely integrate/review the unaccepted Sell glass package; complete contextual Back/Cancel, keyboard, touch, accessibility, missing/error and recovery states without removing any capability; check any newer screens not covered by older v4 ledger entries.

**Acceptance:** controls remain reachable; data persists through navigation; real 320/390/768/1024/wide checks where applicable; correct focus, labels, contrast, reduced motion, no clipped amounts, and no hiding of functionality behind decorative layers.

### C13 — Connected application and adversarial end-to-end validation

**Accepted / built:** local connected SQL/browser proofs of production-to-Bazaar transfer/return/Books, exact retries and source authority, customer order uncertain-response and confirmed-payment fragments; reproducible CI build, browser and visual suites.

**Remaining — major critical path:** complete all **three parent business journeys** below, with real SQL plus real application state and failure injection. Reconcile the original seven v2 and fifteen v3 connected-journey obligations by exact IDs; check role, period, version, concurrency, repeated requests, refreshes, refunds, missing costs, offline boundaries, backup and return flows. Route-smoke or synthetic frontend assertions alone cannot close this.

**Acceptance:** complete beginning-to-end causality and independent reconciliation across UI, SQL, Stock and Books, not just isolated successful screens. Preserve original acceptance artifacts and mark each verified boundary.

### C14 — Final hardening and release quality

**Accepted / built:** patched dependencies, audited production severity at its accepted checkpoint, protected source gates, Docker visual regression, CI performance budget and guarded Cloudflare deployment.

**Remaining:** authenticated performance and reliability measurements for actual owner tasks; small-screen, reduced-motion, keyboard/screen-reader usability; selected security regression tests; all requirements reconciled and evidence gaps closed; final deployment/rollback/restore instructions.

**Acceptance:** representative workflows within accepted operational budgets, no untriaged material security finding, correct migrations, artifact and release identity, actual phone and owner checks. A green CI performance budget from a demo route does not prove authenticated till latency.

## 6. Three parent journeys: explicit final acceptance oracles

A complete connected journey must contain a **business-readable expected result** plus actual records, independent data readback, failure/retry tests and the correct authorization boundary.

### Journey A — Customer order to Money and fulfilment

1. Load current public catalogue and correct price/capacity facts.
2. Select a specific product, quantity, boxes/extras and pickup information.
3. Produce an authoritative quote and order identity; fail clearly for unavailable/capacity violations.
4. Simulate a committed order with a lost acknowledgement; reload and retry exact request.
5. Confirm exactly one persisted order and one correct customer-visible status.
6. Record payment proof without equating proof to settlement; perform explicit owner confirmation.
7. Verify one correct financial effect and correct customer status.
8. Exercise allowed swap, cancellation and refund with exact reference and append-only correction.
9. Plan and produce the order; verify source dough/baked/packaging and reservations.
10. Pack and mark ready; verify actual pickup and no duplicate pickup.
11. Review Books, stock, customer status and order history by source ID.
12. Repeat with failed reads, malformed results, role changes, stale callbacks, concurrent tabs and double submit.
13. Assert no privacy leak through generic public lookup.
14. Verify owner and customer screens at relevant viewport sizes.

**Closure:** a single identity- and source-consistent business chain, with no duplicate payment, order, ingredient or pickup effects.

### Journey B — Purchase through recipe, dough, bake and stock

1. Compare usable supplier/pack/unit price facts and disclose missing information.
2. Build a shopping/receiving transaction, keep the source and unit identity.
3. Record actual receipt, authoritative inventory count and purchase cost.
4. Select recipe/version and identify ingredient quantities.
5. Prepare full recipe; enter actual balls made independently of planned yield.
6. Confirm ingredients deducted once and corresponding cost captured.
7. Bake only from previously recorded dough; record good/reject counts.
8. Confirm remaining dough, kitchen baked stock, waste/reject provenance and costs.
9. Transfer a controlled amount for a Bazaar or order; verify source decrement and target increment.
10. Test shortage, conflicting recipe version, stale actor, exact retry, lost ack and competing writers.
11. Test physical stock correction only under approved existing policy; do not assume a new Count Dough rule.
12. Reconcile inventory and Money to raw quantities and source movement records.

**Closure:** physical inventory plus financial costs reconcile at every stage; no ingredient double spend or fabricated output.

### Journey C — Bazaar event, offline sale and close to Books

1. Select an authorized real/synthetic event and selling day; verify menu/prices/float.
2. Establish kitchen stock source, plan quantities and appropriate transfer.
3. Open the day with the correct role and database state.
4. Sell a normal cash order, multi-item order and authorized digital-payment record.
5. Record sample, discount or waste under the actual approved rules.
6. Lose network; persist an offline sale under the current operator/device.
7. Reload/suspend, preserve cart/day/session constraints and queue contents.
8. Reconnect with lost/partial acknowledgement; verify exact original request replay.
9. Check authoritative server receipt and remove only explicitly acknowledged queue rows.
10. Confirm one stock decrement and one corresponding Money effect.
11. Perform a supported void/correction with source-linked reversal, not a hidden deletion.
12. Add real stock and correct event fees/expenses.
13. Reconcile expected versus counted cash without pretending blank counts are exact.
14. Refuse unsafe close when unsent/refused records remain unresolved.
15. Close the day once; account for remaining/returned/wasted stock.
16. For multiday events, carry forward appropriately and finalize the event once.
17. Read back event, day, source stock, sale log, payment totals, fees and Books.
18. Exercise owner/helper limits, offline trust expiry, sign-out, two tabs/devices and failed reads.
19. Repeat critical path on actual intended iPhone/PWA storage context.
20. Obtain unaided owner confirmation separately.

**Closure:** one recoverable, no-duplicate, no-loss chain from source stock through till and event close to recorded financial facts.

## 7. Outstanding operational and manual acceptance gates

These gates cannot be closed by a commit alone.

| Gate | What must be proved | Current remote-audit conclusion |
| --- | --- | --- |
| Hosted source/schema | Exact deployed source SHA; release hold, Access, schema/functions/grants, post-deploy guard | Passed for the recorded application release; verify exact new release separately |
| Local source validation | Pinned toolchain, format, full verify, build and relevant SQL/browser gates | Accepted prior checkpoint; not freshly rerun by this audit |
| Full native connected journeys | Journeys A/B/C including real SQL, failure/retry and Books readback | Not fully accepted in full-program tracker |
| Offline device | Installed PWA/Safari storage, airplane/weak network, reload, pending queue and reconnect | Source and synthetic tests exist; physical-device acceptance remains outstanding |
| Real owner roles | Owner/helper/support, session expiration, logout, MFA/recovery, private state isolation | Partly verified in local tests; real-provider/manual gates open |
| Physical stock/business truth | Actual counted stock, product prices, valid expenses and acknowledged corrections | Requires authorized owner confirmation; no private business data read here |
| Backup/restore | Usable recovery artifact, complete restore, hashes, permissions, off-device custody | Partial recorded proof; final custody/restore drill open |
| Unaided Cine acceptance | Owner completes core workflows without engineer intervention | Not proven by this audit |
| Final owner sign-off | Explicit scope, known limitations, accepted release and recovery plan | Open |

A specific event's close status or actual recorded sale reconciliation may require controlled private inspection. Public GitHub audit alone cannot say those private records have been corrected.

The latest release authorization in the repo is narrowly scoped to approved PRs through the protected release path when the software is not in use, after a fresh read-only check that no selling day is open. Do not infer perpetual automatic permission from historic release records. This audit-document-only branch is not a deployment path.

## 8. Unresolved owner decisions and authorization boundaries

Check the **current** specific decision-register entry before asking the owner again.

Known previously unresolved or gated topics include:

- Physical dough-count correction outside the normal prepare/bake records.
- OD-12 and any remaining customer-facing wording ambiguity.
- Financial reference/adjustment policy when existing refunds or price corrections cannot express the actual business transaction.
- Private contact/payment wording, customer assets, allergens/stickers as needed.
- Hosted role/person provisioning.
- Real backup custody and independent restore handling.
- Provider MFA/recovery and physical-device acceptance.
- Any new hosted migration, private business-data import, irreversible cost rule, resource, schedule or financial backfill.

A decision gate is not necessarily an engineering bug. Do not invent a policy merely to close a cycle. Isolate unresolved tasks and continue independent authorized work.

Existing owner statements and the project instructions govern exact approval. Standing permission to commit/push a scoped working branch does **not** automatically authorize merging into main, deploying to the live Worker, applying schema/data changes, changing finance rules or creating cloud resources.

## 9. Critical risks, priority and response

| Priority | Risk / reason for priority | Required response | Evidence or decision needed |
| --- | --- | --- | --- |
| P0 if reproduced live | Loss, duplication or premature deletion of queued sales | Stop unsafe mutation; preserve original IDs and device storage; reproduce in isolated test, then guarded fix | Actual queue/ack/server records and physical device when permitted |
| P0 if reproduced live | Wrong stock or Money caused by retry, transfer, refund or close | Protect source rows, transactional idempotency and audit ledger; no direct destructive rewrite | Exact source movement and accounting reconciliation |
| P0 if reproduced live | Unauthorized role can view/change owner/customer data | Inspect active server profile, RLS/RPC and cached identity scoping; isolate | Reproducible auth/RLS case and independent review |
| P1 | Unaccepted nine-file Sell work may collide with deployed Customers, Orders and settings | Read-only diff against accepted deployed source; scope and review before integration | Local dirty paths, actual diff and focused regressions |
| P1 | Three connected end-to-end journeys not closed | Build scenario tests using real SQL and real application boundaries; reconcile financial source | Fixture+actual recorded outputs and exact pass/fail |
| P1 | Financial and backup recovery claims incomplete | Finish exact period totals, export/append-only correction and restore drill | Independent Money oracle and restorable archive |
| P1 | Stock/cost errors across purchasing, waste and packaging | Cross-system units, quantity/price provenance and readback | Real local SQL fixtures; owner rule if needed |
| P2 | Remaining first-read/error/recovery defects | Reproduce narrowly and write failing-first regression | Correct current source and affected screen |
| P2 | Remaining UI/accessibility/real-performance issues | Measure actual live screens and tasks, fix only demonstrated regression | Phone/wide/reduced-motion/keyboard evidence |
| P2 | Historical registers out of sync | Reconcile source IDs and current accepted commits without making fake completion numbers | Per-ID source/owner/test mapping |
| External gate | Hosted data and owner-device approval | Seek only exact necessary approvals; continue independent work | Owner action and recorded outcome |

Prioritize current actual failures over old historical titles. Never treat stale status strings as current incidents when a newer passing release supersedes them.

## 10. Next engineering packages: dependency-ordered execution register

The following are **recommended bounded work packages**, not newly asserted defects or fabricated ticket IDs. Confirm source status before changing files. Each may contain several small reviewed commits and may shrink if already implemented.

| Order | Package | Source areas / evidence to inspect | Proof of completion |
| --- | --- | --- | --- |
| 0 | Preserve and reconcile local Sell nine-file package | Local urgent worktree; newest accepted release; current.md / next-goal.md | All nine paths classified; conflicts resolved without lost changes; accepted focused test oracle |
| 1 | Finish Sell/Orders core and payment action states | Existing Sell, Orders, payment, Customers and retained request controllers | Pack/pickup/swap/refund/no-show cases + correct Books/Stock and role/late reply |
| 2 | Finish public checkout boundary | Public Shop, checkout, status, order RPC/validation | One order under lost ack; valid capacity/add-ons/privacy; no false payment |
| 3 | Complete remaining failure/retry guards | HCB-004 residual entries, F09, relevant live screens and stores | Controlled first-read/late/reload/invalid-body tests preserve truthful state |
| 4 | Finish Stock receiving/correction lifecycle | Inventory, Stock, supplier pricing, SQL movement/read RPCs | Count/receive/waste/transfer/retry effects and Money reconciliation |
| 5 | Finish purchasing/recipe handoffs | Item/supplier pack comparisons, grocery plan, recipe/production | Unit-correct source prices and correct receipt→dough→bake path |
| 6 | Finish Bazaar fees/expenses/reversals | Event page, close, till, Books/stock RPCs | Full close and reversal effects with exact amounts and stable identities |
| 7 | Finish Money/export and recovery | Money/Books, export, backup tool and restore harness | Independent centavo ledger, periods, uncosted states and demonstrated restore |
| 8 | Native auth/offline and roles | LiveGate, offline trust, sign-out, session and SQL authorization | Cross-role/session/reconnect denial and no queue loss |
| 9 | Connected Journey A | Order through payment/fulfilment/Books | Full end-to-end SQL/app oracle and failure conditions |
| 10 | Connected Journey B | Purchase through dough/bake/stock/Books | Full end-to-end quantity/cost oracle and adverse conditions |
| 11 | Connected Journey C | Bazaar event through offline sale/close/Books | Full end-to-end queue/stock/money oracle and adverse conditions |
| 12 | Exhaustive existing registry reconciliation | 61 HCB / initial audit and v2/v3 obligation source locations | Every locatable ID classified with current SHA and test; unlocated explicitly marked |
| 13 | Authenticated performance, visual, accessibility and security hardening | Real live owner journeys, existing budgets, approved UI references | Measured non-regression across usable views and devices |
| 14 | Hosted/physical-device/backup/owner gate completion | Guarded release, actual phone, recovery plan, operator walkthrough | Exact source+schema, restored archive, authentic phone and independent owner sign-off |

**Efficiency rule:** do not force a separate deployment for each package. Group compatible accepted changes behind source verification and release gates. Do not defer important local code work because a separate device or owner gate is pending. Do not create new source abstractions for tasks already satisfied by the release.

## 11. Remaining effort: transparent, uncertainty-aware model

These are **focused engineer-day equivalents**, representing active technical work including normal code review/testing, not calendar days, background task promises, or validated ticket counts. They are a planning model based on the named unresolved scope; significant already-implemented functionality may reduce the actual remainder. Final device/owner availability adds an external elapsed-time dependency.

| Work grouping | Lower-bound effort | Upper-bound effort | Principal uncertainty |
| --- | ---: | ---: | --- |
| Preserved Sell package review/integration | 2 | 4 | Actual contents of the uninspected nine local files and conflicts |
| Remaining Sell/public Shop behavior | 4 | 7 | Payment, refund, fulfilment and customer-message edge cases |
| Remaining Stock/purchasing/recipe links | 3 | 6 | Actual item units, existing RPC coverage and missing recovery |
| Bazaar/Money source transactions and closing | 3 | 6 | Reverse/close/cost edge cases and current source correctness |
| Account/permissions/data recovery | 3 | 6 | Real-session/PWA behavior and remaining read-state defects |
| Backup/export/financial reconciliation | 2 | 4 | Archive restore and accounting oracle evidence |
| Connected end-to-end acceptance | 6 | 10 | Defects uncovered by journeys A/B/C and original obligation mapping |
| Final UX/accessibility/performance/release hardening | 4 | 7 | Real device/browser differences and source register reconciliation |
| **Conditional total** | **27** | **50** | **Not a measured backlog; no calendar commitment** |

**Do not double-count:** the groups overlap in implementation dependencies. The totals describe a reasonable focused work allocation if teams batch regressions and avoid repeated verification, not 27–50 independent issues. They exclude unknown owner waiting time and extensive unexpected rework.

### What could shorten this estimate?

- The nine local Sell files are already coherent and largely tested.
- Current source already satisfies apparently open historical HCB/MP wording.
- Existing SQL fixtures cover substantial parts of journeys A/B/C.
- Most failures are selector/fixture/edge-test deficiencies rather than server contract defects.
- Owner decisions are supplied promptly and physical-device testing is straightforward.
- Review, CI and release are batched correctly instead of repeated for every small change.

### What could lengthen it?

- Genuinely missing transaction behavior in Refund/Stock/Money.
- Bugs discovered only with real native offline/Safari behavior.
- Complex provider-auth, session or RLS failures.
- Incompatible accounting assumptions or missing actual cost data.
- Broken backup/restore or hosted permissions.
- Unresolved original acceptance obligations beyond currently accessible registers.
- Source overlap among active local workers, or fragile unreviewed worktree integration.
- Repeated CI, test/environment instability or usage quotas.

### Forecast discipline

Do not publish an overall percent complete without an authoritative requirement denominator and per-item verification. Do not publish a calendar deadline as a fact. The next strong estimation checkpoint should follow the preserved Sell-package reconciliation and the **first complete** end-to-end customer-to-Money journey. That will distinguish already-present but unverified behavior from missing implementation.

## 12. Recommended verification sequence and closure evidence

1. **Inventory actual work:** fetch accepted source; preserve local branches/worktrees/stashes; inspect the nine pending Sell files as a separate work package; do not force reset or copy over accepted files.
2. **Read exact authority:** AGENTS.md, CLAUDE.md, docs/state/current.md, next-goal.md, full-goal.md, task-status.json, decision register relevant section and source tests.
3. **Update the reconciled matrix:** one row per original requirement ID plus current state, source, test evidence, accepted/no accepted, decision gate and who owns it. Do not mark a missing document fixed by inference.
4. **Use smallest reproducible tests:** source symbol, focused unit/browser/SQL, failing-first proof where a fix is required.
5. **Implement bounded package:** use existing architecture; no duplicate business writers, queues or financial engines.
6. **Review sensitive diffs independently:** auth, offline, SQL, financial and stock-writing behaviors, including idempotency and grants.
7. **Preserve tests:** no timeout inflation, assertion weakening, baseline regeneration to hide failures or mocked transaction proof.
8. **Run required gates:** pinned Node/pnpm; one compatible local database fixture at a time; relevant live browser tests, format and full verify; real source SHA recorded.
9. **Commit only accepted paths:** secret scan; no private business file or receipts; working branch pushes without bypassing the guarded release path.
10. **Release when authorized and safe:** fresh read-only current-business-use check; release hold, schema/Access, exact deployed version and runtime verification; do not push directly to live branch when a selling day is open.
11. **Perform manual gates:** physical phone, appropriate account, actual route, offline and sign-out, owner unaided walkthrough, restorable off-device archive and owner approval.
12. **Publish an accurate closure:** per-item and per-cycle state, verified numbers, remaining exceptions, and specific follow-up owner actions.

### Required Done definition for every business feature

- Requirement and owner rule identified.
- Actual implementation checked against current accepted source.
- Appropriate failing/passing functional test.
- Source and type checks.
- Real SQL boundary for database-mutating behavior.
- Retry, stale callback, concurrency and role checks where applicable.
- Real live browser behavior at relevant widths.
- Independent review when required.
- Exact committed SHA.
- Guarded deployment evidence if deployment is claimed.
- Real device and actual owner acceptance if the acceptance condition requires them.
- No withheld financial/privacy/stock limitations.

Labels should distinguish **implemented**, **locally verified**, **SQL verified**, **independently reviewed**, **committed**, **deployed**, **hosted verified**, **physical-device verified**, **owner accepted**, and **blocked/unverified**.

## 13. Source anchors and exact documents to use

**Current implementation authority**

- AGENTS.md and CLAUDE.md — protected paths, toolchain, source ownership and release policy.
- docs/state/current.md — latest accepted source and actual local worktree dependency.
- docs/state/next-goal.md — deliberate Sell-glass review next.
- docs/state/full-goal.md — long-term full-program objective.
- docs/state/task-status.json — full_application.cycles for all fourteen workstreams and recorded evidence.
- docs/state/agent-orchestration.md — explicit workers, one-writer-per-file, active-agent limit and source checks.
- docs/state/working-with-ethan.md — real owner expectations and sensitive-data boundaries.

**Requirements / layout / historical reconciliation**

- docs/design/reference-v4/coverage.md — 58 Done / 4 Partial statused rows and exact limitations.
- docs/design/reference-v4/flows.md — per-screen v4 interaction scope.
- docs/design/capability-ledger.md — lossless capability moves/removals.
- docs/design/system-audit-2026-11-05.md — original source-linked observations.
- docs/design/client-meeting-2026-11-04.md — actual owner review.
- docs/audits/remediation-backlog-2026-11-06.md — published historical HCB remediation analysis.
- docs/state/decision-register.md — business decisions (read relevant section, do not assume all historic entries still open).
- docs/state/current-history.md — archival checkpoints only.

**Code / transaction sources**

- src/components/live/bazaar/ — event, day, till, fees, close and kitchen-transfer UI.
- src/lib/bazaar/ — event, transfer, review, ledger and recovery semantics.
- src/store/bazaar-days.ts — Bazaar state and transaction orchestration.
- src/components/app/live-gate.tsx — live/verified/offline access.
- src/lib/offline/ and docs/OFFLINE.md — durable queue, replay, storage and offline trust.
- src/components/live/sell/ and existing Sell controllers — Orders, payments and fulfilment.
- src/components/live/customer/ and Shop data controllers — actual public order path.
- src/components/live/stock/ and src/components/live/recipes/ — inventory and recipe planning.
- src/components/live/money/ and Money/Books stores — recorded revenue, cost and charts.
- supabase/migrations/ — applied RPC, grants, RLS, idempotency and financial schema.
- tests/integration/security/ — authoritative SQL business and role assertions.
- scripts/test-db-security.py and scripts/test-bazaar-kitchen-transfer.py — local database harness and transfer checks.
- scripts/test-live-smoke.mjs — signed-in live browser acceptance, not equivalent to demo-route E2E.
- scripts/check-owner-trial-schema.mjs and scripts/check-owner-trial-release.mjs — guarded hosted compatibility/release.

**Reproducible GitHub evidence**

- Current accepted application: commit 62392e86e51360908bde9d9cbc7fe48c8dc22bb0.
- Current release-branch docs snapshot: d063be4c07a78d2802bb0a95d9ba9cabd7721653.
- Guarded application release: https://github.com/newonathe/happy-cookie-ops/actions/runs/43844809470 .
- Latest app fix PR: https://github.com/newonathe/happy-cookie-ops/pull/82 .
- Documentation follow-up: https://github.com/newonathe/happy-cookie-ops/pull/83 .
- Previous accepted owner-stock release: https://github.com/newonathe/happy-cookie-ops/pull/81 .
- Older evidence-only PR: https://github.com/newonathe/happy-cookie-ops/pull/50 .
- Historical stacked Orders PR: https://github.com/newonathe/happy-cookie-ops/pull/53 .

## 14. What this audit explicitly does **not** claim

1. It does not say the whole product is 94% done; that number concerns a narrow v4 page-status denominator only.
2. It does not say zero progress was made because zero full engineering cycles are formally closed.
3. It does not say the 127/61/67 historical lists are all outstanding or independent.
4. It does not assert that an old failed E2E count is the latest current CI outcome.
5. It does not claim the physical iPhone, owner, private customer data or current open/closed Bazaar state was inspected.
6. It does not claim the nine preserved Sell files were programmatically accessed or integrated.
7. It does not assume the backup can be restored merely because a file exists.
8. It does not treat stale source history as a currently unresolved production problem.
9. It does not assume a merge to main would deploy the latest accepted source.
10. It does not authorize new migrations, private data changes, deployment or cloud resources.
11. It does not set or promise a calendar completion date.
12. It does not convert planning estimates into factual defect or task counts.

## 15. Immediate executable handoff

**Highest-value next task:** review the preserved nine-file Sell package before attempting any implementation or integration, against the accepted release source at 62392e86 and the documentation follow-up branch head d063be4. This is consistent with docs/state/next-goal.md.

A safe bounded execution should:

1. In the actual local checkout, run Git status, branch, worktree, stash and remote fetch checks.
2. Confirm no other agent owns the files.
3. Inventory the seven modified and two new Sell-related paths without altering them.
4. Diff each against the accepted release baseline.
5. Identify overlap with Customers frosted sheet, Orders board, payment controller, view-model types, live runtime and settings.
6. For every file, state keep/adjust/discard with an evidence-backed reason; **never discard source before preserving it**.
7. Choose a single small shippable feature slice, normally no more than roughly 400 changed lines per repository rule.
8. Establish relevant failing-first tests before editing.
9. Build under the single-writer policy; Haiku for bounded search, Sonnet for implementation, a distinct Sonnet reviewer for sensitive code; no speculative swarm.
10. Run focused tests, pinned full verify, formatting, appropriate actual live browser checks and existing review.
11. Commit/push to the authorized non-deploying working branch after a secret scan.
12. Treat actual release as a separate authorization/guarded operational action.
13. Continue through the accepted remaining cycle matrix without redoing completed source work.

**Why this is first:** remote release is good enough to serve as a stable engineering baseline, while unpublished overlapping Sell changes can be lost or conflict if new work proceeds blindly. The next fully connected customer→Money journey is the most informative follow-up for narrowing the unverified effort estimate.

---

**Maintenance rule:** Treat this report as a pinned read-only audit, not a second mutable source of operational truth. New work should update the existing docs/state files and source-linked acceptance registers under their established process. Do not continually rewrite this audit when source changes; use it to compare claims and identify missing evidence.
