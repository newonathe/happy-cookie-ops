# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.
- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file and `docs/state/decision-register.md` (DP-15 and the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.

## Goal 1 of 3 — MP-06 default-privilege hardening (run first)

```text
/goal MP-06 default-privilege hardening is done. Proven by command output in this session:
- A new migration 20260101002700_* (existing migrations untouched) runs ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  (global and IN SCHEMA public) to REVOKE EXECUTE ON FUNCTIONS from PUBLIC, anon and authenticated, and keeps an
  explicit GRANT for every function that is meant to be callable. tests/fixtures/function-authority.json matches.
- tests/integration/security/future-function-defaults.sql and scripts/probe-future-function-defaults.py are updated
  to the new expected state (a post-change public function is NOT executable by anon/authenticated). The probe
  passes on two fresh 28-migration resets with cleanup passed.
- The SQL role suite (scripts/test-db-security.py) passes on a fresh reset, and pnpm verify exits 0.
- One independent review of the migration by a different model, with no P0-P2 open.
- Committed and pushed. docs/state/current.md status line updated, and this block removed from next-goal.md.
No other package, no protected-path edits, no deploy. Stop and report if a check still fails after 2 fix attempts,
or after 30 turns.
```

## Goal 2 of 3 — sign-in, role bootstrap, idle sign-out, accounts (MP-07/MP-08)

```text
/goal Staff sign-in works end to end under architecture A. Proven by command output in this session:
- The browser Supabase client uses the publishable key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, sb_publishable_…);
  the legacy anon-key path is removed from src/lib/supabase/client.ts and .env.example. No secret key in any
  client module or the static export.
- /sign-in keeps its locked markup and calls supabase-js signInWithPassword. After sign-in the app loads the
  signed-in profile and role from Supabase through RLS and routes by role. The production build has no owner/demo
  bootstrap (demo data only behind an explicit demo flag).
- An expired or revoked session signs out and fails closed. A client-side idle sign-out uses per-role minutes in
  one constant, marked "pending DP-15". Helper/support restrictions hold on refresh (SQL role suite).
- docs/RUNBOOK-accounts.md gives owner-assisted provisioning and recovery for 5 staff accounts (signup disabled),
  rehearsed once on the local Supabase stack.
- pnpm verify exits 0; the port-integrity baseline is unchanged. One independent review (different model) of the
  auth diff, with no P0-P2 open. Each accepted slice is committed and pushed; status line updated; block removed.
The archived BFF is not extended. Business-rule questions go to docs/state/decision-register.md, not guesses.
Stop and report if blocked by an owner decision, if a check still fails after 2 fix attempts, or after 40 turns.
```

## Goal 3 of 3 — static headers for direct Supabase (MP-04 prerequisite)

```text
/goal The static-header generator (scripts/pages-spike-headers.mjs) emits form-action 'self' and a connect-src of
'self' plus the Supabase origin read from the build env (nothing broader; wss only if Realtime is used). The
generated CSP line stays within the checked 2000-character limit. pnpm build:pages:spike, pnpm test:pages:spike,
pnpm test:workers:spike and pnpm verify all exit 0 in this session. Committed and pushed; status line updated;
block removed. No deploy. Stop after 2 failed fix attempts or 20 turns.
```

## After these goals

1. **Ethan approves the hosted preview:** deploy the static export to Workers static assets with a synthetic Supabase project, then run the MP-04d oracle on the hosted URL.
2. **G2 (MP-09 → MP-17):** starts once Cine answers the ★ questions in the [owner packet](owner-decision-packet.md). Write one goal per package, with acceptance taken from `docs/master-plan/tasks.json`.
   - Before any anonymous checkout RPC relies on `consume_rate_limit`, prove where a trustworthy caller key comes from under direct PostgREST (see the decision register).
