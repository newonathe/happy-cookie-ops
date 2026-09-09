# Private development publication — 2026-09-09

The owner authorized private GitHub source publication and a Vercel development preview. This project contains fabricated fixtures and has no production backend or customer messaging configuration. It is not ready for business operation.

- GitHub: https://github.com/newonathe/happy-cookie-ops — verified private, `main` bootstrapped from commit `32e37dab8998260284abfcd18ff5df6c15a9d2dc`. No older ancestry was recovered; this initial delivery checkpoint includes the separately documented G0 repair slices. It does not invent historical commits.
- Vercel: https://happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app — deployment `dpl_3Ag2zUk5pt7ZLA7Ryrh6EWrrBZZh`, Preview (API target null), READY, no assigned aliases. Project `happy-cookie-ops-demo` is separate and disposable.
- Authentication: Standard Vercel Authentication. Unauthenticated `/` returns 302 to Vercel sign-in. Authenticated CLI `/` returns 200 with application branding; `/api/health` returns 200 with `database: not-configured`; `/api/sync` returns 500 without acknowledgment. The 500 is an existing missing-backend behavior, not a healthy sync implementation.
- Environment: the sole configured project variable is the noncredential Preview build setting `ENABLE_EXPERIMENTAL_COREPACK=1`. No Supabase, Sentry DSN, messaging or production keys. Local Vercel OIDC/link files are ignored and excluded from upload.

The live source is bootstrap commit plus the one packaging-only `next.config.ts` adjustment: standalone output is omitted when `VERCEL=1`, retained locally and in Docker. Cloud metadata names the starting checkpoint, not an assertion that an uncommitted adjustment was already in that commit. Final source publication records the adjustment in Git.

## Build diagnosis and verification

The first deployment failed because Vercel supplies Node 24.19.0 while the original minimum was 24.20.0. The accepted Node range is now `>=24.19.0 <25`; local/CI/Docker remain pinned to 24.20.0. The second compiled and typechecked, then failed in Vercel packaging because unconditional standalone output conflicts with Next 16.3's adapter. The successful third deployment uses native Vercel packaging and the pinned pnpm 9.12.3 through Corepack. No dummy tracing file, ignored error, dependency downgrade or disabled check was used. Local standalone build also passes after the conditional change.

[Next upstream reproduction](https://github.com/vercel/next.js/issues/96646), [Next output documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and [Vercel package manager documentation](https://vercel.com/docs/package-managers) support the changes. Vercel staff [explains first-deployment classification](https://community.vercel.com/t/vercel-cli-ignores-target-preview-and-creates-production-deployment/46384); keeping the failed first deployment allowed the next request to become Preview. A `--skip-domain` attempt was rejected locally because that flag requires Production; it created no deployment.

Evidence: [READY metadata](evidence/vercel-preview-final-inspect.json), [successful build](evidence/vercel-preview-build-final.txt), [authenticated probes](evidence/vercel-demo-probes.json), [unauthenticated protection](evidence/vercel-preview-unauthenticated.txt), [source push](evidence/github-bootstrap-push.txt). No hosted hydration, database integration, real transaction or physical Apple-device acceptance is claimed.

## Continuation boundary

Use the preview URL while signed in to the owner's Vercel account. Source pushes are visible on GitHub; this Vercel project is not yet Git-linked and deployments in this conversation are manual. No automatic agent runner, scheduler, paid upgrade or public bypass link was created. Never attach real backend credentials to this demo origin: its service worker and browser-local fixture state make a fresh reviewed production project/origin necessary later.

GitHub's bootstrap CI failed its inherited whole-repository formatting audit, after source/type/lint gates; dependent hosted jobs were skipped. Local verification, local/Docker builds and Vercel build have separate direct evidence. Do not represent GitHub CI as green or reformat protected/reference source merely to silence that audit.
