# Testing the G0 foundation

Current authority: MASTER-PLAN.md and docs/state/current.md. A passing source gate does not mean the product is ready.

| Gate                   | Command                         | Meaning                                                                                                                                             |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit                 | `pnpm verify`                   | Original port fingerprints, AST integrity, engine contract, strict application and E2E types, lint, unit tests                                      |
| Production compilation | `pnpm build`                    | Actual pinned Next build; no ignored errors                                                                                                         |
| Gate mutation probes   | `pnpm test:port-gates`          | Disposable mutations of style values, handlers, copy, structure and relationships must fail; declaration mutability and invalid syntax also checked |
| Browser journeys       | `pnpm test:e2e`                 | Phone Chromium, desktop Chromium and emulated iPhone WebKit; run build first                                                                        |
| Focused G0 journeys    | `pnpm test:g0:journeys`         | Direct routes plus one nonzero durable-sale journey                                                                                                 |
| Runtime acknowledgment | `pnpm test:release:offline`     | Actual runtime must not mark an unsent sale synced without its acknowledgment                                                                       |
| Diagnostic guards      | `pnpm test:g0:evidence`         | Five approved sheet guards still render valid data                                                                                                  |
| Docker visuals         | `pnpm test:visual`              | Existing approved screenshots must match; missing screenshots fail                                                                                  |
| Whole release          | `pnpm verify:release`           | Source, build, actual acknowledgment regression, journeys and visuals; expected red until downstream product work                                   |
| Planning continuity    | `python scripts/validate-g0.py` | Historical catalog/schema/DAG/generator and protected delivery hashes, separately from application readiness                                        |

The browser server is the production standalone build on localhost:3140. Tests never reuse an unrelated server. Service workers are blocked except the explicit offline case. Windows verification uses headless command-line Playwright; no embedded Browser/Chrome plugin.

## Deterministic fixture and evidence limits

`node scripts/generate-g0-fixture.mjs` constructs the unchanged engine's BASE_STATE at 2026-03-04 09:30 Asia/Manila in a separate Node process. The resulting JSON fixes seed dates as well as the visible clock. Tests install it only after hydration, retaining the actual current screen. Direct-route tests never call engine.go; they select only necessary order/batch/stocktake prerequisites. Visual tests explicitly call engine.go to inspect existing layouts, and report that distinction.

The offline case uses a separate synthetic event with five units and a 100-peso price. It requires one positive engine sale, one actual IndexedDB row with clientId and saleId, unchanged identity/items/total after offline reload, and that exact clientId in an acknowledgment. Reading the queue cannot create an absent database. The acknowledgment endpoint is a synthetic test stub, not proof of SQL correctness. The actual-runtime empty-ack test remains red for MP-20.

Screenshots capture all 25 route layouts at phone, 834x1112 tablet and 1440x900 desktop profiles. Five guard diagnostics additionally use 390x844. Current coverage does not claim all conditional states in master-plan/01 have executable tests; consult the state traceability matrix before closing MP-03. WebKit emulation is not physical Safari/PWA evidence.

## Docker visual candidates

Package and browser image both use Playwright 1.63.0. Dockerfile.visual overlays Node 24.20.0 and pinned pnpm 9.12.3, installs the frozen lock and builds the actual app. Its separate ignore file excludes credentials and host caches while retaining tests. Build with:

```powershell
docker build --file Dockerfile.visual --tag happy-cookie-g0-visual:20260908 .
```

Generate candidates into a dedicated empty host directory mounted at `/app/tests/e2e/visual.spec.ts-snapshots`, using `pnpm test:visual:update`. Run `pnpm test:visual` against that same candidate directory for a second independent comparison. Save image digest, browser version, viewport, fixture hash, logs and comparison result. Review rendered candidates against the archived prototype evidence before copying accepted PNGs into the source snapshot directory. Record the approver and exact hashes. Never accept a Windows-generated baseline or rebaseline a regression away.

Normal test configuration uses `updateSnapshots: none`, including locally. The visual suite rejects execution outside Linux Docker. Missing environment, missing baseline and failed comparison are failures, never passes or automatic skips. CI uses the same Playwright base image tag and installs the same pinned Node/pnpm versions before building. It reconstructs that environment instead of consuming the locally built application image; hosted pixel parity remains unverified until CI runs.

## Other inherited checks

`pnpm format:check` is an additional formatting audit; do not run format-write across locked source or historical evidence just to make it green. Record remaining findings separately. SQL parity requires an isolated local database; skipped database checks are not positive evidence. Load testing and hosted security probes remain outside G0. Never point tests at production or use production credentials.
