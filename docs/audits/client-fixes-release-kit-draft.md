# Client fixes release kit — draft, not applied

Target: existing Happy Cookie trial, project `enftprwcsrdbnlplfrwk`; deploy branch `agent/codex/MP-04-g1-feasibility`. Current deployed merge05a5e73e / Worker f6c46eca-7fb5-4ef9-a2c7-9fd1d5cefcc2. Default main is old and is not the release target.

Ethan18November requests push/release. This document makes the SQL scope reviewable; exact migration-kit approval and recovery prerequisites remain necessary. No hosted apply, real duplicate removal, payment configuration, order placement, new storage resource or schedule is authorized by this draft.

## Exact proposed migration sequence

1. `20260101008800_pickup_location.sql` — SHA256 `73820e7b8204d41f66146efd75e1750803938d11b349d361ac663254dab270d0`. Configurable pickup location/time; JSEC Ateneo default, existing hours retained. New/rescheduled order snapshots; no historical backfill. Historical Campus fallback retained. The default correction is to an unapplied candidate, not applied SQL. See pickup-location-migration-kit-draft.md.
2. `20260101008900_flavour_archive.sql` — SHA256 `1fbab4d570180dffc09e95fa6526a72f48bb8f614dc5eb1ae8d4afe205648232`. Owner Remove/Restore with stale/legacy-write/publication/sampler guards. No automatic record removal. IDs/history/recipes/stock retained; Restore stays off-menu/unpublished. See flavour-removal-migration-kit-draft.md.
3. `20260101009000_order_extra_choice_photos.sql` — SHA256 `f9395c86915c260de146f35e81c351306deae3ff496408f5aefc66a566db8d19`. Separate choice_images map; owner image-aware wrapper reuses the existing financial/configuration save in one transaction. Old saves preserve photos. Public projection includes only active add-ons and current exact variants. Existing media bucket/prefix/reencoding only; no actual images uploaded by migration.

Recompute hashes after any SQL change. The exact source commit/combined release PR is filled only after independent review, focused failures, owned SQL resets, full one-worker verification, builds/offline/E2E/format and CLI390/wide checks pass. Do not deploy an intermediate schema checkpoint against the final three-migration schema; the release gate compares exact migrations and public function authority.

## Before applying

- Read-only confirm target, latest applied087 and preceding history/checksums, absence of088–090, expected columns/functions/grants and no open day today-or-later. Last read18November found latest087, zero open days and14:00–15:30 pickup. Repeat immediately before the release window and stop on drift or active use.
- Record a current recoverable database backup/PITR reference and timestamp, recovery custody, and an isolated restore proof when readiness is uncertain. Keep backup bytes, credentials, keys and customer records outside Git/chat. Maintenance44239699173 skipped backup despite overall success; no recovery evidence may be inferred from it. Existing F1 procedure is docs/state/F1-operations.md; its linked dump must use a private scratch workdir and the recorded PostgreSQL version.
- Obtain Ethan's exact kit approval for this named project and reviewed hashes. Use only the reviewed Supabase migration workflow from exact approved bytes. Do not run ad hoc hosted SQL, mark a failed migration applied, reset data or modify applied migrations.
- Read back history/schema/role grants/invariants after apply, then release the exact compatible reviewed source through a PR into deploy. Preserve release hold, secret email digests and all pre/post-deploy gates. No whole-tree copy, force push or main merge.

## Public Access cutover

PR89/source2dd13539 has separately approved one narrow app/Everyone bypass policy. Operator setup/new nonsecret application ID remains missing. Preserve owner appfe0eb039-b3b5-4acc-b533-d33868810e89 and its identity/email-secret checks. Configure only repository variable TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID with the new app ID. Exact seven destinations and rollback are in PR89's docs/state/public-customer-access.md. Verify customer HTML/assets/MIME/emitted bytes without OTP and private owner/lookalike/service-worker denial before claiming public availability. Saving that app makes its paths public immediately; this is not equivalent to source deployment.

## Recovery and acceptance boundaries

Prefer additive-schema-compatible application rollback. No routine down migration or automatic database restore. A database restore needs separate approval, stopped writes, reconciliation of later activity and an isolated rehearsal; never restore over production as a test. Do not delete uploaded media to remove a photo association.

Record committed/pushed/schema-applied/deployed/public/device/owner states separately. Physical iPhone, unaided Cine, full connected cycle and operational recovery remain unaccepted. After release, publish the authorized public-repo Cloud context pack with a coverage/hash manifest and preserved WIP separate; exclude credentials/customer records/backup bytes/global memory/internal traces and unsafe pre-rewrite history.
