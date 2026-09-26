# Local Pages feasibility adapter

This disposable adapter packages a static export into `build/pages-spike/public` for local Cloudflare Pages emulator checks. It copies tracked application inputs and a closed allowlist of root build configuration into a unique sibling staging directory (removed after the attempt), excludes `src/app/api/**`, `src/middleware.ts`, and environment files, and writes an export-only Next configuration only in that copy. It never changes the authoritative Next configuration or protected ported source. `build/pages-spike/manifest.json` always selects the `public` artifact path and records its build boundary.

`functions/api/[[path]].ts` handles `GET` and `HEAD /api/v1/health` as liveness only; database and auth are not checked and readiness is false. Four exact session endpoints now compose the local BFF handler when their server bindings are present: `GET /api/v1/session` and `POST /api/v1/session/login`, `/refresh`, `/logout`. Missing bindings fail closed with a non-cacheable `503`. All other API paths, including sync, return a safe `503`; health mutations return `405` with `Allow: GET, HEAD`.

The session composition reads `APP_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_KEY_KIND`, and `SESSION_CRYPTO_CONFIG_JSON` only from Pages Function bindings. The private service key and AES key must be configured as Pages secrets for any hosted preview; neither belongs in the static build, repository, or browser. The fixed `HCO_LOCAL_TRUSTED_CALLER_ID` is allowed only with a loopback app origin for isolated local tests. This fixture still lacks integrated local Auth/REST and hosted acceptance; see [MP-08m](../../docs/state/MP-08m-plan.md).

Run the root-owned package commands after dependencies are installed:

```powershell
pnpm build:pages:spike
pnpm test:pages:spike
```

The static `_headers` file protects demo responses and sets `Cache-Control: no-store`. Function responses independently set their own no-store and security headers because static Pages headers do not secure a Function response. `_routes.json` selects only `/api/*` for the fixture.

This is local feasibility evidence only. A successful build or emulator test does not prove hydrated application routes, real authentication, database/RLS behavior, offline synchronization, or production readiness.

Wrangler 4.130.0 uses compatibility date 2026-09-08 (its bundled workerd date). Invoke it from this directory without `--config`; Pages rejects that flag. Child environments use a minimal OS-variable allowlist, metrics are disabled, and local environment files in this fixture directory are rejected. Generated build and Wrangler state are excluded from root typechecking/linting. The scoped `miniflare>sharp` override pins 0.35.4 to address GHSA-rgj7-g3m4-5g8c; reassess it when upgrading Wrangler.
