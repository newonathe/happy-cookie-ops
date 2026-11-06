# Current state — Happy Cookie Ops

**The complete application objective remains active and incomplete.** Read [full-goal.md](full-goal.md), then [next-goal.md](next-goal.md). A passing slice is not whole-product acceptance.

## Cloud checkout and accepted source

The clean older Cloud checkout at `4c1f72e` is preserved as `backup/cloud-start-4c1f72e`. `work` continued from exactly the requested `93135433fd88def7cbc5a05c0d22de3b17cfe764`, after fetching `origin/codex/refined-workflows` and verifying full-goal.md. No Cloud stashes or other worktrees existed initially. The implementation checkout now uses `codex/cloud-recipe-handoff-20261106`, from accepted9d3311a; all working bytes and the previous index were preserved when advancing the root checkpoint. The frozen acceptance worktree publishes to `codex/cloud-full-goal-20261106`. Private/local work listed in full-goal.md was not applied.

Accepted and pushed to `codex/cloud-full-goal-20261106`:

- `8ab48cc`: explicit SQL72 bake protocol, strict record-ID/quantity acknowledgement, definite dough/date refusals and immutable recovery routing. Frozen legacy bodies retain their route.
- `c84d23d`: new runtime bakes use recorded dough only, independently per work item. Definite refusals retain counts; uncertain retries retain the exact request; acknowledgement and failed refresh remain separate.
- `f751c7c`: Bake review/recovery presentation and portable browser rehearsal. Frozen-source serial full gate passed200files/3244tests+2TODOs; the push was independently confirmed.
- `611d7c6`: patched production dependencies; frozen install, production audit (all severities0), build and full196files/3177tests+2TODOs gate recorded in Git.
- `139ff68671ac728b01f211ccf1b68430d9e4c69c`: explicit pure recipe/Shopping handoff and conflict retention; full197files/3191tests+2TODOs.
- `fb3de4e48aa6adcbc1136b501f7274f00079066c`: verified owner/backend-scoped planned notes and core stock confidence; full198files/3202tests+2TODOs.
- `3fd797b72a8d517b6d6edbafa9241b3abe3df953`: production reads fenced by actor/client/period, with identity-cleared balances; full199files/3205tests+2TODOs.
- `e5fe7350a216928b1c18539166a0bdd0efeba575`: SQL73 retirement of unseen legacy writes; exact historical replays and retained refusal drafts. Full199files/3207tests+2TODOs; SQL proof below.

Accepted follow-ups: `da53607dc6d41806e425bbf9843323989b509285` verifies owned Linux fixtures and historical SQL compatibility; `04b248bc1404c03c7cb5b86384e0c6387c3b1dff` retains recipe edits with their original stamps by verified identity; `9d3311a9838c8f46be2a811023567b0b14411fdb` fences recipe reads/drafts and captured handoff sources. Its full gate passed201files/3215tests+2TODOs; formatting and independent review passed. Typed-cost callback fences and production-source regrant are the current acceptance slice.

Independent Sol/high protocol/runtime review is clear. Pinned Node24.20.0/pnpm9.12.3 `pnpm verify` passed198files/3216tests+2existingTODOs before c84d23d. An earlier one-worker gate passed196files/3177tests+2TODOs before8ab48cc.

## Unaccepted working tree

Preserve exact staged/unstaged differences. Bake presentation/rehearsal and SQL73 are accepted; recipe handoff/runtime ownership tightening is the active production slice. The following remain under implementation/acceptance:

- Bake UI: recorded dough/all oven output/good cookies/rejects, shortage and chronology recovery, explicit removal of old ingredient adjustments. All8synthetic browser width/motion cases passed lost reply → reload → exact replay, one effect,6good/2rejects/8dough, and failed refresh. Phone/desktop images inspected.
- F03/F06: recipe and planned-bake handoff carries quantity/version, requires explicit Prepare dough/Bake, resolves setup conflicts, preserves independent actual work and old-period setup. Scoped planned notes preserve damaged/legacy copies and disclose storage failure. Pure/runtime/recovery regressions pass; independent review clear. Final browser/full acceptance remains.
- F04: common counted/recorded/unknown/unavailable stock confidence; positive recorded balances survive absent count dates, unknown zero is excluded from Out/buy totals and charts count it once. Focused regressions pass; final visual/full acceptance remains.
- F05: customer counts, history/export and removal readback disclose the open-orders +60days/500total feed. No lifetime/global erasure claims. Focused tests pass; final visual/full acceptance remains.
- F08/F09: visible Money peso scale and local Retry, last-good warning and actor/client/backend fences. Review clear after retained-client fix; regression tests pass. Final visual/full acceptance remains.
- F09 Stock: first failure and stale reads have local Retry; identity/client fences include last-paid and costs. Old paid prices clear on scope change.53targeted stock/read/catalogue/sign-in/item-price tests and typecheck pass; independent review clear.
- First recipe: direct Create recipe beside the genuine empty recipe read, versioned editor and Back to that recipe. Focused test passes; final visual/full acceptance remains.
- Public replacements beside locked screens: neutral responsive menu/checkout/status, order before payment, frozen acknowledged method, server-method status instructions only with a valid future hold, private-link Retry. Eight synthetic width/motion journeys pass one order/failure/retry/no overflow/errors. Phone/desktop images inspected. All8viewport checks passed after removing the inherited customer frame transform. Lost reply → reload → exact retry and acknowledged-order reload also passed390/1440 browser checks; final small quantity/price presentation needs recheck. Full/release acceptance remains. Sticker assets/privacy wording remain owner gates.
- F07 fee recovery: durable owner/backend-scoped full body and exact ID acknowledgement, same Web Lock for Retry and explicit Change after definite refusal. Lost reply/reload/changed inputs, refused replay, identity/client switch and cross-tab race tests pass; independent review clear. Effect summaries added; wider stock/expense/cost/reversal acceptance remains.

Use a one-worker full gate with frozen acceptance source and no concurrent browser/database workload. No assertion or timeout was weakened after earlier worker/timing failures; accepted commits supersede those failed attempts.

New unaccepted F09 work adds Orders/Customers first-read Retry, stale last-good warnings and sequence/actor/sync-instance/client fences, including cached contact removal and A→B→A.82related tests passed before the final fence;107post-install tests including that fence pass and independent review is clear. Suppliers reuse the catalogue notice, with6focused tests passing. No CRM expansion.

Production dependency audit found3critical/2high advisories in the old pins. Patched Next16.4.1, Sentry10.75.2, Zod4.6.6 and bounded transitive overrides now audit clean (all production severities0); strict-peer/frozen installs, typecheck and actual production build pass. See [toolchain](toolchain.md). The dependency slice is accepted as611d7c6; later functional slices still require their own gates. Recipe source ownership is accepted as9d3311a; typed-cost ownership remains under acceptance.

## Local database proof and pending cutover

The official pinned Supabase15.8.1.085 runtime was extracted from the verified single-layer image after Docker VFS container copies exceeded disk capacity. Its exact root filesystem and vendor entrypoint ran in a read-only namespace with nonce-owned writable data/config, a generated password and127.0.0.1-only listener. Process start time, executable/root inode, nonce, SQL address/port/data directory were checked before resets and shutdown. No hosted connection was used.

Two actual Supabase CLI2.116.0 resets passed exact catalog/function-authority/public-schema comparison and sentinel removal. On each reset, SQL71/72 role, recipe amount/actual balls, partial output/rejects, costs, ingredient-once, concurrent preparation/Bake and exact replay checks passed. New SQL73 also passed historical batch/dough replay after recipe change, changed-body conflict, roles/invalid input, repeated unseen refusal and no production/stock/ledger/audit effect. The exact postmaster exited and its port closed. SQL73 is accepted ase5fe735 after a frozen full gate. An earlier attempt hit two unchanged Till5-second timeouts;88focused tests and the full rerun passed without changing assertions or timeouts. No hosted migration is authorized.

Four older SQL suites exercise the historical ingredient-mixing writer. Preserve every assertion/mutant inside explicitly rolled-back historical compatibility transactions, require current SQL71/72/73 contracts before/after, and verify SQL73 authority after rollback. Two actual resets now pass all557 unchanged historical role cases and156 existing mutants per reset, with current contracts before/after and exact SQL73 authority restored. Five Python transaction-guard tests pass; independent review is clear. Tooling is accepted as da53607. Backup/restore, full SQL-role/API acceptance and connected real-client scenarios remain pending; the current transactional proof is not those broader gates.

## Remaining objective and gates

Preview: `pnpm preview:owner`, `http://localhost:4186/`; real components with synthetic RPCs. Tools/logs/screenshots are under `/workspace/work/happy-cookie-ops`, outside public Git. System Chromium differs from pinned Playwright; no screenshot baseline was regenerated.

Continue all unblocked full-goal work: finish accepted slices and shared status documents; full failure/navigation matrix; Bazaar stock/expense/cost/reversal and kitchen-to-table contract; SQL73 final acceptance and historical suite transition; first-recipe/product flow; connected scenariosA/B/C; backup/restore; optimized signed-in performance and final build/browser/visual gates. Bazaar finalization still creates returned batches and deducts ingredients; it is not yet a transfer of previously recorded Make output. Do not claim the cutover is complete or introduce a second deduction.

Physical dough-count correction is unanswered. Hosted/schema, off-device backup custody/restore drill, physical iPhone and unaided-owner acceptance remain pending. No hosted SQL/data/resource, merge, deployment, cost-rule change or release is authorized. The supplied checkpoint is archived in [history](current-history.md#archived-cloud-baseline-snapshot--6-november-2026).

PR compatibility (read-only): #51 `e407b7020fab95a8afe934639621c95d6efe5452` projects saved pickup labels only; conditional database-track compatibility is clear with one runtime import conflict, retained Cloud ownership/client fences and pending OD12 copy approval. #53 `7500b6c2b3623650e9175b5cab4828e6c949c2ce` is stacked on#51 and overlaps the unaccepted Cloud Orders read-state store: five staff-sync and one Orders UI conflict require deliberate reconciliation to one scoped source. Neither PR was changed or merged. Claude is unavailable until10November; root is sole coder and independent reviews are read-only.
