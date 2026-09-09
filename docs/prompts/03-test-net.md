# Phase 03 — The test net

The next phase moves a year of bookkeeping into Postgres. This phase is what will tell you
if that broke something. Written before the migration, not after, because a test written
after a migration tests what the migration did rather than what the business needs.

The prototype was the acceptance test for every rule in here. It still runs — open
`docs/reference/prototype.dc.html` in a browser when a test's expected value is unclear.

---

## T-07 — Money and rounding

**Give it to** Codex · **Depends on** T-01 · ~half session

**Context** `tests/unit/money.test.ts`, `docs/reference/spec/03-business-rules.md`, `src/store/engine/ops-engine.js` (read only)

### The prompt

> Extend `tests/unit/money.test.ts` to cover every money path in
> `docs/reference/spec/03-business-rules.md`. Currently only formatting and pluralisation
> are covered.
>
> Cover:
> - **box pricing** in both modes — sum of menu prices, and the flat box price;
> - the **packaging fee** (₱38.44) and where it does and does not apply;
> - **discounts** — every kind the prototype supports, including a full freebie;
> - **change due**, including tendering the exact amount and over-tendering;
> - **refunds** — full and partial, and what the ledger shows afterwards;
> - the **peso ↔ centavo boundary**: for every price in the seeded catalogue, assert
>   `pesos → centavos → pesos` is lossless, and that no intermediate value is a
>   non-integer number of centavos.
>
> Method:
> - Test through the engine's exported functions and `renderVals()`. Never reach into
>   private fields — a test coupled to internals will break on the migration and teach you
>   nothing when it does.
> - Where the spec and the code disagree, **the spec wins and you report the difference**.
>   Do not write a test that codifies a bug.
> - One behaviour per test. Name each one as a sentence about the behaviour, not the
>   function: `it('charges the packaging fee once per box, not per cookie')`.
> - Assert exact strings for anything customer-visible. `₱1,200` and `₱1200` are different
>   receipts.
>
> Do not change the engine. If a test reveals a bug, report it and stop — that is a
> finding, and it is worth more than the fix.

### Accept when

- Every money rule in the spec has at least one test.
- `pnpm test` green, and each new test fails if you deliberately break the rule it covers.
  Check that — a test that passes against a broken implementation is worse than no test.

---

## T-08 — The engine rules that have no tests

**Give it to** Codex · **Depends on** T-07 · ~2 sessions, one commit per rule

**Context** `docs/reference/spec/03-business-rules.md`, `src/store/engine/ops-engine.js` (read only), `tests/unit/`

### The prompt

> About 80 engine methods have no unit test. They are currently covered only by the
> 25-route render test, which proves they do not throw and nothing else.
>
> Work through `docs/reference/spec/03-business-rules.md` and write tests for:
> 1. **spoilage** — what is written off, when, and what the ledger shows;
> 2. **the stock-count reconciliation** — a count that differs from the expected on-hand;
> 3. **no-shows** — an uncollected order at the end of a pickup window;
> 4. **overage** — more baked than ordered;
> 5. **the closeout** — the end-of-drop sequence and what it must produce;
> 6. **the drop state machine** — every legal transition, and that illegal ones are
>    refused rather than silently ignored.
>
> **One commit per rule.** Six commits. That is what makes a wrong one revertable without
> losing the other five.
>
> Same method as T-07: observable behaviour through `renderVals()`, the spec wins over the
> code, one behaviour per test, exact strings for anything the owner reads.
>
> For the state machine specifically: enumerate the transitions as a table in the test, so
> the next person can see the whole machine in one screen. Assert both directions — that
> legal transitions work **and** that illegal ones are refused.
>
> Do not change the engine. Collect every discrepancy between spec and code into one
> report at the end.

### Accept when

- Each of the six rules has at least one test asserting observable behaviour.
- Six commits, each independently revertable.
- Discrepancies reported, not silently accommodated.

### Stop if

- A rule in the spec has no corresponding code at all. That is a missing feature, not a
  missing test, and it needs a task of its own.

---

## T-09 — The offline queue under real failure

**Give it to** Claude Code · **Depends on** T-05 · ~half session

**Context** `docs/OFFLINE.md`, `src/lib/offline/`, `tests/e2e/bazaar-offline.spec.ts`, `public/sw.js`

### The prompt

> The offline queue holds money that has already changed hands. Prove it survives every
> failure a bazaar actually produces.
>
> Playwright cases, each asserting against **IndexedDB**, not the screen — the screen can
> be repainted from memory, the queue is what survives a dead battery:
>
> 1. Sale taken offline, tab reloaded → the sale is still queued, exactly once.
> 2. Server accepts two of three and rejects one → the two are cleared, the rejected one
>    stays queued and is marked failed with its error.
> 3. Server returns 500 → nothing is cleared.
> 4. Server returns 200 with an **empty** `accepted` array → nothing is cleared. This is
>    the case that catches "we assumed a 200 meant success".
> 5. Two sales posted with the same `clientId` → one sale server-side, and the device
>    clears it once.
> 6. Tab closed while offline, reopened online → the queue flushes.
> 7. Ten sales taken offline in quick succession → ten queued rows, ten distinct
>    `clientId`s, no collision.
>
> For each case, state the invariant it protects in a comment. A test whose purpose is not
> written down gets deleted by someone in a year.
>
> If any case reveals that a sale can be dropped, **stop and report it as critical**. Do
> not fix it inside this task — I want to see the failing test first.

### Accept when

- All seven cases pass.
- No path exists that removes a sale the server did not name in `accepted`.
- `pnpm test:e2e` green on both the phone and desktop projects.
