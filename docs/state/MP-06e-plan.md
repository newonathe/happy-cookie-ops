# MP-06.e — trigger and auxiliary authority

Status: local trigger remediation complete on two fresh17-migration fixtures.486 SQL scenarios/34 regression probes/2 profile upgrades pass; types unchanged,36 table grant removals/two function ACL changes,16 guards and115 unit tests pass. G1 remains active. No UI, engine, old migration, seed, hosted database or deployment changes.

## Verified baseline

[Authority evidence](evidence/MP-06e-authority.json) records public schema owner/ACL, three SQL roles, all19 table TRIGGER/REFERENCES privileges, seventeen function bodies/configuration, six existing trigger bindings and audit sequence ACL. Both anon and authenticated can CREATE TRIGGER on public.orders using public.touch_updated_at(); both actual attachments rolled back, fresh catalog matched and owned cleanup passed on both resets. This is SQL-role authority proof; it does not establish an externally reachable HTTP DDL route.

All three API roles lack public-schema CREATE but retain database TEMP. At baseline both application roles retained TRIGGER and REFERENCES on18 public tables; rate_limits was already restricted. The19-table migration target deliberately includes it. audit_log_id_seq grants read/write/usage to both. is_owner/is_staff still use search_path=public and unqualified current_role_name; current_role_name itself is already qualified with empty search_path. Six existing bindings must remain intact.

## Concrete implementation scope

Root owns new migration20260101001600_trigger_authority.sql, migration-count guard, security runner and evidence. A bounded test author may own tests/integration/security/trigger-authority.sql; independent review is required. Preserve other dirty work. Target one sub400-line slice; split auxiliary sequence/REFERENCES/defaults and helper-body work into following slices rather than exceed it.

First migration explicitly revokes table TRIGGER from PUBLIC, anon and authenticated on exactly the19 public tables captured in evidence; no blanket schema command. Revoke EXECUTE from PUBLIC, anon and authenticated on public.touch_updated_at() and public.settings_touch(). Retain trusted service/database grants, function identities/bodies and all six trigger bindings. No temporary grant restored as a compatibility workaround. Do not change helper bodies in this first migration.

Required regression evidence:

1. Exact17 migrations. Catalog delta only36 explicit application table TRIGGER grants (rate_limits already restricted) plus applicable two-function ACL/effective EXECUTE entries. No changed defaults, RLS, function bodies, types or trigger definitions.
2. Actual CREATE TRIGGER as anon/authenticated fails42501 on each19 tables. Use a separately granted harmless test trigger function to isolate table TRIGGER denial from function EXECUTE denial. Entire fixture DDL rolls back.
3. Independently verify both production trigger functions deny API EXECUTE via effective privilege checks and actual creation on a synthetic table where the actor owns/has TRIGGER. Do not mistake trigger-only context errors for permission denials.
4. Seed valid synthetic rows for orders, order_items, inventory_items, bake_batches and drops. Actual permitted authenticated-owner updates must still run all five existing timestamp triggers. Set an old timestamp, then require transaction_timestamp(), not a fragile elapsed-time comparison. Settings INSERT and UPDATE must set timestamp and authoritative auth.uid, overriding fabricated updated_by. Service role behavior remains compatible. These prove fire-time compatibility after EXECUTE revocation.
5. Red probes restore one table TRIGGER grant and each function EXECUTE grant in separate rollback transactions. Each must fail its specific denial oracle; table probes must retain the harmless function permission so they cannot remain falsely green.
6. All386 existing SQL scenarios/28 prior regressions/2 profile upgrades remain required. Extend counts explicitly for new cases. Verify fixture emptiness, trigger removal, owned cleanup, unchanged generated types,16 Python guards, pnpm verify and independent review. Never assert full JWT/session/device readiness from SQL roles.

Rollback is a forward restrictive correction, never restoration of permissive grants. If firing compatibility fails, inspect exact cause and redesign; do not silently grant back access.

## Subsequent G1 work

After this slice: remove unnecessary sequence and REFERENCES grants with actual nextval/setval/foreign-key tests; implement scoped future-object defaults proven for creator and schema; audit/qualify remaining privileged function resolution and role helpers; finish direct row-operation/capability/private projection matrix. Do not imply trigger containment finishes MP06.

References: [PostgreSQL15 CREATE TRIGGER](https://www.postgresql.org/docs/15/sql-createtrigger.html) requires table TRIGGER and function EXECUTE; [CREATE FUNCTION security](https://www.postgresql.org/docs/15/sql-createfunction.html) explains trusted search paths and temporary-schema hazards. [Review disposition](evidence/MP-06e-review-disposition.json) rejects Claude's incorrect permission/ordinary-call claims and PUBLIC-only fix. Live evidence takes precedence.

## Accepted local results

[Security](evidence/MP-06e-security.json), [types](evidence/MP-06e-types-check.json), [catalog](evidence/MP-06e-catalog-delta.json), [pnpm verify](evidence/MP-06e-verify.txt) and [final review](evidence/MP-06e-final-review-disposition.json). All earlier193 SQL cases remain and50 trigger cases are added per reset. Actual service context is a SQL-role/claim test, not JWT verification. Current migration changes no bodies or trigger bindings; positive writes exercise all six existing bindings. No fresh application build/E2E for this SQL-only slice; MP06d build/HTTP and historical full-E2E failures retain their scopes.

Evidence incident: the first script-generation command failed before changing the harness; the old harness subsequently ran and overwrote two MP06d JSON reports before failing its migration guard. Those filenames now contain explicit tombstones with original sealed hashes and failed-run links. Original accepted JSON bytes are unavailable and are not reconstructed. MP06d console log and source/type/HTTP artifacts remain. The current full486-scenario run supersedes earlier SQL evidence; failed runs are preserved under MP06e-attempt0 andattempt1 (missing synthetic inventory id, corrected).
