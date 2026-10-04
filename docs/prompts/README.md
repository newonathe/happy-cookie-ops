# The prompt playbook

> **Current playbook:** Start with [MASTER-PLAN.md](../../MASTER-PLAN.md) and [generated master-plan prompts](../master-plan/prompts/README.md). The files in this older folder remain historical reference and do not override the new task/decision gates.

Every prompt needed to take this repository from "never installed" to "running the
bakery", in order, complete enough to paste without editing.

## How this relates to the other documents

| Document                  | Use it for                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `AGENTS.md` / `CLAUDE.md` | The binding rules. Agents read these automatically.                                             |
| `docs/WORKFLOW.md`        | How you, Claude Code and Codex divide work. Read once.                                          |
| `docs/TASKS.md`           | The task board — ids, dependencies, status. Your map.                                           |
| **`docs/prompts/`**       | **The prompts themselves. Paste from here.**                                                    |
| `docs/PROMPTS.md`         | The earlier narrative version, kept because it explains _why_ the sequence is ordered as it is. |

A task id (`T-04`) is the same work in all of them. `docs/TASKS.md` tells you what is
unblocked; this directory tells you what to say.

## Files

| File                                                 | Covers                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`00-session-protocol.md`](./00-session-protocol.md) | The wrapper every prompt goes inside. Read this first — the rest assumes it.                              |
| [`01-foundation.md`](./01-foundation.md)             | T-01 – T-03. Get it running, prove the port, pin the toolchain.                                           |
| [`02-identity.md`](./02-identity.md)                 | T-04 – T-06. Staff accounts, the real role gate, sync hardening.                                          |
| [`03-test-net.md`](./03-test-net.md)                 | T-07 – T-09. The safety net that makes the migration survivable.                                          |
| [`04-postgres.md`](./04-postgres.md)                 | T-10 – T-14. Move the books to Postgres, one table at a time.                                             |
| [`05-quality.md`](./05-quality.md)                   | T-15 – T-19. Accessibility, realtime, reporting, performance.                                             |
| [`06-production.md`](./06-production.md)             | Launch: deploy, install on the phone, the first bazaar, handover.                                         |
| [`07-review-library.md`](./07-review-library.md)     | Review and audit prompts. Run these against every diff.                                                   |
| [`08-recovery.md`](./08-recovery.md)                 | When something is broken, stuck, or an agent is thrashing.                                                |
| [`09-maintenance.md`](./09-maintenance.md)           | After launch: a new screen, a new rule, dependency updates, schema changes, quarterly review, onboarding. |

## The order

Phases are sequential. Tasks inside a phase may be parallel only where
`docs/TASKS.md` shows no shared dependency.

```
01 Foundation ──► 02 Identity ──► 03 Test net ──► 04 Postgres ──► 05 Quality ──► 06 Production
                                                                        │
   07 Review library ─── run against every diff in every phase ─────────┤
   08 Recovery ──────── when something goes wrong ──────────────────────┤
   09 Maintenance ───── after launch ───────────────────────────────────┘
```

Do not start phase 04 before phase 03 is green. The test net is the only thing that will
tell you the migration broke a rule the owner depends on.

## Before you paste anything

**Check the task's status marker on `docs/TASKS.md` first.** The board is the source of
truth for _what state the work is in_; this directory is the source of truth for _what to
say_. Two files, two jobs — but they can drift, and they have:

| Marker | What it means for the prompt                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `○`    | Not started. Paste the prompt as written.                                                                                                                                                                                          |
| `◐`    | **Built already.** The work exists; the prompt is a verification or switch-it-on task. Read it before pasting — if it still asks the agent to _create_ something, the board is newer than the prompt, and the board wins. Tell me. |
| `●`    | Done. Do not run it.                                                                                                                                                                                                               |

This matters because the failure is expensive and quiet: an agent handed a prompt for
work that already exists builds a _second_ implementation. Two rate limiters, two
scrubbers, two money conversions, two error boundaries — and a duplicate error boundary
swallows the error twice, so neither report is complete. That is the same
one-rule-two-places bug `src/lib/rules/capacity.ts` exists to prevent, and it has already
happened once in these files.

`AGENTS.md` carries the standing rule: **check whether it already exists before building.**
`ls src/lib` is faster than either document.

## Reading a prompt in this directory

Each one has the same parts, and each part is load-bearing:

- **Task** — the id in `docs/TASKS.md`.
- **Give it to** — Claude Code, Codex, or you. `docs/WORKFLOW.md` §2 explains why.
- **Context** — the complete file list. The agent reads these and nothing else.
- **The prompt** — paste verbatim, inside the session protocol from `00`.
- **Accept when** — the checks that must pass. Not "looks right".
- **Stop if** — the conditions where the agent must come back to you instead of
  continuing. These matter more than the prompt.

## One rule about editing these prompts

Add context, never remove constraints. The clauses that look like boilerplate — the
anti-sycophancy paragraph, the "do not edit ported markup" line, the demand for real
command output — are the parts that stop an agent producing confident, plausible,
unusable work. They are in every prompt for that reason.
