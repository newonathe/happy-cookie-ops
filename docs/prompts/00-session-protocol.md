# Session protocol

The wrapper that goes around every prompt in this directory. Read it once; after that the
per-task prompts assume it.

## Before you open an agent

1. **One task per session.** Look up the task in `docs/TASKS.md`, confirm its
   dependencies are done. If a dependency is open, work that instead.
2. **Fresh context.** `/clear` in Claude Code, a new session in Codex. A session that has
   already done something else will drag that reasoning into this task.
3. **Clean tree.** `git status` empty, or your work committed. An agent cannot tell your
   uncommitted experiment from its own change, and neither can you at review time.
4. **A branch.** `git checkout -b agent/claude/T-04-staff-accounts`. Never work on `main`.

## The preamble — paste before every task prompt

> You are working in the `happy-cookie-ops` repository. Read `AGENTS.md` first; it is
> binding. This codebase is a **port** of a signed-off prototype at
> `docs/reference/prototype.dc.html` — the screens, copy, numbers and spacing were
> reviewed against how a real bakery runs. Reproducing it exactly is the requirement, not
> a preference.
>
> Three rules that override anything I ask for in this session:
> 1. Do not restyle ported markup (`src/components/screens`, `sheets`, `shell`). The
>    inline style objects are the specification.
> 2. Do not rewrite user-visible copy.
> 3. Do not refactor `src/store/engine/ops-engine.js`. Extend it by subclassing —
>    `src/store/ops-runtime.tsx` is the existing example.
>
> `scripts/check-port-integrity.mjs` enforces all three and runs inside `pnpm verify`. If
> the task appears to require breaking one of them, stop and tell me before writing code.
>
> Read only the files I name below. Do not explore the repository — it is 153 files and
> unbounded reading is the single largest avoidable cost in this project.

## The postamble — paste after every task prompt

> Before you write any code:
> 1. State your plan — the files you will change, the test you will write, and the order.
> 2. List what could go wrong with this change, including anything you are unsure about
>    in the existing code.
> 3. Tell me anything in my request that is ambiguous, contradictory, or simply wrong.
>    Do not agree with me by default. If you think this task is a bad idea, say so now.
>
> Then wait for my approval. After I approve:
> - implement it, in commits small enough to revert individually;
> - run `pnpm verify` and paste the **actual output**, not a summary;
> - tell me what you did **not** do that I asked for, and why.
>
> If you find yourself about to write "this should work" — run the command instead.

## After the agent finishes

1. **Read the diff.** `git diff main...HEAD`. The diff, not the agent's description of it.
2. **Cross-review.** Open the *other* model and run the matching prompt from
   `07-review-library.md` with only the diff in context. Same-model review agrees with
   its own reasoning and is worth much less.
3. **Resolve every blocker.** A `should-fix` may be a follow-up task; a `blocker` may not.
4. **`/handoff`** if the session is ending mid-task, so `docs/SESSIONS.md` carries what
   was learned.
5. **Merge, and mark the task `●` in `docs/TASKS.md`** in the same commit.

## Context budget

Watch the session's context usage. Past roughly 40% the output degrades in ways that are
easy to miss — an agent re-reading files it already read, or "fixing" something that was
never broken. When you cross it:

- if the task is nearly done, finish and merge;
- if it is not, run `/handoff` and start a fresh session from the note.

Do not push a long session further because stopping feels wasteful. A tired session
produces work you will pay to undo.

## When an attempt goes wrong

**Rewind, do not correct.** Go back to before the bad attempt and re-prompt with what you
learned. Leaving a failed attempt plus your correction in the context teaches the agent
the wrong pattern and doubles the tokens for the rest of the session.

Two failed attempts at the same thing means the task is underspecified, not that the
agent is failing. Stop, fix the task in `docs/TASKS.md`, clear the session, start again.
