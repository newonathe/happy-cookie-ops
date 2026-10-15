# Next goal — Bazaar v2, slice U7 (recipe book)

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push, and no
real event names or figures in any committed file.

U1 to U6 are built: the design system (`claude/bazaar-v2-u1`), the till's freedom and migration 70 (`-u2`; migration 70 is
local only), the events hub, review and close, and now U4, the event page and day plan (`claude/bazaar-v2-u4`, cut from `-u3`; "U4 as built" in
bazaar-v2.md). **Conversation: U7**, the goal block in [bazaar-v2.md](bazaar-v2.md), "Goal blocks", U7 (Sonnet high, new
conversation, plan mode off). It is the screen for the flavour cost that U4's close sheet already saves (`save_flavour_cost`),
and the place the event page's cost receipt points at. Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The money paths U4 touched were reviewed by Opus on 16 October ("U4 as built" in bazaar-v2.md). Decided by Ethan (16 Oct): the cost typed
when closing an event is the flavour's (design 5.10, as built). Migration 70 still has two review fixes pending
("U6 review" in bazaar-v2.md) and the hosted apply waits for U9.

| Setting      | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Model        | Sonnet high builds; Opus signs off (and reviews any money or close change)           |
| Plan mode    | off                                                                                  |
| Conversation | new                                                                                  |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U7), the design spec, the files the block names |

The review of U2, U5 and U6 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U7: U8 and U9 (U9 releases).
