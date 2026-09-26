# MP-08h — provider-session binding and stable refresh response

Status: local server-only prerequisite. The persistent session repository, real Auth HTTP lifecycle, database authorization, and G1 acceptance remain incomplete.

## Problem and boundary

The Auth transport previously projected a verified-looking user ID from a token exchange but did not provide the provider session ID required by the durable repository contract. A decoded `session_id` claim alone is not authentication. The HTTP refresh handler also accepted a changed cookie identifier, CSRF token, or absolute expiry from its authority and sent a replacement cookie. That conflicts with MP-08d/e's fixed routine-refresh identity and could strand a browser after a lost response.

## Local changes

- `src/lib/auth/supabase-auth-transport.ts`: add `verifyBinding(result, signal)`. It sends the exact returned access token to the fixed `/auth/v1/user` endpoint, then parses its canonical JWT payload and requires equality between the Auth-confirmed user ID, exchange user ID, and `sub`. It returns only the matching user ID and UUID `session_id`; malformed, mismatch, unexpected HTTP response, and late abort fail closed with the existing static transport error. An exact recognized Auth 401 denial returns `null`. The method has no direct role or session-table authority.
- `src/lib/auth/session-handler.ts`: a routine refresh may return a new profile role, but the principal, opaque session identifier, CSRF token, and absolute expiry must be unchanged. A mismatch returns 503 without a cookie. A successful routine refresh returns the safe projection without resetting the cookie.
- Focused real Request/Response tests cover the fixed Auth target, identity mismatch, malformed claims, expected denial, late abort, changed refresh identifiers/expiry, and accepted role change. Existing handler and transport suites remain intact.

The method remains unwired. The future authority must call it after login and after each provider refresh, then atomically verify `auth.sessions.id`, `auth.sessions.user_id`, `not_after`, active profile, local state, and refresh fence using database time before creating or finalizing a durable record. No client-provided or merely decoded claim can substitute for those checks. A database or provider outage must deny the operation. The existing generic rate limiter's fail-open behavior is not suitable for authentication and must not be used directly by the future authority.

## Acceptance and limitations

Focused unit tests and `pnpm verify` are the local gate. Independent read-only review must inspect exactly these boundaries. A fake Fetch response can test parsing and error handling, but it cannot prove pinned GoTrue's actual `/user` behavior, real session cleanup, database privileges, transaction races, Cloudflare runtime behavior, or Apple browser integration. Those remain required MP-08/G1 work. No protected UI/UX, engine, migration, hosted database, account, deployment, or automatic runner is changed by this slice.

Official behavior references checked 2026-09-21: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) documents the `session_id` JWT claim and its `auth.sessions` row; [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser) documents the network-authenticated user result. These explain the contract but do not replace actual pinned-provider tests.

## Evidence

The accepted [full verification](evidence/MP-08h-verify-attempt1.txt) passed 336 tests in 23 files, typechecks, lint, engine contract, and protected UI integrity. The focused two-file suite passed 97 tests. An independent Sol/high [read-only review](evidence/MP-08h-review.json) found no actionable issue in the new binding or refresh invariants; it inspected code and tests but did not run them. This plan is not an accepted persistence migration or live SessionAuthority.
