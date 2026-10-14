# Next goal — Bazaar v2, slice U1 (design system foundations)

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Migration 70 (U6) ships before the bazaar; the Ateneo reversal runs only on Ethan's "yes, reverse
Ateneo". Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push.

```
/goal Bazaar v2 slice U1 (design system foundations) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U1), docs/design/bazaar-v2.md (sections 0 to 4 and 7).
1 Tokens in src/app/globals.css @theme, exactly as spec 2.2: spacing, type scale, durations, the M3 enter/exit/standard
  curves, --color-scrim. No new hex. Add the ::view-transition-* reduced-motion rule from spec 4.
2 src/components/ui/: Card, SectionHeader, StatTile, StatusPill (incl. good), ProgressBar, EmptyState, Skeleton, Banner,
  Button, FilterChips, Stepper, FlavourTile, ReceiptTable, Field/SelectField (inline error, aria-invalid,
  aria-describedby), ErrorSummary (focus, links), Sheet (bottom on phone, right 460 px on desktop); props and states as
  spec 3; a story and a unit test each.
3 src/lib/money/format.ts (two decimals) replacing pesoText in src/lib/bazaar/plan.ts and src/store/ops-runtime.tsx,
  and per-cookie formatting in src/lib/bazaar/review.ts; dayText for "Sat, 24 Oct". Tokens in
  src/components/live/form-styles.ts. Ported screens and PESO untouched.
4 Motion utilities per the spec 4 table: @starting-style entry, list enter/leave, useViewTransition (feature-detected,
  skipped under reduced motion), count-up.
pnpm verify, build-storybook, stories checked in the browser pane at 375 px. Commit and push the branch; do not merge.
```

| Setting      | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Model        | Sonnet builds (effort high); Opus signs off                      |
| Plan mode    | off                                                              |
| Conversation | new                                                              |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U1), the D0 spec §0–4 and 7 |

After U1: U2 with U6 in two conversations, then U3 with U5, then U4, U7, U8 and U9.
