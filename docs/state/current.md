# Current state — Happy Cookie Ops

## Current checkpoint — 2026-09-27 (MP-09 b1: settings on the database, database half, G2 slice 3)

- **MP-09 b1 is complete locally.** Direct writes to `public.settings` are gone: `insert`/
  `update`/`delete` are revoked from `anon`/`authenticated` (the owner keeps raw `SELECT`
  via the pre-existing RLS policy — only writes moved). Every write now goes through
  [save_setting(key, value, expected_updated_at)](../../supabase/migrations/20260101002800_settings_authority.sql),
  a new owner-only `SECURITY DEFINER` RPC that validates against an embedded 24-key rules
  table (column kind, numeric bounds or an enum) built from the engine's own `bumpCfg`/
  `numCfg` bounds and `DEFAULT_CFG` — unknown keys, wrong JSON types, non-integer values
  for `int`/`cents` columns, out-of-range values and a stale `expected_updated_at` are all
  rejected (SQLSTATE `22023` for validation, `P0002` for staleness, `42501` for the
  owner-only gate). `get_settings()` (owner, every key plus `updated_at`) and
  `get_operating_settings()` (any active staff, a 12-key published-safe projection with
  no cost key) round out the read side. `settings_effective()`'s defaults CTE gains
  `idleMinutesOwner`/`Support`/`Helper` (60/60/240, range 15–480, DP-15); its signature and
  config are otherwise restated unchanged.
- **Bounds parity:** [tests/fixtures/settings-cases.json](../../tests/fixtures/settings-cases.json)
  records every key's bounds once; [tests/unit/settings-parity.test.ts](../../tests/unit/settings-parity.test.ts)
  checks it two ways — against the protected engine's own source text, and against the
  migration's VALUES text — 45 tests, mutation-tested (a deliberately wrong bound in the
  fixture was confirmed to fail 2 of them before being reverted).
- **`tests/integration/security/settings.sql` was extended, not rewritten:** the existing
  anon/no_subject/missing_profile/inactive-* denial paths and the service_role
  direct-write path are unchanged; new coverage adds `get_settings`/`save_setting`/
  `get_operating_settings` denial and success paths per actor, plus owner sub-cases for a
  valid save, an update-path save, unknown-key/out-of-range/non-integer/stale (both the
  insert-races-an-existing-row case and a wrong-timestamp update case) rejections, an
  `updated_by` stamping check, a `priceMode` round-trip through a value containing the
  literal "×" (U+00D7) character, and a value check (not just a key-set check) that a
  helper sees the owner's saved capacity through `get_operating_settings`. Result count
  40 → 74; the suite's combined total in `scripts/test-db-security.py` moved 474 → 508.
- **Independent review (Opus, different model from this Sonnet implementation): SAFE TO
  MERGE, no P0/P1.** One medium (P2), fixed: the optimistic-concurrency check compared
  `expected_updated_at` to the microsecond, which a JS `Date` (b2's future client) cannot
  round-trip — every save after the first would have failed forever. Fixed by truncating
  both sides of the comparison to milliseconds. Three low findings fixed: `get_settings`'
  row-count check tightened from `< 21` to `= 24`; the `UPDATE` branch now nulls the two
  non-matching value columns explicitly, rather than leaving a stale one from an
  inconsistent row (theoretical with real data, cheap to close); `docs/DATA.md`'s stale
  "21 editable values" table row corrected to 24. One nit taken: `jsonb_typeof(p_value)`
  moved from the `DECLARE` section to immediately after the owner check — the review's own
  analysis found no actual leak either way (a malformed `jsonb` parameter never reaches the
  function body, for every caller alike), but keeping every read of caller input strictly
  after the auth gate is worth stating as a rule, not just true by construction here. One
  nit not taken: an unqualified `settings` reference inside `settings_effective()`'s
  untouched body predates this migration and is confirmed safe (that function's
  `search_path` is `pg_catalog, public, pg_temp`, not empty); left as-is to keep the body
  byte-identical to the original except for the added defaults, matching the "keep the
  body's shape" instruction from MP-09 a's own review.
- **Evidence:** `pnpm verify` 37 files/573 tests exit 0; the SQL role suite 508 cases/reset
  across 2 fresh resets; all Python guards pass (37 unit + 3 auth + 17 db + 6 security
  integration); G0 validator 1196 checks, 0 failures. `pnpm db:types` regenerated (byte-
  identical output — only the function body changed, not its signature). No hosted preview
  update; no protected file edited; no deploy.
- **Ripple fix, disclosed:** `tests/integration/security/trigger-authority.sql`'s
  `settings_touch` trigger-firing proof used to rely on the owner writing directly via
  RLS; since that path is now revoked, it runs as `service_role` instead (the same
  `auth.uid()`, since `request.jwt.claim.sub` is transaction-local and survives the role
  switch) and is relabeled `service_role` rather than `active_owner` in its result row —
  not removed, just honestly re-attributed to the role that actually performs it now.
- **Caught and reverted before commit, same pattern as MP-09 a:** `validate-g0.py` and
  `pnpm db:types`/`scripts/test-db-security.py` all silently overwrite hash-pinned or
  unrelated historical `evidence/*.json` files as a side effect of running, regardless of
  which slice is current. This session's run touched
  `MP-05b-schema-inventory.json`/`MP-05b-types-write.json`/`MP-06l-bootstrap.json`/
  `MP-06l-security.json` (reverted with `git checkout HEAD --`) and created a stray
  `MP-05b-types-bootstrap.json` (removed). **Worth fixing at the source in a future
  slice** — this is now a repeated failure mode, not a one-off.
- **Disclosed, not fixed:** `taxRate`/`cogsMultiple`'s engine-side 0.5 step can't be saved
  (`int_value` is `bigint`) — blocks b2's ±0.5 buttons for those two keys specifically,
  an open decision for that slice, not this one. `discountA`/`discountB` stay whole pesos
  in `int_value`, not centavos (inherited from migration 00700 unchanged).
  `openDow`/`closeDow`/`openM`/`closeM`/`extendH` bounds are this migration's own choice,
  since the engine never validates them (documented in the migration's comment and the
  fixture).

## Prior checkpoint — 2026-09-27 (MP-09 a: live data boundary, G2 slice 2)

- **MP-09 a is complete locally.** Live mode (`NEXT_PUBLIC_APP_MODE=live`) never shows or stores
  the demo books. [src/lib/data/live-state.ts](../../src/lib/data/live-state.ts) classifies every
  non-ephemeral `BASE_STATE()` key as **emptied** (34 keys: the demo orders, ledger, inventory,
  batches, sales, queue, waitlist and the rest of the audit's list) or **kept** (`cfg` for MP-09 b;
  `prices`/`recipes`/`soldOut`/`dropActive`/`shopOverride` for MP-09 c/d; `dropNo`/`orderSeq`/
  `invoiceSeq` for MP-10; `backup`/`backupAt` for G4 DP-10; `channels`/`categories`/`inactiveCats`
  for MP-09 b2; the rest UI state) — with a unit test that fails on any unclassified key.
- `OpsRuntime` ([src/store/ops-runtime.tsx](../../src/store/ops-runtime.tsx)), never the protected
  engine: its constructor starts live-mode state from `BASE_STATE()` with the emptied keys wiped,
  instead of the protected `loadState()`; `persist`/`resetData` are instance fields on the engine,
  not prototype methods (`super.persist` does not exist), so they are replaced wholesale after
  construction rather than called; `componentDidMount` skips the protected storage-restoring path
  entirely in live mode. `clearStoredBooks()` removes `hc-ops-state-v1` from both `localStorage`
  and `sessionStorage` (never `.clear()`, which would also drop `hc-device-id`) on live mount, the
  live Settings reset, and now `signOutAndRedirect` too
  ([src/lib/auth/live-gate.ts](../../src/lib/auth/live-gate.ts), before the `signOut` call so it
  runs even if `signOut` hangs). `renderVals()` drops the protected engine's fabricated
  `PRIOR_MONTHS` P&L trend to just the current month and recomputes its bar from
  `this.pnlTotals(state).profit`, with the same clamp the engine's own formula uses.
- `src/store/engine/ops-engine.d.ts` gained `EPHEMERAL`/`persist`/`resetData`/`pnlTotals`
  declarations, so the override is fully typed (no `any`). The `.d.ts` is not itself protected —
  only `ops-engine.js` is (`scripts/check-port-integrity.mjs` and the pre-tool-use hook both name
  only the `.js` file).
- Evidence: 80 new unit tests (528 total, after the review below) — every staff screen renders on
  all three devices from the live state with no throw, no `console.error`, no NaN/`undefined`/
  `Infinity` text, and a `[data-screen-label]` where one is reachable without a prior selection
  (order/batch/stocktake need one first, in demo mode too — not a live-state regression); none of
  three seeded demo names appear, with a demo-mode positive control proving each one _does_ render
  somewhere first; live mount never reads a stale save and strips it from both storages while
  keeping `hc-device-id`; live mode never autosaves, even past the debounce window and a `pagehide`
  flush; demo mode still restores an existing save (a real field, not just the write) and keeps
  writing `hc-ops-state-v1`; the live reset preserves device/role, clears storage and is the exact
  function `v.confirmReset` calls; the trend recompute is checked against a real nonzero profit
  (100%), not just the zero-profit case where the clamp floor would hide a missing recompute; a
  mocked offline sale queue is untouched by sign-out, plus a stubbed `indexedDB.open`/
  `deleteDatabase` global proving neither is even reached (jsdom has no IndexedDB, so this remains
  stub-level evidence, not a real-IndexedDB proof — a headless Playwright check is next, once
  MP-07 finish lands). `pnpm verify` 36 files/528 tests exit 0; `pnpm build:pages:spike`/
  `test:pages:spike`/`test:workers:spike` pass with `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY`
  unset (`connect-src 'self'` only, confirmed from the emitted `_headers`); G0 validator 1196
  checks, 0 failures. No protected file edited; no deploy.
- **Independent review (Opus, different model from this Sonnet implementation): SAFE TO MERGE, no
  P0/P1.** Four P2s, three fixed here:
  1. `clearStoredBooks()` read `window.localStorage`/`window.sessionStorage` _outside_ its own
     try — in a browser that blocks site data, or a sandboxed iframe, that getter itself can throw
     a `SecurityError`, crashing the live mount (public shop included) or aborting
     `signOutAndRedirect` before the redirect. Fixed to read `window[name]` inside the try, the
     same pattern the protected engine's own `STORES` already uses. New regression test.
  2. The new live-reset toast claimed "Anything you had entered on this device is gone" — false
     for a sale already queued to IndexedDB (invariant 2). Reworded to "Local records on this
     device were cleared," with no claim about the queue.
  3. (Low) `barHeight` now guards `Number.isFinite(profit)` before the trend formula, matching the
     protected engine's own behaviour on non-finite input; not a behaviour change today.
  4. Not fixed, disclosed instead: the sign-out queue-survival test is jsdom-mock-only. The
     review's own import-chain reading (`live-gate.ts` never imports `@/lib/offline/queue` or
     touches `indexedDB`) is stronger evidence than the mock; a real check needs headless
     Playwright once MP-07 finish (offline queue) lands.
  - Also confirmed by the review: no SSR/hydration risk (`OpsApp` renders `null` until mounted, so
    `OpsRuntime` never renders server-side); editing `ops-engine.d.ts` is in scope (only
    `ops-engine.js` is protected, per both the pre-tool-use hook and `scripts/validate-g0.py`); the
    known MP-07 limitation (a reload drops the on-screen bazaar tally even though IndexedDB rows
    survive) is already disclosed in [G2-plan.md](G2-plan.md) and not new to this slice.
- **Caught and reverted, not committed:** running `scripts/validate-g0.py` for evidence overwrote
  `docs/state/evidence/g0-validation.json` as a side effect (it writes that file regardless of
  stdout redirection). That file is hash-pinned as frozen G0 evidence in `evidence-index.json`
  (`sha256 5ca9431…`); the overwrite was reverted with `git checkout 3e4e146 -- …` both times before
  committing, and the restored file's hash matches the pin. Unlike
  [MP-06l-evidence-overwrite.json](evidence/MP-06l-evidence-overwrite.json)'s incident, git history
  made this fully recoverable, so no separate disclosure file was needed — this paragraph is the
  disclosure. `docs/state/task-status.json`'s `manual_status_values` check also caught a genuine
  typo in this session (`"in progress"` instead of the enum's `"in_progress"`), fixed before commit.
- **Known, not fixed — copy that reads as false in live mode, both in protected files:**
  `src/components/sheets/reset.tsx`'s ported copy ("Everything on this device goes back to the
  sample books") and the protected engine's `savedText` ("saved on this device as you work," now
  true only until the next reload). Both need a locked-UI exception decision, like the live-frame
  one, before they can be corrected — recorded here for that future slice, not decided now.
- **Disclosed: this slice is over the lean plan's ~400-changed-line guideline.** About 620 authored
  lines (577 excluding the auto-generated evidence JSON that was reverted anyway), of which
  roughly 470 are test code across four new/changed test files; ~150 are the actual behaviour
  change (`live-state.ts`, `ops-runtime.tsx`, `live-gate.ts`, `ops-engine.d.ts`). Continued rather
  than split mid-flight because the goal's own acceptance criteria (the full screen matrix, the
  storage-boundary proofs) only hold together as one slice; noted here rather than force-pushed
  history, since force-push is denied by this repo's tooling.

## Prior checkpoint — 2026-09-27 (MP-08 closed: idle sign-out defaults, G2 slice 1)

- **DP-15 decided (Ethan, 2026-09-27):** option B with the audit B10 defaults. `src/lib/auth/idle-signout.ts`
  signs owner and support out after 60 idle minutes and helpers after 240 (was 180, a placeholder). The owner will
  be able to change these within 15 min – 8 h in MP-09 b. The V7.1.1 rationale and accepted risk are recorded in
  the [decision register](decision-register.md); the runbook and configurability audit B10 now give the decided
  minutes. Unit tests assert each role's minutes and a four-hour helper timer.
- Evidence: `pnpm verify` 33 files/445 tests, exit 0; G0 validator 1196 checks, 0 failures. Independent review of
  `061ed64` by the Sonnet security-reviewer: no findings. No deploy; no protected file edited.
- MP-08 is **complete locally** in `task-status.json`. Carried over, not done: the signed-in checks on the hosted
  preview (refresh probe, `auth.sessions`, role bootstrap, idle sign-out), which need a test account Ethan creates
  and signs in with himself (next-goal.md "After these goals" 1); and the provider-account MFA and recovery-code
  rehearsal on Ethan's Supabase, Cloudflare and GitHub accounts (documented in
  [RUNBOOK-accounts.md](../RUNBOOK-accounts.md) §7, not yet recorded as performed).

- Next goals re-audited against the code (G2-plan.md "Slice audit"): MP-09 a gained the full private-key
  classification, sessionStorage and stale-copy cleanup, the live Settings reset and the fake P&L trend; MP-09 b is
  split into b1 (database) and b2 (app). A render probe showed every screen survives empty books, so no protected edit
  is needed for MP-09 a.

## Prior checkpoint — 2026-09-27 (G2 planned)

- Ethan: "start connecting orders, money and stock to the database". [G2-plan.md](G2-plan.md) sets the
  principles (database is the source of truth; every write is a server command wrapped in `OpsRuntime`; live mode
  never starts from the demo books; one protected-engine exception for `PRODUCTS`/`PAY_ACCOUNTS` before MP-09 c)
  and the order: MP-08 close → MP-09 a–d → MP-16 → MP-07 finish → MP-10 → MP-11 → MP-12 → MP-17 → MP-13 → MP-14 →
  MP-15. MP-07 is unfinished (durable offline queue, OFFLINE-01), so customer ordering waits for it.
- The first two goal blocks (MP-08 close, MP-09 a) are in [next-goal.md](next-goal.md). No G2 code yet.

## Prior checkpoint — 2026-09-27 (live frame: no review harness, automatic screen size)

- **Owner-directed (Ethan):** the live build keeps every screen, animation and layout but drops the prototype's
  review aids: header row ("Interactive prototype · … · mock data", device/role/width pickers, simulated
  Online toggle), flow strip and flow bar, and the owner-preview row on the customer shop/order-status screens
  ("Back to ops", "Preview · customer view", drop-state toggles). The frame fills the screen and uses the
  prototype's own phone/tablet/desktop layout by viewport width (<768/<1200/else). Demo mode is unchanged.
  Protected-markup exception recorded in [protected-exception.md](protected-exception.md) and registered in
  `scripts/validate-g0.py` as exact reversals (1196 checks, 0 failures).
- Evidence: `pnpm verify` 33 files/444 tests; `pnpm test:e2e` 87 passed/3 failed (known OFFLINE-01)/30 skipped,
  unchanged; local `build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass; Python guards pass;
  redeployed with `scripts/deploy-preview.mjs` (build → QR placeholders → real-QR refusal → deploy) and
  `scripts/test-hosted-preview.mjs` PASS incl. no harness text and no sideways scroll at 390/834/1280 px.
  Independent port audit: no copy/element/demo change; its process findings are addressed.
- **Still true and easy to misread:** every staff-screen number ("78 of 200", orders, "Good evening, Cine")
  is the prototype's demo data held in the browser. Nothing reads from or writes to Supabase yet; that is G2.

## Prior checkpoint — 2026-09-27 (hosted preview, MP-04)

- **The hosted static preview is live (Ethan approved, $0):** https://happy-cookie-preview.admin-kethai.workers.dev,
  Workers static assets with no Worker script ([spikes/workers-preview](../../spikes/workers-preview/README.md)),
  against the synthetic Supabase project `happy-cookie-preview` (org "Happy Cookie", ap-southeast-1, Free) holding
  fake catalogue data only. The connected Supabase account's other org belongs to another client and was not used.
- All 28 migrations applied; schema equivalence vs the local stack proven by catalog fingerprints (columns,
  policies, functions incl. ACLs identical). Evidence: [MP-04-hosted-preview-2026-09-27.json](evidence/MP-04-hosted-preview-2026-09-27.json).
- `scripts/test-hosted-preview.mjs` PASS: 26 routes with the exact manifest CSP, security headers and cache policy;
  immutable fingerprinted assets; real 404; payment QR images are "test preview, do not pay" placeholders
  (`scripts/preview-placeholder-qr.mjs`, build output only); anon sees 0 rows in all 19 tables (including the
  seeded ones) and 401 on service-only RPCs; `/shop` hydrates with 0 CSP violations/JS errors; in-page proof that
  `connect-src` allows the Supabase origin and blocks an unrelated one. SQL probes: a new function is not
  executable by anon/authenticated/PUBLIC, no table without RLS, only the two shop views, no API grant in `hco_private`.
- **Found:** hosted Postgres is 17, local is 15. PG17 adds the MAINTAIN privilege, which anon/authenticated hold on
  every public table there (not usable over PostgREST, invisible to the local SQL role suite). Follow-up: move the
  local stack to PG17 and add a reviewed migration revoking MAINTAIN from API roles.
- Self-signup is off (Ethan, 2026-09-27; verified `disable_signup: true` via `/auth/v1/settings`).
- Access-token expiry set to 1800 s by Ethan (2026-09-27) under Authentication → Sessions (it moved there from the
  Legacy JWT Secret tab after the signing-key migration). Not verifiable anonymously: `/auth/v1/settings` does not
  expose it; confirm from a signed-in token's `exp` during the signed-in checks.
- **Open for Ethan:** the
  signed-in checks (refresh probe, `auth.sessions`, role bootstrap, idle sign-out) need a test account Ethan creates
  and signs in with himself. Free projects pause after about a week without activity.

## Prior checkpoint — 2026-09-27 (static CSP headers)

- **next-goal.md Goal 2 — static headers for direct Supabase (MP-04 prerequisite) — is done
  locally. No deploy.** [scripts/pages-spike-headers.mjs](../../scripts/pages-spike-headers.mjs)
  now emits `form-action 'self'` and `connect-src 'self'` plus exactly the origin of
  `NEXT_PUBLIC_SUPABASE_URL` (`'self'` alone when unset). `supabaseConnectOrigin()` emits
  only the parsed `URL.origin`, so a path, `;` or newline cannot widen or inject into the
  policy; it accepts `https:` (and `http:` only for a loopback host) and rejects userinfo,
  query or fragment. No `ws:`/`wss:` source: a grep of `src/` finds no Realtime use
  (`.channel(` / `realtime`). [scripts/build-pages-spike.mjs](../../scripts/build-pages-spike.mjs)
  reads the variable once, validates it before building, and passes the same value to the
  bundle env and the header generator (recorded as `staticHeaders.supabaseOrigin` in the
  manifest), so header and bundle cannot diverge.
  - Tests: 4 new unit tests in `tests/unit/pages-spike.test.ts` assert exact directive values
    (parsed, not substrings), rejection of broader/unsafe URLs, and the 2000-character line
    check (3 fail against the previous generator; the overflow check already existed).
    `test-pages-spike.mjs` and `test-workers-web-spike.mjs` assert the served/manifest CSP's
    exact `form-action` and `connect-src`.
  - Evidence (this session): `pnpm verify` 32 files/438 tests exit 0. With the local
    Supabase stack's URL and publishable key set, `build:pages:spike`, `test:pages:spike`
    (`/shop` hydrated, 0 CSP violations, 0 JS errors) and `test:workers:spike` (26 routes)
    all exit 0; the emitted `_headers` carries `connect-src 'self' http://127.0.0.1:54321`,
    the bundle inlines the same origin, longest line 1733/2000. With the variables unset the
    build exits 0 and emits `connect-src 'self'`.
  - **Fixed the same day (follow-up commit):** the live gate no longer creates a Supabase client when the build has
    no URL/key (`hasSupabaseConfig()`); customer screens render and staff screens stay closed and go to sign-in.
    With the variables unset, `build:pages:spike`/`test:pages:spike`/`test:workers:spike` now all exit 0 (`/shop`
    hydrated, 0 CSP violations); configured runs still pass; `pnpm verify` 32 files/440 tests. Independent review
    (Sonnet security-reviewer, different model from this Opus session): SAFE TO MERGE, no P0/P1; its test-coverage
    P2 was added. Its other P2 (a set-but-malformed URL) is already refused at build time by `supabaseConnectOrigin()`.
  - **Previously pre-existing (now fixed, see above):** with `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY`
    unset, both spike tests time out waiting for `/shop` to hydrate. Reproduced identically
    on `f2d14d5` with this change stashed, so it comes from Goal 1's live mode, not the CSP.
    The spike tests therefore need a configured Supabase env.
  - CSP headroom: 267 characters under the 2000 limit; it shrinks by ~54 per new distinct
    inline script hash, and a hosted `https://<ref>.supabase.co` origin is ~18 characters
    longer than the loopback one.

## Prior checkpoint — 2026-09-27 (later)

- **next-goal.md Goal 1 — staff sign-in under architecture A — is done locally.** The
  static export ships with no `src/middleware.ts` (`scripts/build-pages-spike.mjs`
  deliberately excludes it), so the actual gate for a Workers static-asset deploy is
  client-side: [src/components/app/live-gate.tsx](../../src/components/app/live-gate.tsx)
  plus [src/lib/auth/live-gate.ts](../../src/lib/auth/live-gate.ts) and
  [src/lib/auth/idle-signout.ts](../../src/lib/auth/idle-signout.ts).
  - Key rename: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) replaces
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` everywhere (client/server/config/middleware,
    `.env.example`, CI, Dockerfile, docs). The browser client's own `requireEnv` now reads
    `process.env.NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` as literal member
    expressions, not a computed lookup — the computed form silently returns `undefined` in
    Next's client bundle; verified by grepping a built static export for the literal value.
  - `NEXT_PUBLIC_APP_MODE` (default `demo`) is set to `live` only by
    `scripts/build-pages-spike.mjs`. Live mode: no demo/harness bootstrap
    (`OpsRuntime.renderVals()` starves the role switcher regardless of
    `NEXT_PUBLIC_HARNESS`, which the static build never sets); staff routes need a real
    Supabase session; role and routing come from the signed-in profile via RLS
    (`engine.setRole()`); sign-out uses `{ scope: 'local' }` and never touches the offline
    sale queue (invariant 2).
  - **Independent review (Opus, different model from the Sonnet implementation) found two
    P1s, both fixed and re-verified before commit:**
    1. The gate was decided once from the page's initial screen. The ported
       `shop`/`order-status` screens have a "Back to ops" control
       (`goBackOwner: () => this.go('today')`, protected `ops-engine.js`) that moves the
       engine straight to a staff screen with no page load and no auth check — an
       anonymous customer, or a signed-in helper, could reach staff Home this way. Fixed by
       deriving the gate from the engine's _current_ screen on every render (seeded from
       the initial screen to avoid gating on the engine's own transient default screen
       before `RouteSync` corrects it — that default is `'today'` for every route,
       protected `BASE_STATE`). Covered by a new regression test,
       `tests/unit/live-gate-component.test.tsx`, that reproduces the exact bypass.
    2. `supabase.auth.signOut({ scope: 'local' })` does not always remove the local
       session: reviewed and reproduced against the installed `@supabase/auth-js@2.115.0`
       — if the access token is expired (the normal case for an idle sign-out with no
       signal), `_signOut` tries a token refresh first, and an offline refresh failure
       makes it return before removing the stored session. Fixed by checking `signOut`'s
       own result and force-clearing the session cookies directly on any error
       (`src/lib/auth/live-gate.ts`).
    - Also fixed: a profile re-check that merely can't reach the network (offline, a
      timeout) is now treated as inconclusive rather than a denial once a session has
      already been verified once this page load — otherwise Bazaar Mode's own
      connectivity re-checks would sign the till out for no security reason. A removed
      false claim of an "8 h absolute session lifetime" (`idle-signout.ts`,
      `decision-register.md` DP-15) — that was a property of the archived BFF; there is no
      absolute lifetime under architecture A, which is exactly why the idle timer matters.
  - Local rehearsal on the actual Supabase stack (Docker, all 28 migrations): provisioned
    a helper account, confirmed the finance-only `ledger_entries` table is invisible
    before _and_ after `refreshSession()`, deactivated the account, confirmed it can still
    read its own (now-inactive) profile row — exactly what `live-gate.ts` depends on — and
    is fully locked out. This also found and fixed a real local
    `supabase/config.toml` bug: `[auth.email].enable_signup` is the email/password
    provider's own on/off switch (`GOTRUE_EXTERNAL_EMAIL_ENABLED`), not "allow self-serve
    signup" (that's the top-level `[auth].enable_signup`, `GOTRUE_DISABLE_SIGNUP`) — the
    file had it set off, which silently disabled password sign-in entirely, not just
    signup.
  - [docs/RUNBOOK-accounts.md](../RUNBOOK-accounts.md): owner-assisted provisioning,
    revocation, password recovery with no SMTP, JWT expiry (1800 s, matching
    `supabase/config.toml`), and Supabase/Cloudflare/GitHub account MFA with offline
    recovery codes.
  - `pnpm verify` 32 files/434 tests exit 0; `pnpm test:e2e` 87 passed/3 failed (the same
    known OFFLINE-01 durable-queue failures)/30 skipped, unchanged from baseline;
    `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` all pass, `/shop`
    still hydrates with zero CSP violations and zero JS errors; the built export was
    grepped for `SERVICE_ROLE`/`sb_secret_<value>` (clean) and for the literal configured
    Supabase URL/key (found — confirms the env-inlining fix); the SQL role suite passes
    474 cases/reset across 2 resets.
  - **Not done:** the hosted Workers static-assets preview (needs Ethan's approval, see
    next-goal.md "After these goals"); DP-15's exact idle minutes were then still Ethan's
    decision, not this session's (decided 2026-09-27: 60/60/240; the code then marked them as awaiting DP-15 everywhere they
    appear); Goal 2 (static CSP headers for direct Supabase) is done — see the checkpoint above.
  - **Unrelated, noticed mid-session, left alone:** `.codex/config.toml` was reformatted
    (comments stripped) and gained a `[mcp_servers.codebase-memory-mcp]` entry, and a new
    `.codex/agents/Explore.toml` appeared — neither was an intentional edit in this
    session; both look like an automatic side effect of using the codebase-memory-mcp
    tools rather than anything this session wrote by hand. Left uncommitted for Ethan to
    review and decide on separately; not part of this commit.

## Prior checkpoint — 2026-09-27 (MP-06n)

- **MP-06 default-privilege hardening is done locally.** The 28th migration
  ([20260101002700_function_default_privileges.sql](../../supabase/migrations/20260101002700_function_default_privileges.sql))
  revokes function EXECUTE from PUBLIC both globally (`FOR ROLE postgres`) and
  for the `public` schema's `anon`/`authenticated` default (`IN SCHEMA public`),
  closing the gap [MP-06m](MP-06m-plan.md) proved. It also makes explicit the
  EXECUTE grants on `current_role_name`, `is_owner`, `is_staff`,
  `state_is_recognised`, `state_reserves_capacity` and `capacity_allows` —
  these six had never had an explicit GRANT, so their ACL was purely
  default-derived and would have silently lost `anon`/`authenticated` EXECUTE
  on a second `supabase db reset` against the same database once the two
  revokes above exist (found and fixed after an initial same-model
  security-reviewer pass caught it; a second same-model pass confirmed the fix
  and a related catalog-guard PUBLIC-grantee gap, which was also fixed). A
  third pass, explicitly run on Opus — a different model from the Sonnet
  session that implemented and reviewed this — is the required different-model
  gate: verdict SAFE TO MERGE, nothing at P0/P1, four low/P2 notes (none
  requiring a code change; one was a documentation-accuracy note about this
  line, now corrected).
  - [tests/integration/security/future-function-defaults.sql](../../tests/integration/security/future-function-defaults.sql)
    - `scripts/probe-future-function-defaults.py` prove the new state on two
      identical 28-migration resets: a brand-new function is not executable by
      anon/authenticated/PUBLIC, `service_role` keeps its reviewed grant, and no
      existing function ACL changed.
  - `scripts/test-db-security.py` adds a catalog-wide guard: every `public`
    table/partitioned table has RLS enabled, the only `public` views are
    `shop_products`/`shop_drops`, and no API role (nor PUBLIC) has any
    privilege in `hco_private`. Two red probes (a table without RLS, a PUBLIC
    grant into `hco_private`) prove the guard actually fails closed.
  - `tests/fixtures/mp08g-source-pins.json` now pins 28 migrations; the
    hardcoded "27 migrations" checks in `scripts/test-auth-fixture.py`,
    `scripts/test-db-bootstrap.py`, `scripts/test-cleanup-recovery-rpcs.py`,
    `scripts/test-pages-provider-fixture.py`, `scripts/test-session-repository.py`
    and `tests/unit/test_auth_fixture.py` all derive the count from that pin
    file instead.
  - `pnpm verify` 28/410 exit 0; `python scripts/test-db-security.py` passes
    474 cases/reset across 2 identical resets plus the new guard; all 63
    Python unit/integration guards pass; `scripts/test-session-repository.py`,
    `scripts/test-cleanup-recovery-rpcs.py` and `scripts/test-pages-provider-fixture.py`
    all report PASS with `migration_count: 28`.
  - Not done: the managed-Supabase creator/upgrade rehearsal MP-06m flagged as
    the next step is still open, and hosted acceptance is unstarted. G1 remains
    incomplete.

## Prior checkpoint — 2026-09-26

- **How we work now:** the [lean plan](lean-plan.md), approved by Ethan on 2026-09-26.
  - **Architecture A:** a static site plus direct Supabase, with RLS as the boundary. The BFF is archived.
  - **Process:** one `/goal` per package, and git is the evidence trail.
  - **Run next:** the [next goal](next-goal.md).
  - **Agents:** whichever one is available does the work. Codex is unavailable, so Claude does it for now.
- **Gates:** G0 (MP-00–03) complete. G1 (MP-04–08) **in progress**. Release acceptance **FAIL** — see [task-status.json](task-status.json).
- **Accepted locally since 2026-09-24** (details and limits are in the history below):
  - [MP-08n](MP-08n-plan.md).2/.3: an actual Workerd → private GoTrue/PostgREST lifecycle.
  - [MP-08o](MP-08o-plan.md).1–.4: cleanup recovery, fair claims and a scheduled cleanup Worker (migrations 25–26).
  - [MP-06l](MP-06l-plan.md): the erasure digest/EXECUTE repair (migration 27).
  - [MP-04d](MP-04d-plan.md): one export served by both Pages and Workers adapters, with a generated hash CSP and cache policy.
  - MP-04e: the Cloudflare Wrangler profile is ready. No hosted resource exists.
- **Verified 2026-09-26 by Claude**, on the tree Codex left:
  - Pinned `pnpm verify`: 28 files / 410 tests, exit 0 ([receipt](evidence/G1-verify-claude-20260926.txt)).
  - Continuity: 1,184 checks, 0 failures.
  - All 934 evidence-index hashes matched.
  - The latest full CLI E2E is still 87 passed / 3 failed (durable offline queue) / 30 skipped, from [MP-07a](MP-07a-plan.md).
- **Open G1 work, in order:**
  1. [MP-06m](MP-06m-plan.md) default-privilege probe: **complete locally 2026-09-26** (Claude ran it: two identical resets, clean rollback and cleanup). It proves a global-only default revoke is insufficient, because new `public` functions still get `anon`/`authenticated` EXECUTE. Next is a separately reviewed 28th-migration hardening plan with a managed-upgrade rehearsal.
  2. The rest of G1 under architecture A is **one goal**: [next-goal.md](next-goal.md). It covers:
     - the 28th-migration default-privilege hardening;
     - `supabase-js` sign-in, role bootstrap and fail-closed sessions;
     - a client-side idle sign-out with its minutes then awaiting DP-15 (decided 2026-09-27);
     - a provisioning runbook;
     - the CSP `connect-src`/`form-action` changes.
  3. The hosted static preview on Workers static assets (DP-14 is resolved) needs Ethan's approval.
  - MP-08p, the BFF sign-in, is superseded by architecture A.
- **Open residue:**
  - the test-only `build/pages-spike/.mp08n3-network-sxm347` scratch directory;
  - the historical `evidence/MP-05a-failure-cleanup.json`, overwritten by a test and disclosed in [MP-06l-evidence-overwrite.json](evidence/MP-06l-evidence-overwrite.json). The original bytes are unrecoverable because the file was never committed.
- **Owner decisions:** see the [decision register](decision-register.md), the [owner decision packet](owner-decision-packet.md) and [owner inputs](owner-inputs.md). **G2 (MP-09+) stays blocked** until they are answered.
- **Committed:** the G1 baseline is `6f334c1` (pre-commit `pnpm verify` 28/410 passed; secret scan of 1,049 files found no hits). It is pushed to the private branch `origin/agent/codex/MP-04-g1-feasibility`. Agents now commit and push each accepted slice under Ethan's standing approval. `main` has 15 Dependabot alerts (7 high); those belong to the G4 security pass.
- **Frozen:** `G1-evidence-index.json` and the per-slice receipts are history. From now on, git commits are the evidence trail.

## Checkpoint history (newest first; kept verbatim except for a mojibake repair of `â€”`/`â€“` to —/–)

### Checkpoint bullets as recorded before the 2026-09-26 consolidation (verbatim)

- **Cloudflare account setup — 2026-09-26:** a distinct `happy-cookie-ops` Wrangler profile is authenticated and bound to this checkout after owner approval through GitHub sign-in. Read-only identity and name checks show the reported email, one account, zero Pages projects and no target Worker collision; the default profile is preserved. The owner reports that Workers & Pages displays Free. [Sanitized preflight](evidence/MP-04e-cloudflare-preflight.json). Spend settings, hosted config, secrets, CPU/quota proof and deployment are still open; no hosted resource was created.
- **MP-06l erasure authority — 2026-09-25:** accepted on local disposable fixtures. A forward-only 27th migration qualifies `extensions.digest` inside the owner-only erasure function and removes PUBLIC/anon EXECUTE while preserving its other body behavior, owner, path and authenticated/service grants. Two fresh database resets and the SQL role suite pass 474 cases per reset and 62 unsafe-grant probes, with exact rollback/cleanup; a two-pair private Auth HTTP lifecycle, unchanged generated types, 60 Python guards and [pinned verification](evidence/MP-06l-verify-accepted.txt) (28 files/410 tests) pass. [MP-06l plan and limits](MP-06l-plan.md). Hosted API/JWT, legal retention rules, function defaults, assigned-event capability, MP-06 and G1 remain open.
- **MP-04d local Pages/Workers prerequisite — 2026-09-25:** accepted locally. One fresh 26-page export drives both adapters. Generated exact-HTML CSP hashes, strict fingerprinted-asset cache validation, Pages and Workers Workerd oracles, all-route Workers CSP checks and CLI Playwright `/shop` hydration pass; the Worker bundles in dry-run mode with no upload. [Pinned verification](evidence/MP-04d-verify-accepted.txt) passes 28 files/410 tests. [Plan and bounded evidence](MP-04d-plan.md). Correct-account Wrangler setup completed separately on 2026-09-26; hosted Pages/Workers proof, Auth/private file/sync/CPU/quota checks, DP-14 and G1 remain open.
- **MP-08o.4 local scheduled adapter — 2026-09-25:** local acceptance **PASS**. A separate `scheduled()`-only Worker composes the existing cleanup authority, caps each tick at three claims/40 fetch attempts/24.5 seconds, and emits aggregate-only outcomes. Five focused tests, no-binding Workerd dispatch, dry-run bundle and independent Sol/high review pass. Two consecutive fresh private-provider/database fixtures after the review correction ([attempt 10](evidence/MP-08o4-provider-attempt10.txt), [attempt 11](evidence/MP-08o4-provider-attempt11.txt)) prove empty, cooldown and completed revocation ticks, exact provider-session absence and SQL state, wrong-key/TLS rejection, 26 migrations, no published provider ports and zero owned residue. Earlier fixture failures remain in the [attempt ledger](evidence/MP-08o4-provider-attempts.json). The synthetic-key translation is test-only and does not prove hosted Supabase key handling. Correct-account Wrangler setup completed separately on 2026-09-26. Hosted configuration, Cron activation, CPU/free-tier measurement, browser/provisioning checks, MP-08 and G1 remain open. See [MP-08o](MP-08o-plan.md).
- **MP-08o.3 local acceptance — 2026-09-25:** the new 26th migration gives eligible cleanup rows a fair first-eligibility/last-attempt order while retaining the 30-second floor, skip-locked claims, fences and restricted grants. Two fresh private Auth/database pairs pass 12 repository/race scenarios, including repeated waiting early revocations ahead of one eligible failed row; final cleanup RPC and real composed provider fixtures pass with zero owned residue. Two-reset schema generation leaves public TypeScript types unchanged; the reviewed function manifest records one body-hash change. [Final pinned verify](evidence/MP-08o3-verify-final.txt) passes 26 files/403 tests; independent Codex Sol/high review found no remaining P0–P2 issue in the inspected SQL and fixture. See [MP-08o](MP-08o-plan.md). The scheduled caller, hosted/browser gates and G1 remain open.
- **MP-08o.2 local acceptance — 2026-09-25:** the 25th migration, generated types/manifest, fenced encrypted-credential rotation, exact Auth-row absence completion and bounded cleanup pass their local gates. The SQL fixture proves role/binding/version checks and observes a concurrent follower waiting on the leader's row lock; two consecutive fresh private-provider fixtures pass post-refresh/pre-save interruption, 11-second parent replay and exact cleanup, with 25 migrations, no published ports and zero owned fixture residue. [Final pinned verify](evidence/MP-08o2-acceptance-verify.txt) passes 26 files/403 tests; [continuity](evidence/G1-continuity-MP08o2-accepted.txt) passes 1,184 checks. Independent Codex Sol/high follow-up found no remaining P0–P2 issue in the inspected final changes. See [MP-08o plan](MP-08o-plan.md). Fair claims, scheduled caller, hosted/browser gates and G1 remain open.
- **Earlier MP-08o.2 provider prerequisite:** a fresh pinned private GoTrue/PostgreSQL fixture proved that replaying the direct-parent refresh token after 11 seconds returns the same active child token, preserves the exact user/provider-session binding, and permits local logout of only that session while another session of the same user remains usable. An independent Codex Sol/high review found three P2 gaps; the plan and fixture were corrected and the final fixture rerun passed. See the [probe and limits](MP-08o-plan.md) and [sanitized result](evidence/MP-08o2-parent-reuse.txt). This is local provider-behavior evidence; the current implementation and remaining acceptance gates are recorded above. Claude is unavailable; Codex-only work applies.
- **Gates:** G0 (MP-00–03) complete. G1 (MP-04–08) **in progress**. Release acceptance **FAIL** — see [task-status.json](task-status.json).
- **Latest engineering:** [MP-08m](MP-08m-plan.md) is complete locally. [MP-08n](MP-08n-plan.md) is in progress: the n.1 PostgREST smoke passes, and the n.2 composed lifecycle is **flaky and not accepted**. See its "Interim results".
- **Codex follow-up, later on 2026-09-24:** the earlier n.2 interim assessment above is superseded for the **local injected-bridge criterion** by two consecutive timed fresh-fixture passes, with 24 migrations, no published ports and zero owned residue ([attempt 1](evidence/MP-08n2-timing-attempt1.txt), [attempt 2](evidence/MP-08n2-timing-attempt2.txt)). The previous 503 root cause remains unknown. Actual Workerd-to-provider networking (n.3), integrated browser acceptance and G1 remain open.
- **Verified today:** full `pnpm verify` on the current tree with the pinned Node 24.20.0 / pnpm 9.12.3 passed 26 files / 387 tests, exit 0 ([receipt](evidence/MP-08n-verify-claude.txt)). The latest full CLI E2E remains 87 passed / 3 failed (durable offline queue) / 30 skipped (SQL fixture) from [MP-07a](MP-07a-plan.md).
- **Owner decisions:** owner-authored sources (the filled client guide, walkthrough margin comments, the Meeting 1 transcript) conflict with parts of the plan and prototype. They are recorded in the [decision register](decision-register.md). The open questions for the owner are in the [owner decision packet](owner-decision-packet.md), and the materials she offered are tracked in [owner inputs](owner-inputs.md). **G2 (MP-09+) stays blocked** until those are answered.
- **Open G1 work, in order:** finish MP-08n → MP-06 remaining authority → MP-04 hosted spikes on Pages _and_ Workers (DP-14) → MP-08 closure (UI wiring, session cleanup, idle timeout, provisioning) → MP-07 real bootstrap.
- **Who does what:** see the [shared Codex/Claude policy](agent-orchestration.md). Codex owns application code, migrations, tests and fixtures. Claude owns governance/docs and cross-reviews.
- **Availability update, later on 2026-09-24:** Ethan no longer has a Claude subscription. The [current Codex-only override](agent-orchestration.md) supersedes the prior allocation; independent Codex review replaces queued Claude review. No paid/API fallback is authorized.
- **MP-08n.3 update, later on 2026-09-24:** the 26-page build and unconfigured emulator pass, but three fresh actual Workerd/provider fixtures fail at login HTTP 503. The latest sanitized diagnostic records zero gateway/provider requests, so the [local runtime boundary](MP-08n3-plan.md) remains unaccepted. A Codex security review also found that expired/failed session cleanup has no scheduled caller. MP-08 and G1 remain open.
- **MP-08o.1 update:** a fresh private GoTrue probe confirms expired access-token logout returns 403 `bad_jwt` without removing its session; refresh then local logout of the same session succeeds. See the [probe plan/result](MP-08o-plan.md). This is provider behavior evidence, not a cleanup implementation or MP-08 closure.
- **MP-08n.3a update, later on 2026-09-24:** a minimal non-secret Pages Function in actual local Workerd reached loopback HTTP and CA-trusted HTTPS (both 204); the no-CA HTTPS control failed while HTTP still worked. [Probe receipt](evidence/MP-08n3a-network-probe-final.txt). This narrows the earlier login 503 to the full configured/gateway path. The next full private-provider rerun stopped before fixture creation because the Docker Desktop Linux engine pipe was absent. An initial probe left one test-only scratch directory after a Windows file lock; exact cleanup remains open. The full lifecycle, MP-08 and G1 are still unaccepted.
- **MP-08n.3b supersedes the earlier local lifecycle failure:** actual Pages Workerd → CA-trusted gateway → private GoTrue/PostgREST login/read/refresh/role-change/logout/post-logout and final SQL passed on three fresh fixtures, including [two consecutive passes](evidence/MP-08n3b-lifecycle-attempt4.txt) with 24 migrations, zero published ports and guarded fixture cleanup. The [plan/result](MP-08n3-plan.md) records the Workerd fetch fixes, a generic failed attempt between passes, and one prior test-only network scratch directory that remains after command policy rejected exact-path recursive cleanup. Local functional behavior passed; total test residue, hosted and browser acceptance, scheduled cleanup, MP-08 and G1 remain open.
- **Uncommitted:** all G1 work since `dc8c8a5` is uncommitted, and the branch has no remote. Committing or pushing needs Ethan's approval after cross-review. The 2026-09-24 secret scan found only synthetic test values.

> **Latest G1 checkpoint — 2026-09-24:** [MP-08m](MP-08m-plan.md) completes local Pages session route composition with a typed, allowlisted service RPC bridge, exact-origin/session dispatch, trusted caller selection and fail-closed configuration. `pnpm verify` passes 26 files/387 tests; the 26-page build and unconfigured emulator pass. A configured Workerd boot with synthetic-only bindings passes four boundary statuses without contacting a provider. Independent read-only review found no actionable P0–P2 issue. Actual composed GoTrue/PostgREST lifecycle, real browser bootstrap, MP-06 remaining authority, offline queue, hosted Cloudflare and physical Apple acceptance remain open. G1 is active, not release-ready.

> **Latest G1 checkpoint — 2026-09-22:** [MP-08k](MP-08k-plan.md) completes the unwired persistent `SessionAuthority` adapter locally, and [MP-08l](MP-08l-plan.md) records the exact pinned-provider duplicate-logout contract. The adapter composes the durable repository, Auth transport and encrypted envelope with fail-closed validation, stable browser identity and bounded cleanup recovery. Eighty focused tests, 33 fixture guards and full `pnpm verify` (24 files, 363 tests) pass; final independent review found no P0–P2 issue, and Docker cleanup reports zero owned residue. Route/service composition, integrated browser lifecycle, real bootstrap, offline persistence, hosted Cloudflare and physical Apple acceptance remain open, so G1 is still active.

> **Latest G1 checkpoint — 2026-09-22:** [MP-08j](MP-08j-plan.md) is complete locally. A private 24th migration and seven service-only RPCs now provide durable hashed BFF sessions, fixed eight-hour expiry, refresh fencing, revocation and retryable cleanup. Two fresh pinned Auth/database pairs pass 11 repository/race scenario groups; 26 guards and two 462-case security resets pass; generated types/manifest align and cleanup finds zero owned resources. Review found no P0/P1 issue and one documented exact-clock evidence limitation. G1 remains incomplete: the adapter and routes are unwired, and real bootstrap, offline persistence, hosted Cloudflare and physical Apple acceptance remain.

> **Latest G1 local checkpoint — 2026-09-21:** Docker Desktop is running again. [MP-08i](MP-08i-plan.md) passes two fresh pinned private GoTrue/PostgreSQL HTTP lifecycles: signup, login, Auth-checked user, refresh, local logout, deleted session row and exact post-logout 403 `session_not_found`; all owned fixtures were removed. The app Auth transport now accepts that exact provider denial. [MP-04c local export repair](MP-04c-plan.md) passes static build, emulator and forced-failure artifact invalidation with untracked nonignored source included. Full `pnpm verify` passes 336 tests, and 21 Python fixture guards pass. Durable session persistence/authority, hosted Pages measurement, real bootstrap, offline queue and G1 release acceptance remain open.

> **Prior MP-08h checkpoint — 2026-09-21:** [MP-08h](MP-08h-plan.md) adds an Auth `/user`-checked provider session ID binding and requires routine refresh to preserve the cookie ID, CSRF token and absolute expiry. Focused 97 tests and full `pnpm verify` (336 tests) pass; independent read-only review has no findings in this bounded scope. The binding remains unwired. Docker was unavailable at that checkpoint; MP-08i above supersedes that limit with actual pinned HTTP evidence.

> **Latest local Auth-schema checkpoint — 2026-09-21:** [MP-08g](MP-08g-plan.md) passes the managed `auth.sessions` metadata preflight on two fresh pinned GoTrue/PostgreSQL pairs: 23 reviewed migrations, three single-column PK contracts, matching schema metadata, no demo transactions, no published host ports and exact cleanup. [Final receipt](evidence/MP-08g-live-final.txt), 15 guard tests and `pnpm verify` (323 tests) pass. The prior [MP-08e](MP-08e-plan.md) failure came from the bare PostgreSQL fixture and is not a provider incompatibility finding. Persistent BFF sessions, real Auth HTTP behavior and G1 remain incomplete.

> **Environment after the passing run:** an immediate read-only check found zero MP-08g containers, networks and workdirs. Docker Desktop later stopped exposing its API; a normal hidden launch did not restore a responsive engine. Do not rerun SQL acceptance until the local daemon responds. No socket deletion or global Docker cleanup was attempted.

> **Prior local SQL checkpoint — 2026-09-20:** [MP-06k](MP-06k-plan.md) passes its previously blocked role suite on two clean disposable resets: 462 cases per reset, 60 deliberate red probes, four function guards, ten sequence restorations, two profile upgrades, matching catalog/schema and guarded cleanup. A stale profile test oracle was corrected to the MP-06k raw-table policy.

> **Latest G1 checkpoint — 2026-09-20:** [MP-07a](MP-07a-plan.md) repairs the local demo's direct-route adoption, stocktake alias, clock-drift hydration and mixed browser/app history, including bake navigation without a tick, without editing protected UI or engine. `pnpm verify` passes 323 tests and the latest full CLI Playwright suite records **87 passed, 3 failed, 30 skipped**. All 3 failures are the still-absent durable bazaar sale queue; 30 SQL capacity cases lack an isolated database fixture. The client mount gate leaves public prerender HTML blank pending deterministic real bootstrap. MP-07, MP-08, MP-04 and G1 remain incomplete; no hosted/provider or physical Apple acceptance is claimed.

> **Latest G1 checkpoint — 2026-09-20:** [MP-08f](MP-08f-plan.md). MP-08f safe sign-in return paths complete locally:38 focused cases and pnpm verify323 tests pass. Existing form only changes helper import/next computation; original form-tail hash restored after Claude formatter drift. Sol/high review no findings; Claude review unavailable due expired OAuth. Real BFF persistence, Docker SQL and G1 acceptance remain incomplete.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08e](MP-08e-plan.md). MP-08e provider-schema preflight prepared and statically reviewed:3 runner guard tests and pnpm verify285 tests pass. Actual managed-schema SQL is NOT_VERIFIED/BLOCKED_ENVIRONMENT; outer Docker check stopped before fixture creation. Explicit not_after expiry and durable repository/race requirements documented. No persistence migration, real Auth or G1 completion claimed.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08d](MP-08d-plan.md). MP-08d encrypted session-token envelope complete locally:21 crypto/interoperability tests and full pnpm verify285 tests pass; Sol/high review has no remaining findings. Claude timed out without writes; one Terra/medium fallback implemented the module and unit tests, root independently verified Node AES-GCM interoperability. Persistent session store/provider races/Pages and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08c](MP-08c-plan.md). MP-08c Auth transport complete locally: Claude Sonnet/medium implementation, independent root tests and Sol/high review; 43 transport tests and full pnpm verify264 tests pass. Includes real loopback HTTP gzip decoding evidence. Persistent SessionAuthority, real provider acceptance, Pages/UI integration and MP06k SQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-14:** [MP-08b](MP-08b-plan.md). MP-08b HTTP session handler and independent verification packets complete with injected test authority:41handler+65requestpolicychecks, full pnpmverify221tests, final Sol/highreview no remainingfindings. Claude coded the handler; root integrated and fixed reviewfindings. Real persistent Auth/session authority, Pages/UI wiring, revocation/refresh concurrency and MP06kSQL remain incomplete. G1 active.

> **Latest G1 checkpoint — 2026-09-13:** [MP-08a](MP-08a-plan.md). MP-08a request-policy prerequisite complete locally:65 new real Request/stream security tests, full pnpmverify180tests, independent Sol/high review no findings. Origin/customheader, session CSRF comparison and boundedJSON validation implemented; no actual login/cookies/JWT/session binding or revocation yet. MP06k SQL behavior remains blocked by Docker startup; G1 incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06k](MP-06k-plan.md). MP-06k implemented; acceptance incomplete. Explicit unpublished-by-default catalog and fixed-field read-only views generated consistently across two23migration resets. Final pnpm verify passes115tests with two forks;22Python checks pass and the real Docker cleanup check is environment-blocked. New SQL role/projection suite is NOT_RUN because Docker startup fails at stale dockerInference socket. Claude supplied code and independent review. G1 remains active and incomplete.

> **Latest G1 checkpoint — 2026-09-13:** [MP-06j](MP-06j-plan.md). MP-06j private-table restrictions pass locally: 16 policies on 11 tables; 842 SQL checks, 56 regression probes, 4 live function guards, 10 sequence restorations and 2 profile upgrades. Unchanged types and all other catalog sections; 115 application tests and 23 Python guards pass. Claude review has no blocking findings. G1 remains incomplete; assigned-event projections, controlled commands, function defaults, sessions, routing and hosted acceptance remain open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06i](MP-06i-plan.md) adds a verified local function drift guard and creator/extension audit:4liveboundaries/636SQL/52red/10seq/2upgrades,115tests/23guards pass. Actual legacy erasure fails42883 at unqualified digest; rollback preserves customerfixture. Globalfunctiondefaults/managedupgrade compatibility and erasure remediation remain open. G1 incomplete; no hosted/production change.

> **Latest G1 checkpoint — 2026-09-13:** [MP06h](MP-06h-plan.md) completes trusted function search paths locally.636SQL/52red/10seq/2upgrades,19guards/115tests/types/catalog/cleanup pass;17bodies/owners/grants unchanged,16configchanges. Claude no blockers. G1 remains incomplete: global function defaults/remaining capabilities/projections,real sessions,routing and hosted acceptance are open.

> **Latest G1 checkpoint — 2026-09-13:** [MP06g](MP-06g-plan.md) is complete locally: future public table/sequence defaults restricted; explicit existing grants preserve20migration reset parity.626SQL/46red/10sequence restores/2upgrades,19guards/115tests/types/catalog/cleanup pass. Claude regex finding rejected with source/execution proof; remaining review clear. G1 remains incomplete: function defaults/helper/capability security,real sessions,routing and hosted acceptance remain.

> **Latest G1 checkpoint:** [MP06f](MP-06f-plan.md) is complete locally: REFERENCES and audit-sequence permissions restricted;578SQL/42red/10sequence restorations/2upgrades,115tests/16guards/types/catalog/cleanup pass. Existing constraints and trusted inserts remain. Next: future-object defaults/helper security,then role/session/routing/hosting gates. G1 remains incomplete.

> **Latest G1 checkpoint:** MP-06e trigger containment is complete locally:486 SQL scenarios/34 regression probes/2 upgrades,36 actual table grant removals/two function ACL changes,unchanged types,16 guards/115 tests and bounded Claude review pass. Existing six triggers still fire. [Evidence and incident disclosure](MP-06e-plan.md). G1 remains incomplete; next auxiliary grants/defaults/helper security, then session/routing/hosting acceptance. UI/UX unchanged; no live deployment.

> **Latest G1 checkpoint - 2026-09-12:** MP-06.d is complete locally. Two unsafe legacy mutation RPCs deny application execution; POST /api/sync returns fixed503/no ACK/no-store before auth or body access. Two resets pass386 SQL scenarios,28 regression probes and2 profile upgrades; exact two-function catalog delta, unchanged types and cleanup pass. All16 Python guards,115 unit tests, production build and3 standalone HTTP probes pass. Claude Sonnet5/medium found no blocking issues; Terra supplied complementary SQL/HTTP evidence. See [MP-06d plan and evidence](MP-06d-plan.md). Docker recovered without data reset. G1 remains incomplete: broader roles/functions/default privileges, real sessions, routing/hydration, durable offline behavior and hosted acceptance remain open; latest broad E2E78failed/30skipped. UI/UX remains locked; no deployment or live database. Next audit: [MP06e](MP-06e-plan.md) reproduced unauthorized SQL-role trigger attachment on two disposable fixtures; remediation is specified and pending. [Full G1 completion matrix](G1-completion-matrix.md) keeps remaining requirements explicit. Earlier checkpoints are history.

> **Active G1 continuation — 2026-09-10:** The owner authorized G1 and bounded Codex/Claude collaboration. Read [G1-plan.md](G1-plan.md) and the shared orchestration policy. Branch `agent/codex/MP-04-g1-feasibility` starts at G0 `dc8c8a5`. MP-04.b and MP-05.a local slices are complete. The approved SQL repair passes two real explicit-connection CLI resets on a disposable loopback-bound PostgreSQL container; exact migration history, catalog/schema equality, empty transactions, sentinel removal and cleanup pass. Eight additional fixture guard/failure tests pass. The earlier managed `--local` transport failure is retained as a limitation, not the accepted fixture. See [MP-05a-plan.md](MP-05a-plan.md). Docker runs and Cloudflare OAuth succeeded; no hosted database or deployment was created. Next is MP-05.b database types/schema reconciliation, then MP-06 authorization. G1 remains incomplete. The G0 evidence below is historical, including its older dependency counts and stop boundary.

## G0 foundation record (historical)

Authoritative root: `C:\Users\ethan\dev\happy-cookie-ops-g0`. The original OneDrive delivery is preserved with a working-copy pointer. No previous Git ancestry was recovered. The owner subsequently confirmed no previous database or SQL application; that confirmation resolved the limited baseline-repair approval gate.

Manual progress authority: [task-status.json](task-status.json). The generated master-plan catalog and audit remain historical planned scope; regeneration must not overwrite implementation progress. Read the [shared Codex/Claude policy](agent-orchestration.md) before delegation.

## Outcome

MP-00 through MP-03 foundation acceptance is complete. Product release acceptance remains red. The owner additionally authorized private GitHub publication and a Vercel demo preview; no production backend, customer operation, paid upgrade or automatic runner was introduced.

- [Private GitHub source](https://github.com/newonathe/happy-cookie-ops): bootstrap `main` commit `32e37da`, followed by the recorded packaging and baseline checkpoints. Local branch `agent/codex/MP-00-g0-foundation`; final checkpoint publication is recorded in the handoff.
- [Protected live preview](https://happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app): READY; sign in with the owner's Vercel account. This is a manually deployed demo, not a Git-connected automatic deployment.
- [Cloud evidence and configuration](cloud-preview.md): authenticated app 200, health 200/database not-configured, sync 500/no acknowledgment, unauthenticated 302 to Vercel sign-in. No hosted browser-hydration or production-readiness claim.

## Foundation evidence

| Package | Verified outcome                                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MP-00   | 675 delivered files preserved; original 347-file audit manifest unchanged. Private source checkpoint established. Current validator: 1,181 checks, zero failures, including schema/DAG/generator reproduction, protected hashes, policy/document links, 70 coverage rows and 75 baseline hashes.                                 |
| MP-01   | Node 24.20.0 locally/CI/Docker; pnpm 9.12.3 and frozen lock. Verified clean pinned install and reviewed lifecycle setup. Hosted Node 24.19.0 is within the documented supported range and cloud build passes with pinned pnpm through Corepack.                                                                                  |
| MP-02   | Initial 108 TypeScript diagnostics repaired; flat lint and reporting privacy tests pass. `pnpm verify`: 13 test files, 103 tests, exit 0. Local standalone, Docker and Vercel production builds pass. Five exact owner-approved null guards; other protected render bodies unchanged.                                            |
| MP-03   | Copy/style/handler/structure/relationship/declaration mutation probes detect changes. Route/offline false positives are rejected. Deterministic fixtures, five valid-sheet captures and 70-row state ledger. All 75 Docker regression snapshots accepted after source/visual review and independent readonly comparison, exit 0. |

See [toolchain](toolchain.md), [protected exception](protected-exception.md), [visual acceptance](visual-review.md), [state coverage](state-coverage.md), and [evidence index](evidence-index.json). The original prototype remains the design answer key. Regression images have visible review controls, frozen fixture/prerequisite differences and inherited clipping; they do not certify prototype pixel identity or all conditional states.

## Retained failures and unknowns

Latest full `pnpm test:e2e`: **78 failed, 30 skipped**, exit 1. Each phone Chromium, desktop Chromium and emulated iPhone WebKit run records 24 non-Home route redirects, one Home hydration error (React 418), and one nonzero sale without a durable IndexedDB queue row. Earlier focused phone Home passed; the fresh-build full run proves that hydration is still an intermittent release defect. MP-07 owns bootstrap/routing; MP-18–21 own offline persistence/reconciliation. The actual-runtime empty-ack test also remains red for MP-20.

Thirty SQL capacity cases skipped because no isolated database URL/key was configured. This is unavailable integration evidence, not a pass; MP-05/06 must supply it. No real database, physical iPhone/macOS Safari, PWA or hosted performance acceptance is claimed.

The first two-worker visual comparison passed 73 and timed out during page setup for two mobile tests; a full single-worker comparison passed all 75 without changing assertions or timeouts. Hosted CI pixel parity/concurrency remains unverified. GitHub bootstrap CI failed its inherited whole-repository formatting check; dependent jobs were skipped. Do not mass-format locked source or historical evidence to hide it. Dependency audit retains 11 transitive tooling advisories (5 high, 3 moderate, 3 low; zero critical), documented in the toolchain evidence.

## Next boundary

Stop at G0. The next product work follows G1/MP-04 onward and its decision gates; routing and offline fixes require their assigned packages. See [continuation](continuation.md). Keep preview fixtures isolated and use a fresh reviewed origin for eventual production. No further owner setup is needed for the current demo; future database/hosting decisions are not silently settled by this preview.

> **Current environment note:** Docker recovered for MP-06d; both owned SQL/type fixtures and cleanup pass. Earlier c5 daemon failure remains historical evidence. See [recovery evidence](evidence/MP-06d-environment.json). No image/volume/data reset.
