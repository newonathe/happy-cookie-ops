# Next goal — Bazaar v2, slice U4 (event page and day plan)

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push, and no
real event names or figures in any committed file.

U1, U2, U3, U5 and U6 are built: the design system in `src/components/ui/` (`claude/bazaar-v2-u1`), the till's freedom and
migration 70 (`-u2`; migration 70 is local only), the events hub with its add-event sheet, and review and close
(`claude/bazaar-v2-u3`, cut from `-u2`; "U3 as built" and "U5 as built" in bazaar-v2.md). U4 rebuilds the event page and
the day plan: cut it from `claude/bazaar-v2-u3` once U5 is pushed. U5 left the per-flavour review list as cards and the close
inline; the event page still draws dates with `dateRange` (US order) and must move to `dayRange` (finding B6).

**Conversation: U4** (the goal block is in [bazaar-v2.md](bazaar-v2.md), "Goal blocks", U4: Ateneo A1, A2, A5, B4, B5 first,
then the tiles, steppers, timeline and red fields; Sonnet high, new conversation, plan mode off).

| Setting      | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Model        | Sonnet high builds; Opus signs off (and reviews any money or close change)           |
| Plan mode    | off                                                                                  |
| Conversation | new                                                                                  |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U4), the design spec, the files the block names |

The review of U2, U5 and U6 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U4: U7, U8
and U9 (U9 releases). Home's next-event card still trusts `started` (finding in "U3 as built"): U4 fixes it.
