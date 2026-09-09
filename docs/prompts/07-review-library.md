# Phase 07 — The review library

Run these against every diff, in the **other** model from the one that wrote it. A model
reviewing its own work agrees with its own reasoning; the value is in the fresh context,
not the checklist.

Open the reviewer read-only (`codex --profile review`) so it cannot quietly fix what it
was supposed to report.

---

## R-01 — General diff review

Use for every change.

> Review `git diff main...HEAD` as the engineer who has to maintain this after the author
> leaves. You did not write it and you owe it no loyalty.
>
> Read `AGENTS.md` for the rules, and the matching task in `docs/TASKS.md` for what was
> actually asked. Then check, in this order:
>
> 1. **Does it do what the task said?** Compare against the task's acceptance criteria
>    literally. Name anything the task asked for that is missing.
> 2. **Edge cases.** Empty state, zero, one, the maximum. Offline. Two devices. A slow
>    network. A rejected write. A user tapping twice.
> 3. **Port rules.** Run `node scripts/check-port-integrity.mjs`. Any ported markup
>    touched? Any copy string changed? Any inline style removed? If
>    `scripts/port-baseline.json` changed, is there a stated reason?
> 4. **Money.** Pesos vs centavos. Rounding. Any float in a ledger path. Any price or
>    total taken from a client.
> 5. **Security.** Unvalidated input. A role trusted from the client. A service-role key
>    reachable from a `'use client'` module. A new table with no RLS policy.
> 6. **Offline.** Could this drop a queued sale, or clear one the server did not
>    acknowledge by `clientId`?
> 7. **Tests.** Does a new test exist that fails without the change? Or is it asserting
>    its own mock? Would it catch a regression, or just re-state the implementation?
> 8. **Size and shape.** Is the diff doing more than one thing? Are the commits
>    individually revertable?
>
> Output a numbered list. Each finding: file, line, what is wrong, why it matters, and a
> tag — `blocker`, `should-fix`, or `nit`.
>
> If you find nothing, say "no findings". Do not invent nits to look thorough. An invented
> nit costs a real review cycle.

---

## R-02 — Security review

Use for any diff touching auth, RLS, an API route, money, or the offline queue.

> You are reviewing a one-person bakery's operations app: her private books, a public
> shop, and a till that works offline. Rank threats by what they cost her, not by CVSS.
>
> Read `docs/DATA.md` and `supabase/migrations/`, then check `git diff main...HEAD`:
>
> 1. **RLS.** Any new table with RLS disabled. Any policy with `using (true)` that is not
>    `products` or `drops` (deliberately public — the shop is public). Any table in the
>    schema but absent from `docs/DATA.md`, meaning nobody reviewed it.
> 2. **Role trust.** A role read from the client, from a request body, from engine state,
>    or from a header, and then used for authorisation. The only trustworthy source is
>    `profiles` via `auth.uid()`. Trace it, do not assume it.
> 3. **Input validation.** Every route handler must parse its body with Zod before use. Any
>    raw `request.json()` value reaching a query is a finding.
> 4. **Key exposure.** `SUPABASE_SERVICE_ROLE_KEY` in any module reachable from a
>    `'use client'` file, or in a `NEXT_PUBLIC_` name. Follow the import chain by hand.
> 5. **Enumeration.** Can an order id, phone number or customer name be discovered without
>    both factors? Does a wrong phone return a different response from a nonexistent
>    order? A different status code, a different latency, a different message body — all
>    count.
> 6. **Money.** Prices or totals from the client rather than the catalogue. Float
>    arithmetic near the ledger. A ledger row updated or deleted rather than corrected.
> 7. **Idempotency.** Any change to `/api/sync` or `sync_event_sale` that could
>    double-count or drop a sale.
> 8. **Logs.** Sale contents, phone numbers, names or references in a log line.
> 9. **Rate limits.** Every public endpoint. An unlimited one on a hobby-tier database is
>    a denial-of-service.
>
> For each finding: severity (`critical`/`high`/`medium`/`low`), file, line, **the
> concrete attack** — the actual sequence of requests — and the fix. If a finding is
> theoretical for this app, rank it low and say why rather than padding the list.
>
> End with an explicit verdict: **SAFE TO MERGE** or **BLOCKED**, and if blocked, the
> single thing that must change.

---

## R-03 — Port fidelity review

Use for any diff touching `src/components/` or the engine. In Claude Code:
`> use the port-auditor subagent to review this diff`.

> Verify fidelity against `docs/reference/prototype.dc.html`.
>
> 1. Run `node scripts/check-port-integrity.mjs` and report the output verbatim.
> 2. For each changed file under `src/components/`, find the corresponding region in the
>    prototype (screen key → file name, per `docs/PORTING.md`) and compare: element order,
>    copy strings, style values, conditional structure.
> 3. For engine changes: confirm the change is in a subclass, not in
>    `src/store/engine/ops-engine.js`, and that no user-visible string moved.
>
> Report as a table: file, what the prototype has, what the code now has, and whether it
> looks deliberate. Fix nothing.
>
> Do not soften a finding because the change looks like an improvement. An improvement is
> still a difference, and the owner approved the original.

---

## R-04 — Test quality review

Use when a diff adds tests, and after phase 03 in particular.

> Review the tests in `git diff main...HEAD`. A bad test is worse than no test: it costs
> maintenance and buys false confidence.
>
> For each new test:
> 1. **Would it fail if the behaviour broke?** Say how you know. If you cannot tell, that
>    is the finding.
> 2. **Is it asserting its own mock?** A test whose subject is mocked tests nothing.
> 3. **Is it coupled to internals** — private fields, implementation details, call order?
>    Those break on refactor and teach nothing when they do.
> 4. **Is the assertion specific?** `expect(result).toBeTruthy()` on a money calculation
>    is not a test.
> 5. **Does it name a behaviour** rather than a function?
> 6. **Exact strings** for anything customer-visible? `₱1,200` and `₱1200` are different
>    receipts.
> 7. **Is a rule from `docs/reference/spec/03-business-rules.md` covered, or only the
>    happy path the implementation happens to take?**
>
> Then the coverage question that matters: name three ways the changed code could break
> that **no** test in this diff would catch.

---

## R-05 — Pre-merge checklist

Run yourself, on every PR, before merging. Seven items; all of them, not five.

1. `pnpm verify` green — port integrity, types, lint, unit.
2. `pnpm test:e2e` green.
3. A test exists that fails without this change. You checked, by breaking it.
4. The diff does one thing and is under ~400 changed lines.
5. Anything learned is written into `AGENTS.md`, `docs/PORTING.md` or `docs/TECH-DEBT.md`
   in the same PR.
6. A different model reviewed it and every blocker is resolved.
7. **You read the diff.** Not the summary of the diff.

If Claude is producing code faster than you can review it, you are accumulating risk, not
progress. Slow the agent, not the review.
