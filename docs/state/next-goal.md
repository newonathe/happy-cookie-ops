# Next goal — F2: owner trial

The approved forward plan is [finish-plan.md](finish-plan.md), section 6. F1 is accepted locally; hosted jobs remain inactive. Start one new conversation in `C:/Users/ethan/dev/happy-cookie-ops-g0` and paste the goal below. Codex only; no Claude or paid API fallback.

## Session settings

| Setting | Value |
| --- | --- |
| Coordinator and sign-off | Codex `gpt-6-sol` · high |
| Bounded implementation workers | Codex `gpt-6-luna` · medium; at most two active workers |
| Independent review | Sol/high for Luna changes involving SQL, auth, money or offline; Luna/medium for bounded root changes; port auditor for protected contracts |
| Plan mode | Off after a short initial plan; the approved goal authorizes local work |
| Permissions | Current session permissions; hosted writes, resources, deployment and merge need Ethan's explicit approval |
| Browser QA | Headless command-line Playwright only; never Browser/Chrome-control plugins |
| Toolchain | Node 24.20.0 / pnpm 9.12.3, pinned tools on PATH; `pnpm.cmd` on Windows |
| Stop budget | Two failed fixes or 25 turns; checkpoint and stop at the boundary |

Read `AGENTS.md`, `docs/state/current.md`, `finish-plan.md` sections 6 and 10, `F1-operations.md`, and `evidence/F1-acceptance.json`. Reuse verified F1 evidence; do not restart the repository audit. Record the trial package under historical `MP-26` in task-status.json and identify its approved finish-plan name as F2.

```text
/goal Complete F2: owner trial (finish-plan.md section 6, MP-26).

Codex only. Coordinate and sign off with gpt-6-sol/high; use economical,
bounded workers and independent review where required. At most two active
workers. Stop after two failed fixes or 25 turns.

Prepare a practical checklist for Cine to operate one real week in the
app: menu and shop window, order/payment/packing/collection, stock and
production, expenses/P&L/CSV, and health/alerts. Include the approved
bazaar/offline pilot checks where applicable. Keep a dated fix list with
reproduction, severity, owner feedback and proof of each resolution.

Run full E2E and headless phone/desktop visual QA for affected flows.
Record WebKit OFFLINE-01 honestly; do not call its suite green. Physical
phone evidence must come from the actual device, including the pilot
gate before 20 October. Automated phone-sized Chromium is separate proof.

Complete the real-week trial using Cine's recorded checklist and feedback
on an explicitly approved target. If account access, target approval or
owner participation is missing, finish the concrete local preparation,
record what remains, and request the missing input. Do not substitute a
prepared checklist or synthetic tests for completion of the real trial.

Make bounded fixes only where reproduced evidence requires them. Preserve
locked UI, applied migrations and queued-sale acknowledgment rules.
Run required affected gates, independent risky-change/port review and
visual QA; secret-scan, commit accepted slices and push the working branch.

F1 hosted schedules stay inactive. Do not deploy, merge, activate jobs or
create hosted resources without Ethan's explicit approval. Keep F3
cutover, imports and legal/accounting decisions separate from this trial.

Update current.md, task-status.json and the trial checkpoint. Advance to
F3 only when the real week, checklist and required acceptance evidence
are complete. No automatic runner.
```

Known carry-overs: hosted signed-in probes need Ethan's test account; local Postgres 17/MAINTAIN hardening is still separate work; `format:check` and WebKit E2E on main remain known red. No merge to main while its required checks fail. F1 off-device custody, archive expiry and hosted activation are documented approval decisions, not configured production protection.
