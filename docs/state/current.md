# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, public availability, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; older receipts are in current-history.md.

## Accepted foundation — 17 November 2026

Keep the released light palette and current structure/hierarchy. Home signed-cent negative/refund/large-week fix, explicit Customers ground and reviewed Sell48012c53 are retained. Palette8fe6bced released via PR86/df330dfd; Next/eslint16.4.5 security patchd4fb741a released via PR87/fd6b3834. Security release run44063373038 passed all8jobs; production audit0.

Settingsb8ad3b34 fixes Make Products and prices navigation, makes owner QR upload/replace discoverable with pending-submit guard, and removes the visible sampler-item selector while preserving its saved/default ID and pricing. PR88 merged as05a5e73e; exact-merge run44106997415 passed all8jobs. Deployed Worker f6c46eca-7fb5-4ef9-a2c7-9fd1d5cefcc2; schema88migrations/180exactpublicfunctions verified read-only, private Access post-deploy checks passed. Full259files/4185pass+2TODO,87focused, live29pages/demo builds, offline4, E2E90pass/78expected skips, format and CLI390/1920 screenshots passed; independent Sol/high review clear. No real payment account/QR was configured.

Public-customer Access source candidate2dd13539 (held draft PR89) is isolated on codex/public-customer-access-20261117. It couples narrow public customer/asset destinations with strict release probes while preserving owner Access/provider/policy and secret email digests. No resources provisioned; public availability is unverified. Ethan explicitly approved the exact narrow app/policy cutover on17November. Authorized operator setup and the distinct app ID are still pending; local Cloudflare CLI is unauthenticated. Do not merge a missing-ID candidate into deploy.

## Pickup settings — 18 November source acceptance

Isolated codex/pickup-location-settings-20261116 adds owner-configurable special pickup location alongside existing time controls. New unapplied20260101008800 migration adds campus_label and snapshots order pickup labels without backfilling historical orders. Existing9-key owner saves preserve the label; new10-key saves validate it. Public rules expose exactly9customer fields, excluding owner anti-abuse settings. Owner/status/message views use saved labels, with legacy Campus fallback. Existing saved IDs, time/capacity/payment rules and private tokens remain.

Failing-first label and status/message regressions then100focused tests passed. Independent Sol/high review cleared copy/grant/legacy concerns after fixes. Two owned-local SQL resets passed roles, stale/input refusal, snapshots/reschedule, the existing order-lookup nine-key proof and deterministic function inventory; owned cleanup passed. Synthetic CLI390/1920 reduced-motion form save/reopen and fresh checkout label/time checks passed; four screenshots inspected, no real order submitted. Typecheck, live29-page build, demo build retry, offline4 and E2E90passed/78expected skips passed. The interrupted first demo build is not counted as a pass. Full one-worker verify and format belong to this acceptance commit. Migration kit: docs/audits/pickup-location-migration-kit-draft.md. **No hosted migration/configuration change has been applied.** Cine can set JSEC Ateneo and14:00–15:30 after approved migration/deployment; root has not changed real settings.

## Remaining work and preservation

Next: safe reversible duplicate-flavour removal and per-sticker-choice photos, keeping history/prices/IDs and using existing media capabilities. Private concerns transcript/payment poster remain outside Git. No automatic real-record cleanup/payment configuration.

Original urgent remains ata4126ff3 with all nine intake hashes, six stashes and prior worktrees preserved. Never reset/copy a whole worktree onto deploy or replay preserved input bytes. Accepted releases require fresh no-open-today safe-use and existing schema/Access/post-deploy gates. Hosted migrations require Ethan's backup/migration kit; new resources require explicit approval. No applied SQL/protected demo/real-data/memory edits. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.
