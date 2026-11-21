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

## Connected local production and Bazaar

`node tools/owner-preview/check-production-connected.cjs <artifact-directory>` exercises recipe creation/editing, dough-only baking, shortage refusals, exact retries/reload, price-only planning, kitchen transfers, retained till/review drafts, sale/return and Money. The ownership module adds real two-tab Web Locks, exact draft retention, stale period/client/role A→B→A actions and a strict write-attempt counter, including rejected legacy calls. Set `BAKE_WIDTH=390` or `1440`; use a fresh disposable database for each width.

The local fixture runner supplies `HCO_LOCAL_RPC_ORIGIN`, `HCO_LOCAL_OWNER_JWT`, `HCO_LOCAL_ANON_JWT` and `HCO_FIXTURE_NONCE`, plus the owner preview on loopback port4186. The driver requires its current synthetic fixture token and loopback API port45000–48999, and blocks other browser origins. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed Chromium when needed. Failure artifacts contain RPC bodies and UI text: run only with synthetic fixture data. Fixture setup must verify ownership of the disposable PostgreSQL/PostgREST processes before supplying these variables.

Independent SQL regressions are `tests/integration/security/make-bazaar-transfer.sql` and `bazaar-return-volume.sql`; their runners verify two clean resets, schema/function authority, stock/cost effects and replay behavior. The browser driver consumes an already prepared fixture; bootstrap and physical-device acceptance remain separate gates.

## Scenario A (order to books)

`pnpm test:scenario-a [container]` runs `tests/integration/scenarios/scenario-a.sql` (order, payment, dough and baking, stock, packing, pickup, books; real roles; replays; rolled back) against a disposable local Postgres 17 container and prints PASS or FAIL. Setup, once per container:

1. `docker run -d --name hc-scenario-a -p 127.0.0.1:55433:5432 -e POSTGRES_PASSWORD=<any> public.ecr.aws/supabase/postgres:17.6.1.166`
2. The bare image has no storage tables. As `supabase_admin` create `storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[])` and `storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text)` with row level security on, and make `postgres` their owner.
3. With the pinned CLI, from a scratch copy of `supabase/` (project id changed, `major_version = 17`, `[db.seed] enabled = false`): `supabase db reset --workdir <scratch> --yes --no-seed --db-url "postgresql://postgres@127.0.0.1:55433/postgres?sslmode=disable"` with `PGPASSWORD` set.
4. Remove it afterwards: `docker rm -f -v hc-scenario-a`.

One transaction has one clock, so the stale-stamp cases use an old stamp rather than a competing write.

The scenarios run through one runner: `node scripts/test-scenario.mjs <a|b|c> [container]` (`pnpm test:scenario-a`, `pnpm test:scenario-b`, `pnpm test:scenario-c`). The container can instead be a throwaway `supabase start` stack (scratch copy of `supabase/` with its own `project_id`, `major_version = 17`, `[db.seed] enabled = false`; the database container is `supabase_db_<project_id>`), which needs none of the bare-image steps above.

## Scenario B (planned bake to cost reconciliation)

`pnpm test:scenario-b [container]` runs `tests/integration/scenarios/scenario-b.sql` the same way: planned bake and shopping list worked out from the server's recipes, stock and supplier prices (the plan itself is a device note and writes nothing), supplier prices, stock receipts, dough with a variable yield, partial baking with rejects, remaining dough, a recipe edit between doughs, a half recipe, an independent product, a shortage, a missing price, discard, the Production page and the books. Every dough takes its recipe once; baking takes no ingredient; replays change nothing. Not covered: the "when used" cost basis (needs the one-off cost cutover), concurrency, the client plan screen.

## Scenario C (bazaar to books)

`pnpm test:scenario-c [container]` runs `tests/integration/scenarios/scenario-c.sql` the same way (91 checks): a bazaar booking and day plan with a fee, kitchen cookies moved to the table (before and during the day, replays, over-transfer refused), the day started on one phone, stock added at the table, sales with a discount, a freebie, a price change on the started day, a queued sale rung before the change and sent after it (accepted at the old price), the same sale sent again after a reload (no second effect), a void that arrives before its sale, a void of an earlier sale, a till expense, a loss, a close refused while a queued sale is unsent, the close (short drawer), the event summary to the centavo, the books holding the open event, finalise (books and stock once, replay changes nothing, stale hashes refused), a finalised event refusing a void, a late queued sale after a close, a whole test fair reversed (books and stock exactly as before), and the helper and anon refused. Not covered: the phone's IndexedDB queue and reload (the offline e2e covers a real offline sale), concurrency, the client screens, the "when used" cost basis, hosted data.

## Browser scenarios A and C (live owner interface, local stack)

`pnpm test:e2e:scenarios` drives scenario A (customer order, payment, dough and baking, packing, pickup, Money) and scenario C (bazaar event and day, table stock, sales, one sale rung offline and replayed after a reload, void, close, finalise, Money) through a real browser against a LIVE-mode build and a throwaway local Supabase stack. The specs are in `tests/e2e-scenarios/`, outside `pnpm test:e2e` and CI (CI has no Supabase stack). Server rows are read with `docker exec` psql in the test helper (`stack.ts`), never in app code; the helper refuses a non-loopback API.

Setup, once: a scratch copy of `supabase/` with its own `project_id` (`hcscn`), `major_version = 17`, shifted ports (API 55421, db 55422), then `pnpm exec supabase start --workdir <scratch> -x studio,imgproxy,vector,logflare,edge-runtime,mailpit,realtime,storage-api` (the seed stays on). Build with `NEXT_PUBLIC_APP_MODE=live NEXT_PUBLIC_HARNESS=0 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase start> NODE_OPTIONS=--max-old-space-size=4096 pnpm build` (a smaller heap crashed the build worker on Windows), then `pnpm start --port 3150 --hostname localhost`. Run the specs; each one resets its own rows (orders, production, events, sales, ledger) first. Override with `HC_SCN_APP_URL`, `HC_SCN_API_URL`, `HC_SCN_DB_CONTAINER`, `HC_SCN_SERVICE_KEY`. Afterwards stop the stack (`pnpm exec supabase stop --workdir <scratch>`) and delete `.next`.

Scenarios E and F (S4, `live-sync-delivery.spec.ts` and `live-sync.spec.ts`) need Realtime in the stack: keep `realtime` out of the `-x` list. E uses no browser: it joins the open day's channel as the owner, an active helper, an expired helper and anon, and checks who hears a sale, a void, a stock add and a loss, and that a helper stops hearing when the day closes (set `HC_SCN_ANON_KEY` to the publishable key from the local stack's status, as for the app build). F is the browser one: two profiles on the same day, a sale and a void appear on the other within seconds with no reload, a device that lost signal catches up, nothing is sent twice.

Scenario H (S3, `helpers.spec.ts`) also needs the Edge Function: include `edge-runtime` in the stack (leave it out of the `-x` list) and run `pnpm exec supabase functions serve --workdir <scratch> --no-verify-jwt` beside it, with a `supabase/functions` copy in the scratch folder. It adds a helper from the People page, signs them in, sets their own password, sells, voids, closes the day, and ends their access. `HC_SCN_SHOTS=<folder>` saves screenshots.

Not covered: a physical iPhone (WebKit offline emulation is a known Playwright defect, see `bazaar-offline.spec.ts`), hosted data, concurrency, the kitchen transfer to the table, stock receipts, and scenario A's customer-side status page.
