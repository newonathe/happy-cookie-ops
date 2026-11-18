# Flavour removal migration kit draft

**Unapplied candidate. This draft does not authorize hosted changes.**

Migration: `supabase/migrations/20260101008900_flavour_archive.sql`  
SHA-256: `1fbab4d570180dffc09e95fa6526a72f48bb8f614dc5eb1ae8d4afe205648232`  
Predecessor: pickup migration `20260101008800` from source371df470 / held PR90. The current hosted checkpoint is still88migrations. Do not apply089 alone or mark missing history as applied.

Before apply, Ethan must approve the exact project, reviewed source and migrations, with a current recoverable backup/PITR point and the existing migration kit. Confirm actual migration history and function/column/grant drift read-only. If backup/restore readiness or target identity is uncertain, stop and rehearse on an explicitly owned isolated restore. Keep credentials and business-data backups outside Git and chat.

Run the candidate's focused owner/helper/anonymous, stale-write, legacy-save/publish, sampler, Restore and retained-history SQL proofs on two owned disposable resets; verify generated types, authority pins, independent review and full source gates before approval. Apply only through the reviewed migration workflow from exact approved bytes, during a safe-use window. Read back schema/grants/invariants and run post-apply checks before a source release. No ad hoc hosted SQL or developer-checkout push.

The schema adds removal metadata and owner commands. It does **not** remove existing flavours or clean duplicates automatically. Cine must choose individual records through the owner interface. Product IDs, orders, recipes and stock remain; Restore keeps a flavour off the order form and unpublished. A configured sampler item must be released by switching the sampler off before removal.

There is no routine down migration. An application rollback can retain this additive schema, while the removal invariant continues to protect older clients. Dropping metadata/guards would lose removal history and could expose removed products. Any database restore requires separate approval, stopped writes, an isolated restore rehearsal and reconciliation of later activity; do not restore over production as a first test.

Independent Sol/high source review is clear after fixing archived edits/publication, shop-view projection and acknowledgment/read-race defects. Two owned-local SQL resets and cleanup passed. Live29-page/demo builds, offline4, final E2E90pass/78expected skips and CLI390/1920 normal/reduced checks passed. Format and the mandatory pinned one-worker verify are enforced by the acceptance commit. Earlier transient WebKit Cash-click timeout passed unchanged on focused and full reruns. If source changes, recompute the hash above before requesting apply approval.
