# G0 current state — 2026-09-09

Authoritative root: `C:\Users\ethan\dev\happy-cookie-ops-g0`. The original OneDrive delivery is preserved with a working-copy pointer. No previous Git ancestry was recovered; migration application history remains UNKNOWN for MP-05.

Manual progress authority: [task-status.json](task-status.json). The generated master-plan catalog and audit remain historical planned scope; regeneration must not overwrite implementation progress. Read the [shared Codex/Claude policy](agent-orchestration.md) before delegation.

## Outcome

MP-00 through MP-03 foundation acceptance is complete. Product release acceptance remains red. The owner additionally authorized private GitHub publication and a Vercel demo preview; no production backend, customer operation, paid upgrade or automatic runner was introduced.

- [Private GitHub source](https://github.com/newonathe/happy-cookie-ops): bootstrap `main` commit `32e37da`, followed by the recorded packaging and baseline checkpoints. Local branch `agent/codex/MP-00-g0-foundation`; final checkpoint publication is recorded in the handoff.
- [Protected live preview](https://happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app): READY; sign in with the owner's Vercel account. This is a manually deployed demo, not a Git-connected automatic deployment.
- [Cloud evidence and configuration](cloud-preview.md): authenticated app 200, health 200/database not-configured, sync 500/no acknowledgment, unauthenticated 302 to Vercel sign-in. No hosted browser-hydration or production-readiness claim.

## Foundation evidence

| Package | Verified outcome |
| --- | --- |
| MP-00 | 675 delivered files preserved; original 347-file audit manifest unchanged. Private source checkpoint established. Current validator: 1,181 checks, zero failures, including schema/DAG/generator reproduction, protected hashes, policy/document links, 70 coverage rows and 75 baseline hashes. |
| MP-01 | Node 24.20.0 locally/CI/Docker; pnpm 9.12.3 and frozen lock. Verified clean pinned install and reviewed lifecycle setup. Hosted Node 24.19.0 is within the documented supported range and cloud build passes with pinned pnpm through Corepack. |
| MP-02 | Initial 108 TypeScript diagnostics repaired; flat lint and reporting privacy tests pass. `pnpm verify`: 13 test files, 103 tests, exit 0. Local standalone, Docker and Vercel production builds pass. Five exact owner-approved null guards; other protected render bodies unchanged. |
| MP-03 | Copy/style/handler/structure/relationship/declaration mutation probes detect changes. Route/offline false positives are rejected. Deterministic fixtures, five valid-sheet captures and 70-row state ledger. All 75 Docker regression snapshots accepted after source/visual review and independent readonly comparison, exit 0. |

See [toolchain](toolchain.md), [protected exception](protected-exception.md), [visual acceptance](visual-review.md), [state coverage](state-coverage.md), and [evidence index](evidence-index.json). The original prototype remains the design answer key. Regression images have visible review controls, frozen fixture/prerequisite differences and inherited clipping; they do not certify prototype pixel identity or all conditional states.

## Retained failures and unknowns

Latest full `pnpm test:e2e`: **78 failed, 30 skipped**, exit 1. Each phone Chromium, desktop Chromium and emulated iPhone WebKit run records 24 non-Home route redirects, one Home hydration error (React 418), and one nonzero sale without a durable IndexedDB queue row. Earlier focused phone Home passed; the fresh-build full run proves that hydration is still an intermittent release defect. MP-07 owns bootstrap/routing; MP-18–21 own offline persistence/reconciliation. The actual-runtime empty-ack test also remains red for MP-20.

Thirty SQL capacity cases skipped because no isolated database URL/key was configured. This is unavailable integration evidence, not a pass; MP-05/06 must supply it. No real database, physical iPhone/macOS Safari, PWA or hosted performance acceptance is claimed.

The first two-worker visual comparison passed 73 and timed out during page setup for two mobile tests; a full single-worker comparison passed all 75 without changing assertions or timeouts. Hosted CI pixel parity/concurrency remains unverified. GitHub bootstrap CI failed its inherited whole-repository formatting check; dependent jobs were skipped. Do not mass-format locked source or historical evidence to hide it. Dependency audit retains 11 transitive tooling advisories (5 high, 3 moderate, 3 low; zero critical), documented in the toolchain evidence.

## Next boundary

Stop at G0. The next product work follows G1/MP-04 onward and its decision gates; routing and offline fixes require their assigned packages. See [continuation](continuation.md). Keep preview fixtures isolated and use a fresh reviewed origin for eventual production. No further owner setup is needed for the current demo; future database/hosting decisions are not silently settled by this preview.
