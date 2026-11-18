# Pickup location migration kit draft

**Status: unapplied candidate. This draft does not authorize a hosted change.**

Candidate: `supabase/migrations/20260101008800_pickup_location.sql`

SHA-256: `73820e7b8204d41f66146efd75e1750803938d11b349d361ac663254dab270d0`

Scope: add configurable `order_rules.campus_label`, snapshot a pickup label on new/changed orders, and replace the existing order-rules and customer/status/staff read functions while retaining their role checks and grants.

## Before any hosted apply

1. Ethan must explicitly approve applying this exact migration to a named project. Approval for another migration or release does not carry over. Do not apply from this draft or from a developer checkout.
2. Confirm the target project ref and migration history with the owner. Verify migration `20260101008800` is absent and the preceding schema is the reviewed candidate. Stop on any drift; do not mark a failed migration applied.
3. Confirm a current recoverable database backup/PITR point and record its timestamp with the operator. If restore readiness is uncertain, stop and rehearse on an isolated restore first. Keep all credentials outside this repository and command logs.
4. Verify the approved migration bytes against the SHA-256 above. Review the exact change, run the candidate's focused SQL security tests on a disposable local database, and inspect the resulting function signatures, grants and nine-key customer projection before scheduling the production window.
5. With approval and the owner present, apply only through the project's reviewed Supabase migration workflow. Do not run the SQL ad hoc in the hosted SQL editor. Read the resulting migration history and run the authorized post-apply checks before reopening writes.

## Expected data behavior

- Existing shops receive Cine's requested `JSEC Ateneo`; valid labels are trimmed, one line and 1–80 characters. This corrects only the still-unapplied candidate's default, confirmed absent from hosted history18November. Existing configured14:00–15:30 hours stay unchanged.
- Existing orders are not backfilled. Their pickup snapshot stays null/legacy-compatible; new or changed special pickups record the then-current label and time.
- The anonymous shop-rules projection has exactly nine customer-facing keys, including `campus_label`; it must continue excluding `max_unpaid_per_phone` and all owner-only fields.

## Recovery limits

There is no routine down migration. Prefer rolling the application back while retaining the additive schema. Dropping the new columns/functions would lose owner-configured labels and order snapshots. A point-in-time database restore can also discard orders written after the restore point, so it requires stopping writes, preserving/reconciling later activity, an isolated restore check and separate owner approval. Never restore over production as the first test.
