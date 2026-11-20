# Next goal — café page, live sync, end-to-end proof

Read current.md first. Deployed: #136 (version `39652258`), hosted migrations through 095. Plan: `C:\Users\ethan\.claude\plans\cozy-plotting-lantern.md` (approved 19 November). Work runs the GOAT way (rule 13 of `docs/state/agent-orchestration.md`): one orchestrator, fresh Sonnet sessions per goal, verification by risk, each migration applied right after its PR merges.

1. **Café page** (#137 + PR 2, migrations 096–097): café sales as a manual bulk sale log with expenses on its own Café tab; needs Ethan's OK for the one-word `SCREENS` exception in `ops-engine.js`.
2. **S4 live sync** (migration 098): Supabase Realtime on the open day's sales, voids, stock adds and losses; the till and the event page re-read `get_bazaar_day` on change.
3. **Scenario D** (`tests/e2e-scenarios/scenario-d.spec.ts`): two devices and a helper, end to end.
4. Interface backlog: HCB-041 page pass, HCB-020 overflow.

Ethan (hosted, when he chooses): Ordering closes Sunday 9:00 AM; deploy `create-helper-account`; second Access app for `/bazaar` and `/sign-in`; physical iPhone; backup off this PC.

## Ready-to-paste next goal

```text
/goal S4 live sync (migration 20260101009800): add the open day's event_sales, voids, bazaar_stock_adds and bazaar_losses to the supabase_realtime publication (RLS already limits rows to owner/active helper); the till and the event page subscribe to the open day and re-read get_bazaar_day (debounced) on change and on reconnect; no subscription on customer pages. Read AGENTS.md, docs/state/current.md, docs/OFFLINE.md, rule 13 of docs/state/agent-orchestration.md. Sonnet high, full verification (SQL proofs, security-reviewer, two-context browser check). READY PR into agent/codex/MP-04-g1-feasibility. Finish with evidence, Token notes and Next.
```
