# Next goal — implement the approved refined workflows

**1 November 2026: Ethan asked to reflect the entire completed v4 mockup in the actual
application and test it there.** Proceed with implementation, not another mockup audit or
owner-testing prerequisite. Read `docs/design/refined-workflows.md` for scope, order and
the reference hash. Keep every existing financial, role and offline safeguard.

Work on `codex/refined-workflows`, one tested logical slice per commit. Direct Bazaar and
Customers/Waitlist and the inventory Count path are implemented, including retained return context and
durable count recovery. Next continue Make (exact product/recipe links and kind-preserving recipe editing),
then Stock, Bazaar, Sell/Shop, Money/Account and integration. Small slices
do not reduce the authorized overall scope. Record actual completed versus pending work.

Use the pinned Node 24.20.0 / pnpm 9.12.3 toolchain and headless command-line Playwright.
No protected demo edits. The existing live slots are the implementation path. Independent
review remains required for money/auth/RLS/SQL/offline changes. Never push this work to
the auto-deploy branch. Deployment, hosted writes and business cutovers need separate
approval after the local implementation is concrete and reviewable.

Model: GPT-6.1 high; Plan mode off. Read AGENTS.md, current.md and the refined-workflows
scope, then only the files needed by the next slice. The physical-phone rehearsal and
closed-shop owner week remain acceptance gates after implementation; old dates below
are historical and do not block the newly authorized work.

## Historical next goal — superseded implementation order

The following is the prior 20 October checkpoint, preserved for context only.

### Phone rehearsal on the new till

**20 October: the consolidated till is released** (#37 and #39 deployed, Cloudflare version `50f46e2c`; #40 brought `main`
level with the deploy branch). See [current.md](current.md). The rehearsal below now runs on it: the run sheet names its
buttons, and step 7 checks the phone has it. Bazaar v2 (16 October) and its notes are in [bazaar-v2.md](bazaar-v2.md) and
[docs/design/bazaar-v2.md](../design/bazaar-v2.md). The repository is public: secret scan before every push, and no real event
names or figures in any committed file.

**The next goals, in order:**

1. **The phone rehearsal, by 22 October**, on the selling iPhone: [bazaar-run-sheet.md](bazaar-run-sheet.md), "The rehearsal"
   (25 steps) and the "Stall-day checklist". Ethan runs it; anything that fails is fixed and the list is run again before
   23 October. `RELEASE_HOLD=true` the day it passes. The bazaar is 24 to 25 October.
2. **The earlier test event's reversal** (`reverse_bazaar_test`): only on Ethan's separate yes, then run and reviewed. Its rent,
   over, sales and stock use stay in October's books until then.
3. **The next consolidated slice** (Ethan, 19 October), after 25 October unless released and rehearsed by the 22nd: the
   Bazaar day plan as on the mockups (canvas K5nHQS8GjtBYGseDtYZDnZ), then review and close, the event page and the events list.
4. **Optional: the 320 px toast check.** Open the day plan at 320 px with the toast showing and see whether the toast overlaps
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
