# Next goal — complete the actual refined application

**Active, 2 November 2026.** Preserve the entire original/hosted feature set while simplifying
operation in the actual codebase. Neutral light, Happy Cookie assets, purposeful hierarchy,
practical visual trackers and contextual automation remain required across every section.
This is implementation, not another mockup. The full goal is still incomplete.

## Entry point for Codex, Claude and other agents

Start in the repository root. Read AGENTS.md, [current.md](current.md), this file,
[the complete owner brief](../design/owner-workflow-brief.md) and
[implementation scope](../design/refined-workflows.md). CLAUDE.md imports AGENTS.md.
Inspect branch/worktree/stashes and actual source before acting. Do not rely on chat memory.
The old dated next goal was moved to current-history.md; it does not set today's order.

## Accepted implementation

Work on `codex/refined-workflows`. The owner frame, contextual Stock/count/supplier browsing,
Products library and direct saved-recipe reader have accepted slices. Recent commits:

- `26a6b69`: supported photo removal; `25e1343`: uploaded preview/form value update together.
- `9db4c75`: saved production read state, selected-drop scope and nullable plans.
- `3a1d844`: common-scale planned/baked/good/reject bars, honest missing plans and saved history.
- `61b7553`: neutral Bake plan integration, existing actions and protected fallback retained.

Latest application gate: pinned pnpm verify, 156 files /2709 tests pass +2 existing todo.
Four-width headless checks cover product/recipe return, production results, empty/failure/retry,
period scope, reduced motion and overflow. These use actual components with synthetic local RPC;
they are not hosted-write, database, selling-phone or owner-week acceptance.

## Immediate steering — hosted demo data

Ethan explicitly requested demo records and selected the **existing hosted Happy Cookie database**
on 2 November. This authorizes an additive demo load there; it does not authorize a reset,
overwriting real records, schema changes, messaging customers or deployment. The backend identified
in the verified hosted bundle is project `enftprwcsrdbnlplfrwk`. Read-only CLI schema/function
inspection and aggregate baseline are saved privately under gap-refinement/hosted-demo-*.
No demo business rows have been written. The hosted database already has operational records.

First ensure the real-source preview reads that database: localhost:4186 is a synthetic-data
component preview and will not reflect hosted inserts. Then prepare an identifiable, idempotent
demo manifest, exact expected effects, verification and scoped cleanup. Preserve current data,
settings, permissions and side-effect rules. SQL/money writes still need independent review;
Ethan previously chose to wait for the reviewer reset, reported Nov6 11:24AM, zone unspecified.
Do not bypass that wait through another account/provider or paid usage. Reconcile current access.

## Continue the full implementation

Start production still needs planned/manual entry → review → confirmation → authoritative result
and resulting stock, including when no orders need baking. The new charts do not fix that write flow.
Recipe kind/version saves and acknowledged product-save return also remain open; keep the legacy
recipe warning until the underlying issue is fixed and reviewed. Continue remaining Stock truth,
receiving/shopping, Bazaar, Sell/Shop, Money/Account, Home and integration under the complete brief.
Preserve every existing financial, role, offline and acknowledgement safeguard.

Price-editor work is isolated at stash `7f5924a1ab69fae6f3c88c23afcfdf944645b5d2`, base82a6015.
Read the private pending-review/context-prices/REVIEW-HERE.md before touching it. Do not pop it blindly.

## References and working rules

Private reference/evidence root:
`C:/Users/ethan/.codex/visualizations/2026/10/23/01a168b8-98ab-7872-9ec3-90530179bab5/`.
Read MAKE-CHECKPOINT.md for the latest operational checkpoint. Research and page-plan paths are
in the shared brief. The 59 pages, 238 branches and 224 automation groups describe planned coverage.
Agents elsewhere must receive needed private files separately; never invent missing evidence.

Use pinned Node24.20.0/pnpm9.12.3 and headless CLI Playwright. No Browser/Chrome-control plugins.
Keep localhost:4186 updating from actual source; localhost:4173 is only the reference mockup.
For a stopped component server, inspect private gap-refinement/app-qa/serve.cjs before starting it.
Preserve protected demo paths. One tested logical slice per commit, secret-scan then push this
feature branch only. No main merge, deploy, other hosted writes/resources, cutover, reversal or
release toggle without separate approval. Finish implementation before the separate phone/week gates.

Continuation: same chat if available, GPT-6.1 high, Plan mode off. Report accepted versus unfinished
work, review holds and proof limits in these shared files. Keep the complete goal active.
