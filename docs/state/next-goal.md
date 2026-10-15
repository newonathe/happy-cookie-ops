# Next goal — Bazaar v2, slice U3 (events hub), with U5 in a second conversation

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push, and no
real event names or figures in any committed file.

U1, U2 and U6 are built and pushed (`claude/bazaar-v2-u1`, `-u2`, and U6 on `-u2`'s branch): the design system in
`src/components/ui/`, the till's freedom, and migration 70 (flavour costs, the final split, the drawer category, the test
reversal; local only, see "U6 as built" in bazaar-v2.md). Cut U3's and U5's branches from `claude/bazaar-v2-u2`. U3 and U5 touch
different files, so they may run at the same time in two conversations; U4 waits for both.

**Conversation 1: U3**

```
/goal Bazaar v2 slice U3 (events hub) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U3), docs/design/bazaar-v2.md, src/components/live/bazaar/
event-list.tsx, src/components/live/live-form-host.tsx, src/lib/nav/function-map.ts.
1 event-list.tsx: header with Add an event top right; Active pinned; Upcoming and Past behind FilterChips.
2 New event-form.tsx: one blank event in a Sheet (name, place, dates, rent), saved through save_scheduled_event.
3 The Bazaar events sub-tab opens the hub. Motion per the D0 table. Ateneo B3, B6: a status pill per row, dates as "Wed, 14 Oct".
Tests (unit and smoke: add an event in the sheet). Browser-pane QA at 375 and 1440 px. Commit and push; do not merge.
```

| Setting      | Value                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Model        | Sonnet builds; Opus signs off                                                    |
| Plan mode    | off                                                                              |
| Conversation | new                                                                              |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U3), the design spec, the three files named |

**Conversation 2: U5** (the goal block is in [bazaar-v2.md](bazaar-v2.md), "Goal blocks", U5: review and close, with A3 first, one
different-model review of the money, Sonnet high, new conversation, plan mode off).

The review of U2 and U6 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U3 and U5: U4, then
U7, U8 and U9.
