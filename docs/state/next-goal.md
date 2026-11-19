# Next goal — owner-page consistency, then the open audit items

Read current.md first. Deployed: #105 (`544fd96d`, version `c1ee2851`, 91 migrations / 186 functions). Scenarios A, B and C pass at the SQL layer; the public order form, pickup place, flavour removal, choice photos and the Option A glass owner dashboard are live. Preserve the glass look, Home signed cents, Customers/Sell and the secret email digests.

1. **HCB-018: one date format** across the live owner pages (Home, till, events, production) through one shared formatter on the shop's Manila clock; protected screens stay as they are. A ready brief is proposed as a session card in the orchestrator conversation.
2. **HCB-030: session expiring mid-work does not visibly end** (`src/lib/auth/live-gate.ts`); now unblocked by #102.
3. **HCB-032:** an order removed while open stays on screen; `RecordUnavailable` is unreachable.
4. **HCB-033:** 13–20 px checkboxes may fail WCAG 2.5.8 (24 px).
5. **Scenario loops in the browser:** drive A and C through the live UI on a local stack (signed-in owner, offline reload for C), building on the SQL proofs.

Owner and hosted gates (Ethan): show Cine the new look and features; checkout photo placement; shop accessibility needs a protected-markup decision (10 px `#a98a5f` text) and an iPhone input-zoom decision before `maximum-scale=1` changes; backup custody and a restore drill; physical iPhone and unaided-owner acceptance; open business rules (dough-count correction, display names, capacity counting items, churro cost). Housekeeping needs his OK: sync `main` to the deploy branch, close #85/#53/#50, ask GitHub Support to purge the pre-rewrite PR refs.

Method (19 November): one orchestrator conversation plans, reviews and merges; each goal runs in a fresh session with a complete brief, at most two at once (one database, one interface), Sonnet building and review depth set by risk (Sonnet `security-reviewer` for SQL, money, auth or offline). Use Node 24.20.0 / pnpm 9.12.3; before any push run `pnpm verify` and `pnpm format:check`; after a migration change also `scripts/test-db-security.py` and the scenario runners. No main merge, applied-SQL/protected-demo edits, arbitrary real-data writes, unapproved resources or schedules.

## Ready-to-paste next goal

```text
/goal Fix HCB-018: route every date the owner sees on the live pages (Home, till, events, production) through one shared formatter on the shop's Manila clock. Read AGENTS.md, docs/state/current.md, and only the HCB-018 entry in docs/audits/remediation-backlog-2026-11-06.md. Extend an existing date helper if one exists. Failing tests first (day, day+time, time; another device timezone gives the same text; never "Invalid Date"). Never touch protected screens. Builder: Sonnet (medium). Gates: pnpm verify, format:check, CI. Draft PR into agent/codex/MP-04-g1-feasibility. Finish with evidence, Token notes and Next.
```
