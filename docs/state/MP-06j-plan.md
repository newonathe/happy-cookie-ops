# MP-06j — private operational role authority

Status: complete locally; verified on two clean disposable resets. G1 remains incomplete.

The domain contract restricts global orders, customer details, costs, kitchen and inventory operations to active owners. Sixteen existing policies on eleven raw private tables instead use is_staff(). This slice changes only those predicates to public.is_owner() in new migration 20260101002100; existing migrations, grants, functions, public catalog and UI stay untouched. Helper assigned-event access requires a later scoped command/projection. Owner raw financial mutation restrictions remain separate work.

Root owns the migration, fixture runner integration, catalog comparison and evidence. Terra/medium owns one rollback SQL fixture; Claude Sonnet/medium independently reviews the result using Read/Grep/Glob only. No children, hosted changes, deployment, secrets, paid fallback or browser plugins. Existing user authorization covers this local continuation.

Acceptance: exact sixteen-policy catalog delta; two clean22migration CLI resets; 103new synthetic role cases per reset, including positive owner/service reads and denied helper/support updates/inserts; two deliberately restored unsafe-policy regressions per reset; all prior suites, function guard, generated type equality, pnpm verify and Python guard checks pass. Record failures before retrying. Fixture rows and temporary policy changes roll back; owned containers are removed. No claim of JWT/session, assigned-event capability, production readiness or fullG1 acceptance. Reversal is a reviewed follow-up migration only; do not edit an applied migration.

## Verified evidence

MP-06j private-table restrictions pass locally: 16 policies on 11 tables; 842 SQL checks, 56 regression probes, 4 live function guards, 10 sequence restorations and 2 profile upgrades. Unchanged types and all other catalog sections; 115 application tests and 23 Python guards pass. Claude review has no blocking findings. G1 remains incomplete; assigned-event projections, controlled commands, function defaults, sessions, routing and hosted acceptance remain open.

[SQL results](evidence/MP-06j-security.json), [exact catalog delta](evidence/MP-06j-catalog-diff.json), [types](evidence/MP-06j-types-check.txt), [pnpm verify](evidence/MP-06j-verify.txt), [review disposition](evidence/MP-06j-review-disposition.json), [exact tested inputs](evidence/MP-06j-tested-inputs.json). All fixture cleanup passed. Representative red hooks cover order reads and inventory updates; remaining policy assertions run but do not each have individual mutation probes. Owner/service reads are verified; exhaustive positive owner-write/JWT/assigned-event acceptance is deferred. Latest broad E2E remains 78 failed/30 skipped; this SQL-only slice did not rerun or fix it. No owner setup needed for the next local work.
