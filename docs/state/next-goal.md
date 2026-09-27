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
- **Baseline (2026-09-28; `pnpm verify`, the SQL role suite and the Python guards re-run at MP-09 b2 close, the rest unchanged since the static-header goal):**
  - `pnpm verify` 39 files / 599 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 506 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — MP-09 b3: preferences and half steps on the database (G2 slice 4, remainder)

Drafted 2026-09-28 by the session that closed b2. What b2 could not do without a migration (see
[current state](current.md)): `save_setting` has a fixed 24-key table and only `int`/`cents`/`text`
columns, so `channels` (an object of booleans), `categories` and `inactiveCats` (text arrays) cannot be
saved, and `taxRate`/`cogsMultiple` lost their 0.5 step. Cine's 2026-09-28 answers add one more owner setting here:
a switch that lets helpers see bazaar sale totals (default off; the engine's `showEventMoney` view-model flag,
set in `OpsRuntime`, with its own locked-UI exception). Read the b2 code first
(`src/lib/data/settings.ts`, `src/lib/data/settings-sync.ts`, `OpsRuntime.captureSettingsActions`) and
reuse it; do not build a second sync.

```text
/goal MP-09 b3 (docs/state/current.md, MP-09 b2 "Not done"): a new migration, never an edit to
20260101002800, that lets the owner save (1) notification channels, expense categories and inactive
categories, and (2) taxRate and cogsMultiple in 0.5 steps, and (3) an owner switch letting helpers see bazaar sale totals
(default off). Decide the storage in the plan and say why:
e.g. a jsonb column or a separate owner-only table for the three lists (validated: known channel names
only, bounded list length and text length, no duplicates), and tenths in int_value or a numeric column for
the two half-step keys (settings_effective(), get_settings() and the parity fixture updated together).
Same RPC rules as b1: SECURITY DEFINER, search_path '', owner check first, expected_updated_at conflict
check, explicit grants, SQL role-suite cases per actor. Helpers/support must not read the lists unless a
screen they use needs them (check first). App: extend src/lib/data/settings.ts and SettingsSync; capture
the engine's addCategory/renameCategory/toggleCategory and OpsRuntime.toggleChannel (added 2026-09-28;
the engine never defined it). renameCategory also rewrites ledger
categories, which stay local until MP-15: say so, do not save the ledger. Restore the 0.5 step on the live
rules rows and remove that part of the b2 locked-UI exception record. Unit tests for each list round-trip
and a half-step save. All exit 0 in this session: pnpm verify, the SQL role suite, the Python guards, the
G0 validator (revert evidence/*.json churn). Independent different-model review (SQL + money). Committed
and pushed; status updated; block removed. No deploy. Stop after 2 failed fix attempts or 20 turns.
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
