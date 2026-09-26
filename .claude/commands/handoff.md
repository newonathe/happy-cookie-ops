---
description: Write a session handoff note before context runs out
---

Under the [lean plan](../../docs/state/lean-plan.md), git plus two files are the handoff:

1. Commit and push whatever is accepted, with checks in the message (standing approval, secret scan first). Do not commit half-done work; leave it uncommitted and say so.
2. In `docs/state/next-goal.md`, rewrite the goal so a fresh conversation can continue from exactly where this one stopped: what is done (commit hashes), what is half-done and where, and the next action.
3. In `docs/state/current.md`, update only the status line for the package. Do not add checkpoint banners, per-slice plans or evidence receipts.
4. Add any gotcha that is not written down anywhere to `AGENTS.md` "Known traps", in one line.

Keep it under 150 words. Then tell Ethan to start a new conversation in the repo root and paste the goal.
