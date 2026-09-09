# Planning package validation

Consolidated 8 September 2026. This report checks the delivered plan, preserves the distinction between evidence and proposals, and records the application's failing baseline. It does not certify production readiness.

## Delivered scope

- Central entry point: [MASTER-PLAN.md](../../MASTER-PLAN.md).
- Audit, architecture, domain contracts, ERP crosswalk, setup/operations, decisions and traceability: chapters 00–11.
- 36 planned work packages: 29 product packages and 7 later runner packages; one generated prompt per package.
- 55 prioritized findings mapped to implementation ownership and closure evidence; all page/sheet/setting/state rows remain subject to MP-26 acceptance.
- Reusable task/review/research/verification/resume/checkpoint/incident/UAT templates, project profile, disabled runner policy and JSON schemas.
- Original-file inventory, source diagnostics, test/build output, extracted PDF text and CLI browser evidence.

## Structural checks

The reproducible [validator](evidence/validate-plan.py) checks JSON Schema validity, unique task IDs, dependencies and acyclic ordering, owner-decision references, required task fields, one prompt per package, deterministic catalog regeneration, complete finding coverage, local document destinations, disabled runner/spending policy, matching agent notices, original source hashes and the preserved executable evidence counts. Results are in [plan-validation.json](evidence/plan-validation.json).

**Result: all 27 planning checks pass.** All 347 original files are present: 334 are byte-identical, and the remaining 13 are documentation files with navigation notices. The final installed test copy matches all 347 original baseline hashes. The dependency graph is acyclic, all 55 findings are mapped exactly once, all 36 prompts reproduce from the catalog generator, and every checked local destination resolves.

Use Python with `jsonschema==4.26.0`. The audit installed that validation dependency only in the isolated copy's `audit-python-libs` folder, identified by [scratch-location.txt](evidence/scratch-location.txt). From the project root, run `python docs/master-plan/evidence/validate-plan.py` with that interpreter/dependency available. The script regenerates planning catalog/prompts and synthetic examples deterministically; it never starts an app, runner, database or deployment. If the temporary directory has been removed, recreate an isolated dependency directory and update the local dependency lookup deliberately; do not treat a missing validator as a pass.

The original inventory is indexed by responsibility in [repository-coverage.csv](evidence/repository-coverage.csv). It describes review methods and evidence chapters; it does not claim each original file was individually executed. Original source, SQL, protected UI/engine, reference assets and application tests are hash-compared. Only 13 original documentation entry points receive navigation/supersession notices. This planning package adds no application feature or automatic runner.

## Actual application verification

Final installed-copy `pnpm verify`: **exit 2**, 108 TypeScript diagnostics. Lint and unit stages do not run after that failure in the chained command. The earlier independent lint check failed configuration loading; the independent unit suite had 70 passes and one privacy-scrubber failure. Production build also failed. Full final output: [pnpm-verify-final.txt](evidence/pnpm-verify-final.txt).

```text
Port integrity OK — 54 files match the baseline.
Engine contract OK — 49 exports, 21 settings keys, 19 tables documented, provenance claims verified against the prototype.
> tsc --noEmit
instrumentation-client.ts(41,5): error TS2322
VERIFY_EXIT=2
```

The excerpt abbreviates the first diagnostic; the linked log is the full output. Hash equality ties the installed-copy application source to the supplied application source. Next development startup had generated changes to the scratch `tsconfig.json` and appended its agent guidance; both were restored to original baseline hashes before this final verification. The [configuration diff](evidence/scratch-next-generated-diff.txt) records that discovery. Dependency versions were resolved in the isolated copy because the original delivery had no lockfile. Reproducibility repair remains MP-01.

Browser evidence consists of 104 hydrated direct visits and 104 deliberately engine-driven screen captures. The 96 incorrect direct-visit pathnames are a defect, not passing route tests. Service workers were blocked in these visual runs. Real SQL/RLS/concurrency, production E2E/accepted Docker pixel baselines, physical Apple hardware and hosted free-tier CPU/load/restore tests remain unverified release gates.

## Planning completion and next action

Planning is delivered with explicit unresolved business/environment decisions DP-00–DP-10. No task status is marked implemented. The next product implementation session starts at MP-00, recovers Git/migration provenance, pins dependencies and repairs the failing build before backend wiring. The runner stays disabled until its separately authorized later phase. New facts can amend the plan through the decision/change process; no document can guarantee that future implementation discovers no additional gaps.
