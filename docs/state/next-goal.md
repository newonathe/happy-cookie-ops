# Next goal — Bazaar v2, slice U2 (till freedom)

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Migration 70 (U6) ships before the bazaar; the Ateneo reversal runs only on Ethan's "yes, reverse
Ateneo". Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push.

```
/goal Bazaar v2 slice U2 (till freedom) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (Audit, U2), docs/OFFLINE.md, docs/design/bazaar-v2.md.
1 leaveTill (ops-runtime) and a Home button above the till (bazaar-live.tsx), owner only, hidden offline.
2 liveScreenVals till {name, sales, back}; live-screen-host.tsx draws the Home Bazaar card and the "Back to the till"
  banner; widen src/view-models/vals.ts.
3 renderVals (live only): hide sold-out tiles unless in the cart; "Show sold out (n)"; allGone empty state.
4 Add cookies from the till: export StockForm, BazaarDays.addHeldStock reusing addStock and its pending key.
5 Ateneo findings first: B1 (tiles never on the table are not drawn), B2 (the till's expense Add opens the fee form).
Tests first; extend scripts/test-live-smoke.mjs (leave and return, sold-out hidden then back after a void, add cookies).
One different-model review (offline). Browser-pane QA at 375 and 1440 px. Commit and push the branch; do not merge.
```

| Setting      | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Model        | Sonnet builds (effort high); Opus signs off                              |
| Plan mode    | off                                                                      |
| Conversation | new                                                                      |
| Read         | AGENTS.md, current.md, bazaar-v2.md (Audit, U2), OFFLINE.md, the D0 spec |

U1 is built (branch `claude/bazaar-v2-u1`, components in `src/components/ui/`, `peso()` in `src/lib/money/format.ts`). After U2: U6 in its own conversation, then U3 with U5, then U4, U7, U8 and U9.
