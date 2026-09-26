# Next goal — shared by Claude Code and Codex

Paste **one** goal block into a **new conversation started in the repo root**.
- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent deletes its block here, leaves the next one on top, and commits. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary. Goals 1 and 3 are independent; Goal 2 can run before or after 3.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file and `docs/state/decision-register.md` (DP-15 and the architecture-A rows).
- Locate code with codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`), not by reading whole files. Read SQL migrations directly.
- If files changed since the last index, re-index first: `index_repository`, repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.
- **Baseline (2026-09-26, commit `c844ff2`):**
  - `pnpm verify` 28 files / 410 tests;
  - Python guards 63 OK, via `python -m unittest discover -s <dir> -p "test_*.py"` for each of `tests/unit`, `tests/integration/auth`, `tests/integration/db` and `tests/integration/security`, with `G0_PYTHON_LIBS=C:\Users\ethan\dev\happy-cookie-tools\python-libs-314`;
  - `pnpm audit --prod` clean;
  - `pnpm build` passes, and `pnpm test:e2e` re-run on 2026-09-26 gives 87 passed / 3 failed / 30 skipped. The 3 failures are the same known OFFLINE-01 durable-queue test on phone, WebKit and desktop (G3).
- **Codex only:** run `/status` once in the repo root to confirm the project `.codex/config.toml` loaded. Accept the trust prompt if asked. The project sandbox has no network, so `git push` will ask for approval.

## Goal 1 of 3 — MP-06 default-privilege hardening (run first)

```text
/goal MP-06 default-privilege hardening is done. First read docs/state/next-goal.md "Before starting" and follow it (pinned PATH, Docker running, codebase-memory-mcp; if its tools are missing, use Grep/Read). Proven by command output in this session:
- New migration supabase/migrations/20260101002700_function_default_privileges.sql (existing migrations untouched) runs BOTH
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;  and
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
  (global alone is insufficient: MP-06m proved the public-schema default still grants anon/authenticated). Existing function grants are unchanged; tests/fixtures/function-authority.json still matches (checked inside scripts/test-db-security.py).
- Migration 28 is added to tests/fixtures/mp08g-source-pins.json, and every hardcoded 27-migration expectation derives from that pin file instead: scripts/test-auth-fixture.py L103, scripts/test-db-bootstrap.py L97, scripts/test-cleanup-recovery-rpcs.py L131, scripts/test-pages-provider-fixture.py L187, scripts/test-session-repository.py L691, tests/unit/test_auth_fixture.py L62-64.
- tests/integration/security/future-function-defaults.sql and scripts/probe-future-function-defaults.py expect the new state: a post-change public function is NOT executable by anon/authenticated/PUBLIC, and service_role behaviour is recorded. python scripts/probe-future-function-defaults.py passes with two identical 28-migration resets and cleanup passed.
- A catalog-wide guard in the SQL role suite passes: every public table (relkind r/p) has relrowsecurity=true; the only public views are shop_products and shop_drops (column allowlists stay as tested in public-catalog.sql); no API role has any privilege in hco_private. A deliberate table without RLS makes the guard fail (show it once, then roll back).
- python scripts/test-db-security.py passes on a fresh reset (474 cases plus the guard; any count change needs a stated reason). All 4 Python guard folders pass (python -m unittest discover -s <dir> -p "test_*.py" for tests/unit, tests/integration/auth, tests/integration/db, tests/integration/security, with G0_PYTHON_LIBS set). pnpm verify exits 0.
- The security-reviewer subagent, run on a different model from this session, reviews the migration, guard and probe diffs with no P0-P2 open.
- Committed (one logical change each, after a secret scan) and pushed to the current branch. Evidence files rewritten by the fixtures are committed as-is. The docs/state/current.md status line says MP-06 hardening is done locally, and the Goal 1 block is removed from docs/state/next-goal.md.
Do not start Goal 2. No protected-path edits, no hosted resources, no deploy, no merge to main. Stop and report if a check still fails after 2 fix attempts, or after 30 turns.
```

## Goal 2 of 3 — sign-in, role bootstrap, idle sign-out, accounts (MP-07/MP-08)

```text
/goal Staff sign-in works end to end under architecture A. Proven by command output in this session:
- One key name everywhere: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) replaces
  NEXT_PUBLIC_SUPABASE_ANON_KEY in src/lib/supabase/{client,server,config}.ts, src/middleware.ts and .env.example.
  No secret or service key is in any client module or the static export. If the Vercel demo sets the old name,
  note it for Ethan.
- A build flag NEXT_PUBLIC_APP_MODE (default "demo", so existing E2E/visual/unit tests keep their fixtures) is set
  to "live" only by the static-export build.
  In live mode: no owner/demo bootstrap; staff routes need a Supabase session (otherwise redirect to /sign-in);
  after sign-in the profile and role load from Supabase through RLS and routing follows the role. Live business
  data is G2 work, not this goal.
- /sign-in keeps its current markup and calls supabase-js signInWithPassword.
- An expired, revoked or deactivated (profiles.active=false) session signs out and fails closed.
- There is a client-side idle sign-out with per-role minutes in one constant, marked "pending DP-15". It and the
  normal sign-out use supabase.auth.signOut({ scope: 'local' }), because the default 'global' would sign the user
  out on every device. It never clears queued offline sales (MASTER-PLAN invariant 2).
- Helper/support restrictions hold on refresh (SQL role suite).
- docs/RUNBOOK-accounts.md covers:
  - owner-assisted provisioning of the 5 staff accounts, with signup disabled and profiles.role/active set;
  - password recovery through the Supabase dashboard (no email dependency);
  - Supabase, Cloudflare and GitHub account MFA with offline recovery codes;
  - Auth JWT expiry set to 1800 s (access tokens stay valid until expiry; RLS's profiles.active check covers
    deactivation).
  It is rehearsed once on the local Supabase stack.
- pnpm verify exits 0; pnpm test:e2e shows no new failures beyond the known 3 offline-queue failures; the
  port-integrity baseline is unchanged.
- One independent review (different model) of the auth diff, with no P0-P2 open. Each accepted slice is committed
  and pushed; status line updated; block removed.
The archived BFF is not extended. Business-rule questions go to docs/state/decision-register.md, not guesses.
Stop and report if blocked by an owner decision, if a check still fails after 2 fix attempts, or after 40 turns.
```

## Goal 3 of 3 — static headers for direct Supabase (MP-04 prerequisite)

```text
/goal The static-header generator (scripts/pages-spike-headers.mjs) emits form-action 'self' and a connect-src of
'self' plus the Supabase origin from NEXT_PUBLIC_SUPABASE_URL at build time ('self' only when unset; wss only if
Realtime is used; nothing broader). Tests assert both, and the generated CSP line stays within the checked
2000-character limit. pnpm build:pages:spike, pnpm test:pages:spike, pnpm test:workers:spike and pnpm verify all
exit 0 in this session. Committed and pushed; status line updated; block removed. No deploy. Stop after 2 failed
fix attempts or 20 turns.
```

## After these goals

1. **Ethan approves the hosted preview:** deploy the static export to Workers static assets (static requests are free and unlimited) with a synthetic Supabase project, then run the MP-04d oracle on the hosted URL. On that hosted project, also repeat:
   - the default-privilege probe and the catalog RLS guard (the MP-06m managed-creator rehearsal; this needs a hosted-capable variant, because the local harness refuses external URLs);
   - the direct-parent refresh probe;
   - the `auth.sessions` checks.
2. **G2 (MP-09 → MP-17):** starts once Cine answers the ★ questions in the [owner packet](owner-decision-packet.md). Write one goal per package, with acceptance taken from `docs/master-plan/tasks.json`. Carry-overs:
   - Prove a trustworthy rate-limit caller key before anonymous checkout relies on `consume_rate_limit`.
   - Add the Supabase origin to `img-src` only when payment-proof images are displayed.
3. **G4 (operations):**
   - Keep-alive: Supabase pauses Free projects after about 7 days of low activity; its docs allow keep-alive API calls.
   - Weekly encrypted `supabase db dump` (Free has no automatic backups; DP-10).
   - `prune_personal_data` set to the owner's 1 year.
   - Shop privacy notice (locked-UI exception).
   - Dev-dependency audit (14 findings, 6 high).
   - CI green on `main` (`format:check` and E2E are known red) before any merge.
