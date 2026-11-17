# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, public availability, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; earlier evidence is in current-history.md.

## Accepted checkpoint — 17 November 2026

Released foundation: Home signed-cent negative/refund/large-week fix, explicit Customers ground, reviewed Sell48012c53, light palette8fe6bced (PR86/deploydf330dfd) with current geometry/hierarchy retained, and Next/eslint16.4.5 security patchd4fb741a (PR87/mergefd6b3834). Last confirmed Worker d0685c79-7a89-4640-b224-a44cdcf043da, run44063373038 all8jobs passed, schema88/180 verified read-only, production audit0.

Settings source b8ad3b34 is committed/pushed and merged by PR88 as05a5e73e. Exact-merge run44106997415 is in progress; do not infer deployment. It fixes Make's Products and prices link, explicit owner Upload/Replace QR with feedback and pending-submit guard, and removes the visible sampler-item selector while retaining saved/default product ID and pricing. Failing-first tests then87focused passed; synthetic CLI390/1920 reduced-motion navigation, native picker/fake PNG, sampler retention and no overflow/errors passed; screenshots inspected. Independent Sol/high review clear. Full pinned one-worker verify259files/4185passed+2TODO, live29pages/demo builds, offline4, E2E90passed/78expected skips and format passed. No real payment settings or assets were written.

## Public customer access — source candidate in this commit

Ethan's17November requirement: shop/checkout/status/lookup open without customer login/OTP; private owner access and private order tokens remain. The coupled Access manifest/release checks require one separate app and one Everyone bypass policy limited to four customer paths and exact shared asset patterns. Parent owner app/policy/provider and secret-based email digests are unchanged. Public probes require emitted bytes/MIME; owner probes reject unexpected redirects. Four independent-review findings and one JS MIME regression were reproduced and fixed;38focused tests passed. Full acceptance is recorded by this commit/CI. Application source/dependencies are identical to accepted b8ad3b34.

**No public Access resource has been provisioned.** Local Cloudflare CLI authentication is unavailable. New app/policy require concrete explicit approval and the operator cutover in public-customer-access.md; release is blocked without its distinct app ID. Do not merge this candidate into deploy until the approved cutover and anonymous public/private checks are ready. Anonymous customer availability remains unverified.

## Remaining client work and preservation

Isolated pickup candidate in happy-cookie-pickup-settings-20261116 has owner-editable location/time, legacy-compatible saves and immutable saved-order labels,100focused tests, independent review, two owned-local SQL resets and CLI390/1920 screenshots. Its new migration is unapplied; full gate and Ethan's backup/migration kit remain required. Next: safe reversible duplicate-flavour removal, per-sticker-choice photos, and Cine's actual payment setup through the owner flow. Private screenshot transcript/payment poster stay outside Git; no automatic real-record deletion/configuration write.

Original urgent remains ata4126ff3 with all nine intake hashes intact, six stashes and all worktrees preserved. Do not replay those input bytes or copy/reset urgent onto deploy. Accepted releases require fresh no-open-today safe-use checks and schema/Access/post-deploy gates; new resources and hosted migrations still need approval. No applied SQL/protected demo/real-data/memory edits. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.
