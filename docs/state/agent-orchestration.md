# Shared Codex and Claude coordination policy — 2026-09-09

The owner reauthorized Claude and asked for economical delegation across both subscriptions. This policy persists for this conversation through compaction and continuation. Read it before assigning work; later owner instructions override it. It supplements MASTER-PLAN.md without activating the future automatic runner.

## Allocation and models

One worker is the default. At most two active workers across Codex and Claude combined, alongside root. Count a Claude coordinator and its child as two workers; do not run another Codex worker during that arrangement. Independent useful work must justify delegation; do not create agents merely to exercise both providers.

| Work | Codex default | Claude default |
| --- | --- | --- |
| Narrow extraction, documentation, repeatable lookup | Luna / medium | Haiku, ordinary effort |
| Bounded implementation, test execution, diagnosis | Terra / medium | Sonnet / medium |
| Demonstrably difficult logic or security, money, auth, offline review | Sol / high | Sonnet / high first |
| Unresolved cross-system decisions | Root; Astra only where needed | Escalate after recording the unresolved issue and checking subscription availability |

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

Earlier Claude Sonnet 5/high privacy review is complete and checked; actual SDK regression coverage was added. Do not repeat it. Assignments this pass: Docker visual verification (Codex Terra/medium); Vercel source diagnosis (Codex Luna/medium, completed after Claude OAuth expired); independent visual-gate review (Claude Sonnet/medium after owner re-login). Root owns policy, integration, checkpoint and authorized publication. Record completion/evidence in current.md and the handoff rather than storing stale live-agent IDs here.

## Research and limits

Reviewed 2026-09-09: [OpenAI subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [OpenAI models](https://learn.chatgpt.com/docs/models), [Claude subagents](https://code.claude.com/docs/en/subagents), [Claude model configuration](https://code.claude.com/docs/en/model-config), and [Anthropic headless subscription policy](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan). Local CLI/version/auth were checked. Recheck mutable availability/billing when a new session or failure warrants it; reuse research otherwise.

Anthropic currently says planned June 15 SDK subscription changes are paused; headless usage remains subject to subscription limits. Availability does not guarantee remaining quota. This policy bounds worker count, scope, effort and retries; it cannot promise a fixed number of minutes or tokens per subscription window.
