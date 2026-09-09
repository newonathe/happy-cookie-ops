# Independent review

Task/slice: `{{id}}` · Base/candidate: `{{base_sha}}` / `{{candidate_sha}}`

Read the actual diff, relevant source, requirements/DP decisions and test evidence. Treat the implementer's summary as a hypothesis. Review read-only unless separately assigned a fix. Preserve others' edits.

For auth, SQL, money, inventory or offline changes, trace actor → boundary validation → transaction/grants → source records → view projection → failure/retry/recovery. Try direct API/SQL bypass, stale version, duplicate/modified idempotency key, lost acknowledgment, interrupted local commit and role downgrade where relevant. Check deployed migration history assumptions and the UI/UX lock. For a port change compare exact prototype/approved exception and Docker visuals.

Report only actionable findings with priority, exact file/line, trigger, consequence, supporting evidence, smallest fix and regression test. Separate observed defect from untested risk. Do not mark a check passed because another model says so. End with explicit blockers and remaining required tests; no confidence percentage or blanket security certification.
