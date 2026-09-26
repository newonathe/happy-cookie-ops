# Working in this repository (Claude Code)

> **Current planning authority (2026-09-08):** Read [MASTER-PLAN.md](MASTER-PLAN.md) first. Its audited findings, task catalog and decision gates supersede conflicting readiness claims and old T-task ordering. UI/UX remains locked; current records are demo fixtures; launch has one offline sales device. The 2026-09-08 user request authorizes local G0 implementation (MP-00 through MP-03). Read [current state](docs/state/current.md) for actual progress; later product packages and the automatic runner remain deferred. All protection and verification rules below remain in force.

@AGENTS.md

`AGENTS.md` above is the single source of rules for every agent. It is imported, so do not repeat or diverge from it here. This file adds only what is specific to Claude Code.

## Claude Code specifics

- **Hooks** (`.claude/settings.json`) fire only when Claude Code is started in this repository root:
  - `PreToolUse` blocks writes to ported markup, the engine and existing migrations.
  - `PostToolUse` runs `prettier --write` and `tsc` on every edited file. Afterwards, check `git diff --stat` yourself for formatting churn outside your change.
  - `Stop` re-checks port integrity.
- **Commands:** `/task`, `/review`, `/verify`, `/handoff` (`.claude/commands/`).
- **Subagents:** `.claude/agents/` pin their models — workers on Sonnet or Haiku (the security reviewer is Sonnet high); the Opus session signs off. A subagent without a `model` inherits the parent's (most expensive) model. The allocation rules are in the shared policy below.
- **Cross-review:** Codex reviews Claude's diffs read-only (`codex --profile review`), and Claude reviews Codex's auth/RLS/SQL/money/offline diffs. Same-model review agrees with its own reasoning and is worth much less.

Shared worker policy: read [docs/state/agent-orchestration.md](docs/state/agent-orchestration.md) before delegation. It governs the combined Codex/Claude limit, explicit models, bounded prompts and review rules for this conversation.
