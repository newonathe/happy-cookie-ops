# Next goal — shared by Claude Code and Codex

Paste the goal block into a **new conversation started in the repo root**.
- **Claude Code:** Opus or Sonnet, auto mode on, `/goal …`.
- **Codex:** the default profile (`gpt-6-sol` high), `/goal …`.

When a goal finishes, the agent replaces this file with the next package's goal and commits it. Rules: [lean plan](lean-plan.md). Architecture A: direct `supabase-js`, with RLS as the boundary.

## Before starting (once per conversation)

- Read only `AGENTS.md`, `docs/state/current.md`, this file and `docs/state/decision-register.md` (DP-15 and the architecture-A rows).
- Use codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`) to locate code instead of reading whole files.
- If the index is stale, re-index first: `index_repository` with repo path `C:/Users/ethan/dev/happy-cookie-ops-g0`.
- Pinned toolchain: prefix PATH with `C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64`.
- Docker Desktop must be running for SQL work.

## Goal G1-close (MP-06, MP-07, MP-08, MP-04 under architecture A)

```text
/goal G1 is closed locally under architecture A. Each item is proven by command output in this session:
(1) MP-06: a new 28th migration revokes the postgres public-schema function EXECUTE default from anon/authenticated
    and keeps explicit grants for every intended function. The SQL role suite and the function-authority manifest
    check pass on a fresh 28-migration reset, and the MP-06m probe records public_global_only fixed.
(2) MP-07/MP-08: /sign-in uses supabase-js; after sign-in the app loads the signed-in profile and role from Supabase
    through RLS and routes by role. The production build has no owner/demo bootstrap (demo data only when a demo
    flag is set). An expired or revoked session signs out and fails closed. There is a client-side idle sign-out
    with per-role minutes in one constant, marked "pending DP-15". Helper/support restrictions hold on refresh
    (SQL role suite).
(3) MP-08: docs/RUNBOOK-accounts.md gives the manual owner-assisted provisioning and recovery steps for 5 staff
    accounts (signup disabled), rehearsed once on the local Supabase stack.
(4) MP-04: the static-header generator emits form-action 'self' and connect-src 'self' plus the Supabase origin from
    the build env. pnpm build:pages:spike, pnpm test:pages:spike and pnpm test:workers:spike pass.
Also: pnpm verify exits 0 on every commit; each accepted item is committed and pushed to the current branch;
the port-integrity baseline is unchanged; no protected path is edited (AGENTS.md); the archived BFF code is not
extended. Do not deploy or create hosted resources. Business-rule questions go to docs/state/decision-register.md
and are not guessed. When done, update docs/state/current.md, task-status.json and this file with the next goal.
Stop and report if blocked by an owner decision, if a check still fails after 2 fix attempts, or after 40 turns.
```

## After this goal

1. **Ethan approves the hosted preview:** deploy the static export to Workers static assets with a synthetic Supabase project, then run the MP-04d oracle on the hosted URL.
2. **G2 (MP-09 → MP-17):** starts once Cine answers the ★ questions in the [owner packet](owner-decision-packet.md). Write one goal per package, taking each package's acceptance from `docs/master-plan/tasks.json`.
