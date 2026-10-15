# Next goal — Bazaar v2, slice U5 (review and close); then U4

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push, and no
real event names or figures in any committed file.

U1, U2, U3 and U6 are built and pushed: the design system in `src/components/ui/` (`claude/bazaar-v2-u1`), the till's freedom
and migration 70 (`-u2`; migration 70 is local only), and the events hub with its add-event sheet (`claude/bazaar-v2-u3`, cut
from `-u2`; "U3 as built" in bazaar-v2.md). U5 (review and close) touches `day-review.tsx`, `figure.tsx` and the review view
in `bazaar-days.ts`; U3 touched `event-list.tsx`, `event-form.tsx`, `readHub`/`addEvent` in `bazaar-days.ts` and the
`BazaarListRow`/`LiveBazaarVals` contract, so cut U5 from `claude/bazaar-v2-u3` (the contract file is shared); if a U5 branch already exists from `-u2`, merge `-u3` into it first. U4 waits for U5.

**Conversation: U5** (the goal block is in [bazaar-v2.md](bazaar-v2.md), "Goal blocks", U5: review and close, with A3 first, one
different-model review of the money, Sonnet high, new conversation, plan mode off).

| Setting      | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Model        | Sonnet high builds; Opus signs off and reviews the money                             |
| Plan mode    | off                                                                                  |
| Conversation | new                                                                                  |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U5), the design spec, the files the block names |

The review of U2 and U6 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U5: U4, then
U7, U8 and U9. For U4, the hub's rows already carry `group`, `status` and `figures`; the event page still draws dates with
`dateRange` (US order) and must move to `dayRange` (finding B6).
