# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.

- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. G1 goals and the hosted preview are done (see [current state](current.md)). **G2 has started:** the order, principles and slices are in [G2-plan.md](G2-plan.md); take the top goal below.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file, `docs/state/G2-plan.md` and `docs/state/decision-register.md` (DP-15 and the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.
- **Baseline (2026-09-27, static-header goal accepted):**
  - `pnpm verify` 32 files / 440 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`; SQL role suite 474 cases/reset, 2 resets;
  - `pnpm build:pages:spike`/`test:pages:spike`/`test:workers:spike` pass with or without `NEXT_PUBLIC_SUPABASE_URL`/`…PUBLISHABLE_KEY` (local stack values: `supabase status -o env`);
  - `pnpm build` passes, and `pnpm test:e2e` gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Next goal — close MP-08: idle sign-out defaults (G2 slice 1)

```text
/goal Close MP-08 (docs/state/G2-plan.md, slice 1): src/lib/auth/idle-signout.ts signs owner and support out
after 60 idle minutes and helpers after 240, with no "pending DP-15" left in code or docs. DP-15 is recorded
as decided in docs/state/decision-register.md (Ethan 2026-09-27: audit B10 defaults, owner-editable later in
MP-09 b). Unit tests assert each role's minutes. pnpm verify exits 0 in this session. Committed and pushed;
docs/state/current.md and MP-08 in docs/state/task-status.json updated; this block removed. No deploy.
Stop after 2 failed fix attempts or 20 turns.
```

## Then — MP-09 a: live data boundary (G2 slice 2)

```text
/goal MP-09 a (docs/state/G2-plan.md principle 3): in live mode (NEXT_PUBLIC_APP_MODE=live) the engine
starts with empty private domains (orders, ledger, inventory, batches, sales, payments, queue archive,
variances, spoilage, count log) instead of the demo books; those domains are neither restored from nor
written to localStorage; signing out clears any private state left on the device; the IndexedDB offline
sale queue is untouched. Demo mode is unchanged. Unit tests cover all four points. All of these exit 0 in
this session: pnpm verify; pnpm build:pages:spike, pnpm test:pages:spike and pnpm test:workers:spike with
NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY unset. pnpm test:e2e passes except the
three known OFFLINE-01 tests. No protected file edited. Committed and pushed; status updated; block
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
