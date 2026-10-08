# Reproducible G0 toolchain

Node 24.20.0 and pnpm 9.12.3 are pinned. Every direct dependency is exact, with a lockfile and strict peer checking. Versions follow the existing audit resolution except Next/React security patches and Storybook compatibility with Next 16.

Preview compatibility amendment (2026-09-09): Vercel's managed Node 24 runtime currently resolves to 24.19.0 and cannot pin a minor version. The supported engine range is therefore `>=24.19.0 <25`; the reproducible local/CI/Docker pin stays 24.20.0. Node's [24.19 LTS](https://nodejs.org/en/blog/release/v24.19.0) and [24.20 LTS](https://nodejs.org/en/blog/release/v24.20.0) release notes were checked; 24.20 is a feature/bugfix release, not a designated security release. The app does not require its new APIs. Hosted frozen install/build evidence must validate the lower boundary. No engine-strict bypass or dependency downgrade is used. This is a disclosed managed-preview difference, not an exact-runtime reproducibility claim for Vercel.

- Next/eslint-config-next 16.3.8 (moved from 16.3.3 on 6 October 2026, slice A3; patch releases 16.3.4 to 16.3.8 only, none touching the static export or the service worker) and React/react-dom 19.2.8 address the selected line's security patches. [Next security release](https://nextjs.org/blog/august-2026-security-release).
- Storybook/Next adapter 10.2.10 replace incompatible 9.x. Trial 10.0.0 was rejected after advisory review. [Migration guide](https://storybook.js.org/docs/releases/migration-guide).
- Native Next flat ESLint exports replace the broken legacy wrapper. Exact protected apostrophes and existing images have behavior-preserving exceptions. [Next ESLint](https://nextjs.org/docs/app/api-reference/config/eslint).
- Playwright 1.63.0 matches `mcr.microsoft.com/playwright:v1.63.0-noble`. Dockerfile.visual overlays pinned Node. [Playwright Docker](https://playwright.dev/docs/docker).

Portable tools are under `C:\Users\ethan\dev\happy-cookie-tools`; global installations were not upgraded. In PowerShell:

```powershell
$env:PATH='C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64;'+$env:PATH
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

The shim invokes actual pnpm 9.12.3, avoiding a newer global dispatcher warning about the `pnpm` settings field. Official Node SHA256 and pnpm SHA512 were checked. Clean install in initially empty `happy-cookie-install-check-pinned-20260908` exited 0. Husky's no-Git notice is expected in that scratch; working-repository `pnpm prepare` separately succeeded.

Reviewed lifecycle packages: Sentry CLI optional binary/checksummed download, esbuild platform binary, unrs-resolver native optional fallback, core-js-pure notice, and Husky hooks. Package allowlist is explicit. Pre-commit now runs complete `pnpm verify` instead of automatically formatting protected files. No hook bypass.

Final advisory report: 5 high, 3 moderate, 3 low, 0 critical; two Storybook-related high findings removed. Full paths and fixed/no-fix metadata are in [audit JSON](evidence/dependency-audit-final.json). Remaining transitive toolchain findings are unresolved, not proof of reachable application exploits; no force-fix.

Dependency security slice (8 October 2026): vitest 3.2.7 to 4.1.11 and `pnpm.overrides` fixed all 3 critical and 18 of 21 high advisories (tinypool, proxy-addr, sharp, undici, brace-expansion, tmp, image-size, source-map-js, basic-ftp, compression, webpack-dev-middleware). `tsconfig.json` `types` gained `"node"`, because vitest 4 no longer pulls node typings in transitively. `pnpm audit --audit-level high` still reports 3, all dev tooling, none with a patched release (the audit lists `<0.0.0`), so none is suppressed with `ignoreGhsas`:

- `extract-zip` (GHSA-7pqw-9j4j-h8q3, GHSA-jmr9-qjv8-65gv), via `@lhci/cli` > lighthouse > puppeteer-core. It only unpacks the browser build Puppeteer downloads; no untrusted archive reaches it.
- `braces` (GHSA-vfj7-8cjw-p6xm), via micromatch in Storybook and `eslint-config-next`. Denial of service on deeply nested glob patterns, run on our own source files only.

None ships to production or touches auth, money or the offline queue. Revisit when upstream ships a fix, or when `@lhci/cli`, Storybook or `eslint-config-next` release a version without them. If a gate ever requires a clean audit, add the three IDs to `pnpm.auditConfig.ignoreGhsas` with this entry as the reason. License evidence is indexed under `docs/state/evidence/`.

Current planning validation needs jsonschema 4.26.0. Historical audit dependencies contain a Python 3.12 native wheel incompatible with current Python 3.14. Wheel-only current dependencies are isolated in `happy-cookie-tools\python-libs-314`; set `G0_PYTHON_LIBS` there before `python scripts/validate-g0.py`. Historical validator/results were not changed.

Limits: Docker verification separate; Next middleware deprecation deferred to MP-07. Database types remain labeled placeholders, not live-generated schema. No hosted DSN or backend secret introduced. Tracing disabled pending safe telemetry in MP-24.
