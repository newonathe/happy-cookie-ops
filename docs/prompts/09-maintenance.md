# Phase 09 — Maintenance

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../../MASTER-PLAN.md), [docs/state/current.md](../../docs/state/current.md) or the [decision register](../../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

After launch. These are the prompts you will actually use most, over years, long after the
build prompts are history.

---

## M-01 — Add a screen

> Add a screen: **[what it is for, in one sentence about the owner's job, not the UI]**.
>
> Read `src/lib/screens.ts`, one existing screen in `src/components/screens/` for the
> house style, and `src/app/orders/page.tsx` for the route shape. Nothing else.
>
> Then:
>
> 1. Add the key to `SCREEN_KEYS` in `src/lib/screens.ts`. The unit test in
>    `tests/unit/screens.test.ts` will fail until the engine agrees — that is deliberate,
>    and it is telling you the engine needs the key too.
> 2. Add the route: `src/app/<key>/page.tsx`, mirroring an existing one exactly.
> 3. Build the screen with **inline style objects composed from the tokens in
>    `src/app/globals.css` `@theme`**. No new hex values. If you need a colour that is not
>    there, say so — that is a design decision, not an implementation one.
> 4. Match the ported screens' vocabulary: 44px controls, 18px card radius, the same
>    header pattern, the same empty-state tone. Read one and copy its structure.
> 5. Write copy in the register the owner already reads — plain, direct, about her work.
>    Read three existing empty states before writing one.
> 6. Add the new file to the baseline: `node scripts/check-port-integrity.mjs --update`.
> 7. Add the route to `tests/e2e/screens.spec.ts`.
>
> A new screen is not ported markup, so you may style it freely within the token system —
> but it sits beside 24 screens the owner already knows. Consistency is the requirement.

---

## M-02 — Add or change a business rule

> Rule change: **[what changes, and what the owner expects to see afterwards]**.
>
> Read `docs/reference/spec/03-business-rules.md`, the relevant engine methods (read
> only), and the matching tests in `tests/unit/`.
>
> 1. **Write the test first**, expressing the new behaviour. Watch it fail, and paste that
>    failure — it is the proof the test tests something.
> 2. Implement. If it fits in a subclass, put it in a subclass —
>    `src/store/ops-runtime.tsx` is the pattern. Only if it genuinely cannot go there does
>    it touch `ops-engine.js`, and then you tell me first and explain why.
> 3. Update `docs/reference/spec/03-business-rules.md` in the **same commit**. A rule that
>    lives only in code is a rule nobody can check.
> 4. Check for user-visible strings. If the rule changes what the owner reads, that is a
>    copy change and it needs her approval — quote the old and the new and wait.
> 5. Run the full test net. A rule change that breaks another rule's test has found a
>    conflict in the specification, not a broken test.

---

## M-03 — Dependency updates

Monthly. Fifteen minutes, or a lost day if skipped for a year.

> Update dependencies, conservatively.
>
> 1. `pnpm outdated` — report it as a table: package, current, wanted, latest, and whether
>    the gap is patch, minor or major.
> 2. **Patches and minors first**, as one commit. `pnpm update`, then `pnpm verify` and
>    `pnpm test:e2e`.
> 3. **Each major separately**, on its own branch, in its own PR. Read its changelog and
>    tell me what breaks before you touch anything.
> 4. Never update `next`, `react` or `tailwindcss` in the same commit as anything else.
>    Those three break in ways that are hard to attribute.
> 5. `pnpm audit` — report vulnerabilities with whether the vulnerable path is actually
>    reachable from this app. Most are not, and treating all of them as urgent trains you
>    to ignore the real ones.
>
> If `pnpm verify` fails after an update, revert it. Do not fix forward through a
> dependency change you have not read.

---

## M-04 — A schema change

> Schema change: **[what and why]**.
>
> Read `docs/DATA.md` and the most recent file in `supabase/migrations/`.
>
> 1. `supabase migration new <descriptive_name>`. **Never edit an applied migration** —
>    applied is immutable, because production has already run it.
> 2. Write the migration. If it adds a table: enable RLS **in the same file**, and write
>    the policies **in the same file**. A table that ships without policies ships open, and
>    someone will read from it before anyone notices.
> 3. If it changes an existing column, state explicitly whether it is backwards compatible
>    with the currently deployed app. If it is not, this is a two-deploy change and you
>    must say so: expand, deploy, migrate, contract.
> 4. `pnpm db:reset`, then `pnpm db:types`, then `pnpm verify`.
> 5. Update `docs/DATA.md` in the same commit — the table, its columns, its policies, and
>    what each policy protects.
> 6. State the rollback. A migration without a stated rollback is a one-way door.

---

## M-05 — Quarterly health check

> Read `docs/TECH-DEBT.md`, `docs/SESSIONS.md` and `git log --oneline -100`. Then tell me,
> honestly:
>
> 1. Which tech-debt items are still real, which were fixed, and which turned out not to
>    matter. Delete the ones that do not matter — a debt register nobody trusts is worse
>    than none.
> 2. New debt that accumulated and is not written down. Look for `TODO`, `FIXME`, skipped
>    tests, `eslint-disable`, `any`, and files that have changed more than five times.
>    Churn is where the design is wrong.
> 3. Which parts of the codebase you would be nervous to change, and why. That answer is
>    the real debt register.
> 4. Whether the docs still match the code. Name three specific places they have drifted.
> 5. The three highest-value things to do next, and why each is worth more than the others.
>
> Be blunt. A quarterly review that concludes everything is fine is a wasted quarter.

---

## M-06 — Onboard a new developer

> Write `docs/ONBOARDING.md`: a first-week path for a developer who has never seen this
> repository.
>
> Structure it as a sequence with a checkpoint after each step, so they can tell whether
> they are on track:
>
> 1. **Day 1** — read `README.md`, `AGENTS.md`, `docs/PORTING.md`. Get it running. Load
>    all 25 routes. Checkpoint: `pnpm verify` green on their own machine.
> 2. **Day 2** — open the prototype beside the app. Understand what "1:1 port" means by
>    seeing it. Checkpoint: they can find the prototype source for any screen.
> 3. **Day 3** — trace one interaction end to end: a tap in Bazaar Mode, through the
>    engine, into IndexedDB, to `/api/sync`, into Postgres. Checkpoint: they can draw it.
> 4. **Day 4** — a real task from `docs/TASKS.md`, one marked **X**. Checkpoint: a merged PR.
> 5. **Day 5** — read `docs/TECH-DEBT.md` and `docs/BUILD-LOG.md`. Checkpoint: they can say
>    why the inline styles were kept without looking it up.
>
> Include the five traps from `AGENTS.md`. And tell them the one rule that outranks the
> rest: **this is a port, and the prototype is the answer key.**
