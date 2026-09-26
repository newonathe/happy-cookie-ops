# MP-06.d — legacy mutation RPC quarantine

Status: complete locally; HTTP/catalog and independent review acceptance passed. SQL386 scenarios,28 regressions,2 upgrades; types unchanged,16 Python guards,115 unit tests and production build pass. Parent MP-06/G1 remains incomplete. This executes the existing dispositions in [MP-06b authority plan](MP-06b-authority-plan.md). UI/UX, protected engine, seed, old migrations and business semantics stay locked.

## Scope and ownership

Root owns new `supabase/migrations/20260101001500_legacy_mutation_authority.sql`, `src/app/api/sync/route.ts`, exact-path middleware exemption in `src/middleware.ts`, `tests/unit/sync-middleware.test.ts`, security runner/version guard and evidence. A bounded test author owns `tests/integration/security/legacy-mutations.sql` and new focused route/flush tests; one independent security reviewer checks SQL/API/offline retention. Split this into sequential sub-slices if hand-edited changes exceed approximately400 lines. No hosted credentials, deployment or real records.

Revoke EXECUTE from PUBLIC, anon and authenticated on exactly `sync_event_sale(jsonb)` and `update_order_state(text,timestamptz,text,text,text)`. Retain existing service/database privileges and unchanged bodies. A service role with no active actor does not magically pass internal is_staff checks; fixture positives require explicit trusted actor context. Do not upgrade the HTTP route to a service client to bypass the restriction.

Replace the current sync HTTP implementation with a fixed503 JSON response `{ "error": "sync_unavailable", "accepted": [] }` and `Cache-Control: no-store`. It must not read the request body, construct a database client, call auth/RPC, return SQL error strings, or acknowledge any sale. This temporary endpoint is unavailable for every caller, with or without configured environment/authentication; it is not an authentication implementation. Remove its obsolete request schema/loop/imports. No new UI copy or queue implementation.

## Verification contract

Use actual SQL roles plus active owner/helper/support, inactive and missing profiles. Calls to both functions must fail42501 before reaching the body and preserve seeded orders/ledger/sales/audit. Avoid mistaking an existing function's type error or business error for a permission-denial pass. The generic order-state setter has suspect text/enum expressions; characterize its legacy error separately if necessary, do not repair it or loosen denial expectations. A red probe restoring an authenticated grant must demonstrate the invocation passed the EXECUTE boundary, even if that unsafe legacy body then raises another SQLSTATE; clearly distinguish this from successful business mutation.

The c5 audit suite currently exercises sync as authenticated active owner. Update only that compatibility fixture to actual service_role with the same authoritative active-owner subject, and label the case trusted-service compatibility. Preserve the exact generated sale/ledger/audit assertions. Separate new tests deny authenticated owner/helper/support sync. Do not remove dependency coverage to make the quarantine pass. Exact sixteen migration versions, only two RPC grant/effective-EXECUTE catalog changes, unchanged types, all prior SQL scenarios/regressions/profile upgrades and owned cleanup are required.

Test the actual route handler returns503, empty accepted list and no-store for ordinary, malformed and large synthetic request inputs without reading them; use throwing request/client seams to prove no body/auth/DB call. Test actual `flushQueue()` against that503 response with nonempty synthetic queued sales using a stateful in-memory IDB seam and real queue functions: all sale IDs/payloads remain stored, none is marked sent or deleted/pruned, failure metadata may update, retry remains possible. Do not use spies alone as proof of retained rows. No claim of actual crash durability or iPhone persistence from this test; MP-18-21 own that acceptance.

The existing OpsRuntime also marks engine-only sales synced after an empty queue/skipped flush; this source-observed defect is independent of a503 response for a nonempty persisted queue. Preserve it as an explicit MP-18/runtime integration blocker, not a successful test or approved behavior. Do not silently expand this slice into protected engine changes.

Run pnpm verify, bounded independent security review and continuity. API changes additionally require a fresh local build and real CLI HTTP probe of POST /api/sync under absent backend configuration, confirming503/no ACK/no-store. The already recorded broad routing/offline E2E failures remain release blockers; do not turn off their assertions. Do not claim MP-06/G1 closure from two quarantined commands.

## Exit and recovery

Record a precise handoff that future MP-18-20 commands must replace the temporary503 only after assigned active actor/device/event authority, server-derived totals, stock allocation, payload-hash idempotency and exact per-row acknowledgments pass. Generic order-state replacement belongs to its online command packages with state/payment/optimistic-version/audit rules. Recovery is a reviewed forward secure command change; never restore generic client EXECUTE for convenience. Subsequent MP-06 work still includes private-role projections/policies, trigger/helper/search-path authority, sequence/REFERENCES/TRIGGER and future-object defaults, followed by MP-08 real-session and MP-07 routing acceptance.

Docker recovered for this slice on Engine29.5.3 by preserving stale runtime socket directories before a normal hidden Desktop start. No images, volumes or data were reset. Historical c5 unavailability remains evidence of that earlier state. See evidence/MP-06d-environment.json.

Integration correction: middleware exempts only exact `/api/sync` before any Supabase configuration/auth call. Tests prove configured and unconfigured bypass, while `/api/sync-extra`, `/api/sync/nested` and `/orders` still authenticate. The initial jsdom Headers mismatch failed5 tests; using Node for this server-only test passes all115 without relaxing assertions.

## Accepted evidence

[SQL](evidence/MP-06d-security.json), [types](evidence/MP-06d-types-check.json), [catalog delta](evidence/MP-06d-catalog-delta.json), [HTTP](evidence/MP-06d-http-probe.json), [verification](evidence/MP-06d-verify.txt), [review disposition](evidence/MP-06d-review-disposition.json) and [exact tested inputs](evidence/MP-06d-tested-inputs.json). Actual middleware tests use mocked authentication, not real sessions. Historical full E2E78 failures/30 skipped remains release-blocking. Next local scope is trigger/helper authority and search-path inventory before a narrowly specified forward migration; real session acceptance follows MP08. No additional owner configuration is needed for that local audit.
