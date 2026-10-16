# Next goal — Bazaar v2, slices U8 and U9

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Cut line: U8 moves after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push, and no
real event names or figures in any committed file.

U1 to U7 are built: the design system (`claude/bazaar-v2-u1`), the till's freedom and migration 70 (`-u2`; migration 70 is
local only), the events hub, review and close, the event page and day plan (`-u4`), and now U7, the recipe book and flavour page
(`claude/bazaar-v2-u7`, cut from `-u4`; "U7 as built" in bazaar-v2.md; its cost save needs migration 70). **Conversation: U8**
(only after Ethan says "approve PESO") **or U9**, the goal blocks in [bazaar-v2.md](bazaar-v2.md), "Goal blocks" (Sonnet high builds,
Opus signs off U9, new conversation, plan mode off). U9 is the release: it merges the slice branches, applies migration 70 to the
trial (two review fixes pending, "U6 review"), runs the full QA and deploys. Cut line: U8 moves after 26 October if not green by the
evening of 19 October.

The money paths U4 touched were reviewed by Opus on 16 October ("U4 as built" in bazaar-v2.md). Decided by Ethan (16 Oct): the cost typed
when closing an event is the flavour's (design 5.10, as built), and U7's cost field saves the same `save_flavour_cost`. U7 itself has had
no independent review: it adds no new write, but ask Opus to read `src/store/recipe-book.ts` before U9.

| Setting      | Value                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| Model        | Sonnet high builds; Opus signs off (and reviews any money or close change)                 |
| Plan mode    | off                                                                                        |
| Conversation | new                                                                                        |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U8 or U9), the design spec, the files the block names |

The review of U2, U5 and U6 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U8 (if approved): U9 releases.
