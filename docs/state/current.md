# Current state — Happy Cookie Ops

**The complete application objective remains active and incomplete.** Read [full-goal.md](full-goal.md), then [next-goal.md](next-goal.md). A passing slice is not whole-product acceptance.

## Cloud checkout and accepted source

Work is on `claude/dreamy-faraday-74rshc` (fast-forwarded to `claude/beautiful-knuth-b5hg1z` at `42bebc8` on 12 November), continuing from the accepted checkpoints in current-history.md. Private/local work listed in full-goal.md was not applied.

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

HCB-004 finding a (built-in products shown as hers after a failed or unanswered first catalogue read, nothing kept) is fixed on every owner view found: the Bazaar plan and Start day (`42083fc`, `3ccde27`), the Bake plan, Home, the owner's Shop preview and the drop menu (`590f58c`), and the remaining views in `a6ae8a2` (a2, below). Details are in [history](current-history.md#hcb-004-a2--12-november-2026).

## Remaining objective and gates

Continue every authorized unblocked full-goal requirement: remaining read/write recovery, Sell/customer/payment workflows, purchasing/suppliers, Bazaar fees/expenses/reversals and remaining accounting, append-only corrections/exports/local backup restore, Account/session/permissions, original7v2/15v3 journeys and connected scenariosA/B/C, performance/accessibility/visual/release hardening. Local production/recipe/SQL73 and the connected Make→Bazaar→return boundary are accepted; preserve their proofs without repeating audits. Hosted cutover and physical-device/unaided-owner acceptance remain separate pending gates. Legacy Bazaar-only history and approved cost rules remain protected.

Physical dough-count correction is unanswered. Hosted/schema, off-device backup custody/restore drill, physical iPhone and unaided-owner acceptance remain pending. The owner authorized compatible PR/main merges and deployment to the existing version on10November2026. Verify target, schema compatibility and release gates before publishing. Unresolved business rules, arbitrary hosted-data edits, financial-policy changes and new resource/schedule activation remain unapproved. The supplied checkpoint is archived in [history](current-history.md#archived-cloud-baseline-snapshot--6-november-2026).

PR reconciliation (9 November; #51 then #53, one read-state source, no force-push) is in [history](current-history.md#pr-reconciliation--9-november-2026).

**Release checkpoint, 12 November 2026.** Working branch `claude/dreamy-faraday-74rshc` at `a5842a5` plus this note; `main` is `ced7b82`; none of the later commits are on `main`; no pull request is open. Active agent: Claude Code.

- **Bazaar 14 November (Ethan, 13 November):** she sells on the live app (`ed64a515`, 71 migrations); no hosted migration or deploy until the event is closed. Proofs and findings: [next-goal.md](next-goal.md), "First".
- **Release unchanged, blocked (Gate 16).** The read-only schema check stopped with `Trial migration inventory differs from the verified checkout; deployment blocked`, because the hosted trial's migration list differs from the checkout. Nothing deployed (deployed source is still `ed64a515`); the next step is Ethan's (back up, apply the twelve added migrations when the owner is not baking, re-run the deploy job). Do not push to the trial branch.
- **`2fe0fab` (HCB-012, HCB-013; HCB-038 established)**: Compare prices now opens the item's prices page (it opened only the item page) and its Back ("Back to Shopping"), the item Back and the header arrow return to Shopping; any other exit forgets the origin. RouteSync keeps the open recipe in the address (`/recipes?recipe=<id>[&edit=1]`, validated) and a reload returns to it; recipe-only changes never push a history entry. HCB-038: an unsaved recipe edit is still lost on reload (memory only; test `recipe-edit-reload`). Failing first on `16f91f4` (run by Claude): HCB-012 6 tests, HCB-013 5 + 5 (route-sync-recipes, runtime address). `tools/owner-preview/check-back-and-reload.cjs` (synthetic, `qaRouteSync`) fails before and passes after at 390 and 1440 px. Review by the Sonnet `security-reviewer` (high): clear with notes. Gate: `pnpm verify` 247 files / 3,993 tests + 2 TODO. HCB-014 and the low items (`3b294cb`, `2b0e16c`, `143823b`) are in history.
- **`a5842a5` (HCB-038)**: an unsaved recipe edit is kept on this device for the verified owner and business (`hc-recipe-edits-v1:<business>:<user>`, checked on read, size-capped; never for a helper or demo; read only after the identity is bound and recipes are read) and offered back on return ("Restore changes" / "Discard"), never applied silently; a newer saved version is never overwritten (not applied, she is told) and a restored edit saves against its original stamp. 6 of 13 tests failed on `352dfeb` (run by Claude), plus two concurrency tests from review. `tools/owner-preview/check-recipe-draft.cjs` (synthetic) fails before and passes after at 390 and 1440 px. Review by the Sonnet `security-reviewer` (high): clear with notes. Gate: `pnpm verify` 248 files / 4,005 tests + 2 TODO. Left open (low): a corrupt or oversized kept entry lingers until the next write; a kept edit for a product no longer listed stays unshown; a failed write is silent.
- **Next:** HCB-020 to 022 (touch targets, overflow, clipping), in [next-goal.md](next-goal.md) item 1. Findings b to f are in the HCB-004 register entry.
- **Method:** Sonnet builder (high) for logic slices; independent review by the Sonnet `security-reviewer` (high), Opus only for SQL, RLS and money-posting diffs; one writer at a time; synthetic visual captures at 390 and 1440 px, labelled synthetic.

Hosted, device and owner acceptance remain pending.
