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
- **Baseline (2026-09-27; `pnpm verify` re-run at MP-09 b1 close, the rest unchanged since the static-header goal):**
  - `pnpm verify` 37 files / 573 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 506 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — MP-09 b2: settings on the database, app half (G2 slice 4)

Drafted 2026-09-27 by the session that closed b1, from [G2-plan.md](G2-plan.md) "Slice audit" MP-09 b's b2
bullets — not re-audited against the code the way MP-09 a's and b1's blocks were, so read the engine's
Settings-screen action handlers and `src/store/ops-runtime.tsx` before starting and correct anything below
that the code contradicts. Runs on Sonnet; DP-15's locked-UI exception is already approved (decision
register, 2026-09-27) for the idle-minutes control specifically — any other new control needs its own
exception recorded in `protected-exception.md` first, not assumed.

```text
/goal MP-09 b2 (docs/state/G2-plan.md "Slice audit", MP-09 b b2): the Settings screen reads and writes the
database now, not just cfg in memory. On verified sign-in, OpsRuntime (subclass, never the protected
engine) loads get_settings() for the owner or get_operating_settings() for helper/support into state.cfg,
converting cents keys through src/lib/money.ts (centavosFromDb/centavosToPesos at the boundary); every
staff-safe key get_operating_settings() does not return (a helper/support session) keeps the engine's
DEFAULT_CFG default rather than showing stale or missing data. Saves: capture the existing settings
actions' base call (setCfg/bumpCfg/numCfg/setRetention/pickPriceMode+publishPriceMode; do not edit the
protected engine to add new ones) and call save_setting with the key's current updated_at as
expected_updated_at, debounced per key so a fast bumpCfg doesn't fire one request per tick; on a 'settings
save conflict' (P0002) reload from get_settings()/get_operating_settings() and toast that someone else
changed it; offline, revert the optimistic local change and toast that it did not save. Idle minutes:
src/lib/auth/idle-signout.ts reads idleMinutesOwner/Support/Helper from get_operating_settings() when
present, clamped 15-480, falling back to IDLE_MINUTES when absent (not yet saved, or offline). New
locked-UI-exception edit forms for the numeric/enum settings save_setting() already validates, and for
idle minutes specifically; record the exception in protected-exception.md and register it in
scripts/validate-g0.py like the live-frame one, in the same commit. channels/categories/inactiveCats
(currently local-only cfg) get their own save/load through save_setting the same way, closing the
"non-config preferences" gap MP-09's acceptance list names. Unit tests: a verified owner sign-in loads
real database values into cfg, converting money correctly; a helper/support sign-in loads the staff
projection and never shows a cost key; a debounced save coalesces rapid edits into one call; a conflict
reloads and toasts without losing unrelated in-flight edits; offline reverts and toasts; idle minutes
respect the database value when present and IDLE_MINUTES when absent, clamped 15-480 either way. All exit
0 in this session: pnpm verify; the SQL role suite unaffected (b1's fixture, no migration change expected
unless the code review finds save_setting itself needs one — say so and stop rather than improvising a new
migration under this goal). Hosted preview not updated. Committed and pushed; status updated; block
removed. No deploy. Stop after 2 failed fix attempts or 20 turns.
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
