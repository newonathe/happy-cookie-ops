# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** build on **Sonnet 5 · high**; plan, sign off and review SQL/money/offline on **Opus 5.5 · medium**
  (the other model from the builder). Pick the model once per conversation; auto mode on; `/goal …`.
  Why: [finish-plan.md](finish-plan.md) section 8.2.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **The forward plan is [finish-plan.md](finish-plan.md)** (approved 2026-09-28 with every default; decisions F1–F10 in its section 11). It replaces the order in G2-plan.md; take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md` (auto-loaded), `docs/state/current.md` (short status), this file, and the [finish-plan.md](finish-plan.md) sections the goal names. Open `docs/state/decision-register.md` only for the rows the goal names.
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`. In Git Bash call `pnpm.cmd`: a bare `pnpm` resolves to the global npm shim first (it warns that the `pnpm` field is ignored).
- Docker Desktop must be running for SQL work, and for one Python guard (`tests/integration/db`).
- **Baseline (2026-09-29, at A2 database-half close):**
  - `pnpm typecheck` clean; `pnpm verify` green (see current.md); port integrity OK, 54 files; G0 validator 1201 checks, 0 failures;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 825 cases/reset, 2 resets (`python scripts/test-db-security.py`);
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 89 passed / 1 failed / 30 skipped. The one failure is OFFLINE-01 on WebKit (Playwright's WebKit cannot reload offline with a service worker); desktop and phone pass.
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — A2 app half (MP-09 c2): payment methods, QR and shop texts on screen

The database half landed 2026-09-29 (migration `20260101003400_payment_methods_shop_texts.sql`; see
[current state](current.md)). This goal is everything the customer and the owner can see. D3 (the early production
project) is skipped unless Ethan confirms the pilot gate passes.

**Read first:** finish-plan.md A2 row and section 4 finding 16; `docs/state/protected-exception.md` (the guarded-edit
pattern of c and c1c, and the MP-10 checkout/shop-text approval); the engine's `PAY_ACCOUNTS` (line ~141),
`replaceFlavours` (~162), the checkout `methods`/`qr` view values (~4004) and `RES` (~139); `src/lib/data/flavours.ts`
(`enginePath`); `src/components/live/live-form-host.tsx`; the footer in `src/components/screens/shop.tsx` (~157–165).

**Traps already found (check each before writing):**

1. **`RES` breaks absolute URLs** (`'/' + path`), and only the QR uses it; flavour thumbs use a bare `url(img)`.
   Pick one and record it: a `replacePayAccounts(list)` block like `replaceFlavours` plus a live-only rebuild of the
   checkout `qr` style in `OpsRuntime.renderVals()`, or widening `RES` (a second protected edit). A method with no QR
   (cash, bank transfer) must render no QR: today `RES('')` gives `url(/)`.
2. **`enginePath` strips one leading `/`**, so `assets/x.png` (a bundled file) and `flavours/x.png` (a bucket path)
   look alike. Write one resolver (stored path to display URL: `assets/…` stays page-relative, anything else becomes
   `<supabase origin>/storage/v1/object/public/shop-media/<path>`), run before that strip, for flavours and QR, with
   tests for both kinds. Refuse `..` and a leading `/`. Uploads get generated names (uuid + extension); the DB
   already enforces `qr/<name>` for QR and `save_flavour` already accepts `flavours/<name>`.
3. **Checkout is anonymous.** Read `get_shop_payment_info()` (anon EXECUTE). An empty or failed load must show no
   methods and no QR, never the ported `PAY_ACCOUNTS` or the placeholder images; unit-test that.
4. **Footer (finding 16):** in live mode show the badge, TIN, invoice and allergen lines only when the owner has
   typed them; nothing otherwise. One `bareFrame`-style guarded edit in `shop.tsx`, demo byte-identical; register
   exact reversals in `scripts/validate-g0.py` (`FLAVOUR_REVERSALS`, like c1c) and update `port-baseline.json` via
   `--update` and `port-structure-baseline.json` via `node scripts/port-structure.mjs --write-baseline` in the same
   commit. The order status page and order detail still print "Invoice INV-…": leave that to F10, and say so.
5. **CSP `img-src`:** `scripts/pages-spike-headers.mjs` line ~127 has none, so it falls back to `default-src 'self'`.
   Add `img-src 'self' <supabase origin>` (only `'self'` when the URL is unset) and update the strings asserted in
   `tests/unit/pages-spike.test.ts`, `scripts/test-pages-spike.mjs`, `scripts/test-workers-web-spike.mjs` and
   `scripts/test-hosted-preview.mjs`.
6. **Owner forms** plug into the existing `LiveFormHost` (no further protected markup): a methods list/editor, QR and
   flavour-photo upload (`supabase.storage.from('shop-media').upload`, generated name, png/jpeg/webp, under 2 MiB,
   client-checked before sending) and the four texts. Owner-only, live-only; every save through the RPCs, with the
   conflict/refusal/offline classification `FlavourSync.saveWhole` uses.
7. **Bookkeeping:** `tests/fixtures/function-authority.json` and the security-dir count are already updated for the
   four functions; a new migration needs its pin in `tests/fixtures/mp08g-source-pins.json` and a manifest row.
   Revert `docs/state/evidence/g0-validation.json` after the validator. Watch for CRLF churn.
8. **Never commit** her real numbers or QR images; she enters them at runtime.

**D2 carry-over (do only if it stays under ~400 changed lines):** build the close's `cashCents`/`floatCents` only from
rows the server acknowledged ([current state](current-history.md) D2, "Recorded, not fixed" 1).

```text
/goal A2 app half (docs/state/finish-plan.md slice A2, docs/state/next-goal.md): payment methods, QR, photos and shop
texts on screen in live mode. Engine PAY_ACCOUNTS exception (approved): a guarded edit recorded in
docs/state/protected-exception.md with exact reversals in scripts/validate-g0.py and the port baselines regenerated in
the same commit; one resolver from stored bucket path to display URL for flavours and QR; live checkout reads
get_shop_payment_info() and shows no method and no QR when it is empty or fails (never the ported accounts); footer
lines from the owner's shop texts, nothing when empty (finding 16, D4 guarded edit); CSP img-src gains the Supabase
origin; owner forms in LiveFormHost for methods, QR and photo upload, and the four texts. Existing tokens only. Unit
tests for the new client code with a mutation check per rule. All exit 0 in this session: the pre-commit pnpm verify,
the Python guards, the G0 validator (revert evidence/*.json churn), the SQL role suite if SQL changes, port integrity,
pnpm test:e2e. Opus review (model opus) of the two protected edits and the upload path before commit. Committed and
pushed; current.md checkpoint and task-status updated; this block replaced by the next slice from finish-plan
section 6 (B1). No deploy. Stop after 2 failed fix attempts or 25 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **Remaining slices: [finish-plan.md](finish-plan.md) section 6.** The approved order after D2 is [D3 if
   the pilot gate passes by 20 Oct] → A2 → B1–B4 → A3–A4 → C1–C2 → E1 → F1–F4. Each next block is written from there when the previous one lands. Carry-overs:
   - Rate limiting for anonymous checkout: key on phone number plus the weekly cap, never the client IP (the gateway's forwarded-IP header is caller-controlled; finish-plan section 10).
   - Add the Supabase origin to `img-src` when owner-uploaded images (A2: QR codes, flavour photos) are first displayed.
3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
