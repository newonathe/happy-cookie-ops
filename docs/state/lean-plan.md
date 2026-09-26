# Lean plan — finish Happy Cookie Ops without the ceremony (2026-09-26, Claude)

Status: **proposed; four decisions pending from Ethan** (see "Decisions"). Once approved, this file replaces the process rules in `agent-orchestration.md` and the per-slice ceremony described in `G1-plan.md`. It does not change the product scope, locked UI/UX, hard invariants or owner decisions in `MASTER-PLAN.md`.

## Why it is slow (measured 2026-09-26)

| Cause | Evidence |
|---|---|
| Custom BFF data plane | `docs/master-plan/04-architecture.md` routes every staff call through Cloudflare Functions ("Browser code calls the BFF"). The auth plumbing alone took 16 MP-08 micro-slices, 3 extra migrations, a cleanup Worker and encrypted token envelopes. Every future business operation would need another endpoint under a 10 ms CPU cap. |
| Token spend | The Codex G1 goal used **15.5M tokens over about 15 h** (`~/.codex/goals_1.sqlite`). It is `usage_limited`, and G1 is still open. |
| Ceremony per micro-slice | 35 plan docs; 924 evidence files (17 MB); a hand-maintained 939-entry hash index that no script reads; two consecutive fresh Docker fixture passes; independent review; four state docs updated per slice. |
| No commits | 4 commits total, about 1,000 uncommitted files, no remote. Git could be the audit trail, but it is not used. |
| Agent overhead | Codex defaults to `gpt-6-sol` at **xhigh** for everything, with 70 plugins enabled. Dual-provider coordination rules run to 117 lines and are rewritten by both agents. Claude sessions started outside the repo root, so the project hooks and agents never loaded. |
| Real blocker | G2 (orders, money, stock) is blocked on Cine's answers, not on code. |

## What stays (quality floor)

- Locked UI/UX, protected paths, `pnpm verify` before every commit.
- The ten hard invariants in `MASTER-PLAN.md`.
- The database as the security boundary: RLS, `SECURITY DEFINER` RPCs with in-function role checks, and the SQL role suite. That suite already runs as `authenticated` users with JWT claims.
- The strict hash-based CSP from MP-04d.
- Owner decisions only through the decision register.
- No spend, and no deploy without Ethan's approval.
- Privacy law: the Philippine Data Privacy Act (RA 10173).
  - Existing controls: 1-year retention and erasure.
  - Registration: NPC registration is likely **not** mandatory. That duty covers 250+ employees, sensitive personal information of 1,000+ people, or high-risk processing; names and phones are not sensitive. [NPC Circular 2022-04](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04-1.pdf)
  - Still needed: a privacy notice on the shop. That is a locked-UI change, so it needs Ethan's exception.

## Decisions (Ethan)

1. **Architecture.**
   - **A. Direct Supabase + RLS (recommended).**
     - How it works: the static export on Cloudflare Workers static assets talks straight to Supabase with `supabase-js`, and the database enforces authorization. No Functions, CPU cap, cleanup cron or DP-14 spike.
     - It fits the existing code: the domain RPCs are already granted to `authenticated` (`update_order_state`, `sync_event_sale`, `lookup_order`…), and no UI code calls the BFF.
     - Trade-off: the refresh token is readable by page scripts, so XSS means account takeover. The strict CSP and the absence of third-party scripts reduce that risk.
     - Idle timeout: client-side only. Supabase's server-side inactivity timeout is Pro-only ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)).
   - **B. Thin pass-through.** One allowlisted `/api/v1/rpc/<name>` route forwards the user's JWT. It keeps server-side token custody and avoids per-operation endpoints, but still needs hosted Functions, the cleanup cron and CPU proof.
   - **C. Current full BFF.** Everything stays, and each business operation needs its own endpoint.
   - Under A or B, the BFF code is **archived, not deleted**. Its migrations stay (they are protected and service_role-only).
2. **Standing approval to commit, and push to the private branch.** A secret scan runs first. No merge to `main` and no deploy.
3. **Codex global config** (it affects every project):
   - Default effort `xhigh` → `high`, with `xhigh` kept in a planning profile.
   - Disable the plugins this project doesn't use (70 → about 5).
4. **codebase-memory-mcp.**
   - Download: `codebase-memory-mcp-windows-amd64.zip` (v0.11.0, 39.9 MB, sha256 `6eb6beaf261b19e419766e78baf93cbc3cf1c6338cff8fb7c0234859f96d1685`), from [the GitHub release](https://github.com/DeusData/codebase-memory-mcp). MIT licence, local-only, no telemetry.
   - Setup: clone the source for reference, verify the checksum, and register by hand in the project `.mcp.json` and in Codex `[mcp_servers]` instead of letting `install.ps1` edit global configs.
   - Its 17 tool descriptions cost context too. It saves tokens only when used instead of reading files.

## Process rules after approval (both agents)

1. **One `/goal` per package**, not per micro-slice. Each package gets one plan of at most one page. `current.md` gets a status line and `task-status.json` a status entry.
2. **Evidence = git.** Commit each accepted slice with the check results in the message.
   - Freeze `G1-evidence-index.json` and the existing receipts as history, and stop hand-hashing.
   - Keep one receipt per package only for things git can't show: hosted, device and owner evidence.
3. **Checks:**
   - `pnpm verify` on every commit.
   - The SQL role suite when migrations change.
   - E2E when closing a gate.
   - One Docker fixture pass, repeated only when infrastructure is flaky.
4. **Review:** diffs touching auth, RLS, SQL, money or offline get one independent review, from the other provider or a different model. Other diffs get none.
5. **Ownership:** one writer per file. Whichever agent is available owns every lane; there are no hand-off queues.

## Token rules (both agents)

- Start a **new conversation per package goal**, in the repo root. Never carry one conversation across packages.
- **Plan** with Claude Opus or Codex `gpt-6-sol` high; use `xhigh` only for architecture.
- **Build** with Claude Sonnet or Codex `gpt-6-luna` medium. **Search** with Claude Haiku (`Explore`).
- Pin every subagent's model.
- Ask codebase-memory-mcp (`search_graph`, `get_code_snippet`, `trace_path`) before reading whole files. Read `current.md` plus the package plan, nothing else.
- Turn off unused claude.ai connectors and Codex plugins for coding sessions.
- Don't re-audit. Trust git and tests.

## Goal prompt template (same text works in Claude Code and Codex)

```text
/goal <MP-XX> is complete: <3–5 acceptance bullets from tasks.json> — verified in this session by
`pnpm verify` exit 0 and <package check command> — each accepted slice committed with its check results;
no edits to protected paths (AGENTS.md); owner-rule questions go to docs/state/decision-register.md instead
of being guessed. Stop and report if blocked by an owner decision, if a check still fails after 2 fix
attempts, or after 40 turns.
```

## Path to "fully functional" (if decision 1 = A)

1. **Now:**
   - Secret scan, then commit the baseline.
   - Set up codebase-memory-mcp.
   - Trim governance to these rules.
2. **Close G1:**
   - MP-06: a 28th migration for default-privilege hardening (from MP-06m).
   - MP-07/08: real sign-in with `supabase-js`, and role bootstrap through RLS.
   - A client-side idle sign-out.
   - Five staff accounts provisioned by the documented manual procedure, with signup disabled.
   - MP-04: one hosted preview on Workers static assets with a synthetic Supabase project, after Ethan approves.
3. **G2 (MP-09–17):** starts as soon as Cine answers the ★ questions in the [owner packet](owner-decision-packet.md). That is the critical path, so share the page now.
4. **G3–G5:** offline bazaar sales, then backups/privacy/UAT, then launch, each as one goal per package.
