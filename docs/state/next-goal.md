# Next goal — B3c, then B4

One goal per package, each in a fresh conversation opened in the repository root. Paste
one block. Where things stand: [current.md](current.md). The plan these come from:
[final-plan.md](final-plan.md), version 2, section 9, stage B. Earlier goals are in
[current-history.md](current-history.md).

B3b is built (15 October): packaging as records, and the screens read the database's cost
(migration 60). The books' "when used" cutover (61 to 63) is built but not to be applied. None is on the trial. Ethan chose
(15 October) to undo a mistyped delivery as its own small slice, B3c, before B4.
**First, Ethan decides the books cutover** ([current.md](current.md), Waiting on Ethan): B3c touches the
average and the books, so it is planned on that decision.

## B3c — undo a delivery

| Setting       | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Model, effort | Claude Opus, high to plan and sign off; Sonnet, high to build        |
| Plan mode     | On; list the functions that move                                     |
| Review        | Required: `security-reviewer` on a different model for the migration |
| Stop          | Evidence printed and pushed; 15 turns; two failed fix attempts       |

```text
/goal Slice B3c of docs/state/final-plan.md (version 2) for The Happy Cookie Ops in the
repository root: undo a delivery typed with the wrong quantity (system-audit.md section 10,
R15). Read first: AGENTS.md, docs/state/current.md, migrations 20260101005600 (record_stock_movement,
record_cost_correction, get_books) and 20260101006200. Nothing goes on the trial without Ethan's word.

1. An owner action reverses one receipt by its movement id with an opposite entry (append-only,
   idempotent on a client id). It reverses the receipt's effect on the running average exactly and
   writes the opposite ledger line, so the books net to zero.
2. It is refused once any of that delivery has been used or counted away (the on-hand since the
   receipt is below its quantity), with a message that says to fix it with a count instead; a
   receipt already reversed is refused; receipts older than the books' 90-day correction window
   are refused.
3. The Stock screen's delivery list offers it beside "Correct cost" (live layer only, no locked file).

Tests first: each refusal as a rule mutation in the SQL role suite; a reversed receipt restores the
average and on-hand to the cent; get_books nets the pair; a unit test for the live action. Browser
QA on the live build against the local database. Update current.md and task-status.json; replace
this block with B4 below. No merge, deploy, release hold or automatic runner.
```

## B4 — her data (after B3c)

Final-plan section 9, B4: each import previewed and approved before it writes: her usual
prices, recipes (lines by stock item), flavours, photos, newer sales, bookings and her
per-cookie packaging lines. Model: Opus to plan, Sonnet to build. Ethan decided on 15 October
that her per-cookie packaging lines go on the trial in the same sitting as migration 60,
with the bazaar-sale rule cut to the bag only. Write the full block when B3c closes.
