# How we work

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

Three participants: **you**, **Claude Code**, and **Codex**. This is the operating manual
for the three of us. It exists because the failure mode of agentic development is not bad
code — it is fast code nobody reviewed, built on a misunderstanding, on a branch that
conflicts with another agent's branch.

---

## 1. The loop

Every unit of work goes through the same five steps. Skipping step 2 is what produces the
rewrites.

| Step          | Who                                            | Output                                                                          |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **Research**  | an agent, in a subagent or a throwaway session | a summary of the relevant files. Nothing written.                               |
| **Plan**      | Claude Code, in plan mode                      | files to touch, the test to write, the risks, the ambiguities. **You approve.** |
| **Implement** | Claude Code or Codex                           | one task, one branch, a small diff                                              |
| **Verify**    | the agent, mechanically                        | `pnpm verify` output pasted, not summarised                                     |
| **Review**    | the _other_ model, fresh context               | findings tagged blocker / should-fix / nit                                      |
| **Ship**      | you                                            | read the diff, merge                                                            |

Research in a subagent rather than the main session keeps the main context clean — the
summary comes back, the forty files it read do not.

## 2. Who does what

They are not interchangeable, and using the wrong one is the most common waste.

| Work                                                           | Give it to         | Why                                                                              |
| -------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| Understanding an unfamiliar area before changing it            | Claude Code        | Best at holding a whole subsystem and finding the file that actually matters     |
| Planning a multi-file change or a migration                    | Claude Code        | Produces a sequence you can argue with before any code exists                    |
| Multi-file refactors, the Postgres migration (T-10…T-14)       | Claude Code        | Keeps coherence across files that must change together                           |
| Writing tests around existing behaviour                        | Codex              | Fast, and stays close to the patterns already in the repo                        |
| Filling in a well-specified module from a contract             | Codex              | The spec does the thinking; you are buying throughput                            |
| Mechanical work across many files (types, imports, renames)    | Codex              | Cheaper per file, and the diff is easy to scan                                   |
| Reviewing the other one's diff                                 | the opposite model | A second model with no memory of writing it catches what the author rationalised |
| Product decisions, merges, anything about the owner's business | **you**            | Neither of them knows what the bakery needs                                      |

**Cross-review is the highest-leverage habit here.** Claude implements, Codex reviews;
Codex implements, Claude reviews. Same-model review is worth much less — it agrees with
its own reasoning. Run `/review` in the reviewing tool with only the diff in context.

## 3. Context hygiene

Agent output quality degrades long before the context window is full.

- **Keep a session under ~40% of its context.** Past that, quality falls off; you will
  see it as an agent re-reading files it already read, or "fixing" something that was
  never broken. On a hard task, aim lower.
- **One task per session.** `/clear` between tasks. A session that has already done
  something else is carrying that reasoning into your new task.
- **Rewind rather than correct.** If an attempt goes wrong, rewind to before it and
  re-prompt with what you learned. Leaving the failed attempt plus your correction in the
  context teaches the agent the wrong pattern and doubles the tokens.
- **Name the files.** `docs/TASKS.md` gives every task a _Context_ line for this reason.
  An agent told which five files to read costs a fraction of one told to "look around".
- **`/handoff` before you run out.** It writes what was learned into `docs/SESSIONS.md`
  so the next session starts informed instead of archaeological.

## 4. Running them in parallel

Two agents in one checkout will overwrite each other. Use worktrees — separate directories
on separate branches, one repository.

```bash
git worktree add ../hc-claude  -b agent/claude/T-10-orders
git worktree add ../hc-codex   -b agent/codex/T-08-engine-tests

cd ../hc-claude && pnpm install && claude          # Claude Code also has --worktree
cd ../hc-codex  && pnpm install && codex           # codex --cd ../hc-codex
```

Three things bite:

- **node_modules is per worktree.** Install in each, or symlink it.
- **Ports collide.** `PORT=3010 pnpm dev` in the second worktree.
- **One database.** Two agents running `pnpm db:reset` will destroy each other's state.
  Either give each a separate Supabase local instance, or only ever run migrations in one.

**Only parallelise tasks with no shared files.** `docs/TASKS.md` marks each task's
dependencies; two tasks that touch `ops-engine.js` or the same migration are sequential no
matter how much you want them not to be. Uncoordinated parallel writes look like a huge
regression and cost more to untangle than the sequential version would have taken.

## 5. Anti-sycophancy

An agent's default is to agree with you. That is worth nothing when you are the one who
might be wrong. Every task prompt in `docs/PROMPTS.md` ends with the same clause, and it
is not decoration:

> Before you write code: list what could go wrong with this change, what in the existing
> code you are unsure about, and anything in my request that is ambiguous or wrong. Do not
> agree with me by default.

Three follow-ups that pay for themselves:

- _"What did you not do that I asked for?"_ — surfaces silently dropped requirements.
- _"What is the weakest part of this change?"_ — the answer is usually the part to test.
- _"If this breaks in production in a month, what breaks?"_ — better than any checklist.

Treat an agent that has never pushed back as a warning sign, not a good employee.

## 6. Definition of done

A task is done when **all** of these are true. Not four of five.

1. `pnpm verify` passes — port integrity, types, lint, unit tests.
2. `pnpm test:e2e` passes.
3. The new behaviour has a test that would fail without the change.
4. The diff does one thing, and is under ~400 changed lines.
5. Anything learned is written into the docs — `AGENTS.md`, `docs/PORTING.md`, or
   `docs/TECH-DEBT.md` — in the same PR.
6. A different model reviewed it and its blockers are resolved.
7. You read the diff. Not the summary of the diff.

If Claude is writing code faster than you can review it, you are accumulating risk, not
progress. Slow down the agent, not the review.

## 7. Branches, commits, PRs

Trunk-based. `main` is always deployable; CI is the gate.

```
agent/<tool>/<task-id>-<slug>      agent/claude/T-10-orders-to-postgres
fix/<slug>                         fix/sync-clears-unacked-row
```

Commits are `type(scope): summary` with `Task: T-10` in the body. One logical change each
— an agent that made five changes should make five commits, because that is what makes a
bad one revertable.

A PR states what changed, what you verified, and what you deliberately did not do. The
template asks for exactly that.

## 8. Spending less

Cost and time come from the same place: tokens spent on work that gets thrown away.

- **Scope is the biggest lever, by far.** A task with named files and explicit acceptance
  criteria costs a fraction of the same task described vaguely — not because the agent is
  faster, but because it does not build the wrong thing first.
- **The contract before the code.** `docs/CONTRACTS.md` lets two agents build both sides of
  an endpoint at once without either guessing. Guessing is what gets rewritten.
- **Cheap model for mechanical work.** Types, imports, test scaffolding, doc updates. Save
  the expensive reasoning for planning, the migration, and review.
- **Never let an agent explore the whole repo.** `docs/TASKS.md` exists to prevent that.
- **Stop a session that is thrashing.** Two failed attempts at the same thing means the
  task is underspecified. Fix the task, clear the session, start again. Do not let it
  spend a third attempt.
- **The port is already paid for.** Every screen and every rule exists. Any prompt that
  starts with "rebuild" or "redesign" is spending money to destroy value.

## 9. First session, in order

1. `/task T-01` — get it running and prove the port. Nothing else matters until this is green.
2. `/task T-02` — generated database types.
3. Read `docs/TASKS.md` and pick the next unblocked task.

Do not start with the interesting work. Start with the gate that tells you when you have
broken something.
