# MP-04c — local Pages package integrity repair

Status: local package and emulator prerequisite complete on 2026-09-21. No Pages project was created, uploaded or deployed; hosted route, CPU, Auth and free-quota acceptance remain open.

## Problem and repair

The isolated export originally copied only Git-indexed inputs. A valid new untracked source module therefore disappeared from the staging tree and broke the build. Worse, the prior successful `public` directory and manifest remained after the failed build, making a stale artifact look deployable.

`scripts/build-pages-spike.mjs` now unions Git-indexed files with untracked, nonignored files, then applies the existing narrow build allowlist and explicit `.env`, API-route and middleware exclusions. It rejects paths outside the repository, linked input paths and linked artifact targets. Before any build work it removes only the checked `build/pages-spike/public` and manifest targets. A deterministic test-only failure hook proves these deployable artifacts remain absent after a failure. Temporary staging stays under the designated sibling prefix and is guarded before cleanup. The builder supplies fresh temporary home, profile, app-data and temp directories, disables telemetry, and uses Webpack so its project root stays in staging. The explicit `node_modules` junction is a trusted dependency input, not an OS sandbox.

## Evidence and limits

- [Successful sterile export](evidence/MP-04c-build-accepted-final.txt): 140 inputs copied, including `src/lib/auth/return-path.ts`; all 26 application pages emitted; API routes and middleware excluded.
- [Forced failure](evidence/MP-04c-stale-artifact-guard-final.txt): exit 1 with `public=False` and `manifest=False`.
- [Local emulator](evidence/MP-04c-emulator-accepted-final.txt): health 200, HEAD 200, unsupported mutation 405, sync 503, shop 200 and unknown route 404.
- [Final verification](evidence/MP-08i-verify-after-review.txt) passes 336 tests after the review-driven repair.

This artifact is a synthetic demo feasibility package. It does not prove hosted hydration, authenticated BFF behavior, production caching, Cloudflare CPU, real Apple browsers, or free-tier capacity. A preview upload is an external hosted mutation and remains an owner approval gate after the exact package is reviewable. The locked UI/UX and protected engine are unchanged.
