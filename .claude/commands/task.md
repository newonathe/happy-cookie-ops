---
description: Start an MP work-package slice with the right context loaded
argument-hint: <MP-ID or slice, e.g. MP-08n.2>
---

Work slice **$1**.

1. Find the package in `docs/master-plan/tasks.json` and its prompt in
   `docs/master-plan/prompts/<MP-ID>.md`. Read its current status in
   `docs/state/task-status.json` and any `docs/state/MP-*-plan.md` for it. If it does not
   exist, stop and say so. (`docs/TASKS.md` T-tasks are historical.)
2. Read only the files the slice names, plus `docs/state/decision-register.md` entries for its
   decision gates. Do not explore the whole repository.
3. Check `depends_on` and the decision gates. If a dependency is incomplete or a gate is
   still open, stop and say which one blocks you.
4. State your plan: the files you will change, the test you will write, and anything in
   the task you think is wrong or ambiguous. **Do not write code yet.** Wait for approval.
5. After approval: implement, then run `pnpm verify`. Paste the output.
6. Record the result in `docs/state` (slice plan, `task-status.json`, evidence) before any
   commit. Commit only with Ethan's approval and after cross-review, as
   `<type>(<scope>): <summary>` with `Task: $1` in the body.

Constraints for every task: `AGENTS.md` is binding. Do not edit ported markup or the
engine. If the task cannot be done without doing so, say so instead of doing it.
