# Active staff profiles — operator and implementation boundaries

This is a runbook for the new database activity gate, not an instruction to operate a hosted database now. There is no production owner to activate in this local slice. Fixture auth users are fabricated, rolled back and never copied into production. UI/UX is unchanged; the staff-management interface and authenticated HTTP session contract remain later work.

## What the gate does

`profiles.active` is a required boolean with default false. The migration preserves every existing profile ID, role, display name and creation time; existing profiles become inactive. Creating an auth account alone grants no staff authority. `current_role_name()` uses the subject returned by `auth.uid()` and the corresponding active stored profile. Owner/helper/support claims supplied by a client do not replace that profile lookup.

`is_owner()` and `is_staff()` inherit the activity check through the existing lookup function. An active owner is still authorized by the existing owner profile-write policy. Helpers/support cannot promote themselves, and inactive profiles cannot reactivate themselves. SQL UPDATE denied by RLS may return zero changed rows rather than an exception; a future management API must check the affected-row result.

The own-profile SELECT policy remains: an inactive person can read their own non-secret profile row. That is not staff authority. Active helper/support still inherit overly broad staff policies elsewhere; this slice does not close those role-specific access gaps. The demo middleware checks only whether an auth user exists and remains an explicit MP-08 integration gap.

The generated RPC type names the role enum but does not express the SQL function's possible NULL result. The tests prove NULL for missing/inactive profiles. A future authenticated adapter must handle that runtime result explicitly; generated TypeScript alone is not an authorization check.

## Initial owner activation — before any real rollout

1. Complete the approved MP-08 account creation/sign-in flow. Never create real auth users by copying the minimal SQL fixture insert; the hosted auth service owns its accounts and credentials.
2. A trusted operator with database administration access verifies the business owner's exact auth user UUID from the intended project and confirms it belongs to that person. An email/display name or client-supplied role alone is insufficient. Keep service/database credentials out of browser code, source, logs and chat.
3. In a reviewed transaction on the explicitly identified project, create the owner profile if absent, or explicitly review an existing row before changing its role. Set `role=owner` and `active=true` only for the verified UUID. Do not bulk-activate imported/demo profiles or all auth accounts. Check exactly one intended row changed and preserve existing identity/display metadata unless separately authorized.
4. Through the owner's real authenticated connection, verify the subject, stored role/activity, `current_role_name()`, `is_owner()` and intended owner operations. Verify a helper/support and unauthenticated client remain denied. A successful administrative service-key query does not prove the owner's session works.
5. Record a minimal operation audit (actor, target UUID, action, timestamp, reason) through the reviewed administrative mechanism. The current direct SQL policy does not automatically create this activation audit. An audited management command and controlled deployment procedure are required before release.

No initial activation or invite was performed by this task. The above becomes executable only with the real MP-08 flow, verified project/identity and authorized rollout operation. No additional paid tools are required by this procedure.

## Deactivation and recovery

An authorized active owner can deactivate another profile under the existing policy; a trusted database administrator can recover from accidental loss of the last active owner. The product must not offer client self-reactivation. Before a real deployment, record who holds recovery access and where the project/recovery instructions are stored securely; do not store a service key in this document.

For recovery, verify the intended account and project as in initial activation, inspect the existing profile, then set active true on only that confirmed row in an explicit transaction. Preserve role/display-name data, verify the affected row and real owner-session behavior, and record the recovery reason. Do not bypass this with a forged JWT role or a new broadly privileged public RPC. Recovery SQL is not automatically executed, exposed as an API or authorized against production by the local tests.

The SQL tests show that the same subject loses authority on a later statement after deactivation in the fixture. This is a database lookup gate, not cancellation of in-flight transactions, deletion of cached pages, sign-out, or revocation of the auth session itself. Transaction snapshots and application caches have their own behavior. MP-08 must verify real session expiry/revocation and fail-closed BFF/route handling. Owner self-deactivation/last-owner safeguards and audit commands need a separate reviewed product implementation.

## Local proof and repeatability

Run `python scripts/test-db-security.py` in the active local root with Docker running. The runner rejects external targets, resets its own loopback fixture twice, and rolls back every profile/auth row. It tests active/inactive/missing/default profiles, forged app-role claims, RLS product visibility, denied profile self-writes, explicit owner activation, same-subject deactivation, and a shadow temporary profile table. It also replays all earlier RPC/order-insert containment tests.

The populated-profile upgrade rehearsal temporarily restores the old shape inside a transaction, inserts a synthetic legacy owner, runs the actual new migration, proves data preservation/default-inactive behavior, then rolls back. The red regression probe removes the active predicate only inside a failing transaction; it must be detected. Fresh connections must find all fixture tables empty afterward.

The local image's `auth.uid()` reads `request.jwt.claim.sub`; the tests set that and the JSON claim setting explicitly, with a real stored profile matching the subject. This does not prove JWT signatures, the full hosted auth schema, GoTrue behavior, or that an HTTP client may set trusted database session variables. Those are separate acceptance tests.
