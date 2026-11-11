# Current state — Happy Cookie Ops

**The complete application objective remains active and incomplete.** Read [full-goal.md](full-goal.md), then [next-goal.md](next-goal.md). A passing slice is not whole-product acceptance.

## Cloud checkout and accepted source

Work is on `claude/dreamy-faraday-74rshc`, continuing from the accepted checkpoints in current-history.md. Private/local work listed in full-goal.md was not applied.

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

F09 opening-save feedback is accepted as`622ef8db4ea3e858b9e263e2bbe508655bcc0b17`: full215files/3447tests+2TODO,173focused, actual390/1440/SQL, inspected screenshots, build and clear review. Pending/unknown/unsent/confirmed/read-failed states remain distinct. Check never writes or infers an acknowledgement; owner intent is explicitly visit-only.

Checkout source isolation is accepted as`6672012c8e1bc5fa15d3dd8eea76ded620000c30`: full215files/3462tests+2TODO,131focused, actual390/1440/SQL, inspected views, build and clear review. Exact-client visit-only flows retain uncertain requests and late acknowledgements; generation/screen/sheet guards reject retired actions and navigation.

Checkout pickup/extras F09 is accepted as`6856b646f50a3d8d06d9c71a68c15232c69cbad1`: full215files/3469tests+2TODO,184focused, actual390/1440/SQL, inspected views, build and clear review. Failed reads keep choices and text; new unchecked choices/same-day charges are blocked, exact frozen retries and future cookies-only ordering are preserved.

## Remaining objective and gates

Continue every authorized unblocked full-goal requirement: remaining read/write recovery, Sell/customer/payment workflows, purchasing/suppliers, Bazaar fees/expenses/reversals and remaining accounting, append-only corrections/exports/local backup restore, Account/session/permissions, original7v2/15v3 journeys and connected scenariosA/B/C, performance/accessibility/visual/release hardening. Local production/recipe/SQL73 and the connected Make→Bazaar→return boundary are accepted; preserve their proofs without repeating audits. Hosted cutover and physical-device/unaided-owner acceptance remain separate pending gates. Legacy Bazaar-only history and approved cost rules remain protected.

Physical dough-count correction is unanswered. Hosted/schema, off-device backup custody/restore drill, physical iPhone and unaided-owner acceptance remain pending. The owner authorized compatible PR/main merges and deployment to the existing version on10November2026. Verify target, schema compatibility and release gates before publishing. Unresolved business rules, arbitrary hosted-data edits, financial-policy changes and new resource/schedule activation remain unapproved. The supplied checkpoint is archived in [history](current-history.md#archived-cloud-baseline-snapshot--6-november-2026).

PR reconciliation (read-only runtime delta rechecked9November; common base `c84d23d`): #51 `e407b7020fab95a8afe934639621c95d6efe5452` and stacked #53 `7500b6c2b3623650e9175b5cab4828e6c949c2ce` both have zero textual conflicts in a source-level three-way. #51 saved-pickup projection is compatible with retained Cloud actor/client fences; OD12 wording remains open. #53 requires one scoped read-state source and retirement of old Retry callbacks on identity/client/role change. Preserve its malformed-list/dropped-row behavior and latest-read ordering; add runtime retirement/regrant/late-Retry tests and Customers scope checks. The preserved Root draft duplicates these read-state concerns; its earlier six conflicts are not conflicts against accepted HEAD. Do not integrate both stores. Recommend #51 first, then deliberate #53 reconciliation after authority; integration/merge is now authorized after compatibility and verification; no rebase, force-push or discarded work. Claude Code is the current coding writer.

Orders integration is accepted/pushed as`071a1c373fba773fbe3261a5607bf3849c8aa9fd` (full228/3670+2TODO). Health truth is accepted asfc2bbe4. Read-only trial schema preflight is accepted/pushed as`0063b6287142a0813c70153073c07c427ca55f5a` (full229/3694+2TODO,80focused, two actual SQL/catalog resets:83versions/173functions, clear review). Full details are in history/tracker; hosted execution and OD-12 remain pending.

**Release checkpoint, 11 November 2026.** Work continues on `claude/dreamy-faraday-74rshc` at `ced7b8217771881b965b15cfb79736240ca52e8c`; the active agent is Claude Code (the Codex allocation is exhausted).

- **Performance blocker fixed** in `dcf615c7d1eb77c2f8f2af64b7e9848a666c9c84` (`perf(build): leave the live screens out of demo builds`). `src/components/app/live-gate.tsx` registers the live screens through `src/components/live/register-all.ts`; `next.config.ts` swaps in `register-none.ts` unless `NEXT_PUBLIC_APP_MODE` is `live`. The live build (`scripts/build-pages-spike.mjs`, its own next.config) is unchanged: largest chunk 1,314,024 to 1,314,025 bytes. No Lighthouse budget changed.
- **Local Lighthouse** (unchanged `lighthouserc.json`, median of 3): `/` 932,332 to 858,715 bytes; `/shop` 1,119,506 to 1,045,890; `/bazaar` 659,366 to 585,750 (limit 655,000). App chunk 330,936 to 262,525 gzipped. Local `/bazaar` TBT 903 to 838 ms (limit 800).
- **Gates on that commit:** `pnpm verify` 230 files / 3,695 tests + 2 TODO; format check; offline release tests 4 passed; Chromium phone/desktop browser flows 60 passed / 50 existing SQL-fixture skips; 26 demo routes compared before and after at 390 and 1440 px (the renderer is slightly nondeterministic; every pair matched exactly in at least one of three runs). CI run 42950921345 on `dcf615c`: all six jobs passed, including Performance budget.
- **Main:** PR #54 was merged with a merge commit on 11 November under the owner's authorization (10 November record plus explicit confirmation in the 11 November session). `main` is `ced7b82`, tree identical to `dcf615c`; `main` CI run 42952203720 passed.
- **Private trial branch:** `agent/codex/MP-04-g1-feasibility` fast-forwarded `ed64a51` to `ced7b82`. Trial run 42952255396: all gates and the release quality job passed and the release hold allowed the deploy job to continue. The step "Verify trial migration and RPC compatibility (read-only)" then failed with `Read-only trial schema check requires OPS_SUPABASE_ACCESS_TOKEN` (the secret was empty); the build, deploy and verify steps were skipped. **Nothing was deployed.** The deployed source is still `ed64a515` (deployment 42004518007). Hosted schema state is unverified. No hosted change was made.
- **Needed from Ethan:** set the repository secret `OPS_SUPABASE_ACCESS_TOKEN`, or change the check to a narrower credential (`docs/state/F1-operations.md:112` prefers no account-wide token in Actions), then re-run the deploy job. If migrations are missing, hosted migrations 71-82 need his authorization. Do not push to the trial branch until then: a push re-attempts a release.

Hosted, device and owner acceptance remain pending.
