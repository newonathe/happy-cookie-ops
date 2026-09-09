# Start here

> **Superseded starting sequence:** Start with [MASTER-PLAN.md](MASTER-PLAN.md) and its MP-00 prompt. The original prompt below is retained as historical context; it is not the current production-readiness or deployment instruction.

The first prompt. Copy the block below **whole** into a fresh Claude Code session opened
in this repository, and send it.

Nothing else in this repository matters until it passes. `pnpm verify` is what will tell
you, for the rest of the project, that you have broken something — until it runs, you are
working blind.

---

## Before you paste

```bash
cd happy-cookie-ops
git init && git add -A && git commit -m "chore: initial import"   # if not already a repo
claude
```

A git commit first, always. It is what makes an agent's work revertable, and you will want
that within the hour.

---

## The prompt

> You are picking up a repository that has never been installed. Nothing in it has been
> executed. Read `HANDOFF.md` and `AGENTS.md` before doing anything else.
>
> The short version: this codebase is a **1:1 port** of a signed-off interactive prototype
> at `docs/reference/prototype.dc.html`. Its screens, copy, numbers and spacing were
> reviewed against how a real one-person bakery runs. Reproducing it exactly is the
> requirement, not a preference. Three rules override anything I ask you for:
>
> 1. Do not restyle ported markup — `src/components/screens`, `sheets`, `shell`. The
>    inline style objects are the specification.
> 2. Do not rewrite user-visible copy.
> 3. Do not refactor `src/store/engine/ops-engine.js`. Extend it by subclassing;
>    `src/store/ops-runtime.tsx` is the existing example.
>
> `scripts/check-port-integrity.mjs` enforces all three and fails the build. A hook blocks
> writes to those files outright.
>
> **Your task is T-01: get it running and prove the port is intact.** Not to improve
> anything. Work these in order and stop at the first thing that fails:
>
> 1. `chmod +x scripts/*.sh .claude/hooks/*.sh`
> 2. `pnpm install` — report any peer-dependency warning naming `react`, `next` or
>    `tailwindcss`; ignore the rest.
> 3. `node scripts/check-port-integrity.mjs` — must pass before anything else. It proves
>    the 54 ported files still match `scripts/port-baseline.json`.
> 4. `node scripts/check-engine-contract.mjs` — proves everything the repository claims
>    about the engine is actually true: exports, declared types, order states, settings
>    keys, seed arity, and every string claiming to be quoted from the prototype. Five
>    audit passes found five fabrications before this existed; if it fails, the code is
>    wrong about the engine, not the reverse.
> 5. `pnpm typecheck`. **Expect errors.** The engine is untyped JavaScript behind a
>    hand-written `.d.ts`, and the generated `OpsVals` contract has `unknown` where the
>    prototype never rendered a branch. Fix them **in the type layer only** —
>    `src/store/engine/ops-engine.d.ts` and `src/view-models/vals.ts` — never by changing
>    ported markup or the engine.
> 6. `pnpm lint`
> 7. `pnpm test`
> 8. `pnpm build` — some failures exist only in the production build: a route signature, a
>    hook that suspends without a boundary, a server-only import reaching a client
>    component.
> 9. `pnpm dev`, then load all 25 routes: `/` `/sales` `/orders` `/order` `/lookup`
>    `/reconcile` `/bake` `/batch` `/inventory` `/stocktake` `/more` `/grocery` `/bazaar`
>    `/pnl` `/formqueue` `/health` `/products` `/notifications` `/shop` `/checkout`
>    `/status` `/recipes` `/drops` `/suppliers` `/settings`. Report every console error
>    with the route it came from.
> 10. `pnpm test:e2e`
>
> How to fix things:
> - A missing type, a wrong import path, a config key — fix it.
> - **A ported screen that genuinely throws** — quote the stack trace, find the
>   corresponding region in `docs/reference/prototype.dc.html`, quote that too, and
>   propose the minimal fix. **Wait for my approval before applying it.** A throwing
>   screen usually means the translation dropped something, and the prototype is the
>   answer key.
> - Anything that tempts you to change a style value, a copy string, or the engine — stop
>   and tell me.
>
> Before you start: tell me your plan, and tell me anything in this request that is
> ambiguous, contradictory or wrong. Do not agree with me by default. If more than three
> ported screens throw, stop — that is a systematic translation problem, not three bugs,
> and I want to see it before you fix them one at a time.
>
> Report as a table: step, pass or fail, what you changed, which file. Then paste the
> final `pnpm verify` output in full. If you find yourself about to write "this should
> work" — run the command instead.

---

## When it comes back green

```bash
git add -A && git commit -m "fix(build): get the port running

Task: T-01"
```

Mark T-01 `●` in `docs/TASKS.md`, then continue with **T-01b** from
[`docs/prompts/01-foundation.md`](./docs/prompts/01-foundation.md) — standing up Supabase
locally.

From there the sequence is on the board. The rule for the rest of the project: one task
per session, `/clear` between tasks, and the other model reviews every diff.

---

## If it does not come back green

- **The port-integrity check fails on a file nobody edited** → the baseline or the script
  is wrong. Five-minute fix, and worth making before anything is built on top of it.
- **More than three ported screens throw** → `docs/prompts/08-recovery.md`, X-05.
- **The build fails but everything passes locally** → `docs/prompts/08-recovery.md`, X-03.
- **The agent has tried the same thing twice** → stop the session. That is an
  underspecified task, not a failing agent. `docs/prompts/08-recovery.md`, X-04.
