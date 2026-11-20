# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, public availability, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; prior details are in current-history.md.

## Released — 20 November 2026

Latest deployed: #136 (merge `1bb77b1b`, run 44663174360, Worker version `39652258-644b-4fa5-af3f-f974413e1e7d`). Hosted schema: migrations through 095 (091 café prices, 092 refund ref + waitlist Instagram, 093 bazaar day on any device, 094 café orders, 095 helpers), each applied after a verified backup with a one-file kit (`C:\Users\ethan\HappyCookie-Cutover-NN`). The release gate refuses to deploy while a merged migration is unapplied, so each migration is applied right after its PR merges. The 19 November releases (#107–#127) are in [history](current-history.md).

- **#127 box page:** "Order a box!" beside Your order: tabs per active box size, round pictures, exact fill; priced by the existing rule (cookies at their prices plus the box size's charge).
- **#128 / #130 café prices and orders:** a café price per product (default retail × 0.7 rounded down to ₱5, editable on Edit product); café orders with the setting "Café orders count toward the weekly limit" (default on). Being reworked (#137, 096–097): café sales become a manual bulk sale log on their own Café page with expenses, off every customer surface.
- **#132 S1:** refunds need a reference (form and `staff_refund`); `join_waitlist` refuses a blank Instagram handle; pickup date proofs.
- **#131 S2:** the bazaar day belongs to the account: `get_bazaar_day` returns sales, voids and table stock; any device may sell; the till hydrates from the server and lays its unsent queue on top.
- **#135 / #136 S3 helpers:** `profiles.access_expires_at`; Cine adds helpers with an expiry on People; helpers land on Bazaar, sell, void their own sales, record stall expenses and close the open day; late offline sales stamped before the close count; expired helpers see "Your access has ended". Needs Ethan: deploy the `create-helper-account` Edge Function and create the second Cloudflare Access app (steps in #136).
- **#124, #129, #133, #134:** release deploy job in the Playwright image; security-suite and release-test fixes; GOAT routing (rule 13 of `agent-orchestration.md`).

Open: the Café tab needs Ethan's OK to add `'cafe'` to the protected engine's `SCREENS` list; Ethan to set Ordering closes to Sunday 9:00 AM; S4 live sync (098) after the café slices; scenario D (two devices + helper). Unit tests can still time out at 5 s under a full local run (retry with `VITEST_MAX_WORKERS=3`).

## Preservation and external acceptance

Original urgent remains ata4126ff3 with all nine intake hashes, six stashes and prior worktrees preserved (rechecked before pickup commit). Never replay those input bytes or reset/copy a whole worktree onto deploy. Keep the Option A glass look without the marble ground (Ethan and Cine, 19 November) and existing money/offline behavior. Accepted releases require fresh no-open-today safe-use checks and existing schema/Access/post-deploy gates. Hosted SQL requires the exact reviewed kit and recovery prerequisites. Maintenance44239699173 skipped backup/keepalive/retention despite overall success; recovery/off-device custody remains unconfirmed. Repository variables were empty, so the approved public Access cutover still needs operator setup/app ID. No applied SQL/protected demo/real-data/memory edits. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.

Ethan18November requests pushing/releasing these fixes, then a comprehensive repository-backed Cloud handoff, including preserved WIP and local-only context. Codex recorded that he approved publishing supplied assets/private project context to the existing public repository; reconfirm with Ethan in chat before publishing anything private (the repository is public). Credentials and customer records stay excluded. Use Codex workers only. Prepare an auditable manifest and portable continuation after release; do not upload raw internal session traces or global memory.
