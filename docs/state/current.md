# Current state — Happy Cookie Ops

**The complete application objective remains active and incomplete.** Read [full-goal.md](full-goal.md), then [next-goal.md](next-goal.md). A passing slice is not whole-product acceptance.

## Cloud checkout and accepted source

The clean older Cloud checkout at `4c1f72e` is preserved as `backup/cloud-start-4c1f72e`. `work` continued from exactly the requested `93135433fd88def7cbc5a05c0d22de3b17cfe764`, after fetching `origin/codex/refined-workflows` and verifying full-goal.md. No Cloud stashes or other worktrees existed initially. The original WIP remains preserved in `/workspace/happy-cookie-ops`. Active work continues in `/workspace/work/happy-cookie-ops/acceptance-tree` on `codex/cloud-shop-availability-20261109` after Stock acceptance629fcab and production acceptance67a827b (formerly`codex/cloud-p0-transfer-20261107`), based on user-pushed `f56900f7f533462c3dd368d05c8cc05381897f9b`. The independently verified SQL74 extraction at `620ab45` is preserved as `backup/bazaar-boundary-before-local-f569` and reapplied without rewriting either history. The acceptance worktree publishes to `codex/cloud-full-goal-20261106`. Private/local work listed in full-goal.md was not applied.

Accepted and pushed development checkpoints are recorded in current-history.md. Latest acceptance work is below.

Accepted production follow-ups through `dbb7e44` are recorded in current-history.md. `e0670e6` clears retired Orders before catalogue replacement and fences late reads; `f56900f` preserves the newer local recipe handoff. Published `94b1fccd20f19d76715a3860d17270141019e1f2` adds only the private byte-identical SQL74 boundary; combined full gate202files/3240tests+2TODO passed.

## Accepted production and current Stock slice

The connected P0 Make/Bazaar boundary is accepted locally through67a827b. Historical progression: Backend SQL74–78 is accepted as `938e9f0ef9dddbac03210a039f10ae5ec994199c`; exact transfer protocol as `dd616bdf8d4244a32985d6615719c04843c820e9`; scoped durable recovery/receipts as `08350552d5639ca993d48c29c90f79db3d3d8496`. All are pushed with full verification/formatting; latest full204files/3279tests+2TODO. Actual two-reset connected stock/Money, packaging, stranded-return, reversal, role and compatibility proof is preserved in Git/history. No hosted changes.

Transfer quantity/runtime acceptance through b4dd576 is recorded in current-history.md.

Connected transfer UI is accepted as `81e4053ccb26d19a21e657647b06dea63a23a4f8`: full213files/3350tests+2TODO,110focused, clear review, exact-source Live build and real390/1440 connected journeys. SQL80 Money labels are accepted as35ea7c8. Full evidence is in history.

Shopping handoff is accepted as `2e4f8b2662dc36214f98bd10dfde6aed603f7695`: full214files/3391tests+2TODO,74focused tests, actual390/1440 transactions, clear review and exact-source Live build.

Local production engineering acceptance now has connected evidence for the approved core: first recipe→v2 edit→explicit recipe/Shopping handoff; independent preparation/actual yield; dough-only Bake, ZD001/ZD002 and retained inputs; committed-but-lost ACKs, exact retries/reload and checked-versus-unchecked receipts; transfer4→sell3→return1→Money without repeated ingredients/phantom production; aggregate16000 returns; historical SQL73 replays and legacy retirement; SQL concurrency and role/version guards. Two further real reset/browser cycles at390/1440 prove native Web Lock exclusion, failed lease stealing, explicit ownership release/reacquisition with exact raw draft4/reject0, and stale period/client/role A→B→A Confirm suppression. Local and server stock stay dough5/cookies3 with one Bake. A controlled awaited legacy-writer mutation fails at the no-write assertion; clean source restored/hash checked and both cycles pass. Independent re-review is clear; final full verification is recorded by the acceptance commit. Production ownership checkpoint67a827b changed only tests/status relative to2e4f8b2; later Stock checkpoints are below.

Production remains pending for hosted cutover, physical-device and unaided-owner acceptance. Full-application scenariosA/B/C and the original7v2/15v3 journeys remain engineering work. The Home greeting/date business-clock correction is accepted as b29ef94. Manual owner/hosted/device gates remain pending.

Preserved Root work remains in`/workspace/happy-cookie-ops`, with its detailed unfinished F05, F08/F09 Money, Shop/payment and F07 fee notes in history. Reuse only narrow reviewed deltas; Orders/Customers overlap with PR53 and must be reconciled as one scoped implementation. Current accepted production/Stock checkpoints supersede the archived pending local gates. Use pinned tools, two Vitest workers and frozen source without concurrent SQL/browser work for full verification.

Production dependency audit found3critical/2high advisories in the old pins. Patched Next16.4.1, Sentry10.75.2, Zod4.6.6 and bounded transitive overrides now audit clean (all production severities0); strict-peer/frozen installs, typecheck and actual production build pass. See [toolchain](toolchain.md). The dependency slice is accepted as611d7c6; later functional slices still require their own gates. Recipe source ownership is accepted as9d3311a; typed-cost ownership and regrant are accepted as30eccdf.

## Local database proof and pending cutover

The official pinned Supabase15.8.1.085 runtime was extracted from the verified single-layer image after Docker VFS container copies exceeded disk capacity. Its exact root filesystem and vendor entrypoint ran in a read-only namespace with nonce-owned writable data/config, a generated password and127.0.0.1-only listener. Process start time, executable/root inode, nonce, SQL address/port/data directory were checked before resets and shutdown. No hosted connection was used.

Two actual Supabase CLI2.116.0 resets passed exact catalog/function-authority/public-schema comparison and sentinel removal. On each reset, SQL71/72 role, recipe amount/actual balls, partial output/rejects, costs, ingredient-once, concurrent preparation/Bake and exact replay checks passed. New SQL73 also passed historical batch/dough replay after recipe change, changed-body conflict, roles/invalid input, repeated unseen refusal and no production/stock/ledger/audit effect. The exact postmaster exited and its port closed. SQL73 is accepted ase5fe735 after a frozen full gate. An earlier attempt hit two unchanged Till5-second timeouts;88focused tests and the full rerun passed without changing assertions or timeouts. No hosted migration is authorized.

Historical557role cases/156mutants and the earlier working-source SDK/PostgREST browser proof are preserved in current-history.md. Accepted production browser evidence through67a827b supersedes that earlier pending local gate.

Stock catalogue F09 is accepted/pushed as`3122920235f9612f64a1c5e10834f26033f2c969`: full215files/3397tests+2TODO,127focused, actual two-reset390/1440/SQL, Live build and clear review.

Stock dough/baked F09 is accepted/pushed as`58a3e93aac574a360f43f34824113367c9c68c96`: full215files/3401tests+2TODO,45focused, actual two-reset390/1440/SQL, Live build and clear period re-review. Dough uses balls, failed same-period reads retain warned balances, unread periods hide old rows and offer Retry; baked stock labels its drop. Physical Count remains limited to Ingredients/Packaging.

F04/HCB-019 Home count behavior is accepted as`629fcabb7de8674f55c321a45e361ebd637e7cb6`: full215files/3407tests+2TODO,99focused, actual two-reset390/1440/SQL, inspected Home/Inventory/Shopping, Live build and clear review. Unknown zero is separate from confirmed empty; positive recorded balances remain useful; Home/Shopping disclose unknown counts and pending totals. Full-product/manual gates remain open.

F08/F09 Money read guards, Home books status and peso scale are accepted as`dc59b0da7a1ed7cc2698ae78f534af3f747ff56d`: full215files/3414tests+2TODO,145focused, actual390/1440/SQL, inspected views, final build and clear review. Calendar-only fixture correction reproduced2failures on629fcab; pinned Date makes31baseline/current tests pass unchanged.

F09 cancelled owner reads are accepted as`de0c29e7cc8c44bf43c0ae1f0a924f96d208fc35`: full215files/3416tests+2TODO, actual390/1440 native-lock recovery and SQL, build, formatting and clear independent review. Retired answers are rejected while still-latest reads become retryable.

Home C10 is accepted as`b29ef94892e10f8afbf22cc2a59dafc3cd22c49d`: full215files/3422tests+2TODO,29focused, actual390/1440 UTC-device boundary checks, inspected screenshots and Live build.

F09 public-menu recovery is accepted as`be468ca6c86e7fe217762e23019554fabec19705`: full215files/3430tests+2TODO,146focused, actual anonymous390/1440/SQL, inspected visuals, final build and clear review. Source/sequence-scoped recovery preserves the cart and warned last-good data; malformed answers fail instead of confirming an empty menu.

Current F09 opening-status slice on`codex/cloud-shop-availability-20261109`: three regressions failed first;124focused tests/8files, lint and typecheck pass. New reads reject old responses/cached Retry, preserve owner settings, and distinguish unknown from a default opening claim. Missing-config customer loads settle unavailable; offline Retry is disabled/explained. Independent review found no blocker. Prior opening values remain internal draft context until a fresh read; the unavailable banner does not confirm them, and server ordering checks remain authoritative. Connected opening proof, inspected390/1440, build and full gate are recorded at acceptance. Owner open/close writes remain unchanged.

## Remaining objective and gates

Preview: `pnpm preview:owner`, `http://localhost:4186/`; real components with synthetic RPCs. Tools/logs/screenshots are under `/workspace/work/happy-cookie-ops`, outside public Git. System Chromium differs from pinned Playwright; no screenshot baseline was regenerated.

Continue all unblocked full-goal work: finish accepted slices and shared status documents; full failure/navigation matrix; Bazaar stock/expense/cost/reversal and kitchen-to-table contract; SQL73 final acceptance and historical suite transition; first-recipe/product flow; connected scenariosA/B/C; backup/restore; optimized signed-in performance and final build/browser/visual gates. Legacy Bazaar-only finalization retains its original batch/ingredient behavior. SQL78 distinguishes recorded kitchen transfers; the client must explicitly use that contract before the cutover can be called complete.

Physical dough-count correction is unanswered. Hosted/schema, off-device backup custody/restore drill, physical iPhone and unaided-owner acceptance remain pending. No hosted SQL/data/resource, merge, deployment, cost-rule change or release is authorized. The supplied checkpoint is archived in [history](current-history.md#archived-cloud-baseline-snapshot--6-november-2026).

PR reconciliation (read-only runtime delta rechecked8November; common base `c84d23d`): #51 `e407b7020fab95a8afe934639621c95d6efe5452` and stacked #53 `7500b6c2b3623650e9175b5cab4828e6c949c2ce` both have zero textual conflicts in a source-level three-way. #51 saved-pickup projection is compatible with retained Cloud actor/client fences; OD12 wording remains open. #53 requires one scoped read-state source and retirement of old Retry callbacks on identity/client/role change. Preserve its malformed-list/dropped-row behavior and latest-read ordering; add runtime retirement/regrant/late-Retry tests and Customers scope checks. The preserved Root draft duplicates these read-state concerns; its earlier six conflicts are not conflicts against accepted HEAD. Do not integrate both stores. Recommend #51 first, then deliberate #53 reconciliation after authority; no PR changes, merges, rebases or force-pushes. Root remains sole coder until10November.
