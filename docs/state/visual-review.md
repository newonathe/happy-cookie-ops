# Docker visual candidate review — 2026-09-09

## Result

The external candidate directory contains **75 PNGs**: 25 route layouts across mobile, tablet, and desktop. These were captured in Docker and accepted as regression snapshots after the review below. The archived prototype remains the design answer key.

- Candidate directory: `C:\Users\ethan\dev\happy-cookie-visual-candidates-20260909`
- Candidate manifest: [SHA-256 manifest](evidence/docker-visual-candidate-sha256-final-20260909.txt) — 75 files; aggregate SHA-256 over sorted manifest lines: `87a48fe37556b680039c2ef44deb30675f30d4875c1302122f8b443aad90aef9`.
- Image: `happy-cookie-g0-visual:20260908`, image digest `sha256:c64d55e48fd7a6b714e821c3ac2f7b95dabc4c3dcc115f465afd7b7a7a1a6923`.
- Runtime: Node `v24.20.0`, pnpm `9.12.3`, Playwright `1.63.0`.
- Mounted latest test inputs (read-only): `visual.spec.ts` `a920b051111d80eb36e8e5843f8b97a6f9fbeaa5d25a752b883735093137cdb6`; `fixture.ts` `7c803960f82ff52ab302b41a206c0c965c63475e37e145f4a42f6a907494b31b`. The fixture JSON, route cases, and Playwright config matched the image; their hashes were respectively `fc4a2901729bb6a049bcf695dff3cb7c99f76475525f21f0ddc9f66cd3a10e90`, `82c8767dea59b76a16e1037d0818a5cf5898b9f111c86c5edb5a234bef5c8d97`, and `ef30a1c304e346263ee550de639219ad22d47c63c313e25b8b98ba1b64178194`.

## Commands and observed results

All commands ran from `C:\Users\ethan\dev\happy-cookie-ops-g0`. Test files were mounted read-only and snapshots were mounted only at the external candidate directory.

```powershell
docker run --rm --mount "type=bind,src=<repo>\\tests\\e2e\\visual.spec.ts,dst=/app/tests/e2e/visual.spec.ts,readonly" --mount "type=bind,src=<repo>\\tests\\e2e\\fixture.ts,dst=/app/tests/e2e/fixture.ts,readonly" --mount "type=bind,src=<candidates>,dst=/app/tests/e2e/visual.spec.ts-snapshots" --entrypoint bash happy-cookie-g0-visual:20260908 -lc "pnpm exec playwright test tests/e2e/visual.spec.ts --project=visual --project=visual-tablet --project=visual-desktop --grep 'VISUAL-stocktake' --update-snapshots"
# exit 0 — 3 passed
docker run --rm ... --entrypoint bash happy-cookie-g0-visual:20260908 -lc "pnpm test:visual:update"
# exit 0 — 75 candidate updates passed; count verified as 75 files
docker run --name hc-visual-final-20260909 -d ... --mount "type=bind,src=<candidates>,dst=/app/tests/e2e/visual.spec.ts-snapshots,readonly" --entrypoint bash happy-cookie-g0-visual:20260908 -lc "pnpm test:visual"
# exit 1 — 73 passed, 2 failed
```

The final independent normal comparison failed during Playwright page setup for mobile Grocery list and Settings at the 30-second test timeout. The preserved trace/context files are outside the repository at `C:\Users\ethan\dev\happy-cookie-visual-debug-final-compare-20260909`. Both counterparts passed on tablet and desktop, and the failure happened before a screenshot comparison; this is unresolved runner/setup instability, not evidence of a rendered visual difference.

## Review boundary

Every visual navigation is engine-forced and explicitly reports `NOT deep-link acceptance`; it does not prove direct-route success.

## Completed comparison and acceptance

The coordinator reran the complete normal comparison with the same image, latest readonly test mounts and readonly candidates, using `pnpm test:visual --workers=1`. Exit 0: **75 passed (1.2m)**. No assertions, screenshot thresholds, fixture data or timeout limits were relaxed; only concurrency changed. See [serial comparison](evidence/docker-visual-serial-compare-20260909.txt). Earlier setup failures remain recorded; CI concurrency robustness is not established by this serial pass.

Accepted 2026-09-09 by the Codex coordinator within authorized MP-03 scope, supported by independent Terra/medium port-auditor review. All 75 PNGs were copied to `tests/e2e/visual.spec.ts-snapshots` only after their SHA-256 hashes matched the manifest; destination hashes match too. This is a regression checkpoint, not approval to change protected design or a claim of prototype pixel identity.

The coordinator inspected mobile Home/Stocktake/Shop, desktop Orders, tablet Settings, the archived mobile/state contact references and all five approved-guard diagnostics. The port auditor inspected the other 22 mobile layouts against archived reference material and found no blank, wrong-screen or unexplained missing main content. All 54 protected copy/style/AST fingerprints pass, and the current validator preserves original protected bytes except the five explicitly owner-approved guard lines. No screen, sheet or shell render body was restyled.

Known fixture differences: the review harness is visible; the bazaar is the event selector (`event: null`) while the reference shows an active event; production has a selected batch where the old reference capture was empty; order/status use HC-1042; fixed dates alter amounts, backup state and notifications. Clipping and the floating dock remain inherited findings with future owners in [state coverage](state-coverage.md). These snapshots do not prove the active-event sale journey, every conditional state, physical Safari/PWA behavior or prototype-identical pixels.

Claude Sonnet 5/medium independently reviewed the visual gate configuration and found one documentation overstatement about CI consuming the local image. It was corrected: CI reconstructs the pinned environment from the same Playwright base, rather than consuming the application image. No further gate defect was identified; Claude inspected no PNGs. See [review output](evidence/claude-visual-gate-result.json).
