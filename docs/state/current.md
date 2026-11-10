# Current state — Happy Cookie Ops

**The complete application objective remains active and incomplete.** Read [full-goal.md](full-goal.md), then [next-goal.md](next-goal.md). A passing slice is not whole-product acceptance.

## Cloud checkout and accepted source

The clean older Cloud checkout at `4c1f72e` is preserved as `backup/cloud-start-4c1f72e`. `work` continued from exactly the requested `93135433fd88def7cbc5a05c0d22de3b17cfe764`, after fetching `origin/codex/refined-workflows` and verifying full-goal.md. No Cloud stashes or other worktrees existed initially. The original WIP remains preserved in `/workspace/happy-cookie-ops`. Active work continues in `/workspace/work/happy-cookie-ops/acceptance-tree` on `codex/cloud-staff-name-read-scope-20261110` after Stock acceptance629fcab and production acceptance67a827b (formerly`codex/cloud-p0-transfer-20261107`), based on user-pushed `f56900f7f533462c3dd368d05c8cc05381897f9b`. The independently verified SQL74 extraction at `620ab45` is preserved as `backup/bazaar-boundary-before-local-f569` and reapplied without rewriting either history. The acceptance worktree publishes to `codex/cloud-full-goal-20261106`. Private/local work listed in full-goal.md was not applied.

Accepted and pushed development checkpoints are recorded in current-history.md. Latest acceptance work is below.

Accepted production follow-ups through `dbb7e44` are recorded in current-history.md. `e0670e6` clears retired Orders before catalogue replacement and fences late reads; `f56900f` preserves the newer local recipe handoff. Published `94b1fccd20f19d76715a3860d17270141019e1f2` adds only the private byte-identical SQL74 boundary; combined full gate202files/3240tests+2TODO passed.

## Accepted production and current Stock slice

The connected P0 Make/Bazaar boundary is accepted locally through67a827b. Historical progression: Backend SQL74–78 is accepted as `938e9f0ef9dddbac03210a039f10ae5ec994199c`; exact transfer protocol as `dd616bdf8d4244a32985d6615719c04843c820e9`; scoped durable recovery/receipts as `08350552d5639ca993d48c29c90f79db3d3d8496`. All are pushed with full verification/formatting; latest full204files/3279tests+2TODO. Actual two-reset connected stock/Money, packaging, stranded-return, reversal, role and compatibility proof is preserved in Git/history. No hosted changes.

Transfer quantity/runtime acceptance through b4dd576 is recorded in current-history.md.

Connected transfer UI is accepted as `81e4053ccb26d19a21e657647b06dea63a23a4f8`: full213files/3350tests+2TODO,110focused, clear review, exact-source Live build and real390/1440 connected journeys. SQL80 Money labels are accepted as35ea7c8. Full evidence is in history.

Shopping handoff is accepted as `2e4f8b2662dc36214f98bd10dfde6aed603f7695`: full214files/3391tests+2TODO,74focused tests, actual390/1440 transactions, clear review and exact-source Live build.

Local production engineering acceptance now has connected evidence for the approved core: first recipe→v2 edit→explicit recipe/Shopping handoff; independent preparation/actual yield; dough-only Bake, ZD001/ZD002 and retained inputs; committed-but-lost ACKs, exact retries/reload and checked-versus-unchecked receipts; transfer4→sell3→return1→Money without repeated ingredients/phantom production; aggregate16000 returns; historical SQL73 replays and legacy retirement; SQL concurrency and role/version guards. Two further real reset/browser cycles at390/1440 prove native Web Lock exclusion, failed lease stealing, explicit ownership release/reacquisition with exact raw draft4/reject0, and stale period/client/role A→B→A Confirm suppression. Local and server stock stay dough5/cookies3 with one Bake. A controlled awaited legacy-writer mutation fails at the no-write assertion; clean source restored/hash checked and both cycles pass. Independent re-review is clear; final full verification is recorded by the acceptance commit. Production ownership checkpoint67a827b changed only tests/status relative to2e4f8b2; later Stock checkpoints are below.

Production remains pending for hosted cutover, physical-device and unaided-owner acceptance. Full-application scenariosA/B/C and the original7v2/15v3 journeys remain engineering work. The Home greeting/date business-clock correction is accepted as b29ef94. Manual owner/hosted/device gates remain pending.

Preserved Root work remains in`/workspace/happy-cookie-ops`, with its detailed unfinished F05, F08/F09 Money, Shop/payment and F07 fee notes in history. Reuse only narrow reviewed deltas; Orders/Customers overlap with PR53 and must be reconciled as one scoped implementation. Current accepted production/Stock checkpoints supersede the archived pending local gates. Use pinned tools, one Vitest worker/V8 pool and frozen source without concurrent SQL/browser work for full verification.

Production dependency audit found3critical/2high advisories in the old pins. Patched Next16.4.1, Sentry10.75.2, Zod4.6.6 and bounded transitive overrides now audit clean (all production severities0); strict-peer/frozen installs, typecheck and actual production build pass. See [toolchain](toolchain.md). The dependency slice is accepted as611d7c6; later functional slices still require their own gates. Recipe source ownership is accepted as9d3311a; typed-cost ownership and regrant are accepted as30eccdf.

## Local database proof and pending cutover

The official pinned Supabase15.8.1.085 runtime was extracted from the verified single-layer image after Docker VFS container copies exceeded disk capacity. Its exact root filesystem and vendor entrypoint ran in a read-only namespace with nonce-owned writable data/config, a generated password and127.0.0.1-only listener. Process start time, executable/root inode, nonce, SQL address/port/data directory were checked before resets and shutdown. No hosted connection was used.

Two actual Supabase CLI2.116.0 resets passed exact catalog/function-authority/public-schema comparison and sentinel removal. On each reset, SQL71/72 role, recipe amount/actual balls, partial output/rejects, costs, ingredient-once, concurrent preparation/Bake and exact replay checks passed. New SQL73 also passed historical batch/dough replay after recipe change, changed-body conflict, roles/invalid input, repeated unseen refusal and no production/stock/ledger/audit effect. The exact postmaster exited and its port closed. SQL73 is accepted ase5fe735 after a frozen full gate. An earlier attempt hit two unchanged Till5-second timeouts;88focused tests and the full rerun passed without changing assertions or timeouts. No hosted migration is authorized.

Historical557role cases/156mutants and the earlier working-source SDK/PostgREST browser proof are preserved in current-history.md. Accepted production browser evidence through67a827b supersedes that earlier pending local gate.

Stock catalogue and dough/baked F09 recovery are accepted through`58a3e93`; full SHAs, focused/full gates, connected SQL/browser and review evidence are in history.

F04/HCB-019 Home count behavior is accepted as`629fcabb7de8674f55c321a45e361ebd637e7cb6`: full215files/3407tests+2TODO,99focused, actual two-reset390/1440/SQL, inspected Home/Inventory/Shopping, Live build and clear review. Unknown zero is separate from confirmed empty; positive recorded balances remain useful; Home/Shopping disclose unknown counts and pending totals. Full-product/manual gates remain open.

F08/F09 Money read guards, Home books status and peso scale are accepted as`dc59b0da7a1ed7cc2698ae78f534af3f747ff56d`: full215files/3414tests+2TODO,145focused, actual390/1440/SQL, inspected views, final build and clear review. Calendar-only fixture correction reproduced2failures on629fcab; pinned Date makes31baseline/current tests pass unchanged.

F09 cancelled owner reads are accepted as`de0c29e7cc8c44bf43c0ae1f0a924f96d208fc35`: full215files/3416tests+2TODO, actual390/1440 native-lock recovery and SQL, build, formatting and clear independent review. Retired answers are rejected while still-latest reads become retryable.

Home C10 is accepted as`b29ef94892e10f8afbf22cc2a59dafc3cd22c49d`: full215files/3422tests+2TODO,29focused, actual390/1440 UTC-device boundary checks, inspected screenshots and Live build.

F09 public-menu recovery is accepted as`be468ca6c86e7fe217762e23019554fabec19705`: full215files/3430tests+2TODO,146focused, actual anonymous390/1440/SQL, inspected visuals, final build and clear review. Source/sequence-scoped recovery preserves the cart and warned last-good data; malformed answers fail instead of confirming an empty menu.

F09 opening-status reads are accepted as`80311acd879e6da173c77a9f6fe180c1d0d45187`: full215files/3433tests+2TODO,124focused, actual390/1440/SQL, inspected views, build and clear review. Unknown does not claim a default opening status; local Retry, warned last-good data and latest/source fences preserve owner settings.

F09 opening-save feedback is accepted as`622ef8db4ea3e858b9e263e2bbe508655bcc0b17`: full215files/3447tests+2TODO,173focused, actual390/1440/SQL, inspected screenshots, build and clear review. Pending/unknown/unsent/confirmed/read-failed states remain distinct. Check never writes or infers an acknowledgement; owner intent is explicitly visit-only.

Checkout source isolation is accepted as`6672012c8e1bc5fa15d3dd8eea76ded620000c30`: full215files/3462tests+2TODO,131focused, actual390/1440/SQL, inspected views, build and clear review. Exact-client visit-only flows retain uncertain requests and late acknowledgements; generation/screen/sheet guards reject retired actions and navigation.

Checkout pickup/extras F09 is accepted as`6856b646f50a3d8d06d9c71a68c15232c69cbad1`: full215files/3469tests+2TODO,184focused, actual390/1440/SQL, inspected views, build and clear review. Failed reads keep choices and text; new unchecked choices/same-day charges are blocked, exact frozen retries and future cookies-only ordering are preserved.

F09 staff-name in-flight reply retirement passes locally on`codex/cloud-staff-name-read-scope-20261110`: only the latest current-role/actor read may publish a greeting, clerk name or remembered offline name. A retired session answer cannot forward a profile query; null sources, role round trips and unmounts retire pending replies. Current failed-read and approved offline-reopen behavior remain unchanged. All5regressions failed first;50focused tests/2files, type/lint and clear independent review pass. Two actual SQL/browser resets at390/1440 pass real SDK/RLS profile reads with explicitly controlled fixture sessions, plus existing production, return/Money, payment and seven-width customer checks. This is not native GoTrue sign-in evidence. The initial new browser probe used the wrong Home screen key; the corrected today navigation passes both clean cycles without weakening assertions. Phone/wide Home screenshots were inspected; exact-source Live build passes. Full verification is recorded by the acceptance commit. Same-role account changes still need explicit cached-name invalidation/current-identity binding; that is the next unblocked slice, not closed by these in-flight guards. Manual owner/device/hosted gates remain open.

## Remaining objective and gates

Preview: owned synthetic normal-browser daemon at`http://127.0.0.1:4187/`; real components with synthetic RPCs. Port4186 is reserved for disposable connected fixtures. Tools/logs/screenshots are under `/workspace/work/happy-cookie-ops`, outside public Git. System Chromium differs from pinned Playwright; no screenshot baseline was regenerated.

Continue every authorized unblocked full-goal requirement: remaining read/write recovery, Sell/customer/payment workflows, purchasing/suppliers, Bazaar fees/expenses/reversals and remaining accounting, append-only corrections/exports/local backup restore, Account/session/permissions, original7v2/15v3 journeys and connected scenariosA/B/C, performance/accessibility/visual/release hardening. Local production/recipe/SQL73 and the connected Make→Bazaar→return boundary are accepted; preserve their proofs without repeating audits. Hosted cutover and physical-device/unaided-owner acceptance remain separate pending gates. Legacy Bazaar-only history and approved cost rules remain protected.

Physical dough-count correction is unanswered. Hosted/schema, off-device backup custody/restore drill, physical iPhone and unaided-owner acceptance remain pending. No hosted SQL/data/resource, merge, deployment, cost-rule change or release is authorized. The supplied checkpoint is archived in [history](current-history.md#archived-cloud-baseline-snapshot--6-november-2026).

PR reconciliation (read-only runtime delta rechecked9November; common base `c84d23d`): #51 `e407b7020fab95a8afe934639621c95d6efe5452` and stacked #53 `7500b6c2b3623650e9175b5cab4828e6c949c2ce` both have zero textual conflicts in a source-level three-way. #51 saved-pickup projection is compatible with retained Cloud actor/client fences; OD12 wording remains open. #53 requires one scoped read-state source and retirement of old Retry callbacks on identity/client/role change. Preserve its malformed-list/dropped-row behavior and latest-read ordering; add runtime retirement/regrant/late-Retry tests and Customers scope checks. The preserved Root draft duplicates these read-state concerns; its earlier six conflicts are not conflicts against accepted HEAD. Do not integrate both stores. Recommend #51 first, then deliberate #53 reconciliation after authority; no PR changes, merges, rebases or force-pushes. Root remains sole coder until10November.
