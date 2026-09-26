# MP-08j — private durable BFF session repository

Status: complete locally on 2026-09-22. This slice adds and verifies the durable database boundary required by the future TypeScript `SessionAuthority`. It does not wire application routes, instantiate a service client, deploy, activate a real account, or complete MP-08/G1.

## Implemented contract

Forward migration `20260101002300_private_bff_sessions.sql` creates the fail-on-collision `hco_private` schema and a private `bff_sessions` table. Browser session identifiers are stored only as hashes. Provider credentials remain an encrypted, versioned envelope; raw access and refresh tokens are not database columns. The table fixes absolute lifetime at eight hours, records refresh fencing and a bounded lease, and stages provider cleanup after local revocation.

Seven empty-search-path `SECURITY DEFINER` RPCs form the only service boundary: create, read, acquire refresh, finalize refresh, begin revoke, claim cleanup, and complete cleanup. `PUBLIC`, `anon`, `authenticated`, and `service_role` have no direct private schema/table access. Only `service_role` may execute the RPCs. Each authority-bearing operation locks the durable row and the related active profile/provider session before taking its database clock snapshot. Expired or invalid authority is revoked locally and queued for cleanup. Cleanup claims use `FOR UPDATE SKIP LOCKED`, a 30-second retry fence, and a per-row fence token.

Generated database types and the function-authority manifest include all seven RPCs and the exact 24-migration reset. `docs/DATA.md` records the private boundary. Locked UI/UX and the protected calculation engine are unchanged.

## Accepted verification

- [Two-pair repository acceptance](evidence/MP-08j-repository-live.txt) passes 11 scenario groups on two fresh pinned GoTrue/PostgreSQL pairs. It covers the role surface, malformed/cross-user bindings, deleted or inactive profiles, provider expiry, duplicate create, refresh fencing, a committed response-loss recovery check, cleanup selection/retry, and four separate-connection races. The receipt contains only sanitized labels and hashes, confirms zero demo transaction rows, and ends with zero owned containers, networks, or workdirs.
- [Focused guards](evidence/MP-08j-guards.txt) pass 26 migration, runner, and Auth-fixture tests.
- [Security continuity](evidence/MP-08j-security-continuity.txt) passes 462 role/security cases on each of two clean 24-migration resets with guarded cleanup.
- [Schema inventory](evidence/MP-08j-schema-inventory.json), [type generation](evidence/MP-08j-types-write.json), and [independent type check](evidence/MP-08j-types-check.json) agree. Two fresh generations were byte-identical, and the current function manifest verifies against the live inventory.
- [Full repository verification](evidence/MP-08j-verify.txt) runs with the repository-supported Node 24.19 runtime and covers typechecks, lint, protected-source gates, and all application unit tests.

An economical independent Codex review found no P0/P1 issue after the race, role-matrix, cleanup-identity, child-process cleanup, and lost-response fixes. Its remaining P2 is an evidence precision limit: the live fixture stores an expiry at the database statement time, then reads it in a new transaction, so the actual read is immediately after equality. The migration and static guard establish `absolute_expires_at <= v_now`; the live run establishes fail-closed behavior immediately after the boundary. No claim is made that a moving production clock was frozen at exact equality.

## Evidence aggregation and limits

This repository run proves durable SQL state and concurrency. Separate accepted layers remain necessary and are not relabeled as MP-08j SQL evidence:

- MP-08d proves AES-GCM AAD binding, version substitution rejection, and key-retirement behavior.
- MP-08h proves provider transport/binding failure handling in focused TypeScript tests.
- MP-08i proves the actual pinned local Auth HTTP signup/login/refresh/logout lifecycle, provider session deletion, and post-logout denial on two private pairs.

The next slice is an unwired TypeScript adapter that composes these boundaries. Application route composition, a deployment-trusted caller identity for rate limiting, integrated real bootstrap, offline bazaar persistence, hosted Cloudflare acceptance, and physical MacBook/iOS Safari checks remain open. No production or hosted database was touched.
