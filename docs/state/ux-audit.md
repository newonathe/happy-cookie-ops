# UX review — 5 October 2026

Status: **proposals 1 to 4 are implemented and on the private trial (5 October), with the
neutral Home card and finding 11. Proposal 5 is not being done.** Ethan asked for this
review because the app feels "all over the place". The ones marked _protected_ went
through the exception process in [AGENTS.md](../../AGENTS.md), because they change ported
screens or the shell. What was built is under [Implemented](#implemented-on-5-october)
below.

## How it was done

The live-mode build was run locally against the local database, signed in as a throwaway
owner, and all 25 routes were captured at phone (390×844) and desktop (1440×900) widths
with headless Chromium. The committed prototype screenshots in
`tests/e2e/visual.spec.ts-snapshots/` were the reference. Local test data only; nothing was
changed on the trial site.

## Glass and transitions: not removed

Measured in the live build: the blur is active on the top bar (20px), the phone dock
(22px) and the Quick add sheet (28px), with the prototype's values, and the screen-change
and sheet animations run on every navigation.

Why it can look removed:

- At desktop width the app uses the sidebar layout. There is no floating dock, and the
  blurred top bar sits on a plain white page, so nothing shows through it.
- A device with "reduce motion" switched on gets no transitions, by design.

## What makes it feel messy

The live app matches the prototype, so most of this comes from the design, plus features
added to **All tools** one at a time since.

| #   | Finding                                                                                                                                                                                                                            | Where                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | The phone dock has nine small icons with no labels. Sales log and P&L use the same peso icon.                                                                                                                                      | every phone screen                 |
| 2   | Flavours, prices and recipes are spread over four entries: Products, Menu & flavours, Recipes, Recipe drafts. It is not obvious which one to open.                                                                                 | All tools                          |
| 3   | Home repeats the whole menu as a "Your business" grid under the dashboard. On a phone the page is 2.5 screens long.                                                                                                                | Home                               |
| 4   | Notifications and Home show four red system alerts (database backup, restore drill, data retention, keep-alive: "not yet recorded, activation pending"). They are set-up tasks for Ethan, not things Cine can act on while baking. | Home, Notifications, System health |
| 5   | The round Quick add button floats over content and covers buttons in lists, for example "Mark sold out" on Drops and the price on Products.                                                                                        | phone lists                        |
| 6   | Opening `/order` or `/batch` directly shows a title and an empty page.                                                                                                                                                             | Order, Production                  |
| 7   | The weekly count opens as a panel above the full inventory list, so two screens are stacked on one page.                                                                                                                           | Stocktake                          |
| 8   | P&L says "Profit, last four months" above a chart with one bar.                                                                                                                                                                    | P&L                                |
| 9   | The customer order-status page, opened without an order, shows empty controls under "We could not find that order".                                                                                                                | Status                             |
| 10  | Performance on a mid-range phone is slow: largest paint 5.8 to 9.4 s on GitHub's runner; the shop page is 1.63 MB.                                                                                                                 | all pages                          |

## Proposed first batch

Small changes that remove the most confusion without redesigning screens. Recommended
order:

1. **Group the four flavour and recipe entries** into one "Menu and recipes" block in All
   tools, with one-line descriptions that say what each is for. Live layer only; no
   protected file.
2. **Move the four system set-up alerts out of Cine's way** until backups are switched on:
   one "Backups are not set up yet" line addressed to Ethan in System health, and no red
   badges on Home or Notifications for them. Live layer only. This changes an F1 safety
   message, so it needs Ethan's explicit yes.
3. **Phone dock: five labelled destinations** (Home, Orders, Bake, Inventory, All tools),
   everything else through All tools, and a distinct icon for Sales log. _Protected_ (shell
   markup for labels; the item list can be set in the live layer).
4. **Empty Order and Production pages:** send a direct visit to the list it belongs to.
   Unprotected routing code.
5. **Glass on desktop,** only if wanted: let page content scroll under the top bar so its
   blur shows. _Protected_ (shell layout).

Not proposed now: redesigning Home, the Quick add button position, or the stocktake
layout. They are larger design changes and are better decided with Cine after her week.

## Decisions

Ethan, 5 October 2026, after reading the summary of this review: "do what u recommend for
the rest", adding that the UI and UX feel all over the place.

| Proposal | Decision                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Go.** Recommended, unprotected.                                                                                                                                           |
| 2        | **Go.** Ethan gave his explicit yes on 5 October ("yes to both"). Keep the facts visible to him in System health; remove the red alerts from Cine's Home and Notifications. |
| 3        | **Go.** Ethan saw the exact before and after and what leaves the dock, and approved on 5 October ("yes to all three, do what u recommend").                                 |
| 4        | **Go.** Recommended, unprotected.                                                                                                                                           |
| 5        | **Not now.** Not recommended: a protected layout change for a subtle effect. Revisit with the larger design questions after Cine's week.                                    |

Timing, also decided on 5 October: **land these before Cine starts her week.** Her start
waits for them.

Later on 5 October, asked three things after the first batch shipped (the dock; Home's
system card: "Keep the red one, or approve that exception?"; finding 11), Ethan answered:
"yes to all three, do what u recommend". The dock and finding 11 were clear. For the card,
Claude read the yes as approval of the neutral card, because his proposal 2 decision was to
remove the red alerts from Cine's Home. Asked to confirm after it shipped, Ethan answered
the same day: "keep it neutral, leave finding 12 for now".

## Implemented on 5 October

Proposals 1, 2 and 4 and finding 11 are in the live layer and routing only. The dock and
the Home card each needed one guarded edit to ported markup, approved by Ethan and
recorded in [protected-exception.md](protected-exception.md). The engine is unchanged, and
the demo build and the visual baselines are untouched.

| Proposal   | Commit               | What changed                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | `a12f59f`            | All tools has a "Menu and recipes" group after Kitchen: Menu & flavours, Products, Recipes, Recipe drafts, each with a line saying what it is for. Nothing else moved.                                                                                                                                              |
| 2          | `6fac6ae`, `519cb99` | While no backup job has ever recorded a run, System health says "No backup has run yet", addressed to Ethan, and keeps the four facts. Notifications went from 6 to 2 on the local test data, Home from "4 things need you" to 3, and the badge on All tools is gone. Nothing is shown as healthy.                  |
| 4          | `40af151`            | A direct visit to `/order` opens Orders and `/batch` opens the bake plan, replacing the history entry so Back does not return to an empty page.                                                                                                                                                                     |
| 3          | `410ac1e`            | The owner's phone dock shows five labelled destinations (Home, Orders, Bake, Inventory, All tools) instead of nine unlabelled icons, and marks All tools while a screen reached through it is open. Sales log has its own receipt icon and an entry in All tools. _Protected:_ one guarded label line in the shell. |
| 2, card    | `3bc91dd`            | Home's system card is neutral (grey info icon) while no backup has run and nothing else is wrong. Any real problem keeps it red; it is never green while a backup is missing. _Protected:_ one guarded block in the Home screen.                                                                                    |
| Finding 11 | `7035937`            | Seven All tools descriptions shortened so the cards stay inside the screen down to 360 px wide.                                                                                                                                                                                                                     |

### How proposal 2 keeps a real failure visible

- The quiet state needs a successful read no older than five minutes in which **none** of
  the four jobs has ever recorded a run. A read that is missing, failed, loading or older
  than five minutes is never quiet: every check alerts as before.
- The first recorded run of any job ends it for all four. A failed backup alerts, and so
  do the three jobs that still have no run. A restore drill that never runs after backups
  start alerts too.
- An open, visible page re-reads health every four minutes, so the quiet state does not
  wear off while the page is open.
- The protected engine counts its `backup` flag in the All tools badge and in Home's
  "things need you" line. In live mode that flag now follows the recorded checks. Before,
  nothing fed it, so the badge showed 1 and Home and Settings said "Last backup failed"
  even though no backup had ever run.

### Limits Ethan should know

- **The app cannot tell "off" from "on but recording nothing".** When the jobs are
  switched on, check that the first run appears in System health. Until a run is
  recorded the screen stays quiet and says "No backup has run yet".
- **Offline, the alerts come back.** "Database connection" alerts at once, and the four
  job alerts return at the next re-read that fails, within four minutes. A hidden tab
  keeps its last read for five minutes and then alerts until it is shown again. The app
  claims nothing from a read it cannot repeat.
- **Home's system card is neutral only in the quiet state.** It reads "No backup has run
  yet · A set-up task for Ethan, not for the kitchen." A queued sale or an offline device
  turns it red even then.
- **On a phone, four screens are one tap further away:** Sales log, P&L, Grocery and
  Bazaar Mode are now under All tools, and the Grocery count is no longer on the dock
  (Home still shows "items short"). Bazaar Mode is the path for the phone rehearsal and
  the bazaar: check during the rehearsal that the extra tap is acceptable.
- **A helper's dock** keeps Home, Sales log and Bazaar, now labelled; support keeps All
  tools.

### Evidence

- `pnpm verify`: 82 files, 1,503 tests (16 new: one per case for never run, one failed,
  partly run, stale, failed and missing reads, queue and offline, the re-read timer, the
  grouping and both routes).
- `pnpm build:pages:spike` passes at `519cb99`.
- GitHub run 37293717450 at `519cb99`: every required job passed (types, lint and unit
  tests; visual regression; browser flows; production build; Storybook) and the release
  job deployed Worker version `723fd8ac`. The advisory performance job still misses its
  budget, as before. Anonymous requests to the trial still redirect to Cloudflare Access.
  The changed screens have not been looked at on the trial itself by a person yet.
- Docker image rebuilt from `40af151`: visual suite 75 of 75 against the existing
  baselines, none regenerated. Browser flows 90 passed, 75 skipped (the database-backed
  parity cases, which have no Supabase in the container), none failed.
- Before and after captures of the signed-in live build, taken inside the same Playwright
  image against the local database with a throwaway owner that was removed afterwards:
  Home, Notifications, System health, All tools, `/order` and `/batch` at 390 and 1440
  wide. Kept privately in `claude-20261005/ux-batch1/`. Local test data only.

### Second batch evidence (dock, Home card, finding 11)

- `pnpm verify`: 83 files, 1,512 tests. `pnpm build:pages:spike` passes at `3bc91dd`.
- Planning-continuity validator: 1,225 checks, 0 failures, with both protected edits
  registered as exact reversals. Port integrity: 54 files match; only the two edited
  files' baseline entries changed.
- Independent port audit (Sonnet): pass, no blocker. Recorded with both exception records
  in [protected-exception.md](protected-exception.md).
- Docker image rebuilt from `3bc91dd`: visual suite 75 of 75 against the existing
  baselines, none regenerated, so the demo build is pixel-unchanged by the two protected
  edits. Browser flows 90 passed, 75 skipped (database-backed cases with no database in
  the container), none failed.
- Signed-in live captures in the same image, local test data, owner at 360, 375, 390 and
  1440 wide and helper at 360, 375 and 390:
  - All tools cards end exactly at the screen edge at all three phone widths (they ran to
    423 px before) and no description is cut.
  - Every dock label fits its slot; the tightest is "Inventory", 51 px in a 64 px slot at
    360 wide. The helper's three labels fit too.
  - Home shows the neutral card; the sidebar at 1440 shows the receipt icon.
- GitHub run 37302318279 at `3bc91dd`: every required job passed and the release job deployed
  Worker version `43267acc`. The advisory performance job still misses its budget.
  Anonymous requests still redirect to Cloudflare Access. No person has looked at the
  changed screens on the trial itself yet.
- Private evidence: `claude-20261005/ux-batch1/` and `claude-20261005/ux-batch2/`.

### Found while capturing

| #   | Finding                                                                                                                                                                                                                      | Where     | State                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------- |
| 11  | On a phone the Business cards in All tools ran off the right edge, because long descriptions stretched the column.                                                                                                           | All tools | Fixed, `7035937`                |
| 12  | A signed-in helper is greeted with the prototype helper's name ("Good morning, Kristian.") and sees the prototype's "You are seeing what a helper sees" note, whatever their own profile name is. Only owners use the trial. | Home      | Left for now (Ethan, 5 October) |

## Performance scope (finding 10), 5 October

Scoped only; nothing is changed. Sources: the Lighthouse reports of GitHub run 37302318279
and the files of the live bundle built at `3bc91dd`.

### What was measured, and what was not

- The CI job measures the **demo** build, not the trial. Its largest paint is the
  prototype's "Interactive prototype · owner view · mock data" header, which the live app
  does not render. So the 5.8 to 9.4 s figures are for the demo harness.
- On that throttled profile (1.6 Mbps, 4x slower processor) first paint is 0.8 to 1.1 s
  and the page is usable when everything has downloaded: Home 7.3 s (1,101 KB), shop
  9.4 s (1,596 KB), Bazaar 5.8 s (834 KB). Blocking time is 0.8 to 2.2 s.
- **Nobody has measured the live build or the trial.** The customer shop page, signed
  out, on the hosted site is the number that matters and it does not exist yet.

### Where the weight is

| What                               | Size                                  | Note                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo-full.png`                    | 373 KB, 3,931 x 1,983 px              | Shown 56 px tall on the shop and on sign-in.                                                                                                                          |
| `mark-solid.png`                   | 324 KB, 3,039 x 2,727 px              | Shown 28 to 78 px tall; also the browser and home-screen icon on every page.                                                                                          |
| Six ported flavour photos          | 57 to 62 KB each, about 170 px square | PNG photographs.                                                                                                                                                      |
| Scripts on every app page          | 1,543 KB, 414 KB compressed, 12 files | The engine and all 24 screens are one 655 KB file (153 KB compressed). A customer on the shop downloads the whole staff app, the database client and error reporting. |
| Owner-uploaded photos and QR codes | up to 2 MB each                       | `uploadShopImage` stores the file as chosen, with no resizing, and the shop serves it as stored.                                                                      |

After the first visit the service worker serves scripts and `/assets/` from its cache, so
this mostly costs a customer's first visit and each device's first load.

### Proposed slices, in order of value for effort

| #   | Slice                                                                                                                            | Expected effect                                                                                        | Touches                                                                                                                        | Size                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| P1  | Measure the live shop page: run the same Lighthouse profile against the static live bundle, signed out.                          | A true baseline; the budget then means something.                                                      | CI and config only.                                                                                                            | Small                                                    |
| P2  | Resize owner uploads in the browser before upload (for example longest side 1,200 px, WebP) and keep the 2 MB cap as a backstop. | Prevents a 2 MB photo per flavour on the shop; the largest real risk once Cine uploads her own photos. | Unprotected live layer.                                                                                                        | Small                                                    |
| P3  | Replace the two logo files with correctly sized versions at the same paths, and point the page icon at a small icon file.        | About 370 KB less on the shop and 320 KB less on the order-status page.                                | The image files are delivery assets (not ported markup); needs Ethan's yes and a Docker visual run to prove no visible change. | Small                                                    |
| P4  | Re-encode the six ported flavour photos at the same paths.                                                                       | About 250 KB less on the demo shop; less on the live shop as Cine replaces them.                       | Same as P3.                                                                                                                    | Small                                                    |
| P5  | Split the script: customer pages without the staff screens, staff screens loaded when opened, error reporting loaded late.       | The only item that reduces the 414 KB of script and the blocking time. Size of the gain not estimated. | The protected shell imports all 24 screens, so it needs a protected exception, and it changes how the app loads.               | Large; after launch unless P1 shows the shop is too slow |

Not proposed: loosening the budget.
