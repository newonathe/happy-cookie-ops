# MP-06m — future-function default authority rehearsal

Status: diagnostic **complete locally**, 2026-09-26. Claude reviewed and ran it, because Codex is unavailable. See "Result" below. MP-06 and G1 remain open. This is a rollback-only local probe, not a migration, hosted change or claim of managed-upgrade compatibility.

## Verified boundary

The 27th migration is `20260101002600_erasure_digest_authority.sql`. Existing `postgres` defaults include a `public` function entry that explicitly grants EXECUTE to `anon`, `authenticated` and `service_role`. PostgreSQL also grants routine EXECUTE to PUBLIC by default. Its [ALTER DEFAULT PRIVILEGES reference](https://www.postgresql.org/docs/15/sql-alterdefaultprivileges.html) says a schema-specific REVOKE cannot cancel a global grant, and schema entries add to global defaults. Therefore a global-only postgres revoke is a test candidate, not an accepted fix. Earlier [creator evidence](MP-06i-plan.md) distinguishes `postgres` from managed Auth/extension owners; current functions remain guarded by the reviewed [authority manifest](../../tests/fixtures/function-authority.json).

## Bounded implementation and proof

One worker owns `tests/integration/security/future-function-defaults.sql` and `scripts/probe-future-function-defaults.py` only. The SQL fixture must run inside BEGIN/ROLLBACK after a fresh 27-migration reset. Snapshot the current postgres global/public function defaults and existing public/managed function ACLs. Create harmless pre-change functions in `public` and a unique scratch schema, then apply only `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` inside the transaction. Create post-change functions in both schemas, grant scratch-schema USAGE for privilege inspection, and record exact ACL/effective EXECUTE for `anon`, `authenticated`, `service_role` and an unrelated role. Assert that the sole default-catalog delta is the new postgres global routine entry, that the existing postgres public function entry is unchanged, and that no existing function ACL or managed creator default changes. The public post-change function is expected to remain executable by application roles; report global-only hardening as insufficient if observed, never as a pass for the security objective. Scratch-schema behavior must demonstrate the global change. Roll back and check all probe objects/defaults are absent or restored through a fresh connection.

The standalone runner imports the existing guarded `test-db-bootstrap.py` harness, accepts no external database URL or project reference, writes only owned MP-06m evidence, and proves identical output across two resets and exact owned cleanup. Root reviews the SQL and runner, executes the two-reset probe, checks all generated evidence/continuity and reruns pinned `pnpm verify` if source changed. No applied migration, UI/UX, engine, production secret, Cloudflare resource, remote Supabase, commit, push or deployment belongs to this slice.

Stop if the default or creator inventory differs, a managed catalog/ACL changes, the candidate unexpectedly grants or removes other privileges, the fixture cannot prove rollback/cleanup, or the two resets diverge. A later 28th migration needs a separate reviewed plan, replay-safe explicit grant decisions and actual managed creator/upgrade rehearsal. No merely green local probe closes MP-06.

## Result — 2026-09-26 (Claude)

- **Review before running.** The SQL fixture and runner were written by Codex and had never run. Claude read both before running them:
  - The fixture connects as `postgres` (`psql -U postgres` in `scripts/test-db-bootstrap.py` L166), so `FOR ROLE postgres` defaults apply to the probe functions it creates.
  - The runner redirects the harness report to `MP-06m-bootstrap.json`. The historical `MP-05a-bootstrap.json` is therefore not overwritten.
  - It accepts no arguments and checks rollback and cleanup through a fresh connection.
- **Run:**
  - Two fresh 27-migration resets gave identical results. The catalog was restored and the probe objects were absent after `ROLLBACK`.
  - Owned cleanup passed, with zero containers or volumes left after the run.
  - Receipts: [function defaults](evidence/MP-06m-function-defaults.json), [bootstrap](evidence/MP-06m-bootstrap.json) and [run log](evidence/MP-06m-run.txt).
- **Finding (security):** a global-only `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` is **insufficient**.
  - It adds exactly one default entry (`{postgres=X/postgres}`) and removes implicit PUBLIC EXECUTE in other schemas.
  - A new function created by `postgres` in `public` still gets EXECUTE for `anon`, `authenticated` and `service_role`. That comes from the existing public-schema default entry.
  - So any future migration that creates a `public` function without an explicit `REVOKE` exposes it to anonymous PostgREST callers. Today only the reviewed [function authority manifest](../../tests/fixtures/function-authority.json) catches this, at test time.
- **Next (not started):** a separate reviewed plan for a 28th migration. It would also revoke the `public`-schema function defaults from `anon`/`authenticated` and make explicit grants for any function that needs them. It needs a replay-safe grant review and a managed-Supabase creator/upgrade rehearsal before acceptance. MP-06 stays open.
