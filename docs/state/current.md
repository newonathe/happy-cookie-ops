# Current state — Happy Cookie Ops

**Active again at Ethan's request, 3 November 2026.** Full actual-app goal remains incomplete.
Read the [active Bazaar and parallel production audit/plan](../design/active-bazaar-parallel-production-plan.md).
Events must remain reachable during an active bazaar; different products need simultaneous production.
Both gaps were reproduced with controlled RPC fixtures. Active-Events navigation is now a local
uncommitted draft: both tills expose Events, own-day resume preserves selling values, and full-session/
owner access is checked at action and render. The directory filter survives child Back; the held day
stays pinned outside its planned dates. CLI browser round trips passed320/390/768/1240 with no writes.
Main till/Events/event addresses now restore through RouteSync without remounting. Back/Forward,
direct directory and event reload pass390/1240 with synthetic RPC. Plan/review subview identity,
focus/scroll return and parallel production remain incomplete. Pinned full gate passes165 files /2762
tests +2existing todo with four Vitest workers; live Webpack build passes28 static pages.
Local preview recovered after further user-reported failures: fixed retained-renderer lookup binding,
added a network-only development worker and local recovery page, and limited extension hydration
compatibility to the outer body. The private preview launcher now uses Webpack. Ethan confirms
Chrome opens after this restart/recovery; that is opening evidence, not full owner acceptance.
All current changes remain uncommitted pending independent review; Ethan's reviewer-reset wait
remains in force. Branch `codex/refined-workflows`, accepted HEAD `ea745af`.
Read the [complete shared owner/agent brief](../design/owner-workflow-brief.md),
[scope](../design/refined-workflows.md) and [next goal](next-goal.md). Claude/other agents use these
shared files. Keep all features/safeguards while simplifying operation; the full goal is incomplete.

Accepted source includes neutral owner frame/Stock/count/supplier return, Products/direct
saved recipes, contextual product editing/photos, saved production charts/history and now manual/
planned production entry. Entry retains quantities across navigation, checks recipe versions,
returns Cancel focus and continues an unfinished batch without replacing it. It records no actual
production. Next dev now preserves the shared agent files (`0f908cb`).

The follow-up production slice protects unfinished batches from Quick add, work-row, first-work
and direct launches, including their counts, rejects, ingredient adjustments, note and review step.
The Bake plan explains an in-flight save instead of offering an ineffective Continue action.
Recording identity, stock calculations and acknowledgement behavior remain in the existing actions.

`dd4df87` retains blank/invalid actual-count drafts with the batch and guards stale callbacks.
The live batch slot now has neutral focused count/review screens, total-made/reject fields,
planned/actual and good/reject bars, existing ingredient adjustments/shortages and a visible saving
state. Catalogue balances retain their actual units; missing balances say unavailable. Confirmation
uses the existing action. Dedicated acknowledged results, stock refresh truth, recipe snapshot and
uncertain-save/reload recovery remain incomplete; do not claim the entire production flow finished.

Preview repair: Ethan reported a live Chrome crash when restored sales named products absent from
the current catalogue. A live-only synchronous label adapter now protects the locked sales view;
it leaves sales, amounts, queue and sellable catalogue unchanged. Regression reproduced the exact
2433 `P[k].short` failure first, then passed across seven destinations. ClickUp's injected body class
caused a separate hydration warning; extension access must be adjusted in Chrome, not hidden globally.
Ethan confirmed Chrome opens after that repair. A subsequent shared-button border warning was
reproduced: hover removal and press/focus layering mixed border shorthand with borderColor.
Pressable now expands canonical border layers consistently on server/client; pointer/focus
regressions and a hydration check pass. The protected Home markup and visual values are unchanged.

Full pinned gate:162 files /2743 pass +2 existing todo at7c07008. One initial full run hit the
existing clock source-scan5s timeout; that file14tests and an unchanged full retry passed. No test
assertions/timeouts were weakened. Home hover/leave at390/1240 has no console/page errors.
Prior live build atf112693 passed28 static pages. Four-width
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
plan describes planned coverage. New owner requirements extend that plan, not the completion count.

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
