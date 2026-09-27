# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **G2 has started:** the order, principles and slices are in [G2-plan.md](G2-plan.md); take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file, `docs/state/G2-plan.md` and `docs/state/decision-register.md` (the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.
- **Baseline (2026-09-27; `pnpm verify` re-run at MP-09 a close, the rest unchanged since the static-header goal):**
  - `pnpm verify` 36 files / 528 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 474 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — MP-09 b1: settings on the database, database half (G2 slice 3)

SQL and auth: plan on Opus, build on Sonnet, one independent review by a different model. Needs Docker Desktop running.

```text
/goal MP-09 b1 (docs/state/G2-plan.md "Slice audit", MP-09 b): one new migration adds owner-only
get_settings() and save_setting(key, value, expected_updated_at), plus get_operating_settings() for any
active staff returning only capacity, the ordering-window fields, maxPerOrder and idle minutes; all
SECURITY DEFINER, search_path = '', active-role check inside, explicit grants. It adds idleMinutesOwner,
idleMinutesSupport and idleMinutesHelper (60/60/240, range 15-480) to settings_effective(); validates every
key (numeric ranges, the priceMode and retention enums, day/hour/minute bounds) with bounds taken from the
engine's bumpCfg/numCfg calls and DEFAULT_CFG, recorded once in a fixture that a unit parity test checks
against the engine; rejects unknown keys and a stale expected_updated_at; revokes direct insert, update and
delete on public.settings from anon and authenticated. Money in centavos via src/lib/money.ts. The SQL role
suite proves: anon, helper, support and an inactive owner are denied get_settings/save_setting; the staff
projection holds no cost key; unknown-key, out-of-range and stale-version saves fail; direct table writes
fail. tests/integration/security/settings.sql and tests/fixtures/function-authority.json updated in the same
commit; pnpm db:types regenerated. All exit 0 in this session: pnpm verify; the SQL role suite on 2 resets;
the Python guards. One independent different-model review of the migration, findings fixed. Hosted preview
not updated. Committed and pushed; status updated; block removed. No deploy. Stop after 2 failed fix
attempts or 20 turns.
```

## After these goals

1. **Hosted preview: live (2026-09-27, see [current state](current.md)).** The route/CSP/cache oracle, anonymous RLS/RPC probes, `connect-src` proof, default-privilege probe and catalog RLS guard pass on the hosted project. Still open:
   - the direct-parent refresh probe and the `auth.sessions` checks, with a test account Ethan creates and signs in with himself;
   - move the local stack to Postgres 17 and revoke the PG17 MAINTAIN privilege from API roles in a reviewed migration.
2. **G2 (MP-09 → MP-17): started 2026-09-27**, see [G2-plan.md](G2-plan.md). Further goal blocks are written from that plan as each one finishes. Carry-overs:
   - Prove a trustworthy rate-limit caller key before anonymous checkout relies on `consume_rate_limit`.
   - Add the Supabase origin to `img-src` only when payment-proof images are displayed.
3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
