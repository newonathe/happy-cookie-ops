# Next goal — F2: owner trial

One goal per package, in a fresh conversation opened in the repository root. Paste the
block below. Where things stand: [current.md](current.md). Earlier goals are in
[current-history.md](current-history.md).

| Setting     | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Coordinator | Whichever agent is available: Claude Opus, or Codex `gpt-6-sol` high                     |
| Workers     | At most two, pinned to a cheaper model (Claude Sonnet, Codex `gpt-6-luna`)               |
| Review      | One independent review for diffs touching auth, RLS, SQL, money or offline               |
| Tools       | Node 24.20.0 and pnpm 9.12.3 from `happy-cookie-tools`; headless command-line Playwright |
| Stop        | After two failed repairs on one issue, or 25 turns                                       |

```text
/goal Continue F2 from the latest pushed commit in
C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md, docs/state/current.md,
F2-owner-trial.md, F2-count-custody-device-preparation.md and ux-audit.md.
Do not restart setup, reimport the 804 financial rows or reformat evidence receipts.
Every green push to this branch redeploys the private trial: push only accepted work
and read each CI run.
1. UX review, first and before Cine starts her week: implement proposals 1, 2 and 4 in
   ux-audit.md (unprotected live layer and routing), with tests and Docker visual
   evidence. Proposal 2 must keep the backup facts visible to Ethan in System health
   and must not hide a real failure once backups are switched on. For proposal 3
   (phone dock), prepare the exact before and after and show Ethan before it ships;
   it needs the protected-exception record, validator reversals and a port audit.
   Proposal 5 is not being done. Run pnpm build:pages:spike before every push.
2. Cine's closed-shop week: record her sign-in on iPhone and MacBook, password change,
   seven dates, opening count, the six recipes as she weighs them, agreed test orders,
   the daily log and her feedback. Record only what people supply. Fix reproduced
   defects in small reviewed slices.
3. Physical-phone rehearsal before 20 October: selling offline, reopening offline,
   reconnecting once, no duplicates. It is the only Safari proof.
4. Watch Playwright issue 42775. When the WebKit run of OFFLINE-01 turns red, prepare
   the pinned upgrade and remove the WebKit branches, with a Docker run of the browser
   and visual suites, and ask before committing.
Historical stock reconciliation stays closed until dated counts, units and opening
balances exist. F2 incomplete and F3 closed until Cine accepts the week. Verify,
secret-scan, commit and push accepted slices. No new resources, shop opening, real
customers, production launch, business jobs, merge or automatic runner without explicit
approval. Finish with actual gaps and the next goal.
```
