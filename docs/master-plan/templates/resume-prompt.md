# Resume after interruption or quota reset

Task: `{{task_id}}` · Prior run/session: `{{run_id}}` / `{{session_id}}`

Read current user instructions and MASTER-PLAN first, then the latest durable checkpoint and events after it. Verify project/worktree/branch, dirty files, task dependencies, active decisions and code/schema hashes. An old provider conversation is context only; the journal/Git/evidence establish actual state.

Do not repeat an external action with a recorded intent but no result. Query its state using its operation/idempotency ID and reconcile before proceeding. Check no old process still owns the task; respect the supervisor lease/fencing token. Preserve unsaved work and unrelated edits.

Verify current subscription-only eligibility and exact included model/effort; no API-key billing, extra credits or permission bypass. A reset time passing is not proof of available quota. If authorization/input is unresolved, keep it pending. If current state differs materially, update the checkpoint and plan the smallest safe recovery.

Resume only the next bounded action already authorized. Run affected checks, record outcome/evidence and write a fresh checkpoint. If the old session cannot resume, use this packet in a new session and record its ID; never choose a different project's last session.
