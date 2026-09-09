---
description: Start a task from docs/TASKS.md with the right context loaded
argument-hint: <TASK-ID, e.g. T-12>
---

Work task **$1**.

1. Read `docs/TASKS.md` and find $1. If it does not exist, stop and say so.
2. Read every file the task's *Context* line names, and nothing else. Do not explore the
   whole repository — the task lists what you need on purpose.
3. Check the task's *Depends on* line. If a dependency is not marked done, stop and say
   which one blocks you.
4. State your plan: the files you will change, the test you will write, and anything in
   the task you think is wrong or ambiguous. **Do not write code yet.** Wait for approval.
5. After approval: implement, then run `pnpm verify`. Paste the output.
6. Commit as `<type>(<scope>): <summary>` with the task id in the body: `Task: $1`.

Constraints for every task: `AGENTS.md` is binding. Do not edit ported markup or the
engine. If the task cannot be done without doing so, say so instead of doing it.
