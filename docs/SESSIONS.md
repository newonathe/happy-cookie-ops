# Session log

Appended by `/handoff` at the end of a working session. The point is that a fresh session
can start from the last entry with no other context — and that a gotcha discovered once is
never rediscovered.

Keep entries short. If something belongs in `AGENTS.md` or `docs/PORTING.md` instead,
put it there and note here that you did.

---

## 2026-09-09 — state coverage handoff

Added [state coverage](state/state-coverage.md) and its CSV ledger, mapping the 25 route fixture IDs, five valid sheet guards, offline/runtime-sync failures, and audit01 accessibility, clipping and review-chrome gaps to exact future MP owners from traceability. The ledger distinguishes layout coverage, actually exercised fixtures, known failing release journeys and NOT YET EXECUTABLE evidence. Docker visual candidate comparison and cloud preview outcomes remain pending; see [current state](state/current.md), [continuation](state/continuation.md) and the later [visual review](state/visual-review.md). No product code, historical plan or generated task status was changed.

## 2026-09-04 — the port, and the operating layer

**Asked** Turn the prototype into a production frontend, 1:1, handoff-ready for Claude
Code and Codex working in tandem.

**Done** The repository as it stands: engine ported verbatim, 24 screens and 29 sheets
translated mechanically, typed contract, Supabase schema with default-deny RLS, real
offline queue, error boundaries, tooling, CI, Docker. Then the agent layer: `AGENTS.md`,
`.claude/` hooks and subagents, `docs/WORKFLOW.md`, `docs/TASKS.md`, `docs/CONTRACTS.md`,
and `scripts/check-port-integrity.mjs`.

**Not done** Nothing has been executed. `pnpm install` has never run in this repository,
so the whole thing is unverified against a real toolchain.

**Learned** Written up in `docs/BUILD-LOG.md` — the hydration trap, sale ids not being
idempotency keys, capacity needing database enforcement, order numbers not being
credentials. The one worth repeating: the 1:1 constraint was easier to satisfy mechanically
than to satisfy by discipline, which is why the port guard exists.

**Next action** `/task T-01`. Nothing else matters until `pnpm verify` and
`pnpm test:e2e` are green.

---

## 2026-09-05 — build-readiness audit

**Asked** Find every error and bug; make the repository build-ready.

**Done** Static audit of the whole repository. Eight defects found and fixed, written up
in `docs/BUILD-LOG.md` under "Build-readiness pass". The two that would have stopped work
immediately: `pnpm lint` still called `next lint`, which Next 16 removed, and two unit
tests were wrong — one asserted a false ordering of `dropCycle`'s keys, the other was a
tautology. Also fixed `dropCycle`'s declared return type, a useless `useCallback` in
`Pressable`, a missing `.prettierignore`, a Windows path bug in the port guard, and 25
files quoted against their own prettier config.

The prototype's standalone export (`The Happy Cookie Ops.html` in the design project) was
throwing `DCLogic is not defined`; it was re-bundled with the thumbnail template the
bundler requires, and now renders clean.

**Verified** The port-integrity gate passes on all 54 ported files after every edit.
Imports all resolve, no hooks outside `'use client'`, no service-role key reachable from a
client module, no unused imports in the generated components, and every name the screens
destructure exists in `OpsVals` (314 keys).

**Still not run** `pnpm install` has never executed. Everything above is static analysis,
which finds wrong types and wrong tests but not a wrong version resolution.

**Next action** `/task T-01` from `docs/prompts/01-foundation.md`. It is written to expect
type errors in the type layer and to refuse to fix them by touching ported markup.
