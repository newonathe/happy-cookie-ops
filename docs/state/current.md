# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; older evidence is in current-history.md.

## Released base — 17 November 2026

Current deployed base: security sourced4fb741a / PR87 / mergefd6b3834, run44063373038, all8jobs passed. Worker d0685c79-7a89-4640-b224-a44cdcf043da; Next/eslint16.4.5, production audit0. Schema88/180 verified read-only. This includes the light-palette release below; deployment of the new settings controls is still a separate exact-source gate.

Ethan confirmed the pre-espresso light palette while retaining current structure, hierarchy, fonts, geometry and controls. Source8fe6bced, PR86/merged deploydf330dfd, run44053269537: all8jobs passed. Published Worker51a6a2d1-de39-43e9-8065-afc9017a2690. Read-only schema check88migrations/180exactpublicfunctions; fresh safe-use check found0open today-or-later days, leaving2older days untouched. CLI13views at390/1920 retained layout/content/fonts; Home signed-cent negative/refund/large cases and Sell/settings checks passed. Full pinned one-worker verify258files/4177passed+2TODO; offline4; E2E90passed/78skipped; live29pages/demo builds and format passed. The owner trial remains Access-protected; this does not establish anonymous customer availability, physical-device or Cine acceptance.

## Accepted settings controls — source in this commit

The acceptance commit containing this note on `codex/client-settings-controls-20261116`, based on verified security foundationd4fb741a (Next/eslint16.4.5, production audit0) after palette deploydf330dfd, fixes Make's Products and prices row: it closes local settings before invoking its existing destination. Payment methods now explicitly offer Upload/Replace QR; the existing picker reports progress/result and blocks Save/programmatic submit during upload. Failure keeps the previous QR/account fields. The unnecessary visible sampler-item selector is removed at Cine's request; the hidden saved/default product ID and pricing path remain. No backend, schema, money-posting, auth, offline or actual configuration change.

Failing-first QR discovery/pending-submit regressions then87focused tests passed. Synthetic CLI390/1920 reduced-motion checks cover Make navigation, native chooser and tiny fake PNG upload, sampler toggle/ID retention, no overflow/errors; screenshots inspected. Independent Sol/high review clear. Full verify/format/build/offline/E2E results belong to this acceptance commit/CI. Confirm its exact merge and guarded Worker version before calling these controls deployed.

## Remaining client work and preservation

Ethan's17November side-chat adds public customer access: shop/checkout/status/lookup without login or email codes, while owner routes remain protected and order details still require their private token. The new Access app/policy and coupled release assertions must be reviewed before provisioning; do not bypass the hostname or change owner email secrets.

Pickup location/time candidate work is isolated in `happy-cookie-pickup-settings-20261116`: new unapplied migration, legacy-compatible settings and saved-order labels; focused tests and two owned-local SQL resets passed. It is not a hosted change. Still required: safe owner-controlled duplicate-flavour removal, per-sticker-choice photos, migration-kit approval and actual owner payment setup. Private screenshots/transcript/payment poster remain outside this public repository. No automatic real-record deletion or payment configuration write.

Original urgent stays ata4126ff3 with nine files matching intake hashes; all prior worktrees and6stashes remain. Do not merge those historical input bytes again or reset/copy urgent onto deploy. Retain Home's signed net, explicit Customers ground and readable settings. Current release authorization permits deploy PRs only after fresh safe-use checks; new resources and hosted migrations still need explicit approval. Preserve release hold/schema/Access gates and secret-based email digests. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.
