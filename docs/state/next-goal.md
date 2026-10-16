# Next goal — after Bazaar v2: the phone rehearsal

**U9 is released (16 October).** Bazaar v2 (U1 to U7 plus the U9 motion pass and 44 px targets) is live on the private trial:
head `ea0ba7f`, Cloudflare version `7d7d8414`, migration 70 applied (70 of 70, function bodies equal local), every CI job green
except the known red "Performance budget" (artifact quota). U8 (two decimals in ported screens) is skipped: Ethan kept whole
pesos on the till. The plan and the as-built notes are in [bazaar-v2.md](bazaar-v2.md) and [docs/design/bazaar-v2.md](../design/bazaar-v2.md).
The repository is public: secret scan before every push, and no real event names or figures in any committed file.

**The next goals, in order:**

1. **The phone rehearsal, by 22 October**, on the selling iPhone: [bazaar-run-sheet.md](bazaar-run-sheet.md), "The rehearsal"
   (25 steps) and the "Stall-day checklist". Ethan runs it; anything that fails is fixed and the list is run again before
   23 October. `RELEASE_HOLD=true` the day it passes. The bazaar is 24 to 25 October.
2. **The earlier test event's reversal** (`reverse_bazaar_test`): only on Ethan's separate yes, then run and reviewed. Its rent,
   over, sales and stock use stay in October's books until then.
3. **Optional: the 320 px toast check.** Open the day plan at 320 px with the toast showing and see whether the toast overlaps
   the sticky footer by about 16 px (unconfirmed). A clean browser pass at four widths (320, 375, 768, 1440) has not been done.

Not done and not part of these: the cost cutover (after Cine's opening count, and Ethan's separate yes). One low finding is left
from the migration 70 review: a flavour cost saved mid-close can be stored with a stale hash.

| Setting      | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| Model        | Sonnet high for the 320 px check or any fix; Opus signs off any money or close change        |
| Plan mode    | off                                                                                          |
| Conversation | new                                                                                          |
| Read         | AGENTS.md, current.md, bazaar-run-sheet.md; for the 320 px check, `day-plan.tsx` and its CSS |

The review of U2, U5, U6 and U7 used an Opus subagent, because `codex` refuses its models on this ChatGPT account.
