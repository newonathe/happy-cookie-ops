# Next goal — owner acceptance, then decisions only Cine can make

Read current.md first. Deployed: #118 (`b3c3126a`, version `96f5290a`, 91 migrations / 186 functions). Every backlog item that needs no owner decision and no hosted or physical step is fixed or verified as fixed (HCB-002/004/010/011/015/016/017/018/019/021/022/030/031/032/033/034/035/036/040/042/043/059/078/083). Preserve the glass look, Home signed cents, the shop card wording and the release gate.

1. **Cine's review** (19 November): her first answers are released (#120–#123, see current.md). Still waiting on her: the shop's closed hours, Instagram at checkout, box pricing and repeats, cut-out cookie images, café wholesale prices, and the review pack's decisions below. Record each answer in `docs/state/decision-register.md` as it arrives and turn the accepted ones into goals. The "Order a box!" page is being built on the existing box rule (cookies at their prices plus the box size's charge).
2. **Owner decisions** (`docs/state/decision-register.md`): helper Home (OD-04), refund reference (OD-02, HCB-008), close-day pre-fill (OD-01, HCB-009), undated orders in bake columns (OD-16, HCB-037), review steps for bazaar stock/fees and event cost (OD-06, HCB-050/051), full customer history (OD-11, HCB-054), supplier price comparison (OD-15, HCB-055), add/edit person (OD-08, HCB-057), shop accessibility (10 px protected text, iPhone input zoom), checkout photo placement, and the older business rules (dough-count correction, display names, capacity counting items, churro cost).
3. **Physical and hosted** (Ethan): physical iPhone and unaided-owner acceptance (HCB-070), backup custody off this PC and a restore drill, signed-in production performance with real data (HCB-077).
4. **Page-by-page pass** (HCB-041) once Cine has seen the look: controls before content, mixed form widths.

Housekeeping needs Ethan's OK: sync `main` to the deploy branch, close #85/#53/#50, ask GitHub Support to purge the pre-rewrite PR refs.

Method: one orchestrator conversation plans, reviews and merges; each goal runs in a fresh Sonnet session with a complete brief, at most two at once (one database, one interface); merge each PR into `agent/codex/MP-04-g1-feasibility` once CI is green, then check the release. Pinned Node 24.20.0 / pnpm 9.12.3; `pnpm verify` and `pnpm format:check` before any push; after a migration change also `scripts/test-db-security.py` and the scenario runners. No main merge, applied-SQL/protected-demo edits, arbitrary real-data writes, unapproved resources or schedules.

## Ready-to-paste next goal

```text
/goal Apply Cine's review answers: Ethan pastes her copied answers from the review pack. Record each decision in docs/state/decision-register.md (date, her words, the option chosen), then list the build goals they create, smallest first, each with files to read and a test. Read AGENTS.md, docs/state/current.md and only the named OD entries. No business figures or customer data in the repo (public). Builder: Sonnet (medium). Docs PR into agent/codex/MP-04-g1-feasibility. Finish with evidence, Token notes and Next.
```
