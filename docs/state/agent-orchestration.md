# Shared Codex and Claude coordination policy

## Current rules — 2026-09-26 (these supersede everything below this section)

Ethan approved the [lean plan](lean-plan.md) on 2026-09-26. The next goal is in [next-goal.md](next-goal.md).

1. **Whichever agent is available does the work.** When both are, split by package, not by file type, with one writer per file. There are no hand-off queues.
2. **One `/goal` per package**, each in a fresh conversation started in the repo root.
3. **Models:**
   - Plan with Claude Opus or Codex `gpt-6-sol` high; use `codex --profile plan` (xhigh) only for architecture.
   - Build with Claude Sonnet or Codex `gpt-6-luna` medium (`codex --profile build`).
   - Search with Claude Haiku (`Explore`).
   - Pin every subagent. Use at most two active workers.
4. **Review:** diffs touching auth, RLS, SQL, money or offline get one independent review, from the other provider or a different model. When the other provider is out, a different-model review is enough, and nothing is queued. Other diffs get no review.
5. **Commits:** standing approval to commit each accepted slice and push the working branch, after a secret scan. Never merge to `main`, deploy or create hosted resources without asking Ethan.
6. **Context:** use codebase-memory-mcp before reading files. There is no paid/API fallback.

Availability on 2026-09-26: Codex is unavailable, so Claude is doing all of the work (Ethan: "treat it as you doing all of the work").

**Added 2026-10-05 (Ethan, [decision-register.md](decision-register.md), the replan):**

7. **Two tracks.** A database track (migrations, money, sign-in, offline) and an interface track may run side by side. Never two database slices at once. `src/store/ops-runtime.tsx` and `src/lib/types/database.ts` belong to the database track; an interface slice adds new files only, or queues its runtime change behind it.
8. **Unattended runs are allowed for interface-only slices and nothing else.** An unattended slice commits to its own worktree branch and never pushes to the working branch, because a green push there redeploys the trial. An attended session reviews and merges it. The automatic runner stays off.
9. **The hosted trial may be read, read-only:** settings, the migration list and the security advisor. No customer rows, no writes.
10. **Releases are held** from the day the phone rehearsal passes until 26 October (the switch is slice A3).

11. **Escalation (Ethan, 2026-10-08).** Escalate to a stronger model only when all three hold: two evidence-led attempts at the same problem failed; the cause is a reasoning or security-judgment limit, not a missing upstream fix, a denied permission, an owner decision, a broken tool or a quota or auth failure (report those and stop); and no deterministic tool (tests, grep, validators, `pnpm audit`) can settle it. Go one rung at a time: Sonnet high, then Opus high; Opus xhigh is architecture only and needs Ethan's approval. Before spawning, state what failed twice, why that rung and not the one below, and the stop condition. Pin every model and effort; at most two workers. Afterwards say whether it resolved the problem; if not, stop and report rather than climb. Do not spawn to look thorough.

Availability on 2026-10-05: Codex reached its usage limit during F2, and Ethan continued the same goal in Claude Code. Where a goal says "Codex Sol/high", read it as Claude Opus coordinating with at most two pinned Sonnet workers. Codex had coordinated F2 from 2026-10-03 to 2026-10-05.

## History — policy as of 2026-09-09 to 2026-09-26 (superseded)

The owner reauthorized Claude and asked for economical delegation across both subscriptions. This policy persisted through compaction and continuation, and supplemented MASTER-PLAN.md without activating the future automatic runner.

## Superseded availability — Codex only, 2026-09-24

Ethan reported on 2026-09-24 that the Claude subscription was no longer available. Do not launch Claude, use an API/billed fallback, or leave a mandatory review indefinitely assigned to Claude. Until Ethan changes this instruction, Codex owns new G1 implementation and governance updates. Use at most two active Codex workers including root, one writer per file, GPT-6 Luna/medium for bounded routine edits and GPT-6 Sol/high for security-sensitive code or independent review. Root reviews and integrates worker results. A separate Codex Sol/high read-only review replaces the unavailable Claude cross-review; it does not make its own code automatically acceptable. Keep the historical Claude records below as history, not current operating instructions. The prior owner approval boundary for commits, hosted changes and deployment remains in force.

## Allocation — 2026-09-24 (superseded by the current rules above)

Set by Ethan on 2026-09-24, with sources checked that day:

- OpenAI now recommends **GPT-6 Sol** for complex coding and agentic workflows and **GPT-6 Luna** for focused, repeatable tasks. GPT-5.6 Sol/Terra/Luna remain only during the rollout, and `gpt-5.5` retires on 2026-10-14. ([Codex models](https://learn.chatgpt.com/docs/models))
- In both tools a subagent without an explicit model **inherits the parent's model**. ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude subagents](https://code.claude.com/docs/en/sub-agents)) Unpinned Opus-inherited Explore agents exhausted Claude's weekly quota on 2026-09-24.

Everything else in this policy still holds: at most two active workers across both providers, one writer per file, explicit models, no paid/API fallback, and bounded prompt packets.

| Role                                                          | Claude                                                                                                                                                                                           | Codex                                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator: plan, decide, integrate, final review           | Opus 5.5                                                                                                                                                                                         | GPT-6 Astra if included in the plan, else GPT-6 Sol (xhigh)                                                                                                                |
| Hard or security worker: auth, RLS, money, offline, CSP       | Sonnet 5, high                                                                                                                                                                                   | GPT-6 Sol, high                                                                                                                                                            |
| Routine worker: mechanical edits, extraction, citation checks | Haiku 4.5 (read/extract), Sonnet 5 medium (edits)                                                                                                                                                | GPT-6 Luna, medium                                                                                                                                                         |
| Owns (sole writer)                                            | Governance and narrative in `docs/state/*`, decision register, owner packet/inputs, research/ADRs, `.claude`/`.codex`/`.agents` definitions, `.github/*`, env templates, `spikes/pages/_headers` | `src/**`, `spikes/pages/functions/**`, new `supabase/migrations/*`, `tests/**`, `scripts/**` fixtures, Docker/SQL runs, evidence receipts, `task-status.json` slice status |
| Reviews the other's work                                      | Codex diffs touching auth, RLS, SQL, money or offline (Sonnet high, then Opus sign-off)                                                                                                          | Claude config/code diffs (read-only `review` profile, Sol)                                                                                                                 |

- **Handoff:** through `docs/state` only (checkpoint template). When the reviewing side is out of quota, the review is **queued, not skipped**. Nothing is committed or merged without it and without Ethan's approval.
- **Pinned agent models:**
  - `.claude/agents/*.md`: port-auditor, test-author and security-reviewer on `sonnet` (security-reviewer moved from `opus` after the 2026-09-24 Codex review); Opus signs off. The project `Explore` override is on `haiku`.
  - `.codex/agents/*.toml`: `gpt-6-luna` medium and `gpt-6-sol` high.
  - Update this table and those files together when a model changes or retires.
- **Launch location:** start Claude Code and Codex in the repository root. Project hooks and agents do not load when a session starts in the parent folder (observed 2026-09-24).
- **Deterministic tools first:** hashes, grep, tests and validators before any model call.

## Allocation and models

Owner preference reaffirmed 2026-09-10: for MP-05.b and future goals, proactively pair Codex with useful, bounded Claude work where subscription availability and authorization permit. Optimize completed, independently verified work per unit of usage; quality remains the acceptance criterion. Use complementary ownership rather than duplicate implementation. Default to one Claude Sonnet/medium worker alongside root, retain the combined two-worker ceiling, and apply the documented fallback on quota/auth failures. This preference does not authorize bypassing permissions, paid usage, or automatic runner activation.

One worker is the default. At most two active workers across Codex and Claude combined, alongside root. Count a Claude coordinator and its child as two workers; do not run another Codex worker during that arrangement. Independent useful work must justify delegation; do not create agents merely to exercise both providers.

| Work                                                                  | Codex default                 | Claude default                                                                       |
| --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Narrow extraction, documentation, repeatable lookup                   | Luna / medium                 | Haiku, ordinary effort                                                               |
| Bounded implementation, test execution, diagnosis                     | Terra / medium                | Sonnet / medium                                                                      |
| Demonstrably difficult logic or security, money, auth, offline review | Sol / high                    | Sonnet / high first                                                                  |
| Unresolved cross-system decisions                                     | Root; Astra only where needed | Escalate after recording the unresolved issue and checking subscription availability |

Choose explicit models and supported effort; never inherit Astra into routine workers. No default Max/Ultra. Small tasks stay local when delegation costs more than doing them. Prefer deterministic tools for inventories, hashes, tests and transformations. These assignments are judgments, not guarantees of equivalent performance or exact subscription savings.

Codex workers receive fresh bounded context, not the full conversation. Check custom agent definitions because they may override spawn model settings. Reuse a worker for related follow-up when that saves context; close its responsibility when finished.

## Claude execution and optional children

Use the authenticated Claude Pro CLI, explicit model/effort, project settings, narrow tools, no unrelated MCP/browser access, and 200k context cap. Check auth/provider and names of billing/provider overrides before running; never print tokens. Stop on auth/quota failure. No API fallback, extra usage, purchases, resets, account switching or paid model upgrade.

For one assignment use a named worker directly (`--agent` with `--agents`) to avoid an unnecessary coordinator. A bounded one-shot subprocess is allowed, not a service or scheduler. Use a time limit and preserve partial results, exit status and permission denials. Configure documented `maxTurns` for children, usually 8–12 tool turns; this is not a token quota guarantee. Never silently retry incomplete work.

Claude may coordinate one named child only when root explicitly allocates both slots and the independent subtask. Restrict the main session's Agent tool to that named type, omit Agent from the child's tools, keep the child foreground and prohibit grandchildren. With a Codex worker active, Claude works directly without children. Codex workers also require explicit root allocation before delegating. The limit is global, not two per provider.

Record requested/resolved models where observable. CLI list-cost estimates are not proof of billing; API prices do not predict subscription consumption. This policy changes no global model settings.

## Required prompt packet

Every assignment states:

1. Exact root, master-plan task, deliverable and why it can run independently.
2. Minimal context files/evidence, settled decisions and the unresolved question.
3. Exclusive owned files/responsibility. Others are working here: do not revert their edits; accommodate changes.
4. Forbidden paths/actions, allowed tools, environment constraints and publication authority (normally none for workers).
5. Verification commands and acceptance criteria. Never weaken assertions or accept baselines merely to pass.
6. Stop boundary: one deliverable and usually at most two evidence-led debugging attempts; report the actual obstacle before escalation.
7. Concise report: changed files, commands/exits, proof, risks and partial/completed status. Findings require file/line or log references.

Use one writer per file/module. Keep edits small; review security and port fidelity where applicable. Do not repeat broad audits without a relevant change. Poll only when needed and preserve progress before handoff. Worker reports require assessment, not automatic approval.

## Current work

The G0 assignments are finished. Earlier Claude privacy review is reconciled by the reporting integration regression; its visual review's CI-image wording correction is in docs/TESTING.md. Do not repeat either review wholesale. Current G1 assignment/evidence authority: [G1 plan](G1-plan.md). Root owns integration, narrow plan changes and checkpoints. Workers do not publish or deploy.

## G1 persistence and fallback amendment — 2026-09-09

The latest owner message permits both providers again and requests economical subagents. This policy remains active across compaction; read it plus G1-plan.md when resuming. User-global Codex memory is not modified. The coordinator's current model is not changed by spawning cheaper workers; do not claim a root-model switch occurred. Keep root work focused on decisions and integration.

- Prefer one direct named Claude worker to an extra coordinator. Allocate both worker slots explicitly before allowing a Claude coordinator plus one child; no other worker then. No recursive or speculative spawning.
- Before each Claude run, inspect only sanitized auth/provider status and presence of billing/provider/model override variables. Require first-party subscription auth; deny API-key/gateway routes. Never output credentials or account contact details.
- Pin requested model/effort. Resolve observed model from run metadata and reject unexplained substitution. This installed CLI is 2.1.250: do not pass newer flags merely because current docs describe them. In particular, documented `--permission-prompts none` needs 2.1.259, and forced child-model environment behavior differs by version.
- `maxTurns` on the prior named top-level Claude review did NOT prove an 8-turn cap: its result recorded 13 turns. Treat prompt/tool-turn limits as requests unless enforcement is proven; a one-shot process timeout is the current hard wall-clock boundary. Record actual turns/output/cache usage. No claim of a hard token budget.
- Default bounded read-only review: Sonnet/medium, 180-second timeout, Read/Grep/Glob only, no Agent/Bash/Write/Edit/MCP/browser, compact final report. Security transaction reviews may use Sonnet/high or Sol/high with a clear risk/oracle; no automatic Astra/Opus/Fable/Max/Ultra upgrade.
- Auth/quota/unavailability: stop the Claude attempt, preserve sanitized failure and partial result, reconcile whether any write occurred, then reuse the compact packet with one appropriately capable Codex worker. Do not run both copies concurrently. Do not use an availability fallback to bypass a safety/permission refusal.
- A denied permission remains denied across providers. Resolve its authorization/safety issue first. If both providers lack subscription capacity, checkpoint and notify; no API billing, credit purchase/reset, account switching or background scheduler.
- Retry a transient transport failure at most once after evidence-based backoff; do not automatically retry quota/auth/config failures. User-requested stop/no-Claude takes immediate precedence.

Sources refreshed September 9: [Codex model guidance](https://learn.chatgpt.com/docs/models), [Codex agent precedence](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Claude headless controls](https://code.claude.com/docs/en/headless), [Claude child controls](https://code.claude.com/docs/en/sub-agents), [Claude model precedence](https://code.claude.com/docs/en/model-config). These support the mechanism; the concurrency/timeout/escalation choices above are project policy, not vendor guarantees.

## Research and limits

Reviewed 2026-09-09: [OpenAI subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [OpenAI models](https://learn.chatgpt.com/docs/models), [Claude subagents](https://code.claude.com/docs/en/subagents), [Claude model configuration](https://code.claude.com/docs/en/model-config), and [Anthropic headless subscription policy](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan). Local CLI/version/auth were checked. Recheck mutable availability/billing when a new session or failure warrants it; reuse research otherwise.

Anthropic currently says planned June 15 SDK subscription changes are paused; headless usage remains subject to subscription limits. Availability does not guarantee remaining quota. This policy bounds worker count, scope, effort and retries; it cannot promise a fixed number of minutes or tokens per subscription window.

MP-04.b actual delegation: Terra/medium implementation, one Sonnet 5/medium read-only adapter review, then a bounded Terra/medium security recheck of root hardening. Sonnet reported 11 turns against requested 6; keep the 180-second boundary and treat maxTurns as unproven in this installed CLI. No review children or parallel duplicate task ran. The next agent should consume accepted findings and test evidence instead of repeating the reviews.

MP-05.b actual delegation: two sequential named Sonnet 5/medium read-only assignments, first schema/consumer analysis alongside root generation, then focused final isolation/behavior review. They completed with 24 and 10 actual turns, zero permission denials and no children; the six-turn request was advisory. Both used first-party Pro authentication and 180-second subprocess deadlines. Reuse their recorded results/dispositions rather than repeating the audit. Future packets should prefer root-prepared narrow excerpts where whole-file exploration inflated turns; preserve independent checking of critical findings. No root-model switch, hard token cap or billing amount is inferred from CLI metadata.

## Owner continuation preference — 2026-09-13

Use Claude Code CLI for bounded implementation/coding as well as independent review. When Codex approaches its limit and Claude subscription capacity remains available, shift substantial independently specified implementation to Claude, retaining root verification and the combined two-worker ceiling. Check current Codex account usage when allocation depends on it. Claude login/Pro status does not prove remaining quota; preserve quota failures and use available-provider fallback without paid/API fallback, account switching or permission bypass. Do not leave Claude artificially read-only for a task explicitly assigned as coding: create a separate named worker packet with exact writable files and normal permission enforcement. The existing review runner remains read-only. Never run two writers on the same file, and do not launch work solely to consume a subscription. This preference does not activate the future automatic runner.
