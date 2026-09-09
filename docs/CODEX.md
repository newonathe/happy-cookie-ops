# Codex, in this repository

Codex reads `AGENTS.md` on its own — that file is binding and this one is only about
running the tool well. `.codex/config.toml` and `.codex/hooks.json` are committed, so a
fresh clone inherits the guardrails; they merge on top of your personal config rather
than replacing it. Confirm with `/status` that they actually took effect, because CLI
flags and a selected profile outrank a project file.

## The two jobs Codex is for here

**Review Claude's diffs.** This is the highest-value use, and the reason the `review`
profile is read-only: a reviewer that can edit will quietly fix what it was supposed to
report.

```bash
codex --profile review
```

Then, with only the diff in context:

> Review `git diff` and `git diff --cached` as the engineer who has to maintain this
> after the author leaves. You did not write it. For each finding give the file, the line,
> and a tag of `blocker`, `should-fix` or `nit`.
>
> Check in this order: correctness against the task in `docs/TASKS.md`; the port rules
> (run `node scripts/check-port-integrity.mjs`); money handling — pesos vs centavos,
> rounding, any float near the ledger; security — unvalidated input, a role trusted from
> the client, a service-role key reachable from a `'use client'` file, a new table with no
> RLS policy; the offline queue — could this drop a sale the server never acknowledged;
> tests — is the new behaviour covered, or is the test asserting its own mock.
>
> If you find nothing, say "no findings". Do not invent nits to look thorough.

**Implement the mechanical tasks.** Everything marked **X** in `docs/TASKS.md`: tests
around existing behaviour, type work, filling in a module from `docs/CONTRACTS.md`.

```bash
codex --profile build
```

## Starting a task

The full prompt for every task is in `docs/prompts/`. Paste it verbatim, wrapped in the
preamble and postamble from `docs/prompts/00-session-protocol.md`. If you are working from
the task board instead, paste the task block from `docs/TASKS.md` and add this:

> `AGENTS.md` is binding. Read only the files in the task's *Context* line — do not
> explore the repository. State your plan and the test you will write before you write
> code, and tell me anything in the task that is ambiguous or wrong. Do not agree with me
> by default. When you are done, run `pnpm verify` and paste the real output.

The *Context* line is not a suggestion. Unbounded exploration is the largest avoidable
cost in agentic development, and this repository is 153 files.

## Running alongside Claude Code

Separate worktrees, always — two agents in one checkout overwrite each other.

```bash
git worktree add ../hc-codex -b agent/codex/T-08-engine-tests
cd ../hc-codex && pnpm install
codex --profile build
```

Three things bite: `node_modules` is per worktree, the dev server port collides
(`PORT=3010 pnpm dev`), and both worktrees share one local database — only ever run
`pnpm db:reset` in one of them. `docs/WORKFLOW.md` §4 has the details.

Only parallelise tasks with no shared files. Two tasks touching `ops-engine.js` or the
same migration are sequential no matter how much you want them not to be.

## What not to ask it for

The same list as Claude: do not ask it to tidy the inline styles, refactor the engine,
improve the copy, or add a component library. `docs/TASKS.md` ends with why each of those
destroys work that is already paid for. A read-only review profile cannot do it by
accident; a build profile can.
