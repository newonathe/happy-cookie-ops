# Next goal — make the gates reliable, then scenario A

Read current.md first. Deployed: #98 (`c9f9cac5`, version `7effbfc4-36e6-4e8a-bfff-d0b7b7d5687b`, 91 migrations / 186 functions). Public order form, pickup place, flavour removal, choice photos and the Option A glass owner dashboard are live on the trial. Preserve the glass look, Home signed cents, Customers/Sell and the secret email digests.

1. **Flaky unit test.** `tests/unit/sync-unavailable.test.ts` hits its 5 s timeout under load (three commit-hook failures on 19 Nov; Codex saw the same on 16 Nov). Find the slow first import and make it fast; never raise the timeout.
2. **Slow CI Browser flows.** About 30 min on the last releases instead of a few. Find whether tests retry, wait on timeouts or the runner is slow; a release now takes about 50 min.
3. **Scenario A end to end** (full-goal.md §8): order → payment verification → production → stock → pickup → books on a local reset (Postgres 17.6.1.166 image), linked synthetic records including a choice photo, a JSEC Ateneo pickup and a removed-then-restored flavour. No duplicate money/stock effects; no lost acknowledged record across reload and retry.
4. **Shop link for a signed-in owner:** `/shop` should always show the customer view.
5. **Shop accessibility** (Lighthouse 0.88 < 0.9): ported 10 px `#a98a5f` text and `maximum-scale=1`; protected markup rules apply.

Owner and hosted gates (Ethan): show Cine the new look and features; checkout photo placement; backup custody and a restore drill; physical iPhone and unaided-owner acceptance; open business rules (dough-count correction, display names, capacity counting items, churro cost). Housekeeping needs his OK: sync `main` to the deploy branch, close #85/#53/#50, ask GitHub Support to purge the pre-rewrite PR refs.

Use Node 24.20.0 / pnpm 9.12.3. Before any push run `pnpm verify` and `pnpm format:check`; after a migration change also `scripts/test-db-security.py`. Release by PR into the deploy branch only with Ethan's OK. No main merge, applied-SQL/protected-demo edits, arbitrary real-data writes, unapproved resources or schedules.

## Ready-to-paste next goal

```text
/goal Fix the flaky sync-unavailable unit test and the slow CI Browser flows job. Read AGENTS.md, docs/state/current.md and next-goal.md on agent/codex/MP-04-g1-feasibility. 1) tests/unit/sync-unavailable.test.ts: reproduce the 5 s timeout under parallel load, find the slow import or setup, make it fast without raising the timeout or weakening assertions. 2) CI Browser flows: from the last three deploy-branch runs, find where the ~30 min goes (retries, waits, runner) and cut it without dropping tests. Builder: Sonnet (high). Gates: pnpm verify, format:check, CI. Release by PR into the deploy branch only with Ethan's OK. Finish with evidence, Token notes and Next.
```
