# Next goal — public order form, then the Cloud handoff

Read current.md first. Deployed: release #93 (`ec7ed6c0`, version `6f158842`, 91 migrations / 186 functions). Pickup place, flavour removal and choice photos are live on the trial; Cine has not yet used them unaided. Preserve the released light palette/layout, Home signed cents, Customers/Sell and secret email digests.

1. **Public order form (PR #89, `2dd13539`).** The exact narrow Access cutover is approved; the operator app ID is still missing (repository variable `TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID` empty). When it arrives: update #89 from the deploy branch, set the variable, verify anonymous customer routes/assets and private owner denial, then release through a PR into the deploy branch. Do not ask for the same approval again.
2. **Checkout photo placement (owner's call).** The choice photo renders above its label; propose one whole-screen layout for the add-ons block if Cine wants it beside the name.
3. **Cloud handoff.** Reconfirm in chat that Ethan wants private context published to the public repository before preparing it; credentials, customer records, backup bytes and memory stay out.
4. Then the highest-priority unblocked full-goal slice (see full-goal.md). Physical iPhone, unaided Cine, backup custody/restore drill and full-product acceptance stay open.

Use Node 24.20.0 / pnpm 9.12.3. After any migration change run `scripts/test-db-security.py` and `pnpm format:check` as well as `pnpm verify`. No main merge, applied-SQL/protected-demo edits, arbitrary real-data writes, unapproved resources or schedules.

## Ready-to-paste next goal

```text
/goal Finish the public order form (PR #89). Read AGENTS.md, docs/state/current.md and next-goal.md on agent/codex/MP-04-g1-feasibility. Precondition: Ethan has supplied the Cloudflare Access app ID; if not, stop and ask him for it with click-by-click steps. Update #89 from the deploy branch, set TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID, verify anonymous /shop, checkout, status and lookup plus their assets load without login, and every owner path stays denied. Builder: Sonnet (high). Review: Sonnet security-reviewer (high). Gates: pnpm verify, format:check, E2E, CI. Release by PR into the deploy branch only with Ethan's OK. Finish with evidence, Token notes and Next.
```
