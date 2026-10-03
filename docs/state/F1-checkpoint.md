# F1 continuation checkpoint — 2026-10-03

F1 is **accepted locally, committed and pushed**. Codex completed the local F1 work; the next package stays Codex-only. F2 is next in next-goal.md. Do not restart the exhaustive repository audit.

## Accepted renewal — complete locally

Ethan explicitly renewed F1 again on 2026-10-03: **2 failed fixes or 25 turns**, starting at zero new failures. Prior attempts remain history. Root owns direct execution. The pinned CLI dry-run and its v2.116.0 primary source confirm `auth.schema_migrations` is explicitly excluded from the standard data dump. The repair adds a read-only table-specific dump using the CLI-selected connection, credentials in environment values only, into the same encrypted archive. Full table/hash/FK comparison stays mandatory. The focused `sync-unavailable.test.ts` rerun passed all four tests in one worker without source edits or timeout changes; the subsequent full verification and every code commit hook passed.

**Earlier in this accepted renewal: run 8 PASS; zero failed fixes.** All 60 tables/254 rows in `public`, `auth` and `hco_private` match source counts and deterministic hashes, including all 77 Auth migration rows. All 55 FKs match source, are validated and have zero orphans. Atomic rollback, wrong-port preservation and owned target cleanup passed. Independent repair review and parser extraction review passed. The actual archive hash is in the current receipt. Off-device custody is unconfigured and hosted health remains unreported. The shared local fixture was reset only after comparison finished, applying the F1 migration for checkout/visual gates. The subsequent gates and publication are complete as recorded below.

Final run 9 includes the applied F1 migration: **61 tables/236 rows/55 validated FKs**, matching source counts and hashes with zero orphans; owned cleanup passes. Full verify is now **77 files/1,462 tests**, Python guards 63, G0 1,217 checks/0 failures, normal/live builds and Pages/Workers checks pass. Checkout passes 11 steps. Phone/desktop missing/success/failed health, alert navigation on both widths and privacy pass; all 11 screenshots inspected. Four parser mutations join the earlier 16 (20 total), all restored byte-for-byte. All six accepted code slices are committed and pushed; each verification hook passed. The acceptance metadata and F2 handoff accompany this checkpoint. Hosted activation remains outside acceptance.

## Previous direct-execution continuation — stopped

Ethan supplied a new F1 continuation goal on 2026-10-03 with a fresh budget of **2 failed fixes or 25 turns**. Root executes the drill directly. A generated UUID name is asserted against both current CLI/harness rules before Docker creation; image, context, loopback binding and readiness are checked before the harness. Previous failures remain history below. No hosted activation is authorized.

**This direct-execution budget is now exhausted: two failed attempts.** Run 6 failed during SQL restore. Run 7 applied the repaired three-schema restore, but the strict source/target comparison found `auth.schema_migrations` had 77 source rows and zero restored rows. Recovery remains UNPROVEN; do not exclude that table or weaken comparison to pass. The exact owned target was removed and no `f1-restore-*` target remains. No further fix or drill is authorized under this exhausted budget.

The run-7 repair includes `public`, `auth` and `hco_private`, replacing only those schemas inside the guarded disposable target and one atomic transaction. Independent read-only review passed. Before the full restore, the deliberate post-DROP SQLSTATE 42883 probe passed: original target sentinel data survived, imported probe table did not, and wrong-port rejection preserved the sentinel. These prove rollback/guard behavior, not complete recovery. The full restore returned successfully and table inventories matched before the first row/hash mismatch halted the comparison; the final restored-FK checks were not reached.

Next renewed work must determine where the Auth migration rows are lost in the dump/restore path and preserve a complete three-schema restore. A CLI data exclusion is a hypothesis, not yet verified. Capture comparison failures in the receipt as well as SQL failures. Do not reset the shared source fixture before recovery comparison. Live checkout, headless visual QA, acceptance commits and push remain pending.

## Previous renewal (stopped)

Ethan explicitly renewed F1 on 2026-10-03: **2 failed fixes or 25 turns**. The renewed run started with zero failed fixes and has now stopped at two failed setup/drill attempts, conservatively counted against the limit. No hosted activation, scheduling or deployment is authorized. Preserve the earlier failures below as history.

## Previous stop boundary

The approved goal says **"Stop after 2 failed fix attempts or 25 turns."** The restore sequence was:

1. Initial SQL restore failed: missing managed `supabase_realtime_admin` role.
2. First repair bootstrapped referenced managed roles; SQL restore failed because the image's `postgres` role is not a superuser.
3. Second repair selected `supabase_admin` and tightened disposable-target validation. Its integration run failed at preflight: the validated URL object's return value was discarded, so a port comparison read a property from a string. No SQL ran in this integration run.

The parsed-URL comparison is now corrected and focused guard tests pass. **No successful integration rerun or restored-data comparison has been performed.** The two-failed-repair stop boundary applies even though the second repair failed before SQL. Do not silently redefine that boundary as two SQL failures. Owned setup containers were verified absent; no F1 restore targets remain. That run stopped at its limit. The explicit renewal above permitted continuation; its separate attempt history and new stop boundary follow.

## Renewed-run outcome

- Run 4: the bare-image disposable target exited before readiness. No backup harness or restore SQL ran; the target was removed.
- Run 5: explicit `postgres -D /etc/postgresql -c config_file=/etc/postgresql/postgresql.conf` startup succeeded and image/label/loopback binding checks passed. The harness then rejected `f1-restore-20261003-approved`, because the name must match `^f1-restore-[a-f0-9-]+$`. No backup/restore SQL ran. This was a preventable invocation error, not a restore SQL failure. The exact target was removed and no F1 target remains.
- Next drill must generate the suffix with `randomUUID()` and assert the name against both CLI and harness regexes **before creating any container**. Do not use descriptive word suffixes. The verified startup command is recorded in the operations guide. The renewed stop limit is exhausted; a new budget is needed before another integration run.
- Final port audit identified and root corrected dismissal drift: successful health refreshes now preserve `notifRead`; explicit restore remains unchanged. Focused test and auditor recheck pass.
- Four additional deliberate mutations were detected by concrete assertions: dismissal reset, CSP eval probe, queue-refresh failure aborting sync, and false unsaved wording after successful storage. Combined with the earlier twelve, 16 unit mutations were detected. Temporary source changes were restored byte-for-byte.

## Verified results

**Previous failed gate rerun after the restore/test changes: `pnpm verify` exited 1.** Port integrity, engine contract, both typechecks and lint passed. Unit results: 75 files passed / 1 failed; 1,455 tests passed / 1 failed. `tests/unit/sync-unavailable.test.ts:15` exceeded its existing 5,000 ms timeout. This is an observed timeout, not yet diagnosed as a regression or timing flake. Log: external `F1-verify-final.log`. No retry or timeout relaxation was attempted after the exhausted restore budget. The green output below belongs to the earlier renewed gate, not the latest rerun.

`pnpm verify` exited 0 with the pinned Node 24.20.0 / pnpm 9.12.3 toolchain:

```text
Port integrity OK — 54 files match the copy/style and AST baselines.
Engine contract OK — 49 exports, 21 settings keys, 38 tables documented.
typecheck, typecheck:e2e, lint: exit 0
Test Files  76 passed (76)
     Tests  1456 passed (1456)
```

- SQL role suite: 1,922 cases per reset, two fresh disposable resets, identical matrices, rollback verified, all 684 deliberate regressions detected; cleanup passed. Receipt: `evidence/F1-operations-sql.json`.
- Python guards: 63 passed. G0 validator: 1,217 checks, no failures; unrelated historical evidence churn reverted.
- Normal `pnpm build` passes with explicit `next build --webpack`. The previous default Turbopack build failed resolving generated Onest font requests; no dependency upgrade was made.
- Live static Pages build, `test:pages:spike` and `test:workers:spike` pass. Pages hydration reports zero CSP violations and zero JavaScript errors. Zod is configured without its eval/JIT probe before schema construction; CSP was not loosened.
- E2E: 89 passed, 1 failed, 75 skipped, exit 1. The failure is the known WebKit OFFLINE-01 service-worker baseline; do not call the suite green.
- Sixteen unit mutations were detected, including final CSP configuration, post-review queue branches and preserved dismissals. The renewed full verify passed with 76 files/1,456 tests.
- Encrypted database archives authenticate; wrong-key/corruption and restore-target guard cases pass. Recovery remains **UNPROVEN**.
- Independent bounded Sol review: no remaining P1/P2 code defect after fixing premature backup-success reporting, exact target binding, Windows containment, privacy wording and post-enqueue read failure. Recovery evidence still blocks acceptance.

Full local verification logs and twelve mutation receipts are outside the repo at:

`C:\Users\ethan\.codex\visualizations\2026\10\01\01a0f644-7336-7f30-bdb5-eba11dbbe271\F1-*.log`

## Implemented files and boundaries

- New migration `20260101005000_operations.sql`: raw technical receipts have RLS/no API table grants; service-only recording; owner/support/service health projection; retention fixed to 365 days. Financial records/references remain. SQL fixtures, authority/source pins and generated types are updated.
- `scripts/f1-backup.mjs`: separate roles/schema/data dump, AES-256-GCM, private temporary files/output, outside-repo atomic archive, exact loopback disposable Docker target. No local-only backup marks hosted backup health green.
- `scripts/f1-operations.mjs`: operator-only keepalive and retention; environment-supplied service key; hosted execution requires the explicit approval flag. Nothing scheduled or run remotely.
- `src/lib/data/operations-health.ts`, runtime and live-gate: real operation freshness/status/queue checks, existing alerts and existing screen contracts; demo behavior preserved.
- `src/components/live/live-shop-footer.tsx`: existing live-only slot explains named cleared fields, retained financial records and separately kept archives. No protected source or baseline edited.
- `F1-schedule.example.json` is inactive metadata with no consumer/timer. Off-device custody and archive expiry are not configured; one-year active-data retention does not define archive lifespan.

## Resume order after a renewed budget

1. Run one isolated restore integration with the corrected parsed-URL guard. Preserve exact local Docker context, image, label, container name and loopback port checks. Compare every included table's count and deterministic row hash, then validate foreign keys and absence of orphans. Capture secret-free proof and exact owned cleanup.
2. Only after the source comparison finishes, use the disposable local app fixture for the remaining `test:live:checkout` gate and headless command-line Playwright visual QA of phone/desktop System health, alert navigation and privacy. Do not use Browser/Chrome plugins. A prepared external `f1-visual.mjs` requires a PASS restore receipt; its synthetic success records test rendering only.
3. Final port review and the four remaining mutations now pass. Finish appropriate checks for any new fixes after recovery and visual proof. Record actual remaining browser/device gaps.
4. Secret-scan, commit accepted logical slices in small diffs and push the existing working branch. None of the current F1 changes have been committed or pushed. Avoid whole-file formatting churn in protected/generated/large existing files.
5. Only when every F1 local acceptance requirement is met, update state and replace F1 with F2. Present hosted activation/scheduling for Ethan's explicit approval; no deployment, merge or hosted resource is authorized.

The shared main Supabase fixture has not been reset for F1. No hosted writes, schedule activation, deployment, merge or push occurred.
