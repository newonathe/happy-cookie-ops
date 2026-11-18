# Current state — Happy Cookie Ops

**The full application remains incomplete.** Source, deployment, public availability, physical-device and unaided-owner acceptance are separate. Read next-goal.md next; prior details are in current-history.md.

## Released — 18 November 2026

Latest deployed: release PR #93, merge `ec7ed6c0`, run 44327865102 all 8 jobs passed (deploy included), Worker version `6f158842-cd2d-4a2b-9db5-c04d28a9c53b`. Deploy-time read-only schema check: 91 migrations, 186 exact public functions. It adds, on top of `05a5e73e`: pickup place (088, default JSEC Ateneo, hours unchanged), remove/restore flavours with history kept (089) and one photo per add-on choice (090). Migrations 088–090 were applied by Ethan from `C:\Users\ethan\HappyCookie-Cutover-90` after a verified encrypted backup (`real-database-2026-11-18.hco`); the trial runs Postgres 17.6, and the 088–090 proofs also passed on a local 17.6 copy. PRs #90–#92 are closed as released. Detail and evidence: [history](current-history.md).

Open from this release: the checkout photo sits above its choice's label, so it can read as the previous choice's (Cine's call); `scripts/test-db-security.py` must run after any migration change (the #90 suites had gone stale). Public Access `2dd13539` / draft PR #89 still waits on the operator app ID; its narrow cutover is approved. Codex's untouched sticker WIP stays at `codex/sticker-photos-wip-20261118`.

## Preservation and external acceptance

Original urgent remains ata4126ff3 with all nine intake hashes, six stashes and prior worktrees preserved (rechecked before pickup commit). Never replay those input bytes or reset/copy a whole worktree onto deploy. Keep light palette/layout and existing money/offline behavior. Accepted releases require fresh no-open-today safe-use checks and existing schema/Access/post-deploy gates. Hosted SQL requires the exact reviewed kit and recovery prerequisites. Maintenance44239699173 skipped backup/keepalive/retention despite overall success; recovery/off-device custody remains unconfirmed. Repository variables were empty, so the approved public Access cutover still needs operator setup/app ID. No applied SQL/protected demo/real-data/memory edits. Physical iPhone, unaided Cine, connected full-cycle/recovery, backup custody/restore and full-product acceptance remain open.

Ethan18November requests pushing/releasing these fixes, then a comprehensive repository-backed Cloud handoff, including preserved WIP and local-only context. Codex recorded that he approved publishing supplied assets/private project context to the existing public repository; reconfirm with Ethan in chat before publishing anything private (the repository is public). Credentials and customer records stay excluded. Use Codex workers only. Prepare an auditable manifest and portable continuation after release; do not upload raw internal session traces or global memory.
