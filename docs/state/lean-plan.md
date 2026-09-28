# Lean plan — finish Happy Cookie Ops without the ceremony (2026-09-26, Claude)

> **2026-09-28:** the process rules below still apply. Model/effort choices, token rules, anti-hallucination
> rules and the remaining roadmap are refreshed in [finish-plan.md](finish-plan.md) sections 6–8; its roadmap
> replaces "Path to fully functional" below once F1 is approved.

Status: **approved by Ethan on 2026-09-26.** All four decisions took the recommended option: A, commit + push, Codex config, codebase-memory-mcp. This file now **replaces** the process rules in `agent-orchestration.md` and the per-slice ceremony in `G1-plan.md`. It does not change the product scope, the locked UI/UX, the hard invariants or the owner decisions in `MASTER-PLAN.md`. The two master-plan acceptance lines that option A changes are amended in the [decision register](decision-register.md). The next goal to run is in [next-goal.md](next-goal.md).

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

## Decisions (Ethan, 2026-09-26: all approved as recommended — A, commit + push, Codex config, codebase-memory-mcp)

Done the same day:
- Baseline commit `6f334c1` pushed to the private branch.
- Codex default effort is `high`, with 11 of 70 plugins enabled. The backup is `~/.codex/config.toml.bak-20260926`.
- codebase-memory-mcp v0.11.0: checksum verified, repo indexed (3,996 nodes), registered in `.mcp.json` and in Codex `[mcp_servers]`.

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

## Second-pass hardening (2026-09-26, Socratic re-check)

Each assumption behind architecture A and the goals was re-checked against the files or official docs:

| Question | Answer and evidence | Action |
|---|---|---|
| Does revoking a staff member work without a server? | Yes. `current_role_name()` returns a role only when `profiles.active is true` (migration 0011), so RLS drops access immediately even while a login token is still valid. | None |
| Is the browser → Supabase path already tested? | Yes. The 474-case role suite runs as `authenticated` with JWT claims. Domain RPCs are granted to `authenticated`, and `consume_rate_limit` is service_role-only (revoked in 0008). | None |
| Will Goal 1's revoke work? | Only in combination. Supabase's own fix proposal ([PR #50865](https://github.com/supabase/supabase/pull/50865), draft) uses the global revoke alone, but MP-06m proved the public-schema default still grants anon/authenticated. | Goal 1 runs both statements |
| Does adding migration 28 break anything? | Yes: 7 hardcoded "27" expectations across 5 scripts and 1 unit test, plus a 474-case count. | Listed in Goal 1 |
| Which key name does Supabase use? | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with `createBrowserClient` ([Supabase Next.js](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)). The legacy name is used in 5 files. | Rename everywhere (Goal 2) |
| Does "no demo bootstrap" break tests? | Only if it is the default. | `NEXT_PUBLIC_APP_MODE` defaults to demo; the export build sets live |
| Can idle sign-out lose sales? | It could clear the offline queue. | Goal 2 forbids that (invariant 2) |
| Are static requests on Workers free? | "Free and unlimited" ([Cloudflare](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). | DP-14 confirmed |
| Can Supabase Free go offline? | It pauses after about 7 days of low activity; keep-alive API calls are allowed; there are no automatic backups ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backups](https://supabase.com/docs/guides/platform/backups)). | G4: keep-alive and a weekly encrypted dump |
| Can password reset rely on email? | No. Recovery is owner-assisted through the dashboard (master plan). | Runbook in Goal 2 |
| Is it production-dependency clean? | `pnpm audit --prod` finds none on the branch. Dev tooling has 14 (6 high). | G4 dev-dependency pass |
| Is CI a gate? | CI runs only on `main` and PRs. It adds `format:check`, the build, E2E, visual and performance checks; `format:check` and E2E are known red. | Must be green before any merge to `main` |
| Does Codex load the project config? | Only for trusted projects. Only the parent `c:\users\ethan` is trusted; that it covers the repo is unconfirmed. Project MCP servers are unreliable ([#13025](https://github.com/openai/codex/issues/13025)), so the server stays global. | Run `/status` in the first Codex session |
| Are the Python guards green? | 63/63 OK before Goal 1. | Baseline recorded in next-goal |
| Are all tables and views safe to expose? | All 19 public tables enable RLS, and the API exposes only `public` (`supabase/config.toml`). The two definer views, `shop_products` and `shop_drops`, have exact column allowlists (`public-catalog.sql`). **Nothing guards future tables**, so a new table without RLS would be exposed. | Goal 1 adds a catalog-wide guard |
| Could idle sign-out log the owner out elsewhere? | Yes: `signOut()` defaults to `'global'` ([Supabase](https://supabase.com/docs/reference/javascript/auth-signout)). Access tokens also stay valid until expiry. | Goal 2 uses `scope: 'local'`; runbook sets a 30-minute JWT expiry |

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
