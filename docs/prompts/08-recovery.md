# Phase 08 — Recovery

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../../MASTER-PLAN.md), [docs/state/current.md](../../docs/state/current.md) or the [decision register](../../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

For when something is broken, stuck, or an agent has stopped being useful. These prompts
are written to be pasted at the worst moment, so each one starts from no assumptions.

---

## X-01 — A test is failing and you do not know why

> A test is failing. Do not fix it yet.
>
> 1. Run it in isolation and paste the **full** output, including the stack.
> 2. Tell me: what the test asserts, in one sentence; what the code actually does; and
>    where they diverge — the specific line.
> 3. Then decide which of three cases this is, and say which:
>    - **the code is wrong** → propose the minimal fix;
>    - **the test is wrong** → explain why, and what it should assert instead;
>    - **both are right and the spec is ambiguous** → quote
>      `docs/reference/spec/03-business-rules.md` and stop. That one is mine to decide.
>
> You may not: weaken the assertion, add `.skip`, increase a timeout to make it pass, or
> wrap the subject in a try/catch. If you believe any of those is genuinely correct here,
> argue for it and wait.

---

## X-02 — Something worked before and does not now

> A regression. Find it before changing anything.
>
> 1. `git log --oneline -20` — the recent history.
> 2. Identify the last commit where it worked. If unsure, say so and use `git bisect`;
>    the test command to bisect against is `pnpm verify`.
> 3. `git diff <good>..<bad>` and tell me which change is responsible and why — the
>    mechanism, not a guess.
> 4. Propose either a revert or a fix, and say which you recommend and why.
>
> Do not fix forward on top of a broken state. If the responsible commit is large, revert
> it and re-do it properly rather than patching around it.

---

## X-03 — The build fails but everything passes locally

> `pnpm build` fails, or CI fails while local is green. The usual causes, in order of
> likelihood:
>
> 1. A type error that only surfaces during the production build — usually a route handler
>    signature or an `async` `params` in App Router.
> 2. `useSearchParams()` or another hook that suspends, without a Suspense boundary.
> 3. A server-only import reaching a client component, or the reverse — `next/headers` in
>    a `'use client'` file.
> 4. An environment variable present in `.env.local` and absent in CI.
> 5. A case-sensitive import path that works on macOS and fails on Linux.
> 6. `--frozen-lockfile` failing because the lockfile is stale or uncommitted.
>
> Paste the full build output, name which of these it is, and fix that one thing. Do not
> change unrelated config to make the error go away — config changes that "fix" a build
> without an understood mechanism come back.

---

## X-04 — The agent is thrashing

Two failed attempts at the same thing. **Stop the session.** This is not an agent failure;
it is an underspecified task.

1. `/handoff` so what was learned is not lost.
2. Read the note. What did it not know that it needed?
3. Rewrite the task in `docs/TASKS.md`: narrow the scope, name more files in *Context*,
   or split it in two.
4. `/clear`, fresh session, new task.

Never let a third attempt run in the same session. The failed attempts are in the context
now, and the agent is pattern-matching against its own mistakes.

**Signs of thrashing**, worth catching early: re-reading files it already read; changing
the same line back and forth; adding defensive code around a problem it has not
diagnosed; explaining why something is hard instead of doing it; "let me try a different
approach" more than once.

---

## X-05 — The port-integrity check is failing

> `node scripts/check-port-integrity.mjs` is failing. Diagnose it; do not update the
> baseline to silence it.
>
> 1. Paste the output. It names each file and what changed.
> 2. For each file, `git diff` it and tell me exactly which string or style object changed.
> 3. Then classify:
>    - **an accident** — an agent reformatted or "tidied" ported markup → revert that file;
>    - **collateral** — a legitimate change touched a ported file unnecessarily → separate
>      the two;
>    - **deliberate and approved** — the accessibility pass, or a typo fix I asked for →
>      then and only then `--update`, in the same commit, with the reason in the message.
>
> `--update` is not a fix. It is a signature saying a human approved the change. Do not
> sign for me.

---

## X-06 — Sync is broken at a bazaar (live incident)

**Read this to the owner first, then work the problem:**

> Your sales are safe. They are saved on the phone. Nothing is lost. Keep taking orders —
> the app will send them when it can.

Then, in order:

1. `/api/sync/status` — does the server have what the phone thinks it sent?
2. The phone's queue badge — how many rows are pending?
3. Is it a network problem or a server problem? Aeroplane mode off and on, then the health
   endpoint.
4. If the server is down: nothing to do on the phone. The queue is patient and Background
   Sync will retry. **Do not reinstall the app, do not clear site data, do not sign out.**
   Any of those can destroy the queue.
5. If the server is up and the queue will not clear: the response is being rejected.
   `GET /api/sync/status`, then the server logs for the rejection reason — it is logged as
   a count and a reason, never contents.
6. Afterwards, write it up in `docs/SESSIONS.md`. A live sync failure is the most valuable
   bug report this project will get.

**Never** run a migration or a deploy during a bazaar. A service worker updating mid-sale
is the one scenario nobody has tested.

---

## X-07 — Two agents produced conflicting work

> Two branches touch the same files. Resolve it by understanding, not by merging.
>
> 1. `git log --oneline` both branches, and `git diff` each against `main`.
> 2. Tell me what each was trying to do, and where they genuinely conflict versus where
>    they merely touch the same file.
> 3. Recommend: merge one first and rebase the other, or discard one and redo it on top of
>    the first. Say which and why.
> 4. If both changed the same business rule, **stop.** That is a specification conflict and
>    it is mine to resolve.
>
> Do not resolve conflicts by taking both sides. Two agents' half-understandings of a rule
> do not add up to one correct implementation.

Prevention is in `docs/WORKFLOW.md` §4: only parallelise tasks with no shared files.
`docs/TASKS.md` marks the dependencies for exactly this reason.

---

## X-08 — You have lost track of the state of the project

> Orient me. Read only these: `docs/TASKS.md`, `docs/SESSIONS.md` (the last three
> entries), `git log --oneline -30`, and `git status`.
>
> Tell me:
> 1. Which tasks are done, by their ids.
> 2. Which is in progress, and where it stopped.
> 3. What is unblocked and could start now.
> 4. Anything uncommitted or on a stale branch that will conflict.
> 5. The single next action.
>
> Under 300 words. Do not read the source. Do not propose improvements.
