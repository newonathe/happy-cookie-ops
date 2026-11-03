# Current state — Happy Cookie Ops

**Active, 3 November 2026:** finish the actual application on `codex/refined-workflows`.
Read the [complete shared owner/agent brief](../design/owner-workflow-brief.md),
[scope](../design/refined-workflows.md) and [next goal](next-goal.md). Claude/other agents use these
shared files. Keep all features/safeguards while simplifying operation; the full goal is incomplete.

Accepted source through `dacd216`: neutral owner frame/Stock/count/supplier return, Products/direct
saved recipes, contextual product editing/photos, saved production charts/history and now manual/
planned production entry. Entry retains quantities across navigation, checks recipe versions,
returns Cancel focus and continues an unfinished batch without replacing it. It records no actual
production. Legacy actual-count/review/result design and authoritative resulting-stock treatment
remain pending. Next dev now preserves the shared agent files (`0f908cb`).

The follow-up production slice protects unfinished batches from Quick add, work-row, first-work
and direct launches, including their counts, rejects, ingredient adjustments, note and review step.
The Bake plan explains an in-flight save instead of offering an ineffective Continue action.
Recording identity, stock calculations and acknowledgement behavior remain in the existing actions.

Pinned gate158 files /2730 pass +2 existing todo; prior live build passed28 static pages. Four-width
component/synthetic-RPC checks cover start/review/resume/reduced motion with no writes. Database,
hosted, physical-phone and owner-week proof remain separate. See commits for prior gate receipts.

Ethan's client-feedback download matches frozen v4 exactly; use its cleaner layout as a reference
while completing missing designs under the latest neutral Happy Cookie theme. Exact path/hash and
proof limits are in the shared brief. No broad audit/research repeat or mockup substitution.

Actual source runs at localhost:3000 with hosted data;4186 is synthetic component QA. Ethan approved
additive demo data in the existing database. The private40-row seed/cleanup draft has static checks
only; no load executed. SQL runtime/independent review remain pending. Preserve existing records.
Remaining scope includes safe recipe saves/save return, Stock truth/receiving/shopping, Bazaar,
Sell/Shop, Money/Account, Home and integration. Price editing stays isolated pending review.
No deployment/main merge or other hosted changes approved. The59-page/238-branch/224-automation
plan describes planned coverage. Older dates/cream below are historical; the complete goal stays active.

Read this page first in a new session. It is kept short on purpose.

| If you need                                        | Read                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The goal to run next                               | [next-goal.md](next-goal.md)                                                                                                                             |
| The plan, approved 5 October                       | [final-plan.md](final-plan.md), version 2                                                                                                                |
| The rules every agent follows                      | [AGENTS.md](../../AGENTS.md)                                                                                                                             |
| Ethan's and Cine's decisions                       | [decision-register.md](decision-register.md)                                                                                                             |
| How we build (loop, models, two tracks)            | [finish-plan.md](finish-plan.md) section 8, [lean-plan.md](lean-plan.md), [agent-orchestration.md](agent-orchestration.md)                               |
| Approved edits to locked files                     | [protected-exception.md](protected-exception.md)                                                                                                         |
| What was found: data, research, defects, interface | [sot-consolidation.md](sot-consolidation.md), [product-research.md](product-research.md), [system-audit.md](system-audit.md), [ux-audit.md](ux-audit.md) |
| Cine's trial checklist                             | [F2-owner-trial.md](F2-owner-trial.md)                                                                                                                   |
| Older checkpoints, verbatim                        | [current-history.md](current-history.md)                                                                                                                 |

## Historical status

The superseded 20 October snapshot, including its unresolved approvals and owner/device gates,
is preserved in [current history](current-history.md#archived-20-october-current-state-snapshot--superseded-3-november-2026).
Use the current brief and next goal above for implementation; do not reinstate old dates or release claims.
