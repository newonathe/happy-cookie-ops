# MP-08i — pinned Auth HTTP lifecycle prerequisite

Status: complete locally on 2026-09-21. This slice proves the pinned local provider behavior required by the future durable session authority. It does not implement or wire that authority, activate a real owner, or complete MP-08/G1.

## Boundary and implementation

The local-only `scripts/test-auth-http-fixture.py` builds two fresh GoTrue 2.196.0/PostgreSQL 15.8.1.085 pairs through the MP-08g-owned fixture. Both pairs use an internal Docker network, publish no host ports, use generated synthetic `example.test` accounts, apply the exact 23 pinned application migrations, retain the managed Auth schema, and start with no demo transactions. Tokens, passwords, account identifiers and response bodies never enter evidence output.

Each pair verifies signup, password login, authenticated `/user`, refresh and local logout. The test ties the provider-confirmed user to the JWT `sub` and `session_id`, checks the exact owned `auth.sessions` row before and after refresh, and confirms local logout removes it. BusyBox `wget` drops error bodies, so a bounded `curl` request from the isolated database peer records the provider's sanitized post-logout status and stable code. The accepted pinned behavior is HTTP 403 with numeric `code: 403` and `error_code: session_not_found`.

`src/lib/auth/supabase-auth-transport.ts` now accepts the measured 403 denial only when the numeric code matches the HTTP status and `error_code` is exactly `session_not_found`. It preserves the earlier hosted-gateway string-code contract and fails closed for mismatched status/code, unknown code, malformed JSON, late abort or network failure. This changes no UI, role decision or persistent state.

## Evidence and limits

- [Accepted two-pair lifecycle](evidence/MP-08i-live-accepted.txt): all steps pass twice; local logout returns 204, the session row count becomes zero, and post-logout `/user` returns exact 403 `session_not_found`.
- [Fixture guards](evidence/MP-08i-guards-final.txt) plus the final focused rerun: 21 Python tests cover fixed targets, POST logout, bounded canonical claims, child-only token environment and sanitized failure handling.
- [Full verification](evidence/MP-08i-verify-final.txt): typechecks, lint, protected UI/engine gates and 336 tests pass.
- An immediate external check found zero labeled fixture containers, networks or workdirs after the accepted run.

The access JWT is decoded only after the exact token has passed `/user`; this extracts binding identifiers and is not local JWT authentication. Provider behavior is local and pinned, not hosted Supabase/API-gateway proof. The durable repository, database transaction races, cookie authority, role/profile checks, recovery/MFA, browser wiring, hosted behavior and physical Apple acceptance remain open.
