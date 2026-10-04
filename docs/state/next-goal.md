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

Known carry-overs: target owner/refresh and PG17 MAINTAIN checks now pass; private-origin/human/device and broader session scenarios remain open. `format:check` and WebKit E2E on main remain known red. No merge to main while its required checks fail. F1 off-device custody, archive expiry and hosted activation are documented approval decisions, not configured production protection.

## Historical continuation after the accepted caption slice — 3 October

Reuse bdd83f6, the six-file accepted caption slice and technicalContinuation in evidence/F2-trial.json. Fresh local checkout/owner UI, CSV/P&L and phone/desktop caption evidence now pass; preserve earlier setup failures and explicit local timestamp/sequence side effects. Do not restart the audit or repeat the harness without a changed source or unresolved concern.

Next continuation goal: finish F2 trial-target preparation and Cine's actual week. Obtain Ethan's explicit approval for the concrete isolated Supabase project/schema/catalogue/owner account and fresh Workers release in F2-trial-setup.md, and separately record permitted customer/data/payment/shop-opening scope. Then verify the approved target, secure access, manual backup/custody/recovery and all seven actual dates with Cine's acceptance. Hosted jobs, imports, merge and runner remain off. Actual-phone evidence and original OFFLINE-01 must both pass by 20 October; F2 stays incomplete/F3 closed until real-week acceptance.

## Current continuation — 4 October

Reuse accepted85f6bc6, be1e115 and disabled upload3188360e. Token validity and
scoped Access APIs now pass; no further token change or onboarding request is
needed. The owner-only email-code gate is created with independently accepted
scope and fresh application/policy/IdP GETs. Pre-enable browser login ends404;
retain disabled canonical/preview entry points until verified activation is accepted.
Resolve the harness preflight from retained HTTP evidence, verify anonymous
app/static/owner-route denial, then hand over credentials securely and confirm
Cine sign-in. Real-data/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete/F3 closed; original OFFLINE-01 and
actual-phone rehearsal both must pass by20October.

Historical diagnosis: before08:00 Manila4October, token verify200 carried future
warning10002 and Access APIs401. That snapshot is preserved in the receipt; it
is resolved by current GET200 and was not proof of missing Zero Trust setup.

## Latest continuation — 4 October, resumed at user request

The scheduled current-chat follow-up was deleted; no automatic product runner is active.
The saved replacement token is now usable: token, scoped Access applications, organization
and identity-provider GETs all return200. The initial future-token warning10002/401
diagnosis is historical and preserved, not a current credential blocker.

An independently reviewed exact-hostname private gate is created: one approved owner
email, one-time PIN only, one reusable Allow policy, eight-hour sessions; no wildcard,
bypass or service-token access. Fresh application/policy/IdP GETs match. The owner
identity and temporary password remain outside Git; a clipboard handoff helper is prepared
privately but has not run. No authentication email was sent.

The Worker remains disabled, including preview URLs: pre-enable browser login did not
reach an email field (initial direct redirect400; relative redirect ends404). A local
null-array check was corrected without duplicate resource creation; installed Playwright
import was corrected. These are verification-harness setup failures, not app repairs.
No Enable stage ran; explicit disabled readback passes after the failed preflight.
Activation, live anonymous/static/owner-route proof and Cine sign-in remain unverified.
No further login repair is attempted in this checkpoint. Reuse accepted be1e115,
caption85f6bc6, uploaded3188360e and all existing local financial/visual evidence.

Next goal: resolve the private-login preflight from its retained HTTP redirect evidence,
obtain independent activation acceptance, then verify the private origin and hand over
owner credentials securely. Real-week/customer/payment/shop-opening and custody/recovery
permissions remain separate. F2 incomplete, F3 closed; actual-phone rehearsal and the
unchanged failing OFFLINE-01 both must pass by20October. Jobs/imports/merge remain off.
