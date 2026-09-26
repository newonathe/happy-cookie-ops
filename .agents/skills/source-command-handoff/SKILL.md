---
name: "source-command-handoff"
description: "Write a session handoff note before context runs out"
---

# source-command-handoff

Use this skill when the user asks to run the migrated source command `handoff`.

## Command Template

Update the current slice's `docs/state/MP-*-plan.md`, `docs/state/task-status.json` and the
"Current checkpoint" in `docs/state/current.md`, using `docs/master-plan/templates/checkpoint.md`
(`docs/SESSIONS.md` is historical). Cover, in under 200 words:

- what you were asked to do;
- what is actually done and verified (with the `pnpm verify` result);
- what is half-done, and exactly where you stopped;
- anything you learned that is not written down anywhere yet — a gotcha, a wrong
  assumption in the docs, a file that was not where the docs said;
- the single next action, phrased so a fresh session can start from it with no other
  context.

Then say what should be added to `AGENTS.md` or `docs/PORTING.md` so the next session
does not rediscover it. Keeping those files true is part of the work.
