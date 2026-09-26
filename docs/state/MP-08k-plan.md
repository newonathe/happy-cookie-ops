# MP-08k — unwired persistent SessionAuthority adapter

Status: complete locally on 2026-09-22. This slice composes the accepted database, Auth, and crypto contracts behind a typed adapter intended only for future server-side route composition. It does not enforce the server-only import boundary itself, wire a route, instantiate a service client, read deployment config, deploy, or make an integrated browser claim.

## Implemented contract

`src/lib/auth/persistent-session-authority.ts` implements the handler's `SessionAuthority` port over MP-08j's seven service RPCs, MP-08c Auth transport, and MP-08d token envelope. Its trusted caller, rate rules, and `deferRecovery` hook are injected; the latter is intended for future Cloudflare `ctx.waitUntil` composition. The adapter validates opaque identifiers and hashes, fails closed for all dependency/rate/crypto/provider failures, and never projects provider credentials.

Browser session identifier, CSRF token, and absolute expiry remain stable through routine refresh. Durable refresh fencing and cleanup remain database-authoritative. Recovery uses an independently aborted three-second operation and leaves durable cleanup pending unless both provider cleanup and durable completion succeed.

## Accepted verification

- [Focused evidence](evidence/MP-08k-focused.txt) passes 80 adapter and transport tests.
- [Full `pnpm verify`](evidence/MP-08k-verify-final.txt) passes 24 files and 363 tests; TypeScript, ESLint, and diff checks pass.
- Final independent Codex Luna/high review found no P0–P2 findings. The two earlier P2s are resolved: refresh rejection schedules cleanup, and a failed/no-row begin-revoke cannot count as durable success. See [review disposition](evidence/MP-08k-review-disposition.json).

UI/UX is unchanged. No production or hosted system was touched. Route wiring, service-client construction, deployment configuration, Cloudflare integration, and browser acceptance remain open.
