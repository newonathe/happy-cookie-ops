# Working in this repository (Claude Code)

> **Current planning authority (2026-10-07):** Read [current state](docs/state/current.md) first, then [the next goal](docs/state/next-goal.md). The approved plan is [final-plan.md](docs/state/final-plan.md), version 2 (5 October): open only the section a goal names. MASTER-PLAN.md, G1-plan.md, finish-plan.md and the MP-* files are history. The ported screens, sheets, shell and engine stay locked as the demo build; the live interface is rebuilt beside them. All protection and verification rules below remain in force.

@AGENTS.md

`AGENTS.md` above is the single source of rules for every agent. It is imported, so do not repeat or diverge from it here. This file adds only what is specific to Claude Code.

## Claude Code specifics

- **Hooks** (`.claude/settings.json`) fire only when Claude Code is started in this repository root:
  - `PreToolUse` blocks writes to ported markup, the engine and existing migrations.
  - `PostToolUse` runs `prettier --write` on every edited file. Afterwards, check `git diff --stat` yourself for formatting churn outside your change.
  - `Stop` re-checks port integrity. When TypeScript changed, it also runs `tsc --noEmit` once per turn, blocking once per distinct error set (F6, `docs/state/finish-plan.md`).
- **Cloud sessions:** a `SessionStart` hook (`.claude/hooks/cloud-setup.sh`) installs Node 24.20.0 and the dependencies, so `pnpm` and the git hooks work without setup turns.
- **Start here:** open Claude Code in this folder, so the hooks, agents and `.mcp.json` load. Approve the `codebase-memory-mcp` server once.
- **Work loop:** use one `/goal` per package, taken from `docs/state/next-goal.md`, in a fresh conversation with auto mode on.
  - Use Opus to plan and sign off; do the building in a Sonnet session or with Sonnet subagents.
  - Run `/clear` (or open a new conversation) between packages. Never carry one conversation across packages.
- **Commands:** `/task`, `/review`, `/verify`, `/handoff` (`.claude/commands/`).
- **Subagents:** `.claude/agents/` pin their models. Workers run on Sonnet or Haiku, including the Sonnet-high security reviewer; the Opus session signs off. A subagent without a `model` inherits the parent's (most expensive) model.
- **Review:** follow the lean-plan rule. Auth/RLS/SQL/money/offline diffs get one independent review by Codex (`codex --profile review`) or a different Claude model.
- **Token hygiene:** turn off claude.ai connectors this repo doesn't use (Zapier, Apollo, ClickUp, Canva and so on) for coding sessions, and ask codebase-memory-mcp before reading whole files.

Shared worker policy: read [docs/state/agent-orchestration.md](docs/state/agent-orchestration.md) before delegation. It governs the combined Codex/Claude limit, explicit models, bounded prompts and review rules for this conversation.
