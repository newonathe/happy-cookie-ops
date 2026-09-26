# MP-05.a: first disposable database bootstrap

Status: PASS for MP-05.a using the owner-authorized explicit-connection loopback fixture. Two real CLI resets, catalog/schema equality, empty transactions and cleanup passed. The CLI-managed `--local` transport remains unsuitable on this installation; it is not the accepted fixture. Parent MP-05 remains incomplete.

## Latest completion checkpoint — 2026-09-10

Run `python scripts/test-db-bootstrap.py` from the authoritative root with Docker running. The fixture uses the already installed CLI and cached image; it needs no Supabase account, hosted project, user-provided credentials or environment file. It exits nonzero if any reset, assertion, isolation or cleanup check fails. Run `python tests/integration/db/test_bootstrap_harness.py -v` for the eight guard/failure tests; this includes one real disposable startup failure and cleans its resources. These Python tests are separate from `pnpm verify` and must be run explicitly when changing the fixture.

- [Final bootstrap result](evidence/MP-05a-bootstrap.json) and [execution log](evidence/MP-05a-explicit-reset-final.txt): two real CLI 2.116.0 explicit-connection resets PASS, PostgreSQL server 150008, image ID recorded. Six identity/binding checkpoints require exactly one `127.0.0.1` publication on the generated port. The image was resolved to its cached ID before container creation.
- Both resets recorded exactly the eight repository migration versions through the CLI itself. Existing SQL assertions verified `drop_remaining(uuid)` returns integer, all 19 public table row counts, five empty transaction tables, function identities and settings defaults. Normalized inventories and public schema-only dumps matched. The second reset removed a real sentinel table/row created after the first; no migration history was manufactured.
- [Guard test log](evidence/MP-05a-fixture-tests.txt): eight tests PASS. [Injected failure evidence](evidence/MP-05a-failure-cleanup.json) intentionally records `status: failed` for the injected startup exception, with cleanup PASS, zero resets and an unrelated container preserved. That failure is the test oracle, not a failed acceptance run. Missing/malformed/mismatched creation IDs and removal failures retain resources for inspection.
- [Final application gate](evidence/MP-05a-fixture-verify-final.txt): `pnpm verify` exit 0, 14 files and 105 tests passed, including port integrity, engine verification, both TypeScript checks and lint. [Continuity](evidence/G1-continuity.json): 1,184 checks, zero failures. Full application E2E, auth/RLS and Apple-device acceptance were not rerun or claimed by this fixture change.
- One bounded Codex Terra/medium reviewer identified a missing-ID cleanup ambiguity. Root fixed it, added focused tests and reran the two-reset fixture. The reviewer confirmed no remaining blocker in that scope. No Claude execution or additional worker was needed in this continuation. Review disposition: [record](evidence/MP-05a-fixture-review.json).
- The original two-line SQL repair is unchanged; UI, UX, engine, seed, other migrations and dependency versions were not changed in this continuation. No deployment, remote database access, auth/RLS acceptance or automatic runner is included.

Next: MP-05.b database type generation and application/schema reconciliation, then MP-06 grants/RLS. Do not introduce live credentials or claim the application works against this database merely because its bootstrap passed. Earlier failed transport/readiness evidence below is retained for diagnosis and superseded only within the explicit-connection fixture's scope.

MP-05.b subsequently added a post-reset introspection callback and a dependent-cleanup retention marker to the shared harness. Its [current fixture evidence](evidence/MP-05b-bootstrap.json) records two resets against that exact newer harness hash, and [guard tests](evidence/MP-05b-bootstrap-guard-tests.txt) reran all eight guards successfully. The original MP-05.a hashes remain historical; use the MP-05.b evidence for the current shared script.

## Owner decisions and provenance

The owner answered that the Cloudflare account is created and no Happy Cookie Supabase database exists or SQL has ever been run. This is owner-confirmed migration history, not a remote database inspection. No deployed migration history needs preserving. The original delivered SQL remains in the archived OneDrive delivery and Git history. The approved working-copy repair is limited to the exact two delimiter changes; archived delivery/history remain intact.

## Exact implementation slice

1. Apply only the two delimiter edits in [the proposed patch](evidence/MP-05a-proposed-baseline.patch): `as $` to `as $$` at line 369 and `$;` to `$$;` at line 387 of `supabase/migrations/20260101000000_init.sql`. Do not change the function body, grants, policies, constraints, seed, UI or business rules.
2. Add `scripts/test-db-bootstrap.py`, a manually invoked disposable test harness (target <=180 lines). It accepts no remote URLs/project refs and fails closed on target uncertainty. The checkout's ordinary db:reset script is not used.
3. Add `tests/integration/db/bootstrap.sql` (target <=60 lines) for actual catalog/row assertions. Execute with ON_ERROR_STOP. Collect the eight migration versions, public tables/function identities, and public table row counts. Assert all expected migrations applied, `drop_remaining(uuid)` resolves with integer return type, and business transaction tables contain no demo rows. Settings/configuration defaults created by migrations are recorded separately.
4. Save a sanitized outcome in `docs/state/evidence/MP-05a-bootstrap.json` and update task state. This is local database syntax/bootstrap evidence only. Do not claim RLS authorization, sync correctness, real application types or full MP-05 acceptance.

## Isolation and execution oracle

- Use pinned Supabase CLI 2.116.0 and the repository's declared PostgreSQL 15 family. Record actual image IDs/version; do not silently upgrade the CLI or database major version.
- Create a unique temporary sibling workdir/project_id; copy only config and migration files. No `.env`, existing `.temp` project link, credentials, seed fixtures or inherited remote project identifier.
- Set `[db.seed] enabled = false` in the temporary config before the first start. Also use `db reset --local --no-seed` explicitly. The authoritative config and generated seed remain unchanged.
- Check Docker server readiness and all required local ports. Never kill an unrelated container/listener. Reassign temporary ports or stop with a concrete setup report on collision.
- Start the temporary Supabase project using its --workdir; keep services bound locally. Do not expose this known-unsafe, pre-MP-06 schema outside the local machine.
- Run a fresh reset with --local --no-seed, catalog checks and zero-demo-transaction assertions. Repeat reset once to verify reproducibility; compare sorted schema/catalog metadata.
- Do not write raw startup/status output to evidence: Supabase can print local credentials. Capture only allowlisted versions, local project/resource names, migration filenames, exit codes, assertion summaries and scrubbed errors. Never print a database URL, password, JWT or API key.
- Bound startup/reset processes and report failures. Stop on any additional SQL blocker; capture its exact statement/error and propose a separate minimal repair. Never mark a failed migration applied, suppress SQL errors or add permissive grants to make the test pass.
- Cleanup uses only the unique workdir/project_id and resources recorded by this run. Use `supabase stop --project-id <owned-id> --no-backup` only after verifying the ID belongs to the disposable run. Never `--all`, global Docker prune or a checkout/remote reset. Verify resolved paths before recursive temporary-file cleanup.

## Ownership, verification and rollback

One Terra/medium implementation worker owns the two-line SQL repair and the new bootstrap harness/assertions after approval. Root owns state/evidence and runs the real database checks. A bounded independent security reviewer checks target guards, resource cleanup, secret redaction and the exact SQL diff; no broad schema redesign. No extra Claude coordination layer or recursive agents.

Required checks: fresh and repeated isolated local SQL replay, catalog assertions, `pnpm verify`, changed-path review and continuity validation. Generated application TypeScript types and schema/grants gap mapping are the next separately scoped MP-05.b; least-privilege SQL enforcement is MP-06. Later slices retain their own plan gates.

Rollback: restore the two working SQL lines from Git if needed and discard only this run's disposable database/files. Never modify the archived delivery or any unrelated Docker resources. No commit/push/deployment is included in this slice.

## Sources and approval boundary

- [PostgreSQL 15 dollar quoting](https://www.postgresql.org/docs/15/sql-syntax-lexical.html#SQL-SYNTAX-DOLLAR-QUOTING) defines matching delimiters.
- [Supabase CLI reset reference](https://supabase.com/docs/reference/cli/supabase-db-reset); installed CLI help confirms --local/--no-seed and --workdir. Installed stop help must confirm cleanup flags before execution.
- [DP-09](../master-plan/10-decisions-and-sources.md) says to approve repair of a demonstrably unapplied baseline. [AGENTS.md](../../AGENTS.md) requires a concrete plan and wait for changes over about 50 lines. The earlier approval covered only MP-04.b; it does not resolve this explicit SQL baseline gate.

Owner approval resolves DP-09 for this two-line repair and its isolated test harness. Do not ask again for this slice. Any additional SQL defect remains a separately reviewed change under the stop boundary.

## Execution checkpoint — 2026-09-10

- The initial migration diff is exactly the two approved delimiter edits. No other migration, seed, protected UI or engine changed in this slice.
- [SQL replay evidence](evidence/MP-05a-sql-probe.json): all eight migration files executed successfully in each of two fresh PostgreSQL containers with `--network none` and no published ports. Both produced the same 19 public table names and zero rows in the five business transaction tables. Recorded file hashes identify the tested SQL. This is SQL-only evidence; it does not establish CLI migration history, full catalog equality, auth or RLS correctness.
- [Historical standard bootstrap evidence](evidence/MP-05a-bootstrap-attempt1.json): the locality guard rejected actual published ports outside loopback before either required CLI reset. Cleanup passed. The custom bridge's `host_binding_ipv4=127.0.0.1` option did not constrain the actual published bindings on this Docker Desktop installation; an independent harmless container reproduced `0.0.0.0` and `::` bindings. The accepted replacement uses explicit binding and the CLI's explicit-connection reset path, as documented above.
- [Application verification](evidence/MP-05a-verify-final.txt): `pnpm verify`, exit 0; 14 test files and 105 tests passed. Earlier interrupted verification is retained as incomplete evidence. Diagnostic startup failures were fixture readiness races, not additional migration defects.
- Terra reached its usage limit after partial implementation. Root reconciled and completed the files. Read-only Claude Sonnet review completed; root addressed repeated binding checks, cleanup retention, subprocess bounds and narrow error scrubbing. The proposed transaction table rename was rejected after checking the actual schema. A write-enabled Claude delegation was blocked by automatic approval review and was not retried.
- Docker Engine is available and Cloudflare CLI OAuth succeeded. No Supabase account/project, hosted database, deployment or paid service was created. No disposable containers or custom networks remain after final inspection; preserved Docker socket backups remain untouched.

## Fixture replacement plan and research history

### Concrete continuation authorized by owner — 2026-09-10

The owner now requests this fixture plan and completion of safe local verification. Root owns `scripts/test-db-bootstrap.py` and checkpoint/evidence updates; one Terra/medium read-only reviewer checks isolation and cleanup. Add focused standard-library tests in `tests/integration/db/test_bootstrap_harness.py`. No product/schema edits or second migration repair are included.

Use the cached `public.ecr.aws/supabase/postgres:15.8.1.085` image resolved to its actual image ID. Create one uniquely labeled disposable container, with no host mounts, an internally generated password supplied only through child environment, and explicit `127.0.0.1:<free-port>:5432` publication. Capture its ID before start; require its ownership label, image, exact binding and running state before/after each reset. Temporary config DB/shadow ports must differ from the actual published port: the pinned CLI's `IsLocalDatabase` predicate otherwise chooses its managed-container recreation path. This is the supported explicit-connection reset path against a local disposable database, not certification of `db reset --local`.

Construct the password-free `--db-url` internally with literal `127.0.0.1`, generated port, database/user `postgres`, disabled TLS only for loopback and a bounded connect timeout. Supply only the generated password through `PGPASSWORD`; inherit no PG/Supabase credentials or project link. Invoke pinned CLI `db reset --db-url <generated-local-target> --no-seed --yes --workdir <owned-sibling>` twice. Keep the current SQL assertion template; compare both normalized inventories and a public schema-only dump with volatile dump restrict markers removed. Insert one temporary sentinel table between resets and assert the second reset removes it, proving an actual reset rather than a no-op.

Tests cover empty/wildcard/wrong-port/replaced-container bindings, ownership cleanup refusal, secret redaction, invalid external arguments and cleanup retention on errors. Real execution covers two successful resets plus one injected failure after owned-container startup, checking cleanup and an unrelated sentinel container's survival. Clean only captured/validated owned resources; preserve evidence and fail if ownership is uncertain. Stop on any actual migration failure without editing additional SQL. This revised fixture replaces the blocked transport for MP-05.a acceptance; the historical managed `--local` limitation stays recorded.

Pinned source reviewed: [explicit connection parsing](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/utils/flags/db_url.go), [local-target detection](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/utils/connect.go), and [reset application](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/migration/down/down.go). No CLI update is needed.

First resolve safe local database transport; do not repeat successful SQL syntax work as a substitute for the missing CLI checks. The current harness remains fail-closed. Pinned CLI 2.116.0 configures the database port with no explicit HostIP; its PostgreSQL 15 local reset recreates the container, so precreating a loopback-bound container does not establish safe repeated reset behavior.

Prepare a separate small fixture plan for explicitly publishing only `127.0.0.1:<reserved-port>:5432`, checking actual bindings before any migration command and using only a generated disposable local connection. Confirm the pinned CLI's supported explicit-connection migration/reset semantics before choosing that path. Never accept a user-supplied remote URL, manufacture migration history, change global Docker networking or upgrade dependencies silently. If CLI reset cannot satisfy this isolation contract, document the exact missing acceptance and use a reviewed alternative fixture without calling it a standard local reset.

Expected ownership: one economical worker owns the fixture only; root runs it and records evidence; a bounded independent reviewer examines target validation and cleanup. Likely files are `scripts/test-db-bootstrap.py`, `tests/integration/db/bootstrap.sql` only if the assertion contract needs adapting, and state/evidence documents. Preserve the two-line SQL repair. Before implementation, finish the concrete command/test plan under the repository's plan gate. Required outcome remains two genuine successful migration applications/resets, actual history/catalog assertions, zero demo transactions, reproducibility, loopback verification throughout and cleanup after success/failure. MP-05.b type generation and MP-06 authorization remain separate work.

References for that next investigation: [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/), [bridge options](https://docs.docker.com/engine/network/drivers/bridge/), and pinned Supabase CLI source for [container configuration](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/utils/config.go) and [reset behavior](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/db/reset/reset.go). Local runtime observations, rather than documentation defaults, determine this checkpoint's failed isolation result.
