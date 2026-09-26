# MP-08l — duplicate local logout measurement

Status: complete locally on 2026-09-22. This slice measures and narrowly accepts the pinned provider's duplicate local-logout response. It does not change application routes, UI/UX, hosted behavior, or production state.

## Measured contract

Two fresh private GoTrue/PostgreSQL pairs measured a second local logout with the same refreshed access token after the first logout deleted its provider session row. Both pairs returned HTTP 403 with numeric `code: 403` and `error_code: session_not_found`; the sanitized body-key shape was `code`, `error_code`, and `msg`.

`supabase-auth-transport.ts` accepts only that exact numeric 403 shape as idempotent logout success. String-code variants, 401, malformed or mismatched responses, unknown codes, and all other statuses remain fail-closed.

## Accepted verification

- [Live receipt](evidence/MP-08l-duplicate-logout-live.txt) passes on two fresh private pairs.
- 33 Python guards pass.
- Guarded cleanup reports zero owned containers, networks, or residue.

No host ports, external URL, hosted system, production account, or UI/UX surface was touched.
