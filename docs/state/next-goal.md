# Next goal — S3.1 bazaar hardening (continue; planned, not built)

Stopped 14 October at the turn cap after the audit check and the plan. **Nothing is built, nothing applied.** Run as one `/goal`
in a fresh conversation, Opus to plan and sign off, Sonnet to build. Session: auto mode on, effort high, no plan mode needed.

**Confirmed (read, not run):**

- "Send again" re-sends a refused sale and it is refused again.
- A void is its own `void:` row and never clears the sale row.
- In `record_event_sale` (004700), the duplicate lookup comes before the 55000/42501/22023 refusals, and the pending-void lookup after them.
- So one refused sale blocks the close for ever (M2).

```
/goal S3.1 bazaar hardening in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md, docs/state/next-goal.md (this
plan), bazaar-run-sheet.md rules 1 and 6. Migration 006700 by line range only. Order, committing each green piece:
1 M2 client: queue rows gain `refused` (set by markFailed only when outcome.permanent; sync.ts passes it); new
  unsentForEvent(eventId) -> {blocking, refused} (a void maps to its sale row's event; an orphan void blocks);
  dropClosedDay and countUnsent use .blocking; pendingSales/pendingCount unchanged; the review lists refused rows from
  IDB. Never delete a row. Unit tests: transient blocks, refused not, other event not, void blocks, orphan void blocks.
2 L2: BazaarDays.pendingFor persists {clientId, at, body} in localStorage (lazy, try/catch); answered entries removed;
  after a reload resend the stored body; a stock duplicate applies the stored qty. Tests in bazaar-store.test.ts.
3 Migration 20260101006900, each redefinition sed-copied from its last definition then edited at tagged lines:
  M1 close_bazaar_day adds keys sales_count + cash_cents (null together = closed without the till, rule 1, audited;
  else must equal non-voided count and Cash sum, 40001 rule:close-till); finalise_bazaar drops the 3-arg form, becomes
  (booking, expected, drop, p_till jsonb null|{day_id,sales_count,cash_cents}) 40001 rule:fin-till. Phone figures =
  held day's sales minus refused rows. M3 voided_at/voided_by on bazaar_fees and bazaar_losses; void_bazaar_fee and
  void_bazaar_loss (until finalise; a loss only while its day is open); bazaar_line_facts, bazaar_summary, get_bazaar,
  finalise fee posting skip voided rows; a voided held-day loss gives the till its stock back. L1 trigger
  refuse_finalised_bazaar_sale BEFORE INSERT OR UPDATE OF voided_at ON event_sales, 55000, definer, no is_owner (runs
  inside owner RPCs and fixtures), no grant; record_event_sale untouched (md5 8cf2bd63). L5 load_event_stock with
  rule:load-bazaar-day AFTER the identical-replay ack. Update function-authority.json and pnpm db:types.
4 Role suite: new tests/integration/security/bazaar-hardening.sql registered in scripts/test-db-security.py; bazaar-days.sql
  moves to the new close/finalise shapes, the hand-worked figures unchanged. Local db:reset only.
5 Docs: run sheet rule 6, a go/no-go row "migration 69 and its build ship together" (the deployed 1b6c876c close and
  finalise fail against 69), current.md, this file.
pnpm.cmd verify on the pinned toolchain, output to a file; one Opus review of the migration diff and the copy diffs;
secret scan; commit by path; push. Apply nothing to the trial: ask Ethan first. Stop at 40 turns or two failed fixes.
```

Not in the slice: till expenses (`event_expenses`) are a second fee source with no void. The slice exceeds about 400 lines because
the goal requires one migration.
